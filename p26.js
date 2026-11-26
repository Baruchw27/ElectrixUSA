/* Baruch 11/26: job search never offers a merged-away copy or a job whose Trello card is gone (crew 4 was booked on the old 379 Anderson).
   p26 — Booking made simple, on the card itself (Baruch 11/22, the 10 pictures he OK'd).
   The Schedule page looks the same. What changes:
   • ⋯ on a crew = Edit · Add another job · Copy (Send to another job / Split the crew / Change job are gone from it).
   • Edit: the card gets a blue outline and "Done". Tap the job → another job (This day · This week · Every workday, one tap saves);
     tap the hours → Start / Go home at; tap a man → move just him (or back to his crew); ✕ next to a job takes it off.
   • Add another job: pick the job, tap which men go there, Save.
   • Swipe left = Stay late (as before). Swipe right = Send to a different job (the Send screen: when / until).
   Every save writes the whole day (same records as before), so nothing piles up; the same job back to back is one piece;
   "Every workday" = Monday–Friday. Undo for 10 seconds works as before. */
(function(){
if(typeof D==='undefined'||!window.P23||!window.P21||window.P26)return;
const L26={'Edit':'Editar','Add another job':'Agregar otro trabajo','Copy':'Copiar','Done':'Listo','This day':'Este día','This week':'Esta semana','Every workday':'Cada día de trabajo',
 'Search jobs…':'Buscar trabajos…',"This crew's recent jobs":'Trabajos recientes de esta cuadrilla','Active jobs':'Trabajos activos','No jobs found':'No se encontraron trabajos',
 'Start':'Empieza','Go home at':'Se van a casa a las','Save':'Guardar','Cancel':'Cancelar','Who goes there?':'¿Quién va allí?','Pick at least one man':'Elija por lo menos un hombre',
 'Back to his crew':'Volver con su cuadrilla','All day':'Todo el día','From now':'Desde ahora','From a time':'Desde una hora','Move':'Mover','Take this job off?':'¿Quitar este trabajo?',
 'Take off':'Quitar','Saved':'Guardado','tap the job, the hours or a man on the card':'toque el trabajo, las horas o un hombre en la tarjeta','pick the job, then which men go there':'elija el trabajo y luego qué hombres van',
 "this crew's day to other days":'el día de esta cuadrilla a otros días','Send to another job':'Mandar a otro trabajo','Stay late':'Quedarse tarde','Send home':'Mandar a casa','Send':'Mandar',
 'Not saved':'No se guardó','Someone else changed this day first. Open it again and try once more.':'Otra persona cambió este día primero. Ábralo otra vez e intente de nuevo.',
 'The server did not accept this change.':'El servidor no aceptó este cambio.','Saved on this phone — it will be sent automatically':'Guardado en este teléfono — se mandará automáticamente',
 '"Every workday" needs one job all day':'"Cada día de trabajo" necesita un solo trabajo todo el día','No job of its own':'Sin trabajo propio','Monday–Friday':'lunes a viernes','Back':'Atrás','Book':'Reservar','the men go back to the crew':'los hombres vuelven a la cuadrilla','This day is a day off.':'Este día es día libre.'};
const T=s=>{try{return (lang()==='es'&&L26[s])||t(s);}catch(e){return s;}};const E=s=>esc(s==null?'':String(s));
const DAY_START=480,DAY_END=1140,FRI_END=795,MONFRI=[1,2,3,4,5];
const isFri=k=>new Date(k+'T12:00').getDay()===5;const endOf=k=>isFri(k)?FRI_END:DAY_END;
const addD=(k,n)=>{const d=new Date(k+'T12:00');d.setDate(d.getDate()+n);return dkey(d);};
const todayK=()=>dkey(new Date());const nowMin=()=>{const d=new Date();return d.getHours()*60+d.getMinutes();};
const fmtDay=k=>new Date(k+'T12:00').toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'});
const real=L=>(L||[]).filter(a=>a&&a.site&&a.start!=null);
const men=cid=>(D.emps||[]).filter(e=>e.crew===cid&&!e.inactive&&e.active!==false);
const crewName=cid=>{const c=D.crews.find(x=>x.id===cid);return c?c.name:nameOf(cid);};
const clean=a=>{const o={id:a.id&&a.id!=='ong'?a.id:newAsgId(),site:a.site,start:a.start,end:a.end==null?null:a.end,note:a.note||''};if(a.remind)o.remind=true;if(a.home)o.home=true;return o;};
// one clean day: in time order, each job ends where the next starts, only the last can be "go home", the same job back to back = one
function tidy(L,k){let W0=real(L).map(a=>Object.assign({},a)).sort((a,b)=>a.start-b.start);
  // first: the same job twice at overlapping times = one job (8–7 and 8–5 → 8–7)
  let W=[];W0.forEach(a=>{const p=W.find(x=>x.site===a.site&&a.start<=(x.end==null?1e9:x.end)&&x.start<=(a.end==null?1e9:a.end));
    if(p){p.start=Math.min(p.start,a.start);p.end=(p.end==null||a.end==null)?null:Math.max(p.end,a.end);if(a.home)p.home=true;if(a.note&&!p.note)p.note=a.note;}else W.push(a);});
  W.sort((a,b)=>a.start-b.start);
  for(let i=0;i<W.length-1;i++){if(W[i].end==null||W[i].end>W[i+1].start)W[i].end=W[i+1].start;delete W[i].home;}
  W=W.filter(a=>(a.end==null?endOf(k):a.end)>a.start);const out=[];
  W.forEach(a=>{const p=out[out.length-1];if(p&&p.site===a.site&&p.end!=null&&a.start<=p.end){p.end=a.end==null?null:Math.max(p.end,a.end);if(a.home)p.home=true;if(a.note&&!p.note)p.note=a.note;return;}out.push(a);});
  return out;}
const stamp=key=>({rev:rowRev(key)+1,by:me().id,at:Date.now()});
// the whole day as ONE list (empty = no job that day, even if an ongoing job repeats)
function dayRow(key,L,k){const W=tidy(L,k).map(clean);if(!W.length)return Object.assign({assignments:[],cancel:['ONG'],replace:{},patch:true},stamp(key));
  return Object.assign({site:W[0].site,time:fMin(W[0].start),assignments:W,note:W.map(a=>a.note).filter(Boolean).join('\n')},stamp(key));}
function loanRow(emp,key,L,k){return Object.assign({emp,assignments:tidy(L,k).map(clean)},stamp(key));}
const lateIds=cid=>{const t0=new Date().toDateString();const last={};(D.goHomeLog||[]).filter(x=>x&&new Date(x.ts).toDateString()===t0).sort((a,b)=>a.ts-b.ts).forEach(x=>{last[x.who]=x;});return men(cid).map(e=>e.id).filter(id=>last[id]&&last[id].kind==='late');};
const boardK=()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+(typeof boardDay==='number'?boardDay:0));return dkey(d);};
const crewDay=(cid,k)=>tidy(effectiveAsgs(cid,k),k);
async function put(keys,apply,ok){apply();save();let res;
  try{res=window.EX_saveNow?await EX_saveNow({keys:keys.map(k=>['sched',k]),waitMs:15000}):{ok:true};}catch(e){res={error:String(e&&e.message||e)};}
  try{renderSched();}catch(e){}
  if(res&&res.ok){toast('✓ '+ok,'green');return true;}
  if(res&&res.rejected&&res.rejected.length){const stale=res.rejected.some(x=>x.stale);if(stale&&window.EX_catchUp){try{await EX_catchUp();}catch(e){}}
    ask(T('Not saved'),'<div style="font-size:14px;line-height:1.45">'+E(stale?T('Someone else changed this day first. Open it again and try once more.'):T('The server did not accept this change.'))+'</div>',null,'OK');return false;}
  toast('⏳ '+T('Saved on this phone — it will be sent automatically'),'blue');return true;}

// ───────── the small screens (same look as the other schedule screens) ─────────
function css(){if(document.getElementById('p26css'))return;const base=(document.getElementById('p21css')||{}).textContent||'';const st=document.createElement('style');st.id='p26css';
  st.textContent=base.replace(/#p21Body/g,'#p26Body')
   +'.p26ov{position:fixed;inset:0;z-index:260;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;pointer-events:none;transition:opacity .18s}.p26ov.on{opacity:1;pointer-events:auto}.p26sh{position:relative;width:100%;max-width:480px;max-height:80vh;display:flex;flex-direction:column;background:#fff;border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.22);transform:scale(.96);transition:transform .16s}.p26ov.on .p26sh{transform:none}html[data-theme=dark] .p26sh{background:#1c1c1e;color:#f2f2f7}.p26grab{height:6px}.p26cl{position:absolute;right:12px;top:10px;width:32px;height:32px;border-radius:50%;border:0;background:var(--g1);color:var(--g5);font-size:15px;cursor:pointer;z-index:2}.p26bd{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:6px 16px 22px}.p26bd h2{padding-right:40px}html.p26lock,html.p26lock body{overflow:hidden}.p26bd #p26askmd{border-radius:0!important;max-height:none!important;background:transparent!important;padding:8px 0 0!important;box-shadow:none!important;height:auto!important}.p26bd #askTitle{padding-right:40px;font-size:18px!important}.p26bd #p26askmd div:has(>#askOk){flex-direction:column!important}.p26bd #p26askmd div:has(>#askOk)>button{width:100%!important;flex:none!important;margin:0!important}.p26half{border-top:1px solid var(--g2);margin-top:12px;padding-top:12px}.p23card.p26ed{box-shadow:inset 0 0 0 2px #4f7cff}.p26tp{cursor:pointer;border-bottom:2px dotted #4f7cff}.p26x{color:#c0392b;margin-left:8px;cursor:pointer;font-weight:700;font-size:15px;padding:0 4px}'
   +'.p26done{background:none;border:0;color:#4f7cff;font-weight:700;font-size:15px;cursor:pointer;padding:4px 2px}.p26av{cursor:pointer;box-shadow:0 0 0 2px #4f7cff!important}'
   +'.p26pc{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:6px}.p26pc .ad{font-size:16px}.p26pc .hr{white-space:nowrap;color:var(--g4);font-size:13.5px}'
   +'.p26mv{margin-top:8px;font-size:13.5px}.p26snd{position:absolute;left:0;top:0;bottom:0;width:104px;color:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:700;font-size:13px;background:#4f7cff}'
   +'.p23c.p26r{background:#4f7cff}.p23c.p26r .p26snd{display:flex}.p23c.p26r .act{display:none}'
   +'#p26Body .p26seg{display:flex;background:var(--g1);border-radius:9px;padding:3px;margin:8px 0 4px}#p26Body .p26seg button{flex:1;border:0;background:none;padding:7px 2px;border-radius:7px;font-size:13px;color:var(--g4);cursor:pointer}'
   +'#p26Body .p26seg button.on{background:var(--g0,#fff);color:var(--g5);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}html[data-theme=dark] #p26Body .p26seg button.on{background:var(--g3)}'
   +'#p26Body .p26rw{display:flex;justify-content:space-between;align-items:center;padding:10px 2px;border-top:1px solid var(--g2);font-size:15px}#p26Body .p26rw:first-of-type{border-top:0}'
   +'#p26Body .p26back{width:100%;text-align:left;background:none;border:1px solid var(--g2);border-radius:12px;padding:10px 12px;font-size:15px;font-weight:600;color:#4f7cff;margin:6px 0;cursor:pointer}';
  document.head.appendChild(st);}
// Baruch 11/22: a box in the middle of the page (he likes it better than from the bottom) — ✕ to close, tap outside to close — instead of a full page with "‹ Back"
function shell(){let o=document.getElementById('p26ov');if(o)return o;css();o=document.createElement('div');o.id='p26ov';o.className='p26ov';
  o.innerHTML='<div class="p26sh" onclick="event.stopPropagation()"><div class="p26grab"></div><button type="button" class="p26cl" aria-label="Close" onclick="P26.close()">✕</button><div class="p26bd"><div id="p26Body"></div></div></div>';
  o.addEventListener('click',()=>P26.close());document.body.appendChild(o);return o;}
function openShell(which){const o=shell();const bd=o.querySelector('.p26bd');if(which!=='ask')askBack();
  if(which==='p21'){const pb=document.getElementById('p21Body');if(pb&&pb.parentElement!==bd)bd.appendChild(pb);}
  if(which==='ask'){const m=document.getElementById('m-ask');const md=m&&(m.querySelector('.md')||document.getElementById('p26askmd'));if(md){md.id='p26askmd';if(md.parentElement!==bd)bd.appendChild(md);}if(m)m.classList.add('hid');}
  const want=which==='p21'?'p21Body':which==='ask'?'p26askmd':'p26Body';[...bd.children].forEach(c=>{c.style.display=c.id===want?'':'none';});
  o.classList.add('on');document.documentElement.classList.add('p26lock');bd.scrollTop=0;}
function closeShell(){const o=document.getElementById('p26ov');if(o)o.classList.remove('on');document.documentElement.classList.remove('p26lock');askBack();}
// the app's small question box goes back where it lives, so every other page keeps using it as before
function askBack(){const md=document.getElementById('p26askmd');const m=document.getElementById('m-ask');if(md&&m&&md.parentElement!==m){md.removeAttribute('id');m.appendChild(md);m.classList.add('hid');}}
// the Send screen (P21) opens in the same panel
const _show=window.show,_hide=window.hide;
// Baruch 11/22: on the Schedule, every box (⋯ menu, Stay late?, Take this job off?, Copy, Days off) opens in the same slide-up panel
show=function(id){if(id==='m-ask'&&typeof curPage==='function'&&curPage()==='sched'){openShell('ask');return;}
  if(id==='m-p21'){const m=document.getElementById('m-p21');if(m)m.classList.add('hid');openShell('p21');return;}return _show.apply(this,arguments);};
hide=function(id){if(id==='m-ask'&&document.getElementById('p26askmd')){closeShell();return;}
  if(id==='m-p21'||id==='m-p26'){closeShell();const m=document.getElementById('m-p21');if(m)m.classList.add('hid');return;}return _hide.apply(this,arguments);};
try{window.show=show;window.hide=hide;}catch(e){}
css();
let S=null;
function openSheet(o){S=Object.assign({q:'',how:'day',when:'all',at:null,picked:[]},o);shell();draw();openShell('p26');}
function recent(cid,k){const seen=new Map();for(let i=0;i<21;i++){const d=addD(k,-i-1);real(effectiveAsgs(cid,d)).forEach(a=>{if(!seen.has(a.site))seen.set(a.site,d);});}
  return [...seen.keys()].map(id=>D.sites.find(s=>s.id===id)).filter(s=>s&&s.stage!=='lost'&&s.stage!=='done');}
const active=()=>D.sites.filter(s=>s&&!s.deleted&&s.stage!=='lost'&&s.stage!=='done').sort((a,b)=>String(a.name).localeCompare(String(b.name)));
function jobList(){const q=S.q.trim().toLowerCase();const row=s=>'<button type="button" class="p21j" onclick="P26.job(\''+jsq(s.id)+'\')"><span>'+E(s.name)+'</span></button>';
  if(q){const h=D.sites.filter(s=>s&&!s.deleted&&!s.mergedInto&&!s.tgone&&String(s.name||'').toLowerCase().includes(q)).slice(0,40);return h.length?h.map(row).join(''):'<div class="p21s" style="margin-top:10px">'+E(T('No jobs found'))+'</div>';}
  const rc=recent(S.cid,S.k);const ids=new Set(rc.map(s=>s.id));
  return (rc.length?'<div class="p21g">'+E(T("This crew's recent jobs"))+'</div>'+rc.map(row).join(''):'')+'<div class="p21g">'+E(T('Active jobs'))+'</div>'+active().filter(s=>!ids.has(s.id)).map(row).join('');}
const seg=(key,opts)=>'<div class="p26seg">'+opts.map(([v,l])=>'<button type="button" class="'+(S[key]===v?'on':'')+'" onclick="P26.set(\''+key+'\',\''+v+'\')">'+E(l)+'</button>').join('')+'</div>';
const search=()=>'<input class="p21q" id="p26q" placeholder="'+E(T('Search jobs…'))+'" value="'+E(S.q)+'" oninput="P26.q(this.value)" autocomplete="off"><div id="p26list">'+jobList()+'</div>';
function draw(){const b=document.getElementById('p26Body');if(!b||!S)return;let h='';const title=E(crewName(S.cid))+' · '+E(fmtDay(S.k));
  if(S.mode==='book'){h='<h2>'+E(T('Book'))+' '+title+'</h2>'+seg('how',[['day',T('This day')],['week',T('This week')],['ong',T('Every workday')]])+(S.how==='ong'?'<div class="p21s">'+E(T('Monday–Friday'))+'</div>':'')
     +'<div class="p26rw"><b>'+E(T('Start'))+'</b><input type="time" value="'+min2hhmm(S.st)+'" onchange="P26.tm(\'st\',this.value)"></div><div class="p26rw"><b>'+E(T('Go home at'))+'</b><input type="time" value="'+min2hhmm(S.en)+'" onchange="P26.tm(\'en\',this.value)"></div>'+search();}
  else if(S.mode==='gjob'){h='<h2>'+title+'</h2>'+search();}
  else if(S.mode==='job'){h='<h2>'+title+'</h2>'+seg('how',[['day',T('This day')],['week',T('This week')]].concat(S.one?[['ong',T('Every workday')]]:[]))
     +(S.how==='ong'?'<div class="p21s">'+E(T('Monday–Friday'))+'</div>':'')+search();}
  else if(S.mode==='hours'){h='<h2>'+title+'</h2><div class="p26rw"><b>'+E(T('Start'))+'</b><input type="time" id="p26st" value="'+min2hhmm(S.st)+'"></div><div class="p26rw"><b>'+E(T('Go home at'))+'</b><input type="time" id="p26en" value="'+min2hhmm(S.en)+'"></div>'
     +'<button class="btn" style="margin-top:12px" onclick="P26.hoursOk()">'+E(T('Save'))+'</button><button class="btn sec2" style="margin-top:8px" onclick="hide(\'m-p26\')">'+E(T('Cancel'))+'</button>';}
  else if(S.mode==='man'){const e=D.emps.find(x=>x.id===S.emp)||{};const isT=S.k===todayK();
    h='<h2>'+E(T('Move'))+' '+E(e.name||'')+' · '+E(fmtDay(S.k))+'</h2>'+(real(loansFor(S.emp,S.k)).length?'<button type="button" class="p26back" onclick="P26.manBack()">↩ '+E(T('Back to his crew'))+'</button>':'')
     +seg('when',[['all',T('All day')]].concat(isT?[['now',T('From now')]]:[]).concat([['at',T('From a time')]]))
     +(S.when==='at'?'<div style="margin:4px 2px 6px"><input type="time" id="p26at" value="'+min2hhmm(S.at==null?720:S.at)+'" onchange="P26.at(this.value)"></div>':'')+search();}
  else if(S.mode==='add'){if(!S.site){h='<h2>'+E(T('Add another job'))+' · '+title+'</h2>'+search();}
    else{const M=men(S.cid);h='<h2>'+E(crewName(S.cid))+' → '+E((siteName(S.site)||'').split(',')[0])+'</h2><div class="p21s">'+E(T('Who goes there?'))+'</div>'
      +'<div class="p21pp">'+M.map(m=>'<button type="button" class="'+(S.picked.includes(m.id)?'on':'')+'" onclick="P26.pick(\''+jsq(m.id)+'\')">'+E(String(m.name).split(' ')[0])+'</button>').join('')+'</div>'
      +'<button class="btn" style="margin-top:14px" onclick="P26.addOk()">'+E(T('Save'))+'</button><button class="btn sec2" style="margin-top:8px" onclick="P26.set(\'site\',\'\')">'+E(T('Back'))+'</button>';}}
  b.innerHTML=h;}

// ───────── saving each kind of change ─────────
// change one job of the crew's day (i = which job); This day / This week (to Friday) / Every workday (Mon–Fri)
async function saveJob(site){const {cid,k,i,how}=S;const key=cid+'|'+k;const W=crewDay(cid,k);const old=W[i]?W[i].site:null;
  if(how==='ong'){const a=W[0]||{start:DAY_START,end:null};const cur=activeRule(cid);const rk='ONG:'+cid+':'+Date.now().toString(36);const keys=[rk,key];if(cur)keys.push('ONG:'+cid+':'+cur.ruleId);
    // later days that were booked with the same old job follow the new one; other bookings stay
    const later=Object.keys(D.sched).filter(x=>x.startsWith(cid+'|')&&x.slice(cid.length+1)>k).filter(x=>{const r=D.sched[x];const L=real(r&&r.assignments);return L.length===1&&L[0].site===old&&!r.patch;});
    keys.push(...later);
    const ok=await put(keys,()=>{if(cur){const ck='ONG:'+cid+':'+cur.ruleId;if((cur.from||'')>=k)delete D.sched[ck];else D.sched[ck]=Object.assign({},D.sched[ck],{to:addD(k,-1),rev:(cur.rev||0)+1,by:me().id,at:Date.now()});}
      D.sched[rk]={site,start:a.start==null?DAY_START:a.start,end:DAY_END,workdays:MONFRI,from:k,to:null,note:a.note||'',rev:1,by:me().id,at:Date.now()};
      if(D.sched[key])delete D.sched[key];later.forEach(x=>{delete D.sched[x];});},T('Saved'));if(ok)closeShell();return;}
  const days=[k];if(how==='week'){let d=k;for(let n=0;n<6;n++){d=addD(d,1);const g=new Date(d+'T12:00').getDay();if(g===6||g===0)break;days.push(d);}}
  const keys=days.map(d=>cid+'|'+d);
  const ok=await put(keys,()=>{days.forEach(d=>{const L=d===k?W:crewDay(cid,d);let N;
      if(d===k){N=L.map((a,j)=>j===i?Object.assign({},a,{site}):a);if(!L.length)N=[{site,start:DAY_START,end:endOf(d)}];}
      else{const j=L.findIndex(a=>a.site===old);N=L.length?L.map((a,x)=>x===(j<0?0:j)?Object.assign({},a,{site}):a):[{site,start:DAY_START,end:endOf(d)}];}
      D.sched[cid+'|'+d]=dayRow(cid+'|'+d,N,d);});},T('Saved'));
  if(ok)closeShell();}
async function saveBook(site){const {cid,k,how,st,en}=S;if(D.daysOff&&D.daysOff[k]&&D.daysOff[k].off&&!D.daysOff[k].deleted){toast(T('This day is a day off.'));return;}
  const end=d=>(en===DAY_END||en==null)?endOf(d):en;const piece=d=>({site,start:st,end:end(d),note:'',home:en!=null&&en!==DAY_END&&end(d)!==endOf(d)});
  if(how==='ong'){const cur=activeRule(cid);const rk='ONG:'+cid+':'+Date.now().toString(36);const key=cid+'|'+k;const keys=[rk];if(cur)keys.push('ONG:'+cid+':'+cur.ruleId);if(D.sched[key])keys.push(key);
    const ok=await put(keys,()=>{if(cur){const ck='ONG:'+cid+':'+cur.ruleId;if((cur.from||'')>=k)delete D.sched[ck];else D.sched[ck]=Object.assign({},D.sched[ck],{to:addD(k,-1),rev:(cur.rev||0)+1,by:me().id,at:Date.now()});}
      D.sched[rk]={site,start:st,end:en==null?DAY_END:en,workdays:MONFRI,from:k,to:null,note:'',rev:1,by:me().id,at:Date.now()};if(D.sched[key])delete D.sched[key];},T('Saved'));if(ok)closeShell();return;}
  const days=[k];if(how==='week'){let d=k;for(let n=0;n<6;n++){d=addD(d,1);const g=new Date(d+'T12:00').getDay();if(g===6||g===0)break;days.push(d);}}
  const ok=await put(days.map(d=>cid+'|'+d),()=>{days.forEach(d=>{D.sched[cid+'|'+d]=dayRow(cid+'|'+d,[piece(d)],d);});},T('Saved'));if(ok)closeShell();}
// the men's second job (a split crew): change its job, its hours, or take it off (the men go back to the crew's job)
function groups(cid,k){const main=new Set(crewDay(cid,k).map(a=>a.site));const G={};
  men(cid).forEach(m=>real(loansFor(m.id,k)).filter(a=>!main.has(a.site)).forEach(a=>{const gk=a.site+'|'+a.start+'|'+(a.end==null?'':a.end);(G[gk]=G[gk]||{site:a.site,start:a.start,end:a.end,men:[]}).men.push(m.id);}));
  return Object.values(G).sort((x,y)=>x.start-y.start);}
async function saveGroup(g,fn){const k=S.k;const keys=g.men.map(id=>loanKey(id,k));
  const ok=await put(keys,()=>{g.men.forEach(id=>{const key=loanKey(id,k);const L=real(loansFor(id,k)).map(a=>(a.site===g.site&&a.start===g.start)?fn(Object.assign({},a)):a).filter(Boolean);
    if(L.length)D.sched[key]=loanRow(id,key,L,k);else delete D.sched[key];});},T('Saved'));if(ok)closeShell();return ok;}
async function saveHours(st,en){const {cid,k}=S;const key=cid+'|'+k;let W=crewDay(cid,k);if(!W.length)return;
  W[0].start=st;const last=W[W.length-1];W=W.filter(a=>a.start<en);const l2=W[W.length-1];if(l2){l2.end=en;if(en!==endOf(k))l2.home=true;else delete l2.home;}
  const ok=await put([key],()=>{D.sched[key]=dayRow(key,W,k);},T('Saved'));if(ok)closeShell();}
async function removeJob(cid,k,i){const key=cid+'|'+k;const W=crewDay(cid,k);const r=W[i];if(!r)return;
  // the job next to it takes over its hours, so the day stays covered (a one-job day becomes empty)
  if(W[i-1])W[i-1].end=r.end;else if(W[i+1])W[i+1].start=r.start;W.splice(i,1);
  await put([key],()=>{D.sched[key]=dayRow(key,W,k);},T('Saved'));}
async function saveMan(site){const {emp,k,cid}=S;const isT=k===todayK();const e=D.emps.find(x=>x.id===emp);
  const st=S.when==='now'&&isT?Math.max(DAY_START,Math.floor(nowMin()/5)*5):S.when==='at'?(S.at==null?720:S.at):(crewDay(cid,k)[0]||{start:DAY_START}).start;
  const key=loanKey(emp,k);const keep=real(loansFor(emp,k)).filter(a=>a.start<st).map(a=>Object.assign({},a,{end:(a.end==null||a.end>st)?st:a.end,remind:false}));
  const back=e&&e.crew&&crewDay(e.crew,k).some(a=>a.site===site)&&S.when==='all';
  const L=back?keep:keep.concat([{site,start:st,end:endOf(k),note:'',remind:S.when==='at'&&(st>nowMin()+2||!isT)}]);
  const ok=await put([key],()=>{if(L.length)D.sched[key]=loanRow(emp,key,L,k);else delete D.sched[key];},T('Saved'));if(ok)closeShell();}
async function manBack(){const {emp,k}=S;const key=loanKey(emp,k);const ok=await put([key],()=>{delete D.sched[key];},T('Saved'));if(ok)closeShell();}
async function addJob(){const {cid,k,site,picked}=S;if(!picked.length){toast(T('Pick at least one man'));return;}
  const day=crewDay(cid,k);const st=day.length?day[0].start:DAY_START;const keys=picked.map(id=>loanKey(id,k));
  const ok=await put(keys,()=>{picked.forEach(id=>{const key=loanKey(id,k);D.sched[key]=loanRow(id,key,[{site,start:st,end:endOf(k),note:''}],k);});},T('Saved'));if(ok)closeShell();}

// ───────── Edit mode on the card ─────────
let ED=null;   // {cid,k}
function editCard(){if(!ED)return;const card=document.querySelector('#todayBoard .p23card[data-crew="'+ED.cid+'"]');if(!card)return;const w=card.querySelector('.p23w');if(!w)return;
  const {cid,k}=ED;const W=crewDay(cid,k);card.classList.add('p26ed');card.onclick=null;card.setAttribute('onclick','');
  let h='<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px">'+E(crewName(cid))+'</b><button type="button" class="p26done" onclick="event.stopPropagation();P26.done()">'+E(T('Done'))+'</button></div>';
  if(W.length)h+=W.map((a,i)=>{const ad=scAddr(a.site);return '<div class="p26pc"><span class="ad"><span class="p26tp" onclick="event.stopPropagation();P26.editJob('+i+')">'+ad.a+'</span><span class="p26x" onclick="event.stopPropagation();P26.x('+i+')">✕</span></span>'
      +'<span class="hr"><span class="p26tp" onclick="event.stopPropagation();P26.editHours()">'+E(fMin(a.start))+'–'+E(fMin(a.end==null?endOf(k):a.end))+'</span></span></div>'+(W.length===1?'<div class="p23t">'+ad.b+'</div>':'');}).join('');
  else h+='<div class="p23t" style="margin-top:6px">'+E(T('No job of its own'))+'</div>';
  const G=groups(cid,k);const moved=new Set(G.flatMap(g=>g.men));const av=ids=>'<div class="sc-avs" style="margin-top:10px">'+ids.map(id=>{const m=D.emps.find(x=>x.id===id)||{};return '<span class="sc-av p26av" title="'+E(m.name)+'" onclick="event.stopPropagation();P26.editMan(\''+jsq(id)+'\')">'+scInit(m.name||'')+'</span>';}).join('')+'</div>';
  h+=av(men(cid).map(m=>m.id).filter(id=>!moved.has(id)));
  // Baruch 11/22: the men's second job looks like the crew's job — address, town, hours, its men — under a thin line; ✕, hours and job can be changed
  G.forEach((g,gi)=>{const ad=scAddr(g.site);h+='<div class="p26half"><div class="p26pc"><span class="ad"><span class="p26tp" onclick="event.stopPropagation();P26.editGroupJob('+gi+')">'+ad.a+'</span><span class="p26x" onclick="event.stopPropagation();P26.xGroup('+gi+')">✕</span></span>'
    +'<span class="hr"><span class="p26tp" onclick="event.stopPropagation();P26.editGroupHours('+gi+')">'+E(fMin(g.start))+'–'+E(fMin(g.end==null?endOf(k):g.end))+'</span></span></div><div class="p23t">'+ad.b+'</div>'+av(g.men)+'</div>';});
  w.innerHTML=h;
  const r=card.querySelector('.p23r');if(r)r.style.display='none';}
// swipe right on a crew = a blue "Send" button shows; tap it to open Send (Baruch 11/22: a swipe by mistake must not do anything)
let RS=null;
function closeRight(){if(!RS)return;const c=document.querySelector('#todayBoard .p23card[data-crew="'+RS+'"]');RS=null;if(c){c.style.transform='';const b=c.parentElement;setTimeout(()=>b.classList.remove('p26r'),200);}}
function swipeRight(){document.querySelectorAll('#todayBoard .p23c:not(.p23sub) > .p23card').forEach(card=>{const box=card.parentElement;const cid=card.dataset.crew;if(!cid||card.__p26)return;card.__p26=1;
  if(!box.querySelector('.p26snd')){const sb=document.createElement('div');sb.className='p26snd';sb.innerHTML='<span style="font-size:20px">↪</span><span>'+E(T('Send'))+'</span>';
    sb.onclick=e=>{e.stopPropagation();closeRight();P21.send(cid,boardK());};box.insertBefore(sb,box.firstChild);}
  if(RS===cid){box.classList.add('p26r');card.style.transform='translateX(104px)';}
  // a tap on the card while its Send button shows just closes it
  card.addEventListener('click',e=>{if(RS===cid){e.stopPropagation();e.preventDefault();closeRight();}},true);
  let x0=null,y0=null,dx=0,on=false;
  card.addEventListener('touchstart',e=>{if(RS&&RS!==cid)closeRight();const p=e.touches[0];x0=p.clientX;y0=p.clientY;dx=0;on=false;},{passive:true});
  card.addEventListener('touchmove',e=>{if(x0==null)return;const p=e.touches[0];const mx=p.clientX-x0+(RS===cid?104:0),my=p.clientY-y0;if(!on&&Math.abs(p.clientX-x0)>12&&Math.abs(p.clientX-x0)>Math.abs(my)*1.3&&mx>0)on=true;
    if(on){dx=Math.max(0,Math.min(130,mx));box.classList.add('p26r');card.style.transition='none';card.style.transform='translateX('+dx+'px)';}},{passive:true});
  card.addEventListener('touchend',()=>{if(on){card.__noTap=Date.now();card.style.transition='transform .18s';const open=dx>55;
      if(open){RS=cid;card.style.transform='translateX(104px)';}else{RS=null;card.style.transform='';setTimeout(()=>box.classList.remove('p26r'),200);}}x0=null;on=false;});});}

function halves(k){document.querySelectorAll('#todayBoard .p23c:not(.p23sub) > .p23card').forEach(card=>{const cid=card.dataset.crew;if(!cid||(ED&&ED.cid===cid))return;
  const blocks=[...card.querySelectorAll('.p21mv')];if(!blocks.length)return;const G=groups(cid,k);
  blocks.forEach((b,i)=>{const g=G[i];if(!g)return;const ad=scAddr(g.site);const avs=b.querySelector('.sc-avs');const pk=cid+'@'+g.site;
    b.className='p26half';b.onclick=null;b.removeAttribute('onclick');b.addEventListener('click',e=>e.stopPropagation());
    b.innerHTML='<div class="p23a"><span class="ad" onclick="event.stopPropagation();P23.pv(\''+jsq(pk)+'\')">'+ad.a+'</span></div><div class="p23t">'+ad.b+'</div><div class="p23hr">'+E(fMin(g.start))+'–'+E(fMin(g.end==null?endOf(k):g.end))+'</div>';
    if(avs)b.appendChild(avs);});});}
const _rdb=renderDayBoard;renderDayBoard=function(){const r=_rdb.apply(this,arguments);try{
    const k=boardK();if(ED&&ED.k!==k)ED=null;editCard();halves(k);
    if(schedCanEdit()&&k>=todayK())swipeRight();}catch(e){console.warn(e);}return r;};

// ⋯ on a crew: Edit · Add another job · Copy (on a computer, where there is no swipe: also Send to another job and Stay late)
P21.book=(cid,k)=>{if(!schedCanEdit())return;openSheet({mode:'book',cid,k,how:'day',st:DAY_START,en:endOf(k)});};
const noTouch=()=>!('ontouchstart' in window)&&!(navigator.maxTouchPoints>0);
P23.crewMenu=(cid,k)=>{const own=real(slotAsgs(cid+'|'+k));const rows=[
    {l:'✎ '+E(T('Edit')),s:E(T('tap the job, the hours or a man on the card')),on:"P26.edit('"+jsq(cid)+"','"+k+"')"},
    {l:'＋ '+E(T('Add another job')),s:E(T('pick the job, then which men go there')),on:"P26.add('"+jsq(cid)+"','"+k+"')"},
    {l:'⧉ '+E(T('Copy')),s:E(T("this crew's day to other days")),on:"P21.copy('"+jsq(cid)+"','"+k+"')"}];
  if(noTouch()){rows.push({l:'↪ '+E(T('Send to another job')),on:"P21.send('"+jsq(cid)+"','"+k+"')"});
    if(k===todayK()&&window.P9L){const late=lateIds(cid).length>0;rows.push({l:'🕖 '+E(T(late?'Send home':'Stay late')),on:"P23.late('"+jsq(cid)+"')"});}}
  ask(crewName(cid)+(own.length?' · '+scAddr(own[0].site).a.replace(/&amp;/g,'&'):''),'<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">'+rows.map(r=>'<button class="btn sec2" type="button" style="text-align:left" onclick="hide(\'m-ask\');'+r.on+'">'+r.l+(r.s?'<div style="font-size:12px;font-weight:400;color:var(--g4)">'+r.s+'</div>':'')+'</button>').join('')+'</div>',null);
  const ok=document.getElementById('askOk');if(ok&&ok.parentNode)ok.parentNode.style.display='none';};

window.P26={
  edit:(cid,k)=>{ED={cid,k};renderSched();setTimeout(()=>{const c=document.querySelector('#todayBoard .p23card[data-crew="'+cid+'"]');if(c)try{c.scrollIntoView({block:'center',behavior:'smooth'});}catch(e){}},50);},
  done:()=>{ED=null;renderSched();},
  editJob:i=>{const {cid,k}=ED;openSheet({mode:'job',cid,k,i,one:crewDay(cid,k).length<=1});},
  editHours:()=>{const {cid,k}=ED;const W=crewDay(cid,k);openSheet({mode:'hours',cid,k,st:W.length?W[0].start:DAY_START,en:W.length?(W[W.length-1].end==null?endOf(k):W[W.length-1].end):endOf(k)});},
  editMan:id=>{const {cid,k}=ED;openSheet({mode:'man',cid,k,emp:id,when:'all'});},
  x:i=>{const {cid,k}=ED;const W=crewDay(cid,k);const a=W[i];if(!a)return;askConfirm(T('Take this job off?')+' ('+(siteName(a.site)||'').split(',')[0]+', '+fmtDay(k)+')',()=>removeJob(cid,k,i),T('Take off'));},
  add:(cid,k)=>openSheet({mode:'add',cid,k,site:'',picked:[]}),
  set:(key,v)=>{if(key==='site'){S.site=v||null;S.picked=[];}else S[key]=v;if(key==='when'&&v==='at'&&S.at==null)S.at=720;draw();},
  at:v=>{S.at=hhmm2min(v);},
  q:v=>{S.q=v;const l=document.getElementById('p26list');if(l)l.innerHTML=jobList();},
  pick:id=>{const i=S.picked.indexOf(id);if(i>=0)S.picked.splice(i,1);else S.picked.push(id);draw();},
  job:id=>{if(S.mode==='book')return saveBook(id);if(S.mode==='gjob')return saveGroup(S.g,a=>Object.assign(a,{site:id}));if(S.mode==='job')return saveJob(id);if(S.mode==='man')return saveMan(id);if(S.mode==='add'){S.site=id;S.q='';draw();}},
  tm:(f,v)=>{const m=hhmm2min(v);if(m!=null)S[f]=m;},
  close:()=>closeShell(),
  editGroupJob:i=>{const {cid,k}=ED;const g=groups(cid,k)[i];if(g)openSheet({mode:'gjob',cid,k,g});},
  editGroupHours:i=>{const {cid,k}=ED;const g=groups(cid,k)[i];if(g)openSheet({mode:'hours',cid,k,g,st:g.start,en:g.end==null?endOf(k):g.end});},
  xGroup:i=>{const {cid,k}=ED;const g=groups(cid,k)[i];if(!g)return;askConfirm(T('Take this job off?')+' ('+(siteName(g.site)||'').split(',')[0]+') — '+T('the men go back to the crew'),()=>{S={k};saveGroup(g,()=>null);},T('Take off'));},
  hoursOk:()=>{const st=hhmm2min((document.getElementById('p26st')||{}).value),en=hhmm2min((document.getElementById('p26en')||{}).value);if(st==null||en==null||en<=st)return;if(S.g)return saveGroup(S.g,a=>Object.assign(a,{start:st,end:en}));saveHours(st,en);},
  manBack:()=>manBack(),addOk:()=>addJob()};
})();
