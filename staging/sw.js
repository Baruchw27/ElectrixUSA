// Offline support: the app opens even with no signal; data waits on the phone and syncs later.
const C='electrix-staging-v56'; // STAGING: own cache name
const SHELL=['./','index.html','sync.js','extras.js','config.js','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png','logo-light.svg','logo-dark.svg','scanner-v2.js','scanner-v2-ui.js','catalog-real.json','sched-v21.js','p2.js','p4.js','p5.js','p6.js','p7.js','p8.js','p9.js','p10.js','p11.js','mat-es.js'];
// H49: the scanner's barcode reader (ZXing) and label reader (Tesseract: script, worker, engine, English data) are saved
// when the app is installed/updated while online — so a phone that never scanned before still scans with no signal.
// Best effort: a file that can't be fetched never blocks the app update (it is saved the first time it is used instead).
const LIBS=['https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js','https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.1/dist/worker.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.1/tesseract-core-simd-lstm.wasm.js','https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.1/tesseract-core-lstm.wasm.js',
  'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz'];
function saveLibs(){return caches.open(C).then(c=>Promise.allSettled(LIBS.map(u=>c.match(u).then(hit=>hit||fetch(u,{mode:'cors',credentials:'omit'}).then(r=>{if(r.ok)return c.put(u,r);}))))).catch(()=>{});}
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)).then(()=>Promise.race([saveLibs(),new Promise(r=>setTimeout(r,45000))])).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C&&k.startsWith('electrix-staging')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
  // photos, receipts, voice notes, videos are private: open them with the signed-in person's pass
  if(u.pathname.includes('/storage/v1/object/public/files/')){e.respondWith(privateFile(e,u));return;}
  if(/supabase\.co$/.test(u.hostname)||u.pathname.includes('/realtime')||u.pathname.includes('/rest/')||u.pathname.includes('/auth/'))return; // live data never cached
  const sameOrigin=u.origin===location.origin;const isLib=/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|unpkg\.com|tile\.openstreetmap|arcgisonline|tessdata\.projectnaptha\.com/.test(u.hostname);
  if(!sameOrigin&&!isLib)return;
  // libraries with a version in the address never change: saved copy first (instant, works with no signal)
  if(isLib&&(/@v?\d/.test(u.pathname)||/tessdata\.projectnaptha/.test(u.hostname))){e.respondWith(caches.match(e.request).then(hit=>hit||netSave(e.request,fetch(e.request))));return;}
  // app files: newest from the network, but never wait more than a few seconds — then use the saved copy
  const net=sameOrigin?fetch(e.request.url,{cache:'no-cache',credentials:'same-origin'}):fetch(e.request);
  e.respondWith(raceSaved(e.request,netSave(e.request,net),e.request.mode==='navigate'?3500:5000));});
function netSave(req,p){return p.then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(req,cp)).catch(()=>{});}return r;});}
function saved(req){return caches.match(req,{ignoreSearch:true}).then(r=>r||(req.mode==='navigate'?caches.match('index.html'):null));}
function raceSaved(req,net,ms){return new Promise(res=>{let done=false;const fin=r=>{if(!done&&r){done=true;res(r);}};
  net.then(fin).catch(()=>saved(req).then(r=>{if(!done){done=true;res(r||Response.error());}}));
  setTimeout(()=>{if(done)return;saved(req).then(r=>{if(r)fin(r);});},ms);});}
// tapping a notification opens the app on that message's job / screen
self.addEventListener('notificationclick',e=>{e.notification.close();const id=(e.notification.data||{}).id||'';const act=e.action||'';   // P2: "done" / "reply" buttons (Android)
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{const c=cs[0];
    if(c){return c.focus().then(w=>{try{(w||c).postMessage(act?{type:'ex-act',id,act}:{type:'ex-open',id});}catch(x){}});}
    return self.clients.openWindow('./'+(id?'?n='+encodeURIComponent(id)+(act?'&act='+encodeURIComponent(act):''):''));}));});
self.addEventListener('push',e=>{let d={};try{d=e.data.json();}catch(x){d={title:'Electrix',body:e.data?e.data.text():''};}
  const o={body:d.body||'',icon:'icon-192.png',badge:'icon-192.png',tag:d.id||undefined,data:{id:d.id||''}};
  if(d.job)o.actions=[{action:'done',title:d.lang==='es'?'✓ Hecho':'✓ Mark done'},{action:'reply',title:d.lang==='es'?'Responder':'Reply'}];   // P2: task alerts get buttons (Android)
  const jobs=[self.registration.showNotification(d.title||'Electrix',o)];
  if(typeof d.badge==='number'&&self.navigator&&self.navigator.setAppBadge)jobs.push(self.navigator.setAppBadge(d.badge).catch(()=>{}));   // P2: unread count on the app icon
  e.waitUntil(Promise.all(jobs));});

// ---- private files: the app hands its sign-in pass to this helper; files open only for signed-in team members
let PASS=null;
self.addEventListener('message',e=>{const d=e.data||{};if(d.type==='ex-pass'){PASS=d.token?{token:d.token,anon:d.anon||''}:null;}if(d.type==='ex-warm-libs'){try{e.waitUntil(saveLibs());}catch(x){saveLibs();}}});
async function askPass(clientId){let c=clientId?await self.clients.get(clientId):null;if(!c){const all=await self.clients.matchAll({type:'window'});c=all[0];}if(!c)return null;
  return await new Promise(res=>{const ch=new MessageChannel();const t=setTimeout(()=>res(null),3000);ch.port1.onmessage=ev=>{clearTimeout(t);res(ev.data&&ev.data.token?ev.data:null);};try{c.postMessage({type:'ex-pass?'},[ch.port2]);}catch(x){clearTimeout(t);res(null);}});}
async function privateFile(e,u){const priv=u.href.replace('/storage/v1/object/public/','/storage/v1/object/authenticated/');
  const go=async p=>{const h=new Headers();const rg=e.request.headers.get('range');if(rg)h.set('range',rg);h.set('Authorization','Bearer '+p.token);if(p.anon)h.set('apikey',p.anon);return fetch(priv,{headers:h,mode:'cors',credentials:'omit'});};
  try{let p=PASS||await askPass(e.clientId);if(p){PASS=p;let r=await go(p);if(r.status===400||r.status===401||r.status===403){const p2=await askPass(e.clientId);if(p2&&p2.token!==p.token){PASS=p2;r=await go(p2);}}if(r.ok||r.status===206)return r;}}catch(x){}
  return fetch(e.request); // older link style / not signed in
}
