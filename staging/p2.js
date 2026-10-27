/* Electrix USA — P2 add-ons (Baruch 2026-10-27): one "+" button everywhere, swipe on tasks, job page in tabs,
   photo gallery per job, stage colors everywhere, bulk actions on tasks, task templates, talk-instead-of-type,
   big-text crew mode, duplicate job warning, unread count on the app icon, act-from-alert (done / reply).
   Loaded after the app. Everything here builds on the app's own functions (openJob, openMat, markDone, doRe …),
   so the same rules and database checks apply. Turn it all off with window.EX_P2_OFF = true before this file loads. */
(function(){
if(window.EX_P2_OFF)return;
const $=id=>document.getElementById(id);
const P2=window.P2={sel:new Set(),selMode:false,showSnz:false,tab:'over',tabSite:null};
const ES2={"New":"Nuevo","Task":"Tarea","Material":"Material","Meeting":"Reunión","Note":"Nota","Photo":"Foto","Say it":"Dilo",
 "Say what you need":"Di lo que necesitas","Listening…":"Escuchando…","Tap when you're done":"Toca cuando termines","Done":"Listo",
 "Use this":"Usar esto","Try again":"Otra vez","Cancel":"Cancelar","Pick the job":"Elige el trabajo","Search address":"Buscar dirección",
 "Done ✓":"Hecho ✓","Tomorrow":"Mañana","Snoozed until tomorrow":"Pospuesto hasta mañana","snoozed until tomorrow":"pospuestas hasta mañana",
 "Show":"Mostrar","Hide":"Ocultar","Select":"Elegir","selected":"elegidas","Move":"Mover","Send":"Enviar","Move to list":"Mover a la lista",
 "Send to":"Enviar a","Mark done":"Marcar hecho","Overview":"Resumen","Files & photos":"Archivos y fotos","Notes":"Notas","Settings":"Ajustes",
 "Photos":"Fotos","No photos yet.":"Todavía no hay fotos.","Templates":"Plantillas","Save as template":"Guardar como plantilla",
 "Template name":"Nombre de la plantilla","Saved":"Guardado","Possible duplicate jobs":"Posibles trabajos duplicados","Not a duplicate":"No es duplicado",
 "Open":"Abrir","Simple mode":"Modo simple","Big buttons, only what you need":"Botones grandes, solo lo necesario","On":"Sí","Off":"No",
 "Speech is not available on this phone — type it instead.":"La voz no funciona en este teléfono — escríbelo.","What you said":"Lo que dijiste",
 "We'll fill in the form — check it and tap Save.":"Llenamos el formulario — revísalo y toca Guardar.","Mark these done?":"¿Marcar estas como hechas?",
 "tasks":"tareas","Swipe right = done · left = tomorrow":"Desliza a la derecha = hecho · izquierda = mañana"};
const tt=k=>{try{return (typeof lang==='function'&&lang()==='es'&&ES2[k])?ES2[k]:(typeof t==='function'?t(k):k);}catch(e){return k;}};
const ICON={plus:'<path d="M12 5v14M5 12h14"/>',task:'<path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
 mat:'<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.3 7l8.7 5 8.7-5M12 22V12"/>',
 meet:'<circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/>',note:'<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/>',
 cam:'<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
 mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0014 0v-1M12 18v4"/>'};
const svg=(k,s)=>'<svg width="'+(s||22)+'" height="'+(s||22)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+ICON[k]+'</svg>';
const M=()=>{try{return me();}catch(e){return null;}};
const tint=k=>(window.STAGE_TINT&&STAGE_TINT[k])||({upcoming:'#8e8e93',ready:'#2f80ed',active:'#d9822b',roughdone:'#27ae60',inspection:'#9b51e0',done:'#6e6e73'})[k]||'#8e8e93';

// ───────── styles ─────────
const css=`
#p2fab{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(74px + env(safe-area-inset-bottom,0px));width:56px;height:56px;border-radius:50%;border:none;background:#d93a2b;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(217,58,43,.35),0 2px 6px rgba(0,0,0,.2);z-index:110;cursor:pointer}
#p2fab[hidden]{display:none!important}
#p2fab:active{transform:scale(.94)}
.p2ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:120;display:flex;align-items:flex-end}
.p2ov[hidden]{display:none!important}
.p2sheet{width:100%;background:var(--g0,#f2f2f7);border-radius:20px 20px 0 0;padding:14px 16px calc(22px + env(safe-area-inset-bottom,0px));max-height:85vh;overflow:auto}
html[data-theme=dark] .p2sheet{background:#111114;color:#f2f2f7}
.p2sheet .hd{width:36px;height:5px;background:#c7c7cc;border-radius:3px;margin:0 auto 12px}
.p2sheet h3{margin:0 0 4px;font-size:18px}
.p2ctx{font-size:12.5px;color:var(--g4);margin-bottom:12px}
.p2grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.p2act{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 6px;border:none;border-radius:14px;background:#fff;color:var(--g5,#2c3347);font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 0 0 .5px rgba(0,0,0,.08)}
html[data-theme=dark] .p2act{background:#1c1c1e;color:#f2f2f7;box-shadow:0 0 0 .5px rgba(255,255,255,.1)}
.p2act span.ic{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center}
.p2act.say{grid-column:1/-1;flex-direction:row;justify-content:center;gap:10px;padding:14px;font-size:15px;background:#d93a2b;color:#fff;box-shadow:none}
.p2list{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.p2list button{text-align:left;border:none;background:#fff;border-radius:12px;padding:11px 12px;font-size:14px;color:inherit;cursor:pointer}
html[data-theme=dark] .p2list button{background:#1c1c1e}
.p2swipe{position:relative;touch-action:pan-y}
.p2swbg{position:absolute;inset:0;border-radius:inherit;display:flex;align-items:center;padding:0 16px;font-weight:700;font-size:14px;color:#fff;pointer-events:none;opacity:0;transition:opacity .1s}
.p2hint{font-size:11.5px;color:var(--g4);text-align:center;margin:4px 0 8px}
.p2snz{font-size:13px;color:var(--g4);text-align:center;margin:10px 0}
.p2snz a{color:var(--blue-mid);cursor:pointer}
.kbcard.p2on,.card.p2on{box-shadow:0 0 0 2px #d93a2b!important}
.kbcard{position:relative}
.kbcard .p2chk{position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:50%;border:2px solid var(--g3);background:transparent}
.kbcard.p2on .p2chk{background:#d93a2b;border-color:#d93a2b}
.kbcard.p2on .p2chk::after{content:'';position:absolute;left:6px;top:2px;width:5px;height:10px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
#p2bar{position:fixed;left:0;right:0;bottom:calc(64px + env(safe-area-inset-bottom,0px));z-index:61;padding:0 max(12px,env(safe-area-inset-left,0px));display:flex;justify-content:center}
#p2bar[hidden]{display:none!important}
#p2bar .in{display:flex;gap:6px;align-items:center;background:#1c1c1e;color:#fff;border-radius:16px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:520px;width:100%}
#p2bar b{flex:1;padding-left:8px;font-size:14px}
#p2bar button{border:none;border-radius:10px;padding:9px 11px;font-size:13px;font-weight:600;background:#2c2c2e;color:#fff;cursor:pointer}
#p2bar button.go{background:#27ae60}
.p2tabs{display:flex;gap:6px;overflow-x:auto;margin:6px 0 12px;padding-bottom:2px;position:sticky;top:-18px;z-index:3;background:inherit}
.p2tabs button{flex:none;border:none;border-radius:999px;padding:8px 13px;font-size:13px;font-weight:600;background:#fff;color:var(--g5);cursor:pointer;box-shadow:0 0 0 .5px rgba(0,0,0,.1)}
html[data-theme=dark] .p2tabs button{background:#1c1c1e;color:#f2f2f7}
.p2tabs button.on{background:#23242c;color:#fff;box-shadow:none}
html[data-theme=dark] .p2tabs button.on{background:#f2f2f7;color:#111}
#m-folder [data-p2t]{}
#m-folder.p2t-over [data-p2t]:not([data-p2t~="over"]),#m-folder.p2t-files [data-p2t]:not([data-p2t~="files"]),#m-folder.p2t-notes [data-p2t]:not([data-p2t~="notes"]),#m-folder.p2t-set [data-p2t]:not([data-p2t~="set"]){display:none!important}
.p2gal{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:4px 0 12px}
.p2gal img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;background:var(--g2)}
.p2gd{font-size:12px;font-weight:600;color:var(--g4);margin:10px 0 4px;text-transform:uppercase;letter-spacing:.3px}
.p2tpl{display:flex;gap:6px;overflow-x:auto;margin:8px 0 2px;padding-bottom:4px}
.p2tpl .chip{flex:none;font-size:12.5px;padding:6px 11px;cursor:pointer}
.p2dup{border-radius:14px;padding:12px 13px;margin:0 0 10px;background:#fff8e6;color:#7a4a00}
html[data-theme=dark] .p2dup{background:#2a2410;color:#f5c26b}
.p2dup .r{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:7px 0;border-top:1px solid rgba(0,0,0,.08);font-size:13px}
.p2dup .r:first-of-type{border-top:none}
.p2dup button{border:none;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;cursor:pointer;background:rgba(0,0,0,.08);color:inherit}
html.p2crew body{font-size:17px}
html.p2crew .btn{padding:18px;font-size:19px;border-radius:14px}
html.p2crew .tab{font-size:12px}
html.p2crew .tab svg{width:26px;height:26px}
html.p2crew h2{font-size:26px}
html.p2crew .card,html.p2crew .tile{padding:16px}
html.p2crew .chip{font-size:15px;padding:9px 15px}
.p2say{font-size:20px;line-height:1.4;min-height:80px;padding:14px;border-radius:14px;background:#fff;margin:10px 0}
html[data-theme=dark] .p2say{background:#1c1c1e}
.p2pulse{width:72px;height:72px;border-radius:50%;background:#d93a2b;color:#fff;display:flex;align-items:center;justify-content:center;margin:8px auto;animation:p2p 1.2s infinite}
@keyframes p2p{0%{box-shadow:0 0 0 0 rgba(217,58,43,.5)}100%{box-shadow:0 0 0 22px rgba(217,58,43,0)}}
@media (prefers-reduced-motion:reduce){.p2pulse{animation:none}}
`;
const st=document.createElement('style');st.id='p2css';st.textContent=css;document.head.appendChild(st);

// ───────── shared bottom sheet ─────────
function sheet(html){let o=$('p2ov');if(!o){o=document.createElement('div');o.id='p2ov';o.className='p2ov';o.hidden=true;o.onclick=e=>{if(e.target===o)closeSheet();};document.body.appendChild(o);}
  o.innerHTML='<div class="p2sheet" role="dialog"><div class="hd"></div>'+html+'</div>';o.hidden=false;fabSync();}
function closeSheet(){const o=$('p2ov');if(o)o.hidden=true;stopListen();fabSync();}
P2.closeSheet=closeSheet;

// ───────── 1. one "+" button everywhere ─────────
const fab=document.createElement('button');fab.id='p2fab';fab.setAttribute('aria-label','New');fab.innerHTML=svg('plus',28);fab.hidden=true;fab.onclick=()=>openFab();document.body.appendChild(fab);
function anyOpen(){if([...document.querySelectorAll('div.ov[id^="m-"]')].some(o=>!o.classList.contains('hid')&&o.id!=='m-folder'))return true;const pv=$('pv');if(pv&&!pv.hidden)return true;const o=$('p2ov');if(o&&!o.hidden)return true;return false;}
function fabSync(){const m=M();const login=$('m-login');const signed=m&&!(login&&!login.classList.contains('hid'));fab.hidden=!signed||anyOpen()||P2.selMode||document.documentElement.classList.contains('p2crew');}
setInterval(()=>{fabSync();try{navUpdate();}catch(e){}},400);
function ctxSite(){try{const f=$('m-folder');if(f&&!f.classList.contains('hid')&&typeof fdSite!=='undefined'&&fdSite)return fdSite;}catch(e){}return null;}
function canTask(m){return m&&(m.role!=='worker'||!!m.lead);}
function openFab(){const m=M();if(!m)return;const sid=ctxSite();const sn=sid?siteName(sid):'';
  const acts=[];
  if(canTask(m))acts.push(['task',tt('Task'),'#2f80ed','P2.newTask()']);
  try{if(canRequestMat(m))acts.push(['mat',tt('Material'),'#d9822b','P2.newMat()']);}catch(e){}
  try{if(canBook(m))acts.push(['meet',tt('Meeting'),'#9b51e0','P2.newMeet()']);}catch(e){}
  acts.push(['note',tt('Note'),'#c9a227','P2.newNote()']);
  acts.push(['cam',tt('Photo'),'#27ae60','P2.newPhoto()']);
  sheet('<h3>'+tt('New')+'</h3><div class="p2ctx">'+(sn?'📍 '+esc(sn):'&nbsp;')+'</div><div class="p2grid">'
    +'<button class="p2act say" onclick="P2.say()">'+svg('mic',22)+tt('Say it')+'</button>'
    +acts.map(a=>'<button class="p2act" onclick="'+a[3]+'"><span class="ic" style="background:'+a[2]+'22;color:'+a[2]+'">'+svg(a[0])+'</span>'+esc(a[1])+'</button>').join('')+'</div>');}
P2.openFab=openFab;
function setSel(id,v){const e=$(id);if(e){e.value=v;try{e.dispatchEvent(new Event('change',{bubbles:true}));}catch(x){}}}
P2.newTask=(desc,site)=>{const sid=site||ctxSite();closeSheet();openJob();setTimeout(()=>{if(sid)setSel('jSite',sid);if(desc){const d=$('jDesc');d.value=desc;try{parseVoice(desc,true);}catch(e){}if(sid)setSel('jSite',sid);}},60);};
P2.newMat=(items,site)=>{const sid=site||ctxSite();closeSheet();openMat();setTimeout(()=>{if(sid){setSel('mtSite',sid);const f=$('mtSiteFind');if(f)f.value=siteName(sid);}if(items){const ta=$('mtItems');if(ta)ta.value=items;}},120);};
P2.newMeet=(title,site)=>{const sid=site||ctxSite();closeSheet();openMeet();setTimeout(()=>{if(title)$('meTitle').value=title;if(sid){try{meShowMore();}catch(e){}setSel('meSite',sid);}},80);};
P2.newNote=()=>{const sid=ctxSite();closeSheet();try{if(sid)kNewSite=sid;}catch(e){}try{kNew('text');}catch(e){openKeep();}};
P2.newPhoto=()=>{const sid=ctxSite();if(sid){closeSheet();const c=$('fdCam');c.value='';c.click();return;}pickJob(id=>{openFolder(id);setTimeout(()=>{const c=$('fdCam');c.value='';c.click();},250);});};
function pickJob(cb){P2._pick=cb;sheet('<h3>'+tt('Pick the job')+'</h3><input id="p2q" type="search" placeholder="🔍 '+esc(tt('Search address'))+'" oninput="P2.pickDraw()" style="font-size:16px;margin-top:6px"><div class="p2list" id="p2pl"></div>');P2.pickDraw();setTimeout(()=>{const q=$('p2q');if(q)q.focus();},100);}
P2.pickDraw=()=>{const q=($('p2q')||{}).value||'';let L=[];try{L=(q.trim()&&siteMatch(q))||visSites().filter(s=>['active','roughdone','inspection','ready'].includes(s.stage||'active'));}catch(e){L=[];}
  $('p2pl').innerHTML=L.slice(0,25).map(s=>'<button onclick="P2._picked(\''+jsq(s.id)+'\')"><i class="stdot" style="background:'+tint(s.stage||'active')+'"></i>'+esc(s.name)+'</button>').join('');};
P2._picked=id=>{closeSheet();const cb=P2._pick;P2._pick=null;if(cb)cb(id);};

// ───────── 8. talk instead of type (round 2) ─────────
let rec=null,heard='';
function stopListen(){try{if(rec){rec.onend=null;rec.stop();}}catch(e){}rec=null;}
P2.say=()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;heard='';
  if(!SR){sheet('<h3>'+tt('Say what you need')+'</h3><div class="p2ctx">'+tt('Speech is not available on this phone — type it instead.')+'</div><textarea id="p2txt" style="font-size:17px;height:110px" placeholder="Tell Menachem 20 AFCI breakers for Maple Ridge"></textarea><div style="display:flex;gap:8px;margin-top:10px"><button class="btn" onclick="P2.useText(document.getElementById(\'p2txt\').value)">'+tt('Use this')+'</button><button class="btn sec2" style="width:auto;padding:12px 16px" onclick="P2.closeSheet()">'+tt('Cancel')+'</button></div>');return;}
  sheet('<h3>'+tt('Say what you need')+'</h3><div class="p2ctx">“Tell Menachem 20 AFCI breakers for Maple Ridge” · “Dile a Yossi revisar el panel en Dunn Rd”</div><div class="p2pulse" onclick="P2.sayDone()">'+svg('mic',30)+'</div><div class="p2say" id="p2heard">'+tt('Listening…')+'</div><div style="display:flex;gap:8px"><button class="btn" onclick="P2.sayDone()">'+tt('Done')+'</button><button class="btn sec2" style="width:auto;padding:12px 16px" onclick="P2.closeSheet()">'+tt('Cancel')+'</button></div>');
  try{rec=new SR();rec.lang=(typeof lang==='function'&&lang()==='es')?'es-US':'en-US';rec.interimResults=true;rec.continuous=true;
    rec.onresult=e=>{let s='';for(let i=0;i<e.results.length;i++)s+=e.results[i][0].transcript;heard=s;const h=$('p2heard');if(h)h.textContent=s;};
    rec.onerror=()=>{};rec.onend=()=>{rec=null;if(heard.trim())P2.useText(heard);};rec.start();}catch(e){toast(tt('Speech is not available on this phone — type it instead.'));}};
P2.sayDone=()=>{const r=rec;rec=null;try{if(r)r.stop();}catch(e){}setTimeout(()=>{if(heard.trim())P2.useText(heard);},250);};
// figure out what was said: material request, meeting, or a task — then open that form already filled in
P2.parse=function(text){const raw=String(text||'').trim();const low=raw.toLowerCase();
  let site=null;try{const m=low.match(/(?:\bfor\b|\bat\b|\bpara\b|\ben\b)\s+(.+)$/);const q=m?m[1]:raw;const r=siteMatch(q);if(r&&r.length)site=r[0].id;}catch(e){}
  let who=null;try{who=(D.emps||[]).find(e=>e.name&&!e.inactive&&new RegExp('\\b'+e.name.split(' ')[0].toLowerCase()+'\\b').test(low));}catch(e){}
  const matWords=/\b(breakers?|romex|wire|cable|boxes|box|lights?|recessed|switch(es)?|outlets?|receptacles?|plates?|panel|conduit|pipe|connectors?|staples|gfci|afci|cajas?|luces|interruptor(es)?|cable|tubo|breaker)\b/;
  const isMeet=/^(meeting|set (up )?a meeting|reuni[oó]n)\b/.test(low);
  const isMat=!isMeet&&(/^(i )?need\b|^necesito\b|^material\b/.test(low)||(who&&who.role==='office'&&who.title==='Material')||(/\b\d+\b/.test(low)&&matWords.test(low)));
  // the words that describe the thing itself (drop "tell X", "for <job>")
  let body=raw.replace(/^(please\s+)?(tell|ask|send( it)? to|dile a|p[ií]dele a|decirle a)\s+\S+\s*(to\s+)?/i,'').replace(/^(i\s+)?need\s+/i,'').replace(/^necesito\s+/i,'').replace(/^(meeting|reuni[oó]n)\s*(with|con)?\s*/i,'');
  body=body.replace(/\s+(for|at|para|en)\s+[^,]+$/i,'').trim();
  return {kind:isMeet?'meet':isMat?'mat':'task',who:who?who.id:null,site,body:body||raw,raw};};
P2.useText=text=>{const p=P2.parse(text);closeSheet();
  if(p.kind==='mat'){P2.newMat(p.body.replace(/\s*,\s*|\s+and\s+|\s+y\s+/g,'\n'),p.site);}
  else if(p.kind==='meet'){P2.newMeet(p.body,p.site);}
  else{P2.newTask(p.raw,p.site);}
  setTimeout(()=>toast('🎤 '+tt("We'll fill in the form — check it and tap Save."),'green'),500);};

// ───────── 2. swipe on tasks (right = done, left = tomorrow) ─────────
const today=()=>dkey(new Date());const tomorrow=()=>{const d=new Date();d.setDate(d.getDate()+1);return dkey(d);};
function snoozed(j,m){const v=j&&m&&j['snz_'+m.id];return !!v&&v>today();}
P2.snooze=id=>{const m=M();const j=D.jobs.find(x=>x.id===id);if(!j||!m)return;j['snz_'+m.id]=tomorrow();save();try{renderJobs();}catch(e){}try{if($('pg-home').classList.contains('on'))renderHome();}catch(e){}toast('⏰ '+tt('Snoozed until tomorrow'),'green');};
P2.unsnooze=id=>{const m=M();const j=D.jobs.find(x=>x.id===id);if(!j)return;delete j['snz_'+m.id];save();try{renderJobs();}catch(e){}};
// your board leaves out what you snoozed until it is due again
if(typeof window.visibleJobs==='function'){const _vj=window.visibleJobs;window.visibleJobs=function(){const L=_vj.apply(this,arguments);const m=M();return P2.showSnz?L:L.filter(j=>!snoozed(j,m));};}
let sw=null;
document.addEventListener('touchstart',e=>{if(P2.selMode)return;const c=e.target.closest&&e.target.closest('.kbcard[data-j],.gprow[data-j]');if(!c)return;const tch=e.touches[0];sw={el:c,id:c.dataset.j,x:tch.clientX,y:tch.clientY,dx:0,on:false};},{passive:true});
document.addEventListener('touchmove',e=>{if(!sw)return;const tch=e.touches[0];const dx=tch.clientX-sw.x,dy=tch.clientY-sw.y;
  if(!sw.on){if(Math.abs(dx)>14&&Math.abs(dx)>Math.abs(dy)*1.4){sw.on=true;sw.el.classList.add('p2swipe');let bg=sw.el.querySelector('.p2swbg');if(!bg){bg=document.createElement('div');bg.className='p2swbg';sw.el.prepend(bg);}sw.bg=bg;}else if(Math.abs(dy)>12){sw=null;return;}else return;}
  e.preventDefault();sw.dx=dx;sw.el.style.transform='translateX('+dx+'px)';const right=dx>0;
  sw.bg.style.background=right?'#27ae60':'#d9822b';sw.bg.style.justifyContent=right?'flex-start':'flex-end';sw.bg.style.transform='translateX('+(-dx)+'px)';sw.bg.textContent=right?'✓ '+tt('Done'):'⏰ '+tt('Tomorrow');sw.bg.style.opacity=Math.min(1,Math.abs(dx)/90);},{passive:false});
document.addEventListener('touchend',()=>{if(!sw)return;const s=sw;sw=null;if(!s.on)return;s.el.style.transition='transform .18s';
  const block=ev=>{ev.stopPropagation();ev.preventDefault();};s.el.addEventListener('click',block,{capture:true,once:true});setTimeout(()=>s.el.removeEventListener('click',block,{capture:true}),400);
  if(s.dx>90){s.el.style.transform='translateX(110%)';setTimeout(()=>{try{markDone(s.id);}catch(e){}},160);}
  else if(s.dx<-90){s.el.style.transform='translateX(-110%)';setTimeout(()=>P2.snooze(s.id),160);}
  else{s.el.style.transform='';setTimeout(()=>{s.el.style.transition='';if(s.bg)s.bg.style.opacity=0;},200);}},{passive:true});

// ───────── 5. stage colors everywhere ─────────
if(typeof window.stageBadge==='function'){window.stageBadge=function(s){const k=(s&&s.stage)||'active';const st=STAGE[k]||STAGE.active;let ed=false;try{ed=canEditFolder(me());}catch(e){}const c=tint(k);
  return '<span class="badge" style="font-weight:600;background:'+c+'26;color:'+c+';'+(ed?'cursor:pointer':'')+'"'+(ed?' onclick="event.stopPropagation();pickStage(\''+jsq(s.id)+'\')"':'')+'>'+t(st[0])+(ed?' ▾':'')+'</span>'+(typeof trelloMoveTag==='function'?trelloMoveTag(s):'');};}
if(typeof window.bCard==='function'){const _bc=window.bCard;window.bCard=function(j){let h=_bc.apply(this,arguments);try{const s=j.site&&D.sites.find(x=>x.id===j.site);if(s)h=h.replace('📍 ','<i class="stdot" style="background:'+tint(s.stage||'active')+'"></i>');
    if(P2.selMode){h=h.replace('class="card kbcard','class="card kbcard'+(P2.sel.has(j.id)?' p2on':'')).replace(/(<div class="card kbcard[^>]*>)/,'$1<i class="p2chk"></i>');}}catch(e){}return h;};}

// ───────── 6. bulk actions on tasks ─────────
P2.toggleSel=()=>{P2.selMode=!P2.selMode;P2.sel.clear();try{renderJobs();}catch(e){}barSync();};
if(typeof window.openJobDetail==='function'){const _oj=window.openJobDetail;window.openJobDetail=function(id){if(P2.selMode&&$('pg-jobs')&&$('pg-jobs').classList.contains('on')){if(P2.sel.has(id))P2.sel.delete(id);else P2.sel.add(id);try{renderJobs();}catch(e){}barSync();return;}return _oj.apply(this,arguments);};}
function barSync(){let b=$('p2bar');if(!b){b=document.createElement('div');b.id='p2bar';b.hidden=true;document.body.appendChild(b);}
  const on=P2.selMode&&$('pg-jobs')&&$('pg-jobs').classList.contains('on');b.hidden=!on;if(!on)return;const n=P2.sel.size;
  b.innerHTML='<div class="in"><b>'+n+' '+tt('selected')+'</b><button class="go" '+(n?'':'disabled')+' onclick="P2.bulkDone()">✓ '+tt('Done')+'</button><button '+(n?'':'disabled')+' onclick="P2.bulkMove()">'+tt('Move')+'</button><button '+(n?'':'disabled')+' onclick="P2.bulkSend()">'+tt('Send')+'</button><button onclick="P2.toggleSel()">✕</button></div>';fabSync();}
P2.bulkDone=()=>{const ids=[...P2.sel];askConfirm(tt('Mark these done?')+' ('+ids.length+' '+tt('tasks')+')',()=>{const m=M();ids.forEach(id=>{const j=D.jobs.find(x=>x.id===id);if(j&&j.status!=='done'){j.status='done';j.doneAt=Date.now();j.doneBy=m.id;}});save();P2.selMode=false;P2.sel.clear();renderJobs();barSync();toast('✓ '+ids.length+' '+tt('tasks'),'green');},tt('Mark done'));};
P2.bulkMove=()=>{const ids=[...P2.sel];askPrompt(tt('Move to list'),[{label:tt('Move to list'),options:bCols().map(c=>({v:c.id,l:t(c.name)}))}],([c])=>{ids.forEach(id=>{const j=D.jobs.find(x=>x.id===id);if(j)j['col_'+me().id]=c;});save();P2.selMode=false;P2.sel.clear();renderJobs();barSync();});};
P2.bulkSend=()=>{const ids=[...P2.sel];let tg=[];try{tg=assignTargets();}catch(e){}askPrompt(tt('Send to'),[{label:tt('Send to'),options:tg.map(x=>({v:x.id,l:x.label}))}],async([to])=>{
    for(const id of ids){try{openRe(id);await new Promise(r=>setTimeout(r,30));document.querySelectorAll('#rePick input').forEach(i=>{i.checked=i.value===to;});await doRe();hide('m-re');}catch(e){}}
    P2.selMode=false;P2.sel.clear();try{renderJobs();}catch(e){}barSync();});};

// Tasks page: Select button, snoozed note, swipe hint
if(typeof window.renderJobs==='function'){const _rj=window.renderJobs;window.renderJobs=function(){const r=_rj.apply(this,arguments);try{
  const top=$('addJobTop');if(top&&!$('p2selBtn')){const b=document.createElement('button');b.id='p2selBtn';b.className='btn quiet';b.style.cssText='width:auto;padding:9px 12px';b.onclick=()=>P2.toggleSel();top.parentNode.insertBefore(b,top);}
  const sb=$('p2selBtn');if(sb)sb.textContent=P2.selMode?'✕':tt('Select');
  const m=M();const list=$('jobList');if(list&&m){const all=D.jobs.filter(j=>j.status!=='done'&&(has(j,m.id)||(m.crew&&has(j,m.crew))));const nz=all.filter(j=>snoozed(j,m)).length;
    let h=$('p2snzNote');if(!h){h=document.createElement('div');h.id='p2snzNote';list.parentNode.insertBefore(h,list.nextSibling);}
    h.className='p2snz';h.innerHTML=(nz?'⏰ '+nz+' '+tt('snoozed until tomorrow')+' · <a onclick="P2.showSnz=!P2.showSnz;renderJobs()">'+(P2.showSnz?tt('Hide'):tt('Show'))+'</a><br>':'')+'<span style="font-size:11.5px">'+tt('Swipe right = done · left = tomorrow')+'</span>';}
  }catch(e){}barSync();return r;};}

// ───────── 7. task templates ─────────
const TPL_EN=[['Temp service request','Request temp service from O&R\n☐ Submit the request\n☐ Write down the O&R request #\n☐ Confirm the install date'],
 ['Disconnect temp service','Disconnect the temp service with O&R\n☐ Submit the request\n☐ Confirm the date'],
 ['Rough inspection','Book the rough inspection\n☐ Call the building department\n☐ Confirm the date with the site manager\n☐ Photos of panel and grounding'],
 ['Final inspection','Book the final inspection\n☐ Punch list done\n☐ Panel labeled\n☐ Call the building department'],
 ['Punch list walk','Walk the job and make the punch list\n☐ Every room\n☐ Photos of each item'],
 ['Material pickup','Pick up material\n☐ Check the order is complete\n☐ Bring the receipt to the office']];
function myTpls(){const m=M();return (D.ttpl||[]).filter(x=>x&&m&&x.owner===m.id);}
P2.tplUse=i=>{const all=TPL_EN.concat(myTpls().map(x=>[x.name,x.text]));const x=all[i];if(!x)return;const d=$('jDesc');if(!d)return;d.value=(d.value.trim()?d.value.trim()+'\n':'')+x[1];try{parseVoice(d.value,true);}catch(e){}};
P2.tplSave=()=>{const d=$('jDesc');const txt=d&&d.value.trim();if(!txt){toast(tt('Describe the job'));return;}askPrompt(tt('Save as template'),[{label:tt('Template name'),value:txt.split('\n')[0].slice(0,40)}],([n])=>{if(!String(n||'').trim())return;D.ttpl=D.ttpl||[];D.ttpl.push({id:nid('tp'),owner:me().id,name:String(n).trim().slice(0,40),text:txt.slice(0,800)});save();toast('★ '+tt('Saved'),'green');tplBar();});};
function tplBar(){const d=$('jDesc');if(!d)return;let b=$('p2tpl');if(!b){b=document.createElement('div');b.id='p2tpl';d.parentNode.insertBefore(b,d);}
  const all=TPL_EN.concat(myTpls().map(x=>[x.name,x.text]));
  b.innerHTML='<div style="font-size:12px;font-weight:600;color:var(--g4);margin-top:8px">'+tt('Templates')+'</div><div class="p2tpl">'+all.map((x,i)=>'<span class="chip" onclick="P2.tplUse('+i+')">'+esc(x[0])+'</span>').join('')+'<span class="chip" style="border:1px dashed var(--g3)" onclick="P2.tplSave()">★ '+tt('Save as template')+'</span></div>';}
if(typeof window.openJob==='function'){const _oj2=window.openJob;window.openJob=function(){const r=_oj2.apply(this,arguments);try{tplBar();}catch(e){}return r;};}

// ───────── 3+4. job page in tabs + photo gallery ─────────
const TABS=[['over','Overview'],['files','Files & photos'],['notes','Notes'],['set','Settings']];
function tagFolder(){const md=document.querySelector('#m-folder .md');if(!md||md.dataset.p2)return;md.dataset.p2='1';
  const g=(el,k)=>{if(el)el.setAttribute('data-p2t',k);};
  g($('fdAssign'),'over');g($('fdOverview'),'over');g($('fdInsp'),'over');
  [...md.querySelectorAll('button')].forEach(b=>{if(/openMatHist/.test(b.getAttribute('onclick')||''))g(b,'over');});
  g($('fdFilesHdr'),'files');g($('fdFiles'),'files');g($('fdUpload'),'files');g($('fdLinks'),'files');g($('fdLinkAdd'),'files');
  g($('fdNotes'),'notes');g($('fdNotePrev'),'notes');g($('fdSettings'),'set');
  [...md.querySelectorAll('.sec')].forEach(s=>{if(s.getAttribute('data-p2t'))return;const n=s.nextElementSibling;const id=n&&n.id;if(id==='fdNotes')g(s,'notes');else if(id==='fdLinks')g(s,'files');else if(id==='fdSettings')g(s,'set');});
  [...md.children].forEach(c=>{if(c.tagName==='DIV'&&c.hidden&&c.querySelector&&c.querySelector('#fdNoteNew'))g(c,'notes');});
  const gal=document.createElement('div');gal.id='p2gal';gal.setAttribute('data-p2t','files');const fh=$('fdFilesHdr');if(fh)md.insertBefore(gal,fh);
  const bar=document.createElement('div');bar.className='p2tabs';bar.id='p2tabs';const sp=$('fdSpeak');if(sp&&sp.nextSibling)md.insertBefore(bar,sp.nextSibling);else md.appendChild(bar);}
P2.setTab=k=>{P2.tab=k;const f=$('m-folder');TABS.forEach(([x])=>f.classList.remove('p2t-'+x));f.classList.add('p2t-'+k);document.querySelectorAll('#p2tabs button').forEach(b=>b.classList.toggle('on',b.dataset.k===k));};
function gallery(s){const m=M();const imgs=[];
  (s.files||[]).forEach(f=>{let ok=true;try{ok=fileVisible(f,m);}catch(e){}if(ok&&f.kind==='img'&&f.d)imgs.push({src:f.d,ts:f.ts||0});});
  (D.keep||[]).forEach(n=>{if(n&&n.site===s.id&&n.img&&!n.trashed){let ok=true;try{ok=(typeof kMine==='function')?kMine().some(x=>x.id===n.id):true;}catch(e){}if(ok)imgs.push({src:n.img,ts:n.created||0});}});
  (D.jobs||[]).forEach(j=>{if(j.site===s.id){(j.photos||[]).forEach(p=>{const src=typeof p==='string'?p:(p&&(p.d||p.url));if(src)imgs.push({src,ts:(p&&p.ts)||j.doneAt||j.ts||0});});if(typeof j.photo==='string'&&j.photo.length>20)imgs.push({src:j.photo,ts:j.doneAt||j.ts||0});}});
  imgs.sort((a,b)=>(b.ts||0)-(a.ts||0));P2._gal=imgs.map(x=>x.src);
  if(!imgs.length)return '<div class="sec">'+tt('Photos')+'</div><div style="font-size:13px;color:var(--g4);padding:4px 0 8px">'+tt('No photos yet.')+'</div>';
  let h='<div class="sec">'+tt('Photos')+' · '+imgs.length+'</div>',last='',i=0,open=false;
  imgs.forEach(x=>{const d=x.ts?new Date(x.ts).toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'}):'';if(d!==last){if(open)h+='</div>';h+='<div class="p2gd">'+esc(d)+'</div><div class="p2gal">';open=true;last=d;}h+='<img loading="lazy" src="'+esc(x.src)+'" onclick="viewPhotos(P2._gal,'+i+')" alt="">';i++;});
  return h+(open?'</div>':'');}
if(typeof window.openFolder==='function'){const _of=window.openFolder;window.openFolder=function(id){const r=_of.apply(this,arguments);try{
  const s=D.sites.find(x=>x.id===id);const f=$('m-folder');if(!s||!f||f.classList.contains('hid'))return r;tagFolder();
  if(P2.tabSite!==id){P2.tabSite=id;P2.tab='over';}
  const bar=$('p2tabs');bar.innerHTML=TABS.filter(([k])=>k!=='set'||!!($('fdSettings')&&$('fdSettings').innerHTML.trim())).map(([k,l])=>'<button data-k="'+k+'" onclick="P2.setTab(\''+k+'\')">'+tt(l)+'</button>').join('');
  $('p2gal').innerHTML=gallery(s);P2.setTab(P2.tab);}catch(e){}return r;};}

// ───────── 10. duplicate job warning (owner, managers, office) ─────────
function normName(n){return String(n||'').toLowerCase().replace(/[.,#]/g,' ').replace(/\b(drive|dr|road|rd|lane|ln|court|ct|street|st|avenue|ave|place|pl|way|terrace|ter|circle|cir|boulevard|blvd)\b/g,' ').replace(/\b(ny|new york|\d{5})\b/g,' ').replace(/\s+/g,' ').trim();}
function dupKey(n){const w=normName(n).split(' ');const i=w.findIndex(x=>/^\d+[a-z]?$/.test(x));if(i<0||!w[i+1])return null;return w[i]+' '+w[i+1];}
P2.dups=function(){const L=(D.sites||[]).filter(s=>s&&s.stage!=='lost'&&!s.tgone);const by={};L.forEach(s=>{const k=dupKey(s.name);if(k)(by[k]=by[k]||[]).push(s);});
  const ok=new Set(D.dupok||[]);const out=[];Object.values(by).forEach(g=>{for(let a=0;a<g.length;a++)for(let b=a+1;b<g.length;b++){const key=[g[a].id,g[b].id].sort().join('|');if(!ok.has(key))out.push([g[a],g[b],key]);}});return out;};
P2.dupOk=key=>{D.dupok=D.dupok||[];if(!D.dupok.includes(key))D.dupok.push(key);save();renderSites();};
if(typeof window.renderSites==='function'){const _rs=window.renderSites;window.renderSites=function(){const r=_rs.apply(this,arguments);try{const m=M();const el=$('siteList');
  if(el&&m&&(m.role==='owner'||m.role==='manager'||m.role==='office'||m.all)&&!(($('siteFind')||{}).value||'').trim()){const d=P2.dups();if(d.length){const box=document.createElement('div');box.className='p2dup';
    box.innerHTML='<b>⚠ '+tt('Possible duplicate jobs')+' ('+d.length+')</b>'+d.slice(0,6).map(([a,b,k])=>'<div class="r"><span style="min-width:0">'+esc(a.name)+'<br>'+esc(b.name)+'</span><span style="display:flex;flex-direction:column;gap:4px;flex:none"><button onclick="openFolder(\''+jsq(a.id)+'\')">'+tt('Open')+' 1</button><button onclick="openFolder(\''+jsq(b.id)+'\')">'+tt('Open')+' 2</button><button onclick="P2.dupOk(\''+jsq(k)+'\')">'+tt('Not a duplicate')+'</button></span></div>').join('');el.prepend(box);}}}catch(e){}return r;};}

// ───────── 9. big-text crew mode (workers; on by default, can be turned off) ─────────
function crewOn(){const m=M();if(!m||m.role!=='worker'||m.lead)return false;try{const v=localStorage.getItem('p2crew_'+m.id);return v===null?true:v==='1';}catch(e){return true;}}
P2.crewToggle=()=>{const m=M();if(!m)return;try{localStorage.setItem('p2crew_'+m.id,crewOn()?'0':'1');}catch(e){}crewSync();try{renderMore();}catch(e){}};
function crewSync(){document.documentElement.classList.toggle('p2crew',crewOn());}
setInterval(crewSync,1500);crewSync();
if(typeof window.setRole==='function'){const _sr=window.setRole;window.setRole=function(){const r=_sr.apply(this,arguments);try{crewSync();P2.selMode=false;P2.sel.clear();barSync();}catch(e){}return r;};}
if(typeof window.renderMore==='function'){const _rm=window.renderMore;window.renderMore=function(){const r=_rm.apply(this,arguments);try{const m=M();if(m&&m.role==='worker'&&!m.lead){const g=document.querySelector('#pg-more .more-grid');if(g&&!$('p2crewTile')){const d=document.createElement('div');d.className='mg';d.id='p2crewTile';d.onclick=()=>P2.crewToggle();g.appendChild(d);}const d=$('p2crewTile');if(d)d.innerHTML='<b>🔠</b>'+tt('Simple mode')+'<div style="font-size:11px;color:var(--g4)">'+(crewOn()?tt('On'):tt('Off'))+'</div>';}}catch(e){}return r;};}

// ───────── 11. unread count on the app icon ─────────
function badgeSync(){try{const m=M();if(!m||!('setAppBadge' in navigator))return;const n=(D.inbox||[]).filter(x=>x.to===m.id&&!x.read).length;if(n)navigator.setAppBadge(n).catch(()=>{});else navigator.clearAppBadge().catch(()=>{});}catch(e){}}
if(typeof window.renderBell==='function'){const _rb=window.renderBell;window.renderBell=function(){const r=_rb.apply(this,arguments);badgeSync();return r;};}
setInterval(badgeSync,15000);

// ───────── 13. act from the alert: "Mark done" / "Reply" (Android shows the buttons; on iPhone a tap opens the task) ─────────
try{if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',ev=>{const d=ev.data||{};if(d.type==='ex-act'&&d.id)P2.act(d.id,d.act);});}catch(e){}
P2.act=(nidv,act)=>{let k=0;const go=()=>{const x=(D.inbox||[]).find(i=>i.id===nidv);const jid=x&&x.link&&x.link.job;if(!jid){if(k++<20)setTimeout(go,500);return;}
  try{x.read=true;save();}catch(e){}
  if(act==='done'){const j=D.jobs.find(y=>y.id===jid);if(j&&j.status!=='done'){j.status='done';j.doneAt=Date.now();j.doneBy=me().id;save();try{renderJobs();}catch(e){}toast('✓ '+tt('Done'),'green');}}
  else{try{openJobDetail(jid);setTimeout(()=>{const c=document.querySelector('#m-jobd textarea,#m-jobd input[type=text],#m-jobd [contenteditable]');if(c)c.focus();},400);}catch(e){}}};go();};
try{const q=new URLSearchParams(location.search);const a=q.get('act'),n=q.get('n');if(a&&n)setTimeout(()=>P2.act(n,a),1200);}catch(e){}

D.ttpl=D.ttpl||[];D.dupok=D.dupok||[];
})();
