//! Custom session names (`ssrf.req.example.com` instead of `k3x9q2ab.req.example.com`).
//!
//! Random subdomains are stateless: any 8-character name from the alphabet is
//! accepted and the JWT alone proves ownership. Custom names are claimed, so
//! they are kept in a registry persisted to `CUSTOM_NAMES_FILE` (survives
//! restarts, unlike the in-memory cache). Each claim gets a random id that is
//! embedded in the session JWT, so a token for a released name stops working
//! even if someone else claims the same name later.

use super::config::CONFIG;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;
use tracing::{error, info, warn};

pub const MIN_LEN: usize = 3;
pub const MAX_LEN: usize = 32;
const MAX_CLAIMS: usize = 500;
const RESERVED: &[&str] = &[
    "www",
    "api",
    "app",
    "admin",
    "mail",
    "smtp",
    "imap",
    "pop",
    "mx",
    "ns",
    "ns1",
    "ns2",
    "dns",
    "ftp",
    "localhost",
    "static",
    "assets",
    "cdn",
    "status",
    "health",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claim {
    pub id: String,
    pub claimed_at: i64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ClaimError {
    Invalid(String),
    Taken,
    Full,
}

lazy_static! {
    static ref REGISTRY: RwLock<HashMap<String, Claim>> = RwLock::new(load());
}

fn load() -> HashMap<String, Claim> {
    let Some(path) = CONFIG.custom_names_file.as_deref() else {
        return HashMap::new();
    };
    match std::fs::read_to_string(path) {
        Ok(raw) => match serde_json::from_str::<HashMap<String, Claim>>(&raw) {
            Ok(map) => {
                info!("Loaded {} custom session names from {path}", map.len());
                map
            }
            Err(e) => {
                error!("Ignoring unreadable custom names file {path}: {e}");
                HashMap::new()
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => HashMap::new(),
        Err(e) => {
            error!("Cannot read custom names file {path}: {e}");
            HashMap::new()
        }
    }
}

fn persist(map: &HashMap<String, Claim>) {
    let Some(path) = CONFIG.custom_names_file.as_deref() else {
        return;
    };
    let tmp = format!("{path}.tmp");
    let result = serde_json::to_vec_pretty(map)
        .map_err(std::io::Error::other)
        .and_then(|json| std::fs::write(&tmp, json))
        .and_then(|_| std::fs::rename(&tmp, path));
    if let Err(e) = result {
        warn!("Could not save custom names to {path}: {e}; claims will not survive a restart");
    }
}

/// True when `name` has the shape of a random subdomain. Those stay reserved
/// for the generator so a claim can never land on someone's random session.
fn looks_random(name: &str) -> bool {
    super::verify_subdomain(
        name,
        CONFIG.subdomain_length,
        &CONFIG.subdomain_alphabet_set,
    )
}

/// Normalise and validate a requested name. Returns the lowercase form.
pub fn validate(raw: &str) -> Result<String, ClaimError> {
    let name = raw.trim().to_ascii_lowercase();
    let invalid = |msg: &str| Err(ClaimError::Invalid(msg.to_string()));
    if name.len() < MIN_LEN || name.len() > MAX_LEN {
        return invalid(&format!("Use {MIN_LEN}–{MAX_LEN} characters."));
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return invalid("Only letters, digits and hyphens.");
    }
    if name.starts_with('-') || name.ends_with('-') || name.contains("--") {
        return invalid("Hyphens can't lead, trail or repeat.");
    }
    if RESERVED.contains(&name.as_str()) {
        return invalid("That name is reserved.");
    }
    if looks_random(&name) {
        return invalid(&format!(
            "{}-character names without a hyphen are kept for random URLs.",
            CONFIG.subdomain_length
        ));
    }
    Ok(name)
}

/// Claim a name. Returns the normalised name and the claim id for the JWT.
pub fn claim(raw: &str, now: i64) -> Result<(String, String), ClaimError> {
    let name = validate(raw)?;
    let mut map = REGISTRY.write().unwrap_or_else(|e| e.into_inner());
    if map.contains_key(&name) {
        return Err(ClaimError::Taken);
    }
    if map.len() >= MAX_CLAIMS {
        return Err(ClaimError::Full);
    }
    let id = uuid::Uuid::new_v4().simple().to_string();
    map.insert(
        name.clone(),
        Claim {
            id: id.clone(),
            claimed_at: now,
        },
    );
    persist(&map);
    Ok((name, id))
}

/// Release a claim, but only for the holder of the matching claim id.
pub fn release(name: &str, id: &str) -> bool {
    let mut map = REGISTRY.write().unwrap_or_else(|e| e.into_inner());
    if map.get(name).is_some_and(|c| c.id == id) {
        map.remove(name);
        persist(&map);
        true
    } else {
        false
    }
}

pub fn is_claimed(name: &str) -> bool {
    REGISTRY
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .contains_key(name)
}

/// The claim id currently attached to `name`, if any.
pub fn claim_id(name: &str) -> Option<String> {
    REGISTRY
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .get(name)
        .map(|c| c.id.clone())
}

#[cfg(test)]
pub fn clear_for_tests() {
    REGISTRY.write().unwrap().clear();
}
