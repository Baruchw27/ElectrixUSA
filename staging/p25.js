/* p25 — ONE screen for a crew's day (Baruch 11/22: "I have a very hard time to book").
   The Schedule page looks exactly the same. Tapping a crew (booked or empty) opens this one screen instead of the old day editor.
   • It shows the crew's day as ONE list of jobs with times (what you see is exactly what is booked) + the men moved somewhere else.
   • Every change edits that same list: Change the job · Add a job · Go home at · tap a job to change its times or remove it.
     Send to another job / Split the crew keep their own screens (they already save cleanly). Stay late stays on the swipe.
   • Before saving you see the day NOW and AFTER, and pick: Just this day · Rest of the week · Until I change it (Mon–Fri only).
   • Saving always writes the whole day (never a piece on top of an old one); the same job back to back is one piece.
   Same records as before (crew|day, ONG:crew:id, L:man|day), so the server, the reminders and the tracker read it the same way. */
(function(){
if(typeof D==='undefined'||typeof effectiveAsgs!=='function'||window.P25)return;
const T=s=>{try{return (lang()==='es'&&L25[s])||t(s);}catch(e){return s;}};const E=s=>esc(s==null?'':String(s));
const L25={'Nothing booked':'Nada reservado','Book a job':'Reservar un trabajo','Change the job':'Cambiar el trabajo','Add a job':'Agregar un trabajo',
 'Go home at…':'Se van a casa a las…','Send to another job':'Mandar a otro trabajo','Split the crew':'Dividir la cuadrilla','Copy':'Copiar','Clear the day':'Borrar el día',
 'Now':'Ahora','After you save':'Después de guardar','For':'Para','Just this day':'Solo este día','Rest of the week':'Resto de la semana','Until I change it':'Hasta que lo cambie',
 'every workday':'cada día de trabajo','Mon–Fri':'lun–vie','Fri till 1:15 PM':'viernes hasta 1:15 PM','Save':'Guardar','Cancel':'Cancelar','Remove this job':'Quitar este trabajo',
 'Start':'Empieza','End':'Termina','Note':'Nota','Moved':'Movidos','Search jobs…':'Buscar trabajos…',"This crew's recent jobs":'Trabajos recientes de esta cuadrilla',
 'Active jobs':'Trabajos activos','No jobs found':'No se encontraron trabajos','Back':'Atrás','Saved':'Guardado','Day off':'Día libre','Go home at':'Se van a casa a las',
 'Tap a job to change its times or remove it.':'Toque un trabajo para cambiar las horas o quitarlo.','Pick the job':'Elija el trabajo',
 'Until I change it only works with one job all day.':'"Hasta que lo cambie" solo funciona con un trabajo todo el día.','The crew gets a message.':'La cuadrilla recibe un mensaje.',
 'Saved on this phone — it will be sent automatically':'Guardado en este teléfono — se mandará automáticamente','Not saved':'No se guardó',
 'Someone else changed this day first. Open it again and try once more.':'Otra persona cambió este día primero. Ábralo otra vez e intente de nuevo.',
 'The server did not accept this change.':'El servidor no aceptó este cambio.','Overlaps':'Se cruzan','then':'luego','Done':'Listo','to':'a'};
const DAY_START=480,DAY_END=1140,FRI_END=795,MONFRI=[1,2,3,4,5];
const isFri=k=>new Date(k+'T12:00').getDay()===5;const endOf=k=>isFri(k)?FRI_END:DAY_END;
const addD=(k,n)=>{const d=new Date(k+'T12:00');d.setDate(d.getDate()+n);return dkey(d);};
const todayK=()=>dkey(new Date());
const fmtDay=k=>new Date(k+'T12:00').toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'});
const sname=id=>(siteName(id)||'').replace(/, NY \d{5}/g,'');
const real=L=>(L||[]).filter(a=>a&&a.site&&a.start!=null);
// one clean day: in time order, a job ends where the next one starts, only the last job can be "go home", same job back to back = one
function tidy(L){const e=endOf(S.day);let W=L.filter(a=>a&&a.site&&a.start!=null).map(a=>Object.assign({},a)).sort((a,b)=>a.start-b.start);
  for(let i=0;i<W.length-1;i++){const a=W[i],n=W[i+1];if(a.end==null||a.end>n.start)a.end=n.start;delete a.home;}
  W=W.filter(a=>(a.end==null?e:a.end)>a.start);return joinSame(W);}
// the same job right after itself is ONE job
function joinSame(L){const out=[];L.slice().sort((a,b)=>a.start-b.start).forEach(a=>{const p=out[out.length-1];
  if(p&&p.site===a.site&&(p.end==null||(a.start!=null&&a.start<=p.end))){p.end=(p.end==null||a.end==null)?null:Math.max(p.end,a.end);if(a.home)p.home=true;if(a.note&&!p.note)p.note=a.note;return;}
  out.push(Object.assign({},a));});return out;}
const clean=a=>{const o={id:a.id||newAsgId(),site:a.site,start:a.start,end:a.end==null?null:a.end,note:a.note||''};if(a.remind)o.remind=true;if(a.home)o.home=true;return o;};
const same=(A,B)=>JSON.stringify(A.map(a=>[a.site,a.start,a.end==null?null:a.end,!!a.home,a.note||'']))===JSON.stringify(B.map(a=>[a.site,a.start,a.end==null?null:a.end,!!a.home,a.note||'']));

// ───────── state ─────────
let S=null;   // {crew, day, orig:[...], W:[...], how, step:'day'|'pick'|'edit'|'home', pickFor, edit, q}
function css(){if(document.getElementById('p25css'))return;const base=(document.getElementById('p21css')||{}).textContent||'';const st=document.createElement('style');st.id='p25css';
  st.textContent=base.replace(/#p21Body/g,'#p25Body')
   +'#p25Body .p25d{display:flex;justify-content:space-between;gap:10px;padding:9px 2px;border-top:1px solid var(--g2);cursor:pointer;font-size:15px}#p25Body .p25d:first-of-type{border-top:0}'
   +'#p25Body .p25d span:last-child{white-space:nowrap;color:var(--g4)}#p25Body .p25d small{display:block;color:var(--g4);font-size:12px}'
   +'#p25Body .p25new span{font-weight:600}#p25Body .p25new span:last-child{color:inherit}#p25Body .p25empty{color:#c0392b;padding:8px 2px}'
   +'#p25Body .p25a{display:flex;flex-wrap:wrap;gap:6px 18px;margin:10px 2px 2px}#p25Body .p25a button{background:none;border:0;padding:4px 0;font-size:14.5px;color:var(--blue-mid,#2f6fde);font-weight:500;cursor:pointer}'
   +'#p25Body .p25a button.rd{color:#c0392b}#p25Body .p25box{background:var(--g1);border-radius:12px;padding:6px 12px;margin-top:6px}'
   +'#p25Body .p25t{display:flex;gap:10px;margin:6px 2px}#p25Body .p25t label{flex:1;font-size:12px;color:var(--g4)}#p25Body .p25t input{width:100%;margin:2px 0 0!important}'
   +'#p25Body .p25warn{background:#fdecea;color:#8a1c12;border-radius:8px;padding:8px 10px;margin-top:8px;font-size:13px}html[data-theme=dark] #p25Body .p25warn{background:#3a1a17;color:#f2b8b0}';
  document.head.appendChild(st);}
function host(){let o=document.getElementById('m-p25');if(o)return o;css();
  o=document.createElement('div');o.className='ov hid';o.id='m-p25';o.innerHTML='<div class="md"><div class="hd"></div><div id="p25Body"></div></div>';document.body.appendChild(o);return o;}
function fromRule(){const r=ruleOn(S.crew,S.day);const row=D.sched[S.crew+'|'+S.day];return !!r&&(!row||row.patch||row.cancel)&&real(effectiveAsgs(S.crew,S.day)).some(a=>a.ongoing);}
function open(crew,day){S={crew,day,how:'day',step:'day',q:'',edit:null,pickFor:null,home:null};
  S.orig=joinSame(real(effectiveAsgs(crew,day)).map(a=>Object.assign(clean(a),{ongoing:!!a.ongoing})));S.W=S.orig.map(a=>Object.assign({},a));
  host();draw();show('m-p25');}

// ───────── job picker (this crew's recent jobs, active jobs, search) ─────────
function recent(){const seen=new Map();for(let i=0;i<21;i++){const k=addD(S.day,-i-1);real(effectiveAsgs(S.crew,k)).forEach(a=>{if(!seen.has(a.site))seen.set(a.site,k);});}
  return [...seen.keys()].map(id=>D.sites.find(s=>s.id===id)).filter(s=>s&&s.stage!=='lost'&&s.stage!=='done');}
const active=()=>D.sites.filter(s=>s&&!s.deleted&&s.stage!=='lost'&&s.stage!=='done').sort((a,b)=>String(a.name).localeCompare(String(b.name)));
function jobList(){const q=S.q.trim().toLowerCase();const row=s=>'<button type="button" class="p21j" onclick="P25.job(\''+jsq(s.id)+'\')"><span>'+E(s.name)+'</span></button>';
  if(q){const h=D.sites.filter(s=>s&&!s.deleted&&String(s.name||'').toLowerCase().includes(q)).slice(0,40);return h.length?h.map(row).join(''):'<div class="p21s" style="margin-top:10px">'+E(T('No jobs found'))+'</div>';}
  const rc=recent();const ids=new Set(rc.map(s=>s.id));
  return (rc.length?'<div class="p21g">'+E(T("This crew's recent jobs"))+'</div>'+rc.map(row).join(''):'')+'<div class="p21g">'+E(T('Active jobs'))+'</div>'+active().filter(s=>!ids.has(s.id)).map(row).join('');}

// ───────── drawing ─────────
const line=(a,cls,i)=>'<div class="p25d '+(cls||'')+'"'+(i!=null?' onclick="P25.edit('+i+')"':'')+'><span>'+E(sname(a.site))+(a.note?'<small>'+E(a.note)+'</small>':'')+(a.ongoing&&cls!=='p25new'?'<small>♾ '+E(T('every workday'))+'</small>':'')+'</span><span>'+E(fMin(a.start))+' – '+E(fMin(a.end==null?endOf(S.day):a.end))+'</span></div>';
function moved(){const out=[];crewMembers(S.crew).forEach(m=>{real(loansFor(m.id,S.day)).forEach(a=>out.push('<div class="p25d" onclick="hide(\'m-p25\');openLoan(\''+S.day+'\',\''+jsq(m.id)+'\')"><span>↪ '+E(String(m.name).split(' ')[0])+' · '+E(sname(a.site))+'</span><span>'+E(fMin(a.start))+' – '+E(fMin(a.end==null?endOf(S.day):a.end))+'</span></div>'));});return out.join('');}
function overlaps(L){const m=[];for(let i=0;i<L.length;i++)for(let j=i+1;j<L.length;j++){const a=L[i],b=L[j];const ae=a.end==null?endOf(S.day):a.end,be=b.end==null?endOf(S.day):b.end;if(a.site!==b.site&&a.start<be&&b.start<ae)m.push(sname(a.site)+' / '+sname(b.site));}return m;}
function draw(){const b=document.getElementById('p25Body');if(!b||!S)return;let h='';const title=E(nameOf(S.crew))+' · '+E(fmtDay(S.day));
  if(S.step==='pick'){h+='<h2>'+title+'</h2><div class="p21s">'+E(T('Pick the job'))+'</div><input class="p21q" id="p25q" placeholder="'+E(T('Search jobs…'))+'" value="'+E(S.q)+'" oninput="P25.q(this.value)" autocomplete="off"><div id="p25list">'+jobList()+'</div>'
      +'<button class="btn sec2" style="margin-top:12px" onclick="P25.back()">'+E(T('Back'))+'</button>';b.innerHTML=h;return;}
  if(S.step==='edit'){const a=S.W[S.edit];
    h+='<h2>'+title+'</h2><button type="button" class="p21j on" onclick="P25.pick(\'edit\')"><span>'+E(sname(a.site))+'</span><small>'+E(T('Change the job'))+' ›</small></button>'
      +'<div class="p25t"><label>'+E(T('Start'))+'<input type="time" value="'+min2hhmm(a.start)+'" onchange="P25.set(\'start\',this.value)"></label><label>'+E(T('End'))+'<input type="time" value="'+min2hhmm(a.end==null?endOf(S.day):a.end)+'" onchange="P25.set(\'end\',this.value)"></label></div>'
      +'<div class="p21g">'+E(T('Note'))+'</div><textarea oninput="P25.set(\'note\',this.value)">'+E(a.note||'')+'</textarea>'
      +'<button class="btn" style="margin-top:12px" onclick="P25.back()">'+E(T('Done'))+'</button><button class="btn sec2" style="margin-top:8px;color:#c0392b" onclick="P25.remove()">'+E(T('Remove this job'))+'</button>';b.innerHTML=h;return;}
  if(S.step==='home'){const last=S.W[S.W.length-1];const v=S.home!=null?S.home:(last&&last.end!=null?last.end:endOf(S.day));
    h+='<h2>'+title+'</h2><div class="p21g">'+E(T('Go home at'))+'</div><div style="margin:4px 2px"><input type="time" value="'+min2hhmm(v)+'" onchange="P25.home(this.value)"></div>'
      +'<button class="btn" style="margin-top:12px" onclick="P25.homeOk()">'+E(T('Done'))+'</button><button class="btn sec2" style="margin-top:8px" onclick="P25.back()">'+E(T('Back'))+'</button>';b.innerHTML=h;return;}
  // the day
  const changed=!same(S.orig,S.W);
  h+='<h2>'+title+'</h2>';
  h+='<div class="p21g">'+E(T(changed?'Now':''))+'</div>';
  h+=S.orig.length?'<div class="p25box">'+S.orig.map((a,i)=>line(a,changed?'':null,changed?null:i)).join('')+'</div>':'<div class="p25empty">'+E(T('Nothing booked'))+'</div>';
  const mv=moved();if(mv&&!changed)h+='<div class="p21g">'+E(T('Moved'))+'</div><div class="p25box">'+mv+'</div>';
  if(changed){h+='<div class="p21g">'+E(T('After you save'))+'</div>'+(S.W.length?'<div class="p25box">'+S.W.map((a,i)=>line(a,'p25new',i)).join('')+'</div>':'<div class="p25empty">'+E(T('Day off'))+'</div>');
    const ov=overlaps(S.W);if(ov.length)h+='<div class="p25warn">⚠ '+E(T('Overlaps'))+': '+E(ov.join(', '))+'</div>';
    const one=S.W.length===1;
    h+='<div class="p21g">'+E(T('For'))+'</div><div class="p21sel">'+[['day',T('Just this day')],['week',T('Rest of the week')]].concat(one?[['ong',T('Until I change it')+' ('+T('Mon–Fri')+')']]:[]).map(([v,l])=>'<button type="button" class="'+(S.how===v?'on':'')+'" onclick="P25.how(\''+v+'\')">'+E(l)+'</button>').join('')+'</div>'
      +'<div class="p21sum">'+summary()+'</div>'
      +'<button class="btn" style="margin-top:12px" onclick="P25.save()">'+E(T('Save'))+'</button><button class="btn sec2" style="margin-top:8px" onclick="P25.undo()">'+E(T('Cancel'))+'</button>';}
  else{h+=S.orig.length?'<div class="p21s" style="margin-top:6px">'+E(T('Tap a job to change its times or remove it.'))+'</div>':'';
    h+='<div class="p25a">'+(S.orig.length?'<button onclick="P25.pick(\'all\')">'+E(T('Change the job'))+'</button><button onclick="P25.pick(\'add\')">+ '+E(T('Add a job'))+'</button><button onclick="P25.goHome()">'+E(T('Go home at…'))+'</button>'
        +'<button onclick="hide(\'m-p25\');P21.send(\''+jsq(S.crew)+'\',\''+S.day+'\')">↪ '+E(T('Send to another job'))+'</button><button onclick="hide(\'m-p25\');P21.split(\''+jsq(S.crew)+'\',\''+S.day+'\')">✂ '+E(T('Split the crew'))+'</button>'
        +'<button onclick="hide(\'m-p25\');P21.copy(\''+jsq(S.crew)+'\',\''+S.day+'\')">⧉ '+E(T('Copy'))+'</button><button class="rd" onclick="P25.clear()">'+E(T('Clear the day'))+'</button>'
      :'<button onclick="P25.pick(\'all\')">'+E(T('Book a job'))+'</button>')+'</div>'
      +'<button class="btn sec2" style="margin-top:14px" onclick="hide(\'m-p25\')">'+E(T('Cancel'))+'</button>';}
  b.innerHTML=h;}
function days(){if(S.how!=='week')return [S.day];const out=[];let k=S.day;for(let i=0;i<7;i++){const g=new Date(k+'T12:00').getDay();if(g===6)break;out.push(k);if(g===5)break;k=addD(k,1);}return out;}
function summary(){const w=S.W;if(!w.length)return E(fmtDay(S.day))+': '+E(T('Day off'))+'. '+E(T('The crew gets a message.'));
  const txt=w.map(a=>sname(a.site).split(',')[0]+' '+fMin(a.start)+' – '+fMin(a.end==null?endOf(S.day):a.end)).join(', '+T('then')+' ');
  if(S.how==='ong')return '<b>'+E(nameOf(S.crew))+'</b>: '+E(txt)+' · '+E(T('every workday'))+' '+E(T('Mon–Fri'))+' ('+E(T('Fri till 1:15 PM'))+'), '+E(fmtDay(S.day))+' →. '+E(T('The crew gets a message.'));
  const ds=days();return '<b>'+E(nameOf(S.crew))+'</b>: '+E(ds.length>1?fmtDay(ds[0])+' – '+fmtDay(ds[ds.length-1]):fmtDay(ds[0]))+' · '+E(txt)+(ds.length>1&&ds.some(isFri)?' ('+E(T('Fri till 1:15 PM'))+')':'')+'. '+E(T('The crew gets a message.'));}

// ───────── saving (same server check as the rest of the schedule) ─────────
async function put(keys,apply,ok){apply();save();let res;
  try{res=window.EX_saveNow?await EX_saveNow({keys:keys.map(k=>['sched',k]),waitMs:15000}):{ok:true};}catch(e){res={error:String(e&&e.message||e)};}
  try{renderSched();}catch(e){}
  if(res&&res.ok){toast('✓ '+ok,'green');return true;}
  if(res&&res.rejected&&res.rejected.length){const stale=res.rejected.some(x=>x.stale);if(stale&&window.EX_catchUp){try{await EX_catchUp();}catch(e){}}
    ask(T('Not saved'),'<div style="font-size:14px;line-height:1.45">'+E(stale?T('Someone else changed this day first. Open it again and try once more.'):T('The server did not accept this change.'))+'</div>',null,'OK');return false;}
  toast('⏳ '+T('Saved on this phone — it will be sent automatically'),'blue');return true;}
const stamp=key=>({rev:rowRev(key)+1,by:me().id,at:Date.now()});
// a whole day, written as ONE list (an empty list = day off, even when an ongoing job repeats)
function dayRow(key,L){const W=joinSame(L.map(clean));if(!W.length)return Object.assign({assignments:[],cancel:['ONG'],replace:{},patch:true},stamp(key));
  return Object.assign({site:W[0].site,time:fMin(W[0].start),assignments:W,note:W.map(a=>a.note).filter(Boolean).join('\n')},stamp(key));}
async function doSave(){const crew=S.crew,day=S.day;const W=S.W.map(a=>clean(a));
  if(S.how==='ong'){if(W.length!==1){toast(T('Until I change it only works with one job all day.'));return;}
    const a=W[0];const cur=activeRule(crew);const rk='ONG:'+crew+':'+Date.now().toString(36);const keys=[rk];if(cur)keys.push('ONG:'+crew+':'+cur.ruleId);
    // from this day on: the explicit days already booked after it stay as they are; this day follows the new rule
    const dk=crew+'|'+day;if(D.sched[dk])keys.push(dk);
    const ok=await put(keys,()=>{if(cur){const ck='ONG:'+crew+':'+cur.ruleId;const prev=addD(day,-1);
        if((cur.from||'')>=day)delete D.sched[ck];else D.sched[ck]=Object.assign({},D.sched[ck],{to:prev,rev:(cur.rev||0)+1,by:me().id,at:Date.now()});}
      D.sched[rk]={site:a.site,start:a.start,end:a.end==null?DAY_END:a.end,workdays:MONFRI,from:day,to:null,note:a.note||'',rev:1,by:me().id,at:Date.now()};
      if(D.sched[dk])delete D.sched[dk];},T('Saved'));
    if(ok)hide('m-p25');return;}
  const ds=days();const keys=ds.map(k=>crew+'|'+k);
  const ok=await put(keys,()=>{ds.forEach(k=>{const key=crew+'|'+k;const L=W.map(a=>Object.assign({},a,{id:newAsgId(),end:(a.end==null?null:(isFri(k)&&!a.home&&a.end>FRI_END&&k!==day?FRI_END:a.end))}));D.sched[key]=dayRow(key,L);});},T('Saved'));
  if(ok)hide('m-p25');}

window.P25={open:(c,k)=>open(c,k),
  pick:f=>{S.pickFor=f;S.q='';S.step='pick';draw();setTimeout(()=>{const q=document.getElementById('p25q');if(q&&window.innerWidth>700)q.focus();},50);},
  q:v=>{S.q=v;const l=document.getElementById('p25list');if(l)l.innerHTML=jobList();},
  job:id=>{const f=S.pickFor;const e=endOf(S.day);
    if(f==='all'){const st=S.W.length?Math.min(...S.W.map(a=>a.start)):DAY_START;const en=S.W.length?(S.W.some(a=>a.end==null)?null:Math.max(...S.W.map(a=>a.end))):e;const home=S.W.some(a=>a.home);
      S.W=[{site:id,start:st,end:en==null?e:en,note:(S.W[0]||{}).note||'',home}];}
    else if(f==='add'){const last=S.W.length?Math.max(...S.W.map(a=>a.end==null?e:a.end)):DAY_START;const st=last>=e?Math.max(DAY_START,e-120):last;
      S.W=S.W.map(a=>(a.end==null||a.end>st)&&a.start<st?Object.assign({},a,{end:st}):a);S.W.push({site:id,start:st,end:Math.max(st+60,e),note:''});}
    else if(f==='edit'){S.W[S.edit]=Object.assign({},S.W[S.edit],{site:id});S.step='edit';S.W=S.W.map(a=>Object.assign({},a,{ongoing:false}));draw();return;}
    S.W=tidy(S.W).map(a=>Object.assign({},a,{ongoing:false}));S.step='day';draw();},
  edit:i=>{S.edit=i;S.step='edit';S.W=S.W.map(a=>Object.assign({},a,{ongoing:false}));draw();},
  set:(f,v)=>{const a=S.W[S.edit];if(f==='start'||f==='end'){const m=hhmm2min(v);if(m==null)return;a[f]=m;if(f==='end')a.home=m!==endOf(S.day)&&a===S.W[S.W.length-1];}else a[f]=v;},
  remove:()=>{S.W.splice(S.edit,1);S.W=tidy(S.W);S.step='day';draw();},
  back:()=>{if(S.step==='edit'){S.W=tidy(S.W);}S.step=S.step==='pick'&&S.pickFor==='edit'?'edit':'day';draw();},
  goHome:()=>{S.home=null;S.step='home';draw();},
  home:v=>{S.home=hhmm2min(v);},
  // Go home at: only the end of the day moves — no second piece of the same job
  homeOk:()=>{const t=S.home;if(t!=null){S.W=S.W.filter(a=>a.start<t).map((a,i,L)=>i===L.length-1?Object.assign({},a,{end:t,home:true,ongoing:false}):Object.assign({},a,{end:a.end==null||a.end>t?t:a.end,ongoing:false}));}S.step='day';draw();},
  how:v=>{S.how=v;draw();},
  clear:()=>{S.W=[];draw();},
  undo:()=>{S.W=S.orig.map(a=>Object.assign({},a));S.how='day';draw();},
  save:()=>doSave()};

// ───────── hooks: tapping a crew opens this screen (booked or empty) ─────────
editSlot=function(cid,k){if(!schedCanEdit())return;schedCrew=cid;return P25.open(cid,k);};
try{window.editSlot=editSlot;}catch(e){}
})();
