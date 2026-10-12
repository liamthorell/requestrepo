export type AnswerKind = 'A' | 'AAAA' | 'CNAME';
export type Strategy = 'count' | 'timed' | 'round_robin' | 'random' | 'multiple' | 'manual';
export type Scope = 'hostname' | 'resolver' | 'profile';
export interface Phase { id:string; label:string; values:string[]; ttl:number; query_count:number; duration_ms:number; weight:number }
export interface Profile { id:string; name:string; enabled:boolean; hostname:string; answer_kind:AnswerKind; strategy:Strategy; scope:Scope; final_behavior:'hold'|'repeat'; unmatched_family:'nodata'|'fallback'; negative_ttl:number; rrset_ttl:number; phases:Phase[] }
export interface ProfileStatus { profile_id:string; state_keys:number; queries:number; last_phase_ids:string[]; manual_phase_id:string|null }
export interface CapacityStatus { session_used:number; session_limit:number; process_used:number; process_limit:number }
export interface Snapshot { generation:number; profiles:Profile[]; status:ProfileStatus[]; capacity:CapacityStatus }
export interface UpdateRequest { expected_generation:number; profiles:Profile[] }
export interface PhaseRequest { expected_generation:number; phase_id:string }
export interface Selection { answer_kind:AnswerKind; values:string[]; ttl:number; phase_ids:string[]; status:'answer'|'suppressed'|'capacity' }
export interface PreviewRequest { profile:Profile; query_type:string; query_index:number; elapsed_ms:number; random_slot?:number; manual_phase_id?:string }
export interface PreviewResponse { selection:Selection; probabilities:{phase_id:string; probability:number}[] }
export interface RebindingMetadata { profile_id:string; profile_name:string; generation:number; phase_ids:string[]; strategy:Strategy; scope:Scope; query_index:number|null; status:Selection['status']; committed:boolean }
export interface FieldError { field:string; message:string }
export type Preset = Strategy;
