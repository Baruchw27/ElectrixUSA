// Minimal supabase-js look-alike that talks to test/fakeserver.js (tests only)
(function(){
function createClient(url,key,opts){const base=url.replace(/\/$/,'');const persist=!(opts&&opts.auth&&opts.auth.persistSession===false);const sk=(opts&&opts.auth&&opts.auth.storageKey)||'sb';
  let sess=null;try{if(persist)sess=JSON.parse(localStorage.getItem(sk)||'null');}catch(e){}
  const subs=[];
  const setSess=s=>{sess=s;if(persist){try{s?localStorage.setItem(sk,JSON.stringify(s)):localStorage.removeItem(sk);}catch(e){}}subs.forEach(f=>f(s?'SIGNED_IN':'SIGNED_OUT',s));};
  const H=()=>Object.assign({'Content-Type':'application/json'},sess?{Authorization:'Bearer '+sess.access_token}:{});
  async function call(path,body,method){const r=await fetch(base+path,{method:method||'POST',headers:H(),body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json().catch(()=>null);if(!r.ok)return {data:null,error:{message:(j&&j.error)||('HTTP '+r.status)}};return {data:j,error:null};}
  const auth={
    async getSession(){return {data:{session:sess}};},
    onAuthStateChange(f){subs.push(f);return {data:{subscription:{unsubscribe(){}}}};},
    async signUp({email,password}){const r=await call('/auth/signup',{email,password});if(r.error)return {data:{user:null},error:r.error};if(persist)setSess({access_token:r.data.token,user:r.data.user});return {data:{user:r.data.user,session:null},error:null};},
    async signInWithPassword({email,password}){const r=await call('/auth/signin',{email,password});if(r.error)return {data:{},error:r.error};setSess({access_token:r.data.token,user:r.data.user});return {data:{user:r.data.user,session:sess},error:null};},
    async signOut(){setSess(null);return {error:null};},
    async getUser(){if(!sess)return {data:{user:null}};return {data:{user:sess.user}};},
    async updateUser({password}){const r=await call('/auth/update',{password});return {data:{},error:r.error};}
  };
  function from(table){const q={_range:[0,999]};
    q.select=()=>q;q.range=(a,b)=>{q._range=[a,b];return q;};q.order=()=>q;
    q.then=(ok,bad)=>call('/records?from='+q._range[0]+'&to='+q._range[1],undefined,'GET').then(ok,bad);
    q.upsert=(rows)=>call('/records',rows);
    return q;}
  async function rpc(name,args){return call('/rpc/'+name,args);}
  function channel(){const ch={_h:null,on(ev,filter,h){ch._h=h;return ch;},subscribe(cb){const tk=sess?sess.access_token:'';const es=new EventSource(base+'/realtime?token='+encodeURIComponent(tk));es.onopen=()=>cb&&cb('SUBSCRIBED');es.onmessage=e=>{try{ch._h(JSON.parse(e.data));}catch(x){console.warn(x);}};es.onerror=()=>cb&&cb('CHANNEL_ERROR');ch._es=es;return ch;}};return ch;}
  const storage={from(bucket){return {async upload(path,blob,o){const r=await fetch(base+'/storage/upload/'+path,{method:'POST',headers:Object.assign({'Content-Type':(o&&o.contentType)||'application/octet-stream'},sess?{Authorization:'Bearer '+sess.access_token}:{}),body:blob});return r.ok?{data:{path},error:null}:{data:null,error:{message:'upload failed'}};},getPublicUrl(path){return {data:{publicUrl:base+'/storage/v1/object/public/files/'+path}};}};}};
  return {auth,from,rpc,channel,storage};}
window.supabase={createClient};
})();
