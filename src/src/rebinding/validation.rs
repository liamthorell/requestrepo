use super::model::*;
use hickory_proto::rr::Name;
use std::{
    collections::HashSet,
    net::{Ipv4Addr, Ipv6Addr},
};
fn id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}
fn dns_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 253
        && value.trim_end_matches('.').split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && label
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        })
        && Name::from_ascii(value).is_ok()
}
fn overlaps(a: &str, b: &str) -> bool {
    a == b || (a == "*" && b != "@") || (b == "*" && a != "@")
}
pub fn validate_profiles(mut profiles: Vec<Profile>) -> Result<Vec<Profile>, ValidationError> {
    if profiles.len() > 16 {
        return Err(ValidationError::new(
            "profiles",
            "At most 16 profiles are allowed",
        ));
    }
    let mut ids = HashSet::new();
    for (i, p) in profiles.iter_mut().enumerate() {
        let root = format!("profiles[{i}]");
        if !id(&p.id) || !ids.insert(p.id.clone()) {
            return Err(ValidationError::new(
                format!("{root}.id"),
                "Profile IDs must be valid and unique",
            ));
        }
        if p.name.chars().count() > 128 {
            return Err(ValidationError::new(
                format!("{root}.name"),
                "Name is limited to 128 characters",
            ));
        }
        p.hostname = p.hostname.to_ascii_lowercase();
        if p.hostname != "@"
            && p.hostname != "*"
            && (!dns_name(&p.hostname) || p.hostname.ends_with('.'))
        {
            return Err(ValidationError::new(
                format!("{root}.hostname"),
                "Use @, *, or a relative DNS hostname",
            ));
        }
        if p.negative_ttl > 86_400 || p.rrset_ttl > 86_400 {
            return Err(ValidationError::new(
                root.clone(),
                "TTLs must be between 0 and 86400 seconds",
            ));
        }
        if p.phases.is_empty()
            || p.phases.len() > 128
            || p.phases.iter().map(|q| q.values.len()).sum::<usize>() > 128
        {
            return Err(ValidationError::new(
                format!("{root}.phases"),
                "Use 1–128 phases and at most 128 values",
            ));
        }
        if p.strategy == Strategy::Multiple && p.answer_kind == AnswerKind::CNAME {
            return Err(ValidationError::new(
                format!("{root}.strategy"),
                "Multiple-address mode requires A or AAAA",
            ));
        }
        if p.strategy == Strategy::Random && p.phases.iter().all(|q| q.weight == 0) {
            return Err(ValidationError::new(
                format!("{root}.phases"),
                "At least one weight must be nonzero",
            ));
        }
        let mut phase_ids = HashSet::new();
        for (j, phase) in p.phases.iter_mut().enumerate() {
            let field = format!("{root}.phases[{j}]");
            if !id(&phase.id) || !phase_ids.insert(phase.id.clone()) {
                return Err(ValidationError::new(
                    format!("{field}.id"),
                    "Phase IDs must be valid and unique",
                ));
            }
            if phase.label.chars().count() > 128
                || phase.ttl > 86_400
                || !(1..=1_000_000).contains(&phase.query_count)
                || !(1..=86_400_000).contains(&phase.duration_ms)
                || phase.weight > 1_000_000
            {
                return Err(ValidationError::new(
                    field.clone(),
                    "Invalid label, TTL, count, duration, or weight",
                ));
            }
            if phase.values.is_empty()
                || (p.answer_kind == AnswerKind::CNAME && phase.values.len() != 1)
            {
                return Err(ValidationError::new(
                    format!("{field}.values"),
                    "Supply addresses, or exactly one CNAME target",
                ));
            }
            for (k, value) in phase.values.iter_mut().enumerate() {
                let raw = value.trim();
                let normalized = match p.answer_kind {
                    AnswerKind::A => raw.parse::<Ipv4Addr>().ok().map(|v| v.to_string()),
                    AnswerKind::AAAA => raw.parse::<Ipv6Addr>().ok().map(|v| v.to_string()),
                    AnswerKind::CNAME => dns_name(raw)
                        .then(|| format!("{}.", raw.trim_end_matches('.').to_ascii_lowercase())),
                };
                *value = normalized.ok_or_else(|| {
                    ValidationError::new(
                        format!("{field}.values[{k}]"),
                        "Invalid address or CNAME target",
                    )
                })?;
            }
        }
    }
    for (i, a) in profiles.iter().enumerate().filter(|(_, p)| p.enabled) {
        for b in profiles.iter().skip(i + 1).filter(|p| p.enabled) {
            if a.answer_kind == b.answer_kind && a.hostname == b.hostname
                || (a.answer_kind == AnswerKind::CNAME || b.answer_kind == AnswerKind::CNAME)
                    && overlaps(&a.hostname, &b.hostname)
            {
                return Err(ValidationError::new(
                    "profiles",
                    "Enabled profiles have conflicting hostname owners",
                ));
            }
        }
    }
    Ok(profiles)
}
pub fn match_profile<'a>(
    profiles: &'a [Profile],
    relative_name: &str,
    query_type: &str,
) -> Option<ProfileMatch<'a>> {
    let name = relative_name.to_ascii_lowercase();
    if name.split('.').any(|s| s == "_acme-challenge")
        || !["A", "AAAA", "CNAME"].contains(&query_type)
    {
        return None;
    }
    let matches =
        |p: &&Profile| p.enabled && (p.hostname == name || (p.hostname == "*" && name != "@"));
    let direct = |p: &&Profile| {
        p.answer_kind == AnswerKind::CNAME
            || matches!(
                (p.answer_kind, query_type),
                (AnswerKind::A, "A") | (AnswerKind::AAAA, "AAAA")
            )
    };
    if let Some(p) = profiles
        .iter()
        .filter(matches)
        .filter(direct)
        .min_by_key(|p| p.hostname == "*")
    {
        return Some(ProfileMatch {
            profile: p,
            suppressed: false,
        });
    }
    if ["A", "AAAA"].contains(&query_type) {
        if let Some(p) = profiles
            .iter()
            .filter(matches)
            .filter(|p| {
                p.unmatched_family == UnmatchedFamily::Nodata && p.answer_kind != AnswerKind::CNAME
            })
            .min_by_key(|p| p.hostname == "*")
        {
            return Some(ProfileMatch {
                profile: p,
                suppressed: true,
            });
        }
    }
    None
}
