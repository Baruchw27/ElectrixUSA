/* p21 — Schedule (Baruch 11/17)
   • One workday for every crew: 8:00 AM – 7:00 PM, Friday till 1:15 PM, Sunday–Friday (crews had 7:00/8:00 and 3:30/6:30/7:30 mixed).
   • Booking: tap a crew's day → short job list (this crew's recent jobs, then active jobs, search for the rest) → tap the job →
     "How long?" Just today · Rest of the week · Until I change it. Optional note.
   • "Send to another job": whole crew or some of the men, right now or at a time. The men get a phone message right away;
     with a time they get a second one when it is time to go (server: private.sched_goto_tick).
   • "Split the crew": give each man his own job for a day (e.g. 2 men to one job, 2 to another).
   • Notes go into the men's messages.
   The Day page, the date strip on top and the colored circles stay exactly as they were. Touches only the schedule (sched). */
(function(){
if(typeof D==='undefined'||typeof effectiveAsgs!=='function'||window.P21)return;
const T=s=>t(s);const E=s=>esc(s==null?'':String(s));
const DAY_START=480,DAY_END=1140,FRI_END=795,WORKDAYS=[0,1,2,3,4,5];
const isFri=k=>!!k&&new Date(k+'T12:00').getDay()===5;
const endOf=k=>isFri(k)?FRI_END:DAY_END;
const addD=(k,n)=>{const d=new Date(k+'T12:00');d.setDate(d.getDate()+n);return dkey(d);};
const todayK=()=>dkey(new Date());
const nowMin=()=>{const d=new Date();return d.getHours()*60+d.getMinutes();};
const fmtDay=k=>new Date(k+'T12:00').toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'});

Object.assign(ES,{'Send to another job':'Mandar a otro trabajo','Split the crew':'Dividir la cuadrilla','Search jobs…':'Buscar trabajos…','Tap a job':'Toque un trabajo',
 "This crew's recent jobs":'Trabajos recientes de esta cuadrilla','Active jobs':'Trabajos activos','Other jobs':'Otros trabajos','No jobs found':'No se encontraron trabajos',
 'How long?':'¿Cuánto tiempo?','Just today':'Solo hoy','Just this day':'Solo este día','Rest of the week':'Resto de la semana','Until I change it':'Hasta que lo cambie',
 'Who?':'¿Quién?','Whole crew':'Toda la cuadrilla','Pick people':'Elegir personas','When?':'¿Cuándo?','All day':'Todo el día','Right now':'Ahora mismo','At a time':'A una hora',
 'Note (optional)':'Nota (opcional)','e.g. bring the ladder':'ej. traer la escalera','Book':'Reservar','Send':'Mandar','Change job':'Cambiar trabajo','Back':'Atrás',
 'Go to':'Ir a','Pick at least one person':'Elija por lo menos una persona','Pick a time':'Elija una hora','yesterday':'ayer','today':'hoy',
 'every workday from':'cada día de trabajo desde','Sunday–Friday':'domingo a viernes','Fri till 1:15 PM':'viernes hasta 1:15 PM',
 'They get a message right away.':'Reciben un mensaje enseguida.','They get a message now and again at':'Reciben un mensaje ahora y otra vez a las',
 'Other days already booked stay as they are.':'Los otros días ya reservados quedan como están.','stays at':'se queda en','stay at':'se quedan en',
 'Go home at':'Se van a casa a las','then home':'y luego a casa','Booked':'Reservado','Sent':'Mandado','Saved on this phone — it will be sent automatically':'Guardado en este teléfono — se mandará automáticamente',
 'Not saved':'No se guardó','Someone else changed this day first. Open it again and try once more.':'Otra persona cambió este día primero. Ábralo otra vez e intente de nuevo.',
 'The server did not accept this change.':'El servidor no aceptó este cambio.','Tap a man, then pick his job':'Toque a un hombre y elija su trabajo',
 'Same as the crew':'Igual que la cuadrilla','Crew job':'Trabajo de la cuadrilla','Nobody was changed':'No se cambió a nadie','Split':'Dividir',
 'is already on':'ya está en','that day':'ese día','from':'desde','till':'hasta','with':'con','and':'y','Save':'Guardar'});

// ───────── 1) one workday for every crew ─────────
let wdDate=null;
crewWorkday=function(){const k=wdDate||(typeof slotDay!=='undefined'&&slotDay)||todayK();return {start:DAY_START,end:endOf(k),workdays:WORKDAYS};};
['crewStatus','remainingMin'].forEach(fn=>{const f=window[fn];if(typeof f!=='function')return;window[fn]=function(c,d){const o=wdDate;wdDate=d;try{return f.apply(this,arguments);}finally{wdDate=o;}};});
// Friday: a full-day job shows till 1:15 PM
const _eff=effectiveAsgs;
effectiveAsgs=function(crewId,date){const out=_eff.apply(this,arguments);if(!isFri(date))return out;
  return out.map(a=>(a.start!=null&&a.start<FRI_END&&(a.end==null||a.end>FRI_END))?Object.assign({},a,{end:FRI_END}):a);};
// the crew's own hours setting is gone (one workday for everyone)
setCrewHours=function(){toast(T('All crews work 8:00 AM – 7:00 PM, Friday till 1:15 PM'));};
ES['All crews work 8:00 AM – 7:00 PM, Friday till 1:15 PM']='Todas las cuadrillas trabajan 8:00 AM – 7:00 PM, viernes hasta 1:15 PM';

// ───────── saving (same server check as the rest of the schedule) ─────────
async function put(keys,apply,okMsg){apply();save();let res;
  try{res=window.EX_saveNow?await EX_saveNow({keys:keys.map(k=>['sched',k]),waitMs:15000}):{ok:true,v:21};}catch(e){res={error:String(e&&e.message||e)};}
  try{renderSched();}catch(e){}
  if(res&&res.ok){toast('✓ '+okMsg,'green');return true;}
  if(res&&res.rejected&&res.rejected.length){const stale=res.rejected.some(x=>x.stale);if(stale&&window.EX_catchUp){try{await EX_catchUp();}catch(e){}}
    ask(T('Not saved'),'<div style="font-size:14px;line-height:1.45">'+E(stale?T('Someone else changed this day first. Open it again and try once more.'):T('The server did not accept this change.'))+'</div>',null,'OK');return false;}
  toast('⏳ '+T('Saved on this phone — it will be sent automatically'),'blue');return true;}
const stamp=()=>({rev:0,by:me().id,at:Date.now()});
function cleanA(a){const o={id:a.id||newAsgId(),site:a.site,start:a.start,end:a.end==null?null:a.end,note:a.note||''};if(a.remind)o.remind=true;if(a.home)o.home=true;return o;}   // home: Baruch 11/20 — the end the boss set with "Go home at"
// Baruch 11/20: the same job right after itself is ONE job (crew 4: 246 Cherry 8:00–1:15 + "at 1:15, go home at 2:30" → 8:00–2:30)
function joinSame(L){const out=[];L.forEach(a=>{const p=out[out.length-1];
  if(p&&p.site===a.site&&p.end!=null&&a.start!=null&&a.start<=p.end){p.end=a.end==null?null:Math.max(p.end,a.end);if(a.home)p.home=true;else delete p.home;if(a.note)p.note=a.note;return;}
  out.push(a);});return out;}
function crewRow(key,list){const L=joinSame(list.map(cleanA).sort((a,b)=>(a.start||0)-(b.start||0)));const p=L[0];
  return {site:p.site,time:fMin(p.start),assignments:L,note:L.map(a=>a.note).filter(Boolean).join('\n'),rev:rowRev(key)+1,by:me().id,at:Date.now()};}
function loanRow(emp,key,list){return {emp,assignments:joinSame(list.map(cleanA).sort((a,b)=>(a.start||0)-(b.start||0))),rev:rowRev(key)+1,by:me().id,at:Date.now()};}
const real=list=>(list||[]).filter(a=>a&&a.site&&a.start!=null);
// cut a list of jobs at time T: keep what happens before T (a job running past T ends at T)
const cutAt=(list,T)=>real(list).filter(a=>a.start<T).map(a=>Object.assign({},a,{end:(a.end==null||a.end>T)?T:a.end,remind:false,home:false}));

// ───────── job list: this crew's recent jobs, active jobs, search ─────────
function recentFor(crew,day){const seen=new Map();for(let i=0;i<21;i++){const k=addD(day,-i-1);real(effectiveAsgs(crew,k)).forEach(a=>{if(!seen.has(a.site))seen.set(a.site,k);});}
  real(effectiveAsgs(crew,day)).forEach(a=>{if(!seen.has(a.site))seen.set(a.site,day);});
  return [...seen.entries()].filter(([id])=>{const s=D.sites.find(x=>x.id===id);return s&&s.stage!=='lost'&&s.stage!=='done';}).map(([id,k])=>({id,k}));}
const activeSites=()=>D.sites.filter(s=>s&&!s.deleted&&s.stage!=='lost'&&s.stage!=='done').sort((a,b)=>String(a.name).localeCompare(String(b.name)));
const STAGE={upcoming:'Upcoming',active:'Roughing',roughdone:'Rough complete',finishing:'Finishing',inspection:'Inspection',ready:'Ready',done:'Done',lost:'Lost'};
function relDay(k,day){const n=Math.round((new Date(day+'T12:00')-new Date(k+'T12:00'))/864e5);return n===0?T('today'):n===1?T('yesterday'):new Date(k+'T12:00').toLocaleDateString(LOC(),{weekday:'short'});}

// ───────── the sheet ─────────
let S=null;
function css(){if(document.getElementById('p21css'))return;const st=document.createElement('style');st.id='p21css';st.textContent=
   '#p21Body h2{margin:2px 0 2px;font-size:18px}#p21Body .p21s{font-size:12.5px;color:var(--g4);margin-bottom:8px}'
  +'#p21Body .p21g{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--g4);margin:12px 2px 4px}'
  +'#p21Body .p21j{display:flex;justify-content:space-between;align-items:center;width:100%;background:none;border:0;border-top:1px solid var(--g2);padding:11px 2px;font-size:15px;color:inherit;text-align:left;cursor:pointer;gap:10px}'
  +'#p21Body .p21j small{color:var(--g4);font-size:12px;white-space:nowrap}#p21Body .p21j.on{font-weight:700}'
  +'#p21Body .p21q{width:100%;font-size:16px;padding:10px 12px;border-radius:10px;border:1px solid var(--g2);background:var(--g1);color:inherit;margin:2px 0 4px}'
  +'#p21Body .p21sel{display:flex;flex-wrap:wrap;gap:4px 20px;margin:2px 2px 4px}#p21Body .p21sel button{background:none;border:0;border-bottom:2px solid transparent;padding:5px 0;font-size:15px;color:var(--g4);cursor:pointer}'
  +'#p21Body .p21sel button.on{color:inherit;font-weight:700;border-bottom-color:currentColor}'
  +'#p21Body .p21pp{display:flex;flex-wrap:wrap;gap:7px;margin:4px 2px}#p21Body .p21pp button{border:1px solid var(--g2);background:none;color:inherit;border-radius:18px;padding:6px 12px;font-size:14px;cursor:pointer}'
  +'#p21Body .p21pp button.on{background:var(--blue);color:#fff;border-color:var(--blue)}'
  +'#p21Body .p21sum{font-size:13px;color:var(--g4);margin:12px 2px 0;line-height:1.4}#p21Body .p21sum b{color:inherit}'
  +'#p21Body .p21m{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--g2);padding:10px 2px}#p21Body .p21m b{font-weight:600}'
  +'#p21Body .p21m button{background:none;border:0;color:var(--blue-mid,#2f6fde);font-size:14px;cursor:pointer;text-align:right;max-width:60%}'
  +'#p21Body input[type=time]{font-size:16px;padding:6px 8px;border-radius:8px;border:1px solid var(--g2);background:var(--g1);color:inherit;margin-left:6px}'
  +'#p21Body textarea{width:100%;min-height:54px;font-size:15px;padding:9px 11px;border-radius:10px;border:1px solid var(--g2);background:var(--g1);color:inherit;font-family:inherit}'
  +'.p21acts{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:8px}.p21acts button{background:none;border:0;padding:2px 0;font-size:13px;color:var(--blue-mid,#2f6fde);cursor:pointer;font-weight:500}'
  +'html[data-theme=dark] #p21Body .p21pp button.on{background:#f2f2f7;color:#111;border-color:#f2f2f7}'
  +'.p21mv{margin-top:9px;padding-top:7px;border-top:1px dashed var(--g2);cursor:pointer}.p21mv .sc-addr{font-size:14.5px}'
  +'.p21late{color:#c0392b!important}.p21late.on{color:#1a8a4a!important}.p21latetag{display:inline-block;font-size:11.5px;font-weight:700;color:#7a4a00;background:#fff4d6;border-radius:6px;padding:2px 7px;margin:2px 0 4px}'
  +'html[data-theme=dark] .p21latetag{background:#4a3a10;color:#f5c26b}'
  +'.p21copy{background:none;border:0;color:var(--blue-mid,#2f6fde);font-size:14px;font-weight:600;padding:6px 2px;cursor:pointer;margin-left:auto;white-space:nowrap}.sc-head{align-items:center}';
  document.head.appendChild(st);}
css();
function host(){let o=document.getElementById('m-p21');if(o)return o;css();
  o=document.createElement('div');o.className='ov hid';o.id='m-p21';o.innerHTML='<div class="md"><div class="hd"></div><div id="p21Body"></div></div>';document.body.appendChild(o);return o;}
function open(o){S=Object.assign({site:null,who:'crew',people:[],when:'all',at:null,until:'day',back:null,home:null,how:'today',note:'',q:'',step:1,pick:null,men:{}},o);
  if(S.mode==='split'){S.step=2;const base=real(effectiveAsgs(S.crew,S.day))[0];crewMembers(S.crew).forEach(m=>{const l=real(loansFor(m.id,S.day))[0];S.men[m.id]=l?l.site:(base?base.site:null);});S.base=base?base.site:null;}
  host();draw();show('m-p21');}
function crewName(c){return nameOf(c);}
function short(m,all){const f=String(m.name||'').split(' ');const dup=all.filter(x=>String(x.name||'').split(' ')[0]===f[0]).length>1;return f[0]+(dup&&f[1]?' '+f[1][0]+'.':'');}
function title(){return E(crewName(S.crew))+' · '+E(fmtDay(S.day));}
function sel(key,opts){return '<div class="p21sel">'+opts.map(([v,l])=>'<button type="button" class="'+(S[key]===v?'on':'')+'" onclick="P21.set(\''+key+'\',\''+v+'\')">'+E(l)+'</button>').join('')+'</div>';}
function list(){const q=S.q.trim().toLowerCase();const cur=S.pick?S.men[S.pick]:S.site;
  const row=(s,small)=>'<button type="button" class="p21j'+(s.id===cur?' on':'')+'" onclick="P21.job(\''+jsq(s.id)+'\')"><span>'+E(s.name)+'</span><small>'+E(small||'')+'</small></button>';
  if(q){const hits=D.sites.filter(s=>s&&!s.deleted&&String(s.name||'').toLowerCase().includes(q)).slice(0,40);
    return hits.length?hits.map(s=>row(s,T(STAGE[s.stage]||''))).join(''):'<div class="p21s" style="margin-top:10px">'+E(T('No jobs found'))+'</div>';}
  const rec=recentFor(S.crew,S.day);const recIds=new Set(rec.map(r=>r.id));
  return (rec.length?'<div class="p21g">'+E(T("This crew's recent jobs"))+'</div>'+rec.map(r=>row(D.sites.find(x=>x.id===r.id),relDay(r.k,S.day))).join(''):'')
   +'<div class="p21g">'+E(T('Active jobs'))+'</div>'+activeSites().filter(s=>!recIds.has(s.id)).map(s=>row(s,T(STAGE[s.stage]||''))).join('');}
function draw(){const b=document.getElementById('p21Body');if(!b||!S)return;const isT=S.day===todayK();let h='';
  if(S.step===1){
    h+='<h2>'+(S.mode==='send'?E(T('Send to another job')):title())+'</h2><div class="p21s">'+(S.mode==='send'?title():E(T('Tap a job')))+'</div>'
      +'<input class="p21q" id="p21q" placeholder="'+E(T('Search jobs…'))+'" value="'+E(S.q)+'" oninput="P21.q(this.value)" autocomplete="off">'
      +'<div id="p21list">'+list()+'</div>'
      +(S.pick?'<button class="btn sec2" style="margin-top:12px" onclick="P21.back()">'+E(T('Back'))+'</button>':'');
    b.innerHTML=h;return;}
  if(S.mode==='split'){
    h+='<h2>'+E(T('Split the crew'))+' · '+E(fmtDay(S.day))+'</h2><div class="p21s">'+E(T('Tap a man, then pick his job'))+'</div>';
    h+=crewMembers(S.crew).map(m=>{const s=S.men[m.id];const same=s===S.base;return '<div class="p21m"><b>'+E(m.name)+'</b><button type="button" onclick="P21.man(\''+jsq(m.id)+'\')">'+E(s?siteName(s).split(',')[0]:T('Pick a job'))+(same?' <span style="color:var(--g4)">· '+E(T('Crew job'))+'</span>':'')+' ›</button></div>';}).join('');
    h+='<div class="p21g">'+E(T('When?'))+'</div>'+sel('when',(isT?[['now',T('Right now')]]:[['all',T('All day')]]).concat([['at',T('At a time')]]))+(S.when==='at'?'<div style="margin:4px 2px"><input type="time" id="p21at" value="'+min2hhmm(S.at==null?720:S.at)+'" onchange="P21.at(this.value)"></div>':'');
    h+='<div class="p21g">'+E(T('Note (optional)'))+'</div><textarea id="p21note" placeholder="'+E(T('e.g. bring the ladder'))+'" oninput="P21.note(this.value)">'+E(S.note)+'</textarea>';
    h+='<div class="p21sum">'+summary()+'</div><button class="btn" style="margin-top:12px" onclick="P21.go()">'+E(T('Save'))+'</button><button class="btn sec2" style="margin-top:8px" onclick="hide(\'m-p21\')">'+E(T('Cancel'))+'</button>';
    b.innerHTML=h;return;}
  const s=D.sites.find(x=>x.id===S.site);const men=crewMembers(S.crew);
  h+='<h2>'+title()+'</h2><button type="button" class="p21j on" onclick="P21.change()"><span>'+E(s?s.name:'')+'</span><small>'+E(T('Change job'))+' ›</small></button>';
  h+='<div class="p21g">'+E(T('Who?'))+'</div>'+sel('who',[['crew',T('Whole crew')],['people',T('Pick people')]]);
  if(S.who==='people')h+='<div class="p21pp">'+men.map(m=>'<button type="button" class="'+(S.people.includes(m.id)?'on':'')+'" onclick="P21.person(\''+jsq(m.id)+'\')">'+E(short(m,men))+'</button>').join('')+'</div>';
  if(S.mode==='send'){h+='<div class="p21g">'+E(T('When?'))+'</div>'+sel('when',(isT?[['now',T('Right now')]]:[['all',T('All day')]]).concat([['at',T('At a time')]]));
    if(S.when==='at')h+='<div style="margin:4px 2px"><input type="time" id="p21at" value="'+min2hhmm(S.at==null?720:S.at)+'" onchange="P21.at(this.value)"></div>';
    h+='<div class="p21g">'+E(T('Until?'))+'</div>'+sel('until',[['day',T('Rest of the day')],['back',T(S.who==='people'?'Back to his crew at':'Back to the first job at')],['home',T('Go home at')]]);
    if(S.until==='back')h+='<div style="margin:4px 2px"><input type="time" value="'+min2hhmm(backMin())+'" onchange="P21.back2(this.value)"></div>';
    if(S.until==='home')h+='<div style="margin:4px 2px"><input type="time" id="p21home" value="'+min2hhmm(homeMin())+'" onchange="P21.home(this.value)"></div>';}
  else h+='<div class="p21g">'+E(T('How long?'))+'</div>'+sel('how',[['today',isT?T('Just today'):T('Just this day')],['week',T('Rest of the week')]].concat(S.who==='crew'?[['ong',T('Until I change it')]]:[]));
  h+='<div class="p21g">'+E(T('Note (optional)'))+'</div><textarea id="p21note" placeholder="'+E(T('e.g. bring the ladder'))+'" oninput="P21.note(this.value)">'+E(S.note)+'</textarea>';
  h+='<div class="p21sum">'+summary()+'</div><button class="btn" style="margin-top:12px" onclick="P21.go()">'+E(T(S.mode==='send'?'Send':'Book'))+'</button><button class="btn sec2" style="margin-top:8px" onclick="hide(\'m-p21\')">'+E(T('Cancel'))+'</button>';
  b.innerHTML=h;}
function startMin(){const isT=S.day===todayK();if(S.mode!=='send'&&S.mode!=='split')return DAY_START;if(S.when==='now'&&isT)return Math.max(DAY_START,Math.floor(nowMin()/5)*5);if(S.when==='at')return S.at==null?720:S.at;return DAY_START;}
function backMin(){const st=startMin();const b=S.back==null?Math.min(endOf(S.day)-30,st+180):S.back;return Math.max(st+15,Math.min(b,endOf(S.day)-15));}
const backOn=()=>S.mode==='send'&&S.until==='back';
// Baruch 11/20: "Go home at" — the day ends at the time he picks (e.g. Friday till 3:00 PM instead of 1:15). The pack-up message,
// the automatic close and the tracker follow it (server: private.man_sched_end). Default: 2 hours after the normal end.
function homeMin(){const st=startMin();const h=S.home==null?Math.min(22*60,endOf(S.day)+120):S.home;return Math.max(st+15,Math.min(h,23*60+45));}
const homeOn=()=>S.mode==='send'&&S.until==='home';
// the job the crew is on at a given time that day (where the men go back to)
function jobAt(crew,day,m){const L=real(effectiveAsgs(crew,day));const a=L.find(x=>x.start<=m&&(x.end==null||x.end>m))||L.filter(x=>x.start<=m).pop()||L[0];return a?a.site:null;}
function names(ids){const n=ids.map(id=>(D.emps.find(e=>e.id===id)||{}).name||'').map(x=>x.split(' ')[0]);return n.length<=1?n.join(''):n.slice(0,-1).join(', ')+' '+T('and')+' '+n[n.length-1];}
function daysFor(){if(S.how!=='week')return [S.day];const out=[];let k=S.day;for(let i=0;i<7;i++){const g=new Date(k+'T12:00').getDay();if(g===6)break;out.push(k);if(g===5)break;k=addD(k,1);}return out;}
function summary(){const st=startMin();const s=S.site?siteName(S.site).split(',')[0]:'';const remindTxt=(st>nowMin()+2||S.day!==todayK());
  if(S.mode==='split'){const moved=crewMembers(S.crew).filter(m=>S.men[m.id]&&S.men[m.id]!==S.base);if(!moved.length)return E(T('Nobody was changed'));
    const by={};moved.forEach(m=>{(by[S.men[m.id]]=by[S.men[m.id]]||[]).push(m.id);});
    return Object.keys(by).map(id=>'<b>'+E(names(by[id]))+'</b> → '+E(siteName(id).split(',')[0])).join('<br>')+'<br>'+E(T('from'))+' '+E(fMin(st))+'. '+E(remindTxt&&S.when==='at'?T('They get a message now and again at')+' '+fMin(st)+'.':T('They get a message right away.'));}
  const who=S.who==='crew'?crewName(S.crew):names(S.people);
  if(S.mode==='send'){const rest=S.who==='people'?crewMembers(S.crew).filter(m=>!S.people.includes(m.id)).map(m=>m.id):[];
    const bk=backOn()?backMin():homeOn()?homeMin():endOf(S.day);const home=backOn()?jobAt(S.crew,S.day,st):null;
    return '<b>'+E(who)+'</b> → <b>'+E(s)+'</b> '+E(T('from'))+' '+E(fMin(st))+' '+E(T('till'))+' '+E(fMin(bk))+(home?', '+E(T('then back to'))+' '+E(siteName(home).split(',')[0]):'')+(homeOn()?', '+E(T('then home')):'')+'. '
      +(rest.length?E(names(rest))+' '+E(T(rest.length===1?'stays at':'stay at'))+' '+E(siteName((real(effectiveAsgs(S.crew,S.day))[0]||{}).site||'').split(',')[0])+'. ':'')
      +E(S.when==='at'&&remindTxt?T('They get a message now and again at')+' '+fMin(st)+'.':T('They get a message right away.'));}
  if(S.how==='ong')return '<b>'+E(who)+'</b> → <b>'+E(s)+'</b> '+E(T('every workday from'))+' '+E(fmtDay(S.day))+', '+E(T('Sunday–Friday'))+', 8:00 AM – 7:00 PM ('+E(T('Fri till 1:15 PM'))+'). '+E(T('Other days already booked stay as they are.'));
  const ds=daysFor();return '<b>'+E(who)+'</b> → <b>'+E(s)+'</b>: '+E(ds.length>1?fmtDay(ds[0])+' – '+fmtDay(ds[ds.length-1]):fmtDay(ds[0]))+', 8:00 AM – '+E(fMin(endOf(ds[0])))+(ds.length>1&&ds.some(isFri)?' ('+E(T('Fri till 1:15 PM'))+')':'')+'.';}

// ───────── doing it ─────────
async function go(){const st=startMin();const isT=S.day===todayK();
  if(S.mode==='split'){const moved=crewMembers(S.crew).filter(m=>S.men[m.id]&&S.men[m.id]!==S.base);const back=crewMembers(S.crew).filter(m=>S.men[m.id]===S.base&&real(loansFor(m.id,S.day)).length);
    if(!moved.length&&!back.length){hide('m-p21');return;}
    const remind=S.when==='at'&&(st>nowMin()+2||!isT);const day=S.day,note=S.note;const keys=moved.concat(back).map(m=>loanKey(m.id,day));
    const ok=await put(keys,()=>{moved.forEach(m=>{const key=loanKey(m.id,day);const keep=cutAt(loansFor(m.id,day),st);D.sched[key]=loanRow(m.id,key,keep.concat([{site:S.men[m.id],start:st,end:endOf(day),note,remind}]));});
      back.forEach(m=>{delete D.sched[loanKey(m.id,day)];});},T('Saved'));
    if(ok)hide('m-p21');return;}
  if(!S.site)return;
  if(S.who==='people'&&!S.people.length){toast(T('Pick at least one person'));return;}
  if(S.mode==='send'&&S.when==='at'&&S.at==null){toast(T('Pick a time'));return;}
  const site=S.site,note=S.note,crew=S.crew,day=S.day;
  const remind=S.mode==='send'&&S.when==='at'&&(st>nowMin()+2||!isT);
  if(S.who==='people'){const days=S.mode==='send'?[day]:daysFor();const keys=[];days.forEach(k=>S.people.forEach(id=>keys.push(loanKey(id,k))));
    const bk=backOn()?backMin():null;const home=bk!=null?jobAt(crew,day,st):null;
    const ok=await put(keys,()=>{days.forEach(k=>S.people.forEach(id=>{const key=loanKey(id,k);const s0=k===day?st:DAY_START;const keep=cutAt(loansFor(id,k),s0);
      const hm=homeOn()&&k===day?homeMin():null;const add=[{site,start:s0,end:bk!=null&&k===day?bk:hm!=null?hm:endOf(k),note,remind:remind&&k===day,home:hm!=null}];
      // back to his crew's job at that time: a reminder 'time to go' goes out then
      if(bk!=null&&k===day&&home)add.push({site:home,start:bk,end:endOf(k),note:'',remind:true});
      D.sched[key]=loanRow(id,key,keep.concat(add));}));},T(S.mode==='send'?'Sent':'Booked'));
    if(ok)hide('m-p21');return;}
  if(S.mode==='send'){const key=crew+'|'+day;const keep=st>DAY_START?cutAt(effectiveAsgs(crew,day),st):[];const bk=backOn()?backMin():null;const home=bk!=null?jobAt(crew,day,st):null;
    const hm=homeOn()?homeMin():null;const add=[{site,start:st,end:bk!=null?bk:hm!=null?hm:endOf(day),note,remind,home:hm!=null}];if(bk!=null&&home)add.push({site:home,start:bk,end:endOf(day),note:'',remind:true});
    const ok=await put([key],()=>{D.sched[key]=crewRow(key,keep.concat(add));},T('Sent'));if(ok)hide('m-p21');return;}
  if(S.how==='ong'){const cur=activeRule(crew);const rid=Date.now().toString(36);const rk='ONG:'+crew+':'+rid;const keys=[rk];const dayKey=crew+'|'+day;
    if(cur)keys.push('ONG:'+crew+':'+cur.ruleId);const hadDay=!!D.sched[dayKey];if(hadDay)keys.push(dayKey);
    const ok=await put(keys,()=>{if(cur){const ck='ONG:'+crew+':'+cur.ruleId;const prev=addD(day,-1);
        if(prev<(cur.from||'')&&(cur.from||'')>=todayK())delete D.sched[ck];else D.sched[ck]=Object.assign({},D.sched[ck],{to:prev,rev:(cur.rev||0)+1,by:me().id,at:Date.now()});}
      D.sched[rk]={site,start:DAY_START,end:DAY_END,workdays:WORKDAYS,from:day,to:null,note,rev:1,by:me().id,at:Date.now()};
      if(hadDay)delete D.sched[dayKey];},T('Booked'));
    if(ok)hide('m-p21');return;}
  const days=daysFor();const keys=days.map(k=>crew+'|'+k);
  const ok=await put(keys,()=>{days.forEach(k=>{const key=crew+'|'+k;D.sched[key]=crewRow(key,[{site,start:DAY_START,end:endOf(k),note}]);});},T('Booked'));
  if(ok)hide('m-p21');}

function lateIds(crew){const t0=new Date().toDateString();const last={};(D.goHomeLog||[]).filter(x=>x&&new Date(x.ts).toDateString()===t0).sort((a,b)=>a.ts-b.ts).forEach(x=>{last[x.who]=x;});
  return crewMembers(crew).map(e=>e.id).filter(id=>last[id]&&last[id].kind==='late');}
window.P21={
  // Stay late for ONE crew, right on its card (same message and same 'no pack-up reminder' as the Stay late button)
  late:crew=>{if(!window.P9L)return;const keep=ghSel.slice();ghSel.splice(0,ghSel.length,crew);try{P9L.late();}finally{ghSel.splice(0,ghSel.length,...keep);}},
  book:(crew,day)=>open({mode:'book',crew,day}),
  send:(crew,day,o)=>open(Object.assign({mode:'send',crew,day,when:day===todayK()?'now':'all'},o||{})),
  split:(crew,day)=>open({mode:'split',crew,day,when:day===todayK()?'now':'all'}),
  set:(k,v)=>{S[k]=v;if(k==='who'&&v==='crew'&&S.how==='ong'){} if(k==='who'&&v==='people'&&S.how==='ong')S.how='today';if(k==='when'&&v==='at'&&S.at==null)S.at=Math.max(DAY_START,Math.min(endOf(S.day)-30,Math.ceil((nowMin()+30)/30)*30));draw();},
  q:v=>{S.q=v;const l=document.getElementById('p21list');if(l)l.innerHTML=list();},
  job:id=>{if(S.pick){S.men[S.pick]=id;S.pick=null;S.q='';S.step=2;draw();return;}S.site=id;S.q='';S.step=2;draw();},
  change:()=>{S.step=1;draw();},back:()=>{S.pick=null;S.q='';S.step=2;draw();},
  man:id=>{S.pick=id;S.q='';S.step=1;draw();},
  person:id=>{const i=S.people.indexOf(id);if(i>=0)S.people.splice(i,1);else S.people.push(id);draw();},
  at:v=>{S.at=hhmm2min(v);draw();},back2:v=>{S.back=hhmm2min(v);draw();},home:v=>{S.home=hhmm2min(v);draw();},note:v=>{S.note=v;const x=document.querySelector('#p21Body .p21sum');if(x)x.innerHTML=summary();},
  go:()=>go(),
  // copy ONE crew's day to other days (same day picker and warnings as the day editor's "Copy day")
  copy:(crew,day)=>{schedCrew=crew;openSlot(day);hide('m-slot');slotCopyPrompt();sunOn();}};
// day picker for copying: Sunday is a workday (not greyed out, and included in "Rest of this week" / "Next 5 workdays")
function sunOn(){setTimeout(()=>{document.querySelectorAll('#askBody [data-k]').forEach(b=>{if(new Date(b.dataset.k+'T12:00').getDay()===0)b.style.opacity='';});},0);}
window.EX_pickQuick=(function(orig){return function(w){if(w==='none'||w==='next'||w==='five'||w==='week'){
  const all=[...document.querySelectorAll('#askBody [data-k]')].map(b=>b.dataset.k);const wd=k=>new Date(k+'T12:00').getDay()!==6;
  let pick=[];if(w==='next')pick=[all.find(wd)].filter(Boolean);else if(w==='five')pick=all.filter(wd).slice(0,5);
  else if(w==='week'){const first=all[0];const sat=addD(first,6-new Date(first+'T12:00').getDay());pick=all.filter(k=>k<=sat&&wd(k));}
  document.querySelectorAll('#askBody [data-k]').forEach(b=>{const on=b.classList.contains('on');if(on!==pick.includes(b.dataset.k))EX_pickToggle(b);});return;}
  return orig&&orig.apply(this,arguments);};})(window.EX_pickQuick);
const _cwd=window.EX_copyWholeDay;if(_cwd)window.EX_copyWholeDay=function(){const r=_cwd.apply(this,arguments);sunOn();return r;};

// ───────── hooks into the existing screens ─────────
// an empty day opens the job list right away; a booked day opens the day editor as before
const _editSlot=editSlot;
editSlot=function(cid,k){if(!schedCanEdit())return;if(!slotHasAny(cid+'|'+k)){schedCrew=cid;return P21.book(cid,k);}return _editSlot.apply(this,arguments);};
// in the day editor, "+ Add a job" = another job this day, from a time
const _pick=slotPickMode;
slotPickMode=function(m){if(m==='menu'){const crew=schedCrew,day=slotDay;let at=null;try{at=slotNextStart();}catch(e){}hide('m-slot');
  return open({mode:'send',crew,day,when:'at',at:(at!=null&&at<endOf(day))?at:720});}return _pick.apply(this,arguments);};
// no Day | Week switch any more — the Schedule is always the Day page (Baruch 11/17: "take it off")
const _rs=renderSched;
renderSched=function(){if(typeof schedView!=='undefined'&&schedView!=='today'&&me()&&me().role!=='worker')schedView='today';const r=_rs.apply(this,arguments);
  const sw=document.getElementById('schedSwitch');if(sw)sw.style.display='none';
  // Stay late lives on each crew card now — the button at the bottom is gone (Baruch 11/17)
  const gb=document.getElementById('goHomeBox2');if(gb&&schedCanEdit()){gb.innerHTML='';gb.style.display='none';}
  // "Same as yesterday" + "Copy this day to…" were two big buttons — now one small "Copy" link next to the date (Baruch 11/17: too big)
  try{const bar=document.getElementById('schDayTools');if(bar)bar.remove();
    const head=document.querySelector('#todayBoard .sc-head');if(head&&schedCanEdit()&&!head.querySelector('.p21copy')){
      const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+boardDay);const k=dkey(d);
      const a=document.createElement('button');a.type='button';a.className='p21copy';a.textContent='⧉ '+T('Copy');a.onclick=()=>copyMenu(k);
      const today=head.querySelector('.sc-today');if(today)head.insertBefore(a,today);else head.appendChild(a);}}catch(e){console.warn(e);}
  return r;};
function copyMenu(k){const y=addD(k,-1);
  ask(T('Copy'),'<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">'
    +'<button class="btn sec2" type="button" onclick="hide(\'m-ask\');EX_sameAsPrev(\''+k+'\')">⧉ '+E(T('Same as yesterday'))+'<div style="font-size:12px;font-weight:400;color:var(--g4)">'+E(fmtDay(y))+' → '+E(fmtDay(k))+'</div></button>'
    +'<button class="btn sec2" type="button" onclick="hide(\'m-ask\');EX_copyWholeDay(\''+k+'\')">'+E(T('Copy this day to…'))+'<div style="font-size:12px;font-weight:400;color:var(--g4)">'+E(fmtDay(k))+' → '+E(T('pick the days'))+'</div></button></div>',null);
  const ok=document.getElementById('askOk');if(ok&&ok.parentNode)ok.parentNode.style.display='none';}
ES['Copy']='Copiar';ES['Staying late']='Se quedan más tarde';ES['Until?']='¿Hasta cuándo?';ES['Rest of the day']='El resto del día';ES['Back to his crew at']='Vuelve con su cuadrilla a las';ES['Back to the first job at']='Vuelven al primer trabajo a las';ES['then back to']='luego vuelve a';ES['pick the days']='elija los días';
// day page: two links on every booked crew; the per-crew hours button is gone (one workday for all)
const _dayBoard=renderDayBoard;
renderDayBoard=function(){const r=_dayBoard.apply(this,arguments);try{if(!schedCanEdit())return r;
  const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+boardDay);const k=dkey(d);if(k<todayK())return r;
  document.querySelectorAll('#todayBoard .sc-row:not(.free)').forEach(row=>{const m=(row.getAttribute('onclick')||'').match(/scToggle\('([^']+)'\)/);if(!m)return;const cid=m[1];
    const body=row.querySelector('.sc-body');if(!body||body.querySelector('.p21acts'))return;
    // men sent somewhere else show right in their crew's card, under the crew's job (Baruch 11/17: "I want to see it on top")
    try{const main=new Set(real(effectiveAsgs(cid,k)).map(a=>a.site));const groups={};
      crewMembers(cid).forEach(g=>{real(loansFor(g.id,k)).filter(a=>!main.has(a.site)).forEach(a=>{const gk=a.site+'|'+a.start+'|'+(a.end==null?'':a.end);(groups[gk]=groups[gk]||{a,men:[]}).men.push(g);});});
      const avs=body.querySelector('.sc-avs');const keys=Object.keys(groups).sort((x,y)=>groups[x].a.start-groups[y].a.start);
      if(avs&&keys.length){const moved=new Set();keys.forEach(gk=>groups[gk].men.forEach(g=>moved.add(g.name)));
        const pick=name=>[...avs.querySelectorAll('.sc-av')].find(x=>x.getAttribute('title')===name);
        let after=avs;keys.forEach(gk=>{const G=groups[gk];const ad=scAddr(G.a.site);
          const blk=document.createElement('div');blk.className='p21mv';
          blk.innerHTML='<div class="sc-top"><span class="sc-addr">↪ '+ad.a+'</span><span class="sc-time">'+E(slotAsgLabel(G.a))+'</span></div>'+(G.a.note?'<div class="sc-sub" style="margin:0 0 2px">'+E(G.a.note)+'</div>':'')+'<div class="sc-avs"></div>';
          const box=blk.querySelector('.sc-avs');G.men.forEach(g=>{const av=pick(g.name);if(av){const c=av.cloneNode(true);c.textContent=c.textContent.replace('→','');box.appendChild(c);}});
          blk.onclick=ev=>{ev.stopPropagation();openLoan(k,G.men[0].id);};
          after.insertAdjacentElement('afterend',blk);after=blk;});
        // the men stay in the crew's own row only if part of their day is still at the crew's job
        [...avs.querySelectorAll('.sc-av')].forEach(x=>{if(moved.has(x.getAttribute('title'))){x.remove();}});}
    }catch(e){console.warn(e);}
    const acts=document.createElement('div');acts.className='p21acts';
    acts.innerHTML='<button type="button" onclick="event.stopPropagation();P21.send(\''+jsq(cid)+'\',\''+k+'\')">↪ '+E(T('Send to another job'))+'</button><button type="button" onclick="event.stopPropagation();P21.split(\''+jsq(cid)+'\',\''+k+'\')">✂ '+E(T('Split the crew'))+'</button><button type="button" onclick="event.stopPropagation();P21.copy(\''+jsq(cid)+'\',\''+k+'\')">⧉ '+E(T('Copy'))+'</button>';
    if(k===todayK()&&window.P9L){const late=lateIds(cid);acts.innerHTML+=late.length?'<button type="button" class="p21late on" onclick="event.stopPropagation();P9L.home(\''+jsq(cid)+'\')">🏠 '+E(T('Send them home'))+'</button>':'<button type="button" class="p21late" onclick="event.stopPropagation();P21.late(\''+jsq(cid)+'\')">🕖 '+E(T('Stay late'))+'</button>';
      if(late.length){const top=body.querySelector('.sc-top');const tag=document.createElement('div');tag.className='p21latetag';tag.textContent='🕖 '+T('Staying late')+(late.length<crewMembers(cid).length?' · '+late.map(id=>nameOf(id).split(' ')[0]).join(', '):'');if(top)top.insertAdjacentElement('afterend',tag);}}
    const more=body.querySelector('.sc-more');if(more)body.insertBefore(acts,more);else body.appendChild(acts);});
  // the separate "Individual moves" list at the bottom is gone — moves show inside each crew
  const orphan=loansForDay(k).some(x=>{const e=D.emps.find(y=>y.id===x.emp);return !e||!e.crew||!slotHasAny(e.crew+'|'+k);});
  if(!orphan)document.querySelectorAll('#todayBoard h4.sc-h4').forEach(h=>{if(h.textContent.trim()===T('Individual moves')){const nx=h.nextElementSibling;if(nx&&nx.classList.contains('sc-group'))nx.remove();h.remove();}});
  document.querySelectorAll('#todayBoard .sc-acts button').forEach(b=>{const oc=b.getAttribute('onclick')||'';if(oc.indexOf('setCrewHours')>=0||/openLoan\('[^']*'\)"?$/.test(oc)||/openLoan\('[^']*'\)$/.test(oc.replace(/^event\.stopPropagation\(\);/,'')))b.remove();});
  // "+ Move a person" is replaced by Send to another job / Split the crew (the list of moves stays; tap one to change it)
  document.querySelectorAll('#todayBoard button.sc-book').forEach(b=>{if(/^openLoan\('[^']*'\)$/.test(b.getAttribute('onclick')||''))b.remove();});
 }catch(e){console.warn(e);}return r;};
})();
