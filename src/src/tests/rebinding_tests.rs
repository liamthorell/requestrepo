use crate::rebinding::{match_profile, select, validate_profiles, Profile, SelectionContext};
use serde_json::json;

pub(crate) fn profile(n: usize) -> Profile {
    serde_json::from_value(json!({"id":"test", "name":"CTF", "enabled":true,
        "hostname":"rebind", "answer_kind":"A", "strategy":"count",
        "scope":"hostname", "final_behavior":"hold", "unmatched_family":"nodata",
        "negative_ttl":0, "rrset_ttl":0,
        "phases":(0..n).map(|i| json!({"id":format!("p{i}"),"label":format!("Phase {}",i+1),
            "values":[format!("192.0.2.{}", i+1)],"ttl":0,"query_count":1,"duration_ms":10,"weight":1})).collect::<Vec<_>>()
    })).unwrap()
}
fn context(index: u64) -> SelectionContext {
    SelectionContext {
        query_index: index,
        elapsed_ms: 0,
        random_slot: 0,
        manual_phase_id: None,
    }
}
fn phase(p: &Profile, c: SelectionContext) -> String {
    select(p, &c).unwrap().phase_ids[0].clone()
}
#[test]
fn count_uses_all_three_phases() {
    let mut p = profile(3);
    p.phases[1].query_count = 2;
    assert_eq!(
        (0..5).map(|i| phase(&p, context(i))).collect::<Vec<_>>(),
        ["p0", "p1", "p1", "p2", "p2"]
    );
    p.final_behavior = crate::rebinding::FinalBehavior::Repeat;
    assert_eq!(
        (0..5).map(|i| phase(&p, context(i))).collect::<Vec<_>>(),
        ["p0", "p1", "p1", "p2", "p0"]
    );
    assert_eq!(phase(&profile(1), context(u64::MAX)), "p0");
}
#[test]
fn rotation_visits_128_phases() {
    let mut p = profile(128);
    p.strategy = crate::rebinding::Strategy::RoundRobin;
    for i in 0..128 {
        assert_eq!(phase(&p, context(i)), format!("p{i}"));
    }
    assert_eq!(phase(&p, context(128)), "p0");
    assert_eq!(phase(&p, context(u64::MAX)), "p127");
}
#[test]
fn timed_boundaries_hold_and_repeat() {
    let mut p = profile(3);
    p.strategy = crate::rebinding::Strategy::Timed;
    for (ms, want) in [
        (0, "p0"),
        (9, "p0"),
        (10, "p1"),
        (20, "p2"),
        (30, "p2"),
        (u64::MAX, "p2"),
    ] {
        let mut c = context(0);
        c.elapsed_ms = ms;
        assert_eq!(phase(&p, c), want);
    }
    p.final_behavior = crate::rebinding::FinalBehavior::Repeat;
    let mut c = context(0);
    c.elapsed_ms = 30;
    assert_eq!(phase(&p, c), "p0");
}
#[test]
fn weights_select_all_nonzero_entries() {
    let mut p = profile(3);
    p.strategy = crate::rebinding::Strategy::Random;
    p.phases[1].weight = 2;
    for (slot, want) in [(0, "p0"), (1, "p1"), (2, "p1"), (3, "p2")] {
        let mut c = context(0);
        c.random_slot = slot;
        assert_eq!(phase(&p, c), want);
    }
    p.phases[0].weight = 0;
    assert_eq!(phase(&p, context(0)), "p1");
}
#[test]
fn multiple_deduplicates_with_one_ttl() {
    let mut p = profile(3);
    p.strategy = crate::rebinding::Strategy::Multiple;
    p.rrset_ttl = 7;
    p.phases[1].values.push("192.0.2.1".into());
    p.phases[2].ttl = 20;
    let s = select(&p, &context(0)).unwrap();
    assert_eq!(s.values, ["192.0.2.1", "192.0.2.2", "192.0.2.3"]);
    assert_eq!(s.ttl, 7);
    assert_eq!(s.phase_ids.len(), 3);
}
#[test]
fn manual_selects_any_phase() {
    let mut p = profile(10);
    p.strategy = crate::rebinding::Strategy::Manual;
    let mut c = context(20);
    c.manual_phase_id = Some("p8".into());
    assert_eq!(phase(&p, c), "p8");
}
#[test]
fn rebinding_validation_limits_and_families() {
    assert!(validate_profiles(vec![profile(1)]).is_ok());
    assert!(validate_profiles(vec![profile(128)]).is_ok());
    for n in [0, 129] {
        assert!(validate_profiles(vec![profile(n)]).is_err());
    }
    let mut p = profile(1);
    p.phases[0].values = vec!["192.0.2.1".into(); 129];
    assert!(validate_profiles(vec![p]).is_err());
    let profiles = (0..16)
        .map(|i| {
            let mut p = profile(1);
            p.id = format!("profile{i}");
            p.hostname = format!("host{i}");
            p
        })
        .collect::<Vec<_>>();
    assert!(validate_profiles(profiles.clone()).is_ok());
    let mut more = profiles;
    let mut extra = profile(1);
    extra.id = "extra".into();
    extra.hostname = "extra".into();
    more.push(extra);
    assert!(validate_profiles(more).is_err());
    for (ttl, valid) in [(0, true), (86_400, true), (86_401, false)] {
        let mut p = profile(1);
        p.phases[0].ttl = ttl;
        assert_eq!(validate_profiles(vec![p]).is_ok(), valid);
    }
    for (ms, valid) in [
        (0, false),
        (1, true),
        (86_400_000, true),
        (86_400_001, false),
    ] {
        let mut p = profile(1);
        p.phases[0].duration_ms = ms;
        assert_eq!(validate_profiles(vec![p]).is_ok(), valid);
    }
    for value in ["bad", "999.1.1.1", "::1"] {
        let mut p = profile(1);
        p.phases[0].values = vec![value.into()];
        assert!(validate_profiles(vec![p]).is_err());
    }
    let mut p = profile(1);
    p.answer_kind = crate::rebinding::AnswerKind::AAAA;
    p.phases[0].values = vec!["::1".into()];
    assert!(validate_profiles(vec![p.clone()]).is_ok());
    p.phases[0].values = vec!["gg::1".into()];
    assert!(validate_profiles(vec![p]).is_err());
}
#[test]
fn rebinding_validation_identifiers_weights_and_conflicts() {
    let mut p = profile(2);
    p.phases[1].id = "p0".into();
    assert!(validate_profiles(vec![p]).is_err());
    let mut p = profile(1);
    p.name = "x".repeat(129);
    assert!(validate_profiles(vec![p]).is_err());
    let mut p = profile(1);
    p.strategy = crate::rebinding::Strategy::Random;
    p.phases[0].weight = 0;
    assert!(validate_profiles(vec![p]).is_err());
    for host in ["bad..name", "outside.example.", "a.*", "a/b"] {
        let mut p = profile(1);
        p.hostname = host.into();
        assert!(validate_profiles(vec![p]).is_err());
    }
    let p = profile(1);
    let mut cname = p.clone();
    cname.id = "alias".into();
    cname.answer_kind = crate::rebinding::AnswerKind::CNAME;
    cname.phases[0].values = vec!["target.example.".into()];
    assert!(validate_profiles(vec![cname.clone()]).is_ok());
    assert!(validate_profiles(vec![p, cname.clone()]).is_err());
    cname.strategy = crate::rebinding::Strategy::Multiple;
    assert!(validate_profiles(vec![cname]).is_err());
}
#[test]
fn rebinding_matching_is_exact_scoped_and_case_insensitive() {
    let mut exact = profile(1);
    exact.hostname = "ReBind".into();
    let mut wildcard = profile(1);
    wildcard.id = "wildcard".into();
    wildcard.hostname = "*".into();
    let profiles = validate_profiles(vec![wildcard, exact]).unwrap();
    assert_eq!(
        match_profile(&profiles, "REBIND", "A").unwrap().profile.id,
        "test"
    );
    assert_eq!(
        match_profile(&profiles, "other", "A").unwrap().profile.id,
        "wildcard"
    );
    assert!(match_profile(&profiles, "@", "A").is_none());
    assert!(match_profile(&profiles, "_acme-challenge", "A").is_none());
    assert!(match_profile(&profiles, "x._acme-challenge", "AAAA").is_none());
    assert!(match_profile(&profiles, "rebind", "TXT").is_none());
    assert!(
        match_profile(&profiles, "rebind", "AAAA")
            .unwrap()
            .suppressed
    );
}

use crate::cache::Cache;
use crate::rebinding::{LookupContext, PhaseRequest, RenderedAnswer, Store, UpdateRequest};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
fn lookup(host: &str, kind: &str, ip: &str) -> LookupContext {
    LookupContext {
        session: "abcdefgh".into(),
        relative_name: host.into(),
        query_type: kind.into(),
        resolver_ip: ip.parse().unwrap(),
    }
}
fn render(
    s: &crate::rebinding::Selection,
) -> Result<RenderedAnswer, crate::rebinding::RebindingError> {
    Ok(RenderedAnswer {
        wire: s.values.join(",").into_bytes(),
        truncated: false,
    })
}
fn configured(p: Profile) -> Store {
    let store = Store::new(Arc::new(Cache::new()));
    store
        .replace(
            "abcdefgh",
            UpdateRequest {
                expected_generation: 0,
                profiles: vec![p],
            },
        )
        .unwrap();
    store
}
#[test]
fn rebinding_store_atomic_counts_and_scopes() {
    let mut p = profile(3);
    p.phases[0].query_count = 10;
    let store = Arc::new(configured(p));
    let now = Instant::now();
    let handles = (0..100)
        .map(|_| {
            let store = store.clone();
            std::thread::spawn(move || {
                store
                    .answer(&lookup("rebind", "A", "192.0.2.1"), now, |_| 0, render)
                    .unwrap()
                    .unwrap()
                    .wire
            })
        })
        .collect::<Vec<_>>();
    let answers = handles
        .into_iter()
        .map(|h| h.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        answers
            .iter()
            .filter(|x| x.as_slice() == b"192.0.2.1")
            .count(),
        10
    );
    assert_eq!(store.snapshot("abcdefgh").status[0].queries, 100);
    let mut p = profile(3);
    p.hostname = "*".into();
    p.scope = crate::rebinding::Scope::Resolver;
    let store = configured(p);
    let answer = |host, ip| {
        store
            .answer(&lookup(host, "A", ip), now, |_| 0, render)
            .unwrap()
            .unwrap()
            .wire
    };
    assert_eq!(answer("one", "192.0.2.1"), b"192.0.2.1");
    assert_eq!(answer("one", "192.0.2.2"), b"192.0.2.1");
    assert_eq!(answer("one", "192.0.2.1"), b"192.0.2.2");
    assert_eq!(answer("two", "192.0.2.1"), b"192.0.2.1");
}
#[test]
fn rebinding_truncation_and_errors_do_not_commit() {
    let store = configured(profile(3));
    let now = Instant::now();
    let l = lookup("rebind", "A", "192.0.2.1");
    let reply = store
        .answer(
            &l,
            now,
            |_| 0,
            |_| {
                Ok(RenderedAnswer {
                    wire: vec![],
                    truncated: true,
                })
            },
        )
        .unwrap()
        .unwrap();
    assert!(!reply.metadata.committed);
    assert_eq!(store.snapshot("abcdefgh").capacity.session_used, 0);
    assert!(store
        .answer(
            &l,
            now,
            |_| 0,
            |_| Err(crate::rebinding::RebindingError::new("render", "failed"))
        )
        .is_err());
    assert_eq!(
        store.answer(&l, now, |_| 0, render).unwrap().unwrap().wire,
        b"192.0.2.1"
    );
    let suppressed = store
        .answer(&lookup("rebind", "AAAA", "192.0.2.1"), now, |_| 0, render)
        .unwrap()
        .unwrap();
    assert!(!suppressed.metadata.committed);
    assert_eq!(store.snapshot("abcdefgh").status[0].queries, 1);
}
#[test]
fn rebinding_generation_manual_reset_and_timing() {
    let mut p = profile(3);
    p.strategy = crate::rebinding::Strategy::Timed;
    let store = configured(p);
    let now = Instant::now();
    let l = lookup("rebind", "A", "192.0.2.1");
    assert_eq!(
        store.answer(&l, now, |_| 0, render).unwrap().unwrap().wire,
        b"192.0.2.1"
    );
    assert_eq!(
        store
            .answer(&l, now + Duration::from_millis(10), |_| 0, render)
            .unwrap()
            .unwrap()
            .wire,
        b"192.0.2.2"
    );
    assert!(store
        .replace(
            "abcdefgh",
            UpdateRequest {
                expected_generation: 0,
                profiles: vec![]
            }
        )
        .is_err());
    assert_eq!(store.reset("abcdefgh", "test", 1).unwrap().generation, 2);
    assert_eq!(store.snapshot("abcdefgh").capacity.session_used, 0);
    let mut p = profile(10);
    p.strategy = crate::rebinding::Strategy::Manual;
    store
        .replace(
            "abcdefgh",
            UpdateRequest {
                expected_generation: 2,
                profiles: vec![p],
            },
        )
        .unwrap();
    assert_eq!(
        store
            .set_phase(
                "abcdefgh",
                "test",
                PhaseRequest {
                    expected_generation: 3,
                    phase_id: "p8".into()
                }
            )
            .unwrap()
            .generation,
        4
    );
    assert_eq!(
        store.answer(&l, now, |_| 0, render).unwrap().unwrap().wire,
        b"192.0.2.9"
    );
    store.clear_session("abcdefgh").unwrap();
    assert!(store.snapshot("abcdefgh").profiles.is_empty());
}
#[test]
fn rebinding_capacity_preserves_existing_keys() {
    let mut p = profile(1);
    p.hostname = "*".into();
    let store = configured(p);
    let now = Instant::now();
    for i in 0..1024 {
        assert!(store
            .answer(
                &lookup(&format!("host{i}"), "A", "192.0.2.1"),
                now,
                |_| 0,
                render
            )
            .unwrap()
            .is_some());
    }
    let capacity = store
        .answer(&lookup("overflow", "A", "192.0.2.1"), now, |_| 0, render)
        .unwrap()
        .unwrap();
    assert_eq!(
        capacity.metadata.status,
        crate::rebinding::SelectionStatus::Capacity
    );
    assert!(!capacity.metadata.committed);
    assert_eq!(
        store
            .answer(&lookup("host0", "A", "192.0.2.1"), now, |_| 0, render)
            .unwrap()
            .unwrap()
            .wire,
        b"192.0.2.1"
    );
}
#[test]
fn rebinding_failed_random_selection_releases_reservation() {
    let cache = Arc::new(Cache::new());
    let store = Store::new(cache.clone());
    let mut p = profile(3);
    p.strategy = crate::rebinding::Strategy::Random;
    store
        .replace(
            "abcdefgh",
            UpdateRequest {
                expected_generation: 0,
                profiles: vec![p],
            },
        )
        .unwrap();
    let before = cache.stats().memory_used_bytes;
    assert!(store
        .answer(
            &lookup("rebind", "A", "192.0.2.1"),
            Instant::now(),
            |_| 99,
            render
        )
        .is_err());
    assert_eq!(cache.stats().memory_used_bytes, before);
}
#[test]
fn rebinding_status_reports_most_recent_answer_not_newest_clock() {
    let mut p = profile(3);
    p.hostname = "*".into();
    let store = configured(p);
    let now = Instant::now();
    store
        .answer(&lookup("one", "A", "192.0.2.1"), now, |_| 0, render)
        .unwrap();
    store
        .answer(
            &lookup("two", "A", "192.0.2.1"),
            now + Duration::from_millis(1),
            |_| 0,
            render,
        )
        .unwrap();
    store
        .answer(
            &lookup("one", "A", "192.0.2.1"),
            now + Duration::from_millis(2),
            |_| 0,
            render,
        )
        .unwrap();
    assert_eq!(store.snapshot("abcdefgh").status[0].last_phase_ids, ["p1"]);
}
#[test]
fn rebinding_quota_failure_preserves_configuration_and_accounting() {
    let cache = Arc::new(Cache::new());
    let store = Store::new(cache.clone());
    store
        .replace(
            "abcdefgh",
            UpdateRequest {
                expected_generation: 0,
                profiles: vec![profile(1)],
            },
        )
        .unwrap();
    let before = cache.stats().memory_used_bytes;
    assert!(cache
        .replace_external_usage("too-large", "abcdefgh", usize::MAX)
        .is_err());
    assert_eq!(cache.stats().memory_used_bytes, before);
    assert_eq!(store.snapshot("abcdefgh").generation, 1);
    store.clear_session("abcdefgh").unwrap();
    assert_eq!(cache.stats().memory_used_bytes, 0);
}
#[test]
fn rebinding_memory_charge_includes_multi_phase_metadata() {
    let cache = Arc::new(Cache::new());
    let store = Store::new(cache.clone());
    let mut p = profile(32);
    p.strategy = crate::rebinding::Strategy::Multiple;
    for (i, phase) in p.phases.iter_mut().enumerate() {
        phase.id = format!("p{i:063}");
    }
    store
        .replace(
            "abcdefgh",
            UpdateRequest {
                expected_generation: 0,
                profiles: vec![p],
            },
        )
        .unwrap();
    let before = cache.stats().memory_used_bytes;
    store
        .answer(
            &lookup("rebind", "A", "192.0.2.1"),
            Instant::now(),
            |_| 0,
            render,
        )
        .unwrap();
    assert!(
        cache.stats().memory_used_bytes - before > 2048,
        "Account for all 32 allocated phase ID strings, not just a fixed runtime header"
    );
}
