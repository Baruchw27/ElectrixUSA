// Local stand-in for Supabase used only in tests: auth, records table with the same access rules, realtime (SSE), storage.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.join(__dirname,'..');const PORT=+process.argv[2]||8787;
const users={};      // email -> {id,pass}
const tokens={};     // token -> email
const records=new Map(); // coll\u0001id -> row
const blobs={};      // path -> {type,buf}
let clients=[];let PRIVATE=false;      // SSE {res,email}
const now=()=>new Date().toISOString();
// store like Postgres jsonb does: keys re-ordered (shorter first, then alphabetical), so the app must not depend on key order
function pg(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(pg);const o={};Object.keys(v).filter(k=>v[k]!==undefined).sort((a,b)=>a.length-b.length||(a<b?-1:a>b?1:0)).forEach(k=>o[k]=pg(v[k]));return o;}
function uidOf(email){return users[email]&&users[email].id;}
function emps(){return [...records.values()].filter(r=>r.coll==='emps'&&!r.deleted);}
function isMember(email){if(!email)return false;const e=emps();if(!e.length)return true;const uid=uidOf(email);return e.some(r=>r.data.authUid===uid&&!r.data.inactive);}
function myEmp(email){const uid=uidOf(email);const r=emps().find(r=>r.data.authUid===uid);return r?r.id:null;}
function canSee(email,row){if(row.coll!=='keep')return true;const me=myEmp(email);return row.data.owner===me||(row.data.collab||[]).includes(me);}
function isBoss(email){const uid=uidOf(email);return emps().some(r=>r.data.authUid===uid&&!r.data.inactive&&(['owner','manager'].includes(r.data.role)||r.data.all||(r.data.role==='office'&&r.data.title==='Payroll')));}
function body(req){return new Promise(r=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{r(b?JSON.parse(b):{});}catch(e){r({raw:b});}});});}
function send(res,code,obj,type){res.writeHead(code,{'Content-Type':type||'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'});res.end(type?obj:JSON.stringify(obj));}
function who(req){const a=req.headers.authorization||'';const t=a.replace(/^Bearer /,'');return tokens[t]||null;}
const stats={upserts:0,rows:0,pulls:0};
http.createServer(async (req,res)=>{
  const u=new URL(req.url,'http://x');const p=u.pathname;
  if(req.method==='OPTIONS')return send(res,204,{});
  // ---- auth
  if(p==='/auth/signup'){const b=await body(req);const em=b.email.toLowerCase();if(users[em])return send(res,400,{error:'User already registered'});users[em]={id:crypto.randomUUID(),pass:b.password};const tk=crypto.randomUUID();tokens[tk]=em;return send(res,200,{user:{id:users[em].id,email:em,identities:[{}]},token:tk});}
  if(p==='/auth/signin'){const b=await body(req);const em=(b.email||'').toLowerCase();const x=users[em];if(!x||x.pass!==b.password)return send(res,400,{error:'Invalid login credentials'});const tk=crypto.randomUUID();tokens[tk]=em;return send(res,200,{user:{id:x.id,email:em},token:tk});}
  if(p==='/auth/update'){const em=who(req);if(!em)return send(res,401,{error:'no session'});const b=await body(req);users[em].pass=b.password;return send(res,200,{ok:true});}
  if(p==='/auth/user'){const em=who(req);if(!em)return send(res,401,{error:'no session'});return send(res,200,{user:{id:uidOf(em),email:em}});}
  // ---- rpc
  if(p==='/rpc/resolve_login'){const b=await body(req);const q=(b.q||'').trim().toLowerCase();const dig=q.replace(/\D/g,'');const e=emps().map(r=>r.data).filter(d=>!d.inactive);
    const hit=e.find(d=>d.name.toLowerCase()===q)||e.find(d=>(d.email||'').toLowerCase()===q||(d.authEmail||'').toLowerCase()===q||(dig.length>=7&&(d.phone||'').replace(/\D/g,'')===dig)||d.name.toLowerCase().split(' ')[0]===q);return send(res,200,hit?hit.authEmail:null);}
  if(p==='/rpc/no_team_yet'){return send(res,200,emps().length===0);}
  if(p==='/rpc/admin_create_user'||p==='/rpc/setup_owner'){const em=who(req);const b=await body(req);if(p==='/rpc/setup_owner'){if(emps().length)return send(res,400,{error:'already set up'});}else if(!isBoss(em))return send(res,400,{error:'not allowed'});if((b.p_pass||'').length<6)return send(res,400,{error:'password too short'});const e=(b.p_email||'').toLowerCase();if(users[e])users[e].pass=b.p_pass;else users[e]={id:crypto.randomUUID(),pass:b.p_pass};return send(res,200,users[e].id);}
  if(p==='/rpc/admin_set_password'){const em=who(req);if(!isBoss(em))return send(res,400,{error:'not allowed'});const b=await body(req);if((b.p_pass||'').length<6)return send(res,400,{error:'password too short'});const x=users[(b.p_email||'').toLowerCase()];if(!x)return send(res,200,null);x.pass=b.p_pass;return send(res,200,x.id);}
  if(p==='/rpc/save_records'){const em=who(req);if(!em)return send(res,401,{error:'JWT expired'});if(!isMember(em))return send(res,403,{error:'new row violates row-level security policy'});const b=await body(req);const rows=b.rows||[];stats.upserts++;stats.rows+=rows.length;
    for(const r of rows){const k=r.coll+'\u0001'+r.id;const old=records.get(k);let data;
      if(r.deleted)data=r.full||{};else if(r.full)data=r.full;else{data=old&&!old.deleted?Object.assign({},old.data,r.patch||{}):Object.assign({},r.patch||{});(r.unset||[]).forEach(f=>delete data[f]);}
      const row={coll:r.coll,id:r.id,data:pg(data),deleted:!!r.deleted,updated_by:r.by||null,updated_at:now()};
      if(r.coll==='keep'&&!r.deleted&&!old){const me=myEmp(em);if(emps().length&&data.owner!==me)return send(res,403,{error:'new row violates row-level security policy'});}
      records.set(k,row);const msg='data: '+JSON.stringify({eventType:'UPDATE',new:row})+'\n\n';clients.forEach(c=>{if(isMember(c.email)&&canSee(c.email,row))c.res.write(msg);});}
    return send(res,200,rows.map(r=>records.get(r.coll+'\u0001'+r.id)).filter(Boolean).map(r=>({coll:r.coll,id:r.id,data:r.data,deleted:r.deleted})));}
  // ---- records
  if(p==='/records'&&req.method==='GET'){const em=who(req);stats.pulls++;if(!isMember(em))return send(res,200,[]);const from=+u.searchParams.get('from')||0,to=+u.searchParams.get('to')||999;const all=[...records.values()].sort((a,b)=>a.coll<b.coll?-1:a.coll>b.coll?1:a.id<b.id?-1:1);return send(res,200,all.filter(r=>canSee(em,r)).slice(from,to+1));}
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
  // ---- test hooks
  if(p==='/__state'){return send(res,200,{users:Object.keys(users),records:records.size,colls:[...new Set([...records.values()].map(r=>r.coll))],stats});}
  if(p==='/__records'){const c=u.searchParams.get('coll');return send(res,200,[...records.values()].filter(r=>!c||r.coll===c));}
  if(p==='/__seed'){const b=await body(req);(b.users||[]).forEach(u=>{users[u.email]={id:u.id,pass:u.pass};});(b.rows||[]).forEach(r=>records.set(r.coll+'\u0001'+r.id,{coll:r.coll,id:r.id,data:pg(r.data),deleted:false,updated_at:now()}));return send(res,200,{ok:1});}
  if(p==='/__reset'){Object.keys(users).forEach(k=>delete users[k]);records.clear();return send(res,200,{ok:1});}
  // ---- static app files
  let f=path.join(ROOT,p==='/'?'index.html':decodeURIComponent(p));if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory())return send(res,404,{error:'nf'});
  const ext=path.extname(f);const types={'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png','.css':'text/css','.svg':'image/svg+xml'};
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
}).listen(PORT,()=>console.log('fake supabase on',PORT));
