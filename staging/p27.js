/* p27 — Baruch 11/23: "the second you open the notification, it drives you straight to OwnTracks".
   The two tracker messages (8 AM "Good morning — make sure OwnTracks is open" and the 1-hour "OwnTracks has not sent your
   location") carry link {tab:'punch', ot:true}. Tapping one opens the Electrix app (a phone only lets a notification open the
   app that sent it), and this file sends him on into OwnTracks right away:
     Android → intent to org.owntracks.android (its main screen; not installed → Play Store)
     iPhone  → owntracks:/// (OwnTracks' own link; just opens it)
   A phone can block opening another app without a tap — then a big "Open OwnTracks" button is already on the screen: one tap.
   The sheet closes by itself once OwnTracks is in front (the app goes to the background). Spanish + dark mode. */
(function(){
if(window.EX_P27_OFF)return;
const ua=navigator.userAgent||'';
const isIOS=/iPhone|iPad|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isAnd=/Android/i.test(ua);
const URL_AND='intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=org.owntracks.android;end';
const URL_IOS='owntracks:///';
const url=()=>isIOS?URL_IOS:isAnd?URL_AND:null;
const es=()=>{try{return lang()==='es';}catch(e){return false;}};
const L={t:['Open OwnTracks','Abrir OwnTracks'],s:['Leave it open all day — do not swipe it closed.','Déjelo abierto todo el día — no lo cierre deslizando hacia arriba.'],
  b:['Open OwnTracks','Abrir OwnTracks'],c:['Close','Cerrar'],n:['OwnTracks is not on this phone. Ask the office to set it up.','OwnTracks no está en este teléfono. Pida a la oficina que lo instale.']};
const T=k=>L[k][es()?1:0];
const E=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sheet=null;
function close(){try{if(sheet){sheet.remove();sheet=null;}}catch(e){}}
function show(){close();const u=url();
  sheet=document.createElement('div');sheet.id='p27ot';
  sheet.setAttribute('style','position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center');
  sheet.innerHTML='<div class="card" role="dialog" aria-modal="true" aria-labelledby="p27h" style="width:100%;max-width:520px;margin:0;border-radius:18px 18px 0 0;padding:22px 18px calc(18px + env(safe-area-inset-bottom));text-align:center">'
   +'<div style="font-size:40px;line-height:1">🛰</div><h3 id="p27h" style="margin:8px 0 4px;font-size:19px">'+E(T('t'))+'</h3>'
   +'<div style="font-size:14px;color:var(--g4);margin-bottom:16px">'+E(u?T('s'):T('n'))+'</div>'
   +(u?'<a id="p27go" href="'+E(u)+'" style="display:block;background:var(--blue-mid,#d93a2b);color:#fff;text-decoration:none;font-weight:700;font-size:17px;padding:15px;border-radius:12px">'+E(T('b'))+'</a>':'')
   +'<button id="p27x" type="button" style="font:inherit;background:none;border:0;color:var(--g4);padding:12px;margin-top:6px;font-size:15px">'+E(T('c'))+'</button></div>';
  document.body.appendChild(sheet);
  sheet.querySelector('#p27x').onclick=close;
  sheet.onclick=e=>{if(e.target===sheet)close();};
  return u;}
let lastOpen=0;
function open(){if(Date.now()-lastOpen<4000)return;lastOpen=Date.now();const u=show();if(!u)return;
  // try at once — the tap on the notification is usually enough for the phone to allow it; if not, the button is there
  setTimeout(()=>{try{window.P27.go(u);}catch(e){}},150);}
window.P27={open,close,url,go:u=>{location.href=u;}};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')close();});
// hook the notification tap (P15.openPush is what every tap goes through: the app open, closed, or opened without the address)
const hook=()=>{try{const P=window.P15;if(!P||!P.openPush)return false;if(P.openPush.__p27)return true;const o=P.openPush;
  const w=function(id,link,msg){const r=o.apply(this,arguments);try{if(link&&link.ot)setTimeout(open,350);}catch(e){}return r;};w.__p27=1;P.openPush=w;return true;}catch(e){return false;}};
// and every way a message is opened by its id (cold start from a notification, the bell list in the app): window.nGo
const hook2=()=>{try{const g=window.nGo;if(typeof g!=='function'||g.__p27)return typeof g==='function';
  const w=function(id){const r=g.apply(this,arguments);try{const x=(D.inbox||[]).find(n=>n.id===id);if(x&&x.link&&x.link.ot)setTimeout(open,350);}catch(e){}return r;};
  w.__p27=1;window.nGo=w;try{nGo=w;}catch(e){}return true;}catch(e){return false;}};
let n=0;const iv=setInterval(()=>{const a=hook(),b=hook2();if((a&&b)||++n>60)clearInterval(iv);},100);hook();hook2();
})();
