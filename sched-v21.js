/* Electrix USA — Schedule v2.1: saves you can trust + copy a day.
   Loaded after the main app script. It replaces the schedule's save functions (same names, so every existing
   button keeps working) and touches ONLY the schedule (sched) records — never punches, hours or payroll.

   What it guarantees
   • "Saved" is shown only after the server has confirmed it stored the exact days you changed.
   • If a save is refused (no permission, or someone else changed that day first) the editor stays open with
     everything you entered and says why. Nothing you typed is thrown away.
   • If the phone is offline or the server is slow, the change is kept on the phone and sent automatically; the
     screen says so plainly ("waiting to send") instead of "Saved".
   • What you entered is also kept in a draft on the phone until the server confirms it, so even if the app is
     closed or reloads in the middle of a save, the Schedule screen offers to restore it.
   • Copy a day to one or many days, and "Same as yesterday" — always warns before replacing a booked day.
*/
(function(){
if(typeof D==='undefined'||typeof effectiveAsgs!=='function')return; // main app not loaded (should not happen)

// ───────── small helpers ─────────
const T=s=>(typeof t==='function'?t(s):s);
const SKEY=k=>['sched',k];
const fmtDay=k=>new Date(k+'T12:00').toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'});
const addDays=(k,n)=>{const d=new Date(k+'T12:00');d.setDate(d.getDate()+n);return dkey(d);};
const todayK=()=>dkey(new Date());
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
function crewDayKey(c,k){return c+'|'+k;}
function realAsgs(list){return (list||[]).filter(a=>a&&a.site&&a.start!=null).map(a=>({site:a.site,start:a.start,end:a.end==null?null:a.end,note:a.note||''}));}
function sig(list){return JSON.stringify(realAsgs(list).map(a=>[a.site,a.start,a.end]).sort());}

// the confirm dialog can show several buttons (e.g. Replace / Only empty days / Cancel)
const _ask=ask;
ask=function(){const ok=document.getElementById('askOk');if(ok&&ok.parentNode)ok.parentNode.style.display='';
  const r=_ask.apply(this,arguments);
  // the dialog has its own Cancel; the extra "‹ Back" link overlapped its title on phones
  document.querySelectorAll('#m-ask .mback').forEach(x=>x.remove());return r;};
function choose(title,html,choices){ask(title,html+'<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">'+choices.map((c,i)=>'<button class="btn'+(c.cls?' '+c.cls:'')+'" data-ch="'+i+'">'+esc(c.label)+'</button>').join('')+'</div>',null);
  const ok=document.getElementById('askOk');if(ok&&ok.parentNode)ok.parentNode.style.display='none'; // the choices replace OK / Cancel
  document.querySelectorAll('#askBody [data-ch]').forEach(b=>{b.onclick=()=>{hide('m-ask');const c=choices[+b.dataset.ch];c&&c.fn&&c.fn();};});}

// ───────── draft safety net (survives a reload / the app being closed mid-save) ─────────
const DRAFT='ex_sched_draft';
function draftPut(d){try{localStorage.setItem(DRAFT,JSON.stringify(Object.assign({at:Date.now(),me:(me()||{}).id},d)));}catch(e){}}
function draftGet(){try{const d=JSON.parse(localStorage.getItem(DRAFT)||'null');return d&&d.me===(me()||{}).id?d:null;}catch(e){return null;}}
function draftClear(){try{localStorage.removeItem(DRAFT);}catch(e){}}
window.EX_schedDraft=draftGet;

// ───────── the one save path every schedule change goes through ─────────
let saving=false;
// keys: schedule record ids this change writes/deletes. apply(): makes the change in D.sched.
// Resolves 'ok' | 'queued' | 'pending' | 'rejected' | 'error'.
async function commit(keys,apply,o){o=o||{};if(saving)return 'busy';saving=true;setBusy(o.btn,true);
  try{
    apply();save();
    const res=window.EX_saveNow?await window.EX_saveNow({keys:keys.map(SKEY),waitMs:15000}):{ok:true,rejected:[]};
    lastResult=res;
    // anything for these days that was refused earlier is settled by this newer save
    if(res.ok||res.queued||res.transient||(res.pending&&res.pending.length&&!(res.rejected||[]).length))keys.forEach(k=>{try{window.EX_dropReject&&EX_dropReject('sched',k);}catch(e){}});
    if(res.ok){draftClear();if(!o.quiet)toast('✓ '+(o.okMsg||T('Saved')),'green');return 'ok';}
    if(res.rejected&&res.rejected.length){
      const stale=res.rejected.some(x=>x.stale);
      if(stale&&window.EX_catchUp){try{await window.EX_catchUp();}catch(e){}} // show the version that won
      const why=stale?T('Someone else changed this day after you opened it.'):T('The server did not accept this change (you may not have permission to edit the schedule).');
      o.onReject?o.onReject(why,res):alertBox(T('Not saved'),why+' '+T('Nothing you entered was lost — you can try again.'));
      return 'rejected';}
    if(res.queued){
      if(res.stored===false){draftClear();warnStorage();return 'queued';}
      draftClear();toast('⏳ '+T('Saved on this phone — it will be sent automatically when you are back online'),'blue');return 'queued';}
    if(res.error&&!res.transient){
      alertBox(T('Not saved yet'),T('The server answered with an error')+' ('+res.error+'). '+T('Your change is kept on this phone and will be retried automatically.'));return 'error';}
    if(res.transient||(res.pending&&res.pending.length)){
      draftClear();toast('⏳ '+T('Still sending — kept on this phone and it will finish automatically. Keep the app open for a moment.'),'blue');return 'pending';}
    alertBox(T('Not saved yet'),T('The server answered with an error')+(res.error?' ('+res.error+')':'')+'. '+T('Your change is kept on this phone and will be retried automatically.'));
    return 'error';
  }finally{saving=false;setBusy(o.btn,false);try{renderSched();}catch(e){}}}
let lastResult=null;window.EX_schedLastResult=()=>lastResult;
function setBusy(btn,on){const b=typeof btn==='string'?document.querySelector(btn):btn;if(!b)return;b.disabled=on;if(on){b.dataset.lbl=b.textContent;b.textContent=T('Saving…');b.style.opacity='.7';}else{if(b.dataset.lbl)b.textContent=b.dataset.lbl;b.style.opacity='';}}
function alertBox(title,msg){ask(title,'<div style="font-size:14px;line-height:1.45">'+esc(msg)+'</div>',null,'OK');}
function warnStorage(){alertBox(T('Phone storage is full'),T('Your change is saved in the app but the phone has no room to keep it if the app is closed. Keep the app open until you are back online and the “Saving…” badge disappears.'));}
function inEditorError(msg){const el=document.getElementById('slotConf');if(!el)return alertBox(T('Not saved'),msg);
  el.innerHTML='<div id="slotErr" style="background:#fdecea;color:#8a1c12;border-radius:8px;padding:9px;margin-top:8px;font-size:13.5px;line-height:1.4"><b>⚠ '+esc(T('Not saved'))+'</b><br>'+esc(msg)+'<br>'+esc(T('Everything you entered is still here. Tap Save to try again, or Cancel to keep the saved version.'))+'</div>';
  try{el.scrollIntoView({block:'nearest'});}catch(e){}}

// ───────── day editor ─────────
function dayRow(oneoffs,key,base,hasRule,patch){
  const patchActive=patch.cancel.length||Object.keys(patch.replace).length;
  if(!oneoffs.length&&!patchActive)return null; // nothing left → the day is cleared
  if(hasRule||patchActive)return {assignments:oneoffs,cancel:patch.cancel,replace:patch.replace,patch:true,rev:base+1,by:me().id,at:Date.now()};
  return {site:oneoffs[0].site,time:fMin(oneoffs[0].start),assignments:oneoffs,note:oneoffs.map(a=>a.note).filter(Boolean).join('\n'),rev:base+1,by:me().id,at:Date.now()};}
function editorOneoffs(){return slotOneoffs.filter(a=>a.site&&a.start!=null).map(a=>({id:a.id||newAsgId(),site:a.site,start:a.start,end:(a.end!=null&&a.end>a.start)?a.end:null,note:a.note||''}));}
function editorDirty(){const key=crewDayKey(schedCrew,slotDay);const r=D.sched[key];const want=dayRow(editorOneoffs(),key,rowRev(key),!!ruleOn(schedCrew,slotDay),slotPatch);
  if(!r&&!want)return false;if(!r||!want)return true;return sig(r.assignments||[])!==sig(want.assignments)||JSON.stringify(r.cancel||[])!==JSON.stringify(want.cancel||[])||JSON.stringify(r.replace||{})!==JSON.stringify(want.replace||{});}
function saveBtn(){return document.querySelector('#slotBody button.btn[onclick="saveSlot()"]');}

commitDay=function(oneoffs){const crew=schedCrew,day=slotDay,key=crewDayKey(crew,day);
  const patch=clone(slotPatch),hasRule=!!ruleOn(crew,day);
  draftPut({kind:'day',crew,day,oneoffs:clone(slotOneoffs),patch,baseRev:slotBaseRev});
  return commit([key],()=>{const row=dayRow(oneoffs,key,rowRev(key),hasRule,patch);if(row)D.sched[key]=row;else delete D.sched[key];},
    {btn:saveBtn(),okMsg:T('Saved'),onReject:why=>inEditorError(why)}).then(r=>{if(r!=='rejected'&&r!=='busy')hide('m-slot');return r;});};

clearSlot=function(){const crew=schedCrew,day=slotDay,key=crewDayKey(crew,day);
  const rule=ruleOn(crew,day);
  askConfirm(T('Clear all one-off jobs for')+' '+nameOf(crew)+' — '+fmtDay(day)+'?'+(rule?' '+T('(The ongoing job still repeats.)'):''),()=>{
    commit([key],()=>{delete D.sched[key];},{okMsg:T('Day cleared'),onReject:why=>inEditorError(why)}).then(r=>{if(r!=='rejected'&&r!=='busy')hide('m-slot');});},T('Clear day'));};

// "Move to date" — same as before, but confirmed and kept if it fails
slotMovePrompt=function(){const asg=slotOneoffs.filter(a=>a.site&&a.start!=null).map(a=>({id:newAsgId(),site:a.site,start:a.start,end:a.end,note:a.note||''}));
  if(!asg.length){toast(T('No one-off job on this day to move. To change an ongoing job, use “Change / move” above; to change the address, pick a different job site above.'));return;}
  const crew=schedCrew,day=slotDay;
  askPrompt(T('Move this booking to another date'),[{label:T('New date'),value:day,type:'date'}],([dd])=>{if(!dd||dd===day)return;const to=crewDayKey(crew,dd),from=crewDayKey(crew,day);
    const doMove=()=>{const patch=clone(slotPatch),hasRule=!!ruleOn(crew,day);
      commit([to,from],()=>{writeSlotRow(to,asg,rowRev(to));const patchActive=patch.cancel.length||Object.keys(patch.replace).length;
        if(hasRule||patchActive)D.sched[from]={assignments:[],cancel:patch.cancel,replace:patch.replace,patch:true,rev:rowRev(from)+1,by:me().id,at:Date.now()};else delete D.sched[from];},
        {okMsg:T('Moved to')+' '+fmtDay(dd),onReject:why=>inEditorError(why)}).then(r=>{if(r!=='rejected'&&r!=='busy')hide('m-slot');});};
    if(slotHasAny(to))askConfirm(T('That date already has a booking for this crew. Replace it with this one?'),doMove,T('Replace'));else doMove();});};

// ongoing ("until reassigned") jobs — previously saved with no confirmation
slotAddOngoing=function(){const wd=crewWorkday(schedCrew);const site=document.getElementById('slotAddSite').value;const full=document.getElementById('slotOngFull').checked;const h=parseFloat((document.getElementById('slotAddHours')||{}).value)||4;const st=full?wd.start:slotNextStart();const en=full?wd.end:Math.min(wd.end,st+Math.round(h*60));
  const crew=schedCrew,day=slotDay;const cur=activeRule(crew);
  const write=()=>{const rid=Date.now().toString(36);const keys=['ONG:'+crew+':'+rid];if(cur)keys.push('ONG:'+crew+':'+cur.ruleId);
    commit(keys,()=>{if(cur){D.sched['ONG:'+crew+':'+cur.ruleId]=Object.assign({},D.sched['ONG:'+crew+':'+cur.ruleId],{to:addDays(day,-1),rev:(cur.rev||0)+1,by:me().id,at:Date.now()});}
      D.sched['ONG:'+crew+':'+rid]={site,start:st,end:en,workdays:wd.workdays,from:day,to:null,rev:1,by:me().id,at:Date.now()};},
      {okMsg:T('Ongoing set — repeats every working day'),onReject:why=>inEditorError(why)}).then(()=>{slotAddMode=null;try{renderSlotEditor();}catch(e){}});};
  if(cur)askConfirm(T('This crew already has an ongoing job')+' ('+siteName(cur.site)+'). '+T('Replace it from this date forward?'),write,T('Replace'));else write();};
slotEndOngoing=function(){const rule=ruleOn(schedCrew,slotDay);if(!rule)return;const crew=schedCrew,day=slotDay;const rk='ONG:'+crew+':'+rule.ruleId;
  askConfirm(T('End this ongoing job?')+' '+T('It stops repeating from today. Past days stay as they were.'),()=>{
    commit([rk],()=>{const prev=addDays(day,-1);if(prev<(rule.from||''))delete D.sched[rk];else D.sched[rk]=Object.assign({},D.sched[rk],{to:prev,rev:(rule.rev||0)+1,by:me().id,at:Date.now()});},
      {okMsg:T('Ongoing job ended'),onReject:why=>inEditorError(why)}).then(r=>{if(r!=='rejected'&&r!=='busy')hide('m-slot');});},T('End'));};
slotChangeOngoing=function(){const rule=ruleOn(schedCrew,slotDay);if(!rule)return;const crew=schedCrew,day=slotDay;
  askPrompt(T('Change the ongoing job'),[
    {label:T('Apply to'),options:[{v:'one',l:T('Just this day')},{v:'range',l:T('A date range')},{v:'perm',l:T('Permanently (reassign)')}]},
    {label:T('Send to'),options:[{v:'__off',l:T('Off — no crew here')}].concat(D.sites.map(s=>({v:s.id,l:s.name})))},
    {label:T('If a range: last date'),value:day,type:'date'}],
    ([scope,site,endDate])=>{const rep=site==='__off'?'__off':{site,start:rule.start,end:rule.end};const keys=[];const days=[];
      if(scope==='one')days.push(day);
      else if(scope==='range'){let k=day;const e=endDate||day;let g=0;while(k<=e&&g++<400){days.push(k);k=addDays(k,1);}}
      days.forEach(k=>keys.push(crewDayKey(crew,k)));
      const rk='ONG:'+crew+':'+rule.ruleId,rid=Date.now().toString(36);if(scope==='perm'){keys.push(rk);if(site!=='__off')keys.push('ONG:'+crew+':'+rid);}
      commit(keys,()=>{const sc=schedCrew;schedCrew=crew;try{days.forEach(k=>applyOngExc(k,rep));}finally{schedCrew=sc;}
        if(scope==='perm'){D.sched[rk]=Object.assign({},D.sched[rk],{to:addDays(day,-1),rev:(rule.rev||0)+1,by:me().id,at:Date.now()});
          if(site!=='__off')D.sched['ONG:'+crew+':'+rid]={site,start:rule.start,end:rule.end,workdays:rule.workdays,from:day,to:null,rev:1,by:me().id,at:Date.now()};}},
        {okMsg:T('Updated — other jobs kept'),onReject:why=>inEditorError(why)}).then(r=>{if(r!=='rejected'&&r!=='busy')hide('m-slot');});});};

// individual moves (one person to another job for part of a day)
saveLoan=function(){const emp=document.getElementById('loanEmp').value;const site=document.getElementById('loanSite').value;const start=hhmm2min(document.getElementById('loanStart').value);const end=hhmm2min(document.getElementById('loanEnd').value);const note=document.getElementById('loanNote').value;
  if(start==null){toast(T('Enter a start time'));return;}const asg=[{id:newAsgId(),site,start,end:(end!=null&&end>start)?end:null,note}];const day=loanDay;const key=loanKey(emp,day);
  const btn=document.querySelector('#m-loan button.btn');
  const go=()=>{const msgs=conflictsForLoan(emp,day,asg);
    const doIt=()=>commit([key],()=>{D.sched[key]={emp,assignments:asg,rev:rowRev(key)+1,by:me().id,at:Date.now()};},{btn,okMsg:T('Person moved')}).then(r=>{if(r!=='rejected'&&r!=='busy')hide('m-loan');});
    if(msgs.length)askConfirm('⚠ '+T('Scheduling conflict')+':\n\n'+msgs.join('\n')+'\n\n'+T('Save anyway?'),doIt,T('Save anyway'));else doIt();};
  if(rowRev(key)!==loanBaseRev){askConfirm(T('This was changed since you opened it. Overwrite?'),go,T('Overwrite'));}else go();};
clearLoanFor=function(empId,k){if(!empId)return;const key=loanKey(empId,k);
  askConfirm(T('Remove this move for')+' '+nameOf(empId)+' — '+fmtDay(k)+'?',()=>commit([key],()=>{delete D.sched[key];},{okMsg:T('Move removed')}),T('Remove'));};

// ───────── copy a day ─────────
// plan what copying `src` onto each target day would do, crew by crew (and individual moves)
function planCopy(src,targets,crewIds,withLoans,srcOver){const out=[];srcOver=srcOver||{};
  targets.forEach(dt=>{if(dt===src)return;
    crewIds.forEach(c=>{const s=realAsgs(srcOver[c]||effectiveAsgs(c,src));if(!s.length)return;const cur=realAsgs(effectiveAsgs(c,dt));
      out.push({key:crewDayKey(c,dt),date:dt,crew:c,asg:s,status:!cur.length?'new':sig(cur)===sig(s)?'same':'conflict',label:nameOf(c)});});
    if(withLoans){const seen={};loansForDay(src).forEach(x=>{if(seen[x.emp])return;seen[x.emp]=1;const s=realAsgs(loansFor(x.emp,src));const cur=realAsgs(loansFor(x.emp,dt));
      out.push({key:loanKey(x.emp,dt),date:dt,emp:x.emp,asg:s,status:!cur.length?'new':sig(cur)===sig(s)?'same':'conflict',label:nameOf(x.emp)});});}});
  return out;}
function writePlanItem(p){const asg=p.asg.map(a=>({id:newAsgId(),site:a.site,start:a.start,end:a.end,note:a.note||''}));
  if(p.emp)D.sched[p.key]={emp:p.emp,assignments:asg,rev:rowRev(p.key)+1,by:me().id,at:Date.now()};
  else writeSlotRow(p.key,asg,rowRev(p.key));}
// run a copy: warn before replacing anything that is already booked, then save and confirm with the server
function runCopy(src,targets,crewIds,withLoans,extra){extra=extra||{};
  const plan=planCopy(src,targets,crewIds,withLoans,extra.srcOver);const todo=plan.filter(p=>p.status!=='same');const clash=todo.filter(p=>p.status==='conflict');
  if(!plan.length){toast(T('Nothing booked on')+' '+fmtDay(src)+' '+T('to copy'));return;}
  if(!todo.length&&!extra.keys){toast('✓ '+T('Already the same — nothing to change'),'green');return;}
  const go=items=>{const keys=items.map(p=>p.key).concat(extra.keys||[]);const days=[...new Set(items.map(p=>p.date))];
    if(!keys.length){toast(T('Nothing to change — every day was already booked'));return;}
    commit(keys,()=>{if(extra.apply)extra.apply();items.forEach(writePlanItem);},
      {okMsg:T('Copied')+' '+fmtDay(src)+' → '+days.map(fmtDay).join(', '),onReject:why=>alertBox(T('Not saved'),why+' '+T('Nothing was changed on the other days. Try again.'))}).then(r=>{if(r!=='rejected'&&r!=='busy'&&extra.after)extra.after();});};
  if(!clash.length)return go(todo);
  const list=clash.map(p=>'<li>'+esc(fmtDay(p.date))+' · '+esc(p.label)+': '+esc(realAsgs(p.emp?loansFor(p.emp,p.date):effectiveAsgs(p.crew,p.date)).map(a=>siteName(a.site)).join(', '))+'</li>').join('');
  const empty=todo.filter(p=>p.status==='new');
  choose(T('Some of these are already booked'),'<div style="font-size:13.5px;line-height:1.45">'+T('Copying would replace:')+'<ul style="margin:6px 0 0 18px;padding:0">'+list+'</ul></div>',
    [{label:T('Replace them')+' ('+clash.length+')',fn:()=>go(todo)},
     {label:T('Only fill what is empty')+' ('+empty.length+')',cls:'sec2',fn:()=>go(empty)},
     {label:T('Cancel'),cls:'sec2'}]);}
window.EX_copyDay=runCopy;

// pick target days: next 3 weeks as tappable chips; booked days are marked
let pickSel=[];
function pickDays(title,src,crewIds,onPick){pickSel=[];const start=todayK()>src?todayK():addDays(src,1);
  const days=[];for(let i=0;i<21;i++)days.push(addDays(start,i));
  const booked=k=>crewIds.some(c=>realAsgs(effectiveAsgs(c,k)).length);
  const chip=k=>{const d=new Date(k+'T12:00');const wk=d.getDay()===0||d.getDay()===6;return '<button type="button" class="chip" data-k="'+k+'" style="margin:0;padding:7px 4px;min-width:0;text-align:center;line-height:1.15;'+(wk?'opacity:.6;':'')+'" onclick="EX_pickToggle(this)"><span style="font-size:11px">'+esc(d.toLocaleDateString(LOC(),{weekday:'short'}))+'</span><br><b>'+d.getDate()+'</b>'+(booked(k)?'<span style="color:var(--amber)"> ●</span>':'')+'</button>';};
  const quick=(lbl,fn)=>'<button type="button" class="chip" style="margin:0" onclick="'+fn+'">'+esc(lbl)+'</button>';
  ask(title,'<div style="font-size:12.5px;color:var(--g4);margin-bottom:8px">'+T('From')+' <b>'+esc(fmtDay(src))+'</b>. '+T('Tap the days to copy to.')+' <span style="color:var(--amber)">●</span> = '+T('already booked')+'</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">'+quick(T('Next day'),"EX_pickQuick('next')")+quick(T('Rest of this week'),"EX_pickQuick('week')")+quick(T('Next 5 workdays'),"EX_pickQuick('five')")+quick(T('Clear'),"EX_pickQuick('none')")+'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">'+days.map(chip).join('')+'</div><div id="pickCount" style="font-size:12.5px;margin-top:8px;color:var(--g4)"></div>',
    ()=>{if(!pickSel.length){toast(T('Pick at least one day'));return;}onPick(pickSel.slice().sort());},T('Copy'));
  pickRefresh();}
function pickRefresh(){document.querySelectorAll('#askBody [data-k]').forEach(b=>{const on=pickSel.includes(b.dataset.k);b.classList.toggle('on',on);});
  const c=document.getElementById('pickCount');if(c)c.textContent=pickSel.length?pickSel.length+' '+T(pickSel.length===1?'day selected':'days selected'):'';
  const ok=document.getElementById('askOk');if(ok)ok.textContent=pickSel.length?T('Copy to')+' '+pickSel.length+' '+T(pickSel.length===1?'day':'days'):T('Copy');}
window.EX_pickToggle=function(b){const k=b.dataset.k;const i=pickSel.indexOf(k);if(i>=0)pickSel.splice(i,1);else pickSel.push(k);pickRefresh();};
window.EX_pickQuick=function(w){const all=[...document.querySelectorAll('#askBody [data-k]')].map(b=>b.dataset.k);const wd=k=>{const g=new Date(k+'T12:00').getDay();return g>=1&&g<=5;};
  if(w==='none')pickSel=[];else if(w==='next')pickSel=[all.find(wd)].filter(Boolean);
  else if(w==='five')pickSel=all.filter(wd).slice(0,5);
  else{const first=all[0];const d=new Date(first+'T12:00');const sat=addDays(first,6-d.getDay());pickSel=all.filter(k=>k<=sat&&wd(k));}
  pickRefresh();};

// day editor: "Copy day" → pick one or more days for this crew
slotCopyPrompt=function(){const crew=schedCrew,src=slotDay;
  const asgNow=realAsgs(slotEffNow());if(!asgNow.length){toast(T('Add a job to this day first, then copy it.'));return;}
  const dirty=editorDirty();
  pickDays(T('Copy')+' '+nameOf(crew)+' — '+fmtDay(src),src,[crew],targets=>{
    if(!dirty){hide('m-slot');return runCopy(src,targets,[crew],false);}
    // the day on screen has unsaved edits: save it and the copies together, so what you see is what gets copied
    const key=crewDayKey(crew,src);const oneoffs=editorOneoffs();const patch=clone(slotPatch);const hasRule=!!ruleOn(crew,src);
    hide('m-slot');
    runCopy(src,targets,[crew],false,{keys:[key],srcOver:{[crew]:asgNow},apply:()=>{const r=dayRow(oneoffs,key,rowRev(key),hasRule,patch);if(r)D.sched[key]=r;else delete D.sched[key];}});});};

// day board: the whole day (every crew + individual moves)
function prevBookedDay(k){for(let i=1;i<=7;i++){const p=addDays(k,-i);if(D.crews.some(c=>realAsgs(effectiveAsgs(c.id,p)).length)||loansForDay(p).length)return p;}return null;}
window.EX_sameAsPrev=function(k){const src=prevBookedDay(k);if(!src){toast(T('Nothing booked in the 7 days before')+' '+fmtDay(k));return;}
  runCopy(src,[k],D.crews.map(c=>c.id),true);};
window.EX_copyWholeDay=function(k){const crews=D.crews.map(c=>c.id);
  if(!crews.some(c=>realAsgs(effectiveAsgs(c,k)).length)&&!loansForDay(k).length){toast(T('Nothing booked on')+' '+fmtDay(k)+' '+T('to copy'));return;}
  pickDays(T('Copy the whole day')+' — '+fmtDay(k),k,crews,targets=>runCopy(k,targets,crews,true));};
function dayTools(){if(!schedCanEdit()||schedView!=='today')return;const el=document.getElementById('todayBoard');if(!el)return;const head=el.querySelector('.sc-head');if(!head||el.querySelector('#schDayTools'))return;
  const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+boardDay);const k=dkey(d);const src=prevBookedDay(k);
  const lbl=src===addDays(k,-1)?T('Same as yesterday'):src?T('Same as')+' '+fmtDay(src):T('Same as yesterday');
  const bar=document.createElement('div');bar.id='schDayTools';bar.className='sc-acts';bar.style.margin='-6px 2px 12px';
  bar.innerHTML='<button type="button" onclick="EX_sameAsPrev(\''+k+'\')"'+(src?'':' disabled style="opacity:.5"')+'>⧉ '+esc(lbl)+'</button><button type="button" onclick="EX_copyWholeDay(\''+k+'\')">'+esc(T('Copy this day to…'))+'</button>';
  head.insertAdjacentElement('afterend',bar);}

// ───────── banners on the Schedule screen: refused changes, changes waiting to send, unsaved draft ─────────
function banners(){const pg=document.getElementById('pg-sched');if(!pg)return;let b=document.getElementById('schBanner');
  if(!b){b=document.createElement('div');b.id='schBanner';const sw=document.getElementById('schedSwitch');pg.insertBefore(b,sw?sw.nextSibling:pg.firstChild);}
  if(!schedCanEdit()){b.innerHTML='';return;}
  let html='';
  const rej=(window.EX_rejects?EX_rejects():[]).filter(x=>x.coll==='sched'&&(x.by===((window.EX_SYNC||{}).user||x.by)));
  rej.forEach((x,i)=>{const lbl=rowLabel(x.id);html+='<div class="card" style="padding:10px 12px;margin-bottom:8px;border-left:4px solid #c0392b"><div style="font-weight:700;font-size:13.5px">⚠ '+esc(T('Not saved'))+': '+esc(lbl)+'</div><div style="font-size:12.5px;color:var(--g4);margin:2px 0 8px">'+esc(x.reason==='stale'?T('Someone else changed this day first. Your version is kept here.'):T('The server refused this change.'))+'</div><div class="sc-acts" style="margin:0"><button type="button" onclick="EX_reapply('+i+')">'+esc(T('Use my version'))+'</button><button type="button" onclick="EX_dismissRej('+i+')">'+esc(T('Keep the saved one'))+'</button></div></div>';});
  const waiting=window.EX_queuedIn?EX_queuedIn('sched').length:0;
  if(waiting)html+='<div class="card" style="padding:9px 12px;margin-bottom:8px;border-left:4px solid var(--amber);font-size:13px">⏳ '+waiting+' '+esc(T(waiting===1?'schedule change waiting to send':'schedule changes waiting to send'))+(((window.EX_SYNC||{}).online===false)?' — '+esc(T('you are offline')):'')+'</div>';
  // a draft exists only while a save has not finished. It is confirmed (and forgotten) once this phone has the
  // server's copy and that copy matches; until then it is offered back so nothing typed is lost.
  let dr=draftGet();if(dr&&(Date.now()-dr.at>=3*864e5||dr.kind!=='day')){draftClear();dr=null;}
  if(dr&&!saving){const ready=!!(window.EX_ready&&EX_ready());const q=window.EX_queued&&EX_queued('sched',crewDayKey(dr.crew,dr.day));
    if(!draftDiffers(dr)&&ready&&!q){draftClear();dr=null;}}
  if(dr&&!saving)html+='<div class="card" style="padding:10px 12px;margin-bottom:8px;border-left:4px solid var(--blue)"><div style="font-weight:700;font-size:13.5px">'+esc(T('Unsaved schedule change'))+': '+esc(nameOf(dr.crew)+' — '+fmtDay(dr.day))+'</div><div class="sc-acts" style="margin:8px 0 0"><button type="button" onclick="EX_restoreDraft()">'+esc(T('Open it'))+'</button><button type="button" onclick="EX_dropDraft()">'+esc(T('Discard'))+'</button></div></div>';
  b.innerHTML=html;}
function rowLabel(id){if(id.slice(0,2)==='L:'){const r=id.slice(2);const i=r.lastIndexOf('|');return nameOf(r.slice(0,i))+' — '+fmtDay(r.slice(i+1));}
  if(id.slice(0,4)==='ONG:'){const p=id.split(':');return nameOf(p[1])+' — '+T('ongoing job');}const i=id.lastIndexOf('|');return i>0?nameOf(id.slice(0,i))+' — '+fmtDay(id.slice(i+1)):id;}
function draftDiffers(dr){if(dr.kind!=='day')return false;const r=D.sched[crewDayKey(dr.crew,dr.day)];const want=realAsgs(dr.oneoffs);return sig(r?r.assignments||[]:[])!==sig(want);}
window.EX_restoreDraft=function(){const dr=draftGet();if(!dr)return;schedCrew=dr.crew;slotDay=dr.day;slotBaseRev=dr.baseRev||0;slotOneoffs=clone(dr.oneoffs)||[];slotPatch=clone(dr.patch)||{cancel:[],replace:{}};slotAddMode=null;
  document.getElementById('slotTitle').textContent=nameOf(dr.crew)+' — '+fmtDay(dr.day);renderSlotEditor();show('m-slot');};
window.EX_dropDraft=function(){draftClear();banners();};
window.EX_reapply=async function(i){const x=EX_rejects().filter(y=>y.coll==='sched')[i];if(!x)return;
  if(window.EX_catchUp){try{await EX_catchUp();}catch(e){}} // build on the newest saved version so it is accepted
  commit([x.id],()=>{if(x.del||!x.data)delete D.sched[x.id];else D.sched[x.id]=Object.assign({},x.data,{rev:rowRev(x.id)+1,by:me().id,at:Date.now()});},{okMsg:T('Saved')}).then(r=>{if(r==='ok'||r==='queued'||r==='pending')EX_dropReject('sched',x.id);banners();});};
window.EX_dismissRej=function(i){const x=EX_rejects().filter(y=>y.coll==='sched')[i];if(x)EX_dropReject('sched',x.id);banners();};
window.addEventListener('ex-rejected',e=>{const rows=(e.detail&&e.detail.rows)||[];if(rows.some(r=>r.coll==='sched')){try{if(document.getElementById('pg-sched'))banners();}catch(x){}}});

// keep the job site you picked when you switch between Full day / Specific hours / Until reassigned
// (the panel used to redraw with the first site in the list selected, which could book the wrong address)
let addSite=null;
const _openSlot=openSlot;openSlot=function(){addSite=null;return _openSlot.apply(this,arguments);};
const _renderSlotEditor=renderSlotEditor;
renderSlotEditor=function(){const r=_renderSlotEditor.apply(this,arguments);const sel=document.getElementById('slotAddSite');
  if(sel){if(addSite&&[...sel.options].some(o=>o.value===addSite))sel.value=addSite;else addSite=sel.value;sel.addEventListener('change',()=>{addSite=sel.value;});}return r;};

// hook into the existing screen refresh
const _renderSched=renderSched;
renderSched=function(){const r=_renderSched.apply(this,arguments);try{dayTools();}catch(e){console.warn(e);}try{banners();}catch(e){console.warn(e);}return r;};
})();
