/* Electrix USA — Features v1 (STAGING): five improvements, loaded after the main app, the schedule module and the scanner.
   1. Universal search — one search for everything, grouped, typo-tolerant, permission-scoped, opens the exact item.
   2. Time Clock Required (YES / NO) per employee — no clock buttons, reminders or "missing punch" for people set to NO.
   3. Text exactly as typed — line breaks, blank lines and indentation kept everywhere; copy / share / print keep them.
   4. Notifications — bell with history, read / unread, tap opens the exact item (also from a phone notification),
      and one "My Tasks & Notifications" page.
   5. Job fields start blank — type to search by name or address; required jobs can't be saved empty.
   It changes no data on its own and never touches pay, punches or stock counts. Every existing button keeps working:
   functions are wrapped (same names), never removed. */
(function(){
'use strict';
if(typeof D==='undefined'||typeof me!=='function'||typeof show!=='function')return;
window.EX_FEATURES_V=1;
const T=s=>(typeof t==='function'?t(s):s);
const $=id=>document.getElementById(id);
const safe=(f,fb)=>{try{return f();}catch(e){console.warn('[features]',e);return fb;}};
const wrap=(name,fn)=>{const orig=window[name];if(typeof orig!=='function'){console.warn('[features] missing',name);return;}window[name]=fn(orig);window[name]._orig=orig;};

// ───────── Spanish ─────────
Object.assign(ES,{
 'Search everything':'Buscar todo','Search jobs, addresses, people, material, tasks, notes, hours…':'Busca trabajos, direcciones, personas, material, tareas, notas, horas…',
 'Job sites':'Trabajos','Tasks':'Tareas','Schedule':'Horario','Material lists':'Listas de material','Inventory':'Inventario','Pick-ups & returns':'Retiros y devoluciones',
 'Employees':'Empleados','Hours':'Horas','Notes':'Notas','Messages':'Mensajes','Tools':'Herramientas','Service calls':'Llamadas de servicio',
 'Show all':'Ver todos','Nothing found for':'No se encontró nada para','Did you mean':'Quizás quisiste decir',
 'Time Clock Required':'Requiere reloj de ponche','YES':'SÍ','NO':'NO','NO = paid monthly: no Clock In / Clock Out, no punch reminders, not counted as missing. Old punches are kept.':'NO = pago mensual: sin entrada / salida, sin recordatorios, no cuenta como faltante. Los ponches anteriores se guardan.',
 'No time clock':'Sin reloj de ponche','Your time is not tracked on the clock.':'Tu tiempo no se registra con el reloj.',
 'Search or select a job':'Busca o elige un trabajo','Pick the job':'Elige el trabajo','Your job today':'Tu trabajo de hoy','Near you':'Cerca de ti','No job matches':'Ningún trabajo coincide',
 '— none —':'— ninguno —','Clear':'Borrar','From your words':'De lo que dijiste','Use':'Usar',
 'Notifications':'Notificaciones','My Tasks':'Mis tareas','My Tasks & Notifications':'Mis tareas y notificaciones','All':'Todas','Unread':'No leídas','Mark all read':'Marcar todo leído',
 'Mark read':'Marcar leído','Mark unread':'Marcar no leído','Nothing yet.':'Nada todavía.','Load older':'Cargar anteriores',
 'Waiting for my approval':'Esperando mi aprobación','New assignments':'Asignaciones nuevas','Overdue':'Atrasadas','Pending':'Pendientes','Completed':'Terminadas',
 'My schedule':'Mi horario','Assigned to me':'Asignado a mí','All clear':'Todo listo','new notifications':'notificaciones nuevas','new notification':'notificación nueva',
 'Copy':'Copiar','Share':'Compartir','Print':'Imprimir','Copied':'Copiado','Material list':'Lista de material','Open in Material':'Abrir en Material',
 'Today':'Hoy','Tomorrow':'Mañana','Edit employee':'Editar empleado','Tasks of':'Tareas de','Open':'Abrir','Time off':'Tiempo libre',
 'Punch fixes':'Correcciones de ponche','Late clock entries':'Marcas tardías','Office clock-in requests':'Pedidos de entrada a la oficina','Estimates to price / approve':'Estimados por cotizar / aprobar',
 'Material to handle':'Material por atender','Service calls for me':'Llamadas de servicio para mí','Meetings':'Reuniones','Notes shared with me':'Notas compartidas conmigo',
 'updated the note':'actualizó la nota','Turn on phone notifications':'Activar notificaciones del teléfono','Phone notifications are on':'Notificaciones del teléfono activadas',
 'Turn on':'Activar','Could not copy':'No se pudo copiar','Note':'Nota','removed':'quitada','waiting':'esperando','inactive':'inactivo',
 'You are now a crew leader — you get tasks for your crew':'Ahora eres líder de cuadrilla — recibes las tareas de tu cuadrilla','You are no longer a crew leader':'Ya no eres líder de cuadrilla','You now manage':'Ahora manejas',
 'Leave empty for a supplier delivery or new stock':'Deja vacío para entrega de proveedor o inventario nuevo','Pick the job, or type the supplier':'Elige el trabajo o escribe el proveedor'
});

// ───────── styles ─────────
(function(){const st=document.createElement('style');st.id='exFeatCss';st.textContent=`
.ptx{white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;tab-size:4}
.ctask,.ctext{white-space:pre-wrap}
.exjp{position:relative;margin-top:4px}
select.exjp-sel{position:absolute!important;opacity:0!important;width:1px!important;height:1px!important;min-height:0!important;padding:0!important;border:0!important;margin:0!important;pointer-events:none!important;overflow:hidden}.exjp-in{display:flex;align-items:center;gap:6px}
.exjp-in input{flex:1;font-size:16px!important;margin:0!important}
.exjp-x{border:0;background:var(--g1);color:var(--g4);border-radius:99px;width:34px;height:34px;flex:none;font-size:15px;cursor:pointer}
.exjp-list{border:1px solid var(--g2,#ddd);border-radius:10px;margin-top:4px;max-height:280px;overflow-y:auto;background:var(--bg,#fff);-webkit-overflow-scrolling:touch}
.exjp-it{padding:11px 12px;border-bottom:1px solid var(--g1);cursor:pointer;font-size:14.5px;display:flex;justify-content:space-between;gap:8px}
.exjp-it:last-child{border-bottom:0}.exjp-it.on,.exjp-it:hover{background:var(--g1)}.exjp-it .s{font-size:12px;color:var(--g4);white-space:nowrap}
.exjp-gh{padding:6px 12px;font-size:11.5px;font-weight:700;color:var(--g4);background:var(--g0,#f7f7f7);text-transform:uppercase;letter-spacing:.03em}
.exjp-req .exjp-in input{border-color:#c0392b!important;box-shadow:0 0 0 2px rgba(192,57,43,.15)}
.exjp-sug{margin-top:6px;font-size:13px}.exjp-sug button{border:1px solid var(--blue-mid,#2a6fdb);color:var(--blue-mid,#2a6fdb);background:transparent;border-radius:99px;padding:6px 11px;font-size:13px;cursor:pointer}
.exsr-g{margin-top:10px}.exsr-h{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;color:var(--g4);text-transform:uppercase;letter-spacing:.03em;padding:4px 4px}
.exsr-h button{border:0;background:none;color:var(--blue-mid);font-weight:600;font-size:12px;cursor:pointer;text-transform:none}
.sres mark{background:#fff2a8;color:inherit;border-radius:2px;padding:0 1px}
.exn-tabs{display:flex;gap:6px;margin:4px 0 10px}.exn-tabs button{flex:1;border:1px solid var(--g2,#ddd);background:transparent;border-radius:10px;padding:9px;font-weight:600;font-size:14px;cursor:pointer;color:inherit}
.exn-tabs button.on{background:var(--blue-mid,#2a6fdb);border-color:var(--blue-mid,#2a6fdb);color:#fff}
.exn-row{display:flex;gap:10px;align-items:flex-start;padding:10px 4px;border-bottom:1px solid var(--g1);cursor:pointer}
.exn-row.read{opacity:.62}.exn-dot{flex:none;width:30px;height:30px;border:0;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;margin:-4px -4px 0 -6px}
.exn-dot span{width:10px;height:10px;border-radius:50%;border:2px solid var(--blue-mid,#2a6fdb)}.exn-row:not(.read) .exn-dot span{background:var(--blue-mid,#2a6fdb)}
.exn-msg{font-size:13.5px;line-height:1.35}.exn-meta{font-size:11px;color:var(--g4);margin-top:2px;display:flex;justify-content:space-between;gap:8px}
.exmt-sec{margin-top:12px}.exmt-sec h4{margin:0 0 4px;font-size:13px;display:flex;justify-content:space-between;color:var(--g5,#333)}
.exmt-it{padding:9px 4px;border-bottom:1px solid var(--g1);cursor:pointer;font-size:13.5px;display:flex;justify-content:space-between;gap:8px}
.exmt-it .s{font-size:11.5px;color:var(--g4);white-space:nowrap}
.exshare{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.exshare button{border:1px solid var(--g2,#ddd);background:transparent;border-radius:99px;padding:6px 11px;font-size:12.5px;cursor:pointer;color:inherit}
.exclock{display:flex;gap:0;border:1px solid var(--g2,#ddd);border-radius:10px;overflow:hidden;width:max-content}
.exclock button{border:0;background:transparent;padding:8px 18px;font-weight:700;cursor:pointer;color:inherit}.exclock button.on{background:var(--blue-mid,#2a6fdb);color:#fff}
.exclock button:disabled{opacity:.5;cursor:default}
@media print{body.exprinting>*:not(#exPrint){display:none!important}#exPrint{display:block!important}}
`;document.head.appendChild(st);})();

// ═════════ shared: fuzzy matching (partial words, small typos, part numbers, addresses) ═════════
const STOP=new Set(['the','a','an','of','de','la','el','los','las','y','and','for','para','en','in','at']);
const nrm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/["“”″]/g,' in ').replace(/[^a-z0-9#/.]+/g,' ').replace(/(^|\s)[./]+|[./]+(\s|$)/g,' ').trim();
const sq=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function dl(a,b,max){ // Damerau–Levenshtein (adjacent swaps count as one), early exit above max
  const m=a.length,n=b.length;if(Math.abs(m-n)>max)return max+1;let p2=null,p=[];for(let j=0;j<=n;j++)p[j]=j;
  for(let i=1;i<=m;i++){const c=[i];let best=i;for(let j=1;j<=n;j++){let v=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));if(p2&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])v=Math.min(v,p2[j-2]+1);c[j]=v;if(v<best)best=v;}if(best>max)return max+1;p2=p;p=c;}
  return p[n];}
function toks(q){return nrm(q).split(' ').filter(x=>x&&!STOP.has(x));}
function hay(parts){const s=nrm(parts.filter(Boolean).join(' '));return {s:' '+s+' ',w:s.split(' ').filter(Boolean),q:sq(parts.filter(Boolean).join(' '))};}
// score >0 when every word of the query is found; 0 = no match. fz = how many words needed typo-tolerance
function score(tk,h){if(!tk.length)return 0;let sc=0,fz=0;
  for(const k of tk){
    if(h.s.includes(' '+k+' ')){sc+=6;continue;}
    if(h.s.includes(' '+k)){sc+=4;continue;}
    if(k.length>=2&&h.s.includes(k)){sc+=2;continue;}
    const kq=sq(k);if(kq.length>=3&&h.q.includes(kq)){sc+=3;continue;}       // part numbers: "lb 240" = "LB240", "5601-2w" = "56012W"
    if(/^\d+$/.test(k))return 0;                                               // house numbers and quantities must match exactly
    if(k.length<4)return 0;
    const max=k.length>=7?2:1;let ok=false;
    for(const w of h.w){if(w.length<3)continue;if(dl(k,w,max)<=max||(w.length>k.length&&dl(k,w.slice(0,k.length),max)<=max)){ok=true;break;}}
    if(!ok)return 0;sc+=1;fz++;}
  return sc*10-fz;}
window.EX_fuzzy={nrm,toks,hay,score,dl};

// ═════════ 3. text exactly as typed ═════════
// keeps every line break, blank line and indentation; only removes empty lines at the very start/end and trailing spaces
// at the very end (what "trim" did before, but without eating the first line's indentation). Windows line ends → \n.
function txt(s){if(typeof exTxt==='function')return exTxt(s);s=String(s==null?'':s).replace(/\r\n?/g,'\n');return s.replace(/^(?:[ \t]*\n)+/,'').replace(/\s+$/,'');}
window.EX_txt=txt;
const ptx=s=>'<span class="ptx">'+esc(s)+'</span>';
window.EX_ptx=ptx;
// copy / share / print — the exact text, with its line breaks
async function copyText(s){s=String(s||'');try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(s);toast('✓ '+T('Copied'),'green');return true;}}catch(e){}
  const ta=document.createElement('textarea');ta.value=s;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:-1000px;opacity:0';document.body.appendChild(ta);ta.select();try{ta.setSelectionRange(0,s.length);}catch(e){}let ok=false;try{ok=document.execCommand('copy');}catch(e){}ta.remove();toast(ok?'✓ '+T('Copied'):'⚠ '+T('Could not copy'),ok?'green':'');return ok;}
async function shareText(title,s){s=String(s||'');if(navigator.share){try{await navigator.share({title:title||'Electrix',text:(title?title+'\n\n':'')+s});return;}catch(e){if(e&&e.name==='AbortError')return;}}copyText((title?title+'\n\n':'')+s);}
function printText(title,s){let box=$('exPrint');if(!box){box=document.createElement('div');box.id='exPrint';box.style.display='none';document.body.appendChild(box);}
  box.innerHTML='<h2 style="font:700 18px system-ui,sans-serif;margin:0 0 10px">'+esc(title||'Electrix')+'</h2><div class="ptx" style="font:14px/1.45 system-ui,sans-serif">'+esc(s)+'</div>';
  document.body.classList.add('exprinting');const done=()=>{document.body.classList.remove('exprinting');window.removeEventListener('afterprint',done);};window.addEventListener('afterprint',done);setTimeout(()=>{try{window.print();}catch(e){}setTimeout(done,1500);},30);}
window.EX_copyText=copyText;window.EX_shareText=shareText;window.EX_printText=printText;
const SHARE={};let shareN=0;
function shareBar(title,text){const k='s'+(++shareN);SHARE[k]={title,text};if(shareN>400){Object.keys(SHARE).slice(0,200).forEach(x=>delete SHARE[x]);}
  return '<div class="exshare"><button type="button" onclick="event.stopPropagation();EX_shareGo(\''+k+'\',\'copy\')">📋 '+T('Copy')+'</button><button type="button" onclick="event.stopPropagation();EX_shareGo(\''+k+'\',\'share\')">↗ '+T('Share')+'</button><button type="button" onclick="event.stopPropagation();EX_shareGo(\''+k+'\',\'print\')">🖨 '+T('Print')+'</button></div>';}
window.EX_shareGo=function(k,how){const x=SHARE[k];if(!x)return;if(how==='copy')copyText(x.text);else if(how==='share')shareText(x.title,x.text);else printText(x.title,x.text);};
window.EX_shareBar=shareBar;

// voice / typed task text: never squeeze lines together, never rewrite what was typed
window.parseVoice=function(text,typed){
  const low=String(text||'').toLowerCase();const targets=assignTargets();
  let hit=targets.find(x=>low.includes(x.label.split(' ')[0].toLowerCase()));
  if(!hit)hit=targets.find(x=>{const c=crewOf(x.id);return c&&low.includes(c.name.toLowerCase());});
  if(!typed)targets.filter(x=>low.includes(x.label.split(' ')[0].toLowerCase())).forEach(x=>{const b=document.querySelector(`#jAssign input[value="${x.id}"]`);if(b)b.checked=true;});
  // a job named in the words is OFFERED (one tap), never picked silently
  const sHit=D.sites.find(s=>{const w=String(s.name||'').toLowerCase().split(/[ ,]+/).filter(x=>x.length>2);return w.some(x=>low.includes(x))&&w.filter(x=>low.includes(x)).length>=Math.min(2,w.length);});
  const sel=$('jSite');if(sHit&&sel&&sel.value!==sHit.id)jpSuggest(sel,sHit.id,T('From your words'));
  if(typed)return; // typed text: leave it exactly as written
  const due=$('jDue');
  if(/\b(priority|prioridad|urgent|urgente|right away|ahora mismo)\b/.test(low))$('jPri').classList.add('on');
  if(low.includes('tomorrow'))due.value='Tomorrow morning';else if(low.includes('today'))due.value='Today';else if(low.includes('asap')||low.includes('right now')||low.includes('urgent'))due.value='ASAP';else if(low.includes('this week')||low.includes('by friday'))due.value='This week';
  let d=String(text||'');
  if(hit)d=d.replace(new RegExp(hit.label.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'');
  d=d.replace(/\b(tomorrow|today|morning|afternoon|asap|he needs to|she needs to|needs to|go to|send to|tell|please)\b/gi,'');
  d=d.split('\n').map(l=>l.replace(/[ \t]{2,}/g,' ')).join('\n').replace(/^[\s,.]+|[\s,.]+$/g,''); // tidy spaces inside each line only
  $('jDesc').value=d.charAt(0).toUpperCase()+d.slice(1);};

// material dictation adds to what was typed instead of replacing it
wrap('matRec',orig=>function(){const ta=$('mtItems');const base=ta?ta.value:'';const was=typeof mOn!=='undefined'&&mOn;const r=orig.apply(this,arguments);if(was)return r;
  try{if(typeof mrec!=='undefined'&&mrec&&base.trim()){const h=mrec.onresult;mrec.onresult=e=>{h(e);const said=ta.value;ta.value=txt(base)+(said?'\n'+said:'');};}}catch(e){}return r;});

// saving: exact text (was .trim(), which also removed the first line's indentation)
wrap('saveJob',orig=>function(){const el=$('jDesc');if(el)el.value=txt(el.value);return orig.apply(this,arguments);});
['esText','svIssue','irNote','smWhy','poInjWhat','mtItems','chText','jdTxt'].forEach(id=>{const el=$(id);if(el)el.addEventListener('change',()=>{const v=txt(el.value);if(v!==el.value)el.value=v;});});

// ═════════ 2. Time Clock Required (per employee) ═════════
// clockReq(e) lives in the main app (index.html) so every screen uses the same rule:
// clock:false → NO (paid monthly), clock:true → YES, not set → the old behaviour (workers and site managers punch).
const CR=e=>typeof clockReq==='function'?clockReq(e):true;
wrap('applyTabs',orig=>function(){const r=orig.apply(this,arguments);safe(()=>{const m=me();if(!m)return;const b=document.querySelector('.tab[onclick*="\'punch\'"]');if(!b)return;
  const want=CR(m)&&m.role!=='owner';
  if(!want&&b.dataset.allowed==='1'){b.dataset.allowed='0';b.style.display='none';}
  if(want&&b.dataset.allowed!=='1'){b.dataset.allowed='1';const prim=primaryFor(m);b.style.display=prim.includes('punch')?'':'none';const mb=document.querySelector('.tab[onclick*="\'more\'"]');if(mb&&!prim.includes('punch'))mb.style.display='';}
  const cur=document.querySelector('.tab.on');if(cur&&cur.style.display==='none'){const first=[...document.querySelectorAll('.tab')].find(x=>x.style.display!=='none'&&x.dataset.allowed==='1');if(first)first.click();}
  if(typeof renderMore==='function')safe(renderMore);});return r;});
wrap('goTab',orig=>function(n){if(n==='punch'){const b=document.querySelector('.tab[onclick*="\'punch\'"]');const m=me();if(m&&b&&b.dataset.allowed==='0'&&!CR(m)){const alt=['home','jobs','mat','exp','more'].find(x=>{const y=document.querySelector('.tab[onclick*="\''+x+'\'"]');return y&&y.dataset.allowed==='1';});return alt?orig.call(this,alt):undefined;}}return orig.apply(this,arguments);});
wrap('doPunch',orig=>function(){const m=me();if(m&&!CR(m)&&!D.punches.some(p=>p.who===m.id&&!p.out)){toast(T('Your time is not tracked on the clock.'));return;}return orig.apply(this,arguments);});
wrap('finishPunchIn',orig=>function(){const m=me();if(m&&!CR(m)){toast(T('Your time is not tracked on the clock.'));return;}return orig.apply(this,arguments);});
wrap('startWatch',orig=>function(){const m=me();if(m&&!CR(m)&&!D.punches.some(p=>p.who===m.id&&!p.out))return; // no "you're at a site but not punched in" reminders
  return orig.apply(this,arguments);});
wrap('attField',orig=>function(){return orig.apply(this,arguments).filter(CR);});
wrap('punchState',orig=>function(e){if(e&&!CR(e)){const today=new Date().toDateString();if(!D.punches.some(x=>x.who===e.id&&new Date(x.in).toDateString()===today))return {dot:'var(--g3)',txt:T('No time clock'),sub:'',h:0};}return orig.apply(this,arguments);});
wrap('renderHours',orig=>function(){const r=orig.apply(this,arguments);safe(()=>{const w=$('hrWho');if(!w)return;[...w.options].forEach(o=>{const e=D.emps.find(x=>x.id===o.value);if(e&&!CR(e)&&!D.punches.some(p=>p.who===e.id))o.remove();});});return r;});
// employee sheet: Time Clock Required YES / NO
let clockSel=null,clockTouched=false;
const rawClock=e=>e&&e.clock===false?false:e&&e.clock===true?true:!!e&&(e.role==='worker'||e.role==='manager');
function canSetClock(m,e){if(!m)return false;if(m.role==='owner')return true;if(e&&e.id===m.id)return false;            // nobody changes their own
  const priv=x=>x&&(x.role==='owner'||x.role==='manager'||x.role==='office'||!!x.all);
  return isBoss(m)&&!priv(e);}                                                                                            // same rule the database enforces
function clockBox(){let w=$('exClockWrap');if(w)return w;const after=$('eActiveWrap')||$('eCrewWrap');w=document.createElement('div');w.id='exClockWrap';w.style.marginTop='12px';
  w.innerHTML='<label style="margin-bottom:4px" data-i18n="Time Clock Required">'+T('Time Clock Required')+'</label><div class="exclock"><button type="button" id="exClockY" onclick="EX_setClockSel(true)">'+T('YES')+'</button><button type="button" id="exClockN" onclick="EX_setClockSel(false)">'+T('NO')+'</button></div><div style="font-size:11.5px;color:var(--g4);margin-top:4px">'+T('NO = paid monthly: no Clock In / Clock Out, no punch reminders, not counted as missing. Old punches are kept.')+'</div>';
  after.parentNode.insertBefore(w,after.nextSibling);return w;}
window.EX_setClockSel=function(v,quiet){clockSel=v;if(!quiet)clockTouched=true;$('exClockY').classList.toggle('on',v===true);$('exClockN').classList.toggle('on',v===false);};
wrap('openEmp',orig=>function(id){const r=orig.apply(this,arguments);safe(()=>{const ex=id?D.emps.find(x=>x.id===id):null;const w=clockBox();const m=me();
  const can=canSetClock(m,ex||{role:'worker'});const cur=ex?rawClock(ex):rawClock({role:$('eRole').value||'worker'});clockTouched=false;EX_setClockSel(cur,true);
  $('exClockY').disabled=$('exClockN').disabled=!can;w.style.display=(ex&&ex.role==='owner')?'none':'';w.dataset.orig=String(cur);
  const rs=$('eRole');if(rs&&!rs._exClock){rs._exClock=1;rs.addEventListener('change',()=>{if(!clockTouched){const e2=empEditId?D.emps.find(x=>x.id===empEditId):null;EX_setClockSel(e2&&e2.clock!==undefined?rawClock(e2):rawClock({role:rs.value}),true);}});}});return r;});
wrap('saveEmp',orig=>function(){const id=empEditId;const before=D.emps.length;const want=clockSel;const w=$('exClockWrap');const changed=clockTouched&&w&&w.dataset.orig!==String(want);
  const r=orig.apply(this,arguments);
  safe(()=>{if(!$('m-emp').classList.contains('hid'))return; // not saved (missing name, bad password…)
    const e=id?D.emps.find(x=>x.id===id):(D.emps.length>before?D.emps[D.emps.length-1]:null);if(!e||e.role==='owner')return;
    if(!canSetClock(me(),e))return;
    if(!changed)return;                    // untouched: keep the role's normal rule (nothing stored)
    if(e.clock===want)return;
    e.clock=want;save();renderAll();});return r;});

// ═════════ 5. job fields start blank; type to search ═════════
function siteExtra(id){const s=D.sites.find(x=>x.id===id);return s?[s.name,s.client,s.phone,s.trelloList,s.addr].filter(Boolean).join(' '):'';}
function todayJob(){const m=me();if(!m)return '';const op=D.punches.find(p=>p.who===m.id&&!p.out);if(op&&op.site)return op.site;const sl=m.crew?D.sched[m.crew+'|'+dkey(new Date())]:null;if(sl&&sl.site)return sl.site;
  if(m.crew&&typeof effectiveAsgs==='function'){const a=safe(()=>effectiveAsgs(m.crew,dkey(new Date())),[]);if(a&&a[0])return a[0].site;}return '';}
function nearIds(){return safe(()=>((typeof nearbySites==='function'&&nearbySites())||[]).map(x=>x.s&&x.s.id).filter(Boolean).slice(0,3),[]);}
const VSET=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
const ISET=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'selectedIndex');
function jp(sel,o){if(!sel)return null;o=o||{};if(sel._jp){sel._jp.o=Object.assign(sel._jp.o,o);sel._jp.refresh();return sel._jp;}
  const box=document.createElement('div');box.className='exjp';
  box.innerHTML='<div class="exjp-in"><input type="search" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="'+esc(T('Search or select a job'))+'"><button type="button" class="exjp-x" hidden aria-label="'+esc(T('Clear'))+'">✕</button></div><div class="exjp-sugw"></div><div class="exjp-list" hidden></div>';
  sel.insertAdjacentElement('afterend',box);sel.classList.add('exjp-sel');sel.setAttribute('aria-hidden','true');sel.tabIndex=-1;
  const inp=box.querySelector('input'),x=box.querySelector('.exjp-x'),list=box.querySelector('.exjp-list'),sugw=box.querySelector('.exjp-sugw');
  const api={sel,box,inp,o,open:false,items:[],cur:0};sel._jp=api;
  const clean=l=>String(l||'').replace(/\s+—\s+—\s*$/,''); // "12 Main St — —" (no manager) → "12 Main St"
  const items=()=>{const out=[];[...sel.options].forEach(op=>{if(op.disabled&&!op.value)return;const g=op.parentElement&&op.parentElement.tagName==='OPTGROUP'?op.parentElement.label:'';out.push({v:op.value,l:clean(op.textContent),g,h:hay([op.textContent,op.value?siteExtra(op.value):''])});});return out;};
  const labelOf=v=>{const op=[...sel.options].find(z=>z.value===v);return op?clean(op.textContent):'';};
  const canNone=()=>[...sel.options].some(z=>z.value===''&&!z.hidden&&!z.disabled);
  api.refresh=()=>{const v=VSET.get.call(sel);const isNone=!v||v==='__none';inp.value=isNone?'':labelOf(v);x.hidden=isNone||!canNone();box.classList.remove('exjp-req');if(api.open)render();};
  function render(){const q=inp.value;const all=items();const sameAsSel=labelOf(VSET.get.call(sel))===q&&q;const tk=toks(sameAsSel?'':q);let html='';api.items=[];
    if(!tk.length){const seen=new Set();const add=(v,lab)=>{const it=all.find(z=>z.v===v);if(!it||seen.has(v))return;seen.add(v);html+=(lab?'<div class="exjp-gh">'+esc(lab)+'</div>':'')+row(it,'');};
      const tj=todayJob();if(tj)add(tj,'📍 '+T('Your job today'));const nb=nearIds().filter(v=>v!==tj);nb.forEach((v,i)=>add(v,i?'':'📍 '+T('Near you')));
      let g=null;all.forEach(it=>{if(seen.has(it.v)&&it.v)return;if(!it.v){html+=row(it,'');return;}if(it.g!==g){g=it.g;if(g&&!/near you|cerca/i.test(g))html+='<div class="exjp-gh">'+esc(g)+'</div>';}if(/near you|cerca/i.test(it.g||'')&&seen.has(it.v))return;if(api.items.length<400)html+=row(it,'');});}
    else{const res=all.filter(it=>it.v).map(it=>[score(tk,it.h),it]).filter(z=>z[0]>0);const best=new Map();res.forEach(([s,it])=>{const p=best.get(it.v);if(!p||p[0]<s)best.set(it.v,[s,it]);});
      [...best.values()].sort((a,b)=>b[0]-a[0]).slice(0,40).forEach(([s,it])=>html+=row(it,''));
      if(!api.items.length)html='<div class="exjp-it" style="cursor:default;color:var(--g4)">'+T('No job matches')+' “'+esc(q)+'”</div>';}
    list.innerHTML=html;list.hidden=false;api.open=true;api.cur=0;hl();}
  function row(it){const i=api.items.length;api.items.push(it);const s=D.sites.find(z=>z.id===it.v);const sub=s&&typeof STAGE!=='undefined'&&STAGE[s.stage||'active']?T(STAGE[s.stage||'active'][0]):'';
    return '<div class="exjp-it" data-i="'+i+'"><span>'+(it.v?esc(it.l):'<i>'+esc(it.l||T('— none —'))+'</i>')+'</span>'+(sub?'<span class="s">'+esc(sub)+'</span>':'')+'</div>';}
  function hl(){[...list.querySelectorAll('.exjp-it[data-i]')].forEach((el,i)=>el.classList.toggle('on',i===api.cur));}
  function close(){list.hidden=true;api.open=false;}
  function pick(v){VSET.set.call(sel,v);api.refresh();close();sugw.innerHTML='';api._picking=true;try{sel.dispatchEvent(new Event('input',{bubbles:true}));sel.dispatchEvent(new Event('change',{bubbles:true}));}finally{api._picking=false;}}
  api.pick=pick;api.close=close;api.render=render;
  list.addEventListener('mousedown',e=>e.preventDefault());
  list.addEventListener('click',e=>{const el=e.target.closest('.exjp-it[data-i]');if(!el)return;const it=api.items[+el.dataset.i];if(it)pick(it.v);});
  inp.addEventListener('focus',()=>{if(sel.disabled)return;render();try{inp.select();}catch(e){}});
  inp.addEventListener('input',()=>{box.classList.remove('exjp-req');render();});
  inp.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){api.cur=Math.min(api.items.length-1,api.cur+1);hl();e.preventDefault();}else if(e.key==='ArrowUp'){api.cur=Math.max(0,api.cur-1);hl();e.preventDefault();}
    else if(e.key==='Enter'){if(api.open&&api.items[api.cur]){pick(api.items[api.cur].v);e.preventDefault();}}else if(e.key==='Escape'){close();}});
  inp.addEventListener('blur',()=>setTimeout(()=>{close();const v=VSET.get.call(sel);const l=v?labelOf(v):'';if(inp.value!==l)inp.value=l;},180)); // typing without picking never changes the job
  x.addEventListener('mousedown',e=>e.preventDefault());x.addEventListener('click',()=>{pick('');inp.focus();});
  // keep the box in step when the app sets the job in code (sel.value=…, selectedIndex, new options)
  Object.defineProperty(sel,'value',{configurable:true,get(){return VSET.get.call(sel);},set(v){VSET.set.call(sel,v);api.refresh();}});
  Object.defineProperty(sel,'selectedIndex',{configurable:true,get(){return ISET.get.call(sel);},set(v){ISET.set.call(sel,v);api.refresh();}});
  new MutationObserver(()=>api.refresh()).observe(sel,{childList:true,subtree:true});
  sel.addEventListener('change',()=>{if(!api._picking)api.refresh();});
  api.refresh();return api;}
window.EX_jobPick=jp;
function jpBlank(sel){if(!sel)return;if(![...sel.options].some(o=>o.value==='')){const o=document.createElement('option');o.value='';o.textContent='';o.disabled=true;o.hidden=true;sel.insertBefore(o,sel.firstChild);}VSET.set.call(sel,'');if(sel._jp)sel._jp.refresh();}
function jpSuggest(sel,id,why){const api=sel&&sel._jp;if(!api)return;const s=D.sites.find(x=>x.id===id);if(!s)return;
  api.box.querySelector('.exjp-sugw').innerHTML='<div class="exjp-sug">'+esc(why)+': <button type="button">'+T('Use')+' '+esc(s.name.split(',')[0])+'</button></div>';
  api.box.querySelector('.exjp-sug button').onclick=()=>{if(![...sel.options].some(o=>o.value===id)){const o=document.createElement('option');o.value=id;o.textContent=s.name;sel.appendChild(o);}api.pick(id);};}
function jpRequire(sel,msg){if(!sel)return true;const v=VSET.get.call(sel);if(v&&v!=='__none')return true;toast(msg||T('Pick the job'));const api=sel._jp;if(api){api.box.classList.add('exjp-req');setTimeout(()=>{try{api.inp.focus();}catch(e){}},50);}return false;}
window.EX_jobRequire=jpRequire;
// [opener, field id, blank on new?(args)=>bool]
const OPENERS=[
 ['openFix','fxSite',()=>true],
 ['openPunchEdit','peSite',a=>a[0]===null||a[0]===undefined],
 ['openExp','exSite',()=>true],
 ['openEst','esSite',()=>true],
 ['openSvc','svSite',a=>!a[0]],
 ['openPickup','puSite',()=>true],
 ['openStockIn','siSite',()=>true],
 ['renderTravel','tvSite',()=>false],
];
OPENERS.forEach(([fn,id,blank])=>wrap(fn,orig=>function(){const a=arguments;const r=orig.apply(this,a);safe(()=>{const sel=$(id);if(!sel)return;if(blank(a))jpBlank(sel);jp(sel);});return r;}));
wrap('openJob',orig=>function(){const r=orig.apply(this,arguments);safe(()=>{const sel=$('jSite');jpBlank(sel);jp(sel);
  document.querySelectorAll('#jAssign input[type=checkbox]').forEach(b=>{b.checked=(typeof jobFilter!=='undefined'&&b.value===jobFilter);});if(typeof jobWord==='function')jobWord();});return r;});
['openMeet'].forEach(fn=>wrap(fn,orig=>function(){const r=orig.apply(this,arguments);safe(()=>jp($('meSite')));return r;}));
wrap('openLoan',orig=>function(k,empId){const r=orig.apply(this,arguments);safe(()=>{const sel=$('loanSite');const who=$('loanEmp').value;const ex=who&&typeof loansFor==='function'?loansFor(who,k)[0]:null;if(!ex)jpBlank(sel);jp(sel);
  // switching the person shows that person's existing move (or a blank job)
  $('loanEmp').onchange=()=>openLoan(k,$('loanEmp').value);});return r;});
// material request: its own address search box — just start it empty
wrap('openMat',orig=>function(){const r=orig.apply(this,arguments);safe(()=>{const sel=$('mtSite');if(sel)VSET.set.call(sel,'');const sf=$('mtSiteFind');if(sf){sf.value='';sf.placeholder=T('Search or select a job');}});return r;});
// schedule "Add a job": blank until picked, and kept while switching Full day / Specific hours / Until reassigned
let addPick=null;
wrap('openSlot',orig=>function(){addPick=null;return orig.apply(this,arguments);});
wrap('renderSlotEditor',orig=>function(){const r=orig.apply(this,arguments);safe(()=>{const sel=$('slotAddSite');if(sel){if(addPick&&[...sel.options].some(o=>o.value===addPick))VSET.set.call(sel,addPick);else jpBlank(sel);jp(sel);sel.addEventListener('change',()=>{addPick=VSET.get.call(sel)||null;});}
  document.querySelectorAll('#slotBody select').forEach(s=>{if(s.id!=='slotAddSite'&&[...s.options].some(o=>D.sites.some(x=>x.id===o.value)))jp(s);});});return r;});
// saving: a required job must be picked on purpose
const REQ=[
 ['sendFix','fxSite'],['saveEst','esSite'],['savePickup','puSite'],
 ['slotAddFull','slotAddSite'],['slotAddSpecific','slotAddSite'],['slotAddOngoing','slotAddSite'],['saveLoan','loanSite'],
];
wrap('saveExp',orig=>function(){if(typeof exType!=='undefined'&&exType==='material'&&exFile&&!jpRequire($('exSite')))return;return orig.apply(this,arguments);});
REQ.forEach(([fn,id])=>wrap(fn,orig=>function(){if(!jpRequire($(id)))return;return orig.apply(this,arguments);}));
wrap('savePunchEdit',orig=>function(){if(!jpRequire($('peSite')))return;return orig.apply(this,arguments);});
wrap('saveStockIn',orig=>function(){const ss=$('siSite');const rs=typeof siRetSite!=='undefined'?siRetSite:null;if(!rs&&ss&&!VSET.get.call(ss)&&!($('siSrc').value||'').trim()){jpRequire(ss,T('Pick the job, or type the supplier'));return;}return orig.apply(this,arguments);});
// scanner finish sheet: the job starts blank (nearby jobs are one tap away at the top of the list)
wrap('scanFinish',orig=>function(){const r=orig.apply(this,arguments);safe(()=>{const sel=$('scJob');if(sel){jpBlank(sel);jp(sel);}});return r;});
wrap('scComplete',orig=>function(){const sel=$('scJob');const out=typeof scM!=='undefined'&&scM&&scM.mode==='out';const mode=typeof scFromMode!=='undefined'?scFromMode:'job';
  if(sel&&(out||mode==='job')&&!jpRequire(sel))return;return orig.apply(this,arguments);});
wrap('scFrom',orig=>function(k){const r=orig.apply(this,arguments);safe(()=>{const sel=$('scJob');if(sel&&sel._jp)sel._jp.box.style.display=k==='job'?'':'none';});return r;});
// stock-in label explains an empty job field
safe(()=>{const l=document.querySelector('label[data-i18n="From which job?"]');if(l&&!$('exSiHint')){const h=document.createElement('div');h.id='exSiHint';h.style.cssText='font-size:11.5px;color:var(--g4);margin:-2px 0 2px';h.textContent=T('Leave empty for a supplier delivery or new stock');l.insertAdjacentElement('afterend',h);}});

// ═════════ 1. universal search ═════════
let SR=[];let srExpand={};let srIdx=null;let srVer=0;window.EX_bumpData=()=>{srVer++;};
const prevAfterSave=window.EX_afterSave;window.EX_afterSave=function(){srVer++;if(prevAfterSave)try{prevAfterSave.apply(this,arguments);}catch(e){}};
const wide=m=>m.role!=='worker'||!!m.lead;
const dayLabel=k=>{const td=dkey(new Date());const tm=new Date();tm.setDate(tm.getDate()+1);if(k===td)return T('Today');if(k===dkey(tm))return T('Tomorrow');return new Date(k+'T12:00').toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'});};
const dayWords=k=>{const d=new Date(k+'T12:00');return [dayLabel(k),d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}),d.toLocaleDateString('es-US',{weekday:'long',month:'long'}),(d.getMonth()+1)+'/'+d.getDate(),k].join(' ');};
function buildIndex(){const m=me();const I=[];const add=(cat,ic,title,sub,go,parts,ts,extra)=>I.push(Object.assign({cat,ic,title,sub,go,h:hay(parts),ts:ts||0},extra||{}));
  // job sites & addresses
  safe(()=>visSites().forEach(s=>add('sites','📁',s.name,[s.client,s.crew?nameOf(s.crew):'',typeof STAGE!=='undefined'&&STAGE[s.stage||'active']?T(STAGE[s.stage||'active'][0]):''].filter(Boolean).join(' · '),()=>openSiteSafe(s.id),[s.name,s.client,s.phone,s.addr,s.note,s.trelloList,s.crew?nameOf(s.crew):'',s.manager?nameOf(s.manager):''],s.ts||0,{done:s.stage==='done'})));
  // tasks (+ their chat messages)
  safe(()=>visibleJobs().forEach(j=>{const tx=jobText(j);add('jobs',j.status==='done'?'✅':(j.pri?'🔴':'📋'),tx.split('\n')[0].slice(0,80),nameList(j)+(j.site?' · '+siteName(j.site).split(',')[0]:'')+(j.status==='done'?' · '+T('done'):''),()=>openTaskSafe(j.id),[j.desc,j.descTr,nameList(j),j.site?siteName(j.site):'',j.from?nameOf(j.from):''],j.ts,{done:j.status==='done'});
    Object.keys(j).forEach(k=>{if(k.slice(0,2)!=='m_')return;const c=j[k];if(!c||!c.text)return;add('msgs','💬',String(c.text).split('\n')[0].slice(0,80),nameOf(c.by)+' · '+tx.slice(0,40),()=>openTaskSafe(j.id),[c.text,nameOf(c.by)],c.ts);});}));
  // site folder notes
  safe(()=>visSites().forEach(s=>(s.notes||[]).forEach(n=>{if(!n||!n.text)return;add('msgs','🗒',String(n.text).split('\n')[0].slice(0,80),nameOf(n.by)+' · '+s.name.split(',')[0],()=>{openSiteSafe(s.id);setTimeout(()=>safe(()=>fdJump('fdNotes')),250);},[n.text,nameOf(n.by),s.name],n.ts);})));
  // schedule
  safe(()=>{const canAll=tabOk('sched');const today=new Date();today.setHours(12,0,0,0);const from=canAll?-21:0,to=canAll?60:1;
    for(let i=from;i<=to;i++){const d=new Date(today);d.setDate(d.getDate()+i);const k=dkey(d);const dw=dayWords(k);
      D.crews.forEach(c=>{if(!canAll&&c.id!==m.crew)return;const as=safe(()=>effectiveAsgs(c.id,k),[])||[];if(!as.length)return;const people=D.emps.filter(e=>e.crew===c.id&&!e.inactive).map(e=>e.name);
        add('sched','📅',c.name+' — '+dayLabel(k),as.map(a=>siteName(a.site).split(',')[0]+(a.start!=null&&typeof fMin==='function'?' '+fMin(a.start):'')).join(' · '),()=>openSchedSafe(c.id,k),[c.name,dw,people.join(' '),as.map(a=>siteName(a.site)+' '+(a.note||'')).join(' ')],d.getTime());});
      (typeof loansForDay==='function'?safe(()=>loansForDay(k),[]):[]).forEach(x=>{if(!canAll&&x.emp!==m.id)return;add('sched','↔',nameOf(x.emp)+' — '+dayLabel(k),siteName(x.a.site).split(',')[0],()=>openSchedSafe(null,k),[nameOf(x.emp),dw,siteName(x.a.site),x.a.note],d.getTime());});}});
  // material lists
  safe(()=>{if(!seesMat(m))return;const handler=canHandleMat(m);(D.mats||[]).filter(x=>handler||!!m.all||x.from===m.id||(m.crew&&D.emps.some(e=>e.id===x.from&&e.crew===m.crew))).forEach(x=>add('mats','📦',String(x.items||'').split('\n').find(l=>l.trim())||T('Material list'),siteName(x.site).split(',')[0]+' · '+nameOf(x.from)+' · '+T({open:'Needed',ordered:'Ordered',delivered:'Delivered'}[x.status]||x.status||''),()=>openMatSheet(x.id),[x.items,siteName(x.site),x.addr,nameOf(x.from)],x.ts,{done:x.status==='delivered'}));});
  // inventory
  safe(()=>{if(!wide(m))return;(D.stock||[]).forEach(x=>add('stock','🧰',x.name,T('Garage')+' · '+(x.qty==null?'—':x.qty)+' '+(x.unit||''),()=>openStockSafe(x.id),[x.name,x.cat,x.brand,x.model,(x.codes||[]).join(' ')],0));});
  // pick-ups & returns / inventory history
  safe(()=>{const staff=typeof mhStaff==='function'?mhStaff():isBoss(m);(D.stockLog||[]).filter(x=>staff||x.by===m.id).forEach(x=>{const its=(x.items||[]).map(i=>i.qty+'× '+i.name).join(', ');const kind={out:'📤',in:'📥',count:'🔢'}[x.kind]||'📜';
    add('hist',kind,its.slice(0,80)||T('Material history'),nameOf(x.by)+(x.site?' · '+siteName(x.site).split(',')[0]:'')+' · '+(typeof when==='function'?when(x.ts):''),()=>openHistSafe(x),[its,nameOf(x.by),x.site?siteName(x.site):'',x.src,x.reason,x.kind==='out'?'pick up take out pickup':x.kind==='in'?'put back return returned':'count'],x.ts);});});
  // employees
  safe(()=>{if(!wide(m))return;D.emps.filter(e=>!e.inactive||isBoss(m)).forEach(e=>add('emps','👤',e.name,T(e.title||ROLE_LABEL[e.role]||'')+(e.crew?' · '+nameOf(e.crew):'')+(e.inactive?' · '+T('inactive'):''),()=>openPerson(e.id),[e.name,e.title,ROLE_LABEL[e.role],e.crew?nameOf(e.crew):'',e.phone,e.email],0));});
  // hours & time records
  safe(()=>{const all=canEditHours(m);D.punches.forEach((p,i)=>{if(!all&&p.who!==m.id)return;if(!p||!p.in)return;const d=new Date(p.in);const k=dkey(d);
    add('hours','🕒',nameOf(p.who)+' — '+dayLabel(k),fmtT(p.in)+'–'+(p.out?fmtT(p.out):'…')+' · '+siteName(p.site).split(',')[0]+(p.voided?' · '+T('removed'):p.pending?' · '+T('waiting'):''),()=>openPunchSafe(p.id||i,all),[nameOf(p.who),siteName(p.site),dayWords(k)],p.in);});});
  // notes
  safe(()=>(typeof kMine==='function'?kMine():[]).filter(n=>!n.trashed).forEach(n=>add('notes','📝',n.title||String(n.body||'').split('\n')[0].slice(0,60)||T('Untitled'),(n.owner!==m.id?nameOf(n.owner)+' · ':'')+(typeof when==='function'?when(n.edited||n.created||0):''),()=>kOpen(n.id),[n.title,n.body,(n.items||[]).map(i=>i.t).join(' '),(n.labels||[]).join(' ')],n.edited||n.created)));
  // tools & service calls
  safe(()=>{if(!wide(m))return;(D.tools||[]).forEach(x=>add('tools','🔧',x.name,x.who?T('Out with')+' '+nameOf(x.who):T('In the garage'),()=>(typeof openTool==='function'?openTool(x.id):goTab('tools')),[x.name,x.cat,x.who?nameOf(x.who):''],0));});
  safe(()=>{if(!seesSvc(m))return;(D.tickets||[]).forEach(k=>add('svc','🛎',k.client||k.addr||T('Service call'),String(k.issue||'').split('\n')[0].slice(0,60),()=>openSvcDetail(k.id),[k.client,k.addr,k.phone,k.issue,k.site?siteName(k.site):''],k.ts,{done:k.status==='done'}));});
  return I;}
const CATS=[['sites','Job sites'],['jobs','Tasks'],['sched','Schedule'],['mats','Material lists'],['stock','Inventory'],['hist','Pick-ups & returns'],['emps','Employees'],['hours','Hours'],['notes','Notes'],['msgs','Messages'],['tools','Tools'],['svc','Service calls']];
// the index is rebuilt when search opens, and while it is open at most every 4 s if data changed (typing stays fast)
function getIndex(force){const who=(D.role||'')+'|'+lang();const now=Date.now();
  if(force||!srIdx||srIdx.who!==who||(srIdx.ver!==srVer&&now-srIdx.at>4000))srIdx={who,ver:srVer,at:now,I:buildIndex()};return srIdx.I;}
function hiLite(s,tk){let h=esc(s);tk.filter(k=>k.length>=2).sort((a,b)=>b.length-a.length).slice(0,4).forEach(k=>{try{h=h.replace(new RegExp('('+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig'),'<mark>$1</mark>');}catch(e){}});return h;}
let srTimer=null;
window.doSearch=function(){clearTimeout(srTimer);srTimer=setTimeout(runSearch,70);};
function runSearch(){const el=$('sqRes');const ans=$('sqAnswer');const q=($('sqInput').value||'').trim();if(ans)ans.innerHTML='';
  if(q.length<2){el.innerHTML='';SR=[];return;}
  const t0=performance.now();const tk=toks(q);const I=getIndex();const hits={};
  if(tk.length)for(const r of I){const s=score(tk,r.h);if(s>0)(hits[r.cat]=hits[r.cat]||[]).push([s-(r.done?4:0),r]);}
  SR=[];let html='';let any=false;
  CATS.forEach(([c,lab])=>{const L=hits[c];if(!L||!L.length)return;any=true;L.sort((a,b)=>b[0]-a[0]||(b[1].ts||0)-(a[1].ts||0));const lim=srExpand[c]?60:5;
    html+='<div class="exsr-g"><div class="exsr-h"><span>'+T(lab)+' · '+L.length+'</span>'+(L.length>5?'<button type="button" onclick="EX_srMore(\''+c+'\')">'+(srExpand[c]?'−':T('Show all')+' ›')+'</button>':'')+'</div>'+
      L.slice(0,lim).map(([s,r])=>{const i=SR.length;SR.push(r);return '<div class="sres" onclick="EX_srGo('+i+')"><div class="ic">'+r.ic+'</div><div style="flex:1;min-width:0"><div class="n">'+hiLite(r.title,tk)+'</div><div class="s">'+hiLite(r.sub||'',tk)+'</div></div></div>';}).join('')+'</div>';});
  el.innerHTML='<div id="exSrCards"></div>'+(any?html:'<div class="empty" id="exSrNone">'+T('Nothing found for')+' “'+esc(q)+'”</div>')+(typeof askClaudeSearch==='function'&&isBoss(me())&&window.EX_CFG&&EX_CFG.ai?'<div style="text-align:center;margin-top:10px"><span class="bs b" onclick="askClaudeSearch()">🤖 '+T('Ask Claude this question')+'</span></div>':'');
  window.EX_lastSearchMs=Math.round(performance.now()-t0);
  // "where is Jon / who is at …" answer cards fill in right after the list (they never slow the typing down)
  const myQ=q;setTimeout(()=>safe(()=>{if(($('sqInput').value||'').trim()!==myQ)return;const c=answerCards(myQ.toLowerCase())||'';const box=$('exSrCards');if(!box||!c)return;box.innerHTML=c;const none=$('exSrNone');if(none)none.remove();}),0);}
window.EX_srMore=function(c){srExpand[c]=!srExpand[c];runSearch();};
window.EX_srGo=function(i){const r=SR[i];if(!r)return;hide('m-search');setTimeout(()=>safe(()=>r.go()),30);};
window.EX_searchIndex=()=>getIndex(true);
wrap('openSearch',orig=>function(){srExpand={};getIndex(true);const r=orig.apply(this,arguments);safe(()=>{const i=$('sqInput');i.placeholder=T('Search jobs, addresses, people, material, tasks, notes, hours…');i.setAttribute('enterkeyhint','search');i.setAttribute('autocomplete','off');
  $('sqRes').innerHTML='<div style="font-size:13px;color:var(--g4);padding:8px 4px">'+T('Search everything')+': '+T('Job sites')+' · '+T('Tasks')+' · '+T('Schedule')+' · '+T('Material lists')+' · '+T('Inventory')+' · '+T('Employees')+' · '+T('Hours')+' · '+T('Notes')+'</div>';});return r;});
// Ctrl/⌘-K or "/" opens search on a computer
document.addEventListener('keydown',e=>{const tg=(e.target&&e.target.tagName)||'';if(((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k')||(e.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(tg)&&!e.target.isContentEditable)){if(!me()||!$('m-login')||!$('m-login').classList.contains('hid'))return;e.preventDefault();openSearch();}});
// openers used by search and notifications
const tabOk=n=>{const b=document.querySelector('.tab[onclick*="\''+n+'\'"]');return !!b&&b.dataset.allowed==='1';};
function openSiteSafe(id){if(tabOk('sites'))goTab('sites');openFolder(id);}
function openTaskSafe(id){const j=D.jobs.find(q=>q.id===id);if(!j){toast(T('Nothing to open for this one'));return;}if(tabOk('jobs')){jobFilter='all';jobView=j.status==='done'?'done':'open';goTab('jobs');}openJobDetail(id);}
function openSchedSafe(crew,k){if(tabOk('sched')){goTab('sched');if(crew&&typeof schedCanEdit==='function'&&schedCanEdit()){schedCrew=crew;setTimeout(()=>safe(()=>openSlot(k)),60);}return;}if(tabOk('punch'))goTab('punch');else if(tabOk('home'))goTab('home');}
function openStockSafe(id){if(typeof mhStaff==='function'&&mhStaff()){openMatHist({item:id});return;}goTab('tools');}
function openHistSafe(x){const one=(x.items||[]).length===1?x.items[0].id:null;if(one&&D.stock.some(s=>s.id===one))openMatHist({item:one});else if(x.site)openMatHist({site:x.site});else openMatHist({by:x.by});}
function openPunchSafe(id,all){if(all){const i=typeof id==='number'?id:D.punches.findIndex(p=>p.id===id);if(i>=0){if(tabOk('hours'))goTab('hours');openPunchEdit(i);return;}}if(tabOk('punch'))goTab('punch');}
window.EX_openSite=openSiteSafe;window.EX_openTask=openTaskSafe;window.EX_openSched=openSchedSafe;
// person cards: hours, punch status and time off only for people allowed to see them (Owner, all-access, Payroll,
// site managers, and a crew leader for his own crew); everyone else gets name, job title and crew
const seesPersonTime=(m,e)=>!!m&&!!e&&(m.id===e.id||canEditHours(m)||m.role==='owner'||!!m.all||m.role==='manager'||(!!m.lead&&!!m.crew&&e.crew===m.crew));
wrap('personCard',orig=>function(e){const m=me();if(seesPersonTime(m,e))return orig.apply(this,arguments);
  return '<div class="card" style="padding:12px"><div style="font-weight:700;font-size:16px">👤 '+esc(e.name)+'</div><div style="font-size:12.5px;color:var(--g4);margin-top:2px">'+esc(T(e.title||ROLE_LABEL[e.role]||''))+(e.crew?' · '+esc(nameOf(e.crew)):'')+'</div></div>';});
// detail sheet (material list, person)
function sheet(html){let o=$('m-exd');if(!o){o=document.createElement('div');o.className='ov hid';o.id='m-exd';o.innerHTML='<div class="md"><div class="hd"></div><div id="exdBody"></div><button class="btn sec2" style="margin-top:12px" onclick="hide(\'m-exd\')">'+T('Close')+'</button></div>';document.body.appendChild(o);o.addEventListener('click',e=>{if(e.target===o)hide('m-exd');});}
  $('exdBody').innerHTML=html;show('m-exd');}
function openMatSheet(id){const x=D.mats.find(y=>y.id===id);if(!x){goTab('mat');return;}const title=T('Material list')+' — '+siteName(x.site);
  sheet('<h2 style="margin-bottom:2px">📦 '+esc(siteName(x.site))+'</h2><div style="font-size:12.5px;color:var(--g4);margin-bottom:8px">'+T('from')+' '+esc(nameOf(x.from))+' · '+esc(T(x.when||''))+' · '+esc(T({open:'Needed',ordered:'Ordered',delivered:'Delivered'}[x.status]||''))+'</div>'+
    '<div class="card" style="padding:12px">'+ptx(x.items)+'</div>'+shareBar(title,x.items)+(tabOk('mat')?'<button class="btn" style="margin-top:10px" onclick="hide(\'m-exd\');goTab(\'mat\')">'+T('Open in Material')+'</button>':''));}
window.EX_openMat=openMatSheet;
function openPerson(id){const e=D.emps.find(x=>x.id===id);if(!e)return;const m=me();const btns=[];
  if(getsTasks(e)||e.role==='worker')btns.push('<button class="btn sec2" style="flex:1" onclick="hide(\'m-exd\');jobFilter=\''+jsq(e.id)+'\';jobView=\'open\';goTab(\'jobs\')">📋 '+T('Tasks')+'</button>');
  if(canEditHours(m)&&CR(e))btns.push('<button class="btn sec2" style="flex:1" onclick="hide(\'m-exd\');goTab(\'hours\');setTimeout(()=>{try{dashEmp(\''+jsq(e.id)+'\')}catch(x){}},80)">🕒 '+T('Hours')+'</button>');
  if(e.crew&&tabOk('sched'))btns.push('<button class="btn sec2" style="flex:1" onclick="hide(\'m-exd\');goTab(\'sched\')">📅 '+T('Schedule')+'</button>');
  if(canManageUsers(m)||m.role==='owner')btns.push('<button class="btn sec2" style="flex:1" onclick="hide(\'m-exd\');openEmp(\''+jsq(e.id)+'\')">✎ '+T('Edit employee')+'</button>');
  sheet(safe(()=>personCard(e),'<h2>'+esc(e.name)+'</h2>')+(!CR(e)?'<div style="font-size:12.5px;color:var(--g4);margin:6px 0">⏱ '+T('No time clock')+'</div>':'')+'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">'+btns.join('')+'</div>');}
window.EX_openPerson=openPerson;

// ═════════ 3 (display): show text with its line breaks wherever people read it ═════════
// copy / share / print on a task and a service call
wrap('openJobDetail',orig=>function(id){const r=orig.apply(this,arguments);safe(()=>{const j=D.jobs.find(x=>x.id===id);const b=$('jobdBody');if(!j||!b||b.querySelector('.exshare'))return;const h=b.querySelector('h2');const host=b.querySelector('div[style*="flex-wrap:wrap"]');const bar=document.createElement('div');bar.innerHTML=shareBar(nameList(j)+(j.site?' — '+siteName(j.site):''),jobText(j));(host||h).insertAdjacentElement('afterend',bar.firstChild);});return r;});
wrap('openSvcDetail',orig=>function(id){const r=orig.apply(this,arguments);safe(()=>{const k=D.tickets.find(x=>x.id===id);if(!k)return;const m=document.querySelector('#m-svcd .md, #m-svcdet .md');const body=m||document.querySelector('.ov:not(.hid) .md');if(!body||body.querySelector('.exshare'))return;const d=document.createElement('div');d.innerHTML=shareBar(T('Service call')+' — '+(k.client||k.addr||''),[k.client,k.phone,k.addr||(k.site?siteName(k.site):''),'',k.issue].filter(x=>x!==undefined&&x!==null).join('\n'));const h=body.querySelector('h2');if(h)h.insertAdjacentElement('afterend',d.firstChild);});return r;});
// notes: copy / share / print in the note editor
wrap('kRender',orig=>function(){const r=orig.apply(this,arguments);safe(()=>{const n=kGet&&kGet();const ed=$('kEd');if(!n||!ed)return;let bar=$('exKShare');const text=n.type==='list'?(n.items||[]).map(i=>(i.done?'☑ ':'☐ ')+i.t).join('\n'):(n.body||'');
  if(!bar){bar=document.createElement('div');bar.id='exKShare';ed.insertAdjacentElement('afterend',bar);}bar.innerHTML=shareBar(n.title||T('Note'),text);});return r;});

// ═════════ 4. notifications: bell, history, read / unread, open the exact item ═════════
let nView='all',nTab='n';
const myN=()=>{const m=me();return m?D.inbox.filter(x=>x.to===m.id).sort((a,b)=>(b.ts||0)-(a.ts||0)):[];};
const nIcon=x=>/^\s*\p{Extended_Pictographic}/u.test(x.msg||'')?'':(x.kind==='pri'?'🔴':x.kind==='mat'?'📦':x.kind==='warn'?'⚠️':'🔔');
// dedupe: the very same alert to the same person within a minute (double tap, retry) is sent once — nothing else is held back
wrap('pushTo',orig=>function(ids,msg,kind,link){const now=Date.now();const lk=JSON.stringify(link||null);
  const ex=new Set(D.inbox.filter(n=>n.msg===msg&&JSON.stringify(n.link||null)===lk&&now-(n.ts||0)<60000).map(n=>n.to));
  if(!ex.size)return orig.apply(this,arguments);
  const list=[];(ids||[]).forEach(id=>{const c=crewOf(id);if(c)D.emps.filter(e=>e.crew===c.id).forEach(e=>list.push(e.id));else list.push(id);});
  const rest=[...new Set(list)].filter(id=>!ex.has(id));if(!rest.length)return;return orig.call(this,rest,msg,kind,link);});
// note shared → opens that note (was a screen that does not exist)
wrap('kCollab',orig=>function(id,on){const n=kGet&&kGet();const before=D.inbox.length;const r=orig.apply(this,arguments);safe(()=>{if(!n)return;for(let i=0;i<D.inbox.length-before;i++){const x=D.inbox[i];if(x&&x.to===id&&x.link&&x.link.tab==='notes'){x.link={note:n.id};}}save();});return r;});
// a note changed by one person → the others it is shared with get one notice (per 10 minutes per note)
let kSnap=null;const kNoticeAt={};
wrap('kOpen',orig=>function(id){const r=orig.apply(this,arguments);safe(()=>{const n=kGet();kSnap=n?{id:n.id,s:JSON.stringify([n.title,n.body,n.items])}:null;});return r;});
wrap('kClose',orig=>function(){let n=null,changed=false;safe(()=>{n=kGet();changed=!!(n&&kSnap&&kSnap.id===n.id&&JSON.stringify([n.title,n.body,n.items])!==kSnap.s);});const r=orig.apply(this,arguments);
  safe(()=>{if(!changed||!n||!D.keep.some(x=>x.id===n.id))return;const m=me();const to=[n.owner,...(n.collab||[])].filter(x=>x&&x!==m.id);if(!to.length)return;
    if(Date.now()-(kNoticeAt[n.id]||0)<600000)return;kNoticeAt[n.id]=Date.now();
    pushTo(to,'📝 '+nameOf(m.id)+' '+T('updated the note')+': '+(n.title||String(n.body||'').split('\n')[0].slice(0,40)||T('Untitled')),'info',{note:n.id});});kSnap=null;return r;});
// crew leader / crew manager changes tell the person
wrap('toggleLead',orig=>function(id){const r=orig.apply(this,arguments);safe(()=>{const e=D.emps.find(x=>x.id===id);if(e)pushTo([id],e.lead?'★ '+T('You are now a crew leader — you get tasks for your crew'):'★ '+T('You are no longer a crew leader'),'info',{tab:'jobs'});});return r;});
wrap('toggleMgr',orig=>function(cid,mid,on){const r=orig.apply(this,arguments);safe(()=>{if(on&&mid!==me().id){const c=crewOf(cid);pushTo([mid],'👷 '+T('You now manage')+' '+(c?c.name:''),'info',{tab:'sched'});}});return r;});
// open what a notification points to (new kinds: a note, a material list, a schedule day)
wrap('nGo',orig=>function(id){const x=D.inbox.find(n=>n.id===id);const l=x&&safe(()=>nLinkFor(x));
  if(x&&l&&(l.note||l.mat||l.sched||l.tab==='notes'||l.hours)){x.read=true;save();renderBell();hide('m-inbox');
    if(l.note){if(D.keep.some(k=>k.id===l.note))kOpen(l.note);else openKeep();return;}
    if(l.tab==='notes'){openKeep();return;}
    if(l.mat){openMatSheet(l.mat);return;}
    if(l.sched){openSchedSafe(l.crew||null,l.sched);return;}
    if(l.hours){if(tabOk('hours'))goTab('hours');else if(tabOk('punch'))goTab('punch');return;}}
  return orig.apply(this,arguments);});
// the bell opens "My Tasks & Notifications"; the list no longer marks everything read just by opening it
window.openInbox=function(tab){if(tab)nTab=tab;renderInbox();show('m-inbox');};
function renderInbox(){const box=$('m-inbox');if(!box)return;const md=box.querySelector('.md');let body=$('exNBody');
  if(!body){md.innerHTML='<div class="hd"></div><h2 style="margin-bottom:6px">'+T('My Tasks & Notifications')+'</h2><div class="exn-tabs"><button type="button" id="exNTabN" onclick="EX_nTab(\'n\')"></button><button type="button" id="exNTabT" onclick="EX_nTab(\'t\')"></button></div><div id="exNBody"></div><div id="inboxList" hidden></div><button class="btn sec2" style="margin-top:12px" onclick="hide(\'m-inbox\')">'+T('Close')+'</button>';body=$('exNBody');}
  const L=myN();const un=L.filter(x=>!x.read).length;const mt=myTasks();
  $('exNTabN').textContent='🔔 '+T('Notifications')+(un?' ('+un+')':'');$('exNTabT').textContent='✅ '+T('My Tasks')+(mt.attn?' ('+mt.attn+')':'');
  $('exNTabN').classList.toggle('on',nTab==='n');$('exNTabT').classList.toggle('on',nTab==='t');
  if(nTab==='t'){body.innerHTML=mt.html;return;}
  const list=nView==='unread'?L.filter(x=>!x.read):L;
  body.innerHTML='<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><div class="chip '+(nView==='all'?'on':'')+'" onclick="EX_nView(\'all\')">'+T('All')+'</div><div class="chip '+(nView==='unread'?'on':'')+'" onclick="EX_nView(\'unread\')">'+T('Unread')+(un?' · '+un:'')+'</div><span style="flex:1"></span>'+(un?'<button class="bs b" onclick="EX_nAllRead()">✓ '+T('Mark all read')+'</button>':'')+'</div>'+
    pushHint()+
    (list.length?list.slice(0,300).map(x=>'<div class="exn-row'+(x.read?' read':'')+'" onclick="nGo(\''+jsq(x.id)+'\')"><button type="button" class="exn-dot" title="'+esc(T(x.read?'Mark unread':'Mark read'))+'" aria-label="'+esc(T(x.read?'Mark unread':'Mark read'))+'" onclick="event.stopPropagation();EX_nToggle(\''+jsq(x.id)+'\')"><span></span></button><div style="flex:1;min-width:0"><div class="exn-msg">'+nIcon(x)+' '+esc(x.msg)+'</div><div class="exn-meta"><span>'+(typeof when==='function'?when(x.ts):'')+(x.from&&x.from!=='server'?' · '+esc(nameOf(x.from)):'')+'</span><span style="color:var(--blue-mid)">'+T('Open')+' ›</span></div></div></div>').join(''):'<div class="empty">'+T('Nothing yet.')+'</div>')+
    (typeof EX_loadRange==='function'?'<div style="text-align:center;margin-top:10px"><button class="bs" onclick="EX_nOlder()">'+T('Load older')+'</button></div>':'');}
function pushHint(){const ok='Notification'in window&&Notification.permission==='granted';if(ok||!('Notification'in window)||!window.EX_pushOn)return '';
  return '<div class="card" style="padding:9px 12px;margin:6px 0;font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:8px"><span>📱 '+T('Turn on phone notifications')+'</span><button class="bs b" onclick="Promise.resolve(EX_pushOn(true)).catch(()=>{}).then(()=>renderInboxSafe())">'+T('Turn on')+'</button></div>';}
window.renderInboxSafe=()=>safe(renderInbox);
window.EX_nTab=k=>{nTab=k;renderInbox();};window.EX_nView=k=>{nView=k;renderInbox();};
window.EX_nToggle=id=>{const x=D.inbox.find(n=>n.id===id);if(!x)return;x.read=!x.read;save();renderBell();renderInbox();};
window.EX_nAllRead=()=>{myN().forEach(x=>{if(!x.read)x.read=true;});save();renderBell();renderInbox();};
window.EX_nOlder=async()=>{try{const old=myN().map(x=>x.ts||0);const from=Math.min(...old,Date.now())-60*86400000;await EX_loadRange('inbox',from,Math.min(...old,Date.now()));}catch(e){}renderInbox();};
// "My Tasks": everything that needs this person, in one place
function myTasks(){const m=me();if(!m)return {html:'',attn:0};const secs=[];let attn=0;const now=Date.now();const it=(ic,txt,sub,act)=>'<div class="exmt-it" onclick="'+act+'"><span>'+ic+' '+esc(txt)+'</span><span class="s">'+esc(sub||'')+' ›</span></div>';
  const sec=(title,rows,count)=>{if(rows.length)secs.push('<div class="exmt-sec"><h4><span>'+title+'</span><span>'+(count==null?rows.length:count)+'</span></h4>'+rows.slice(0,25).join('')+'</div>');};
  // approvals
  const ap=[];
  if(canApproveTO(m))D.timeoff.filter(r=>r.status==='pending').forEach(r=>ap.push(it('🏖',nameOf(r.who)+' — '+T('Time off'),r.from+(r.to&&r.to!==r.from?' → '+r.to:''),"hide('m-inbox');goTab('"+(tabOk('hours')?'hours':'home')+"')")));
  if(canEditHours(m)){D.fixes.filter(f=>f.status==='pending').forEach(f=>ap.push(it('🕒',nameOf(f.who)+' — '+T('Punch fixes'),f.date,"hide('m-inbox');goTab('hours')")));
    D.punches.filter(p=>p.pending&&p.lateEntry&&!p.voided).forEach(p=>ap.push(it('⏰',nameOf(p.who)+' — '+T('Late clock entries'),dayLabel(dkey(new Date(p.in))),"hide('m-inbox');goTab('hours')")));}
  if(isBoss(m))D.punches.filter(p=>p.pending&&!p.lateEntry&&!p.rejected).forEach(p=>ap.push(it('📍',nameOf(p.who)+' — '+T('Office clock-in requests'),siteName(p.site).split(',')[0],"hide('m-inbox');openFence('"+jsq(p.site)+"')")));
  if(seesEst(m)&&(m.role==='owner'||m.all))D.ests.filter(x=>x.status==='open').forEach(x=>ap.push(it('📐',T('Estimates to price / approve'),siteName(x.site).split(',')[0],"hide('m-inbox');estFilter='open';goTab('est')")));
  if(canHandleMat(m))D.mats.filter(x=>x.status==='open').forEach(x=>ap.push(it('📦',T('Material to handle')+': '+(String(x.items||'').split('\n')[0]).slice(0,40),siteName(x.site).split(',')[0],"hide('m-inbox');EX_openMat('"+jsq(x.id)+"')")));
  attn+=ap.length;sec('⏳ '+T('Waiting for my approval'),ap);
  // tasks assigned to me (or my crew)
  const mine=D.jobs.filter(j=>has(j,m.id)||(m.crew&&getsTasks(m)&&has(j,m.crew)));
  const open=mine.filter(j=>j.status!=='done');
  const unreadJob=new Set(D.inbox.filter(x=>x.to===m.id&&!x.read&&x.link&&x.link.job).map(x=>x.link.job));
  const isNew=j=>unreadJob.has(j.id)||now-(j.ts||0)<36*3600000; // a notice not read yet, or sent in the last day and a half
  const isOver=j=>j.status==='ov'||(j.dueAt&&j.dueAt<now);
  const row=j=>it(j.pri?'🔴':(isOver(j)?'⏰':'📋'),jobText(j).split('\n')[0].slice(0,60),(j.site?siteName(j.site).split(',')[0]:'')+(j.from?' · '+nameOf(j.from):''),"hide('m-inbox');EX_openTask('"+jsq(j.id)+"')");
  const nw=open.filter(isNew),ov=open.filter(isOver),pend=open.filter(j=>!isNew(j)&&!isOver(j));
  attn+=nw.length+ov.length;
  sec('🆕 '+T('New assignments'),nw.map(row));sec('⏰ '+T('Overdue'),ov.map(row));sec('📋 '+T('Pending'),pend.map(row));
  // service calls, meetings, schedule, notes
  sec('🛎 '+T('Service calls for me'),(D.tickets||[]).filter(k=>k.status!=='done'&&(k.to===m.id||(m.crew&&k.to===m.crew))).map(k=>it('🛎',k.client||k.addr||'',String(k.issue||'').slice(0,30),"hide('m-inbox');openSvcDetail('"+jsq(k.id)+"')")));
  sec('📅 '+T('Meetings'),(D.meets||[]).filter(x=>x.at>now-3600000&&x.at<now+7*86400000&&(x.by===m.id||(x.with||[]).includes(m.id))).sort((a,b)=>a.at-b.at).map(x=>it('📅',x.title||T('Meeting'),new Date(x.at).toLocaleString(LOC(),{weekday:'short',hour:'numeric',minute:'2-digit'}),"hide('m-inbox');goTab('cal')")));
  if(m.crew){const ks=[0,1].map(i=>{const d=new Date();d.setDate(d.getDate()+i);return dkey(d);});const rows=[];ks.forEach(k=>{const as=safe(()=>effectiveAsgs(m.crew,k),[])||[];const lo=typeof loansFor==='function'?safe(()=>loansFor(m.id,k),[]):[];[...as,...lo].forEach(a=>rows.push(it('📅',dayLabel(k)+': '+siteName(a.site).split(',')[0],a.start!=null&&typeof fMin==='function'?fMin(a.start):'',"hide('m-inbox');EX_openSched('"+jsq(m.crew)+"','"+k+"')")));});sec('📅 '+T('My schedule'),rows);}
  sec('📝 '+T('Notes shared with me'),(D.keep||[]).filter(n=>!n.trashed&&!n.archived&&n.owner!==m.id&&(n.collab||[]).includes(m.id)).sort((a,b)=>(b.edited||0)-(a.edited||0)).slice(0,8).map(n=>it('📝',n.title||String(n.body||'').split('\n')[0].slice(0,40)||T('Untitled'),nameOf(n.owner),"hide('m-inbox');kOpen('"+jsq(n.id)+"')")));
  sec('✅ '+T('Completed'),mine.filter(j=>j.status==='done'&&now-(j.doneAt||j.ts||0)<14*86400000).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0)).map(j=>it('✅',jobText(j).split('\n')[0].slice(0,60),j.site?siteName(j.site).split(',')[0]:'',"hide('m-inbox');EX_openTask('"+jsq(j.id)+"')")));
  const extra=(!CR(m)&&typeof reqTimeOff==='function'&&m.role!=='owner')?'<div style="margin-top:14px"><button class="btn sec2" onclick="hide(\'m-inbox\');reqTimeOff()">🏖 '+T('Request time off')+'</button></div>':'';
  return {attn,html:(secs.length?secs.join(''):'<div class="empty">✓ '+T('All clear')+'</div>')+extra};}
window.EX_myTasks=myTasks;
// bell count + app-icon badge; a toast when notifications arrive after being offline
let lastUn=null;
wrap('renderBell',orig=>function(){const r=orig.apply(this,arguments);safe(()=>{const m=me();if(!m)return;const un=D.inbox.filter(x=>x.to===m.id&&!x.read).length;
  if(lastUn!==null&&un>lastUn&&document.visibilityState==='visible'&&$('m-inbox').classList.contains('hid')){const k=un-lastUn;if(k>1)toast('🔔 '+k+' '+T('new notifications'),'blue');}
  lastUn=un;try{if(navigator.setAppBadge){un?navigator.setAppBadge(un):navigator.clearAppBadge();}}catch(e){}
  if(!$('m-inbox').classList.contains('hid'))renderInbox();});return r;});
// the bell stays current even while someone is typing (the screen itself waits until they stop)
setInterval(()=>safe(()=>{const m=me();if(!m||lastUn===null)return;const un=D.inbox.filter(x=>x.to===m.id&&!x.read).length;if(un!==lastUn)renderBell();}),2000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')safe(renderBell);});
// tapping a phone notification opens the exact item: the service worker sends the alert id (#n=… or a message)
function openFromPush(id,link){if(!id)return;let tries=0;const go=()=>{if(!me()||!$('m-login')||!$('m-login').classList.contains('hid')){if(++tries<40)return setTimeout(go,500);return;}
  const x=D.inbox.find(n=>n.id===id);if(x){nGo(id);return;}
  if(++tries===3&&window.EX_catchUp)safe(()=>EX_catchUp());
  if(tries<20)return setTimeout(go,600);
  openInbox('n');};go();} // not this person's alert (or not arrived): show their own list, never someone else's item
function hashN(){const h=location.hash||'';const mm=h.match(/[#&]n=([A-Za-z0-9_-]+)/);if(!mm)return;let link=null;const lm=h.match(/[#&]l=([^&]+)/);if(lm)try{link=JSON.parse(decodeURIComponent(lm[1]));}catch(e){}
  try{history.replaceState(history.state,'',location.pathname+location.search);}catch(e){}openFromPush(mm[1],link);}
window.addEventListener('hashchange',hashN);setTimeout(hashN,0);
if(navigator.serviceWorker)navigator.serviceWorker.addEventListener('message',e=>{const d=e.data||{};if(d.type==='ex-open-n')openFromPush(d.id,d.link||null);});
window.EX_openFromPush=openFromPush;
// the person using this phone now is the one it notifies: refresh the phone's sign-up time on start (at most hourly),
// so if someone else used this phone before, the server sends to the newest person only
if(typeof window.EX_pushOn==='function')wrap('EX_pushOn',orig=>async function(){const r=await orig.apply(this,arguments);try{if(r==='granted'){const m=me();const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();const ep=sub&&sub.endpoint;
  const row=ep&&(D.push||[]).find(x=>x.who===m.id&&x.sub&&x.sub.endpoint===ep);if(row&&Date.now()-(row.ts||0)>3600000){row.ts=Date.now();save();}}}catch(e){}return r;});
// signing out: this phone stops getting the person's notifications (the next person signs it up for themselves)
if(typeof window.EX_logout==='function')wrap('EX_logout',orig=>async function(){try{const m=me();if(m&&navigator.serviceWorker&&D.push&&D.push.length){const reg=await navigator.serviceWorker.ready;const sub=reg&&reg.pushManager?await reg.pushManager.getSubscription():null;
  const ep=sub&&sub.endpoint;if(ep){const n0=D.push.length;D.push=D.push.filter(x=>!(x.who===m.id&&x.sub&&x.sub.endpoint===ep));if(D.push.length!==n0)save();}}}catch(e){}return orig.apply(this,arguments);});

// ═════════ More screen + home: a way into My Tasks ═════════
wrap('renderMore',orig=>function(){const r=orig.apply(this,arguments);safe(()=>{const g=document.querySelector('#pg-more .grid, #moreGrid, #pg-more');if(!g||$('exMoreMine'))return;const b=document.createElement('div');b.id='exMoreMine';b.className='card';b.style.cssText='padding:12px 14px;cursor:pointer;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center';b.innerHTML='<b>✅ '+T('My Tasks & Notifications')+'</b><span style="color:var(--blue-mid)">›</span>';b.onclick=()=>openInbox('t');g.prepend(b);});return r;});

// first paint
safe(()=>{applyTabs();renderBell();});
})();
