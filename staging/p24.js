/* p24 — Payroll "Today" page, circles (Baruch 11/22, picked from the idea pictures: C circles + 2,3,6,8,12,18,23,24,27,28,38,44 + home card 40).
   • Today is the FIRST tab of the payroll page and the page opens on it.
   • One ringed circle per man (initials inside). The ring = how far his day is (punch-in → go-home), colored by his phone tracker:
     green = working, orange = quiet, red = no tracker. Past go-home and not kept late = the whole ring red.
   • Under the circle: name (★ crew leader), the job he is at now, "in 7:06 · 2h 36m", and a small red tag only when something is wrong
     (no punch, tracker quiet, past go-home; late only in the grey panel — Baruch 11/22). A grey tag when his punch is still waiting on his phone.
   • Not here yet = empty grey circle with "due 8:00"; after that time with no punch it turns red. Left the job = faded.
     Punched out = small check. First 2 weeks = small "new". Live tracker = soft glow. Each group in arrival order.
   • Switch By job / By crew. Job header: address + each crew's hours there. Tap a man → grey panel with his day + "Time card ›".
   • Top: one summary line and a quiet "Updated 9:42". After everyone is done: "Done for today · …".
   Read only — nothing here saves anything. Owner + Payroll only (same as the payroll page). */
(function(){
if(window.EX_P24_OFF)return;
const $=id=>document.getElementById(id);
const T=s=>{try{if(lang()==='es'&&L24[s])return L24[s];}catch(e){}try{return t(s);}catch(e){return s;}};
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const J=s=>{try{return jsq(s);}catch(e){return String(s).replace(/'/g,"\\'");}};
const L24={"By job":"Por trabajo","By crew":"Por cuadrilla","Updated":"Actualizado","in":"entró","left":"se fue","out":"salió","due":"entra","late":"tarde",
 "no punch":"sin marca","past go-home":"pasó su hora","tracker quiet":"GPS callado","new":"nuevo",
 "Booked":"Reservado","Not booked today":"Sin reserva hoy","Staying late until":"Se queda hasta","Staying late":"Se queda tarde","Sent home at":"Enviado a casa a las","Go home":"Salida",
 "No tracker on his phone":"Sin rastreador en su teléfono","Tracker last seen":"Rastreador visto por última vez","Tracker not connected":"Rastreador no conectado","crew leader":"líder de cuadrilla",
 "today":"hoy","Due":"Entra","No punch today":"Sin marca hoy","Time card":"Tarjeta de tiempo","now":"ahora","battery":"batería","charging":"cargando","came":"llegó","min late":"min tarde",
 "staying until":"se queda hasta","staying late":"se queda tarde","until":"hasta","No crew":"Sin cuadrilla","No job":"Sin trabajo","Done for today":"Terminado por hoy","men":"hombres",
 "job":"trabajo","jobs":"trabajos","came late":"llegaron tarde","never punched in":"nunca marcaron","everyone punched out":"todos marcaron salida","due later":"entran más tarde",
 "missing":"sin marca","left the job":"dejaron el trabajo","done":"terminaron","Nobody is booked or punched in today.":"Nadie está reservado ni marcado hoy.","Not on the time clock":"Sin reloj de tiempo","working":"trabajando","waiting for OK":"esperando aprobación","His punch-in is waiting for your OK":"Su entrada espera su aprobación"};
const LOCX=()=>{try{return LOC();}catch(e){return 'en-US';}};
const DAY_START=480,DAY_END=1140,FRI_END=795;
const tk=()=>dkey(new Date());
const nowMin=()=>{const d=new Date();return d.getHours()*60+d.getMinutes();};
const dayEnd=k=>new Date(k+'T12:00').getDay()===5?FRI_END:DAY_END;
const fm=m=>{try{return fMin(m).replace(/\s?([AP]M)$/i,'');}catch(e){return '';}};       // 3:00
const ft=ms=>{if(!ms)return '';const d=new Date(ms);return ((d.getHours()+11)%12+1)+':'+String(d.getMinutes()).padStart(2,'0');};      // 7:06
const hm=h=>{const m=Math.max(0,Math.round(h*60));return Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m';};
const short=s=>(siteName(s)||'').replace(/, NY \d{5}/g,'').split(',')[0];
const ini=n=>{const p=String(n||'').trim().split(/\s+/);return ((p[0]||'')[0]||'').toUpperCase()+((p.length>1?p[p.length-1]:'')[0]||'').toUpperCase();};
let mode='job',openId=null,lastDraw=0,anim=true;
try{mode=localStorage.getItem('p24mode')||'job';}catch(e){}

const css=document.createElement('style');css.textContent=
 '@property --p24a{syntax:"<percentage>";inherits:false;initial-value:0%}'
+'.p24top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}'
+'.p24sw{display:inline-flex;background:var(--g1);border-radius:9px;padding:3px}.p24sw button{font:inherit;font-size:13px;border:0;background:none;padding:5px 12px;border-radius:7px;color:var(--g4);cursor:pointer}'
+'.p24sw button.on{background:var(--g0,#fff);color:var(--g5);font-weight:600}html[data-theme=dark] .p24sw button.on{background:var(--g3)}'
+'.p24up{font-size:11.5px;color:var(--g4);white-space:nowrap}.p24up i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#2fb36b;margin-right:5px;vertical-align:1px}'
+'.p24sum{font-size:13px;color:var(--g4);margin:10px 2px 0;line-height:1.45}'
+'.p24g{margin-top:22px}.p24gt{font-weight:600;font-size:15px;color:var(--g5)}.p24gs{font-size:12.5px;color:var(--g4);margin-top:1px}'
+'.p24ms{display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:16px 4px;margin-top:12px}'
+'.p24m{min-width:0;text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent}.p24m.fade{opacity:.45}'
+'.p24r{position:relative;margin:0 auto;width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:conic-gradient(var(--p24c) 0 var(--p24a),var(--g2) var(--p24a));transition:--p24a 1.1s ease-out}'
+'.p24r.dash{background:none;border:2px dashed #d9483b;box-sizing:border-box}'
+'.p24in{width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:15px;background:var(--green-bg);color:var(--green)}'
+'.p24in.w{background:var(--g1);color:var(--g4);font-weight:500}.p24in.x{background:var(--red-bg);color:#c0392b}'
+'.p24live{animation:p24gl 2.6s ease-in-out infinite}@keyframes p24gl{0%,100%{box-shadow:0 0 0 0 rgba(47,179,107,0)}50%{box-shadow:0 0 10px 2px rgba(47,179,107,.45)}}'
+'@media (prefers-reduced-motion:reduce){.p24live{animation:none}.p24r{transition:none}}'
+'.p24ck{position:absolute;right:-1px;bottom:-1px;width:18px;height:18px;border-radius:50%;background:#2fb36b;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center}'
+'.p24bt{position:absolute;left:-4px;bottom:-2px;min-width:20px;height:18px;padding:0 4px;box-sizing:border-box;border-radius:9px;background:#d9483b;color:#fff;font-size:10px;font-weight:600;line-height:18px;text-align:center}.p24nw{position:absolute;top:-5px;right:-14px;font-size:10px;line-height:15px;padding:0 6px;border-radius:8px;background:var(--g1);color:var(--g5)}'
+'.p24nm{font-weight:600;font-size:13px;color:var(--g5);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.p24nm b{color:var(--amber);font-weight:600}'
+'.p24s{font-size:11px;color:var(--g4);line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
+'.p24tag{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:top;box-sizing:border-box;margin-top:3px;font-size:10.5px;line-height:16px;padding:0 7px;border-radius:9px;background:var(--red-bg);color:#c0392b;white-space:nowrap}.p24tag.g{background:var(--g1);color:var(--g4)}'
+'.p24pn{background:var(--g1);border-radius:12px;padding:12px 14px;margin-top:14px;font-size:13.5px;line-height:1.65;color:var(--g5)}.p24pn .s{font-size:12.5px;color:var(--g4)}'
+'.p24pn button{font:inherit;font-size:13.5px;font-weight:600;color:var(--blue-mid);background:none;border:0;padding:6px 0 0;cursor:pointer}'
+'.p24q{font-size:12.5px;color:var(--g4);margin:22px 2px 0;line-height:1.5}';
document.head.appendChild(css);

// ── who is booked where today, his go-home, his tracker ──
function lastGH(id){const t0=new Date().toDateString();return (D.goHomeLog||[]).filter(x=>x&&x.who===id&&x.ts&&new Date(x.ts).toDateString()===t0).sort((a,b)=>b.ts-a.ts)[0]||null;}
function booked(e,k){let L=[];try{L=empTimeline(e.id,k).filter(a=>a&&a.site);}catch(x){}return L.sort((a,b)=>(a.start==null?-1:a.start)-(b.start==null?-1:b.start));}
function goHome(e,k,L){if(!L.length)return null;const g=lastGH(e.id);
  if(g&&g.kind==='late')return g.until!=null?{end:g.until,late:true}:{end:null,late:true};
  if(g&&g.kind!=='late'){const d=new Date(g.ts);return {end:d.getHours()*60+d.getMinutes(),sent:true};}
  const ends=L.map(a=>a.end==null?dayEnd(k):a.end);return {end:Math.max(...ends)};}
function tracker(e){if(e.appClock!==true)return 'none';if(typeof otRep==='undefined'||!otRep)return 'ok';
  const x=(otRep.people||[]).find(p=>p.who===e.id);if(!x||!x.last)return 'none';const last=new Date(x.last).getTime();
  return Date.now()-last<40*60000?'ok':'quiet';}
// Baruch 11/22: battery from the tracker — low (15% or less), not charging, reading from the last 2 hours
function batt(e){try{const x=((otRep&&otRep.people)||[]).find(p=>p.who===e.id);if(!x||x.batt==null||!x.batt_at)return null;const at=new Date(x.batt_at).getTime();return {v:+x.batt,ch:x.bs===2||x.bs===3,at,old:Date.now()-at>2*36e5};}catch(z){return null;}}
function trackerLast(e){try{const x=((otRep&&otRep.people)||[]).find(p=>p.who===e.id);return x&&x.last?new Date(x.last).getTime():0;}catch(z){return 0;}}
function isNew(e){const ins=(D.punches||[]).filter(p=>p&&p.who===e.id&&!p.voided).map(p=>p.in);if(!ins.length)return false;return Date.now()-Math.min(...ins)<14*864e5;}
function todayPunches(id){const t0=new Date();t0.setHours(0,0,0,0);return (D.punches||[]).filter(p=>p&&p.who===id&&p.in>=t0.getTime()&&(typeof payCounts==='function'?payCounts(p):!p.voided&&!p.rejected)).sort((a,b)=>a.in-b.in);}

function man(e){const k=tk(),nm=nowMin();const s=attStatusOf(e.id);const P=todayPunches(e.id);const L=booked(e,k);const gh=goHome(e,k,L);
  const open=P.find(p=>!p.out&&!p.away)||null,away=!open&&P.find(p=>!p.out&&p.away)||null,last=P[P.length-1]||null;
  const start=L.length?(L[0].start==null?DAY_START:L[0].start):null;
  let nowSite=null;try{const ms=mySchedDay(e,k);nowSite=ms&&ms.site;}catch(x){}
  const r={e,s,P,L,gh,start,tr:tracker(e),lead:!!e.lead,nw:isNew(e),bt:batt(e)};
  const firstIn=P.length?P[0].in:null;const fiMin=firstIn?(new Date(firstIn).getHours()*60+new Date(firstIn).getMinutes()):null;
  r.late=(start!=null&&fiMin!=null&&fiMin-start>=10)?fiMin-start:0;
  if(open||s.status==='working'){r.k='in';r.site=(open&&open.site)||s.site;}
  else if(away){r.k='left';r.site=away.site;r.leftAt=away.away;}
  else if(P.length){r.k='out';r.site=last.site;r.outAt=last.out||last.away;}
  else if(L.length){r.k=nm<start?'wait':'none';r.site=nowSite||L[0].site;}
  else{r.k='off';r.site=null;}
  r.hours=s.hours||0;r.firstIn=firstIn;
  // ring: punch-in → go-home
  const end=gh&&gh.end!=null?gh.end:null;
  if(r.k==='in'){if(end!=null&&nm>end&&!(gh&&gh.late&&gh.end==null)){r.past=nm-end;r.pct=100;}
    else{const a=fiMin,b=end!=null?end:dayEnd(k);r.pct=b>a?Math.max(3,Math.min(100,Math.round((nm-a)/(b-a)*100))):100;}}
  else if(r.k==='out'||r.k==='left')r.pct=100;else if(r.k==='none')r.pct=100;else r.pct=0;
  return r;}

// ── one circle ──
function circle(r){const tags=[];
  if(r.k==='none')tags.push(r.s.waiting?['g','⏳ '+T('waiting for OK')]:['',T('no punch')]);
  if(r.k==='in'&&r.past)tags.push(['',T('past go-home')]);
  else if(r.k==='in'&&r.tr==='quiet')tags.push(['',T('tracker quiet')]);
  let col=r.tr==='quiet'?'#e0a33a':r.tr==='none'?'#d9483b':'#2fb36b';let inC='';
  if(r.k==='in'&&r.past)col='#d9483b';
  if(r.k==='out'||r.k==='left')col='#2fb36b';
  if(r.k==='wait'){col='var(--g2)';inC=' w';}
  if(r.k==='none'){col=r.s.waiting?'var(--g3)':'#d9483b';inC=r.s.waiting?' w':' x';}
  const line=r.k==='in'?T('in')+' '+ft(r.firstIn)
    :r.k==='left'?T('left')+' '+ft(r.leftAt)
    :r.k==='out'?T('out')+' '+ft(r.outAt)
    :r.k==='wait'?T('due')+' '+fm(r.start)
    :T('due')+' '+fm(r.start);
  const live=r.k==='in'&&r.tr==='ok'&&!r.past;const noCrew=!r.e.crew;
  return '<div class="p24m'+(r.k==='left'?' fade':'')+'" onclick="P24.tap(\''+J(r.e.id)+'\')">'
    +'<div class="p24r'+(live?' p24live':'')+(noCrew&&r.k!=='wait'?' dash':'')+'" style="--p24c:'+col+'" data-p24a="'+(r.pct||0)+'">'
    +'<div class="p24in'+inC+'">'+E(ini(r.e.name))+'</div>'
    +(r.k==='out'?'<div class="p24ck">✓</div>':'')+(r.bt&&!r.bt.ch&&!r.bt.old&&r.bt.v<=15&&(r.k==='in'||r.k==='wait'||r.k==='none')?'<div class="p24bt">'+r.bt.v+'%</div>':'')+(r.nw?'<span class="p24nw">'+E(T('new'))+'</span>':'')+'</div>'
    +'<div class="p24nm">'+E(r.dn||String(r.e.name||'').split(' ')[0])+(r.lead?' <b>★</b>':'')+'</div>'
    +(r.site&&mode==='crew'&&(r.k==='in'||r.k==='left')&&r.site!==r.gsite?'<div class="p24s">'+E(short(r.site))+'</div>':'')
    +'<div class="p24s">'+E(line)+'</div>'+(r.P.length?'<div class="p24s">'+E(hm(r.hours))+'</div>':'')
    +tags.map(t=>'<div><span class="p24tag '+t[0]+'">'+E(t[1])+'</span></div>').join('')+'</div>';}

function panel(r){const k=tk();const cr=(D.crews||[]).find(c=>c.id===r.e.crew);
  const bk=r.L.length?T('Booked')+' '+r.L.map(a=>short(a.site)+' '+fm(a.start==null?DAY_START:a.start)+'–'+fm(a.end==null?dayEnd(k):a.end)).join(', '):T('Not booked today');
  const gh=r.gh?(r.gh.late?(r.gh.end!=null?T('Staying late until')+' '+fm(r.gh.end):T('Staying late')):r.gh.sent?T('Sent home at')+' '+fm(r.gh.end):T('Go home')+' '+fm(r.gh.end)):'';
  const pp=r.P.map(p=>short(p.site)+' · '+ft(p.in)+' – '+(p.out?ft(p.out):p.away?T('left')+' '+ft(p.away):T('now'))).join('<br>');
  const tl=trackerLast(r.e);
  const trk=r.e.appClock!==true?T('No tracker on his phone'):tl?T('Tracker last seen')+' '+ft(tl):T('Tracker not connected');
  return '<div class="p24pn"><div style="font-weight:600;font-size:14.5px">'+E(r.e.name)+(r.lead?' · '+E(T('crew leader')):'')+'</div>'
   +'<div class="s">'+E((cr?cr.name+' · ':'')+bk)+(gh?' · '+E(gh):'')+'</div>'
   +(r.P.length?'<div style="margin-top:6px">'+pp+'</div><div class="s">'+E(hm(r.hours))+' '+E(T('today'))+(r.late?' · <span style="color:#c0392b">'+E(T('came'))+' '+r.late+' '+E(T('min late'))+'</span>':'')+'</div>':'<div style="margin-top:6px">'+E(r.k==='wait'?T('Due')+' '+fm(r.start):r.s.waiting?T('His punch-in is waiting for your OK'):T('No punch today'))+'</div>')
   +'<div class="s">'+E(trk)+(r.bt?' · <span'+(r.bt.v<=15&&!r.bt.ch?' style="color:#c0392b"':'')+'>'+E(T('battery'))+' '+r.bt.v+'%'+(r.bt.ch?' '+E(T('charging')):'')+' ('+ft(r.bt.at)+')</span>':'')+'</div>'
   +'<button onclick="event.stopPropagation();P19.open(\''+J(r.e.id)+'\','+Date.now()+')">'+E(T('Time card'))+' ›</button></div>';}

// ── groups ──
function crewEnds(site,k){const out=[];(D.crews||[]).forEach(c=>{let A=[];try{A=slotAsgs(c.id+'|'+k);}catch(x){}const a=A.filter(x=>x.site===site);if(!a.length)return;
  const mem=crewMembers(c.id).map(e=>e.id);const g=mem.map(lastGH).filter(Boolean);const late=g.length&&g.every(x=>x.kind==='late');
  const end=Math.max(...a.map(x=>x.end==null?dayEnd(k):x.end));const until=late?(g.find(x=>x.until!=null)||{}).until:null;
  out.push(E(c.name)+' '+(late?(until!=null?T('staying until')+' '+fm(until):T('staying late')):T('until')+' '+fm(end)));});return out.join(' · ');}
const order=a=>a.slice().sort((x,y)=>(x.firstIn||(x.start!=null?8.64e15+x.start:9e15))-(y.firstIn||(y.start!=null?8.64e15+y.start:9e15)));

window.renderAttendance=function(){const box=$('attWrap');if(!box)return;const k=tk();
  const all=attField().map(man);const fn={};all.forEach(r=>{const f=String(r.e.name||'').split(' ')[0];fn[f]=(fn[f]||0)+1;});
  all.forEach(r=>{const p=String(r.e.name||'').trim().split(/\s+/);if(fn[p[0]]>1&&p.length>1)r.dn=p[0]+' '+p[p.length-1];});const show=all.filter(r=>r.k!=='off');const off=all.filter(r=>r.k==='off');
  let groups=[];
  if(mode==='crew'){const by={};show.forEach(r=>{const c=r.e.crew||'_';(by[c]=by[c]||[]).push(r);});
    groups=(D.crews||[]).filter(c=>by[c.id]).map(c=>{let sd=null;try{sd=schedDay(c.id+'|'+k);}catch(x){}const s=sd&&sd.site;
      const ms=by[c.id];const ends=ms.map(r=>r.gh&&r.gh.end).filter(x=>x!=null);
      ms.forEach(r=>r.gsite=s||null);
      return {id:c.id,t:c.name,s:[s?short(s):'',ends.length?T('until')+' '+fm(Math.max(...ends)):''].filter(Boolean).join(' · '),m:ms};});
    if(by._)groups.push({id:'_',t:T('No crew'),s:'',m:by._});}
  else{const by={};show.forEach(r=>{const s=r.site||'_';(by[s]=by[s]||[]).push(r);});
    groups=Object.keys(by).sort((a,b)=>a==='_'?1:b==='_'?-1:by[b].length-by[a].length).map(s=>({id:s,t:s==='_'?T('No job'):short(s)||siteName(s),s:s==='_'?'':crewEnds(s,k),m:by[s]}));}
  // summary line (or the end-of-day summary once nobody is working anymore)
  const n=w=>show.filter(r=>r.k===w).length;const working=n('in')+n('left');const jobs=new Set(show.filter(r=>r.P.length).map(r=>r.site)).size;
  const anyIn=show.some(r=>r.P.length);const done=anyIn&&!working&&new Date().getHours()>=13;
  let sum;
  if(done){const tot=show.reduce((q,r)=>q+(r.hours||0),0);const late=show.filter(r=>r.late).length,never=n('none');
    sum='<b style="color:var(--g5)">'+E(T('Done for today'))+'</b> · '+show.filter(r=>r.P.length).length+' '+E(T('men'))+' · '+jobs+' '+E(T(jobs===1?'job':'jobs'))+' · '+Math.round(tot)+'h'
      +(late?' · '+late+' '+E(T('came late')):'')+(never?' · '+never+' '+E(T('never punched in')):'')+' · '+E(T('everyone punched out'));}
  else{const parts=[n('in')+' '+T('working')];if(n('wait'))parts.push(n('wait')+' '+T('due later'));if(n('none'))parts.push(n('none')+' '+T('missing'));if(n('left'))parts.push(n('left')+' '+T('left the job'));if(n('out'))parts.push(n('out')+' '+T('done'));parts.push(jobs+' '+T(jobs===1?'job':'jobs'));
    sum=E(parts.join(' · '));}
  const sw='<div class="p24sw"><button class="'+(mode==='job'?'on':'')+'" onclick="P24.mode(\'job\')">'+E(T('By job'))+'</button><button class="'+(mode==='crew'?'on':'')+'" onclick="P24.mode(\'crew\')">'+E(T('By crew'))+'</button></div>';
  const up='<span class="p24up"><i></i>'+E(T('Updated'))+' '+E(new Date().toLocaleTimeString(LOCX(),{hour:'numeric',minute:'2-digit'}))+'</span>';
  const fc=D.emps.filter(e=>noClock(e)&&!e.inactive&&e.role!=='office'&&e.role!=='owner');
  box.innerHTML='<div class="p24"><div class="p24top">'+sw+up+'</div><div class="p24sum">'+sum+'</div>'
   +groups.map(g=>{const ms=order(g.m);const op=ms.find(r=>r.e.id===openId);
      return '<div class="p24g" data-p24g="'+E(g.id)+'"><div class="p24gt">'+E(g.t)+'</div>'+(g.s?'<div class="p24gs">'+g.s+'</div>':'')
        +'<div class="p24ms">'+ms.map(circle).join('')+'</div>'+(op?panel(op):'')+'</div>';}).join('')
   +(!groups.length?'<div class="p24q">'+E(T('Nobody is booked or punched in today.'))+'</div>':'')
   +(off.length?'<div class="p24q">'+E(T('Not booked today'))+' · '+E(off.map(r=>String(r.e.name).split(' ')[0]).join(', '))+'</div>':'')
   +(fc.length?'<div class="p24q" style="margin-top:6px">'+E(T('Not on the time clock'))+' · '+E(fc.map(e=>String(e.name).split(' ')[0]).join(', '))+'</div>':'')+'</div>';
  // rings fill in when the page is opened (not on the quiet refresh every minute)
  const go=anim||Date.now()-lastDraw>3*60000;anim=false;lastDraw=Date.now();
  box.querySelectorAll('.p24r').forEach(el=>{const a=el.getAttribute('data-p24a')+'%';
    if(!go){el.style.transition='none';el.style.setProperty('--p24a',a);return;}
    el.style.setProperty('--p24a','0%');requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.transition='';el.style.setProperty('--p24a',a);}));});};
window.renderAttCards=function(){};
try{renderAttendance=window.renderAttendance;renderAttCards=window.renderAttCards;}catch(e){}

const P24=window.P24={};
P24.mode=v=>{mode=v;openId=null;try{localStorage.setItem('p24mode',v);}catch(e){}renderAttendance();};
P24.tap=id=>{openId=openId===id?null:id;renderAttendance();};
// home "On the job now": a job opens Today on that job
P24.job=sid=>{try{const b=document.querySelector('.tab[onclick*="\'hours\'"]');mode='job';openId=null;anim=true;tab('hours',b);setPaySec('today');
  setTimeout(()=>{const el=document.querySelector('[data-p24g="'+(window.CSS&&CSS.escape?CSS.escape(sid):sid)+'"]');if(el)try{el.scrollIntoView({block:'start'});}catch(e){}},120);}catch(e){try{openFolder(sid);}catch(x){}}};

// ── Today is the first tab, and the payroll page opens on it ──
try{paySec='today';}catch(e){}
const _rps=window.renderPaySeg;
window.renderPaySeg=function(){const r=_rps.apply(this,arguments);const el=$('paySeg');
  if(el){const b=el.querySelector('button[onclick*="\'today\'"]');if(b&&el.firstChild!==b)el.insertBefore(b,el.firstChild);}
  return r;};
try{renderPaySeg=window.renderPaySeg;}catch(e){}
const _sps=window.setPaySec;
window.setPaySec=function(k){if(k==='today'&&paySec!=='today')anim=true;return _sps.apply(this,arguments);};
try{setPaySec=window.setPaySec;}catch(e){}
// the tracker report arrives a moment later — draw Today again when it does
let _ot=null;setInterval(()=>{try{if(typeof otRep!=='undefined'&&otRep!==_ot){_ot=otRep;if(curPage()==='hours'&&paySec==='today')renderAttendance();}}catch(e){}},2000);


})();
