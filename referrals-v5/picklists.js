import {call} from './api.js';
export let picklists={};
export async function loadPicklists(){picklists=await call('picklists');return picklists}
export function fillSelect(el,values,{blank='',addable=false,current=''}={}){let list=[...new Set(values||[])];if(current&&!list.includes(current))list.push(current);list.sort((a,b)=>String(a).localeCompare(String(b)));el.innerHTML=(blank!==null?`<option value="">${blank}</option>`:'')+list.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')+(addable?'<option value="__ADD__">+ Add new…</option>':'');el.value=current||''}
export async function bindAddable(el,field,onAdded){el.addEventListener('change',async()=>{if(el.value!=='__ADD__')return;const value=prompt('Add new value:');if(!value){el.value='';return}await call('picklist-add',{field,value});await loadPicklists();fillSelect(el,picklists[field]||[],{addable:true,current:value});onAdded?.(value)})}
function escapeHtml(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
