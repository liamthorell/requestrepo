use super::*;
use crate::cache::Cache;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Instant,
};
const SESSION_LIMIT: usize = 1024;
const PROCESS_LIMIT: usize = 65536;
const MAX_GENERATION: u64 = 9_007_199_254_740_991;
#[derive(Clone)]
struct Runtime {
    queries: u64,
    start: Instant,
    last_seen: Instant,
    last_phase_ids: Vec<String>,
}
#[derive(Default)]
struct SessionState {
    generation: u64,
    profiles: Vec<Profile>,
    states: HashMap<String, Runtime>,
    manual: HashMap<String, String>,
}
impl SessionState {
    fn usage(&self) -> usize {
        512 + serde_json::to_vec(&self.profiles)
            .map(|s| s.len() * 3)
            .unwrap_or(0)
            + self
                .states
                .keys()
                .map(|key| key.len() * 2 + 512)
                .sum::<usize>()
            + self
                .manual
                .iter()
                .map(|(a, b)| a.len() + b.len() + 128)
                .sum::<usize>()
    }
}
#[derive(Default)]
struct Inner {
    sessions: HashMap<String, SessionState>,
    keys: usize,
}
pub struct Store {
    inner: Mutex<Inner>,
    cache: Arc<Cache>,
}
impl Store {
    pub fn new(cache: Arc<Cache>) -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
            cache,
        }
    }
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
    fn snapshot_inner(inner: &Inner, session: &str) -> Snapshot {
        let state = inner.sessions.get(session);
        let profiles = state.map(|s| s.profiles.clone()).unwrap_or_default();
        let status = profiles
            .iter()
            .map(|p| {
                let prefix = format!("{}|", p.id);
                let entries = state
                    .unwrap()
                    .states
                    .iter()
                    .filter(|(key, _)| key.starts_with(&prefix))
                    .map(|(_, value)| value)
                    .collect::<Vec<_>>();
                ProfileStatus {
                    profile_id: p.id.clone(),
                    state_keys: entries.len(),
                    queries: entries
                        .iter()
                        .fold(0u64, |n, s| n.saturating_add(s.queries)),
                    last_phase_ids: entries
                        .iter()
                        .max_by_key(|r| r.last_seen)
                        .map(|r| r.last_phase_ids.clone())
                        .unwrap_or_default(),
                    manual_phase_id: state.unwrap().manual.get(&p.id).cloned(),
                }
            })
            .collect();
        Snapshot {
            generation: state.map(|s| s.generation).unwrap_or(0),
            profiles,
            status,
            capacity: CapacityStatus {
                session_used: state.map(|s| s.states.len()).unwrap_or(0),
                session_limit: SESSION_LIMIT,
                process_used: inner.keys,
                process_limit: PROCESS_LIMIT,
            },
        }
    }
    pub fn snapshot(&self, session: &str) -> Snapshot {
        Self::snapshot_inner(&self.lock(), session)
    }
    fn generation(state: &SessionState, expected: u64) -> Result<u64, RebindingError> {
        if state.generation != expected {
            return Err(RebindingError::new(
                "generation_conflict",
                "Configuration changed; reload before retrying",
            ));
        }
        state
            .generation
            .checked_add(1)
            .filter(|n| *n <= MAX_GENERATION)
            .ok_or_else(|| {
                RebindingError::new("generation_conflict", "Configuration generation exhausted")
            })
    }
    fn reserve(&self, session: &str, bytes: usize) -> Result<(), RebindingError> {
        self.cache
            .replace_external_usage(&format!("rebinding:{session}"), session, bytes)
            .map_err(|e| RebindingError::new("rebinding_capacity", e.to_string()))
    }
    pub fn replace(
        &self,
        session: &str,
        request: UpdateRequest,
    ) -> Result<Snapshot, RebindingError> {
        let profiles = validate_profiles(request.profiles)?;
        let mut inner = self.lock();
        let old = inner.sessions.get(session);
        let generation = Self::generation(
            old.unwrap_or(&SessionState::default()),
            request.expected_generation,
        )?;
        let next = SessionState {
            generation,
            profiles,
            ..Default::default()
        };
        self.reserve(session, next.usage())?;
        inner.keys -= old.map(|s| s.states.len()).unwrap_or(0);
        inner.sessions.insert(session.into(), next);
        Ok(Self::snapshot_inner(&inner, session))
    }
    pub fn reset(
        &self,
        session: &str,
        profile_id: &str,
        expected_generation: u64,
    ) -> Result<Snapshot, RebindingError> {
        let mut inner = self.lock();
        let state = inner
            .sessions
            .get_mut(session)
            .ok_or_else(|| RebindingError::new("profile_not_found", "Profile not found"))?;
        let generation = Self::generation(state, expected_generation)?;
        if !state.profiles.iter().any(|p| p.id == profile_id) {
            return Err(RebindingError::new(
                "profile_not_found",
                "Profile not found",
            ));
        }
        let before = state.states.len();
        state
            .states
            .retain(|key, _| !key.starts_with(&format!("{profile_id}|")));
        state.manual.remove(profile_id);
        state.generation = generation;
        let removed = before - state.states.len();
        self.reserve(session, state.usage())?;
        inner.keys -= removed;
        Ok(Self::snapshot_inner(&inner, session))
    }
    pub fn set_phase(
        &self,
        session: &str,
        profile_id: &str,
        request: PhaseRequest,
    ) -> Result<Snapshot, RebindingError> {
        let mut inner = self.lock();
        let state = inner
            .sessions
            .get_mut(session)
            .ok_or_else(|| RebindingError::new("profile_not_found", "Profile not found"))?;
        let generation = Self::generation(state, request.expected_generation)?;
        let p = state
            .profiles
            .iter()
            .find(|p| p.id == profile_id)
            .ok_or_else(|| RebindingError::new("profile_not_found", "Profile not found"))?;
        if p.strategy != Strategy::Manual || !p.phases.iter().any(|p| p.id == request.phase_id) {
            return Err(RebindingError::new(
                "invalid_action",
                "Select an existing phase in manual mode",
            ));
        }
        let old = state.manual.insert(profile_id.into(), request.phase_id);
        if let Err(e) = self.reserve(session, state.usage()) {
            match old {
                Some(old) => {
                    state.manual.insert(profile_id.into(), old);
                }
                None => {
                    state.manual.remove(profile_id);
                }
            }
            return Err(e);
        }
        state.generation = generation;
        Ok(Self::snapshot_inner(&inner, session))
    }
    pub fn clear_session(&self, session: &str) -> Result<(), RebindingError> {
        let mut inner = self.lock();
        self.cache
            .release_external_usage(&format!("rebinding:{session}"))
            .map_err(|e| RebindingError::new("rebinding_capacity", e.to_string()))?;
        if let Some(old) = inner.sessions.remove(session) {
            inner.keys -= old.states.len();
        }
        Ok(())
    }
    pub fn answer<F, R>(
        &self,
        lookup: &LookupContext,
        now: Instant,
        draw: R,
        render: F,
    ) -> Result<Option<ResolvedAnswer>, RebindingError>
    where
        R: FnOnce(u64) -> u64,
        F: FnOnce(&Selection) -> Result<RenderedAnswer, RebindingError>,
    {
        let mut inner = self.lock();
        let global_keys = inner.keys;
        let state = match inner.sessions.get_mut(&lookup.session) {
            Some(s) => s,
            None => return Ok(None),
        };
        let matched =
            match match_profile(&state.profiles, &lookup.relative_name, &lookup.query_type) {
                Some(p) => p,
                None => return Ok(None),
            };
        let p = matched.profile.clone();
        let suffix = match p.scope {
            Scope::Hostname => lookup.relative_name.to_ascii_lowercase(),
            Scope::Resolver => format!(
                "{}|{}",
                lookup.relative_name.to_ascii_lowercase(),
                lookup.resolver_ip
            ),
            Scope::Profile => String::new(),
        };
        let key = format!("{}|{}|{suffix}", p.id, lookup.query_type);
        let old = state.states.get(&key).cloned();
        let index = old.as_ref().map(|s| s.queries).unwrap_or(0);
        let old_usage = state.usage();
        let mut status = if matched.suppressed {
            SelectionStatus::Suppressed
        } else {
            SelectionStatus::Answer
        };
        let mut reserved = false;
        if status == SelectionStatus::Answer && old.is_none() {
            if state.states.len() >= SESSION_LIMIT || global_keys >= PROCESS_LIMIT {
                status = SelectionStatus::Capacity;
            } else if self
                .reserve(&lookup.session, old_usage + key.len() * 2 + 512)
                .is_err()
            {
                status = SelectionStatus::Capacity;
            } else {
                reserved = true;
            }
        }
        let selection = if status != SelectionStatus::Answer {
            Selection {
                answer_kind: p.answer_kind,
                values: vec![],
                ttl: p.negative_ttl,
                phase_ids: vec![],
                status,
            }
        } else {
            let selected = select(
                &p,
                &SelectionContext {
                    query_index: index,
                    elapsed_ms: old
                        .as_ref()
                        .map(|s| {
                            now.saturating_duration_since(s.start)
                                .as_millis()
                                .min(u128::from(u64::MAX)) as u64
                        })
                        .unwrap_or(0),
                    random_slot: if p.strategy == Strategy::Random {
                        draw(p.phases.iter().map(|s| u64::from(s.weight)).sum())
                    } else {
                        0
                    },
                    manual_phase_id: state.manual.get(&p.id).cloned(),
                },
            );
            match selected {
                Ok(value) => value,
                Err(error) => {
                    if reserved {
                        self.reserve(&lookup.session, old_usage)?;
                    }
                    return Err(error.into());
                }
            }
        };
        let rendered = match render(&selection) {
            Ok(r) => r,
            Err(e) => {
                if reserved {
                    self.reserve(&lookup.session, old_usage)?;
                }
                return Err(e);
            }
        };
        let committed = status == SelectionStatus::Answer && !rendered.truncated;
        if committed {
            state.states.insert(
                key,
                Runtime {
                    queries: index.saturating_add(1),
                    start: old.as_ref().map(|s| s.start).unwrap_or(now),
                    last_seen: now,
                    last_phase_ids: selection.phase_ids.clone(),
                },
            );
            if old.is_none() {
                inner.keys += 1;
            }
        } else if reserved {
            self.reserve(&lookup.session, old_usage)?;
        }
        let generation = inner.sessions.get(&lookup.session).unwrap().generation;
        Ok(Some(ResolvedAnswer {
            wire: rendered.wire,
            metadata: RebindingMetadata {
                profile_id: p.id,
                profile_name: p.name,
                generation,
                phase_ids: selection.phase_ids,
                strategy: p.strategy,
                scope: p.scope,
                query_index: if status == SelectionStatus::Answer {
                    Some(index)
                } else {
                    None
                },
                status,
                committed,
            },
        }))
    }
}
