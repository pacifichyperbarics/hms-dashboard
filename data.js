window.HMS_HOME_DATA = {
  updated: '2026-09-17T08:00:00-07:00',
  demo: true,
  people: [
    {name:'Executive',role:'Managing Director',lane:'Decisions and approvals',open:3,blocked:0,color:'#0f766e'},
    {name:'Operations Lead',role:'Regional operations',lane:'Operations and growth',open:6,blocked:1,color:'#2563eb'},
    {name:'Development Lead',role:'Development',lane:'Buildouts and systems',open:4,blocked:1,color:'#7c3aed'},
    {name:'Marketing Lead',role:'Marketing',lane:'Marketing and referrals',open:3,blocked:0,color:'#c2410c'},
    {name:'Partner',role:'Partner review',lane:'Partner and clinical review',open:2,blocked:0,color:'#475569'}
  ],
  tasks: [
    {title:'Approve new-site equipment scope',clinic:'New Site B',owner:'Executive',collaborator:'Development Lead',due:'Decision needed',status:'needs_michael',priority:'high',source:'Work system'},
    {title:'Approve planning assumptions',clinic:'Network',owner:'Executive',collaborator:'Partner',due:'Weekly review',status:'needs_michael',priority:'high',source:'Finance'},
    {title:'Confirm operating responsibilities',clinic:'Coastal Clinic',owner:'Executive',collaborator:'Operations Lead',due:'Open',status:'needs_michael',priority:'medium',source:'Operations'},
    {title:'Complete final inspection follow-up',clinic:'New Site A',owner:'Operations Lead',collaborator:'Development Lead',due:'Next',status:'in_progress',priority:'high',source:'Work system'},
    {title:'Resolve billing access',clinic:'Central Clinic',owner:'Operations Lead',collaborator:'',due:'Open',status:'blocked',priority:'high',source:'Work system'},
    {title:'Finalize new-site critical path',clinic:'New Site B',owner:'Development Lead',collaborator:'Operations Lead',due:'This week',status:'in_progress',priority:'high',source:'Development'},
    {title:'Refresh referral materials',clinic:'Network',owner:'Marketing Lead',collaborator:'Operations Lead',due:'This week',status:'in_progress',priority:'medium',source:'Marketing'},
    {title:'Review partner reporting view',clinic:'Network',owner:'Partner',collaborator:'Executive',due:'Monday',status:'open',priority:'medium',source:'Finance'}
  ],
  events: [
    {time:'Today',source:'Finance',title:'Partner reporting view registered as the approved working presentation',detail:'The current link is retained while a newer candidate remains under review.',tone:'good'},
    {time:'Today',source:'Work system',title:'Weekly finance review updated',detail:'Planning, expenses, and reporting orientation are grouped in one review.',tone:'good'},
    {time:'This week',source:'Development',title:'HMS Home V4 experiment opened',detail:'V3 remains current while the daily front door is tested.',tone:'info'},
    {time:'Open',source:'Operations',title:'Access issue remains a collection risk',detail:'Billing and credentialing access still requires an owner and resolution date.',tone:'warn'}
  ],
  signals: [
    {title:'A new-site opening may slip',confidence:'High confidence',why:'Equipment scope and build sequence are both unresolved.',action:'Lock scope before approving new commitments.',severity:'high'},
    {title:'Another site is approaching launch readiness',confidence:'Medium confidence',why:'Remaining work is concentrated in inspection, equipment, and staffing items.',action:'Keep one owner and one dated critical path.',severity:'medium'},
    {title:'Multiple financial views may confuse readers',confidence:'High confidence',why:'Working displays, locked actuals, and planning models serve different purposes.',action:'Label each item as Actual, Planning, or Presentation.',severity:'medium'}
  ],
  apps: [
    {name:'HMS Clinic Dashboard v3',purpose:'Current clinic operations dashboard',status:'released',audience:'Executive and operations',owner:'HMS',version:'3',tested:'Current',url:'https://hms-clinic-dashboard-v3-6oj1lo.v2.appdeploy.ai/',label:'Open current'},
    {name:'Partner Reporting View',purpose:'Partner-facing financial presentation',status:'released',audience:'Executive and partners',owner:'Finance',version:'Working',tested:'Current',url:'',label:'Controlled link'},
    {name:'Expansion Funding Planner',purpose:'Clinic build rate and capital planning',status:'released',audience:'Executive and partners',owner:'Finance',version:'1.0',tested:'Current',url:'',label:'Controlled copy'},
    {name:'Expense Mapper',purpose:'Categorize and review operating expenses',status:'pilot',audience:'Executive and finance',owner:'Finance',version:'Pilot',tested:'Pilot',url:'',label:'Controlled pilot'},
    {name:'Referral Portal',purpose:'Receive and route referrals',status:'pilot',audience:'Staff and referral offices',owner:'Marketing',version:'5',tested:'Pilot',url:'',label:'Controlled pilot'},
    {name:'HMS Payables',purpose:'Capture, approve, and track bills',status:'development',audience:'Executive and finance',owner:'Development',version:'Core v1',tested:'In development',url:'',label:'Not released'},
    {name:'HMS Home v4',purpose:'Daily orientation, app catalog, and HMS chat',status:'experiment',audience:'Executive first',owner:'HMS',version:'4 preview',tested:'Experimental',url:'',label:'This preview'}
  ],
  clinics: [
    {name:'North Clinic',city:'California',category:'Operations',stage:'Operating / Growth',lead:'Operations Lead',indicator:'green',summary:'Established clinic with mature operations.',next:'Maintain referral flow and monitor collections.',actions:2,risks:0,ready:100,lat:38.3,lng:-121.5},
    {name:'Central Clinic',city:'California',category:'Operations',stage:'Operating / Growth',lead:'Operations Lead',indicator:'yellow',summary:'Access and credentialing cleanup required.',next:'Resolve billing and platform access.',actions:2,risks:2,ready:100,lat:36.7,lng:-121.6},
    {name:'Coastal Clinic',city:'California',category:'Operations',stage:'Operating / Growth',lead:'Operations Lead',indicator:'yellow',summary:'Operating model and responsibilities need definition.',next:'Confirm staffing and operating responsibilities.',actions:3,risks:2,ready:100,lat:33.6,lng:-117.8},
    {name:'New Site A',city:'California',category:'Buildout',stage:'Startup / Stabilization',lead:'Operations Lead',indicator:'yellow',summary:'Final inspections and staffing are underway.',next:'Close inspection, equipment, and front-office items.',actions:4,risks:2,ready:76,lat:33.2,lng:-117.3},
    {name:'New Site B',city:'California',category:'Buildout',stage:'Development',lead:'Development Lead',indicator:'red',summary:'Facility, equipment, and utility decisions remain.',next:'Lock final build scope and opening critical path.',actions:5,risks:3,ready:43,lat:34.0,lng:-117.4}
  ]
};

