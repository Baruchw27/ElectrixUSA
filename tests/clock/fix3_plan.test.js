// Fix #3 test: runs the REAL fxPlan from staging/index.html. Time zone New York, like the crews' phones.
process.env.TZ='America/New_York';
const fs=require('fs'),vm=require('vm');const src=fs.readFileSync('/home/claude/electrixusa/staging/index.html','utf8');
function grab(n){const i=src.indexOf('function '+n+'(');let d=0,j=src.indexOf('{',i);for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(i,j+1);}
const ctx={Date,Math,Infinity,Set,isNaN,dkey:d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),
  fmtT:x=>new Date(x).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}),siteName:id=>({t45:'220 Prospect',t70:'14 Dorset'})[id]||id,t:x=>x};
vm.createContext(ctx);vm.runInContext(['fxMs','fxPlan'].map(grab).join('\n'),ctx);
const T=(hm,date='2026-11-25')=>new Date(date+'T'+hm).getTime();const NOW=T('23:00');
let pass=0,fail=0;const ok=(c,m,x)=>{if(c){pass++;console.log('PASS',m);}else{fail++;console.log('FAIL',m,JSON.stringify(x));}};
const show=a=>a.map(c=>ctx.fmtT(c.in)+'-'+(c.out?ctx.fmtT(c.out):'open')).join(', ');
// Carlos 11/25 as it was: 3 clocks at 220 Prospect
const carlos=[{id:'A',who:'u17',site:'t45',in:T('08:25'),out:T('12:50')},{id:'B',who:'u17',site:'t45',in:T('13:57'),out:T('16:48')},{id:'C',who:'u17',site:'t45',in:T('18:21'),out:T('21:07')}];
// 1) Carlos with the new screen: taps the 8:25 AM clock, "app closed my clock but I was still working", until 9:06 PM
let P=ctx.fxPlan({who:'u17',date:'2026-11-25',kind:'gap',punch:'A',out:'21:06'},carlos,NOW);
ok(P.ok&&P.after.length===1,'1: Carlos — one clock after the fix, no duplicate: '+show(P.after||[]),P);
ok(P.ops.filter(o=>o.type==='void').length===2&&!P.ops.some(o=>o.type==='add'),'1: the other two clocks are joined (voided, kept in history), nothing added');
ok(P.after&&P.after[0].in===T('08:25')&&P.after[0].out===T('21:07'),'1: result 8:25 AM – 9:07 PM (keeps the 9:07 he really punched out)');
// 2) Carlos's actual mistake: picked 8:25 PM by accident as a "missing day" → old screen made a duplicate; new one joins and warns
P=ctx.fxPlan({who:'u17',date:'2026-11-25',kind:'missing',site:'t45',in:'20:25',out:'21:06'},carlos,NOW);
ok(!P.ok&&P.err==='Nothing to change — this clock already covers that time'&&!P.ops.some(o=>o.type==='add'),'2: 8:25 PM by mistake → refused, no duplicate ("this clock already covers that time")',P);
ok(P.night.length>=1,'2: warns "check AM / PM — 8:25 PM is at night"');
// 3) started earlier
P=ctx.fxPlan({who:'u17',date:'2026-11-25',kind:'earlier',punch:'A',in:'08:00'},carlos,NOW);
ok(P.ok&&P.after[0].in===T('08:00')&&P.after.length===3,'3: started earlier → first clock 8:00 AM, others unchanged: '+show(P.after||[]));
ok(!ctx.fxPlan({who:'u17',date:'2026-11-25',kind:'earlier',punch:'A',in:'09:00'},carlos,NOW).ok,'3: "earlier" but a later time → refused');
// 4) left later, ending inside the next clock → joined
P=ctx.fxPlan({who:'u17',date:'2026-11-25',kind:'later',punch:'A',out:'14:30'},carlos,NOW);
ok(P.ok&&P.after.length===2&&P.after[0].out===T('16:48'),'4: left later into the next clock → joined: '+show(P.after||[]));
// 5) end before start / future / > 16 h / other job overlap
ok(!ctx.fxPlan({who:'u17',date:'2026-11-27',kind:'missing',site:'t45',in:'08:00',out:'17:00'},[],T('09:00','2026-11-26')).ok,'5: a day that has not come yet → refused');
ok(!ctx.fxPlan({who:'u17',date:'2026-11-25',kind:'missing',site:'t45',in:'05:00',out:'23:30'},[],NOW).ok,'5: more than 16 hours → refused (check AM / PM)');
P=ctx.fxPlan({who:'u17',date:'2026-11-25',kind:'missing',site:'t70',in:'12:00',out:'13:00'},carlos,NOW);
ok(!P.ok&&P.err==='This overlaps your clock at'&&P.errSite==='t45','5: overlaps a clock at another job → refused, ask the office');
// 6) whole day missing, no clocks → one new clock
P=ctx.fxPlan({who:'u6',date:'2026-11-25',kind:'missing',site:'t70',in:'08:00',out:'19:00'},carlos,NOW);
ok(P.ok&&P.ops.length===1&&P.ops[0].type==='add'&&P.after.length===1,'6: whole day missing → exactly one new clock');
// 7) still working today: end later than now → clock stays open
P=ctx.fxPlan({who:'u17',date:'2026-11-25',kind:'gap',punch:'C',out:'23:30'},carlos,NOW);
ok(P.ok&&P.after[P.after.length-1].out===null,'7: finish later than now → the clock stays open (Baruch 11/19 rule)');
// 8) nothing to change
ok(ctx.fxPlan({who:'u17',date:'2026-11-25',kind:'later',punch:'A',out:'12:00'},carlos,NOW).ok===false,'8: finish earlier than the clock already has → refused');
console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
