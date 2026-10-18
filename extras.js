/* Real-app extras: phone notifications, in-app file viewer (incl. Trello files), AI features via the server. */
(function(){
const CFG=window.EX_CFG||{};
const fnUrl=n=>CFG.url.replace(/\/$/,'')+'/functions/v1/'+n;
async function authHeaders(){const s=window.EX_sb?(await EX_sb.auth.getSession()).data.session:null;return Object.assign({apikey:CFG.anonKey},s?{Authorization:'Bearer '+s.access_token}:{});}

// ---------- AI: same interface the app already uses inside Claude ----------
if(CFG.url&&CFG.ai&&!(window.claude&&window.claude.use)){
  const b64=blob=>new Promise(res=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.readAsDataURL(blob);});
  async function run(input,opts){opts=opts||{};const messages=typeof input==='string'?[{role:'user',content:input}]:input;
    const images=[];for(const im of (opts.images||[]).slice(0,20))images.push({type:im.type||'image/jpeg',data:await b64(im)});
    const r=await fetch(fnUrl('ai'),{method:'POST',headers:Object.assign({'Content-Type':'application/json'},await authHeaders()),body:JSON.stringify({messages,images,tier:opts.modelTier}),signal:opts.signal});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw {code:r.status===429?'rate_limited':'error',message:j.error||('HTTP '+r.status)};
    if(opts.onText)try{opts.onText({text:j.text,delta:j.text});}catch(e){}return {text:j.text,truncated:!!j.truncated};}
  const sample=(i,o)=>run(i,o);
  sample.json=async(i,o)=>{const r=await run(i,o);const s=r.text.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();const a=s.indexOf('{')>=0&&(s.indexOf('[')<0||s.indexOf('{')<s.indexOf('['))?s.slice(s.indexOf('{'),s.lastIndexOf('}')+1):s.slice(s.indexOf('['),s.lastIndexOf(']')+1);try{return JSON.parse(a);}catch(e){throw {code:'invalid_json',message:'invalid json',text:r.text};}};
  sample.limits=async()=>({images:{maxCount:20}});
  window.claude={use:async n=>n==='sample'?sample:null};
}

// ---------- phone notifications ----------
function urlB64(s){const p='='.repeat((4-s.length%4)%4);const b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from([...b].map(c=>c.charCodeAt(0)));}
window.EX_pushOn=async function(ask){try{
  if(!CFG.vapid||!('serviceWorker' in navigator)||!('PushManager' in window)||typeof me!=='function'||!me())return 'unsupported';
  let perm=Notification.permission;if(perm==='default'&&ask)perm=await Notification.requestPermission();if(perm!=='granted')return perm;
  const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64(CFG.vapid)});
  const j=sub.toJSON();const id=me().id+'_'+(j.endpoint||'').slice(-24).replace(/[^a-z0-9]/gi,'');
  D.push=D.push||[];const ex=D.push.find(x=>x.id===id);if(!ex||JSON.stringify(ex.sub)!==JSON.stringify(j)){if(ex)ex.sub=j;else D.push.push({id,who:me().id,sub:j,ts:Date.now(),ua:navigator.userAgent.slice(0,80)});save();}
  return 'granted';}catch(e){console.warn('push',e);return 'error';}};

// ---------- in-app viewer ----------
window.EX_view=function(src,name,kind){let o=document.getElementById('exViewer');if(!o){o=document.createElement('div');o.id='exViewer';o.style.cssText='position:fixed;inset:0;z-index:700;background:#111;display:flex;flex-direction:column';document.body.appendChild(o);}
  // only real files get shown: no web pages or scripts (they could act as the app); everything is escaped
  const e=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  src=String(src||'');const dl=(/^(blob:|https:|data:)/.test(src)&&!/["'<>\s]/.test(src))?src:'';   // download link: any real file
  if(!/^(blob:|https:|data:(image|application\/pdf|audio|video)\/?)/.test(src)||/["'<>\s]/.test(src))src='';  // shown on screen: pictures and PDFs only
  const isImg=kind==='img'||/^image\//.test(kind||'')||/\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(name||src);
  const isPdf=/pdf/i.test(kind||'');   // by the file's real type, not its name
  const fname=String(name||'file').replace(/[\\/:*?"<>|]/g,'_');
  o.innerHTML='<div style="display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top)) 12px 10px;color:#fff"><button onclick="EX_closeView()" style="border:0;background:#333;color:#fff;border-radius:10px;padding:9px 14px;font-size:15px">‹ '+e(typeof t==='function'?t('Back'):'Back')+'</button><div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px">'+e(name||'')+'</div>'+(dl?'<a href="'+e(dl)+'" download="'+e(fname)+'" style="color:#fff;text-decoration:none;background:#333;border-radius:10px;padding:9px 12px;font-size:14px">⬇</a>':'')+'</div>'
   +(!src?'<div style="color:#ccc;padding:20px;font-size:15px">'+e(typeof t==='function'?t('Tap ⬇ to download and open this file.'):'Tap ⬇ to download and open this file.')+'</div>'
     :isImg?'<div style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center"><img src="'+e(src)+'" style="max-width:100%;max-height:100%"></div>'
     :isPdf?'<iframe src="'+e(src)+'" style="flex:1;border:0;background:#fff;width:100%"></iframe>'
     :'<div style="color:#ccc;padding:20px;font-size:15px">'+e(typeof t==='function'?t('Tap ⬇ to download and open this file.'):'Tap ⬇ to download and open this file.')+'</div>');
  o.style.display='flex';try{history.pushState({exv:1},'');}catch(e){}};
window.EX_closeView=function(){const o=document.getElementById('exViewer');if(o){o.style.display='none';o.innerHTML='';}};
window.addEventListener('popstate',()=>{const o=document.getElementById('exViewer');if(o&&o.style.display!=='none')EX_closeView();});

// ---------- Trello files open inside the app ----------
window.EX_openTrello=async function(f){if(!CFG.trello){window.open(f.url,'_blank','noopener');return;}
  try{if(typeof toast==='function')toast('⏳ '+t('Opening')+' '+f.name);const r=await fetch(fnUrl('trello')+'?file='+encodeURIComponent(f.url),{headers:await authHeaders()});if(!r.ok)throw new Error('HTTP '+r.status);
    const blob=await r.blob();const u=URL.createObjectURL(blob);EX_view(u,f.name,blob.type);}
  catch(e){toast('⚠ '+t('Could not open the Trello file')+' — '+(e.message||''));window.open(f.url,'_blank','noopener');}};

// ---------- Face ID / fingerprint lock: every time the app opens ----------
const LK='ex_faceid';
function lockRec(){try{return JSON.parse(localStorage.getItem(LK)||'null');}catch(e){return null;}}
const b64u=buf=>btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64u=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4)),c=>c.charCodeAt(0));
window.EX_lockAvailable=async function(){try{return !!(window.PublicKeyCredential&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());}catch(e){return false;}};
window.EX_lockOn=()=>{const r=lockRec();return !!r&&typeof me==='function'&&me()&&r.user===window.EX_ME;};
window.EX_lockEnroll=async function(){const m=(D.emps||[]).find(e=>e.id===window.EX_ME);if(!m)return false;
  try{const cred=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:'Electrix USA'},user:{id:new TextEncoder().encode(m.id),name:m.name,displayName:m.name},
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'preferred'},hints:['client-device'],timeout:60000}});
    localStorage.setItem(LK,JSON.stringify({cred:b64u(cred.rawId),user:m.id}));return true;}catch(e){console.warn('faceid enroll',e);return false;}};
window.EX_lockOff=function(){try{localStorage.removeItem(LK);}catch(e){}};
let unlocked=false,hiddenAt=0,fails=0;
function lockScreen(msg){let o=document.getElementById('exLock');if(!o){o=document.createElement('div');o.id='exLock';o.style.cssText='position:fixed;inset:0;z-index:950;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center';document.body.appendChild(o);}
  const dark=document.documentElement.dataset.theme==='dark';o.style.background=dark?'#000':'#fff';o.style.color=dark?'#f2f2f7':'#1F1E2A';
  o.innerHTML='<img src="'+(dark?'logo-dark.svg':'logo-light.svg')+'" style="height:42px"><div style="font-size:15px;opacity:.7">'+(msg||'')+'</div>'
   +'<button id="exUnlock" style="border:0;background:#1F1E2A;color:#fff;font-size:17px;font-weight:600;padding:15px 26px;border-radius:14px;min-width:240px">🔒 '+(typeof t==='function'?t('Unlock with Face ID'):'Unlock with Face ID')+'</button>'
   +'<button id="exUnlockPw" style="border:0;background:none;color:#D53C36;font-size:14px;text-decoration:underline">'+(typeof t==='function'?t('Use my password instead'):'Use my password instead')+'</button>';
  document.getElementById('exUnlock').onclick=()=>EX_unlock();document.getElementById('exUnlockPw').onclick=()=>{try{EX_lockOff();}catch(e){}window.EX_logout&&EX_logout().then(()=>location.reload());};}
window.EX_lock=function(){if(!EX_lockOn())return;unlocked=false;lockScreen('');setTimeout(()=>EX_unlock(true),350);};
window.EX_unlock=async function(auto){const r=lockRec();if(!r)return;try{await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),allowCredentials:[{type:'public-key',id:unb64u(r.cred),transports:['internal']}],hints:['client-device'],userVerification:'required',timeout:60000}});
    unlocked=true;const o=document.getElementById('exLock');if(o)o.remove();}
  catch(e){fails++;const gone=e&&(e.name==='NotAllowedError'||e.name==='InvalidStateError'||e.name==='SecurityError');
    if(fails>=2||(gone&&!auto&&fails>=1)){lockScreen((typeof t==='function'?t('Face ID is not working on this phone. Sign in with your password — you can turn Face ID on again after.'):'Use your password'));const b=document.getElementById('exUnlock');if(b)b.style.display='none';const pw=document.getElementById('exUnlockPw');if(pw){pw.style.cssText='border:0;background:#1F1E2A;color:#fff;font-size:17px;font-weight:600;padding:15px 26px;border-radius:14px;min-width:240px';}return;}
    if(!auto)lockScreen(typeof t==='function'?t('Face ID did not work. Try again.'):'Try again');}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenAt=Date.now();}else if(hiddenAt&&Date.now()-hiddenAt>60000&&EX_lockOn()){EX_lock();}});
})();

// ---------- logo follows light / dark mode (iPhone ignores the CSS swap) ----------
(function(){function swap(){const dark=document.documentElement.getAttribute('data-theme')==='dark';const want=dark?'logo-dark.svg':'logo-light.svg';
  document.querySelectorAll('img.exlogo,#loginLogo').forEach(i=>{if(i.id==='loginLogo'&&!/logo-(light|dark)\.svg|^data:/.test(i.getAttribute('src')||''))return;if(!(i.getAttribute('src')||'').endsWith(want))i.setAttribute('src',want);});}
  try{new MutationObserver(swap).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});}catch(e){}
  document.addEventListener('DOMContentLoaded',swap);setTimeout(swap,0);setTimeout(swap,1500);})();

// ---------- stay up to date: when a new version is published, reload quietly (never while typing or in a window) ----------
(function(){let pending=false;
  function busy(){const a=document.activeElement;if(a&&(a.tagName==='TEXTAREA'||(a.tagName==='INPUT'&&a.value)))return true;if(document.querySelector('.ov:not(.hid),.xpk,#exViewer[style*="flex"]'))return true;if(window.EX_mic&&window.EX_mic.on)return true;return false;}
  async function check(){if(!window.EX_VER||!navigator.onLine)return;try{const r=await fetch('version.json?'+Date.now(),{cache:'no-store'});if(!r.ok)return;const j=await r.json();if(!j.v||j.v===window.EX_VER)return;
      let tried='';try{tried=sessionStorage.getItem('ex_upd')||'';}catch(e){}if(tried===j.v)return; // never loop
      if(busy()){pending=true;return;}try{sessionStorage.setItem('ex_upd',j.v);}catch(e){}location.reload();}catch(e){}}
  window.EX_checkVersion=check;
  setTimeout(check,4000);setInterval(()=>{if(document.visibilityState==='visible')check();},180000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
  setInterval(()=>{if(pending&&!busy()){pending=false;check();}},5000);
})();

// ---------- private files: give the background helper the sign-in pass (it never leaves the phone) ----------
(function(){if(!('serviceWorker' in navigator))return;const CFG=window.EX_CFG||{};
  async function pass(){try{const s=window.EX_sb?(await EX_sb.auth.getSession()).data.session:null;return {token:s?s.access_token:null,anon:CFG.anonKey||''};}catch(e){return {token:null,anon:CFG.anonKey||''};}}
  navigator.serviceWorker.addEventListener('message',async ev=>{const d=ev.data||{};if(d.type==='ex-pass?'&&ev.ports&&ev.ports[0])ev.ports[0].postMessage(await pass());});
  async function push(){try{const p=await pass();const reg=await navigator.serviceWorker.ready;(navigator.serviceWorker.controller||reg.active)&&(navigator.serviceWorker.controller||reg.active).postMessage(Object.assign({type:'ex-pass'},p));}catch(e){}}
  let hooked=false;const hook=()=>{if(hooked||!window.EX_sb)return;hooked=true;try{EX_sb.auth.onAuthStateChange(()=>push());}catch(e){}push();};
  setTimeout(hook,500);setInterval(()=>{hook();push();},10*60*1000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')push();});
})();
