// Minimal supabase-js look-alike that talks to test/fakeserver.js (tests only)
(function(){
function createClient(url,key,opts){const base=url.replace(/\/$/,'');const persist=!(opts&&opts.auth&&opts.auth.persistSession===false);const sk=(opts&&opts.auth&&opts.auth.storageKey)||'sb';
  let sess=null;try{if(persist)sess=JSON.parse(localStorage.getItem(sk)||'null');}catch(e){}
  const subs=[];
  const setSess=s=>{sess=s;if(persist){try{s?localStorage.setItem(sk,JSON.stringify(s)):localStorage.removeItem(sk);}catch(e){}}subs.forEach(f=>f(s?'SIGNED_IN':'SIGNED_OUT',s));};
  const H=()=>Object.assign({'Content-Type':'application/json'},sess?{Authorization:'Bearer '+sess.access_token}:{});
  async function call(path,body,method){const r=await fetch(base+path,{method:method||'POST',headers:H(),body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json().catch(()=>null);if(!r.ok)return {data:null,error:{message:(j&&(j.error||j.message))||('HTTP '+r.status),code:j&&j.code}};return {data:j,error:null};}
  const auth={
    async getSession(){return {data:{session:sess}};},
    onAuthStateChange(f){subs.push(f);return {data:{subscription:{unsubscribe(){}}}};},
    async signUp({email,password}){const r=await call('/auth/signup',{email,password});if(r.error)return {data:{user:null},error:r.error};if(persist)setSess({access_token:r.data.token,user:r.data.user});return {data:{user:r.data.user,session:null},error:null};},
    async signInWithPassword({email,password}){const r=await call('/auth/signin',{email,password});if(r.error)return {data:{},error:r.error};setSess({access_token:r.data.token,user:r.data.user});return {data:{user:r.data.user,session:sess},error:null};},
    async signOut(){setSess(null);return {error:null};},
    async getUser(){if(!sess)return {data:{user:null}};return {data:{user:sess.user}};},
    async setSession({access_token}){setSess({access_token,user:null});const r=await call('/auth/user',undefined,'GET');if(r.error){setSess(null);return {data:{},error:r.error};}sess.user=r.data.user;setSess(sess);return {data:{user:r.data.user,session:sess},error:null};},
    async updateUser({password}){const r=await call('/auth/update',{password});return {data:{},error:r.error};}
  };
  function from(table){const q={_range:[0,999]};
    q.select=()=>q;q.range=(a,b)=>{q._range=[a,b];return q;};q.order=()=>q;q.gt=(c,v)=>{q._after=v;return q;};q._f=[];q.eq=(c,v)=>{q._f.push(r=>r[c]===v);return q;};q.in=(c,vs)=>{q._f.push(r=>vs.includes(r[c]));return q;};
    q.then=(ok,bad)=>call('/records?from='+(q._f.length?0:q._range[0])+'&to='+(q._f.length?99999:q._range[1])+(q._after?'&after='+encodeURIComponent(q._after):''),undefined,'GET').then(r=>{if(r.data&&q._f.length)r.data=r.data.filter(x=>q._f.every(f=>f(x)));return r;}).then(ok,bad);
    q.upsert=(rows)=>call('/records',rows);
    return q;}
  async function rpc(name,args){return call('/rpc/'+name,args);}
  let channel=function(){const ch={_h:null,on(ev,filter,h){ch._h=h;return ch;},subscribe(cb){const tk=sess?sess.access_token:'';const es=new EventSource(base+'/realtime?token='+encodeURIComponent(tk));es.onopen=()=>cb&&cb('SUBSCRIBED');es.onmessage=e=>{try{ch._h(JSON.parse(e.data));}catch(x){console.warn(x);}};es.onerror=()=>cb&&cb('CHANNEL_ERROR');ch._es=es;return ch;}};return ch;}
  const storage={from(bucket){return {async upload(path,blob,o){const r=await fetch(base+'/storage/upload/'+path,{method:'POST',headers:Object.assign({'Content-Type':(o&&o.contentType)||'application/octet-stream'},sess?{Authorization:'Bearer '+sess.access_token}:{}),body:blob});return r.ok?{data:{path},error:null}:{data:null,error:{message:'upload failed'}};},getPublicUrl(path){return {data:{publicUrl:base+'/storage/v1/object/public/files/'+path}};}};}};
  const chans=[];const ch0=channel;channel=function(){const c=ch0();chans.push(c);return c;};
  async function removeAllChannels(){chans.splice(0).forEach(c=>{try{c._es&&c._es.close();}catch(e){}});return [];}
  const functions={async invoke(name,o){return call('/functions/v1/'+name,(o&&o.body)||{});}};
  return {auth,from,rpc,functions,get channel(){return channel;},storage,removeAllChannels};}
window.supabase={createClient};
})();
