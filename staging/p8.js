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
#homeBody #p5hero{display:flex!important;justify-content:center;padding:44px 0 40px!important;margin:0!important}
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
})();
