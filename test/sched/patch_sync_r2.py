"""Review round 2 for sync.js (applied identically to staging/sync.js and the release's sync.js)."""
import sys
p=sys.argv[1]; s=open(p).read()
def rep(a,b,count=1):
    global s
    assert s.count(a)==count,(p,a[:90],s.count(a)); s=s.replace(a,b)

# A. storage helpers, per-user refused list (written before anything leaves the queue), per-row outcomes
a0=s.index("function mainKey(){"); a1=s.index("window.EX_dropReject=function(coll,id){"); a1=s.index("\n",a1)+1
s=s[:a0]+r"""function mainKey(){return (typeof KEY!=='undefined'?KEY:'electrix_v29');}
// write something that must not be lost; if storage is full, drop the re-downloadable cached copy and try again
function putSafe(k,v){try{localStorage.setItem(k,v);return true;}catch(e){}
  try{localStorage.removeItem(mainKey());}catch(e){}           // cached company data: safe to drop, it comes back from the server
  try{localStorage.setItem(k,v);return true;}catch(e){}
  return false;}
function storeQ(){return putSafe('ex_queue',JSON.stringify(queue));}
function saveQ(){const n=Object.keys(queue).length;const ok=storeQ();st.qStored=ok;st.qLost=!ok&&n>0;st.pending=n;paint();return ok;}
window.EX_queued=function(coll,id){return !!queue[coll+'\u0001'+id];};
window.EX_queuedIn=function(coll){return Object.keys(queue).filter(k=>queue[k]&&queue[k].coll===coll).map(k=>queue[k].id);};
// Changes the server refused (permission, or another phone changed the same day first). Kept on the phone, with what
// the person entered, until they re-apply or dismiss them — so a refused save is never silently thrown away. Written
// BEFORE the change leaves the waiting list; each person only ever sees their own.
function loadRej(){try{const a=JSON.parse(localStorage.getItem('ex_rejects')||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
function keepRej(list){const all=loadRej();list.forEach(x=>{if(!x||x.coll!=='sched')return;const i=all.findIndex(y=>y.coll===x.coll&&y.id===x.id&&y.by===(st.user||null));const rec={coll:x.coll,id:x.id,data:x.data===undefined?null:x.data,del:!!x.del,reason:x.stale?'stale':x.delRefused?'delete-refused':'refused',at:Date.now(),by:st.user||null};if(i>=0)all[i]=rec;else all.push(rec);});
  return putSafe('ex_rejects',JSON.stringify(all.slice(-500)));}
window.EX_rejects=function(){const me=st.user||null;return loadRej().filter(x=>(x.by||null)===me);};
window.EX_dropReject=function(coll,id){const me=st.user||null;const all=loadRej().filter(y=>!(y.coll===coll&&y.id===id&&(y.by||null)===me));putSafe('ex_rejects',JSON.stringify(all));};
// what happened to each row the last time it was sent (decided at the moment the server answered)
const outcome={};function mark(coll,id,status,extra){outcome[coll+'\u0001'+id]=Object.assign({status,at:Date.now()},extra||{});}
window.EX_SYNC_V=21;
const TRANSIENT=/timeout|timed out|failed to fetch|networkerror|network error|load failed|fetch|aborted|connection was lost|appears to be offline|not connected/i;
"""+s[a1:]

# B. sending: refused rows recorded before they leave the queue; a refused "stale" row that the server in fact already
#    has (a resend after a timeout) counts as saved
a0=s.index("    async function sendUps(part,prt){"); a1=s.index("    for(let i=0;i<ups.length;i+=200)await sendUps(")
s=s[:a0]+r"""    async function sendUps(part,prt){const r=await withTO(sb.rpc('save_records',{rows:part}),45000,'save');
      if(r.error){
        if(isStale(r.error)){
          if(part.length>1){for(let n=0;n<part.length;n++)await sendUps([part[n]],[prt[n]]);return;}
          const x=part[0],o=prt[0];
          // a resend after a timeout: the first attempt may already have stored exactly this — then it is saved
          try{const cur=await withTO(sb.from('records').select('coll,id,data,deleted').eq('coll',x.coll).eq('id',x.id),15000,'check');const row=cur&&!cur.error&&cur.data&&cur.data[0];
            if(row&&!row.deleted&&row.data&&typeof row.data==='object'){const sent=x.full||x.patch||{};
              if(Object.keys(sent).filter(f=>f!=='at'&&f!=='rev'&&f!=='by').every(f=>canon(row.data[f])===canon(sent[f]))){
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
"""+s[a1:]

# deletes: record refusals first, mark outcomes
a0=s.index("    for(let i=0;i<dels.length;i+=200){"); a1=s.index("    st.err=skipped?",a0)
s=s[:a0]+r"""    for(let i=0;i<dels.length;i+=200){const part=dels.slice(i,i+200);const r=await withTO(sb.rpc('save_records',{rows:part.map(o=>({coll:o.coll,id:o.id,deleted:true,full:o.meta||{},by:st.user||null}))}),45000,'save');if(r.error)throw r.error;
      // a delete the server refused comes back still present and not deleted → restore it locally (adopt does) and flag
      // (scoped to 'sched' so other features keep today's behavior)
      const dby={};(Array.isArray(r.data)?r.data:[]).forEach(s=>{dby[s.coll+'\u0001'+s.id]=s;});
      const refused=part.filter(o=>{if(o.coll!=='sched')return false;const s=dby[o.coll+'\u0001'+o.id];return !!(s&&!s.deleted);}).map(o=>({coll:o.coll,id:o.id,delRefused:true,del:true}));
      if(refused.length)keepRej(refused);
      part.forEach(o=>{done(o.coll+'\u0001'+o.id,o);mark(o.coll,o.id,refused.some(x=>x.id===o.id&&x.coll===o.coll)?'rej':'ok');});saveQ();adopt(r.data);
      myRej.push(...refused);}
"""+s[a1:]
rep("    lastReject=myRej;if(myRej.length)keepRej(myRej);\n","    lastReject=myRej;\n")
rep("  catch(e){lastReject=myRej;if(myRej.length)keepRej(myRej);lastFlushError=","  catch(e){lastReject=myRej;lastFlushError=")
rep("    const _transient=/timeout|failed to fetch|networkerror|network error|load failed|fetch|aborted/i.test(lastFlushError);","    const _transient=TRANSIENT.test(lastFlushError);")

# C. save-now answers from the per-row outcomes
a0=s.index("window.EX_saveNow=async function(opts){"); a1=s.index("stored:st.qStored!==false};};",a0)+len("stored:st.qStored!==false};};")
s=s[:a0]+r"""window.EX_saveNow=async function(opts){opts=opts||{};if(!REAL)return {v:21,ok:true,rejected:[],pending:[]};
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
  return {v:21,ok,rejected,pending:pending.concat(unknown),transient,timedOut,error:hadError?errMsg:'',stored:st.qStored!==false};};"""+s[a1:]
open(p,'w').write(s); print('patched',p)
