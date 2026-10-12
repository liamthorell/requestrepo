use super::model::*;
use std::collections::HashSet;
pub fn select(p: &Profile, c: &SelectionContext) -> Result<Selection, ValidationError> {
    if p.phases.is_empty() {
        return Err(ValidationError::new(
            "phases",
            "At least one phase is required",
        ));
    }
    if p.strategy == Strategy::Multiple {
        let mut seen = HashSet::new();
        let values = p
            .phases
            .iter()
            .flat_map(|p| p.values.iter())
            .filter(|v| seen.insert((*v).clone()))
            .cloned()
            .collect();
        return Ok(Selection {
            answer_kind: p.answer_kind,
            values,
            ttl: p.rrset_ttl,
            phase_ids: p.phases.iter().map(|p| p.id.clone()).collect(),
            status: SelectionStatus::Answer,
        });
    }
    let index = match p.strategy {
        Strategy::Manual => match &c.manual_phase_id {
            Some(id) => p
                .phases
                .iter()
                .position(|p| p.id == *id)
                .ok_or_else(|| ValidationError::new("manual_phase_id", "Unknown phase"))?,
            None => 0,
        },
        Strategy::Random => {
            let total = p.phases.iter().map(|p| u64::from(p.weight)).sum::<u64>();
            if total == 0 || c.random_slot >= total {
                return Err(ValidationError::new(
                    "random_slot",
                    "Random slot is outside the total weight",
                ));
            }
            let mut slot = c.random_slot;
            p.phases
                .iter()
                .position(|p| {
                    if slot < u64::from(p.weight) {
                        true
                    } else {
                        slot -= u64::from(p.weight);
                        false
                    }
                })
                .unwrap()
        }
        strategy => {
            let durations = p
                .phases
                .iter()
                .map(|p| {
                    if strategy == Strategy::Timed {
                        p.duration_ms
                    } else {
                        u64::from(p.query_count)
                    }
                })
                .collect::<Vec<_>>();
            let total = durations
                .iter()
                .try_fold(0u64, |sum, n| sum.checked_add(*n))
                .filter(|n| *n > 0)
                .ok_or_else(|| ValidationError::new("phases", "Invalid phase duration sum"))?;
            let mut position = if strategy == Strategy::Timed {
                c.elapsed_ms
            } else {
                c.query_index
            };
            if strategy == Strategy::RoundRobin || p.final_behavior == FinalBehavior::Repeat {
                position %= total;
            }
            let mut found = p.phases.len() - 1;
            for (i, n) in durations.iter().enumerate() {
                if position < *n {
                    found = i;
                    break;
                }
                position = position.saturating_sub(*n);
            }
            found
        }
    };
    let phase = &p.phases[index];
    let mut seen = HashSet::new();
    Ok(Selection {
        answer_kind: p.answer_kind,
        values: phase
            .values
            .iter()
            .filter(|v| seen.insert((*v).clone()))
            .cloned()
            .collect(),
        ttl: phase.ttl,
        phase_ids: vec![phase.id.clone()],
        status: SelectionStatus::Answer,
    })
}
