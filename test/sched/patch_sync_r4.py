"""Round 4 — unsent work survives a full phone: every write of unsent work (waiting changes, stock moves, refused
schedule changes, schedule drafts) also goes to IndexedDB (far larger quota than localStorage); the newest copy wins at
start-up; deliberate wipes (sign-out, account switch, turned-off employee) clear both. The cached company data is no
longer dropped unless both stores are full. Applied identically to staging/sync.js and the release's sync.js."""
import sys
p=sys.argv[1]; s=open(p).read()
def rep(a,b,count=1):
    global s
    assert s.count(a)==count,(p,a[:100],s.count(a)); s=s.replace(a,b)

# 1. the durable store + putSafe/storeQ on top of it
a0=s.index("function mainKey(){"); a1=s.index("function saveQ(){")
s=s[:a0]+r"""function mainKey(){return (typeof KEY!=='undefined'?KEY:'electrix_v29');}
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
"""+s[a1:]
rep("function loadRej(){try{const a=JSON.parse(localStorage.getItem('ex_rejects')||'[]');", "function loadRej(){try{const a=JSON.parse(durRead('ex_rejects')||'[]');")
rep("function saveQ(){const n=Object.keys(queue).length;const ok=storeQ();st.qStored=ok;st.qLost=!ok&&n>0;st.pending=n;paint();return ok;}",
    "function saveQ(){const n=Object.keys(queue).length;st.pending=n;const ok=storeQ();durState();return ok;}")
# keepRej: safe = in localStorage or IndexedDB; only fall back to memory if both fail
rep("  if(!ok){all.forEach(r=>{if(!memRej.some(m=>m.id===r.id&&m.by===r.by))memRej.push(r);});st.qLost=true;paint();}else memRej.length=0;\n  return ok;}",
    "  if(!ok){all.forEach(r=>{if(!memRej.some(m=>m.id===r.id&&m.by===r.by))memRej.push(r);});}else memRej.length=0;\n  return ok;}")

# 2. reads of unsent work go through the durable store; deliberate wipes clear both copies
rep("  try{const K=(typeof KEY!=='undefined'?KEY:'electrix_v29');['ex_queue','ex_faceid','ex_pwv','electrix_bio',K,K+'__stockq'].forEach(k=>localStorage.removeItem(k));localStorage.setItem('ex_off','1');}catch(e){}",
    "  try{const K=(typeof KEY!=='undefined'?KEY:'electrix_v29');['ex_queue','ex_faceid','ex_pwv','electrix_bio',K,K+'__stockq'].forEach(k=>localStorage.removeItem(k));localStorage.setItem('ex_off','1');}catch(e){}\n  try{await durDel(['ex_queue',mainKey()+'__stockq']);}catch(e){}")
rep("  try{const live=JSON.parse(localStorage.getItem('ex_queue')||'{}');", "  try{const live=JSON.parse(durRead('ex_queue')||'{}');")
rep("const sraw=localStorage.getItem(K+'__stockq');", "const sraw=durRead(K+'__stockq');")
rep("let cur=[];try{cur=JSON.parse(localStorage.getItem(SQK)||'[]');if(!Array.isArray(cur))cur=[];}catch(e){cur=[];}",
    "let cur=[];try{cur=JSON.parse(durRead(SQK)||'[]');if(!Array.isArray(cur))cur=[];}catch(e){cur=[];}")
rep("  try{localStorage.setItem(SQK,JSON.stringify(cur));localStorage.removeItem('ex_sqenc__'+uid);}catch(e){}}catch(e){}}",
    "  try{durPut(SQK,JSON.stringify(cur));localStorage.removeItem('ex_sqenc__'+uid);}catch(e){}}catch(e){}}")
rep("let stockArr=[];try{const raw=localStorage.getItem(SQK);", "let stockArr=[];try{const raw=durRead(SQK);")
rep("      ['ex_auth','ex_uid','ex_queue','electrix_bio','ex_faceid_asked','ex_faceid','ex_pwv',K,K+'__stockq'].forEach(k=>localStorage.removeItem(k));}catch(e){}",
    "      ['ex_auth','ex_uid','ex_queue','electrix_bio','ex_faceid_asked','ex_faceid','ex_pwv',K,K+'__stockq'].forEach(k=>localStorage.removeItem(k));}catch(e){}\n  try{await durDel(['ex_queue',mainKey()+'__stockq']);}catch(e){}")
rep("      ['ex_queue','electrix_bio','ex_faceid_asked','ex_faceid','ex_pwv',K,K+'__stockq'].forEach(k=>localStorage.removeItem(k));queue={};",
    "      ['ex_queue','electrix_bio','ex_faceid_asked','ex_faceid','ex_pwv',K,K+'__stockq'].forEach(k=>localStorage.removeItem(k));queue={};\n      try{await durDel(['ex_queue',K+'__stockq']);}catch(e){}")
# logout: the stash must be built from the newest copy of the waiting list (it may be only in IndexedDB/memory)
# (EX_logout uses the in-memory `queue`, which is already the newest copy.)
# 3. start-up: restore before anything looks at the waiting lists
rep("window.EX_boot=async function(){if(!REAL)return {real:false};",
    "window.EX_boot=async function(){if(!REAL)return {real:false};\n  try{await durRestore();}catch(e){}   // a newer copy of unsent work that only IndexedDB could hold")
# 4. the status pill: say when it is only in memory
open(p,'w').write(s); print('patched',p)
