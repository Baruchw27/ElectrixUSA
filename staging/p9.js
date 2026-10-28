/* Electrix USA — P9 calm Home options (Baruch 2026-10-27 22:28: "show me all options, I will select").
   Each idea is a switch: html class "o1" … "o18". window.P9_ON lists the ones that are on for everyone
   (empty until Baruch picks). Off: window.EX_P9_OFF. */
(function(){
if(window.EX_P9_OFF)return;
const $=id=>document.getElementById(id);
// Baruch 22:44 picked: 1–10, 13, 14, 15, 16 (17 and 18 not now)
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
html.o13 .p7c:not([data-k=att]):not([data-k=tasks]):not(.p9bad) .bd{display:none!important}
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
/* Baruch 22:57: the glass buttons go along the bottom (next to ☰ and +), not up the side —
   one frosted glass bar (like the new iPhone tab bar) so the names stay readable over the page */
#p8pin{right:auto!important;left:max(12px,env(safe-area-inset-left,0px))!important;bottom:calc(14px + env(safe-area-inset-bottom,0px))!important;
  width:calc(100% - 24px - 140px);height:60px;flex-direction:row!important;justify-content:space-around!important;align-items:center!important;gap:0!important;padding:0 4px;border-radius:30px;
  background:linear-gradient(160deg,rgba(255,255,255,.82),rgba(255,255,255,.58));-webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);
  border:1px solid rgba(255,255,255,.85);box-shadow:0 8px 24px rgba(0,0,0,.14),inset 0 1px 1px rgba(255,255,255,.95)}
html[data-theme=dark] #p8pin{background:linear-gradient(160deg,rgba(70,70,78,.72),rgba(36,36,40,.6));border-color:rgba(255,255,255,.18);box-shadow:0 8px 24px rgba(0,0,0,.5),inset 0 1px 1px rgba(255,255,255,.2)}
#p8pin .g{width:auto!important;flex:1;gap:1px!important}
#p8pin .ball{width:30px!important;height:30px!important;background:none!important;border:none!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
#p8pin .ball::after{display:none!important}
#p8pin .ball svg{width:22px!important;height:22px!important}
#p8pin .lab{font-size:10px!important}
#p8pin .n{top:-4px!important;right:-8px!important}
html.p2crew #p8pin{width:calc(100% - 24px - 72px)}
body:has(#pg-home.on) #homeBody{padding-bottom:96px!important}
/* 18 one action spot: the + goes into the ☰ */
html.o18 #p2fab{display:none!important}
html.o18 #p7fm{right:max(16px,env(safe-area-inset-right,0px))!important}
`;
const st=document.createElement('style');st.id='p9css';st.textContent=css;document.body.appendChild(st);
function apply(){const h=document.documentElement;for(let i=1;i<=18;i++)h.classList.toggle('o'+i,window.P9_ON.includes(i)||h.classList.contains('o'+i)&&window.__p9keep);
  try{// 13: a section with a problem stays open
    document.querySelectorAll('#homeBody .p7c').forEach(c=>c.classList.toggle('p9bad',!!c.querySelector('.pill.bad,.p7warn,.n.r')));}catch(e){}
  try{document.querySelectorAll('#homeBody .p7c[data-k=att] .p7r').forEach(r=>{const d=r.querySelector('span');r.classList.toggle('p9red',!!d&&/d93a2b/.test(d.getAttribute('style')||''));});}catch(e){}
  try{// 17: the pinned buttons move under the greeting
    const p=$('p8pin'),hb=$('homeBody');if(p&&hb){if(h.classList.contains('o17')){const d=$('p7date');const at=d&&d.nextSibling;if(p.parentNode!==hb)hb.insertBefore(p,at||hb.firstChild);}else if(p.parentNode!==document.body)document.body.appendChild(p);}}catch(e){}}
window.P9={apply,set(L){window.P9_ON=L.slice();window.__p9keep=false;apply();}};
if(typeof window.renderHome==='function'){const _rh=window.renderHome;window.renderHome=function(){const r=_rh.apply(this,arguments);try{apply();}catch(e){}return r;};}
apply();
})();
