/* Electrix USA Field Manager — shared data layer (Supabase)
   Every phone keeps a local copy (localStorage) and syncs record-by-record with one shared database.
   - save() pushes only what changed (debounced, batched); offline changes queue and go out when back online
   - realtime: changes from other phones arrive within ~1s and the screen refreshes
   - big photos/files (data: URLs) are moved to cloud storage and replaced by a URL
   - sign-in goes through Supabase Auth (email+password; workers get id@electrixusa.app)
*/
(function(){
const CFG=window.EX_CFG||{};
const REAL=!!(CFG.url&&CFG.anonKey&&window.supabase);
window.EX_REAL=REAL;
const SKIP=new Set(['role','nextId']);         // never shared
const EMP_STRIP=['pass'];                       // never leaves the phone
const DOMAIN=CFG.domain||'electrixusa.app';
const BLOB_MIN=60000;                           // data: URLs longer than this go to storage
const log=(...a)=>{if(CFG.debug)console.log('[sync]',...a);};
let sb=null,sbAux=null,snap={},queue=loadQ(),flushing=false,timer=null,ready=false,applying=false,renderT=null,localReady=false,lastPull=0,catching=false,hiddenSince=0;
// never wait on the network forever: every server call has a time limit
const withTO=(p,ms,what)=>Promise.race([p,new Promise((_,bad)=>setTimeout(()=>bad(new Error((what||'server')+' timeout')),ms))]);
function cachedEmail(){try{const s=JSON.parse(localStorage.getItem('ex_auth')||'null');return (s&&s.user&&s.user.email)||(s&&s.currentSession&&s.currentSession.user&&s.currentSession.user.email)||null;}catch(e){return null;}}
window.EX_cachedEmail=cachedEmail;
const st={online:navigator.onLine!==false,pending:0,err:'',user:null};
window.EX_SYNC=st;

// stable text form (the database re-orders fields, so compare with sorted keys)
function canon(v){if(v===null||typeof v!=='object')return v===undefined?'null':JSON.stringify(v);if(Array.isArray(v))return '['+v.map(x=>x===undefined||typeof x==='function'?'null':canon(x)).join(',')+']';
  const ks=Object.keys(v).filter(k=>v[k]!==undefined&&typeof v[k]!=='function').sort();return '{'+ks.map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';}
function loadQ(){try{return JSON.parse(localStorage.getItem('ex_queue')||'{}');}catch(e){return {};}}
function saveQ(){try{localStorage.setItem('ex_queue',JSON.stringify(queue));}catch(e){}st.pending=Object.keys(queue).length;paint();}
function emailFor(e){return (e.email&&/@/.test(e.email)?e.email:(e.id+'@'+DOMAIN)).toLowerCase();}
window.EX_emailFor=emailFor;

// ---------- walking D ----------
function colls(){return Object.keys(D).filter(k=>!SKIP.has(k)&&D[k]!==null&&typeof D[k]==='object');}
function recordsOf(k){const v=D[k];const out={};
  if(Array.isArray(v)){v.forEach(x=>{if(!x||typeof x!=='object')return;if(!x.id)x.id=nid(k.slice(0,2));let r=x;if(k==='emps'){r=Object.assign({},x);EMP_STRIP.forEach(f=>delete r[f]);r.authEmail=emailFor(x);}out[x.id]=r;});}
  else{Object.keys(v).forEach(id=>{out[id]=v[id];});}
  return out;}
function scalars(){const out={};Object.keys(D).forEach(k=>{if(SKIP.has(k))return;const v=D[k];if(v===null||typeof v!=='object')out[k]=v;});return out;}
function setRecord(coll,id,data){const v=D[coll];
  if(Array.isArray(v)){const i=v.findIndex(x=>x&&x.id===id);if(i>=0){const o=v[i];Object.keys(o).forEach(q=>delete o[q]);Object.assign(o,data);}else v.push(data);}
  else if(v&&typeof v==='object')v[id]=data;
  else D[coll]=Array.isArray(data)?data:{[id]:data};}
function delRecord(coll,id){const v=D[coll];if(Array.isArray(v)){const i=v.findIndex(x=>x&&x.id===id);if(i>=0)v.splice(i,1);}else if(v&&typeof v==='object')delete v[id];}

// ---------- diff on save ----------
function diff(){const ops=[];
  colls().forEach(k=>{const cur=recordsOf(k);const was=snap[k]||{};const now={};
    Object.keys(cur).forEach(id=>{const j=canon(cur[id]);now[id]=j;if(was[id]!==j)ops.push({coll:k,id,data:cur[id],j,base:was[id]||null});});
    Object.keys(was).forEach(id=>{if(!(id in cur)){let meta={};if(k==='keep'){try{const o=JSON.parse(was[id]);meta={owner:o.owner,collab:o.collab||[]};}catch(e){}}ops.push({coll:k,id,del:true,meta});}});
    snap[k]=now;});
  const sc=scalars();const wasS=snap._||{};const nowS={};
  Object.keys(sc).forEach(id=>{const j=canon(sc[id]);nowS[id]=j;if(wasS[id]!==j)ops.push({coll:'_',id,data:{v:sc[id]},j,base:null});});
  Object.keys(wasS).forEach(id=>{if(!(id in sc))ops.push({coll:'_',id,del:true});});
  snap._=nowS;return ops;}
function takeSnap(){snap={};colls().forEach(k=>{const cur=recordsOf(k);const now={};Object.keys(cur).forEach(id=>now[id]=canon(cur[id]));snap[k]=now;});const sc=scalars();const nowS={};Object.keys(sc).forEach(id=>nowS[id]=canon(sc[id]));snap._=nowS;}

window.EX_afterSave=function(){if(!REAL||!(ready||localReady)||applying)return;const ops=diff();if(!ops.length)return;
  ops.forEach(o=>{const k=o.coll+'\u0001'+o.id;const prev=queue[k];
    if(o.del)queue[k]={coll:o.coll,id:o.id,del:true,meta:o.meta||{}};
    else{const base=prev?(prev.del?null:prev.base):(o.base&&o.coll!=='_'?(o.coll==='emps'?canon(stripEmp(JSON.parse(o.base))):o.base):null);queue[k]={coll:o.coll,id:o.id,data:o.data,base};}});
  saveQ();schedule();};
function schedule(){clearTimeout(timer);timer=setTimeout(flush,400);}

// ---------- blobs → storage ----------
async function offloadBlobs(coll,id,data){let changed=false;const seen=[];
  async function walk(o,path){if(!o||typeof o!=='object')return;
    for(const k of Object.keys(o)){const v=o[k];
      if(typeof v==='string'&&v.startsWith('data:')&&v.length>BLOB_MIN){const url=await upload(coll,id,path+k,v);if(url){o[k]=url;changed=true;}else throw new Error('upload');}
      else if(v&&typeof v==='object'&&seen.indexOf(v)<0){seen.push(v);await walk(v,path+k+'/');}}}
  await walk(data,'');return changed;}
async function upload(coll,id,key,dataUrl){try{const m=/^data:([^;,]+)/.exec(dataUrl);const type=m?m[1]:'application/octet-stream';const blob=await (await fetch(dataUrl)).blob();
  const ext=(type.split('/')[1]||'bin').replace(/[^a-z0-9]/gi,'').slice(0,8);const path=coll+'/'+id+'/'+key.replace(/[^a-z0-9_-]/gi,'_')+'_'+Date.now().toString(36)+'.'+ext;
  const r=await sb.storage.from('files').upload(path,blob,{contentType:type,upsert:true});if(r.error)throw r.error;
  return sb.storage.from('files').getPublicUrl(path).data.publicUrl;}catch(e){log('upload failed',e);return null;}}

// voice notes and videos go straight to storage (too big to keep in the phone copy)
window.EX_uploadBlob=async function(blob,folder){if(!REAL||!sb||!st.online)return null;try{const type=blob.type||'application/octet-stream';const ext=(type.split('/')[1]||'bin').split(';')[0].replace(/[^a-z0-9]/gi,'').slice(0,8)||'bin';
  const path=(folder||'media')+'/'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)+'.'+ext;const r=await sb.storage.from('files').upload(path,blob,{contentType:type.split(';')[0],upsert:false});if(r.error)throw r.error;
  return sb.storage.from('files').getPublicUrl(path).data.publicUrl;}catch(e){log('media upload failed',e);return null;}};
// ---------- push ----------
async function flush(){if(!REAL||!ready||flushing||!st.online)return;const keys=Object.keys(queue);if(!keys.length)return;flushing=true;paint();
  let skipped=0;
  try{const ups=[],dels=[],refs=[];
    for(const k of keys){const o=queue[k];if(o.del)dels.push(o);else{
      // offload big blobs; the live object in D is the same reference for arrays, so update it too
      const live=o.coll==='_'?null:liveRecord(o.coll,o.id);const target=live||o.data;
      try{const ch=await offloadBlobs(o.coll,o.id,target);if(ch&&live){o.data=(o.coll==='emps')?stripEmp(live):live;snap[o.coll][o.id]=canon(o.data);localSave();}}catch(e){skipped++;continue;}
      const cur=JSON.parse(JSON.stringify(live?(o.coll==='emps'?stripEmp(live):live):o.data));let row;
      const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);let bb=null;try{bb=o.base?JSON.parse(o.base):null;}catch(e){}
      if(bb&&plain(cur)&&plain(bb)){const b=bb;const patch={},unset=[];Object.keys(cur).forEach(f=>{if(canon(cur[f])!==canon(b[f]))patch[f]=cur[f];});Object.keys(b).forEach(f=>{if(!(f in cur))unset.push(f);});row={coll:o.coll,id:o.id,patch,unset,by:st.user||null};}
      else row={coll:o.coll,id:o.id,full:cur,by:st.user||null};
      ups.push(row);refs.push(o);}}
    const done=(k,o)=>{if(queue[k]===o)delete queue[k];};
    for(let i=0;i<ups.length;i+=200){const part=ups.slice(i,i+200);const r=await sb.rpc('save_records',{rows:part});if(r.error)throw r.error;part.forEach((x,n)=>done(x.coll+'\u0001'+x.id,refs[i+n]));saveQ();adopt(r.data);}
    for(let i=0;i<dels.length;i+=200){const part=dels.slice(i,i+200);const r=await sb.rpc('save_records',{rows:part.map(o=>({coll:o.coll,id:o.id,deleted:true,full:o.meta||{},by:st.user||null}))});if(r.error)throw r.error;part.forEach(o=>done(o.coll+'\u0001'+o.id,o));saveQ();}
    st.err=skipped?((typeof t==='function'?t('Photo upload failed — will retry'):'Photo upload failed')):'';}
  catch(e){st.err=(e&&e.message)||'sync error';log('flush error',e);}
  finally{flushing=false;paint();if(Object.keys(queue).length){if(st.err)setTimeout(flush,5000);else schedule();}}}
// take the server's merged version of what we just saved (it may include another phone's changes)
function adopt(rows){if(!Array.isArray(rows))return;let changed=false;rows.forEach(r=>{const key=r.coll;if(queue[r.coll+'\u0001'+r.id])return;const j=r.deleted?null:canon(r.coll==='_'?(r.data||{}).v:r.data);
    if(r.deleted){if(snap[key]&&r.id in snap[key]){applyRows([r],{replace:false});delete snap[key][r.id];changed=true;}return;}
    const mine=r.coll==='emps'?(snap[key]||{})[r.id]:null;if(snap[key]&&snap[key][r.id]===j)return;
    if(r.coll==='emps'){const live=liveRecord('emps',r.id);if(live&&canon(stripEmp(live))===j)return;}
    applyRows([r],{replace:false});(snap[key]=snap[key]||{})[r.id]=r.coll==='emps'?canon(recordsOf('emps')[r.id]):j;changed=true;});
  if(changed){localSave();bump();}}
function liveRecord(coll,id){const v=D[coll];if(Array.isArray(v))return v.find(x=>x&&x.id===id)||null;return v&&typeof v==='object'?v[id]||null:null;}
function stripEmp(x){const r=Object.assign({},x);EMP_STRIP.forEach(f=>delete r[f]);r.authEmail=emailFor(x);return r;}
function localSave(){try{localStorage.setItem(KEY,JSON.stringify(D));}catch(e){}}

// ---------- pull ----------
async function pullAll(){const rows=[];let from=0;const PAGE=1000;
  const t0=Date.now();
  while(true){const r=await withTO(sb.from('records').select('coll,id,data,deleted').range(from,from+PAGE-1),20000,'download');if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<PAGE)break;from+=PAGE;}
  lastPull=t0;return rows;}
// after the phone slept: fetch only what changed meanwhile, and reconnect the live feed
async function catchUp(){if(!REAL||!ready||catching||!st.online)return;catching=true;
  try{const since=new Date((lastPull||Date.now())-3*60000).toISOString();const t0=Date.now();const rows=[];let from=0;
    while(true){const r=await withTO(sb.from('records').select('coll,id,data,deleted').gt('updated_at',since).range(from,from+999),20000,'catch-up');if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<1000)break;from+=1000;}
    lastPull=t0;const fresh=rows.filter(r=>!queue[r.coll+'\u0001'+r.id]);
    if(fresh.length){applyRows(fresh,{replace:false});fresh.forEach(r=>{const k=r.coll;if(r.deleted){if(snap[k])delete snap[k][r.id];}else{(snap[k]=snap[k]||{})[r.id]=canon(r.coll==='_'?(r.data||{}).v:r.data);}});localSave();bump();}
    try{if(sb.removeAllChannels)await withTO(sb.removeAllChannels(),3000,'reconnect');}catch(e){}subscribe();flush();st.err='';paint();}
  catch(e){log('catch-up',e);}finally{catching=false;}}
window.EX_catchUp=catchUp;
document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenSince=Date.now();return;}if(hiddenSince&&Date.now()-hiddenSince>60000)catchUp();hiddenSince=0;});
function applyRows(rows,{replace}){applying=true;try{
  if(replace){colls().forEach(k=>{if(k==='_')return;D[k]=Array.isArray(D[k])?[]:{};});}
  rows.forEach(r=>{if(r.deleted){if(r.coll==='_')delete D[r.id];else delRecord(r.coll,r.id);return;}
    if(r.coll==='_'){D[r.id]=r.data&&'v' in r.data?r.data.v:r.data;return;}
    if(!(r.coll in D))D[r.coll]=/^[a-z]+$/.test(r.coll)&&!['sched','mylist','punchlists','keepLabels','base'].includes(r.coll)?[]:{};
    const data=r.data;if(r.coll==='emps'){const old=liveRecord('emps',r.id);if(old&&old.pass)data.pass=old.pass;}
    setRecord(r.coll,r.id,data);});
  }finally{applying=false;}}
function applyPendingQueue(){Object.values(queue).forEach(o=>{applying=true;try{if(o.coll==='_'){if(o.del)delete D[o.id];else D[o.id]=o.data.v;}else if(o.del)delRecord(o.coll,o.id);else setRecord(o.coll,o.id,o.data);}finally{applying=false;}});}

// ---------- realtime ----------
function subscribe(){sb.channel('records').on('postgres_changes',{event:'*',schema:'public',table:'records'},p=>{const r=p.new&&p.new.coll?p.new:null;if(!r)return;
    const key=r.coll;const j=r.deleted?null:canon(r.coll==='_'?r.data.v:r.data);
    if(queue[r.coll+'\u0001'+r.id])return;                         // we have a newer local change in flight
    if(!r.deleted&&snap[key]&&snap[key][r.id]===j)return;          // already have it
    if(r.deleted&&!(snap[key]&&r.id in snap[key]))return;
    applyRows([r],{replace:false});if(r.deleted){if(snap[key])delete snap[key][r.id];}else{(snap[key]=snap[key]||{})[r.id]=j;}
    localSave();bump();}).subscribe(s=>{log('realtime',s);st.live=s==='SUBSCRIBED';paint();});}
function bump(){clearTimeout(renderT);renderT=setTimeout(()=>{const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&a.value){renderT=setTimeout(bump,1500);return;}try{renderAll();}catch(e){log(e);}try{if(typeof renderBell==='function')renderBell();}catch(e){}},250);}

// ---------- status pill ----------
function paint(){let el=document.getElementById('exSync');if(!el){el=document.createElement('div');el.id='exSync';el.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:calc(64px + env(safe-area-inset-bottom));z-index:900;font-size:12px;padding:5px 11px;border-radius:99px;background:#1F1E2A;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.2);display:none;pointer-events:none';document.body.appendChild(el);}
  const n=Object.keys(queue).length;let txt='';if(!REAL)txt='';else if(!st.online)txt='📵 '+(typeof t==='function'?t('Offline — saved on this phone'):'Offline')+(n?' ('+n+')':'');else if(st.err)txt='⚠ '+st.err;else if(n&&flushing)txt='↑ '+(typeof t==='function'?t('Saving…'):'Saving…');
  el.textContent=txt;el.style.display=txt?'block':'none';}
window.addEventListener('online',()=>{st.online=true;paint();flush();catchUp();});window.addEventListener('offline',()=>{st.online=false;paint();});

// ---------- auth ----------
async function resolveEmail(q){q=(q||'').trim();if(!q)return null;if(/@/.test(q))return q.toLowerCase();const r=await sb.rpc('resolve_login',{q});if(r.error){log(r.error);return null;}return r.data||null;}
window.EX_login=async function(q,pass){const email=await resolveEmail(q);if(!email)return {err:'nouser'};const r=await sb.auth.signInWithPassword({email,password:pass});if(r.error)return {err:/confirm/i.test(r.error.message)?'confirm':'badpass',msg:r.error.message};return {ok:true,email};};
window.EX_logout=async function(){try{if(sb)await withTO(sb.auth.signOut(),3000,'sign-out');}catch(e){}try{localStorage.removeItem('ex_auth');}catch(e){}queue={};saveQ();ready=false;localReady=false;};
function tie(e,uid){if(!uid)return;const live=liveRecord('emps',e.id)||e;if(live.authUid!==uid){live.authUid=uid;try{save();}catch(x){}}}
window.EX_createUser=async function(e,pass){const r=await sb.rpc('admin_create_user',{p_email:emailFor(e),p_pass:pass});if(r.error)return {err:r.error.message};if(!r.data)return {err:'failed'};tie(e,r.data);return {ok:true,email:emailFor(e)};};
window.EX_setPassword=async function(e,pass){const r=await sb.rpc('admin_set_password',{p_email:emailFor(e),p_pass:pass});if(r.error)return {err:r.error.message};if(!r.data)return {err:'nouser'};tie(e,r.data);return {ok:true};};
window.EX_upc=async function(code){if(!sb)return null;try{const r=await withTO(sb.functions.invoke('upc',{body:{code}}),9000,'barcode lookup');return r&&!r.error?r.data:null;}catch(e){return null;}};
window.EX_changeMyPassword=async function(pass){const r=await sb.auth.updateUser({password:pass});return r.error?{err:r.error.message}:{ok:true};};
window.EX_setupOwner=async function(e,pass){const email=emailFor(e);const r=await sb.rpc('setup_owner',{p_email:email,p_pass:pass});if(r.error)return {err:/already/.test(r.error.message)?'This app is already set up. Sign in instead.':r.error.message};const l=await sb.auth.signInWithPassword({email,password:pass});if(l.error)return {err:l.error.message};return {ok:true,uid:l.data.user.id};};
window.EX_whoami=function(){return st.user;};

// ---------- boot ----------
window.EX_boot=async function(){if(!REAL)return {real:false};
  sb=window.supabase.createClient(CFG.url,CFG.anonKey,{auth:{persistSession:true,storageKey:'ex_auth'}});
  sbAux=window.supabase.createClient(CFG.url,CFG.anonKey,{auth:{persistSession:false,autoRefreshToken:false,storageKey:'ex_aux'}});
  window.EX_sb=sb;
  let email=null;try{const s=await withTO(sb.auth.getSession(),6000,'sign-in');email=s.data.session&&s.data.session.user?s.data.session.user.email:null;}catch(e){email=cachedEmail();st.slow=true;}st.user=email;
  sb.auth.onAuthStateChange((ev,sess)=>{st.user=sess&&sess.user?sess.user.email:null;if(ev==='SIGNED_OUT'){ready=false;}});
  return {real:true,email};};
// the job list and the material catalog ship with the app; if the database doesn't have them yet, the owner's phone fills them in once
const SEEDABLE=['sites','stock'];
window.EX_start=async function(){if(!REAL||ready)return;const local={};SEEDABLE.forEach(k=>{if(D[k])local[k]=JSON.parse(JSON.stringify(D[k]));});
  const rows=await pullAll();
  if(rows.length){applyRows(rows,{replace:true});}
  const present=new Set(rows.filter(r=>!r.deleted).map(r=>r.coll));const seeded=[];
  if(rows.length){try{const u=(await sb.auth.getUser()).data.user;const meRec=u&&(D.emps||[]).find(e=>e.authUid===u.id);
    if(meRec&&meRec.role==='owner')SEEDABLE.forEach(k=>{const v=local[k];if(present.has(k)||!v||!(Array.isArray(v)?v.length:Object.keys(v).length))return;
      if(k==='stock')v.forEach(x=>{x.qty=0;x.min=0;delete x.photo;});if(k==='sites')v.forEach(s=>{s.notes=[];delete s.fenceReq;delete s.trip;});D[k]=v;seeded.push(k);});}catch(e){log('seed check',e);}}
  applyPendingQueue();takeSnap();
  seeded.forEach(k=>{const cur=recordsOf(k);Object.keys(cur).forEach(id=>{queue[k+'\u0001'+id]={coll:k,id,data:cur[id]};});});if(seeded.length)saveQ();
  if(!rows.length&&window.EX_allowSeed){Object.keys(queue).length||(function(){const ops=[];colls().forEach(k=>{const cur=recordsOf(k);Object.keys(cur).forEach(id=>ops.push({coll:k,id,data:cur[id]}));});const sc=scalars();Object.keys(sc).forEach(id=>ops.push({coll:'_',id,data:{v:sc[id]}}));ops.forEach(o=>queue[o.coll+'\u0001'+o.id]=o);saveQ();})();}
  try{if(typeof pruneOld==='function'&&pruneOld())localSave();}catch(e){log('prune',e);}
  localSave();ready=true;subscribe();flush();paint();};
window.EX_ready=()=>ready;
// the phone keeps only recent history (the server keeps everything): forget old rows here without deleting them anywhere
window.EX_forget=function(coll,ids){const m=snap[coll];if(!m)return;ids.forEach(id=>{delete m[id];});};
window.EX_openLocal=function(){if(ready||localReady)return;takeSnap();localReady=true;paint();};
})();
