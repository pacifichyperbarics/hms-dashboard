import { getStore } from '@netlify/blobs';

const STORE_NAME = 'hms-payables';
const STATE_KEY = 'state-v1';

const seedItems = [
  {id:'adp-client-trust',name:'ADP Client Trust - payroll funding',category:'Payroll & Benefits',clinic:'All Clinics / Corporate',kind:'bill',expectedAmount:36120.48,variable:true,lastPaymentDate:'2026-07-22',lastPaymentAmount:17475.34,description:'Payroll funding; July included two ADP Client Trust wires totaling $36,120.48.',sourceDescription:'WF0811: WT 260722-146054 JPMORGAN CHASE BANK /BNF=ADP Client Trust ...',sourcePeriod:'July 2026',active:true},
  {id:'adp-totalsource',name:'ADP TotalSource - payroll/HR services',category:'Payroll & Benefits',clinic:'All Clinics / Corporate',kind:'bill',expectedAmount:3303.92,variable:true,lastPaymentDate:'2026-07-10',lastPaymentAmount:3303.92,description:'Recurring payroll/HR services debit.',sourceDescription:'WF0811: BUSINESS TO BUSINESS ACH ADP TOTALSOURCE ... PACIFIC HYPERBARICS',sourcePeriod:'July 2026',active:true},
  {id:'adp-401k',name:'ADP 401(k)',category:'Payroll & Benefits',clinic:'All Clinics / Corporate',kind:'bill',expectedAmount:3109.94,variable:true,lastPaymentDate:'2026-07-29',lastPaymentAmount:997.52,description:'Retirement funding; July had three debits totaling $3,109.94.',sourceDescription:'WF0811: BUSINESS TO BUSINESS ACH ADP 401k ... ADP TOTALSOURCE',sourcePeriod:'July 2026',active:true},
  {id:'payroll-fees',name:'Payroll processing fees - ADP / Paychex',category:'Payroll & Benefits',clinic:'All Clinics / Corporate',kind:'bill',expectedAmount:99.95,variable:true,lastPaymentDate:'2026-07-31',lastPaymentAmount:84.95,description:'Small recurring payroll-processing fees; July also included a $15 Paychex HRS debit.',sourceDescription:'WF0811: BUSINESS TO BUSINESS ACH ADP PAYROLL FEES ...',sourcePeriod:'July 2026',active:true},
  {id:'tms-billings',name:'TMS Billings',category:'Billing Services',clinic:'Corporate / HMS',kind:'bill',expectedAmount:7551.97,variable:true,lastPaymentDate:'2026-07-17',lastPaymentAmount:1915.14,description:'Billing-company payment; July had two wires totaling $7,551.97.',sourceDescription:'WF0811: WT 260717-024116 JPMORGAN CHASE BANK /BNF=TMS Billings Inc ...',sourcePeriod:'July 2026',active:true},
  {id:'tenant-planet',name:'Tenant Planet / AppFolio - Chula rent',category:'Rent & Occupancy',clinic:'Chula Vista',kind:'bill',expectedAmount:3270.49,variable:false,lastPaymentDate:'2026-07-03',lastPaymentAmount:3268.00,description:'Pacific Hyperbarics rent plus small AppFolio fee.',sourceDescription:'WF0811: Tenant Planet $3,268.00 + AppFolio $2.49 on 2026-07-03.',sourcePeriod:'July 2026',active:true},
  {id:'madras-rent',name:'Madras rent',category:'Rent & Occupancy',clinic:'Madras',kind:'bill',expectedAmount:5000.00,variable:false,lastPaymentDate:null,lastPaymentAmount:null,description:'Planned recurring Madras rent.',sourceDescription:'August planning P&L standing line item.',sourcePeriod:'August 2026 plan',active:true},
  {id:'madras-equipment',name:'Madras equipment payment',category:'CAPEX / Equipment',clinic:'Madras',kind:'bill',expectedAmount:5000.00,variable:false,lastPaymentDate:null,lastPaymentAmount:null,description:'Planned equipment payment; confirm whether recurring monthly before permanent autopay.',sourceDescription:'August planning P&L standing line item.',sourcePeriod:'August 2026 plan',active:true,review:true},
  {id:'matheson',name:'Matheson / NSM Matheson - oxygen & medical gas',category:'Medical Gas',clinic:'All Clinics',kind:'bill',expectedAmount:3621.47,variable:true,lastPaymentDate:'2026-07-06',lastPaymentAmount:3621.47,description:'Clinical oxygen/medical-gas expense; invoice-supported.',sourceDescription:'WF0811: NSM MATHESON IGG 972-560-5611 TX CARD 2743.',sourcePeriod:'July 2026',active:true},
  {id:'salinas-cleaning',name:'Salinas cleaning - Angela',category:'Cleaning & Laundry',clinic:'Salinas',kind:'bill',expectedAmount:280.00,variable:true,lastPaymentDate:'2026-07-20',lastPaymentAmount:210.00,description:'Weekly cleaning; July source shows $210 for three weeks plus a separate $70 payment.',sourceDescription:'WF0811: ZELLE TO ANGELA ... SALINAS CLEAN X 3 WEEKS.',sourcePeriod:'July 2026',active:true},
  {id:'chula-laundry',name:'Chula cleaning / laundry',category:'Cleaning & Laundry',clinic:'Chula Vista',kind:'bill',expectedAmount:196.00,variable:true,lastPaymentDate:'2026-07-22',lastPaymentAmount:196.00,description:'Recurring clinic cleaning/laundry.',sourceDescription:'WF0811: VENMO PAYMENT ... HEALTH HYPERBARICS; notes: Chula Vista laundry.',sourcePeriod:'July 2026',active:true},
  {id:'laguna-laundry',name:'Laguna cleaning / laundry',category:'Cleaning & Laundry',clinic:'Laguna',kind:'bill',expectedAmount:490.00,variable:true,lastPaymentDate:'2026-07-20',lastPaymentAmount:290.00,description:'July included $200 and $290 Laguna laundry payments.',sourceDescription:'WF0811: VENMO PAYMENT ... HEALTH HYPERBARICS; notes: Tom Jaca - Laguna laundry.',sourcePeriod:'July 2026',active:true},
  {id:'laguna-marketing',name:'Laguna marketing',category:'Marketing',clinic:'Laguna',kind:'bill',expectedAmount:1250.00,variable:false,lastPaymentDate:null,lastPaymentAmount:null,description:'Planned monthly Laguna marketing.',sourceDescription:'August planning P&L.',sourcePeriod:'August 2026 plan',active:true},
  {id:'monterey-marketing',name:'Monterey marketing',category:'Marketing',clinic:'Monterey',kind:'bill',expectedAmount:1500.00,variable:false,lastPaymentDate:null,lastPaymentAmount:null,description:'Planned monthly Monterey marketing.',sourceDescription:'August planning P&L.',sourcePeriod:'August 2026 plan',active:true},
  {id:'google-ads',name:'Google Ads',category:'Marketing',clinic:'Corporate / HMS',kind:'bill',expectedAmount:13.71,variable:true,lastPaymentDate:'2026-07-02',lastPaymentAmount:13.71,description:'Recurring Google Ads debit; approve within budget.',sourceDescription:'WF0811: RECURRING PAYMENT GOOGLE *ADS3554642.',sourcePeriod:'July 2026',active:true},
  {id:'hanover',name:'Hanover Insurance',category:'Insurance',clinic:'Corporate / HMS',kind:'bill',expectedAmount:151.42,variable:false,lastPaymentDate:'2026-07-06',lastPaymentAmount:151.42,description:'Recurring insurance premium.',sourceDescription:'WF0811: BUSINESS TO BUSINESS ACH HANOVER INS ... INS PMNT.',sourcePeriod:'July 2026',active:true},
  {id:'next-gl',name:'Next Insurance - general liability',category:'Insurance',clinic:'Corporate / HMS',kind:'bill',expectedAmount:33.25,variable:false,lastPaymentDate:null,lastPaymentAmount:33.25,description:'Separate recurring Next Insurance policy.',sourceDescription:'July insurance detail; exact transaction date not captured in current source extract.',sourcePeriod:'July 2026',active:true},
  {id:'next-prof',name:'Next Insurance - professional liability',category:'Insurance',clinic:'Corporate / HMS',kind:'bill',expectedAmount:28.75,variable:false,lastPaymentDate:null,lastPaymentAmount:28.75,description:'Separate recurring Next Insurance policy.',sourceDescription:'July insurance detail; exact transaction date not captured in current source extract.',sourcePeriod:'July 2026',active:true},
  {id:'next-property',name:'Next Insurance - property',category:'Insurance',clinic:'Corporate / HMS',kind:'bill',expectedAmount:16.67,variable:false,lastPaymentDate:null,lastPaymentAmount:16.67,description:'Separate recurring Next Insurance policy.',sourceDescription:'July insurance detail; exact transaction date not captured in current source extract.',sourcePeriod:'July 2026',active:true},
  {id:'pia-pc',name:'PIA-PC insurance',category:'Insurance',clinic:'Corporate / HMS',kind:'bill',expectedAmount:41.67,variable:false,lastPaymentDate:'2026-07-10',lastPaymentAmount:41.67,description:'Recurring insurance premium.',sourceDescription:'WF0811: BUSINESS TO BUSINESS ACH PIA-PC PC-PREMIUM ...',sourcePeriod:'July 2026',active:true},
  {id:'ringcentral',name:'RingCentral',category:'Telecom & Internet',clinic:'Corporate / HMS',kind:'bill',expectedAmount:205.00,variable:false,lastPaymentDate:'2026-07-13',lastPaymentAmount:205.00,description:'Recurring telephone service.',sourceDescription:'WF0811: RECURRING PAYMENT RINGCENTRAL INC. 888-898-4591.',sourcePeriod:'July 2026',active:true},
  {id:'starlink',name:'Starlink',category:'Telecom & Internet',clinic:'Corporate / HMS',kind:'bill',expectedAmount:105.00,variable:false,lastPaymentDate:'2026-07-13',lastPaymentAmount:105.00,description:'Recurring internet service.',sourceDescription:'WF0811: RECURRING PAYMENT STARLINK INTERNET.',sourcePeriod:'July 2026',active:true},
  {id:'efax',name:'CCSI eFax',category:'Telecom & Internet',clinic:'Corporate / HMS',kind:'bill',expectedAmount:48.17,variable:false,lastPaymentDate:'2026-07-14',lastPaymentAmount:48.17,description:'Recurring fax service.',sourceDescription:'WF0811: RECURRING PAYMENT CCSI EFAX CORPORAT 323-817-1155.',sourcePeriod:'July 2026',active:true},
  {id:'comcast',name:'Comcast / Xfinity',category:'Telecom & Internet',clinic:'Corporate / HMS',kind:'bill',expectedAmount:382.18,variable:false,lastPaymentDate:'2026-07-28',lastPaymentAmount:382.18,description:'Recurring cable/internet service; location/account should be confirmed.',sourceDescription:'WF0811: COMCAST-XFINITY CABLE SVCS 260727 2520282.',sourcePeriod:'July 2026',active:true},
  {id:'wyerd',name:'Wyerd Fiber',category:'Telecom & Internet',clinic:'Location review',kind:'bill',expectedAmount:0,variable:true,lastPaymentDate:null,lastPaymentAmount:null,description:'Appeared in May recurring telecom; verify whether still active or replaced.',sourceDescription:'May 2026 expense bucket listed Wyerd Fiber among recurring telecom.',sourcePeriod:'May 2026',active:true,review:true},
  {id:'google-workspace',name:'Google Workspace',category:'Software & Subscriptions',clinic:'Corporate / HMS',kind:'bill',expectedAmount:194.40,variable:false,lastPaymentDate:'2026-07-02',lastPaymentAmount:194.40,description:'Two Workspace charges in July: $36.00 and $158.40.',sourceDescription:'WF0811: Google Workspace recurring payments on 2026-07-02.',sourcePeriod:'July 2026',active:true},
  {id:'digits',name:'Digits Financial',category:'Software & Subscriptions',clinic:'Corporate / HMS',kind:'bill',expectedAmount:100.00,variable:false,lastPaymentDate:'2026-07-27',lastPaymentAmount:100.00,description:'Recurring accounting/financial software.',sourceDescription:'WF0811: RECURRING PAYMENT DIGITS FINANCIAL, DIGITS.COM.',sourcePeriod:'July 2026',active:true},
  {id:'openai',name:'OpenAI / ChatGPT subscription',category:'Software & Subscriptions',clinic:'Corporate / HMS',kind:'bill',expectedAmount:20.00,variable:false,lastPaymentDate:'2026-07-27',lastPaymentAmount:20.00,description:'Recurring ChatGPT subscription. May showed more than one account; confirm active count.',sourceDescription:'WF0811: RECURRING PAYMENT OPENAI *CHATGPT SU OPENAI.COM.',sourcePeriod:'July 2026',active:true,review:true},
  {id:'woundreference',name:'WoundReference',category:'Software & Subscriptions',clinic:'Corporate / HMS',kind:'bill',expectedAmount:79.98,variable:false,lastPaymentDate:'2026-07-31',lastPaymentAmount:39.99,description:'Two $39.99 subscription charges appear in July; one is labeled Cypress HBOT.',sourceDescription:'WF0811: WoundReference subscription charges 2026-07-01 and 2026-07-31.',sourcePeriod:'July 2026',active:true},
  {id:'composer',name:'Composer',category:'Software & Subscriptions',clinic:'Corporate / HMS',kind:'bill',expectedAmount:40.00,variable:false,lastPaymentDate:'2026-07-06',lastPaymentAmount:40.00,description:'Recurring software subscription.',sourceDescription:'WF0811: COMPOSER PURCHASE ... MICHAEL GREENHALGH.',sourcePeriod:'July 2026',active:true},
  {id:'rocket-money',name:'Rocket Money',category:'Software & Subscriptions',clinic:'Corporate / HMS',kind:'bill',expectedAmount:6.00,variable:false,lastPaymentDate:'2026-07-23',lastPaymentAmount:6.00,description:'Recurring premium; review whether HMS still needs this subscription.',sourceDescription:'WF0811: BUSINESS TO BUSINESS ACH Rocket Money Premium.',sourcePeriod:'July 2026',active:true,review:true},
  {id:'godaddy',name:'GoDaddy',category:'Software & Subscriptions',clinic:'Corporate / HMS',kind:'bill',expectedAmount:15.40,variable:true,lastPaymentDate:'2026-07-03',lastPaymentAmount:12.19,description:'Domain/hosting charges are periodic and may vary.',sourceDescription:'WF0811: PayPal - GODADDY.COM; July charges $3.21 and $12.19.',sourcePeriod:'July 2026',active:true},
  {id:'office-ally',name:'Office Ally',category:'Software & Subscriptions',clinic:'Corporate / HMS',kind:'bill',expectedAmount:64.95,variable:true,lastPaymentDate:'2026-07-09',lastPaymentAmount:64.95,description:'Practice-management/clearinghouse subscription; May amount differed.',sourceDescription:'WF0811: VSP*OFFICE ALLY 360-975-7000 WA.',sourcePeriod:'July 2026',active:true},
  {id:'sdge',name:'SD Gas & Electric',category:'Utilities',clinic:'Chula Vista / review',kind:'bill',expectedAmount:692.00,variable:true,lastPaymentDate:null,lastPaymentAmount:692.00,description:'May source shows three utility charges totaling approximately $692; exact latest July detail unavailable.',sourceDescription:'May 2026 Expense Detail: Utilities category total, SD Gas & Electric (3 charges).',sourcePeriod:'May 2026',active:true,review:true},
  {id:'medical-supplies',name:'Medical / clinic supplies',category:'Medical Supplies',clinic:'All Clinics',kind:'bill',expectedAmount:0,variable:true,lastPaymentDate:null,lastPaymentAmount:null,description:'Invoice/receipt-driven clinical supplies; add actual invoice amount before approving.',sourceDescription:'Recurring category in May and July expense reports; no single fixed vendor amount.',sourcePeriod:'May-July 2026',active:true,review:true},
  {id:'nerdztoo',name:'NerdzToo',category:'CAPEX / IT',clinic:'Oceanside / Corporate',kind:'bill',expectedAmount:0,variable:true,lastPaymentDate:'2026-07-11',lastPaymentAmount:2409.86,description:'Invoice-driven CAPEX/IT; approve individual invoices rather than fixed autopay.',sourceDescription:'Invoice 1920 - 2026-07-11 - $2,409.86 - Capex Equipment (Oceanside 3).',sourcePeriod:'June-July 2026 invoices',active:true,review:true},
  {id:'bonita-expense-reimbursement',name:'Bonita - operating expense reimbursement',category:'Monthly Allocations / Transfers',clinic:'Corporate / HMS',kind:'allocation',expectedAmount:65836.21,variable:true,lastPaymentDate:null,lastPaymentAmount:65836.21,description:'Intercompany reimbursement; keep separate from vendor AP.',sourceDescription:'July P&L allocation: operating expense reimbursement only.',sourcePeriod:'July 2026 P&L',active:true,review:true},
  {id:'bonita-profit-share',name:'Bonita - 50% profit distribution',category:'Monthly Allocations / Transfers',clinic:'Corporate / HMS',kind:'allocation',expectedAmount:84990.48,variable:true,lastPaymentDate:null,lastPaymentAmount:84990.48,description:'Partner profit distribution; keep separate from vendor AP.',sourceDescription:'July P&L allocation after $20,000 reserve.',sourcePeriod:'July 2026 P&L',active:true,review:true},
  {id:'salinas-share',name:'Salinas share',category:'Monthly Allocations / Transfers',clinic:'Salinas',kind:'allocation',expectedAmount:9763.50,variable:true,lastPaymentDate:null,lastPaymentAmount:9763.50,description:'Clinic share retained/handled separately in #6002.',sourceDescription:'Updated July P&L Salinas share.',sourcePeriod:'July 2026 P&L',active:true,review:true},
  {id:'salinas-rent',name:'Salinas rent',category:'Monthly Allocations / Transfers',clinic:'Salinas',kind:'allocation',expectedAmount:2540.00,variable:false,lastPaymentDate:null,lastPaymentAmount:2540.00,description:'Fixed monthly rent/distribution item retained in #6002.',sourceDescription:'July P&L fixed rent allocation.',sourcePeriod:'July 2026 P&L',active:true},
  {id:'chula-rent-allocation',name:'Chula rent allocation',category:'Monthly Allocations / Transfers',clinic:'Chula Vista',kind:'allocation',expectedAmount:3500.00,variable:false,lastPaymentDate:null,lastPaymentAmount:3500.00,description:'Fixed monthly rent/distribution item retained in #6002.',sourceDescription:'July P&L fixed rent allocation.',sourcePeriod:'July 2026 P&L',active:true}
];

function monthKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}
function nowIso(){ return new Date().toISOString(); }
function cleanText(v, max=1000){ return String(v ?? '').trim().slice(0,max); }
function cleanAmount(v){ const n=Number(v); return Number.isFinite(n) ? Math.max(0, Math.round(n*100)/100) : 0; }
function makeState(){ return {version:1,items:seedItems,runs:{},emailImports:[],updatedAt:nowIso()}; }

async function readState(){
  const store=getStore(STORE_NAME);
  const state=await store.get(STATE_KEY,{type:'json'});
  if(state && Array.isArray(state.items)) return state;
  const fresh=makeState();
  await store.setJSON(STATE_KEY,fresh);
  return fresh;
}
async function writeState(state){
  state.updatedAt=nowIso();
  const store=getStore(STORE_NAME);
  await store.setJSON(STATE_KEY,state);
  return state;
}
function ensureRun(state,month){
  if(!state.runs[month]) state.runs[month]={month,approvals:{},createdAt:nowIso(),updatedAt:nowIso()};
  return state.runs[month];
}
function response(body,status=200){ return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}); }

export default async (req) => {
  try{
    const url=new URL(req.url);
    if(req.method==='GET'){
      const state=await readState();
      const month=cleanText(url.searchParams.get('month')||monthKey(),7);
      ensureRun(state,month);
      return response({ok:true,month,state});
    }
    if(req.method!=='POST') return response({ok:false,error:'Method not allowed'},405);
    const body=await req.json().catch(()=>({}));
    const action=cleanText(body.action,40);
    const month=cleanText(body.month||monthKey(),7);
    const state=await readState();
    const run=ensureRun(state,month);

    if(action==='approve'){
      const id=cleanText(body.id,120);
      const item=[...(state.items||[]),...(run.oneTimeItems||[])].find(x=>x.id===id);
      if(!item) return response({ok:false,error:'Item not found'},404);
      run.approvals[id]={approved:Boolean(body.approved),amount:cleanAmount(body.amount ?? item.expectedAmount),note:cleanText(body.note,500),updatedAt:nowIso()};
      run.updatedAt=nowIso();
      await writeState(state);
      return response({ok:true,state});
    }
    if(action==='add'){
      const name=cleanText(body.item?.name,160);
      if(!name) return response({ok:false,error:'Payee/name is required'},400);
      const id=`manual-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const recurring=body.item?.recurring!==false;
      const item={id,name,category:cleanText(body.item?.category||'Manual',100),clinic:cleanText(body.item?.clinic||'Unassigned',100),kind:body.item?.kind==='allocation'?'allocation':'bill',expectedAmount:cleanAmount(body.item?.expectedAmount),variable:Boolean(body.item?.variable),lastPaymentDate:null,lastPaymentAmount:null,description:cleanText(body.item?.description,700),sourceDescription:cleanText(body.item?.sourceDescription||'Added manually in payables app.',700),sourcePeriod:cleanText(body.item?.sourcePeriod||month,80),active:recurring,manual:true,createdAt:nowIso()};
      if(recurring) state.items.push(item); else { item.active=false; run.oneTimeItems=run.oneTimeItems||[]; run.oneTimeItems.push(item); }
      run.approvals[id]={approved:false,amount:item.expectedAmount,note:'',updatedAt:nowIso()};
      await writeState(state);
      return response({ok:true,state,item});
    }
    if(action==='update-item'){
      const id=cleanText(body.id,120);
      const item=state.items.find(x=>x.id===id);
      if(!item) return response({ok:false,error:'Item not found'},404);
      const f=body.fields||{};
      for(const key of ['name','category','clinic','description','sourceDescription','sourcePeriod']) if(key in f) item[key]=cleanText(f[key],key==='description'||key==='sourceDescription'?700:160);
      if('expectedAmount' in f) item.expectedAmount=cleanAmount(f.expectedAmount);
      if('variable' in f) item.variable=Boolean(f.variable);
      if('active' in f) item.active=Boolean(f.active);
      if('kind' in f) item.kind=f.kind==='allocation'?'allocation':'bill';
      item.updatedAt=nowIso();
      await writeState(state);
      return response({ok:true,state,item});
    }
    if(action==='delete-item'){
      const id=cleanText(body.id,120);
      const item=state.items.find(x=>x.id===id);
      if(item){ item.active=false; item.deletedAt=nowIso(); await writeState(state); return response({ok:true,state}); }
      if(run.oneTimeItems){ run.oneTimeItems=run.oneTimeItems.filter(x=>x.id!==id); delete run.approvals[id]; await writeState(state); return response({ok:true,state}); }
      return response({ok:false,error:'Item not found'},404);
    }
    if(action==='reset-month'){
      state.runs[month]={month,approvals:{},createdAt:nowIso(),updatedAt:nowIso()};
      await writeState(state);
      return response({ok:true,state});
    }
    return response({ok:false,error:'Unknown action'},400);
  }catch(err){
    console.error(err);
    return response({ok:false,error:'Payables service error'},500);
  }
};