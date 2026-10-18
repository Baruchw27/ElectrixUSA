const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT='/home/claude/electrixusa/staging';
const seedD={emps:[{id:'u1',name:'Owner',role:'owner'}],crews:[],
  sites:[{id:'s1',name:'Garage'},{id:'s2',name:'Job A'}],
  jobs:[],mats:[],meets:[],groups:[],stock:[{id:'k1',name:'12/2 Romex',unit:'box',qty:50,min:5}],stockLog:[],ests:[],tickets:[],tools:[],vans:{},
  punches:[],timeoff:[],inbox:[],push:[],travel:[],goHomeLog:[],exps:[],fixes:[],insp:[],keep:[],base:{},demo:false,role:'u1',nextId:100};
const srv=http.createServer((rq,rs)=>{let p=rq.url.split('?')[0];if(p==='/')p='/index.html';
  fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){rs.writeHead(404);rs.end('x');return;}rs.writeHead(200,{'Content-Type':p.endsWith('.js')?'application/javascript':'text/html'});rs.end(b);});});
(async()=>{
  await new Promise(r=>srv.listen(8091,r));
  const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox']});
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(d=>{try{localStorage.setItem('electrix_v29',d);localStorage.setItem('electrix_session','u1');localStorage.setItem('electrix_welcome','1');}catch(e){}},JSON.stringify(seedD));
  const page=await ctx.newPage();
  for(const f of ['config.js','sync.js','sw.js']) await page.route('**/'+f,r=>r.fulfill({status:200,contentType:'application/javascript',body:'/*off*/'}));
  const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.goto('http://localhost:8091/index.html',{waitUntil:'load'});await page.waitForTimeout(600);
  const out=[];
  // Install a faithful server stub: tracks serverQty for k1, applies each txn once (idempotent), floors at 0.
  await page.evaluate(()=>{
    window.__srv={qty:50, applied:{}, calls:[]};
    window.EX_REAL=true; window.EX_SYNC={online:true};
    window.EX_sb={rpc:async(name,args)=>{const txn=args.txn;window.__srv.calls.push({id:txn.id,moves:txn.moves});
      let dup=false;
      if(window.__srv.applied[txn.id]){dup=true;}
      else{window.__srv.applied[txn.id]=true;txn.moves.forEach(m=>{if('set'in m)window.__srv.qty=Math.max(0,+m.set);else window.__srv.qty=Math.max(0,window.__srv.qty+(+m.delta||0));});}
      return {data:{duplicate:dup, qtys:[{id:'k1', qty:window.__srv.qty}]}, error:null};}};
  });
  const snap=async()=>page.evaluate(()=>({localQty:(D.stock.find(x=>x.id==='k1')||{}).qty, serverQty:window.__srv.qty, queue:JSON.parse(localStorage.getItem(localStorage.KEYX||'electrix_v29'+'__stockq')||'[]').length, log:D.stockLog.length, calls:window.__srv.calls.length}));

  // 1) ONLINE pickup 10 -> optimistic 40, flush applies -> server 40, queue empty
  await page.evaluate(()=>{openPickup();puLines=[{id:'k1',name:'12/2 Romex',unit:'box',qty:10}];document.getElementById('puSite').value='s2';savePickup();});
  await page.waitForTimeout(400);
  let s=await snap();
  out.push((s.localQty===40&&s.serverQty===40&&s.queue===0&&s.log===1?'PASS':'FAIL')+'  online pickup 10 -> local='+s.localQty+' server='+s.serverQty+' queue='+s.queue+' log='+s.log+' rpcCalls='+s.calls);

  // 2) OFFLINE pickup 5 -> optimistic 35, queued, server still 40
  await page.evaluate(()=>{window.EX_SYNC.online=false;openPickup();puLines=[{id:'k1',name:'12/2 Romex',unit:'box',qty:5}];document.getElementById('puSite').value='s2';savePickup();});
  await page.waitForTimeout(300);
  s=await snap();
  out.push((s.localQty===35&&s.serverQty===40&&s.queue===1?'PASS':'FAIL')+'  OFFLINE pickup 5 -> local='+s.localQty+' server='+s.serverQty+' queued='+s.queue+' (not sent)');

  // 3) RECONNECT -> flush applies the queued txn -> server 35, queue empty
  await page.evaluate(()=>{window.EX_SYNC.online=true;EX_flushStockQ();});
  await page.waitForTimeout(500);
  s=await snap();
  out.push((s.localQty===35&&s.serverQty===35&&s.queue===0?'PASS':'FAIL')+'  RECONNECT flush -> local='+s.localQty+' server='+s.serverQty+' queue='+s.queue);

  // 4) IDEMPOTENT RETRY: re-queue an already-applied txn id and flush -> no double, dequeued
  const before=await page.evaluate(()=>window.__srv.qty);
  await page.evaluate(()=>{const k='electrix_v29__stockq';const applied=Object.keys(window.__srv.applied);const q=JSON.parse(localStorage.getItem(k)||'[]');q.push({id:applied[0],by:'u1',moves:[{id:'k1',delta:-7}],ts:Date.now()});localStorage.setItem(k,JSON.stringify(q));EX_flushStockQ();});
  await page.waitForTimeout(500);
  const after=await page.evaluate(()=>({qty:window.__srv.qty, queue:JSON.parse(localStorage.getItem('electrix_v29__stockq')||'[]').length}));
  out.push((after.qty===before&&after.queue===0?'PASS':'FAIL')+'  idempotent retry of applied txn -> server unchanged ('+before+'->'+after.qty+'), queue='+after.queue);

  // 5) PUT-BACK 20 -> server 55
  await page.evaluate(()=>{openStockIn();siLines=[{id:'k1',name:'12/2 Romex',unit:'box',qty:20}];const ss=document.getElementById('siSite');if(ss)ss.value='';saveStockIn();});
  await page.waitForTimeout(400);
  s=await snap();
  out.push((s.localQty===55&&s.serverQty===55?'PASS':'FAIL')+'  put-back 20 -> local='+s.localQty+' server='+s.serverQty);

  out.push('pageerrors: '+(errs.length?errs.slice(0,4).join(' | '):'NONE'));
  console.log(out.join('\n'));
  await b.close();srv.close();
})().catch(e=>{console.log('DRIVER ERROR',e.message,e.stack);process.exit(1);});
