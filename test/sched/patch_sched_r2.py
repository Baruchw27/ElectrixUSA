"""Review round 2 for sched-v21.js."""
import sys
p=sys.argv[1]; s=open(p).read()
def rep(a,b,count=1):
    global s
    assert s.count(a)==count,(a[:100],s.count(a)); s=s.replace(a,b)

# realAsgs: a booking with a site counts even when its time could not be read (old bookings)
rep("function realAsgs(list){return (list||[]).filter(a=>a&&a.site&&a.start!=null).map(",
    "function realAsgs(list){return (list||[]).filter(a=>a&&a.site).map(")

# drafts: one per crew+day, per person
a0=s.index("const DRAFT='ex_sched_draft';"); a1=s.index("window.EX_schedDraft=draftGet;")+len("window.EX_schedDraft=draftGet;")
s=s[:a0]+r"""const DRAFT='ex_sched_drafts';
function draftsAll(){try{const d=JSON.parse(localStorage.getItem(DRAFT)||'{}');return d&&typeof d==='object'&&!Array.isArray(d)?d:{};}catch(e){return {};}}
function draftsWrite(all){try{localStorage.setItem(DRAFT,JSON.stringify(all));}catch(e){}}
function draftPut(d){const all=draftsAll();all[crewDayKey(d.crew,d.day)]=Object.assign({at:Date.now(),me:(me()||{}).id},d);draftsWrite(all);}
function draftList(){const id=(me()||{}).id;return Object.keys(draftsAll()).map(k=>Object.assign({key:k},draftsAll()[k])).filter(d=>d.me===id);}
function draftGet(){return draftList()[0]||null;}
function draftClear(key){const all=draftsAll();if(key)delete all[key];draftsWrite(all);}
window.EX_schedDraft=draftGet;"""+s[a1:]

# commit: de-duplicate by operation; tell the person when a repeat tap is ignored; only trust a confirmed answer
rep("async function commit(keys,apply,o){const sg=JSON.stringify(keys.slice().sort());\n  if(saving&&sg===runningSig)return 'busy';",
    "async function commit(keys,apply,o){const sg=(o&&o.op)||JSON.stringify(keys.slice().sort());\n  if(saving&&sg===runningSig){toast(T('Already saving — one moment…'));return 'busy';}")
rep("    lastResult=res;\n",
    "    lastResult=res;\n    if(!res||res.v!==21){toast('⏳ '+T('Sent — reopen the app to confirm it was saved'),'blue');return 'pending';} // older sync code on this phone: never claim \"Saved\"\n")
rep("    if(res.ok){draftClear();if(!o.quiet)", "    if(res.ok){keys.forEach(k=>draftClear(k));if(!o.quiet)")
rep("      if(res.stored===false){draftClear();warnStorage();return 'queued';}\n      draftClear();toast(",
    "      if(res.stored===false){warnStorage();return 'queued';}  // keep the draft: the waiting list is only in memory\n      keys.forEach(k=>draftClear(k));toast(")
rep("      draftClear();toast('⏳ '+T('Still sending",
    "      keys.forEach(k=>draftClear(k));toast('⏳ '+T('Still sending")

# Move to date: first save the new date; only when that is not refused, take it off the old date
a0=s.index("    const doMove=()=>{const patch=clone(slotPatch),hasRule=!!ruleOn(crew,day);"); a1=s.index("    if(slotHasAny(to))askConfirm(",a0)
s=s[:a0]+r"""    const doMove=async()=>{const patch=clone(slotPatch),hasRule=!!ruleOn(crew,day);
      // two steps on purpose: if the new date is refused (someone else changed it), the old date is left untouched
      const r1=await commit([to],()=>{writeSlotRow(to,asg,rowRev(to));},{quiet:true,onReject:why=>inEditorError(why+' '+T('The booking was NOT moved.'))});
      if(r1==='rejected'||r1==='busy'||r1==='error')return;
      const r2=await commit([from],()=>{const patchActive=patch.cancel.length||Object.keys(patch.replace).length;
        if(hasRule||patchActive)D.sched[from]={assignments:[],cancel:patch.cancel,replace:patch.replace,patch:true,rev:rowRev(from)+1,by:me().id,at:Date.now()};else delete D.sched[from];},
        {okMsg:T('Moved to')+' '+fmtDay(dd),onReject:why=>inEditorError(why+' '+T('The booking is now on BOTH dates — remove it from this day.'))});
      if(r2!=='rejected'&&r2!=='busy')hide('m-slot');};
"""+s[a1:]

# ongoing job: disable the button, one save per crew, keep the error visible
rep("    commit(keys,()=>{if(cur){D.sched['ONG:'+crew+':'+cur.ruleId]=",
    "    commit(keys,()=>{if(cur){D.sched['ONG:'+crew+':'+cur.ruleId]=")
rep("      {okMsg:T('Ongoing set — repeats every working day'),onReject:why=>inEditorError(why)}).then(()=>{slotAddMode=null;try{renderSlotEditor();}catch(e){}});};",
    "      {op:'ong:'+crew,btn:byLabel('#slotBody','Set ongoing'),okMsg:T('Ongoing set — repeats every working day'),onReject:why=>inEditorError(why)}).then(r=>{if(r==='rejected'||r==='busy')return;slotAddMode=null;try{renderSlotEditor();}catch(e){}});};\nfunction byLabel(scope,txt){return [...document.querySelectorAll(scope+' button')].find(b=>b.textContent.trim().indexOf(T(txt))>=0)||null;}")

# copy planning: what counts as booked; keep an ongoing job ongoing
a0=s.index("function planCopy("); a1=s.index("function writePlanItem(p){"); a2=s.index("\n",s.index("else writeSlotRow(p.key,asg,rowRev(p.key));}",a1))+1
s=s[:a0]+r"""function dayFlags(key){const r=D.sched[key];return !!(r&&((r.cancel&&r.cancel.length)||(r.replace&&Object.keys(r.replace).length)));}
// plan what copying `src` onto each target day would do, crew by crew (and individual moves)
// • a target counts as booked if it has ANY job (even one with an unreadable time) or the ongoing job is changed/off there
// • when source and target are covered by the same ongoing job, only the one-off jobs are copied (the ongoing job stays ongoing)
function planCopy(src,targets,crewIds,withLoans,srcOver){const out=[];srcOver=srcOver||{};
  targets.forEach(dt=>{if(dt===src)return;
    crewIds.forEach(c=>{const key=crewDayKey(c,dt);const all=srcOver[c]||effectiveAsgs(c,src);
      const sr=ruleOn(c,src),tr=ruleOn(c,dt);const sameRule=!srcOver[c]&&sr&&tr&&sr.ruleId===tr.ruleId&&!dayFlags(crewDayKey(c,src));
      if(sameRule){const one=realAsgs(all.filter(a=>!a.ongoing&&!a.exception));if(!one.length)return;
        const curOne=realAsgs(effectiveAsgs(c,dt).filter(a=>!a.ongoing&&!a.exception));const flags=dayFlags(key);
        out.push({key,date:dt,crew:c,asg:one,mode:'patch',status:!curOne.length&&!flags?'new':(!flags&&sig(curOne)===sig(one))?'same':'conflict',label:nameOf(c)});return;}
      const s=realAsgs(all);if(!s.length)return;const cur=realAsgs(effectiveAsgs(c,dt));const flags=dayFlags(key);
      out.push({key,date:dt,crew:c,asg:s,mode:'full',status:!cur.length&&!flags?'new':(!flags&&sig(cur)===sig(s))?'same':'conflict',label:nameOf(c)});});
    if(withLoans){const seen={};loansForDay(src).forEach(x=>{if(seen[x.emp])return;seen[x.emp]=1;const s=realAsgs(loansFor(x.emp,src));const cur=realAsgs(loansFor(x.emp,dt));
      out.push({key:loanKey(x.emp,dt),date:dt,emp:x.emp,asg:s,status:!cur.length?'new':sig(cur)===sig(s)?'same':'conflict',label:nameOf(x.emp)});});}});
  return out;}
function writePlanItem(p){const asg=p.asg.map(a=>({id:newAsgId(),site:a.site,start:a.start,end:a.end,note:a.note||''}));
  if(p.emp)D.sched[p.key]={emp:p.emp,assignments:asg,rev:rowRev(p.key)+1,by:me().id,at:Date.now()};
  else if(p.mode==='patch')D.sched[p.key]={assignments:asg,cancel:[],replace:{},patch:true,rev:rowRev(p.key)+1,by:me().id,at:Date.now()};
  else writeSlotRow(p.key,asg,rowRev(p.key));}
"""+s[a2:]

# copy: an honest message when some days were refused
rep("{okMsg:T('Copied')+' '+fmtDay(src)+' → '+days.map(fmtDay).join(', '),onReject:why=>alertBox(T('Not saved'),why+' '+T('Nothing was changed on the other days. Try again.'))})",
    "{okMsg:T('Copied')+' '+fmtDay(src)+' → '+days.map(fmtDay).join(', '),onReject:(why,res)=>{const bad=(res.rejected||[]).map(x=>rowLabel(x.id));alertBox(T('Some days were not saved'),why+'\\n\\n'+T('Not saved')+': '+bad.join('; ')+'.\\n'+T('Every other day was saved. The refused ones are listed on the Schedule screen with “Use my version”.'));}})")

# banners: act on the row id (never a position in a list), one card per unsaved draft
rep("rej.forEach((x,i)=>{const lbl=rowLabel(x.id);", "rej.forEach(x=>{const lbl=rowLabel(x.id);const q=esc(JSON.stringify(x.id));")
rep("onclick=\"EX_reapply('+i+')\"", "onclick=\"EX_reapply('+q+')\"")
rep("onclick=\"EX_dismissRej('+i+')\"", "onclick=\"EX_dismissRej('+q+')\"")
rep("  const rej=(window.EX_rejects?EX_rejects():[]).filter(x=>x.coll==='sched'&&(x.by===((window.EX_SYNC||{}).user||x.by)));",
    "  const rej=(window.EX_rejects?EX_rejects():[]).filter(x=>x.coll==='sched');")
a0=s.index("  // a draft exists only while a save has not finished."); a1=s.index("  b.innerHTML=html;}",a0)
s=s[:a0]+r"""  // a draft exists only while a save has not finished. It is confirmed (and forgotten) once this phone has the
  // server's copy and that copy matches; until then it is offered back so nothing typed is lost.
  const ready=!!(window.EX_ready&&EX_ready());
  draftList().forEach(dr=>{if(Date.now()-dr.at>=3*864e5||dr.kind!=='day'){draftClear(dr.key);return;}
    if(saving)return;const q=window.EX_queued&&EX_queued('sched',dr.key);
    if(!draftDiffers(dr)&&ready&&!q){draftClear(dr.key);return;}
    const k=esc(JSON.stringify(dr.key));
    html+='<div class="card" style="padding:10px 12px;margin-bottom:8px;border-left:4px solid var(--blue)"><div style="font-weight:700;font-size:13.5px">'+esc(T('Unsaved schedule change'))+': '+esc(nameOf(dr.crew)+' — '+fmtDay(dr.day))+'</div><div class="sc-acts" style="margin:8px 0 0"><button type="button" onclick="EX_restoreDraft('+k+')">'+esc(T('Open it'))+'</button><button type="button" onclick="EX_dropDraft('+k+')">'+esc(T('Discard'))+'</button></div></div>';});
"""+s[a1:]
rep("window.EX_restoreDraft=function(){const dr=draftGet();if(!dr)return;", "window.EX_restoreDraft=function(key){const dr=draftList().find(d=>d.key===key)||draftGet();if(!dr)return;")
rep("window.EX_dropDraft=function(){draftClear();banners();};", "window.EX_dropDraft=function(key){draftClear(key);banners();};")
rep("window.EX_reapply=async function(i){const x=EX_rejects().filter(y=>y.coll==='sched')[i];if(!x)return;",
    "window.EX_reapply=async function(id){const x=EX_rejects().find(y=>y.coll==='sched'&&y.id===id);if(!x)return;")
rep("window.EX_dismissRej=function(i){const x=EX_rejects().filter(y=>y.coll==='sched')[i];if(x)EX_dropReject('sched',x.id);banners();};",
    "window.EX_dismissRej=function(id){EX_dropReject('sched',id);banners();};")
# the old single-draft banner code is gone; make sure nothing references draftGet()'s old meaning in banners
open(p,'w').write(s); print('patched',p)
