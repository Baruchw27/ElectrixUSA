// Offline support: the app opens even with no signal; data waits on the phone and syncs later.
const C='electrix-v33';
const SHELL=['./','index.html','sync.js','extras.js','config.js','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png','logo-light.svg','logo-dark.svg','scanner-v2.js','scanner-v2-ui.js','catalog-real.json','sched-v21.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C&&!k.startsWith('electrix-staging')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
  // photos, receipts, voice notes, videos are private: open them with the signed-in person's pass
  if(u.pathname.includes('/storage/v1/object/public/files/')){e.respondWith(privateFile(e,u));return;}
  if(/supabase\.co$/.test(u.hostname)||u.pathname.includes('/realtime')||u.pathname.includes('/rest/')||u.pathname.includes('/auth/'))return; // live data never cached
  const sameOrigin=u.origin===location.origin;const isLib=/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|unpkg\.com|tile\.openstreetmap|arcgisonline/.test(u.hostname);
  if(!sameOrigin&&!isLib)return;
  // libraries with a version in the address never change: saved copy first (instant, works with no signal)
  if(isLib&&/@\d/.test(u.pathname)){e.respondWith(caches.match(e.request).then(hit=>hit||netSave(e.request,fetch(e.request))));return;}
  // app files: newest from the network, but never wait more than a few seconds — then use the saved copy
  const net=sameOrigin?fetch(e.request.url,{cache:'no-cache',credentials:'same-origin'}):fetch(e.request);
  e.respondWith(raceSaved(e.request,netSave(e.request,net),e.request.mode==='navigate'?3500:5000));});
function netSave(req,p){return p.then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(req,cp)).catch(()=>{});}return r;});}
function saved(req){return caches.match(req,{ignoreSearch:true}).then(r=>r||(req.mode==='navigate'?caches.match('index.html'):null));}
function raceSaved(req,net,ms){return new Promise(res=>{let done=false;const fin=r=>{if(!done&&r){done=true;res(r);}};
  net.then(fin).catch(()=>saved(req).then(r=>{if(!done){done=true;res(r||Response.error());}}));
  setTimeout(()=>{if(done)return;saved(req).then(r=>{if(r)fin(r);});},ms);});}
// tapping a notification opens the app on that message's job / screen
self.addEventListener('notificationclick',e=>{e.notification.close();const id=(e.notification.data||{}).id||'';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{const c=cs[0];
    if(c){return c.focus().then(w=>{try{(w||c).postMessage({type:'ex-open',id});}catch(x){}});}
    return self.clients.openWindow('./'+(id?'?n='+encodeURIComponent(id):''));}));});
self.addEventListener('push',e=>{let d={};try{d=e.data.json();}catch(x){d={title:'Electrix',body:e.data?e.data.text():''};}
  e.waitUntil(self.registration.showNotification(d.title||'Electrix',{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png',tag:d.id||undefined,data:{id:d.id||''}}));});

// ---- private files: the app hands its sign-in pass to this helper; files open only for signed-in team members
let PASS=null;
self.addEventListener('message',e=>{const d=e.data||{};if(d.type==='ex-pass'){PASS=d.token?{token:d.token,anon:d.anon||''}:null;}});
async function askPass(clientId){let c=clientId?await self.clients.get(clientId):null;if(!c){const all=await self.clients.matchAll({type:'window'});c=all[0];}if(!c)return null;
  return await new Promise(res=>{const ch=new MessageChannel();const t=setTimeout(()=>res(null),3000);ch.port1.onmessage=ev=>{clearTimeout(t);res(ev.data&&ev.data.token?ev.data:null);};try{c.postMessage({type:'ex-pass?'},[ch.port2]);}catch(x){clearTimeout(t);res(null);}});}
async function privateFile(e,u){const priv=u.href.replace('/storage/v1/object/public/','/storage/v1/object/authenticated/');
  const go=async p=>{const h=new Headers();const rg=e.request.headers.get('range');if(rg)h.set('range',rg);h.set('Authorization','Bearer '+p.token);if(p.anon)h.set('apikey',p.anon);return fetch(priv,{headers:h,mode:'cors',credentials:'omit'});};
  try{let p=PASS||await askPass(e.clientId);if(p){PASS=p;let r=await go(p);if(r.status===400||r.status===401||r.status===403){const p2=await askPass(e.clientId);if(p2&&p2.token!==p.token){PASS=p2;r=await go(p2);}}if(r.ok||r.status===206)return r;}}catch(x){}
  return fetch(e.request); // older link style / not signed in
}
