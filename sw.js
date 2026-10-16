// Offline support: the app opens even with no signal; data waits on the phone and syncs later.
const C='electrix-v3';
const SHELL=['./','index.html','sync.js','extras.js','config.js','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png','logo-light.svg','logo-dark.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
  if(/supabase\.co$/.test(u.hostname)||u.pathname.includes('/realtime')||u.pathname.includes('/rest/')||u.pathname.includes('/auth/'))return; // live data never cached
  const sameOrigin=u.origin===location.origin;const isLib=/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|unpkg\.com|tile\.openstreetmap|arcgisonline/.test(u.hostname);
  if(!sameOrigin&&!isLib)return;
  // app files: network first (always newest), fall back to the saved copy when offline
  e.respondWith((sameOrigin?fetch(e.request.url,{cache:'no-cache',credentials:'same-origin'}):fetch(e.request)).then(r=>{if(r.ok){const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));}return r;}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||(e.request.mode==='navigate'?caches.match('index.html'):Response.error()))));});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window'}).then(cs=>cs.length?cs[0].focus():self.clients.openWindow('./')));});
self.addEventListener('push',e=>{let d={};try{d=e.data.json();}catch(x){d={title:'Electrix',body:e.data?e.data.text():''};}e.waitUntil(self.registration.showNotification(d.title||'Electrix',{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png'}));});
