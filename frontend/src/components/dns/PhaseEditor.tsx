import {ArrowUp,ArrowDown,Trash2} from 'lucide-react';
import type {Phase,Profile} from '@/types/rebinding';
export function PhaseEditor({phase,index,profile,onChange,onMove,onDelete}:{phase:Phase;index:number;profile:Profile;onChange:(p:Phase)=>void;onMove:(d:-1|1)=>void;onDelete:()=>void}){
 const patch=(value:Partial<Phase>)=>onChange({...phase,...value});const total=profile.phases.reduce((n,p)=>n+p.weight,0);
 return <section className="rb-phase" aria-label={`Phase ${index+1}`}>
  <div className="rb-phase-heading"><span className="rb-index">{String(index+1).padStart(2,'0')}</span><label className="rb-grow"><span className="sr-only">Phase {index+1} label</span><input aria-label={`Phase ${index+1} label`} value={phase.label} maxLength={128} onChange={e=>patch({label:e.target.value})}/></label><div className="rb-actions"><button type="button" aria-label={`Move phase ${index+1} up`} disabled={index===0} onClick={()=>onMove(-1)}><ArrowUp size={14}/></button><button type="button" aria-label={`Move phase ${index+1} down`} disabled={index===profile.phases.length-1} onClick={()=>onMove(1)}><ArrowDown size={14}/></button><button type="button" aria-label={`Delete phase ${index+1}`} disabled={profile.phases.length===1} onClick={onDelete}><Trash2 size={14}/></button></div></div>
  <div className="rb-phase-fields"><label className="rb-grow">{profile.answer_kind==='CNAME'?'CNAME target':'Addresses in this answer'}<textarea aria-label={`Phase ${index+1} ${profile.answer_kind==='CNAME'?'target':'addresses'}`} rows={2} spellCheck={false} value={phase.values.join('\n')} onChange={e=>patch({values:e.target.value.split(/[,\n]/).map(v=>v.trim())})}/></label><div className="rb-phase-controls">
  {profile.strategy!=='multiple'&&<label>TTL · seconds<input aria-label={`Phase ${index+1} TTL`} type="number" min={0} max={86400} value={phase.ttl} onChange={e=>patch({ttl:Number(e.target.value)})}/></label>}
  {['count','round_robin'].includes(profile.strategy)&&<label>Queries in phase<input aria-label={`Phase ${index+1} query count`} type="number" min={1} max={1000000} value={phase.query_count} onChange={e=>patch({query_count:Number(e.target.value)})}/></label>}
  {profile.strategy==='timed'&&<label>Duration · milliseconds<input aria-label={`Phase ${index+1} duration`} type="number" min={1} max={86400000} value={phase.duration_ms} onChange={e=>patch({duration_ms:Number(e.target.value)})}/></label>}
  {profile.strategy==='random'&&<label>Weight <span className="rb-muted">{total>0?`${(phase.weight/total*100).toFixed(1)}%`:'No probability'}</span><input aria-label={`Phase ${index+1} weight`} type="number" min={0} max={1000000} value={phase.weight} onChange={e=>patch({weight:Number(e.target.value)})}/></label>}
  </div></div>
 </section>;
}
