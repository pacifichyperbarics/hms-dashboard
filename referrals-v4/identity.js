import {call} from './api.js';
export function browserId(){let x=localStorage.getItem('ph-browser-id');if(!x){x='B-'+crypto.randomUUID();localStorage.setItem('ph-browser-id',x)}return x}
export async function identify(){const id=browserId();const r=await call('identify',{payload:JSON.stringify({browserId:id,userAgent:navigator.userAgent,platform:navigator.platform||''})});return {browserId:id,staffName:r.staffName||''}}
