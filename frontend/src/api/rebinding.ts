import axios from 'axios';
import type {Snapshot,UpdateRequest,PhaseRequest,PreviewRequest,PreviewResponse} from '@/types/rebinding';
const api=axios.create({baseURL:'/api/v2/dns/rebinding',timeout:10000,withCredentials:true});
const auth=(token:string)=>({headers:{Authorization:`Bearer ${token}`}});
export async function getRebinding(token:string):Promise<Snapshot>{return(await api.get('',auth(token))).data;}
export async function updateRebinding(token:string,request:UpdateRequest):Promise<Snapshot>{return(await api.put('',request,auth(token))).data;}
export async function resetRebinding(token:string,profileId:string,generation:number):Promise<Snapshot>{return(await api.post(`/${encodeURIComponent(profileId)}/reset`,{expected_generation:generation},auth(token))).data;}
export async function selectRebindingPhase(token:string,profileId:string,request:PhaseRequest):Promise<Snapshot>{return(await api.post(`/${encodeURIComponent(profileId)}/phase`,request,auth(token))).data;}
export async function previewRebinding(token:string,request:PreviewRequest,signal?:AbortSignal):Promise<PreviewResponse>{return(await api.post('/preview',request,{...auth(token),signal})).data;}
