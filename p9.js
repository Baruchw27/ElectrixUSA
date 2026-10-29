/* Electrix USA — P9 calm Home options (Baruch 2026-10-27 22:28: "show me all options, I will select").
   Each idea is a switch: html class "o1" … "o18". window.P9_ON lists the ones that are on for everyone
   (empty until Baruch picks). Off: window.EX_P9_OFF. */
(function(){
if(window.EX_P9_OFF)return;
const $=id=>document.getElementById(id);
// Baruch 22:44 picked: 1–10, 13, 14, 15, 16 (17 and 18 not now)
// Baruch 10/28 19:35: the time clock is not set up yet — off for the field (nothing is deleted; set true to bring it back)
window.EX_FIELD_CLOCK=false;
// switching person at the top right opens that person's own start page (Home for everyone now)
try{if(typeof window.setRole==='function'){const _sr=window.setRole;window.setRole=function(v){const r=_sr.apply(this,arguments);try{const m=me();if(m&&String(m.id)===String(v)&&typeof goTab==='function')goTab(primaryFor(m)[0]);}catch(e){}return r;};try{setRole=window.setRole;}catch(x){}}}catch(e){}
try{if(typeof window.noClock==='function'){const _nc=window.noClock;window.noClock=function(e){return _nc(e)||(window.EX_FIELD_CLOCK===false&&!!e&&e.role==='worker');};try{noClock=window.noClock;}catch(x){}}}catch(e){}
window.P9_ON=window.P9_ON||[1,2,3,4,5,6,7,8,9,10,13,14,15,16,18];
const css=`
/* 1 numbers in one dark color */
html.o1 .p7nums b{color:var(--g5)!important}
html[data-theme=dark].o1 .p7nums b{color:#fff!important}
/* 2 no colored squares behind card icons */
html.o2 .p7c .p7h .ic{background:none!important;color:var(--g4)!important;width:18px!important}
/* 3 counts gray unless urgent */
html.o3 .p7c .p7h .n:not(.r){background:none!important;color:var(--g4)!important;font-weight:600!important}
/* 4 quiet tags */
html.o4 .p7tag{background:none!important;color:var(--g4)!important;padding:0!important;font-weight:600!important}
/* 5 no green pills — red only for a problem */
html.o5 .p7r .pill.ok,html.o5 .p7r .pill.am{background:none!important;color:var(--g4)!important;font-weight:600!important}
/* 6 meeting times in dark text */
html.o6 .p7r .tm{color:var(--g5)!important}
html[data-theme=dark].o6 .p7r .tm{color:#fff!important}
/* 7 gray date icon */
html.o7 #p7date .cal i{background:var(--g4)!important}
/* 8 one rule everywhere: black/white/gray, red = urgent, blue = links (on Home: the others together + gray dots for "should handle") */
html.o8 .p7c[data-k=att] .p7r>span:first-child[style*="e8912d"]{background:var(--g3)!important}
/* 9 no boxes — one page, section titles, thin lines */
html.o9 .p7c{background:none!important;box-shadow:none!important;border-radius:0!important;border-top:1px solid var(--g2);margin-bottom:4px!important}
html.o9 .p7c .p7h{padding-left:0!important;padding-right:0!important}
html.o9 .p7c .bd{padding-left:0!important;padding-right:0!important}
html.o9 .p7c .p7h b{text-transform:uppercase;font-size:11.5px!important;letter-spacing:.6px;color:var(--g4)}
/* 10 no number row */
html.o10 .p7nums{display:none!important}
/* 11 small one-line greeting */
html.o11 #p7date .cal{display:none!important}
html.o11 #p7date>span:nth-child(2){display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
html.o11 #p7date h2{font-size:15px!important;font-weight:600!important}
html.o11 #p7date .d{font-size:12.5px!important}
/* 12 three lines per section */
html.o12 .p7c .bd>.p7r:nth-of-type(n+4){display:none!important}
/* 13 quiet sections start closed (only problems open) */
html.o13 .p7c:not([data-k=att]):not([data-k=tasks]):not([data-k=myjob]):not([data-k=myjobT]):not(.p9bad) .bd{display:none!important}
/* 14 no arrows */
html.o14 .p7c .p7h .ch,html.o14 .p7r .chev,html.o14 .p7c[data-k=att] .p7r>span:last-child,html.o14 #p7date .go{display:none!important}
/* 15 "not in yet" as a normal row */
html.o15 .p7warn{background:none!important;border-radius:0!important;padding:6px 0!important;margin:0!important;color:#c0392b!important;border-top:1px solid var(--g1)}
/* 16 more breathing room */
html.o16 .p7c{margin-bottom:18px!important}
html.o16 .p7r{padding:8px 0!important}
/* 17 glass buttons in one row under the logo */
html.o17 #p8pin{position:static!important;flex-direction:row!important;justify-content:space-between;margin:0 0 14px;width:100%}
html.o17 #p8pin .g{width:auto;flex:1}
body:has(#pg-home.on) html.o17 #homeBody .p7c,html.o17 #homeBody .p7c,html.o17 #homeBody .p7nums,html.o17 #homeBody #p7date{margin-right:0!important}
/* Baruch 22:49: no lines between rows or sections — just space */
html.o9 #homeBody .p7r,html.o9 #homeBody .p7more,html.o9 #homeBody .p7warn{border-top:none!important}
html.o9 #homeBody .p7c{border-top:none!important;margin-bottom:14px!important}
html.o9 #homeBody .p7c .p7h{padding-bottom:2px!important}
/* Baruch 22:51: Needs action compact again — small chips side by side, tap one to go there */
#homeBody .p7c[data-k=att] .bd{display:flex!important;flex-wrap:wrap;gap:6px;padding-bottom:4px!important}
#homeBody .p7c[data-k=att].fold .bd{display:none!important}
#homeBody .p7c[data-k=att] .p7r{display:inline-flex!important;flex:none;padding:5px 10px!important;gap:6px;border:none!important;border-radius:999px;background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.12);font-size:12.5px;max-width:100%}
html[data-theme=dark] #homeBody .p7c[data-k=att] .p7r{background:#232326}
#homeBody .p7c[data-k=att] .p7r .w{flex:none;white-space:nowrap}
#homeBody .p7c[data-k=att] .p7r>span:first-child{width:6px!important;height:6px!important}
#homeBody .p7c[data-k=att] .p7r>span:last-child{display:none}
#homeBody .p7c[data-k=att] .p7r.p9red{box-shadow:none;background:#d93a2b14;color:#c0392b;font-weight:600}
/* Baruch 23:05: counts sit right next to their title / line, not out on the right edge (under the glass buttons) */
#homeBody .p7c .p7h b{flex:0 1 auto!important}
#homeBody .p7c .p7h .n{margin-right:auto}
#homeBody .p7c:not([data-k=att]) .p7r.one .w{flex:0 1 auto!important}
#homeBody .p7c:not([data-k=att]) .p7r.one .pill{margin-right:auto;margin-left:2px}
/* Baruch 23:13: the ☰ ball is the same size as the other 4, with its name under it */
html.o18 body #p7fm{width:50px!important;height:50px!important;right:calc(max(14px,env(safe-area-inset-right,0px)) + 6px)!important;bottom:calc(30px + env(safe-area-inset-bottom,0px))!important;overflow:visible}
html.o18 #p7fm svg{width:21px!important;height:21px!important}
html.o18 #p7fm::after{content:attr(data-lab);position:absolute;top:53px;left:50%;transform:translateX(-50%);font-size:10.5px;font-weight:600;color:var(--g5);white-space:nowrap}
html[data-theme=dark].o18 #p7fm::after{color:#fff}
html.o18 #p7fm.p8x::after{display:none}
html.o18 #p8pin{bottom:calc(98px + env(safe-area-inset-bottom,0px))!important}
/* Baruch 23:09: no count next to "Crews today / tomorrow" — the "No job" lines already say it */
#homeBody .p7c[data-k=crews] .p7h .n,#homeBody .p7c[data-k=crewsT] .p7h .n{display:none!important}
/* 18 one action spot: the + goes into the ☰ */
html.o18 #p2fab{display:none!important}
html.o18 #p7fm{right:max(16px,env(safe-area-inset-right,0px))!important}
`;
const st=document.createElement('style');st.id='p9css';st.textContent=css;document.body.appendChild(st);
function apply(){const h=document.documentElement;for(let i=1;i<=18;i++)h.classList.toggle('o'+i,window.P9_ON.includes(i)||h.classList.contains('o'+i)&&window.__p9keep);
  try{// 13: a section with a problem stays open
    document.querySelectorAll('#homeBody .p7c').forEach(c=>c.classList.toggle('p9bad',!!c.querySelector('.pill.bad,.p7warn,.n.r')));}catch(e){}
  try{document.querySelectorAll('#homeBody .p7c[data-k=att] .p7r').forEach(r=>{const d=r.querySelector('span');r.classList.toggle('p9red',!!d&&/d93a2b/.test(d.getAttribute('style')||''));});}catch(e){}
  try{// 17: the pinned buttons move under the greeting
    const p=$('p8pin'),hb=$('homeBody');if(p&&hb){if(h.classList.contains('o17')){const d=$('p7date');const at=d&&d.nextSibling;if(p.parentNode!==hb)hb.insertBefore(p,at||hb.firstChild);}else if(p.parentNode!==document.body)document.body.appendChild(p);}}catch(e){}}
function fmLab(){const b=$('p7fm');if(b)b.setAttribute('data-lab',typeof t==='function'?t('More'):'More');}
try{fmLab();}catch(e){}
if(typeof window.applyTabs==='function'){const _a9=window.applyTabs;window.applyTabs=function(){
  // Baruch 10/28 00:10: with no bottom bar every bar button is hidden, so the old "your page's button is hidden → go Home"
  // check sent people back to Home each time new data arrived. Now only a page the person is NOT allowed to see sends them back.
  const on=[...document.querySelectorAll('.tab.on')];on.forEach(b=>b.classList.remove('on'));
  let r;try{r=_a9.apply(this,arguments);}finally{on.forEach(b=>b.classList.add('on'));}
  try{fmLab();}catch(e){}
  try{const m=me();const who=m&&m.id;if(who&&window.__p9who&&window.__p9who!==who&&typeof goTab==='function')goTab((typeof primaryFor==='function'&&primaryFor(m)[0])||'home');window.__p9who=who;}catch(e){}   // a different person signed in → their start page
  return r;};}
window.P9={apply,set(L){window.P9_ON=L.slice();window.__p9keep=false;apply();}};
if(typeof window.renderHome==='function'){const _rh=window.renderHome;window.renderHome=function(){const r=_rh.apply(this,arguments);try{apply();}catch(e){}return r;};}

/* ───────── Baruch 10/28 23:36: the field guys' app — their days, their job page ───────── */
(function(){
const W=()=>{try{const m=me();return m&&m.role==='worker'?m:null;}catch(e){return null;}};
const tt=x=>{try{return typeof t==='function'?t(x):x;}catch(e){return x;}};
const H=d=>(window.EX_workHours?EX_workHours(d):'8:00 AM – 7:00 PM');
const PH=(s,c)=>tt(window.EX_jobPhase?EX_jobPhase(s,c):'Rough');
const fcss=`
html.p9w #homeBody .p7c{margin-right:66px!important}   /* field Home: room for the 4 glass buttons */
.p9job{background:#fff;border-radius:16px;padding:14px 15px;box-shadow:0 0 0 .5px rgba(0,0,0,.07);cursor:pointer;margin:2px 0 4px}
html[data-theme=dark] .p9job{background:#1c1c1e}
.p9job .a{font-size:22px;font-weight:800;letter-spacing:-.3px;line-height:1.15}
.p9job .m{font-size:13.5px;color:var(--g4);margin-top:4px;font-weight:600}
.p9job .g{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.p9job .g span{background:var(--g1);border-radius:999px;padding:3px 10px;font-size:12.5px}
html[data-theme=dark] .p9job .g span{background:#2c2c2e}
.p9job .b{display:flex;gap:8px;margin-top:11px}.p9job .b a,.p9job .b button{flex:1;text-align:center;border:none;border-radius:11px;padding:10px;font:600 14px/1.1 inherit;font-family:inherit;text-decoration:none;cursor:pointer}
.p9job .b a{background:var(--g5);color:#fff}html[data-theme=dark] .p9job .b a{background:#fff;color:#000}.p9job .b button{background:var(--g1);color:var(--g5)}
.p9day{background:#fff;border-radius:16px;padding:13px 15px;margin-bottom:10px;box-shadow:0 0 0 .5px rgba(0,0,0,.06)}
html[data-theme=dark] .p9day{background:#1c1c1e}
.p9day .k{font-size:11.5px;font-weight:700;letter-spacing:.5px;color:var(--g4);text-transform:uppercase}
.p9day .j{font-size:18px;font-weight:700;margin-top:4px;cursor:pointer}.p9day .m{font-size:13px;color:var(--g4);margin-top:2px}
.p9day .sub{font-size:11px;font-weight:700;letter-spacing:.4px;color:var(--g4);text-transform:uppercase;margin:11px 0 3px}
.p9day .r{display:flex;gap:8px;align-items:baseline;padding:5px 0;font-size:14px;cursor:pointer}.p9day .r .t{font-weight:700;color:#e8912d;flex:none}
.p9day .none{color:var(--g3);font-size:14px;margin-top:4px}
#m-folder.fdfield #fdFilesHdr,#m-folder.fdfield #fdFiles,#m-folder.fdfield #fdUpload,#m-folder.fdfield #fdInsp,#m-folder.fdfield #fdLinks,#m-folder.fdfield #fdLinkAdd,#m-folder.fdfield #fdSettings,#m-folder.fdfield #fdAssign{display:none!important}
#m-folder.fdfield .sec[data-i18n=Links],#m-folder.fdfield .sec[data-i18n="Site settings"],#m-folder.fdfield button[onclick*="openMatHist"]{display:none!important}
.p9fh .ph{display:inline-block;background:#2563eb1a;color:#2563eb;font-weight:700;font-size:12px;border-radius:999px;padding:3px 10px;margin-top:6px}
.p9fh .hr{font-size:13.5px;color:var(--g4);font-weight:600;margin-top:6px}
.p9fh .dir{display:block;text-align:center;background:var(--g5);color:#fff;border-radius:12px;padding:11px;font-weight:700;text-decoration:none;margin:10px 0 4px;font-size:15px}
html[data-theme=dark] .p9fh .dir{background:#fff;color:#000}
.p9fh .mg{display:flex;align-items:center;gap:8px;font-size:14px;padding:6px 0}.p9fh .mg a{margin-left:auto;color:var(--blue-mid);font-weight:600;text-decoration:none}
.p9ph{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0}.p9ph img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;background:var(--g1);cursor:pointer}
#m-folder.fdfield #p2tabs,#m-folder.fdfield .p8sum,#m-folder.fdfield #p2gal{display:none!important}
#m-folder.fdfield.p2t-over [data-p2t~="notes"],#m-folder.fdfield.p2t-over [data-p2t~="over"]{display:block!important}
#m-folder .p9add{background:var(--g1)!important;box-shadow:none!important}
#m-folder.fdfield.p2t-over [hidden][data-p2t],#m-folder.fdfield [hidden]{display:none!important}
.p9add{display:block;width:100%;border:none;background:var(--g1);border-radius:12px;padding:11px;font:600 14px/1 inherit;font-family:inherit;color:var(--g5);cursor:pointer;margin:4px 0 6px}
`;
const st=document.createElement('style');st.id='p9field';st.textContent=fcss;document.body.appendChild(st);
const day0=off=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+off);return d;};
// their "calendar": today + tomorrow — job, hours, meetings, tasks (no inspections, no week view)
function myDays(m){const el=document.getElementById('todayBoard');if(!el)return;const fmt=at=>new Date(at).toLocaleTimeString(LOC(),{hour:'numeric',minute:'2-digit'});
  el.innerHTML=[0,1].map(off=>{const d=day0(off);const k=dkey(d);const sl=m.crew?schedDay(m.crew+'|'+k):null;const s=sl&&(D.sites||[]).find(x=>x.id===sl.site);const c=(D.crews||[]).find(x=>x.id===m.crew);
    let meets=[];try{meets=(D.meets||[]).filter(x=>inMeet(x,m.id)&&new Date(x.at).toDateString()===d.toDateString()).sort((a,b)=>a.at-b.at);}catch(e){}
    let tasks=[];try{const end=d.getTime()+86400000;tasks=visibleJobs().filter(j=>j.status!=='done').filter(j=>{const due=gpDue(j);return due!==null&&(off===0?due<end:(due>=d.getTime()&&due<end));});}catch(e){}
    return '<div class="p9day"><div class="k">'+esc(off?tt('Tomorrow'):tt('Today'))+' · '+esc(d.toLocaleDateString(LOC(),{weekday:'long',month:'short',day:'numeric'}))+'</div>'
      +(s?'<div class="j" onclick="openFolder(\''+jsq(s.id)+'\')">📍 '+esc(s.name.split(',')[0])+' ›</div><div class="m">'+esc(PH(s,c))+' · '+esc(H(d))+'</div>':'<div class="none">'+esc(tt(d.getDay()===6?'No work':'No job scheduled'))+'</div>')
      +(meets.length?'<div class="sub">'+esc(tt('Meetings'))+'</div>'+meets.map(x=>'<div class="r"><span class="t">'+esc(fmt(x.at))+'</span><span>'+esc(x.title||tt('Meeting'))+(x.site?' · '+esc(siteName(x.site).split(',')[0]):'')+'</span></div>').join(''):'')
      +(tasks.length?'<div class="sub">'+esc(tt('Tasks'))+'</div>'+tasks.map(j=>'<div class="r" onclick="openJobDetail(\''+jsq(j.id)+'\')"><span>☐ '+esc(String((typeof jobText==='function'?jobText(j):j.desc)||'').slice(0,90))+'</span></div>').join(''):'')
      +'</div>';}).join('');}
if(typeof window.renderHome==='function'){const _rh9=window.renderHome;window.renderHome=function(){try{document.documentElement.classList.toggle('p9w',!!W());}catch(e){}return _rh9.apply(this,arguments);};try{renderHome=window.renderHome;}catch(x){}}
if(typeof window.renderTodayBoard==='function'){const _tb=window.renderTodayBoard;window.renderTodayBoard=function(){const m=W();if(m){try{renderGoHomeIn('goHomeBox2');}catch(e){}myDays(m);return;}return _tb.apply(this,arguments);};try{renderTodayBoard=window.renderTodayBoard;}catch(x){}}
if(typeof window.renderSched==='function'){const _rs=window.renderSched;window.renderSched=function(){const m=W();if(m&&typeof schedView!=='undefined'&&schedView!=='today'){try{schedView='today';}catch(e){}}
  const r=_rs.apply(this,arguments);try{const sw=document.getElementById('schedSwitch');if(sw)sw.style.display=m?'none':'';const h=document.querySelector('#pg-sched .p8h2');if(h)h.textContent=tt(m?'My days':'Schedule');}catch(e){}return r;};try{renderSched=window.renderSched;}catch(x){}}
// their crew's scheduled jobs (this week ± a few days) open for them
const onMySched=(s,m)=>{if(!m||!m.crew||!s)return false;for(let o=-7;o<=7;o++){const sl=schedDay(m.crew+'|'+dkey(day0(o)));if(sl&&sl.site===s.id)return true;}return false;};
if(typeof window.siteVisible==='function'){const _sv=window.siteVisible;window.siteVisible=function(s,m){if(_sv.apply(this,arguments))return true;try{m=m||me();return m&&m.role==='worker'&&onMySched(s,m);}catch(e){return false;}};try{siteVisible=window.siteVisible;}catch(x){}}
// their job page: name, Rough/Finishing, hours, directions, site manager, their tasks, photos (see all + add), notes
if(typeof window.openFolder==='function'){const _of=window.openFolder;window.openFolder=function(id){const r=_of.apply(this,arguments);const f=document.getElementById('m-folder');const m=W();
  try{if(f)f.classList.toggle('fdfield',!!m);if(m&&window.P2&&typeof P2.setTab==='function')P2.setTab('over');if(!m||!f||f.classList.contains('hid'))return r;const s=(D.sites||[]).find(x=>x.id===id);if(!s)return r;const c=(D.crews||[]).find(x=>x.id===m.crew);
    const mg=(typeof mgrIds==='function'?mgrIds(s):[]).map(i=>(D.emps||[]).find(e=>e.id===i)).filter(Boolean);
    document.getElementById('fdTitle').innerHTML='<div class="p9fh"><div style="font-size:11px;color:var(--g4);text-transform:uppercase;letter-spacing:.5px">'+esc(tt('Job'))+'</div>'
      +'<div style="font-size:23px;font-weight:800;letter-spacing:-.4px;line-height:1.15">'+esc(s.name)+'</div><span class="ph">'+esc(PH(s,c))+'</span><div class="hr">🕖 '+esc(H())+'</div>'
      +'<a class="dir" href="'+esc(safeHref(gmapsDir(s)))+'" target="_blank" rel="noopener">🧭 '+esc(tt('Directions'))+'</a>'
      +(mg.length?'<div style="font-size:11px;color:var(--g4);text-transform:uppercase;letter-spacing:.5px;margin-top:8px">'+esc(tt('Site manager'))+'</div>'+mg.map(e=>'<div class="mg"><b>'+esc(e.name)+'</b>'+(e.phone?'<a href="tel:'+esc(String(e.phone).replace(/[^\d+]/g,''))+'">📞 '+esc(tt('Call'))+'</a>':'')+'</div>').join(''):'')+'</div>';
    const imgs=(s.files||[]).filter(x=>x&&x.kind==='img'&&(x.d||x.url)).slice().sort((a,b)=>(b.ts||0)-(a.ts||0));
    const ov=document.getElementById('fdOverview');
    ov.innerHTML=(typeof fdTasks==='function'?fdTasks(s):'')+'<div class="sec">📷 '+esc(tt('Photos'))+' <span style="color:var(--g4);font-weight:500">'+(imgs.length||'')+'</span></div>'
      +(imgs.length?'<div class="p9ph">'+imgs.map(x=>'<img loading="lazy" src="'+esc(safeSrc(x.d||x.url))+'" onclick="P9F.view(\''+jsq(x.id)+'\')">').join('')+'</div>':'<div style="font-size:13px;color:var(--g3);padding:2px 0 6px">'+esc(tt('No photos yet.'))+'</div>')
      +'<button class="p9add" onclick="document.getElementById(\'fdCam\').value=\'\';document.getElementById(\'fdCam\').click()">📷 '+esc(tt('Add photo'))+'</button>';
  }catch(e){console.error('p9 field folder',e);}return r;};try{openFolder=window.openFolder;}catch(x){}}
// Baruch 10/29 00:22: the schedule's red button is "Stay late" (by crew) — they get "stay later today" right away and no end-of-day
// reminder; once a crew is staying late, the button sends them home ("pack up — go home in 15 minutes").
const today_=()=>new Date().toDateString();
function lateNow(){const last={};(D.goHomeLog||[]).filter(x=>x&&new Date(x.ts).toDateString()===today_()).sort((a,b)=>a.ts-b.ts).forEach(x=>{last[x.who]=x;});return Object.keys(last).filter(id=>last[id].kind==='late');}
function workingToday(){const k=dkey(new Date());const crews=(D.crews||[]).filter(c=>schedDay(c.id+'|'+k)).map(c=>c.id);return (D.emps||[]).filter(e=>e.role==='worker'&&!e.inactive&&crews.includes(e.crew));}
window.P9L={
  late(){const m=me();const late=lateNow();const sel=(typeof ghSel!=='undefined'&&ghSel.length)?ghSel:null;const ids=workingToday().filter(e=>(!sel||sel.includes(e.crew))&&!late.includes(e.id)).map(e=>e.id);
    if(!ids.length){toast(tt('Nobody to keep late'));return;}
    askConfirm(tt('Keep these guys late today?')+'\n'+ids.map(id=>nameOf(id)).join(', '),()=>{const ts=Date.now();ids.forEach(who=>D.goHomeLog.push({id:nid('g'),who,by:m.id,ts,kind:'late'}));save();
      try{pushTo(ids,()=>('🕖 '+t('Stay later today — don\'t leave at the usual time. You\'ll get a message when to go home.')),'info',{tab:'home'});}catch(e){}
      toast('🕖 '+ids.length+' '+tt('staying late'),'green');try{renderSched();}catch(e){}},tt('Keep late'));},
  home(crew){const late=lateNow();const ids=(D.emps||[]).filter(e=>late.includes(e.id)&&(!crew||e.crew===crew)).map(e=>e.id);if(!ids.length)return;
    askConfirm(tt('Send them home now?')+'\n'+ids.map(id=>nameOf(id)).join(', '),()=>{ids.forEach(id=>{try{goHome(id,true);}catch(e){}const L=D.goHomeLog;const x=L[L.length-1];if(x&&x.who===id)x.kind='home';});save();toast('🏠 '+tt('Go-home sent to')+' '+ids.length,'green');try{renderSched();}catch(e){}},tt('Send home'));}};
if(typeof window.renderGoHomeIn==='function'){window.renderGoHomeIn=function(boxId){const m=me();const box=document.getElementById(boxId);if(!box)return;
  if(boxId==='goHomeBox2'&&typeof schedView!=='undefined'&&schedView!=='today'){box.innerHTML='';return;}
  const can=m&&(m.role==='manager'||m.role==='owner'||m.all);if(!can){box.innerHTML='';return;}
  const late=lateNow();const work=workingToday();const k=dkey(new Date());const crews=(D.crews||[]).filter(c=>schedDay(c.id+'|'+k));const sel=(typeof ghSel!=='undefined')?ghSel:[];
  const chips='<div class="chips" style="margin-bottom:8px"><div class="chip '+(!sel.length?'on':'')+'" onclick="ghToggle(\'all\')">'+esc(tt('Everyone'))+'</div>'+crews.map(c=>'<div class="chip '+(sel.includes(c.id)?'on':'')+'" onclick="ghToggle(\''+jsq(c.id)+'\')">'+(sel.includes(c.id)?'✓ ':'')+esc(c.name)+'</div>').join('')+'</div>';
  const n=work.filter(e=>(!sel.length||sel.includes(e.crew))&&!late.includes(e.id)).length;
  const byCrew={};late.forEach(id=>{const e=(D.emps||[]).find(x=>x.id===id);const c=e&&e.crew||'none';(byCrew[c]=byCrew[c]||[]).push(id);});
  box.innerHTML='<div class="sec">🕖 '+esc(tt('Stay late'))+'</div>'+chips
    +'<button class="btn" style="background:#d93a2b" '+(n?'':'disabled')+' onclick="P9L.late()">🕖 '+esc(tt('Keep late'))+' · '+n+'</button>'
    +'<div style="font-size:11.5px;color:var(--g4);margin:5px 0 8px">'+esc(tt('They get a message right away to stay later, and no "time to leave" reminder today.'))+'</div>'
    +(late.length?'<div class="card" style="padding:10px 13px"><div style="font-size:11px;color:var(--g4);text-transform:uppercase;margin-bottom:6px">'+esc(tt('Staying late now'))+'</div>'
      +Object.keys(byCrew).map(c=>'<div class="ln" style="display:flex;align-items:center;gap:8px;padding:5px 0"><span style="flex:1"><b>'+esc(c==='none'?tt('No crew'):nameOf(c))+'</b> <span style="color:var(--g4);font-size:12px">'+byCrew[c].map(id=>esc(nameOf(id).split(' ')[0])).join(', ')+'</span></span><button class="bs" style="background:#2fb36b;color:#fff;border:none" onclick="P9L.home(\''+jsq(c)+'\')">🏠 '+esc(tt('Send them home'))+'</button></div>').join('')+'</div>':'');};
  try{renderGoHomeIn=window.renderGoHomeIn;}catch(x){}}
// the red button on the schedule: "Stay late" — or "Send them home" while someone is staying late
if(typeof window.renderSched==='function'){const _rs2=window.renderSched;window.renderSched=function(){const r=_rs2.apply(this,arguments);try{document.querySelectorAll('.sc-home').forEach(b=>{b.textContent=lateNow().length?'🏠 '+tt('Send them home'):'🕖 '+tt('Stay late');});}catch(e){}return r;};try{renderSched=window.renderSched;}catch(x){}}
try{if(typeof ES==='object')Object.assign(ES,{"Stay late":"Quedarse más tarde","Keep late":"Quedarse más tarde","Keep these guys late today?":"¿Quedan estos trabajadores más tarde hoy?","staying late":"se quedan más tarde","Nobody to keep late":"No hay nadie para dejar más tarde","Send them home":"Mandarlos a casa","Send them home now?":"¿Mandarlos a casa ahora?","Send home":"Mandar a casa","Staying late now":"Se quedan más tarde ahora","They get a message right away to stay later, and no \"time to leave\" reminder today.":"Reciben un mensaje ahora para quedarse más tarde, y hoy no reciben el aviso de salida.","Stay later today — don't leave at the usual time. You'll get a message when to go home.":"Hoy se quedan más tarde — no salgan a la hora de siempre. Recibirán un mensaje cuando puedan irse a casa."});}catch(e){}
window.P9F={view(fid){try{const s=(D.sites||[]).find(x=>x.id===fdSite);const f=s&&(s.files||[]).find(x=>x.id===fid);if(!f)return;const u=safeSrc(f.d||f.url);if(!u)return;
  let v=document.getElementById('p9view');if(!v){v=document.createElement('div');v.id='p9view';v.style.cssText='position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center';v.onclick=()=>v.remove();document.body.appendChild(v);}
  v.innerHTML='<img src="'+esc(u)+'" style="max-width:100%;max-height:100%;object-fit:contain">';}catch(e){}}};
try{if(typeof ES==='object')Object.assign(ES,{"My days":"Mis días","Directions":"Cómo llegar","Open job":"Abrir trabajo","Rough":"Rough","Finishing":"Terminación","Site manager":"Encargado","Call":"Llamar","Photos":"Fotos","No photos yet.":"Todavía no hay fotos.","Add photo":"Agregar foto","Meetings":"Reuniones","No work":"No se trabaja","No work today.":"Hoy no se trabaja.","No job scheduled yet — ask your crew leader.":"Todavía no hay trabajo asignado — pregunta a tu jefe de cuadrilla.","8:00 AM":"8:00 a.m.","7:00 PM":"7:00 p.m.","1:15 PM":"1:15 p.m.","Job":"Trabajo"});}catch(e){}
})();
apply();
// first screen is drawn with everything loaded → show the app (index.html hides it until now)
try{const h=$('pg-home');if(h&&h.classList.contains('on'))renderHome();}catch(e){}
requestAnimationFrame(()=>requestAnimationFrame(()=>document.documentElement.classList.remove('exboot')));
})();
