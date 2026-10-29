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
const day0=()=>{const d=new Date();d.setHours(0,0,0,0);return d.getTime();};
const OPEN=j=>j&&j.status!=='done'&&!j.deleted;
const due=j=>{try{return gpDue(j);}catch(e){return null;}};
const late=j=>{const d=due(j);return d!==null&&d<day0();};
const crewMembers=j=>{const out=[];tos(j).forEach(id=>{const c=(D.crews||[]).find(x=>x.id===id);if(c)(D.emps||[]).filter(e=>e.crew===c.id&&!e.inactive).forEach(e=>out.push(e.id));});return [...new Set(out)];};
const short=s=>String(s||'').split(',')[0];
const txt=j=>{let x='';try{x=jobText(j);}catch(e){x=j.desc||'';}return String(x||'').replace(/^O&R · [^:]*: /,'');};
const css=`
#pg-jobs.p10 #jobChips,#pg-jobs.p10 #p2snzNote,#pg-jobs.p10 .stats{display:none!important}
.p10sec{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--g4);margin:16px 2px 4px}
.p10sec.r{color:#d93a2b}.p10sec.g{color:#1f8a4c}
.p10job{display:flex;align-items:baseline;gap:8px;margin:18px 2px 2px;cursor:pointer}
.p10job b{font-size:17px;font-weight:700;letter-spacing:-.2px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.p10job span{font-size:12.5px;color:var(--g4);font-weight:600;flex:none}
.p10job.fold+.p10grp{display:none}
.p10r{display:flex;gap:12px;align-items:flex-start;padding:10px 2px;border-bottom:.5px solid var(--g2);cursor:pointer}
.p10grp .p10r:last-child{border-bottom:none}
.p10c{flex:none;width:24px;height:24px;border-radius:50%;border:2px solid #c7c7cc;background:none;margin-top:1px;padding:0;cursor:pointer}
.p10r.pri .p10c,.p10r.late .p10c{border-color:#d93a2b}
.p10r .w{flex:1;min-width:0}.p10r .w b{display:block;font-weight:500;font-size:15.5px;line-height:1.3}
.p10r .w small{display:block;color:var(--g4);font-size:12.5px;margin-top:2px}
.p10r .w small .l{color:#d93a2b;font-weight:600}
.p10u{display:inline-block;background:#d93a2b;color:#fff;font-size:10.5px;font-weight:700;border-radius:5px;padding:1px 5px;margin-right:6px;vertical-align:2px}
.p10ph{display:inline-block;color:#2563eb;font-size:11.5px;font-weight:700;margin-left:4px}
.p10rt{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:3px;font-size:12px;color:var(--g4);font-weight:600}
.p10rt .p10pg{color:#1f8a4c}
.p10today{background:#1c1c1e;color:#fff;border-radius:16px;padding:12px 14px 4px;margin:10px 0 4px}
html[data-theme=dark] .p10today{background:#2c2c2e}
.p10today .k{font-size:11px;font-weight:700;letter-spacing:.5px;opacity:.7}
.p10today .a{font-size:19px;font-weight:800;margin:2px 0 4px}
.p10today .p10r{border-color:#3a3a3c}.p10today .p10r .w small{color:#aeaeb2}.p10today .p10c{border-color:#8e8e93}
.p10pri{background:#fff;border-radius:14px;padding:2px 12px;border-left:4px solid #d93a2b;box-shadow:0 0 0 .5px rgba(0,0,0,.06)}
html[data-theme=dark] .p10pri{background:#1c1c1e}
.p10chk{background:#fff;border-radius:16px;padding:12px 14px;margin:6px 0;box-shadow:0 0 0 .5px rgba(0,0,0,.06)}
html[data-theme=dark] .p10chk{background:#1c1c1e}
.p10chk b{font-size:15.5px}.p10chk small{display:block;color:var(--g4);font-size:12.5px;margin-top:2px}
.p10chk .ph{display:flex;gap:6px;margin-top:8px;overflow-x:auto}.p10chk .ph img{width:70px;height:70px;object-fit:cover;border-radius:10px;flex:none}
.p10chk .bt{display:flex;gap:8px;margin-top:10px}.p10chk .bt button{flex:1;border:none;border-radius:11px;padding:10px;font:700 14px/1 inherit;font-family:inherit;cursor:pointer}
.p10chk .ok{background:#2fb36b;color:#fff}.p10chk .no{background:#fbe9e7;color:#d93a2b}
.p10empty{text-align:center;color:var(--g4);padding:30px 0;font-size:14px}
.p10opt{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
#p10opts.p10opt button{border:none!important;box-shadow:0 0 0 1px var(--g2)!important;width:auto!important;background:#fff!important;border-radius:999px;padding:8px 12px;font:600 13px/1 inherit;font-family:inherit;background:var(--g1);color:var(--g5);cursor:pointer}
#p10opts.p10opt button.on{background:#1c1c1e!important;color:#fff!important}
html[data-theme=dark] #p10opts.p10opt button.on{background:#fff!important;color:#000!important}
#m-jobd .jdcol,#m-jobd [data-bcol]{display:none!important}
`;
const st=document.createElement('style');st.id='p10css';st.textContent=css;document.body.appendChild(st);
const fold=k=>{try{return localStorage.getItem('p10f_'+k)==='1';}catch(e){return false;}};
window.P10={};
P10.fold=k=>{const f=!fold(k);try{localStorage.setItem('p10f_'+k,f?'1':'0');}catch(e){}const h=document.querySelector('.p10job[data-k="'+k+'"]');if(h)h.classList.toggle('fold',f);};

function row(j,m){const I=jsq(j.id);const pri=!!j.pri,lt=late(j);
  const from=j.from&&j.from!==m.id?tt('from')+' '+esc(String(nameOf(j.from)).split(' ')[0]):'';
  const to=j.from===m.id&&!has(j,m.id)?'→ '+esc(tos(j).map(id=>String(nameOf(id)).split(' ')[0]).join(', ')):'';
  const dl=j.due?(lt?'<span class="l">'+esc(tt('Late'))+'</span>':esc(tt(j.due))):'';
  let prog='';if(j.each){const P=crewMembers(j);if(P.length)prog='<span class="p10pg">'+P.filter(id=>j['done_'+id]).length+'/'+P.length+'</span>';}
  let tick='';try{tick=jobTicks(j);}catch(e){}
  return '<div class="p10r'+(pri?' pri':'')+(lt?' late':'')+'" onclick="openJobDetail(\''+I+'\')"><button class="p10c" aria-label="Done" onclick="event.stopPropagation();markDone(\''+I+'\')"></button>'
    +'<div class="w"><b>'+(pri?'<span class="p10u">'+esc(tt('URGENT'))+'</span>':'')+esc(txt(j))+(j.needPhoto?'<span class="p10ph">📷 '+esc(tt('photo needed'))+'</span>':'')+'</b>'
    +'<small>'+[from,to,dl].filter(Boolean).join(' · ')+'</small></div>'
    +'<span class="p10rt">'+tick+prog+'</span></div>';}
function checkCard(j){const I=jsq(j.id);const ph=(j.photos||[]).filter(p=>p&&p.d).slice(-4);
  return '<div class="p10chk"><b>✓ '+esc(String(nameOf(j.doneBy||'')).split(' ')[0])+' '+esc(tt('finished'))+': '+esc(txt(j))+'</b>'
    +'<small>'+(j.site?esc(short(siteName(j.site)))+' · ':'')+(j.doneAt?esc(new Date(j.doneAt).toLocaleString(LOC(),{weekday:'short',hour:'numeric',minute:'2-digit'})):'')+'</small>'
    +(ph.length?'<div class="ph">'+ph.map(p=>'<img src="'+safeSrc(p.d)+'" onclick="openJobDetail(\''+I+'\')">').join('')+'</div>':'')
    +'<div class="bt"><button class="ok" onclick="P10.ok(\''+I+'\')">✓ '+esc(tt('OK'))+'</button><button class="no" onclick="P10.bad(\''+I+'\')">✗ '+esc(tt('Not done right'))+'</button></div></div>';}

function render(){const m=M();const el=$('jobList');const pg=$('pg-jobs');if(!m||!el||!pg)return;
  const searching=(()=>{const fr=$('jobFindRes');return fr&&fr.innerHTML.trim();})();
  const on=typeof jobView==='undefined'||jobView==='open';pg.classList.toggle('p10',on&&!searching);
  if(!on||searching)return;
  let L=[];try{L=visibleJobs().filter(OPEN);}catch(e){L=(D.jobs||[]).filter(OPEN);}
  const chk=(D.jobs||[]).filter(j=>j&&!j.deleted&&j.status==='done'&&j.check&&j.chk==='wait'&&j.from===m.id).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  const sortT=(a,b)=>(late(b)-late(a))||((due(a)===null)-(due(b)===null))||((due(a)||0)-(due(b)||0))||((b.ts||0)-(a.ts||0));
  let h='';
  if(chk.length)h+='<div class="p10sec g"><span>✅ '+esc(tt('Check it'))+'</span><span>'+chk.length+'</span></div>'+chk.map(checkCard).join('');
  const pri=L.filter(j=>j.pri).sort(sortT);const rest=L.filter(j=>!j.pri);
  if(pri.length)h+='<div class="p10sec r"><span>🔴 '+esc(tt('Urgent'))+'</span><span>'+pri.length+'</span></div><div class="p10pri">'+pri.map(j=>row(j,m)).join('')+'</div>';
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
  if(!h)h='<div class="p10empty">✓ '+esc(tt('All caught up.'))+'</div>';
  el.innerHTML=h;}
P10.render=render;
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
    if(box)box.innerHTML=OPTS.map(([k,l])=>'<button type="button" data-k="'+k+'" onclick="this.classList.toggle(\'on\')">'+esc(tt(l))+'</button>').join('');}catch(e){}return r;};try{openJob=window.openJob;}catch(x){}}
if(typeof window.saveJob==='function'){const _sj=window.saveJob;window.saveJob=function(){const before=(D.jobs[0]||{}).id;const on={};document.querySelectorAll('#p10opts button.on').forEach(b=>on[b.dataset.k]=true);
  const r=_sj.apply(this,arguments);try{const j=D.jobs[0];if(j&&j.id!==before&&(on.needPhoto||on.check||on.each)){if(on.needPhoto)j.needPhoto=true;if(on.check)j.check=true;if(on.each&&crewMembers(j).length)j.each=true;save();render();}}catch(e){}return r;};try{saveJob=window.saveJob;}catch(x){}}

try{if(typeof ES==='object')Object.assign(ES,{"Check it":"Revisar","check it":"revísalo","finished":"terminó","OK":"Bien","Not done right":"No quedó bien","What needs fixing?":"¿Qué hay que arreglar?","Sent back":"Devuelto","Checked":"Revisado","Urgent":"Urgente","URGENT":"URGENTE","TODAY'S JOB":"TRABAJO DE HOY","Other tasks":"Otras tareas","late":"atrasadas","Late":"Atrasada","photo needed":"foto necesaria","This task needs a photo — take it first":"Esta tarea necesita una foto — tómala primero","Your part is done":"Tu parte está lista","📷 Photo needed":"📷 Foto necesaria","✅ I check it when done":"✅ Lo reviso al terminar","👥 Each one ticks his part":"👥 Cada uno marca su parte","All caught up.":"Todo al día.","Each one ticks his part":"Cada uno marca su parte","done":"listo","not yet":"todavía no","will be checked when done":"se revisa al terminar"});}catch(e){}
// a crew task: each one ticks his part — who did, who didn't (#14); photo needed / check it shown on the task (#10, #17)
if(typeof window.openJobDetail==='function'){const _oj2=window.openJobDetail;window.openJobDetail=function(id){const r=_oj2.apply(this,arguments);try{const j=(D.jobs||[]).find(x=>x.id===id);const ch=$('jdChat');if(!j||!ch)return r;
    const old=$('p10each');if(old)old.remove();let h='';
    if(j.each){const P=crewMembers(j);if(P.length)h+='<div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:var(--g4);text-transform:uppercase;margin:4px 0 2px">'+esc(tt('Each one ticks his part'))+' · '+P.filter(x=>j['done_'+x]).length+'/'+P.length+'</div>'
      +P.map(x=>'<div style="display:flex;align-items:center;gap:10px;padding:6px 0"><span style="width:20px;height:20px;border-radius:50%;flex:none;'+(j['done_'+x]?'background:#2fb36b':'border:2px solid #c7c7cc')+'"></span><b style="font-weight:600;flex:1">'+esc(nameOf(x))+'</b><span style="font-size:12.5px;color:var(--g4)">'+(j['done_'+x]?esc(tt('done'))+' '+new Date(j['done_'+x]).toLocaleTimeString(LOC(),{hour:'numeric',minute:'2-digit'}):esc(tt('not yet')))+'</span></div>').join('');}
    const tags=[j.needPhoto?'📷 '+tt('photo needed'):'',j.check?'✅ '+tt('will be checked when done'):'',j.chk==='ok'?'✓ '+tt('Checked'):''].filter(Boolean);
    if(tags.length)h='<div style="font-size:12.5px;font-weight:600;color:#2563eb;margin-bottom:4px">'+tags.map(esc).join(' · ')+'</div>'+h;
    if(h){const d=document.createElement('div');d.id='p10each';d.className='card';d.style.cssText='padding:10px 13px;margin:8px 0';d.innerHTML=h;ch.parentNode.insertBefore(d,ch);}
  }catch(e){}return r;};try{openJobDetail=window.openJobDetail;}catch(x){}}
// the board's "List" picker goes with the board
if(typeof window.bDetailCol==='function'){window.bDetailCol=function(){return '';};try{bDetailCol=window.bDetailCol;}catch(x){}}
try{if($('pg-jobs')&&$('pg-jobs').classList.contains('on'))renderJobs();}catch(e){}
})();
