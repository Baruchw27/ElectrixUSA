/* Electrix USA — P4 "full upgrade" (Baruch 2026-10-27): bigger logo and cleaner header, bigger bottom bar with a
   highlighted current tab, a real Calendar (month grid + day list: meetings, tasks due, crew schedule, inspections,
   time off), quick-action row on the job page (call, directions, photo, task, Trello), "Up next" on Home, one name for
   things ("Jobs" everywhere), and small fixes. Loaded after p2.js. Turn off with window.EX_P4_OFF = true. */
(function(){
if(window.EX_P4_OFF)return;
const $=id=>document.getElementById(id);
const P4=window.P4={month:null,day:null,filter:'all'};
const ES4={"Calendar":"Calendario","Today":"Hoy","Meeting":"Reunión","Task":"Tarea","Crew":"Cuadrilla","Inspection":"Inspección","Time off":"Día libre",
 "Nothing on this day.":"Nada para este día.","Add meeting":"Agregar reunión","Add task":"Agregar tarea","All":"Todo","Meetings":"Reuniones","Tasks":"Tareas","Crews":"Cuadrillas",
 "Up next":"Lo que sigue","Nothing scheduled for the rest of today.":"Nada más programado para hoy.","Call":"Llamar","Text":"Mensaje","Directions":"Cómo llegar","Photo":"Foto","Trello":"Trello",
 "Read":"Leer","Due":"Vence","Jobs":"Trabajos","New job":"Nuevo trabajo","Job":"Trabajo","late":"atrasada","Open tasks":"Tareas abiertas","on site now":"en obra ahora",
 "crews out":"cuadrillas afuera","Week":"Semana","Month":"Mes","booked":"reservada","requested":"pedida","Day off":"Día libre","at":"a las",
 "Coming up":"Próximamente","Rough":"Rough","Final":"Final","Rough inspection":"Inspección de rough","Final inspection":"Inspección final"};
const tt=s=>{try{if(typeof lang==='function'&&lang()==='es')return ES4[s]||(typeof t==='function'?t(s):s);}catch(e){}return s;};
const M=()=>{try{return me();}catch(e){return null;}};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsq=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const boss=m=>m&&(m.role==='owner'||m.role==='manager'||m.role==='office'||!!m.all);

/* ───────── 1. Look: bigger logo, calmer header, bigger bottom bar, consistent cards ───────── */
const css=`
.top{padding:8px 12px 8px}
.top .top-row .logo img.exlogo{height:34px!important}
.top .top-row>div:last-child{gap:5px!important}
.top .top-row>div:last-child button,.top .top-row>div:last-child .role-sel{min-width:40px;min-height:40px;border-radius:12px}
.tabs{padding-top:4px}
.tab{font-size:11.5px;padding:8px 2px 7px;font-weight:600;color:var(--g4);border-radius:12px;margin:0 1px}
.tab svg{width:23px;height:23px}
.tab.on{color:var(--blue-mid)}
.tab.on span{position:relative}
.tab.on::before{content:"";display:block;position:absolute;left:50%;top:3px;transform:translateX(-50%);width:44px;height:30px;border-radius:12px;background:var(--blue-light);z-index:-1}
.tab{position:relative}
h2{font-size:24px;letter-spacing:-.3px;margin-bottom:12px}
.card{border-radius:16px;padding:14px}
.sec{margin-top:18px}
/* page header line: title left, actions right */
.p4hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
.p4hd h2{margin:0}
.p4sub{color:var(--g4);font-size:13px;margin:-8px 0 12px}
/* up next on Home */
#p4next{margin-bottom:10px}
#p4next .p4row{display:flex;gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--g2)}
#p4next .p4row:first-of-type{border-top:none}
#p4next .tm{min-width:62px;font-weight:700;color:var(--blue-mid);font-size:15px}
#p4next .what{flex:1;min-width:0}
#p4next .what b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#p4next .what span{font-size:12.5px;color:var(--g4)}
#p4next .kpi{display:flex;gap:8px;margin-top:10px}
#p4next .kpi div{flex:1;background:var(--g1);border-radius:12px;padding:8px 10px;text-align:center}
#p4next .kpi b{display:block;font-size:20px;line-height:1.1}
#p4next .kpi span{font-size:11px;color:var(--g4)}
/* job page quick actions */
.p4qa{display:flex;gap:6px;margin:10px 0 4px}
.p4qa a,.p4qa button{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;background:var(--g1);border:none;border-radius:14px;padding:10px 2px 8px;color:var(--g5);font-size:11.5px;font-weight:600;text-decoration:none;cursor:pointer;font-family:inherit}
.p4qa svg{width:22px;height:22px;stroke:var(--blue-mid)}
.p4qa .off{opacity:.4;pointer-events:none}
#m-folder .p4hideold{display:none!important}
#fdSpeak .btn,#fdSpeak button{width:auto!important;padding:6px 10px!important;font-size:12px!important;border-radius:999px!important}
/* calendar */
#pg-cal .p4cal{background:#fff;border:1px solid var(--g2);border-radius:16px;padding:10px 8px 6px;margin-bottom:10px}
html[data-theme=dark] #pg-cal .p4cal{background:var(--g1)}
#pg-cal .p4nav{display:flex;align-items:center;justify-content:space-between;padding:0 4px 8px}
#pg-cal .p4nav b{font-size:17px}
#pg-cal .p4nav button{background:var(--g1);border:none;border-radius:10px;width:36px;height:36px;font-size:18px;color:var(--g5);cursor:pointer}
html[data-theme=dark] #pg-cal .p4nav button{background:var(--g2)}
#pg-cal .p4nav .td{width:auto;padding:0 12px;font-size:13px;font-weight:700;color:var(--blue-mid);background:var(--blue-light)}
#pg-cal .p4dn{display:grid;grid-template-columns:repeat(7,1fr);font-size:11px;color:var(--g4);text-align:center;font-weight:600;margin-bottom:4px}
#pg-cal .p4grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
#pg-cal .p4d{aspect-ratio:1/1.05;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;font-size:15px;font-weight:500;position:relative}
#pg-cal .p4d.o{color:var(--g3)}
#pg-cal .p4d.t{font-weight:800;color:var(--blue-mid)}
#pg-cal .p4d.s{background:var(--blue-mid);color:#fff}
#pg-cal .p4d.s .dots i{background:#fff!important}
#pg-cal .p4d.off{background:repeating-linear-gradient(135deg,transparent 0 4px,var(--g1) 4px 6px)}
#pg-cal .dots{display:flex;gap:2px;height:5px}
#pg-cal .dots i{width:5px;height:5px;border-radius:50%;display:block}
#pg-cal .p4leg{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:11.5px;color:var(--g4);padding:8px 4px 2px}
#pg-cal .p4leg i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
#pg-cal .p4ev{display:flex;gap:12px;align-items:flex-start;padding:11px 12px;background:#fff;border:1px solid var(--g2);border-radius:14px;margin-bottom:8px;cursor:pointer;border-left:4px solid var(--g3)}
html[data-theme=dark] #pg-cal .p4ev{background:var(--g1)}
#pg-cal .p4ev .tm{min-width:62px;font-weight:700;font-size:14px;color:var(--g5)}
#pg-cal .p4ev .tm small{display:block;font-weight:500;color:var(--g4);font-size:11px}
#pg-cal .p4ev .what{flex:1;min-width:0}
#pg-cal .p4ev .what b{display:block;font-size:15px}
#pg-cal .p4ev .what span{font-size:12.5px;color:var(--g4)}
#pg-cal .p4dayhd{display:flex;align-items:center;justify-content:space-between;margin:12px 0 8px}
#pg-cal .p4dayhd b{font-size:16px}
#pg-cal .p4dayhd .add{display:flex;gap:6px}
#pg-cal .p4dayhd .add button{background:var(--blue-light);color:var(--blue-mid);border:none;border-radius:999px;padding:7px 12px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit}
#pg-cal .p4empty{color:var(--g4);font-size:14px;padding:16px 4px;text-align:center}
#pg-cal #calTitle,#pg-cal #calNote,#pg-cal #calChips,#pg-cal #calList,#pg-cal>.btn{display:none!important}
html.p2crew #pg-cal .p4d{font-size:17px}
`;
const st=document.createElement('style');st.id='p4css';st.textContent=css;(document.body||document.head).appendChild(st);

/* ───────── 2. One name for things: the tab says "Jobs" like the page; "Meetings" becomes "Calendar" ───────── */
try{if(typeof ES==='object'){ES['Calendar']=ES['Calendar']||'Calendario';ES['Jobs']=ES['Jobs']||'Trabajos';}}catch(e){}
function relabel(){try{
  document.querySelectorAll('.tab').forEach(b=>{const oc=b.getAttribute('onclick')||'';const sp=b.querySelector('span');if(!sp)return;
    if(oc.indexOf("'sites'")>-1){sp.dataset.i18n='Jobs';sp.textContent=tt('Jobs');}
    if(oc.indexOf("'cal'")>-1){sp.dataset.i18n='Calendar';sp.textContent=tt('Calendar');const svg=b.querySelector('svg');if(svg&&!svg.dataset.p4){svg.dataset.p4='1';svg.innerHTML='<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/>';}}
  });
  if(typeof TABMETA==='object'){TABMETA.cal=['📅','Calendar'];TABMETA.sites=['📁','Jobs'];}
}catch(e){}}
relabel();setInterval(relabel,2000);if(typeof window.applyLang==='function'){const _al=window.applyLang;window.applyLang=function(){const r=_al.apply(this,arguments);relabel();return r;};}

/* ───────── 3. Calendar: everything that has a day on it ───────── */
const COL={meet:'#9b51e0',task:'#2f80ed',crew:'#d9822b',insp:'#27ae60',off:'#8e8e93'};
const dk=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
const todayK=()=>dk(new Date());
function dueKey(j){ // same rule as the morning briefing on the server
  if(j.dueDate&&/^\d{4}-\d{2}-\d{2}$/.test(j.dueDate))return j.dueDate;
  const b=new Date(j.ts||0);b.setHours(12,0,0,0);const d=j.due||'';
  if(d==='Today'||d==='ASAP')return dk(b);
  if(d==='Tomorrow morning'){b.setDate(b.getDate()+1);return dk(b);}
  if(d==='This week'){b.setDate(b.getDate()+((5-b.getDay()+7)%7));return dk(b);}
  return null;}
function crewName(id){const c=(D.crews||[]).find(x=>x.id===id);return c?c.name:id;}
function siteN(id){try{return siteName(id);}catch(e){return id;}}
function myTask(j,m){try{return has(j,m.id)||(m.crew&&has(j,m.crew));}catch(e){return false;}}
function eventsFor(k,m){ // one day's list: [{kind,at,tm,title,sub,open}]
  const L=[];const dayStart=new Date(k+'T00:00').getTime(),dayEnd=dayStart+86400000;
  (D.meets||[]).forEach(x=>{if(!(x.at>=dayStart&&x.at<dayEnd))return;let mine=true;try{mine=inMeet(x,m.id);}catch(e){}if(!mine)return;
    L.push({kind:x.insp?'insp':'meet',at:x.at,tm:fmtT(x.at),title:x.title,sub:(x.site?siteN(x.site):'')+(x.note&&!x.insp?' · '+x.note:''),open:()=>{try{if(canEditMeet(x,m))openMeet(x.id);else if(x.site)openFolder(x.site);}catch(e){}}});});
  (D.jobs||[]).forEach(j=>{if(j.status==='done')return;if(!(myTask(j,m)||(boss(m)&&P4.filter==='all'&&false)))return;if(dueKey(j)!==k)return;
    L.push({kind:'task',at:dayStart+8*3600000,tm:tt('Due'),title:j.desc,sub:(j.site?siteN(j.site):'')+(j.from&&j.from!==m.id?' · '+nameOf(j.from):''),open:()=>{try{openJobDetail(j.id);}catch(e){}}});});
  if(boss(m)){(D.crews||[]).forEach(c=>{let r=null;try{r=schedDay(c.id+'|'+k);}catch(e){}if(!r||!r.site)return;let mins=null;try{const a=rawDayAsgs(c.id+'|'+k)[0];if(a&&a.start!=null)mins=a.start;}catch(e){}
      const tm=r.time||(mins!=null?fMin(mins):'');const at=dayStart+(mins!=null?mins*60000:7*3600000);
      L.push({kind:'crew',at,tm:tm||'',title:c.name+' → '+siteN(r.site),sub:r.note||'',open:()=>{try{openFolder(r.site);}catch(e){}}});});}
  else if(m.crew){let r=null;try{r=schedDay(m.crew+'|'+k);}catch(e){}if(r&&r.site)L.push({kind:'crew',at:dayStart+7*3600000,tm:r.time||'',title:siteN(r.site),sub:tt('Crew')+' '+crewName(m.crew),open:()=>{try{openFolder(r.site);}catch(e){}}});}
  (D.insp||[]).forEach(i=>{if(i.at)return; /* booked ones already show through their meeting */ if(i.status!=='requested')return;if(!boss(m))return;if(dk(i.ts||0)!==k)return;
    L.push({kind:'insp',at:dayStart+9*3600000,tm:tt('requested'),title:(i.kind==='final'?tt('Final inspection'):tt('Rough inspection'))+' — '+siteN(i.site),sub:nameOf(i.by),open:()=>{try{openFolder(i.site);}catch(e){}}});});
  (D.timeoff||[]).forEach(r=>{if(r.status!=='approved')return;if(!(r.from<=k&&r.to>=k))return;if(!(boss(m)||r.who===m.id))return;
    L.push({kind:'off',at:dayStart,tm:'',title:nameOf(r.who)+' · '+tt('Day off'),sub:r.why||'',open:null});});
  L.sort((a,b)=>a.at-b.at);return L;}
function monthDots(m){ // kinds per day for the visible month (+ padding days)
  const out={};const first=new Date(P4.month+'-01T12:00');const start=new Date(first);start.setDate(1-first.getDay());
  for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const k=dk(d);const kinds=new Set();eventsFor(k,m).forEach(e=>kinds.add(e.kind));out[k]=[...kinds];}
  return out;}
function renderCalP4(){
  const m=M();if(!m)return;const pg=$('pg-cal');if(!pg)return;
  if(!P4.month)P4.month=todayK().slice(0,7);if(!P4.day)P4.day=todayK();
  let host=$('p4calhost');if(!host){host=document.createElement('div');host.id='p4calhost';pg.insertBefore(host,pg.firstChild);}
  const first=new Date(P4.month+'-01T12:00');const start=new Date(first);start.setDate(1-first.getDay());
  const dots=monthDots(m);const tk=todayK();const dn=lang()==='es'?['D','L','M','M','J','V','S']:['S','M','T','W','T','F','S'];
  let grid='';for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const k=dk(d);const other=d.getMonth()!==first.getMonth();
    const ks=dots[k]||[];const off=false;
    grid+='<div class="p4d'+(other?' o':'')+(k===tk?' t':'')+(k===P4.day?' s':'')+(off?' off':'')+'" onclick="P4.pick(\''+k+'\')"><span>'+d.getDate()+'</span><span class="dots">'+ks.slice(0,4).map(x=>'<i style="background:'+COL[x]+'"></i>').join('')+'</span></div>';}
  const title=first.toLocaleDateString(LOC(),{month:'long',year:'numeric'});
  const day=new Date(P4.day+'T12:00');const dayTitle=(P4.day===tk?tt('Today')+' · ':'')+day.toLocaleDateString(LOC(),{weekday:'long',month:'short',day:'numeric'});
  const ev=eventsFor(P4.day,m);
  let canM=false,canT=false;try{canM=canBook(m);}catch(e){}canT=m.role!=='worker'||!!m.lead;
  host.innerHTML='<div class="p4hd"><h2>'+tt('Calendar')+'</h2></div>'
   +'<div class="p4cal"><div class="p4nav"><button onclick="P4.move(-1)">‹</button><b>'+esc(title)+'</b><div style="display:flex;gap:6px"><button class="td" onclick="P4.today()">'+tt('Today')+'</button><button onclick="P4.move(1)">›</button></div></div>'
   +'<div class="p4dn">'+dn.map(x=>'<span>'+x+'</span>').join('')+'</div><div class="p4grid">'+grid+'</div>'
   +'<div class="p4leg"><span><i style="background:'+COL.meet+'"></i>'+tt('Meetings')+'</span><span><i style="background:'+COL.task+'"></i>'+tt('Tasks')+'</span>'+(boss(m)||m.crew?'<span><i style="background:'+COL.crew+'"></i>'+tt('Crews')+'</span>':'')+'<span><i style="background:'+COL.insp+'"></i>'+tt('Inspection')+'</span><span><i style="background:'+COL.off+'"></i>'+tt('Time off')+'</span></div></div>'
   +'<div class="p4dayhd"><b>'+esc(dayTitle)+'</b><div class="add">'+(canM?'<button onclick="P4.addMeet()">+ '+tt('Meeting')+'</button>':'')+(canT?'<button onclick="P4.addTask()">+ '+tt('Task')+'</button>':'')+'</div></div>'
   +(ev.length?ev.map((e,i)=>evHtml(e,'P4.open('+i+')')).join(''):'<div class="p4empty">'+tt('Nothing on this day.')+'</div>')
   +comingUp(m);
  P4._ev=ev;}
const KIND=e=>({meet:tt('Meeting'),task:tt('Task'),crew:tt('Crew'),insp:tt('Inspection'),off:tt('Time off')}[e.kind]);
function evHtml(e,oc){return '<div class="p4ev" style="border-left-color:'+COL[e.kind]+'" onclick="'+oc+'"><div class="tm">'+esc(e.tm||'—')+'<small>'+esc(KIND(e))+'</small></div><div class="what"><b>'+esc(e.title)+'</b>'+(e.sub?'<span>'+esc(e.sub)+'</span>':'')+'</div></div>';}
function comingUp(m){ // the next 7 days after the picked one, meetings / tasks / inspections only (crews live on the Schedule page)
  const base=new Date(P4.day+'T12:00');let h='';P4._up=[];
  for(let i=1;i<=7;i++){const d=new Date(base);d.setDate(base.getDate()+i);const k=dk(d);const L=eventsFor(k,m).filter(e=>e.kind!=='crew'&&e.kind!=='off');if(!L.length)continue;
    h+='<div class="sec" style="margin:14px 0 6px">'+esc(d.toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'}))+'</div>'+L.map(e=>{P4._up.push(e);return evHtml(e,'P4.openUp('+(P4._up.length-1)+')');}).join('');}
  return h?'<div class="p4dayhd" style="margin-top:18px"><b>'+tt('Coming up')+'</b></div>'+h:'';}
P4.openUp=i=>{const e=(P4._up||[])[i];if(e&&e.open)e.open();};
P4.pick=k=>{P4.day=k;if(k.slice(0,7)!==P4.month)P4.month=k.slice(0,7);renderCalP4();};
P4.move=n=>{const d=new Date(P4.month+'-01T12:00');d.setMonth(d.getMonth()+n);P4.month=dk(d).slice(0,7);renderCalP4();};
P4.today=()=>{P4.month=todayK().slice(0,7);P4.day=todayK();renderCalP4();};
P4.open=i=>{const e=(P4._ev||[])[i];if(e&&e.open)e.open();};
P4.addMeet=()=>{try{openMeet();setTimeout(()=>{const d=$('meDate');if(d)d.value=P4.day;},0);}catch(e){}};
P4.addTask=()=>{window._p4due=P4.day;try{openJob();}catch(e){}};
if(typeof window.renderCal==='function'){const _rc=window.renderCal;window.renderCal=function(){try{_rc.apply(this,arguments);}catch(e){}try{renderCalP4();}catch(e){console.error('p4 cal',e);}};}
// a task added from a calendar day keeps that day as its due date
if(typeof window.saveJob==='function'){const _sj=window.saveJob;window.saveJob=function(){const before=(D.jobs||[]).length;const r=_sj.apply(this,arguments);try{if(window._p4due&&(D.jobs||[]).length>before){const j=D.jobs[0];j.dueDate=window._p4due;if(!j.due)j.due='Today';save();window._p4due=null;if($('pg-cal').classList.contains('on'))renderCalP4();}}catch(e){}return r;};}
if(typeof window.bCard==='function'){const _bc=window.bCard;window.bCard=function(j){let h=_bc.apply(this,arguments);try{if(j.dueDate&&h.indexOf('kbm')>-1){const d=new Date(j.dueDate+'T12:00');h=h.replace(/\s*·\s*📅 [^<·]*/,'');h=h.replace(/<div class="kbm">/,'<div class="kbm">🗓 '+tt('Due')+' '+d.toLocaleDateString(LOC(),{month:'short',day:'numeric'})+' · ');}}catch(e){}return h;};}

/* ───────── 4. Home: "Up next" — what's coming today, at a glance ───────── */
function upNext(m){const k=todayK();const now=Date.now();const ev=eventsFor(k,m).filter(e=>e.kind!=='off'&&(e.kind==='task'||e.at>=now-15*60000));
  const open=(D.jobs||[]).filter(j=>j.status!=='done'&&myTask(j,m));const late=open.filter(j=>{const d=dueKey(j);return d&&d<k;}).length;
  const today=new Date().toDateString();const field=(D.emps||[]).filter(e=>e.role==='worker'&&!e.inactive);
  const onSite=field.filter(e=>(D.punches||[]).find(p=>p.who===e.id&&!p.out&&new Date(p.in).toDateString()===today)).length;
  const crewsOut=(D.crews||[]).filter(c=>{try{return !!schedDay(c.id+'|'+k);}catch(e){return false;}}).length;
  const rows=ev.slice(0,4).map(e=>'<div class="p4row" onclick="P4.goCal()"><div class="tm">'+esc(e.tm||'—')+'</div><div class="what"><b>'+esc(e.title)+'</b><span>'+esc({meet:tt('Meeting'),task:tt('Task'),crew:tt('Crew'),insp:tt('Inspection')}[e.kind]+(e.sub?' · '+e.sub:''))+'</span></div></div>').join('');
  return '<div class="card" id="p4next"><div class="sec" style="margin:0 0 4px">'+tt('Up next')+(ev.length>4?' · '+ev.length:'')+'</div>'+(rows||'<div style="color:var(--g4);font-size:13.5px;padding:6px 0">'+tt('Nothing scheduled for the rest of today.')+'</div>')
   +'<div class="kpi"><div onclick="goTab(\'jobs\')"><b style="color:'+(late?'#c0392b':'var(--g5)')+'">'+open.length+'</b><span>'+tt('Open tasks')+(late?' · '+late+' '+tt('late'):'')+'</span></div>'+(boss(m)?'<div onclick="goTab(\'sched\')"><b>'+crewsOut+'</b><span>'+tt('crews out')+'</span></div><div onclick="goTab(\'punch\')"><b>'+onSite+'</b><span>'+tt('on site now')+'</span></div>':'')+'</div></div>';}
P4.goCal=()=>{try{goTab('cal');}catch(e){}};
if(typeof window.renderHome==='function'){const _rh=window.renderHome;window.renderHome=function(){const r=_rh.apply(this,arguments);try{const m=M();const el=$('homeBody');if(m&&el&&boss(m)&&!$('p4next')){const d=document.createElement('div');d.innerHTML=upNext(m);const kids=[...el.children];const greet=kids.find(x=>/Good (morning|afternoon|evening)|Buen/.test(x.textContent||''))||null;el.insertBefore(d.firstChild,greet?greet.nextSibling:el.firstChild);}}catch(e){console.error('p4 home',e);}return r;};}

/* ───────── 5. Job page: quick actions row; drop the duplicate Files / Notes buttons (tabs cover them) ───────── */
const I={call:'<svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z"/></svg>',
 text:'<svg fill="none" viewBox="0 0 24 24" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
 dir:'<svg fill="none" viewBox="0 0 24 24" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>',
 cam:'<svg fill="none" viewBox="0 0 24 24" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>',
 task:'<svg fill="none" viewBox="0 0 24 24" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
 trello:'<svg fill="none" viewBox="0 0 24 24" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6.5" y="6.5" width="4" height="10" rx="1"/><rect x="13.5" y="6.5" width="4" height="6" rx="1"/></svg>'};
function quickRow(s,m){const ph=(s.phone||'').replace(/[^\d+]/g,'');let dir='';try{dir=s.lat?gmapsDir(s):'';}catch(e){}
  let canT=m.role!=='worker'||!!m.lead;
  return '<div class="p4qa">'
   +'<a class="'+(ph?'':'off')+'" href="tel:'+esc(ph)+'">'+I.call+tt('Call')+'</a>'
   +'<a class="'+(ph?'':'off')+'" href="sms:'+esc(ph)+'">'+I.text+tt('Text')+'</a>'
   +'<a class="'+(dir?'':'off')+'" href="'+esc(dir||'#')+'" target="_blank" rel="noopener">'+I.dir+tt('Directions')+'</a>'
   +'<button onclick="P4.photo()">'+I.cam+tt('Photo')+'</button>'
   +(canT?'<button onclick="P2&&P2.newTask?P2.newTask():openJob()">'+I.task+tt('Task')+'</button>':'')
   +(s.trello?'<a href="'+esc(safeHref(s.trello))+'" target="_blank" rel="noopener">'+I.trello+tt('Trello')+'</a>':'')
   +'</div>';}
P4.photo=()=>{try{if(window.P2&&P2.newPhoto)P2.newPhoto();else{P2.setTab&&P2.setTab('files');}}catch(e){}};
if(typeof window.openFolder==='function'){const _of=window.openFolder;window.openFolder=function(id){const r=_of.apply(this,arguments);try{const s=D.sites.find(x=>x.id===id);const m=M();const ti=$('fdTitle');if(s&&m&&ti){
    // old Files / Notes jump buttons → gone (the tabs do this now); the Trello line → in the quick row
    [...ti.querySelectorAll('div')].forEach(d=>{if(d.querySelector('button[onclick*="fdJump"]'))d.classList.add('p4hideold');if(d.querySelector('a[href*="trello"]')&&d.textContent.indexOf('Trello')>-1&&d.textContent.indexOf('GPS')<0)d.classList.add('p4hideold');});
    if(!ti.querySelector('.p4qa')){const w=document.createElement('div');w.innerHTML=quickRow(s,m);const map=ti.querySelector('a[href*="google"],a[href*="maps"]');ti.insertBefore(w.firstChild,map||null);}
    const up=ti.querySelector('div[style*="uppercase"]');if(up&&up.textContent.indexOf('Trello')>-1)up.textContent=up.textContent.split('·')[0].trim();
    // "Read this job to me" becomes a small pill with a short label
    const sp=$('fdSpeak');if(sp){const b=sp.querySelector('button,.btn');if(b&&!b.dataset.p4){b.dataset.p4='1';b.innerHTML='🔊 '+tt('Read');}}
  }}catch(e){console.error('p4 folder',e);}return r;};}

/* ───────── More page: the time-off tile gets a drawn icon like the others ───────── */
if(typeof window.renderMore==='function'){const _rm=window.renderMore;window.renderMore=function(){const r=_rm.apply(this,arguments);try{const g=$('moreGrid');if(g){[...g.querySelectorAll('.mg')].forEach(x=>{if(x.getAttribute('onclick')==='reqTimeOff()'&&!x.querySelector('svg')){x.innerHTML='<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'+x.textContent.replace('🏖','').trim();}});}}catch(e){}return r;};}

/* ───────── 6. "+" button: on the Jobs page the office can add a job from it too ───────── */
if(window.P2&&typeof P2.openFab==='function'){const _fab=P2.openFab;P2.openFab=function(){const r=_fab.apply(this,arguments);try{const m=M();const g=document.querySelector('.p2sheet .p2grid');if(g&&m&&typeof canNewJob==='function'&&canNewJob(m)&&!g.querySelector('[data-p4job]')){const b=document.createElement('button');b.className='p2act';b.setAttribute('data-p4job','1');b.innerHTML='<span class="ic" style="background:#d93a2b22;color:#d93a2b"><svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg></span>'+tt('Job');b.onclick=()=>{try{P2.closeSheet();}catch(e){}openNewJob();};g.appendChild(b);}}catch(e){}return r;};}

})();
