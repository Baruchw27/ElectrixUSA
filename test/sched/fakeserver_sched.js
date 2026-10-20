// Local stand-in for Supabase used only in tests: auth, records table with the same access rules, realtime (SSE), storage.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.env.APPROOT||path.join(__dirname,'..');const PORT=+process.argv[2]||8787;
const users={};      // email -> {id,pass}
const tokens={};     // token -> email
const records=new Map(); // coll\u0001id -> row
if(process.env.STOCKDBG){const _set=records.set.bind(records);records.set=(k,v)=>{const o=records.get(k);if(k.startsWith('stock\u0001')&&o&&o.data&&o.data.qty!=null&&(v.data||{}).qty==null)console.log('STOCK QTY DROPPED',k,new Error().stack.split('\n').slice(2,4).join(' | '));return _set(k,v);};}
const blobs={};      // path -> {type,buf}
let clients=[];let PRIVATE=false;let NET='ok';      // SSE {res,email}
const now=()=>new Date().toISOString();
// store like Postgres jsonb does: keys re-ordered (shorter first, then alphabetical), so the app must not depend on key order
function pg(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(pg);const o={};Object.keys(v).filter(k=>v[k]!==undefined).sort((a,b)=>a.length-b.length||(a<b?-1:a>b?1:0)).forEach(k=>o[k]=pg(v[k]));return o;}
function uidOf(email){return users[email]&&users[email].id;}
function emps(){return [...records.values()].filter(r=>r.coll==='emps'&&!r.deleted);}
function isMember(email){if(!email)return false;const e=emps();if(!e.length)return true;const uid=uidOf(email);return e.some(r=>r.data.authUid===uid&&!r.data.inactive);}
function myEmp(email){const uid=uidOf(email);const r=emps().find(r=>r.data.authUid===uid);return r?r.id:null;}
// same rules as can_see2 in schema.sql
function meData(email){const uid=uidOf(email);const r=emps().find(r=>r.data.authUid===uid);return r?Object.assign({id:r.id},r.data):{};}
// same rules as guard_record in schema.sql
function guardOk(email,c,o,n,del,exists){if(!emps().length)return true;if(isBoss(email))return true;const me=meData(email);if(!me.id)return true;const office=me.role==='office';const money=office&&['Payroll','Bookkeeper'].includes(me.title);
  if(c==='push')return (!o||o.who===me.id)&&(del||n.who===me.id);
  if(['base','crews','sched','_'].includes(c))return isBoss(email);
  if(c==='sites'&&!isBoss(email)&&!office&&(del||['lat','lng','rad','fenceOk','trip'].some(k=>JSON.stringify((n||{})[k])!==JSON.stringify((o||{})[k]))))return false;
  if(c==='stock'&&del&&!(isBoss(email)||(office&&me.title==='Material')))return false;
  if(c==='jobs'&&del&&!isBoss(email)&&(o||{}).from!==me.id)return false;
  if(del)return c!=='emps';
  if(c==='emps')return !!o&&exists&&ownEmp(email,o)&&canonEq(strip(n),strip(o));
  if(!['punches','timeoff','exps','travel','goHomeLog'].includes(c))return true;
  if(c==='goHomeLog'&&!office)return false;
  if(((!o&&n.who!==me.id)||(o&&o.who!==n.who))&&!(c==='punches'&&(me.all||(office&&me.title==='Payroll')))&&!(c==='exps'&&(me.all||(office&&['Payroll','Bookkeeper'].includes(me.title))))&&!(['timeoff','travel'].includes(c)&&isBoss(email)))return false;
  if(c==='punches'&&!o&&!(me.all||(office&&me.title==='Payroll'))){const now=Date.now();if(!(n.in<=now+300000&&n.in>=now-3*86400000))return false;}
  if(c==='punches'&&!office){if((n.approvedBy||'')!==((o&&o.approvedBy)||''))return false;if(o&&(n.in!==o.in||(o.pending&&!n.pending)||(o.out!=null&&n.out!==o.out)||JSON.stringify(n.edits)!==JSON.stringify(o.edits)))return false;}
  if(c==='timeoff'&&!['pending','cancelled'].includes(n.status||'pending')&&n.status!==(o&&o.status))return false;
  if(c==='exps'&&!money&&((!!n.paid!==!!(o&&o.paid)&&!!n.paid)||(n.paidBy!==(o&&o.paidBy))))return false;
  return true;}
function strip(x){const y=Object.assign({},x||{});delete y.lang;delete y.phone;return y;}
function canonEq(a,b){const k=o=>JSON.stringify(Object.keys(o).sort().map(x=>[x,o[x]]));return k(a)===k(b);}
function ownEmp(email,o){return o&&o.authUid===uidOf(email);}
function canSee(email,row){const d=row.data||{};const me=meData(email);const c=row.coll;
  if(c==='keep')return d.owner===me.id||(d.collab||[]).includes(me.id);
  if(c==='inbox')return d.to===me.id;
  if(c==='push')return d.who===me.id;
  if(c==='meets')return me.role==='owner'||d.by===me.id||(d.with||[]).includes(me.id);
  if(['punches','timeoff','goHomeLog','travel'].includes(c))return ['owner','manager','office'].includes(me.role)||!!me.all||d.who===me.id||(!!me.lead&&!!me.crew&&emps().some(e=>e.id===d.who&&e.data.crew===me.crew));
  if(c==='exps')return ['owner','manager'].includes(me.role)||!!me.all||(me.role==='office'&&['Payroll','Bookkeeper'].includes(me.title))||d.who===me.id;
  return true;}
function isBoss(email){const uid=uidOf(email);return emps().some(r=>r.data.authUid===uid&&!r.data.inactive&&(['owner','manager'].includes(r.data.role)||r.data.all||(r.data.role==='office'&&r.data.title==='Payroll')));}
function body(req){return new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{r(b?JSON.parse(b):{});}catch(e){r({raw:b});}});});}
function send(res,code,obj,type){res.writeHead(code,{'Content-Type':type||'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'});res.end(type?obj:JSON.stringify(obj));}
function who(req){const a=req.headers.authorization||'';const t=a.replace(/^Bearer /,'');return tokens[t]||null;}
const stats={upserts:0,rows:0,pulls:0};
http.createServer(async (req,res)=>{
  const u=new URL(req.url,'http://x');const p=u.pathname;
  if(p==='/__net'){NET=u.searchParams.get('mode')||'ok';return send(res,200,{NET});}
  if(NET!=='ok'&&(p.startsWith('/auth')||p.startsWith('/rpc')||p.startsWith('/records')||p.startsWith('/realtime'))){if(NET==='down')return;if(NET==='refuse'){try{req.socket.destroy();}catch(e){}return;}await new Promise(r=>setTimeout(r,+NET||0));}
  if(req.method==='OPTIONS')return send(res,204,{});
  // ---- auth
  if(p==='/auth/signup'){const b=await body(req);const em=b.email.toLowerCase();if(users[em])return send(res,400,{error:'User already registered'});users[em]={id:crypto.randomUUID(),pass:b.password};const tk=crypto.randomUUID();tokens[tk]=em;return send(res,200,{user:{id:users[em].id,email:em,identities:[{}]},token:tk});}
  if(p==='/auth/signin'){const b=await body(req);const em=(b.email||'').toLowerCase();const x=users[em];if(!x||x.pass!==b.password)return send(res,400,{error:'Invalid login credentials'});const tk=crypto.randomUUID();tokens[tk]=em;return send(res,200,{user:{id:x.id,email:em},token:tk});}
  if(p==='/auth/update'){const em=who(req);if(!em)return send(res,401,{error:'no session'});const b=await body(req);users[em].pass=b.password;return send(res,200,{ok:true});}
  if(p==='/auth/user'){const em=who(req);if(!em)return send(res,401,{error:'no session'});return send(res,200,{user:{id:uidOf(em),email:em}});}
  // ---- rpc
  if(p==='/rpc/resolve_login'){const b=await body(req);const q=(b.q||'').trim().toLowerCase();const dig=q.replace(/\D/g,'');const e=emps().map(r=>r.data).filter(d=>!d.inactive);
    const hit=e.find(d=>d.name.toLowerCase()===q)||e.find(d=>(d.email||'').toLowerCase()===q||(d.authEmail||'').toLowerCase()===q||(dig.length>=7&&(d.phone||'').replace(/\D/g,'')===dig)||d.name.toLowerCase().split(' ')[0]===q);return send(res,200,hit?hit.authEmail:null);}
  if(p==='/rpc/is_member'){const em=who(req);return send(res,200,!!em&&isMember(em));}
  if(p==='/rpc/no_team_yet'){return send(res,200,emps().length===0);}
  if(p==='/rpc/admin_create_user'||p==='/rpc/setup_owner'){const em=who(req);const b=await body(req);if(p==='/rpc/setup_owner'){if(emps().length)return send(res,400,{error:'already set up'});}else if(!isBoss(em))return send(res,400,{error:'not allowed'});{const pp=b.p_pass||'';if(pp.length<8)return send(res,400,{error:'password too short'});if(!/[A-Za-z]/.test(pp)||!/[0-9]/.test(pp))return send(res,400,{error:'password needs letters and numbers'});if(/electrix/i.test(pp)||/^(.)\1+$/.test(pp))return send(res,400,{error:'password too common'});}const e=(b.p_email||'').toLowerCase();if(users[e])users[e].pass=b.p_pass;else users[e]={id:crypto.randomUUID(),pass:b.p_pass};return send(res,200,users[e].id);}
  if(p==='/rpc/admin_set_password'){const em=who(req);if(!isBoss(em))return send(res,400,{error:'not allowed'});const b=await body(req);{const pp=b.p_pass||'';if(pp.length<8)return send(res,400,{error:'password too short'});if(!/[A-Za-z]/.test(pp)||!/[0-9]/.test(pp))return send(res,400,{error:'password needs letters and numbers'});if(/electrix/i.test(pp)||/^(.)\1+$/.test(pp))return send(res,400,{error:'password too common'});}const x=users[(b.p_email||'').toLowerCase()];if(!x)return send(res,200,null);x.pass=b.p_pass;return send(res,200,x.id);}
  if(p==='/rpc/save_records'){const em=who(req);if(!em)return send(res,401,{error:'JWT expired'});if(!isMember(em))return send(res,403,{error:'new row violates row-level security policy'});const b=await body(req);if(global.FAIL)return send(res,global.FAIL,{message:global.FAILMSG||'injected server error',code:'XX000'});const rows=b.rows||[];(global.PAY=global.PAY||[]).push({t:Date.now(),who:em,rows:JSON.parse(JSON.stringify(rows))});stats.upserts++;stats.rows+=rows.length;
    // emulate the real DB trigger guard_sched_rev: an update to an existing sched row must raise rev, else the WHOLE call aborts (40001)
    for(const r of rows){if(r.coll!=='sched'||r.deleted)continue;const old=records.get(r.coll+'\u0001'+r.id);if(!old||old.deleted)continue;let nd;if('full' in r)nd=r.full;else{nd=Object.assign({},old.data,r.patch||{});(r.unset||[]).forEach(f=>delete nd[f]);}
      if(JSON.stringify(pg(nd))!==JSON.stringify(old.data)&&((nd&&nd.rev)|0)<=((old.data&&old.data.rev)|0)){stats.stale=(stats.stale||0)+1;return send(res,409,{code:'40001',message:'stale_sched_write for '+r.id,details:null,hint:null});}}
    for(const r of rows){const k=r.coll+'\u0001'+r.id;const old=records.get(k);let data;
      if(r.deleted)data=r.full||{};else if('full' in r)data=r.full;else if(old&&!old.deleted&&(old.data===null||typeof old.data!=='object'||Array.isArray(old.data)))data=old.data;else{data=old&&!old.deleted?Object.assign({},old.data,r.patch||{}):Object.assign({},r.patch||{});(r.unset||[]).forEach(f=>delete data[f]);}
      if(r.coll==='stock'&&data&&typeof data==='object'){data=Object.assign({},data);delete data.qv;if(old&&old.data&&typeof old.data==='object'&&'qty' in old.data){data.qty=old.data.qty;if('qv' in old.data)data.qv=old.data.qv;}else data.qty=0;} // same rule as guard_stock_qty on the server
      const row={coll:r.coll,id:r.id,data:pg(data),deleted:!!r.deleted,updated_by:r.by||null,updated_at:now()};
      if(old&&!canSee(em,old))continue; // existing row this person can't see: skipped (like the real server)
      if(global.DENY&&r.coll===global.DENY){stats.blocked=(stats.blocked||0)+1;continue;}
      if(!guardOk(em,r.coll,old&&!old.deleted?old.data:null,data,!!r.deleted,!!old)){stats.blocked=(stats.blocked||0)+1;(stats.blockedList=stats.blockedList||[]).push(r.coll+"/"+r.id+" by "+em+" keys:"+Object.keys(r.patch||r.full||{}).join(","));continue;}
      if(r.coll==='keep'&&!r.deleted&&!old){const me=myEmp(em);if(emps().length&&data.owner!==me)return send(res,403,{error:'new row violates row-level security policy'});}
      records.set(k,row);const msg='data: '+JSON.stringify({eventType:'UPDATE',new:row})+'\n\n';clients.forEach(c=>{if(isMember(c.email)&&canSee(c.email,row))c.res.write(msg);});}
    if(global.DROPRESP){global.DROPRESP--;try{req.socket.destroy();}catch(e){}return;} // stored, but the answer never reaches the phone
    return send(res,200,rows.map(r=>records.get(r.coll+'\u0001'+r.id)).filter(Boolean).filter(r=>canSee(em,r)).map(r=>({coll:r.coll,id:r.id,data:r.data,deleted:r.deleted})));}
  // ---- records
  if(p==='/records'&&req.method==='GET'){const em=who(req);stats.pulls++;const after=u.searchParams.get('after');if(after)stats.catchups=(stats.catchups||0)+1;if(!isMember(em))return send(res,200,[]);const from=+u.searchParams.get('from')||0,to=+u.searchParams.get('to')||999;const all=[...records.values()].sort((a,b)=>a.coll<b.coll?-1:a.coll>b.coll?1:a.id<b.id?-1:1);return send(res,200,all.filter(r=>canSee(em,r)&&(!after||r.updated_at>after)).slice(from,to+1));}
  if(p==='/records'&&req.method==='POST'){const em=who(req);if(!em)return send(res,401,{error:'JWT expired'});if(!isMember(em))return send(res,403,{error:'new row violates row-level security policy'});const b=await body(req);const rows=Array.isArray(b)?b:[b];stats.upserts++;stats.rows+=rows.length;
    rows.forEach(r=>{const row={coll:r.coll,id:r.id,data:pg(r.data||{}),deleted:!!r.deleted,updated_by:r.updated_by||null,updated_at:now()};records.set(r.coll+'\u0001'+r.id,row);
      const msg='data: '+JSON.stringify({eventType:'UPDATE',new:row})+'\n\n';clients.forEach(c=>{if(isMember(c.email)&&canSee(c.email,row))c.res.write(msg);});});
    return send(res,201,{});}
  if(p==='/realtime'){const em=tokens[u.searchParams.get('token')];res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Access-Control-Allow-Origin':'*'});res.write(': ok\n\n');const c={res,email:em};clients.push(c);req.on('close',()=>{clients=clients.filter(x=>x!==c);});return;}
  // ---- storage
  if(p.startsWith('/storage/upload/')){const em=who(req);if(!isMember(em))return send(res,403,{error:'not allowed'});const k=p.slice('/storage/upload/'.length);const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{blobs[k]={type:req.headers['content-type'],buf:Buffer.concat(chunks)};send(res,200,{Key:k});});return;}
  if(p==='/__private'){PRIVATE=u.searchParams.get('on')==='1';return send(res,200,{PRIVATE});}
  if(p.startsWith('/storage/v1/object/public/files/')){stats.pub=(stats.pub||0)+1;if(PRIVATE)return send(res,400,{error:'Bucket not found'});const k=p.slice('/storage/v1/object/public/files/'.length);const b=blobs[k];if(!b)return send(res,404,{});res.writeHead(200,{'Content-Type':b.type,'Access-Control-Allow-Origin':'*'});return res.end(b.buf);}
  if(p.startsWith('/storage/v1/object/authenticated/files/')){stats.auth=(stats.auth||0)+1;const em=who(req);if(!em||!isMember(em))return send(res,400,{error:'not allowed'});const k=p.slice('/storage/v1/object/authenticated/files/'.length);const b=blobs[k];if(!b)return send(res,404,{});res.writeHead(200,{'Content-Type':b.type,'Access-Control-Allow-Origin':'*'});return res.end(b.buf);}
  if(p.startsWith('/storage/public/')){const k=p.slice('/storage/public/'.length);const b=blobs[k];if(!b)return send(res,404,{});res.writeHead(200,{'Content-Type':b.type,'Access-Control-Allow-Origin':'*'});return res.end(b.buf);}
  // ---- server functions (stand-ins)
  if(p==='/functions/v1/trello'&&req.method==='GET'){const em=who(req);if(!isMember(em))return send(res,401,{error:'not allowed'});res.writeHead(200,{'Content-Type':'application/pdf','Access-Control-Allow-Origin':'*'});return res.end('%PDF-1.4 fake plan');}
  if(p==='/functions/v1/ai'){const em=who(req);if(!isMember(em))return send(res,401,{error:'not allowed'});const b=await body(req);stats.ai=(stats.ai||0)+1;stats.aiImages=(b.images||[]).length;return send(res,200,{text:'```json\n{"answer":"Carlos is at 177 Bates Dr"}\n```'});}
  // ---- server-side sign-in (stand-in for the "login" function: name/phone → account on the server)
  if(p==='/functions/v1/login'){const b=await body(req);const q=(b.q||'').trim().toLowerCase();const dig=q.replace(/\D/g,'');const e=emps().map(r=>r.data).filter(d=>!d.inactive);
    const hit=e.find(d=>d.name.toLowerCase()===q)||e.find(d=>(d.email||'').toLowerCase()===q||(d.authEmail||'').toLowerCase()===q||(dig.length>=7&&(d.phone||'').replace(/\D/g,'')===dig)||d.name.toLowerCase().split(' ')[0]===q);
    const em=hit&&(hit.authEmail||'').toLowerCase();const x=em&&users[em];if(!x||x.pass!==b.password)return send(res,200,{session:null});const tk=crypto.randomUUID();tokens[tk]=em;return send(res,200,{session:{access_token:tk,refresh_token:'r'+tk}});}
  // ---- stock transactions (stand-in for apply_stock_txn: atomic, idempotent by id, shortage refused)
  if(p==='/rpc/apply_stock_txn'){const em=who(req);if(!em||!isMember(em))return send(res,403,{error:'not allowed'});const b=await body(req);const txn=b.txn||{};
    if(global.STOCKFAIL){const c=global.STOCKFAIL;global.STOCKFAIL=null;return send(res,400,{message:'txn id required',code:c});}
    global.__applied=global.__applied||{};const fp=JSON.stringify([txn.kind,txn.moves]);stats.stockTxn=(stats.stockTxn||0)+1;
    const qtys=()=>[...new Set((txn.moves||[]).map(m=>m.id))].map(id=>{const r=records.get('stock\u0001'+id);return {id,qty:r&&!r.deleted?(+r.data.qty||0):0,qv:r&&!r.deleted?(+r.data.qv||0):0};});
    if(global.__applied[txn.id]){if(global.__applied[txn.id]!==fp)return send(res,400,{error:'txn_reuse_conflict'});stats.stockDup=(stats.stockDup||0)+1;return send(res,200,{duplicate:true,qtys:qtys()});}
    const plan=[];for(const m of txn.moves||[]){const k='stock\u0001'+m.id;const r=records.get(k);const cur=r&&!r.deleted?(+r.data.qty||0):0;const nq='set' in m?Math.max(0,+m.set):cur+(+m.delta||0);
      if(nq<0)return send(res,400,{error:'insufficient_stock: '+(m.name||m.id)+' available '+cur+', requested '+Math.abs(m.delta)});plan.push({k,m,r,nq,cur});}
    global.__applied[txn.id]=fp;const me=myEmp(em);
    for(const x of plan){const data=x.r&&!x.r.deleted?Object.assign({},x.r.data,{qty:x.nq,qv:(+x.r.data.qv||0)+1}):{id:x.m.id,name:x.m.name||x.m.id,unit:x.m.unit||'pc',min:0,qty:x.nq,qv:1};const row={coll:'stock',id:x.m.id,data:pg(data),deleted:false,updated_by:me,updated_at:now()};records.set(x.k,row);
      const msg='data: '+JSON.stringify({eventType:'UPDATE',new:row})+'\n\n';clients.forEach(c=>{if(isMember(c.email))c.res.write(msg);});}
    const lg={coll:'stockLog',id:txn.id,data:pg({kind:txn.kind,by:me,site:txn.site,items:plan.map(x=>({id:x.m.id,name:x.m.name,before:x.cur,after:x.nq})),ts:txn.ts,applied:true,auth:true}),deleted:false,updated_at:now()};records.set('stockLog\u0001'+txn.id,lg);{const msg='data: '+JSON.stringify({eventType:'INSERT',new:lg})+'\n\n';clients.forEach(c=>{if(isMember(c.email))c.res.write(msg);});}
    if(global.__dropTxn>0){global.__dropTxn--;if(global.__dropThen){NET=global.__dropThen;global.__dropThen=null;}stats.droppedAnswers=(stats.droppedAnswers||0)+1;try{req.socket.destroy();}catch(e){}return;} // applied, but the phone never hears back
    return send(res,200,{duplicate:false,qtys:qtys()});}
  if(p==='/functions/v1/upc'){const em=who(req);if(!isMember(em))return send(res,401,{error:'not allowed'});stats.upc=(stats.upc||0)+1;return send(res,200,{found:false});}
  // ---- test hooks
  if(p==='/__deny'){global.DENY=u.searchParams.get('coll')||'';return send(res,200,{DENY:global.DENY});}
  if(p==='/__stockfail'){global.STOCKFAIL=u.searchParams.get('code')||'22023';return send(res,200,{ok:1});}
  if(p==='/__dropresp'){global.DROPRESP=+(u.searchParams.get('n')||1);return send(res,200,{ok:1});}
  if(p==='/__fail'){global.FAILMSG=u.searchParams.get('msg')||'';global.FAIL=+(u.searchParams.get('code')||0);return send(res,200,{FAIL:global.FAIL});}
  if(p==='/__payloads'){const out=global.PAY||[];if(u.searchParams.get('clear'))global.PAY=[];return send(res,200,out);}
  if(p==='/__state'){return send(res,200,{users:Object.keys(users),records:records.size,colls:[...new Set([...records.values()].map(r=>r.coll))],stats});}
  if(p==='/__records'){const c=u.searchParams.get('coll');return send(res,200,[...records.values()].filter(r=>!c||r.coll===c));}
  if(p==='/__seed'){const b=await body(req);(b.users||[]).forEach(u=>{users[u.email]={id:u.id,pass:u.pass};});(b.rows||[]).forEach(r=>records.set(r.coll+'\u0001'+r.id,{coll:r.coll,id:r.id,data:pg(r.data),deleted:false,updated_at:r.updated_at||now()}));return send(res,200,{ok:1});}
  if(p==='/__droptxn'){global.__dropTxn=+u.searchParams.get('n')||1;global.__dropThen=u.searchParams.get('then')||null;return send(res,200,{ok:1});}
  if(p==='/__reset'){Object.keys(users).forEach(k=>delete users[k]);records.clear();return send(res,200,{ok:1});}
  // ---- static app files
  let f=path.join(ROOT,p==='/'?'index.html':decodeURIComponent(p));if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return send(res,404,{error:'nf'});
  const ext=path.extname(f);const types={'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png','.css':'text/css','.svg':'image/svg+xml'};
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
}).listen(PORT,()=>console.log('fake supabase on',PORT));
