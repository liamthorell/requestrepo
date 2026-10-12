import type {AnswerKind,FieldError,Phase,Preset,Profile} from '../types/rebinding';
export const strategies = [
 {value:'count',label:'Switch after N queries',description:'Serve each phase for its query count, then advance.'},
 {value:'timed',label:'Switch after a delay',description:'Advance through timed phases from the first query.'},
 {value:'round_robin',label:'Round robin',description:'Rotate through every phase and repeat.'},
 {value:'random',label:'Weighted random',description:'Select from all phases using their weights.'},
 {value:'multiple',label:'Multiple addresses',description:'Return the complete address list in one DNS answer.'},
 {value:'manual',label:'Manual switching',description:'Choose any phase and keep serving it until you switch.'},
] as const;
export function createPhase(values:string[]=['127.0.0.1'],label='New phase'):Phase {return {id:crypto.randomUUID(),label,values,ttl:0,query_count:1,duration_ms:5000,weight:1};}
export function createProfile(preset:Preset,serverIp:string):Profile {return {id:crypto.randomUUID(),name:'CTF rebinding',enabled:true,hostname:'rebind',answer_kind:'A',strategy:preset,scope:'hostname',final_behavior:'hold',unmatched_family:'nodata',negative_ttl:0,rrset_ttl:0,phases:[createPhase([serverIp],'Public callback'),createPhase(['127.0.0.1'],'Loopback'),createPhase(['10.0.0.1'],'Private address')]};}
function address(value:string,kind:AnswerKind):boolean {
 if(kind==='A'){const parts=value.split('.');return parts.length===4&&parts.every(p=>/^\d{1,3}$/.test(p)&&String(Number(p))===p&&Number(p)<=255);}
 if(kind==='AAAA'){try{return value.includes(':')&&new URL(`http://[${value}]/`).hostname.startsWith('[');}catch{return false;}}
 return validDns(value.replace(/\.$/,''));
}
function validDns(value:string):boolean {return value.length>0&&value.length<=253&&value.split('.').every(v=>v.length>0&&v.length<=63&&/^[a-z\d_-]+$/i.test(v));}
export function parseAddressList(text:string,kind:'A'|'AAAA'):string[] {const values=text.split(/[,\s]+/).filter(Boolean);if(!values.length||values.length>128)throw Error('Enter 1–128 IP addresses');for(const value of values)if(!address(value,kind))throw Error(`Invalid ${kind} address: ${value}`);return values;}
export function applyBulkAddresses(profile:Profile,values:string[],mode:'phases'|'rrset'):Profile {if(!values.length||values.length>128)throw Error('Use 1–128 addresses');return {...profile,phases:mode==='phases'?values.map((v,i)=>createPhase([v],`Phase ${i+1}`)):[createPhase(values,'Address set')]};}
export function movePhase(profile:Profile,phaseId:string,direction:-1|1):Profile {const phases=[...profile.phases];const index=phases.findIndex(p=>p.id===phaseId);const next=index+direction;if(index>=0&&next>=0&&next<phases.length)[phases[index],phases[next]]=[phases[next],phases[index]];return {...profile,phases};}
export function validateDraft(profiles:Profile[]):FieldError[] {
 const errors:FieldError[]=[];const fail=(field:string,message:string)=>errors.push({field,message});const ids=new Set<string>();const validId=(v:unknown)=>typeof v==='string'&&/^[\w-]{1,64}$/.test(v);const number=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
 if(!Array.isArray(profiles)||profiles.length>16)return [{field:'profiles',message:'Use at most 16 profiles'}];
 profiles.forEach((p,i)=>{const path=`profiles[${i}]`;if(!p||typeof p!=='object'){fail(path,'Invalid profile');return;}
 if(!validId(p.id)||ids.has(p.id))fail(`${path}.id`,'Profile IDs must be valid and unique');ids.add(p.id);
 if(typeof p.name!=='string'||p.name.length>128)fail(`${path}.name`,'Use at most 128 characters');
 if(typeof p.hostname!=='string'||!['@','*'].includes(p.hostname)&&!validDns(p.hostname))fail(`${path}.hostname`,'Use @, *, or a relative hostname');
 if(!['A','AAAA','CNAME'].includes(p.answer_kind)||!strategies.some(s=>s.value===p.strategy)||!['hostname','resolver','profile'].includes(p.scope)||!['hold','repeat'].includes(p.final_behavior)||!['nodata','fallback'].includes(p.unmatched_family)||typeof p.enabled!=='boolean')fail(path,'Invalid profile options');
 for(const key of ['negative_ttl','rrset_ttl'] as const)if(!number(p[key],0,86400))fail(`${path}.${key}`,'TTL must be 0–86400 seconds');
 if(!Array.isArray(p.phases)||!p.phases.length||p.phases.length>128){fail(`${path}.phases`,'Use 1–128 phases');return;}
 const phaseIds=new Set<string>();let count=0;let weight=0;
 p.phases.forEach((phase,j)=>{const field=`${path}.phases[${j}]`;if(!phase||typeof phase!=='object'){fail(field,'Invalid phase');return;}
 if(!validId(phase.id)||phaseIds.has(phase.id))fail(`${field}.id`,'Phase IDs must be valid and unique');phaseIds.add(phase.id);
 if(typeof phase.label!=='string'||phase.label.length>128)fail(`${field}.label`,'Use at most 128 characters');
 for(const [key,min,max] of [['ttl',0,86400],['query_count',1,1000000],['duration_ms',1,86400000],['weight',0,1000000]] as const)if(!number(phase[key],min,max))fail(`${field}.${key}`,`Use an integer from ${min} to ${max}`);
 weight+=phase.weight||0;
 if(!Array.isArray(phase.values)||!phase.values.length){fail(`${field}.values`,'Add at least one value');return;}count+=phase.values.length;
 if(p.answer_kind==='CNAME'&&phase.values.length!==1)fail(`${field}.values`,'Use exactly one CNAME target');
 phase.values.forEach((value,k)=>{if(typeof value!=='string'||!address(value.trim(),p.answer_kind))fail(`${field}.values[${k}]`,`Invalid ${p.answer_kind} value`);});
 });
 if(count>128)fail(`${path}.phases`,'Use at most 128 values per profile');if(p.strategy==='random'&&weight===0)fail(`${path}.phases`,'At least one weight must be nonzero');if(p.strategy==='multiple'&&p.answer_kind==='CNAME')fail(`${path}.strategy`,'Multiple-address mode requires A or AAAA');
 });
 profiles.forEach((a,i)=>profiles.slice(i+1).forEach(b=>{if(!a?.enabled||!b?.enabled||typeof a.hostname!=='string'||typeof b.hostname!=='string')return;const x=a.hostname.toLowerCase(),y=b.hostname.toLowerCase();const overlap=x===y||x==='*'&&y!=='@'||y==='*'&&x!=='@';if(a.answer_kind===b.answer_kind&&x===y||overlap&&(a.answer_kind==='CNAME'||b.answer_kind==='CNAME'))fail('profiles','Enabled profiles have conflicting DNS owners');}));
 return errors;
}
function clean(profiles:Profile[]):Profile[] {return profiles.map(p=>({id:p.id,name:p.name,enabled:p.enabled,hostname:p.hostname,answer_kind:p.answer_kind,strategy:p.strategy,scope:p.scope,final_behavior:p.final_behavior,unmatched_family:p.unmatched_family,negative_ttl:p.negative_ttl,rrset_ttl:p.rrset_ttl,phases:p.phases.map(q=>({id:q.id,label:q.label,values:[...q.values],ttl:q.ttl,query_count:q.query_count,duration_ms:q.duration_ms,weight:q.weight}))}));}
export function exportProfiles(profiles:Profile[]):string {const errors=validateDraft(profiles);if(errors.length)throw Error(errors[0].message);return JSON.stringify({version:1,profiles:clean(profiles)},null,2);}
export function importProfiles(text:string):Profile[] {if(text.length>1024*1024)throw Error('Import is limited to 1 MiB');const value:unknown=JSON.parse(text);if(!value||typeof value!=='object'||!('version'in value)||value.version!==1||!('profiles'in value)||!Array.isArray(value.profiles))throw Error('Expected a version 1 rebinding export');const profiles=value.profiles as Profile[];const errors=validateDraft(profiles);if(errors.length)throw Error(`${errors[0].field}: ${errors[0].message}`);return clean(profiles);}
