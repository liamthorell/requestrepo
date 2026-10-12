import {useEffect,useRef,useState,useCallback} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {AxiosError} from 'axios';
import * as api from '@/api/rebinding';
import {validateDraft} from '@/lib/rebinding';
import type {Profile,Snapshot,PreviewRequest,PreviewResponse,FieldError} from '@/types/rebinding';
interface Draft {profiles:Profile[];generation:number;dirty:boolean}
const drafts=new Map<string,Draft>();
export function useRebinding(token:string,active:boolean){
 const queryClient=useQueryClient();const key=['rebinding',token];
 const [draftState,setDraftState]=useState<Draft>(()=>drafts.get(token)??{profiles:[],generation:0,dirty:false});
 const [errors,setErrors]=useState<FieldError[]>([]);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [preview,setPreview]=useState<PreviewResponse|null>(null);const [previewBusy,setPreviewBusy]=useState(false);
 const mounted=useRef(true);const previewAbort=useRef<AbortController|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;previewAbort.current?.abort();};},[]);
 const query=useQuery({queryKey:key,queryFn:()=>api.getRebinding(token),enabled:active&&Boolean(token),refetchInterval:active?2000:false,refetchIntervalInBackground:false});
 const draft=draftState.dirty||!query.data?draftState:{profiles:query.data.profiles,generation:query.data.generation,dirty:false};
 function change(profiles:Profile[]){previewAbort.current?.abort();setPreview(null);const next={...draft,profiles,dirty:true};drafts.set(token,next);setDraftState(next);setErrors([]);setMessage('');}
 const apply=useCallback((snapshot:Snapshot)=>{queryClient.setQueryData(['rebinding',token],snapshot);const next={profiles:snapshot.profiles,generation:snapshot.generation,dirty:false};drafts.set(token,next);if(mounted.current){setDraftState(next);setErrors([]);setMessage('Configuration applied. Counters have been reset where the action requires it.');setPreview(null);}},[token,queryClient]);
 function report(error:unknown){if(!mounted.current)return;if(error instanceof AxiosError){const data=error.response?.data as {error?:string;field?:string;code?:string}|undefined;setMessage(data?.code==='generation_conflict'?'Configuration changed elsewhere. Your draft is preserved. Reload applied settings before retrying.':data?.error??'Could not reach the server');if(data?.field)setErrors([{field:data.field,message:data.error??'Invalid configuration'}]);}else{setMessage(error instanceof Error?error.message:'Operation failed');}}
 async function mutate(operation:()=>Promise<Snapshot>){if(busy)return;setBusy(true);setMessage('');try{apply(await operation());}catch(error){report(error);}finally{if(mounted.current)setBusy(false);}}
 function save(){const found=validateDraft(draft.profiles);setErrors(found);if(found.length){setMessage('Fix the marked configuration fields before saving.');return;}void mutate(()=>api.updateRebinding(token,{expected_generation:draft.generation,profiles:draft.profiles}));}
 function reset(id:string){const generation=query.data?.generation;if(generation!==undefined)void mutate(()=>api.resetRebinding(token,id,generation));}
 function selectPhase(id:string,phaseId:string){const generation=query.data?.generation;if(generation!==undefined)void mutate(()=>api.selectRebindingPhase(token,id,{expected_generation:generation,phase_id:phaseId}));}
 async function simulate(request:PreviewRequest){previewAbort.current?.abort();const controller=new AbortController();previewAbort.current=controller;setPreviewBusy(true);setPreview(null);setErrors([]);try{const result=await api.previewRebinding(token,request,controller.signal);if(mounted.current&&!controller.signal.aborted)setPreview(result);}catch(error){if(!controller.signal.aborted)report(error);}finally{if(mounted.current&&!controller.signal.aborted)setPreviewBusy(false);}}
 function reload(){previewAbort.current?.abort();setPreview(null);if(query.data)apply(query.data);void query.refetch();}
 return {profiles:draft.profiles,generation:draft.generation,dirty:draft.dirty,change,save,reset,selectPhase,simulate,reload,errors,message,busy,preview,previewBusy,snapshot:query.data,loading:query.isLoading,loadError:query.error};
}
