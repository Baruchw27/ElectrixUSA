/* STAGING ONLY — schedule self-test that runs on a real phone (iPhone Safari / installed app / Android).
   Open the staging app with ?selftest=1, sign in, tap "Start". It drives the real schedule screens with real taps,
   checks every result against the STAGING database, cleans up after itself, and saves a report to the staging
   database (record type "selftest") so the results can be read without anyone copying them by hand.
   Uses only far-future dates (2031) so it never touches real test bookings. Never loaded by the live app. */
(function(){
if(!/[?&]selftest=1/.test(location.search))return;
const SS={get:k=>{try{return JSON.parse(sessionStorage.getItem('st_'+k)||'null');}catch(e){return null;}},set:(k,v)=>{try{sessionStorage.setItem('st_'+k,JSON.stringify(v));}catch(e){}}};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms){const t0=Date.now();while(Date.now()-t0<(ms||15000)){try{if(await fn())return true;}catch(e){}await wait(200);}return false;}
const R=SS.get('results')||[];let box=null,log=null;
function ui(){if(box)return;box=document.createElement('div');box.style.cssText='position:fixed;inset:auto 8px 74px 8px;max-height:46vh;overflow:auto;z-index:2147483646;background:#111;color:#fff;font:13px/1.35 system-ui;border-radius:12px;padding:10px;box-shadow:0 4px 20px rgba(0,0,0,.4)';
  box.innerHTML='<b>Schedule self-test (staging)</b><div id="stLog" style="margin-top:6px"></div><div id="stBtns" style="display:flex;gap:6px;margin-top:8px"></div>';document.body.appendChild(box);log=box.querySelector('#stLog');R.forEach(paint);}
function paint(r){if(!log)return;const d=document.createElement('div');d.textContent=(r.ok===true?'✅ ':r.ok===false?'❌ ':'• ')+r.name+(r.info?' — '+r.info:'');log.appendChild(d);box.scrollTop=box.scrollHeight;}
function rec(name,ok,info){const r={name,ok,info:info==null?'':String(info).slice(0,200),at:Date.now()};R.push(r);SS.set('results',R);paint(r);return ok;}
function btns(list){const b=box.querySelector('#stBtns');b.innerHTML='';list.forEach(x=>{const e=document.createElement('button');e.textContent=x.label;e.style.cssText='flex:1;padding:10px;border:0;border-radius:9px;font-weight:700;background:'+(x.bg||'#fff')+';color:#111';e.onclick=x.fn;b.appendChild(e);});}
function ask(label,buttons){return new Promise(res=>btns(buttons.map(b=>({label:b,fn:()=>{btns([]);res(b);}}))));}

// ── helpers that act exactly like a finger ──
function byText(root,sel,txt){return [...(root||document).querySelectorAll(sel)].find(e=>e.offsetParent!==null&&e.textContent.trim().includes(txt));}
function tap(el){if(!el)throw new Error('button not found');el.click();}
function pick(sel,val){const s=document.querySelector(sel);if(!s)throw new Error(sel+' missing');s.value=val;s.dispatchEvent(new Event('change',{bubbles:true}));}
function modalOpen(id){const m=document.getElementById(id);return m&&!m.classList.contains('hid');}
async function server(ids){const r=await EX_sb.from('records').select('id,data,deleted').eq('coll','sched').in('id',ids);if(r.error)throw r.error;const o={};(r.data||[]).forEach(x=>{if(!x.deleted)o[x.id]=x.data;});return o;}
const sites=d=>((d&&d.assignments)||[]).map(a=>a.site).sort().join(',');
async function saveAndSettle(){await until(()=>!modalOpen('m-slot')||document.getElementById('slotErr'),20000);await until(()=>!(window.EX_SYNC&&EX_SYNC.pending),20000);}

const DAYS=['2031-03-03','2031-03-04','2031-03-05','2031-03-06','2031-03-07','2031-03-10','2031-03-11'];
let C1,C2,S1,S2,S3,EMP;const made=new Set();
async function setup(){C1=D.crews[0].id;C2=(D.crews[1]||D.crews[0]).id;const ss=D.sites.filter(s=>s.stage!=='done');S1=(ss[0]||D.sites[0]).id;S2=(ss[1]||D.sites[1]||D.sites[0]).id;S3=(ss[2]||D.sites[0]).id;
  EMP=(D.emps.find(e=>e.role==='worker'&&e.active!==false)||{}).id;}
async function bookFull(crew,day,site){editSlot(crew,day);await wait(250);tap(byText(document.getElementById('slotBody'),'button','Add a job'));await wait(150);pick('#slotAddSite',site);tap(byText(document.getElementById('slotBody'),'button','Full day'));await wait(150);
  tap(document.querySelector("#slotBody button.btn[onclick='saveSlot()']"));made.add(crew+'|'+day);await saveAndSettle();}

async function steps(){
  const k=C1+'|'+DAYS[0];
  // 1 create
  let t0=Date.now();await bookFull(C1,DAYS[0],S1);let s=await server([k]);
  rec('Create a booking (real taps) → on the server',!!s[k]&&sites(s[k])===S1,'took '+(Date.now()-t0)+' ms');
  rec('"Saved" only after the server confirmed',(EX_schedLastResult()||{}).ok===true&&!!s[k]);
  // 2 edit
  editSlot(C1,DAYS[0]);await wait(250);pick('#slotBody select',S2);tap(document.querySelector("#slotBody button.btn[onclick='saveSlot()']"));await saveAndSettle();s=await server([k]);
  rec('Edit the job site → server updated',sites(s[k])===S2);
  // 3 two jobs on one day (Specific hours twice)
  editSlot(C1,DAYS[0]);await wait(250);slotOneoffs=[];renderSlotEditor();const body=()=>document.getElementById('slotBody');
  for(const [site,h] of [[S1,4],[S3,4]]){if(!document.getElementById('slotAddSite'))tap(byText(body(),'button','Add a job'));await wait(120);pick('#slotAddSite',site);
    tap(byText(body(),'button','Specific hours'));await wait(120);document.getElementById('slotAddHours').value=String(h);tap(byText(body(),'button','Add'));await wait(150);}
  tap(document.querySelector("#slotBody button.btn[onclick='saveSlot()']"));await wait(300);if(modalOpen('m-ask'))tap(document.getElementById('askOk'));await saveAndSettle();s=await server([k]);
  rec('Two job sites on one day → both on the server',((s[k]||{}).assignments||[]).length===2,sites(s[k]));
  // 4 move a person
  if(EMP){const lk='L:'+EMP+'|'+DAYS[0];openLoan(DAYS[0],EMP);await wait(250);pick('#loanSite',S3);document.getElementById('loanStart').value='12:00';document.getElementById('loanEnd').value='15:00';
    tap(document.querySelector('#m-loan button.btn'));made.add(lk);await until(()=>!modalOpen('m-loan'),15000);await until(()=>!EX_SYNC.pending,15000);s=await server([lk]);
    rec('Move an employee to another job (12–3) → on the server',!!s[lk]&&s[lk].assignments[0].site===S3&&s[lk].assignments[0].start===720&&s[lk].assignments[0].end===900);
    clearLoanFor(EMP,DAYS[0]);await wait(300);const asked=modalOpen('m-ask');if(asked)tap(document.getElementById('askOk'));await wait(500);await until(()=>!EX_SYNC.pending,15000);s=await server([lk]);
    if(s[lk]){await until(async()=>!(await server([lk]))[lk],10000);s=await server([lk]);}
    rec('Remove the move (asks first) → removed on the server',asked&&!s[lk],'asked='+asked+' still='+!!s[lk]+' local='+!!D.sched[lk]);}
  else rec('Move an employee',null,'skipped — no worker on staging');
  // 5 copy one crew's day to 3 days, one already booked
  await bookFull(C1,DAYS[2],S2); // pre-booked differently
  const before=JSON.stringify((await server([C1+'|'+DAYS[2]]))[C1+'|'+DAYS[2]]);
  editSlot(C1,DAYS[0]);await wait(250);tap(byText(document.getElementById('slotBody'),'button','Copy day'));await wait(300);
  [DAYS[1],DAYS[2],DAYS[3]].forEach(d=>{const c=document.querySelector("#askBody [data-k='"+d+"']");if(c)c.click();});
  tap(document.getElementById('askOk'));await wait(400);const warned=modalOpen('m-ask')&&/already booked/i.test(document.getElementById('askTitle').textContent);
  rec('Copy onto a booked day warns first',warned);
  if(warned)tap(byText(document.getElementById('askBody'),'button','Only fill what is empty'));await wait(400);await until(()=>!EX_SYNC.pending,15000);
  [DAYS[1],DAYS[3]].forEach(d=>made.add(C1+'|'+d));
  s=await server([k,C1+'|'+DAYS[1],C1+'|'+DAYS[2],C1+'|'+DAYS[3]]);
  rec('"Only fill what is empty" → copied to the 2 empty days',sites(s[C1+'|'+DAYS[1]])===sites(s[k])&&sites(s[C1+'|'+DAYS[3]])===sites(s[k]));
  rec('… the booked day was NOT changed',JSON.stringify(s[C1+'|'+DAYS[2]])===before);
  // 6 same as yesterday (whole day)
  await bookFull(C2,DAYS[5],S3);await bookFull(C1,DAYS[5],S1);
  const today0=new Date();today0.setHours(12,0,0,0);boardDay=Math.round((new Date(DAYS[6]+'T12:00')-today0)/864e5);schedView='today';goTab('sched');renderSched();await wait(400);
  const sb=document.querySelector('#schDayTools button');rec('"Same as yesterday" button shown',!!sb&&/yesterday/i.test(sb.textContent),sb&&sb.textContent);
  if(sb){tap(sb);await wait(400);if(modalOpen('m-ask'))tap(byText(document.getElementById('askBody'),'button','Replace them'));await wait(400);await until(()=>!EX_SYNC.pending,15000);
    [C1,C2].forEach(c=>made.add(c+'|'+DAYS[6]));s=await server([C1+'|'+DAYS[5],C2+'|'+DAYS[5],C1+'|'+DAYS[6],C2+'|'+DAYS[6]]);
    rec('"Same as yesterday" copied both crews',sites(s[C1+'|'+DAYS[6]])===sites(s[C1+'|'+DAYS[5]])&&sites(s[C2+'|'+DAYS[6]])===sites(s[C2+'|'+DAYS[5]]));}
  // 7 phone storage
  try{let used=0;for(let i=0;i<localStorage.length;i++){const kk=localStorage.key(i);used+=kk.length+(localStorage.getItem(kk)||'').length;}const est=navigator.storage&&navigator.storage.estimate?await navigator.storage.estimate():{};
    rec('Phone storage used by both copies of the app',null,Math.round(used/1024)+' K characters'+(est.quota?' · browser quota '+Math.round(est.quota/1048576)+' MB':''));}catch(e){}
  // 8 reload in the middle of a save (continues after the reload)
  const rk=C2+'|'+DAYS[4];made.add(rk);SS.set('made',[...made]);SS.set('phase','afterReload');SS.set('rk',rk);
  editSlot(C2,DAYS[4]);await wait(250);tap(byText(document.getElementById('slotBody'),'button','Add a job'));await wait(100);pick('#slotAddSite',S2);tap(byText(document.getElementById('slotBody'),'button','Full day'));await wait(100);
  tap(document.querySelector("#slotBody button.btn[onclick='saveSlot()']"));await wait(60);location.reload();}
async function afterReload(){(SS.get('made')||[]).forEach(x=>made.add(x));const rk=SS.get('rk');
  const ok=await until(async()=>{const s=await server([rk]);return !!s[rk];},30000);
  rec('App reloaded in the middle of a save → still reached the server',ok);
  const q=await ask('Optional: offline test. Turn ON Airplane Mode, then tap Continue.',['Continue','Skip offline test']);
  if(q==='Continue'){const ok2=C1+'|'+DAYS[4];made.add(ok2);SS.set('made',[...made]);
    editSlot(C1,DAYS[4]);await wait(250);tap(byText(document.getElementById('slotBody'),'button','Add a job'));await wait(100);pick('#slotAddSite',S3);tap(byText(document.getElementById('slotBody'),'button','Full day'));await wait(100);
    window._stToasts=[];const ot=toast;toast=function(m,c){window._stToasts.push(String(m));return ot.apply(this,arguments);};
    tap(document.querySelector("#slotBody button.btn[onclick='saveSlot()']"));await wait(2500);
    rec('Offline: says "saved on this phone", not "Saved"',window._stToasts.some(x=>/on this phone/.test(x))&&!window._stToasts.some(x=>/^✓/.test(x)),window._stToasts.join(' | '));
    await ask('Now turn OFF Airplane Mode (wait for signal), then tap Continue.',['Continue']);window.dispatchEvent(new Event('online'));
    const ok3=await until(async()=>{const s=await server([ok2]);return !!s[ok2];},60000);rec('Back online → the offline booking reached the server',ok3);}
  await finish();}
async function finish(){
  // clean up everything this test created
  const ids=[...made];const keys=ids.filter(x=>D.sched[x]);if(keys.length){keys.forEach(x=>delete D.sched[x]);save();await EX_saveNow({keys:keys.map(x=>['sched',x])});}
  const left=await server(ids);rec('Cleanup: all test bookings removed',!Object.keys(left).length,Object.keys(left).join(','));
  const pass=R.filter(r=>r.ok===true).length,fail=R.filter(r=>r.ok===false).length;
  rec('RESULT',fail===0,pass+' passed, '+fail+' failed');
  try{const id='st_'+Date.now().toString(36);if(!D.selftest)D.selftest=[];const rep={id,by:(me()||{}).id,ua:navigator.userAgent,standalone:!!(navigator.standalone||matchMedia('(display-mode: standalone)').matches),screen:screen.width+'x'+screen.height,at:Date.now(),version:window.EX_VER,results:R};if(Array.isArray(D.selftest))D.selftest.push(rep);else D.selftest[id]=rep;save();
    const r=await EX_saveNow({keys:[['selftest',id]]});rec('Report saved to the staging database',r.ok,id);}catch(e){rec('Report saved',false,e.message);}
  SS.set('phase','done');btns([{label:'Run again',fn:()=>{['results','phase','made','rk'].forEach(k=>sessionStorage.removeItem('st_'+k));location.reload();}}]);}
async function main(){await until(()=>window.EX_ready&&EX_ready()&&typeof me==='function'&&me()&&document.getElementById('m-login').classList.contains('hid'),600000);ui();await setup();
  if(!schedCanEdit()){rec('Sign in as the owner or a manager to run this test',false);return;}
  const ph=SS.get('phase');
  try{if(ph==='afterReload')return await afterReload();if(ph==='done')return btns([{label:'Run again',fn:()=>{['results','phase','made','rk'].forEach(k=>sessionStorage.removeItem('st_'+k));location.reload();}}]);
    rec('Device',null,navigator.userAgent.replace(/^Mozilla\/5.0 /,'').slice(0,120));
    await ask('Ready. Keep the app open for about 2 minutes.',['Start']);await steps();}
  catch(e){rec('Test stopped: '+(e&&e.message),false);try{await finish();}catch(x){}}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',main);else main();
})();
