/* Electrix USA — P8 "clean & professional" (Baruch 2026-10-27 21:43: all 8 ideas).
   1 icons, not emojis (the last few emojis get line icons — p5 does the swap)
   2 every page built the same way: a title at the top (Schedule, Estimates, Messages got one; Tasks' notes moved down)
   3 colors with one meaning: blue = buttons/links/active, red = urgent/late, orange = waiting, green = done;
     buttons are dark (main) or white (second) — no green/brown buttons (Punch keeps green in / red out)
   4 job page: a 4-box summary on top (today here · open tasks · O&R step · hours this week)
   5 Home: no big logo (the Electrix icon is at the top of every page)
   6 swipe on Home tasks (right = done, left = tomorrow) and pull down to refresh
   7 a gray outline while the first data loads; calmer "nothing here" lines
   8 Spanish: the newer screens' words added to the dictionary
   Off: window.EX_P8_OFF. */
(function(){
if(window.EX_P8_OFF)return;
const $=id=>document.getElementById(id);
const M=()=>{try{return me();}catch(e){return null;}};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsq=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const tt=s=>{try{return t(s);}catch(e){return s;}};

/* ───────── 8. Spanish for the newer screens ───────── */
try{if(typeof ES==='object')Object.assign(ES,{
 "Schedule":"Horario","Estimates":"Presupuestos","Messages":"Mensajes","Today here":"Hoy aquí","Open tasks":"Tareas abiertas","Hours this week":"Horas esta semana",
 "Nobody today":"Nadie hoy","in":"adentro","Pull to refresh":"Desliza para actualizar","Release to refresh":"Suelta para actualizar","Refreshing…":"Actualizando…",
 "Needs action":"Requiere acción","My tasks":"Mis tareas","On site":"En obra","Crews out":"Cuadrillas","Crews today":"Cuadrillas hoy","Crews tomorrow":"Cuadrillas mañana",
 "On the job now":"En la obra ahora","Not in yet":"Aún no llegan","Meetings & inspections":"Reuniones e inspecciones","Material waiting":"Material pendiente",
 "Show all":"Ver todo","Show less":"Ver menos","Waiting on others":"Esperando a otros","All caught up.":"Todo al día.","No job":"Sin trabajo","Settings":"Ajustes",
 "O&R":"O&R","New O&R request":"Nueva solicitud O&R","Our move":"Nos toca","O&R’s move":"Le toca a O&R","Customer pays":"Paga el cliente","To do":"Por hacer","By step":"Por paso",
 "Needs action today":"Requiere acción hoy","Waiting":"Esperando","follow up":"seguimiento","Followed up":"Seguimiento hecho","Note":"Nota","Steps":"Pasos","Details":"Detalles",
 "Follow up on":"Seguimiento el","Pick a date":"Elegir fecha","Tomorrow":"Mañana","3 days":"3 días","1 week":"1 semana","2 weeks":"2 semanas","30 days":"30 días",
 "Same job — merge":"Mismo trabajo — unir","Not a duplicate":"No es duplicado","Possible duplicate jobs":"Posibles trabajos duplicados",
 "Inspection":"Inspección","Inspection to book":"Inspección por agendar","items":"artículos","Late":"Atrasado","New":"Nuevo","Nobody punched in yet.":"Nadie ha marcado todavía.",
 "Nothing waiting.":"Nada esperando.","Good morning":"Buenos días","Good afternoon":"Buenas tardes","Good evening":"Buenas noches","Home":"Inicio","Menu":"Menú","from":"de","today":"hoy","Material":"Material"});}catch(e){}

/* the geofence line on Punch was English-only */
const GEO_EN='Geofence active. Leave the site and you\'re auto punched out with an alert. Return within 1 hour and it stitches back together.';
const GEO_ES='Geocerca activa. Si sales de la obra, se marca tu salida automáticamente con un aviso. Si vuelves en menos de 1 hora, se une de nuevo.';
function geo(){try{if(typeof lang==='function'&&lang()==='es')document.querySelectorAll('#pg-punch *').forEach(e=>{if(e.childElementCount===0&&e.textContent===GEO_EN)e.textContent=GEO_ES;});}catch(e){}}
new MutationObserver(()=>geo()).observe(document.body,{childList:true,subtree:true});
/* ───────── 1. the last emojis → line icons (p5 swaps everything in its map) ───────── */
// (added to p5's map in the same release: 🔋 🧯 🙈 🏷 🧪 🚫 ❄ 🪜 🎚 🌀 🩹 ♨ 🔥 🔠 ⚖)

/* ───────── 2 + 3 + 5 + 7. look ───────── */
const css=`
:root{--blue-mid:#2563eb;--blue-light:#eaf1fe}
html[data-theme=dark]{--blue-mid:#5b8def;--blue-light:#1b2740}
/* buttons: dark = the main one, white = second; no green / brown buttons outside Punch */
.pg:not(#pg-punch) .btn.gr,#m-folder .btn.gr{background:#1d1d1f!important;color:#fff!important;border-color:#1d1d1f!important}
html[data-theme=dark] .pg:not(#pg-punch) .btn.gr{background:#f2f2f7!important;color:#111!important}
#pg-exp .btn[style*="--amber"]{background:#1d1d1f!important}
html[data-theme=dark] #pg-exp .btn[style*="--amber"]{background:#f2f2f7!important;color:#111!important}
/* every page: the same title */
.pg>h2,.pg>.row>h2,.pg .p8h2,#pg-orr .orrhd h2,.pg>.row h2{font-size:22px!important;font-weight:700!important;letter-spacing:-.4px!important;margin:4px 0 12px!important}
.p8h2{display:block}
/* calmer empty lines */
.empty{color:var(--g4)!important;font-style:normal!important;font-size:13.5px!important;padding:22px 12px!important}
/* Home opens with a big logo (Baruch 22:11) */
#homeBody #p5hero{display:flex!important;justify-content:center;padding:84px 0 76px!important;margin:0!important}
#homeBody #p5hero img{width:min(74%,300px)!important;height:auto}
#p7date{margin-top:4px}
/* 4. job page summary */
.p8sum{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:4px 0 10px}
.p8sum>div{background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.08);border-radius:12px;padding:8px 10px;cursor:pointer;min-width:0}
html[data-theme=dark] .p8sum>div{background:#232326}
.p8sum small{display:block;font-size:10.5px;letter-spacing:.4px;text-transform:uppercase;color:var(--g4);font-weight:600}
.p8sum b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.p8sum span{font-size:11.5px;color:var(--g4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
/* 6. pull to refresh */
#p8ptr{position:fixed;left:50%;top:0;transform:translate(-50%,-60px);z-index:70;background:#fff;color:var(--g5);border-radius:999px;padding:7px 14px;font-size:12.5px;font-weight:600;box-shadow:0 2px 10px rgba(0,0,0,.15);transition:transform .15s;pointer-events:none}
html[data-theme=dark] #p8ptr{background:#2c2c2e;color:#fff}
/* 7. loading outline */
.p8sk{background:linear-gradient(90deg,var(--g1) 25%,#e9e9ee 37%,var(--g1) 63%);background-size:400% 100%;animation:p8sh 1.3s ease infinite;border-radius:13px;margin-bottom:8px}
html[data-theme=dark] .p8sk{background:linear-gradient(90deg,#1c1c1e 25%,#2a2a2d 37%,#1c1c1e 63%);background-size:400% 100%}
@keyframes p8sh{0%{background-position:100% 50%}100%{background-position:0 50%}}
`;
const stEl=document.createElement('style');stEl.id='p8css';stEl.textContent=css;document.body.appendChild(stEl);

/* ───────── 2. titles where a page had none; Tasks: notes go under the board ───────── */
function titles(){
  const add=(pg,txt,before)=>{const p=$(pg);if(!p||p.querySelector(':scope > .p8h2'))return;const h=document.createElement('h2');h.className='p8h2';h.textContent=tt(txt);p.insertBefore(h,before?p.querySelector(before):p.firstChild);};
  add('pg-sched','Schedule');add('pg-msg','Messages');
  const est=$('pg-est');if(est&&!est.querySelector(':scope > .p8h2')){add('pg-est','Estimates');}
  const jl=$('myListJobs'),pj=$('pg-jobs');if(jl&&pj&&jl.parentNode===pj&&pj.firstElementChild===jl){pj.appendChild(jl);jl.style.marginTop='14px';}
}
titles();
if(typeof window.tab==='function'){const _tab=window.tab;window.tab=function(){const r=_tab.apply(this,arguments);try{titles();}catch(e){}return r;};}

/* ───────── 4. job page: today here · open tasks · O&R · hours this week ───────── */
function summary(s){const id=s.id;const k=dkey(new Date());const td=new Date().toDateString();
  let today='—',todaySub=tt('Nobody today');try{const L=crewsAtSite(id,k);if(L.length){today=L.map(x=>x.crew.name).join(', ');const guys=L.flatMap(x=>(D.emps||[]).filter(e=>e.crew===x.crew.id&&!e.inactive));const inN=guys.filter(e=>(D.punches||[]).some(p=>p.who===e.id&&!p.out&&p.site===id&&new Date(p.in).toDateString()===td)).length;todaySub=inN+'/'+guys.length+' '+tt('in');}}catch(e){}
  let open=[];try{open=visibleJobs().filter(j=>j.site===id&&j.status!=='done');}catch(e){open=(D.jobs||[]).filter(j=>j.site===id&&j.status!=='done');}
  let orr='—',orrSub='';try{const R=(D.orr||[]).filter(x=>x.site===id&&!x.deleted&&x.status!=='done'&&x.status!=='cancel');if(R.length&&window.ORR){const c=ORR.cur(R[0]);orr=c[1];const w=ORR.who(R[0]);orrSub=(w==='us'?tt('Our move'):w==='cust'?tt('Customer pays'):tt('O&R’s move'))+(R.length>1?' · +'+(R.length-1):'');}}catch(e){}
  let hrs=0;try{const ws=weekStart().getTime();(D.punches||[]).filter(p=>p.site===id&&(p.out||p.away)&&p.in>=ws&&payCounts(p)).forEach(p=>{hrs+=punchDur(p);});}catch(e){}
  const box=(lab,big,sub,act)=>'<div onclick="'+act+'"><small>'+esc(tt(lab))+'</small><b>'+esc(big)+'</b>'+(sub?'<span>'+esc(sub)+'</span>':'')+'</div>';
  return '<div class="p8sum" id="p8sum">'+box('Today here',today,todaySub,"hide('m-folder');goTab('sched')")
    +box('Open tasks',String(open.length),open[0]?(()=>{try{return jobText(open[0]);}catch(e){return open[0].desc||'';}})():'',"")
    +box('O&R',orr,orrSub,"try{const x=(D.orr||[]).find(o=>o.site==='"+jsq(id)+"'&&o.status!=='done'&&o.status!=='cancel');if(x)ORR.open(x.id);}catch(e){}")
    +box('Hours this week',(Math.round(hrs*10)/10)+' h','',"")+'</div>';}
if(typeof window.openFolder==='function'){const _of=window.openFolder;window.openFolder=function(id){const r=_of.apply(this,arguments);try{const s=(D.sites||[]).find(x=>x.id===id);const ov=$('fdOverview');
  if(s&&ov){const old=$('p8sum');if(old)old.remove();const d=document.createElement('div');d.innerHTML=summary(s);const f=$('m-folder');
    const tb=f&&[...f.querySelectorAll('button,.chip')].find(b=>/^(Overview|Resumen|General)$/.test(b.textContent.trim()));const row=tb&&tb.parentElement;
    if(row&&row.parentElement)row.parentElement.insertBefore(d.firstChild,row);else ov.insertBefore(d.firstChild,ov.firstChild);}}catch(e){console.error('p8 folder',e);}return r;};}

/* ───────── 6. Home tasks swipe like the Tasks board (p2 handles .gprow[data-j]) ───────── */
if(typeof window.renderHome==='function'){const _rh=window.renderHome;window.renderHome=function(){const m=M();const el=$('homeBody');
  // 7. first load: a gray outline instead of an empty page
  if(m&&el&&window.EX_REAL&&!(D.sites||[]).length&&!(D.jobs||[]).length){el.innerHTML='<div class="p8sk" style="height:48px;width:70%"></div><div class="p8sk" style="height:56px"></div>'+[140,170,120].map(h=>'<div class="p8sk" style="height:'+h+'px"></div>').join('');return;}
  const r=_rh.apply(this,arguments);
  try{(el?el.querySelectorAll('.p7c[data-k=tasks] .p7r'):[]).forEach(row=>{const mm=(row.getAttribute('onclick')||'').match(/openJobDetail\('([^']+)'\)/);if(mm){row.classList.add('gprow');row.dataset.j=mm[1];}});}catch(e){}
  return r;};}

/* ───────── 6. pull down to refresh (any page, from the very top) ───────── */
let py=null,pd=0,busy=false;const tip=()=>{let x=$('p8ptr');if(!x){x=document.createElement('div');x.id='p8ptr';document.body.appendChild(x);}return x;};
document.addEventListener('touchstart',e=>{if(busy||window.scrollY>2||document.querySelector('.ov:not(.hid)')||document.querySelector('#p6ov:not([hidden])')||($('p7drawer')||{classList:{contains:()=>false}}).classList.contains('on')){py=null;return;}py=e.touches[0].clientY;pd=0;},{passive:true});
document.addEventListener('touchmove',e=>{if(py==null)return;pd=e.touches[0].clientY-py;if(pd<=0){tip().style.transform='translate(-50%,-60px)';return;}const x=tip();x.textContent=pd>80?tt('Release to refresh'):tt('Pull to refresh');x.style.transform='translate(-50%,'+Math.min(pd/2,56)+'px)';},{passive:true});
document.addEventListener('touchend',async()=>{if(py==null)return;const go=pd>80;py=null;const x=tip();if(!go){x.style.transform='translate(-50%,-60px)';return;}
  busy=true;x.textContent=tt('Refreshing…');x.style.transform='translate(-50%,40px)';
  try{if(typeof window.EX_catchUp==='function')await window.EX_catchUp();}catch(e){}
  try{const on=((document.querySelector('.pg.on')||{}).id||'').replace('pg-','');if(on==='home')renderHome();else if(typeof PAGE_R==='object'&&PAGE_R[on])PAGE_R[on]();}catch(e){}
  setTimeout(()=>{x.style.transform='translate(-50%,-60px)';busy=false;},350);},{passive:true});

/* ───────── glass menu (Baruch 22:17): the ☰ opens round "glass" buttons on the right instead of a side page ───────── */
(function(){
const ORDER=['home','punch','jobs','sites','sched','cal','hours','orr','mat','trello','team','exp','est','svc','tools','rep','code','msg','van'];
const LABEL={home:'Home',jobs:'Tasks',sites:'Jobs',cal:'Calendar',sched:'Schedule',exp:'Money',tools:'Garage',trello:'My Trello',more:'Settings'};
const allowed=()=>[...document.querySelectorAll('.tab')].filter(b=>b.dataset.allowed==='1').map(b=>((b.getAttribute('onclick')||'').match(/'([a-z]+)'/)||[])[1]).filter(Boolean);
const tabIcon=n=>{const b=document.querySelector('.tab[onclick*="\''+n+'\'"] svg');return b?b.outerHTML.replace(/width="20" height="20"/,''):'';};
const HOME='<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/></svg>';
const GEAR='<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>';
const X='<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
function count(n,m){try{if(n==='jobs')return myTasks(m).length;if(n==='orr'&&window.ORR)return (D.orr||[]).filter(x=>ORR.todo(x)).length;
  if(n==='mat'&&typeof canHandleMat==='function'&&canHandleMat(m))return (D.mats||[]).filter(x=>x.status==='open').length;
  if(n==='hours'&&typeof canEditHours==='function'&&canEditHours(m))return (D.fixes||[]).filter(f=>f.status==='pending').length;}catch(e){}return 0;}
const css=`
#p8glass{position:fixed;inset:0;z-index:9000;display:none}
#p8glass.on{display:block}
#p8glass .dim{position:absolute;inset:0;background:rgba(10,10,14,.18);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;transition:opacity .2s}
#p8glass.on .dim{opacity:1}
#p8glass .col{position:absolute;right:max(14px,env(safe-area-inset-right,0px));bottom:calc(90px + env(safe-area-inset-bottom,0px));top:max(70px,env(safe-area-inset-top,0px));display:flex;flex-direction:column-reverse;flex-wrap:wrap-reverse;align-content:flex-start;gap:16px 14px;pointer-events:none}
#p8glass .g{pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:4px;width:66px;border:none;background:none;padding:0;cursor:pointer;font-family:inherit;
  opacity:0;transform:translateY(16px) scale(.6);transition:opacity .22s ease,transform .32s cubic-bezier(.2,1.4,.4,1)}
#p8glass.on .g{opacity:1;transform:none}
#p8glass .ball{position:relative;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#1d1d1f;
  background:linear-gradient(160deg,rgba(255,255,255,.78),rgba(255,255,255,.42));-webkit-backdrop-filter:blur(18px) saturate(180%);backdrop-filter:blur(18px) saturate(180%);
  border:1px solid rgba(255,255,255,.75);box-shadow:0 8px 24px rgba(0,0,0,.16),inset 0 1px 1px rgba(255,255,255,.9),inset 0 -6px 12px rgba(0,0,0,.05)}
#p8glass .ball::after{content:"";position:absolute;left:12px;right:12px;top:5px;height:14px;border-radius:50%;background:linear-gradient(rgba(255,255,255,.75),rgba(255,255,255,0));pointer-events:none}
#p8glass .ball svg{width:23px;height:23px;position:relative;z-index:1}
#p8glass .g.on .ball{color:#2563eb;border-color:rgba(37,99,235,.45)}
#p8glass .lab{font-size:11px;font-weight:600;color:#1d1d1f;text-shadow:0 1px 2px rgba(255,255,255,.9);white-space:nowrap;max-width:76px;overflow:hidden;text-overflow:ellipsis}
#p8glass .n{position:absolute;top:-3px;right:-3px;z-index:2;min-width:19px;height:19px;border-radius:999px;background:#d93a2b;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;box-shadow:0 1px 3px rgba(0,0,0,.25)}
html[data-theme=dark] #p8glass .dim{background:rgba(0,0,0,.35)}
html[data-theme=dark] #p8glass .ball{color:#fff;background:linear-gradient(160deg,rgba(80,80,90,.62),rgba(40,40,46,.42));border-color:rgba(255,255,255,.22);box-shadow:0 8px 24px rgba(0,0,0,.5),inset 0 1px 1px rgba(255,255,255,.25)}
html[data-theme=dark] #p8glass .ball::after{background:linear-gradient(rgba(255,255,255,.22),rgba(255,255,255,0))}
html[data-theme=dark] #p8glass .lab{color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8)}
html[data-theme=dark] #p8glass .g.on .ball{color:#7aa5ff}
#p7fm.p8x{background:#1d1d1f;color:#fff;z-index:9001}
#p7fm{background:linear-gradient(160deg,rgba(255,255,255,.85),rgba(255,255,255,.55))!important;-webkit-backdrop-filter:blur(16px) saturate(180%);backdrop-filter:blur(16px) saturate(180%);border:1px solid rgba(255,255,255,.8)!important}
#p7fm.p8x{background:#1d1d1f!important}
html[data-theme=dark] #p7fm{background:linear-gradient(160deg,rgba(80,80,90,.7),rgba(40,40,46,.5))!important;border-color:rgba(255,255,255,.2)!important}
html[data-theme=dark] #p7fm.p8x{background:#fff!important}
html[data-theme=dark] #p7fm.p8x{background:#fff;color:#111}
`;
const st=document.createElement('style');st.textContent=css;document.body.appendChild(st);

/* pinned glass buttons on Home (Baruch 22:20: Tasks, Jobs, Schedule, O&R always on the right side of Home; ☰ for the rest) */
const PIN=['jobs','sites','sched','orr'];
const pcss=`
#p8pin{position:fixed;right:max(14px,env(safe-area-inset-right,0px));bottom:calc(92px + env(safe-area-inset-bottom,0px));z-index:59;display:none;flex-direction:column;gap:12px;align-items:center}
body:has(#pg-home.on) #p8pin{display:flex}
body:has(#pg-home.on) #homeBody .p7c,body:has(#pg-home.on) #homeBody .p7nums,body:has(#pg-home.on) #homeBody #p7date{margin-right:66px}
#p8pin .g{display:flex;flex-direction:column;align-items:center;gap:3px;width:62px;border:none;background:none;padding:0;cursor:pointer;font-family:inherit}
#p8pin .ball{position:relative;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#1d1d1f;
  background:linear-gradient(160deg,rgba(255,255,255,.8),rgba(255,255,255,.45));-webkit-backdrop-filter:blur(18px) saturate(180%);backdrop-filter:blur(18px) saturate(180%);
  border:1px solid rgba(255,255,255,.8);box-shadow:0 6px 18px rgba(0,0,0,.14),inset 0 1px 1px rgba(255,255,255,.95),inset 0 -6px 12px rgba(0,0,0,.05)}
#p8pin .ball::after{content:"";position:absolute;left:11px;right:11px;top:4px;height:13px;border-radius:50%;background:linear-gradient(rgba(255,255,255,.8),rgba(255,255,255,0));pointer-events:none}
#p8pin .ball svg{width:21px;height:21px;position:relative;z-index:1}
#p8pin .lab{font-size:10.5px;font-weight:600;color:var(--g5);white-space:nowrap}
#p8pin .n{position:absolute;top:-3px;right:-4px;z-index:2;min-width:18px;height:18px;border-radius:999px;background:#d93a2b;color:#fff;font-size:10.5px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px}
html[data-theme=dark] #p8pin .ball{color:#fff;background:linear-gradient(160deg,rgba(80,80,90,.65),rgba(40,40,46,.45));border-color:rgba(255,255,255,.22);box-shadow:0 6px 18px rgba(0,0,0,.5),inset 0 1px 1px rgba(255,255,255,.25)}
html[data-theme=dark] #p8pin .ball::after{background:linear-gradient(rgba(255,255,255,.22),rgba(255,255,255,0))}
html[data-theme=dark] #p8pin .lab{color:#fff}
#p8glass.on~#p8pin,body:has(#p8glass.on) #p8pin{opacity:0;pointer-events:none}
`;
const pst=document.createElement('style');pst.textContent=pcss;document.body.appendChild(pst);
function pins(){const m=M();let p=$('p8pin');if(!p){p=document.createElement('div');p.id='p8pin';document.body.appendChild(p);}if(!m){p.innerHTML='';return;}
  const al=allowed();const L=PIN.filter(n=>al.includes(n));
  p.innerHTML=L.map(n=>{const c=count(n,m);return '<button class="g" onclick="goTab(\''+n+'\')"><span class="ball">'+tabIcon(n)+(c?'<i class="n">'+c+'</i>':'')+'</span><span class="lab">'+esc(tt(LABEL[n]||(TABMETA[n]||[])[1]||n))+'</span></button>';}).join('');
  if(!L.length)p.style.display='none';else p.style.display='';}
if(typeof window.renderHome==='function'){const _rh2=window.renderHome;window.renderHome=function(){const r=_rh2.apply(this,arguments);try{pins();}catch(e){}return r;};}
if(typeof window.applyTabs==='function'){const _at2=window.applyTabs;window.applyTabs=function(){const r=_at2.apply(this,arguments);try{pins();}catch(e){}return r;};}
try{pins();}catch(e){}
function build(){const m=M();let g=$('p8glass');if(!g){g=document.createElement('div');g.id='p8glass';document.body.appendChild(g);}if(!m)return g;
  const al=allowed();let start='home';try{start=primaryFor(m)[0];}catch(e){}
  const cur=((document.querySelector('.pg.on')||{}).id||'').replace('pg-','');
  const onHome=cur==='home';const L=ORDER.filter(n=>(n===start||(n!=='home'&&al.includes(n)))&&!(onHome&&PIN.includes(n))).concat(['more']);
  g.innerHTML='<div class="dim" onclick="P7.close()"></div><div class="col">'+L.map((n,i)=>{const c=n==='more'?0:count(n,m);
    return '<button class="g'+(cur===n?' on':'')+'" style="transition-delay:'+(i*18)+'ms" onclick="P7.go(\''+n+'\')"><span class="ball">'+(n==='home'?HOME:n==='more'?GEAR:tabIcon(n))+(c?'<i class="n">'+c+'</i>':'')+'</span><span class="lab">'+esc(tt(LABEL[n]||(TABMETA[n]||[])[1]||n))+'</span></button>';}).join('')+'</div>';
  return g;}
const BURGER='<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
function wire(){if(!window.P7)return false;
  P7.open=function(){const g=build();g.style.display='block';requestAnimationFrame(()=>requestAnimationFrame(()=>g.classList.add('on')));const b=$('p7fm');if(b){b.innerHTML=X;b.classList.add('p8x');b.onclick=e=>{e.stopPropagation();P7.close();};}};
  P7.close=function(){const g=$('p8glass');if(g){g.classList.remove('on');setTimeout(()=>{if(!g.classList.contains('on'))g.style.display='none';},220);}const b=$('p7fm');if(b){b.innerHTML=BURGER;b.classList.remove('p8x');b.onclick=e=>{e.stopPropagation();P7.open();};}};
  P7.go=function(n){P7.close();goTab(n);};
  const b=$('p7fm');if(b)b.onclick=e=>{e.stopPropagation();P7.open();};return true;}
if(!wire())setTimeout(wire,0);
document.addEventListener('keydown',e=>{if(e.key==='Escape')try{P7.close();}catch(x){}});
})();
})();
