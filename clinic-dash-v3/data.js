window.HMS_DATA = {
  updated: '2026-09-16',
  clinics: [
    {name:'Chula Vista',city:'Chula Vista, CA',category:'Operations',stage:'Operating / Growth',lead:'Rudy',indicator:'green',summary:'Established clinic with stable treatment volume and mature operations.',next:'Maintain referral flow and monitor collections.',actions:2,risks:0,ready:100,lat:32.6376,lng:-117.0618,positionNote:'Approximate map position'},
    {name:'Madras',city:'Madras, OR',category:'Operations',stage:'Operating / Growth',lead:'Rudy',indicator:'green',summary:'Operating clinic with consistent daily patient activity.',next:'Build treatment volume toward mature capacity.',actions:1,risks:1,ready:100,lat:44.6335,lng:-121.1295,positionNote:'Approximate map position'},
    {name:'Salinas',city:'Salinas, CA',category:'Operations',stage:'Operating / Growth',lead:'Rudy',indicator:'yellow',summary:'Operating site with margin improvement and staffing priorities.',next:'Improve contribution margin and referral consistency.',actions:3,risks:1,ready:100,lat:36.6777,lng:-121.6555,positionNote:'Approximate map position'},
    {name:'Monterey',city:'Monterey, CA',category:'Operations',stage:'Operating / Growth',lead:'Rudy',indicator:'yellow',summary:'Operating partnership requiring access and credentialing cleanup.',next:'Resolve billing and platform access backlog.',actions:2,risks:2,ready:100,lat:36.6002,lng:-121.8947,positionNote:'Approximate map position'},
    {name:'Oceanside',city:'Oceanside, CA',category:'Buildout',stage:'Startup / Stabilization',lead:'Rudy',indicator:'yellow',summary:'Two-chamber opening sequence with final inspections and staffing underway.',next:'Close inspection, compressor and front-office items.',actions:4,risks:2,ready:76,lat:33.1959,lng:-117.3795,positionNote:'Approximate map position'},
    {name:'Riverside',city:'Riverside, CA',category:'Buildout',stage:'Development',lead:'Todd',indicator:'red',summary:'Buildout requires coordinated facility, equipment and utility decisions.',next:'Lock final build scope and opening critical path.',actions:5,risks:3,ready:43,lat:33.9806,lng:-117.3755,positionNote:'Approximate map position'},
    {name:'Laguna',city:'Laguna Beach, CA',category:'Operations',stage:'Operating / Growth',lead:'Rudy',indicator:'yellow',summary:'Partner clinic transitioning toward a more defined operating model.',next:'Confirm ownership, staffing and capex responsibilities.',actions:3,risks:2,ready:100,lat:33.5427,lng:-117.7854,positionNote:'Approximate map position'}
  ],
  actions: [
    {title:'Complete Oceanside final inspection',clinic:'Oceanside',owner:'Rudy',due:'Next',status:'overdue',priority:'high'},
    {title:'Confirm Riverside equipment scope',clinic:'Riverside',owner:'Todd',due:'Next',status:'blocked',priority:'high'},
    {title:'Resolve Monterey billing access',clinic:'Monterey',owner:'Rudy',due:'Open',status:'in_progress',priority:'medium'},
    {title:'Finalize Laguna operating responsibilities',clinic:'Laguna',owner:'Rudy',due:'Open',status:'open',priority:'medium'},
    {title:'Review Salinas contribution margin',clinic:'Salinas',owner:'Rudy',due:'Open',status:'open',priority:'medium'}
  ],
  risks: [
    {title:'Riverside opening timeline',clinic:'Riverside',detail:'Facility scope and equipment sequence remain unresolved.',severity:'high'},
    {title:'Monterey credentialing backlog',clinic:'Monterey',detail:'Access and credentialing delays may slow collections.',severity:'high'},
    {title:'Oceanside staffing coverage',clinic:'Oceanside',detail:'Front-office hiring must close before full ramp.',severity:'medium'}
  ]
};
