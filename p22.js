// Baruch 11/17: punch out can't be used to stretch the day (he picked 2 + 3).
//  (2) The phone saw him LEAVE the job and he punches out within the hour → the punch-out is the time he left,
//      not the time he tapped (after an hour the app already closes it at the time he left).
//  (3) Punch out checks where he is. At the job → normal. Not at the job (or the phone gives no location) → the
//      punch-out is the last time the app saw him at the job (if that was within the last 2 hours), and Payroll gets a
//      message + a mark on the time card ("punched out away from the job"). Jobs not in the app have no fence → (2) only.
(function(){if(window.P22)return;window.P22=1;
const HR=3600000;
const T=s=>{try{return t(s);}catch(e){return s;}};
const orig=window.poFinish;
const siteOf=p=>p&&p.site?(D.sites||[]).find(s=>s.id===p.site):null;
const payroll=()=>D.emps.filter(e=>!e.inactive&&canEditHours(e)&&e.role!=='owner').map(e=>e.id);
let busy=false;
// the normal punch-out (same as index.html poFinish), with the punch-out time decided BEFORE it is saved —
// once a punch-out is saved only Owner/Payroll may change it (server guard_punch)
function fin(END,EXTRA){const p=poPunch;if(!p)return;const m=me();if(p.away&&!p.out&&Date.now()-p.away>3600000){closeAtLeft(m.id);hide('m-pout');renderPunch();toast(T('You were already punched out at')+' '+fmtT(p.out)+' '+T('when you left the site.'));return;}if(poAns.inj&&!document.getElementById('poInjWhat').value.trim()){toast(T('Tell us what happened'));document.getElementById('poInjWhat').focus();return;}
  if(p.breakStart)endBreak(p);p.out=(END&&END>p.in&&END<Date.now())?END:Date.now();delete p.away;if(EXTRA)Object.assign(p,EXTRA);if(navigator.onLine===false){p.offline=true;p.synced=false;}p.check=Object.assign({injured:!!poAns.inj,ts:Date.now()},poAns.brk==='skip'?{}:{mealBreak:!!poAns.brk,noBreakWhy:poAns.brk?null:document.getElementById('poBrkWhy').value});
  if(poAns.inj){const told=document.getElementById('poInjTold').value;p.check.injury={what:document.getElementById('poInjWhat').value.trim(),time:document.getElementById('poInjTime').value,part:document.getElementById('poInjPart').value.trim(),told,care:document.getElementById('poInjCare').value,photos:poPhotos.slice()};
    (D.incidents=D.incidents||[]).push({id:nid('inc'),who:m.id,site:p.site,date:dkey(new Date()),...p.check.injury,ts:Date.now(),status:'open'});
    const to=[...new Set(D.emps.filter(e=>e.role==='owner'||e.all||e.role==='manager').map(e=>e.id))];pushTo(to,()=>('🚑 '+T('INJURY REPORTED')+': '+nameOf(m.id)+' @ '+siteName(p.site)+' — '+p.check.injury.what.slice(0,60)+(told?' · '+T('told')+' '+nameOf(told):' · '+T('told nobody'))),'pri',{tab:'hours'});}
  if(!poAns.brk&&document.getElementById('poBrkWhy').value==='told')pushTo(D.emps.filter(e=>canEditHours(e)&&e.role!=='owner').map(e=>e.id),()=>('⚠ '+nameOf(m.id)+' '+T('says they were told to skip the meal break')+' @ '+siteName(p.site)),'info',{tab:'hours'});
  try{save();}catch(e){if(p.check.injury)p.check.injury.photos=[];save();}hide('m-pout');renderPunch();tone('out');try{navigator.vibrate&&navigator.vibrate(80);}catch(e){}toast('✓ '+T('Punched out')+' '+fmtT(p.out)+' · '+punchDur(p).toFixed(2)+' h','green');}
function finish(p,end,why,extra){const ex=Object.assign({},why?{outRule:why}:{},extra?{outAway:extra}:{});fin(end,Object.keys(ex).length?ex:null);if(!p.out)return;
  if(why==='left')toast('✓ '+T('Punched out')+' '+fmtT(p.out)+' — '+T('the time you left the job')+' · '+punchDur(p).toFixed(2)+' h','green');
  if(extra){toast('⚠ '+T('You are not at the job — punched out at')+' '+fmtT(p.out)+(extra.seen&&p.out===extra.seen?' ('+T('the last time the app saw you there')+')':'')+'. '+T('The office was told.'));
    const m=me();const where=extra.noGps?T('no location from the phone'):(extra.ft>5280?(extra.ft/5280).toFixed(1)+' '+T('miles'):extra.ft+' ft')+' '+T('from the job');
    try{pushTo(payroll(),()=>('⚠ '+nameOf(m.id)+' '+T('punched out away from the job')+' ('+where+') · '+siteName(p.site)+' · '+T('tapped at')+' '+fmtT(extra.at)+' · '+T('clock set to')+' '+fmtT(p.out)),'warn',{tab:'hours'});}catch(e){}}}
window.poFinish=function(){const p=poPunch;if(!p||p.out||busy)return orig();const now=Date.now();
  // (2) the phone saw him leave, less than an hour ago (after an hour the original already closes it at that time)
  if(p.away&&p.away>p.in&&now-p.away<=HR)return finish(p,p.away,'left');
  if(p.away&&now-p.away>HR)return orig();
  // (3) check where he is — only for a job in the app with a fence
  const s=siteOf(p);if(!s||s.lat==null||s.lng==null)return orig();
  const btn=document.getElementById('poDone');busy=true;if(btn){btn.disabled=true;btn.dataset.l=btn.textContent;btn.textContent=T('Checking your location…');}
  const done=()=>{busy=false;if(btn){btn.disabled=false;btn.textContent=btn.dataset.l||T('Punch out');}};
  const away=(ft,acc,noGps)=>{const t2=Date.now();const seen=p.seen&&p.seen>p.in&&t2-p.seen<=2*HR?p.seen:null;
    finish(p,seen||t2,null,{at:t2,ft:ft==null?null:Math.round(ft),acc:acc==null?null:Math.round(acc),noGps:!!noGps,seen});};
  gpsOnce(pos=>{done();const c=pos.coords;lastPos=c;const d=distFt(c.latitude,c.longitude,s.lat,s.lng);const fence=(s.rad||300)+Math.min((c.accuracy||0)*3.281,150);
      if(d<=fence){p.seen=Date.now();orig();}else away(d,c.accuracy,false);},
    ()=>{done();away(null,null,true);},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});};
try{Object.assign(ES,{"the time you left the job":"la hora en que salió del trabajo","You are not at the job — punched out at":"No está en el trabajo — salida marcada a las",
  "the last time the app saw you there":"la última vez que la app lo vio allí","The office was told.":"Se avisó a la oficina.","no location from the phone":"el teléfono no dio la ubicación",
  "miles":"millas","from the job":"del trabajo","punched out away from the job":"marcó salida fuera del trabajo","tapped at":"tocó a las","clock set to":"reloj puesto a las",
  "Checking your location…":"Revisando su ubicación…","Punched out":"Salida marcada","Punch out":"Marcar salida"});}catch(e){}
})();
