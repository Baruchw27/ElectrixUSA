// Builds app/index.html from the artifact index.html
const fs=require('fs');const SRC=process.argv[2];const OUT=__dirname+'/index.html';const VER=process.argv[3]||('v'+Date.now().toString(36));
let s=fs.readFileSync(SRC,'utf8');
function rep(a,b){const n=s.split(a).length-1;if(n!==1)throw Error('count '+n+': '+a.slice(0,100));s=s.replace(a,()=>b);}

// ---- head: manifest, icons, libraries
rep(`<title>Electrix USA – Field Manager</title>`,`<title>Electrix Field</title>
<link rel="manifest" href="manifest.json"><link rel="icon" href="icon-192.png">
<script src="config.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js" crossorigin="anonymous"></script>`);
rep(`<meta name="theme-color" content="#ffffff"><meta name="apple-mobile-web-app-capable" content="yes">`,`<meta name="apple-mobile-web-app-capable" content="yes">`);

// ---- ids must be unique across phones
rep(`function nid(p){return p+(D.nextId++);}`,`function nid(p){D.nextId=(D.nextId||1)+1;return p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}`);

// ---- save(): push changes
rep(`function save(){if(!save._p||Date.now()-save._p>3600000){save._p=Date.now();try{if(pruneOld()&&window.EX_forget){}}catch(e){}}sortSites();try{localStorage.setItem(KEY,JSON.stringify(D));}catch(e){try{if(pruneOld()){localStorage.setItem(KEY,JSON.stringify(D));return;}}catch(e3){}const old=Date.now()-14*86400000;D.jobs.forEach(j=>{if(j.status==='done'&&(j.doneAt||0)<old&&j.photos&&j.photos.length>1)j.photos=j.photos.slice(-1);});try{localStorage.setItem(KEY,JSON.stringify(D));}catch(e2){throw e2;}}}`,
`function save(){if(!save._p||Date.now()-save._p>3600000){save._p=Date.now();try{if(pruneOld()&&window.EX_forget){}}catch(e){}}sortSites();try{localStorage.setItem(KEY,JSON.stringify(D));}catch(e){try{if(pruneOld()){localStorage.setItem(KEY,JSON.stringify(D));return;}}catch(e3){}const old=Date.now()-14*86400000;D.jobs.forEach(j=>{if(j.status==='done'&&(j.doneAt||0)<old&&j.photos&&j.photos.length>1)j.photos=j.photos.slice(-1);});try{localStorage.setItem(KEY,JSON.stringify(D));}catch(e2){}}try{if(window.EX_afterSave)window.EX_afterSave();}catch(e){console.warn(e);}}`);

// ---- real-app switches
rep(`const TRAVEL_ON=false;`,`const TRAVEL_ON=!!window.EX_REAL;`);
rep(`const LOGIN_ON=false; // ← flip to true to require sign-in (password + Face ID). Off while the team reviews the demo.`,`const LOGIN_ON=true;`);
rep(`(function(){if(typeof location==='undefined'||!LOGIN_ON)return;const inv=/invite=/.test(location.hash+location.search);const sid=sessionUser();if(sid){if(D.role!==sid){D.role=sid;save();renderAll();navReset();}}else if(!inv)needLogin();})();`,
`exBootstrap();`);

// ---- login through Supabase
rep(`function doLogin(){const u=findUser(document.getElementById('lgUser').value),p=document.getElementById('lgPass').value;const err=document.getElementById('lgErr');`,
`async function doLogin(){const err=document.getElementById('lgErr');if(window.EX_REAL){const q=document.getElementById('lgUser').value,p=document.getElementById('lgPass').value;if(!q||!p){err.textContent=t('Type your name and password.');return;}err.textContent=t('Signing in…');
    const r=await EX_login(q,p);if(!r.ok){err.textContent=r.err==='nouser'?t('No one by that name, phone or email.'):r.err==='confirm'?t('This sign-in is not confirmed yet. Call the office.'):t('Wrong password.');return;}
    try{await EX_start();}catch(e){err.textContent=t('Could not load the company data.')+' '+(e.message||'');return;}
    const u=D.emps.find(e=>!e.inactive&&EX_emailFor(e)===r.email);if(!u){err.textContent=t('Signed in, but you are not on the team list. Call the office.');await EX_logout();return;}
    signIn(u.id);try{if('Notification'in window&&Notification.permission==='default')Notification.requestPermission();}catch(e){}return;}
  const u=findUser(document.getElementById('lgUser').value),p=document.getElementById('lgPass').value;`);
rep(`function signOut(){try{localStorage.removeItem(SESS);}catch(e){}needLogin();}`,`async function signOut(){try{localStorage.removeItem(SESS);}catch(e){}if(window.EX_REAL){await EX_logout();location.reload();return;}needLogin();}`);

// ---- nobody switches users in the real app
rep(`function renderRoleSel(){
  const s=document.getElementById('roleSel');`,`function exIsOwner(){const r=(D.emps||[]).find(e=>e.id===window.EX_ME);return !!r&&r.role==='owner';}
function exViewBar(){let b=document.getElementById('exViewAs');const on=window.EX_REAL&&window.EX_ME&&D.role!==window.EX_ME;if(!on){if(b)b.remove();return;}if(!b){b=document.createElement('div');b.id='exViewAs';b.style.cssText='position:sticky;top:0;z-index:300;background:#D53C36;color:#fff;font-size:14px;font-weight:600;padding:9px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px';document.body.prepend(b);}
  b.innerHTML='<span>👁 '+t('Viewing the app as')+' '+esc(nameOf(D.role))+'</span><button onclick="setRole(window.EX_ME)" style="border:0;background:#fff;color:#D53C36;font-weight:700;border-radius:99px;padding:6px 12px;font-size:13px">'+t('Back to me')+'</button>';}
function renderRoleSel(){
  const s=document.getElementById('roleSel');if(window.EX_REAL){exViewBar();if(!exIsOwner()){const m=me();s.innerHTML='<option>'+esc(m?m.name:'')+'</option>';s.disabled=true;return;}s.disabled=false;}`);
rep(`function setRole(v){`,`function setRole(v){if(window.EX_REAL&&!exIsOwner())return;`);

// ---- demo things disappear
rep(`function toggleDemo(){D.demo=!D.demo;save();renderPunch();}`,`function toggleDemo(){if(window.EX_REAL){D.demo=false;save();renderPunch();return;}D.demo=!D.demo;save();renderPunch();}`);
rep(`#pv[hidden]{display:none!important}`,`#pv[hidden]{display:none!important}html.exreal #demoSw,html.exreal #simBox,html.exreal .exdemo{display:none!important}`);
rep(`<div class="tog"><span data-i18n="Demo mode (skip GPS fence)">Demo mode (skip GPS fence)</span><div class="sw" id="demoSw" onclick="toggleDemo()"></div></div>
  <div class="card">`,`<div class="tog exdemo"><span data-i18n="Demo mode (skip GPS fence)">Demo mode (skip GPS fence)</span><div class="sw" id="demoSw" onclick="toggleDemo()"></div></div>
  <div class="card exdemo">`);
rep(`((m.role==='owner')?'<div class="mg" onclick="resetAll()" style="color:#c0392b">'`,`((m.role==='owner')?'<div class="mg" onclick="exportData()">'+sv('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>')+t('Export data')+'</div>'+(window.EX_REAL?'<div class="mg" onclick="exChangePw()">'+sv('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>')+t('Change my password')+'</div>':'<div class="mg" onclick="resetAll()" style="color:#c0392b">'+sv('<path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/>')+t('Reset demo')+'</div>'):'')+((m.role!=='owner'&&window.EX_REAL)?'<div class="mg" onclick="exChangePw()">'+sv('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>')+t('Change my password')+'</div>':'')+(false?'<div class="mg" onclick="resetAll()" style="color:#c0392b">'`);

// ---- employees: create / reset sign-ins
rep(`const ne={id:nid('u'),name:n,role,crew,phone:document.getElementById('ePhone').value.trim(),email,dl,pass:newPass||'1234',lead:document.getElementById('eLead').classList.contains('on')};if(role==='office'){ne.title=title;if(all)ne.all=true;}D.emps.push(ne);`,
`const ne={id:nid('u'),name:n,role,crew,phone:document.getElementById('ePhone').value.trim(),email,dl,pass:newPass||'1234',lead:document.getElementById('eLead').classList.contains('on')};if(role==='office'){ne.title=title;if(all)ne.all=true;}D.emps.push(ne);
  if(window.EX_REAL){if(newPass&&pwBad(newPass)){D.emps.pop();toast(pwBad(newPass));return;}const pw=newPass||exGenPw();ne.pass='';save();EX_createUser(ne,pw).then(r=>{if(r.ok)askConfirm(t('Sign-in created for')+' '+n+'.\\n'+t('Password')+': '+pw+'\\n'+t('Tell them: sign in with their name and this password.'),()=>{},t('OK'));else toast('⚠ '+t('Could not create the sign-in')+': '+r.err);});}`);
rep(`if(empEditId){const e=D.emps.find(x=>x.id===empEditId);e.name=n;e.phone=document.getElementById('ePhone').value.trim();e.email=email;e.dl=dl;if(newPass)e.pass=newPass;`,
`if(empEditId){const e=D.emps.find(x=>x.id===empEditId);e.name=n;e.phone=document.getElementById('ePhone').value.trim();e.email=email;e.dl=dl;if(newPass&&window.EX_REAL){{const bad=pwBad(newPass);if(bad){toast(bad);return;}}EX_setPassword(e,newPass).then(r=>toast(r.ok?'🔑 '+t('Password changed for')+' '+n:'⚠ '+(r.err==='nouser'?t('No sign-in yet for')+' '+n:pwErr(r.err))));}else if(newPass)e.pass=newPass;`);
rep(`<input id="ePass" type="text" placeholder="1234" autocomplete="off">`,`<input id="ePass" type="text" placeholder="6+ characters" autocomplete="off">`);

// ---- bootstrap + setup wizard + export/import + password change
rep(`function resetAll(){`,`function exGenPw(){const w=['volt','amp','wire','pipe','box','fuse','breaker','panel','spark','ohm','conduit','relay'];const r=new Uint32Array(2);try{crypto.getRandomValues(r);}catch(e){r[0]=Math.random()*1e9;r[1]=Math.random()*1e9;}return w[r[0]%w.length]+String(100000+r[1]%900000);}
function exportData(){const d=JSON.stringify(D);const blob=new Blob([d],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='electrix-data-'+dkey(new Date())+'.json';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);toast('⬇ '+t('Data file saved'),'green');}
function exCleanStart(){['jobs','punches','mats','meets','ests','tickets','tools','exps','stockLog','goHomeLog','fixes','insp','travel','keep','inbox','msgs','timeoff','invites','apps','incidents','estDocs','groups'].forEach(k=>{D[k]=[];});D.sched={};D.mylist={};D.punchlists={};D.keepLabels={};D.demo=false;(D.stock||[]).forEach(x=>{x.qty=0;x.min=0;delete x.photo;});(D.sites||[]).forEach(s=>{s.notes=[];delete s.fenceReq;delete s.trip;});(D.emps||[]).forEach(e=>{delete e.pass;});}
// strong passwords: 8+ characters, letters and numbers, not a common one (checked here and again on the server)
const PW_COMMON=['password','password1','password123','12345678','123456789','1234567890','qwerty123','qwertyuiop','abc12345','abcd1234','iloveyou1','admin123','welcome1','letmein1','monkey123','11111111','00000000','12341234','passw0rd','electrix','electrix1','electrix123','electrixusa','electrix2026','monsey123','spring123'];
function pwBad(p){p=String(p||'');if(p.length<8)return t('Password needs at least 8 characters');if(!/[A-Za-z]/.test(p)||!/[0-9]/.test(p))return t('Password needs letters and numbers');const l=p.toLowerCase();if(PW_COMMON.includes(l)||/^(.)\\1+$/.test(p)||/electrix/.test(l))return t('That password is too easy to guess');return '';}
function pwErr(m){m=String(m||'');return /weak|common|too short|easy|letters/i.test(m)?t('That password is too easy to guess'):m;}
function exChangePw(){askPrompt(t('Change my password'),[{label:t('New password (8+ letters and numbers)'),value:'',type:'password'}],([p])=>{{const bad=pwBad(p);if(bad){toast(bad);return;}}EX_changeMyPassword(p).then(r=>toast(r.ok?'🔑 '+t('Password changed'):'⚠ '+pwErr(r.err)));});}
function exOverlay(msg){let o=document.getElementById('exBoot');if(!o){o=document.createElement('div');o.id='exBoot';o.style.cssText='position:fixed;inset:0;z-index:600;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-size:15px;color:#6b7590';document.body.appendChild(o);}if(msg===null){o.remove();return;}const lg=document.querySelector('.logo img');o.innerHTML=(lg?'<img src="'+lg.src+'" style="height:40px">':'')+'<div>'+esc(msg)+'</div>';}
async function exBootstrap(){if(!window.EX_REAL){document.documentElement.classList.remove('exreal');return;}document.documentElement.classList.add('exreal');D.demo=false;
  // open right away from the copy on this phone; the server catches up in the background (never a frozen "Loading…")
  const ce=window.EX_cachedEmail&&EX_cachedEmail();const lu=ce&&(D.emps||[]).length>1?D.emps.find(e=>!e.inactive&&EX_emailFor(e)===ce):null;
  if(lu)exEnter(lu,true);else{exOverlay(t('Loading…'));setTimeout(()=>{if(document.getElementById('exBoot')&&!window.EX_ready())exOverlayRetry();},15000);}
  let b;try{b=await EX_boot();}catch(e){if(lu){exRetry();return;}exOverlay(null);toast('⚠ '+t('Could not reach the server')+': '+(e.message||''));needLogin();return;}
  if(!b.email){exOverlay(null);needLogin();exSetupLink();return;}
  try{await EX_start();}catch(e){if(/JWT|session|auth|refresh|401/i.test(e.message||'')){exOverlay(null);await EX_logout();needLogin();return;}if(lu){exRetry();return;}exOverlayRetry();return;}
  const u=D.emps.find(e=>!e.inactive&&EX_emailFor(e)===b.email);
  if(!u){exOverlay(null);toast(t('You are not on the team list. Call the office.'));await EX_logout();needLogin();return;}
  exEnter(u,false);}
function exEnter(u,fast){window.EX_ME=u.id;exOverlay(null);
  if(!exEnter.lock){exEnter.lock=true;try{if(EX_lockOn())EX_lock();else setTimeout(exOfferFaceId,1800);}catch(e){}}
  if(D.role!==u.id){D.role=u.id;try{localStorage.setItem(SESS,u.id);}catch(e){}}
  if(fast)EX_openLocal();else save();
  try{renderAll();}catch(e){console.warn(e);}
  if(!exEnter.nav){exEnter.nav=true;(function(){const m=me();if(m.role==='owner'||m.all||m.role==='manager')goTab('home');else if(m.role==='worker')goTab('punch');})();try{navReset();}catch(e){}
    try{EX_pushOn(false);}catch(e){}}}
let exRetryN=0;
function exRetry(){const wait=Math.min(60000,4000*Math.pow(2,exRetryN++));setTimeout(async()=>{try{await EX_boot().catch(()=>{});await EX_start();exRetryN=0;const u=D.emps.find(e=>e.id===window.EX_ME);if(u)exEnter(u,false);}catch(e){exRetry();}},wait);}
function exOverlayRetry(){let o=document.getElementById('exBoot');if(!o)return;o.innerHTML='<div style="font-size:15px;color:#1F1E2A;font-weight:600">'+t('Can’t reach the server right now.')+'</div><div style="font-size:13px">'+t('Check your signal or Wi-Fi.')+'</div><button style="border:0;background:#1F1E2A;color:#fff;font-size:16px;font-weight:600;padding:12px 24px;border-radius:12px" onclick="location.reload()">'+t('Try again')+'</button><button style="border:0;background:none;color:#D53C36;text-decoration:underline;font-size:13px" onclick="exOverlay(null);needLogin()">'+t('Sign in again')+'</button>';}
async function exSetupLink(){try{const r=await EX_sb.rpc('no_team_yet');if(!r||r.data!==true)return;}catch(e){return;}const el=document.getElementById('m-login');if(!el||document.getElementById('exSetupBtn'))return;const b=document.createElement('div');b.id='exSetupBtn';b.style.cssText='text-align:center;margin-top:18px;font-size:13px;color:var(--g4)';b.innerHTML='<span style="text-decoration:underline;cursor:pointer" onclick="exSetup()">'+t('First-time setup (owner only)')+'</span>';el.querySelector('.md').appendChild(b);}
async function exSetup(){const owner=D.emps.find(e=>e.role==='owner');if(!owner)return;
  askPrompt(t('Owner setup')+' — '+owner.name,[{label:t('Choose your password (8+ letters and numbers)'),value:'',type:'password'},{label:t('Start with'),options:[{v:'clean',l:t('A clean slate — jobs, crews and catalog only')},{v:'file',l:t('A data file exported from the demo')}]}],async ([pw,mode])=>{{const bad=pwBad(pw);if(bad){toast(bad);return;}}
    let imported=null;if(mode==='file'){imported=await exPickFile();if(!imported){toast(t('No file chosen'));return;}}
    exOverlay(t('Setting up…'));const r=await EX_setupOwner(owner,pw);if(!r.ok){exOverlay(null);toast('⚠ '+r.err);return;}
    window.EX_allowSeed=true;if(imported){D=imported;(D.emps||[]).forEach(e=>{delete e.pass;});}else exCleanStart();D.role=owner.id;D.demo=false;{const o=D.emps.find(e=>e.role==='owner');if(o)o.authUid=r.uid;}save();
    try{await EX_start();}catch(e){exOverlay(null);toast('⚠ '+(e.message||'setup'));return;}
    exOverlay(null);document.getElementById('m-login').classList.add('hid');try{localStorage.setItem(SESS,owner.id);}catch(e){}renderAll();goTab('home');navReset();
    toast('✓ '+t('You are set up. Next: create sign-ins for the team.'),'green');setTimeout(exTeamSetup,800);});}
function exPickFile(){return new Promise(res=>{const i=document.createElement('input');i.type='file';i.accept='application/json,.json';i.onchange=()=>{const f=i.files[0];if(!f){res(null);return;}const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);res(d&&d.emps?d:null);}catch(e){res(null);}};r.readAsText(f);};i.click();});}
async function exTeamSetup(){const list=D.emps.filter(e=>!e.inactive&&e.role!=='owner');askConfirm(t('Create sign-ins for')+' '+list.length+' '+t('people now? Each gets a password you can read to them.'),async()=>{exOverlay(t('Creating sign-ins…'));const out=[];for(const e of list){const pw=exGenPw();const r=await EX_createUser(e,pw);out.push(e.name+': '+(r.ok?pw:'⚠ '+r.err));}exOverlay(null);
    const txt=out.join('\\n');const n={id:nid('k'),owner:me().id,by:me().id,title:t('Team passwords'),body:txt,type:'note',ts:Date.now(),edited:Date.now(),pinned:true};(D.keep=D.keep||[]).push(n);save();
    askConfirm(t('Done. The passwords are saved in a private note for you.')+'\\n\\n'+txt,()=>{},t('OK'));},t('Create sign-ins'));}
function resetAll(){`);

// ---- service worker
rep(`renderAll();(function(){const m=me();if(m.role==='owner'||m.all)goTab('home');})();navReset();checkInviteLink();`,`if('serviceWorker' in navigator&&location.protocol!=='file:'){navigator.serviceWorker.register('sw.js').catch(()=>{});}
renderAll();(function(){const m=me();if(m.role==='owner'||m.all)goTab('home');})();navReset();checkInviteLink();`);
rep(`</body>`,`<script src="sync.js?${VER}"></script>
</body>`);
// sync.js must load before the main script runs exBootstrap at the end — move it into the head instead
rep(`<script src="sync.js?${VER}"></script>
</body>`,`</body>`);
rep(`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js" crossorigin="anonymous"></script>`,`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js" crossorigin="anonymous"></script>
<script src="sync.js?${VER}"></script>
<script src="extras.js?${VER}"></script>`);

// ---- files open inside the app (Trello files through the server)
rep(`if(f.url&&!f.d){const u=safeHref(f.url);if(u!=='#')window.open(u,'_blank','noopener');return;}`,`if(f.url&&!f.d){const u=safeHref(f.url);if(u==='#')return;if(window.EX_REAL&&/^https:\\/\\/(www\\.)?trello\\.com\\//.test(u)){EX_openTrello(f);return;}window.open(u,'_blank','noopener');return;}`);
rep(`  else{const src=safeSrc(f.d);const w=src?window.open():null;`,`  else if(window.EX_REAL){EX_view(f.d,f.name,f.kind);}else{const src=safeSrc(f.d);const w=src?window.open():null;`);

// ---- phone notifications
rep(`signIn(u.id);try{if('Notification'in window&&Notification.permission==='default')Notification.requestPermission();}catch(e){}return;}`,`window.EX_ME=u.id;signIn(u.id);try{EX_pushOn(true);}catch(e){}setTimeout(exOfferFaceId,900);return;}`);
rep(`(window.EX_REAL?'<div class="mg" onclick="exChangePw()">'`,`(window.EX_REAL?'<div class="mg" onclick="exFaceIdToggle()">'+sv('<path d="M7 3H5a2 2 0 00-2 2v2M17 3h2a2 2 0 012 2v2M7 21H5a2 2 0 01-2-2v-2M17 21h2a2 2 0 002-2v-2M9 9v1M15 9v1M12 9v4h-1M9 16c1.5 1 4.5 1 6 0"/>')+t('Face ID lock')+'<div style="font-size:11px;color:var(--g4)">'+(EX_lockOn()?t('On'):t('Off'))+'</div></div><div class="mg" onclick="exNotif()">'+sv('<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/>')+t('Phone notifications')+'</div><div class="mg" onclick="exChangePw()">'`);
rep(`((m.role!=='owner'&&window.EX_REAL)?'<div class="mg" onclick="exChangePw()">'`,`((m.role!=='owner'&&window.EX_REAL)?'<div class="mg" onclick="exFaceIdToggle()">'+sv('<path d="M7 3H5a2 2 0 00-2 2v2M17 3h2a2 2 0 012 2v2M7 21H5a2 2 0 01-2-2v-2M17 21h2a2 2 0 002-2v-2M9 9v1M15 9v1M12 9v4h-1M9 16c1.5 1 4.5 1 6 0"/>')+t('Face ID lock')+'<div style="font-size:11px;color:var(--g4)">'+(EX_lockOn()?t('On'):t('Off'))+'</div></div><div class="mg" onclick="exNotif()">'+sv('<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/>')+t('Phone notifications')+'</div><div class="mg" onclick="exChangePw()">'`);
rep(`function exGenPw(){`,`async function exOfferFaceId(){try{if(localStorage.getItem('ex_faceid_asked')||EX_lockOn()||!(await EX_lockAvailable()))return;localStorage.setItem('ex_faceid_asked','1');}catch(e){return;}
  askConfirm(t('Use Face ID to open the app? You will be asked every time you open it.'),async()=>{const ok=await EX_lockEnroll();toast(ok?'🔒 '+t('Face ID is on'):t('Face ID could not be set up on this phone.'));},t('Yes, use Face ID'));}
async function exFaceIdToggle(){if(EX_lockOn()){EX_lockOff();toast(t('Face ID lock is off'));renderMore();return;}if(!(await EX_lockAvailable())){toast(t('This phone has no Face ID or fingerprint set up.'));return;}const ok=await EX_lockEnroll();toast(ok?'🔒 '+t('Face ID is on'):t('Face ID could not be set up on this phone.'));renderMore();}
async function exNotif(){const r=await EX_pushOn(true);toast(r==='granted'?'🔔 '+t('Notifications are on for this phone'):r==='denied'?t('Notifications are blocked. Turn them on in the phone settings for this app.'):r==='unsupported'?t('On iPhone: first tap Share → Add to Home Screen, then open the app from there.'):t('Could not turn on notifications'));}
function exGenPw(){`);

// ---- no demo welcome popup in the real app
rep(`(function(){let seen=false;try{seen=!!localStorage.getItem('electrix_welcome');}catch(e){}`,`(function(){if(window.EX_REAL)return;let seen=false;try{seen=!!localStorage.getItem('electrix_welcome');}catch(e){}`);

// ---- login screen wording for the real app
rep(`<div class="note" style="margin-top:14px;font-size:12px"><b data-i18n="Demo:">Demo:</b>`,`<div class="note exdemo" style="margin-top:14px;font-size:12px"><b data-i18n="Demo:">Demo:</b>`);
rep(`<label data-i18n="Phone or email">Phone or email</label><input id="lgUser" placeholder="845-555-0100" autocomplete="username" inputmode="email">`,`<label data-i18n="Your name or phone">Your name or phone</label><input id="lgUser" placeholder="Carlos" autocomplete="username" autocapitalize="words">`);
rep(`<input id="lgPass" type="password" placeholder="••••"`,`<input id="lgPass" type="password" placeholder="••••••"`);
// Face ID shortcut bypasses the server sign-in — off in the real app (phones stay signed in anyway)
rep(`+(LOGIN_ON?'<div class="mg" onclick="bioEnroll(me())">'+sv('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>')+t('Face ID / fingerprint')+'</div><div class="mg" onclick="signOut()">'`,`+(LOGIN_ON?(window.EX_REAL?'':'<div class="mg" onclick="bioEnroll(me())">'+sv('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>')+t('Face ID / fingerprint')+'</div>')+'<div class="mg" onclick="signOut()">'`);
rep(`if(bioOK&&!has)setTimeout(`,`if(bioOK&&!has&&!window.EX_REAL)setTimeout(`);

// ---- Spanish for the new screens
rep(`const ES={`,`const ES={"Password needs at least 8 characters":"La contraseña necesita al menos 8 caracteres","Password needs letters and numbers":"La contraseña necesita letras y números","That password is too easy to guess":"Esa contraseña es muy fácil de adivinar","New password (8+ letters and numbers)":"Nueva contraseña (8+ letras y números)","Choose your password (8+ letters and numbers)":"Elige tu contraseña (8+ letras y números)","Unlock with Face ID":"Desbloquear con Face ID","Use my password instead":"Usar mi contraseña","Face ID did not work. Try again.":"Face ID no funcionó. Intenta otra vez.","Use Face ID to open the app? You will be asked every time you open it.":"¿Usar Face ID para abrir la app? Se pedirá cada vez que la abras.","Yes, use Face ID":"Sí, usar Face ID","Face ID is on":"Face ID activado","Face ID lock is off":"Face ID desactivado","Face ID could not be set up on this phone.":"No se pudo activar Face ID en este teléfono.","This phone has no Face ID or fingerprint set up.":"Este teléfono no tiene Face ID ni huella.","Face ID lock":"Bloqueo con Face ID","On":"Activado","Off":"Desactivado","Viewing the app as":"Viendo la app como","Back to me":"Volver a mí","Your name or phone": "Tu nombre o teléfono", "Type your name and password.": "Escribe tu nombre y contraseña.", "Signing in…": "Entrando…", "This sign-in is not confirmed yet. Call the office.": "Esta cuenta no está confirmada. Llama a la oficina.", "Could not load the company data.": "No se pudieron cargar los datos.", "Signed in, but you are not on the team list. Call the office.": "Entraste, pero no estás en la lista del equipo. Llama a la oficina.", "Loading…": "Cargando…", "Offline — saved on this phone": "Sin señal — guardado en este teléfono", "Saving…": "Guardando…", "Phone notifications": "Notificaciones", "Change my password": "Cambiar mi contraseña", "Notifications are on for this phone": "Notificaciones activadas en este teléfono", "Notifications are blocked. Turn them on in the phone settings for this app.": "Las notificaciones están bloqueadas. Actívalas en los ajustes del teléfono.", "On iPhone: first tap Share → Add to Home Screen, then open the app from there.": "En iPhone: toca Compartir → Agregar a inicio, y abre la app desde ahí.", "New password (6+ characters)": "Nueva contraseña (6+ caracteres)", "Password must be at least 6 characters": "La contraseña necesita al menos 6 caracteres", "Password changed": "Contraseña cambiada", "Photo upload failed — will retry": "No se subió la foto — se reintentará", "Opening": "Abriendo", "Could not open the Trello file": "No se pudo abrir el archivo de Trello", "You are not on the team list. Call the office.": "No estás en la lista del equipo. Llama a la oficina.", "Could not reach the server": "No hay conexión con el servidor", "Could not load the company data": "No se pudieron cargar los datos", "Could not turn on notifications": "No se pudieron activar las notificaciones",`);

// ---- sharp logo and icons (vector logo, real-size icons)
s=s.replace(/<img style="height:28px;width:auto;display:block" src="data:image\/png;base64,[A-Za-z0-9+\/=]+"/,'<img class="exlogo" alt="Electrix" style="height:28px;width:auto;display:block" src="logo-light.svg"');
s=s.replace(/<link rel="apple-touch-icon" href="data:image\/png;base64,[A-Za-z0-9+\/=]+">/,'<link rel="apple-touch-icon" href="apple-touch-icon.png">');
rep(`#pv[hidden]{display:none!important}`,`#pv[hidden]{display:none!important}html[data-theme=dark] img.exlogo,html[data-theme=dark] #loginLogo{content:url(logo-dark.svg)}#loginLogo{height:44px!important;width:auto}`);

// ---- the owner doesn't punch in
rep(`show('punch',!o);`,`show('punch',!o&&m.role!=='owner');`);
rep(`owner:['home','sites','jobs','sched','punch','code','more']`,`owner:['home','sites','jobs','sched','mat','code','more']`);

// ---- wording for AI features that only ran inside Claude
s=s.split(`t('Estimate building needs the installed app or the Claude page permission.')`).join(`t('AI estimating is coming to the app soon.')`);

// ---- every phone updates itself when a new version is published
rep(`<script src="config.js"></script>`,`<script>window.EX_VER='${VER}';</script><script src="config.js"></script>`);
// the 40 KB inline tab icon becomes the icon file the site already has (smaller page, same icon)
s=s.replace(/<link rel="icon" href="data:image\/png;base64,[^"]+">/,'<link rel="icon" href="icon-192.png">');
fs.writeFileSync(__dirname+'/version.json',JSON.stringify({v:VER}));
fs.writeFileSync(OUT,s);
// ---- public copy for the web: no company data inside the page (everything loads from the server after sign-in)
{const i=s.indexOf('function defaults(){');const j=s.indexOf('\n}\n',i)+3;const src=s.slice(i,j);
  const full=new Function(src+';return defaults();')();const KEEP=['stock','base'];const out={};
  for(const k of Object.keys(full)){const v=full[k];if(KEEP.includes(k))out[k]=v;else if(k==='emps')out[k]=[{id:'u1',name:'',role:'owner',crew:null,phone:''}];else if(Array.isArray(v))out[k]=[];else if(v&&typeof v==='object')out[k]={};else out[k]=v;}
  const pub=s.slice(0,i)+'function defaults(){return '+JSON.stringify(out)+';}\n'+s.slice(j);
  fs.writeFileSync(__dirname+'/public.html',pub);console.log('public page',pub.length,'(full',s.length+')');}
const js=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');new Function(js);
console.log('built',OUT,s.length);
