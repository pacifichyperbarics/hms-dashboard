import { getStore } from '@netlify/blobs';

const STORE_NAME='hms-payables';
const STATE_KEY='state-v1';
function nowIso(){return new Date().toISOString();}
function clean(v,max=1200){return String(v??'').trim().slice(0,max);}
function money(v){const m=String(v??'').match(/-?\$?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/); return m?Math.max(0,Math.round(Number(m[1].replace(/,/g,''))*100)/100):0;}
function monthKey(d=new Date()){return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
function resp(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
async function getPayload(req){
  const ct=req.headers.get('content-type')||'';
  if(ct.includes('application/json')) return await req.json().catch(()=>({}));
  if(ct.includes('application/x-www-form-urlencoded')||ct.includes('multipart/form-data')){
    const f=await req.formData(); const o={}; for(const [k,v] of f.entries()) if(typeof v==='string') o[k]=v; return o;
  }
  const text=await req.text(); return {text};
}
function extractLine(text,label){
  const re=new RegExp(`(?:^|\\n)\\s*${label}\\s*:\\s*([^\\n]+)`,'i');
  const m=String(text||'').match(re); return m?m[1].trim():'';
}
function parseEmail(p){
  const subject=clean(p.subject||p.Subject,500);
  const text=clean(p.text||p['body-plain']||p.body||p.stripped_text||p.html,8000);
  const from=clean(p.from||p.sender||p.From,300);
  const messageId=clean(p.messageId||p.message_id||p['Message-Id']||p['message-id']||p.id,300);
  const subjectCore=subject.replace(/^\s*(?:\[?PAYABLE\]?\s*[:\-]?\s*)/i,'').trim();
  const parts=subjectCore.split('|').map(s=>s.trim()).filter(Boolean);
  const name=clean(extractLine(text,'(?:Vendor|Payee|Name)')||parts[0]||subjectCore||'Email payable',160);
  const amount=money(extractLine(text,'Amount')||parts[1]||text);
  const due=clean(extractLine(text,'Due(?: Date)?')||parts[2],40);
  const clinic=clean(extractLine(text,'(?:Clinic|Location)')||parts[3]||'Unassigned',100);
  const category=clean(extractLine(text,'Category')||'Email Intake',100);
  const description=clean(extractLine(text,'Description')||text.replace(/\s+/g,' ').slice(0,500),700);
  const recurringRaw=(extractLine(text,'Recurring')||'').toLowerCase();
  const recurring=/^(yes|y|true|monthly|recurring)$/i.test(recurringRaw);
  return {name,amount,due,clinic,category,description,recurring,from,subject,messageId};
}

export default async (req)=>{
  try{
    if(req.method!=='POST') return resp({ok:false,error:'POST required'},405);
    const expected=process.env.PAYABLES_EMAIL_TOKEN;
    const supplied=new URL(req.url).searchParams.get('token')||req.headers.get('x-payables-token')||'';
    if(expected && supplied!==expected) return resp({ok:false,error:'Unauthorized'},401);
    if(!expected) return resp({ok:false,error:'Email intake token is not configured'},503);
    const payload=await getPayload(req);
    const parsed=parseEmail(payload);
    const store=getStore(STORE_NAME);
    let state=await store.get(STATE_KEY,{type:'json'});
    if(!state||!Array.isArray(state.items)) return resp({ok:false,error:'Payables state has not been initialized. Open the app once first.'},409);
    state.emailImports=Array.isArray(state.emailImports)?state.emailImports:[];
    if(parsed.messageId && state.emailImports.some(x=>x.messageId===parsed.messageId)) return resp({ok:true,duplicate:true});
    const month=monthKey();
    if(!state.runs[month]) state.runs[month]={month,approvals:{},createdAt:nowIso(),updatedAt:nowIso()};
    const id=`email-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const item={id,name:parsed.name,category:parsed.category,clinic:parsed.clinic,kind:'bill',expectedAmount:parsed.amount,variable:true,lastPaymentDate:null,lastPaymentAmount:null,description:parsed.description,sourceDescription:`Email to hms@healtho2.com${parsed.from?` from ${parsed.from}`:''}: ${parsed.subject||'(no subject)'}`,sourcePeriod:month,active:parsed.recurring,email:true,createdAt:nowIso(),review:!parsed.amount,dueDate:parsed.due||null};
    if(parsed.recurring) state.items.push(item); else { item.active=false; state.runs[month].oneTimeItems=state.runs[month].oneTimeItems||[]; state.runs[month].oneTimeItems.push(item); }
    state.runs[month].approvals[id]={approved:false,amount:parsed.amount,note:'Imported from email; review before approval.',updatedAt:nowIso()};
    state.emailImports.unshift({messageId:parsed.messageId||id,itemId:id,from:parsed.from,subject:parsed.subject,createdAt:nowIso()});
    state.emailImports=state.emailImports.slice(0,200);
    state.updatedAt=nowIso();
    await store.setJSON(STATE_KEY,state);
    return resp({ok:true,item});
  }catch(err){console.error(err);return resp({ok:false,error:'Email intake error'},500);}
};