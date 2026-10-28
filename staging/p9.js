/* Electrix USA — P9 calm Home options (Baruch 2026-10-27 22:28: "show me all options, I will select").
   Each idea is a switch: html class "o1" … "o18". window.P9_ON lists the ones that are on for everyone
   (empty until Baruch picks). Off: window.EX_P9_OFF. */
(function(){
if(window.EX_P9_OFF)return;
const $=id=>document.getElementById(id);
// Baruch 22:44 picked: 1–10, 13, 14, 15, 16 (17 and 18 not now)
// H07: 18 (hide the "+" button) stays OFF until the + actions also live in the ☰ menu — Baruch: "17 and 18 not now"
// Baruch 10/28 19:35: the time clock is not set up yet — off for the field (nothing is deleted; set true to bring it back)
window.EX_FIELD_CLOCK=false;
try{if(typeof window.noClock==='function'){const _nc=window.noClock;window.noClock=function(e){return _nc(e)||(window.EX_FIELD_CLOCK===false&&!!e&&e.role==='worker');};try{noClock=window.noClock;}catch(x){}}}catch(e){}
window.P9_ON=window.P9_ON||[1,2,3,4,5,6,7,8,9,10,13,14,15,16];
const css=`
/* 1 numbers in one dark color */
html.o1 .p7nums b{color:var(--g5)!important}
html[data-theme=dark].o1 .p7nums b{color:#fff!important}
/* 2 no colored squares behind card icons */
html.o2 .p7c .p7h .ic{background:none!important;color:var(--g4)!important;width:18px!important}
/* 3 counts gray unless urgent */
html.o3 .p7c .p7h .n:not(.r){background:none!important;color:var(--g4)!important;font-weight:600!important}
/* 4 quiet tags */
html.o4 .p7tag{background:none!important;color:var(--g4)!important;padding:0!important;font-weight:600!important}
/* 5 no green pills — red only for a problem */
html.o5 .p7r .pill.ok,html.o5 .p7r .pill.am{background:none!important;color:var(--g4)!important;font-weight:600!important}
/* 6 meeting times in dark text */
html.o6 .p7r .tm{color:var(--g5)!important}
html[data-theme=dark].o6 .p7r .tm{color:#fff!important}
/* 7 gray date icon */
html.o7 #p7date .cal i{background:var(--g4)!important}
/* 8 one rule everywhere: black/white/gray, red = urgent, blue = links (on Home: the others together + gray dots for "should handle") */
html.o8 .p7c[data-k=att] .p7r>span:first-child[style*="e8912d"]{background:var(--g3)!important}
/* 9 no boxes — one page, section titles, thin lines */
html.o9 .p7c{background:none!important;box-shadow:none!important;border-radius:0!important;border-top:1px solid var(--g2);margin-bottom:4px!important}
html.o9 .p7c .p7h{padding-left:0!important;padding-right:0!important}
html.o9 .p7c .bd{padding-left:0!important;padding-right:0!important}
html.o9 .p7c .p7h b{text-transform:uppercase;font-size:11.5px!important;letter-spacing:.6px;color:var(--g4)}
/* 10 no number row */
html.o10 .p7nums{display:none!important}
/* 11 small one-line greeting */
html.o11 #p7date .cal{display:none!important}
html.o11 #p7date>span:nth-child(2){display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
html.o11 #p7date h2{font-size:15px!important;font-weight:600!important}
html.o11 #p7date .d{font-size:12.5px!important}
/* 12 three lines per section */
html.o12 .p7c .bd>.p7r:nth-of-type(n+4){display:none!important}
/* 13 quiet sections start closed (only problems open) */
html.o13 .p7c:not([data-k=att]):not([data-k=tasks]):not([data-k=myjob]):not([data-k=myjobT]):not(.p9bad):not(.p9open) .bd{display:none!important}
/* H10: a tap on the title opens a quiet section (and closes it again) */
html.o13 .p7c.p9open.fold .bd{display:none!important}
/* 14 no arrows */
html.o14 .p7c .p7h .ch,html.o14 .p7r .chev,html.o14 .p7c[data-k=att] .p7r>span:last-child,html.o14 #p7date .go{display:none!important}
/* 15 "not in yet" as a normal row */
html.o15 .p7warn{background:none!important;border-radius:0!important;padding:6px 0!important;margin:0!important;color:#c0392b!important;border-top:1px solid var(--g1)}
/* 16 more breathing room */
html.o16 .p7c{margin-bottom:18px!important}
html.o16 .p7r{padding:8px 0!important}
/* 17 glass buttons in one row under the logo */
html.o17 #p8pin{position:static!important;flex-direction:row!important;justify-content:space-between;margin:0 0 14px;width:100%}
html.o17 #p8pin .g{width:auto;flex:1}
body:has(#pg-home.on) html.o17 #homeBody .p7c,html.o17 #homeBody .p7c,html.o17 #homeBody .p7nums,html.o17 #homeBody #p7date{margin-right:0!important}
/* Baruch 22:49: no lines between rows or sections — just space */
html.o9 #homeBody .p7r,html.o9 #homeBody .p7more,html.o9 #homeBody .p7warn{border-top:none!important}
html.o9 #homeBody .p7c{border-top:none!important;margin-bottom:14px!important}
html.o9 #homeBody .p7c .p7h{padding-bottom:2px!important}
/* Baruch 22:51: Needs action compact again — small chips side by side, tap one to go there */
#homeBody .p7c[data-k=att] .bd{display:flex!important;flex-wrap:wrap;gap:6px;padding-bottom:4px!important}
#homeBody .p7c[data-k=att].fold .bd{display:none!important}
#homeBody .p7c[data-k=att] .p7r{display:inline-flex!important;flex:none;padding:5px 10px!important;gap:6px;border:none!important;border-radius:999px;background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.12);font-size:12.5px;max-width:100%}
html[data-theme=dark] #homeBody .p7c[data-k=att] .p7r{background:#232326}
#homeBody .p7c[data-k=att] .p7r .w{flex:none;white-space:nowrap}
#homeBody .p7c[data-k=att] .p7r>span:first-child{width:6px!important;height:6px!important}
#homeBody .p7c[data-k=att] .p7r>span:last-child{display:none}
#homeBody .p7c[data-k=att] .p7r.p9red{box-shadow:none;background:#d93a2b14;color:#c0392b;font-weight:600}
/* Baruch 23:05: counts sit right next to their title / line, not out on the right edge (under the glass buttons) */
#homeBody .p7c .p7h b{flex:0 1 auto!important}
#homeBody .p7c .p7h .n{margin-right:auto}
#homeBody .p7c:not([data-k=att]) .p7r.one .w{flex:0 1 auto!important}
#homeBody .p7c:not([data-k=att]) .p7r.one .pill{margin-right:auto;margin-left:2px}
/* Baruch 23:13: the ☰ ball is the same size as the other 4, with its name under it */
html.o18 body #p7fm{width:50px!important;height:50px!important;right:calc(max(14px,env(safe-area-inset-right,0px)) + 6px)!important;bottom:calc(30px + env(safe-area-inset-bottom,0px))!important;overflow:visible}
html.o18 #p7fm svg{width:21px!important;height:21px!important}
html.o18 #p7fm::after{content:attr(data-lab);position:absolute;top:53px;left:50%;transform:translateX(-50%);font-size:10.5px;font-weight:600;color:var(--g5);white-space:nowrap}
html[data-theme=dark].o18 #p7fm::after{color:#fff}
html.o18 #p7fm.p8x::after{display:none}
html.o18 #p8pin{bottom:calc(98px + env(safe-area-inset-bottom,0px))!important}
/* Baruch 23:09: no count next to "Crews today / tomorrow" — the "No job" lines already say it */
#homeBody .p7c[data-k=crews] .p7h .n,#homeBody .p7c[data-k=crewsT] .p7h .n{display:none!important}
/* 18 one action spot: the + goes into the ☰ */
html.o18 #p2fab{display:none!important}
html.o18 #p7fm{right:max(16px,env(safe-area-inset-right,0px))!important}
`;
const st=document.createElement('style');st.id='p9css';st.textContent=css;document.body.appendChild(st);
function apply(){const h=document.documentElement;for(let i=1;i<=18;i++)h.classList.toggle('o'+i,window.P9_ON.includes(i)||h.classList.contains('o'+i)&&window.__p9keep);
  try{// 13: a section with a problem stays open
    document.querySelectorAll('#homeBody .p7c').forEach(c=>c.classList.toggle('p9bad',!!c.querySelector('.pill.bad,.p7warn,.n.r')));
    // H10: a quiet section the person opened stays open (remembered per section)
    document.querySelectorAll('#homeBody .p7c').forEach(c=>{let o=false;try{o=localStorage.getItem('p9o_'+c.dataset.k)==='1';}catch(e){}c.classList.toggle('p9open',o);});}catch(e){}
  try{document.querySelectorAll('#homeBody .p7c[data-k=att] .p7r').forEach(r=>{const d=r.querySelector('span');r.classList.toggle('p9red',!!d&&/d93a2b/.test(d.getAttribute('style')||''));});}catch(e){}
  try{// 17: the pinned buttons move under the greeting
    const p=$('p8pin'),hb=$('homeBody');if(p&&hb){if(h.classList.contains('o17')){const d=$('p7date');const at=d&&d.nextSibling;if(p.parentNode!==hb)hb.insertBefore(p,at||hb.firstChild);}else if(p.parentNode!==document.body)document.body.appendChild(p);}}catch(e){}}
function fmLab(){const b=$('p7fm');if(b)b.setAttribute('data-lab',typeof tt==='function'?tt('Settings'):typeof t==='function'?t('Settings'):'Settings');}   // M01: same name everywhere
try{fmLab();}catch(e){}
if(typeof window.applyTabs==='function'){const _a9=window.applyTabs;window.applyTabs=function(){
  // Baruch 10/28 00:10: with no bottom bar every bar button is hidden, so the old "your page's button is hidden → go Home"
  // check sent people back to Home each time new data arrived. Now only a page the person is NOT allowed to see sends them back.
  const on=[...document.querySelectorAll('.tab.on')];on.forEach(b=>b.classList.remove('on'));
  let r;try{r=_a9.apply(this,arguments);}finally{on.forEach(b=>b.classList.add('on'));}
  try{fmLab();}catch(e){}
  try{const m=me();const who=m&&m.id;if(who&&window.__p9who&&window.__p9who!==who&&typeof goTab==='function')goTab((typeof primaryFor==='function'&&primaryFor(m)[0])||'home');window.__p9who=who;}catch(e){}   // a different person signed in → their start page
  return r;};}
window.P9={apply,set(L){window.P9_ON=L.slice();window.__p9keep=false;apply();}};
// H10: with "quiet sections start closed" on, tapping a section title opens it (tap again to close)
if(window.P7&&typeof P7.fold==='function'){const _fold=P7.fold;P7.fold=function(k){const c=document.querySelector('#homeBody .p7c[data-k="'+k+'"]');
  if(c&&document.documentElement.classList.contains('o13')&&k!=='att'&&k!=='tasks'&&!c.classList.contains('p9bad')){const o=!c.classList.contains('p9open');
    c.classList.toggle('p9open',o);c.classList.remove('fold');try{localStorage.setItem('p9o_'+k,o?'1':'0');localStorage.setItem('p7f_'+k,'0');}catch(e){}return;}
  return _fold.apply(this,arguments);};}
if(typeof window.renderHome==='function'){const _rh=window.renderHome;window.renderHome=function(){const r=_rh.apply(this,arguments);try{apply();}catch(e){}return r;};}
apply();
// first screen is drawn with everything loaded → show the app (index.html hides it until now)
try{const h=$('pg-home');if(h&&h.classList.contains('on'))renderHome();}catch(e){}
requestAnimationFrame(()=>requestAnimationFrame(()=>document.documentElement.classList.remove('exboot')));
})();
