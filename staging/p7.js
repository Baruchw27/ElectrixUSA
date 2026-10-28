/* Electrix USA — P7 "one place for everything" (Baruch 2026-10-27).
   • No bottom bar for the owner, managers and the office: Home is the hub. Every section is on Home once, in one grid.
     The Electrix icon (top left) and "‹ Home" bring you back from anywhere. Workers and crew leaders keep their bar.
   • Home = today only: the date (tap → Calendar), 3 numbers (my tasks · on site now · O&R to do), Today's list
     (meetings + my tasks), "Needs attention" only when something needs it, then the sections grid.
     Removed from Home (each still has its own page): shortcut row, Up next, team counts, upcoming meetings,
     who's on the job (Hours), today's crews (Schedule), the Notes button (Tasks).
   • More → "Settings" (language, look, Face ID, time off, notifications, sign out) — no second copy of the sections.
   • Tasks: one Open / Done switch (the three counters above it are gone). Jobs: notifications moved to Settings.
   • Job page: one "this week here" (the "crews here today" copy is gone) and one hours section.
   Off: window.EX_P7_OFF. */
(function(){
if(window.EX_P7_OFF)return;
const $=id=>document.getElementById(id);
const M=()=>{try{return me();}catch(e){return null;}};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsq=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const tt=s=>{try{return t(s);}catch(e){return s;}};
const nobar=m=>!!m&&(m.role==='owner'||m.role==='manager'||m.role==='office'||!!m.all);
try{if(typeof ES==="object")Object.assign(ES,{"My tasks":"Mis tareas","On site now":"En obra ahora","O&R to do":"O&R por hacer","Today":"Hoy","Everything":"Todo","Settings":"Ajustes","Nothing else today.":"Nada más hoy.","All tasks":"Todas las tareas","Home":"Inicio","Next":"Próximo"});}catch(e){}

/* ───────── look ───────── */
const css=`
html.p7nobar .tabs{display:none!important}
html.p7nobar body{padding-bottom:0}
html.p7nobar .fab{bottom:22px!important}
.p7back{display:none;align-items:center;gap:2px;border:none;background:var(--g1);color:var(--g5);font:600 13.5px/1 inherit;font-family:inherit;border-radius:999px;padding:7px 11px 7px 8px;margin-left:8px;cursor:pointer}
html.p7nobar.p7inner .p7back{display:inline-flex}
#p7date{display:flex;align-items:center;gap:10px;background:none;border:none;padding:0;cursor:pointer;font-family:inherit;color:inherit;text-align:left;width:100%}
#p7date .cal{flex:none;width:44px;height:46px;border-radius:11px;background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.1);display:flex;flex-direction:column;align-items:center;overflow:hidden}
html[data-theme=dark] #p7date .cal{background:#1c1c1e}
#p7date .cal i{display:block;width:100%;background:#d93a2b;color:#fff;font:700 9.5px/15px inherit;font-style:normal;text-align:center;text-transform:uppercase;letter-spacing:.5px}
#p7date .cal b{font-size:19px;line-height:29px}
#p7date .d{font-size:13px;color:var(--g4)}#p7date h2{margin:0;font-size:20px}
#p7date .go{margin-left:auto;color:var(--g4);font-size:20px}
.p7nums{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 10px}
.p7nums button{border:none;background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.07);border-radius:14px;padding:10px 6px;cursor:pointer;font-family:inherit;color:var(--g5);text-align:center}
html[data-theme=dark] .p7nums button{background:#1c1c1e;box-shadow:none}
.p7nums b{display:block;font-size:22px;line-height:1.1}.p7nums span{font-size:11.5px;color:var(--g4)}
.p7card{background:#fff;border-radius:14px;padding:10px 13px;margin-bottom:10px;box-shadow:0 0 0 .5px rgba(0,0,0,.07)}
html[data-theme=dark] .p7card{background:#1c1c1e;box-shadow:none}
.p7card h3{display:flex;justify-content:space-between;align-items:center;margin:2px 0 4px;font-size:12px;letter-spacing:.5px;text-transform:uppercase;color:var(--g4)}
.p7card h3 a{text-transform:none;letter-spacing:0;font-size:13px;color:var(--blue-mid);cursor:pointer;font-weight:600}
.p7row{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--g1);cursor:pointer;font-size:14px}
.p7row:first-of-type{border-top:none}
.p7row .w{flex:1;min-width:0}.p7row .w small{display:block;color:var(--g4);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.p7row .tm{flex:none;font-size:12px;font-weight:700;color:var(--blue-mid);min-width:54px}
.p7row .ck{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid var(--g2);background:none;cursor:pointer;padding:0}
.p7row .pri{color:#d93a2b;font-weight:700}
.p7empty{color:var(--g4);font-size:13.5px;padding:6px 0}
.p7att .att{margin-top:2px}
#p7grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:4px 0 90px}
#p7grid button{background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.07);border:none;border-radius:14px;padding:12px 2px 9px;display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--g5);font:500 11.5px/1.2 inherit;font-family:inherit;cursor:pointer;position:relative}
html[data-theme=dark] #p7grid button{background:#1c1c1e;box-shadow:none}
#p7grid svg{width:22px;height:22px;color:var(--blue-mid)}
#p7grid .n{position:absolute;top:5px;right:8px;background:#d93a2b;color:#fff;border-radius:999px;font-size:10.5px;font-weight:700;padding:1px 6px}
.p7sec{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--g4);margin:16px 2px 8px}
html.p7nobar #pg-jobs > .stats{display:none}
`;
const stEl=document.createElement('style');stEl.id='p7css';stEl.textContent=css;document.body.appendChild(stEl);

/* ───────── no bottom bar for owner / managers / office ───────── */
function setMode(){const m=M();document.documentElement.classList.toggle('p7nobar',nobar(m));}
const _pf=window.primaryFor;
if(typeof _pf==='function'){window.primaryFor=function(m){if(nobar(m))return ['home','more'];return _pf.apply(this,arguments);};}
try{primaryFor=window.primaryFor;}catch(e){}
function backBtn(){const lg=document.querySelector('.top .top-row .logo');if(lg&&!lg.querySelector('.p7back')){const b=document.createElement('button');b.className='p7back';b.innerHTML='‹ '+esc(tt('Home'));b.onclick=e=>{e.stopPropagation();goTab('home');};lg.appendChild(b);}
  const mk=document.querySelector('.top .p5mark');if(mk)mk.onclick=()=>{try{nobar(M())?goTab('home'):goTab(primaryFor(M())[0]);}catch(e){}};}
if(typeof window.tab==='function'){const _tab=window.tab;window.tab=function(n){const r=_tab.apply(this,arguments);try{document.documentElement.classList.toggle('p7inner',n!=='home');}catch(e){}return r;};}
if(typeof window.applyTabs==='function'){const _at=window.applyTabs;window.applyTabs=function(){const r=_at.apply(this,arguments);try{setMode();backBtn();const m=M();if(nobar(m)){const hb=document.querySelector('.tab[onclick*="\'home\'"]');if(hb)hb.dataset.allowed='1';}}catch(e){}return r;};}

/* ───────── sections grid ───────── */
const ORDER=['jobs','sites','sched','cal','hours','orr','mat','team','exp','est','svc','tools','rep','code','trello','msg','van','punch'];
const LABEL={jobs:'Tasks',sites:'Jobs',cal:'Calendar',sched:'Schedule',exp:'Money',tools:'Garage',trello:'My Trello',more:'Settings'};
function allowed(){return [...document.querySelectorAll('.tab')].filter(b=>b.dataset.allowed==='1').map(b=>((b.getAttribute('onclick')||'').match(/'([a-z]+)'/)||[])[1]).filter(Boolean);}
function icon(n){const b=document.querySelector('.tab[onclick*="\''+n+'\'"] svg');return b?b.outerHTML.replace(/width="20" height="20"/,''):'';}
const GEAR='<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>';
function grid(){const al=allowed();const L=ORDER.filter(n=>al.includes(n));
  return '<div class="p7sec">'+esc(tt('Everything'))+'</div><div id="p7grid">'+L.map(n=>'<button onclick="goTab(\''+n+'\')">'+icon(n)+esc(tt(LABEL[n]||(TABMETA[n]||[])[1]||n))+'</button>').join('')
    +'<button onclick="goTab(\'more\')">'+GEAR+esc(tt('Settings'))+'</button></div>';}

/* ───────── Home ───────── */
const fmtTime=at=>new Date(at).toLocaleTimeString(LOC(),{hour:'numeric',minute:'2-digit'});
function todayList(m){const now=Date.now();const td=new Date().toDateString();const rows=[];
  let meets=[];try{meets=(D.meets||[]).filter(x=>x.at>=now-3600000&&(m.role==='owner'||inMeet(x,m.id))).sort((a,b)=>a.at-b.at);}catch(e){}
  const today=meets.filter(x=>new Date(x.at).toDateString()===td);
  today.forEach(x=>rows.push('<div class="p7row" onclick="goTab(\'cal\')"><span class="tm">'+fmtTime(x.at)+'</span><div class="w">'+esc(x.title||tt('Meeting'))+'<small>'+(x.site?esc(siteName(x.site).split(',')[0]):'')+'</small></div></div>'));
  try{(D.insp||[]).filter(i=>i.status==='booked'&&new Date(i.at).toDateString()===td).forEach(i=>rows.push('<div class="p7row" onclick="goTab(\'sites\')"><span class="tm">'+fmtTime(i.at)+'</span><div class="w">'+esc(tt('Inspection'))+'<small>'+esc(siteName(i.site).split(',')[0])+'</small></div></div>'));}catch(e){}
  let mine=[];try{mine=myTasks(m);}catch(e){mine=(D.jobs||[]).filter(j=>j.status!=='done'&&(Array.isArray(j.to)?j.to:[j.to]).includes(m.id));}
  mine.slice(0,6).forEach(j=>{let txt='';try{txt=jobText(j);}catch(e){txt=j.desc||'';}
    rows.push('<div class="p7row" onclick="openJobDetail(\''+jsq(j.id)+'\')"><button class="ck" title="Done" onclick="event.stopPropagation();markDone(\''+jsq(j.id)+'\')"></button><div class="w"><span class="'+(j.pri?'pri':'')+'">'+esc(txt)+'</span><small>'+(j.site?esc(siteName(j.site).split(',')[0]):'')+'</small></div></div>');});
  let next='';if(!today.length&&meets.length){const x=meets[0];next='<div class="p7row" onclick="goTab(\'cal\')"><span class="tm" style="color:var(--g4)">'+esc(tt('Next'))+'</span><div class="w">'+esc(x.title||tt('Meeting'))+'<small>'+new Date(x.at).toLocaleString(LOC(),{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'</small></div></div>';}
  return '<div class="p7card"><h3>'+esc(tt('Today'))+'<a onclick="goTab(\'jobs\')">'+esc(tt('All tasks'))+(mine.length>6?' ('+mine.length+')':'')+' ›</a></h3>'+(rows.join('')+next||'<div class="p7empty">'+esc(tt('Nothing else today.'))+'</div>')+'</div>';}
function nums(m){const td=new Date().toDateString();let mine=0;try{mine=myTasks(m).length;}catch(e){}
  const field=(D.emps||[]).filter(e=>e.role==='worker'&&!e.inactive);const on=field.filter(e=>(D.punches||[]).some(p=>p.who===e.id&&!p.out&&!p.away&&new Date(p.in).toDateString()===td)).length;
  const al=allowed();let orr=null;try{if(window.ORR&&al.includes('orr'))orr=(D.orr||[]).filter(x=>ORR.todo(x)).length;}catch(e){}
  const b=(n,l,go,col)=>'<button onclick="'+go+'"><b style="color:'+col+'">'+n+'</b><span>'+esc(tt(l))+'</span></button>';
  return '<div class="p7nums">'+b(mine,'My tasks',"goTab('jobs')",'var(--blue-mid)')+(al.includes('hours')?b(on+'/'+field.length,'On site now',"goTab('hours')",'var(--green)'):b('—','On site now',"",'var(--g3)'))+(orr!=null?b(orr,'O&R to do',"ORR.filter&&ORR.filter();goTab('orr')",orr?'#d93a2b':'var(--green)'):'')+'</div>';}
if(typeof window.renderHome==='function'){const _rh=window.renderHome;window.renderHome=function(){const m=M();const el=$('homeBody');
  if(!m||!el||!nobar(m))return _rh.apply(this,arguments);
  let att='',toq='';try{_rh.apply(this,arguments);}catch(e){}
  try{const tile=[...el.querySelectorAll('.tile')].find(x=>{const h=x.querySelector('h3');return h&&h.textContent.trim().startsWith(tt('Needs attention'));});const a=tile&&tile.querySelector('.att');if(a&&a.querySelector('span:not(.g)'))att=a.outerHTML;}catch(e){}
  try{toq=typeof timeOffQueue==='function'?timeOffQueue():'';}catch(e){}
  const d=new Date();const hr=d.getHours();const greet=hr<12?tt('Good morning'):hr<17?tt('Good afternoon'):tt('Good evening');
  el.innerHTML='<div id="p5hero"><img src="logo-light.svg" alt="Electrix"></div>'
   +'<button id="p7date" onclick="goTab(\'cal\')"><span class="cal"><i>'+d.toLocaleDateString(LOC(),{month:'short'})+'</i><b>'+d.getDate()+'</b></span><span><span class="d">'+esc(d.toLocaleDateString(LOC(),{weekday:'long',month:'long',day:'numeric'}))+'</span><h2>'+esc(greet)+', '+esc(String(m.name||'').split(' ')[0])+'</h2></span><span class="go">›</span></button>'
   +nums(m)+toq+(att?'<div class="p7card p7att"><h3>'+esc(tt('Needs attention'))+'</h3>'+att+'</div>':'')+todayList(m)+grid();
  try{const lg=document.querySelector('#p5hero img');if(lg&&document.documentElement.getAttribute('data-theme')==='dark')lg.src='logo-dark.svg';}catch(e){}
};}

/* ───────── More → Settings ───────── */
// the notification switches used to sit at the bottom of Jobs
function moveNotif(){try{if(!nobar(M()))return;const pg=$('pg-more'),sp=$('pg-sites');if(!pg||!sp||$('p7notif'))return;const s=[...sp.querySelectorAll(':scope > .sec')].find(x=>/Notifications|Notificaciones/.test(x.textContent));
  if(s){const card=s.nextElementSibling;const w=document.createElement('div');w.id='p7notif';w.appendChild(s);if(card&&card.classList.contains('card'))w.appendChild(card);pg.appendChild(w);}}catch(e){}}
if(typeof window.renderMore==='function'){const _rm=window.renderMore;window.renderMore=function(){const r=_rm.apply(this,arguments);try{const m=M();if(!nobar(m))return r;
  const pg=$('pg-more');const h=pg&&pg.querySelector('h2');if(h)h.textContent=tt('Settings');
  document.querySelectorAll('#moreGrid .mg').forEach(x=>{if(/goTab\(/.test(x.getAttribute('onclick')||''))x.remove();});
  moveNotif();
}catch(e){console.error('p7 more',e);}return r;};}

/* ───────── job page: no second copies ───────── */
try{if(typeof window.crewsAtSiteHtml==='function'){const _c=window.crewsAtSiteHtml;window.crewsAtSiteHtml=function(){try{if(nobar(M()))return '';}catch(e){}return _c.apply(this,arguments);};try{crewsAtSiteHtml=window.crewsAtSiteHtml;}catch(e){}}}catch(e){}
if(typeof window.openFolder==='function'){const _of=window.openFolder;window.openFolder=function(){const r=_of.apply(this,arguments);try{if(nobar(M())){const f=$('m-folder');
  (f?[...f.querySelectorAll('.tile')]:[]).forEach(x=>{const h=x.querySelector('h3');if(h&&/labor hours on this job|horas de trabajo en este/i.test(h.textContent)&&f.querySelector('.sec')&&[...f.querySelectorAll('.sec')].some(s=>/labor hours|horas de trabajo/i.test(s.textContent)))x.remove();});}}catch(e){}return r;};}

/* ───────── start ───────── */
setMode();backBtn();moveNotif();
try{applyTabs();}catch(e){}
try{const m=M();if(nobar(m)){const on=document.querySelector('.pg.on');if(!on||on.id!=='pg-home'){if(!window.__p7started){window.__p7started=1;goTab('home');}}document.documentElement.classList.toggle('p7inner',!!(document.querySelector('.pg.on')||{id:''}).id&&document.querySelector('.pg.on').id!=='pg-home');}}catch(e){}
})();
