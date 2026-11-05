/* Electrix USA — P10: the Tasks page (Baruch 2026-10-29 00:51 picked ideas 2, 5, 8, 9, 10, 14, 17, 19, 20).
   No more Trello-style board. One page, in this order:
     ✅ Check it   — tasks you asked to check that someone finished (#17): ✓ OK / ✗ Not done right
     🔴 Urgent     — always on top (#9)
     📍 Today's job — the tasks for the job your crew is on today, first (#20)
     then every job with its tasks (#2), each task one checklist line (#5) with ✓✓ seen marks (#8),
     📷 "photo needed" (#10) and crew progress 2/3 when each crew member ticks his part (#14).
   New-task options: 📷 Photo needed · ✅ I check it when done · 👥 Each one ticks his part.
   The chat inside a task (#19) stays WhatsApp-style; the old "List" picker is gone with the board.
   Off: window.EX_P10_OFF. */
(function(){
if(window.EX_P10_OFF)return;
const $=id=>document.getElementById(id);
const tt=x=>{try{return typeof t==='function'?t(x):x;}catch(e){return x;}};
const M=()=>{try{return me();}catch(e){return null;}};
/* Baruch 11/4 22:49: "Change Shia tasks layout for now away from Trello to the kind of task the guys have" —
   these office people get the crews' task page too (by first name; add more here). They keep + New task and the filters. */
const LIST_OFFICE=['shia'];
const officeList=m=>!!m&&m.role!=='worker'&&LIST_OFFICE.includes(String(m.name||'').trim().split(/\s+/)[0].toLowerCase());
const listView=m=>!!m&&(m.role==='worker'||officeList(m));
window.P10_listView=listView;
/* Baruch 11/4 23:01: "Show by: Job | Type" — Type = kind of work. Every task gets a type: the one picked on it (j.kind),
   else the app's own tasks (O&R, rough complete billing/inspection, inspections) and else a guess from the words. */
const TYPES=[['insp','🏛','Inspections'],['bill','🧾','Billing'],['mat','📦','Material'],['orr','⚡','O&R'],['pay','⏱','Payroll'],['est','📐','Estimates'],['coll','💵','Collections'],['other','•','Other']];
const TYPE_IDS=TYPES.map(x=>x[0]);
function guessType(txt){const s=' '+String(txt||'').toLowerCase()+' ';
  if(/inspect|inspecci/.test(s))return 'insp';
  if(/collect|cobrar|cobro|\bpayment|\bpago/.test(s))return 'coll';
  if(/\bbill|invoice|factur/.test(s))return 'bill';
  if(/estimate|estimado|presupuesto|\bquote|\bprice it|cotiz/.test(s))return 'est';
  if(/payroll|fingercheck|timesheet|\bhours\b|n[oó]mina|\bhoras\b/.test(s))return 'pay';
  if(/o&r|\boru\b|orange (and|&) rockland|\bmeter|medidor|temp service|cut-in|cut in card|utility/.test(s))return 'orr';
  if(/material|\border\b|pick ?up|garage|deliver|entrega|pedido/.test(s))return 'mat';
  return 'other';}
function typeOf(j){if(j&&TYPE_IDS.includes(j.kind))return j.kind;if(!j)return 'other';
  if(j.orr||j.orrAuto)return 'orr';if(j.insp)return 'insp';if(j.mat||j.matReq)return 'mat';
  return guessType([j.desc,j.descTr].filter(Boolean).join(' '));}
window.P10_typeOf=typeOf;
const byGet=()=>{try{return localStorage.getItem('p10by')==='type'?'type':'job';}catch(e){return 'job';}};
const day0=()=>{const d=new Date();d.setHours(0,0,0,0);return d.getTime();};
const OPEN=j=>j&&j.status!=='done'&&!j.deleted;
const due=j=>{try{return gpDue(j);}catch(e){return null;}};
const late=j=>{const d=due(j);return d!==null&&d<day0();};
const crewMembers=j=>{const out=[];tos(j).forEach(id=>{const c=(D.crews||[]).find(x=>x.id===id);if(c)(D.emps||[]).filter(e=>e.crew===c.id&&!e.inactive).forEach(e=>out.push(e.id));});return [...new Set(out)];};
const short=s=>String(s||'').split(',')[0];
const txt=j=>{let x='';try{x=jobText(j);}catch(e){x=j.desc||'';}return String(x||'').replace(/^O&R · [^:]*: /,'');};
const css=`
#pg-jobs.p10 #jobChips,#pg-jobs.p10 #p2snzNote,#pg-jobs.p10 .stats,#pg-jobs.p10:not(.p10keep) #addJobBtn{display:none!important}
html body #pg-jobs.p10 #vOpen,html body #pg-jobs.p10 #vDone{padding:5px 8px!important;font-size:13px!important;min-height:0!important;height:auto!important;line-height:1.3!important}
html body #pg-jobs.p10 #vOpen{border-radius:8px!important}html body #pg-jobs.p10 div:has(>#vOpen){padding:3px!important;border-radius:10px!important;margin-bottom:6px!important}
#pg-jobs.p10 #vOpen{border-radius:8px!important}#pg-jobs.p10 #vOpen:not(.on),#pg-jobs.p10 #vDone:not(.on){background:none!important}
.p10sec{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--g4);margin:12px 0 2px}
.p10sec.r{color:#d93a2b}.p10sec.g{color:#1f8a4c}
.p10job{display:flex;align-items:baseline;gap:8px;margin:14px 0 0;cursor:pointer}
.p10job b{font-size:13px;font-weight:700;letter-spacing:.2px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--g5)}
.p10job span{font-size:11.5px;color:var(--g4);font-weight:600;flex:none}
.p10job.fold+.p10grp{display:none}
.p10r{display:flex;gap:10px;align-items:flex-start;padding:7px 0;cursor:pointer}
.p10r+.p10r{border-top:.5px solid var(--g1)}
html[data-theme=dark] .p10r+.p10r{border-color:#2c2c2e}
.p10c{flex:none;width:19px;height:19px;border-radius:50%;border:1.5px solid #c7c7cc;background:none;margin-top:1px;padding:0;cursor:pointer}
.p10r.pri .p10c,.p10r.late .p10c{border-color:#d93a2b}
.p10r .w{flex:1;min-width:0}.p10r .w b{display:block;font-weight:500;font-size:14px;line-height:1.3}
.p10r .w small{display:block;color:var(--g4);font-size:11.5px;margin-top:1px}
.p10r .w small .l{color:#d93a2b;font-weight:600}
.p10u{display:inline-block;color:#d93a2b;font-size:10px;font-weight:800;letter-spacing:.3px;margin-right:5px;vertical-align:1px}
.p10ph{display:inline-block;color:#2563eb;font-size:10.5px;font-weight:700;margin-left:4px}
.p10rt{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:11px;color:var(--g4);font-weight:600}
.p10rt .p10pg{color:#1f8a4c}.p10rt .tick svg{transform:scale(.85)}
.p10today{border-left:3px solid var(--g5);padding:2px 0 2px 10px;margin:10px 0 2px}
html[data-theme=dark] .p10today{border-color:#fff}
.p10today .k{font-size:10.5px;font-weight:700;letter-spacing:.6px;color:var(--g4)}
.p10today .a{font-size:15px;font-weight:700;margin:0 0 2px}
.p10pri{border-left:3px solid #d93a2b;padding:0 0 0 10px}
.p10chk{border-left:3px solid #2fb36b;padding:2px 0 4px 10px;margin:4px 0 8px}
.p10chk b{font-size:13.5px;font-weight:600}.p10chk small{display:block;color:var(--g4);font-size:11.5px;margin-top:1px}
.p10chk .ph{display:flex;gap:5px;margin-top:6px;overflow-x:auto}.p10chk .ph img{width:44px;height:44px;object-fit:cover;border-radius:7px;flex:none}
.p10chk .bt{display:flex;gap:6px;margin-top:7px}.p10chk .bt button{border:none;border-radius:999px;padding:6px 12px;font:600 12.5px/1 inherit;font-family:inherit;cursor:pointer}
.p10chk .ok{background:#2fb36b;color:#fff}.p10chk .no{background:var(--g1);color:#d93a2b}
.p10empty{text-align:center;color:var(--g4);padding:26px 0;font-size:13px}
.p10opt{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
#p10opts.p10opt button{border:none!important;box-shadow:0 0 0 1px var(--g2)!important;width:auto!important;background:#fff!important;border-radius:999px;padding:7px 11px;font:600 12.5px/1 inherit;font-family:inherit;color:var(--g5);cursor:pointer}
#p10opts.p10opt button.on{background:#1c1c1e!important;color:#fff!important}
html[data-theme=dark] #p10opts.p10opt button.on{background:#fff!important;color:#000!important}
#m-jobd .jdcol,#m-jobd [data-bcol]{display:none!important}
`;
const st=document.createElement('style');st.id='p10css';st.textContent=css;document.body.appendChild(st);
const fold=k=>{try{return localStorage.getItem('p10f_'+k)==='1';}catch(e){return false;}};
window.P10={};
P10.fold=k=>{const f=!fold(k);try{localStorage.setItem('p10f_'+k,f?'1':'0');}catch(e){}const h=document.querySelector('.p10job[data-k="'+k+'"]');if(h)h.classList.toggle('fold',f);};

function row(j,m,inPri,showSite){const I=jsq(j.id);const pri=!!j.pri,lt=late(j);
  const where=showSite&&j.site?esc(short(siteName(j.site))):'';
  const from=j.from&&j.from!==m.id?tt('from')+' '+esc(String(nameOf(j.from)).split(' ')[0]):'';
  const to=j.from===m.id&&!has(j,m.id)?'→ '+esc(tos(j).map(id=>String(nameOf(id)).split(' ')[0]).join(', ')):'';
  const dl=j.due?(lt?'<span class="l">'+esc(tt('Late'))+'</span>':esc(tt(j.due))):'';
  let prog='';if(j.each){const P=crewMembers(j);if(P.length)prog='<span class="p10pg">'+P.filter(id=>j['done_'+id]).length+'/'+P.length+'</span>';}
  let tick='';try{tick=jobTicks(j);}catch(e){}
  return '<div class="p10r'+(pri?' pri':'')+(lt?' late':'')+'" onclick="openJobDetail(\''+I+'\')"><button class="p10c" aria-label="Done" onclick="event.stopPropagation();markDone(\''+I+'\')"></button>'
    +'<div class="w"><b>'+(pri&&!inPri?'<span class="p10u">'+esc(tt('URGENT'))+'</span>':'')+esc(txt(j))+(j.needPhoto?'<span class="p10ph">📷 '+esc(tt('photo needed'))+'</span>':'')+'</b>'
    +'<small>'+[where,from,to,dl].filter(Boolean).join(' · ')+'</small></div>'
    +'<span class="p10rt">'+tick+prog+'</span></div>';}
function checkCard(j){const I=jsq(j.id);const ph=(j.photos||[]).filter(p=>p&&p.d).slice(-4);
  return '<div class="p10chk"><b>✓ '+esc(String(nameOf(j.doneBy||'')).split(' ')[0])+' '+esc(tt('finished'))+': '+esc(txt(j))+'</b>'
    +'<small>'+(j.site?esc(short(siteName(j.site)))+' · ':'')+(j.doneAt?esc(new Date(j.doneAt).toLocaleString(LOC(),{weekday:'short',hour:'numeric',minute:'2-digit'})):'')+'</small>'
    +(ph.length?'<div class="ph">'+ph.map(p=>'<img src="'+safeSrc(p.d)+'" onclick="openJobDetail(\''+I+'\')">').join('')+'</div>':'')
    +'<div class="bt"><button class="ok" onclick="P10.ok(\''+I+'\')">✓ '+esc(tt('OK'))+'</button><button class="no" onclick="P10.bad(\''+I+'\')">✗ '+esc(tt('Not done right'))+'</button></div></div>';}

function render(){const m=M();const el=$('jobList');const pg=$('pg-jobs');if(!m||!el||!pg)return;
  const searching=(()=>{const fr=$('jobFindRes');return fr&&fr.innerHTML.trim();})();
  const on=typeof jobView==='undefined'||jobView==='open';
  /* Baruch 10/29 01:27: the new page is a trial for the field guys only — the office and owner keep their board.
     They only get the small "Check it" list above the board when someone finished a task they asked to check. */
  const field=listView(m);pg.classList.toggle('p10',field&&on&&!searching);pg.classList.toggle('p10keep',officeList(m));
  let cb=$('p10chkbox');if(!cb){cb=document.createElement('div');cb.id='p10chkbox';el.parentNode.insertBefore(cb,el);}cb.innerHTML='';
  if(!field){if(on&&!searching){const ck=(D.jobs||[]).filter(j=>j&&!j.deleted&&j.status==='done'&&j.check&&j.chk==='wait'&&j.from===m.id);
      if(ck.length)cb.innerHTML='<div class="p10sec g"><span>✅ '+esc(tt('Check it'))+'</span><span>'+ck.length+'</span></div>'+ck.map(checkCard).join('');}return;}
  if(!on||searching)return;
  let L=[];try{L=visibleJobs().filter(OPEN);}catch(e){L=(D.jobs||[]).filter(OPEN);}
  const chk=(D.jobs||[]).filter(j=>j&&!j.deleted&&j.status==='done'&&j.check&&j.chk==='wait'&&j.from===m.id).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  const sortT=(a,b)=>(late(b)-late(a))||((due(a)===null)-(due(b)===null))||((due(a)||0)-(due(b)||0))||((b.ts||0)-(a.ts||0));
  let h='';
  if(chk.length)h+='<div class="p10sec g"><span>✅ '+esc(tt('Check it'))+'</span><span>'+chk.length+'</span></div>'+chk.map(checkCard).join('');
  const pri=L.filter(j=>j.pri).sort(sortT);const rest=L.filter(j=>!j.pri);
  const office=officeList(m),byType=office&&byGet()==='type';
  if(office)h='<div class="p10by"><span>'+esc(tt('Show by'))+'</span><button class="'+(byType?'':'on')+'" onclick="P10.by(\'job\')">'+esc(tt('Job'))+'</button><button class="'+(byType?'on':'')+'" onclick="P10.by(\'type\')">'+esc(tt('Type'))+'</button></div>'+h;
  if(pri.length)h+='<div class="p10sec r"><span>🔴 '+esc(tt('Urgent'))+'</span><span>'+pri.length+'</span></div><div class="p10pri">'+pri.map(j=>row(j,m,true,office)).join('')+'</div>';
  if(byType){const TG={};rest.forEach(j=>{const k=typeOf(j);(TG[k]=TG[k]||[]).push(j);});
    TYPES.forEach(([k,ic,lab])=>{const g=(TG[k]||[]).sort(sortT);if(!g.length)return;const fk='t_'+k;const lateN=g.filter(late).length;
      h+='<div class="p10job'+(fold(fk)?' fold':'')+'" data-k="'+esc(fk)+'" onclick="P10.fold(\''+fk+'\')"><b>'+ic+' '+esc(tt(lab))+'</b><span>'+(lateN?'<span style="color:#d93a2b">'+lateN+' '+esc(tt('late'))+'</span> · ':'')+g.length+' ▾</span></div>'
        +'<div class="p10grp">'+g.map(j=>row(j,m,false,true)).join('')+'</div>';});
    if(!rest.length&&!pri.length&&!chk.length)h+='<div class="p10empty">✓ '+esc(tt('All caught up.'))+'</div>';
    el.innerHTML=h;return;}
  // today's job first (field people: the job their crew is on today)
  let tsite=null;try{if(m.crew){const sl=schedDay(m.crew+'|'+dkey(new Date()));if(sl&&sl.site)tsite=sl.site;}}catch(e){}
  const tL=tsite?rest.filter(j=>j.site===tsite).sort(sortT):[];
  if(tL.length)h+='<div class="p10today"><div class="k">📍 '+esc(tt("TODAY'S JOB"))+'</div><div class="a">'+esc(short(siteName(tsite)))+'</div>'+tL.map(j=>row(j,m)).join('')+'</div>';
  // every other job, its tasks under it
  const G={};rest.filter(j=>!(tsite&&j.site===tsite)).forEach(j=>{const k=j.site||'';(G[k]=G[k]||[]).push(j);});
  const keys=Object.keys(G).sort((a,b)=>(!a)-(!b)||(G[b].some(late)-G[a].some(late))||String(siteName(a)).localeCompare(String(siteName(b))));
  keys.forEach(k=>{const g=G[k].sort(sortT);const fk=k||'none';const lateN=g.filter(late).length;
    h+='<div class="p10job'+(fold(fk)?' fold':'')+'" data-k="'+esc(fk)+'" onclick="P10.fold(\''+jsq(fk)+'\')"><b>'+esc(k?short(siteName(k)):tt('Other tasks'))+'</b><span>'+(lateN?'<span style="color:#d93a2b">'+lateN+' '+esc(tt('late'))+'</span> · ':'')+g.length+' ▾</span></div>'
      +'<div class="p10grp">'+g.map(j=>row(j,m)).join('')+'</div>';});
  if(!h||(office&&!L.length&&!chk.length))h+='<div class="p10empty">✓ '+esc(tt('All caught up.'))+'</div>';
  el.innerHTML=h;}
P10.render=render;
P10.by=v=>{try{localStorage.setItem('p10by',v==='type'?'type':'job');}catch(e){}render();};
// pick / change a task's type (new task form + task detail)
const typeChips=(cur,fn)=>'<div class="p10types">'+TYPES.map(([k,ic,lab])=>'<button type="button" data-t="'+k+'" class="'+(cur===k?'on':'')+'" onclick="'+fn+'(\''+k+'\',this)">'+ic+' '+esc(tt(lab))+'</button>').join('')+'</div>';
P10.setType=(id,k,btn)=>{const j=(D.jobs||[]).find(x=>x.id===id);if(!j||!TYPE_IDS.includes(k))return;j.kind=k;save();
  try{const box=btn&&btn.parentNode;if(box)box.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.t===k));}catch(e){}try{render();}catch(e){}};
P10.pickNew=(k,btn)=>{window._p10kind=k;window._p10kindHand=true;try{btn.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.t===k));}catch(e){}};
if(typeof window.renderJobs==='function'){const _rj=window.renderJobs;window.renderJobs=function(){const r=_rj.apply(this,arguments);try{render();}catch(e){console.error('p10',e);}return r;};try{renderJobs=window.renderJobs;}catch(x){}}

/* ── done: photo needed (#10), each crew member ticks his part (#14), check it (#17) ── */
function finish(j,m){j.status='done';j.doneAt=Date.now();j.doneBy=m.id;
  if(j.check&&j.from&&j.from!==m.id){j.chk='wait';try{pushTo([j.from],()=>('✅ '+nameOf(m.id)+' '+t('finished')+': '+String(j.desc||'').slice(0,60)+' — '+t('check it')),'info',{job:j.id});}catch(e){}}
  save();try{renderJobs();}catch(e){}try{if(typeof renderHome==='function'&&$('pg-home').classList.contains('on'))renderHome();}catch(e){}toast('✓ '+tt('Done'),'green');}
if(typeof window.markDone==='function'){const _md=window.markDone;window.markDone=function(id){const j=(D.jobs||[]).find(x=>x.id===id);const m=M();
  if(!j||!m||j.insp||!(j.needPhoto||j.each||j.check))return _md.apply(this,arguments);
  try{buzz(20);}catch(e){}
  if(j.needPhoto&&!((j.photos&&j.photos.length)||j.photo)){toast('📷 '+tt('This task needs a photo — take it first'));try{addPhoto(id);}catch(e){}return;}
  if(j.each){const P=crewMembers(j);if(P.includes(m.id)){j['done_'+m.id]=Date.now();const left=P.filter(x=>!j['done_'+x]);
      if(left.length){save();try{renderJobs();}catch(e){}toast('✓ '+tt('Your part is done')+' · '+(P.length-left.length)+'/'+P.length,'green');return;}}}
  finish(j,m);};try{markDone=window.markDone;}catch(x){}}
P10.ok=id=>{const j=(D.jobs||[]).find(x=>x.id===id);const m=M();if(!j||!m)return;j.chk='ok';j.chkBy=m.id;j.chkAt=Date.now();save();render();toast('✓ '+tt('Checked'),'green');};
P10.bad=id=>{const j=(D.jobs||[]).find(x=>x.id===id);const m=M();if(!j||!m)return;
  askPrompt(tt('Not done right'),[{label:tt('What needs fixing?'),value:''}],([note])=>{note=String(note||'').trim();
    const who=j.doneBy;j.status='open';j.chk='';delete j.doneAt;delete j.doneBy;Object.keys(j).forEach(k=>{if(k.startsWith('done_'))delete j[k];});
    const cid=nid('cm');j['m_'+cid]={by:m.id,ts:Date.now(),text:'✗ '+tt('Not done right')+(note?': '+note:'')};
    try{const to=[...new Set([who,...tos(j).filter(x=>(D.emps||[]).some(e=>e.id===x))].filter(x=>x&&x!==m.id))];if(to.length)pushTo(to,()=>('✗ '+t('Not done right')+': '+String(j.desc||'').slice(0,50)+(note?' — '+note:'')),'pri',{job:j.id});}catch(e){}
    save();render();toast('↩ '+tt('Sent back'),'green');});};

/* ── new task: the 3 new options ── */
const OPTS=[['needPhoto','📷 Photo needed'],['check','✅ I check it when done'],['each','👥 Each one ticks his part']];
if(typeof window.openJob==='function'){const _oj=window.openJob;window.openJob=function(){const r=_oj.apply(this,arguments);try{
    let box=$('p10opts');if(!box){const pri=$('jPri');const tog=pri&&pri.closest('.tog');if(tog){box=document.createElement('div');box.id='p10opts';box.className='p10opt';tog.parentNode.insertBefore(box,tog.nextSibling);}}
    if(box)box.innerHTML=OPTS.map(([k,l])=>'<button type="button" data-k="'+k+'" onclick="this.classList.toggle(\'on\')">'+esc(tt(l))+'</button>').join('');
    let tb=$('p10newtype');if(tb)tb.remove();window._p10kind='';window._p10kindHand=false;
    if(officeList(M())&&box){tb=document.createElement('div');tb.id='p10newtype';tb.innerHTML='<label>'+esc(tt('Type'))+'</label>'+typeChips('', 'P10.pickNew');box.parentNode.insertBefore(tb,box.nextSibling);
      const ds=$('jDesc');const upd=()=>{if(window._p10kindHand)return;const g=guessType(ds.value);window._p10kind=g==='other'?'':g;tb.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.t===window._p10kind));};
      if(ds&&!ds._p10t){ds._p10t=1;ds.addEventListener('input',upd);}upd();}}catch(e){}return r;};try{openJob=window.openJob;}catch(x){}}
if(typeof window.saveJob==='function'){const _sj=window.saveJob;window.saveJob=function(){const before=(D.jobs[0]||{}).id;const on={};document.querySelectorAll('#p10opts button.on').forEach(b=>on[b.dataset.k]=true);
  const kind=window._p10kind||'';const r=_sj.apply(this,arguments);try{const j=D.jobs[0];if(j&&j.id!==before&&kind&&TYPE_IDS.includes(kind)){j.kind=kind;save();render();}}catch(e){}window._p10kind='';
  try{const j=D.jobs[0];if(j&&j.id!==before&&(on.needPhoto||on.check||on.each)){if(on.needPhoto)j.needPhoto=true;if(on.check)j.check=true;if(on.each&&crewMembers(j).length)j.each=true;save();render();}}catch(e){}return r;};try{saveJob=window.saveJob;}catch(x){}}

(function(){const st=document.createElement('style');st.textContent=`
.p10by{display:flex;align-items:center;gap:4px;margin:2px 0 10px;padding:3px;border-radius:11px;background:var(--g1,#ebecef);width:max-content}
.p10by span{font-size:12px;color:var(--g4);padding:0 6px 0 8px}
.p10by button{border:0;background:none;font-size:13px;font-weight:600;padding:6px 14px;border-radius:8px;color:var(--g5,#555)}
.p10by button.on{background:var(--card,#fff);color:var(--ink,#111);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.p10types{display:flex;flex-wrap:wrap;gap:6px}
.p10types button{border:1px solid var(--g2,#dcdde1);background:var(--card,#fff);color:var(--ink,#111);border-radius:16px;padding:5px 10px;font-size:12.5px}
.p10types button.on{background:#1f2937;color:#fff;border-color:#1f2937}
[data-theme=dark] .p10types button.on{background:#e5e7eb;color:#111;border-color:#e5e7eb}
#p10newtype{margin-top:10px}#p10newtype label{display:block;margin-bottom:5px}
`;document.head.appendChild(st);})();
try{if(typeof ES==='object')Object.assign(ES,{"Show by":"Ver por","Job":"Trabajo","Type":"Tipo","Inspections":"Inspecciones","Billing":"Facturación","Material":"Material","O&R":"O&R","Payroll":"Nómina","Estimates":"Estimados","Collections":"Cobros","Other":"Otras"});}catch(e){}
try{if(typeof ES==='object')Object.assign(ES,{"Check it":"Revisar","check it":"revísalo","finished":"terminó","OK":"Bien","Not done right":"No quedó bien","What needs fixing?":"¿Qué hay que arreglar?","Sent back":"Devuelto","Checked":"Revisado","Urgent":"Urgente","URGENT":"URGENTE","TODAY'S JOB":"TRABAJO DE HOY","Other tasks":"Otras tareas","late":"atrasadas","Late":"Atrasada","photo needed":"foto necesaria","This task needs a photo — take it first":"Esta tarea necesita una foto — tómala primero","Your part is done":"Tu parte está lista","📷 Photo needed":"📷 Foto necesaria","✅ I check it when done":"✅ Lo reviso al terminar","👥 Each one ticks his part":"👥 Cada uno marca su parte","All caught up.":"Todo al día.","Each one ticks his part":"Cada uno marca su parte","done":"listo","not yet":"todavía no","will be checked when done":"se revisa al terminar"});}catch(e){}
// a crew task: each one ticks his part — who did, who didn't (#14); photo needed / check it shown on the task (#10, #17)
if(typeof window.openJobDetail==='function'){const _oj2=window.openJobDetail;window.openJobDetail=function(id){const r=_oj2.apply(this,arguments);try{const j=(D.jobs||[]).find(x=>x.id===id);const ch=$('jdChat');if(!j||!ch)return r;
    const old=$('p10each');if(old)old.remove();let h='';
    if(j.each){const P=crewMembers(j);if(P.length)h+='<div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:var(--g4);text-transform:uppercase;margin:4px 0 2px">'+esc(tt('Each one ticks his part'))+' · '+P.filter(x=>j['done_'+x]).length+'/'+P.length+'</div>'
      +P.map(x=>'<div style="display:flex;align-items:center;gap:10px;padding:6px 0"><span style="width:20px;height:20px;border-radius:50%;flex:none;'+(j['done_'+x]?'background:#2fb36b':'border:2px solid #c7c7cc')+'"></span><b style="font-weight:600;flex:1">'+esc(nameOf(x))+'</b><span style="font-size:12.5px;color:var(--g4)">'+(j['done_'+x]?esc(tt('done'))+' '+new Date(j['done_'+x]).toLocaleTimeString(LOC(),{hour:'numeric',minute:'2-digit'}):esc(tt('not yet')))+'</span></div>').join('');}
    const tags=[j.needPhoto?'📷 '+tt('photo needed'):'',j.check?'✅ '+tt('will be checked when done'):'',j.chk==='ok'?'✓ '+tt('Checked'):''].filter(Boolean);
    if(tags.length)h='<div style="font-size:12.5px;font-weight:600;color:#2563eb;margin-bottom:4px">'+tags.map(esc).join(' · ')+'</div>'+h;
    const ot=$('p10dtype');if(ot)ot.remove();
    if(officeList(M())){const d2=document.createElement('div');d2.id='p10dtype';d2.style.cssText='margin:6px 0 8px';d2.innerHTML='<div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:var(--g4);text-transform:uppercase;margin-bottom:5px">'+esc(tt('Type'))+'</div>'+typeChips(typeOf(j),'P10.setType.bind(null,\''+jsq(j.id)+'\')');ch.parentNode.insertBefore(d2,ch);}
    if(h){const d=document.createElement('div');d.id='p10each';d.className='card';d.style.cssText='padding:10px 13px;margin:8px 0';d.innerHTML=h;ch.parentNode.insertBefore(d,ch);}
  }catch(e){}return r;};try{openJobDetail=window.openJobDetail;}catch(x){}}
// the board's "List" picker goes with the board
if(typeof window.bDetailCol==='function'){const _bd=window.bDetailCol;window.bDetailCol=function(){const m=M();return listView(m)?'':_bd.apply(this,arguments);};try{bDetailCol=window.bDetailCol;}catch(x){}}
try{if($('pg-jobs')&&$('pg-jobs').classList.contains('on'))renderJobs();}catch(e){}
})();
