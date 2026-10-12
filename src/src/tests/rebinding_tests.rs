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
