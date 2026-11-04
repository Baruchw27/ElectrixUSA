/* p13.js — New job screen (Baruch approved 11/3, "soft cards · Top A cleaned up").
   Opens instead of the old job folder. Top to bottom:
     photos (tap = gallery, camera = add photo) · stage + "Mark rough done" · address (tap = Google Maps)
     · Site manager + small "+" · "Crew here" (only while someone is clocked in there)
     · Directions / Job info / Reports · Tasks · Notes (readable right here) · Files (tiles) · O&R (only if the job has it)
     · small line: inspection scheduled / ready for inspection · "All details" (the old folder, for everything else).
   Job info: owner name + phone, permit, address, site manager, GPS fence, extra fields (office/owner can edit).
   Reports (owner / managers / office): this week · last week · this month · all → hours, who was here, schedule, material, money.
   Same data as before: D.sites, D.jobs, s.notes (shared job notes), s.files / s.links, D.orr, D.insp, D.punches, D.exps.
   English + Spanish, light + dark. Off switch: window.EX_P13_OFF. */
(function(){
'use strict';
if(window.EX_P13_OFF)return;
const $=id=>document.getElementById(id);
const M=()=>{try{return me()}catch(e){return null}};
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const J=s=>String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const ES_ON=()=>{try{return lang()==='es'}catch(e){return false}};
const S_ES={'Mark rough done':'Marcar rough terminado','Ready for finishing':'Listo para terminación','Site manager':'Encargado','Site managers':'Encargados',
'No site manager yet':'Sin encargado todavía','here':'aquí','on site':'en el sitio','people here':'personas aquí','Directions':'Cómo llegar','Job info':'Info del trabajo','Reports':'Reportes',
'Tasks':'Tareas','All':'Todas','Notes':'Notas','Note':'Nota','Files':'Archivos','No open tasks':'No hay tareas abiertas','No notes yet — add the first one so everyone on the job sees it.':'Todavía no hay notas — agrega la primera para que todos en el trabajo la vean.',
'No files yet':'Todavía no hay archivos','Add file':'Agregar archivo','Add link':'Agregar enlace','Inspection scheduled':'Inspección agendada','Inspection booked':'Inspección agendada','O&R request':'Pedido O&R','Photo':'Foto','Remove job':'Quitar trabajo','Remove this job?':'¿Quitar este trabajo?','Remove this file?':'¿Quitar este archivo?','Remove this link?':'¿Quitar este enlace?','Rename file':'Cambiar nombre','Rename':'Cambiar nombre','Replace':'Reemplazar','Delete':'Borrar','Share':'Compartir','Open':'Abrir','Link':'Enlace','File':'Archivo','More':'Más','Inspection requested':'Inspección pedida','Inspections':'Inspecciones','Booked':'Agendada','Passed':'Pasó','Failed':'Falló','Waiting to be booked':'Esperando agendar','booked by':'agendada por','No inspections yet':'Todavía no hay inspecciones','Rough inspection':'Inspección de rough','Final inspection':'Inspección final','Inspection':'Inspección','Inspection requested — waiting to be booked':'Inspección pedida — esperando agendar',
'Ready for inspection':'Listo para inspección','All details':'Todos los detalles','photos':'fotos','No photos yet':'Todavía no hay fotos','Add the first photo':'Agrega la primera foto',
'Owner':'Dueño','Name':'Nombre','Phone':'Teléfono','Permit':'Permiso','Permit #':'Permiso #','Job':'Trabajo','Address':'Dirección','GPS fence':'Cerca GPS','Edit':'Editar','Save':'Guardar','Cancel':'Cancelar',
'Add a field':'Agregar un campo','Field name':'Nombre del campo','Value':'Valor','Not set':'Sin poner','This week':'Esta semana','Last week':'Semana pasada','This month':'Este mes',
'Hours':'Horas','People':'Personas','Spent':'Gastado','Who was here':'Quién estuvo','Schedule':'Horario','Material':'Material','Money spent':'Dinero gastado',
'Per person, per day':'Por persona, por día','Came and left, each day':'Llegó y salió, cada día','Ordered and from the garage':'Pedido y del garaje','Material · gas · receipts':'Material · gasolina · recibos',
'Next 7 days':'Próximos 7 días','Nobody scheduled here this week':'Nadie agendado aquí esta semana','No hours in this period.':'No hay horas en este período.','Nothing spent in this period.':'Nada gastado en este período.',
'On site':'En el sitio','now':'ahora','Today':'Hoy','Write a note for everyone on this job…':'Escribe una nota para todos en este trabajo…','Add note':'Agregar nota','Remove this note?':'¿Quitar esta nota?','Remove':'Quitar',
'Add a site manager':'Agregar un encargado','Done':'Hecho','open':'abiertas','done':'hechas','Open tasks':'Tareas abiertas','Done tasks':'Tareas hechas','Photos':'Fotos','Links':'Enlaces','Add task':'Agregar tarea',
'Call':'Llamar','Text':'Mensaje','O&R':'O&R','Step':'Paso','Everything else about this job (GPS, sharing, remove)':'Todo lo demás de este trabajo (GPS, compartir, quitar)'};
const T=s=>{if(ES_ON()&&S_ES[s])return S_ES[s];try{const r=t(s);return r||s}catch(e){return s}};
const P13=window.P13={};
const ic={back:'<path d="m15 6-6 6 6 6"/>',more:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
 cam:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
 img:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
 nav:'<path d="M3 11l18-8-8 18-2-8-8-2z"/>',key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M16 7l3 3M19 4l2 2"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0"/>',tick:'<path d="m5 12 5 5 9-10"/>',plus:'<path d="M12 5v14M5 12h14"/>',chev:'<path d="m9 6 6 6-6 6"/>',
 bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
 insp:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
 box:'<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
 dollar:'<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',x:'<path d="M18 6 6 18M6 6l12 12"/>',edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',upload:'<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',share:'<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',msg:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'};
const I=(n,cls)=>'<svg class="j2i'+(cls?' '+cls:'')+'" viewBox="0 0 24 24">'+(ic[n]||'')+'</svg>';

/* ---------- styles ---------- */
const css=document.createElement('style');css.textContent=`
#m-job2,#m-j2s,#m-j2t{--j2bg:#f4f4f6;--j2card:#fff;--j2ink:#0f1115;--j2ink2:#3c4049;--j2mut:#80858f;--j2line:#eeeff1;--j2chip:#f1f2f4;--j2tile:#f6f7f9;--j2ok:#1e8e4e;--j2okS:#e6f4ec}
html[data-theme=dark] #m-job2,html[data-theme=dark] #m-j2s,html[data-theme=dark] #m-j2t{--j2bg:#0e0f12;--j2card:#1a1b1f;--j2ink:#f2f3f5;--j2ink2:#c7cad0;--j2mut:#8d929b;--j2line:#2a2c31;--j2chip:#26282d;--j2tile:#222428;--j2ok:#4cd98a;--j2okS:#163323}
#m-job2.ov,#m-j2s.ov,#m-j2t.ov{padding:0;align-items:stretch;justify-content:stretch;background:var(--j2bg);box-shadow:none;border:0}
#m-job2>.md,#m-j2s>.md,#m-j2t>.md{max-width:640px;width:100%;margin:0 auto;height:100%;max-height:none;border-radius:0;padding:0;background:var(--j2bg);overflow-y:auto;-webkit-overflow-scrolling:touch;color:var(--j2ink);box-shadow:none}
#m-job2 .mback,#m-j2s .mback,#m-j2t .mback{display:none!important}
.j2i{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.j2i.s{width:15px;height:15px}.j2i.l{width:21px;height:21px}
.j2ph{position:relative;height:230px;background:#2a2c31;overflow:hidden}
.j2gal{display:grid;grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr;gap:2px;height:100%}
.j2gal.n1{grid-template-columns:1fr;grid-template-rows:1fr}.j2gal.n2{grid-template-columns:1fr 1fr;grid-template-rows:1fr}
.j2gal>div{background-size:cover;background-position:center;cursor:pointer;background-color:#3a3c42}
.j2gal:not(.n1):not(.n2)>div:first-child{grid-row:span 2}
.j2ph .sh{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35),transparent 32%);pointer-events:none}
.j2cb{position:absolute;width:38px;height:38px;border-radius:50%;background:rgba(20,20,22,.45);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;display:flex;align-items:center;justify-content:center;border:0;cursor:pointer}
.j2phb{position:absolute;right:14px;bottom:12px;display:flex;gap:8px}
.j2glass{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:17px;background:rgba(20,20,22,.5);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#fff;font-size:13px;font-weight:600;border:0;cursor:pointer}
.j2camb{width:34px;height:34px;border-radius:50%;background:#fff;color:#111;display:flex;align-items:center;justify-content:center;border:0;cursor:pointer}
.j2empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#c7cad0;gap:8px;font-size:14px;cursor:pointer}
.j2top{background:var(--j2card);padding:14px 20px 14px;border-bottom:1px solid var(--j2line)}
.j2stage{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:550;color:var(--j2ink2);background:none;border:0;padding:0;cursor:default}
.j2stage.ed{cursor:pointer}.j2stage i{width:8px;height:8px;border-radius:50%;display:inline-block}
.j2mark{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:9px;font-size:13px;font-weight:550;color:var(--j2ink);background:var(--j2card);box-shadow:0 0 0 1px var(--j2line),0 1px 2px rgba(0,0,0,.04);border:0;cursor:pointer}
.j2title{font-size:26px;font-weight:650;letter-spacing:-.6px;margin:8px 0 0;line-height:1.15;color:var(--j2ink)}
.j2addr{display:inline-block;font-size:13.5px;color:var(--j2mut);margin-top:2px;text-decoration:none}
.j2row2{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;font-size:13.5px;flex-wrap:wrap}
.j2mgr{color:var(--j2ink2);display:flex;align-items:center;gap:8px;flex-wrap:wrap}.j2mgr b{font-weight:600;color:var(--j2ink)}
.j2plus{width:24px;height:24px;border-radius:50%;background:var(--j2chip);color:var(--j2ink2);display:inline-flex;align-items:center;justify-content:center;border:0;cursor:pointer;padding:0}
.j2here{color:var(--j2ok);font-weight:600;display:flex;align-items:center;gap:6px}.j2here i{width:7px;height:7px;border-radius:50%;background:var(--j2ok);display:inline-block}
.j2btns{display:flex;gap:8px;margin-top:12px}
.j2btn{flex:1;min-width:0;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:40px;padding:0 8px;border-radius:12px;font-size:14px;font-weight:600;color:var(--j2ink);background:var(--j2card);box-shadow:0 0 0 1px var(--j2line);border:0;cursor:pointer;text-decoration:none;white-space:nowrap}
.j2btn.d{background:var(--j2ink);color:var(--j2card);box-shadow:none;flex:1.15}
.j2body>.j2btn{flex:none}
:lang(es) .j2btn,.j2es .j2btn{font-size:13px}
.j2body{padding:10px 14px 30px;display:flex;flex-direction:column;gap:9px}
.j2card{background:var(--j2card);border-radius:16px;padding:12px 16px;box-shadow:0 0 0 1px rgba(15,17,21,.05)}
html[data-theme=dark] .j2card{box-shadow:0 0 0 1px var(--j2line)}
.j2h{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--j2mut)}
.j2h .go{margin-left:auto;font-size:13px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--j2ink2);display:flex;align-items:center;gap:2px;background:none;border:0;cursor:pointer;padding:2px 0}
.j2t{display:flex;align-items:center;gap:11px;font-size:15px;padding:9px 0 0;cursor:pointer}
.j2t .ck{width:20px;height:20px;border-radius:6px;border:1.7px solid #c9ccd2;flex:none;background:none;cursor:pointer;padding:0}
.j2t .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.j2t em{font-style:normal;color:var(--j2mut);font-size:12.5px;flex:none;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.j2t.dn .nm{color:var(--j2mut);text-decoration:line-through}.j2t.dn .ck{background:var(--j2ok);border-color:var(--j2ok)}
.j2n{font-size:15px;line-height:1.42;padding-top:9px;white-space:pre-wrap;word-break:break-word}
.j2n small{display:flex;gap:10px;align-items:center;font-size:12px;color:var(--j2mut);margin-top:2px;white-space:normal}
.j2n small button{background:none;border:0;color:var(--j2mut);font-size:12px;padding:0;cursor:pointer;text-decoration:underline}
.j2n img{display:block;max-width:160px;max-height:120px;border-radius:10px;margin-top:6px;cursor:pointer}
.j2muted{font-size:13.5px;color:var(--j2mut);padding-top:8px}
.j2files{display:flex;gap:8px;margin-top:9px}
.j2f{flex:1;min-width:0;max-width:33.3%;background:var(--j2tile);border-radius:12px;padding:10px;cursor:pointer;text-decoration:none;color:var(--j2ink)}
.j2f .fi{width:26px;height:32px;border-radius:6px;color:#fff;font-size:7.5px;font-weight:800;display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px}
.j2f b{display:block;font-size:12.5px;font-weight:600;margin-top:7px;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.j2f small{font-size:11px;color:var(--j2mut)}
.j2line{display:flex;align-items:center;gap:10px;font-size:15px;padding:11px 16px;cursor:pointer}
.j2line em{margin-left:auto;font-style:normal;color:var(--j2mut);font-size:13.5px;display:flex;align-items:center;gap:4px;text-align:right}
.j2line+.j2line{border-top:1px solid var(--j2line)}
.j2small{display:flex;flex-wrap:wrap;gap:6px 14px;padding:4px 6px 0;font-size:12.5px;color:var(--j2mut)}
.j2small button,.j2small span{display:inline-flex;align-items:center;gap:5px;background:none;border:0;color:var(--j2mut);font-size:12.5px;padding:2px 0;cursor:pointer}
.j2nav{position:sticky;top:0;z-index:2;background:var(--j2bg);padding:calc(env(safe-area-inset-top,0px) + 12px) 14px 8px;display:flex;align-items:center;gap:10px}
.j2nav .bk{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:0;background:var(--j2chip);color:var(--j2ink);cursor:pointer}
.j2nav b{display:block;font-size:18px;font-weight:650;color:var(--j2ink)}.j2nav small{font-size:12.5px;color:var(--j2mut)}
.j2nav .rt{margin-left:auto;background:none;border:0;font-size:15px;font-weight:600;color:var(--j2ink);cursor:pointer}
.j2lb{font-size:12px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--j2mut);margin:16px 6px 7px}
.j2kv{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 16px;font-size:15px}
.j2kv+.j2kv{border-top:1px solid var(--j2line)}.j2kv>span:first-child{color:var(--j2mut);flex:none}.j2kv b{font-weight:550;text-align:right;word-break:break-word}
.j2call{width:32px;height:32px;border-radius:50%;background:var(--j2okS);color:var(--j2ok);display:inline-flex;align-items:center;justify-content:center;flex:none}
.j2seg{display:flex;background:var(--j2chip);border-radius:11px;padding:3px;margin:4px 0 0}
.j2seg button{flex:1;text-align:center;font-size:13px;font-weight:550;padding:8px 0;border-radius:9px;color:var(--j2ink2);background:none;border:0;cursor:pointer}
.j2seg button.on{background:var(--j2card);color:var(--j2ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.j2tot{display:flex}.j2tot>div{flex:1;padding:13px 14px}.j2tot>div+div{border-left:1px solid var(--j2line)}
.j2tot b{display:block;font-size:21px;font-weight:650;letter-spacing:-.5px}.j2tot small{font-size:12.5px;color:var(--j2mut)}
.j2ri{width:32px;height:32px;border-radius:9px;background:var(--j2chip);color:var(--j2ink2);display:flex;align-items:center;justify-content:center;flex:none}
.j2day{font-size:11.5px;font-weight:650;letter-spacing:.05em;color:var(--j2mut);padding:10px 16px 6px;text-transform:uppercase}
.j2hr{display:flex;align-items:center;padding:11px 16px;font-size:14.5px;gap:10px}.j2hr+.j2hr{border-top:1px solid var(--j2line)}
.j2hr .v{margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums}.j2hr small{display:block;font-size:12.5px;color:var(--j2mut)}
.j2pill{font-size:11px;font-weight:650;border-radius:7px;padding:2px 8px;background:var(--j2okS);color:var(--j2ok)}
.j2in{width:100%;font-size:16px;padding:11px 12px;border-radius:11px;border:1px solid var(--j2line);background:var(--j2card);color:var(--j2ink);box-sizing:border-box}
.j2grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}.j2grid div{aspect-ratio:1;background-size:cover;background-position:center;border-radius:6px;cursor:pointer;background-color:#3a3c42}
.j2save{display:block;width:100%;height:46px;border-radius:13px;border:0;background:var(--j2ink);color:var(--j2card);font-size:15px;font-weight:600;cursor:pointer;margin-top:14px}
.j2more{position:absolute;right:5px;top:5px;width:28px;height:28px;border-radius:50%;border:0;background:rgba(20,20,22,.55);color:#fff;display:flex;align-items:center;justify-content:center;padding:0}.j2more2{width:32px;height:32px;border-radius:50%;border:0;background:none;color:var(--j2mut);display:flex;align-items:center;justify-content:center;flex:none;padding:0}
.j2pick{display:block;width:100%;text-align:left;padding:13px 16px;font-size:15px;background:none;border:0;color:var(--j2ink);cursor:pointer}.j2pick+.j2pick{border-top:1px solid var(--j2line)}
`;document.head.appendChild(css);

/* ---------- overlays ---------- */
function ov(id){let o=$(id);if(o)return o;o=document.createElement('div');o.className='ov hid';o.id=id;o.innerHTML='<div class="md"></div>';document.body.appendChild(o);return o;}
const body=id=>ov(id).querySelector('.md');
function open(id){const o=ov(id);try{show(id);}catch(e){o.classList.remove('hid');}}
function close(id){try{hide(id);}catch(e){const o=$(id);if(o)o.classList.add('hid');}}
P13.close=close;

/* ---------- data helpers ---------- */
const site=()=>{try{return D.sites.find(x=>x.id===fdSite)}catch(e){return null}};
const can=(fn,m)=>{try{return !!fn(m||M())}catch(e){return false}};
const nm=id=>{try{return nameOf(id)}catch(e){return id||''}};
const dt=(ms,o)=>{try{return new Date(ms).toLocaleDateString(LOC(),o||{month:'short',day:'numeric'})}catch(e){return ''}};
const tm=ms=>{try{return new Date(ms).toLocaleTimeString(LOC(),{hour:'numeric',minute:'2-digit'})}catch(e){return ''}};
const isOffice=m=>!!m&&(m.role==='office');
const seesReports=m=>!!m&&(can(isBoss,m)||m.role==='office'||m.role==='manager'||m.role==='owner'||!!m.all);
function photos(s){const m=M();const L=[];
  (s.files||[]).forEach(f=>{let ok=true;try{ok=fileVisible(f,m);}catch(e){}if(ok&&f.kind==='img'&&(f.d||f.url))L.push({src:f.d||f.url,ts:f.ts||0,fid:f.id});});
  (s.notes||[]).forEach(n=>{if(n&&n.photo)L.push({src:n.photo,ts:n.ts||0});});
  (D.jobs||[]).forEach(j=>{if(j.site!==s.id)return;(j.photos||[]).forEach(p=>{const src=typeof p==='string'?p:(p&&(p.d||p.url));if(src)L.push({src,ts:(p&&p.ts)||j.doneAt||j.ts||0});});if(typeof j.photo==='string'&&j.photo.length>20)L.push({src:j.photo,ts:j.doneAt||j.ts||0});});
  L.sort((a,b)=>(b.ts||0)-(a.ts||0));return L;}
function tasks(s){const m=M();let L=[];
  // Baruch 11/3: "see all tasks for this job" — office, managers and owner see every task on the job; workers see theirs and their crew's
  if(seesReports(m))L=(D.jobs||[]).filter(j=>j&&!j.deleted&&j.site===s.id);else{try{L=visibleJobs().filter(j=>j.site===s.id);}catch(e){L=[];}}
  const open=L.filter(j=>j.status!=='done').sort((a,b)=>(b.pri?1:0)-(a.pri?1:0)||(b.top||0)-(a.top||0)||(b.ts||0)-(a.ts||0));
  const done=L.filter(j=>j.status==='done').sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));return {open,done};}
function who(j){const to=j.to||[];if(!to.length)return '';try{const c=(D.crews||[]).find(c=>c.id===to[0]);if(c)return c.name;}catch(e){}return nm(to[0])+(to.length>1?' +'+(to.length-1):'');}
function notes(s){const L=(s.notes||[]).map(n=>({id:n.id,txt:n.text||'',photo:n.photo||'',by:n.by,ts:n.ts||0,shared:1}));
  try{if(typeof kMine==='function')kMine().filter(n=>n.site===s.id&&!n.trashed).forEach(n=>L.push({id:n.id,txt:[n.title,n.text].filter(Boolean).join('\n')||(n.items||[]).map(i=>(i.done?'✓ ':'• ')+i.t).join('\n'),photo:n.img||'',by:n.owner,ts:n.edited||n.created||0,mine:1}));}catch(e){}
  return L.filter(n=>n.txt||n.photo).sort((a,b)=>b.ts-a.ts);}
function files(s){const m=M();const F=(s.files||[]).filter(f=>{try{return fileVisible(f,m)}catch(e){return true}}).filter(f=>f.kind!=='img').map(f=>({id:f.id,name:String(f.name||'File').replace(/\.(pdf|docx?|xlsx?|csv|dwg|jpe?g|png|heic)$/i,''),ts:f.ts,kind:/\.pdf$/i.test(f.name||'')||f.kind==='pdf'||/pdf/.test(f.type||'')?'PDF':(/\.(xlsx?|csv)$/i.test(f.name||'')?'XLS':/\.(docx?)$/i.test(f.name||'')?'DOC':/\.dwg$/i.test(f.name||'')?'DWG':'FILE'),file:1}));
  const Lk=(s.links||[]).filter(f=>{try{return fileVisible(f,m)}catch(e){return true}}).map(l=>({id:l.id,name:l.title||l.url,url:l.url,ts:l.ts||0,kind:'LINK'}));
  return F.concat(Lk).sort((a,b)=>(b.ts||0)-(a.ts||0));}
const FCOL={PDF:'#d63a2b',XLS:'#1e8e4e',DOC:'#2459d6',DWG:'#7a4fd0',FILE:'#5d6470',LINK:'#5d6470'};
function hereNow(s){const ps=(D.punches||[]).filter(p=>p.site===s.id&&!p.out&&!p.away);if(!ps.length)return null;
  const ids=[...new Set(ps.map(p=>p.who))];const emps=ids.map(id=>(D.emps||[]).find(e=>e.id===id)).filter(Boolean);
  const crews=[...new Set(emps.map(e=>e.crew).filter(Boolean))];const since=Math.min(...ps.map(p=>p.in||Date.now()));
  let label;if(crews.length===1&&emps.every(e=>e.crew===crews[0])){const c=(D.crews||[]).find(c=>c.id===crews[0]);label=(c?c.name:'')+' '+T('here');}
  else label=ids.length===1?nm(ids[0])+' '+T('here'):ids.length+' '+T('people here');
  return {label,since,ids};}
function orrs(s){try{return (D.orr||[]).filter(x=>x&&!x.deleted&&x.site===s.id&&x.status!=='done'&&x.status!=='cancel'&&!(x.type==='gas'&&x.gasFor));}catch(e){return [];}}
function orrStep(x){try{const c=ORR.cur(x);return c&&c[1]?c[1]:'';}catch(e){return '';}}
function orrType(x){try{const t0=(ORR.TYPES||[]).find(y=>y[0]===x.type);return t0?t0[1]:'O&R';}catch(e){return 'O&R';}}
function insp(s){try{const L=(D.insp||[]).filter(i=>i.site===s.id).sort((a,b)=>b.ts-a.ts);return L.find(i=>i.status==='booked')||L.find(i=>i.status==='requested')||null;}catch(e){return null;}}
function inspAll(s){try{return (D.insp||[]).filter(i=>i.site===s.id).sort((a,b)=>(b.at||b.ts||0)-(a.at||a.ts||0));}catch(e){return [];}}
const kindL=k=>{try{return inspKindLabel(k)}catch(e){return T(k==='rough'?'Rough inspection':k==='final'?'Final inspection':'Inspection')}};
const inspSt=i=>i.status==='booked'?T('Booked'):i.status==='pass'?T('Passed'):i.status==='fail'?T('Failed'):T('Waiting to be booked');
// Baruch 11/3: tiny line — "Inspection booked · Thu 11/5" once Shia/Matty book it; tap → every inspection this job ever had
function inspLine(s){const L=inspAll(s);const cur=L.find(i=>i.status==='booked')||L.find(i=>i.status==='requested');const last=L.find(i=>i.status==='pass'||i.status==='fail');
  let h='';const d=ms=>ms?' · '+E(dt(ms,{weekday:'short',month:'numeric',day:'numeric'})):'';
  if(cur)h+='<button onclick="P13.insps()">'+I('cal','s')+(cur.status==='booked'?E(T('Inspection booked'))+d(cur.at):E(T('Inspection requested')))+'</button>';
  else if(last)h+='<button onclick="P13.insps()">'+I('insp','s')+E(kindL(last.kind))+' '+(last.status==='pass'?'✓ '+E(T('Passed')):'✕ '+E(T('Failed')))+d(last.at||(last.result&&last.result.ts))+'</button>';
  if(!cur&&can(canReqInsp))h+='<button onclick="P13.readyInsp()">'+I('insp','s')+E(T('Ready for inspection'))+'</button>';
  if(cur&&L.length>1)h+='<button onclick="P13.insps()">'+E(T('Inspections'))+' · '+L.length+'</button>';
  return h;}
P13.insps=()=>{const s=site();if(!s)return;const L=inspAll(s);
  const col={booked:'#2459d6',pass:'var(--j2ok)',fail:'#c0392b',requested:'var(--j2mut)'};
  sheet('m-j2s',T('Inspections'),String(s.name||'').split(',')[0],'<div class="j2body">'+(L.length?'<div class="j2card" style="padding:0">'+L.map(i=>{const when=i.at||(i.result&&i.result.ts)||i.ts;
     return '<div class="j2hr" style="cursor:pointer" onclick="P13.inspOpen(\''+J(i.id)+'\')"><span>'+E(kindL(i.kind))+'<small>'+(when?E(dt(when,{weekday:'short',month:'short',day:'numeric',year:'numeric'})):'')+(i.status==='booked'&&i.bookedBy?' · '+E(T('booked by'))+' '+E(nm(i.bookedBy)):'')+'</small></span><span class="v" style="color:'+(col[i.status]||'var(--j2mut)')+';font-size:13.5px">'+E(inspSt(i))+'</span></div>'
       +(i.result&&i.result.note?'<div style="padding:0 16px 11px;font-size:13px;color:var(--j2ink2);margin-top:-4px">'+E(i.result.note)+'</div>':'');}).join('')+'</div>':'<div class="j2muted">'+E(T('No inspections yet'))+'</div>')+'</div>');};
P13.inspOpen=id=>{const i=(D.insp||[]).find(x=>x.id===id);if(!i)return;const m=M();try{if(i.status==='requested'&&can(canBookInsp,m))return openInspBook(id);if(i.status==='booked'&&(can(canReqInsp,m)||can(canBookInsp,m)))return openInspResult(id);}catch(e){}};
function stageInfo(s){let L=['Roughing','b-prog'];try{L=STAGE[s.stage||'active']||STAGE.active;}catch(e){}
  const k=s.stage||'active';const col={upcoming:'#9aa0aa',ready:'#3b6fd8',priced:'#9aa0aa',active:'#f0a24a',roughdone:'#1e8e4e',inspection:'#7a4fd0',done:'#1e8e4e'}[k]||'#f0a24a';
  return {label:T(L[0]),col,k};}

/* ---------- main screen ---------- */
function draw(){
  const s=site();const m=M();if(!s||!m)return;const B=body('m-job2');const keep=B.scrollTop;
  const ph=photos(s),tk=tasks(s),nt=notes(s),fl=files(s),or=orrs(s),ins=insp(s),hn=hereNow(s),st=stageInfo(s);
  const canStage=can(m=>(typeof canMoveStage==='function'?canMoveStage:canEditFolder)(m)),canRough=can(canRoughDone),canAdd=can(isBoss)||isOffice(m),canMgr=can(canAssignMgr);
  let mgr=[];try{mgr=mgrIds(s);}catch(e){}
  const g=ph.slice(0,3);P13._gal=ph.map(x=>x.src);
  const gal=g.length?'<div class="j2gal n'+Math.min(g.length,3)+'">'+g.map((x,i)=>'<div style="background-image:url(\''+String(x.src).replace(/'/g,'%27')+'\')" onclick="P13.photo('+i+')"></div>').join('')+'</div>'
    :'<div class="j2empty" onclick="P13.cam()">'+I('cam','l')+'<span>'+E(T('Add the first photo'))+'</span></div>';
  let mark='';if(canRough){if((s.stage||'active')==='active')mark='<button class="j2mark" onclick="P13.stage(\'roughdone\')">'+I('tick','s')+E(T('Mark rough done'))+'</button>';
    else if(s.stage==='roughdone')mark='<button class="j2mark" onclick="P13.stage(\'inspection\')">'+E(T('Ready for finishing'))+' →</button>';}
  const addr=E(s.name||'');const maps=(()=>{try{return safeHref(gmapsDir(s))}catch(e){return '#'}})();
  const title=(String(s.name||'').split(',')[0]||s.name||'');const rest=String(s.name||'').split(',').slice(1).join(',').trim();
  B.classList.toggle('j2es',ES_ON());B.innerHTML=
   '<div class="j2ph">'+gal+'<div class="sh"></div><button class="j2cb" style="left:14px;top:calc(env(safe-area-inset-top,0px) + 12px)" onclick="P13.back()" aria-label="Back">'+I('back')+'</button>'

   +'<div class="j2phb">'+(ph.length?'<button class="j2glass" onclick="P13.photos()">'+I('img','s')+' '+ph.length+'</button>':'')+'<button class="j2camb" onclick="P13.cam()" aria-label="Photo">'+I('cam','s')+'</button></div></div>'
   +'<div class="j2top"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:32px">'
     +'<button class="j2stage'+(canStage?' ed':'')+'" '+(canStage?'onclick="P13.pickStage()"':'')+'><i style="background:'+st.col+'"></i>'+E(st.label)+(canStage?' <span style="color:#b3b6bd;font-size:10px">▼</span>':'')+'</button>'+mark+'</div>'
     +'<div class="j2title">'+E(title)+'</div>'+(rest?'<a class="j2addr" href="'+E(maps)+'" target="_blank" rel="noopener">'+E(rest)+'</a>':'')
     +'<div class="j2row2"><span class="j2mgr">'+E(T(mgr.length>1?'Site managers':'Site manager'))+': '+(mgr.length?mgr.map(id=>'<b>'+E(nm(id))+'</b>').join(', '):'<span style="color:var(--j2mut)">'+E(T('Not set'))+'</span>')
       +(canMgr?'<button class="j2plus" onclick="P13.addMgr()" aria-label="'+E(T('Add a site manager'))+'">'+I('plus','s')+'</button>':'')+'</span>'
       +(hn?'<span class="j2here"><i></i>'+E(hn.label)+'</span>':'')+'</div>'
     +'<div class="j2btns"><a class="j2btn d" href="'+E(maps)+'" target="_blank" rel="noopener">'+I('nav','s')+E(T('Directions'))+'</a><button class="j2btn" onclick="P13.info()">'+I('key','s')+E(ES_ON()?'Info':T('Job info'))+'</button>'
       +(seesReports(m)?'<button class="j2btn" onclick="P13.reports()">'+I('list','s')+E(T('Reports'))+'</button>':'')+'</div></div>'
   +'<div class="j2body">'
     +'<div class="j2card"><div class="j2h">'+E(T('Tasks'))+' · '+tk.open.length+(canAdd?'<button class="go" style="margin-left:auto;color:var(--j2ink2)" onclick="P13.addTask()">+ '+E(T('Add task'))+'</button><button class="go" style="margin-left:14px" onclick="P13.tasks()">'+E(T('All'))+I('chev','s')+'</button>':'<button class="go" onclick="P13.tasks()">'+E(T('All'))+I('chev','s')+'</button>')+'</div>'
       +(tk.open.length?tk.open.slice(0,4).map(j=>taskRow(j)).join('')+(tk.open.length>4?'<div class="j2muted" style="cursor:pointer" onclick="P13.tasks()">+ '+(tk.open.length-4)+' '+E(T('open'))+'</div>':''):'<div class="j2muted">'+E(T('No open tasks'))+'</div>')+'</div>'
     +'<div class="j2card"><div class="j2h">'+E(T('Notes'))+' · '+nt.length+'<button class="go" onclick="P13.addNote()">+ '+E(T('Note'))+'</button></div>'
       +(nt.length?nt.slice(0,3).map(n=>noteRow(n,s,m)).join('')+(nt.length>3?'<div class="j2muted" style="cursor:pointer" onclick="P13.notes()">+ '+(nt.length-3)+' '+E(T('Notes')).toLowerCase()+'</div>':''):'<div class="j2muted">'+E(T('No notes yet — add the first one so everyone on the job sees it.'))+'</div>')+'</div>'
     +'<div class="j2card"><div class="j2h">'+E(T('Files'))+' · '+fl.length+'<button class="go" onclick="P13.files()">'+E(T('All'))+I('chev','s')+'</button></div>'
       +(fl.length?'<div class="j2files">'+fl.slice(0,3).map(fileTile).join('')+'</div>':'<div class="j2muted">'+E(T('No files yet'))+(can(canEditFolder)?' · <a style="color:var(--j2ink2);font-weight:600;cursor:pointer" onclick="P13.upload()">'+E(T('Add file'))+'</a>':'')+'</div>')+'</div>'
     +(or.length?'<div class="j2card" style="padding:0">'+or.map(x=>'<div class="j2line" onclick="P13.orr(\''+J(x.id)+'\')">'+I('bolt','s')+'<span>O&amp;R · '+E(T(orrType(x)))+'</span><em>'+E(T(orrStep(x)))+I('chev','s')+'</em></div>').join('')+'</div>':'')
     +'<div class="j2small">'
       +inspLine(s)
       +(!or.length&&orrStaff(m)?'<button onclick="P13.orrNew()">'+I('bolt','s')+'+ '+E(T('O&R request'))+'</button>':'')+'</div>'
   +'</div>';
  B.scrollTop=keep;}
function taskRow(j){const d=j.status==='done';return '<div class="j2t'+(d?' dn':'')+'" onclick="P13.task(\''+J(j.id)+'\')"><button class="ck" aria-label="'+E(T('Done'))+'" onclick="event.stopPropagation();P13.done(\''+J(j.id)+'\')">'+(d?'<svg class="j2i s" viewBox="0 0 24 24" style="color:#fff"><path d="m5 12 5 5 9-10"/></svg>':'')+'</button><span class="nm">'+E(j.desc||j.title||'')+'</span><em>'+E(who(j))+'</em></div>';}
function noteRow(n,s,m){const mine=n.by===m.id||can(isBoss,m);return '<div class="j2n">'+E(n.txt)+(n.photo?'<img src="'+E(n.photo)+'" onclick="viewPhotos([this.src],0)" alt="">':'')+'<small><span>'+E(nm(n.by))+' · '+E(dt(n.ts))+'</span>'+(n.shared&&mine?'<button onclick="P13.delNote(\''+J(n.id)+'\')">'+E(T('Remove'))+'</button>':'')+'</small></div>';}
function fileTile(f){const k=f.kind;const sub=k==='LINK'?(String(f.url||'').replace(/^https?:\/\/(www\.)?/,'').split('/')[0]):(f.ts?dt(f.ts):k);
  return (k==='LINK'?'<a class="j2f" href="'+E((()=>{try{return safeHref(f.url)}catch(e){return '#'}})())+'" target="_blank" rel="noopener">':'<div class="j2f" onclick="P13.openFile(\''+J(f.id)+'\')">')
   +'<span class="fi" style="background:'+(FCOL[k]||'#5d6470')+'">'+k+'</span><b>'+E(f.name)+'</b><small>'+E(sub)+'</small>'+(k==='LINK'?'</a>':'</div>');}

/* ---------- actions ---------- */
P13.back=()=>{close('m-job2');};
P13.old=()=>{P13._legacy=true;try{const s=site();if(s)openFolder(s.id);}finally{P13._legacy=false;}const f=$('m-folder'),j=$('m-job2');if(f&&j){const z=parseInt(getComputedStyle(j).zIndex,10)||50;f.style.zIndex=String(z+1);}};
P13.photo=i=>{try{viewPhotos(P13._gal,i);}catch(e){}};
P13.cam=()=>{const c=$('fdCam');if(c){c.value='';c.click();}};
P13.upload=()=>{const c=$('fdFile');if(c){c.value='';c.click();}};
P13.pickStage=()=>{const s=site();if(s)try{pickStage(s.id);}catch(e){}};
P13.stage=k=>{const s=site();if(s)try{quickStage(s.id,k);}catch(e){}};
P13.task=id=>{try{openJobDetail(id);}catch(e){}};
P13.done=id=>{const j=(D.jobs||[]).find(x=>x.id===id);if(!j)return;if(j.status==='done'){try{openJobDetail(id);}catch(e){}return;}try{markDone(id);}catch(e){}setTimeout(refresh,250);};
P13.addTask=()=>{const s=site();if(!s)return;try{openJob();setTimeout(()=>{const x=$('jSite');if(x)x.value=s.id;},60);}catch(e){}};
P13.openFile=id=>{try{fdOpen(id);}catch(e){}};
P13.orr=id=>{try{ORR.open(id);}catch(e){}};
P13.readyInsp=()=>{const s=site();if(s)try{reqInsp(s.id);}catch(e){}setTimeout(refresh,300);};
P13.delNote=id=>{const s=site();if(!s)return;const go=()=>{s.notes=(s.notes||[]).filter(n=>n.id!==id);try{save();}catch(e){}refresh();};try{askConfirm(T('Remove this note?'),go,T('Remove'));}catch(e){go();}};
P13.addMgr=()=>{const s=site();if(!s)return;let left=[];try{const ids=mgrIds(s);left=siteMgrs().filter(e=>!ids.includes(e.id));}catch(e){}
  sheet('m-j2t',T('Add a site manager'),s.name,'<div class="j2body"><div class="j2card" style="padding:0">'+(left.length?left.map(e=>'<button class="j2pick" onclick="P13.setMgr(\''+J(e.id)+'\')">'+E(e.name)+'</button>').join(''):'<div class="j2muted" style="padding:14px 16px">—</div>')+'</div></div>');};
P13.setMgr=id=>{close('m-j2t');try{fdAddMgr(id);}catch(e){}setTimeout(refresh,200);};
P13.rmMgr=id=>{try{fdRemoveMgr(id);}catch(e){}setTimeout(()=>{refresh();if(!$('m-j2s').classList.contains('hid'))P13.info();},200);};
P13.addNote=()=>{const s=site();if(!s)return;
  sheet('m-j2t',T('Add note'),s.name,'<div class="j2body"><textarea id="j2note" class="j2in" rows="5" placeholder="'+E(T('Write a note for everyone on this job…'))+'"></textarea><button class="j2save" onclick="P13.saveNote()">'+E(T('Save'))+'</button></div>');setTimeout(()=>{const x=$('j2note');if(x)x.focus();},250);};
P13.saveNote=()=>{const s=site();const x=$('j2note');const v=x?x.value.trim():'';if(!s||!v)return;(s.notes=s.notes||[]).push({id:nid('nt'),text:v,photo:'',by:M().id,ts:Date.now(),phase:s.phase});try{save();}catch(e){}close('m-j2t');refresh();};
function refresh(){if(!$('m-job2')||$('m-job2').classList.contains('hid'))return;draw();}
P13.refresh=refresh;

/* ---------- sheets ---------- */
function sheet(id,title,sub,html,right){if(id==='m-j2s'){P13._cur=P13._next||null;P13._next=null;}const B=body(id);B.innerHTML='<div class="j2nav"><button class="bk" onclick="P13.close(\''+id+'\')" aria-label="Back">'+I('back')+'</button><div><b>'+E(title)+'</b><small>'+E(sub||'')+'</small></div>'+(right||'')+'</div>'+html;B.scrollTop=0;open(id);}
P13.photos=()=>{const s=site();if(!s)return;P13._next='photos';const ph=photos(s);P13._gal=ph.map(x=>x.src);
  sheet('m-j2s',T('Photos'),s.name+' · '+ph.length,'<div style="padding:4px 10px 30px"><div class="j2grid">'+ph.map((x,i)=>'<div style="position:relative;background-image:url(\''+String(x.src).replace(/'/g,'%27')+'\')" onclick="P13.photo('+i+')">'+(x.fid&&fileMenuOk()?'<button class="j2more" aria-label="'+E(T('More'))+'" onclick="event.stopPropagation();P13.fmenu(\''+J(x.fid)+'\')">'+I('more','s')+'</button>':'')+'</div>').join('')+'</div></div>','<button class="rt" onclick="P13.cam()">'+I('cam')+'</button>');};
P13.tasks=()=>{const s=site();if(!s)return;const tk=tasks(s);const canAdd=can(isBoss)||isOffice(M());
  sheet('m-j2s',T('Tasks'),s.name,'<div class="j2body"><div class="j2lb" style="margin-top:4px">'+E(T('Open tasks'))+' · '+tk.open.length+'</div><div class="j2card">'+(tk.open.length?tk.open.map(taskRow).join(''):'<div class="j2muted">'+E(T('No open tasks'))+'</div>')+'</div>'
   +(tk.done.length?'<div class="j2lb">'+E(T('Done tasks'))+' · '+tk.done.length+'</div><div class="j2card">'+tk.done.slice(0,40).map(taskRow).join('')+'</div>':'')+'</div>',canAdd?'<button class="rt" onclick="P13.addTask()">+ '+E(T('Add task'))+'</button>':'');};
P13.notes=()=>{const s=site();if(!s)return;const m=M();const nt=notes(s);
  sheet('m-j2s',T('Notes'),s.name,'<div class="j2body"><div class="j2card">'+nt.map(n=>noteRow(n,s,m)).join('')+'</div></div>','<button class="rt" onclick="P13.addNote()">+ '+E(T('Note'))+'</button>');};
P13.files=()=>{const s=site();if(!s)return;P13._next='files';const fl=files(s);const ed=can(canEditFolder);
  const row=f=>{const k=f.kind;const inner='<span class="fi" style="width:30px;height:36px;border-radius:7px;color:#fff;font-size:8px;font-weight:800;display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px;flex:none;background:'+(FCOL[k]||'#5d6470')+'">'+k+'</span><span style="flex:1;min-width:0"><span style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+E(f.name)+'</span><small style="font-size:12.5px;color:var(--j2mut)">'+E(k==='LINK'?String(f.url||'').replace(/^https?:\/\//,'').slice(0,40):(f.ts?dt(f.ts):''))+'</small></span>'+(fileMenuOk()?'<button class="j2more2" aria-label="'+E(T('More'))+'" onclick="event.preventDefault();event.stopPropagation();P13.fmenu(\''+J(f.id)+'\','+(k==='LINK'?1:0)+')">'+I('more','s')+'</button>':I('chev','s'));
    return k==='LINK'?'<a class="j2line" style="text-decoration:none;color:inherit" href="'+E((()=>{try{return safeHref(f.url)}catch(e){return '#'}})())+'" target="_blank" rel="noopener">'+inner+'</a>':'<div class="j2line" onclick="P13.openFile(\''+J(f.id)+'\')">'+inner+'</div>';};
  sheet('m-j2s',T('Files'),s.name+' · '+fl.length,'<div class="j2body">'+(fl.length?'<div class="j2card" style="padding:0">'+fl.map(row).join('')+'</div>':'<div class="j2muted" style="padding:10px 6px">'+E(T('No files yet'))+'</div>')
   +(ed?'<div class="j2btns" style="margin-top:6px"><button class="j2btn" onclick="P13.upload()">'+I('plus','s')+E(T('Add file'))+'</button><button class="j2btn" onclick="P13.addLink()">'+I('plus','s')+E(T('Add link'))+'</button></div>':'')+'</div>');};
P13.addLink=()=>{const s=site();if(!s)return;sheet('m-j2t',T('Add link'),s.name,'<div class="j2body"><input id="j2lu" class="j2in" placeholder="https://…" inputmode="url"><input id="j2lt" class="j2in" placeholder="'+E(T('Name'))+'"><button class="j2save" onclick="P13.saveLink()">'+E(T('Save'))+'</button></div>');};
P13.saveLink=()=>{const u=($('j2lu')||{}).value||'',tl=($('j2lt')||{}).value||'';const a=$('fdLinkUrl'),b=$('fdLinkTitle');if(a&&b&&u.trim()){a.value=u.trim();b.value=tl.trim();try{fdLink();}catch(e){}}close('m-j2t');setTimeout(()=>{refresh();P13.files();},150);};

/* ---------- Job info ---------- */
P13.info=()=>{const s=site();if(!s)return;const m=M();const ed=can(canEditFolder);let mgr=[];try{mgr=mgrIds(s);}catch(e){}
  const ph=s.phone?'<b style="display:flex;align-items:center;gap:10px">'+E(s.phone)+'<a class="j2call" href="tel:'+E(String(s.phone).replace(/[^\d+]/g,''))+'" aria-label="'+E(T('Call'))+'">'+I('phone','s')+'</a></b>':'<b style="color:var(--j2mut)">'+E(T('Not set'))+'</b>';
  const extra=(s.info||[]).filter(x=>x&&x.k);
  sheet('m-j2s',T('Job info'),String(s.name||'').split(',')[0],
   '<div class="j2body" style="gap:0"><div class="j2lb" style="margin-top:2px">'+E(T('Owner'))+'</div><div class="j2card" style="padding:0"><div class="j2kv"><span>'+E(T('Name'))+'</span><b>'+(s.client?E(s.client):'<span style="color:var(--j2mut)">'+E(T('Not set'))+'</span>')+'</b></div><div class="j2kv"><span>'+E(T('Phone'))+'</span>'+ph+'</div></div>'
   +'<div class="j2lb">'+E(T('Permit'))+'</div><div class="j2card" style="padding:0"><div class="j2kv"><span>'+E(T('Permit #'))+'</span><b>'+(s.permit?E(s.permit):'<span style="color:var(--j2mut)">'+E(T('Not set'))+'</span>')+'</b></div></div>'
   +'<div class="j2lb">'+E(T('Job'))+'</div><div class="j2card" style="padding:0"><div class="j2kv"><span>'+E(T('Address'))+'</span><b>'+E(s.name)+'</b></div>'
     +'<div class="j2kv"><span>'+E(T(mgr.length>1?'Site managers':'Site manager'))+'</span><b>'+(mgr.length?mgr.map(id=>E(nm(id))+(can(canAssignMgr)?' <button class="j2plus" style="width:20px;height:20px;vertical-align:-4px" onclick="P13.rmMgr(\''+J(id)+'\')" aria-label="'+E(T('Remove'))+'">'+I('x','s')+'</button>':'')).join('<br>'):E(T('Not set'))+'')+'</b></div>'
     +'<div class="j2kv" style="cursor:pointer" onclick="P13.fence()"><span>'+E(T('GPS fence'))+'</span><b>'+(s.lat?E((s.rad||300)+' ft'):E(T('Not set')))+'</b></div>'
     +extra.map(x=>'<div class="j2kv"><span>'+E(x.k)+'</span><b>'+E(x.v)+'</b></div>').join('')+'</div>'
   +(ed?'<button class="j2btn" style="margin-top:14px;width:100%;height:44px" onclick="P13.addField()">'+I('plus','s')+E(T('Add a field'))+'</button>':'')
   +(m&&m.role==='owner'?'<button class="j2btn" style="margin-top:26px;width:100%;height:44px;color:#c0392b" onclick="P13.removeJob()">'+E(T('Remove job'))+'</button>':'')+'</div>',
   ed?'<button class="rt" onclick="P13.editInfo()">'+E(T('Edit'))+'</button>':'');};
/* file & photo menu: Open · Share · Rename · Replace · Delete (Baruch 11/3: no more old page) */
function fileMenuOk(){return can(canEditFolder)||can(isAdmin)||can(isBoss);}
function after(){try{refresh();}catch(e){}try{const o=$('m-j2s');if(o&&!o.classList.contains('hid')){const k=o.querySelector('.md').scrollTop;if(P13._cur==='files')P13.files();else if(P13._cur==='photos')P13.photos();o.querySelector('.md').scrollTop=k;}}catch(e){}}
P13._after=after;
P13.fmenu=(id,isLink)=>{const s=site();if(!s)return;const f=isLink?(s.links||[]).find(x=>x.id===id):(s.files||[]).find(x=>x.id===id);if(!f)return;
  const ed=can(canEditFolder),adm=can(isAdmin),boss=can(isBoss);const b=(fn,ic,t,red)=>'<button class="j2pick" style="display:flex;align-items:center;gap:12px'+(red?';color:#c0392b':'')+'" onclick="'+fn+'">'+I(ic,'s')+E(T(t))+'</button>';
  const q="'"+J(id)+"'";
  const L=isLink?[b("P13.lopen("+q+")",'chev','Open')].concat(adm?[b('P13.fdel('+q+',1)','x','Delete',1)]:[])
   :[b("P13.close('m-j2t');P13.openFile("+q+")",'chev','Open')].concat(boss&&f.kind!=='img'?[b('P13.fshare('+q+')','share','Share')]:[],ed&&f.kind!=='img'?[b('P13.fren('+q+')','edit','Rename'),b('P13.frep('+q+')','upload','Replace')]:[],adm?[b('P13.fdel('+q+')','x','Delete',1)]:[]);
  sheet('m-j2t',isLink?(f.title||f.url):f.name,isLink?T('Link'):T(f.kind==='img'?'Photo':'File'),'<div class="j2body"><div class="j2card" style="padding:0">'+L.join('')+'</div></div>');};
P13.lopen=id=>{const s=site();const f=s&&(s.links||[]).find(x=>x.id===id);close('m-j2t');if(!f)return;let u='#';try{u=safeHref(f.url);}catch(e){}if(u!=='#')window.open(u,'_blank','noopener');};
P13.fshare=id=>{close('m-j2t');try{fileShare(id);lift();}catch(e){}};
P13.fren=id=>{const s=site();const f=s&&(s.files||[]).find(x=>x.id===id);if(!f)return;close('m-j2t');
  askPrompt(T('Rename file'),[{label:T('Name'),value:f.name}],([n])=>{n=String(n||'').trim();if(!n)return;f.name=n;f.editedBy=(M()||{}).id;f.editedAt=Date.now();save();after();});lift();};
P13.frep=id=>{close('m-j2t');try{fdReplace(id);}catch(e){}};
P13.fdel=(id,isLink)=>{const s=site();if(!s||!can(isAdmin))return;close('m-j2t');
  askConfirm(T(isLink?'Remove this link?':'Remove this file?'),()=>{if(isLink)s.links=(s.links||[]).filter(x=>x.id!==id);else s.files=(s.files||[]).filter(x=>x.id!==id);save();after();try{renderSites();}catch(e){}},T('Remove'));lift();};
P13.removeJob=()=>{const s=site();const m=M();if(!s||!m||m.role!=='owner')return;
  askConfirm(T('Remove this job?'),()=>{try{if(typeof fdRemoveSite==='function')fdRemoveSite(s.id);else{D.sites=D.sites.filter(x=>x.id!==s.id);save();renderAll();}}catch(e){}['m-j2t','m-j2s','m-job2'].forEach(close);},T('Remove'));lift();};
P13.orrNew=()=>{const s=site();if(s)try{ORR.add(s.id);lift();}catch(e){}};
function orrStaff(m){return !!m&&(m.role==='owner'||m.role==='manager'||!!m.all||(m.role==='office'&&m.title!=='Accountant'));}
// pop-ups from the main app (confirm, rename, O&R form, share) must sit above the job screen
function lift(){setTimeout(()=>{const top=Math.max(0,...['m-job2','m-j2s','m-j2t'].map(i=>{const o=$(i);return o&&!o.classList.contains('hid')?(parseInt(getComputedStyle(o).zIndex,10)||0):0}));
  document.querySelectorAll('.ov:not(.hid)').forEach(o=>{if(!/^m-j2|^m-job2$/.test(o.id)&&(parseInt(getComputedStyle(o).zIndex,10)||0)<=top)o.style.zIndex=String(top+5);});},0);}
P13.fence=()=>{const s=site();if(s)try{openFence(s.id);}catch(e){}};
P13.editInfo=()=>{const s=site();if(!s)return;const extra=(s.info||[]).filter(x=>x&&x.k);
  const f=(id,l,v,type)=>'<div class="j2lb" style="margin:12px 4px 6px">'+E(l)+'</div><input id="'+id+'" class="j2in" value="'+E(v||'')+'"'+(type?' inputmode="'+type+'"':'')+'>';
  sheet('m-j2t',T('Edit'),T('Job info'),'<div class="j2body" style="gap:0">'+f('j2c',T('Owner')+' · '+T('Name'),s.client)+f('j2p',T('Owner')+' · '+T('Phone'),s.phone,'tel')+f('j2pm',T('Permit #'),s.permit)
    +extra.map((x,i)=>f('j2x'+i,x.k,x.v)).join('')+'<button class="j2save" onclick="P13.saveInfo()">'+E(T('Save'))+'</button></div>');};
P13.saveInfo=()=>{const s=site();if(!s)return;const v=id=>(($(id)||{}).value||'').trim();s.client=v('j2c');s.phone=v('j2p');s.permit=v('j2pm');
  (s.info||[]).forEach((x,i)=>{if($('j2x'+i))x.v=v('j2x'+i);});s.info=(s.info||[]).filter(x=>x&&x.k);try{save();}catch(e){}close('m-j2t');refresh();P13.info();};
P13.addField=()=>{sheet('m-j2t',T('Add a field'),T('Job info'),'<div class="j2body" style="gap:0"><div class="j2lb" style="margin:6px 4px 6px">'+E(T('Field name'))+'</div><input id="j2fk" class="j2in"><div class="j2lb" style="margin:12px 4px 6px">'+E(T('Value'))+'</div><input id="j2fv" class="j2in"><button class="j2save" onclick="P13.saveField()">'+E(T('Save'))+'</button></div>');setTimeout(()=>{const x=$('j2fk');if(x)x.focus();},250);};
P13.saveField=()=>{const s=site();const k=(($('j2fk')||{}).value||'').trim(),v=(($('j2fv')||{}).value||'').trim();if(!s||!k)return;(s.info=s.info||[]).push({k,v});try{save();}catch(e){}close('m-j2t');P13.info();};

/* ---------- Reports ---------- */
let rng='tm';
function bounds(){try{return rangeBounds(rng);}catch(e){return [0,Date.now()+1,''];}}
function rPunches(s){const [f,to]=bounds();let L=[];try{L=hrPunches(f,to,p=>p.site===s.id);}catch(e){}
  const live=(D.punches||[]).filter(p=>p.site===s.id&&!p.out&&!p.away&&p.in>=f&&p.in<to);return {done:L,live};}
const dur=p=>{try{return punchDur(p)}catch(e){return ((p.out||Date.now())-p.in)/3600000}};
function rExps(s){const [f,to]=bounds();return (D.exps||[]).filter(x=>x.site===s.id).filter(x=>{const d=x.date?new Date(x.date+'T12:00').getTime():(x.ts||0);return rng==='all'||(d>=f&&d<to);});}
P13.reports=k=>{if(k)rng=k;const s=site();if(!s)return;const {done,live}=rPunches(s);const hrs=done.reduce((q,p)=>q+dur(p),0);const ppl=new Set(done.concat(live).map(p=>p.who)).size;const spent=rExps(s).reduce((q,x)=>q+(+x.amt||0),0);
  const segs=[['tw','This week'],['lw','Last week'],['tm','This month'],['all','All']];
  const row=(i,tl,sub,fn)=>'<div class="j2line" onclick="'+fn+'"><span class="j2ri">'+I(i,'s')+'</span><span><span style="display:block">'+E(T(tl))+'</span><small style="font-size:12.5px;color:var(--j2mut)">'+E(T(sub))+'</small></span><em>'+I('chev','s')+'</em></div>';
  sheet('m-j2s',T('Reports'),String(s.name||'').split(',')[0],'<div class="j2body"><div class="j2seg">'+segs.map(([k2,l])=>'<button class="'+(rng===k2?'on':'')+'" onclick="P13.reports(\''+k2+'\')">'+E(T(l))+'</button>').join('')+'</div>'
   +'<div class="j2card j2tot" style="padding:0"><div><b>'+hrs.toFixed(1)+' h</b><small>'+E(T('Hours'))+'</small></div><div><b>'+ppl+'</b><small>'+E(T('People'))+'</small></div><div><b>$'+Math.round(spent).toLocaleString('en-US')+'</b><small>'+E(T('Spent'))+'</small></div></div>'
   +'<div class="j2card" style="padding:0">'+row('clock','Hours','Per person, per day','P13.rHours()')+row('users','Who was here','Came and left, each day','P13.rWho()')+row('cal','Schedule','Next 7 days','P13.rSched()')+row('box','Material','Ordered and from the garage','P13.rMat()')+row('dollar','Money spent','Material · gas · receipts','P13.rMoney()')+'</div></div>');};
const rTitle=()=>{const segs={tw:'This week',lw:'Last week',tm:'This month',all:'All'};return T(segs[rng]||'');};
P13.rHours=()=>{const s=site();const {done}=rPunches(s);const by={};done.forEach(p=>by[p.who]=(by[p.who]||0)+dur(p));const ids=Object.keys(by).sort((a,b)=>by[b]-by[a]);
  sheet('m-j2t',T('Hours'),String(s.name||'').split(',')[0]+' · '+rTitle(),'<div class="j2body">'+(ids.length?'<div class="j2card" style="padding:0">'+ids.map(id=>'<div class="j2hr"><span>'+E(nm(id))+'</span><span class="v">'+by[id].toFixed(1)+' h</span></div>').join('')+'</div>':'<div class="j2muted">'+E(T('No hours in this period.'))+'</div>')+'</div>');};
P13.rWho=()=>{const s=site();const {done,live}=rPunches(s);const all=done.concat(live).sort((a,b)=>b.in-a.in);const days={};all.forEach(p=>{let k;try{k=dkey(new Date(p.in));}catch(e){k=new Date(p.in).toDateString();}(days[k]=days[k]||[]).push(p);});
  const keys=Object.keys(days).sort((a,b)=>days[b][0].in-days[a][0].in);const today=new Date().toDateString();
  sheet('m-j2t',T('Who was here'),String(s.name||'').split(',')[0]+' · '+rTitle(),'<div class="j2body">'+(keys.length?'<div class="j2card" style="padding:0;overflow:hidden">'+keys.map((k,ki)=>{const d0=new Date(days[k][0].in);
     return '<div class="j2day"'+(ki?' style="border-top:1px solid var(--j2line)"':'')+'>'+E((d0.toDateString()===today?T('Today')+' · ':'')+dt(d0.getTime(),{weekday:'short',month:'short',day:'numeric'}))+'</div>'
      +days[k].map(p=>'<div class="j2hr"><span>'+E(nm(p.who))+'<small>'+E(tm(p.in))+' – '+(p.out?E(tm(p.out)):E(T('now')))+'</small></span><span class="v">'+(p.out||p.away?dur(p).toFixed(1)+' h':'<span class="j2pill">'+E(T('On site'))+'</span>')+'</span></div>').join('');}).join('')+'</div>':'<div class="j2muted">'+E(T('No hours in this period.'))+'</div>')+'</div>');};
P13.rSched=()=>{const s=site();const out=[];for(let i=0;i<7;i++){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+i);let k;try{k=dkey(d);}catch(e){continue;}(D.crews||[]).forEach(c=>{let sl=null;try{sl=schedDay(c.id+'|'+k);}catch(e){}if(sl&&sl.site===s.id)out.push({d,c,sl});});}
  sheet('m-j2t',T('Schedule'),String(s.name||'').split(',')[0]+' · '+T('Next 7 days'),'<div class="j2body">'+(out.length?'<div class="j2card" style="padding:0">'+out.map(x=>'<div class="j2hr" style="cursor:pointer" onclick="P13.goSched(\''+J(x.c.id)+'\')"><span>'+E(dt(x.d.getTime(),{weekday:'short',month:'short',day:'numeric'}))+'<small>'+E(x.c.name)+'</small></span><span class="v" style="font-weight:500;color:var(--j2mut)">'+E(x.sl.time||'')+'</span></div>').join('')+'</div>':'<div class="j2muted">'+E(T('Nobody scheduled here this week'))+'</div>')+'</div>');};
P13.goSched=cid=>{['m-j2t','m-j2s','m-job2'].forEach(close);try{schedCrew=cid;goTab('sched');}catch(e){}};
P13.rMat=()=>{const s=site();try{openMatHist({site:s.id});}catch(e){}};
P13.rMoney=()=>{const s=site();const L=rExps(s).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));const tot=L.reduce((q,x)=>q+(+x.amt||0),0);
  sheet('m-j2t',T('Money spent'),String(s.name||'').split(',')[0]+' · '+rTitle()+' · $'+Math.round(tot).toLocaleString('en-US'),'<div class="j2body">'+(L.length?'<div class="j2card" style="padding:0">'+L.map(x=>'<div class="j2hr"><span>'+E(x.vendor||x.type||'—')+'<small>'+E(nm(x.who))+(x.date?' · '+E(dt(new Date(x.date+'T12:00').getTime())):'')+'</small></span><span class="v">$'+(+x.amt||0).toLocaleString('en-US',{maximumFractionDigits:2})+'</span></div>').join('')+'</div>':'<div class="j2muted">'+E(T('Nothing spent in this period.'))+'</div>')+'</div>');};

/* ---------- take over the job folder ---------- */
if(typeof window.openFolder==='function'){
  const _of=window.openFolder;
  window.openFolder=function(id){
    const f0=$('m-folder');const wasOpen=!!f0&&!f0.classList.contains('hid');
    const j0=$('m-job2');const j2open=!P13._legacy&&!!j0&&!j0.classList.contains('hid');   // the old folder is already open ("All details") → keep it
    const r=_of.apply(this,arguments);
    if(wasOpen)return r;
    try{
      const f=$('m-folder');const s=D.sites.find(x=>x.id===id);
      if(P13._legacy||!s||!f||f.classList.contains('hid')||f.classList.contains('fdlim'))return r;   // "All details" and the material-only view keep the old folder
      // hide the old folder without leaving it in the back history
      f.classList.add('hid');try{for(let i=navStack.length-1;i>=0;i--){if(navStack[i].m==='m-folder'){navStack.splice(i,1);break;}}}catch(e){}
      try{lastHid=null;}catch(e){}
      if(j2open){after();return r;}
      draw();open('m-job2');
    }catch(e){try{console.warn('p13',e)}catch(_){}}
    return r;};
}
// keep the screen fresh when data changes (sync, saves)
if(typeof window.renderAll==='function'){const _ra=window.renderAll;window.renderAll=function(){const r=_ra.apply(this,arguments);try{refresh();}catch(e){}return r;};}
})();

/* Home fix (Baruch 11/3 "Is it not necessary to show updated meetings on the home screen?"):
   option 13 kept quiet sections closed with no way to open them. Now:
   - Meetings & inspections is open on Home (tap its title to close/open, remembered)
   - any other closed section opens when you tap its title (remembered)
   Staging's newer home code already opens sections on tap (p9open) — then only start Meetings open. */
(function(){
const newer=!!(window.P7&&typeof P7.fold==='function'&&String(P7.fold).indexOf('p9open')>=0);
try{if(!localStorage.getItem('p13meetsReset')){localStorage.removeItem('p7f_meets');if(newer)localStorage.setItem('p9o_meets','1');localStorage.setItem('p13meetsReset','1');}}catch(e){}
if(newer)return;
const css=document.createElement('style');
css.textContent='html.o13 body #homeBody .p7c[data-k=meets]:not(.fold) .bd,html.o13 body #homeBody .p7c.p13open .bd{display:block!important}';
document.head.appendChild(css);
const QUIET=k=>!['att','tasks','myjob','myjobT','meets'].includes(k);
const isOpen=k=>{try{return localStorage.getItem('p13o_'+k)==='1';}catch(e){return false;}};
function apply(){try{document.querySelectorAll('#homeBody .p7c[data-k]').forEach(c=>{const k=c.getAttribute('data-k');if(QUIET(k))c.classList.toggle('p13open',isOpen(k));});}catch(e){}}
function hook(){if(!window.P7||typeof P7.fold!=='function'||P7._p13)return false;const _f=P7.fold;
  P7.fold=function(k){const c=document.querySelector('.p7c[data-k="'+k+'"]');
    if(c&&document.documentElement.classList.contains('o13')&&QUIET(k)&&!c.classList.contains('p9bad')){const o=!c.classList.contains('p13open');c.classList.toggle('p13open',o);try{localStorage.setItem('p13o_'+k,o?'1':'0');}catch(e){}return;}
    return _f.apply(this,arguments);};
  P7._p13=1;return true;}
if(!hook())setTimeout(hook,1500);
const start=()=>{const hb=document.getElementById('homeBody');if(!hb)return setTimeout(start,500);apply();new MutationObserver(apply).observe(hb,{childList:true});};start();
})();
