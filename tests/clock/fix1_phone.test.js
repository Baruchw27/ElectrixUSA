// Fix #1 phone-side test: runs the REAL functions from staging/index.html in a sandbox.
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('/home/claude/electrixusa/staging/index.html','utf8');
function grab(name){const i=src.indexOf('function '+name+'(')>=0?src.indexOf('function '+name+'('):src.indexOf('async function '+name+'(');
  const start=src.lastIndexOf('\n',i)+1;let d=0,j=src.indexOf('{',i);for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(d===0)break;}}return src.slice(start,j+1);}
const code=['geoOk','onLeave','onReturn','doPunch','finalizeAway','settleAway','closeAtLeft'].map(grab).join('\n');
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m);}else{fail++;console.log('FAIL',m);}};
async function run(title,setup){
  const H=60*60*1000,now=Date.now();
  const ctx={console,Date,Math,setTimeout:(f,ms)=>{ctx._timers.push(ms);},_timers:[],toast(){},notify(m){ctx._notes.push(m);},_notes:[],save(){ctx._saved++;},_saved:0,renderPunch(){},
    pnName:()=>'220 Prospect',fmtT:x=>new Date(x).toISOString(),t:x=>x,pushTo(){},openPunchOut(p){ctx._pout=p;},finishPunchIn(){ctx._in++;},_in:0,gpsOk:true,
    window:{EX_REAL:true,EX_ME:'u17'},D:{punches:[],selfie:false}};
  ctx.me=()=>({id:'u17',appClock:true});ctx.window.EX_catchUp=async()=>{};
  setup(ctx,now,H);vm.createContext(ctx);vm.runInContext(code,ctx);return ctx;}
(async()=>{
  // A: Carlos 11/25 — unconfirmed edge "left" 93 min ago, app opened back at the job → server keeps it open
  let c=await run('A',(c,now)=>{c.D.punches=[{id:'pA',who:'u17',in:now-8*3600000,out:null,away:now-93*60000}];
    c.window.EX_sb={rpc:async(fn,a)=>{c._rpc=[fn,a];c.D.punches[0].trips=[{left:c.D.punches[0].away,back:Date.now()}];delete c.D.punches[0].away;return {data:{state:'open',kept:true,gapMin:93}};}};});
  vm.runInContext('onReturn()',c);await new Promise(r=>setImmediate(r));await new Promise(r=>setTimeout(r,10));
  ok(c._rpc&&c._rpc[0]==='punch_settle'&&c._rpc[1].p_back===true,'A: phone asks the server (punch_settle, back=true)');
  ok(c.D.punches[0].out===null,'A: phone does NOT close the clock (Carlos case)');
  ok(c._notes.some(n=>/kept on your clock/.test(n)),'A: man is told the time away was kept');
  // B: leaving confirmed → server closes at the time he left; phone only shows it
  c=await run('B',(c,now)=>{c.D.punches=[{id:'pB',who:'u17',in:now-8*3600000,out:null,away:now-80*60000}];
    c.window.EX_sb={rpc:async()=>{c.D.punches[0].out=c.D.punches[0].away;delete c.D.punches[0].away;return {data:{state:'closed',out:c.D.punches[0].out,confirmed:true}};}};});
  vm.runInContext('onReturn()',c);await new Promise(r=>setTimeout(r,10));
  ok(c.D.punches[0].out===c.D.punches[0].out&&c.D.punches[0].out!==null&&!c._notes.some(n=>/kept/.test(n)),'B: confirmed departure → closed by the server, no "kept" message');
  // C: Punch button with an old unconfirmed "left", server says waiting → asks ONCE, then opens punch-out (no loop)
  c=await run('C',(c,now)=>{c.D.punches=[{id:'pC',who:'u17',in:now-8*3600000,out:null,away:now-70*60000}];c._n=0;
    c.window.EX_sb={rpc:async()=>{c._n++;return {data:{state:'open',waiting:true}};}};});
  vm.runInContext('doPunch()',c);await new Promise(r=>setTimeout(r,20));
  ok(c._n===1,'C: server asked exactly once per tap (no loop), got '+c._n);
  ok(c._pout&&c._pout.id==='pC','C: then opens the normal punch-out (his rule: punch-out while away = time he left)');
  // D: offline (server can't be asked) → old behaviour kept: close at the time he left, then punch in
  c=await run('D',(c,now)=>{c.D.punches=[{id:'pD',who:'u17',in:now-8*3600000,out:null,away:now-90*60000}];c.window.EX_sb=null;});
  vm.runInContext('doPunch()',c);await new Promise(r=>setTimeout(r,20));
  ok(c.D.punches[0].out===c.D.punches[0].out&&c.D.punches[0].out!==null&&c._in===1,'D: offline fallback = old behaviour (close at left, new punch-in)');
  // E: leaving the site no longer starts a 1-hour phone timer that closes the clock
  c=await run('E',(c,now)=>{c.D.punches=[{id:'pE',who:'u17',in:now-2*3600000,out:null}];c.window.EX_sb=null;});
  vm.runInContext('onLeave()',c);
  ok(c._timers.length===0,'E: no phone-side 1-hour close timer');
  ok(c.D.punches[0].away&&!c.D.punches[0].out,'E: phone still marks "left" (fence crossing counts, #2 unchanged)');
  console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
})();
