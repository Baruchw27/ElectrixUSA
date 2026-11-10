/* p16 — plans open (almost) instantly. Baruch 11/9: "My plans need to load in a split second" + his 10 requirements:
   • originals stay on Trello; the server keeps only a SHORT-TERM, capped copy of recently opened plans (trello-files v4)
   • small first-page previews + thumbnails are made once (by the first phone that opens a plan) and kept on the server
   • each phone gets, in the background, the full plans of ITS jobs (today + next 3 days on the schedule, jobs it worked
     this week, jobs it opens a lot) — never every plan for everyone
   • plans opened on this phone are kept on the phone; the phone's plan space is capped and the least-used go first
   • opening a plan shows the preview at once, then the sharp plan as soon as it is ready
   • a plan this person may no longer see, or an old revision, is removed from the phone; a different person signing in
     on the phone, or signing out, clears all plans from it */
(function(){
if(window.EX_PLANS)return;
const STG=/\/staging\//.test(location.pathname);
const CN=(STG?'electrix-staging':'electrix')+'-plans';
const KB='https://plans.local/';
const IDX='ex_plans_idx',WHO='ex_plans_who';
const CAP_MAX=400*1048576,CAP_MIN=60*1048576,PV_CAP=40*1048576;
const PRE_FILES=25,PRE_BYTES=150*1048576,ONE_MAX=30*1048576;
const ES={'Loading the full plan…':'Cargando el plano completo…','Preview — loading the sharp plan…':'Vista previa — cargando el plano nítido…',"You can't open this file":'No puedes abrir este archivo','Could not open the file':'No se pudo abrir el archivo','Opening':'Abriendo'};
const T=s=>{let es=false;try{es=lang()==='es';}catch(e){}if(es&&ES[s])return ES[s];try{return t(s)||s;}catch(e){return s;}};
const attRx=/\/attachments\/([0-9a-f]{24})/;
const tidOf=f=>f&&(f.tid||((String(f.url||'').match(attRx)||[])[1]))||null;
const isPlan=f=>!!f&&!f.d&&!!tidOf(f)&&(f.kind==='pdf'||/\.pdf$/i.test(f.name||'')||/pdf/i.test(f.mime||''));
const now=()=>Date.now();
let idx={};try{idx=JSON.parse(localStorage.getItem(IDX)||'{}')||{};}catch(e){idx={};}
const saveIdx=()=>{try{localStorage.setItem(IDX,JSON.stringify(idx));}catch(e){}};
const M=()=>{try{return me();}catch(e){return null;}};
const DD=()=>{try{return D;}catch(e){return null;}};   // the app's data (a page variable, not on window)
const vis=(f,m)=>{try{return typeof fileVisible==='function'?fileVisible(f,m):true;}catch(e){return true;}};
const stat={opens:[],preload:null};

// ---------- the phone's plan shelf (Cache Storage, private to this app) ----------
async function ca(){return caches.open(CN);}
async function getBlob(k){try{const c=await ca();const r=await c.match(KB+k);return r?await r.blob():null;}catch(e){return null;}}
async function put(k,b,type){try{const c=await ca();await c.put(KB+k,new Response(b,{headers:{'content-type':type}}));return true;}catch(e){return false;}}
async function del(k){try{const c=await ca();await c.delete(KB+k);}catch(e){}}
function touch(tid,p){idx[tid]=Object.assign(idx[tid]||{},p||{},{u:now()});saveIdx();}
async function forget(tid){await del(tid+'.pdf');await del(tid+'-pv.jpg');await del(tid+'-th.jpg');delete idx[tid];saveIdx();}
async function clearAll(){try{await caches.delete(CN);}catch(e){}idx={};saveIdx();}
async function capBytes(){let q=0;try{const e=await navigator.storage.estimate();q=e.quota||0;}catch(e){}return Math.max(CAP_MIN,Math.min(CAP_MAX,q?q*0.25:CAP_MAX));}
const used=()=>{let pdf=0,pv=0,n=0;Object.values(idx).forEach(x=>{if(x.b){pdf+=x.b;n++;}pv+=x.pb||0;});return {pdf,pv,n};};
// least recently used plans leave first; previews (small) only when they pass their own cap
async function trim(){const cap=await capBytes();let {pdf,pv}=used();const L=Object.entries(idx).sort((a,b)=>(a[1].u||0)-(b[1].u||0));
  for(const [tid,x] of L){if(pdf<=cap)break;if(x.b){await del(tid+'.pdf');pdf-=x.b;x.b=0;}}
  for(const [tid,x] of L){if(pv<=PV_CAP)break;if(x.pb){await del(tid+'-pv.jpg');await del(tid+'-th.jpg');pv-=x.pb;x.pb=0;}}
  saveIdx();}
// plans this person can see right now (job still there, file still on it, still allowed) — anything else leaves the phone
function visiblePlans(){const m=M();const out={};((DD()||{}).sites||[]).forEach(s=>{if(!s)return;(s.files||[]).forEach(f=>{if(isPlan(f)&&vis(f,m))out[tidOf(f)]={f,s:s.id,stage:s.stage};});});return out;}
async function maintain(){const m=M();if(!m)return;let w='';try{w=localStorage.getItem(WHO)||'';}catch(e){}
  if(w&&w!==m.id){await clearAll();}try{localStorage.setItem(WHO,m.id);}catch(e){}
  const V=visiblePlans();if(!Object.keys(V).length&&!((DD()||{}).sites||[]).length)return;   // data not loaded yet: decide nothing
  for(const tid of Object.keys(idx))if(!V[tid])await forget(tid);
  await trim();}

// ---------- server ----------
const FN=()=>String((window.EX_CFG||{}).url||'').replace(/\/$/,'')+'/functions/v1/trello-files';
async function hdrs(isJson){const C=window.EX_CFG||{};let s=null;try{s=window.EX_sb?(await EX_sb.auth.getSession()).data.session:null;}catch(e){}
  const h={apikey:C.anonKey||''};if(s)h.Authorization='Bearer '+s.access_token;if(isJson)h['Content-Type']='application/json';return h;}
async function resolve(items){if(!items.length||!window.EX_REAL||!(window.EX_CFG||{}).url)return {};
  try{const r=await fetch(FN()+'?resolve=1',{method:'POST',headers:await hdrs(true),body:JSON.stringify({items:items.slice(0,300)})});if(!r.ok)return {};const j=await r.json();return j.plans||{};}catch(e){return {};}}
async function getImg(tid,kind,hint){const k=tid+'-'+kind+'.jpg';let b=await getBlob(k);if(b&&b.size)return b;const u=hint&&hint[kind];if(!u)return null;
  try{const r=await fetch(u);if(!r.ok)return null;b=await r.blob();if(b.size&&await put(k,b,'image/jpeg'))touch(tid,{pb:((idx[tid]||{}).pb||0)+b.size});return b;}catch(e){return null;}}
async function loadPdf(f,site,hint){const tid=tidOf(f);let b=await getBlob(tid+'.pdf');if(b&&b.size){touch(tid,{s:site});return {blob:b,src:'phone'};}
  let r=null,src='trello';
  if(hint&&hint.pdf){try{r=await fetch(hint.pdf);if(r.ok)src='kept';else r=null;}catch(e){r=null;}}
  if(!r){r=await fetch(FN()+'?file='+encodeURIComponent(f.url)+'&site='+encodeURIComponent(site)+'&pc=1',{headers:await hdrs()});
    if(!r.ok)throw new Error(r.status===403?T("You can't open this file"):'HTTP '+r.status);src=r.headers.get('x-plan-src')||src;}
  b=await r.blob();
  if(b.size&&b.size<=ONE_MAX&&await put(tid+'.pdf',b,'application/pdf')){touch(tid,{b:b.size,s:site});trim();}
  return {blob:b,src};}

// ---------- first-page preview + thumbnail (made once, by the first phone that has the plan) ----------
const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
function lib(){if(window.pdfjsLib){try{pdfjsLib.GlobalWorkerOptions.workerSrc=WORKER;}catch(e){}return Promise.resolve(window.pdfjsLib);}
  return new Promise((ok,bad)=>{const s=document.createElement('script');s.src=PDFJS;s.crossOrigin='anonymous';s.onload=()=>{try{pdfjsLib.GlobalWorkerOptions.workerSrc=WORKER;}catch(e){}ok(window.pdfjsLib);};s.onerror=bad;document.head.appendChild(s);});}
const jpeg=(c,q)=>new Promise(ok=>c.toBlob(b=>ok(b),'image/jpeg',q));
const b64=b=>new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.readAsDataURL(b);});
async function makePreview(doc,tid,site,upload){try{const pg=await doc.getPage(1);const v0=pg.getViewport({scale:1});
    const draw=async w=>{const vp=pg.getViewport({scale:w/v0.width});const c=document.createElement('canvas');c.width=Math.floor(vp.width);c.height=Math.floor(vp.height);
      const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);await pg.render({canvasContext:x,viewport:vp}).promise;return c;};
    const big=await draw(1400);const pv=await jpeg(big,0.72);const sm=document.createElement('canvas');sm.width=240;sm.height=Math.round(big.height*240/big.width);
    sm.getContext('2d').drawImage(big,0,0,sm.width,sm.height);const th=await jpeg(sm,0.7);if(!pv||!th)return false;
    let pb=0;if(await put(tid+'-pv.jpg',pv,'image/jpeg'))pb+=pv.size;if(await put(tid+'-th.jpg',th,'image/jpeg'))pb+=th.size;touch(tid,{pb,s:site});
    if(upload&&window.EX_REAL){const r=await fetch(FN()+'?preview=1&site='+encodeURIComponent(site)+'&tid='+tid,{method:'POST',headers:await hdrs(true),body:JSON.stringify({pv:await b64(pv),th:await b64(th)})});return r.ok;}
    return true;}catch(e){return false;}}

// ---------- open a plan: preview at once, then the sharp plan ----------
async function open(f,site){const tid=tidOf(f);const t0=performance.now();const rec={tid,name:f.name,t0,pv:null,first:null,src:null};stat.opens.push(rec);
  const pvb=await getBlob(tid+'-pv.jpg');const pvUrl=pvb?URL.createObjectURL(pvb):null;if(pvUrl)rec.pv=performance.now()-t0;
  // the server is asked for the preview at the same time as the plan itself — nothing waits for the other
  const hintP=pvb?Promise.resolve({}):resolve([{site,tid}]).then(h=>h[tid]||{}).catch(()=>({}));
  let got=!!pvb;
  EX_view('',f.name,'pdf',{preview:pvUrl,load:async()=>{const r=await loadPdf(f,site,null);rec.src=r.src;rec.bytes=r.blob.size;return URL.createObjectURL(r.blob);},
    onFirst:()=>{rec.first=performance.now()-t0;},
    onDoc:doc=>{hintP.then(h=>{if(got||h.pv)return;got=true;setTimeout(()=>{makePreview(doc,tid,site,true);},300);});}});
  if(!pvb)hintP.then(async h=>{if(!h.pv)return;const b=await getImg(tid,'pv',h);if(!b)return;got=true;const u=URL.createObjectURL(b);
    if(window.P13PDF&&P13PDF.setPreview&&P13PDF.setPreview(u))rec.pv=performance.now()-t0;});}

// ---------- which jobs this phone gets ready in the background ----------
function prioritySites(m){const out=[];const add=id=>{if(id&&!out.includes(id))out.push(id);};const today=new Date();today.setHours(12,0,0,0);
  const staff=m&&(['owner','office'].includes(m.role)||m.all);const mgr=m&&m.role==='manager';
  const crews=staff||mgr?(D.crews||[]).map(c=>c&&c.id).filter(Boolean):(m&&m.crew?[m.crew]:[]);
  for(let d=0;d<4;d++){const k=dkey(new Date(today.getTime()+d*864e5));
    crews.forEach(c=>{try{(effectiveAsgs(c,k)||[]).forEach(a=>add(a.site));}catch(e){}});
    try{(loansForDay(k)||[]).forEach(a=>{if(a&&(a.emp===m.id||a.who===m.id))add(a.site);});}catch(e){}}
  const wk=now()-7*864e5;(D.punches||[]).filter(p=>p&&p.who===(m&&m.id)&&p.in>wk&&p.site).sort((a,b)=>b.in-a.in).forEach(p=>add(p.site));
  Object.values(idx).filter(x=>x.s&&x.u>now()-14*864e5).sort((a,b)=>b.u-a.u).forEach(x=>add(x.s));
  if(mgr)(D.sites||[]).filter(s=>s&&['active','roughdone','inspection','ready'].includes(s.stage)&&(typeof mgrIds==='function'?mgrIds(s):[]).includes(m.id)).forEach(s=>add(s.id));
  return out.filter(id=>(D.sites||[]).some(s=>s&&s.id===id));}
let busy=false;
async function preload(why){if(busy||!window.EX_REAL||!navigator.onLine)return;const con=navigator.connection;if(con&&con.saveData)return;const m=M();if(!m)return;
  busy=true;const st={why,at:now(),pdfs:0,bytes:0,previews:0,made:0,skipped:0};stat.preload=st;
  try{await maintain();const V=visiblePlans();const pri=prioritySites(m);
    const want=[];pri.forEach(sid=>{Object.entries(V).filter(([,x])=>x.s===sid).sort((a,b)=>(b[1].f.ts||0)-(a[1].f.ts||0)).forEach(([tid,x])=>want.push({tid,f:x.f,s:sid}));});
    // previews: the priority plans + the newest plans of active jobs this person can see (small images)
    const act=Object.entries(V).filter(([,x])=>['active','roughdone','inspection','ready','upcoming'].includes(x.stage)).sort((a,b)=>(b[1].f.ts||0)-(a[1].f.ts||0)).slice(0,80).map(([tid,x])=>({tid,f:x.f,s:x.s}));
    const all=[...want,...act.filter(a=>!want.some(w=>w.tid===a.tid))];
    const H=await resolve(all.map(x=>({site:x.s,tid:x.tid})));
    for(const x of all){const h=H[x.tid]||{};if(!(idx[x.tid]||{}).pb&&(h.pv||h.th)){if(await getImg(x.tid,'pv',h))st.previews++;await getImg(x.tid,'th',h);}}
    // full plans for this phone's jobs, within the budget
    let n=0,bytes=0;for(const x of want){if(n>=PRE_FILES||bytes>=PRE_BYTES||!navigator.onLine)break;if((idx[x.tid]||{}).b){n++;bytes+=idx[x.tid].b;continue;}
      const sz=+x.f.bytes||0;if(sz>ONE_MAX||bytes+sz>PRE_BYTES){st.skipped++;continue;}
      try{const r=await loadPdf(x.f,x.s,H[x.tid]);n++;bytes+=r.blob.size;st.pdfs++;st.bytes+=r.blob.size;
        if(!(idx[x.tid]||{}).pb&&!(H[x.tid]||{}).pv&&st.made<8){const L=await lib();const doc=await L.getDocument({data:new Uint8Array(await r.blob.arrayBuffer()),isEvalSupported:false}).promise;
          if(await makePreview(doc,x.tid,x.s,true))st.made++;try{doc.destroy();}catch(e){}}}catch(e){st.skipped++;}}
    await trim();}
  catch(e){st.error=String(e&&e.message||e);}finally{st.done=now();busy=false;}}

// sign out → this phone keeps no plans
if(typeof window.EX_logout==='function'){const lo=window.EX_logout;window.EX_logout=async function(){try{await clearAll();localStorage.removeItem(WHO);}catch(e){}return lo.apply(this,arguments);};}
// start quietly after the app is up, then every 4 hours while it is open (and when it comes back after a while)
let last=0;const kick=why=>{if(now()-last<4*3600e3&&why!=='first')return;last=now();preload(why);};
setTimeout(()=>kick('first'),15000);setInterval(()=>kick('timer'),15*60e3);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>kick('back'),5000);});
window.EX_PLANS={handles:isPlan,open,preload,maintain,clearAll,stat,used,tidOf,makePreview,_idx:()=>idx,CN};
})();
