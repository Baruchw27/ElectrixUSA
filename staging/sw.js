// Offline support: the app opens even with no signal; data waits on the phone and syncs later.
const C='electrix-staging-v263'; // STAGING: own cache name
// Baruch 11/5: libraries and opened files stay on the phone across app updates (they used to be downloaded again after every update)
const BASEC=C.indexOf('electrix-staging')===0?'electrix-staging':'electrix';const LIBC=BASEC+'-libs',FILEC=BASEC+'-files',OPENC=BASEC+'-open',PLANC=BASEC+'-plans',KEEP=[LIBC,FILEC,OPENC,PLANC];   // -plans: p16 plan shelf (cleared by p16 itself)
const SHELL=['./','index.html','sync.js','extras.js','config.js','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png','logo-light.svg','logo-dark.svg','scanner-v2.js','scanner-v2-ui.js','catalog-real.json','sched-v21.js','p2.js','p4.js','p5.js','p6.js','p7.js','p8.js','p9.js','p10.js','p11.js','p12.js','p13.js','p14.js','p15.js','p16.js','p17.js','p18.js','p19.js','p20.js','p21.js','p22.js','p23.js','p24.js','p26.js','p27.js','yi_words.js','yi.js','mat-es.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C&&k.startsWith('electrix-staging')&&!KEEP.includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
  // photos, receipts, voice notes, videos are private: open them with the signed-in person's pass
  if(u.pathname.includes('/storage/v1/object/public/files/')){e.respondWith(e.request.headers.get('range')?privateFile(e,u):keptFirst(e.request.url,()=>privateFile(e,u)));return;}
  if(u.pathname.includes('/functions/v1/trello-files')&&u.searchParams.get('file')&&!u.searchParams.get('pc')){   // pc=1: p16 keeps plans on its own shelf
  e.respondWith(keptFirst(e.request.url,()=>fetch(e.request)));return;}
  if(/supabase\.co$/.test(u.hostname)||u.pathname.includes('/realtime')||u.pathname.includes('/rest/')||u.pathname.includes('/auth/'))return; // live data never cached
  const sameOrigin=u.origin===location.origin;const isLib=/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|unpkg\.com|cdnjs\.cloudflare\.com|tile\.openstreetmap|arcgisonline/.test(u.hostname);
  if(!sameOrigin&&!isLib)return;
  // libraries with a version in the address never change: saved copy first (instant, works with no signal)
  if(isLib&&(/@\d/.test(u.pathname)||/\/\d+\.\d+\.\d+\//.test(u.pathname))){e.respondWith(caches.match(e.request).then(hit=>hit||libSave(e.request,fetch(e.request))));return;}
  // app files: newest from the network, but never wait more than a few seconds — then use the saved copy
  const net=sameOrigin?fetch(e.request.url,{cache:'no-cache',credentials:'same-origin'}):fetch(e.request);
  e.respondWith(raceSaved(e.request,netSave(e.request,net),e.request.mode==='navigate'?3500:5000));});
function libSave(req,p){return p.then(r=>{if(r.ok||r.type==='opaque'){const cp=r.clone();caches.open(LIBC).then(c=>c.put(req,cp)).catch(()=>{});}return r;});}
// opened files: kept on the phone (newest 120); the first time from the server, after that instantly
async function keptFirst(key,get){try{const c=await caches.open(FILEC);const hit=await c.match(key);if(hit)return hit;const r=await get();
  if(r&&r.ok&&r.status===200){const cp=r.clone();c.put(key,cp).then(()=>c.keys()).then(ks=>{if(ks.length>120)return Promise.all(ks.slice(0,ks.length-120).map(k=>c.delete(k)));}).catch(()=>{});}return r;}catch(x){return get();}}
function netSave(req,p){return p.then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(req,cp)).catch(()=>{});}return r;});}
function saved(req){return caches.match(req,{ignoreSearch:true}).then(r=>r||(req.mode==='navigate'?caches.match('index.html'):null));}
function raceSaved(req,net,ms){return new Promise(res=>{let done=false;const fin=r=>{if(!done&&r){done=true;res(r);}};
  net.then(fin).catch(()=>saved(req).then(r=>{if(!done){done=true;res(r||Response.error());}}));
  setTimeout(()=>{if(done)return;saved(req).then(r=>{if(r)fin(r);});},ms);});}
// tapping a notification opens the app on that message's job / screen
self.addEventListener('notificationclick',e=>{e.notification.close();const dd=e.notification.data||{};const id=dd.id||'';const act=e.action||'';const link=dd.link||null;const msg=dd.msg||'';   // P2: "done" / "reply" buttons (Android)
  // Baruch 11/5: the tap remembers where it points (id + link) — the app reads it even if the phone opens it without the address
  const keep=act?Promise.resolve():caches.open(OPENC).then(c=>c.put('./__open',new Response(JSON.stringify({id,link,msg,ts:Date.now()}),{headers:{'Content-Type':'application/json'}}))).catch(()=>{});
  e.waitUntil(keep.then(()=>self.clients.matchAll({type:'window',includeUncontrolled:true})).then(cs=>{const c=cs[0];
    if(c){return c.focus().then(w=>{try{(w||c).postMessage(act?{type:'ex-act',id,act}:{type:'ex-open2',id,link,msg});}catch(x){}});}
    return self.clients.openWindow('./'+((id||link)?'?n='+encodeURIComponent(id)+(link?'&l='+encodeURIComponent(JSON.stringify(link)):'')+(act?'&act='+encodeURIComponent(act):''):''));}));});
// Baruch 11/12 (Yossi, Android): for people set to "stacked" (Yossi only), two or more messages are put together in ONE card
// "Electrix · 5 new" — pulled down it lists every message, newest first; tapping it opens the bell list in the app.
// (Chrome on Android shows each site notification on its own and can't stack them like the Gmail app does.)
self.addEventListener('push',e=>{let d={};try{d=e.data.json();}catch(x){d={title:'Electrix',body:e.data?e.data.text():''};}
  const es=d.lang==='es';const item={id:d.id||'',link:d.link||null,msg:String(d.body||'').slice(0,200),job:!!d.job};
  e.waitUntil((async()=>{
    let cur=[];try{cur=await self.registration.getNotifications();}catch(x){}
    let prev=[];for(const n of cur){const dd=n.data||{};if(Array.isArray(dd.items))prev=prev.concat(dd.items);else prev.push({id:dd.id||'',link:dd.link||null,msg:dd.msg||n.body||''});}
    const items=d.stack?[item].concat(prev.filter(x=>!(item.id&&x.id===item.id))).slice(0,40):[item];   // 11/12: stacked only for people set that way (Yossi)
    let o,title;
    if(items.length<=1){title=d.title||'Electrix';
      o={body:d.body||'',icon:'icon-192.png',badge:'icon-192.png',tag:d.id||undefined,data:{id:item.id,link:item.link,msg:item.msg}};
      if(d.job)o.actions=[{action:'done',title:es?'✓ Hecho':'✓ Mark done'},{action:'reply',title:es?'Responder':'Reply'}];}   // P2: task alerts get buttons (Android)
    else{const n=items.length;title='Electrix · '+n+(es?' nuevas':' new');
      const lines=items.slice(0,12).map(x=>'• '+String(x.msg||'').replace(/\s+/g,' ').slice(0,90));if(n>12)lines.push(es?'+ '+(n-12)+' más':'+ '+(n-12)+' more');
      o={body:lines.join('\n'),icon:'icon-192.png',badge:'icon-192.png',tag:'ex-sum',renotify:true,data:{id:'',link:{bell:1},msg:'',items}};
      for(const x of cur){try{x.close();}catch(y){}}}
    const jobs=[self.registration.showNotification(title,o),bgPush().catch(()=>{})];   // Baruch 11/21: a notification means signal — send waiting punches now (iPhones)
    if(typeof d.badge==='number'&&self.navigator&&self.navigator.setAppBadge)jobs.push(self.navigator.setAppBadge(d.badge).catch(()=>{}));   // P2: unread count on the app icon
    await Promise.all(jobs);})());});

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
// ---- Baruch 11/20 (Lennin, Android): a punch made with no signal is sent from here as soon as the phone has signal again,
// even with the app closed (Background Sync; Android only). The app wrote the rows ready to send (sync.js bgPrep) into its
// own IndexedDB (the tag names it); they go to the "punchsync" function with this phone's punch key, which can only save
// this person's own punches through the same server checks. What was sent is noted in 'sent' so the app takes it off its
// queue the next time it opens (nothing is sent twice). With the app open on screen this does nothing — the app sends itself.
self.addEventListener('sync',e=>{const t=e.tag||'';if(t.indexOf('ex-punch|')!==0)return;e.waitUntil(bgSend(t.slice(9),e.lastChance));});
function bgIdb(name){return new Promise(res=>{try{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{try{r.result.createObjectStore('kv');}catch(x){}};r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);r.onblocked=()=>res(null);}catch(x){res(null);}});}
function bgKv(db,mode,fn){return new Promise(res=>{try{const tx=db.transaction('kv',mode);const q=fn(tx.objectStore('kv'));tx.oncomplete=()=>res(q&&'result' in q?q.result:true);tx.onerror=tx.onabort=()=>res(null);}catch(x){res(null);}});}
async function bgSend(name,last){
  if(!/^ex_bg_[A-Za-z0-9_]+$/.test(name))return;
  const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  if(cs.some(c=>c.visibilityState==='visible'&&String(c.url).indexOf(self.registration.scope)===0))return;   // the open app sends by itself (other pages on the site don't count)
  const db=await bgIdb(name);if(!db)return;
  const cfg=await bgKv(db,'readonly',o=>o.get('cfg'));const out=await bgKv(db,'readonly',o=>o.get('out'));
  if(!cfg||!cfg.key||!cfg.fn||!out||!Array.isArray(out.rows)||!out.rows.length)return;
  let r;try{r=await fetch(cfg.fn,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dev:cfg.dev,key:cfg.key,rows:out.rows.map(x=>x.row)})});}
  catch(x){if(last)return;throw x;}                                            // no signal yet: the phone tries again later
  if(r.status===401){await bgKv(db,'readwrite',o=>o.put({rows:[],at:Date.now(),why:'key'},'out'));return;}   // key gone (signed out): the app sends it
  if(!r.ok){if(last)return;throw new Error('punchsync '+r.status);}
  const j=await r.json().catch(()=>({}));const ok=new Set(Array.isArray(j.ok)?j.ok:[]);
  const sent=(await bgKv(db,'readonly',o=>o.get('sent')))||{};
  out.rows.forEach(x=>{if(ok.has(x.row.id))sent[x.k]=x.sig;});
  await bgKv(db,'readwrite',o=>{o.put(sent,'sent');return o.put({rows:out.rows.filter(x=>!ok.has(x.row.id)),at:Date.now()},'out');});   // refused / skipped stay for the app
}
// Baruch 11/21 (iPhones have no background sending): any notification that reaches the phone wakes this helper for a few
// seconds, and a notification only arrives when there is signal — so it sends the punches waiting on the phone right then.
function bgPush(){return new Promise(res=>{try{const r=indexedDB.open('ex_bg_reg',1);r.onupgradeneeded=()=>{try{r.result.createObjectStore('kv');}catch(x){}};
  r.onsuccess=()=>{try{const tx=r.result.transaction('kv','readonly');const q=tx.objectStore('kv').get(self.registration.scope);tx.oncomplete=()=>res(q.result||null);tx.onerror=()=>res(null);}catch(x){res(null);}};r.onerror=()=>res(null);}catch(x){res(null);}})
  .then(name=>name?bgSend(name,true):null);}
