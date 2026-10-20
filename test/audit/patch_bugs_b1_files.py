"""Bug sweep B1 — sync.js (sign-out stops this phone's notifications for that person) and sw.js (tapping a phone
notification opens the right job; the notification carries its message id; one per message)."""
import sys,os
root=sys.argv[1]
def patch(fn,pairs):
    p=os.path.join(root,fn);s=open(p).read()
    for a,b in pairs:
        assert s.count(a)==1,(fn,a[:100],s.count(a));s=s.replace(a,b)
    open(p,'w').write(s);print('ok',p)
patch('sync.js',[("""  // Nothing unsent, or it is safely encrypted: sign out and clear everything personal from this phone.
  try{if(sb)await withTO(sb.auth.signOut(),3000,'sign-out');}catch(e){}""",
"""  // Nothing unsent, or it is safely encrypted: sign out and clear everything personal from this phone.
  // Phone notifications: this phone stops getting the signed-out person's alerts (the next person signs up their own).
  try{if(sb&&'serviceWorker' in navigator){const reg=await withTO(navigator.serviceWorker.getRegistration(),2000,'sw');const sub=reg&&reg.pushManager?await withTO(reg.pushManager.getSubscription(),2000,'push'):null;
    if(sub){const ep=sub.endpoint;const who=(typeof me==='function'&&me())?me().id:null;const P=(window.D&&D.push)||[];
      const ids=P.filter(x=>x&&x.who===who&&x.sub&&x.sub.endpoint===ep).map(x=>x.id);
      if(ids.length&&st&&st.online){try{await withTO(sb.rpc('save_records',{rows:ids.map(id=>({coll:'push',id,deleted:true,full:{},by:st.user||null}))}),4000,'push off');}catch(e){}}
      try{await withTO(sub.unsubscribe(),2000,'unsubscribe');}catch(e){}}}}catch(e){}
  try{if(sb)await withTO(sb.auth.signOut(),3000,'sign-out');}catch(e){}""")])
patch('sw.js',[("const C='electrix-staging-v16';","const C='electrix-staging-v17';"),
("""self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window'}).then(cs=>cs.length?cs[0].focus():self.clients.openWindow('./')));});
self.addEventListener('push',e=>{let d={};try{d=e.data.json();}catch(x){d={title:'Electrix',body:e.data?e.data.text():''};}e.waitUntil(self.registration.showNotification(d.title||'Electrix',{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png'}));});""",
"""// tapping a notification opens the app on that message's job / screen
self.addEventListener('notificationclick',e=>{e.notification.close();const id=(e.notification.data||{}).id||'';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{const c=cs[0];
    if(c){return c.focus().then(w=>{try{(w||c).postMessage({type:'ex-open',id});}catch(x){}});}
    return self.clients.openWindow('./'+(id?'?n='+encodeURIComponent(id):''));}));});
self.addEventListener('push',e=>{let d={};try{d=e.data.json();}catch(x){d={title:'Electrix',body:e.data?e.data.text():''};}
  e.waitUntil(self.registration.showNotification(d.title||'Electrix',{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png',tag:d.id||undefined,data:{id:d.id||''}}));});""")])
