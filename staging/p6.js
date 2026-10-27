/* Electrix USA — P6 O&R tracker (Baruch 2026-10-27). Every request sent to Orange & Rockland (temp service, new service,
   meter set, upgrade, disconnect, demolition removal, relocation, other) is one record in D.orr with its job, type, O&R
   work-order number, date sent, status and a log. "Follow up" = no update for 3 work days (Mon–Fri). Shia and Matty get a
   server reminder each morning for those (see schema.sql, private.orr_tick); after 10 work days Baruch too.
   Page: O&R (in More / Home shortcuts; in the office's bottom bar). Each job page shows its O&R requests.
   Only the owner, managers and office see or change these (database rules: can_see2 / guard_record).
   Turn off with window.EX_P6_OFF = true. */
(function(){
if(window.EX_P6_OFF)return;
const $=id=>document.getElementById(id);
const M=()=>{try{return me();}catch(e){return null;}};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsq=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const ES6={"O&R":"O&R","O&R requests":"Solicitudes O&R","New request":"Nueva solicitud","Follow up":"Dar seguimiento","Waiting on O&R":"Esperando a O&R",
 "Waiting on us":"O&R espera de nosotros","Scheduled":"Programado","Done":"Hecho","Cancelled":"Cancelado","Job":"Trabajo","Type":"Tipo","Work order #":"Orden de trabajo #",
 "Date sent":"Fecha enviada","Note":"Nota","Save":"Guardar","Cancel":"Cancelar","work days, no update":"días hábiles sin novedad","Followed up":"Seguimiento hecho",
 "What did O&R say?":"¿Qué dijo O&R?","Scheduled for":"Programado para","Open job":"Abrir trabajo","All":"Todo","Search address or work order":"Buscar dirección u orden",
 "No O&R requests yet.":"Todavía no hay solicitudes O&R.","need follow-up":"necesitan seguimiento","sent":"enviada","Status":"Estado","History":"Historial","Edit":"Editar"};
const tt=s=>{try{if(lang()==='es')return ES6[s]||t(s);}catch(e){}try{return t(s);}catch(e){return s;}};
const TYPES=[['temp','Temp service'],['tempout','Temp service removal'],['newsvc','New service application'],['meter','Meter set / cut-in'],['upgrade','Service upgrade'],
 ['disc','Disconnect / reconnect'],['demo','Pre-demolition removal'],['reloc','Pole / service relocation'],['other','Other']];
const TYPE=k=>{const x=TYPES.find(y=>y[0]===k);return x?x[1]:k||'—';};
const ST={sent:['Waiting on O&R','#2f80ed'],us:['Waiting on us','#e8912d'],sched:['Scheduled','#9b51e0'],done:['Done','#2fb36b'],cancel:['Cancelled','#8e8e93']};
const OPEN=x=>x&&!x.deleted&&(x.status==='sent'||x.status==='us'||x.status==='sched');
const staff=m=>!!m&&(m.role==='owner'||m.role==='manager'||!!m.all||(m.role==='office'&&m.title!=='Accountant'));
const dk=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
function workDays(fromMs,toMs){ // Mon–Fri days after the "from" day up to and including the "to" day
  const a=new Date(fromMs);a.setHours(12,0,0,0);const b=new Date(toMs);b.setHours(12,0,0,0);let n=0;
  for(let d=new Date(a);d<b;){d.setDate(d.getDate()+1);const w=d.getDay();if(w>0&&w<6)n++;if(n>400)break;}return n;}
function touched(x){const s=x.sent?new Date(x.sent+'T12:00').getTime():0;return Math.max(x.upd||0,s||0,x.ts||0);}
function idle(x){return workDays(touched(x),Date.now());}
function needsFollow(x){if(!OPEN(x))return false;if(x.status==='sched')return !!x.schedOn&&x.schedOn<dk(new Date());return idle(x)>=3;}
window.ORR={TYPES,ST,needsFollow,idle,workDays};
D.orr=D.orr||[];

/* ───────── look ───────── */
const css=`
#pg-orr .orrhd{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
#pg-orr .orrhd h2{margin:0}
#pg-orr .orrchips{display:flex;gap:6px;overflow-x:auto;margin-bottom:10px;padding-bottom:2px}
#pg-orr .orrchips button{flex:none;border:none;border-radius:999px;padding:6px 11px;font:600 12.5px/1.2 inherit;font-family:inherit;background:var(--g1);color:var(--g5);cursor:pointer;display:flex;gap:6px;align-items:center}
#pg-orr .orrchips button.on{background:var(--blue-mid);color:#fff}
#pg-orr .orrchips i{font-style:normal;background:rgba(127,127,127,.18);border-radius:999px;padding:0 6px;font-size:11.5px}
#pg-orr .orrchips button.on i{background:rgba(255,255,255,.25)}
#pg-orr input[type=search]{margin-bottom:10px}
.orrcard{display:flex;gap:10px;background:#fff;border-radius:14px;padding:10px 12px;margin-bottom:8px;cursor:pointer;box-shadow:0 0 0 .5px rgba(0,0,0,.07);border-left:4px solid #ccc}
html[data-theme=dark] .orrcard{background:#1c1c1e;box-shadow:none}
.orrcard .w{flex:1;min-width:0}
.orrcard b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.orrcard .s{font-size:12px;color:var(--g4);margin-top:2px}
.orrcard .late{color:#d93a2b;font-weight:600}
.orrcard .pill{flex:none;align-self:flex-start;font-size:11px;font-weight:700;border-radius:999px;padding:3px 8px}
.orrsec{font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--g4);margin:12px 2px 6px}
.orrempty{color:var(--g4);text-align:center;padding:28px 6px;font-size:13.5px}
.orrform label{display:block;font-size:12px;font-weight:600;color:var(--g4);margin:10px 0 4px}
.orrform input,.orrform select,.orrform textarea{width:100%;font-size:16px}
.orrbtns{display:flex;gap:8px;margin-top:14px}
.orrbtns .btn{flex:1}
.orrst{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.orrst button{border:1.5px solid var(--g2);background:none;border-radius:999px;padding:6px 11px;font-size:12.5px;font-weight:600;color:var(--g5);cursor:pointer;font-family:inherit}
.orrst button.on{color:#fff;border-color:transparent}
.orrlog{font-size:13px;border-top:1px solid var(--g2);padding:7px 0}
.orrlog small{display:block;color:var(--g4);font-size:11.5px}
#orrJob .orrcard{margin-bottom:6px}
#p6home{display:flex;align-items:center;gap:10px;cursor:pointer}
#p6home .n{background:#d93a2b;color:#fff;border-radius:999px;min-width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12.5px;padding:0 7px}
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
// who sees the O&R tab: owner, managers, office (not the accountant)
if(typeof window.applyTabs==='function'){const _at=window.applyTabs;window.applyTabs=function(){ensurePage();const m=M();const b=document.querySelector('.tab[onclick*="\'orr\'"]');
  if(b&&m){b.dataset.allowed=staff(m)?'1':'0';b.style.display='none';}
  const r=_at.apply(this,arguments);
  if(b&&m){const prim=primaryFor(m);b.style.display=(staff(m)&&prim.includes('orr'))?'':'none';}
  return r;};}
// the office's bar: Tasks · My Trello · O&R · Calendar · More (Material stays on Home / More)
try{if(typeof PRIMARY==='object')PRIMARY.office=['jobs','trello','orr','cal','more'];}catch(e){}
if(typeof window.tab==='function'){const _tab=window.tab;window.tab=function(n,el){const r=_tab.apply(this,arguments);if(n==='orr')renderOrr();return r;};}
try{applyTabs();}catch(e){}

/* ───────── list ───────── */
let filt='follow',q='';
function card(x){const s=ST[x.status]||ST.sent;const nd=needsFollow(x);const days=idle(x);
  const site=x.site?siteName(x.site):(x.addr||'—');
  const sub=TYPE(x.type)+(x.wo?' · WO '+esc(x.wo):'')+(x.sent?' · '+tt('sent')+' '+new Date(x.sent+'T12:00').toLocaleDateString(LOC(),{month:'short',day:'numeric'}):'');
  const last=(x.log||[]).slice(-1)[0];
  const line=OPEN(x)?(x.status==='sched'&&x.schedOn?(nd?'<span class="late">'+tt('Scheduled for')+' '+new Date(x.schedOn+'T12:00').toLocaleDateString(LOC(),{month:'short',day:'numeric'})+' — was it done?</span>':tt('Scheduled for')+' '+new Date(x.schedOn+'T12:00').toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'})):'<span class="'+(nd?'late':'')+'">'+days+' '+tt('work days, no update')+'</span>'):'';
  return '<div class="orrcard" style="border-left-color:'+s[1]+'" onclick="ORR.open(\''+jsq(x.id)+'\')"><div class="w"><b>'+esc(site.split(',')[0])+'</b><div class="s">'+sub+'</div>'+(line?'<div class="s">'+line+'</div>':'')+(last&&last.txt?'<div class="s" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">“'+esc(last.txt)+'”</div>':'')+'</div><span class="pill" style="background:'+s[1]+'22;color:'+s[1]+'">'+esc(tt(s[0]))+'</span></div>';}
function list(){return (D.orr||[]).filter(x=>x&&!x.deleted);}
function renderOrr(){ensurePage();const pg=$('pg-orr');const m=M();if(!pg||!m)return;
  if(!staff(m)){pg.innerHTML='<div class="orrempty">'+esc(t('Not on your screens'))+'</div>';return;}
  const L=list();const by={follow:L.filter(needsFollow),sent:L.filter(x=>x.status==='sent'),us:L.filter(x=>x.status==='us'),sched:L.filter(x=>x.status==='sched'),done:L.filter(x=>x.status==='done'||x.status==='cancel'),all:L};
  let show=by[filt]||L;const qq=q.trim().toLowerCase();if(qq)show=L.filter(x=>((x.site?siteName(x.site):x.addr||'')+' '+(x.wo||'')+' '+TYPE(x.type)).toLowerCase().includes(qq));
  show=show.slice().sort((a,b)=>filt==='done'?(b.closedAt||b.upd||0)-(a.closedAt||a.upd||0):idle(b)-idle(a));
  if(filt==='done'&&!qq)show=show.slice(0,40);
  const chip=(k,l)=>'<button class="'+(filt===k&&!qq?'on':'')+'" onclick="ORR.filter(\''+k+'\')">'+esc(tt(l))+' <i>'+by[k].length+'</i></button>';
  const keepQ=document.activeElement&&document.activeElement.id==='orrQ';
  pg.innerHTML='<div class="orrhd"><h2>'+esc(tt('O&R requests'))+'</h2><button class="btn" style="width:auto;padding:7px 12px;font-size:13px" onclick="ORR.add()">+ '+esc(tt('New request'))+'</button></div>'
   +'<div class="orrchips">'+chip('follow','Follow up')+chip('sent','Waiting on O&R')+chip('us','Waiting on us')+chip('sched','Scheduled')+chip('done','Done')+chip('all','All')+'</div>'
   +'<input type="search" id="orrQ" placeholder="'+esc(tt('Search address or work order'))+'" value="'+esc(q)+'" oninput="ORR.search(this.value)">'
   +(show.length?show.map(card).join(''):'<div class="orrempty">'+(L.length?(filt==='follow'?'Nothing needs a follow-up right now.':'—'):esc(tt('No O&R requests yet.'))+'<br><br><button class="btn" style="width:auto" onclick="ORR.add()">+ '+esc(tt('New request'))+'</button>')+'</div>');
  if(keepQ){const i=$('orrQ');i.focus();i.setSelectionRange(i.value.length,i.value.length);}}
ORR.filter=k=>{filt=k;q='';renderOrr();};
ORR.search=v=>{q=v;renderOrr();};
ORR.render=renderOrr;

/* ───────── sheet (new / detail) ───────── */
function sheet(html){let o=$('p6ov');if(!o){o=document.createElement('div');o.id='p6ov';o.className='p2ov';o.onclick=e=>{if(e.target===o)close();};document.body.appendChild(o);}
  o.innerHTML='<div class="p2sheet orrform" role="dialog"><div class="hd"></div>'+html+'</div>';o.hidden=false;o.style.display='';}
function close(){const o=$('p6ov');if(o){o.hidden=true;o.style.display='none';o.innerHTML='';}}
ORR.close=close;
function siteOpts(sel){return '<option value="">—</option>'+liveSites().slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(s=>'<option value="'+esc(s.id)+'"'+(s.id===sel?' selected':'')+'>'+esc(s.name)+'</option>').join('');}
ORR.add=(siteId)=>{const m=M();if(!staff(m))return;
  sheet('<h3 style="margin:0 0 4px">'+esc(tt('New request'))+'</h3>'
   +'<label>'+esc(tt('Job'))+'</label><select id="orrSite">'+siteOpts(siteId||(typeof fdSite!=='undefined'&&!$('m-folder').classList.contains('hid')?fdSite:''))+'</select>'
   +'<label>'+esc(tt('Type'))+'</label><select id="orrType">'+TYPES.map(([k,l])=>'<option value="'+k+'">'+esc(tt(l))+'</option>').join('')+'</select>'
   +'<label>'+esc(tt('Work order #'))+' <span style="font-weight:400">(optional)</span></label><input id="orrWo" inputmode="text" autocomplete="off">'
   +'<label>'+esc(tt('Date sent'))+'</label><input id="orrSent" type="date" value="'+dk(new Date())+'">'
   +'<label>'+esc(tt('Note'))+' <span style="font-weight:400">(optional)</span></label><textarea id="orrNote" rows="2"></textarea>'
   +'<div class="orrbtns"><button class="btn" onclick="ORR.saveNew()">'+esc(tt('Save'))+'</button><button class="btn sec2" onclick="ORR.close()">'+esc(tt('Cancel'))+'</button></div>');};
ORR.saveNew=()=>{const m=M();const site=$('orrSite').value;if(!site){toast(tt('Job')+'?');return;}
  const note=$('orrNote').value.trim();const now=Date.now();
  const x={id:nid('or'),site,type:$('orrType').value,wo:$('orrWo').value.trim(),sent:$('orrSent').value||dk(new Date()),status:'sent',by:m.id,ts:now,upd:now,log:[{ts:now,by:m.id,txt:'Sent to O&R'+(note?' — '+note:'')}]};
  D.orr.unshift(x);save();close();toast('✓ '+tt('Save'),'green');renderOrr();refreshFolder();};
ORR.open=id=>{const x=list().find(y=>y.id===id);if(!x)return;const s=ST[x.status]||ST.sent;
  const site=x.site?siteName(x.site):(x.addr||'—');const nd=needsFollow(x);
  sheet('<div style="font-size:11.5px;color:var(--g4);text-transform:uppercase;letter-spacing:.5px">O&amp;R · '+esc(tt(TYPE(x.type)))+'</div>'
   +'<h3 style="margin:2px 0 2px;font-size:17px">'+esc(site)+'</h3>'
   +'<div style="font-size:13px;color:var(--g4)">'+(x.wo?'WO <b style="color:var(--g5)">'+esc(x.wo)+'</b> · ':'')+tt('sent')+' '+(x.sent?new Date(x.sent+'T12:00').toLocaleDateString(LOC(),{month:'short',day:'numeric',year:'numeric'}):'—')+(OPEN(x)?' · <span style="'+(nd?'color:#d93a2b;font-weight:600':'')+'">'+idle(x)+' '+tt('work days, no update')+'</span>':'')+'</div>'
   +'<label>'+esc(tt('Status'))+'</label><div class="orrst">'+Object.keys(ST).map(k=>'<button class="'+(x.status===k?'on':'')+'" style="'+(x.status===k?'background:'+ST[k][1]:'')+'" onclick="ORR.setStatus(\''+jsq(x.id)+'\',\''+k+'\')">'+esc(tt(ST[k][0]))+'</button>').join('')+'</div>'
   +(x.status==='sched'?'<div style="font-size:13px">'+tt('Scheduled for')+' <b>'+(x.schedOn?new Date(x.schedOn+'T12:00').toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'}):'—')+'</b> · <u style="cursor:pointer" onclick="ORR.setStatus(\''+jsq(x.id)+'\',\'sched\')">'+tt('Edit')+'</u></div>':'')
   +(OPEN(x)?'<div class="orrbtns"><button class="btn" onclick="ORR.follow(\''+jsq(x.id)+'\')">'+esc(tt('Followed up'))+'</button></div>':'')
   +'<div class="orrbtns" style="margin-top:8px">'+(x.site?'<button class="btn sec2" onclick="ORR.close();openFolder(\''+jsq(x.site)+'\')">'+esc(tt('Open job'))+'</button>':'')+'<button class="btn sec2" onclick="ORR.edit(\''+jsq(x.id)+'\')">'+esc(tt('Edit'))+'</button></div>'
   +'<label>'+esc(tt('History'))+'</label>'+((x.log||[]).slice().reverse().map(l=>'<div class="orrlog">'+esc(l.txt)+'<small>'+esc(nameOf(l.by))+' · '+new Date(l.ts).toLocaleString(LOC(),{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'</small></div>').join('')||'<div class="orrlog">—</div>'));};
function bump(x,txt,extra){const m=M();const now=Date.now();Object.assign(x,extra||{});x.upd=now;x.log=(x.log||[]).concat([{ts:now,by:m.id,txt}]);save();renderOrr();refreshFolder();ORR.open(x.id);}
ORR.follow=id=>{const x=list().find(y=>y.id===id);if(!x)return;askPrompt(tt('Followed up'),[{label:tt('What did O&R say?'),value:''}],([v])=>{bump(x,'Followed up'+(String(v||'').trim()?': '+String(v).trim():''));});};
ORR.setStatus=(id,k)=>{const x=list().find(y=>y.id===id);if(!x)return;
  if(k==='sched'){askPrompt(tt('Scheduled for'),[{label:tt('Date'),value:x.schedOn||dk(Date.now()+86400000),type:'date'}],([d])=>{if(!d)return;bump(x,'Scheduled for '+new Date(d+'T12:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}),{status:'sched',schedOn:d});});return;}
  if(k==='us'){askPrompt(tt('Waiting on us'),[{label:'What does O&R need from us?',value:''}],([v])=>{bump(x,'O&R needs from us'+(String(v||'').trim()?': '+String(v).trim():''),{status:'us'});});return;}
  if(x.status===k)return;
  bump(x,({sent:'Back to waiting on O&R',done:'Done',cancel:'Cancelled'})[k]||k,{status:k,closedAt:(k==='done'||k==='cancel')?Date.now():null});};
ORR.edit=id=>{const x=list().find(y=>y.id===id);if(!x)return;
  askPrompt(tt('Edit'),[{label:tt('Work order #'),value:x.wo||''},{label:tt('Type'),options:[{v:x.type,l:TYPE(x.type)}].concat(TYPES.filter(y=>y[0]!==x.type).map(([v,l])=>({v,l})))},{label:tt('Date sent'),value:x.sent||'',type:'date'}],([wo,ty,se])=>{const ch=[];if((wo||'')!==(x.wo||''))ch.push('WO '+(wo||'—'));if(ty!==x.type)ch.push(TYPE(ty));if(se&&se!==x.sent)ch.push('sent '+se);if(!ch.length)return;bump(x,'Changed: '+ch.join(', '),{wo:(wo||'').trim(),type:ty,sent:se||x.sent});});};

/* ───────── job page: this job's O&R requests ───────── */
function folderBox(s){const m=M();if(!staff(m))return '';const L=list().filter(x=>x.site===s.id).sort((a,b)=>(OPEN(b)-OPEN(a))||((b.ts||0)-(a.ts||0)));
  return '<div class="card" id="orrJob" data-p2t="over"><div class="row" style="align-items:center;margin-bottom:6px"><b style="font-size:13px;letter-spacing:.5px;text-transform:uppercase;color:var(--g4)">O&amp;R</b><span style="color:var(--blue-mid);cursor:pointer;font-size:13px;font-weight:600" onclick="ORR.add(\''+jsq(s.id)+'\')">+ '+esc(tt('New request'))+'</span></div>'+(L.length?L.map(card).join(''):'<div style="font-size:13px;color:var(--g4)">None yet.</div>')+'</div>';}
function refreshFolder(){try{const f=$('m-folder');if(f&&!f.classList.contains('hid')&&typeof fdSite!=='undefined'&&fdSite){const s=D.sites.find(x=>x.id===fdSite);const old=$('orrJob');if(s&&old){const d=document.createElement('div');d.innerHTML=folderBox(s);old.replaceWith(d.firstChild);}}}catch(e){}}
if(typeof window.openFolder==='function'){const _of=window.openFolder;window.openFolder=function(id){const r=_of.apply(this,arguments);try{const s=D.sites.find(x=>x.id===id);const ov=$('fdOverview');if(s&&ov&&!$('orrJob')){const h=folderBox(s);if(h){const d=document.createElement('div');d.innerHTML=h;ov.insertBefore(d.firstChild,ov.firstChild);}}}catch(e){console.error('p6 folder',e);}return r;};}

/* ───────── Home: a line when something needs a follow-up ───────── */
if(typeof window.renderHome==='function'){const _rh=window.renderHome;window.renderHome=function(){const r=_rh.apply(this,arguments);try{const m=M();const el=$('homeBody');if(m&&el&&staff(m)&&!$('p6home')){const n=list().filter(needsFollow).length;if(n){const d=document.createElement('div');d.className='card';d.id='p6home';d.setAttribute('onclick',"ORR.filter('follow');goTab('orr')");
    d.innerHTML='<span class="n">'+n+'</span><div style="flex:1"><b style="font-size:14px">O&amp;R</b><div style="font-size:12px;color:var(--g4)">'+n+' '+esc(tt('need follow-up'))+'</div></div><span style="color:var(--g4)">›</span>';
    const anchor=$('p5short')||$('p4next');el.insertBefore(d,anchor?anchor.nextSibling:el.children[1]||null);}}}catch(e){console.error('p6 home',e);}return r;};}

})();
