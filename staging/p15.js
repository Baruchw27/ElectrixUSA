/* Electrix USA — P15: reliability (Baruch 2026-11-05 23:35–23:44: "it's really slow … stuff should get saved … everybody gets
   notifications late … it takes a long time to open PDFs … it crashes a lot" + "you click something and it doesn't open to
   where it should be … on the home screen 18 jobs without GPS opens Jobs, not the jobs … a notification doesn't open the task").
   1. Saving never sits waiting: changes are sent again every 15 s while any are waiting, and right away when the app comes back
      on screen, the computer wakes up or the internet returns. A small "Not saved yet — tap to send" shows if it takes long.
      (Shia's computer had 7 changes waiting 5 hours on 11/5 — the people they were for got their notifications 5 hours late.)
   2. Home's "Needs action" lines open a list of exactly those jobs/tasks/people, each one tappable to the right screen.
   3. The bell and phone notifications open the exact task / job / inspection / O&R — also when the app was closed,
      and a task that isn't on this phone yet is fetched first.
   4. Notifications: a clear "Turn on notifications" card for anyone whose phone doesn't get them (with iPhone steps),
      and the owner sees who still doesn't get them.
   Off: window.EX_P15_OFF. */
(function(){
if(window.EX_P15_OFF)return;
const $=id=>document.getElementById(id);
const tt=x=>{try{return typeof t==='function'?t(x):x;}catch(e){return x;}};
const M=()=>{try{return me();}catch(e){return null;}};
const E=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const J=s=>String(s==null?'':s).replace(/[^\p{L}\p{N}_.:|@ +-]/gu,'');
const short=s=>String(s||'').split(',')[0];
const P15=window.P15={};

/* ───────── 1. saving never sits waiting ───────── */
const colls=()=>{try{return Object.keys(D).filter(k=>D[k]&&typeof D[k]==='object').concat('_');}catch(e){return [];}};
function pending(){let n=0;if(typeof window.EX_queuedIn!=='function')return 0;try{colls().forEach(c=>{n+=EX_queuedIn(c).length;});}catch(e){}return n;}
P15.pending=pending;
let busy=false,since=0,lastTry=0;
async function kick(){if(!window.EX_REAL||typeof window.EX_saveNow!=='function')return;const n=pending();
  if(!n){since=0;pill();return;}if(!since)since=Date.now();
  if(busy||navigator.onLine===false){pill();return;}
  busy=true;lastTry=Date.now();try{await EX_saveNow({waitMs:20000});}catch(e){}busy=false;if(!pending())since=0;pill();}
P15.kick=kick;
function catchUp(){try{if(window.EX_REAL&&typeof window.EX_catchUp==='function')EX_catchUp();}catch(e){}}
setInterval(kick,15000);
// backup (Baruch 11/6): if the server library's sign-in queue is jammed for 2 minutes, restart the app quietly.
// Unsent changes are kept on the device and go out right after the restart.
let jam=0;setInterval(()=>{try{const a=window.EX_sb&&window.EX_sb.auth;if(!a){jam=0;return;}
  const stuck=a.lockAcquired&&(a.pendingInLock||[]).length>0;jam=stuck?jam+1:0;
  if(jam>=4){const f=document.activeElement;const typing=f&&/INPUT|TEXTAREA|SELECT/.test(f.tagName)&&f.value;
    if(!typing||document.hidden){try{window.EX_logErr&&EX_logErr('auth-stuck','server queue jammed — restarted');}catch(e){}location.reload();}}}catch(e){}},30000);
// other people's changes: a quiet look every 2 minutes while the app is on screen (the live line can drop on a sleeping computer)
setInterval(()=>{if(document.visibilityState==='visible')catchUp();},120000);
['online','focus','pageshow'].forEach(ev=>window.addEventListener(ev,()=>{kick();catchUp();}));
document.addEventListener('visibilitychange',()=>{kick();if(document.visibilityState==='visible')catchUp();});
function pill(){let el=$('p15save');const n=pending();if(n&&!since)since=Date.now();if(!n)since=0;const show=n&&since&&Date.now()-since>20000;
  if(!show){if(el)el.remove();return;}
  if(!el){el=document.createElement('button');el.id='p15save';el.type='button';el.onclick=()=>{el.textContent='↑ '+tt('Saving…');kick();};document.body.appendChild(el);}
  el.textContent=(navigator.onLine===false?'📵 ':'')+tt(navigator.onLine===false?'No signal — saved on this phone, sends when back':'Not saved yet — tap to send')+' ('+n+')';}
setInterval(pill,5000);

/* ───────── shared list sheet ───────── */
function sheet(){let o=$('m-p15l');if(o)return o;o=document.createElement('div');o.className='ov hid';o.id='m-p15l';o.innerHTML='<div class="md"><div class="hd"></div><h2 id="p15lt"></h2><div id="p15ls" class="p15ls"></div><div id="p15lb"></div></div>';document.body.appendChild(o);return o;}
P15._acts=[];
function list(title,sub,rows){sheet();$('p15lt').textContent=title;$('p15ls').textContent=sub||'';P15._acts=rows.map(r=>r.go);
  $('p15lb').innerHTML=rows.length?'<div class="p15lc">'+rows.map((r,i)=>(r.go?'<button type="button" class="p15lr" onclick="P15.pick('+i+')">':'<div class="p15lr" style="cursor:default">')+'<span class="w"><b>'+E(r.t||'—')+'</b>'+(r.s?'<small>'+E(r.s)+'</small>':'')+'</span>'+(r.go?'<span class="ch">›</span></button>':'</div>')).join('')+'</div>'
    :'<div class="p15le">'+E(tt('Nothing here right now.'))+'</div>';
  show('m-p15l');}
P15.list=list;
P15.pick=i=>{const f=P15._acts[i];try{hide('m-p15l');}catch(e){}if(typeof f==='function')setTimeout(()=>{try{f();}catch(e){console.error('p15 pick',e);}},60);};

/* ───────── 2. Home "Needs action": each line opens exactly those ───────── */
const FLD=s=>['active','roughdone','ready','inspection','upcoming'].includes(s.stage||'active');
const live=()=>(D.sites||[]).filter(s=>s&&!s.deleted&&s.name);
const nameOfSafe=id=>{try{return nameOf(id);}catch(e){return id;}};
const openSite=id=>{try{openFolder(id);}catch(e){}};
const openGps=id=>{try{if(typeof openFence==='function'&&(typeof canFenceEdit!=='function'||canFenceEdit(M())))openFence(id);else openFolder(id);}catch(e){openSite(id);}};
const LISTS={
  nogps:()=>{const L=live().filter(s=>FLD(s)&&!s.lat).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    list(tt('Jobs without a GPS point'),tt('Tap a job to set its GPS fence'),L.map(s=>({t:short(s.name),s:s.name.split(',').slice(1).join(',').trim(),go:()=>openGps(s.id)})));},
  geochk:()=>{const L=live().filter(s=>FLD(s)&&s.lat&&s.geoCheck&&!s.fenceOk);
    list(tt('Job locations to double-check'),tt('Tap a job to check its GPS fence'),L.map(s=>({t:short(s.name),s:tt('Check the pin is on the house'),go:()=>openGps(s.id)})));},
  nomgr:()=>{const L=live().filter(s=>(s.stage||'active')==='active'&&!(typeof mgrIds==='function'?mgrIds(s):[]).length);
    list(tt('Roughing jobs need a site manager'),tt('Tap a job to pick its site manager'),L.map(s=>({t:short(s.name),go:()=>openSite(s.id)})));},
  insp:()=>{const L=(D.insp||[]).filter(i=>i&&!i.deleted&&i.status==='requested');
    list(tt('Inspections to book'),'',L.map(i=>{const s=(D.sites||[]).find(x=>x.id===i.site);return {t:short(s?s.name:i.site),s:tt(i.kind==='final'?'Final inspection':i.kind==='rough'?'Rough inspection':'Inspection')+(i.by?' · '+tt('requested by')+' '+nameOfSafe(i.by):''),go:()=>{try{openInspBook(i.id);}catch(e){openSite(i.site);}}};}));},
  overdue:()=>{const L=(D.jobs||[]).filter(j=>j&&!j.deleted&&(typeof isLate==='function'?isLate(j):j.status==='ov'));
    list(tt('Overdue tasks'),'',L.map(j=>({t:String(j.desc||'').slice(0,80),s:[(j.site?short((D.sites||[]).find(x=>x.id===j.site)?.name||''):''),tos(j).map(nameOfSafe).join(', ')].filter(Boolean).join(' · '),go:()=>{try{openJobDetail(j.id);}catch(e){}}})));},
  away:()=>{const L=(D.punches||[]).filter(p=>p&&p.away&&!p.out);
    list(tt('Off site'),tt('Punched in but away from the job'),L.map(p=>{const s=(D.sites||[]).find(x=>x.id===p.site);return {t:nameOfSafe(p.who),s:s?short(s.name):'',go:()=>{if(s)openSite(s.id);else try{goTab('hours');}catch(e){}}};}));}
};
P15.open=k=>{try{(LISTS[k]||(()=>{}))();}catch(e){console.error('p15 list',e);}};
// which line is which: by the words the app shows (English and Spanish), whatever the old target was
const KEYS=[['nogps','field jobs without GPS point'],['geochk','job locations to double-check'],['nomgr','Roughing jobs need a site manager'],['insp','inspection to book'],['overdue','overdue'],['away','off site']];
function keyOf(txt){txt=String(txt||'').toLowerCase();for(const [k,w] of KEYS){const a=String(w).toLowerCase(),b=String(tt(w)).toLowerCase();if(txt.includes(a)||(b&&txt.includes(b)))return k;}return null;}
function fixHome(){const hb=$('homeBody');if(!hb)return;
  hb.querySelectorAll('.p7c[data-k=att] .p7r, .att span').forEach(r=>{if(r.dataset.p15)return;const k=keyOf(r.textContent);if(!k)return;r.dataset.p15=k;r.setAttribute('onclick',"P15.open('"+k+"')");});}
if(typeof window.renderHome==='function'){const _rh=window.renderHome;window.renderHome=function(){const r=_rh.apply(this,arguments);try{fixHome();}catch(e){}try{notifCard();}catch(e){}return r;};try{renderHome=window.renderHome;}catch(x){}}

/* ───────── 3. bell + phone notifications open the exact thing ───────── */
const allowed=n=>{const b=document.querySelector('.tab[onclick*="\''+J(n)+'\'"]');return !!b&&b.dataset.allowed==='1';};
const hideAll=()=>{['m-inbox','m-p15l'].forEach(id=>{try{const o=$(id);if(o&&!o.classList.contains('hid'))hide(id);}catch(e){}});};
async function fetchJob(id){if(!window.EX_REAL)return null;try{await EX_catchUp();}catch(e){}return (D.jobs||[]).find(q=>q.id===id)||null;}
// the place a message points to — its link, else the job named in the message
function siteFromText(s){s=String(s||'').toLowerCase();if(!s)return null;let best=null,bl=0;live().forEach(x=>{const n=short(x.name).toLowerCase().trim();if(n.length>=6&&s.includes(n)&&n.length>bl){best=x;bl=n.length;}});return best;}
async function goLink(l,msg){if(!l||typeof l!=='object')l={};
  if(l.bell){try{openInbox();}catch(e){}return true;}   // 11/12: the stacked phone card "Electrix · 5 new" opens the bell list
  if(l.job){let j=(D.jobs||[]).find(q=>q.id===l.job);if(!j)j=await fetchJob(l.job);
    if(j){if(allowed('jobs')){try{jobFilter='all';jobView=j.status==='done'?'done':'open';}catch(e){}goTab('jobs');}openJobDetail(j.id);return true;}
    toast(tt('That task was removed'));return true;}
  if(l.orr){if(window.P6&&typeof P6.open==='function'&&(D.orr||[]).some(x=>x.id===l.orr)){if(allowed('orr'))goTab('orr');P6.open(l.orr);return true;}if(allowed('orr')){goTab('orr');return true;}}
  if(l.insp){const i=(D.insp||[]).find(q=>q.id===l.insp);if(i){if(allowed('sites'))goTab('sites');openFolder(i.site);return true;}}
  if(l.site&&(D.sites||[]).some(x=>x.id===l.site)){if(allowed('sites'))goTab('sites');openFolder(l.site);return true;}
  if(l.keep&&(D.keep||[]).some(n=>n.id===l.keep)){try{openList('keep',l.keep);return true;}catch(e){}}
  if(l.mat&&(D.mats||[]).some(x=>x.id===l.mat)){if(allowed('mat'))goTab('mat');try{openList('mats',l.mat);}catch(e){}return true;}
  if(l.svc){if(allowed('svc'))goTab('svc');try{openSvcDetail(l.svc);}catch(e){}return true;}
  if(l.meet){const mt=(D.meets||[]).find(x=>x.id===l.meet);if(mt){P15.meet(mt.id);return true;}}
  // a message about one job with only a tab (or nothing): open that job
  if((!l.tab||l.tab==='sites'||l.tab==='jobs'&&!/task|tarea/i.test(msg||''))){const s=siteFromText(msg);if(s&&(!l.tab||l.tab==='sites')){if(allowed('sites'))goTab('sites');openFolder(s.id);return true;}}
  if(l.tab){try{if(l.tab==='exp'&&l.view)moneyView=l.view;if(l.tab==='est'&&l.view)estFilter=l.view;}catch(e){}
    if(allowed(l.tab))goTab(l.tab);else if(allowed('home'))goTab('home');else toast(tt('Not on your screens'));return true;}
  return false;}
P15.goLink=goLink;
// 11/12: for people set to "stacked" (Yossi), opening the app clears the app's cards from the phone (everything is in the bell)
function clearShade(){try{const mm=M();if(!mm||mm.notifStack!==true)return;   // only for people set to "stacked" (Yossi)
  if(document.visibilityState!=='visible'||!('serviceWorker' in navigator))return;navigator.serviceWorker.ready.then(r=>r.getNotifications?r.getNotifications():[]).then(ns=>(ns||[]).forEach(n=>{try{n.close();}catch(e){}})).catch(()=>{});}catch(e){}}
document.addEventListener('visibilitychange',clearShade);setTimeout(clearShade,3000);
// Baruch 11/12: a meeting notification opens the meeting itself — when, where, with Directions (Google Maps) to the job
// (or to the office), the note and who is coming. Everyone invited can open it, workers too.
const MES={'Meeting':'Reunión','Directions':'Cómo llegar','Open the job':'Abrir el trabajo','At the office':'En la oficina','Who':'Quién','Note':'Nota','Close':'Cerrar','Edit':'Editar','Today':'Hoy','Tomorrow':'Mañana'};
const mt_=x=>{try{if(typeof lang==='function'&&lang()==='es'&&MES[x])return MES[x];}catch(e){}return tt(x);};
P15.meet=id=>{const x=(D.meets||[]).find(q=>q.id===id);if(!x)return;let o=$('m-p15m');
  if(!o){o=document.createElement('div');o.id='m-p15m';o.className='ov hid';o.style.zIndex='260';o.innerHTML='<div class="md"></div>';o.onclick=e=>{if(e.target===o)hide('m-p15m');};document.body.appendChild(o);}
  const s=x.site&&(D.sites||[]).find(q=>q.id===x.site);let loc='';try{loc=LOC();}catch(e){}
  const d=new Date(x.at),dk=v=>{try{return dkey(v);}catch(e){return v.toDateString();}};const today=new Date(),tmr=new Date(Date.now()+864e5);
  const day=dk(d)===dk(today)?mt_('Today'):dk(d)===dk(tmr)?mt_('Tomorrow'):d.toLocaleDateString(loc||undefined,{weekday:'long',month:'short',day:'numeric'});
  const tm=d.toLocaleTimeString(loc||undefined,{hour:'numeric',minute:'2-digit'});
  let place='',dir='';
  if(s){place='<div style="font-weight:600">'+E(s.name)+'</div>';try{dir=gmapsDir(s);}catch(e){dir='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(s.name)+'&travelmode=driving';}}
  else if(x.type==='office'){place='<div style="font-weight:600">'+E(mt_('At the office'))+'</div>';const b=D.base||{};dir='https://www.google.com/maps/dir/?api=1&destination='+(b.lat?b.lat+','+b.lng:encodeURIComponent('73 N Airmont Rd, Suffern, NY 10901'))+'&travelmode=driving';}
  let ppl=[];try{ppl=(typeof meetPeople==='function'?meetPeople(x):[x.by].concat(x.with||[])).map(w=>nameOf(w)).filter(Boolean);}catch(e){}
  const m=M();let canEd=false;try{canEd=typeof canEditMeet==='function'&&canEditMeet(x,m);}catch(e){}
  const btn='display:block;width:100%;text-align:center;padding:13px;border-radius:12px;font-weight:600;font-size:15px;text-decoration:none;margin-top:10px;border:0;cursor:pointer';
  o.querySelector('.md').innerHTML='<div style="padding:30px 4px 4px"><div style="font-size:12px;color:var(--g4);text-transform:uppercase;letter-spacing:.04em">📅 '+E(mt_('Meeting'))+'</div>'
    +'<div style="font-size:20px;font-weight:700;margin:4px 0 2px">'+E(x.title||mt_('Meeting'))+'</div>'
    +'<div style="font-size:15px;color:var(--g5)">'+E(day)+' · '+E(tm)+'</div>'
    +(place?'<div style="margin-top:14px;font-size:15px">'+place+'</div>':'')
    +(x.note?'<div style="margin-top:12px;font-size:14px;white-space:pre-wrap"><span style="color:var(--g4)">'+E(mt_('Note'))+':</span> '+E(x.note)+'</div>':'')
    +(ppl.length?'<div style="margin-top:10px;font-size:14px"><span style="color:var(--g4)">'+E(mt_('Who'))+':</span> '+E(ppl.join(', '))+'</div>':'')
    +(dir?'<a href="'+E(dir)+'" target="_blank" rel="noopener" style="'+btn+';background:#1a73e8;color:#fff;margin-top:18px">📍 '+E(mt_('Directions'))+'</a>':'')
    +(s?'<button style="'+btn+';background:var(--g1);color:var(--ink,inherit)" onclick="hide(\'m-p15m\');try{openFolder(\''+J(s.id)+'\')}catch(e){}">'+E(mt_('Open the job'))+'</button>':'')
    +(canEd?'<button style="'+btn+';background:var(--g1);color:var(--ink,inherit)" onclick="hide(\'m-p15m\');try{openMeet(\''+J(x.id)+'\')}catch(e){}">'+E(mt_('Edit'))+'</button>':'')
    +'<button style="'+btn+';background:transparent;color:var(--g5)" onclick="hide(\'m-p15m\')">'+E(mt_('Close'))+'</button></div>';
  show('m-p15m');};
if(typeof window.nGo==='function'){window.nGo=async function(id){const x=(D.inbox||[]).find(n=>n.id===id);if(!x)return;x.read=true;try{save();}catch(e){}try{renderBell();}catch(e){}hideAll();
    let l=null;try{l=nLinkFor(x);}catch(e){}if(!l||typeof l!=='object')l=x.link||null;
    const ok=await goLink(l||{},x.msg);if(!ok)toast(tt('Nothing to open for this one'));};try{nGo=window.nGo;}catch(e){}}
// phone notifications: the service worker hands over the message id + where it points; works even before the message has synced
let wantOpen=null;
function tryOpen(){if(!wantOpen)return;if(!M()||typeof D==='undefined'||!D.inbox){setTimeout(tryOpen,500);return;}
  const w=wantOpen;const x=w.id&&(D.inbox||[]).find(n=>n.id===w.id);
  if(x){wantOpen=null;window.nGo(w.id);return;}
  if(w.link&&Object.keys(w.link).length){wantOpen=null;goLink(w.link,w.msg||'');if(w.id){let k=0;const mark=()=>{const y=(D.inbox||[]).find(n=>n.id===w.id);if(y){y.read=true;try{save();renderBell();}catch(e){}}else if(k++<20)setTimeout(mark,1500);};mark();}return;}
  if(!w.tries)w.tries=0;if(w.tries++<40){if(w.tries===4)catchUp();setTimeout(tryOpen,750);}else wantOpen=null;}
P15.openPush=(id,link,msg)=>{wantOpen={id:id||'',link:link||null,msg:msg||''};hideAll();tryOpen();};
window.openFromPush=function(id){P15.openPush(id,null,'');return true;};try{openFromPush=window.openFromPush;}catch(e){}
try{if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{const d=e.data||{};if(d.type==='ex-open2'){P15.openPush(d.id,d.link,d.msg);}});}catch(e){}
try{const q=new URLSearchParams(location.search);const n=q.get('n'),l=q.get('l');if((n||l)&&!q.get('act')){let link=null;try{link=l?JSON.parse(l):null;}catch(e){}try{history.replaceState(null,'',location.pathname);}catch(e){}setTimeout(()=>P15.openPush(n,link,''),300);}}catch(e){}
// an iPhone can open the app without the address: the service worker also leaves the tapped notification here
async function pendingOpen(){try{if(!('caches' in window))return;const c=await caches.open(/\/staging\//.test(location.pathname)?'electrix-staging-open':'electrix-open');const r=await c.match('./__open');if(!r)return;await c.delete('./__open');const d=await r.json();
  if(d&&Date.now()-(d.ts||0)<180000)P15.openPush(d.id,d.link,d.msg);}catch(e){}}
pendingOpen();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pendingOpen();});

/* ───────── 4. notifications on every phone ───────── */
const ios=()=>/iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone=()=>{try{return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}catch(e){return false;}};
function pushState(){if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))return ios()&&!standalone()?'install':'unsupported';
  const p=Notification.permission;if(p==='granted'){const m=M();const mine=(D.push||[]).some(x=>x&&x.who===(m&&m.id));return mine?'on':'nosub';}return p;}
P15.pushState=pushState;
let cardOff=false;try{cardOff=sessionStorage.getItem('p15nc')==='1';}catch(e){}
function notifCard(){const hb=$('homeBody');if(!hb||!window.EX_REAL)return;let c=$('p15nc');const st=pushState();
  if(st==='on'||st==='unsupported'||cardOff){if(c)c.remove();return;}
  if(!c){c=document.createElement('div');c.id='p15nc';const after=hb.querySelector('#p7date')||hb.firstElementChild;if(after&&after.nextSibling)hb.insertBefore(c,after.nextSibling);else hb.prepend(c);}
  const steps=st==='install'?'<ol><li>'+E(tt('Open this app in Safari'))+'</li><li>'+E(tt('Tap Share (the square with the arrow)'))+'</li><li>'+E(tt('Tap "Add to Home Screen", then open the app from the new icon'))+'</li><li>'+E(tt('Come back here and tap Turn on'))+'</li></ol>'
    :st==='denied'?'<p>'+E(tt(ios()?'Notifications are blocked for this app. Open the phone Settings → Notifications → Electrix → Allow Notifications.':'Notifications are blocked. Tap the lock next to the address (or the app\'s settings) → Notifications → Allow.'))+'</p>':'';
  c.innerHTML='<div class="p15nh"><b>🔔 '+E(tt('Turn on notifications'))+'</b><button type="button" aria-label="'+E(tt('Later'))+'" onclick="P15.hideCard()">×</button></div><p>'+E(tt('Without them you only see new tasks and messages when you open the app.'))+'</p>'+steps
    +(st==='default'||st==='nosub'?'<button type="button" class="p15nb" onclick="P15.turnOn()">'+E(tt('Turn on'))+'</button>':'');}
P15.hideCard=()=>{cardOff=true;try{sessionStorage.setItem('p15nc','1');}catch(e){}const c=$('p15nc');if(c)c.remove();};
P15.turnOn=async()=>{let r='error';try{r=await EX_pushOn(true);}catch(e){}
  if(r==='granted'){toast('🔔 '+tt('Notifications are on for this phone'),'green');kick();}
  else if(r==='denied')toast(tt('Notifications are blocked. Turn them on in the phone settings for this app.'));
  else toast(tt('Could not turn them on on this phone'));try{notifCard();}catch(e){}};
// the owner: who doesn't get notifications on any phone yet
P15.whoNoPush=()=>{const has=new Set((D.push||[]).filter(x=>x&&x.who).map(x=>x.who));const L=(D.emps||[]).filter(e=>e&&!e.inactive&&!has.has(e.id)).sort((a,b)=>String(a.role).localeCompare(String(b.role))||String(a.name).localeCompare(String(b.name)));
  list(tt('No notifications yet'),tt('These people don\'t get notifications on any phone. Next time they open the app it asks them to turn them on.'),L.map(e=>({t:e.name,s:tt(e.role==='worker'?'Field':e.role==='office'?'Office':e.role==='manager'?'Site manager':e.role)+(e.authUid||e.authEmail?'':' · '+tt('no login yet')),go:null})));};
function moreRow(){const pg=$('pg-more');const m=M();if(!pg||!m||m.role!=='owner'||$('p15np'))return;const has=new Set((D.push||[]).filter(x=>x&&x.who).map(x=>x.who));const n=(D.emps||[]).filter(e=>e&&!e.inactive&&!has.has(e.id)).length;
  const d=document.createElement('button');d.type='button';d.id='p15np';d.className='p15lr p15np';d.onclick=P15.whoNoPush;d.innerHTML='<span class="w"><b>🔔 '+E(tt('Who doesn\'t get notifications'))+'</b><small>'+n+' '+E(tt('people'))+'</small></span><span class="ch">›</span>';pg.appendChild(d);}
if(typeof window.renderMore==='function'){const _rm=window.renderMore;window.renderMore=function(){const r=_rm.apply(this,arguments);try{const o=$('p15np');if(o)o.remove();moreRow();}catch(e){}return r;};try{renderMore=window.renderMore;}catch(x){}}

/* ───────── look ───────── */
const st=document.createElement('style');st.id='p15css';st.textContent=`
#p15save{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(150px + env(safe-area-inset-bottom));z-index:950;border:0;border-radius:999px;background:#c77700;color:#fff;font:600 13px/1.2 inherit;font-family:inherit;padding:9px 14px;box-shadow:0 4px 14px rgba(0,0,0,.25);max-width:92vw}
#m-p15l .md h2{margin:0 0 2px;font-size:20px}.p15ls{color:var(--g4);font-size:13px;margin:0 0 10px}
.p15lc{background:#fff;border-radius:14px;overflow:hidden}html[data-theme=dark] .p15lc{background:#1c1c1e}
.p15lr{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;text-align:left;padding:12px 14px;font:inherit;color:inherit;cursor:pointer}
.p15lc .p15lr+.p15lr{border-top:1px solid var(--g1)}html[data-theme=dark] .p15lc .p15lr+.p15lr{border-color:#2c2c2e}
.p15lr .w{flex:1;min-width:0}.p15lr b{display:block;font-weight:600;font-size:15px}.p15lr small{display:block;color:var(--g4);font-size:12.5px;margin-top:2px}.p15lr .ch{color:#b5b8be;font-size:18px}
.p15le{color:var(--g4);padding:20px 4px;text-align:center}
.p15np{background:#fff;border-radius:14px;margin-top:12px}html[data-theme=dark] .p15np{background:#1c1c1e}
#p15nc{background:#fff7e6;border-radius:16px;padding:12px 14px;margin:6px 0 12px;color:#3c2a00;box-shadow:0 0 0 1px #f3d9a4}
html[data-theme=dark] #p15nc{background:#2f2410;color:#ffe2a8;box-shadow:0 0 0 1px #5a4318}
#p15nc .p15nh{display:flex;align-items:center;justify-content:space-between}#p15nc .p15nh b{font-size:15px}#p15nc .p15nh button{border:0;background:none;font-size:22px;line-height:1;color:inherit;opacity:.6;padding:0 4px}
#p15nc p{margin:6px 0 0;font-size:13.5px}#p15nc ol{margin:8px 0 0 18px;padding:0;font-size:13.5px}#p15nc li{margin:3px 0}
#p15nc .p15nb{margin-top:10px;border:0;border-radius:11px;background:#1c1c1e;color:#fff;font:600 14px/1 inherit;font-family:inherit;padding:11px 16px}
html[data-theme=dark] #p15nc .p15nb{background:#fff;color:#000}
`;document.head.appendChild(st);
try{if(typeof ES==='object')Object.assign(ES,{"Saving…":"Guardando…","Not saved yet — tap to send":"Todavía no se guardó — toca para enviar","No signal — saved on this phone, sends when back":"Sin señal — guardado en el teléfono, se envía al volver",
  "Nothing here right now.":"No hay nada ahora.","Jobs without a GPS point":"Trabajos sin punto GPS","Tap a job to set its GPS fence":"Toca un trabajo para poner su cerca GPS","Job locations to double-check":"Ubicaciones para revisar","Tap a job to check its GPS fence":"Toca un trabajo para revisar su cerca GPS","Check the pin is on the house":"Revisa que el punto esté en la casa",
  "Roughing jobs need a site manager":"Trabajos en rough sin encargado","Tap a job to pick its site manager":"Toca un trabajo para elegir el encargado","Inspections to book":"Inspecciones para agendar","Overdue tasks":"Tareas atrasadas","Off site":"Fuera de la obra","Punched in but away from the job":"Marcaron entrada pero están lejos de la obra",
  "That task was removed":"Esa tarea fue borrada","Not on your screens":"No está en tus pantallas","Nothing to open for this one":"No hay nada que abrir",
  "Turn on notifications":"Activa las notificaciones","Without them you only see new tasks and messages when you open the app.":"Sin ellas solo ves las tareas y mensajes nuevos cuando abres la app.","Turn on":"Activar","Later":"Después",
  "Open this app in Safari":"Abre esta app en Safari","Tap Share (the square with the arrow)":"Toca Compartir (el cuadro con la flecha)","Tap \"Add to Home Screen\", then open the app from the new icon":"Toca \"Agregar a inicio\" y abre la app desde el ícono nuevo","Come back here and tap Turn on":"Vuelve aquí y toca Activar",
  "Notifications are blocked for this app. Open the phone Settings → Notifications → Electrix → Allow Notifications.":"Las notificaciones están bloqueadas. Abre Ajustes del teléfono → Notificaciones → Electrix → Permitir notificaciones.",
  "Notifications are blocked. Tap the lock next to the address (or the app's settings) → Notifications → Allow.":"Las notificaciones están bloqueadas. Toca el candado junto a la dirección (o los ajustes de la app) → Notificaciones → Permitir.",
  "Could not turn them on on this phone":"No se pudieron activar en este teléfono","No notifications yet":"Sin notificaciones todavía","Who doesn't get notifications":"Quién no recibe notificaciones","people":"personas","no login yet":"sin usuario todavía",
  "These people don't get notifications on any phone. Next time they open the app it asks them to turn them on.":"Estas personas no reciben notificaciones en ningún teléfono. La próxima vez que abran la app se les pide activarlas.",
  "Field":"Campo","Office":"Oficina","Site manager":"Encargado",
  "field jobs without GPS point":"trabajos sin punto GPS","job locations to double-check":"ubicaciones de trabajos para revisar","inspection to book":"inspección para agendar","off site":"fuera de la obra"});}catch(e){}
})();
