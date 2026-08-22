import {call} from './api.js';
export function browserId(){let x=localStorage.getItem('ph-browser-id');if(!x){x='B-'+crypto.randomUUID();localStorage.setItem('ph-browser-id',x)}return x}
export async function identify(){return call('identify',{payload:JSON.stringify({browserId:browserId(),userAgent:navigator.userAgent,platform:navigator.platform||''})})}
export async function loadUsers(){return call('user-list')}
export async function mapUser(browserIdValue,staffName){return call('user-map',{browserId:browserIdValue,staffName})}
