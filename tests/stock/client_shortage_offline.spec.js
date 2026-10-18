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
  await new Promise(r=>srv.listen(8090,r));
  const b=await chromium.launch({executablePath:CHROME,args:['--no-sandbox']});
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(d=>{try{localStorage.setItem('electrix_v29',d);localStorage.setItem('electrix_session','u1');localStorage.setItem('electrix_welcome','1');}catch(e){}},JSON.stringify(seedD));
  const page=await ctx.newPage();
  for(const f of ['config.js','sync.js','sw.js']) await page.route('**/'+f,r=>r.fulfill({status:200,contentType:'application/javascript',body:'/*off*/'}));
  const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.goto('http://localhost:8090/index.html',{waitUntil:'load'});await page.waitForTimeout(600);
  // faithful server stub incl shortage rejection + idempotency
  await page.evaluate(()=>{window.__srv={qty:50,applied:{}};
    window.EX_REAL=true;window.EX_SYNC={online:true};
    window.EX_sb={rpc:async(name,args)=>{const txn=args.txn;
      if(window.__srv.applied[txn.id])return {data:{duplicate:true,qtys:[{id:'k1',qty:window.__srv.qty}]},error:null};
      // validate shortage (delta only)
      let q=window.__srv.qty;
      for(const m of txn.moves){if('set'in m){q=Math.max(0,m.set);}else{const nq=q+m.delta;if(nq<0)return {data:null,error:{code:'P0001',message:'insufficient_stock: 12/2 Romex available '+q+', requested '+Math.abs(m.delta)}};q=nq;}}
      window.__srv.applied[txn.id]=true;window.__srv.qty=q;
      return {data:{duplicate:false,qtys:[{id:'k1',qty:q}]},error:null};}};});
  const lastToast=()=>page.evaluate(()=>{const b=document.getElementById('toastBox');if(!b||!b.children.length)return{txt:'',cls:''};const d=b.children[b.children.length-1];return{txt:d.textContent,cls:d.className};});
  const clr=()=>page.evaluate(()=>{const b=document.getElementById('toastBox');if(b)b.innerHTML='';});
  const snap=()=>page.evaluate(()=>({local:(D.stock.find(x=>x.id==='k1')||{}).qty,server:window.__srv.qty,queue:JSON.parse(localStorage.getItem('electrix_v29__stockq')||'[]').length}));
  const out=[];

  // A) valid pickup 10 -> success
  await clr();
  await page.evaluate(async()=>{openPickup();puLines=[{id:'k1',name:'12/2 Romex',unit:'box',qty:10}];document.getElementById('puSite').value='s2';await savePickup();});
  await page.waitForTimeout(400);let s=await snap();let tt=await lastToast();
  out.push((s.local===40&&s.server===40&&/→/.test(tt.txt)&&tt.cls.includes('green')?'PASS':'FAIL')+'  valid pickup 10 -> local='+s.local+' server='+s.server+' toast="'+tt.txt.slice(0,30)+'" ['+tt.cls+']');

  // B) over-pickup 100 (only 40) -> REJECTED: reverted, error toast, NO success
  await clr();
  await page.evaluate(async()=>{openPickup();puLines=[{id:'k1',name:'12/2 Romex',unit:'box',qty:100}];document.getElementById('puSite').value='s2';await savePickup();});
  await page.waitForTimeout(500);s=await snap();tt=await lastToast();
  const ok=s.local===40&&s.server===40&&s.queue===0&&/Not enough/i.test(tt.txt)&&tt.cls.includes('bad');
  out.push((ok?'PASS':'FAIL')+'  OVER-pickup 100 -> local='+s.local+' server='+s.server+' queue='+s.queue+' toast="'+tt.txt.slice(0,40)+'" ['+tt.cls+'] (reverted + error, no false success)');

  // C) offline pickup 5 -> queued, honest "will sync"
  await clr();
  await page.evaluate(async()=>{window.EX_SYNC.online=false;openPickup();puLines=[{id:'k1',name:'12/2 Romex',unit:'box',qty:5}];document.getElementById('puSite').value='s2';await savePickup();});
  await page.waitForTimeout(300);s=await snap();tt=await lastToast();
  out.push((s.local===35&&s.server===40&&s.queue===1&&/sync/i.test(tt.txt)?'PASS':'FAIL')+'  OFFLINE pickup 5 -> local='+s.local+' server='+s.server+' queued='+s.queue+' toast="'+tt.txt.slice(0,30)+'"');

  // D) reconnect -> applies
  await page.evaluate(async()=>{window.EX_SYNC.online=true;await EX_flushStockQ();});
  await page.waitForTimeout(400);s=await snap();
  out.push((s.local===35&&s.server===35&&s.queue===0?'PASS':'FAIL')+'  reconnect flush -> local='+s.local+' server='+s.server+' queue='+s.queue);

  out.push('pageerrors: '+(errs.length?errs.slice(0,3).join(' | '):'NONE'));
  console.log(out.join('\n'));
  await b.close();srv.close();
})().catch(e=>{console.log('DRIVER ERROR',e.message,e.stack);process.exit(1);});
