/* Electrix USA — P5 "calm & simple" (Baruch 2026-10-27, after P4): everything a size smaller and easier on the eye;
   the full Electrix logo big and centered on Home only, just the Electrix icon in the top bar; drawn line icons instead
   of emojis everywhere; a shorter bottom bar (5 tabs) with the rest (Jobs, Material, Hours …) as a shortcut row on Home
   and on More. Loaded after p4.js. Turn off with window.EX_P5_OFF = true. */
(function(){
if(window.EX_P5_OFF)return;
const $=id=>document.getElementById(id);
const M=()=>{try{return me();}catch(e){return null;}};
const tt=s=>{try{return typeof t==='function'?t(s):s;}catch(e){return s;}};

/* ───────── 1. Icons: one line-icon set, drawn in the text color ───────── */
const P={
 pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/>',
 mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0M12 17v5"/>',
 warn:'<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
 cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
 cam:'<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
 clip:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>',
 box:'<path d="M21 16V8a2 2 0 00-1-1.7l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.7l7 4a2 2 0 002 0l7-4a2 2 0 001-1.7z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/>',
 up:'<path d="M12 15V3M7 8l5-5 5 5"/><path d="M20 15v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4"/>',
 down:'<path d="M12 3v12M7 10l5 5 5-5"/><path d="M20 15v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4"/>',
 wait:'<path d="M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
 users:'<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8"/><circle cx="9" cy="7" r="4"/>',
 hat:'<path d="M2 18h20M4 18v-3a8 8 0 0116 0v3M10 7V4h4v3"/>',
 attach:'<path d="M21.4 11.1l-9.2 9.2a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5"/>',
 home:'<path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
 car:'<path d="M5 17H3v-5l2-5h14l2 5v5h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/>',
 folder:'<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
 check:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 tool:'<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
 spark:'<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
 note:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 chat:'<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
 bldg:'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>',
 phone:'<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z"/>',
 fuel:'<path d="M3 22V4a2 2 0 012-2h8a2 2 0 012 2v18M3 22h12M7 7h4M15 10h2a2 2 0 012 2v5a2 2 0 004 0V9l-3-3"/>',
 lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
 link:'<path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7"/>',
 plug:'<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0zM12 18v4"/>',
 ruler:'<path d="M21.3 8.7L8.7 21.3a1 1 0 01-1.4 0l-4.6-4.6a1 1 0 010-1.4L15.3 2.7a1 1 0 011.4 0l4.6 4.6a1 1 0 010 1.4zM7.5 10.5l2 2M10.5 7.5l2 2M13.5 4.5l2 2"/>',
 mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
 cup:'<path d="M17 8h1a4 4 0 010 8h-1M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4zM6 2v3M10 2v3M14 2v3"/>',
 star:'<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
 video:'<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M22 8l-6 4 6 4z"/>',
 bolt:'<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
 bell:'<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/>',
 doc:'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
 sound:'<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14"/>',
 stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01"/>',
 dollar:'<path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
 tack:'<path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>',
 bulb:'<path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
 chart:'<path d="M3 3v18h18M7 15v3M12 10v8M17 6v12"/>',
 cart:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6"/>',
 eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
 wifi:'<path d="M5 12.6a10 10 0 0114 0M8.5 16.1a5 5 0 017 0M2 8.8a15 15 0 0120 0M12 20h.01"/>',
 nowifi:'<path d="M1 1l22 22M16.7 11.1a10 10 0 012.3 1.5M5 12.6a10 10 0 015.2-2.5M10.7 5.1A15 15 0 0122 8.8M2 8.8a15 15 0 014.2-2.8M8.5 16.1a5 5 0 017 0M12 20h.01"/>',
 nav:'<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
 trash:'<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>',
 globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 014 10 15 15 0 01-4 10 15 15 0 01-4-10 15 15 0 014-10z"/>',
 right:'<path d="M5 12h14M13 5l7 7-7 7"/>',
 arrowup:'<path d="M12 19V5M5 12l7-7 7 7"/>',
 flag:'<path d="M4 22V4M4 4h12l-2 4 2 4H4"/>',
 key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M14 9l2 2"/>',
 hand:'<path d="M18 11V6a2 2 0 00-4 0v5M14 10V4a2 2 0 00-4 0v6M10 10.5V6a2 2 0 00-4 0v8a8 8 0 0016 0v-3a2 2 0 00-4 0"/>',
 infinity:'<path d="M18.2 8.2a4 4 0 110 7.6c-2.6 0-4.2-3.8-6.2-3.8s-3.6 3.8-6.2 3.8a4 4 0 110-7.6c2.6 0 4.2 3.8 6.2 3.8s3.6-3.8 6.2-3.8z"/>',
 calc:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18h8"/>',
 walk:'<circle cx="13" cy="4" r="2"/><path d="M9 22l2-7 3 3v6M7 12l3-3 3 1 3 3"/>',
};
const DOT=c=>'<svg class="exi" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="'+c+'"/></svg>';
const ico=(n,cls)=>'<svg class="exi'+(cls?' '+cls:'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+P[n]+'</svg>';
window.exIcon=ico;
const MAP={'🔋':'plug','🧯':'warn','🙈':'eye','🏷':'tack','🧪':'bulb','🚫':'warn','❄':'sun','🪜':'tool','🎚':'gear','🌀':'gear','🩹':'tool','♨':'warn','🔥':'warn','🔠':'note','⚖':'ruler','📍':'pin','🎤':'mic','🎙':'mic','⚠':'warn','📅':'cal','🗓':'cal','📆':'cal','📷':'cam','📸':'cam','📋':'clip','📦':'box','📤':'up','📥':'down','⏳':'wait','⌛':'wait',
 '👤':'user','👥':'users','👷':'user','📎':'attach','🏠':'home','🚗':'car','🚐':'car','🚚':'car','📁':'folder','📂':'folder','🗂':'folder','✅':'check','☑':'check',
 '⏰':'clock','🕒':'clock','🕑':'clock','🕘':'clock','🕐':'clock','⏱':'clock','🧰':'tool','🔧':'tool','🛠':'tool','🔩':'tool','🤖':'spark','✨':'spark','🆕':'spark',
 '🔍':'search','🔎':'search','🖼':'image','📝':'note','🗒':'note','✏':'note','🏖':'sun','☀':'sun','🌇':'sun','💬':'chat','🏛':'bldg','🏢':'bldg','🏬':'bldg','🏥':'bldg','🏗':'bldg','🚧':'warn',
 '📞':'phone','📱':'phone','☎':'phone','⛽':'fuel','🔒':'lock','🔐':'lock','🔑':'key','🔗':'link','🧵':'plug','🔌':'plug','🪈':'plug','📐':'ruler','📨':'mail','✉':'mail','📧':'mail',
 '🍽':'cup','☕':'cup','⭐':'star','🎥':'video','🎬':'video','⚡':'bolt','🔔':'bell','🛎':'bell','📢':'bell','📄':'doc','📜':'doc','📕':'doc','📘':'doc','📗':'doc','📖':'doc','🧾':'doc','🗄':'folder',
 '🔊':'sound','⏹':'stop','❓':'help','💲':'dollar','💵':'dollar','💰':'dollar','📌':'tack','💡':'bulb','⚙':'gear','📊':'chart','📈':'chart','🛒':'cart','👁':'eye','📡':'wifi','📶':'wifi','📵':'nowifi',
 '🧭':'nav','🗺':'nav','🗑':'trash','🌐':'globe','🚶':'walk','➜':'right','➤':'right','⬆':'arrowup','🏁':'flag','👋':'hand','♾':'infinity','🧮':'calc','🚨':'warn','🆘':'warn','🚑':'warn'};
const DOTS={'🔴':'#e5483a','🟢':'#2fb36b','🟠':'#e8912d','🟡':'#e6b800','🔵':'#2f80ed','🟣':'#9b51e0','⚪':'#c7c7cc'};
const KEYS=Object.keys(MAP).concat(Object.keys(DOTS)).sort((a,b)=>b.length-a.length).map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
const RX=new RegExp('('+KEYS.join('|')+')\\ufe0f?','g');
const RXT=new RegExp('('+KEYS.join('|')+')');
const SKIP=new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','OPTION','SELECT','svg','SVG','TITLE','CODE','PRE']);
function svgFor(e){return DOTS[e]?DOT(DOTS[e]):ico(MAP[e]);}
function fixText(n){const v=n.nodeValue;if(!v||!RXT.test(v))return;const p=n.parentNode;if(!p||SKIP.has(p.nodeName))return;
  if(p.closest&&p.closest('[contenteditable=""],[contenteditable="true"],.p5keep'))return;
  const span=document.createElement('span');span.className='exis';
  span.innerHTML=v.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])).replace(RX,(m,e)=>svgFor(e));
  p.replaceChild(span,n);}
function stripAttr(el){['placeholder','title','aria-label'].forEach(a=>{const v=el.getAttribute&&el.getAttribute(a);if(v&&RXT.test(v))el.setAttribute(a,v.replace(RX,'').replace(/^\s+/,''));});
  if(el.nodeName==='OPTION'&&RXT.test(el.textContent))el.textContent=el.textContent.replace(RX,'').replace(/^\s+/,'');}
function walk(root){if(!root)return;if(root.nodeType===3){fixText(root);return;}if(root.nodeType!==1||SKIP.has(root.nodeName)&&root.nodeName!=='SELECT'&&root.nodeName!=='OPTION'&&root.nodeName!=='INPUT')return;
  stripAttr(root);if(root.querySelectorAll)root.querySelectorAll('[placeholder],[title],option').forEach(stripAttr);
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);const L=[];let x;while((x=w.nextNode()))if(RXT.test(x.nodeValue))L.push(x);L.forEach(fixText);}
let busy=false;const q=new Set();
const mo=new MutationObserver(ms=>{for(const m of ms){if(m.type==='characterData')q.add(m.target);else m.addedNodes.forEach(n=>q.add(n));if(m.type==='attributes')q.add(m.target);}
  if(!busy){busy=true;queueMicrotask(()=>{busy=false;const L=[...q];q.clear();mo.disconnect();try{L.forEach(n=>{if(n.isConnected)walk(n);});}catch(e){console.error('p5 icons',e);}observe();});}});
function observe(){mo.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','title']});}
P5_init();
function P5_init(){walk(document.body);observe();}

/* ───────── 2. Calm sizes: smaller type, tighter spacing, quieter controls ───────── */
const css=`
.exi{width:1.05em;height:1.05em;vertical-align:-.17em;flex:none;display:inline-block}
.exis{display:inline}
:root{font-size:14px}
body{font-size:14px;-webkit-font-smoothing:antialiased}
h2{font-size:19px!important;letter-spacing:-.2px;margin-bottom:10px}
h3{font-size:15px}
.pg{padding:12px 14px}
.card{border-radius:14px;padding:12px;margin-bottom:8px}
.sec{font-size:11px;margin:14px 0 6px;letter-spacing:.6px}
.btn{font-size:14px;padding:11px 14px;border-radius:12px}
.chip{font-size:13px;padding:6px 12px}
.badge{font-size:11.5px}
.st b{font-size:22px!important}.st span{font-size:11.5px}
.kbt{font-size:14px}.kbm{font-size:11.5px}
/* top bar: just the Electrix icon + small round buttons */
.top{padding:6px 12px!important}
.top .top-row .logo img.exlogo{display:none!important}
.top .top-row .logo .p5mark{width:30px;height:30px;border-radius:8px;display:block;flex:none;filter:none!important;cursor:pointer}
.top .top-row>div:last-child{gap:6px!important}
.top .top-row>div:last-child>button,.top .top-row>div:last-child>.role-sel,.top #roleSel{min-width:34px!important;width:34px;height:34px!important;min-height:34px!important;padding:0!important;border-radius:10px!important;font-size:13px!important;display:flex;align-items:center;justify-content:center}
.top .top-row>div:last-child>button .exi{width:17px;height:17px}
.top .top-row>div:last-child>button#langBtn,.top .top-row>div:last-child>button[onclick*="toggleLang"]{width:auto;padding:0 9px!important;font-weight:700}
.top #roleSel{background-size:17px!important}
#backBtn{height:34px;padding:0 10px!important;font-size:13px!important}
/* bottom bar: 5 tabs, small labels, the current tab in red */
.tabs{padding-top:2px}
.tab{font-size:10.5px!important;padding:7px 2px 6px!important;font-weight:500!important}
.tab svg{width:21px!important;height:21px!important;margin-bottom:1px}
.tab.on{font-weight:600!important;color:var(--blue-mid)!important}
.tab.on::before{width:40px!important;height:26px!important;top:4px!important;border-radius:10px!important}
/* + button a touch smaller */
#p2fab{width:50px!important;height:50px!important}
#p2fab svg{width:24px;height:24px}
/* Home: big centered logo */
#p5hero{display:flex;justify-content:center;padding:18px 0 22px}
#p5hero img{width:min(66%,280px);height:auto;display:block;filter:none!important}
html[data-theme=dark] #p5hero img{content:url(logo-dark.svg)}
#homeBody>.row:first-child h2{font-size:18px!important}
#homeBody>.row:first-child .btn{padding:7px 11px!important;font-size:13px!important;border-radius:10px}
/* shortcuts on Home (things that left the bottom bar) */
#p5short{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 10px}
#p5short button{background:var(--g1);border:none;border-radius:12px;padding:9px 2px 7px;display:flex;flex-direction:column;align-items:center;gap:5px;color:var(--g5);font-family:inherit;font-size:11.5px;font-weight:500;line-height:1.2;cursor:pointer}
#p5short button{background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.07)}
html[data-theme=dark] #p5short button{background:#1c1c1e;box-shadow:none}
#p5short button .exi{width:19px;height:19px;color:var(--blue-mid)}
/* Up next + quick actions + calendar: smaller */
#p4next .tm{font-size:13px!important;min-width:56px!important}
#p4next .what b{font-size:14px!important}
#p4next .what span{font-size:12px!important}
#p4next .kpi b{font-size:17px!important}
#p4next .kpi span{font-size:10.5px!important}
#p4next .p4row{padding:7px 0!important}
.p4qa a,.p4qa button{font-size:10.5px!important;padding:8px 2px 6px!important;border-radius:12px!important;gap:3px!important}
.p4qa svg{width:18px!important;height:18px!important}
#pg-cal .p4nav b{font-size:15px!important}
#pg-cal .p4nav button{width:32px!important;height:32px!important;font-size:16px!important}
#pg-cal .p4nav .td{width:auto!important;font-size:12px!important}
#pg-cal .p4d{aspect-ratio:1/.86!important;font-size:13.5px!important;border-radius:10px!important}
#pg-cal .p4ev{padding:9px 11px!important;border-radius:12px!important}
#pg-cal .p4ev .tm{font-size:13px!important;min-width:56px!important}
#pg-cal .p4ev .what b{font-size:13.5px!important;font-weight:600}
#pg-cal .p4ev .what span{font-size:12px!important}
#pg-cal .p4dayhd b{font-size:14.5px!important}
#pg-cal .p4dayhd .add button{padding:6px 10px!important;font-size:12px!important}
#m-folder #fdTitle>div:nth-child(2){font-size:19px!important}
/* Home lists, job page, tabs: one notch smaller */
.gpcard{font-size:13.5px}
.gpcard>.row b{font-size:15px!important}
.gprow{padding:7px 0!important}
.gprow>div{font-size:14px}
#homeBody .tile h3{font-size:13.5px}
#homeBody .btn{font-size:13px}
#fdTitle .btn.gr,#fdTitle .btn{padding:9px 12px!important;font-size:14px!important;border-radius:12px!important}
.p2tabs button{font-size:12.5px!important;padding:6px 11px!important}
#m-folder .card,#m-folder .tile{font-size:13.5px}
/* Tasks page + More page: tighter */
.kbt{font-size:14px!important}.kbm{font-size:11.5px!important}.kbh{font-size:14px!important}
.st{padding:8px 6px!important}.st b{font-size:20px!important}
#pg-jobs .row .btn,#pg-jobs .bsel{font-size:13px!important;padding:7px 11px!important}
.mg{padding:11px 4px 9px!important;font-size:12px!important;border-radius:12px!important}
.mg svg{width:22px!important;height:22px!important;display:block;margin:0 auto 5px!important}
.more-grid{gap:8px!important}
/* inline big text across the app, one notch down (not form fields: phones zoom in on small fields) */
html:not(.p2crew) [style*="font-size:17px"]:not(input):not(select):not(textarea){font-size:15px!important}
html:not(.p2crew) [style*="font-size:16px"]:not(input):not(select):not(textarea){font-size:14.5px!important}
html:not(.p2crew) [style*="font-size:18px"]:not(input):not(select):not(textarea){font-size:16px!important}
html:not(.p2crew) [style*="font-size:20px"]:not(input):not(select):not(textarea),html:not(.p2crew) [style*="font-size:22px"]:not(input):not(select):not(textarea){font-size:18px!important}
.fold{padding:9px 12px!important;gap:10px!important}
.fold .fic{width:30px!important;height:30px!important;border-radius:8px!important}
.fold .fic svg{width:17px;height:17px}
/* the Simple (crew) mode keeps its big sizes */
html.p2crew body{font-size:16px}
`;
const st=document.createElement('style');st.id='p5css';st.textContent=css;document.body.appendChild(st);

/* ───────── 3. Top bar: Electrix icon instead of the long logo ───────── */
function mark(){const lg=document.querySelector('.top .top-row .logo');if(lg&&!lg.querySelector('.p5mark')){const im=document.createElement('img');im.className='p5mark';im.src='icon-192.png';im.alt='Electrix';im.onclick=()=>{try{goTab(primaryFor(me())[0]);}catch(e){}};const old=lg.querySelector('img.exlogo');lg.insertBefore(im,old||null);}}
mark();
// Schedule had the same calendar picture as Calendar; it gets its own (a crew board)
function schedIcon(){document.querySelectorAll('.tab').forEach(b=>{if((b.getAttribute('onclick')||'').indexOf("'sched'")>-1){const v=b.querySelector('svg');if(v&&!v.dataset.p5){v.dataset.p5='1';v.innerHTML='<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 5h7M14 9h5M14 16h7M14 20h5"/>';}}});}
schedIcon();

/* ───────── 4. Shorter bottom bar: 5 tabs; the rest goes to Home shortcuts and More ───────── */
try{if(typeof PRIMARY==='object'){
  PRIMARY.owner=['home','jobs','cal','sched','more'];
  PRIMARY.all=['home','jobs','cal','sched','more'];
  PRIMARY.manager=['home','jobs','sched','punch','more'];
  PRIMARY.office=['jobs','cal','trello','mat','more'];
}}catch(e){}
const SHORT=['sites','orr','mat','hours','team','exp','est','svc','rep','tools','code','trello','msg','punch','sched','cal','jobs','van'];
const SICON={orr:'bolt',sites:'pin',mat:'box',hours:'clock',team:'users',exp:'dollar',est:'ruler',svc:'phone',rep:'chart',tools:'tool',code:'calc',trello:'clip',msg:'chat',punch:'clock',sched:'cal',cal:'cal',jobs:'check',van:'car'};
function allowedTabs(){return [...document.querySelectorAll('.tab')].filter(b=>b.dataset.allowed==='1').map(b=>((b.getAttribute('onclick')||'').match(/'([a-z]+)'/)||[])[1]).filter(Boolean);}
function shortcuts(m){const prim=primaryFor(m);const al=allowedTabs();const L=SHORT.filter(n=>al.includes(n)&&!prim.includes(n)).slice(0,8);if(!L.length)return '';
  return '<div id="p5short">'+L.map(n=>'<button onclick="goTab(\''+n+'\')">'+ico(SICON[n]||'folder')+esc5(tt((TABMETA[n]||[])[1]||n))+'</button>').join('')+'</div>';}
const esc5=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(typeof window.renderHome==='function'){const _rh=window.renderHome;window.renderHome=function(){const r=_rh.apply(this,arguments);try{const m=M();const el=$('homeBody');if(m&&el){
    if(!$('p5hero')){const h=document.createElement('div');h.id='p5hero';h.innerHTML='<img src="logo-light.svg" alt="Electrix">';el.insertBefore(h,el.firstChild);}
    if(!$('p5short')){const s=shortcuts(m);if(s){const d=document.createElement('div');d.innerHTML=s;const nx=$('p4next');const anchor=nx?nx.nextSibling:(el.children[2]||null);el.insertBefore(d.firstChild,anchor);}}
  }}catch(e){console.error('p5 home',e);}return r;};}
// after the role or bars change, redraw the bar with the new short list
try{const prim=primaryFor(M());document.querySelectorAll('.tab').forEach(b=>{const nn=((b.getAttribute('onclick')||'').match(/'([a-z]+)'/)||[])[1];if(b.dataset.allowed==='1'&&!b.classList.contains('on'))b.style.display=prim.includes(nn)?'':'none';});}catch(e){}
})();
