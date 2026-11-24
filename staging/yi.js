/* yi.js — Baruch 11/23: Yiddish (ייִדיש) for Baruch only. The owner's language button cycles English → ייִדיש → Español;
   everyone else keeps English / Español as before. me().lang = 'yi'. Every t('…') phrase looks in YI (below, yi_words.js);
   a phrase with no Yiddish yet shows in English. The screens turn right-to-left. Server messages stay English for him. */
(function(){
window.YI=window.YI||{};
const isOwner=()=>{try{const m=me();return !!m&&m.role==='owner';}catch(e){return false;}};
// translate: Yiddish first when he picked it, else the old English / Spanish rule
const _t=window.t;
const t2=function(s){try{if(lang()==='yi'){const v=window.YI[s];return v!=null?v:s;}}catch(e){}return _t(s);};
window.t=t2;try{t=t2;}catch(e){}
// the language button: owner cycles en → yi → es → en; everyone else en ⇄ es as before
const _tl=window.toggleLang;
const tl2=function(){if(!isOwner())return _tl.apply(this,arguments);const m=me();const L=lang();m.lang=L==='en'?'yi':L==='yi'?'es':'en';save();renderAll();};
window.toggleLang=tl2;try{toggleLang=tl2;}catch(e){}
const _al=window.applyLang;
const al2=function(){const r=_al.apply(this,arguments);try{const L=lang();const yi=L==='yi';
    document.documentElement.dir=yi?'rtl':'ltr';document.documentElement.lang=yi?'yi':L;document.body.classList.toggle('yi',yi);
    const b=document.getElementById('langBtn');if(b&&isOwner())b.textContent=L==='en'?'ייִ':L==='yi'?'ES':'EN';}catch(e){}return r;};
window.applyLang=al2;try{applyLang=al2;}catch(e){}
// right-to-left fixes: icons and arrows that point "forward" flip; numbers, times, phone numbers and addresses stay left-to-right
const css=document.createElement('style');css.textContent=
 'html[dir=rtl] body{font-family:-apple-system,"Segoe UI","Noto Sans Hebrew","Arial Hebrew",Arial,sans-serif}'
+'html[dir=rtl] input[type=time],html[dir=rtl] input[type=number],html[dir=rtl] input[type=tel],html[dir=rtl] input[type=date]{direction:ltr;text-align:right}'
+'html[dir=rtl] .n,html[dir=rtl] .num{direction:ltr;unicode-bidi:isolate}'
// each line takes its direction from its own first letter: Yiddish lines read right-to-left, addresses / times / names
// ("14 Dorset Rd", "8:00 AM – 3:30 PM") stay in the right order
+'html[dir=rtl] body *{unicode-bidi:plaintext}'
// the round buttons on the side move to the left, so they don't cover names (the text now starts on the right)
+'html[dir=rtl] #p8pin{right:auto!important;left:max(14px,env(safe-area-inset-left,0px))!important}'
+'html[dir=rtl] #p2fab{right:auto!important;left:max(16px,env(safe-area-inset-left,0px))!important}'
+'html[dir=rtl] #p7fm{right:auto!important;left:calc(max(16px,env(safe-area-inset-left,0px)) + 68px)!important}'
+'html[dir=rtl] .p11newwrap{left:calc(max(16px,env(safe-area-inset-left,0px)) + 68px)!important;right:16px!important}';
document.head.appendChild(css);
try{applyLang();}catch(e){}
})();
