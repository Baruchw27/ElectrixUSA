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
const L24={"not on Move":"no está en Move","OwnTracks on Quiet":"OwnTracks en Silencio","GPS stuck":"GPS trabado","phone silent":"teléfono callado","clock open — waiting for his phone":"reloj abierto — esperando su teléfono","Last GPS fix":"Última posición GPS","Tracker mode":"Modo del rastreador","not reported yet":"todavía no reportado","Move":"Move","Significant changes":"Cambios significativos","Manual":"Manual","Quiet":"Silencio","App last saw him":"La app lo vio por última vez","not at any job":"en ningún trabajo","off job":"fuera","Crews":"Cuadrillas","Jobs":"Trabajos","Updated":"Actualizado","in":"entró","left":"se fue","out":"salió","due":"entra","late":"tarde",
 "no punch":"sin marca","past go-home":"pasó su hora","tracker quiet":"GPS callado","new":"nuevo",
 "Booked":"Reservado","Not booked today":"Sin reserva hoy","Staying late until":"Se queda hasta","Staying late":"Se queda tarde","Sent home at":"Enviado a casa a las","Go home":"Salida",
 "No tracker on his phone":"Sin rastreador en su teléfono","Tracker last seen":"Rastreador visto por última vez","Tracker not connected":"Rastreador no conectado","crew leader":"líder de cuadrilla",
 "today":"hoy","Due":"Entra","No punch today":"Sin marca hoy","Time card":"Tarjeta de tiempo","now":"ahora","yesterday":"ayer","Booked today":"Reservado hoy","Stay late":"Quedarse tarde","Sent home":"Enviado a casa","no end time":"sin hora de salida","Punches today":"Marcas de hoy","punched in outside the job area":"marcó fuera del área del trabajo","approved by":"aprobado por","punched out away from the job":"marcó salida fuera del trabajo","clock closed when he left the job":"el reloj se cerró cuando dejó el trabajo","changed by":"cambiado por","Hours today":"Horas hoy","Came late":"Llegó tarde","min":"min","booked":"reservado","His phone":"Su teléfono","Last check-in":"Último reporte","never":"nunca","Battery":"Batería","Arrived":"Llegó a","Left":"Salió de","This week":"Esta semana","Hours":"Horas","OT":"HE","Open his time card":"Abrir su tarjeta de tiempo","battery":"batería","charging":"cargando","came":"llegó","min late":"min tarde",
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
let mode='crew',openId=null,lastDraw=0,anim=true;
try{mode=localStorage.getItem('p24mode')||'crew';}catch(e){}

const css=document.createElement('style');css.textContent=
 '@property --p24a{syntax:"<percentage>";inherits:false;initial-value:0%}'
+'.p24top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}'
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
+'.p24pn{background:#fff;border-radius:12px;padding:12px 14px;margin-top:14px;font-size:13.5px;line-height:1.65;color:var(--g5)}.p24pn .s{font-size:12.5px;color:var(--g4)}'
+'html[data-theme=dark] .p24pn{background:var(--g1)}.p24pn .ph{font-size:11.5px;font-weight:600;color:var(--g4);text-transform:uppercase;letter-spacing:.4px;margin:12px 0 2px}.p24pn .pr{display:flex;justify-content:space-between;gap:12px;padding:2px 0}.p24pn .pr span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.p24pn .pr b{font-weight:500;white-space:nowrap}.p24pn button{font:inherit;font-size:13.5px;font-weight:600;color:var(--blue-mid);background:none;border:0;padding:6px 0 0;cursor:pointer}'
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
function appSeen(e){try{const x=((otRep&&otRep.app)||[]).find(p=>p.who===e.id);if(!x||!x.at)return null;const at=Number(x.at);if(new Date(at).toDateString()!==new Date().toDateString())return null;return {site:x.site||null,at};}catch(z){return null;}}
function otMode(e){try{const x=((otRep&&otRep.people)||[]).find(p=>p.who===e.id);return x&&x.mode!=null?Number(x.mode):null;}catch(z){return null;}}
// Baruch 11/24: reports keep coming but the position inside them is old → GPS stuck (Shauly)
function otFix(e){try{const x=((otRep&&otRep.people)||[]).find(p=>p.who===e.id);return x&&x.fix?Number(x.fix):0;}catch(z){return 0;}}
function gpsStuck(e){if(e.appClock!==true)return false;const l=trackerLast(e),f=otFix(e);return !!(l&&f&&Date.now()-l<40*60000&&l-f>60*60000);}
function quietMin(e){const l=trackerLast(e);return l?Math.max(0,Math.round((Date.now()-l)/60000)):null;}
const MODE_N={'2':'Move','1':'Significant changes','0':'Manual','-1':'Quiet'};
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
  if(r.k!=='in'&&r.k!=='wait'){const ap=appSeen(r.e);const lastP=r.P.length?Math.max(...r.P.map(p=>p.out||p.away||p.in)):0;
    if(ap&&ap.at>lastP&&Date.now()-ap.at<90*60000)tags.push(ap.site?['g','📍 '+short(ap.site)+' '+ft(ap.at)]:['',T('off job')+' '+ft(ap.at)]);}
  {const md=r.e.appClock===true?otMode(r.e):null;if(md!=null&&md!==2&&(r.k==='in'||r.k==='left'||r.k==='wait'||r.k==='none'))tags.push(['',T(md===-1?'OwnTracks on Quiet':'not on Move')]);}
  if((r.k==='in'||r.k==='left'||r.k==='wait'||r.k==='none')&&gpsStuck(r.e))tags.push(['',T('GPS stuck')]);
  if(r.k==='left')tags.push(['',T('clock open — waiting for his phone')]);   // Baruch 11/24: the server waits for a report before closing
  if(r.k==='in'&&r.past)tags.push(['',T('past go-home')]);
  else if((r.k==='in'||r.k==='left')&&r.tr==='quiet'){const q=quietMin(r.e);tags.push(['',T('phone silent')+(q!=null?' '+hm(q/60):'')]);}
  let col=r.tr==='quiet'?'#e0a33a':r.tr==='none'?'#d9483b':'#2fb36b';let inC='';
  if(r.k==='in'&&r.past)col='#d9483b';
  if(r.k==='out'||r.k==='left')col='#2fb36b';
  if(r.k==='wait'){col='var(--g2)';inC=' w';}
  if(r.k==='none'){col=r.s.waiting?'var(--g3)':'#d9483b';inC=r.s.waiting?' w':' x';}
  // Baruch 11/22 (idea 1): time and hours on one line — "7:10 · 2h 32m"
  const line=r.k==='in'?ft(r.firstIn)+' · '+hm(r.hours)
    :r.k==='left'?ft(r.leftAt)+' · '+hm(r.hours)      // faded circle = he left the job
    :r.k==='out'?ft(r.outAt)+' · '+hm(r.hours)        // the check = he punched out
    :r.k==='wait'?T('due')+' '+fm(r.start)
    :T('due')+' '+fm(r.start);
  const live=r.k==='in'&&r.tr==='ok'&&!r.past;const noCrew=!r.e.crew;
  return '<div class="p24m'+(r.k==='left'?' fade':'')+'" onclick="P24.tap(\''+J(r.e.id)+'\')">'
    +'<div class="p24r'+(live?' p24live':'')+(noCrew&&r.k!=='wait'?' dash':'')+'" style="--p24c:'+col+'" data-p24a="'+(r.pct||0)+'">'
    +'<div class="p24in'+inC+'">'+E(ini(r.e.name))+'</div>'
    +(r.k==='out'?'<div class="p24ck">✓</div>':'')+(r.bt&&!r.bt.ch&&!r.bt.old&&r.bt.v<=15&&(r.k==='in'||r.k==='wait'||r.k==='none')?'<div class="p24bt">'+r.bt.v+'%</div>':'')+(r.nw?'<span class="p24nw">'+E(T('new'))+'</span>':'')+'</div>'
    +'<div class="p24nm">'+E(r.dn||String(r.e.name||'').split(' ')[0])+(r.lead?' <b>★</b>':'')+'</div>'
    +(r.site&&mode==='crew'&&(r.k==='in'||r.k==='left'||r.k==='out')?'<div class="p24s">'+E(short(r.site))+'</div>':'')
    +'<div class="p24s">'+E(line)+'</div>'
    +tags.map(t=>'<div><span class="p24tag '+t[0]+'">'+E(t[1])+'</span></div>').join('')+'</div>';}

// Baruch 11/22: the grey panel has everything about his day — full times with AM/PM, each punch, what his phone saw, his week
const FT=ms=>{if(!ms)return '';const d=new Date(ms),t0=new Date();const tm=d.toLocaleTimeString(LOCX(),{hour:'numeric',minute:'2-digit'});
  if(d.toDateString()===t0.toDateString())return tm;const y=new Date(t0);y.setDate(y.getDate()-1);
  return (d.toDateString()===y.toDateString()?T('yesterday'):d.toLocaleDateString(LOCX(),{weekday:'short',month:'short',day:'numeric'}))+' '+tm;};
const FM=m=>{try{return fMin(m);}catch(e){return '';}};
const full=s=>(siteName(s)||T('No job')).replace(/, NY \d{5}/g,'');
function panel(r){const k=tk();const cr=(D.crews||[]).find(c=>c.id===r.e.crew);const row=(a,b,red)=>'<div class="pr"><span>'+E(a)+'</span><b'+(red?' style="color:#c0392b"':'')+'>'+b+'</b></div>';
  let x='<div class="p24pn"><div style="font-weight:600;font-size:15px">'+E(r.e.name)+(r.lead?' <span style="color:var(--amber)">★</span>':'')+'</div>'
   +'<div class="s">'+E([cr?cr.name:T('No crew'),r.lead?T('crew leader'):''].filter(Boolean).join(' · '))+'</div>';
  // where he should be
  x+='<div class="ph">'+E(T('Booked today'))+'</div>';
  x+=r.L.length?r.L.map(a=>row(full(a.site),E(FM(a.start==null?DAY_START:a.start))+' – '+E(FM(a.end==null?dayEnd(k):a.end)))).join(''):'<div class="s">'+E(T('Not booked today'))+'</div>';
  if(r.gh)x+=row(r.gh.late?T('Stay late'):r.gh.sent?T('Sent home'):T('Go home'),E(r.gh.end!=null?FM(r.gh.end):T('no end time')));
  // his punches
  x+='<div class="ph">'+E(T('Punches today'))+'</div>';
  if(r.P.length){r.P.forEach(p=>{const end=p.out||p.away;
      x+=row(full(p.site),E(FT(p.in))+' – '+(p.out?E(FT(p.out)):p.away?E(T('left'))+' '+E(FT(p.away)):E(T('now')))+' · '+E(hm(typeof punchDur==='function'?punchDur(p):((end||Date.now())-p.in)/36e5)));
      const notes=[];if(p.semi)notes.push(T('punched in outside the job area'));if(p.approvedBy)notes.push(T('approved by')+' '+nameOf(p.approvedBy));if(p.outAway)notes.push(T('punched out away from the job'));if(p.outRule==='left')notes.push(T('clock closed when he left the job'));
      (p.edits||[]).forEach(c=>notes.push(T('changed by')+' '+nameOf(c.by)+(c.why?' — '+c.why:'')));
      if(notes.length)x+='<div class="s" style="margin:-2px 0 4px">'+E(notes.join(' · '))+'</div>';});
    x+=row(T('Hours today'),E(hm(r.hours)));
    if(r.late)x+=row(T('Came late'),E(r.late+' '+T('min'))+' ('+E(T('booked'))+' '+E(FM(r.start))+')',true);}
  else x+='<div class="s">'+E(r.k==='wait'?T('Due')+' '+FM(r.start):r.s.waiting?T('His punch-in is waiting for your OK'):T('No punch today'))+'</div>';
  // his phone (tracker): only arriving at / leaving our jobs
  x+='<div class="ph">'+E(T('His phone'))+'</div>';
  if(r.e.appClock!==true)x+='<div class="s">'+E(T('No tracker on his phone'))+'</div>';
  else{const tl=trackerLast(r.e);x+=row(T('Last check-in'),tl?E(FT(tl)):E(T('never')),r.tr==='quiet'||!tl);
    {const ap=appSeen(r.e);if(ap)x+=row(T('App last saw him'),E(ap.site?short(ap.site):T('not at any job'))+' · '+E(FT(ap.at)));}
    {const md=otMode(r.e);x+=row(T('Tracker mode'),E(md==null?T('not reported yet'):T(MODE_N[String(md)]||String(md))),md!=null&&md!==2);}
    {const f=otFix(r.e);if(f)x+=row(T('Last GPS fix'),E(FT(f)),gpsStuck(r.e));}
    if(r.bt)x+=row(T('Battery'),r.bt.v+'%'+(r.bt.ch?' '+E(T('charging')):'')+' · '+E(FT(r.bt.at)),r.bt.v<=15&&!r.bt.ch);
    let ev=[];try{ev=((otRep&&otRep.events)||[]).filter(v=>v.who===r.e.id&&(v.kind==='arrive'||v.kind==='leave')&&v.site);}catch(z){}
    ev.slice(-6).forEach(v=>{x+=row((v.kind==='arrive'?T('Arrived'):T('Left'))+' '+short(v.site),E(FT(v.at)));});}
  // his week
  try{const w=weekStats(r.e.id);x+='<div class="ph">'+E(T('This week'))+'</div>'+row(T('Hours'),E(w.total.toFixed(1))+(w.ot?' · <span style="color:var(--amber)">'+E(w.ot.toFixed(1))+' '+E(T('OT'))+'</span>':''));}catch(z){}
  return x+'<button onclick="event.stopPropagation();P19.open(\''+J(r.e.id)+'\','+Date.now()+')">'+E(T('Open his time card'))+' ›</button></div>';}

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
  // Baruch 11/22: two plain words like the tabs (B) — Crews · Jobs; the time small on the right
  const sw='<div class="p19words" style="margin:0"><button class="'+(mode==='crew'?'on':'')+'" onclick="P24.mode(\'crew\')">'+E(T('Crews'))+'</button><button class="'+(mode==='job'?'on':'')+'" onclick="P24.mode(\'job\')">'+E(T('Jobs'))+'</button></div>';
  const up='<span class="p24up">'+E(T('Updated'))+' '+E(new Date().toLocaleTimeString(LOCX(),{hour:'numeric',minute:'2-digit'}))+'</span>';
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
