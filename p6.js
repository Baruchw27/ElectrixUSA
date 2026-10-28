/* Electrix USA — P6 O&R tracker v4 "steps" (Baruch 2026-10-27).
   Every O&R request follows the real O&R checklist for its type, one step at a time:
     Temp service:  application → O&R invoice → customer pays → temp set up → inspection → O&R hook-up
     New service / upgrade: application → incomplete letter + list → site meeting → updated site plan → O&R design
                    → customer pays → meter + unit # pictures → O&R schedules electric → (gas pictures → gas certificate) → hook-up
   Each step is "our move", "the customer's" or "O&R's". The person handling it sets the follow-up date themselves
   (each step fills in a normal one). The server (private.orr_tick, every 15 min) makes the tasks:
     our step → a task right away · invoice step → "forward the invoice to the customer" right away
     O&R / customer step → a "Follow up" task on the follow-up date.
   Record in D.orr: { id, site|addr, type, wo, pm, owner, flow:1, step, stepAt, gas, fuOn, did{step:ms}, need, usAt,
     status (us·sent·done·cancel — kept in step with the step for older screens), sent, ts, upd, log[{ts,by,txt}], by, closedAt }
   Off: window.EX_P6_OFF. */
(function(){
if(window.EX_P6_OFF)return;
const $=id=>document.getElementById(id);
const M=()=>{try{return me();}catch(e){return null;}};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsq=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const tt=s=>{try{return t(s);}catch(e){return s;}};
const TYPES=[['temp','Temp service'],['newsvc','New service'],['upgrade','Service upgrade'],['tempout','Temp removal'],['meter','Meter set / cut-in'],
 ['gas','Gas service'],['disc','Disconnect / reconnect'],['demo','Demolition removal'],['reloc','Pole / service relocation'],['other','Other']];
const TYPE=k=>{const x=TYPES.find(y=>y[0]===k);return x?x[1]:k||'—';};
// [key, label, whose move (us · oru · cust), normal wait in days before a follow-up, only-if]
const SVC=[['app','Send the application','us',0],['inc','O&R sends the incomplete letter + list','oru',3],['meet','Site meeting with O&R','oru',7],
  ['plan','Send the updated site plan','us',0],['design','O&R design (30–60 days)','oru',30],['pay','Customer pays the O&R invoice','cust',3],
  ['pics','Send pictures of the meters + unit numbers','us',0],['sched','O&R schedules the electric','oru',5],
  ['hook','O&R hooks it up','oru',5],['done','Hooked up','',0]];
// Baruch 10/28 17:56: gas is its own line — electric can be done while gas still goes on
const GAS=[['gaspics','Send the gas pictures','us',0],['gascert','Send the gas certificate','us',0],['gassched','O&R schedules the gas','oru',5],
  ['gason','O&R turns on the gas','oru',5],['done','Gas is on','',0]];
const FLOWS={
  temp:[['app','Send the application','us',0],['inv','O&R sends the invoice','oru',3],['pay','Customer pays the O&R invoice','cust',3],
    ['setup','Set up the temp service on site','us',0],['insp','Schedule the inspection','us',0],['hook','O&R hooks it up','oru',5],['done','Hooked up','',0]],
  newsvc:SVC, upgrade:SVC, gas:GAS,
  _:[['app','Send the request to O&R','us',0],['wait','O&R does it','oru',5],['done','Done','',0]]};
const ORDER=['app','inc','inv','meet','plan','design','pay','setup','insp','pics','sched','gaspics','gascert','gassched','gason','wait','hook'];
const WHO={us:['Our move','#e8912d'],cust:['Customer','#9b51e0'],oru:['O&R','#2f80ed'],done:['Done','#2fb36b']};
const ST={us:['Our move','#e8912d'],sent:['Waiting on O&R','#2f80ed'],sched:['Scheduled','#9b51e0'],done:['Done','#2fb36b'],cancel:['Cancelled','#8e8e93']};
const OPEN=x=>x&&!x.deleted&&x.status!=='done'&&x.status!=='cancel';
const staff=m=>!!m&&(m.role==='owner'||m.role==='manager'||!!m.all||(m.role==='office'&&m.title!=='Accountant'));
const dk=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
const today=()=>dk(new Date());
const fd=(s,o)=>s?new Date(s+'T12:00').toLocaleDateString(LOC(),o||{month:'short',day:'numeric'}):'—';
function workDays(fromMs,toMs){const a=new Date(fromMs);a.setHours(12,0,0,0);const b=new Date(toMs);b.setHours(12,0,0,0);let n=0;
  for(let d=new Date(a);d<b;){d.setDate(d.getDate()+1);const w=d.getDay();if(w>0&&w<6)n++;if(n>2000)break;}return n;}
function addDays(n){const d=new Date();d.setHours(12,0,0,0);if(n>=10){d.setDate(d.getDate()+n);}else{let k=0;while(k<n){d.setDate(d.getDate()+1);const w=d.getDay();if(w>0&&w<6)k++;}}
  while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()+1);return dk(d);}
const daysSince=ms=>ms?Math.max(0,Math.floor((Date.now()-ms)/86400000)):0;
const people=()=>(D.emps||[]).filter(e=>!e.inactive&&staff(e)&&e.role!=='manager');
const pname=id=>{try{return (nameOf(id)||'').split(' ')[0]||'—';}catch(e){return '—';}};
const sname=x=>String(x.site?siteName(x.site):(x.addr||'—')).split(',')[0];
function steps(x){return (FLOWS[x.type]||FLOWS._).filter(s=>!s[4]||x[s[4]]);}
function cur(x){const L=steps(x);return L.find(s=>s[0]===x.step)||(x.status==='done'?L[L.length-1]:/^gas/.test(x.step||'')?(L.find(s=>s[0]==='hook')||L[0]):L[0]);}
function idx(x){const L=steps(x);return Math.max(0,L.findIndex(s=>s[0]===cur(x)[0]));}
function who(x){if(!OPEN(x))return 'done';if(x.need)return 'us';return cur(x)[2]||'oru';}
const fuDue=x=>OPEN(x)&&who(x)!=='us'&&!!x.fuOn&&x.fuOn<=today();
// what we must do now (null = it's on O&R / the customer and the follow-up date isn't here yet)
function todo(x){if(!OPEN(x))return null;const c=cur(x);
  if(x.need)return {t:x.need,b:'Sent',f:'delivered',us:1};
  if(c[2]==='us')return {t:c[1],b:'Done',f:'next',us:1};
  if(fuDue(x))return {t:(c[2]==='cust'?'Check if the customer paid the O&R invoice':'Follow up'+(x.pm?' with '+x.pm:' with O&R')+': '+c[1]),b:'Followed up',f:'follow',late:x.fuOn<today()};
  return null;}
function nowLine(x){if(!OPEN(x))return x.status==='cancel'?'Cancelled':'Done'+(x.closedAt?' '+new Date(x.closedAt).toLocaleDateString(LOC(),{month:'short',day:'numeric'}):'');
  const c=cur(x),L=steps(x),d=daysSince(x.stepAt||x.upd||x.ts);
  return 'Step '+(idx(x)+1)+'/'+(L.length-1)+' · '+c[1]+(d?' · '+d+' day'+(d===1?'':'s'):'');}
const P6=window.ORR={TYPES,ST,FLOWS,steps,cur,who,todo,workDays,needsFollow:x=>!!todo(x)&&!x.need&&cur(x)[2]!=='us',idle:x=>workDays(x.stepAt||x.upd||x.ts||Date.now(),Date.now())};
D.orr=D.orr||[];

/* ───────── look ───────── */
const css=`
#pg-orr .orrhd{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px}
#pg-orr .orrhd h2{margin:0}
.orrseg{display:flex;background:var(--g1);border-radius:10px;padding:3px;margin-bottom:8px}
.orrseg button{flex:1;border:none;background:none;border-radius:8px;padding:6px;font:600 12.5px/1.2 inherit;font-family:inherit;color:var(--g4);cursor:pointer}
.orrseg button.on{background:#fff;color:var(--g5);box-shadow:0 1px 2px rgba(0,0,0,.08)}
html[data-theme=dark] .orrseg button.on{background:#2c2c2e}
#pg-orr input[type=search]{margin-bottom:4px}
.orrsum{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0 4px}
.orrsum button{border:none;border-radius:12px;padding:8px 6px;background:var(--g1);cursor:pointer;font-family:inherit;color:var(--g5);text-align:center}
.orrsum button b{display:block;font-size:19px;line-height:1.1}.orrsum button span{font-size:11.5px;color:var(--g4)}
.orrsum button.on{box-shadow:inset 0 0 0 2px currentColor}
.orrsec{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--g4);margin:14px 2px 6px;display:flex;justify-content:space-between}
.orrsec i{font-style:normal;background:var(--g1);border-radius:999px;padding:0 7px}
.orrrow{display:flex;align-items:center;gap:10px;background:#fff;border-radius:12px;padding:9px 12px;margin-bottom:6px;cursor:pointer;box-shadow:0 0 0 .5px rgba(0,0,0,.07);border-left:4px solid #ccc}
html[data-theme=dark] .orrrow{background:#1c1c1e;box-shadow:none}
.orrrow .w{flex:1;min-width:0}
.orrtrk{display:flex;align-items:baseline;gap:7px;font-size:12.5px;margin-top:3px;min-width:0}
.orrtrk i{font-style:normal;flex:none;width:58px;font-weight:700;font-size:10.5px;letter-spacing:.4px;color:var(--g4);text-transform:uppercase}
.orrtrk span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.orrtrk em{font-style:normal;color:var(--g4);font-size:11.5px;flex:none}
.orrtk{font-size:12px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--g4);margin:10px 0 4px}
.orrgas{border-top:1px solid var(--g2);margin-top:12px;padding-top:2px}
.orrlink{display:flex;align-items:center;gap:8px;background:var(--g1);border-radius:10px;padding:8px 11px;margin:0 0 8px;cursor:pointer;font-size:13px}
.orrlink b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
html[data-theme=dark] .orrlink{background:#2c2c2e}
.orrpm{margin:14px 0 6px}
.orrpml{color:var(--blue-mid,#2f80ed);text-decoration:none}
.pmcard{text-align:center;padding-top:4px}.pmcard h3{margin:8px 0 2px;font-size:20px}.pmsub{font-size:13px;color:var(--g4);margin-bottom:14px}
.pmav{width:64px;height:64px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;background:#e8f0fb;color:#2f6fd0;font-weight:700;font-size:22px}
.pmav.sm{width:38px;height:38px;font-size:14px;margin:0;flex:none}
.pmacts{display:flex;gap:10px;justify-content:center;margin-bottom:14px}
.pmact{flex:1;max-width:96px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px;border-radius:12px;background:var(--g1,#f2f2f7);color:#2f6fd0;text-decoration:none;font-size:12px;font-weight:600}
.pmact.on{background:#1f7a46;color:#fff}
.pmrows{text-align:left;border-radius:12px;background:var(--g1,#f2f2f7);overflow:hidden}
.pmrows a{display:block;padding:10px 14px;text-decoration:none;color:inherit;border-top:1px solid rgba(0,0,0,.06)}.pmrows a:first-child{border-top:0}
.pmrows span{display:block;font-size:12px;color:var(--g4)}.pmrows b{color:#2f6fd0;font-weight:500;word-break:break-all}
.pmarea{font-size:12px;font-weight:600;color:var(--g4);text-transform:uppercase;letter-spacing:.04em;margin:14px 0 6px}
.pmlist{border-radius:12px;background:var(--g1,#f2f2f7);overflow:hidden}
.pmli{display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid rgba(0,0,0,.06);cursor:pointer}.pmli:first-child{border-top:0}
.pmtx{flex:1;min-width:0}.pmtx b{display:block;font-size:15px}.pmtx span{display:block;font-size:13px;color:var(--g4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pmline{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center;margin:2px 0 6px;font-size:14px}.pmline .pmfull{width:100%;color:var(--g4);font-size:13px}
.pmline a{display:inline-flex;align-items:center;gap:5px;color:#2f80ed;text-decoration:none}.pmline svg{width:15px;height:15px}
.pmtx .pmem{color:#2f80ed}
.pmcall.pmmail{background:#2f6fd0}
.pmcall{width:36px;height:36px;border-radius:50%;background:#1f7a46;color:#fff;display:flex;align-items:center;justify-content:center;flex:none}
.orrpm .ph{display:flex;align-items:center;gap:8px;margin-bottom:2px}
.orrpm .ph b{font-size:17px}
.orrpm .ph i{font-style:normal;font-size:13px;font-weight:600;color:var(--g4)}
.orrpm .ph button{margin-left:auto;border:none;background:var(--g1);color:var(--g5);border-radius:999px;padding:5px 11px;font:600 12px/1 inherit;font-family:inherit;cursor:pointer}
html[data-theme=dark] .orrpm .ph button{background:#2c2c2e;color:#fff}
.orrpm .sm{font-size:12.5px;font-weight:600;margin-bottom:7px}
.orrpr .s{white-space:normal}
.orrpr .kv{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px;font-size:11.5px;color:var(--g4)}
.orrpr .kv b{display:inline;font-size:11.5px;color:var(--g5);font-weight:600}
html[data-theme=dark] .orrpr .kv b{color:#fff}
.orrrow b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.orrrow b small{font-weight:500;color:var(--g4);font-size:12px}
.orrrow .s{font-size:12.5px;color:var(--g4);margin-top:1px}
.orrrow .us{color:#c76a00;font-weight:600}.orrrow .late{color:#d93a2b;font-weight:600}
.orrbar{height:3px;background:var(--g2);border-radius:2px;margin-top:6px;overflow:hidden}.orrbar i{display:block;height:100%;background:#2fb36b}
.orrrow .chev{color:var(--g4);font-size:18px}
.orrrow .fu{font-size:11.5px;color:var(--g4);white-space:nowrap;text-align:right}
.orrgo{flex:none;border:none;border-radius:999px;padding:7px 12px;font:600 12.5px/1 inherit;font-family:inherit;background:var(--blue-mid);color:#fff;cursor:pointer}
.orrgo.ous{background:#e8912d;color:#fff}
.orrmore{text-align:center;color:var(--blue-mid);font-size:13px;font-weight:600;padding:12px;cursor:pointer}
.orrempty{color:var(--g4);text-align:center;padding:18px 6px;font-size:13.5px}
.orrk{font-size:11.5px;color:var(--g4);text-transform:uppercase;letter-spacing:.5px}
.orrnow{border-radius:12px;padding:10px 12px;margin:8px 0;font-size:13.5px;background:var(--g1)}
.orrnow b{display:block;font-size:15px}
.orrneed{background:#e8912d1f;border-radius:12px;padding:10px 12px;margin:8px 0;font-size:13.5px}.orrneed b{color:#c76a00}
.orrform label{display:block;font-size:12px;font-weight:600;color:var(--g4);margin:10px 0 4px}
.orrform input,.orrform select,.orrform textarea{width:100%;font-size:16px}
.orrbtns{display:flex;gap:8px;margin-top:10px}.orrbtns .btn{flex:1}
.orrfu{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0}
.orrfu button{border:1.5px solid var(--g2);background:none;border-radius:999px;padding:6px 10px;font-size:12.5px;font-weight:600;color:var(--g5);cursor:pointer;font-family:inherit}
.orrfu button.on{background:var(--blue-mid);border-color:transparent;color:#fff}
.orrchk{margin:6px 0 0;padding:0;list-style:none}
.orrchk li{display:flex;gap:10px;align-items:flex-start;padding:6px 0;font-size:13.5px;color:var(--g4);cursor:pointer}
.orrchk li .c{flex:none;width:20px;height:20px;border-radius:50%;border:2px solid var(--g2);display:flex;align-items:center;justify-content:center;font-size:12px;margin-top:1px}
.orrchk li.ok{color:var(--g5)}.orrchk li.ok .c{background:#2fb36b;border-color:#2fb36b;color:#fff}
.orrchk li.now{color:var(--g5);font-weight:700}.orrchk li.now .c{border-color:var(--blue-mid);box-shadow:inset 0 0 0 4px var(--blue-mid)}
.orrchk li small{display:block;font-weight:400;font-size:11.5px;color:var(--g4)}
.orrchk li .wh{margin-left:auto;font-size:11px;font-weight:600;white-space:nowrap}
.orrdet{margin-top:12px;border-top:1px solid var(--g2);padding-top:8px}
.orrdet summary{cursor:pointer;color:var(--blue-mid);font-weight:600;font-size:13.5px;padding:4px 0}
.orrkv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px;margin:8px 0}.orrkv span{color:var(--g4)}
.orrlog{font-size:13px;border-top:1px solid var(--g2);padding:7px 0}.orrlog small{display:block;color:var(--g4);font-size:11.5px}
.orrtask{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:13px;background:var(--g1);border-radius:10px;padding:8px 10px;margin:6px 0;cursor:pointer}
.orrgrid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
#orrJob .orrrow{margin-bottom:6px}
#p6home{display:flex;align-items:center;gap:10px;cursor:pointer}
#p6home .n{background:#d93a2b;color:#fff;border-radius:999px;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12.5px;padding:0 7px}
.orrtaskbar{display:flex;align-items:center;gap:8px;background:#2f80ed14;border-radius:10px;padding:8px 10px;margin:8px 0;font-size:13px;cursor:pointer}
`;
const stEl=document.createElement('style');stEl.id='p6css';stEl.textContent=css;document.body.appendChild(stEl);

/* ───────── page + tab ───────── */
const BOLT='<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>';
function ensurePage(){
  if(!$('pg-orr')){const pg=document.createElement('div');pg.className='pg';pg.id='pg-orr';const tabs=document.querySelector('.tabs');(tabs&&tabs.parentNode||document.body).insertBefore(pg,tabs||null);}
  if(!document.querySelector('.tab[onclick*="\'orr\'"]')){const tabs=document.querySelector('.tabs');if(tabs){const b=document.createElement('button');b.className='tab';b.setAttribute('onclick',"tab('orr',this)");b.style.display='none';b.dataset.allowed='0';
    b.innerHTML='<svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linejoin="round">'+BOLT+'</svg><span data-i18n="O&R">O&amp;R</span>';const more=tabs.querySelector('.tab[onclick*="\'more\'"]');tabs.insertBefore(b,more||null);}}
  try{if(typeof TABMETA==='object')TABMETA.orr=['⚡','O&R'];}catch(e){}
  try{if(typeof PAGE_R==='object')PAGE_R.orr=()=>renderOrr();}catch(e){}
}
ensurePage();
if(typeof window.applyTabs==='function'){const _at=window.applyTabs;window.applyTabs=function(){ensurePage();const m=M();const b=document.querySelector('.tab[onclick*="\'orr\'"]');
  if(b&&m){b.dataset.allowed=staff(m)?'1':'0';b.style.display='none';}
  const r=_at.apply(this,arguments);
  if(b&&m){const prim=primaryFor(m);b.style.display=(staff(m)&&prim.includes('orr'))?'':'none';}
  return r;};}
try{if(typeof PRIMARY==='object')PRIMARY.office=['jobs','trello','orr','cal','more'];}catch(e){}
if(typeof window.tab==='function'){const _tab=window.tab;window.tab=function(n,el){const r=_tab.apply(this,arguments);if(n==='orr')renderOrr();return r;};}
try{applyTabs();}catch(e){}

/* ───────── overview ───────── */
let q='',view='list',whoF='',showDone=false;
function row(x){const g=gOf(x);if(g)return row2(x,g);const td=todo(x),w=who(x),col=WHO[w][1],L=steps(x);const pct=OPEN(x)?Math.round(idx(x)/(L.length-1)*100):100;
  const sub=td?'<span class="'+(td.us?'us':td.late?'late':'')+'">'+esc(td.t)+'</span>':esc(nowLine(x));
  const right=td?'<button class="orrgo'+(td.us?' ous':'')+'" onclick="event.stopPropagation();ORR.'+td.f+'(\''+jsq(x.id)+'\')">'+esc(td.b)+'</button>'
    :(OPEN(x)&&x.fuOn?'<span class="fu">follow up<br><b style="display:inline;font-size:12px;color:var(--g5)">'+fd(x.fuOn)+'</b></span>':'<span class="chev">›</span>');
  return '<div class="orrrow" style="border-left-color:'+col+'" onclick="ORR.open(\''+jsq(x.id)+'\')"><div class="w"><b>'+esc(sname(x))+' <small>'+esc(TYPE(x.type))+'</small></b><div class="s">'+sub+'</div>'
   +(td?'<div class="s" style="font-size:11.5px">'+esc(td.t===cur(x)[1]?nowLine(x).replace(' · '+cur(x)[1],''):nowLine(x))+'</div>':'')+(OPEN(x)?'<div class="orrbar"><i style="width:'+pct+'%"></i></div>':'')+'</div>'+right+'</div>';}
function row2(x,g){const a=jAct(x),td=todo(a),w=jWho(x),fu=jFu(x);
  const right=td?'<button class="orrgo'+(td.us?' ous':'')+'" onclick="event.stopPropagation();ORR.'+td.f+'(\''+jsq(a.id)+'\')">'+esc(td.b)+'<small style="display:block;font-size:10px;font-weight:600;opacity:.85">'+esc(tt(a===g?'Gas':'Electric'))+'</small></button>'
    :(jOPEN(x)&&fu?'<span class="fu">follow up<br><b style="display:inline;font-size:12px;color:var(--g5)">'+fd(fu)+'</b></span>':'<span class="chev">›</span>');
  return '<div class="orrrow" style="border-left-color:'+WHO[w][1]+'" onclick="ORR.open(\''+jsq(x.id)+'\')"><div class="w"><b>'+esc(sname(x))+' <small>'+esc(TYPE(x.type))+' + gas</small></b>'
   +trackLine(x,'Electric')+trackLine(g,'Gas')+'</div>'+right+'</div>';}
function list(){return (D.orr||[]).filter(x=>x&&!x.deleted);}
// Baruch 10/28 18:20 (option 1): a job with gas is ONE line with two tracks — Electric and Gas. The gas track is kept as its own
// record behind the scenes (own steps, follow-ups, server tasks) but is only ever shown inside its job's line and page.
const parentOf=x=>x&&x.type==='gas'&&x.gasFor?(D.orr||[]).find(y=>y.id===x.gasFor&&!y.deleted):null;
const isChild=x=>!!parentOf(x);
function jobs(){return list().filter(x=>!isChild(x));}
const gOf=x=>x&&x.type!=='gas'?(D.orr||[]).find(g=>g&&!g.deleted&&g.type==='gas'&&g.gasFor===x.id&&g.status!=='cancel'):null;
const jOPEN=x=>OPEN(x)||OPEN(gOf(x));
const jTodo=x=>todo(x)||(gOf(x)?todo(gOf(x)):null);
const jAct=x=>{const g=gOf(x);if(todo(x))return x;if(g&&todo(g))return g;if(OPEN(x))return x;if(g&&OPEN(g))return g;return x;};
const jWho=x=>{const g=gOf(x);const W=[OPEN(x)?who(x):null,g&&OPEN(g)?who(g):null].filter(Boolean);return W.includes('us')?'us':W.includes('cust')?'cust':W[0]||'done';};
const jFu=x=>[x,gOf(x)].filter(r=>r&&OPEN(r)&&r.fuOn).map(r=>r.fuOn).sort()[0]||'';
function trackLine(r,lbl){if(!r)return '';const td=todo(r);const w=who(r);
  const txt=!OPEN(r)?'✓ '+nowLine(r):td?td.t:cur(r)[1]+(r.fuOn?' · follow up '+fd(r.fuOn):'');
  const col=!OPEN(r)?'#2fb36b':WHO[w][1];
  return '<div class="orrtrk"><i>'+esc(tt(lbl))+'</i><span style="color:'+col+';font-weight:600">'+esc(txt)+'</span>'+(OPEN(r)?'<em>'+(idx(r)+1)+'/'+(steps(r).length-1)+'</em>':'')+'</div>';}
function pmRow(x){const c=cur(x),w=who(x),L=steps(x),i=idx(x),d=daysSince(x.stepAt||x.ts);
  const kv=[['Project #',x.wo||'—'],['Sent',x.sent?fd(x.sent):'—'],['Follow up',x.fuOn?fd(x.fuOn):'—']];
  return '<div class="orrrow orrpr" style="border-left-color:'+WHO[w][1]+'" onclick="ORR.open(\''+jsq(x.id)+'\')"><div class="w">'
   +'<b>'+esc(sname(x))+' <small>'+esc(TYPE(x.type))+'</small></b>'
   +'<div class="s"><span style="color:'+WHO[w][1]+';font-weight:600">'+esc(tt(WHO[w][0]==='O&R'?'Waiting on O&R':WHO[w][0]==='Customer'?'Customer pays':'Our move'))+'</span> · '+esc(tt('Step'))+' '+(i+1)+'/'+L.length+': '+esc(c[1])+' · '+d+' '+esc(tt(d===1?'day':'days'))+'</div>'
   +(x.need?'<div class="s" style="color:#c0392b">'+esc(tt('Needs'))+': '+esc(x.need)+'</div>':'')
   +(gOf(x)?trackLine(gOf(x),'Gas'):'')
   +'<div class="kv">'+kv.map(k=>'<span>'+esc(tt(k[0]))+' <b>'+esc(k[1])+'</b></span>').join('')+'</div></div><span class="chev">›</span></div>';}
P6.copyPm=k=>{const g=jobs().filter(x=>jOPEN(x)&&(x.pm||'').trim()===k).sort((a,b)=>(a.stepAt||a.ts||0)-(b.stepAt||b.ts||0));
  const txt=(k||'No O&R site manager')+' — '+g.length+' open\n\n'+g.map(x=>{const c=cur(x);const d=daysSince(x.stepAt||x.ts);
    const gg=gOf(x);return '• '+sname(x)+' ('+TYPE(x.type)+(gg?' + gas':'')+')'+(x.wo?' — project #'+x.wo:'')+'\n   '+(gg?'Electric: ':'')+(OPEN(x)?c[1]+' — '+d+(d===1?' day':' days'):'done')+(x.sent?' · sent '+fd(x.sent):'')+(gg?'\n   Gas: '+(OPEN(gg)?cur(gg)[1]:'done'):'');}).join('\n');
  const ok=()=>toast('📋 '+tt('Copied'),'green');
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(ok,()=>{});};
function renderOrr(){ensurePage();const pg=$('pg-orr');const m=M();if(!pg||!m)return;
  if(!staff(m)){pg.innerHTML='<div class="orrempty">'+esc(tt('Not on your screens'))+'</div>';return;}
  const L=jobs();const qq=q.trim().toLowerCase();
  const match=x=>!qq||(sname(x)+' '+(x.wo||'')+' '+(x.pm||'')+' '+TYPE(x.type)+(gOf(x)?' gas '+cur(gOf(x))[1]:'')+' '+pname(x.owner)+' '+cur(x)[1]).toLowerCase().includes(qq);
  const open=L.filter(x=>jOPEN(x)&&match(x));
  const cnt=k=>open.filter(x=>jWho(x)===k).length;
  const shown=whoF?open.filter(x=>jWho(x)===whoF):open;
  const keepQ=document.activeElement&&document.activeElement.id==='orrQ';
  const sec=(t,n,extra)=>'<div class="orrsec"><span>'+esc(tt(t))+' <i>'+n+'</i></span>'+(extra||'')+'</div>';
  let body='';
  if(view==='list'){
    const act=shown.filter(jTodo).sort((a,b)=>(!!jAct(b).need-!!jAct(a).need)||((cur(jAct(b))[2]==='us')-(cur(jAct(a))[2]==='us'))||String(jFu(a)).localeCompare(String(jFu(b))));
    const wait=shown.filter(x=>!jTodo(x)).sort((a,b)=>String(jFu(a)||'9').localeCompare(String(jFu(b)||'9')));
    body=sec('Needs action today',act.length)+(act.length?act.map(row).join(''):'<div class="orrempty">'+esc(tt('All caught up.'))+'</div>')
        +sec('Waiting',wait.length)+(wait.length?wait.map(row).join(''):'<div class="orrempty">'+esc(tt('Nothing waiting.'))+'</div>');
  }else if(view==='mgr'){
    body+='<button class="bs b" style="margin:4px 0 6px" onclick="ORR.pmBook()">'+esc(tt('O&R contacts'))+'</button>';   // Baruch 10/28 00:23: grouped by O&R's site manager (DeLalla, Rohrer…) — everything to go over on one call with him
    const G={};shown.forEach(x=>{const k=(x.pm||'').trim();(G[k]=G[k]||[]).push(x);});
    Object.keys(G).sort((a,b)=>(!a)-(!b)||G[b].length-G[a].length||a.localeCompare(b)).forEach(k=>{const g=G[k].sort((a,b)=>(a.stepAt||a.ts||0)-(b.stepAt||b.ts||0));
      const n=w=>g.filter(x=>jWho(x)===w).length;const parts=[[n('oru'),'on O&R','#2f80ed'],[n('us'),'on us','#e8912d'],[n('cust'),'on customer','#9b51e0']].filter(p=>p[0]);
      body+='<div class="orrpm"><div class="ph"><b>'+(k?pmLink(k):esc(tt('No O&R site manager')))+'</b><i>'+g.length+'</i><button onclick="ORR.copyPm(\''+jsq(k)+'\')">'+esc(tt('Copy list'))+'</button></div>'
        +(()=>{const c=pmFind(k);if(!c)return '';return '<div class="pmline">'+'<span class="pmfull">'+esc(c.name)+'</span>'+(c.phone?'<a href="tel:'+esc(tel(c.phone))+'">'+IC.call+esc(c.phone)+'</a>':'')+(c.email?'<a href="mailto:'+esc(c.email)+'">'+IC.mail+esc(c.email)+'</a>':'')+'</div>';})()
        +'<div class="sm">'+parts.map(p=>'<span style="color:'+p[2]+'">'+p[0]+' '+esc(tt(p[1]))+'</span>').join(' · ')+'</div>'
        +g.map(pmRow).join('')+'</div>';});
    if(!shown.length)body='<div class="orrempty">Nothing here.</div>';
  }else{
    const groups={};shown.forEach(x=>{const c=cur(jAct(x));(groups[c[0]]=groups[c[0]]||{l:c[1],L:[]}).L.push(x);});
    ORDER.filter(k=>groups[k]).forEach(k=>{const g=groups[k];body+=sec(g.l,g.L.length)+g.L.sort((a,b)=>(jAct(a).stepAt||0)-(jAct(b).stepAt||0)).map(row).join('');});
    if(!shown.length)body='<div class="orrempty">Nothing here.</div>';
  }
  const doneL=L.filter(x=>!jOPEN(x)&&match(x)).sort((a,b)=>(b.closedAt||b.upd||0)-(a.closedAt||a.upd||0)).slice(0,40);
  const sb=(k)=>'<button class="'+(whoF===k?'on':'')+'" style="color:'+WHO[k][1]+'" onclick="ORR.whoFilter(\''+k+'\')"><b>'+cnt(k)+'</b><span>'+esc(tt(WHO[k][0]==='O&R'?'O&R’s move':WHO[k][0]==='Customer'?'Customer pays':'Our move'))+'</span></button>';
  pg.innerHTML='<div class="orrhd"><h2>O&amp;R</h2><button class="btn" style="width:auto;padding:7px 12px;font-size:13px" onclick="ORR.add()">+ '+esc(tt('New'))+'</button></div>'
   +'<div class="orrseg"><button class="'+(view==='list'?'on':'')+'" onclick="ORR.view(\'list\')">'+esc(tt('To do'))+'</button><button class="'+(view==='step'?'on':'')+'" onclick="ORR.view(\'step\')">'+esc(tt('By step'))+'</button><button class="'+(view==='mgr'?'on':'')+'" onclick="ORR.view(\'mgr\')">'+esc(tt('By site manager'))+'</button></div>'
   +'<input type="search" id="orrQ" placeholder="Search address, project #, PM, step" value="'+esc(q)+'" oninput="ORR.search(this.value)">'
   +'<div class="orrsum">'+sb('us')+sb('cust')+sb('oru')+'</div>'
   +body
   +(doneL.length?'<div class="orrmore" onclick="ORR.toggleDone()">'+(showDone?'Hide done':'Show done ('+doneL.length+')')+'</div>'+(showDone?doneL.map(row).join(''):''):'');
  if(keepQ){const i=$('orrQ');i.focus();i.setSelectionRange(i.value.length,i.value.length);}}
P6.filter=()=>{q='';whoF='';renderOrr();};
P6.search=v=>{q=v;renderOrr();};
P6.view=v=>{view=v;renderOrr();};
P6.whoFilter=k=>{whoF=whoF===k?'':k;renderOrr();};
P6.toggleDone=()=>{showDone=!showDone;renderOrr();};
P6.mine=()=>{};
P6.render=renderOrr;

/* ───────── sheets ───────── */
function sheet(html){let o=$('p6ov');if(!o){o=document.createElement('div');o.id='p6ov';o.className='p2ov';o.onclick=e=>{if(e.target===o)close();};document.body.appendChild(o);}
  o.innerHTML='<div class="p2sheet orrform" role="dialog"><div class="hd"></div>'+html+'</div>';o.hidden=false;o.style.display='';}
function close(){const o=$('p6ov');if(o){o.hidden=true;o.style.display='none';o.innerHTML='';}}
P6.close=close;
// O&R contact book (Baruch 10/28): tap an O&R site manager's name → call, text or email them.
// k = what we type in the "O&R site manager" field (last name, or first name when that's all we have).
const PMB=[
 ['Rockland','Joe Pillmeier','845-238-6445','pillmeierj@oru.com','pillmeier'],['Rockland','Dave Fiol','646-483-2370','fiold@oru.com','fiol'],
 ['Rockland','Philip Florie','845-597-7122','floriep@oru.com','florie'],['Rockland','Joseph T DeLalla','646-208-2647','delallajo@oru.com','delalla'],
 ['Rockland','Christopher Rohrer','845-916-2981','rohrerc@oru.com','rohrer'],['Rockland','James French','917-567-7614','frenchj@oru.com','french'],
 ['Rockland','Paul','646-385-5008','','paul'],['Rockland','Bartges','','bartgesa@oru.com','bartges'],
 ['Orange','O&R Orange office','845-783-5503','','office'],['Orange','Cristina Peifer','646-887-5754','peiferc@oru.com','peifer'],
 ['Orange','Boris Sabovic','646-832-8058','sabovicb@oru.com','sabovic'],['Orange','Transformer guy','845-742-5396','','transformer'],
 ['Chester','Major Enjoiner','845-925-5162','','enjoiner'],['Chester','Gerard J Friedler','845-587-3897','friedlerg@oru.com','friedler'],
 ['NJ','David Micallef','201-236-6017','','micallef']
].map(a=>({area:a[0],name:a[1],phone:a[2],email:a[3],k:a[4]}));
const pmFind=n=>{const q=String(n||'').trim().toLowerCase();if(!q)return null;
  return PMB.find(c=>c.k===q)||PMB.find(c=>c.name.toLowerCase()===q)||PMB.find(c=>c.name.toLowerCase().split(' ').some(w=>w===q))||null;};
const tel=p=>String(p).replace(/[^\d+]/g,'');
const ini=n=>String(n).replace(/^O&R /,'').split(' ').filter(w=>/^[A-Za-z]/.test(w)&&w.length>1).map(w=>w[0]).slice(0,2).join('').toUpperCase();
const IC={call:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
 text:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
 mail:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>'};
const pmLink=n=>{const c=pmFind(n);return c?'<a href="#" class="orrpml" onclick="event.preventDefault();event.stopPropagation();ORR.pmCard(\''+jsq(n)+'\')">'+esc(n)+'</a>':esc(n);};
P6.pmLink=pmLink;P6.pmFind=pmFind;
const act=(href,ic,l,main)=>'<a class="pmact'+(main?' on':'')+'" href="'+esc(href)+'">'+ic+'<span>'+esc(tt(l))+'</span></a>';
P6.pmCard=n=>{const c=pmFind(n);if(!c)return;
  sheet('<div class="pmcard"><div class="pmav">'+esc(ini(c.name)||'O&R')+'</div><h3>'+esc(c.name)+'</h3><div class="pmsub">O&amp;R site manager · '+esc(c.area)+'</div>'
   +'<div class="pmacts">'+(c.phone?act('tel:'+tel(c.phone),IC.call,'Call',1)+act('sms:'+tel(c.phone),IC.text,'Text'):'')+(c.email?act('mailto:'+c.email,IC.mail,'Email'):'')+'</div>'
   +'<div class="pmrows">'+(c.phone?'<a href="tel:'+esc(tel(c.phone))+'"><span>'+esc(tt('Phone'))+'</span><b>'+esc(c.phone)+'</b></a>':'')
   +(c.email?'<a href="mailto:'+esc(c.email)+'"><span>'+esc(tt('Email'))+'</span><b>'+esc(c.email)+'</b></a>':'')+'</div></div>'
   +'<button class="btn sec2" style="margin-top:12px" onclick="ORR.close()">'+esc(tt('Close'))+'</button>');};
P6.pmBook=()=>{const areas=[...new Set(PMB.map(c=>c.area))];
  sheet('<h3 style="margin:0 0 4px">'+esc(tt('O&R contacts'))+'</h3>'+areas.map(a=>'<div class="pmarea">'+esc(a)+'</div><div class="pmlist">'
   +PMB.filter(c=>c.area===a).map(c=>'<div class="pmli" onclick="ORR.pmCard(\''+jsq(c.k)+'\')"><div class="pmav sm">'+esc(ini(c.name)||'O&R')+'</div><div class="pmtx"><b>'+esc(c.name)+'</b>'+(c.phone?'<span>'+esc(c.phone)+'</span>':'')+(c.email?'<span class="pmem">'+esc(c.email)+'</span>':'')+'</div>'
     +(c.email?'<a class="pmcall pmmail" href="mailto:'+esc(c.email)+'" onclick="event.stopPropagation()" aria-label="'+esc(tt('Email'))+'">'+IC.mail+'</a>':'')+(c.phone?'<a class="pmcall" href="tel:'+esc(tel(c.phone))+'" onclick="event.stopPropagation()" aria-label="'+esc(tt('Call'))+'">'+IC.call+'</a>':'')+'</div>').join('')+'</div>').join('')
   +'<button class="btn sec2" style="margin-top:14px" onclick="ORR.close()">'+esc(tt('Close'))+'</button>');};
function siteOpts(sel){return '<option value="">—</option>'+liveSites().slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(s=>'<option value="'+esc(s.id)+'"'+(s.id===sel?' selected':'')+'>'+esc(s.name)+'</option>').join('');}
function ownerOpts(sel){return people().map(e=>'<option value="'+esc(e.id)+'"'+(e.id===sel?' selected':'')+'>'+esc(e.name)+'</option>').join('');}
function pmList(){return [...new Set(list().map(x=>x.pm).filter(Boolean))].sort();}
const defOwner=m=>m.role==='office'?m.id:((people().find(e=>/^shia/i.test(e.name))||{}).id||m.id);
function stepOpts(type,gas,sel){return (FLOWS[type]||FLOWS._).filter(s=>!s[4]||gas).filter(s=>s[0]!=='done').map(s=>'<option value="'+s[0]+'"'+(s[0]===sel?' selected':'')+'>'+esc(s[1])+'</option>').join('');}
P6.add=(siteId,type)=>{const m=M();if(!staff(m))return;type=type||'temp';
  sheet('<h3 style="margin:0 0 4px">'+esc(tt('New O&R request'))+'</h3>'
   +'<label>Job</label><select id="orrSite">'+siteOpts(siteId||(typeof fdSite!=='undefined'&&$('m-folder')&&!$('m-folder').classList.contains('hid')?fdSite:''))+'</select>'
   +'<label>What for</label><select id="orrType" onchange="ORR._steps()">'+TYPES.map(([k,l])=>'<option value="'+k+'"'+(k===type?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>'
   +'<label id="orrGasL" style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--g5)"><input type="checkbox" id="orrGas" style="width:auto" onchange="ORR._steps()"> Gas too</label>'
   +'<label>Where is it now</label><select id="orrStep">'+stepOpts(type,false,'inc')+'</select>'
   +'<div class="orrgrid"><div><label>O&amp;R project #</label><input id="orrWo" autocomplete="off" placeholder="optional"></div><div><label>Date sent</label><input id="orrSent" type="date" value="'+today()+'"></div></div>'
   +'<div class="orrgrid"><div><label>O&amp;R site manager</label><input id="orrPm" list="orrPmL" autocomplete="off" placeholder="e.g. French"><datalist id="orrPmL">'+pmList().map(p=>'<option value="'+esc(p)+'">').join('')+'</datalist></div>'
   +'<div><label>Who handles it</label><select id="orrOwn">'+ownerOpts(defOwner(m))+'</select></div></div>'
   +'<label>Note <span style="font-weight:400">(optional)</span></label><textarea id="orrNote" rows="2"></textarea>'
   +'<div class="orrbtns"><button class="btn" onclick="ORR.saveNew()">Save</button><button class="btn sec2" onclick="ORR.close()">Cancel</button></div>');
  P6._steps();};
P6._steps=()=>{const ty=$('orrType').value,g=$('orrGas').checked;$('orrGasL').style.display=(ty==='newsvc'||ty==='upgrade')?'flex':'none';
  const L=(FLOWS[ty]||FLOWS._);const sel=$('orrStep').value;$('orrStep').innerHTML=stepOpts(ty,g,L.some(s=>s[0]===sel)?sel:L[1][0]);};
P6.saveNew=()=>{const m=M();const site=$('orrSite').value;if(!site){toast('Pick the job');return;}
  const note=$('orrNote').value.trim();const now=Date.now();const type=$('orrType').value;const gas=$('orrGas').checked&&(type==='newsvc'||type==='upgrade');
  const x={id:nid('or'),flow:1,site,type,gas,wo:$('orrWo').value.trim(),pm:$('orrPm').value.trim(),owner:$('orrOwn').value||m.id,sent:$('orrSent').value||today(),by:m.id,ts:now,upd:now,did:{},log:[]};
  const L=steps(x);const k=$('orrStep').value;const i=Math.max(0,L.findIndex(s=>s[0]===k));L.slice(0,i).forEach(s=>x.did[s[0]]=now);
  setStep(x,L[i],now);x.log.push({ts:now,by:m.id,txt:'New O&R request — now: '+L[i][1]+(note?' — '+note:'')});
  D.orr.unshift(x);if(gas)gasLine(x,now);closeAutoFor(site,type);save();close();toast('✓ Saved','green');renderOrr();refreshFolder();
  if(x.owner!==m.id)try{assignPush([x.owner],()=>'⚡ '+pname(m.id)+' gave you an O&R request: '+sname(x)+' — '+TYPE(x.type),'info',{tab:'orr'});}catch(e){}};
// the gas line that belongs to an electric request (made once; kept even if the electric is done)
const gasOf=x=>list().find(g=>g.type==='gas'&&g.gasFor===x.id&&g.status!=='cancel');
function gasLine(x,now){if(gasOf(x))return gasOf(x);const m=M();now=now||Date.now();
  const g={id:nid('or'),flow:1,site:x.site,addr:x.addr,type:'gas',gasFor:x.id,wo:x.wo||'',pm:x.pm||'',owner:x.owner||m.id,sent:x.sent||today(),by:m.id,ts:now,upd:now,did:{},log:[{ts:now,by:m.id,txt:'Gas line for the '+TYPE(x.type).toLowerCase()}]};
  setStep(g,GAS[0],now);D.orr.unshift(g);return g;}
function setStep(x,s,now){x.step=s[0];x.stepAt=now||Date.now();x.need='';
  if(s[0]==='done'){x.status='done';x.closedAt=x.stepAt;x.fuOn='';}
  else{x.status=s[2]==='us'?'us':'sent';x.fuOn=s[2]==='us'?'':addDays(s[3]||5);x.closedAt=null;}}
function openTasks(x){return (D.jobs||[]).filter(j=>j.orr===x.id&&j.status!=='done'&&!j.deleted);}
const FU=[['Tomorrow',1],['3 days',3],['1 week',5],['2 weeks',14],['30 days',30]];
function fuChips(x){const I=jsq(x.id);return '<div class="orrfu">'+FU.map(([l,n])=>{const d=addDays(n);return '<button class="'+(x.fuOn===d?'on':'')+'" onclick="ORR.setFu(\''+I+'\',\''+d+'\')">'+esc(l)+'</button>';}).join('')
  +'<button onclick="ORR.pickFu(\''+I+'\')">'+(x.fuOn&&!FU.some(([l,n])=>addDays(n)===x.fuOn)?fd(x.fuOn):'Pick a date')+'</button></div>';}
P6.open=id=>{let x=list().find(y=>y.id===id);if(!x)return;if(isChild(x))x=parentOf(x);const site=x.site?siteName(x.site):(x.addr||'—');const tasks=openTasks(x);const c=cur(x),w=who(x),L=steps(x),I=jsq(x.id);
  const nx=L[Math.min(idx(x)+1,L.length-1)];
  const gl=gOf(x),el=null;
  const link=(o,lbl)=>'<div class="orrlink" onclick="ORR.open(\''+jsq(o.id)+'\')"><span>'+esc(lbl)+'</span><b>'+esc(OPEN(o)?cur(o)[1]:nowLine(o))+'</b><span class="chev">›</span></div>';
  sheet('<div class="orrk">O&amp;R · '+esc(TYPE(x.type))+(gl?' + gas':'')+'</div>'
   +'<h3 style="margin:2px 0 6px;font-size:17px">'+esc(site)+'</h3>'

   +(OPEN(x)?'<div class="orrnow" style="background:'+WHO[w][1]+'1f"><span style="font-size:11.5px;font-weight:700;color:'+WHO[w][1]+'">NOW · '+esc(w==='oru'?'O&R’S MOVE':w==='cust'?'CUSTOMER':'OUR MOVE')+'</span><b>'+esc(c[1])+'</b>'
       +'<span style="color:var(--g4);font-size:12.5px">Step '+(idx(x)+1)+' of '+(L.length-1)+' · since '+new Date(x.stepAt||x.ts).toLocaleDateString(LOC(),{month:'short',day:'numeric'})+' · handled by '+esc(pname(x.owner))+'</span></div>'
     :(gl?'<div class="orrnow" style="background:#2fb36b1f"><span style="font-size:11.5px;font-weight:700;color:#2fb36b">ELECTRIC · DONE</span><b>'+esc(nowLine(x))+'</b></div>':'<div class="orrnow"><b>'+esc(nowLine(x))+'</b></div>'))
   +(x.need?'<div class="orrneed"><b>O&amp;R needs from us:</b> '+esc(x.need)+'<div class="orrbtns"><button class="btn" style="background:#e8912d" onclick="ORR.delivered(\''+I+'\')">Sent to O&amp;R</button></div></div>':'')
   +(OPEN(x)?'<div class="orrbtns"><button class="btn" onclick="ORR.next(\''+I+'\')">✓ Done'+(nx[0]!=='done'?' → '+esc(nx[1]):'')+'</button></div>'
     +(w!=='us'?'<label>Follow up on'+(x.fuOn?' · '+fd(x.fuOn,{weekday:'short',month:'short',day:'numeric'}):'')+'</label>'+fuChips(x):'')
     +'<div class="orrbtns">'+(w!=='us'?'<button class="btn sec2" onclick="ORR.follow(\''+I+'\')">Followed up</button>':'')+'<button class="btn sec2" onclick="ORR.note(\''+I+'\')">Note</button><button class="btn sec2" onclick="ORR.needs(\''+I+'\')">O&amp;R needs…</button></div>':'')
   +(tasks.length?'<label>Open tasks</label>'+tasks.map(j=>'<div class="orrtask" onclick="ORR.close();openJobDetail(\''+jsq(j.id)+'\')"><span>'+esc(j.desc)+'</span><span style="color:var(--g4);white-space:nowrap">'+esc(pname((j.to||[])[0]))+' ›</span></div>').join(''):'')
   +(gl?gasBox(gl):'')
   +(gl&&!OPEN(x)?'<details class="orrdet"><summary>'+esc(tt('Electric steps'))+'</summary>':'')+'<label>'+(gl?esc(tt('Electric steps')):'Steps')+'</label><ul class="orrchk">'+L.filter(s=>s[0]!=='done').map((s,i)=>{const ok=!OPEN(x)||i<idx(x);const now=OPEN(x)&&i===idx(x);const dd=(x.did||{})[s[0]];
      return '<li class="'+(ok?'ok':now?'now':'')+'" onclick="ORR.jump(\''+I+'\',\''+s[0]+'\')"><span class="c">'+(ok?'✓':'')+'</span><span>'+esc(s[1])+(ok&&dd?'<small>'+new Date(dd).toLocaleDateString(LOC(),{month:'short',day:'numeric'})+'</small>':'')+'</span><span class="wh" style="color:'+WHO[s[2]||'oru'][1]+'">'+esc(s[2]==='us'?'us':s[2]==='cust'?'customer':'O&R')+'</span></li>';}).join('')+'</ul>'+(gl&&!OPEN(x)?'</details>':'')
   +'<details class="orrdet"><summary>Details</summary>'
     +'<div class="orrkv"><span>O&amp;R project #</span><b>'+esc(x.wo||'—')+'</b><span>O&amp;R site manager</span><b>'+(x.pm?pmLink(x.pm):'—')+'</b><span>Handled by</span><b>'+esc(pname(x.owner))+'</b><span>Sent</span><b>'+fd(x.sent)+'</b>'
     +((x.type==='newsvc'||x.type==='upgrade')?'<span>Gas</span><b>'+(gl?'Yes':'No · <u style="cursor:pointer;font-weight:500" onclick="ORR.gas(\''+I+'\')">add gas</u>')+'</b>':'')+'</div>'
     +'<div class="orrbtns"><button class="btn sec2" onclick="ORR.edit(\''+I+'\')">Edit</button><button class="btn sec2" onclick="ORR.task(\''+I+'\')">+ Task</button>'+(x.site?'<button class="btn sec2" onclick="ORR.close();openFolder(\''+jsq(x.site)+'\')">Job</button>':'')+'</div>'
     +(OPEN(x)?'<div class="orrbtns"><button class="btn sec2" style="color:#d93a2b" onclick="ORR.cancel(\''+I+'\')">Cancel this request</button></div>':'')
     +'<label>History</label>'+((x.log||[]).slice().reverse().map(l=>'<div class="orrlog">'+esc(l.txt)+'<small>'+esc(pname(l.by))+' · '+new Date(l.ts).toLocaleString(LOC(),{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'</small></div>').join('')||'<div class="orrlog">—</div>')
   +'</details>');};
function gasBox(g){const I=jsq(g.id),c=cur(g),w=who(g),L=steps(g);const nx=L[Math.min(idx(g)+1,L.length-1)];
  return '<div class="orrgas">'
   +(OPEN(g)?'<div class="orrnow" style="background:'+WHO[w][1]+'1f"><span style="font-size:11.5px;font-weight:700;color:'+WHO[w][1]+'">GAS · '+esc(w==='oru'?'O&R’S MOVE':w==='cust'?'CUSTOMER':'OUR MOVE')+'</span><b>'+esc(c[1])+'</b>'
       +'<span style="color:var(--g4);font-size:12.5px">Step '+(idx(g)+1)+' of '+(L.length-1)+' · since '+new Date(g.stepAt||g.ts).toLocaleDateString(LOC(),{month:'short',day:'numeric'})+'</span></div>'
     :'<div class="orrnow" style="background:#2fb36b1f"><span style="font-size:11.5px;font-weight:700;color:#2fb36b">GAS · DONE</span><b>'+esc(nowLine(g))+'</b></div>')
   +(g.need?'<div class="orrneed"><b>O&amp;R needs from us (gas):</b> '+esc(g.need)+'<div class="orrbtns"><button class="btn" style="background:#e8912d" onclick="ORR.delivered(\''+I+'\')">Sent to O&amp;R</button></div></div>':'')
   +(OPEN(g)?'<div class="orrbtns"><button class="btn" onclick="ORR.next(\''+I+'\')">✓ Done'+(nx[0]!=='done'?' → '+esc(nx[1]):' — gas is on')+'</button></div>'
     +(w!=='us'?'<label>Gas follow up on'+(g.fuOn?' · '+fd(g.fuOn,{weekday:'short',month:'short',day:'numeric'}):'')+'</label>'+fuChips(g):'')
     +'<div class="orrbtns">'+(w!=='us'?'<button class="btn sec2" onclick="ORR.follow(\''+I+'\')">Followed up</button>':'')+'<button class="btn sec2" onclick="ORR.needs(\''+I+'\')">O&amp;R needs…</button></div>':'')
   +'<label>'+esc(tt('Gas steps'))+'</label><ul class="orrchk">'+L.filter(s=>s[0]!=='done').map((s,i)=>{const ok=!OPEN(g)||i<idx(g);const now=OPEN(g)&&i===idx(g);const dd=(g.did||{})[s[0]];
      return '<li class="'+(ok?'ok':now?'now':'')+'" onclick="ORR.jump(\''+I+'\',\''+s[0]+'\')"><span class="c">'+(ok?'✓':'')+'</span><span>'+esc(s[1])+(ok&&dd?'<small>'+new Date(dd).toLocaleDateString(LOC(),{month:'short',day:'numeric'})+'</small>':'')+'</span><span class="wh" style="color:'+WHO[s[2]||'oru'][1]+'">'+esc(s[2]==='us'?'us':s[2]==='cust'?'customer':'O&R')+'</span></li>';}).join('')+'</ul></div>';}
function bump(x,txt,extra,reopen){const m=M();const now=Date.now();Object.assign(x,extra||{});x.upd=now;x.log=(x.log||[]).concat([{ts:now,by:m.id,txt}]);save();renderOrr();refreshFolder();if(reopen!==false)P6.open(x.id);}
function closeTasks(x,kinds){const m=M();(D.jobs||[]).forEach(j=>{if(j.orr===x.id&&j.status!=='done'&&(!kinds||kinds.includes(j.orrAuto))){j.status='done';j.doneAt=Date.now();j.doneBy=m.id;}});}
function closeAutoFor(site,type){const m=M();(D.jobs||[]).forEach(j=>{if(j.site===site&&j.status!=='done'&&(j.orrAuto==='apply'||(j.orrAuto==='meter'&&type==='meter')||(j.orrAuto==='tempout'&&type==='tempout'))){j.status='done';j.doneAt=Date.now();j.doneBy=m.id;}});}
const get=id=>list().find(y=>y.id===id);
// ✓ current step done → next step (with a normal follow-up date)
P6.next=(id,reopen)=>{const x=get(id);if(!x||!OPEN(x))return;const L=steps(x),i=idx(x),c=L[i],n=L[Math.min(i+1,L.length-1)];const now=Date.now();
  x.did=Object.assign({},x.did,{[c[0]]:now});closeTasks(x);setStep(x,n,now);
  bump(x,'✓ '+c[1]+(n[0]==='done'?' — all done':' → now: '+n[1]),null,reopen);
  if(n[0]!=='done')toast('Next: '+n[1]+(x.fuOn?' · follow up '+fd(x.fuOn):''),'green');};
// tap a step in the checklist to correct where it is
P6.jump=(id,k)=>{const x=get(id);if(!x)return;const L=steps(x),i=L.findIndex(s=>s[0]===k);if(i<0||(OPEN(x)&&i===idx(x)))return;
  askConfirm('Move it to "'+L[i][1]+'"?',()=>{const now=Date.now();x.did=Object.assign({},x.did);L.slice(0,i).forEach(s=>{if(!x.did[s[0]])x.did[s[0]]=now;});L.slice(i).forEach(s=>delete x.did[s[0]]);
    closeTasks(x);setStep(x,L[i],now);bump(x,'Moved to: '+L[i][1]);},'Move');};
P6.setFu=(id,d)=>{const x=get(id);if(!x)return;closeTasks(x,['follow']);bump(x,'Follow up on '+fd(d,{weekday:'short',month:'short',day:'numeric'}),{fuOn:d});};
P6.pickFu=id=>{const x=get(id);if(!x)return;askPrompt('Follow up on',[{label:'Date',value:x.fuOn||addDays(3),type:'date'}],([d])=>{if(d)P6.setFu(id,d);});};
// followed up: what O&R said + when to follow up next
P6.follow=id=>{const x=get(id);if(!x)return;const I=jsq(x.id);const c=cur(x);
  sheet('<div class="orrk">Followed up · '+esc(sname(x))+'</div><h3 style="margin:2px 0 6px;font-size:17px">'+esc(c[1])+'</h3>'
   +'<textarea id="orrUN" rows="2" placeholder="What did '+(c[2]==='cust'?'the customer':'O&amp;R')+' say? (optional)"></textarea>'
   +'<label>Next follow-up</label><div class="orrfu">'+FU.map(([l,n],i)=>'<button class="'+(i===1?'on':'')+'" data-d="'+addDays(n)+'" onclick="this.parentNode.querySelectorAll(\'button\').forEach(b=>b.classList.remove(\'on\'));this.classList.add(\'on\')">'+esc(l)+'</button>').join('')+'</div>'
   +'<div class="orrbtns"><button class="btn" onclick="ORR._followed(\''+I+'\')">Save</button><button class="btn sec2" onclick="ORR.next(\''+I+'\')">It moved on ✓</button></div>'
   +'<div class="orrbtns"><button class="btn sec2" onclick="ORR.open(\''+I+'\')">Back</button></div>');};
P6._followed=id=>{const x=get(id);if(!x)return;const n=(($('orrUN')||{}).value||'').trim();const b=document.querySelector('#p6ov .orrfu button.on');const d=b?b.dataset.d:addDays(3);
  closeTasks(x,['follow']);close();bump(x,'Followed up'+(n?': '+n:'')+' · next follow-up '+fd(d),{fuOn:d},false);toast('✓ Next follow-up '+fd(d),'green');};
P6.update=P6.follow;
P6.note=id=>{const x=get(id);if(!x)return;askPrompt('Add note',[{label:'Note',value:''}],([v])=>{if(!String(v||'').trim())return;bump(x,String(v).trim());});};
P6.needs=id=>{const x=get(id);if(!x)return;askPrompt('O&R needs from us',[{label:'What does O&R need?',value:x.need||''},{label:'Who handles it',options:[{v:x.owner||'',l:pname(x.owner)}].concat(people().filter(e=>e.id!==x.owner).map(e=>({v:e.id,l:e.name})))}],([v,o])=>{v=String(v||'').trim();if(!v)return;closeTasks(x,['follow']);
  if(o&&o!==x.owner){(D.jobs||[]).forEach(j=>{if(j.orr===x.id&&j.status!=='done')j.to=[o];});try{assignPush([o],()=>'⚡ '+pname(M().id)+' gave you an O&R request: '+sname(x),'info',{tab:'orr'});}catch(e){}}
  bump(x,'O&R needs from us: '+v+(o&&o!==x.owner?' · handed to '+pname(o):''),{need:v,usAt:Date.now(),status:'us',owner:o||x.owner});});};
P6.delivered=(id,reopen)=>{const x=get(id);if(!x)return;closeTasks(x,['us']);const c=cur(x);
  bump(x,'Sent to O&R what they needed'+(x.need?': '+x.need:''),{need:'',status:c[2]==='us'?'us':'sent',fuOn:c[2]==='us'?'':addDays(3)},reopen);};
P6.gas=id=>{const x=get(id);if(!x||gasOf(x))return;const g=gasLine(x);bump(x,'Gas added',{gas:true});toast('✓ Gas added','green');};
P6.cancel=id=>{const x=get(id);if(!x)return;askConfirm('Cancel this O&R request?',()=>{closeTasks(x);bump(x,'Cancelled',{status:'cancel',closedAt:Date.now(),fuOn:''});},'Cancel it');};
P6.edit=id=>{const x=get(id);if(!x)return;
  askPrompt('Edit',[{label:'O&R project #',value:x.wo||''},{label:'O&R site manager',value:x.pm||''},{label:'Who handles it',options:[{v:x.owner||'',l:pname(x.owner)}].concat(people().filter(e=>e.id!==x.owner).map(e=>({v:e.id,l:e.name})))},{label:'Date sent',value:x.sent||'',type:'date'}],
   ([wo,pm,own,se])=>{const ch=[];if((wo||'')!==(x.wo||''))ch.push('project # '+(wo||'—'));if((pm||'')!==(x.pm||''))ch.push('site manager '+(pm||'—'));if(own&&own!==x.owner)ch.push('handled by '+pname(own));if(se&&se!==x.sent)ch.push('sent '+se);if(!ch.length)return;
    if(own&&own!==x.owner){(D.jobs||[]).forEach(j=>{if(j.orr===x.id&&j.status!=='done')j.to=[own];});try{assignPush([own],()=>'⚡ '+pname(M().id)+' gave you an O&R request: '+sname(x),'info',{tab:'orr'});}catch(e){}}
    bump(x,'Changed: '+ch.join(', '),{wo:(wo||'').trim(),pm:(pm||'').trim(),owner:own||x.owner,sent:se||x.sent});});};
P6.task=id=>{const x=get(id);if(!x)return;const m=M();
  askPrompt('New task for this O&R request',[{label:'What needs to be done',value:''},{label:'For',options:[{v:x.owner||m.id,l:pname(x.owner||m.id)}].concat(people().filter(e=>e.id!==(x.owner||m.id)).map(e=>({v:e.id,l:e.name})))},{label:'When',options:[{v:'Today',l:'Today'},{v:'Tomorrow morning',l:'Tomorrow morning'},{v:'This week',l:'This week'}]}],([d,to,due])=>{d=String(d||'').trim();if(!d)return;
   const j={id:nid('j'),ts:Date.now(),to:[to],from:m.id,site:x.site,desc:'O&R: '+d,descLang:'en',descTr:'',due,status:'open',photo:'na',pri:false,media:[],orr:x.id};D.jobs.unshift(j);
   try{if(to!==m.id)assignPush([to],()=>'⚡ '+pname(m.id)+': O&R — '+d.slice(0,60),'info',{job:j.id});}catch(e){}
   bump(x,'Task for '+pname(to)+': '+d);});};

/* ───────── tasks ↔ requests ───────── */
// finishing an O&R task moves the request along
if(typeof window.markDone==='function'){const _md=window.markDone;window.markDone=function(id){const j=(D.jobs||[]).find(x=>x.id===id);if(!j||!(j.orr||j.orrAuto))return _md.apply(this,arguments);
  if(!j.photo)j.photo='na';const r=_md.apply(this,arguments);
  setTimeout(()=>{try{const x=j.orr&&get(j.orr);
    if(j.orrAuto==='follow'&&x)P6.follow(x.id);
    else if(j.orrAuto==='step'&&x){if(x.step===j.orrStep)P6.next(x.id,false);}
    else if(j.orrAuto==='us'&&x)P6.delivered(x.id,false);
    else if(j.orrAuto==='fwd'&&x)bump(x,'Invoice forwarded to the customer',null,false);
    else if(j.orrAuto==='apply')P6.add(j.site);
    else if(j.orrAuto==='meter')P6.add(j.site,'meter');
    else if(j.orrAuto==='tempout')P6.add(j.site,'tempout');
    else if(x)bump(x,'Task done: '+String(j.desc||'').replace(/^O&R: /,''),null,false);}catch(e){console.error('p6 task',e);}},250);
  return r;};}
// a task that belongs to an O&R request shows a link to it
if(typeof window.openJobDetail==='function'){const _oj=window.openJobDetail;window.openJobDetail=function(id){const r=_oj.apply(this,arguments);try{const j=(D.jobs||[]).find(x=>x.id===id);const x=j&&j.orr&&get(j.orr);
  const md=document.querySelector('#m-jobd .md');if(md&&!md.querySelector('.orrtaskbar')&&(x||j&&j.orrAuto)&&staff(M())){const b=document.createElement('div');b.className='orrtaskbar';
    b.innerHTML=x?'⚡ <span style="flex:1">O&amp;R · '+esc(TYPE(x.type))+' · '+esc(cur(x)[1])+'</span><b>Open ›</b>':'⚡ <span style="flex:1">O&amp;R — log the request when it\'s sent</span><b>New ›</b>';
    b.onclick=()=>{try{hide('m-jobd');}catch(e){}x?P6.open(x.id):P6.add(j.site,j.orrAuto==='meter'?'meter':j.orrAuto==='tempout'?'tempout':undefined);};const pb=[...md.querySelectorAll('button')].find(x=>/Photo|Foto/.test(x.textContent));const rw=pb&&pb.parentElement;if(rw&&rw.parentElement)rw.parentElement.insertBefore(b,rw);else md.appendChild(b);}}catch(e){}return r;};}

/* ───────── job page box ───────── */
function folderBox(s){const m=M();if(!staff(m))return '';const L=jobs().filter(x=>x.site===s.id).sort((a,b)=>(jOPEN(b)-jOPEN(a))||((b.ts||0)-(a.ts||0)));
  return '<div class="card" id="orrJob" data-p2t="over"><div class="row" style="align-items:center;margin-bottom:6px"><b style="font-size:12px;letter-spacing:.5px;text-transform:uppercase;color:var(--g4)">O&amp;R</b><span style="color:var(--blue-mid);cursor:pointer;font-size:13px;font-weight:600" onclick="ORR.add(\''+jsq(s.id)+'\')">+ New request</span></div>'
   +(L.length?L.map(row).join(''):(s.orrNone?'<div style="font-size:13px;color:var(--g4)">No O&amp;R needed for this job. <u style="cursor:pointer" onclick="ORR.none(\''+jsq(s.id)+'\',false)">Undo</u></div>':'<div style="font-size:13px;color:var(--g4)">No O&amp;R request yet. <u style="cursor:pointer" onclick="ORR.none(\''+jsq(s.id)+'\',true)">No O&amp;R needed</u></div>'))+'</div>';}
P6.none=(sid,v)=>{const s=D.sites.find(x=>x.id===sid);if(!s)return;s.orrNone=!!v;if(v)(D.jobs||[]).forEach(j=>{if(j.site===sid&&j.orrAuto==='apply'&&j.status!=='done'){j.status='done';j.doneAt=Date.now();}});save();refreshFolder();};
function refreshFolder(){try{const f=$('m-folder');if(f&&!f.classList.contains('hid')&&typeof fdSite!=='undefined'&&fdSite){const s=D.sites.find(x=>x.id===fdSite);const old=$('orrJob');if(s&&old){const d=document.createElement('div');d.innerHTML=folderBox(s);old.replaceWith(d.firstChild);}}}catch(e){}}
if(typeof window.openFolder==='function'){const _of=window.openFolder;window.openFolder=function(id){const r=_of.apply(this,arguments);try{const s=D.sites.find(x=>x.id===id);const ov=$('fdOverview');if(s&&ov&&!$('orrJob')){const h=folderBox(s);if(h){const d=document.createElement('div');d.innerHTML=h;ov.insertBefore(d.firstChild,ov.firstChild);}}}catch(e){console.error('p6 folder',e);}return r;};}

/* ───────── Home ───────── */
if(typeof window.renderHome==='function'){const _rh=window.renderHome;window.renderHome=function(){const r=_rh.apply(this,arguments);try{const m=M();const el=$('homeBody');if(m&&el&&staff(m)&&!$('p6home')){const L=list().filter(OPEN);const n=L.filter(todo).length;if(L.length){const d=document.createElement('div');d.className='card';d.id='p6home';d.setAttribute('onclick',"ORR.filter();goTab('orr')");
    d.innerHTML='<span class="n" style="'+(n?'':'background:#2fb36b')+'">'+n+'</span><div style="flex:1"><b style="font-size:14px">O&amp;R</b><div style="font-size:12px;color:var(--g4)">'+(n?n+' need action today · ':'')+L.length+' open jobs</div></div><span style="color:var(--g4)">›</span>';
    const anchor=$('p5short')||$('p4next');el.insertBefore(d,anchor?anchor.nextSibling:el.children[1]||null);}}}catch(e){console.error('p6 home',e);}return r;};}
})();
