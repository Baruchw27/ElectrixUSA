/* Electrix USA — P7 layout (Baruch 2026-10-27, v2 after his review).
   • The same layout for EVERYONE: no bottom bar for anybody. A menu button (☰, top left) opens every section the person
     is allowed to use, with counts. The Electrix icon goes back to the start page (Home; Punch for field workers).
     Per-person bars no longer matter: one design for all, each person still only sees what they're allowed to.
   • Home (owner, managers, office) is smart: cards only show when they have something; long lists fold to a few lines
     ("Show all"); each card can be folded and stays folded; the order follows the time of day —
       morning: crews today → who's on the job (and who's not in yet) → tasks → meetings → material
       daytime: tasks → who's on the job → meetings → crews today → material
       evening: tasks → crews TOMORROW → meetings → material → who's on the job
     Tasks include the O&R tasks (tagged O&R) and "waiting on others". Meetings include inspections.
     The date at the top opens the Calendar.
   • More → "Settings" (language, look, Face ID, time off, notifications, sign out).
   • Tasks: one Open / Done switch (the three counters are gone). Job page: hours and crews once.
   Off: window.EX_P7_OFF. */
(function(){
if(window.EX_P7_OFF)return;
const $=id=>document.getElementById(id);
const M=()=>{try{return me();}catch(e){return null;}};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsq=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const tt=s=>{try{return t(s);}catch(e){return s;}};
const IC=n=>{try{return window.exIcon?window.exIcon(n):'';}catch(e){return '';}};
const hubRole=m=>!!m&&(m.role==='owner'||m.role==='manager'||m.role==='office'||m.role==='worker'||!!m.all);/* Baruch 10/28 19:35: one app for everyone — the same Home, only what each person may see */
const short=s=>String(s||'').split(',')[0];
try{if(typeof ES==='object')Object.assign(ES,{"Menu":"Menú","Needs action":"Requiere acción","My tasks":"Mis tareas","On site":"En obra","Crews out":"Cuadrillas","Material":"Material","Today":"Hoy","Settings":"Ajustes","Home":"Inicio",
  "Crews today":"Cuadrillas hoy","Crews tomorrow":"Cuadrillas mañana","On the job now":"En la obra ahora","Not in yet":"Aún no llegan","Meetings & inspections":"Reuniones e inspecciones",
  "Material waiting":"Material pendiente","Show all":"Ver todo","Show less":"Ver menos","Waiting on others":"Esperando a otros","All caught up.":"Todo al día.","No job":"Sin trabajo",
  "Inspection":"Inspección","Inspection to book":"Inspección por agendar","items":"artículos","Late":"Atrasado","New":"Nuevo","Nobody punched in yet.":"Nadie ha marcado todavía."});}catch(e){}

/* ───────── look ───────── */
const css=`
html.p7nobar .tabs{display:none!important}
html.p7nobar body{padding-bottom:0}
html.p7nobar #p2fab{bottom:calc(18px + env(safe-area-inset-bottom,0px))!important}
html.p7nobar #p2bar{bottom:calc(14px + env(safe-area-inset-bottom,0px))!important}
#p7fm{position:fixed;right:calc(max(16px,env(safe-area-inset-right,0px)) + 68px);bottom:calc(18px + env(safe-area-inset-bottom,0px));width:56px;height:56px;border-radius:50%;border:none;background:#fff;color:var(--g5);box-shadow:0 4px 14px rgba(0,0,0,.18),0 0 0 .5px rgba(0,0,0,.08);display:flex;align-items:center;justify-content:center;z-index:60;cursor:pointer;padding:0}
#p7fm svg{width:24px;height:24px}
#p7fm:active{transform:scale(.94)}
html[data-theme=dark] #p7fm{background:#2c2c2e;color:#fff}
html.p2crew #p7fm{right:max(16px,env(safe-area-inset-right,0px))}
#homeBody{padding-bottom:70px}
.p7menu{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:none;border-radius:11px;background:var(--g1);color:var(--g5);cursor:pointer;margin-left:8px;padding:0}
.p7menu svg{width:20px;height:20px}
#p7drawer{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.35);display:none}
#p7drawer.on{display:block}
#p7drawer .pan{position:absolute;right:0;top:0;bottom:0;width:min(300px,84vw);background:var(--bg,#f2f2f7);padding:max(14px,env(safe-area-inset-top)) 12px 20px;overflow-y:auto;box-shadow:-4px 0 24px rgba(0,0,0,.18)}
html[data-theme=dark] #p7drawer .pan{background:#111113}
#p7drawer .who{display:flex;align-items:center;gap:10px;padding:6px 6px 14px}
#p7drawer .who img{width:36px;height:36px;border-radius:10px}
#p7drawer .who b{display:block;font-size:15px}#p7drawer .who span{font-size:12px;color:var(--g4)}
#p7drawer .it{display:flex;align-items:center;gap:12px;width:100%;border:none;background:none;border-radius:11px;padding:10px 10px;font:500 15px/1.2 inherit;font-family:inherit;color:var(--g5);cursor:pointer;text-align:left}
#p7drawer .it.on{background:#fff;font-weight:700}
html[data-theme=dark] #p7drawer .it.on{background:#1c1c1e}
#p7drawer .it svg{width:20px;height:20px;color:var(--blue-mid);flex:none}
#p7drawer .it i{margin-left:auto;font-style:normal;font-size:12px;font-weight:700;background:#d93a2b;color:#fff;border-radius:999px;padding:1px 7px}
#p7drawer .it i.g{background:var(--g2);color:var(--g5)}
#p7drawer hr{border:none;border-top:1px solid var(--g2);margin:8px 6px}
#p7date{display:flex;align-items:center;gap:12px;background:none;border:none;padding:0;cursor:pointer;font-family:inherit;color:inherit;text-align:left;width:100%;margin-bottom:12px}
#p7date .cal{flex:none;width:46px;height:48px;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08),0 0 0 .5px rgba(0,0,0,.08);display:flex;flex-direction:column;align-items:center;overflow:hidden}
html[data-theme=dark] #p7date .cal{background:#1c1c1e}
#p7date .cal i{display:block;width:100%;background:#d93a2b;color:#fff;font:700 9.5px/15px inherit;font-style:normal;text-align:center;text-transform:uppercase;letter-spacing:.6px}
#p7date .cal b{font-size:20px;line-height:31px}
#p7date .d{font-size:13px;color:var(--g4)}#p7date h2{margin:0;font-size:20px;letter-spacing:-.2px}
#p7date .go{margin-left:auto;color:var(--g4);font-size:22px}
.p7nums{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:0 0 12px}
.p7nums button{border:none;background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.07);border-radius:13px;padding:9px 4px 8px;cursor:pointer;font-family:inherit;color:var(--g5);text-align:center}
html[data-theme=dark] .p7nums button{background:#1c1c1e;box-shadow:none}
.p7nums b{display:block;font-size:19px;line-height:1.15;letter-spacing:-.3px}.p7nums span{font-size:11px;color:var(--g4)}
.p7c{background:#fff;border-radius:16px;margin-bottom:10px;box-shadow:0 0 0 .5px rgba(0,0,0,.07);overflow:hidden}
html[data-theme=dark] .p7c{background:#1c1c1e;box-shadow:none}
.p7c .p7h{display:flex;align-items:center;gap:10px;padding:11px 13px;cursor:pointer;user-select:none}
.p7c .p7h .ic{flex:none;width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center}
.p7c .p7h .ic svg{width:17px;height:17px}
.p7c .p7h b{font-size:15px;flex:1;min-width:0}
.p7c .p7h .n{font-size:12px;font-weight:700;border-radius:999px;padding:2px 8px;background:var(--g1);color:var(--g5)}
.p7c .p7h .n.r{background:#d93a2b;color:#fff}
.p7c .p7h .ch{color:var(--g4);font-size:13px;transition:transform .15s}
.p7c.fold .p7h .ch{transform:rotate(-90deg)}
.p7c.fold .bd{display:none}
.p7c .bd{padding:0 13px 6px}
.p7r{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--g1);cursor:pointer;font-size:14px;line-height:1.3}
.p7r .w{flex:1;min-width:0}.p7r .w small{display:block;color:var(--g4);font-size:12px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.p7r .tm{flex:none;font-size:12.5px;font-weight:700;color:var(--blue-mid);min-width:58px}
.p7r .ck{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid var(--g3,#c7c7cc);background:none;cursor:pointer;padding:0}
.p7r .pill{flex:none;font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 8px;background:var(--g1);color:var(--g5)}
.p7r .pill.ok{background:#2fb36b22;color:#1f8a4c}.p7r .pill.am{background:#e8912d22;color:#b86a00}.p7r .pill.bad{background:#d93a2b1c;color:#c0392b}
.p7tag{display:inline-block;font-size:10.5px;font-weight:700;border-radius:5px;padding:0 5px;margin-right:5px;vertical-align:1px;background:#2f80ed1c;color:#2f80ed}
.p7tag.r{background:#d93a2b1c;color:#c0392b}.p7tag.p{background:#9b51e01c;color:#7b3fc0}
.p7warn{font-size:12.5px;color:#b86a00;background:#e8912d14;border-radius:10px;padding:7px 10px;margin:4px 0 6px}
.p7more{font-size:13px;font-weight:600;color:var(--blue-mid);padding:8px 0 6px;cursor:pointer;border-top:1px solid var(--g1)}
.p7empty{color:var(--g4);font-size:13.5px;padding:4px 0 8px}
html.p7nobar #pg-jobs > .stats{display:none}
/* compact (Baruch 21:12: smaller, see more at once) */
#p5hero{padding:2px 0 6px!important;margin:0!important}
#p5hero img{width:min(40%,160px)!important}
#p7date{gap:9px;margin-bottom:8px}
#p7date .cal{width:36px;height:38px;border-radius:9px}
#p7date .cal i{font-size:8.5px;line-height:12px}#p7date .cal b{font-size:16px;line-height:25px}
#p7date .d{font-size:11.5px}#p7date h2{font-size:16.5px}
.p7nums{gap:6px;margin-bottom:8px}
.p7nums button{padding:6px 2px 5px;border-radius:11px}
.p7nums b{font-size:16px}.p7nums span{font-size:10.5px}
.p7c{border-radius:13px;margin-bottom:7px}
.p7c .p7h{padding:7px 11px;gap:8px}
.p7c .p7h .ic{width:24px;height:24px;border-radius:7px}.p7c .p7h .ic svg{width:14px;height:14px}
.p7c .p7h b{font-size:13.5px}
.p7c .p7h .n{font-size:11px;padding:1px 7px}
.p7c .bd{padding:0 11px 3px}
.p7r{padding:5px 0;font-size:13px;gap:8px;line-height:1.25}
.p7r .w small{font-size:11.5px;margin-top:0}
.p7r.one .w{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.p7r.one .w small{display:inline;margin-left:6px}
.p7r .ck{width:18px;height:18px}
.p7r .tm{font-size:11.5px;min-width:48px}
.p7r .pill{font-size:10.5px;padding:1px 6px}
.p7tag{font-size:9.5px;padding:0 4px}
.p7more{font-size:12px;padding:5px 0 4px}
.p7warn{font-size:11.5px;padding:4px 8px;margin:2px 0 3px}
`;
const stEl=document.createElement('style');stEl.id='p7css';stEl.textContent=css;document.body.appendChild(stEl);

/* ───────── one layout for everyone: no bar, a menu ───────── */
const _pf=window.primaryFor;
function startOf(m){if(hubRole(m))return 'home';
  if(m&&m.role==='worker'&&typeof noClock==='function'&&noClock(m))return 'jobs';   // H09: no time clock → start on Tasks, not Punch
  try{const p=_pf(m);return (p||[]).find(x=>x!=='more')||'punch';}catch(e){return 'punch';}}
if(typeof _pf==='function'){window.primaryFor=function(m){return m?[startOf(m),'more']:_pf.apply(this,arguments);};try{primaryFor=window.primaryFor;}catch(e){}}
function setMode(){document.documentElement.classList.toggle('p7nobar',!!M());}
const ORDER=['home','punch','jobs','sites','sched','cal','hours','orr','mat','trello','team','exp','est','svc','tools','rep','code','msg','van'];
const LABEL={home:'Home',jobs:'Tasks',sites:'Jobs',cal:'Calendar',sched:'Schedule',exp:'Money',tools:'Garage',trello:'My Trello',more:'Settings'};
function allowed(){return [...document.querySelectorAll('.tab')].filter(b=>b.dataset.allowed==='1').map(b=>((b.getAttribute('onclick')||'').match(/'([a-z]+)'/)||[])[1]).filter(Boolean);}
function tabIcon(n){const b=document.querySelector('.tab[onclick*="\''+n+'\'"] svg');return b?b.outerHTML.replace(/width="20" height="20"/,''):'';}
const GEAR='<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>';
const BURGER='<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
function badge(n,m){try{if(n==='jobs')return [myTasks(m).length,'g'];if(n==='orr'&&window.ORR)return [(D.orr||[]).filter(x=>ORR.todo(x)).length,''];
  if(n==='mat'&&typeof canHandleMat==='function'&&canHandleMat(m))return [(D.mats||[]).filter(x=>x.status==='open').length,''];
  if(n==='hours'&&typeof canEditHours==='function'&&canEditHours(m))return [(D.fixes||[]).filter(f=>f.status==='pending').length,''];
  if(n==='msg'){const gk=(typeof myGroups==='function'?myGroups(m):[]).map(g=>'g:'+g.id);return [(D.msgs||[]).filter(x=>(x.to===m.id&&!x.read)||(gk.includes(x.k)&&x.from!==m.id&&!(x.readBy||[]).includes(m.id))).length,''];}}catch(e){}return [0,''];}
function drawer(){let d=$('p7drawer');if(!d){d=document.createElement('div');d.id='p7drawer';d.onclick=e=>{if(e.target===d)P7.close();};document.body.appendChild(d);}
  const m=M();if(!m)return d;const al=allowed();const st=startOf(m);const cur=((document.querySelector('.pg.on')||{}).id||'').replace('pg-','');
  const L=ORDER.filter(n=>n===st||(n!=='home'&&al.includes(n)));
  const it=n=>{const [c,k]=badge(n,m);return '<button class="it'+(cur===n?' on':'')+'" onclick="P7.go(\''+n+'\')">'+(n==='home'?IC('home')||tabIcon('home'):tabIcon(n))+esc(tt(LABEL[n]||(TABMETA[n]||[])[1]||n))+(c?'<i class="'+k+'">'+c+'</i>':'')+'</button>';};
  d.innerHTML='<div class="pan"><div class="who"><img src="icon-192.png" alt=""><div><b>'+esc(m.name||'')+'</b><span>'+esc(tt(m.title||({owner:'Owner',manager:'Site manager',office:'Office',worker:'Field'})[m.role]||''))+'</span></div></div>'
    +L.map(it).join('')+'<hr><button class="it'+(cur==='more'?' on':'')+'" onclick="P7.go(\'more\')">'+GEAR+esc(tt('Settings'))+'</button></div>';return d;}
const P7=window.P7={open(){drawer().classList.add('on');},close(){const d=$('p7drawer');if(d)d.classList.remove('on');},go(n){P7.close();goTab(n);}};
function topBtns(){document.querySelectorAll('.top .p7menu,.top .p7back').forEach(x=>x.remove());
  if(!$('p7fm')){const b=document.createElement('button');b.id='p7fm';b.setAttribute('aria-label','Menu');b.innerHTML=BURGER;b.onclick=e=>{e.stopPropagation();P7.open();};document.body.appendChild(b);}
  const mk=document.querySelector('.top .p5mark');if(mk)mk.onclick=()=>{try{goTab(startOf(M()));}catch(e){}};}
if(typeof window.applyTabs==='function'){const _at=window.applyTabs;window.applyTabs=function(){const r=_at.apply(this,arguments);try{setMode();topBtns();const m=M();if(hubRole(m)){const hb=document.querySelector('.tab[onclick*="\'home\'"]');if(hb)hb.dataset.allowed='1';}}catch(e){}return r;};}

/* ───────── Home ───────── */
const fold=k=>{try{return localStorage.getItem('p7f_'+k)==='1';}catch(e){return false;}};
const open_=k=>!!(window.__p7open||{})[k];
P7.fold=k=>{const c=document.querySelector('.p7c[data-k="'+k+'"]');if(!c)return;const f=!c.classList.contains('fold');c.classList.toggle('fold',f);try{localStorage.setItem('p7f_'+k,f?'1':'0');}catch(e){}};
P7.all=k=>{window.__p7open=window.__p7open||{};window.__p7open[k]=!window.__p7open[k];renderHome();};
const fieldOff=()=>window.EX_FIELD_CLOCK===false;
/* Baruch 10/28 23:48: all crews work 8 AM – 7 PM; Friday 8 AM – 1:15 PM */
const workHours=d=>{d=d||new Date();return window.EX_WORK_HOURS||(tt('8:00 AM')+' – '+tt(new Date(d).getDay()===5?'1:15 PM':'7:00 PM'));};   /* Baruch 10/28 23:48: 8 AM – 7 PM, Friday 8 AM – 1:15 PM */
const jobPhase=(s,c)=>{const p=(s&&s.phase)||(c&&c.type==='finish'?'finish':'rough');return p==='finish'?'Finishing':'Rough';};
window.EX_jobPhase=jobPhase;window.EX_workHours=workHours;
function card(k,icon,col,title,n,rows,lim,extra,red){if(!rows.length&&!extra)return '';const show=open_(k)?rows:rows.slice(0,lim);
  return '<div class="p7c'+(fold(k)?' fold':'')+'" data-k="'+k+'"><div class="p7h" onclick="P7.fold(\''+k+'\')"><span class="ic" style="background:'+col+'1f;color:'+col+'">'+icon+'</span><b>'+esc(tt(title))+'</b>'+(n!=null?'<span class="n'+(red?' r':'')+'">'+n+'</span>':'')+'<span class="ch">▾</span></div>'
    +'<div class="bd">'+(extra||'')+show.join('')+(rows.length>lim?'<div class="p7more" onclick="P7.all(\''+k+'\')">'+(open_(k)?esc(tt('Show less')):esc(tt('Show all'))+' ('+rows.length+')')+'</div>':'')+'</div></div>';}
const fmtT=at=>new Date(at).toLocaleTimeString(LOC(),{hour:'numeric',minute:'2-digit'});
function tasksCard(m){let L=[];try{L=myTasks(m);}catch(e){}const td=new Date();td.setHours(0,0,0,0);
  const due=j=>{try{return gpDue(j);}catch(e){return null;}};const late=j=>{const d=due(j);return d!==null&&d<td.getTime();};
  L=L.slice().sort((a,b)=>(late(b)-late(a))||((b.pri?1:0)-(a.pri?1:0))||((b.ts||0)-(a.ts||0)));
  const rows=L.map(j=>{let tx='';try{tx=jobText(j);}catch(e){tx=j.desc||'';}const from=j.from&&j.from!==m.id?nameOf(j.from).split(' ')[0]:'';
    const tags=(late(j)?'<span class="p7tag r">'+esc(tt('Late'))+'</span>':'')+(j.orr||j.orrAuto?'<span class="p7tag">O&amp;R</span>':'')+(!j['seen_'+m.id]&&from?'<span class="p7tag p">'+esc(tt('New'))+'</span>':'');
    return '<div class="p7r one" onclick="openJobDetail(\''+jsq(j.id)+'\')"><button class="ck" aria-label="Done" onclick="event.stopPropagation();markDone(\''+jsq(j.id)+'\')"></button><div class="w">'+tags+(j.pri?'<b style="color:#c0392b">':'')+esc(String(tx).replace(/^O&R · [^:]*: /,'').replace(/^O&R · /,''))+(j.pri?'</b>':'')+'<small>'+[j.site?esc(short(siteName(j.site))):'',from?esc(tt('from'))+' '+esc(from):''].filter(Boolean).join(' · ')+'</small></div></div>';});
  let W=[];try{W=gpWaiting(m);}catch(e){}
  const wait=W.length?'<div class="p7more" style="color:var(--g5)" onclick="P7.all(\'wait\')">'+esc(tt('Waiting on others'))+' <span style="color:var(--g4)">'+W.length+'</span> '+(open_('wait')?'▾':'▸')+'</div>'
    +(open_('wait')?W.slice(0,15).map(j=>'<div class="p7r" onclick="openJobDetail(\''+jsq(j.id)+'\')"><div class="w">'+esc(String(j.desc||'').slice(0,80))+'<small>'+esc(nameList(j))+' · '+esc(gpAge(j.ts))+'</small></div></div>').join(''):''):'';
  const lateN=L.filter(late).length;
  const body=rows.length?'':'<div class="p7empty">✓ '+esc(tt('All caught up.'))+'</div>';
  let h=card('tasks',tabIcon('jobs'),'#2f80ed','My tasks',L.length,rows,6,body,lateN>0);
  if(wait)h=h.replace(/<\/div><\/div>$/,wait+'</div></div>');
  return h;}
function crewCard(day){const k=dkey(day);const isT=day.toDateString()===new Date().toDateString();const td=new Date().toDateString();const me_=M();const own=me_&&me_.role==='worker';
  const rows=[];let out=0;(own?[(D.crews||[]).find(c=>c.id===me_.crew)||(me_.crew?{id:me_.crew,name:tt('My crew')}:null)].filter(Boolean):(D.crews||[])).forEach(c=>{const guys=(D.emps||[]).filter(e=>e.crew===c.id&&!e.inactive);if(!guys.length)return;const sl=schedDay(c.id+'|'+k);
    if(!sl){if(day.getDay()!==6)rows.push('<div class="p7r one" onclick="goTab(\'sched\')"><div class="w"><b>'+esc(c.name)+'</b><small>'+guys.map(e=>esc(e.name.split(' ')[0])).join(', ')+'</small></div><span class="pill bad">'+esc(tt('No job'))+'</span></div>');return;}
    out++;const inN=isT&&!fieldOff()?guys.filter(e=>(D.punches||[]).some(p=>p.who===e.id&&!p.out&&new Date(p.in).toDateString()===td)).length:null;
    rows.push('<div class="p7r one" onclick="'+(own?'goTab(\'sched\')':'openCrew(\''+jsq(c.id)+'\')')+'"><div class="w"><b>'+esc(own?short(siteName(sl.site||'')):c.name)+'</b>'+(sl.time?' <span style="color:var(--g4);font-size:12.5px">'+esc(sl.time)+'</span>':'')+'<small>'+(own?guys.map(e=>esc(e.name.split(' ')[0])+(e.lead?' ★':'')).join(', '):esc(sl.site?short(siteName(sl.site)):(tt('Several jobs'))))+'</small></div>'+(inN!=null?'<span class="pill '+(inN===guys.length?'ok':inN?'am':'bad')+'">'+inN+'/'+guys.length+'</span>':'')+'</div>');});
  if(own&&isT){const c=(own?[(D.crews||[]).find(c=>c.id===me_.crew)]:[])[0]||{};const sl=me_.crew?schedDay(me_.crew+'|'+k):null;const st=sl&&(D.sites||[]).find(x=>x.id===sl.site);
    const guys=(D.emps||[]).filter(e=>e.crew===me_.crew&&!e.inactive);
    const big=sl&&st?'<div class="p9job" onclick="openFolder(\''+jsq(st.id)+'\')"><div class="a">'+esc(st.name.split(',')[0])+'</div><div class="m">'+esc(tt(jobPhase(st,c)))+' · '+esc(workHours())+'</div>'
        +'<div class="g">'+guys.map(e=>'<span>'+esc(e.name.split(' ')[0])+(e.lead?' ★':'')+'</span>').join('')+'</div>'
        +'<div class="b"><a href="'+esc(safeHref(gmapsDir(st)))+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">'+esc(tt('Directions'))+'</a><button onclick="event.stopPropagation();openFolder(\''+jsq(st.id)+'\')">'+esc(tt('Open job'))+'</button></div></div>'
      :'<div class="p7empty">'+esc(tt(new Date().getDay()===6?'No work today.':'No job scheduled yet — ask your crew leader.'))+'</div>';
    return card('myjob',IC('pin')||tabIcon('sched'),'#9b51e0','My job today',null,[],0,big,false);}
  if(own)return card(isT?'myjob':'myjobT',IC('cal')||tabIcon('sched'),'#9b51e0',isT?'My job today':'My job tomorrow',null,rows,6,rows.length?'':'<div class="p7empty">'+esc(tt('No crew assigned.'))+'</div>',false);
  return card(isT?'crews':'crewsT',IC('cal')||tabIcon('sched'),'#9b51e0',isT?'Crews today':'Crews tomorrow',out+'/'+rows.length,rows,6,'',rows.some(r=>r.includes('pill bad'))&&!isT);}
function onsiteCard(){const td=new Date().toDateString();const hr=new Date().getHours();const live=(D.punches||[]).filter(p=>!p.out&&new Date(p.in).toDateString()===td&&(D.emps||[]).some(e=>e.id===p.who));
  const by={};live.forEach(p=>{(by[p.site]=by[p.site]||[]).push(p);});const field=(D.emps||[]).filter(e=>e.role==='worker'&&!e.inactive&&!(typeof noClock==='function'&&noClock(e)));
  const rows=Object.entries(by).sort((a,b)=>b[1].length-a[1].length).map(([sid,ps])=>'<div class="p7r one" onclick="openFolder(\''+jsq(sid)+'\')"><div class="w"><b>'+esc(short(siteName(sid)))+'</b><small>'+ps.sort((a,b)=>a.in-b.in).map(p=>esc(nameOf(p.who).split(' ')[0])+(p.away?' ⚠':'')).join(', ')+'</small></div><span class="pill ok">'+ps.length+'</span></div>');
  let notIn=[];try{const k=dkey(new Date());notIn=(D.crews||[]).filter(c=>schedDay(c.id+'|'+k)).flatMap(c=>(D.emps||[]).filter(e=>e.crew===c.id&&!e.inactive&&!(typeof noClock==='function'&&noClock(e)))).filter(e=>!(D.punches||[]).some(p=>p.who===e.id&&new Date(p.in).toDateString()===td));}catch(e){}
  const warn=notIn.length&&hr>=6&&hr<17?'<div class="p7warn">⏱ '+esc(tt('Not in yet'))+': '+notIn.map(e=>esc(e.name.split(' ')[0])).join(', ')+'</div>':'';
  const n=live.filter(p=>field.some(e=>e.id===p.who)).length;
  return card('onsite',IC('pin')||tabIcon('hours'),'#2fb36b','On the job now',n+'/'+field.length,rows,6,warn||(rows.length?'':'<div class="p7empty">'+esc(tt('Nobody punched in yet.'))+'</div>'),false);}
function meetCard(m){const now=Date.now();const td=new Date().toDateString();const tm=new Date();tm.setDate(tm.getDate()+1);const tms=tm.toDateString();
  const day=at=>{const d=new Date(at).toDateString();return d===td?fmtT(at):d===tms?tt('Tomorrow')+' '+fmtT(at):new Date(at).toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'});};
  let L=[];try{L=(D.meets||[]).filter(x=>x.at>=now-3600000&&x.at<now+7*86400000&&(m.role==='owner'||inMeet(x,m.id))).map(x=>({at:x.at,h:'<div class="p7r one" onclick="goTab(\'cal\')"><span class="tm">'+esc(day(x.at))+'</span><div class="w">'+esc(x.title||tt('Meeting'))+'<small>'+[x.site?esc(short(siteName(x.site))):'',(()=>{try{return esc(meetWhoLine(x));}catch(e){return '';}})()].filter(Boolean).join(' · ')+'</small></div></div>'}));}catch(e){}
  try{(D.insp||[]).forEach(i=>{if(i.status==='booked'&&i.at>=now-3600000&&i.at<now+7*86400000)L.push({at:i.at,h:'<div class="p7r" onclick="openFolder(\''+jsq(i.site)+'\')"><span class="tm">'+esc(day(i.at))+'</span><div class="w"><span class="p7tag p">'+esc(tt('Inspection'))+'</span>'+esc(short(siteName(i.site)))+'</div></div>'});
    else if(i.status==='requested')L.push({at:0,h:'<div class="p7r" onclick="openFolder(\''+jsq(i.site)+'\')"><span class="tm" style="color:#c0392b">!</span><div class="w">'+esc(tt('Inspection to book'))+'<small>'+esc(short(siteName(i.site)))+'</small></div></div>'});});}catch(e){}
  L.sort((a,b)=>a.at-b.at);const todayN=L.filter(x=>x.at&&new Date(x.at).toDateString()===td).length;
  return card('meets',IC('cal')||tabIcon('cal'),'#e8912d','Meetings & inspections',todayN?todayN+' '+tt('today'):L.length,L.map(x=>x.h),5,'',false);}
function matCard(m){if(!(typeof canHandleMat==='function'&&canHandleMat(m))&&m.role!=='owner')return '';const L=(D.mats||[]).filter(x=>x.status==='open').sort((a,b)=>(a.ts||0)-(b.ts||0));
  const rows=L.map(x=>{let n=0;try{n=liItems(x).length;}catch(e){}return '<div class="p7r one" onclick="goTab(\'mat\')"><div class="w"><b>'+esc(short(x.site?siteName(x.site):x.addr||'—'))+'</b><small>'+[n?n+' '+esc(tt('items')):'',x.from?esc(nameOf(x.from).split(' ')[0]):'',x.when?esc(tt(x.when)):''].filter(Boolean).join(' · ')+'</small></div><span class="chev" style="color:var(--g4)">›</span></div>';});
  return card('mat',IC('box')||tabIcon('mat'),'#a86a00','Material waiting',L.length,rows,3,'',false);}
function attCard(L){if(!L.length)return '';L=L.slice().sort((a,b)=>b.red-a.red);
  const rows=L.map(x=>'<div class="p7r one" onclick="'+esc(x.act)+'"><span style="flex:none;width:8px;height:8px;border-radius:50%;background:'+(x.red?'#d93a2b':'#e8912d')+'"></span><div class="w">'+esc(x.txt.replace(/^[^A-Za-z0-9¿¡]+/,''))+'</div><span style="color:var(--g4)">›</span></div>');
  const red=L.filter(x=>x.red).length;
  return card('att',IC('warn')||'!','#d93a2b','Needs action',L.length,rows,6,'',red>0);}
function nums(m,al){const td=new Date().toDateString();let mine=0;try{mine=myTasks(m).length;}catch(e){}
  const field=(D.emps||[]).filter(e=>e.role==='worker'&&!e.inactive);const on=field.filter(e=>(D.punches||[]).some(p=>p.who===e.id&&!p.out&&!p.away&&new Date(p.in).toDateString()===td)).length;
  let crews=0;try{const k=dkey(new Date());crews=(D.crews||[]).filter(c=>schedDay(c.id+'|'+k)).length;}catch(e){}
  const mats=(D.mats||[]).filter(x=>x.status==='open').length;
  const b=(n,l,go,col)=>'<button onclick="'+go+'"><b style="color:'+col+'">'+n+'</b><span>'+esc(tt(l))+'</span></button>';
  return '<div class="p7nums">'+b(mine,'My tasks',"P7.to('tasks','jobs')",'#2f80ed')+b(on,'On site',"P7.to('onsite','hours')",'#1f8a4c')+b(crews+'/'+(D.crews||[]).length,'Crews out',"P7.to('crews','sched')",'#7b3fc0')+b(mats,'Material',"P7.to('mat','mat')",mats?'#b86a00':'var(--g4)')+'</div>';}
P7.to=(k,tab)=>{const c=document.querySelector('.p7c[data-k="'+k+'"]');if(c){if(c.classList.contains('fold'))P7.fold(k);c.scrollIntoView({behavior:'smooth',block:'start'});}else{try{goTab(tab);}catch(e){}}};
function hubHome(m,el,att){const d=new Date();const hr=d.getHours();const al=allowed();const greet=hr<12?tt('Good morning'):hr<17?tt('Good afternoon'):tt('Good evening');
  const can=n=>al.includes(n)||m.role==='owner';
  const tom=new Date();tom.setDate(tom.getDate()+1);
  const C={tasks:()=>tasksCard(m),onsite:()=>(can('hours')||m.role==='owner'||m.role==='manager'||m.all)&&!fieldOff()?onsiteCard():'',crews:()=>can('sched')?crewCard(new Date()):'',crewsT:()=>can('sched')?crewCard(tom):'',meets:()=>meetCard(m),mat:()=>matCard(m)};
  const order=m.role==='worker'?['crews','tasks','crewsT','meets']:hr<11?['crews','onsite','tasks','meets','mat']:hr<16?['tasks','onsite','meets','crews','mat']:['tasks','crewsT','meets','mat','onsite'];
  let toq='';try{toq=typeof timeOffQueue==='function'?timeOffQueue():'';}catch(e){}
  el.innerHTML='<div id="p5hero"><img src="'+(document.documentElement.getAttribute('data-theme')==='dark'||(!document.documentElement.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme: dark)').matches)?'logo-dark.svg':'logo-light.svg')+'" alt="Electrix"></div>'
   +'<button id="p7date" onclick="goTab(\'cal\')"><span class="cal"><i>'+esc(d.toLocaleDateString(LOC(),{month:'short'}))+'</i><b>'+d.getDate()+'</b></span><span><span class="d">'+esc(d.toLocaleDateString(LOC(),{weekday:'long',month:'long',day:'numeric'}))+'</span><h2>'+esc(greet)+', '+esc(String(m.name||'').split(' ')[0])+'</h2></span><span class="go">›</span></button>'
   +nums(m,al)+toq+attCard(att||[])+order.map(k=>{try{return C[k]();}catch(e){console.error('p7 card',k,e);return '';}}).join('');}
if(typeof window.renderHome==='function'){const _rh=window.renderHome;window.renderHome=function(){const m=M();const el=$('homeBody');
  if(!m||!el||!hubRole(m))return _rh.apply(this,arguments);
  try{_rh.apply(this,arguments);}catch(e){}
  // Baruch 21:41: keep "Needs action" — take the alerts the app already works out (overdue, off site, no job tomorrow,
  // inspections to book, not punched in, punch fixes, receipts, GPS…) and show them as one compact card at the top
  let att=[];try{const tile=[...el.querySelectorAll('.tile')].find(x=>{const h=x.querySelector('h3');return h&&/needs attention|necesita atenci/i.test(h.textContent);});
    if(tile)att=[...tile.querySelectorAll('.att span')].filter(x=>!x.classList.contains('g')).map(x=>({red:x.classList.contains('r'),txt:x.textContent.trim(),act:x.getAttribute('onclick')||''}));}catch(e){}
  // M05: office people (no all-access) never get that tile — work out the alerts for their own job instead
  if(m.role==='office'&&!m.all){try{att=att.concat(officeAtt(m));}catch(e){}}
  try{hubHome(m,el,att);}catch(e){console.error('p7 home',e);}};}
try{if(typeof ES==='object')Object.assign(ES,{"clock entries to approve":"entradas de reloj por aprobar","O&R follow-ups":"seguimientos de O&R"});}catch(e){}
function officeAtt(m){const L=[];const add=(red,txt,act)=>L.push({red,txt,act});
  if(m.title==='Payroll'){const f=(D.fixes||[]).filter(x=>x.status==='pending').length;if(f)add(false,f+' '+tt('punch fixes'),"goTab('hours')");
    const p=(D.punches||[]).filter(x=>x.pending&&!x.approvedBy&&!x.rejected).length;if(p)add(true,p+' '+tt('clock entries to approve'),"goTab('hours')");}
  if(m.title==='Payroll'||m.title==='Bookkeeper'){const r=(D.exps||[]).filter(x=>!x.amt).length;if(r)add(false,r+' '+tt('receipts need amount'),"moneyView='receipts';goTab('exp')");}
  if(typeof canBookInsp==='function'&&canBookInsp(m)){const i=(D.insp||[]).filter(x=>x.status==='requested').length;if(i)add(true,i+' '+tt('inspection to book'),"goTab('sites')");}
  if(m.title!=='Accountant'&&window.ORR&&typeof ORR.todo==='function'){const o=(D.orr||[]).filter(x=>x&&!x.deleted&&ORR.todo(x)).length;if(o)add(true,o+' '+tt('O&R follow-ups'),"goTab('orr')");}
  return L;}

/* ───────── More → Settings ───────── */
function moveNotif(){try{const pg=$('pg-more'),sp=$('pg-sites');if(!pg||!sp||$('p7notif'))return;const s=[...sp.querySelectorAll(':scope > .sec')].find(x=>/Notifications|Notificaciones/.test(x.textContent));
  if(s){const card=s.nextElementSibling;const w=document.createElement('div');w.id='p7notif';w.appendChild(s);if(card&&card.classList.contains('card'))w.appendChild(card);pg.appendChild(w);}}catch(e){}}
if(typeof window.renderMore==='function'){const _rm=window.renderMore;window.renderMore=function(){const r=_rm.apply(this,arguments);try{
  const pg=$('pg-more');const h=pg&&pg.querySelector('h2');if(h)h.textContent=tt('Settings');
  document.querySelectorAll('#moreGrid .mg').forEach(x=>{if(/goTab\(/.test(x.getAttribute('onclick')||''))x.remove();});moveNotif();
}catch(e){console.error('p7 more',e);}return r;};}

/* ───────── job page: no second copies ───────── */
try{if(typeof window.crewsAtSiteHtml==='function'){window.crewsAtSiteHtml=function(){return '';};try{crewsAtSiteHtml=window.crewsAtSiteHtml;}catch(e){}}}catch(e){}
if(typeof window.openFolder==='function'){const _of=window.openFolder;window.openFolder=function(){const r=_of.apply(this,arguments);try{const f=$('m-folder');
  if(f&&[...f.querySelectorAll('.sec')].some(s=>/labor hours|horas de trabajo/i.test(s.textContent)))[...f.querySelectorAll('.tile')].forEach(x=>{const h=x.querySelector('h3');if(h&&/labor hours on this job|horas de trabajo en este/i.test(h.textContent))x.remove();});}catch(e){}return r;};}

/* ───────── start ───────── */
setMode();topBtns();moveNotif();
try{applyTabs();}catch(e){}
try{const m=M();if(m&&!window.__p7started){window.__p7started=1;const on=(document.querySelector('.pg.on')||{}).id;const st=startOf(m);if(on!=='pg-'+st)goTab(st);}}catch(e){}
})();
