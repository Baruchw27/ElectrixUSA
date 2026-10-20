"""Audit batch A1 — hours / time clock (staging/index.html + staging/sync.js)."""
import sys,os
R=sys.argv[1]  # staging folder
p=os.path.join(R,'index.html'); s=open(p).read()
def rep(a,b,count=1):
    global s
    assert s.count(a)==count,(a[:110],s.count(a)); s=s.replace(a,b)

# ── shared rules ──
rep("// ───────────── WEEK HOURS + OVERTIME (over 40 h, Monday–Sunday week) ─────────────",
r"""// ───────────── WEEK HOURS + OVERTIME (over 40 h, Sunday–Saturday week) ─────────────
// One rule for every screen: a punch counts toward pay only when it is not rejected and not waiting for approval.
function payCounts(p){return !!p&&!p.rejected&&!p.pending;}
// an open punch older than 14 h is a forgotten punch-out: shown as "missing", never counted live
const STALE_OPEN_MS=14*3600000;
function staleOpen(p){return !p.out&&!p.away&&Date.now()-p.in>STALE_OPEN_MS;}
// calendar-safe day/week steps (a day is 23 or 25 hours when the clocks change)
function addDaysMs(ms,n){const d=new Date(ms);d.setDate(d.getDate()+n);return d.getTime();}
function dayIndex(ms,ws){const d=new Date(ms);d.setHours(0,0,0,0);return Math.round((d.getTime()-ws)/86400000);}
// an automatic punch-out (left the site) becomes final after 60 minutes even if the phone was asleep or the app closed
function finalizeAway(who){let ch=false;(D.punches||[]).forEach(p=>{if((!who||p.who===who)&&p.away&&!p.out&&Date.now()-p.away>3600000){p.out=p.away;delete p.away;p.autoOut=true;ch=true;}});if(ch){try{save();}catch(e){}}return ch;}""")
rep("function punchDur(p){const end=p.out||p.away||Date.now();let d=(end-p.in)/3600000;(p.trips||[]).forEach(tr=>{if(tr.back)d-=(tr.back-tr.left)/3600000;});(p.breaks||[]).forEach(b=>{d-=(b.e-b.s)/3600000;});if(p.breakStart)d-=(Date.now()-p.breakStart)/3600000;return Math.max(0,d);}",
    "function punchDur(p){const end=p.out||p.away||Date.now();let d=(end-p.in)/3600000;const clip=(a,b)=>Math.max(0,Math.min(b,end)-Math.max(a,p.in))/3600000;(p.trips||[]).forEach(tr=>{if(tr.back)d-=clip(tr.left,tr.back);});(p.breaks||[]).forEach(b=>{d-=clip(b.s,b.e);});if(p.breakStart&&!p.out&&!p.away)d-=clip(p.breakStart,Date.now());return Math.max(0,d);}")
rep("function weekStats(who,ref){const ws=weekStart(ref).getTime(),we=ws+7*86400000;const days=[0,0,0,0,0,0,0];D.punches.filter(p=>p.who===who&&p.in>=ws&&p.in<we&&!p.pending&&!p.rejected).forEach(p=>{days[Math.floor((p.in-ws)/86400000)]+=punchDur(p);});",
    "function weekStats(who,ref){const ws=weekStart(ref).getTime(),we=addDaysMs(ws,7);const days=[0,0,0,0,0,0,0];D.punches.filter(p=>p.who===who&&p.in>=ws&&p.in<we&&payCounts(p)&&!staleOpen(p)).forEach(p=>{const i=dayIndex(p.in,ws);if(i>=0&&i<7)days[i]+=punchDur(p);});")
# Hours screen: calendar-safe ranges, waiting/rejected punches shown but not counted
rep("  const base=new Date(dEl.value+'T12:00');base.setHours(0,0,0,0);let from=base.getTime(),to=from+86400000;\n  if(hrRange==='week'){from=base.getTime()-base.getDay()*86400000;to=from+7*86400000;}",
    "  const base=new Date(dEl.value+'T12:00');base.setHours(0,0,0,0);let from=base.getTime(),to=addDaysMs(from,1);\n  if(hrRange==='week'){from=weekStart(base).getTime();to=addDaysMs(from,7);}")
rep("    const items=rs.map(({p,i})=>{const end=p.out||(p.away?p.away:null);const dur=end?punchDur(p):null;if(dur)tot+=dur;",
    "    const items=rs.map(({p,i})=>{const end=p.out||(p.away?p.away:null);const dur=end?punchDur(p):null;const counts=payCounts(p);if(dur&&counts)tot+=dur;")
rep("+(dur!==null?' <span style=\"color:var(--g4)\">('+dur.toFixed(2)+'h)</span>':'')+'</span></div>'+trips+ed+'</div>';}).join('');",
    "+(dur!==null?' <span style=\"color:var(--g4)\">('+dur.toFixed(2)+'h)</span>':'')+'</span></div>'+(!counts?'<div style=\"font-size:11px;color:var(--amber);padding-left:8px\">'+(p.rejected?t('Rejected — not counted'):t('Waiting for approval — not counted yet'))+'</div>':'')+trips+ed+'</div>';}).join('');")
rep("const tt=by[w].reduce((q,{p})=>q+((p.out||p.away)?punchDur(p):0),0);",
    "const tt=by[w].reduce((q,{p})=>q+((p.out||p.away)&&payCounts(p)?punchDur(p):0),0);")
rep("  if(kind==='tw'){const f=weekStart(now).getTime();return [f,f+7*86400000,t('This week')];}",
    "  if(kind==='tw'){const f=weekStart(now).getTime();return [f,addDaysMs(f,7),t('This week')];}")
rep("  if(kind==='lw'){const f=weekStart(now).getTime()-7*86400000;return [f,f+7*86400000,t('Last week')];}",
    "  if(kind==='lw'){const f=addDaysMs(weekStart(now).getTime(),-7);return [f,addDaysMs(f,7),t('Last week')];}")
rep("function hrPunches(from,to,filterFn){return D.punches.filter(p=>!p.rejected&&(p.out||p.away)&&p.in>=from&&p.in<to&&(!filterFn||filterFn(p)));}",
    "function hrPunches(from,to,filterFn){return D.punches.filter(p=>payCounts(p)&&(p.out||p.away)&&p.in>=from&&p.in<to&&(!filterFn||filterFn(p)));}")
# the phone keeps 120 days of punches: say so instead of "All time"
rep("kind==='all')return [0,now+86400000,t('All time')];", "kind==='all')return [0,now+86400000,t('Last 120 days')];")
rep("['all',t('All time')]", "['all',t('Last 120 days')]")

# ── auto punch-out is final after 60 min even if the app was closed ──
rep("function doPunch(){\n  const m=me();const open=D.punches.find(p=>p.who===m.id&&!p.out);",
    "function doPunch(){\n  const m=me();finalizeAway(m.id);const open=D.punches.find(p=>p.who===m.id&&!p.out);")
rep("function onReturn(){const m=me();const p=D.punches.find(x=>x.who===m.id&&x.away&&!x.out);if(!p)return;",
    "function onReturn(){const m=me();finalizeAway(m.id);const p=D.punches.find(x=>x.who===m.id&&x.away&&!x.out);if(!p)return;")
rep("function poFinish(){const p=poPunch;if(!p)return;const m=me();",
    "function poFinish(){const p=poPunch;if(!p)return;const m=me();if(p.away&&!p.out&&Date.now()-p.away>3600000){finalizeAway(m.id);hide('m-pout');renderPunch();toast(t('You were already punched out at')+' '+fmtT(p.out)+' '+t('when you left the site.'));return;}")

# ── punch edits: by id (the list can shift while the form is open); close stuck breaks/trips ──
rep("function openPunchEdit(i){peIdx=i;const m=me();const p=i===null?null:D.punches[i];",
    "function openPunchEdit(i){const p0=i===null?null:D.punches[i];if(p0&&!p0.id)p0.id=nid('p');peIdx=p0?p0.id:null;const m=me();const p=p0;")
rep("  else{if(!why){toast(t('Write a reason for the change'));return;}const p=D.punches[peIdx];",
    "  else{if(!why){toast(t('Write a reason for the change'));return;}const p=D.punches.find(x=>x.id===peIdx);if(!p){toast(t('That punch was changed or removed meanwhile — open it again.'));hide('m-pe');renderHours();return;}")
rep("p.who=who;p.site=site;p.in=inT;p.out=outT;delete p.away;",
    "p.who=who;p.site=site;p.in=inT;p.out=outT;delete p.away;delete p.breakStart;const inR=(a,b)=>a>=inT&&(outT==null||b<=outT);if(p.breaks)p.breaks=p.breaks.filter(b=>inR(b.s,b.e));if(p.trips)p.trips=p.trips.filter(tr=>tr.back&&inR(tr.left,tr.back));")
rep("function delPunch(){askConfirm(t('Delete this punch?'),()=>{D.punches.splice(peIdx,1);save();",
    "function delPunch(){askConfirm(t('Delete this punch?'),()=>{const i=D.punches.findIndex(x=>x.id===peIdx);if(i<0){hide('m-pe');renderHours();return;}D.punches.splice(i,1);save();")

# ── the phone's 120-day trim never drops something not yet confirmed by the server ──
rep("D[k].forEach(x=>(x&&rules[k](x)?drop:keep).push(x));",
    "D[k].forEach(x=>(x&&rules[k](x)&&(!window.EX_canForget||EX_canForget(k,x))?drop:keep).push(x));")

# ── the weekly company summary: once, from the owner's phone only (others can't see everyone's hours) ──
rep("function weeklySummaryCheck(){const now=new Date();", "function weeklySummaryCheck(){const mm=me();if(!mm||mm.role!=='owner')return;const now=new Date();")
open(p,'w').write(s); print('index patched')

q=os.path.join(R,'sync.js'); t=open(q).read()
a="window.EX_ready=()=>ready;"
assert t.count(a)==1
t=t.replace(a,a+"\n// safe to forget a record from the phone only when the server already has exactly this version and nothing is waiting\nwindow.EX_canForget=function(coll,rec){if(!rec||!rec.id)return false;if(queue[coll+'\\u0001'+rec.id])return false;const s=snap[coll]&&snap[coll][rec.id];return !!s&&s===canon(upStrip(coll,rec));};")
open(q,'w').write(t); print('sync patched')
