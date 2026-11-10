/* p16 — plans open (almost) instantly. PILOT (Baruch 11/9): only for the people in the 'plansPilot' setting; everyone else
   keeps the current way, untouched. Switching the setting off puts a phone straight back on the current way and clears its
   saved plans.
   • originals stay on Trello; the server keeps only a SHORT-TERM, capped copy of recently opened plans (trello-files v4)
   • small first-page previews + thumbnails are made once and kept on the server (removed when the job is no longer active)
   • each phone gets, in the background, the full plans of ITS jobs (today + next 3 days on the schedule, jobs it worked
     this week, jobs it opens a lot) — before the crew gets there; never every plan for everyone
   • office / owner phones in the pilot also prepare NEW plans of active jobs (preview + server copy), so even the first
     person to open a new plan gets the preview at once
   • plans opened on this phone are kept on the phone; the phone's plan space is capped and the least-used go first
   • the plan reader: preview at once, sharp plan right after, pinch / double-tap / + − zoom up to 8x; the part on screen is
     redrawn sharp for small circuit numbers, panel schedules and notes
   • a plan this person may no longer see, or an old revision, is removed from the phone; a different person signing in
     on the phone, or signing out, clears all plans from it
   • pilot measurements (how long opening took, from where, size) are sent to the server for Baruch's report */
(function(){
if(window.EX_PLANS)return;
const STG=/\/staging\//.test(location.pathname);
const CN=(STG?'electrix-staging':'electrix')+'-plans';
const KB='https://plans.local/';
const IDX='ex_plans_idx',WHO='ex_plans_who';
const CAP_MAX=400*1048576,CAP_MIN=60*1048576,PV_CAP=40*1048576;
const PRE_FILES=25,PRE_BYTES=150*1048576,ONE_MAX=30*1048576,PREP_MAX=15,PREP_ONE=15*1048576;
const ACTIVE=['active','roughdone','inspection','ready','upcoming','priced'];
const ES={'Preview — loading the sharp plan…':'Vista previa — cargando el plano nítido…',"You can't open this file":'No puedes abrir este archivo','Could not open this PDF':'No se pudo abrir este PDF','Loading…':'Cargando…','Page':'Página','pages':'páginas','Tap ⬇ to download and open this file.':'Toca ⬇ para descargar y abrir este archivo.'};
const T=s=>{let es=false;try{es=lang()==='es';}catch(e){}if(es&&ES[s])return ES[s];try{return t(s)||s;}catch(e){return s;}};
const esc=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attRx=/\/attachments\/([0-9a-f]{24})/;
const tidOf=f=>f&&(f.tid||((String(f.url||'').match(attRx)||[])[1]))||null;
const isPlanFile=f=>!!f&&!f.d&&!!tidOf(f)&&(f.kind==='pdf'||/\.pdf$/i.test(f.name||'')||/pdf/i.test(f.mime||''));
const now=()=>Date.now();
let idx={};try{idx=JSON.parse(localStorage.getItem(IDX)||'{}')||{};}catch(e){idx={};}
const saveIdx=()=>{try{localStorage.setItem(IDX,JSON.stringify(idx));}catch(e){}};
const M=()=>{try{return me();}catch(e){return null;}};
const DD=()=>{try{return D;}catch(e){return null;}};   // the app's data (a page variable, not on window)
const vis=(f,m)=>{try{return typeof fileVisible==='function'?fileVisible(f,m):true;}catch(e){return true;}};
const stat={opens:[],preload:null};
// ---------- pilot switch: setting 'plansPilot' = list of people (or 'all'); anything else = off ----------
function on(){if(!window.EX_REAL&&!window.EX_PLANS_TEST)return false;const d=DD();const L=d&&d.plansPilot;const m=M();if(!m)return false;
  return L==='all'||(Array.isArray(L)&&L.includes(m.id));}
const handles=f=>on()&&isPlanFile(f);

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
function visiblePlans(){const m=M();const out={};((DD()||{}).sites||[]).forEach(s=>{if(!s)return;(s.files||[]).forEach(f=>{if(isPlanFile(f)&&vis(f,m))out[tidOf(f)]={f,s:s.id,stage:s.stage};});});return out;}
async function maintain(){const m=M();if(!m)return;
  if(!on()){if(Object.keys(idx).length)await clearAll();return;}     // pilot switched off for this person → the phone keeps nothing
  let w='';try{w=localStorage.getItem(WHO)||'';}catch(e){}
  if(w&&w!==m.id){await clearAll();}try{localStorage.setItem(WHO,m.id);}catch(e){}
  const V=visiblePlans();if(!Object.keys(V).length&&!((DD()||{}).sites||[]).length)return;   // data not loaded yet: decide nothing
  for(const tid of Object.keys(idx))if(!V[tid])await forget(tid);
  await trim();}

// ---------- server ----------
const FN=()=>String((window.EX_CFG||{}).url||'').replace(/\/$/,'')+'/functions/v1/trello-files';
async function hdrs(isJson){const C=window.EX_CFG||{};let s=null;try{s=window.EX_sb?(await EX_sb.auth.getSession()).data.session:null;}catch(e){}
  const h={apikey:C.anonKey||''};if(s)h.Authorization='Bearer '+s.access_token;if(isJson)h['Content-Type']='application/json';return h;}
async function resolve(items){if(!items.length||!(window.EX_CFG||{}).url)return {};
  try{const r=await fetch(FN()+'?resolve=1',{method:'POST',headers:await hdrs(true),body:JSON.stringify({items:items.slice(0,300)})});if(!r.ok)return {};const j=await r.json();return j.plans||{};}catch(e){return {};}}
async function getImg(tid,kind,hint){const k=tid+'-'+kind+'.jpg';let b=await getBlob(k);if(b&&b.size)return b;const u=hint&&hint[kind];if(!u)return null;
  try{const r=await fetch(u);if(!r.ok)return null;b=await r.blob();if(b.size&&await put(k,b,'image/jpeg'))touch(tid,{pb:((idx[tid]||{}).pb||0)+b.size});return b;}catch(e){return null;}}
async function loadPdf(f,site,hint,keep,now_){const tid=tidOf(f);let b=await getBlob(tid+'.pdf');if(b&&b.size){touch(tid,{s:site});return {blob:b,src:'phone'};}
  let r=null,src='trello';
  if(hint&&hint.pdf){try{r=await fetch(hint.pdf);if(r.ok)src='kept';else r=null;}catch(e){r=null;}}
  if(!r){r=await fetch(FN()+'?file='+encodeURIComponent(f.url)+'&site='+encodeURIComponent(site)+'&pc=1',{headers:await hdrs()});
    if(!r.ok)throw new Error(r.status===403?T("You can't open this file"):'HTTP '+r.status);src=r.headers.get('x-plan-src')||src;}
  b=await r.blob();
  // saved on the phone in the background — the plan is shown without waiting for the save
  if(keep!==false&&b.size&&b.size<=ONE_MAX){const bb=b;const save=()=>put(tid+'.pdf',bb,'application/pdf').then(ok=>{if(ok){touch(tid,{b:bb.size,s:site});trim();}});if(now_)await save();else setTimeout(save,1500);}
  return {blob:b,src};}
function netInfo(){const c=navigator.connection||{};return {type:c.effectiveType||'',down:c.downlink||null,save:!!c.saveData,os:/iPhone|iPad/.test(navigator.userAgent)?'ios':/Android/.test(navigator.userAgent)?'android':'other',online:navigator.onLine};}
function report(kind,data){if(!(window.EX_CFG||{}).url||!on())return;hdrs(true).then(h=>fetch(FN()+'?log=1',{method:'POST',headers:h,body:JSON.stringify({kind,data:Object.assign({net:netInfo(),shelf:used()},data)})})).catch(()=>{});}

// ---------- pdf.js ----------
const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
function lib(){if(window.pdfjsLib){try{pdfjsLib.GlobalWorkerOptions.workerSrc=WORKER;}catch(e){}return Promise.resolve(window.pdfjsLib);}
  return new Promise((ok,bad)=>{const s=document.createElement('script');s.src=PDFJS;s.crossOrigin='anonymous';s.onload=()=>{try{pdfjsLib.GlobalWorkerOptions.workerSrc=WORKER;}catch(e){}ok(window.pdfjsLib);};s.onerror=bad;document.head.appendChild(s);});}
const jpeg=(c,q)=>new Promise(ok=>c.toBlob(b=>ok(b),'image/jpeg',q));
const b64=b=>new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.readAsDataURL(b);});
// first-page preview (1400 px wide) + thumbnail (240 px), made once by the first phone that has the plan
async function makePreview(doc,tid,site,upload){try{const pg=await doc.getPage(1);const v0=pg.getViewport({scale:1});
    const vp=pg.getViewport({scale:1400/v0.width});const c=document.createElement('canvas');c.width=Math.floor(vp.width);c.height=Math.floor(vp.height);
    const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);await pg.render({canvasContext:x,viewport:vp}).promise;
    const pv=await jpeg(c,0.72);const sm=document.createElement('canvas');sm.width=240;sm.height=Math.round(c.height*240/c.width);
    sm.getContext('2d').drawImage(c,0,0,sm.width,sm.height);const th=await jpeg(sm,0.7);c.width=c.height=0;if(!pv||!th)return false;
    let pb=0;if(await put(tid+'-pv.jpg',pv,'image/jpeg'))pb+=pv.size;if(await put(tid+'-th.jpg',th,'image/jpeg'))pb+=th.size;touch(tid,{pb,s:site});
    if(upload&&(window.EX_CFG||{}).url){const r=await fetch(FN()+'?preview=1&site='+encodeURIComponent(site)+'&tid='+tid,{method:'POST',headers:await hdrs(true),body:JSON.stringify({pv:await b64(pv),th:await b64(th)})});return r.ok;}
    return true;}catch(e){return false;}}

// ---------- the plan reader (pilot) ----------
const BASE_CAP=2.5e6;          // the whole page is drawn up to ~4 million pixels (fast); the part on screen is then redrawn sharp
const ZMIN=0.6,ZMAX=8,BZ=1;   // the whole page is drawn once (fit to screen); past that only the part on screen is redrawn (no freezes)
const bz=()=>Math.min(R.zoom,BZ);
const R={doc:null,zoom:1,tok:0,pv:null,pages:[],io:null,far:null,detT:0,rerT:0,onFirst:null,dpr:1,w:0,sizes:[]};
const $=id=>document.getElementById(id);
function cancelAll(){R.pages.forEach(p=>{try{p.task&&p.task.cancel();}catch(e){}try{p.dtask&&p.dtask.cancel();}catch(e){}});}
function closeR(){R.tok++;cancelAll();try{R.io&&R.io.disconnect();R.far&&R.far.disconnect();}catch(e){}try{R.doc&&R.doc.destroy();}catch(e){}R.doc=null;R.pages=[];R.pv=null;R.onFirst=null;}
function shell(name){let o=$('exViewer');if(!o){o=document.createElement('div');o.id='exViewer';document.body.appendChild(o);}
  o.style.cssText='position:fixed;inset:0;z-index:700;background:#2b2b2e;display:flex;flex-direction:column';
  const B='border:0;background:#333;color:#fff;border-radius:10px;';
  o.innerHTML='<div style="display:flex;align-items:center;gap:8px;padding:calc(10px + env(safe-area-inset-top)) 10px 10px;color:#fff;background:#111">'
    +'<button onclick="EX_closeView()" style="'+B+'padding:9px 13px;font-size:15px">‹ '+esc(T('Back'))+'</button>'
    +'<div style="flex:1;min-width:0"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px">'+esc(name||'')+'</div><div id="p16pn" style="font-size:11.5px;color:#aaa">'+esc(T('Loading…'))+'</div></div>'
    +'<button onclick="EX_PLANS.zoomBy(1/1.4)" aria-label="−" style="'+B+'width:38px;height:38px;font-size:20px">−</button>'
    +'<button onclick="EX_PLANS.zoomBy(1.4)" aria-label="+" style="'+B+'width:38px;height:38px;font-size:20px">+</button>'
    +'<a id="p16dl" href="#" download="'+esc(String(name||'plan.pdf').replace(/[\\/:*?"<>|]/g,'_'))+'" aria-label="Download" style="color:#fff;text-decoration:none;background:#333;border-radius:10px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:17px">⬇</a></div>'
    +'<div id="p16box" style="flex:1;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y;position:relative"><div id="p16in" style="padding:8px 8px 30px;transform-origin:0 0"></div></div>';
  try{history.pushState({exv:1},'');}catch(e){}
  const box=$('p16box');R.w=Math.max(280,box.clientWidth-16);R.dpr=Math.min(3,window.devicePixelRatio||1);gestures(box);
  box.addEventListener('scroll',()=>{clearTimeout(R.detT);R.detT=setTimeout(details,160);},{passive:true});}
function showPreview(u){const inn=$('p16in');if(!inn||!u)return false;const p1=R.pages[0];
  if(p1){if(p1.c)return false;p1.el.innerHTML='<img src="'+esc(u)+'" style="display:block;width:100%;height:100%" alt="">';return true;}
  inn.innerHTML='<div style="margin:0 auto 8px;background:#fff;width:'+Math.round(R.w*R.zoom)+'px"><img src="'+esc(u)+'" style="display:block;width:100%" alt=""></div>';
  const pn=$('p16pn');if(pn)pn.textContent=T('Preview — loading the sharp plan…');return true;}
async function layout(){const inn=$('p16in');if(!inn||!R.doc)return;const tok=R.tok;
  const p1=await R.doc.getPage(1);const v1=p1.getViewport({scale:1});const asp=v1.height/v1.width;R.sizes=[];
  for(let i=1;i<=R.doc.numPages;i++)R.sizes.push(asp);
  if(tok!==R.tok)return;inn.innerHTML='';R.pages=[];
  for(let i=1;i<=R.doc.numPages;i++){const el=document.createElement('div');el.dataset.n=i;el.style.cssText='margin:0 auto 8px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4);position:relative;overflow:hidden';
    const p={n:i,el,c:null,cz:0,task:null,d:null,dtask:null,asp:R.sizes[i-1]};R.pages.push(p);size(p);inn.appendChild(el);
    if(i===1&&R.pv)el.innerHTML='<img src="'+esc(R.pv)+'" style="display:block;width:100%;height:100%" alt="">';}
  const box=$('p16box');
  R.io=new IntersectionObserver(es=>es.forEach(x=>{const p=R.pages[+x.target.dataset.n-1];if(p&&x.isIntersecting&&p.cz!==bz())base(p);}),{root:box,rootMargin:'500px 0px'});
  R.far=new IntersectionObserver(es=>es.forEach(x=>{const p=R.pages[+x.target.dataset.n-1];if(p&&!x.isIntersecting&&p.c){try{p.task&&p.task.cancel();}catch(e){}p.c.width=p.c.height=0;p.c.remove();p.c=null;p.cz=0;}}),{root:box,rootMargin:'2500px 0px'});
  R.pages.forEach(p=>{R.io.observe(p.el);R.far.observe(p.el);});
  const pn=$('p16pn');if(pn)pn.textContent=R.doc.numPages+' '+(R.doc.numPages===1?T('Page').toLowerCase():T('pages'));}
function size(p){const w=Math.round(R.w*R.zoom);p.el.style.width=w+'px';p.el.style.height=Math.round(w*p.asp)+'px';}
// the whole page, at a size the phone draws quickly; swapped in only when ready (no white flash)
async function base(p){if(!R.doc)return;const tok=R.tok,z=bz();try{p.task&&p.task.cancel();}catch(e){}
  try{const pg=await R.doc.getPage(p.n);const v0=pg.getViewport({scale:1});const cssW=R.w*z;const sc=cssW/v0.width;const cssH=v0.height*sc;
    let px=R.dpr;if(cssW*cssH*px*px>BASE_CAP)px=Math.max(0.5,Math.sqrt(BASE_CAP/(cssW*cssH)));
    const vp=pg.getViewport({scale:sc*px});const c=document.createElement('canvas');c.width=Math.floor(vp.width);c.height=Math.floor(vp.height);
    c.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%';const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
    p.task=pg.render({canvasContext:x,viewport:vp});await p.task.promise;p.task=null;if(tok!==R.tok||z!==bz()){c.width=c.height=0;return;}
    p.asp=v0.height/v0.width;size(p);const old=p.c;p.el.querySelectorAll('img').forEach(i=>i.remove());p.el.insertBefore(c,p.el.firstChild);p.c=c;p.cz=z;p.px=px;
    if(old){old.width=old.height=0;old.remove();}
    if(p.n===1&&R.onFirst){const f=R.onFirst;R.onFirst=null;try{f();}catch(e){}}
    clearTimeout(R.detT);R.detT=setTimeout(details,60);}
  catch(e){p.task=null;}}
// the part of the page on screen, redrawn at the phone's full sharpness (small circuit numbers, panel schedules, notes)
async function details(){const box=$('p16box');if(!box||!R.doc)return;const tok=R.tok,z=R.zoom;const br=box.getBoundingClientRect();
  for(const p of R.pages){if(!p.c)continue;const r=p.el.getBoundingClientRect();
    const x0=Math.max(r.left,br.left),y0=Math.max(r.top,br.top),x1=Math.min(r.right,br.right),y1=Math.min(r.bottom,br.bottom);
    if(x1-x0<20||y1-y0<20){if(p.d){p.d.remove();p.d=null;}continue;}
    if(p.px*p.cz/z>=R.dpr*0.98){if(p.d){p.d.remove();p.d=null;}continue;}   // the whole page is already fully sharp at this zoom
    const rx=x0-r.left,ry=y0-r.top,rw=x1-x0,rh=y1-y0;
    if(p.d&&p.dz===z&&rx>=p.dr[0]&&ry>=p.dr[1]&&rx+rw<=p.dr[0]+p.dr[2]&&ry+rh<=p.dr[1]+p.dr[3])continue;   // already sharp here
    try{p.dtask&&p.dtask.cancel();}catch(e){}
    const mx=rw*0.12,my=rh*0.12;const ax=Math.max(0,rx-mx),ay=Math.max(0,ry-my),aw=Math.min(r.width-ax,rw+2*mx),ah=Math.min(r.height-ay,rh+2*my);
    try{const pg=await R.doc.getPage(p.n);const v0=pg.getViewport({scale:1});const sc=r.width/v0.width;const k=R.dpr;
      const vp=pg.getViewport({scale:sc*k,offsetX:-ax*k,offsetY:-ay*k});const c=document.createElement('canvas');c.width=Math.floor(aw*k);c.height=Math.floor(ah*k);
      c.style.cssText='position:absolute;left:'+ax+'px;top:'+ay+'px;width:'+aw+'px;height:'+ah+'px;pointer-events:none';
      const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);
      p.dtask=pg.render({canvasContext:x,viewport:vp});await p.dtask.promise;p.dtask=null;if(tok!==R.tok||z!==R.zoom){c.width=c.height=0;return;}
      if(p.d){p.d.width=p.d.height=0;p.d.remove();}p.el.appendChild(c);p.d=c;p.dz=z;p.dr=[ax,ay,aw,ah];}
    catch(e){p.dtask=null;}}}
// zoom around a point on screen (the plan under the finger stays under the finger)
function zoomTo(z,cx,cy){const box=$('p16box');if(!box||!R.pages.length)return;z=Math.max(ZMIN,Math.min(ZMAX,z));if(Math.abs(z-R.zoom)<0.001)return;
  const br=box.getBoundingClientRect();if(cx==null){cx=br.width/2;cy=br.height/2;}
  const k=z/R.zoom;const sx=box.scrollLeft+cx,sy=box.scrollTop+cy;R.zoom=z;cancelAll();
  R.pages.forEach(p=>{size(p);if(p.d){p.d.width=p.d.height=0;p.d.remove();p.d=null;}});   // the drawn page stretches at once (sharp again a moment later)
  box.scrollLeft=sx*k-cx;box.scrollTop=sy*k-cy;
  clearTimeout(R.rerT);R.rerT=setTimeout(()=>{const b=box.getBoundingClientRect();let any=false;R.pages.forEach(p=>{const r=p.el.getBoundingClientRect();if(r.bottom>b.top-500&&r.top<b.bottom+500&&p.cz!==bz()){base(p);any=true;}});if(!any){clearTimeout(R.detT);R.detT=setTimeout(details,30);}},200);}
const zoomBy=(f,cx,cy)=>zoomTo(R.zoom*f,cx,cy);
function gestures(box){let st=null,lastTap=0;const inn=()=>$('p16in');
  const mid=(a,b)=>{const r=box.getBoundingClientRect();return [(a.clientX+b.clientX)/2-r.left,(a.clientY+b.clientY)/2-r.top];};
  const dist=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
  box.addEventListener('touchstart',e=>{if(e.touches.length===2){const [cx,cy]=mid(e.touches[0],e.touches[1]);st={d0:dist(e.touches[0],e.touches[1]),cx,cy,s:1};e.preventDefault();}
    else if(e.touches.length===1){const t0=now();if(t0-lastTap<300){const r=box.getBoundingClientRect();zoomBy(R.zoom<2.5?2:1/R.zoom,e.touches[0].clientX-r.left,e.touches[0].clientY-r.top);lastTap=0;e.preventDefault();}else lastTap=t0;}},{passive:false});
  box.addEventListener('touchmove',e=>{if(!st||e.touches.length!==2)return;e.preventDefault();let s=dist(e.touches[0],e.touches[1])/st.d0;s=Math.max(ZMIN/R.zoom,Math.min(ZMAX/R.zoom,s));st.s=s;
    const i=inn();if(i){i.style.transformOrigin=(box.scrollLeft+st.cx)+'px '+(box.scrollTop+st.cy)+'px';i.style.transform='scale('+s+')';}},{passive:false});
  const end=()=>{if(!st)return;const s=st.s,cx=st.cx,cy=st.cy;st=null;const i=inn();if(i)i.style.transform='';zoomTo(R.zoom*s,cx,cy);};
  box.addEventListener('touchend',e=>{if(st&&e.touches.length<2)end();});box.addEventListener('touchcancel',end);}
function view(name,opts){closeR();shell(name);const my=R.tok;R.zoom=1;R.pv=opts.preview||null;R.onFirst=opts.onFirst||null;if(R.pv)showPreview(R.pv);
  Promise.all([lib(),opts.load()]).then(([L,src])=>{const o=typeof src==='string'?{url:src}:src;const a=$('p16dl');if(a)a.href=o.url;
      // a kept copy on our storage is read in pieces: page 1 can be drawn before the whole file has arrived
      return L.getDocument(o.range?{url:o.url,isEvalSupported:false,rangeChunkSize:262144,disableStream:true,disableAutoFetch:false}:{url:o.url,isEvalSupported:false}).promise.then(doc=>{doc._p16range=!!o.range;return doc;});})
    .then(async doc=>{if(my!==R.tok){try{doc.destroy();}catch(e){}return;}R.doc=doc;await layout();try{opts.onDoc&&opts.onDoc(doc);}catch(e){}})
    .catch(err=>{if(my!==R.tok)return;const i=$('p16in');if(i)i.innerHTML='<div style="color:#ddd;padding:24px 14px;font-size:15px">'+esc(T('Could not open this PDF'))+' — '+esc(err&&err.message?err.message:T('Tap ⬇ to download and open this file.'))+'</div>';const pn=$('p16pn');if(pn)pn.textContent='';});}
if(typeof window.EX_closeView==='function'){const _c=window.EX_closeView;window.EX_closeView=function(){closeR();return _c.apply(this,arguments);};try{EX_closeView=window.EX_closeView;}catch(e){}}

// ---------- open a plan: preview at once, then the sharp plan ----------
async function open(f,site){const tid=tidOf(f);const t0=performance.now();const rec={tid,bytes:+f.bytes||0,pv:null,first:null,src:null};stat.opens.push(rec);
  const pvb=await getBlob(tid+'-pv.jpg');const pvUrl=pvb?URL.createObjectURL(pvb):null;if(pvUrl)rec.pv=Math.round(performance.now()-t0);
  // the server is asked for the preview at the same time as the plan itself — nothing waits for the other
  const hintP=pvb?Promise.resolve({}):resolve([{site,tid}]).then(h=>h[tid]||{}).catch(()=>({}));
  let got=!!pvb;
  const onShelf=!!(idx[tid]&&idx[tid].b);
  view(f.name,{preview:pvUrl,load:async()=>{
      // the plan is fetched at once — from the phone, our kept copy or Trello — without waiting for anything else
      // (reading the kept copy in pieces could show page 1 sooner on big sets; left off until it is measured on real phones)
      const r=await loadPdf(f,site,null);rec.src=r.src;rec.bytes=r.blob.size;rec.loaded=Math.round(performance.now()-t0);return URL.createObjectURL(r.blob);},
    onFirst:()=>{rec.first=Math.round(performance.now()-t0);setTimeout(()=>report('open',rec),1500);},
    onDoc:doc=>{hintP.then(h=>{if(got||h.pv)return;got=true;setTimeout(()=>{makePreview(doc,tid,site,true);},800);});
      if(doc._p16range)doc.getData().then(async data=>{const b=new Blob([data],{type:'application/pdf'});rec.bytes=b.size;
        if(b.size<=ONE_MAX&&await put(tid+'.pdf',b,'application/pdf')){touch(tid,{b:b.size,s:site});trim();}}).catch(()=>{});}});
  if(!pvb)hintP.then(async h=>{if(!h.pv||(onShelf)||((+f.bytes||0)>0&&(+f.bytes||0)<1500000))return;const b=await getImg(tid,'pv',h);if(!b)return;got=true;const u=URL.createObjectURL(b);
    if(!rec.first&&showPreview(u)){R.pv=u;rec.pv=Math.round(performance.now()-t0);}});}

// ---------- which jobs this phone gets ready in the background (before the crew gets there) ----------
function prioritySites(m){const d=DD()||{};const out=[];const add=id=>{if(id&&!out.includes(id))out.push(id);};const today=new Date();today.setHours(12,0,0,0);
  const staff=m&&(['owner','office'].includes(m.role)||m.all);const mgr=m&&m.role==='manager';
  const crews=staff||mgr?(d.crews||[]).map(c=>c&&c.id).filter(Boolean):(m&&m.crew?[m.crew]:[]);
  for(let i=0;i<4;i++){const k=dkey(new Date(today.getTime()+i*864e5));
    crews.forEach(c=>{try{(effectiveAsgs(c,k)||[]).forEach(a=>add(a.site));}catch(e){}});
    try{(loansForDay(k)||[]).forEach(a=>{if(a&&(a.emp===m.id||a.who===m.id))add(a.site);});}catch(e){}}
  const wk=now()-7*864e5;(d.punches||[]).filter(p=>p&&p.who===(m&&m.id)&&p.in>wk&&p.site).sort((a,b)=>b.in-a.in).forEach(p=>add(p.site));
  Object.values(idx).filter(x=>x.s&&x.u>now()-14*864e5&&x.b).sort((a,b)=>b.u-a.u).forEach(x=>add(x.s));
  if(mgr)(d.sites||[]).filter(s=>s&&ACTIVE.includes(s.stage)&&(typeof mgrIds==='function'?mgrIds(s):[]).includes(m.id)).forEach(s=>add(s.id));
  return out.filter(id=>(d.sites||[]).some(s=>s&&s.id===id));}
let busy=false;
async function preload(why){if(busy||!on()||!navigator.onLine)return;const con=navigator.connection;if(con&&con.saveData)return;const m=M();if(!m)return;
  busy=true;const st={why,at:now(),pdfs:0,bytes:0,previews:0,made:0,prepared:0,skipped:0};stat.preload=st;
  try{await maintain();const V=visiblePlans();const pri=prioritySites(m);
    const want=[];pri.forEach(sid=>{Object.entries(V).filter(([,x])=>x.s===sid).sort((a,b)=>(b[1].f.ts||0)-(a[1].f.ts||0)).forEach(([tid,x])=>want.push({tid,f:x.f,s:sid}));});
    // previews: the priority plans + the newest plans of active jobs this person can see (small images)
    const act=Object.entries(V).filter(([,x])=>ACTIVE.includes(x.stage)).sort((a,b)=>(b[1].f.ts||0)-(a[1].f.ts||0)).slice(0,80).map(([tid,x])=>({tid,f:x.f,s:x.s}));
    const all=[...want,...act.filter(a=>!want.some(w=>w.tid===a.tid))];
    const H=await resolve(all.map(x=>({site:x.s,tid:x.tid})));
    for(const x of all){const h=H[x.tid]||{};if(!(idx[x.tid]||{}).pb&&(h.pv||h.th)){if(await getImg(x.tid,'pv',h))st.previews++;await getImg(x.tid,'th',h);}}
    // full plans for this phone's jobs, within the budget (today's jobs first)
    let n=0,bytes=0;const L=await lib().catch(()=>null);
    for(const x of want){if(n>=PRE_FILES||bytes>=PRE_BYTES||!navigator.onLine||!on())break;if((idx[x.tid]||{}).b){n++;bytes+=idx[x.tid].b;continue;}
      const sz=+x.f.bytes||0;if(sz>ONE_MAX||bytes+sz>PRE_BYTES){st.skipped++;continue;}
      try{const r=await loadPdf(x.f,x.s,H[x.tid],true,true);n++;bytes+=r.blob.size;st.pdfs++;st.bytes+=r.blob.size;
        if(L&&!(idx[x.tid]||{}).pb&&!(H[x.tid]||{}).pv&&st.made<8){const doc=await L.getDocument({data:new Uint8Array(await r.blob.arrayBuffer()),isEvalSupported:false}).promise;
          if(await makePreview(doc,x.tid,x.s,true))st.made++;try{doc.destroy();}catch(e){}}}catch(e){st.skipped++;}}
    // office / owner phones: prepare NEW plans of active jobs (preview + server copy), so the first person to open one waits less
    if(L&&m&&(['owner','office'].includes(m.role)||m.all)){const fresh=act.filter(x=>!(H[x.tid]||{}).pv&&!(idx[x.tid]||{}).pb&&(x.f.ts||0)>now()-21*864e5&&(+x.f.bytes||0)<=PREP_ONE).slice(0,PREP_MAX);
      for(const x of fresh){if(!navigator.onLine||!on())break;try{const r=await loadPdf(x.f,x.s,null,false);const doc=await L.getDocument({data:new Uint8Array(await r.blob.arrayBuffer()),isEvalSupported:false}).promise;
        if(await makePreview(doc,x.tid,x.s,true))st.prepared++;try{doc.destroy();}catch(e){}}catch(e){st.skipped++;}}}
    await trim();}
  catch(e){st.error=String(e&&e.message||e);}finally{st.done=now();busy=false;if(st.pdfs||st.previews||st.made||st.prepared||st.error)report('preload',st);}}

// sign out → this phone keeps no plans
if(typeof window.EX_logout==='function'){const lo=window.EX_logout;window.EX_logout=async function(){try{await clearAll();localStorage.removeItem(WHO);}catch(e){}return lo.apply(this,arguments);};}
// when it runs: soon after the app opens, when it comes back after a while, every 30 minutes while open, and as soon as
// the schedule changes (a new job for tomorrow gets its plans right away)
let last=0,schedSig='';const sig=()=>{const d=DD()||{};const m=M();try{return JSON.stringify(prioritySites(m))+'|'+Object.keys(visiblePlans()).length;}catch(e){return '';}};
const kick=why=>{if(!on())return maintain();const s=sig();if(why!=='first'&&now()-last<30*60e3&&s===schedSig)return;last=now();schedSig=s;preload(why);};
setTimeout(()=>kick('first'),8000);setTimeout(()=>{if(on())lib().catch(()=>{});},5000);   // the plan reader is ready before the first plan is tappedsetInterval(()=>kick('timer'),60e3);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>kick('back'),3000);});
window.addEventListener('online',()=>setTimeout(()=>kick('online'),3000));
window.EX_PLANS={handles,on,open,preload,maintain,clearAll,stat,used,tidOf,makePreview,zoomBy,zoomTo,_R:R,_idx:()=>idx,CN};
})();
