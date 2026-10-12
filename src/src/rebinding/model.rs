use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AnswerKind {
    A,
    AAAA,
    CNAME,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Strategy {
    Count,
    Timed,
    RoundRobin,
    Random,
    Multiple,
    Manual,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    Hostname,
    Resolver,
    Profile,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FinalBehavior {
    Hold,
    Repeat,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UnmatchedFamily {
    Nodata,
    Fallback,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Phase {
    pub id: String,
    pub label: String,
    pub values: Vec<String>,
    pub ttl: u32,
    pub query_count: u32,
    pub duration_ms: u64,
    pub weight: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub hostname: String,
    pub answer_kind: AnswerKind,
    pub strategy: Strategy,
    pub scope: Scope,
    pub final_behavior: FinalBehavior,
    pub unmatched_family: UnmatchedFamily,
    pub negative_ttl: u32,
    pub rrset_ttl: u32,
    pub phases: Vec<Phase>,
}
#[derive(Debug, Clone, Default)]
pub struct SelectionContext {
    pub query_index: u64,
    pub elapsed_ms: u64,
    pub random_slot: u64,
    pub manual_phase_id: Option<String>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SelectionStatus {
    Answer,
    Suppressed,
    Capacity,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Selection {
    pub answer_kind: AnswerKind,
    pub values: Vec<String>,
    pub ttl: u32,
    pub phase_ids: Vec<String>,
    pub status: SelectionStatus,
}
#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
#[error("{error}")]
pub struct ValidationError {
    pub error: String,
    pub code: String,
    pub field: String,
}
impl ValidationError {
    pub fn new(field: impl Into<String>, error: impl Into<String>) -> Self {
        Self {
            field: field.into(),
            error: error.into(),
            code: "invalid_rebinding".into(),
        }
    }
}
pub struct ProfileMatch<'a> {
    pub profile: &'a Profile,
    pub suppressed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateRequest {
    pub expected_generation: u64,
    pub profiles: Vec<Profile>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionRequest {
    pub expected_generation: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhaseRequest {
    pub expected_generation: u64,
    pub phase_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileStatus {
    pub profile_id: String,
    pub state_keys: usize,
    pub queries: u64,
    pub last_phase_ids: Vec<String>,
    pub manual_phase_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapacityStatus {
    pub session_used: usize,
    pub session_limit: usize,
    pub process_used: usize,
    pub process_limit: usize,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub generation: u64,
    pub profiles: Vec<Profile>,
    pub status: Vec<ProfileStatus>,
    pub capacity: CapacityStatus,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebindingMetadata {
    pub profile_id: String,
    pub profile_name: String,
    pub generation: u64,
    pub phase_ids: Vec<String>,
    pub strategy: Strategy,
    pub scope: Scope,
    pub query_index: Option<u64>,
    pub status: SelectionStatus,
    pub committed: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
#[error("{error}")]
pub struct RebindingError {
    pub error: String,
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
}
impl RebindingError {
    pub fn new(code: &str, error: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            error: error.into(),
            field: None,
        }
    }
}
impl From<ValidationError> for RebindingError {
    fn from(e: ValidationError) -> Self {
        Self {
            error: e.error,
            code: e.code,
            field: Some(e.field),
        }
    }
}
#[derive(Debug, Clone)]
pub struct LookupContext {
    pub session: String,
    pub relative_name: String,
    pub query_type: String,
    pub resolver_ip: std::net::IpAddr,
}
pub struct RenderedAnswer {
    pub wire: Vec<u8>,
    pub truncated: bool,
}
pub struct ResolvedAnswer {
    pub wire: Vec<u8>,
    pub metadata: RebindingMetadata,
}
