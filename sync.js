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
const SKIP=new Set(['role','nextId','stockLog']); // never uploaded (stockLog = authoritative, server-written only)
const EMP_STRIP=['pass'];                       // never leaves the phone
const DOMAIN=CFG.domain||'electrixusa.app';
const BLOB_MIN=60000;                           // data: URLs longer than this go to storage
const log=(...a)=>{if(CFG.debug)console.log('[sync]',...a);};
const liveAt={}; // when each record last arrived through the live feed (so an older catch-up answer can't overwrite it)
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
// Unsent changes are the one thing on the phone that cannot be downloaded again, so they must be kept on disk.
// If the phone's storage is full (it is shared with other copies of the app on the same web address), drop the
// re-downloadable cached copy of the company data to make room — never the unsent work. If even that fails,
// say so (st.qLost) so the app warns the person and never pretends the change is safe.
function mainKey(){return (typeof KEY!=='undefined'?KEY:'electrix_v29');}
// ---------- durable store for unsent work ----------
// localStorage holds only ~5 MB per web address on a phone (shared with the staging copy). Unsent work is therefore ALSO
// written to IndexedDB, which has a far larger allowance. Each write carries a sequence number; at start-up the newest
// copy wins. The app always reads the newest copy (from memory when localStorage could not take it).
const DUR_DB='ex_durable_'+String(CFG.url||'local').replace(/^https?:\/\//,'').replace(/[^a-z0-9]/gi,'_');   // per database: staging ≠ live
function durKeys(){return ['ex_queue','ex_rejects',mainKey()+'__stockq','ex_sched_drafts'];}
const durMem={},durInLS={},durInIDB={};let durN=0;
const durSeqNow=()=>Date.now()*1000+((durN++)%1000);
let idbP=null;
function idb(){if(idbP)return idbP;idbP=new Promise(res=>{try{if(!window.indexedDB)return res(null);const r=indexedDB.open(DUR_DB,1);
  r.onupgradeneeded=()=>{try{r.result.createObjectStore('kv');}catch(e){}};r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);r.onblocked=()=>res(null);}catch(e){res(null);}});return idbP;}
function idbOp(mode,fn){return idb().then(db=>new Promise(res=>{if(!db)return res(null);try{const tx=db.transaction('kv',mode);const st_=tx.objectStore('kv');const out=fn(st_);
  tx.oncomplete=()=>res(out&&'result' in out?out.result:true);tx.onerror=tx.onabort=()=>res(null);}catch(e){res(null);}}));}
function lsSet(k,v){try{localStorage.setItem(k,v);return true;}catch(e){return false;}}
// write unsent work. Returns true when it is safe on the phone (localStorage now, or IndexedDB once that finishes)
function durPut(k,v){const seq=durSeqNow();durMem[k]=v;const ok=lsSet(k,v);durInLS[k]=ok;if(ok)lsSet('ex_dseq__'+k,String(seq));
  durInIDB[k]='pending';
  idbOp('readwrite',o=>o.put({v,seq,at:Date.now()},k)).then(r=>{if(durMem[k]!==v)return;durInIDB[k]=!!r;
    if(!ok&&!r){try{localStorage.removeItem(mainKey());}catch(e){}if(lsSet(k,v)){durInLS[k]=true;lsSet('ex_dseq__'+k,String(seq));}} // last resort: drop the re-downloadable cache
    durState();});
  durState();return ok;}
window.EX_durPut=durPut;
window.EX_durRead=function(k){return (k in durMem)?durMem[k]:localStorage.getItem(k);};
const durRead=window.EX_durRead;
// deliberate wipes (sign-out, account switch, turned-off employee) must clear BOTH copies, or the old work would come back
async function durDel(keys){keys.forEach(k=>{delete durMem[k];delete durInLS[k];delete durInIDB[k];try{localStorage.removeItem(k);localStorage.removeItem('ex_dseq__'+k);}catch(e){}});
  await idbOp('readwrite',o=>{keys.forEach(k=>o.delete(k));return null;});durState();}
// at start-up: if IndexedDB holds a newer copy than localStorage (localStorage was full), use it
async function durRestore(){for(const k of durKeys()){const rec=await idbOp('readonly',o=>o.get(k));if(!rec||typeof rec.v!=='string')continue;
    const lsSeq=+(localStorage.getItem('ex_dseq__'+k)||0);
    if(rec.seq>lsSeq){
      durMem[k]=rec.v;durInIDB[k]=true;const ok=lsSet(k,rec.v);durInLS[k]=ok;if(ok)lsSet('ex_dseq__'+k,String(rec.seq));}}
  try{const q=JSON.parse(durRead('ex_queue')||'{}');if(q&&typeof q==='object')queue=q;}catch(e){}st.pending=Object.keys(queue).length;durState();}
// st.qStored / st.qLost: is every piece of unsent work safe on the phone?
function durState(){const ks=durKeys();let lost=false,pend=false;ks.forEach(k=>{if(!(k in durMem))return;if(durInLS[k])return;if(durInIDB[k]==='pending')pend=true;else if(!durInIDB[k])lost=true;});
  const n=Object.keys(queue).length;st.qStored=!lost;st.qLost=lost&&(n>0||ks.some(k=>k!=='ex_queue'&&(k in durMem)&&!durInLS[k]&&!durInIDB[k]));st.qPend=pend;try{paint();}catch(e){}}
// write something that must not be lost
function putSafe(k,v){return durPut(k,v);}
function storeQ(){return putSafe('ex_queue',JSON.stringify(queue));}
function saveQ(){const n=Object.keys(queue).length;st.pending=n;const ok=storeQ();durState();return ok;}
window.EX_queued=function(coll,id){return !!queue[coll+'\u0001'+id];};
window.EX_queuedIn=function(coll){return Object.keys(queue).filter(k=>queue[k]&&queue[k].coll===coll).map(k=>queue[k].id);};
// Changes the server refused (permission, or another phone changed the same day first). Kept on the phone, with what
// the person entered, until they re-apply or dismiss them — so a refused save is never silently thrown away. Written
// BEFORE the change leaves the waiting list; each person only ever sees their own.
function loadRej(){try{const a=JSON.parse(durRead('ex_rejects')||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
const memRej=[];
function keepRej(list){const all=loadRej().concat(memRej.filter(m=>!loadRej().some(y=>y.id===m.id&&y.by===m.by)));list.forEach(x=>{if(!x||x.coll==='inbox'||x.coll==='push'||x.coll==='_')return;/* B5: every kind of record (was: schedule only) */const i=all.findIndex(y=>y.coll===x.coll&&y.id===x.id&&y.by===(st.user||null));const rec={coll:x.coll,id:x.id,data:x.data===undefined?null:x.data,del:!!x.del,reason:x.stale?'stale':x.delRefused?'delete-refused':'refused',at:Date.now(),by:st.user||null};if(i>=0)all[i]=rec;else all.push(rec);});
  const ok=putSafe('ex_rejects',JSON.stringify(all.slice(-500)));
  if(!ok){all.forEach(r=>{if(!memRej.some(m=>m.id===r.id&&m.by===r.by))memRej.push(r);});}else memRej.length=0;
  return ok;}
window.EX_rejects=function(){const me=st.user||null;const all=loadRej();memRej.forEach(m=>{if(!all.some(y=>y.id===m.id&&y.by===m.by))all.push(m);});return all.filter(x=>(x.by||null)===me);};
window.EX_dropReject=function(coll,id){const me=st.user||null;for(let i=memRej.length-1;i>=0;i--)if(memRej[i].coll===coll&&memRej[i].id===id&&(memRej[i].by||null)===me)memRej.splice(i,1);const all=loadRej().filter(y=>!(y.coll===coll&&y.id===id&&(y.by||null)===me));putSafe('ex_rejects',JSON.stringify(all));};
// what happened to each row the last time it was sent (decided at the moment the server answered)
const outcome={};function mark(coll,id,status,extra){const now=Date.now();outcome[coll+'\u0001'+id]=Object.assign({status,at:now},extra||{});
  if(Object.keys(outcome).length>2000)Object.keys(outcome).forEach(k=>{if(now-outcome[k].at>3600000)delete outcome[k];});}
window.EX_SYNC_V=21;
const TRANSIENT=/timeout|timed out|failed to fetch|networkerror|network error|load failed|fetch|aborted|connection was lost|appears to be offline|not connected/i;
function emailFor(e){return (e.email&&/@/.test(e.email)?e.email:(e.id+'@'+DOMAIN)).toLowerCase();}
window.EX_emailFor=emailFor;

// ---------- walking D ----------
function colls(){return Object.keys(D).filter(k=>!SKIP.has(k)&&D[k]!==null&&typeof D[k]==='object');}
// Stock quantity is owned by the server RPC apply_stock_txn (atomic deltas), never by the normal patch sync —
// otherwise a device's absolute qty write would clobber another device's concurrent change. Strip qty from the
// sync view everywhere snap is set; the live value still comes down from the server on pull/catch-up for display.
function upStrip(coll,data){if(coll==='stock'&&data&&typeof data==='object'){const d=Object.assign({},data);delete d.qty;delete d.qv;return d;}return data;}
function recordsOf(k){const v=D[k];const out={};
  if(Array.isArray(v)){v.forEach(x=>{if(!x||typeof x!=='object')return;if(!x.id)x.id=nid(k.slice(0,2));let r=x;if(k==='emps'){r=Object.assign({},x);EMP_STRIP.forEach(f=>delete r[f]);r.authEmail=emailFor(x);}else if(k==='stock'){r=Object.assign({},x);delete r.qty;delete r.qv;}out[x.id]=r;});}
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
// clock-in selfies (~10 KB each, on every punch) are moved to file storage too, or office phones fill up within weeks
async function offloadBlobs(coll,id,data){let changed=false;const seen=[];
  async function walk(o,path){if(!o||typeof o!=='object')return;
    for(const k of Object.keys(o)){const v=o[k];
      if(typeof v==='string'&&v.startsWith('data:')&&v.length>(coll==='punches'?4000:BLOB_MIN)){const url=await upload(coll,id,path+k,v);if(url){o[k]=url;changed=true;}else throw new Error('upload');}
      else if(v&&typeof v==='object'&&seen.indexOf(v)<0){seen.push(v);await walk(v,path+k+'/');}}}
  await walk(data,'');return changed;}
async function upload(coll,id,key,dataUrl){try{const m=/^data:([^;,]+)/.exec(dataUrl);const type=m?m[1]:'application/octet-stream';const blob=await (await fetch(dataUrl)).blob();
  const ext=(type.split('/')[1]||'bin').replace(/[^a-z0-9]/gi,'').slice(0,8);const path=coll+'/'+id+'/'+key.replace(/[^a-z0-9_-]/gi,'_')+'_'+Date.now().toString(36)+'.'+ext;
  const r=await withTO(sb.storage.from('files').upload(path,blob,{contentType:type,upsert:true}),25000,'upload');if(r.error)throw r.error;
  return sb.storage.from('files').getPublicUrl(path).data.publicUrl;}catch(e){log('upload failed',e);return null;}}

// voice notes and videos go straight to storage (too big to keep in the phone copy)
window.EX_uploadBlob=async function(blob,folder){if(!REAL||!sb||!st.online)return null;try{const type=blob.type||'application/octet-stream';const ext=(type.split('/')[1]||'bin').split(';')[0].replace(/[^a-z0-9]/gi,'').slice(0,8)||'bin';
  const path=(folder||'media')+'/'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)+'.'+ext;const r=await withTO(sb.storage.from('files').upload(path,blob,{contentType:type.split(';')[0],upsert:false}),25000,'upload');if(r.error)throw r.error;
  return sb.storage.from('files').getPublicUrl(path).data.publicUrl;}catch(e){log('media upload failed',e);return null;}};
// ---------- push ----------
// did the server quietly drop a change we sent? save_records returns each sent row's CURRENT db state after a
// per-row try/catch that silently swallows a permission denial. so a refused write shows up one of two ways:
//   • a brand-new row (insert) that was denied → it is simply ABSENT from what came back;
//   • an existing row whose patch was denied → it comes back with the old values (our fields not applied).
// either way the person must be told and the local optimistic copy undone — never a false "saved".
// returns the list of rejected {coll,id,absent} so the caller can revert and surface a clear error.
const SERVER_OWNED={travel:['pay','minutes','auto','status'],punches:['srvIn','hist','lateEntry']};
function rejectedRows(sent,server){const out=[];if(!Array.isArray(server))return out;
  const by={};server.forEach(s=>{by[s.coll+'\u0001'+s.id]=s;});
  sent.forEach(row=>{if(row.coll==='emps')return; // emps are transformed server-side (stripEmp), so skip to avoid false alarms
    const s=by[row.coll+'\u0001'+row.id];
    // A denied INSERT comes back absent. We flag that only for 'sched' (the Schedule feature this fix targets), to
    // keep every other feature's save behavior exactly as it is today — no new surprises outside scheduling.
    // B2: for every kind of record — except bell messages to other people (the sender may not read those back)
    if(!s||s.deleted){if(row.coll!=='inbox'&&row.coll!=='push'&&row.coll!=='_')out.push({coll:row.coll,id:row.id,absent:true});return;}
    const d=s.data||{};
    const own=SERVER_OWNED[row.coll]||[];   // fields the server works out itself (it is not a refusal when they differ)
    const sentObj=(row.patch&&typeof row.patch==='object')?row.patch:(row.coll==='punches'&&row.full&&typeof row.full==='object'?row.full:null);
    if(sentObj){let bad=false;for(const f in sentObj){if(own.indexOf(f)>=0)continue;if(canon(d[f])!==canon(sentObj[f])){bad=true;break;}}
      if(!bad&&row.coll==='punches'&&Array.isArray(row.unset))bad=row.unset.some(f=>own.indexOf(f)<0&&(f in d));
      if(bad)out.push({coll:row.coll,id:row.id});}});
  return out;}
let lastReject=[];          // rows rejected by the most recent flush (read by EX_saveNow)
let lastFlushError=null;    // hard error (network/auth) from the most recent flush, else null
let suppressRejectToast=false; // EX_saveNow shows its own message at the point of action, so mute the background toast
// flush() hands back the save already running (if any) instead of starting a second one, so a caller such as
// EX_logout can `await flush()` and be sure the in-flight save has fully finished before it stashes/clears the queue.
let flushInFlight=null;
function flush(){if(!REAL||!ready||!st.online)return Promise.resolve();if(flushInFlight)return flushInFlight;
  flushInFlight=_flush();const done=()=>{flushInFlight=null;};flushInFlight.then(done,done);return flushInFlight;}
async function _flush(){const keys=Object.keys(queue);if(!keys.length){lastReject=[];return;}flushing=true;st.flushing=true;paint();
  let skipped=0;const myRej=[];lastFlushError=null;
  try{const ups=[],dels=[],refs=[];
    for(const k of keys){const o=queue[k];if(o.del)dels.push(o);else{
      // offload big blobs; the live object in D is the same reference for arrays, so update it too
      const live=o.coll==='_'?null:liveRecord(o.coll,o.id);const target=live||o.data;
      try{const ch=await offloadBlobs(o.coll,o.id,target);if(ch&&live){o.data=(o.coll==='emps')?stripEmp(live):upStrip(o.coll,live);snap[o.coll][o.id]=canon(o.data);localSave();}}catch(e){skipped++;
        if(o.coll==='punches'){const strip=JSON.parse(JSON.stringify(target));Object.keys(strip).forEach(f=>{if(typeof strip[f]==='string'&&strip[f].startsWith('data:'))strip[f]='';});
          ups.push({coll:o.coll,id:o.id,patch:strip,unset:[],by:st.user||null});refs.push({});}   // stays queued: the full entry with its photo goes again next time
        continue;}
      // stock qty is NEVER sent by the normal sync (only apply_stock_txn changes it) — the live record carries the phone's local qty
      const cur=JSON.parse(JSON.stringify(live?(o.coll==='emps'?stripEmp(live):upStrip(o.coll,live)):upStrip(o.coll,o.data)));let row;
      const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);let bb=null;try{bb=o.base?JSON.parse(o.base):null;}catch(e){}
      if(bb&&plain(cur)&&plain(bb)){const b=bb;const patch={},unset=[];Object.keys(cur).forEach(f=>{if(canon(cur[f])!==canon(b[f]))patch[f]=cur[f];});Object.keys(b).forEach(f=>{if(!(f in cur))unset.push(f);});row={coll:o.coll,id:o.id,patch,unset,by:st.user||null};}
      else if(o.coll==='stock')row={coll:o.coll,id:o.id,patch:cur,unset:[],by:st.user||null};
      else row={coll:o.coll,id:o.id,full:cur,by:st.user||null};
      if(o.coll==='stock'&&row.patch){delete row.patch.qty;delete row.patch.qv;if(row.unset)row.unset=row.unset.filter(f=>f!=='qty'&&f!=='qv');} // merge, never replace: keeps the server's count (another phone may have counted it already)
      ups.push(row);refs.push(o);}}
    const done=(k,o)=>{if(queue[k]===o)delete queue[k];};
    const isStale=e=>!!e&&(e.code==='40001'||/40001|stale_sched|could not serialize/i.test((e.message||'')+(e.details||'')));
    let staleHit=false;
    // Send a group of rows. The database checks each schedule day's revision and refuses the WHOLE call if any one
    // day is out of date (another phone changed it first). So when that happens, resend the rows one by one: only the
    // out-of-date day is refused (kept with what the person entered, see keepRej) and every other change still lands.
    async function sendUps(part,prt){const r=await withTO(sb.rpc('save_records',{rows:part}),45000,'save');
      if(r.error){
        if(isStale(r.error)){
          if(part.length>1){for(let n=0;n<part.length;n++)await sendUps([part[n]],[prt[n]]);return;}
          const x=part[0],o=prt[0];
          // a resend after a timeout: the first attempt may already have stored exactly this — then it is saved
          try{const cur=await withTO(sb.from('records').select('coll,id,data,deleted').eq('coll',x.coll).eq('id',x.id),15000,'check');const row=cur&&!cur.error&&cur.data&&cur.data[0];
            if(row&&!row.deleted&&row.data&&typeof row.data==='object'){const sent=x.full||x.patch||{};
              const fs=Object.keys(sent).filter(f=>f!=='at'&&f!=='rev'&&f!=='by');
              if(fs.length&&fs.every(f=>canon(row.data[f])===canon(sent[f]))&&(x.unset||[]).every(f=>!(f in row.data))){
                done(x.coll+'\u0001'+x.id,o);saveQ();mark(x.coll,x.id,'ok');adopt([row]);return;}}}catch(e){}
          const rj={coll:x.coll,id:x.id,stale:true,data:o&&o.data!==undefined?o.data:(x.full||x.patch||null)};
          keepRej([rj]);done(x.coll+'\u0001'+x.id,o);saveQ();mark(x.coll,x.id,'rej',{stale:true});staleHit=true;myRej.push(rj);return;}
        throw r.error;}
      const rej=rejectedRows(part,r.data);
      rej.forEach(x=>{const n=part.findIndex(p=>p.coll===x.coll&&p.id===x.id);x.data=n>=0&&prt[n]?prt[n].data:null;});
      if(rej.length)keepRej(rej);                     // what the person entered is safe before anything leaves the queue
      part.forEach((x,n)=>{done(x.coll+'\u0001'+x.id,prt[n]);const bad=rej.find(y=>y.coll===x.coll&&y.id===x.id);mark(x.coll,x.id,bad?'rej':'ok',bad?{absent:!!bad.absent}:null);});
      saveQ();adopt(r.data);
      // undo the local optimistic copy of anything the server refused: a denied insert stayed only on this phone,
      // so drop it (adopt() already reverted denied patches to the server's stored version).
      rej.forEach(x=>{if(x.absent&&!queue[x.coll+'\u0001'+x.id]){try{delRecord(x.coll,x.id);}catch(e){}if(snap[x.coll])delete snap[x.coll][x.id];}});
      if(rej.length){localSave();try{bump();}catch(e){}}
      myRej.push(...rej);}
    for(let i=0;i<ups.length;i+=200)await sendUps(ups.slice(i,i+200),refs.slice(i,i+200));
    if(staleHit)setTimeout(()=>{try{catchUp();}catch(_){}},0); // pull the version that won so the board shows what is really saved
    for(let i=0;i<dels.length;i+=200){const part=dels.slice(i,i+200);const r=await withTO(sb.rpc('save_records',{rows:part.map(o=>({coll:o.coll,id:o.id,deleted:true,full:o.meta||{},by:st.user||null}))}),45000,'save');if(r.error)throw r.error;
      // a delete the server refused comes back still present and not deleted → restore it locally (adopt does) and flag
      // (scoped to 'sched' so other features keep today's behavior)
      const dby={};(Array.isArray(r.data)?r.data:[]).forEach(s=>{dby[s.coll+'\u0001'+s.id]=s;});
      const refused=part.filter(o=>{if(o.coll==='inbox')return false;const s=dby[o.coll+'\u0001'+o.id];return !!(s&&!s.deleted);}).map(o=>({coll:o.coll,id:o.id,delRefused:true,del:true}));
      if(refused.length)keepRej(refused);
      part.forEach(o=>{done(o.coll+'\u0001'+o.id,o);mark(o.coll,o.id,refused.some(x=>x.id===o.id&&x.coll===o.coll)?'rej':'ok');});saveQ();adopt(r.data);
      myRej.push(...refused);}
    st.err=skipped?((typeof t==='function'?t('Photo upload failed — will retry'):'Photo upload failed')):'';st.retrying=false;
    lastReject=myRej;
    if(myRej.length){const msg=(typeof t==='function'?t('Some changes could not be saved — showing the saved version.'):'Some changes could not be saved — showing the saved version.');
      try{window.dispatchEvent(new CustomEvent('ex-rejected',{detail:{rows:myRej.slice()}}));}catch(e){}
      if(!suppressRejectToast){try{if(typeof toast==='function')toast(msg,'bad');}catch(e){}}}}
  catch(e){lastReject=myRej;lastFlushError=(e&&e.message)||'sync error';
    // a slow/timed-out/offline save is transient: keep the change queued, retry quietly, and show a calm "Saving…" —
    // never the alarming "save timeout" banner (the data is safe on the phone and the retry lands it).
    const _transient=TRANSIENT.test(lastFlushError);
    st.err=_transient?'':lastFlushError;st.retrying=_transient;log('flush error',e);}
  finally{flushing=false;st.flushing=false;paint();if(Object.keys(queue).length){if(lastFlushError)setTimeout(flush,4000);else schedule();}}}
// Save right now and report the TRUE outcome, so a caller (e.g. the schedule editor) can show a real result
// instead of an optimistic "saved". Resolves {ok, rejected:[{coll,id,absent?}]}: ok=false when the server
// refused any row we just sent (no permission, or a concurrent edit / stale revision) or the save errored.
// opts.keys: [[coll,id],…] — the records this save is about. The result then reports on exactly those:
//   ok        — every one of them is stored on the server (sent, accepted, nothing left waiting)
//   queued    — not sent yet (offline / not connected); kept on the phone (stored=false means storage is full and it
//               is only in memory — the app must warn and must not reload)
//   transient — the server could not be reached in time; still kept and retried automatically
//   rejected  — the server refused it (no permission, or another phone changed the same day first)
window.EX_saveNow=async function(opts){opts=opts||{};if(!REAL)return {v:21,ok:true,rejected:[],pending:[]};
  const t0=Date.now();
  try{if(window.EX_afterSave)window.EX_afterSave();}catch(e){}
  const mine=(opts.keys||[]).map(k=>k[0]+'\u0001'+k[1]);
  const left=()=>mine.length?mine.filter(k=>queue[k]):Object.keys(queue);
  if(!ready&&!localReady)return {v:21,ok:false,error:'not signed in',rejected:[],pending:left()};
  if(!ready||!st.online){const q=left();return {v:21,ok:false,queued:true,stored:st.qStored!==false,rejected:[],pending:q};}
  const collected=[];let hadError=false,errMsg='';suppressRejectToast=true;
  const work=(async()=>{try{clearTimeout(timer);await flush();collected.push(...lastReject);if(lastFlushError){hadError=true;errMsg=lastFlushError;}
    let guard=0;while(left().length&&guard++<3){await new Promise(r=>setTimeout(r,300));await flush();collected.push(...lastReject);if(lastFlushError){hadError=true;errMsg=lastFlushError;}}
  }catch(e){hadError=true;errMsg=(e&&e.message)||'error';}})();
  let timedOut=false;await Promise.race([work,new Promise(r=>setTimeout(()=>{timedOut=true;r();},opts.waitMs||15000))]);
  suppressRejectToast=false;
  const pending=left();let rejected=[],unknown=[];
  if(mine.length){mine.forEach(k=>{const o=outcome[k];const i=k.indexOf('\u0001');const coll=k.slice(0,i),id=k.slice(i+1);
      if(o&&o.at>=t0&&o.status==='rej')rejected.push(Object.assign({coll,id},o));
      else if(!(o&&o.at>=t0&&o.status==='ok')&&!queue[k])unknown.push(k);});
    if(!timedOut)unknown=[];   // nothing to send for those (already identical on the server)
  }else{const seen={};collected.forEach(x=>{const k=x.coll+'\u0001'+x.id;if(!seen[k]){seen[k]=1;rejected.push(x);}});}
  const transient=timedOut||(hadError&&TRANSIENT.test(errMsg));
  const ok=!rejected.length&&!pending.length&&!unknown.length&&!(hadError&&!mine.length);
  return {v:21,ok,rejected,pending:pending.concat(unknown),transient,timedOut,error:hadError?errMsg:'',stored:st.qStored!==false};};
// take the server's merged version of what we just saved (it may include another phone's changes)
function adopt(rows){if(!Array.isArray(rows))return;let changed=false;rows.forEach(r=>{const key=r.coll;liveAt[r.coll+'\u0001'+r.id]=Date.now();if(queue[r.coll+'\u0001'+r.id])return;const j=r.deleted?null:canon(r.coll==='_'?(r.data||{}).v:upStrip(r.coll,r.data));
    if(r.deleted){if(snap[key]&&r.id in snap[key]){applyRows([r],{replace:false});delete snap[key][r.id];changed=true;}return;}
    const mine=r.coll==='emps'?(snap[key]||{})[r.id]:null;if(snap[key]&&snap[key][r.id]===j)return;
    if(r.coll==='emps'){const live=liveRecord('emps',r.id);if(live&&canon(stripEmp(live))===j)return;}
    applyRows([r],{replace:false});(snap[key]=snap[key]||{})[r.id]=r.coll==='emps'?canon(recordsOf('emps')[r.id]):j;changed=true;});
  if(changed){localSave();bump();}}
function liveRecord(coll,id){const v=D[coll];if(Array.isArray(v))return v.find(x=>x&&x.id===id)||null;return v&&typeof v==='object'?v[id]||null:null;}
function stripEmp(x){const r=Object.assign({},x);EMP_STRIP.forEach(f=>delete r[f]);r.authEmail=emailFor(x);return r;}
function localSave(){try{localStorage.setItem(KEY,JSON.stringify(D));}catch(e){}if(Object.keys(queue).length&&st.qStored===false)saveQ();}

// ---------- pull ----------
// History the phone keeps only for a while (see pruneOld in the app): download just the recent part, so the start-up
// download (and the phone copy) does not keep growing month after month. Everything stays on the server.
const HIST_COLLS=['punches','travel','stockLog','inbox','goHomeLog'],HIST_DAYS=130;
// the newest change time the SERVER reported (its clock, not this phone's) — the next catch-up starts from there
function srvTime(rows,fallback){let mx=0;for(const r of rows){const v=r&&r.updated_at?Date.parse(r.updated_at):0;if(v>mx)mx=v;}return mx||fallback;}
async function pullAll(){const rows=[];const PAGE=1000;
  const t0=Date.now();const since=new Date(t0-HIST_DAYS*864e5).toISOString();
  // pages are read in a fixed order (coll, id); without an order a row changed mid-download could be missed or doubled
  async function pages(mk){let from=0;while(true){const r=await withTO(mk().order('coll').order('id').range(from,from+PAGE-1),20000,'download');if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<PAGE)break;from+=PAGE;}}
  await pages(()=>sb.from('records').select('coll,id,data,deleted,updated_at').not('coll','in','('+HIST_COLLS.join(',')+')'));
  await pages(()=>sb.from('records').select('coll,id,data,deleted,updated_at').in('coll',HIST_COLLS).gt('updated_at',since));
  lastPull=srvTime(rows,t0);try{localStorage.setItem('ex_lastseen',String(t0));}catch(e){}return rows;}
// signed in but the server no longer lets this person in (turned off by the office): wipe this phone's copy and go to sign-in
async function turnedOff(){let member=true;try{const r=await withTO(sb.rpc('is_member'),6000,'access check');if(r&&!r.error&&r.data===false){const t=await withTO(sb.rpc('no_team_yet'),6000,'team check');member=!!(t&&t.data===true);}}catch(e){return false;}
  if(member)return false;
  // disabled/removed employee: force-clear this phone's data, lock, verifier and offline queues even if a logout would abort
  try{const K=(typeof KEY!=='undefined'?KEY:'electrix_v29');['ex_queue','ex_faceid','ex_pwv','electrix_bio',K,K+'__stockq'].forEach(k=>localStorage.removeItem(k));localStorage.setItem('ex_off','1');}catch(e){}
  try{await durDel(['ex_queue',mainKey()+'__stockq']);}catch(e){}
  queue={};try{await window.EX_logout();}catch(e){}try{location.reload();}catch(e){}return true;}
window.EX_turnedOff=turnedOff;
// after the phone slept: fetch only what changed meanwhile, and reconnect the live feed
// a caller that needs the newest server copy (e.g. "Use my version") waits for a catch-up already running instead of
// getting nothing back — otherwise it would build on an old version and be refused again
let catchP=null,catchAgain=false;
function catchUp(){if(!REAL||!ready||!st.online)return Promise.resolve();
  if(catchP){catchAgain=true;return catchP;}
  catchP=(async()=>{try{do{catchAgain=false;await catchUp1();}while(catchAgain&&st.online);}finally{catchP=null;}})();return catchP;}
async function catchUp1(){if(!REAL||!ready||catching||!st.online)return;catching=true;
  try{if(await turnedOff())return;
    // open the new live feed before fetching: any change from now on arrives live, anything earlier is in the fetch
    const old=chan;let nu=null;if(sb.removeChannel){try{nu=subscribe();const w0=Date.now();while(!nu._ok&&Date.now()-w0<4000)await new Promise(r=>setTimeout(r,100));}catch(e){}}
    const since=new Date((lastPull||Date.now())-3*60000).toISOString();const t0=Date.now();const rows=[];let from=0;
    while(true){const r=await withTO(sb.from('records').select('coll,id,data,deleted,updated_at').gt('updated_at',since).order('updated_at').range(from,from+999),20000,'catch-up');if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<1000)break;from+=1000;}
    lastPull=rows.length?srvTime(rows,t0):(lastPull||t0);try{localStorage.setItem('ex_lastseen',String(t0));}catch(e){}rows.forEach(r=>{if(r.coll==='stock'&&!r.deleted&&r.data&&queue[r.coll+'\u0001'+r.id]&&window.EX_stockFromServer)window.EX_stockFromServer(r.id,r.data.qty,null,r.data.qv);});
    // a record that arrived live while this catch-up was in flight is newer than what the catch-up fetched: keep it
    const fresh=rows.filter(r=>!queue[r.coll+'\u0001'+r.id]&&!((liveAt[r.coll+'\u0001'+r.id]||0)>=t0));
    if(fresh.length){applyRows(fresh,{replace:false});fresh.forEach(r=>{const k=r.coll;if(r.deleted){if(snap[k])delete snap[k][r.id];}else{(snap[k]=snap[k]||{})[r.id]=canon(r.coll==='_'?(r.data||{}).v:upStrip(r.coll,r.data));}});localSave();bump();}
    if(nu){try{if(old&&old!==nu)await withTO(sb.removeChannel(old),3000,'reconnect');}catch(e){}}
    else{try{if(sb.removeAllChannels)await withTO(sb.removeAllChannels(),3000,'reconnect');}catch(e){}subscribe();}
    flush();st.err='';paint();}
  catch(e){log('catch-up',e);}finally{catching=false;}}
window.EX_catchUp=catchUp;
document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenSince=Date.now();return;}if(hiddenSince&&Date.now()-hiddenSince>60000)catchUp();hiddenSince=0;});
function applyRows(rows,{replace}){applying=true;try{
  if(replace){colls().forEach(k=>{if(k==='_')return;D[k]=Array.isArray(D[k])?[]:{};});}
  rows.forEach(r=>{if(r.deleted){if(r.coll==='_')delete D[r.id];else delRecord(r.coll,r.id);return;}
    if(r.coll==='_'){D[r.id]=r.data&&'v' in r.data?r.data.v:r.data;return;}
    if(!(r.coll in D))D[r.coll]=/^[a-z]+$/.test(r.coll)&&!['sched','mylist','punchlists','keepLabels','base'].includes(r.coll)?[]:{};
    // stock history rows are written by the server without an id inside: keep the id, or the phone's copy loses it
    let data=r.data;if(r.coll==='stockLog'&&data&&typeof data==='object'&&!Array.isArray(data)&&!data.id)data=Object.assign({id:r.id},data);if(r.coll==='emps'){const old=liveRecord('emps',r.id);if(old&&old.pass)data.pass=old.pass;}
    setRecord(r.coll,r.id,data);if(r.coll==='stock'&&data&&window.EX_stockFromServer)window.EX_stockFromServer(r.id,data.qty,null,data.qv);
    if(r.coll==='stockLog'&&window.EX_stockLogSeen){try{window.EX_stockLogSeen(r.id);}catch(e){}}});
  }finally{applying=false;}}
function applyPendingQueue(){Object.values(queue).forEach(o=>{applying=true;try{if(o.coll==='_'){if(o.del)delete D[o.id];else D[o.id]=o.data.v;}else if(o.del)delRecord(o.coll,o.id);else setRecord(o.coll,o.id,o.data);}finally{applying=false;}});}

// ---------- realtime ----------
let chan=null;
function subscribe(){const ch=sb.channel('records-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6));chan=ch;return ch.on('postgres_changes',{event:'*',schema:'public',table:'records'},p=>{const r=p.new&&p.new.coll?p.new:null;if(!r)return;
    const key=r.coll;const j=r.deleted?null:canon(r.coll==='_'?r.data.v:upStrip(r.coll,r.data));
    // stock count belongs to the server: always take it (plus this phone's unsent moves), even when other fields are mid-edit
    if(r.coll==='stock'&&!r.deleted&&r.data&&window.EX_stockFromServer&&window.EX_stockFromServer(r.id,r.data.qty,null,r.data.qv)){localSave();bump();}
    liveAt[r.coll+'\u0001'+r.id]=Date.now();
    if(queue[r.coll+'\u0001'+r.id])return;                         // we have a newer local change in flight
    if(!r.deleted&&snap[key]&&snap[key][r.id]===j)return;          // already have it
    if(r.deleted&&!(snap[key]&&r.id in snap[key]))return;
    applyRows([r],{replace:false});if(r.deleted){if(snap[key])delete snap[key][r.id];}else{(snap[key]=snap[key]||{})[r.id]=j;}
    localSave();bump();}).subscribe(s=>{log('realtime',s);if(chan===ch){st.live=s==='SUBSCRIBED';paint();}ch._ok=s==='SUBSCRIBED';});}
function bump(){clearTimeout(renderT);renderT=setTimeout(()=>{const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&a.value){renderT=setTimeout(bump,1500);return;}try{renderAll();}catch(e){log(e);}try{if(typeof renderBell==='function')renderBell();}catch(e){}},250);}

// ---------- status pill ----------
function paint(){let el=document.getElementById('exSync');if(!el){el=document.createElement('div');el.id='exSync';el.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:calc(64px + env(safe-area-inset-bottom));z-index:900;font-size:12px;padding:5px 11px;border-radius:99px;background:#1F1E2A;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.2);display:none;pointer-events:none';document.body.appendChild(el);}
  const n=Object.keys(queue).length;let txt='';if(!REAL)txt='';else if(st.qLost)txt='⚠ '+(typeof t==='function'?t('Phone storage is full — keep the app open until this finishes sending'):'Phone storage is full — keep the app open until this finishes sending')+(n?' ('+n+')':'');else if(!st.online)txt='📵 '+(typeof t==='function'?t('Offline — saved on this phone'):'Offline')+(n?' ('+n+')':'');else if(st.err)txt='⚠ '+st.err;else if(n&&(flushing||st.retrying))txt='↑ '+(typeof t==='function'?t('Saving…'):'Saving…');
  el.textContent=txt;el.style.display=txt?'block':'none';}
window.addEventListener('online',()=>{st.online=true;paint();flush();catchUp();});window.addEventListener('offline',()=>{st.online=false;paint();});

// ---------- auth ----------
// Unsent-work stash is encrypted at rest with a DEVICE key: a random AES-256-GCM key generated once per device and
// held NON-EXTRACTABLE in IndexedDB. It never leaves the device and cannot be read out as raw bytes from storage, so
// the stash is not readable as plaintext by someone inspecting the browser. The key does not depend on the password,
// so a password change or reset never orphans saved work, and it works for a biometric sign-in (no password needed).
// Stash blobs are keyed per employee uid, and the app only ever decrypts the signed-in uid's own stash.
function deviceKey(){return new Promise((res)=>{try{if(!(window.indexedDB&&crypto&&crypto.subtle))return res(null);
  const r=indexedDB.open('ex_keys',1);
  r.onupgradeneeded=()=>{try{r.result.createObjectStore('k');}catch(e){}};
  r.onerror=()=>res(null);
  r.onsuccess=()=>{try{const db=r.result;const g=db.transaction('k','readonly').objectStore('k').get('deviceKey');
    g.onerror=()=>res(null);
    g.onsuccess=async()=>{ if(g.result){return res(g.result);} try{const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      const tx=db.transaction('k','readwrite');tx.objectStore('k').put(key,'deviceKey');tx.oncomplete=()=>res(key);tx.onerror=()=>res(key);}catch(e){res(null);} };
  }catch(e){res(null);}};
}catch(e){res(null);}});}
async function encWith(key,obj){const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(obj))));
  let s='';iv.forEach(b=>s+=String.fromCharCode(b));ct.forEach(b=>s+=String.fromCharCode(b));return btoa(s);}
async function decWith(key,b64){const bin=atob(b64);const iv=Uint8Array.from(bin.slice(0,12),c=>c.charCodeAt(0));
  const ct=Uint8Array.from(bin.slice(12),c=>c.charCodeAt(0));
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ct);return JSON.parse(new TextDecoder().decode(pt));}
// ---- Face-ID PASSWORD VERIFIER (device-bound; defined here so the device key, encWith/decWith stay MODULE-LOCAL and
//      are never exposed to page scripts). The verifier is ALWAYS encrypted with the non-extractable device key: a copy
//      of browser storage cannot be read or brute-forced off-device. If there is NO device key, we store NOTHING and
//      fail securely (online server login still works). We never store a readable PBKDF2 value. Only these
//      password-taking functions are exposed — there is no general decrypt, so no exposed function can bypass auth.
async function pbkdf2Bytes(pass,saltU8,iter){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass||''),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltU8,iterations:iter,hash:'SHA-256'},k,256));}
window.EX_setPwVerifier=async function(pass,user){try{if(!pass||!user||!(crypto&&crypto.subtle))return false;
    const dk=await deviceKey();if(!dk){try{localStorage.removeItem('ex_pwv');}catch(e){}return false;} // no key → store nothing (fail secure)
    const salt=crypto.getRandomValues(new Uint8Array(16)),iter=210000;
    const hash=await pbkdf2Bytes(pass,salt,iter);
    const blob=await encWith(dk,{salt:Array.from(salt),iter,hash:Array.from(hash)}); // salt+hash sealed inside the device-key ciphertext
    localStorage.setItem('ex_pwv',JSON.stringify({fmt:'wrapped',user,blob}));return true;
  }catch(e){return false;}};
// true (match) / false (wrong) / null (no usable local verifier → caller must use the server)
window.EX_checkPwVerifier=async function(pass,user){try{if(!(crypto&&crypto.subtle))return null;
    const rec=JSON.parse(localStorage.getItem('ex_pwv')||'null');if(!rec||rec.user!==user||rec.fmt!=='wrapped'||!rec.blob)return null;
    const dk=await deviceKey();if(!dk)return null;
    let inner=null;try{inner=await decWith(dk,rec.blob);}catch(e){return null;}
    if(!inner||!Array.isArray(inner.salt)||!Array.isArray(inner.hash))return null;
    const h=await pbkdf2Bytes(pass,new Uint8Array(inner.salt),inner.iter||210000);
    if(h.length!==inner.hash.length)return false;let d=0;for(let i=0;i<h.length;i++)d|=h[i]^inner.hash[i];return d===0; // constant-time
  }catch(e){return null;}};
window.EX_clearPwVerifier=function(){try{localStorage.removeItem('ex_pwv');}catch(e){}};
window.EX_hasPwVerifier=function(user){try{const r=JSON.parse(localStorage.getItem('ex_pwv')||'null');return !!(r&&r.user===user&&r.fmt==='wrapped');}catch(e){return false;}};
// On an account switch, securely stash the PREVIOUS employee's LIVE unsent work (encrypted, keyed to THEM) before the
// live copy is wiped — so it is preserved, recoverable only when they sign back in, and never visible/uploadable under
// the next employee. Merges with any existing stash; verifies the ciphertext decrypts back before trusting it.
async function stashLiveFor(prev){try{if(!prev)return;const dk=await deviceKey();if(!dk)return;
  try{const live=JSON.parse(durRead('ex_queue')||'{}');if(live&&Object.keys(live).length){let merged=live;
    try{const ex=localStorage.getItem('ex_qenc__'+prev);if(ex){const old=await decWith(dk,ex);if(old&&typeof old==='object')merged=Object.assign({},old,live);}}catch(e){}
    const blob=await encWith(dk,merged);let back=null;try{back=await decWith(dk,blob);}catch(e){}
    if(back&&JSON.stringify(back)===JSON.stringify(merged))localStorage.setItem('ex_qenc__'+prev,blob);}}catch(e){}
  try{const K=(typeof KEY!=='undefined'?KEY:'electrix_v29');const sraw=durRead(K+'__stockq');const sarr=sraw?JSON.parse(sraw):[];
    if(Array.isArray(sarr)&&sarr.length){let merged=sarr;
    try{const ex=localStorage.getItem('ex_sqenc__'+prev);if(ex){const old=await decWith(dk,ex);if(Array.isArray(old)){const seen=new Set(sarr.map(x=>x&&x.id));merged=sarr.concat(old.filter(x=>x&&!seen.has(x.id)));}}}catch(e){}
    const blob=await encWith(dk,merged);let back=null;try{back=await decWith(dk,blob);}catch(e){}
    if(back&&JSON.stringify(back)===JSON.stringify(merged))localStorage.setItem('ex_sqenc__'+prev,blob);}}catch(e){}
}catch(e){}}
// recover a securely-stashed stock queue for the SAME person on their next sign-in (merge by id; never overwrite newer)
async function recoverStockStash(uid){try{if(!uid)return;const enc=localStorage.getItem('ex_sqenc__'+uid);if(!enc)return;
  const dk=await deviceKey();if(!dk)return;let arr=null;try{arr=await decWith(dk,enc);}catch(e){return;}
  if(!Array.isArray(arr)||!arr.length){try{localStorage.removeItem('ex_sqenc__'+uid);}catch(e){}return;}
  const SQK=(typeof KEY!=='undefined'?KEY:'electrix_v29')+'__stockq';let cur=[];try{cur=JSON.parse(durRead(SQK)||'[]');if(!Array.isArray(cur))cur=[];}catch(e){cur=[];}
  const seen=new Set(cur.map(x=>x&&x.id));arr.forEach(x=>{if(x&&!seen.has(x.id)){cur.push(x);seen.add(x.id);}});
  try{durPut(SQK,JSON.stringify(cur));localStorage.removeItem('ex_sqenc__'+uid);}catch(e){}}catch(e){}}
// sign in through the server-side "login" function: the name/phone -> email lookup happens on the server, so the
// sign-in email is never handed back to someone who isn't signed in (closes the anonymous email-lookup leak).
window.EX_login=async function(q,pass){q=(q||'').trim();if(!q||!pass)return {err:'badpass'};
  try{const r=await withTO(sb.functions.invoke('login',{body:{q,password:pass}}),15000,'sign-in');
    // We got a response from the server: a missing session here means it declined the name/password
    // (or the sign-in isn't confirmed) — a real credential problem, not a connection problem.
    if(r.error||!r.data||!r.data.session){const m=(r.error&&(r.error.message||''))||'';return {err:/confirm/i.test(m)?'confirm':'badpass'};}
    const s=r.data.session;const ss=await sb.auth.setSession({access_token:s.access_token,refresh_token:s.refresh_token});
    if(ss.error||!ss.data||!ss.data.user)return {err:'badpass'};
    const uid=ss.data.user.id;try{localStorage.setItem('ex_uid',uid);}catch(e){}
    // recover this employee's own encrypted stash from a previous logout (device key unwraps it; not tied to password).
    try{const enc=localStorage.getItem('ex_qenc__'+uid);if(enc){const dk=await deviceKey();if(dk){const rec=await decWith(dk,enc);if(rec&&typeof rec==='object'){Object.keys(rec).forEach(k=>{if(!queue[k])queue[k]=rec[k];});localStorage.removeItem('ex_qenc__'+uid);saveQ();}}}}catch(e){}
    await recoverStockStash(uid);   // restore any securely-stashed stock transactions for this person
    // any legacy plaintext stash from an older build is DISCARDED, not loaded, so no unencrypted work is ever restored.
    try{localStorage.removeItem('ex_queue__'+uid);}catch(e){}
    return {ok:true,email:ss.data.user.email};
  }catch(e){return {err:'offline',msg:(e&&e.message)||''};}};  // timed out / never reached the server → connection problem, not a wrong password
// signing out wipes this phone's copy of the company data, the saved session, and the biometric sign-in, so the next
// person to use the phone (or the same person on another account) can't see the previous account's data.
// Unsent work is protected: if we're online with queued changes, they're sent as the current user BEFORE signing out;
// if we're offline, the queue is kept (not silently dropped) so the SAME person keeps their work on the next sign-in,
// while a DIFFERENT person signing in triggers the account-switch wipe in EX_boot.
window.EX_logout=async function(){
  const uid=(function(){try{return localStorage.getItem('ex_uid');}catch(e){return null;}})();
  // Wait for any save already in progress to FULLY finish before we touch the queue — otherwise a change could be
  // stashed/cleared while its save is still mid-request (the race ChatGPT flagged).
  try{if(flushInFlight)await flushInFlight;}catch(e){}
  // Then try (once) to send whatever is queued, as the current user.
  try{if(st&&st.online&&ready&&Object.keys(queue).length){await flush();}}catch(e){}
  try{if(flushInFlight)await flushInFlight;}catch(e){}
  // Whatever is STILL queued for ANY reason — offline, a REJECTED save, a timeout, or an unreachable server — is never
  // discarded (we do not decide by the online flag). It is encrypted with the device key and we VERIFY it actually
  // persisted and decrypts back BEFORE we clear the live queue. If it cannot be securely stored (no WebCrypto/IndexedDB,
  // or storage is full), we do NOT clear the live queue and we do NOT claim success — no plaintext stash, no silent loss.
  // Securely preserve BOTH unsent queues — main business data (jobs, hours, punches…) AND stock transactions —
  // by encrypting each with the device key and VERIFYING the stash persisted and decrypts back BEFORE anything is
  // cleared. If EITHER cannot be secured, do NOT sign out: stay signed in and tell the person to sync first.
  // No plaintext stash, no silent loss of any pending business data.
  let stashed=0, secured=null, stockSecured=null;
  const SQK=(typeof KEY!=='undefined'?KEY:'electrix_v29')+'__stockq';
  let stockArr=[];try{const raw=durRead(SQK);stockArr=raw?JSON.parse(raw):[];if(!Array.isArray(stockArr))stockArr=[];}catch(e){stockArr=[];}
  if(uid&&(Object.keys(queue).length||stockArr.length)){
    try{const dk=await deviceKey();
      if(!dk){if(Object.keys(queue).length)secured=false;if(stockArr.length)stockSecured=false;}
      else{
        if(Object.keys(queue).length){const q=queue;const blob=await encWith(dk,q);localStorage.setItem('ex_qenc__'+uid,blob);
          const back=localStorage.getItem('ex_qenc__'+uid);const dec=back?await decWith(dk,back):null;
          if(dec&&JSON.stringify(dec)===JSON.stringify(q)){secured=true;stashed=Object.keys(q).length;}else secured=false;}
        if(stockArr.length){const blob=await encWith(dk,stockArr);localStorage.setItem('ex_sqenc__'+uid,blob);
          const back=localStorage.getItem('ex_sqenc__'+uid);const dec=back?await decWith(dk,back):null;
          stockSecured=(dec&&JSON.stringify(dec)===JSON.stringify(stockArr))?true:false;}
      }
    }catch(e){if(Object.keys(queue).length)secured=false;if(stockArr.length)stockSecured=false;}
  }
  if(secured===false||stockSecured===false){
    try{localStorage.removeItem('ex_qenc__'+uid);localStorage.removeItem('ex_sqenc__'+uid);}catch(e){}
    try{if(typeof toast==='function')toast(typeof t==='function'?t('You have unsent changes that could not be secured on this phone. Connect to the internet and let them finish saving before you sign out.'):'Unsent changes could not be secured — connect and let them save before signing out.','bad');}catch(e){}
    return {aborted:true,secured:false,stashed:0};
  }
  // Nothing unsent, or it is safely encrypted: sign out and clear everything personal from this phone.
  // Phone notifications: this phone stops getting the signed-out person's alerts (the next person signs up their own).
  try{if(sb&&'serviceWorker' in navigator){const reg=await withTO(navigator.serviceWorker.getRegistration(),2000,'sw');const sub=reg&&reg.pushManager?await withTO(reg.pushManager.getSubscription(),2000,'push'):null;
    if(sub){const ep=sub.endpoint;const who=(typeof me==='function'&&me())?me().id:null;const P=(typeof D!=='undefined'&&D&&D.push)||[];
      const ids=P.filter(x=>x&&x.who===who&&x.sub&&x.sub.endpoint===ep).map(x=>x.id);
      if(ids.length&&st&&st.online){try{await withTO(sb.rpc('save_records',{rows:ids.map(id=>({coll:'push',id,deleted:true,full:{},by:st.user||null}))}),4000,'push off');}catch(e){}}
      try{await withTO(sub.unsubscribe(),2000,'unsubscribe');}catch(e){}}}}catch(e){}
  try{if(sb)await withTO(sb.auth.signOut(),3000,'sign-out');}catch(e){}
  try{const K=(typeof KEY!=='undefined'?KEY:'electrix_v29');
      ['ex_auth','ex_uid','ex_queue','electrix_bio','ex_faceid_asked','ex_faceid','ex_pwv',K,K+'__stockq'].forEach(k=>localStorage.removeItem(k));}catch(e){}
  try{await durDel(['ex_queue',mainKey()+'__stockq']);}catch(e){}
  queue={};ready=false;localReady=false;
  if(secured||stockSecured){try{if(typeof toast==='function')toast(typeof t==='function'?t('Some changes will finish saving next time you sign in.'):'Some changes will finish saving next time you sign in.');}catch(e){}}
  return {stashed,secured,stockSecured,aborted:false};};
function tie(e,uid){if(!uid)return;const live=liveRecord('emps',e.id)||e;if(live.authUid!==uid){live.authUid=uid;try{save();}catch(x){}}}
window.EX_createUser=async function(e,pass){const r=await sb.rpc('admin_create_user',{p_email:emailFor(e),p_pass:pass});if(r.error)return {err:r.error.message};if(!r.data)return {err:'failed'};tie(e,r.data);return {ok:true,email:emailFor(e)};};
window.EX_setPassword=async function(e,pass){const r=await sb.rpc('admin_set_password',{p_email:emailFor(e),p_pass:pass});if(r.error)return {err:r.error.message};if(!r.data)return {err:'nouser'};tie(e,r.data);return {ok:true};};
window.EX_upc=async function(code){if(!sb)return null;try{const r=await withTO(sb.functions.invoke('upc',{body:{code}}),9000,'barcode lookup');return r&&!r.error?r.data:null;}catch(e){return null;}};
window.EX_changeMyPassword=async function(pass){const r=await sb.auth.updateUser({password:pass});return r.error?{err:r.error.message}:{ok:true};};
window.EX_setupOwner=async function(e,pass){const email=emailFor(e);const r=await sb.rpc('setup_owner',{p_email:email,p_pass:pass});if(r.error)return {err:/already/.test(r.error.message)?'This app is already set up. Sign in instead.':r.error.message};const l=await sb.auth.signInWithPassword({email,password:pass});if(l.error)return {err:l.error.message};return {ok:true,uid:l.data.user.id};};
window.EX_whoami=function(){return st.user;};

// ---------- boot ----------
window.EX_boot=async function(){if(!REAL)return {real:false};
  try{await durRestore();}catch(e){}   // a newer copy of unsent work that only IndexedDB could hold
  sb=window.supabase.createClient(CFG.url,CFG.anonKey,{auth:{persistSession:true,storageKey:'ex_auth',lock:async(_n,_t,fn)=>await fn()}});
  sbAux=window.supabase.createClient(CFG.url,CFG.anonKey,{auth:{persistSession:false,autoRefreshToken:false,storageKey:'ex_aux',lock:async(_n,_t,fn)=>await fn()}});
  window.EX_sb=sb;
  let email=null,uid=null;try{const s=await withTO(sb.auth.getSession(),6000,'sign-in');const u=s.data.session&&s.data.session.user;email=u?u.email:null;uid=u?u.id:null;}catch(e){email=cachedEmail();st.slow=true;}st.user=email;
  // account switch: if the person signed in now is not the one this phone's cached data belongs to, drop the old copy first
  try{const prev=localStorage.getItem('ex_uid');if(uid){if(prev&&prev!==uid){
      await stashLiveFor(prev);   // preserve the previous employee's unsent work (encrypted, keyed to them) BEFORE wiping live data
      const K=(typeof KEY!=='undefined'?KEY:'electrix_v29');
      // wipe everything the next employee must NOT see — but KEEP ex_qenc__prev / ex_sqenc__prev (prev's encrypted stash)
      ['ex_queue','electrix_bio','ex_faceid_asked','ex_faceid','ex_pwv',K,K+'__stockq'].forEach(k=>localStorage.removeItem(k));queue={};
      try{await durDel(['ex_queue',K+'__stockq']);}catch(e){}
    }localStorage.setItem('ex_uid',uid);}}catch(e){}
  // an auto-resumed session (same uid) recovers its own encrypted stash; a legacy plaintext stash is discarded, never loaded
  try{if(uid){try{localStorage.removeItem('ex_queue__'+uid);}catch(e){}
    const enc=localStorage.getItem('ex_qenc__'+uid);if(enc){const dk=await deviceKey();if(dk){const rec=await decWith(dk,enc);if(rec&&typeof rec==='object'){Object.keys(rec).forEach(k=>{if(!queue[k])queue[k]=rec[k];});localStorage.removeItem('ex_qenc__'+uid);saveQ();}}}
    await recoverStockStash(uid);}}catch(e){}   // restore any securely-stashed stock transactions for this person
  sb.auth.onAuthStateChange((ev,sess)=>{st.user=sess&&sess.user?sess.user.email:null;if(ev==='SIGNED_OUT'){ready=false;}});
  return {real:true,email};};
// the job list and the material catalog ship with the app; if the database doesn't have them yet, the owner's phone fills them in once
const SEEDABLE=['sites','stock'];
window.EX_start=async function(){if(!REAL||ready)return;const local={};SEEDABLE.forEach(k=>{if(D[k])local[k]=JSON.parse(JSON.stringify(D[k]));});
  const rows=await pullAll();
  if(!rows.length&&await turnedOff())return;
  if(rows.length){applyRows(rows,{replace:true});applyPendingQueue();takeSnap();   // B2: unsent work back on top at once — no wait in between
    // stock history is not cleared by the full download (it is server-written): drop the id-less copies older versions of
    // the app piled up on every start, keeping this phone's own moves that are still waiting or were refused
    try{const srvIds=new Set(rows.filter(r=>r.coll==='stockLog'&&!r.deleted).map(r=>r.id));
      if(Array.isArray(D.stockLog))D.stockLog=D.stockLog.filter(x=>x&&x.id&&(srvIds.has(x.id)||x.pending||x.rejected));}catch(e){log('stockLog tidy',e);}}
  const present=new Set(rows.filter(r=>!r.deleted).map(r=>r.coll));const seeded=[];
  if(rows.length){try{const u=(await withTO(sb.auth.getUser(),6000,'who')).data.user;const meRec=u&&(D.emps||[]).find(e=>e.authUid===u.id);
    if(meRec&&meRec.role==='owner')SEEDABLE.forEach(k=>{const v=local[k];if(present.has(k)||!v||!(Array.isArray(v)?v.length:Object.keys(v).length))return;
      if(k==='stock')v.forEach(x=>{x.qty=0;x.min=0;delete x.photo;});if(k==='sites')v.forEach(s=>{s.notes=[];delete s.fenceReq;delete s.trip;});D[k]=v;seeded.push(k);});}catch(e){log('seed check',e);}}
  if(!rows.length){applyPendingQueue();takeSnap();}
  seeded.forEach(k=>{const cur=recordsOf(k);Object.keys(cur).forEach(id=>{queue[k+'\u0001'+id]={coll:k,id,data:cur[id]};});});if(seeded.length)saveQ();
  if(!rows.length&&window.EX_allowSeed){Object.keys(queue).length||(function(){const ops=[];colls().forEach(k=>{const cur=recordsOf(k);Object.keys(cur).forEach(id=>ops.push({coll:k,id,data:cur[id]}));});const sc=scalars();Object.keys(sc).forEach(id=>ops.push({coll:'_',id,data:{v:sc[id]}}));ops.forEach(o=>queue[o.coll+'\u0001'+o.id]=o);saveQ();})();}
  try{if(typeof pruneOld==='function'&&pruneOld())localSave();}catch(e){log('prune',e);}
  localSave();ready=true;subscribe();flush();paint();};
window.EX_ready=()=>ready;
// safe to forget a record from the phone only when the server already has exactly this version and nothing is waiting
// older history asked for on purpose (Hours / Job hours for a past period): load it from the server and keep it on the
// phone for a few hours so it does not disappear while someone is looking at it. It is a normal server copy (in snap),
// so it is never uploaded again and can be forgotten safely later.
const holdUntil={};
window.EX_loadRange=async function(coll,from,to,opts){opts=opts||{};if(!REAL||!sb||!ready||!st.online)return {ok:false,offline:true};
  try{const r=await withTO(sb.rpc('history_records',{p_coll:coll,p_from:Math.floor(from),p_to:Math.ceil(to),p_who:opts.who||null,p_site:opts.site||null,p_limit:opts.limit||3000}),20000,'history');
    if(r.error)return {ok:false,error:r.error.message||'error'};const rows=(r.data||[]).filter(x=>x&&x.coll===coll&&!queue[x.coll+'\u0001'+x.id]);
    const until=Date.now()+4*3600000;rows.forEach(x=>{holdUntil[x.coll+'\u0001'+x.id]=until;});
    if(rows.length){applyRows(rows,{replace:false});rows.forEach(x=>{(snap[x.coll]=snap[x.coll]||{})[x.id]=canon(upStrip(x.coll,x.data));});localSave();}
    return {ok:true,n:rows.length,full:(r.data||[]).length>=(opts.limit||3000)};}catch(e){return {ok:false,error:(e&&e.message)||'error'};}};
window.EX_canForget=function(coll,rec){if(!rec||!rec.id)return false;if((holdUntil[coll+'\u0001'+rec.id]||0)>Date.now())return false;if(queue[coll+'\u0001'+rec.id])return false;const s=snap[coll]&&snap[coll][rec.id];return !!s&&s===canon(upStrip(coll,rec));};
// the phone keeps only recent history (the server keeps everything): forget old rows here without deleting them anywhere
window.EX_forget=function(coll,ids){const m=snap[coll];if(!m)return;ids.forEach(id=>{delete m[id];});};
window.EX_openLocal=function(){if(ready||localReady)return;takeSnap();localReady=true;paint();};
})();
