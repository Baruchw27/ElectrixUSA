/* Electrix USA — P6 O&R tracker v2 (Baruch 2026-10-27). One record per request to Orange & Rockland in D.orr:
   { id, site, type, wo (O&R project #), pm (O&R project manager), owner (who handles it: Shia / Matty / Baruch …),
     stage (app · design · pay · constr · insp · meter · done — same steps as O&R Project Center),
     status (sent = waiting on O&R · us = O&R waits on us [need, usAt] · sched [schedOn] · done · cancel),
     sent, ts, upd, log[{ts,by,txt}], by, closedAt }
   Everyone on the office team + owner + managers can see and change everything; every change is written in the history
   with the person's name. Tasks: the server (private.orr_tick, every 15 min) makes a task for the owner when O&R waits on
   us, when there's no update for 3 work days, when a scheduled date passed, when a new job needs an O&R application,
   when a job goes Rough Complete (cut-in / meter), and when a job is Complete with a temp still up (removal). Finishing
   such a task here updates the O&R request (and the server closes tasks whose reason is gone). Off: window.EX_P6_OFF. */
(function(){
if(window.EX_P6_OFF)return;
const $=id=>document.getElementById(id);
const M=()=>{try{return me();}catch(e){return null;}};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsq=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const tt=s=>{try{return t(s);}catch(e){return s;}};
const TYPES=[['temp','Temp service'],['tempout','Temp removal'],['newsvc','New service'],['meter','Meter set / cut-in'],['upgrade','Service upgrade'],
 ['disc','Disconnect / reconnect'],['demo','Demolition removal'],['reloc','Pole / service relocation'],['other','Other']];
const TYPE=k=>{const x=TYPES.find(y=>y[0]===k);return x?x[1]:k||'—';};
const STAGES=[['app','Application'],['design','Design'],['pay','Cost / payment'],['constr','O&R construction'],['insp','Inspection / cut-in'],['meter','Meter / connect'],['done','Complete']];
const SIDX=k=>Math.max(0,STAGES.findIndex(s=>s[0]===k));
const ST={us:['On us','#e8912d'],sent:['Waiting on O&R','#2f80ed'],sched:['Scheduled','#9b51e0'],done:['Done','#2fb36b'],cancel:['Cancelled','#8e8e93']};
const OPEN=x=>x&&!x.deleted&&(x.status==='sent'||x.status==='us'||x.status==='sched');
const staff=m=>!!m&&(m.role==='owner'||m.role==='manager'||!!m.all||(m.role==='office'&&m.title!=='Accountant'));
const dk=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
const fd=(s,o)=>s?new Date(s+'T12:00').toLocaleDateString(LOC(),o||{month:'short',day:'numeric'}):'—';
function workDays(fromMs,toMs){const a=new Date(fromMs);a.setHours(12,0,0,0);const b=new Date(toMs);b.setHours(12,0,0,0);let n=0;
  for(let d=new Date(a);d<b;){d.setDate(d.getDate()+1);const w=d.getDay();if(w>0&&w<6)n++;if(n>400)break;}return n;}
function touched(x){const s=x.sent?new Date(x.sent+'T12:00').getTime():0;return Math.max(x.upd||0,s||0,x.ts||0);}
function idle(x){return workDays(touched(x),Date.now());}
function needsFollow(x){if(!OPEN(x))return false;if(x.status==='sched')return !!x.schedOn&&x.schedOn<dk(new Date());if(x.status==='us')return false;return idle(x)>=3;}
const people=()=>(D.emps||[]).filter(e=>!e.inactive&&staff(e)&&e.role!=='manager');
const pname=id=>{try{return (nameOf(id)||'').split(' ')[0]||'—';}catch(e){return '—';}};
const P6=window.ORR={TYPES,ST,STAGES,needsFollow,idle,workDays};
D.orr=D.orr||[];

/* ───────── look ───────── */
const css=`
#pg-orr .orrhd{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px}
#pg-orr .orrhd h2{margin:0}
.orrseg{display:flex;background:var(--g1);border-radius:10px;padding:3px;margin-bottom:8px}
.orrseg button{flex:1;border:none;background:none;border-radius:8px;padding:6px;font:600 12.5px/1.2 inherit;font-family:inherit;color:var(--g4);cursor:pointer}
.orrseg button.on{background:#fff;color:var(--g5);box-shadow:0 1px 2px rgba(0,0,0,.08)}
html[data-theme=dark] .orrseg button.on{background:#2c2c2e}
#pg-orr .orrchips{display:flex;gap:6px;overflow-x:auto;margin-bottom:8px;padding-bottom:2px}
#pg-orr .orrchips button{flex:none;border:none;border-radius:999px;padding:6px 11px;font-size:12.5px;font-weight:600;font-family:inherit;background:var(--g1);color:var(--g5);cursor:pointer;display:flex;gap:6px;align-items:center}
#pg-orr .orrchips button.on{background:var(--blue-mid);color:#fff}
#pg-orr .orrchips i{font-style:normal;background:rgba(127,127,127,.18);border-radius:999px;padding:0 6px;font-size:11.5px}
#pg-orr .orrchips button.on i{background:rgba(255,255,255,.25)}
#pg-orr input[type=search]{margin-bottom:8px}
.orrcard{display:flex;gap:10px;background:#fff;border-radius:14px;padding:10px 12px;margin-bottom:8px;cursor:pointer;box-shadow:0 0 0 .5px rgba(0,0,0,.07);border-left:4px solid #ccc}
html[data-theme=dark] .orrcard{background:#1c1c1e;box-shadow:none}
.orrcard .w{flex:1;min-width:0}
.orrcard b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.orrcard .s{font-size:12px;color:var(--g4);margin-top:2px}
.orrcard .late{color:#d93a2b;font-weight:600}
.orrcard .us{color:#c76a00;font-weight:600}
.orrcard .rt{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.orrcard .pill{font-size:11px;font-weight:700;border-radius:999px;padding:3px 8px;white-space:nowrap}
.orrav{width:24px;height:24px;border-radius:50%;background:var(--g2);color:var(--g5);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
.orrdots{display:flex;gap:3px;margin-top:6px}
.orrdots i{height:4px;flex:1;border-radius:2px;background:var(--g2);max-width:26px}
.orrdots i.on{background:#2fb36b}
.orrempty{color:var(--g4);text-align:center;padding:28px 6px;font-size:13.5px}
.orrform label{display:block;font-size:12px;font-weight:600;color:var(--g4);margin:10px 0 4px}
.orrform input,.orrform select,.orrform textarea{width:100%;font-size:16px}
.orrbtns{display:flex;gap:8px;margin-top:12px}
.orrbtns .btn{flex:1}
.orrst{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.orrst button{border:1.5px solid var(--g2);background:none;border-radius:999px;padding:6px 11px;font-size:12.5px;font-weight:600;color:var(--g5);cursor:pointer;font-family:inherit}
.orrst button.on{color:#fff;border-color:transparent}
.orrstep{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:6px 0 2px}
.orrstep button{flex:1;border:none;background:var(--g1);border-radius:8px;padding:6px 2px;font-size:10.5px;font-weight:600;color:var(--g4);cursor:pointer;font-family:inherit;line-height:1.15}
.orrstep button.done{background:#2fb36b22;color:#1f8a4c}
.orrstep button.cur{background:#2fb36b;color:#fff}
.orrneed{background:#e8912d1f;border-radius:12px;padding:10px 12px;margin:8px 0;font-size:13.5px}
.orrneed b{color:#c76a00}
.orrlog{font-size:13px;border-top:1px solid var(--g2);padding:7px 0}
.orrlog small{display:block;color:var(--g4);font-size:11.5px}
.orrtask{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:13px;background:var(--g1);border-radius:10px;padding:8px 10px;margin:6px 0;cursor:pointer}
.orrgrid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
#orrJob .orrcard{margin-bottom:6px}
#p6home{display:flex;align-items:center;gap:10px;cursor:pointer}
#p6home .n{background:#d93a2b;color:#fff;border-radius:999px;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12.5px;padding:0 7px}
.orrtaskbar{display:flex;align-items:center;gap:8px;background:#2f80ed14;border-radius:10px;padding:8px 10px;margin:8px 0;font-size:13px;cursor:pointer}
`;
const st=document.createElement('style');st.id='p6css';st.textContent=css;document.body.appendChild(st);

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

/* ───────── list ───────── */
let filt='us',q='',mine=false;
function lineFor(x){
  if(x.status==='us')return '<span class="us">'+esc(tt('On us'))+': '+esc(x.need||'see request')+'</span>';
  if(x.status==='sched'){const late=x.schedOn&&x.schedOn<dk(new Date());return late?'<span class="late">Scheduled '+fd(x.schedOn)+' — was it done?</span>':'Scheduled '+fd(x.schedOn,{weekday:'short',month:'short',day:'numeric'});}
  if(x.status==='sent'){const d=idle(x);return '<span class="'+(d>=3?'late':'')+'">'+d+' work day'+(d===1?'':'s')+' with no update</span>';}
  if(x.status==='done')return 'Done '+(x.closedAt?new Date(x.closedAt).toLocaleDateString(LOC(),{month:'short',day:'numeric'}):'');
  return '';}
function card(x){const s=ST[x.status]||ST.sent;const site=x.site?siteName(x.site):(x.addr||'—');const si=SIDX(x.stage);
  const sub=TYPE(x.type)+(x.wo?' · #'+esc(x.wo):'')+(x.pm?' · '+esc(x.pm):'');
  return '<div class="orrcard" style="border-left-color:'+s[1]+'" onclick="ORR.open(\''+jsq(x.id)+'\')"><div class="w"><b>'+esc(site.split(',')[0])+'</b><div class="s">'+sub+'</div><div class="s">'+lineFor(x)+'</div>'
   +'<div class="orrdots" title="'+esc(STAGES[si][1])+'">'+STAGES.map((z,i)=>'<i class="'+(i<=si&&x.stage?'on':'')+'"></i>').join('')+'</div></div>'
   +'<div class="rt"><span class="pill" style="background:'+s[1]+'22;color:'+s[1]+'">'+esc(tt(s[0]))+'</span>'+(x.owner?'<span class="orrav" title="'+esc(pname(x.owner))+'">'+esc(pname(x.owner).slice(0,1))+'</span>':'')+'</div></div>';}
function list(){return (D.orr||[]).filter(x=>x&&!x.deleted);}
function renderOrr(){ensurePage();const pg=$('pg-orr');const m=M();if(!pg||!m)return;
  if(!staff(m)){pg.innerHTML='<div class="orrempty">'+esc(tt('Not on your screens'))+'</div>';return;}
  let L=list();if(mine)L=L.filter(x=>x.owner===m.id);
  const by={us:L.filter(x=>x.status==='us'),follow:L.filter(needsFollow),sched:L.filter(x=>x.status==='sched'),sent:L.filter(x=>x.status==='sent'),done:L.filter(x=>x.status==='done'||x.status==='cancel'),all:L};
  let show=by[filt]||L;const qq=q.trim().toLowerCase();if(qq)show=L.filter(x=>((x.site?siteName(x.site):x.addr||'')+' '+(x.wo||'')+' '+(x.pm||'')+' '+TYPE(x.type)+' '+pname(x.owner)).toLowerCase().includes(qq));
  show=show.slice().sort((a,b)=>filt==='done'?(b.closedAt||b.upd||0)-(a.closedAt||a.upd||0):filt==='sched'?String(a.schedOn).localeCompare(String(b.schedOn)):idle(b)-idle(a));
  if(filt==='done'&&!qq)show=show.slice(0,40);
  const chip=(k,l)=>'<button class="'+(filt===k&&!qq?'on':'')+'" onclick="ORR.filter(\''+k+'\')">'+esc(tt(l))+' <i>'+by[k].length+'</i></button>';
  const keepQ=document.activeElement&&document.activeElement.id==='orrQ';
  pg.innerHTML='<div class="orrhd"><h2>O&amp;R</h2><button class="btn" style="width:auto;padding:7px 12px;font-size:13px" onclick="ORR.add()">+ '+esc(tt('New request'))+'</button></div>'
   +'<div class="orrseg"><button class="'+(mine?'':'on')+'" onclick="ORR.mine(false)">Everyone</button><button class="'+(mine?'on':'')+'" onclick="ORR.mine(true)">Mine</button></div>'
   +'<div class="orrchips">'+chip('us','On us')+chip('follow','Follow up')+chip('sched','Scheduled')+chip('sent','Waiting on O&R')+chip('done','Done')+chip('all','All')+'</div>'
   +'<input type="search" id="orrQ" placeholder="Search address, project #, PM" value="'+esc(q)+'" oninput="ORR.search(this.value)">'
   +(show.length?show.map(card).join(''):'<div class="orrempty">'+(L.length?'Nothing here right now.':esc(tt('No O&R requests yet.'))+'<br><br><button class="btn" style="width:auto" onclick="ORR.add()">+ '+esc(tt('New request'))+'</button>')+'</div>');
  if(keepQ){const i=$('orrQ');i.focus();i.setSelectionRange(i.value.length,i.value.length);}}
P6.filter=k=>{filt=k;q='';renderOrr();};
P6.search=v=>{q=v;renderOrr();};
P6.mine=v=>{mine=!!v;renderOrr();};
P6.render=renderOrr;

/* ───────── sheet ───────── */
function sheet(html){let o=$('p6ov');if(!o){o=document.createElement('div');o.id='p6ov';o.className='p2ov';o.onclick=e=>{if(e.target===o)close();};document.body.appendChild(o);}
  o.innerHTML='<div class="p2sheet orrform" role="dialog"><div class="hd"></div>'+html+'</div>';o.hidden=false;o.style.display='';}
function close(){const o=$('p6ov');if(o){o.hidden=true;o.style.display='none';o.innerHTML='';}}
P6.close=close;
function siteOpts(sel){return '<option value="">—</option>'+liveSites().slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(s=>'<option value="'+esc(s.id)+'"'+(s.id===sel?' selected':'')+'>'+esc(s.name)+'</option>').join('');}
function ownerOpts(sel){return people().map(e=>'<option value="'+esc(e.id)+'"'+(e.id===sel?' selected':'')+'>'+esc(e.name)+'</option>').join('');}
function pmList(){return [...new Set(list().map(x=>x.pm).filter(Boolean))].sort();}
P6.add=(siteId,type)=>{const m=M();if(!staff(m))return;
  sheet('<h3 style="margin:0 0 4px">'+esc(tt('New request'))+'</h3>'
   +'<label>Job</label><select id="orrSite">'+siteOpts(siteId||(typeof fdSite!=='undefined'&&$('m-folder')&&!$('m-folder').classList.contains('hid')?fdSite:''))+'</select>'
   +'<label>Type</label><select id="orrType">'+TYPES.map(([k,l])=>'<option value="'+k+'"'+(k===type?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select>'
   +'<div class="orrgrid"><div><label>O&amp;R project #</label><input id="orrWo" autocomplete="off" placeholder="optional"></div><div><label>Date sent</label><input id="orrSent" type="date" value="'+dk(new Date())+'"></div></div>'
   +'<div class="orrgrid"><div><label>O&amp;R PM</label><input id="orrPm" list="orrPmL" autocomplete="off" placeholder="e.g. French"><datalist id="orrPmL">'+pmList().map(p=>'<option value="'+esc(p)+'">').join('')+'</datalist></div>'
   +'<div><label>Who handles it</label><select id="orrOwn">'+ownerOpts(m.role==='office'?m.id:((people().find(e=>/^shia/i.test(e.name))||{}).id||m.id))+'</select></div></div>'
   +'<label>Note <span style="font-weight:400">(optional)</span></label><textarea id="orrNote" rows="2"></textarea>'
   +'<div class="orrbtns"><button class="btn" onclick="ORR.saveNew()">Save</button><button class="btn sec2" onclick="ORR.close()">Cancel</button></div>');};
P6.saveNew=()=>{const m=M();const site=$('orrSite').value;if(!site){toast('Pick the job');return;}
  const note=$('orrNote').value.trim();const now=Date.now();
  const x={id:nid('or'),site,type:$('orrType').value,wo:$('orrWo').value.trim(),pm:$('orrPm').value.trim(),owner:$('orrOwn').value||m.id,stage:'app',sent:$('orrSent').value||dk(new Date()),status:'sent',by:m.id,ts:now,upd:now,log:[{ts:now,by:m.id,txt:'Sent to O&R'+(note?' — '+note:'')}]};
  D.orr.unshift(x);closeAutoFor(site,x.type);save();close();toast('✓ Saved','green');renderOrr();refreshFolder();
  if(x.owner!==m.id)try{assignPush([x.owner],()=>'⚡ '+pname(m.id)+' gave you an O&R request: '+siteName(site).split(',')[0]+' — '+TYPE(x.type),'info',{tab:'orr'});}catch(e){}};
function openTasks(x){return (D.jobs||[]).filter(j=>j.orr===x.id&&j.status!=='done');}
P6.open=id=>{const x=list().find(y=>y.id===id);if(!x)return;const site=x.site?siteName(x.site):(x.addr||'—');const si=SIDX(x.stage);const tasks=openTasks(x);
  sheet('<div style="font-size:11.5px;color:var(--g4);text-transform:uppercase;letter-spacing:.5px">O&amp;R · '+esc(TYPE(x.type))+(x.wo?' · #'+esc(x.wo):'')+'</div>'
   +'<h3 style="margin:2px 0 2px;font-size:17px">'+esc(site)+'</h3>'
   +'<div style="font-size:13px;color:var(--g4)">PM '+esc(x.pm||'—')+' · handled by <b style="color:var(--g5)">'+esc(pname(x.owner))+'</b> · sent '+fd(x.sent)+'</div>'
   +(x.status==='us'?'<div class="orrneed"><b>On us:</b> '+esc(x.need||'—')+'<div class="orrbtns" style="margin-top:8px"><button class="btn" style="background:#e8912d" onclick="ORR.delivered(\''+jsq(x.id)+'\')">Done — sent to O&amp;R</button></div></div>':'')
   +'<label>Where it stands at O&amp;R</label><div class="orrstep">'+STAGES.map((z,i)=>'<button class="'+(x.stage?(i<si?'done':i===si?'cur':''):'')+'" onclick="ORR.setStage(\''+jsq(x.id)+'\',\''+z[0]+'\')">'+esc(z[1])+'</button>').join('')+'</div>'
   +'<label>Who\'s waiting</label><div class="orrst">'+Object.keys(ST).map(k=>'<button class="'+(x.status===k?'on':'')+'" style="'+(x.status===k?'background:'+ST[k][1]:'')+'" onclick="ORR.setStatus(\''+jsq(x.id)+'\',\''+k+'\')">'+esc(ST[k][0])+'</button>').join('')+'</div>'
   +(x.status==='us'?'':'<div style="font-size:13px;margin-top:2px">'+lineFor(x)+'</div>')
   +(tasks.length?'<label>Open tasks</label>'+tasks.map(j=>'<div class="orrtask" onclick="ORR.close();openJobDetail(\''+jsq(j.id)+'\')"><span>'+esc(j.desc)+'</span><span style="color:var(--g4);white-space:nowrap">'+esc(pname((j.to||[])[0]))+' ›</span></div>').join(''):'')
   +'<div class="orrbtns">'+(OPEN(x)?'<button class="btn" onclick="ORR.follow(\''+jsq(x.id)+'\')">Followed up</button>':'')+'<button class="btn sec2" onclick="ORR.note(\''+jsq(x.id)+'\')">Add note</button></div>'
   +'<div class="orrbtns" style="margin-top:8px"><button class="btn sec2" onclick="ORR.task(\''+jsq(x.id)+'\')">+ Task</button><button class="btn sec2" onclick="ORR.edit(\''+jsq(x.id)+'\')">Edit</button>'+(x.site?'<button class="btn sec2" onclick="ORR.close();openFolder(\''+jsq(x.site)+'\')">Job</button>':'')+'</div>'
   +'<label>History</label>'+((x.log||[]).slice().reverse().map(l=>'<div class="orrlog">'+esc(l.txt)+'<small>'+esc(pname(l.by))+' · '+new Date(l.ts).toLocaleString(LOC(),{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'</small></div>').join('')||'<div class="orrlog">—</div>'));};
function bump(x,txt,extra,reopen){const m=M();const now=Date.now();Object.assign(x,extra||{});x.upd=now;x.log=(x.log||[]).concat([{ts:now,by:m.id,txt}]);save();renderOrr();refreshFolder();if(reopen!==false)P6.open(x.id);}
// tasks made for a reason that is now gone are finished right away (the server does the same within 15 minutes)
function closeTasks(x,kinds){const m=M();(D.jobs||[]).forEach(j=>{if(j.orr===x.id&&j.status!=='done'&&(!kinds||kinds.includes(j.orrAuto))){j.status='done';j.doneAt=Date.now();j.doneBy=m.id;}});}
function closeAutoFor(site,type){const m=M();(D.jobs||[]).forEach(j=>{if(j.site===site&&j.status!=='done'&&(j.orrAuto==='apply'||(j.orrAuto==='meter'&&type==='meter')||(j.orrAuto==='tempout'&&type==='tempout'))){j.status='done';j.doneAt=Date.now();j.doneBy=m.id;}});}
P6.follow=id=>{const x=list().find(y=>y.id===id);if(!x)return;askPrompt('Followed up',[{label:'What did O&R say?',value:''}],([v])=>{closeTasks(x,['follow']);bump(x,'Followed up'+(String(v||'').trim()?': '+String(v).trim():''));});};
P6.note=id=>{const x=list().find(y=>y.id===id);if(!x)return;askPrompt('Add note',[{label:'Note',value:''}],([v])=>{if(!String(v||'').trim())return;bump(x,String(v).trim());});};
P6.delivered=id=>{const x=list().find(y=>y.id===id);if(!x)return;closeTasks(x,['us']);bump(x,'Sent to O&R what they needed'+(x.need?': '+x.need:''),{status:'sent',need:''});};
P6.setStage=(id,k)=>{const x=list().find(y=>y.id===id);if(!x||x.stage===k)return;const ex={stage:k};if(k==='done'){ex.status='done';ex.closedAt=Date.now();closeTasks(x);}bump(x,'O&R step: '+STAGES[SIDX(k)][1],ex);};
P6.setStatus=(id,k)=>{const x=list().find(y=>y.id===id);if(!x)return;
  if(k==='sched'){askPrompt('Scheduled for',[{label:'Date',value:x.schedOn||dk(Date.now()+86400000),type:'date'}],([d])=>{if(!d)return;closeTasks(x,['follow','sched']);bump(x,'Scheduled for '+new Date(d+'T12:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}),{status:'sched',schedOn:d});});return;}
  if(k==='us'){askPrompt('O&R is waiting on us',[{label:'What does O&R need from us?',value:x.need||''},{label:'Who handles it',options:[{v:x.owner||'',l:pname(x.owner)}].concat(people().filter(e=>e.id!==x.owner).map(e=>({v:e.id,l:e.name})))}],([v,o])=>{closeTasks(x,['follow']);bump(x,'O&R needs from us: '+(String(v||'').trim()||'—')+(o&&o!==x.owner?' · handed to '+pname(o):''),{status:'us',need:String(v||'').trim(),usAt:Date.now(),owner:o||x.owner});});return;}
  if(x.status===k)return;closeTasks(x);
  bump(x,({sent:'Back to waiting on O&R',done:'Done',cancel:'Cancelled'})[k]||k,{status:k,need:k==='sent'?'':x.need,closedAt:(k==='done'||k==='cancel')?Date.now():null,stage:k==='done'?'done':x.stage});};
P6.edit=id=>{const x=list().find(y=>y.id===id);if(!x)return;
  askPrompt('Edit',[{label:'O&R project #',value:x.wo||''},{label:'O&R PM',value:x.pm||''},{label:'Who handles it',options:[{v:x.owner||'',l:pname(x.owner)}].concat(people().filter(e=>e.id!==x.owner).map(e=>({v:e.id,l:e.name})))},{label:'Type',options:[{v:x.type,l:TYPE(x.type)}].concat(TYPES.filter(y=>y[0]!==x.type).map(([v,l])=>({v,l})))},{label:'Date sent',value:x.sent||'',type:'date'}],
   ([wo,pm,own,ty,se])=>{const ch=[];if((wo||'')!==(x.wo||''))ch.push('project # '+(wo||'—'));if((pm||'')!==(x.pm||''))ch.push('PM '+(pm||'—'));if(own&&own!==x.owner)ch.push('handled by '+pname(own));if(ty!==x.type)ch.push(TYPE(ty));if(se&&se!==x.sent)ch.push('sent '+se);if(!ch.length)return;
    if(own&&own!==x.owner){(D.jobs||[]).forEach(j=>{if(j.orr===x.id&&j.status!=='done')j.to=[own];});try{assignPush([own],()=>'⚡ '+pname(M().id)+' gave you an O&R request: '+siteName(x.site).split(',')[0],'info',{tab:'orr'});}catch(e){}}
    bump(x,'Changed: '+ch.join(', '),{wo:(wo||'').trim(),pm:(pm||'').trim(),owner:own||x.owner,type:ty,sent:se||x.sent});});};
// a task by hand, tied to this request
P6.task=id=>{const x=list().find(y=>y.id===id);if(!x)return;const m=M();
  askPrompt('New task for this O&R request',[{label:'What needs to be done',value:''},{label:'For',options:[{v:x.owner||m.id,l:pname(x.owner||m.id)}].concat(people().filter(e=>e.id!==(x.owner||m.id)).map(e=>({v:e.id,l:e.name})))},{label:'When',options:[{v:'Today',l:'Today'},{v:'Tomorrow morning',l:'Tomorrow morning'},{v:'This week',l:'This week'}]}],([d,to,due])=>{d=String(d||'').trim();if(!d)return;
   const j={id:nid('j'),ts:Date.now(),to:[to],from:m.id,site:x.site,desc:'O&R: '+d,descLang:'en',descTr:'',due,status:'open',photo:'na',pri:false,media:[],orr:x.id};D.jobs.unshift(j);
   try{if(to!==m.id)assignPush([to],()=>'⚡ '+pname(m.id)+': O&R — '+d.slice(0,60),'info',{job:j.id});}catch(e){}
   bump(x,'Task for '+pname(to)+': '+d);});};

/* ───────── tasks ↔ requests ───────── */
// finishing an O&R task moves the request along
if(typeof window.markDone==='function'){const _md=window.markDone;window.markDone=function(id){const j=(D.jobs||[]).find(x=>x.id===id);if(!j||!(j.orr||j.orrAuto))return _md.apply(this,arguments);
  if(!j.photo)j.photo='na';const r=_md.apply(this,arguments);
  setTimeout(()=>{try{const x=j.orr&&list().find(y=>y.id===j.orr);
    if(j.orrAuto==='follow'&&x)askPrompt('Followed up with O&R',[{label:'What did O&R say? (optional)',value:''}],([v])=>bump(x,'Followed up'+(String(v||'').trim()?': '+String(v).trim():' (task done)'),null,false));
    else if(j.orrAuto==='us'&&x)bump(x,'Sent to O&R what they needed'+(x.need?': '+x.need:''),{status:'sent',need:''},false);
    else if(j.orrAuto==='sched'&&x)askConfirm('Was the '+TYPE(x.type).toLowerCase()+' done?',()=>bump(x,'Done',{status:'done',stage:'done',closedAt:Date.now()},false),'Yes, done');
    else if(j.orrAuto==='apply')P6.add(j.site);
    else if(j.orrAuto==='meter')P6.add(j.site,'meter');
    else if(j.orrAuto==='tempout')P6.add(j.site,'tempout');
    else if(x)bump(x,'Task done: '+String(j.desc||'').replace(/^O&R: /,''),null,false);}catch(e){console.error('p6 task',e);}},250);
  return r;};}
// a task that belongs to an O&R request shows a link to it
if(typeof window.openJobDetail==='function'){const _oj=window.openJobDetail;window.openJobDetail=function(id){const r=_oj.apply(this,arguments);try{const j=(D.jobs||[]).find(x=>x.id===id);const x=j&&j.orr&&list().find(y=>y.id===j.orr);
  const md=document.querySelector('#m-jobd .md');if(md&&!md.querySelector('.orrtaskbar')&&(x||j&&j.orrAuto)&&staff(M())){const b=document.createElement('div');b.className='orrtaskbar';
    b.innerHTML=x?'⚡ <span style="flex:1">O&amp;R request · '+esc(TYPE(x.type))+' · '+esc(ST[x.status][0])+'</span><b>Open ›</b>':'⚡ <span style="flex:1">O&amp;R — log the request when it\'s sent</span><b>New ›</b>';
    b.onclick=()=>{try{hide('m-jobd');}catch(e){}x?P6.open(x.id):P6.add(j.site,j.orrAuto==='meter'?'meter':j.orrAuto==='tempout'?'tempout':undefined);};const pb=[...md.querySelectorAll('button')].find(x=>/Photo|Foto/.test(x.textContent));const row=pb&&pb.parentElement;if(row&&row.parentElement)row.parentElement.insertBefore(b,row);else md.appendChild(b);}}catch(e){}return r;};}

/* ───────── job page box ───────── */
function folderBox(s){const m=M();if(!staff(m))return '';const L=list().filter(x=>x.site===s.id).sort((a,b)=>(OPEN(b)-OPEN(a))||((b.ts||0)-(a.ts||0)));
  return '<div class="card" id="orrJob" data-p2t="over"><div class="row" style="align-items:center;margin-bottom:6px"><b style="font-size:12px;letter-spacing:.5px;text-transform:uppercase;color:var(--g4)">O&amp;R</b><span style="color:var(--blue-mid);cursor:pointer;font-size:13px;font-weight:600" onclick="ORR.add(\''+jsq(s.id)+'\')">+ New request</span></div>'
   +(L.length?L.map(card).join(''):(s.orrNone?'<div style="font-size:13px;color:var(--g4)">No O&amp;R needed for this job. <u style="cursor:pointer" onclick="ORR.none(\''+jsq(s.id)+'\',false)">Undo</u></div>':'<div style="font-size:13px;color:var(--g4)">No O&amp;R request yet. <u style="cursor:pointer" onclick="ORR.none(\''+jsq(s.id)+'\',true)">No O&amp;R needed</u></div>'))+'</div>';}
P6.none=(sid,v)=>{const s=D.sites.find(x=>x.id===sid);if(!s)return;s.orrNone=!!v;if(v)(D.jobs||[]).forEach(j=>{if(j.site===sid&&j.orrAuto==='apply'&&j.status!=='done'){j.status='done';j.doneAt=Date.now();}});save();refreshFolder();};
function refreshFolder(){try{const f=$('m-folder');if(f&&!f.classList.contains('hid')&&typeof fdSite!=='undefined'&&fdSite){const s=D.sites.find(x=>x.id===fdSite);const old=$('orrJob');if(s&&old){const d=document.createElement('div');d.innerHTML=folderBox(s);old.replaceWith(d.firstChild);}}}catch(e){}}
if(typeof window.openFolder==='function'){const _of=window.openFolder;window.openFolder=function(id){const r=_of.apply(this,arguments);try{const s=D.sites.find(x=>x.id===id);const ov=$('fdOverview');if(s&&ov&&!$('orrJob')){const h=folderBox(s);if(h){const d=document.createElement('div');d.innerHTML=h;ov.insertBefore(d.firstChild,ov.firstChild);}}}catch(e){console.error('p6 folder',e);}return r;};}

/* ───────── Home ───────── */
if(typeof window.renderHome==='function'){const _rh=window.renderHome;window.renderHome=function(){const r=_rh.apply(this,arguments);try{const m=M();const el=$('homeBody');if(m&&el&&staff(m)&&!$('p6home')){const L=list();const us=L.filter(x=>x.status==='us').length,fu=L.filter(needsFollow).length;if(us||fu){const d=document.createElement('div');d.className='card';d.id='p6home';d.setAttribute('onclick',"ORR.filter('"+(us?'us':'follow')+"');goTab('orr')");
    d.innerHTML='<span class="n">'+(us+fu)+'</span><div style="flex:1"><b style="font-size:14px">O&amp;R</b><div style="font-size:12px;color:var(--g4)">'+[us?us+' on us':'',fu?fu+' need a follow-up':''].filter(Boolean).join(' · ')+'</div></div><span style="color:var(--g4)">›</span>';
    const anchor=$('p5short')||$('p4next');el.insertBefore(d,anchor?anchor.nextSibling:el.children[1]||null);}}}catch(e){console.error('p6 home',e);}return r;};}
})();
