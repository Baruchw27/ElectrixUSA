"""L1 — Baruch's paid lunch (2026-10-20): up to 40 minutes of lunch per person per workday are paid; anything past
that is unpaid. Several lunches in one day share the 40 minutes. A lunch that overlaps an off-site trip is only taken
off once. Calculation only: the punches keep their real times and fields (breakStart / breaks), nothing is migrated.
usage: python3 patch_lunch_l1.py path/to/index.html"""
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
def rep(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (c, a[:90])
    s = s.replace(a, b)

# 1. the calculation
old_dur = "function punchDur(p){const end=p.out||p.away||Date.now();let d=(end-p.in)/3600000;const clip=(a,b)=>Math.max(0,Math.min(b,end)-Math.max(a,p.in))/3600000;(p.trips||[]).forEach(tr=>{if(tr.back)d-=clip(tr.left,tr.back);});(p.breaks||[]).forEach(b=>{d-=clip(b.s,b.e);});if(p.breakStart&&!p.out&&!p.away)d-=clip(p.breakStart,Date.now());return Math.max(0,d);}"
new_dur = r"""// L1 paid lunch: up to PAID_LUNCH_MIN minutes of lunch per person per workday (the day of the clock-in, so an overnight
// shift belongs to the day it started) are paid; the rest is unpaid. All of that person's counted clock entries that
// day share the allowance, earliest clock-in first (a site switch splits a day into two entries). Lunch time that
// overlaps an off-site trip is not taken off a second time. Trips keep their own rule (unchanged).
const PAID_LUNCH_MIN=40;
let _lunchIdx=null,_lunchArr=null,_lunchN=-1;
function _lunchSibs(p){const A=D.punches||[];if(!_lunchIdx||_lunchArr!==A||_lunchN!==A.length){_lunchIdx={};_lunchArr=A;_lunchN=A.length;A.forEach(x=>{if(!x||x.in==null)return;const k=x.who+'|'+dkey(x.in);(_lunchIdx[k]=_lunchIdx[k]||[]).push(x);});Promise.resolve().then(()=>{_lunchIdx=null;});}
  const L=(_lunchIdx[p.who+'|'+dkey(p.in)]||[]).filter(x=>x===p||payCounts(x));if(!L.includes(p))L.push(p);
  return L.slice().sort((a,b)=>(a.in-b.in)||String(a.id||'').localeCompare(String(b.id||'')));}
function _ivLen(iv){iv=iv.filter(x=>x[1]>x[0]).sort((a,b)=>a[0]-b[0]);let t=0,cs=null,ce=0;iv.forEach(([s,e])=>{if(cs===null||s>ce){if(cs!==null)t+=ce-cs;cs=s;ce=e;}else if(e>ce)ce=e;});if(cs!==null)t+=ce-cs;return t;}
// lunch time of one clock entry (ms), inside the entry and not already off the clock as an off-site trip
function lunchMs(p){if(!p)return 0;const end=p.out||p.away||Date.now();const c=(a,b)=>[Math.max(+a||0,p.in),Math.min(+b||0,end)];
  const T=(p.trips||[]).filter(tr=>tr&&tr.back).map(tr=>c(tr.left,tr.back));
  const Lv=(p.breaks||[]).filter(b=>b&&b.s&&b.e).map(b=>c(b.s,b.e));if(p.breakStart&&!p.out&&!p.away)Lv.push(c(p.breakStart,Date.now()));
  if(!Lv.length)return 0;return Math.max(0,_ivLen(Lv.concat(T))-_ivLen(T));}
function lunchInfo(p){const tot=lunchMs(p);if(!tot)return {lunch:0,paid:0,unpaid:0};let used=0;for(const x of _lunchSibs(p)){if(x===p)break;used+=lunchMs(x);}
  const paid=Math.min(tot,Math.max(0,PAID_LUNCH_MIN*60000-used));return {lunch:tot,paid,unpaid:tot-paid};}
// hours on the clock for one entry: clock time minus off-site trips minus UNPAID lunch (paid lunch stays in)
function punchDur(p){const end=p.out||p.away||Date.now();let d=(end-p.in)/3600000;const clip=(a,b)=>Math.max(0,Math.min(b,end)-Math.max(a,p.in))/3600000;(p.trips||[]).forEach(tr=>{if(tr.back)d-=clip(tr.left,tr.back);});d-=lunchInfo(p).unpaid/3600000;return Math.max(0,d);}
// one person's day: worked (clock time minus trips), paid lunch, unpaid lunch, payable (worked minus unpaid lunch) — hours
function dayLunchSummary(who,day){const ps=(D.punches||[]).filter(x=>x.who===who&&x.in!=null&&dkey(x.in)===day&&payCounts(x));let worked=0,paid=0,unpaid=0,pay=0;
  ps.forEach(x=>{const li=lunchInfo(x);pay+=punchDur(x);paid+=li.paid;unpaid+=li.unpaid;worked+=punchDur(x)+li.unpaid/3600000;});
  return {worked,paidLunch:paid/60000,unpaidLunch:unpaid/60000,payable:pay,n:ps.length};}
function lunchLine(p){const li=lunchInfo(p);if(!li.lunch)return '';return '🍽 '+t('lunch')+' '+Math.round(li.lunch/60000)+' min: '+Math.round(li.paid/60000)+' '+t('paid')+(li.unpaid>=30000?' · '+Math.round(li.unpaid/60000)+' '+t('unpaid'):'');}
Object.assign(ES,{"Lunch":"Almuerzo","Back from lunch":"Volver del almuerzo","On lunch — up to 40 min paid":"En almuerzo — hasta 40 min pagados","on lunch since":"en almuerzo desde","lunch":"almuerzo","paid":"pagado","unpaid":"sin pago","Today":"Hoy","worked":"trabajado","paid lunch":"almuerzo pagado","unpaid lunch":"almuerzo sin pago","payable":"a pagar","Lunch: up to 40 minutes a day are paid.":"Almuerzo: hasta 40 minutos al día son pagados."});"""
rep(old_dur, new_dur)

# 2. button + toasts: Break -> Lunch (same data fields)
rep('''id="breakBtn" onclick="toggleBreak()">☕ <span data-i18n="Break">Break</span></button>''',
    '''id="breakBtn" onclick="toggleBreak()">🍽 <span data-i18n="Lunch">Lunch</span></button>''')
rep("""bb.innerHTML='▶ '+t('Back from break')+' <span style="font-weight:400;font-size:12px">('+Math.round((Date.now()-open.breakStart)/60000)+' min)</span>';bb.className='btn';}else{bb.innerHTML='☕ '+t('Break');bb.className='btn sec2';}}""",
    """bb.innerHTML='▶ '+t('Back from lunch')+' <span style="font-weight:400;font-size:12px">('+Math.round((Date.now()-open.breakStart)/60000)+' min)</span>';bb.className='btn';}else{bb.innerHTML='🍽 '+t('Lunch');bb.className='btn sec2';}}
  {let ln=document.getElementById('lunchNote');if(!ln&&ex){ln=document.createElement('div');ln.id='lunchNote';ln.className='note';ln.style.marginTop='6px';ex.parentNode.insertBefore(ln,ex.nextSibling);}
   if(ln){const sm=dayLunchSummary(m.id,dkey(new Date()));ln.style.display=(open||sm.n)?'block':'none';
     ln.innerHTML=sm.n?('<b>'+t('Today')+'</b>: '+sm.worked.toFixed(2)+' h '+t('worked')+' · '+Math.round(sm.paidLunch)+' min '+t('paid lunch')+(sm.unpaidLunch>=0.5?' · '+Math.round(sm.unpaidLunch)+' min '+t('unpaid lunch'):'')+' · <b>'+sm.payable.toFixed(2)+' h '+t('payable')+'</b>'):t('Lunch: up to 40 minutes a day are paid.');}}""")
rep("""toast('▶ '+t('Back on the clock'),'green');}else{p.breakStart=Date.now();toast('☕ '+t('On break — clock paused'));}""",
    """toast('▶ '+t('Back on the clock'),'green');}else{p.breakStart=Date.now();toast('🍽 '+t('On lunch — up to 40 min paid'));}""")
rep("// breaks (unpaid — comes off the hours)", "// lunch (L1: up to 40 min a workday paid, the rest unpaid — see lunchInfo); stored as breakStart / breaks")
rep("""txt:'☕ '+t('on break since')+' '+fmtT(p.breakStart)""", """txt:'🍽 '+t('on lunch since')+' '+fmtT(p.breakStart)""")
rep("""(p.breakStart?'☕ '+t('on break since')+' '+fmtT(p.brea""", """(p.breakStart?'🍽 '+t('on lunch since')+' '+fmtT(p.brea""")

# 3. Hours list: show lunch minutes split into paid / unpaid instead of "N min off the clock"
rep("""((p.breaks||[]).length?'<div style="font-size:11px;color:var(--g4);padding-left:8px">☕ '+(p.breaks||[]).map(b=>fmtT(b.s)+'–'+fmtT(b.e)).join(', ')+' ('+Math.round((p.breaks||[]).reduce((q,b)=>q+(b.e-b.s),0)/60000)+' min '+t('off the clock')+')</div>':'')""",
    """((p.breaks||[]).length?'<div style="font-size:11px;color:var(--g4);padding-left:8px">'+lunchLine(p)+' ('+(p.breaks||[]).map(b=>fmtT(b.s)+'–'+fmtT(b.e)).join(', ')+')</div>':'')""")
# person's own history rows
rep("""'<br><span style="font-size:12px;color:var(--g4)">'+fmtT(p.in)+'–'+(end?fmtT(end):t('still in'))+'</span></span>""",
    """'<br><span style="font-size:12px;color:var(--g4)">'+fmtT(p.in)+'–'+(end?fmtT(end):t('still in'))+((p.breaks||[]).length||p.breakStart?' · '+lunchLine(p):'')+'</span></span>""")
open(p, 'w', encoding='utf-8').write(s)
print('L1 applied')
