import {call,setKey} from './api.js';
import {identify} from './identity.js';
import {loadPicklists,bindAddable,picklists} from './picklists.js';
import {initFilters,bindForm,load} from './referrals.js';
const $=x=>document.getElementById(x);
async function boot(password){setKey(password);await call('auth');await loadPicklists();initFilters();bindForm();for(const [id,field] of [['patient','patient'],['fowner','owner'],['provider','provider'],['payer','payer'],['dx','dx'],['next','next_action']])await bindAddable($(id),field,()=>{if(field==='owner'){const o=$('owner');o.innerHTML='<option value="">All owners</option>'+(picklists.owner||[]).map(v=>`<option>${v}</option>`).join('')}});const ident=await identify();$('userId').textContent=ident.browserId;$('staffName').textContent=ident.staffName?' · '+ident.staffName:'';$('gate').style.display='none';$('app').hidden=false;await load()}
$('login').onsubmit=async e=>{e.preventDefault();$('msg').textContent='';const p=$('pw').value;try{await boot(p);sessionStorage.setItem('phv4',p)}catch(err){$('msg').textContent=err?.message||'Connection failed.'}};
const saved=sessionStorage.getItem('phv4');if(saved)boot(saved).catch(()=>sessionStorage.removeItem('phv4'));
