use crate::{cache::Cache, rebinding::*, tests::rebinding_tests::profile};
use hickory_proto::{
    op::{Message, MessageType, OpCode, Query, ResponseCode},
    rr::{Name, RecordType},
    serialize::binary::{BinDecodable, BinEncodable},
};
use std::{str::FromStr, sync::Arc};
use tokio::sync::broadcast;
fn query(host: &str, kind: RecordType) -> Vec<u8> {
    let mut m = Message::new(1, MessageType::Query, OpCode::Query);
    let mut q = Query::new();
    q.set_name(Name::from_str(host).unwrap());
    q.set_query_type(kind);
    m.add_query(q);
    m.to_bytes().unwrap()
}
async fn answer(
    cache: Arc<Cache>,
    store: Arc<Store>,
    host: &str,
    kind: RecordType,
    udp: bool,
) -> Message {
    let (tx, _) = broadcast::channel(32);
    let bytes = crate::dns::process_dns_query(
        &query(host, kind),
        "192.0.2.9:5353".parse().unwrap(),
        cache,
        Arc::new(tx),
        udp,
        store,
    )
    .await
    .unwrap();
    Message::from_bytes(&bytes).unwrap()
}
#[tokio::test]
async fn rebinding_wire_udp_tcp_progression_and_family_suppression() {
    let cache = Arc::new(Cache::new());
    let store = Arc::new(Store::new(cache.clone()));
    store
        .replace(
            "abcdefgh",
            UpdateRequest {
                expected_generation: 0,
                profiles: vec![profile(3)],
            },
        )
        .unwrap();
    for (udp, want) in [
        (true, "192.0.2.1"),
        (false, "192.0.2.2"),
        (true, "192.0.2.3"),
    ] {
        let m = answer(
            cache.clone(),
            store.clone(),
            "rebind.abcdefgh.localhost.",
            RecordType::A,
            udp,
        )
        .await;
        assert_eq!(m.answers[0].data.to_string(), want);
        assert_eq!(m.answers[0].ttl, 0);
    }
    let m = answer(
        cache.clone(),
        store.clone(),
        "rebind.abcdefgh.localhost.",
        RecordType::AAAA,
        true,
    )
    .await;
    assert!(m.answers.is_empty());
    assert_eq!(m.authorities[0].ttl, 0);
    assert_eq!(store.snapshot("abcdefgh").status[0].queries, 3);
}
#[tokio::test]
async fn rebinding_wire_oversized_answers_preserve_state_and_log_truncation() {
    let cache = Arc::new(Cache::new());
    let store = Arc::new(Store::new(cache.clone()));
    let mut p = profile(128);
    p.strategy = Strategy::Multiple;
    p.rrset_ttl = 7;
    store
        .replace(
            "abcdefgh",
            UpdateRequest {
                expected_generation: 0,
                profiles: vec![p],
            },
        )
        .unwrap();
    let m = answer(
        cache.clone(),
        store.clone(),
        "rebind.abcdefgh.localhost.",
        RecordType::A,
        true,
    )
    .await;
    assert!(m.metadata.truncation);
    assert!(m.answers.is_empty());
    assert_eq!(store.snapshot("abcdefgh").status[0].queries, 0);
    let logs = cache.lrange("requests:abcdefgh", 0, -1).await.unwrap();
    let log: serde_json::Value = serde_json::from_str(&logs[0]).unwrap();
    assert!(log["reply"].as_str().unwrap().contains("tc"));
    assert_eq!(log["rebinding"]["committed"], false);
    let m = answer(
        cache,
        store.clone(),
        "rebind.abcdefgh.localhost.",
        RecordType::A,
        false,
    )
    .await;
    assert!(!m.metadata.truncation);
    assert_eq!(m.answers.len(), 128);
    assert!(m.answers.iter().all(|a| a.ttl == 7));
    assert_eq!(store.snapshot("abcdefgh").status[0].queries, 1);
}
#[tokio::test]
async fn rebinding_wire_cname_and_unrelated_queries() {
    let cache = Arc::new(Cache::new());
    let store = Arc::new(Store::new(cache.clone()));
    let mut p = profile(1);
    p.answer_kind = AnswerKind::CNAME;
    p.phases[0].values = vec!["target.example.".into()];
    store
        .replace(
            "abcdefgh",
            UpdateRequest {
                expected_generation: 0,
                profiles: vec![p],
            },
        )
        .unwrap();
    for kind in [RecordType::A, RecordType::AAAA, RecordType::CNAME] {
        let m = answer(
            cache.clone(),
            store.clone(),
            "REBIND.abcdefgh.localhost.",
            kind,
            true,
        )
        .await;
        assert_eq!(m.answers[0].record_type(), RecordType::CNAME);
        assert_eq!(m.answers[0].data.to_string(), "target.example.");
    }
    let before = store.snapshot("abcdefgh").status[0].queries;
    for kind in [
        RecordType::TXT,
        RecordType::MX,
        RecordType::NS,
        RecordType::SOA,
    ] {
        let m = answer(
            cache.clone(),
            store.clone(),
            "rebind.abcdefgh.localhost.",
            kind,
            true,
        )
        .await;
        assert_eq!(m.metadata.response_code, ResponseCode::NoError);
    }
    assert_eq!(store.snapshot("abcdefgh").status[0].queries, before);
}
