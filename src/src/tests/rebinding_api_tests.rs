use crate::{
    cache::Cache,
    http::{AppState, StaticFiles},
    rebinding::Store,
    tests::rebinding_tests::profile,
    utils::{generate_session_jwt, generate_share_jwt},
};
use axum::{
    body::{to_bytes, Body},
    http::{Request, StatusCode},
    Router,
};
use serde_json::{json, Value};
use std::sync::Arc;
use tower::ServiceExt;
async fn app() -> Router {
    let cache = Arc::new(Cache::new());
    let (tx, _) = tokio::sync::broadcast::channel(32);
    crate::http::create_router(AppState {
        rebinding: Arc::new(Store::new(cache.clone())),
        cache,
        tx: Arc::new(tx),
        static_files: Arc::new(StaticFiles::load("/nonexistent").await),
        http_challenge_handler: None,
    })
}
async fn call(
    app: &Router,
    method: &str,
    path: &str,
    token: &str,
    body: Value,
) -> (StatusCode, Value) {
    let mut req = Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json");
    if !token.is_empty() {
        req = req.header("authorization", format!("Bearer {token}"));
    }
    let response = app
        .clone()
        .oneshot(req.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
    (
        status,
        serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| json!({"raw":String::from_utf8_lossy(&bytes)})),
    )
}
#[tokio::test]
async fn rebinding_api_auth_update_conflict_and_preview() {
    let app = app().await;
    let path = "/api/v2/dns/rebinding";
    let token = generate_session_jwt("abcdefgh", None).unwrap();
    assert_eq!(
        call(&app, "GET", path, "", json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
    let shared = generate_share_jwt("request", "abcdefgh").unwrap();
    assert_eq!(
        call(&app, "GET", path, &shared, json!({})).await.0,
        StatusCode::UNAUTHORIZED
    );
    let (status, v) = call(&app, "GET", path, &token, json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["generation"], 0);
    let (status, v) = call(
        &app,
        "PUT",
        path,
        &token,
        json!({"expected_generation":0,"profiles":[profile(3)]}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["generation"], 1);
    assert_eq!(
        call(
            &app,
            "PUT",
            path,
            &token,
            json!({"expected_generation":0,"profiles":[]})
        )
        .await
        .0,
        StatusCode::CONFLICT
    );
    let (_, v) = call(
        &app,
        "POST",
        "/api/v2/dns/rebinding/preview",
        &token,
        json!({"profile":profile(3),"query_type":"A","query_index":2,"elapsed_ms":0}),
    )
    .await;
    assert_eq!(v["selection"]["values"][0], "192.0.2.3");
    let (_, v) = call(&app, "GET", path, &token, json!({})).await;
    assert_eq!(v["status"][0]["queries"], 0);
    assert_eq!(v["generation"], 1);
    let other = generate_session_jwt("ijklmnop", None).unwrap();
    assert!(
        call(&app, "GET", path, &other, json!({})).await.1["profiles"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let mut invalid = profile(3);
    invalid.phases[1].values = vec!["not-ip".into()];
    let (status, v) = call(
        &app,
        "PUT",
        path,
        &token,
        json!({"expected_generation":1,"profiles":[invalid]}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(v["field"].as_str().unwrap().contains("phases[1]"));
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v2/dns/rebinding/test/phase",
            &token,
            json!({"expected_generation":1,"phase_id":"p2"})
        )
        .await
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(
            &app,
            "POST",
            "/api/v2/dns/rebinding/missing/reset",
            &token,
            json!({"expected_generation":1})
        )
        .await
        .0,
        StatusCode::NOT_FOUND
    );
    let (status, v) = call(
        &app,
        "POST",
        "/api/v2/dns/rebinding/test/reset",
        &token,
        json!({"expected_generation":1}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["generation"], 2);
}
#[tokio::test]
async fn rebinding_api_manual_and_malformed_body() {
    let app = app().await;
    let token = generate_session_jwt("abcdefgh", None).unwrap();
    let mut p = profile(3);
    p.strategy = crate::rebinding::Strategy::Manual;
    call(
        &app,
        "PUT",
        "/api/v2/dns/rebinding",
        &token,
        json!({"expected_generation":0,"profiles":[p]}),
    )
    .await;
    let (status, v) = call(
        &app,
        "POST",
        "/api/v2/dns/rebinding/test/phase",
        &token,
        json!({"expected_generation":1,"phase_id":"p2"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["status"][0]["manual_phase_id"], "p2");
    let (status, v) = call(
        &app,
        "PUT",
        "/api/v2/dns/rebinding",
        &token,
        json!({"profiles":"bad"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(v["code"], "invalid_rebinding");
}
#[tokio::test]
async fn rebinding_api_released_claim_does_not_reuse_configuration() {
    let _guard = crate::tests::names_tests::tests::LOCK.lock().unwrap();
    let app = app().await;
    let (name, cid) = crate::utils::names::claim("rebind-qa", 1).unwrap();
    let old = generate_session_jwt(&name, Some(cid.clone())).unwrap();
    let path = "/api/v2/dns/rebinding";
    assert_eq!(
        call(
            &app,
            "PUT",
            path,
            &old,
            json!({"expected_generation":0,"profiles":[profile(3)]})
        )
        .await
        .0,
        StatusCode::OK
    );
    assert_eq!(
        call(&app, "DELETE", "/api/v2/sessions", &old, json!({}))
            .await
            .1["released"],
        true
    );
    let (_, cid2) = crate::utils::names::claim(&name, 2).unwrap();
    let new = generate_session_jwt(&name, Some(cid2.clone())).unwrap();
    assert_eq!(
        call(
            &app,
            "PUT",
            path,
            &old,
            json!({"expected_generation":0,"profiles":[profile(3)]})
        )
        .await
        .0,
        StatusCode::UNAUTHORIZED
    );
    let (_, v) = call(&app, "GET", path, &new, json!({})).await;
    assert!(v["profiles"].as_array().unwrap().is_empty());
    assert!(crate::utils::names::release(&name, &cid2));
}
