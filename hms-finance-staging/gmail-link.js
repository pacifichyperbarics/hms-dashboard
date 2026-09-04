(() => {
  function addLink(){
    const nav=document.querySelector('.nav');
    if(!nav||nav.querySelector('[data-gmail-discovery-link]'))return;
    const settings=nav.querySelector('[data-tab="settings"]');
    const link=document.createElement('a');
    link.href='/hms-payables/gmail';
    link.dataset.gmailDiscoveryLink='1';
    link.textContent='Email Discovery';
    link.title='Connect and scan hms@healtho2.com for possible bills';
    if(settings)settings.after(link);else nav.appendChild(link);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addLink,{once:true});else addLink();
})();
