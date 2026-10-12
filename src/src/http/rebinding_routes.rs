use super::{
    routes_v2::{extract_token, verify_token_or_error, TokenQuery},
    AppState,
};
use crate::{
    rebinding::*,
    utils::{jwt_claim_id, names},
};
use axum::{
    extract::{rejection::JsonRejection, Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
fn failure(error: RebindingError) -> Response {
    let status = match error.code.as_str() {
        "generation_conflict" => StatusCode::CONFLICT,
        "profile_not_found" => StatusCode::NOT_FOUND,
        "rebinding_capacity" => StatusCode::PAYLOAD_TOO_LARGE,
        "invalid_token" => StatusCode::UNAUTHORIZED,
        _ => StatusCode::BAD_REQUEST,
    };
    (status, Json(error)).into_response()
}
fn body<T>(payload: Result<Json<T>, JsonRejection>) -> Result<T, Response> {
    payload
        .map(|Json(v)| v)
        .map_err(|_| failure(ValidationError::new("$", "Invalid rebinding request body").into()))
}
fn owned<T>(
    query: &TokenQuery,
    headers: &HeaderMap,
    op: impl FnOnce(&str) -> Result<T, RebindingError>,
) -> Result<T, Response> {
    let session = verify_token_or_error(query, headers).map_err(IntoResponse::into_response)?;
    if let Some(cid) = extract_token(query, headers).and_then(|t| jwt_claim_id(&t)) {
        names::with_current_claim(&session, &cid, || op(&session))
            .ok_or_else(|| {
                failure(RebindingError::new(
                    "invalid_token",
                    "Session claim is no longer current",
                ))
            })?
            .map_err(failure)
    } else {
        op(&session).map_err(failure)
    }
}
pub async fn get_rebinding(
    State(state): State<AppState>,
    Query(query): Query<TokenQuery>,
    headers: HeaderMap,
) -> Response {
    match owned(&query, &headers, |s| Ok(state.rebinding.snapshot(s))) {
        Ok(v) => Json(v).into_response(),
        Err(e) => e,
    }
}
pub async fn update_rebinding(
    State(state): State<AppState>,
    Query(query): Query<TokenQuery>,
    headers: HeaderMap,
    payload: Result<Json<UpdateRequest>, JsonRejection>,
) -> Response {
    let request = match body(payload) {
        Ok(v) => v,
        Err(e) => return e,
    };
    match owned(&query, &headers, |s| state.rebinding.replace(s, request)) {
        Ok(v) => Json(v).into_response(),
        Err(e) => e,
    }
}
pub async fn reset_rebinding(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<TokenQuery>,
    headers: HeaderMap,
    payload: Result<Json<ActionRequest>, JsonRejection>,
) -> Response {
    let request = match body(payload) {
        Ok(v) => v,
        Err(e) => return e,
    };
    match owned(&query, &headers, |s| {
        state.rebinding.reset(s, &id, request.expected_generation)
    }) {
        Ok(v) => Json(v).into_response(),
        Err(e) => e,
    }
}
pub async fn select_rebinding_phase(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<TokenQuery>,
    headers: HeaderMap,
    payload: Result<Json<PhaseRequest>, JsonRejection>,
) -> Response {
    let request = match body(payload) {
        Ok(v) => v,
        Err(e) => return e,
    };
    match owned(&query, &headers, |s| {
        state.rebinding.set_phase(s, &id, request)
    }) {
        Ok(v) => Json(v).into_response(),
        Err(e) => e,
    }
}
pub async fn preview_rebinding(
    Query(query): Query<TokenQuery>,
    headers: HeaderMap,
    payload: Result<Json<PreviewRequest>, JsonRejection>,
) -> Response {
    let request = match body(payload) {
        Ok(v) => v,
        Err(e) => return e,
    };
    match owned(&query, &headers, |_| {
        let mut profiles = validate_profiles(vec![request.profile])?;
        let p = profiles.remove(0);
        if !["A", "AAAA", "CNAME"].contains(&request.query_type.as_str()) {
            return Err(ValidationError::new("query_type", "Choose A, AAAA, or CNAME").into());
        }
        let relative = if p.hostname == "*" {
            "preview"
        } else {
            &p.hostname
        };
        let matched = match_profile(std::slice::from_ref(&p), relative, &request.query_type)
            .ok_or_else(|| {
                RebindingError::new("invalid_action", "Profile does not answer this question")
            })?;
        let selection = if matched.suppressed {
            Selection {
                answer_kind: p.answer_kind,
                values: vec![],
                ttl: p.negative_ttl,
                phase_ids: vec![],
                status: SelectionStatus::Suppressed,
            }
        } else {
            select(
                &p,
                &SelectionContext {
                    query_index: request.query_index,
                    elapsed_ms: request.elapsed_ms,
                    random_slot: request.random_slot.unwrap_or(0),
                    manual_phase_id: request.manual_phase_id,
                },
            )?
        };
        let total = p.phases.iter().map(|p| f64::from(p.weight)).sum::<f64>();
        let probabilities = if p.strategy == Strategy::Random {
            p.phases
                .iter()
                .map(|p| Probability {
                    phase_id: p.id.clone(),
                    probability: f64::from(p.weight) / total,
                })
                .collect()
        } else {
            vec![]
        };
        Ok(PreviewResponse {
            selection,
            probabilities,
        })
    }) {
        Ok(v) => Json(v).into_response(),
        Err(e) => e,
    }
}
