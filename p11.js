/* p11.js — Material, the new way (Baruch approved 10/29, screens A–G).
   For everyone who asks for material, except Menachem (he keeps his page):
   A Material page = my orders (Open / Done) + New request
   B New request    = job filled in, Say it / Photo / Order again, kits, search, my usual, Browse all
   C All materials  = category tiles      D A category = side menu + items
   E Say it / Photo = what was said or read, fix it, add to my list
   F Review & send  = list, when, how it gets there, note, send
   G Track it       = where it is, Menachem's messages, All here / Something missing
   English + Spanish (item names too, from mat-es.js), light + dark. Same data as before (records 'mats'). */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const tt=x=>{try{return typeof t==='function'?t(x):x}catch(e){return x}};
const M=()=>{try{return me()}catch(e){return null}};
const ES_ON=()=>{try{return lang()==='es'}catch(e){return false}};
const E=s=>{try{return esc(String(s==null?'':s))}catch(e){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}};
const J=s=>{try{return jsq(String(s))}catch(e){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}};
const isMen=m=>!!m&&m.role==='office'&&m.title==='Material';
const ON=m=>{m=m||M();try{return !!m&&!isMen(m)&&seesMat(m);}catch(e){return false}};
const num=v=>{try{return mcNum(v)}catch(e){const n=+v;return isNaN(n)?null:n}};
const fmt=n=>{try{return mcFmt(n)}catch(e){return String(n)}};
const unitL=u=>{try{return mcUnitL(u)}catch(e){return u||'pc'}};
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[“”″]/g,'"');
const P11=window.P11={};

/* ---------- icons (same line style everywhere) ---------- */
const IP={pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>',
cam:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
rep:'<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
srch:'<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
box:'<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
wire:'<path d="M4 9a2 2 0 0 1-2-2V5h6v2a2 2 0 0 1-2 2Z"/><path d="M3 5V3M7 5V3M19 15V6.5a3.5 3.5 0 0 0-7 0v11a3.5 3.5 0 0 1-7 0V9"/><path d="M17 21v-2M21 21v-2M22 19h-6v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2Z"/>',
plug:'<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
zap:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
bulb:'<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/>',
pipe:'<path d="M3 7h13a5 5 0 0 1 5 5v9"/><path d="M3 13h9a3 3 0 0 1 3 3v5"/>',
wifi:'<path d="M12 20h.01M2 8.82a15 15 0 0 1 20 0M5 12.86a10 10 0 0 1 14 0M8.5 16.43a5 5 0 0 1 7 0"/>',
wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',tape:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/>',
star:'<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
pen:'<path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z"/>',
kit:'<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
truck:'<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
gar:'<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12M6 14h12"/><path d="M6 22V10h12v12"/>',
store:'<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20"/>',
clock:'<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3 2"/>',
msg:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
chk:'<path d="M20 6 9 17l-5-5"/>',chev:'<path d="m9 18 6-6-6-6"/>',back:'<path d="m15 18-6-6 6-6"/>',x:'<path d="M18 6 6 18M6 6l12 12"/>',
plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
alert:'<circle cx="12" cy="12" r="9.5"/><path d="M12 8v4M12 16h.01"/>',
note:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h6M8 13h8M8 17h5"/>',
img:'<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
list:'<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
trash:'<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'};
const I=(n,s,w)=>'<svg width="'+(s||20)+'" height="'+(s||20)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(w||1.8)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(IP[n]||'')+'</svg>';

/* ---------- Spanish ---------- */
const S_ES={"New request":"Nuevo pedido","Open":"Abiertos","Done":"Terminados","Say it":"Dilo","Photo":"Foto","Order again":"Pedir otra vez","Kits":"Kits",
"Search 12/2, GFI, 4 square…":"Buscar 12/2, GFI, caja 4…","My usual":"Lo de siempre","Browse all materials":"Ver todos los materiales","My list":"Mi lista",
"Review & send":"Revisar y enviar","All materials":"Todos los materiales","Search all materials":"Buscar en todos","Categories":"Categorías",
"Something else":"Otra cosa","Type it, add a photo":"Escríbelo, agrega foto","Check the list":"Revisa la lista","You said":"Dijiste","Photo of a list":"Foto de una lista",
"Add to my list":"Agregar a mi lista","Needed":"Lo necesito","Now":"Ahora","Tomorrow":"Mañana","This week":"Esta semana","Get it":"Cómo llega",
"Deliver":"Entrega","Garage":"Garaje","Store":"Tienda","Note for Menachem":"Nota para Menachem","Send to Menachem":"Enviar a Menachem","Request":"Pedido",
"Asked":"Enviado","Ordered":"Pedido","Preparing":"Preparando","Ready":"Listo","Picked up":"Recogido","At the job":"En la obra","Ready / on the way":"Listo / en camino",
"Ordered / preparing":"Pedido / preparando","All here":"Todo llegó","Something missing":"Falta algo","Reply…":"Responder…","Send":"Enviar","Change":"Cambiar",
"Today's job":"Trabajo de hoy","Tomorrow's job":"Trabajo de mañana","Pick the job":"Elige el trabajo","Which job?":"¿Para qué trabajo?","Search a job or type an address":"Busca un trabajo o escribe la dirección",
"Use this address":"Usar esta dirección","items":"artículos","item":"artículo","You":"Tú","Ready at the garage — pick up":"Listo en el garaje — recoger",
"Ready — on the way to the job":"Listo — en camino a la obra","Ready at the store — pick up":"Listo en la tienda — recoger","Waiting for Menachem":"Esperando a Menachem",
"Menachem is getting it":"Menachem lo está consiguiendo","Everything arrived":"Todo llegó","Missing":"Falta","Seen":"Visto",
"Nothing open.":"Nada abierto.","Nothing done yet.":"Nada terminado todavía.","Tap New request to ask for material.":"Toca Nuevo pedido para pedir material.",
"Mine":"Míos","Everyone":"Todos","Listening…":"Escuchando…","Tap to talk":"Toca para hablar","Tap when you finish":"Toca cuando termines",
"Or type it here":"O escríbelo aquí","Type what you need, e.g. 40 1-gang boxes, 3 rolls 12/2":"Escribe lo que necesitas, ej. 40 cajas 1 gang, 3 rollos 12/2",
"Read it":"Leer","Reading…":"Leyendo…","Found":"Encontré","fix anything that is off":"corrige lo que esté mal","Not sure — tap to pick the right one":"No seguro — toca para elegir",
"Keep as written":"Dejar como está","Pick the right one":"Elige el correcto","Couldn't read the photo — it is attached, Menachem will read it.":"No pude leer la foto — va adjunta, Menachem la leerá.",
"The photo is attached to your request.":"La foto va adjunta a tu pedido.","Take a photo":"Tomar foto","Choose from gallery":"Elegir de la galería",
"Add":"Agregar","Remove":"Quitar","Name":"Nombre","How many":"Cuántos","Description (optional)":"Descripción (opcional)","Add a photo":"Agregar foto",
"What is it?":"¿Qué es?","Your list is empty":"Tu lista está vacía","Sent to Menachem":"Enviado a Menachem","Pick the job first":"Primero elige el trabajo",
"Nothing to order again yet":"Todavía no hay nada para pedir otra vez","added":"agregados","from":"de","Uncheck what you don't need, change amounts":"Quita lo que no necesitas, cambia cantidades",
"Add {n} to my list":"Agregar {n} a mi lista","Messages":"Mensajes","Menachem will message you here if he has a question.":"Menachem te escribirá aquí si tiene una pregunta.",
"What is missing?":"¿Qué falta?","Tell Menachem":"Avisar a Menachem","Thanks — Menachem knows everything arrived.":"Gracias — Menachem sabe que todo llegó.",
"Menachem knows what is missing.":"Menachem sabe lo que falta.","Open checklist":"Abrir lista de preparación","Edit list":"Editar lista",
"needed":"para","Deliver to the job":"Entrega en la obra","Pick up at the garage":"Recoger en el garaje","Pick up at the store":"Recoger en la tienda",
"Missing at the job":"Falta en la obra","Arrived — all here":"Llegó — todo completo","Photos":"Fotos","Voice doesn't work on this phone — type it or use the keyboard mic.":"La voz no funciona en este teléfono — escríbelo o usa el micrófono del teclado.",
"Nothing found":"No se encontró nada","More":"Más","Other":"Otros","Show English":"Ver en inglés","No job picked":"Sin trabajo","Garage / van stock":"Garaje / camioneta",
"Not for a job":"No es para un trabajo","Plastic":"Plástico","Metal":"Metal","Order again added":"Pedir otra vez agregó","Kit":"Kit",
"Wire & cable":"Cable y alambre","What's in the garage":"Lo que hay en el garaje","Search the garage":"Buscar en el garaje","In stock":"En existencia","Took":"Saqué","Put back":"Devolví","In the garage":"En el garaje","Not in the garage":"No hay en el garaje","None in the garage":"No hay en el garaje","in the garage":"en el garaje","garage will have":"el garaje tendrá","Fix the count":"Corregir la cantidad","how many are on the shelf?":"¿cuántos hay en el estante?","Save the count":"Guardar cantidad","Not enough in the garage":"No hay suficiente en el garaje","Saved on the phone — it sends when there is signal.":"Guardado en el teléfono — se envía cuando haya señal.","Garage now":"Garaje ahora","Nothing counted in the garage yet.":"Todavía no hay nada contado en el garaje.","It's in the garage — go pick it up and tap Took, instead of asking Menachem.":"Está en el garaje — ve a recogerlo y toca Saqué, en vez de pedírselo a Menachem.","Manage Materials":"Administrar materiales","Could not save":"No se pudo guardar","Boxes & rings":"Cajas y anillos","Lighting":"Iluminación","Fittings & fasteners":"Conectores y fijaciones","Tape & misc":"Cinta y varios","Fittings":"Conectores","Switches, outlets":"Switches, tomacorrientes","Type it instead":"Escribirlo","Say what you need, e.g. “40 1-gang boxes, 3 rolls of 12/2”":"Di lo que necesitas, ej. “40 cajas de 1 gang, 3 rollos de 12/2”","Say it again":"Decirlo otra vez","Show {n} more":"Ver {n} más","Show less":"Ver menos","Boxes & covers":"Cajas y tapas","Devices & plates":"Dispositivos y tapas","Panels & breakers":"Paneles y breakers",
"Lighting & fans":"Luces y abanicos","Conduit & fittings":"Tubería y conectores","Low voltage":"Bajo voltaje","Tape & supplies":"Cinta y varios",
"Wire":"Cable","Boxes":"Cajas","Devices":"Dispositivos","Breakers":"Breakers","Lights":"Luces","Conduit":"Tubería","Low volt":"Bajo volt.","Misc":"Varios",
"pc":"pza","ft":"pies","coil":"rollo","roll":"rollo","reel":"carrete","spool":"carrete","box":"caja","pack":"paquete","bag":"bolsa","stick":"tramo","pair":"par","set":"juego","kit":"kit","tube":"tubo","bottle":"botella","can":"lata","sheet":"hoja",
"custom":"especial","Something missing at":"Falta algo en","All here at":"Todo llegó en","Material request":"Pedido de material","Note":"Nota","Edit":"Editar"};
const CAT_ES={"Rigid, IMC & large EMT":"Rígido, IMC y EMT grande","Strut, rod & hangers":"Strut, varilla y colgadores","MC & AC cable":"Cable MC y AC","Commercial wire & cord":"Cable y cordón comercial",
"Commercial boxes & mud rings":"Cajas comerciales y mud rings","Commercial lighting, devices & controls":"Luces, dispositivos y controles comerciales","Surface raceway & cable tray":"Canaleta y bandeja de cable",
"3-phase, panels & disconnects":"Trifásico, paneles y desconectadores","Conduit fittings & connectors":"Conectores y accesorios de tubería","Breakers":"Breakers",
"Building wire & ground wire (THHN / XHHW)":"Cable THHN / XHHW y cable de tierra","Boxes, rings & covers":"Cajas, anillos y tapas","Low voltage, data & doorbell":"Bajo voltaje, datos y timbre",
"Receptacles":"Tomacorrientes","Recessed & indoor lighting":"Luces empotradas e interiores","Wall plates":"Tapas","Switches, dimmers & sensors":"Switches, dimmers y sensores",
"Meters & service equipment":"Meters y equipo de servicio","Panels & load centers":"Paneles y load centers","Tape, labels & supplies":"Cinta, etiquetas y suministros",
"Wire connectors & splicing":"Conectores de cable y empalmes","Conduit (PVC / EMT / flex / ENT)":"Tubería (PVC / EMT / flex / ENT)","Staples, straps & fasteners":"Grapas, abrazaderas y tornillos",
"Tools, bits & blades":"Herramientas, brocas y hojas","Romex (NM-B)":"Romex (NM-B)","HVAC, EV & appliance hookup":"HVAC, cargador EV y conexión de aparatos","Disconnects & fuses":"Desconectadores y fusibles",
"Service & feeder cable (SER / SEU / URD)":"Cable de servicio (SER / SEU / URD)","Temporary power & cords":"Luz temporal y extensiones","Grounding & bonding":"Tierra y bonding",
"LED tape & under-cabinet":"Cinta LED y bajo gabinete","Outdoor & landscape lighting":"Luces exteriores y de jardín","UF-B & underground cable":"UF-B y cable subterráneo",
"Smoke / CO, exit & emergency":"Humo / CO, salida y emergencia","Generator & surge":"Generador y supresor","Fans & bath fans":"Abanicos y extractores de baño",
"Hazardous location & sealing":"Áreas peligrosas y sellado","Hospital grade & fire alarm":"Grado hospital y alarma de incendio","Firestop & fireproofing":"Cortafuego","Other specialty":"Otros especiales","Other materials":"Otros materiales"};
try{if(typeof ES==='object')Object.keys(S_ES).forEach(k=>{if(!(k in ES)||['pc','ft','box','Done','Open','Send','Note','Edit','Change','Request','Garage','Store','Deliver','Now','Tomorrow','Ready','Ordered','Asked','Missing','Messages'].includes(k))ES[k]=S_ES[k];});}catch(e){}
const L=k=>ES_ON()&&S_ES[k]?S_ES[k]:tt(k);
const catL=c=>ES_ON()&&CAT_ES[c]?CAT_ES[c]:(c||L('Other'));

/* Spanish item names: loaded only for people who use Spanish */
let esLoading=false;
function esLoad(){if(!ES_ON()||window.EX_MAT_ES||esLoading)return;esLoading=true;const s=document.createElement('script');s.src='mat-es.js?'+(window.EX_VERSION||'1');s.onload=()=>{esIdx=null;try{redraw();}catch(e){}};s.onerror=()=>{esLoading=false;};document.head.appendChild(s);}
function nmOf(en){const es=ES_ON()&&window.EX_MAT_ES&&window.EX_MAT_ES[en];return es&&es!==en?{a:es,b:en}:{a:en,b:''};}
function nmItem(i){/* a line on a request: catalog item → its (Spanish) name; custom → as typed */const s=i.sid?gst(i.sid):null;const en=s?s.name:(i.t||'');return nmOf(en);}

/* ---------- catalog ---------- */
const gst=id=>{try{return mcGet(id)}catch(e){return (D.stock||[]).find(x=>x&&x.id===id)}};
const vis=s=>{try{return mcVis(s)}catch(e){return !!s&&!s.hidden&&!s.mergedInto}};
const allSt=()=>(D.stock||[]).filter(s=>s&&s.name&&vis(s));
const isFt=s=>{try{return mcIsFeet(s)}catch(e){return (s.unit||'')==='ft'}};
const GROUPS=[['wire','Wire & cable','Wire','wire',/romex|uf-b|service & feeder|building wire|mc & ac|commercial wire/i],
['box','Boxes & rings','Boxes','box',/^boxes|commercial boxes/i],
['dev','Devices','Devices','plug',/receptacle|switches|wall plates|commercial lighting, devices|low voltage|fire alarm/i],
['pan','Panels & breakers','Breakers','zap',/breaker|panels|meters|disconnects|3-phase|generator|grounding/i],
['light','Lighting','Lighting','bulb',/lighting|led tape|smoke|fans/i],
['cond','Fittings & fasteners','Fittings','wrench',/conduit|rigid|strut|raceway|staples|connectors & splicing/i],
['misc','Tape & misc','Misc','tape',/./]];
const GSUB={dev:'Switches, outlets',pan:'Leviton'};
const grpOf=s=>{const c=String(s.cat||'');for(const g of GROUPS){if(g[0]!=='misc'&&g[4].test(c))return g[0];}return 'misc';};
let grpCache=null,grpSig='';
function groups(){const L0=allSt();const sig=L0.length+'|'+((D.stock||[]).length);if(grpCache&&grpSig===sig)return grpCache;const G={};GROUPS.forEach(g=>G[g[0]]=[]);L0.forEach(s=>G[grpOf(s)].push(s));grpCache=G;grpSig=sig;return G;}
const srt=(a,b)=>{try{return mcSort(a,b)}catch(e){return String(a.name).localeCompare(String(b.name))}};

/* search: English (the app's own search) + Spanish words + Spanish names */
const SPAN={gfi:'gfci',gfis:'gfci',caja:'box',cajas:'box',cajita:'box',cajitas:'box',anillo:'ring',anillos:'ring',tapa:'plate',tapas:'plate',tomacorriente:'receptacle',tomacorrientes:'receptacle',toma:'receptacle',tomas:'receptacle',enchufe:'receptacle',enchufes:'receptacle',
interruptor:'switch',interruptores:'switch',apagador:'switch',apagadores:'switch',suiche:'switch',suiches:'switch',braker:'breaker',brakers:'breaker',breakers:'breaker',abanico:'fan',abanicos:'fan',ventilador:'fan',extractor:'exhaust fan',
techo:'ceiling',redonda:'round',redondo:'round',cuadrada:'square',cuadrado:'square',luz:'light',luces:'light',lampara:'light',lamparas:'light',foco:'bulb',focos:'bulb',bombillo:'bulb',bombillos:'bulb',empotrada:'recessed',empotradas:'recessed',
tubo:'conduit',tubos:'conduit',tuberia:'conduit',codo:'elbow',codos:'elbow',conector:'connector',conectores:'connector',union:'coupling',uniones:'coupling',copla:'coupling',coplas:'coupling',abrazadera:'strap',abrazaderas:'strap',
grapa:'staple',grapas:'staple',cinta:'tape',tierra:'ground',alambre:'wire',rollo:'coil',rollos:'coil',carrete:'reel',carretes:'reel',tornillo:'screw',tornillos:'screw',taquete:'anchor',taquetes:'anchor',amarras:'cable ties',amarra:'cable ties',
cinchos:'cable ties',humo:'smoke',detector:'detector',detectores:'detector',medidor:'meter',tablero:'panel',fusible:'fuse',fusibles:'fuse',blanco:'white',blanca:'white',negro:'black',negra:'black',gris:'gray',marfil:'ivory',
amarillo:'yellow',amarillos:'yellow',rojo:'red',rojos:'red',azul:'blue',naranja:'orange',verde:'green',capuchon:'wire nut',capuchones:'wire nut',nueva:'new work',viejo:'old work',vieja:'old work',sencilla:'1-gang',doble:'2-gang',
timbre:'doorbell',exterior:'outdoor',afuera:'outdoor',bano:'bath',cocina:'kitchen',piscina:'pool',canaleta:'raceway',varilla:'rod',broca:'bit',brocas:'bit',hoja:'blade',hojas:'blade',extension:'extension cord',
regulador:'dimmer',sensor:'sensor',tres:'3',vias:'way',via:'way',polo:'pole',polos:'pole',pies:'ft',pie:'ft',pulgada:'"',pulgadas:'"',soporte:'brace'};
const STOP=new Set(['de','del','para','con','el','la','los','las','y','e','o','a','en','que','necesito','necesitamos','quiero','dame','traer','trae','por','favor','i','need','we','please','the','of','for','and','with','some','unos','unas','mas']);
const NUMW={un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,once:11,doce:12,quince:15,veinte:20,veinticinco:25,treinta:30,cuarenta:40,cincuenta:50,sesenta:60,setenta:70,ochenta:80,noventa:90,cien:100,ciento:100,
one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twelve:12,fifteen:15,twenty:20,thirty:30,forty:40,fifty:50,hundred:100,a:1};
function toEn(q){let s=' '+norm(q)+' ';
  s=s.replace(/\b(\d+|un|uno|una|dos|tres|cuatro|one|two|three|four|single|double)\s*-?\s*gang\b/g,(w,n)=>' '+(NUMW[n]||({single:1,double:2})[n]||n)+'-gang ');
  s=s.replace(/\b(\d+)\s*(amps?|amperes?|amperios?)\b/g,' $1a ').replace(/\b(gfi|gfci)s\b/g,' gfci ').replace(/\bwire ?nuts?\b/g,' wire nut ');
  s=s.replace(/\bobra nueva\b/g,' new work ').replace(/\btrabajo viejo\b/g,' old work ').replace(/\b3 vias\b/g,' 3-way ').replace(/\btres vias\b/g,' 3-way ').replace(/\bwire ?nuts?\b/g,' wire nut ');
  return s.split(/\s+/).filter(Boolean).map(w=>SPAN[w]!==undefined?SPAN[w]:w).filter(w=>!STOP.has(w)).join(' ').trim();}
let esIdx=null;
function esIndex(){if(esIdx)return esIdx;const X=window.EX_MAT_ES||{};esIdx=allSt().map(s=>({s,h:' '+norm((X[s.name]||'')+' '+s.name)+' '}));return esIdx;}
function search(q,lim){lim=lim||40;q=String(q||'').trim();if(!q)return [];const out=new Map();
  const add=L0=>(L0||[]).forEach(s=>{if(s&&!out.has(s.id))out.set(s.id,s);});
  try{add(mcSearch(q,lim));}catch(e){}
  const en=toEn(q);if(en&&en!==norm(q)){try{add(mcSearch(en,lim));}catch(e){}}
  const toks=norm(q).split(/\s+/).filter(w=>w&&!STOP.has(w)).map(w=>w.replace(/(es|s)$/,''));
  if(toks.length&&window.EX_MAT_ES){esIndex().forEach(o=>{if(toks.every(tk=>o.h.includes(tk)))add([o.s]);});}
  return [...out.values()].slice(0,lim);}

/* ---------- state ---------- */
let CART=[];let JOB={site:'',addr:''};let WHEN='Now';let SRC='deliver';let NOTE='';let PHOTOS=[];let SPOKEN='';let FOUND=[];
const ck=()=>'p11cart_'+((M()||{}).id||'x');
function saveCart(){try{localStorage.setItem(ck(),JSON.stringify({c:CART,j:JOB,w:WHEN,s:SRC,n:NOTE,ts:Date.now()}));}catch(e){}}
function loadCart(){try{const o=JSON.parse(localStorage.getItem(ck())||'null');if(o&&Date.now()-(o.ts||0)<3*86400000){CART=Array.isArray(o.c)?o.c:[];JOB=o.j||JOB;WHEN=o.w||WHEN;SRC=o.s||SRC;NOTE=o.n||'';return true;}}catch(e){}return false;}
function clearCart(){CART=[];NOTE='';PHOTOS=[];WHEN='Now';SRC='deliver';try{localStorage.removeItem(ck());}catch(e){}}
const cartN=()=>CART.length;
function cartGet(sid,name){return sid?CART.find(c=>c.sid===sid):CART.find(c=>!c.sid&&norm(c.name)===norm(name));}
function stepOf(s){return s&&isFt(s)?10:1;}
function addStock(sid,n){const s=gst(sid);if(!s)return;const c=cartGet(sid);const st=stepOf(s);if(c)c.n=(+c.n||0)+(n||st);else CART.push({sid,name:s.name,unit:s.unit||'pc',n:n||(isFt(s)?50:1)});saveCart();}
function addCustom(name,n,unit,desc,img){name=String(name||'').trim();if(!name)return;const c=cartGet(null,name);if(c&&!img)c.n=(+c.n||0)+(+n||1);else CART.push({sid:null,name,unit:unit||'pc',n:+n||1,cu:true,desc:desc||'',img:img||''});saveCart();}
function setQty(key,v){const c=CART.find(x=>(x.sid||'c:'+x.name)===key);if(!c)return;const n=Math.max(0,num(v)||0);if(!n)CART.splice(CART.indexOf(c),1);else c.n=n;saveCart();}

/* job: the crew's job today (or tomorrow) is filled in */
function dk(d){try{return dkey(d)}catch(e){const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}}
function crewSite(off){const m=M();if(!m||!m.crew)return '';try{const sl=schedDay(m.crew+'|'+dk(new Date(Date.now()+off*86400000)));return sl&&sl.site||'';}catch(e){return ''}}
function defaultJob(){const a=crewSite(0);if(a)return {site:a,addr:'',sub:"Today's job"};const b=crewSite(1);if(b)return {site:b,addr:'',sub:"Tomorrow's job"};return {site:'',addr:''};}
const sName=id=>{try{return siteName(id)}catch(e){const s=(D.sites||[]).find(x=>x.id===id);return s?s.name:''}};
function phaseOf(id){try{const s=(D.sites||[]).find(x=>x.id===id);const p=window.EX_jobPhase?window.EX_jobPhase(s):(s&&s.phase);return p?String(p).replace(/^./,c=>c.toUpperCase()):''}catch(e){return ''}}

/* ---------- overlays ---------- */
let zTop=120;
function ovEl(id){let el=$(id);if(!el){el=document.createElement('div');el.id=id;el.className='ov hid p11ov p11';document.body.appendChild(el);}return el;}
function open(id,html,sheet){const el=ovEl(id);el.classList.toggle('p11sheet',!!sheet);el.innerHTML=html;el.style.zIndex=String(zTop++);if(el.classList.contains('hid'))show(id);if(sheet){el.onclick=e=>{if(e.target===el)close(id);};}return el;}
function close(id){const el=$(id);if(el&&!el.classList.contains('hid'))hide(id);}
function closeAll(){['m-p11g','m-p11h','m-p11b','m-p11c','m-p11d','m-p11e','m-p11f','m-p11j','m-p11k','m-p11o','m-p11x','m-p11m','m-p11p'].forEach(close);}
const opened=id=>{const el=$(id);return !!el&&!el.classList.contains('hid');};
function hdr(title,left,act){return '<div class="p11hdr"><button class="p11hb" onclick="'+(act||'')+'" aria-label="'+E(L('Back'))+'">'+I(left||'back',22,2)+'</button><h3>'+E(title)+'</h3><span class="p11hb"></span></div>';}
function stepper(key,n,st){const K=J(key);return '<div class="p11stp"><button onclick="P11.q(\''+K+'\','+(Math.max(0,(+n||0)-(st||1)))+')" aria-label="'+E(L('Less'))+'">'+I('minus',16,2.2)+'</button><input data-nomic="1" inputmode="decimal" value="'+E(fmt(n))+'" onchange="P11.q(\''+K+'\',this.value)" aria-label="'+E(L('How many'))+'"><button onclick="P11.q(\''+K+'\','+((+n||0)+(st||1))+')" aria-label="'+E(L('More'))+'">'+I('plus',16,2.2)+'</button></div>';}
function itemRow(s){const c=cartGet(s.id);const n=nmOf(s.name);const st=stepOf(s);
  return '<div class="p11it" data-sid="'+E(s.id)+'"><div class="p11w"><b>'+E(n.a)+'</b>'+(n.b?'<small>'+E(n.b)+'</small>':'')+garBadge(s)+'</div>'+(c?stepper(s.id,c.n,st):'<button class="p11add" onclick="P11.add(\''+J(s.id)+'\')" aria-label="'+E(L('Add'))+'">'+I('plus',17,2.2)+'</button>')+'</div>';}
function cartBar(){const n=cartN();return '<div class="p11foot"><button class="p11cart'+(n?'':' off')+'" onclick="P11.review()"><span class="p11cn">'+n+'</span>'+E(L('My list'))+'<span class="p11r">'+E(L('Review & send'))+' '+I('chev',16,2.2)+'</span></button></div>';}
function redraw(){if(opened('m-p11b'))P11.newReq(true);if(opened('m-p11c'))P11.all(true);if(opened('m-p11d'))P11.cat(curG,true);if(opened('m-p11f'))P11.review(true);if(opened('m-p11e'))drawE();if(opened('m-p11x'))P11.track(curT,true);try{if(ON()&&$('p11home'))home();}catch(e){}}

/* ---------- A: the Material page ---------- */
let tabA='open',whoA='mine',rAt=0;
function mineList(m){const all=D.mats||[];if(canHandleMat(m)&&whoA==='all')return all;
  return all.filter(x=>x.from===m.id||x.to===m.id||(x.collab||[]).includes(m.id)||(m.crew&&(D.emps||[]).some(e=>e.id===x.from&&e.crew===m.crew)));}
function stOf(r){try{return mcStatus(r)}catch(e){return r.status==='delivered'?'completed':r.status==='ordered'?'ordered':'requested'}}
function stepIx(r){if(r.got)return 4;const s=stOf(r);return s==='completed'?4:(s==='ready'||s==='partpicked')?3:(['ordered','preparing','partial'].includes(s))?2:1;}
function pillOf(r){if(r.miss&&!r.got)return ['Missing','p11p-bad'];if(r.got)return ['All here','p11p-ok'];const s=stOf(r);
  return s==='completed'?['Done','p11p-ok']:s==='ready'?['Ready','p11p-ok']:s==='partpicked'?['Picked up','p11p-ok']:['ordered','preparing','partial'].includes(s)?[s==='ordered'?'Ordered':'Preparing','p11p-amb']:[s==='reviewing'?'Seen':'Asked','p11p-ask'];}
const isDone=r=>!!r.got||stOf(r)==='completed';
function srcL(r){const v=(()=>{try{return mcSrc(r)}catch(e){return r.src||'garage'}})();return v;}
function hintOf(r){const cs=(()=>{try{return liComments(r)}catch(e){return []}})();const last=cs[cs.length-1];
  if(r.miss&&!r.got)return [I('alert',15),L('Missing at the job')];
  if(last&&last.by!==(M()||{}).id&&!isDone(r))return [I('msg',15),E(nameOf(last.by).split(' ')[0])+': “'+E(String(last.text||'').slice(0,60))+'”'];
  const s=stepIx(r),v=srcL(r);
  if(s>=4)return [I('chk',15),L('Everything arrived')];
  if(s===3)return v==='garage'?[I('gar',15),L('Ready at the garage — pick up')]:v==='pickup'?[I('store',15),L('Ready at the store — pick up')]:[I('truck',15),L('Ready — on the way to the job')];
  if(s===2)return [I('clock',15),L('Menachem is getting it')];
  return [I('clock',15),L('Waiting for Menachem')];}
function prog(n){let h='<div class="p11pr">';for(let i=0;i<4;i++)h+='<i class="'+(i<n?'on':'')+'"></i>';return h+'</div>';}
function whoName(id){const m=M();if(m&&id===m.id)return L('You');try{return nameOf(id).split(' ')[0]}catch(e){return ''}}
function reqCard(r){const its=(()=>{try{return liItems(r)}catch(e){return []}})();const p=pillOf(r);const h=hintOf(r);
  return '<button class="p11card p11rq" onclick="P11.track(\''+J(r.id)+'\')"><div class="p11rt"><b>'+E(sName(r.site)||r.addr||L('No job picked'))+'</b><span class="p11pill '+p[1]+'">'+E(L(p[0]))+'</span></div>'
   +'<div class="p11meta">'+its.length+' '+E(L(its.length===1?'item':'items'))+' · '+E(whoName(r.from))+' · '+E((()=>{try{return when(r.ts)}catch(e){return ''}})())+'</div>'+prog(stepIx(r))+'<div class="p11hint">'+h[0]+'<span>'+h[1]+'</span></div></button>';}
function home(){const m=M();const pg=$('pg-mat');if(!pg)return;pg.classList.add('p11on','p11');let el=$('p11home');if(!el){el=document.createElement('div');el.id='p11home';pg.appendChild(el);}
  esLoad();const L0=mineList(m);const op=L0.filter(r=>!isDone(r)),dn=L0.filter(isDone);const list=(tabA==='open'?op:dn).slice().sort((a,b)=>(b.ts||0)-(a.ts||0));
  let h='<div class="p11seg"><button class="'+(tabA==='open'?'on':'')+'" onclick="P11.tab(\'open\')">'+E(L('Open'))+' · '+op.length+'</button><button class="'+(tabA==='done'?'on':'')+'" onclick="P11.tab(\'done\')">'+E(L('Done'))+'</button></div>';
  if(canHandleMat(m))h+='<div class="p11seg p11seg2"><button class="'+(whoA==='mine'?'on':'')+'" onclick="P11.who(\'mine\')">'+E(L('Mine'))+'</button><button class="'+(whoA==='all'?'on':'')+'" onclick="P11.who(\'all\')">'+E(L('Everyone'))+'</button></div>';
  {let mgr=false;try{mgr=mcIsMgr(m);}catch(e){}
   h+='<div class="p11acts"><button class="p11act" id="p11garbtn" onclick="P11.garage()"><span class="p11ic">'+I('gar',19)+'</span><span>'+E(L("What's in the garage"))+'</span>'+I('chev',16,2)+'</button>'+(mgr?'<button class="p11act" onclick="mcManOpen()"><span class="p11ic">'+I('list',19)+'</span><span>'+E(L('Manage Materials'))+'</span>'+I('chev',16,2)+'</button>':'')+'</div>';}
  h+=list.length?list.slice(0,tabA==='done'?40:200).map(reqCard).join(''):'<div class="p11empty">'+I('box',30,1.5)+'<div>'+E(L(tabA==='open'?'Nothing open.':'Nothing done yet.'))+'</div>'+(tabA==='open'?'<small>'+E(L('Tap New request to ask for material.'))+'</small>':'')+'</div>';
  h+='<div class="p11newwrap"><button class="p11btn p11red" id="p11new" onclick="P11.newReq()">'+I('plus',19,2.4)+E(L('New request'))+(cartN()?' <span class="p11cn2">'+cartN()+'</span>':'')+'</button></div>';
  el.innerHTML=h;rAt=Date.now();requestAnimationFrame(fitNew);}
/* the pinned New request button leaves room for the app's round buttons at the bottom right (menu, +) */
function fitNew(){const w=document.querySelector('#p11home .p11newwrap');if(!w)return;let left=innerWidth;
  ['p7fm','p2fab'].forEach(id=>{const b=$(id);if(!b)return;const r=b.getBoundingClientRect();if(r.width&&r.bottom>innerHeight-130&&getComputedStyle(b).display!=='none'&&getComputedStyle(b).visibility!=='hidden')left=Math.min(left,r.left);});
  w.style.right=(left<innerWidth?Math.max(16,innerWidth-left+10):16)+'px';}
window.addEventListener('resize',()=>{try{fitNew();}catch(e){}});
P11.tab=v=>{tabA=v;home();};P11.who=v=>{whoA=v;home();};

/* ---------- B: new request ---------- */
let bq='';
function myUsual(){const m=M();const c={};(D.mats||[]).forEach(r=>{if(!r||r.from!==m.id)return;(()=>{try{return liItems(r)}catch(e){return []}})().forEach(i=>{if(i.sid){const s=gst(i.sid);if(s&&vis(s))c[s.id]=(c[s.id]||0)+1;}});});
  let L0=Object.keys(c).sort((a,b)=>c[b]-c[a]).map(gst).filter(Boolean).slice(0,8);
  if(L0.length<6){try{mcFrequent().forEach(s=>{if(L0.length<8&&!L0.includes(s))L0.push(s);});}catch(e){}}
  return L0;}
function jobCard(){const nm=JOB.site?sName(JOB.site):JOB.addr;const sub=JOB.site?[L(JOB.sub||"Today's job"),phaseOf(JOB.site)].filter(Boolean).join(' · '):JOB.addr?L('Use this address'):L('Which job?');
  return '<button class="p11job" onclick="P11.jobPick()"><span class="p11ji">'+I('pin',19)+'</span><span class="p11w"><b>'+E(nm||L('Pick the job'))+'</b><small>'+E(sub)+'</small></span><span class="p11lnk">'+E(L('Change'))+'</span></button>';}
function kitsH(){const ORD=Object.keys(KSH);const T=(D.mtpl||[]).filter(x=>x&&(x.items||[]).length).sort((a,b)=>{const i=ORD.indexOf(a.name),j=ORD.indexOf(b.name);return (i<0?99:i)-(j<0?99:j);});if(!T.length)return '';
  return '<div class="p11sec">'+E(L('Kits'))+'</div><div class="p11kits">'+T.map(x=>'<button class="p11kit" onclick="P11.kit(\''+J(x.id)+'\')">'+I('kit',17)+'<span><b>'+E(kitName(x))+'</b><small>'+(x.items||[]).length+' '+E(L('items'))+'</small></span></button>').join('')+'</div>';}
const KSH={'Residential rough-in':['Rough-in','Rough'],'Residential finish':['Finish','Finish'],'Service upgrade (200A)':['Service','Servicio'],'Complete house (rough + finish)':['Whole house','Casa completa'],'Apartment (one unit)':['Apartment','Apartamento'],'Renovation (old work)':['Old work','Old work'],'Panel replacement':['Panel swap','Cambio de panel'],'Commercial job (light commercial)':['Commercial','Comercial']};
function kitName(x){const n=String(x.name||'');const k=KSH[n];return k?k[ES_ON()?1:0]:n;}
function kitFull(x){const n=String(x.name||'');if(!ES_ON())return n;return ({'Residential rough-in':'Rough residencial','Residential finish':'Finish residencial','Complete house (rough + finish)':'Casa completa (rough + finish)','Apartment (one unit)':'Apartamento (una unidad)','Renovation (old work)':'Renovación (old work)','Service upgrade (200A)':'Cambio de servicio (200A)','Panel replacement':'Cambio de panel','Commercial job (light commercial)':'Trabajo comercial (ligero)'})[n]||n;}
function searchBox(id,ph,val){return '<div class="p11srch">'+I('srch',18)+'<input id="'+id+'" class="p11in" type="text" inputmode="search" enterkeyhint="search" data-nomic="1" autocomplete="off" placeholder="'+E(ph)+'" value="'+E(val||'')+'" oninput="P11.find(this.value,\''+id+'\')"><button class="p11mic" onclick="P11.dict(\''+id+'\')" aria-label="'+E(L('Say it'))+'">'+I('mic',18)+'</button></div>';}
function resultsH(q){const R=search(q,40);return R.length?'<div class="p11list">'+R.map(itemRow).join('')+'</div>'+(R.some(s=>gq(s)>0)?'<div class="p11gnote">'+I('gar',18)+'<span>'+E(L("It's in the garage — go pick it up and tap Took, instead of asking Menachem."))+'</span></div>':''):'<div class="p11empty sm">'+E(L('Nothing found'))+'<button class="p11btn p11ghost" onclick="P11.custom(\''+J(q)+'\')">'+I('pen',17)+E(L('Something else'))+': '+E(q)+'</button></div>';}
P11.newReq=function(re){const m=M();if(!m)return;esLoad();
  if(!re){if(!loadCart()||(!JOB.site&&!JOB.addr)){const d=defaultJob();if(!JOB.site&&!JOB.addr)JOB=d;}else if(!CART.length){JOB=defaultJob();}}
  const body=hdr(L('New request'),'x',"P11.closeNew()")+'<div class="p11body">'+jobCard()
   +'<div class="p11trio p11duo"><button onclick="P11.say()"><span class="p11ic">'+I('mic',21)+'</span>'+E(L('Say it'))+'</button><button onclick="P11.again()"><span class="p11ic">'+I('rep',21)+'</span>'+E(L('Order again'))+'</button></div>'
   +kitsH()+'<div style="margin-top:14px">'+searchBox('p11bq',L('Search 12/2, GFI, 4 square…'),bq)+'</div><div id="p11bres">'+(bq?resultsH(bq):usualH())+'</div>'
   +'<button class="p11link" onclick="P11.all()">'+E(L('Browse all materials'))+'</button><div style="height:110px"></div></div>'+cartBar();
  const sc=re&&$('m-p11b')?($('m-p11b').querySelector('.p11body')||{}).scrollTop:0;open('m-p11b',body);if(sc){const b=$('m-p11b').querySelector('.p11body');if(b)b.scrollTop=sc;}};
function usualH(){const U=myUsual();return U.length?'<div class="p11sec">'+E(L('My usual'))+'</div><div class="p11list">'+U.map(itemRow).join('')+'</div>':'';}
P11.closeNew=()=>{saveCart();close('m-p11b');try{home();}catch(e){}};
let findT=null;
P11.find=(v,id)=>{clearTimeout(findT);findT=setTimeout(()=>{if(id==='p11bq'){bq=v;const el=$('p11bres');if(el)el.innerHTML=v.trim()?resultsH(v):usualH();}else if(id==='p11cq'){cq=v;const el=$('p11cres');if(el)el.innerHTML=v.trim()?resultsH(v):tilesH();}else if(id==='p11dq'){dq=v;drawD();}else if(id==='p11gq'){gQ=v;gN=120;drawG();}},140);};
P11.add=sid=>{addStock(sid);refreshRows(sid);};
P11.q=(key,v)=>{if(!CART.find(x=>(x.sid||'c:'+x.name)===key)&&gst(key)){addStock(key,num(v)||0);}else setQty(key,v);refreshRows(key);if(opened('m-p11f'))P11.review(true);};
function refreshRows(sid){document.querySelectorAll('.p11it[data-sid="'+(window.CSS&&CSS.escape?CSS.escape(sid):sid)+'"]').forEach(row=>{const s=gst(sid);if(s){const tmp=document.createElement('div');tmp.innerHTML=itemRow(s);row.replaceWith(tmp.firstChild);}});
  document.querySelectorAll('.p11foot').forEach(f=>{const tmp=document.createElement('div');tmp.innerHTML=cartBar();f.replaceWith(tmp.firstChild);});}

/* job picker */
P11.jobPick=function(){const m=M();const today=crewSite(0),tom=crewSite(1);const seen=new Set();let top=[];
  if(today){top.push([today,L("Today's job")]);seen.add(today);}if(tom&&!seen.has(tom)){top.push([tom,L("Tomorrow's job")]);seen.add(tom);}
  const h=hdr(L('Which job?'),'x',"P11.close('m-p11j')")+'<div class="p11body">'+(top.length?'<div class="p11list">'+top.map(([id,sub])=>'<button class="p11it p11pick" onclick="P11.setJob(\''+J(id)+'\',\''+J(sub)+'\')"><span class="p11ji">'+I('pin',18)+'</span><div class="p11w"><b>'+E(sName(id))+'</b><small>'+E(sub)+'</small></div></button>').join('')+'</div>':'')
   +'<div style="margin-top:12px" class="p11srch">'+I('srch',18)+'<input id="p11jq" class="p11in" placeholder="'+E(L('Search a job or type an address'))+'" oninput="P11.jobFind(this.value)"></div><div id="p11jres"></div></div>';
  open('m-p11j',h);P11.jobFind('');};
P11.jobFind=function(q){const el=$('p11jres');if(!el)return;q=norm(q).trim();let L0=[];try{L0=(typeof visSites==='function'?visSites():liveSites());}catch(e){L0=D.sites||[];}
  const skip=q?new Set():new Set([crewSite(0),crewSite(1)]);L0=L0.filter(s=>s&&!skip.has(s.id)&&(!q||norm(s.name).includes(q))).filter(s=>q||['active','roughdone','inspection','ready','upcoming',undefined].includes(s.stage)).slice(0,40);
  el.innerHTML='<div class="p11list" style="margin-top:10px">'+L0.map(s=>'<button class="p11it p11pick" onclick="P11.setJob(\''+J(s.id)+'\',\'\')"><span class="p11ji">'+I('pin',18)+'</span><div class="p11w"><b>'+E(s.name)+'</b></div></button>').join('')
   +(q?'<button class="p11it p11pick" onclick="P11.setAddr()"><span class="p11ji">'+I('pen',18)+'</span><div class="p11w"><b>'+E(($('p11jq')||{}).value||'')+'</b><small>'+E(L('Use this address'))+'</small></div></button>':'')+'</div>';};
P11.setJob=(id,sub)=>{JOB={site:id,addr:'',sub:sub===L("Tomorrow's job")?"Tomorrow's job":sub?"Today's job":''};saveCart();close('m-p11j');if(opened('m-p11b'))P11.newReq(true);if(opened('m-p11f'))P11.review(true);};
P11.setAddr=()=>{const v=(($('p11jq')||{}).value||'').trim();if(!v)return;JOB={site:'',addr:v};saveCart();close('m-p11j');if(opened('m-p11b'))P11.newReq(true);if(opened('m-p11f'))P11.review(true);};
P11.close=close;

/* order again: the items of my last request (or my crew's) */
P11.again=function(){const m=M();const L0=(D.mats||[]).filter(r=>r&&r.from===m.id).sort((a,b)=>(b.ts||0)-(a.ts||0));let r=L0[0];
  if(!r&&m.crew)r=(D.mats||[]).filter(x=>x&&(D.emps||[]).some(e=>e.id===x.from&&e.crew===m.crew)).sort((a,b)=>(b.ts||0)-(a.ts||0))[0];
  if(!r){toast(L('Nothing to order again yet'));return;}let n=0;(()=>{try{return liItems(r)}catch(e){return []}})().forEach(i=>{const q=num(i.q)||1;if(i.sid&&gst(i.sid)){const c=cartGet(i.sid);if(c)c.n=Math.max(+c.n||0,q);else CART.push({sid:i.sid,name:gst(i.sid).name,unit:i.u||gst(i.sid).unit||'pc',n:q});n++;}else if(i.t){addCustom(i.t,q,i.u,i.desc);n++;}});
  saveCart();toast('↻ '+n+' '+L('items')+' '+L('added'),'green');P11.newReq(true);};

/* kits */
let kitSel=null;
P11.kit=function(id){const x=(D.mtpl||[]).find(y=>y.id===id);if(!x)return;kitSel={id,rows:(x.items||[]).map(it=>{const s=it.sid?gst(it.sid):null;return {sid:s&&vis(s)?s.id:null,name:s?s.name:it.t,unit:it.u||(s&&s.unit)||'pc',n:num(it.q)||1,on:true};}).filter(r=>r.name)};drawKit();};
function drawKit(){const x=(D.mtpl||[]).find(y=>y.id===kitSel.id)||{};const n=kitSel.rows.filter(r=>r.on).length;
  const h=hdr(kitFull(x),'back',"P11.close('m-p11k')")+'<div class="p11body"><div class="p11meta" style="margin:0 2px 10px">'+E(L("Uncheck what you don't need, change amounts"))+'</div><div class="p11list">'+kitSel.rows.map((r,i)=>{const nm=nmOf(r.name);
    return '<div class="p11it'+(r.on?'':' dim')+'"><button class="p11ck'+(r.on?' on':'')+'" onclick="P11.kitT('+i+')" aria-label="✓">'+(r.on?I('chk',15,2.6):'')+'</button><div class="p11w"><b>'+E(nm.a)+'</b>'+(nm.b?'<small>'+E(nm.b)+'</small>':'')+'</div><div class="p11stp"><button onclick="P11.kitQ('+i+','+Math.max(0,r.n-1)+')">'+I('minus',16,2.2)+'</button><input data-nomic="1" inputmode="decimal" value="'+E(fmt(r.n))+'" onchange="P11.kitQ('+i+',this.value)"><button onclick="P11.kitQ('+i+','+(r.n+1)+')">'+I('plus',16,2.2)+'</button></div></div>';}).join('')+'</div><div style="height:100px"></div></div>'
   +'<div class="p11foot"><button class="p11btn" onclick="P11.kitAdd()"'+(n?'':' disabled')+'>'+E(L('Add {n} to my list').replace('{n}',n))+'</button></div>';
  open('m-p11k',h);}
P11.kitT=i=>{kitSel.rows[i].on=!kitSel.rows[i].on;drawKit();};P11.kitQ=(i,v)=>{kitSel.rows[i].n=Math.max(0,num(v)||0);if(!kitSel.rows[i].n)kitSel.rows[i].on=false;drawKit();};
P11.kitAdd=()=>{let n=0;kitSel.rows.filter(r=>r.on&&r.n>0).forEach(r=>{if(r.sid){const c=cartGet(r.sid);if(c)c.n=(+c.n||0)+r.n;else CART.push({sid:r.sid,name:r.name,unit:r.unit,n:r.n});}else addCustom(r.name,r.n,r.unit);n++;});saveCart();close('m-p11k');toast('+ '+n+' '+L('items'),'green');P11.newReq(true);};

/* ---------- C + D: browse ---------- */
let cq='',dq='',curG='wire';
function tilesH(){const G=groups();return '<div class="p11sec">'+E(L('Categories'))+'</div><div class="p11grid">'+GROUPS.map(g=>'<button class="p11tile" onclick="P11.cat(\''+g[0]+'\')"><span class="p11ic">'+I(g[3],20)+'</span><b>'+E(L(g[1]))+'</b><small>'+E(GSUB[g[0]]?L(GSUB[g[0]]):G[g[0]].length+' '+L('items'))+'</small></button>').join('')
  +'<button class="p11tile" onclick="P11.custom(\'\')"><span class="p11ic">'+I('pen',20)+'</span><b>'+E(L('Something else'))+'</b><small>'+E(L('Type it, add a photo'))+'</small></button></div>';}
P11.all=function(re){const h=hdr(L('All materials'),'back',"P11.close('m-p11c')")+'<div class="p11body">'+searchBox('p11cq',L('Search all materials'),cq)+'<div id="p11cres">'+(cq?resultsH(cq):tilesH())+'</div><div style="height:110px"></div></div>'+cartBar();open('m-p11c',h);};
P11.cat=function(g,re){curG=g||curG;if(!re)dq='';const gi=GROUPS.find(x=>x[0]===curG)||GROUPS[0];
  const rail='<div class="p11rail"><button class="'+(curG==='usual'?'on':'')+'" onclick="P11.cat(\'usual\')">'+I('star',20)+'<span>'+E(L('My usual'))+'</span></button>'+GROUPS.map(x=>'<button class="'+(x[0]===curG?'on':'')+'" onclick="P11.cat(\''+x[0]+'\')">'+I(x[3],20)+'<span>'+E(L(x[2]))+'</span></button>').join('')+'</div>';
  const title=curG==='usual'?L('My usual'):L(gi[1]);
  const h=hdr(title,'back',"P11.close('m-p11d')")+'<div class="p11dtop">'+searchBox('p11dq',(ES_ON()?'Buscar en ':'Search ')+title.toLowerCase(),dq)+'</div><div class="p11dwrap">'+rail+'<div class="p11right" id="p11dright"></div></div>'+cartBar().replace('p11foot','p11foot p11footd');
  open('m-p11d',h);drawD();};
function drawD(){const el=$('p11dright');if(!el)return;let L0=curG==='usual'?myUsual():(groups()[curG]||[]);
  if(dq.trim()){const ids=new Set(search(dq,400).map(s=>s.id));L0=L0.filter(s=>ids.has(s.id));}
  if(curG==='usual'){el.innerHTML=L0.length?L0.map(itemRow).join(''):'<div class="p11empty sm">'+E(L('Nothing found'))+'</div>';el.scrollTop=0;return;}
  const by={};L0.forEach(s=>{const c=s.cat||'Other';(by[c]=by[c]||[]).push(s);});const cats=Object.keys(by).sort((a,b)=>by[b].length-by[a].length);
  el.innerHTML=cats.length?cats.map(c=>'<div class="p11sec">'+E(catL(c))+'</div>'+by[c].sort(srt).slice(0,dq?400:250).map(itemRow).join('')).join('')+'<div style="height:110px"></div>':'<div class="p11empty sm">'+E(L('Nothing found'))+'</div>';el.scrollTop=0;}

/* something else (custom) */
let cuImg='';
P11.custom=function(q){cuImg='';const h='<div class="p11sh"><div class="p11grab"></div><h2>'+E(L('Something else'))+'</h2>'
  +'<label class="p11lbl">'+E(L('What is it?'))+'</label><input id="p11oN" class="p11in p11box" value="'+E(q||'')+'">'
  +'<label class="p11lbl">'+E(L('How many'))+'</label><div style="display:flex;gap:8px"><input id="p11oQ" data-nomic="1" class="p11in p11box" inputmode="decimal" value="1" style="width:100px"><select id="p11oU" class="p11in p11box">'+['pc','ft','coil','roll','box','pack','bag','stick','reel'].map(u=>'<option value="'+u+'">'+E(L(u))+'</option>').join('')+'</select></div>'
  +'<label class="p11lbl">'+E(L('Description (optional)'))+'</label><input id="p11oD" class="p11in p11box">'
  +'<label class="p11btn p11ghost" style="margin-top:12px">'+I('cam',18)+E(L('Add a photo'))+'<input type="file" accept="image/*" hidden onchange="P11.cuPhoto(this)"></label><div id="p11oP"></div>'
  +'<button class="p11btn" style="margin-top:12px" onclick="P11.cuAdd()">'+E(L('Add to my list'))+'</button></div>';
  open('m-p11o',h,true);setTimeout(()=>{const i=$('p11oN');if(i&&!q)i.focus();},80);};
P11.cuPhoto=inp=>{const f=(inp.files||[])[0];if(!f)return;shrink(f,d=>{cuImg=d;const p=$('p11oP');if(p)p.innerHTML='<img src="'+E(d)+'" class="p11thumbimg">';});};
P11.cuAdd=()=>{const n=(($('p11oN')||{}).value||'').trim();if(!n)return;addCustom(n,num($('p11oQ').value)||1,$('p11oU').value,($('p11oD')||{}).value||'',cuImg);close('m-p11o');toast('+ '+n,'green');redraw();};

/* ---------- E: say it / photo ---------- */
let rec=null,listening=false,eMode='say';
P11.say=function(){eMode='say';eType=false;SPOKEN='';FOUND=[];eNote='';ePhoto='';drawE(true);setTimeout(()=>P11.listen(),150);};
let eType=false,ePhoto='',eBusy=false,eNote='';
function drawE(force){if(!force&&!opened('m-p11e'))return;const n=FOUND.filter(f=>f.on!==false).length;const res=FOUND.length||(SPOKEN&&!listening);
  let h=hdr(L(res?'Check the list':'Say it'),'back',"P11.stopE()")+'<div class="p11body">';
  if(!res&&!eBusy){/* listening (approved idea 4): one big mic */
    h+='<div class="p11listen"><button class="p11bigmic'+(listening?' on':'')+'" onclick="P11.listen()" aria-label="'+E(L('Say it'))+'">'+I('mic',44,1.7)+'</button><div class="p11lt">'+E(listening?L('Listening…'):L('Tap to talk'))+'</div><div class="p11meta p11lq">'+(SPOKEN?'“'+E(SPOKEN)+'”':E(L('Say what you need, e.g. “40 1-gang boxes, 3 rolls of 12/2”')))+'</div>'+(listening?'<div class="p11meta">'+E(L('Tap when you finish'))+'</div>':'')+'</div>';}
  else{h+='<div class="p11said"><span class="p11ic sm">'+I('mic',18)+'</span><div class="p11w"><small>'+E(L('You said'))+'</small><q>“'+E(SPOKEN)+'”</q></div><button class="p11hb" onclick="P11.again2()" aria-label="'+E(L('Say it again'))+'">'+I('rep',18)+'</button></div>';}
  if(eType||(!res&&!listening))h+='<div class="p11srch p11ta">'+I('pen',18)+'<textarea id="p11et" data-nomic="1" class="p11in" rows="2" placeholder="'+E(L('Or type it here'))+'">'+E(eType?SPOKEN:'')+'</textarea><button class="p11mini" onclick="P11.readText()">'+E(L('Read it'))+'</button></div>';
  else if(res)h+='<button class="p11quiet" onclick="P11.typeIt()">'+I('pen',14)+E(L('Type it instead'))+'</button>';
  if(eBusy)h+='<div class="p11empty sm"><span class="p11spin"></span></div>';
  if(FOUND.length){h+='<div class="p11sec">'+E(L('Found'))+' '+FOUND.length+' — '+E(L('fix anything that is off'))+'</div><div class="p11list">'+FOUND.map((f,i)=>{
     if(f.sid){const nm=nmOf(gst(f.sid).name);return '<div class="p11it'+(f.on===false?' dim':'')+'"><div class="p11w" onclick="P11.alt('+i+')"><b>'+E(nm.a)+'</b>'+(nm.b?'<small>'+E(nm.b)+'</small>':'')+'</div><div class="p11stp"><button onclick="P11.fq('+i+','+Math.max(0,f.n-1)+')">'+I('minus',16,2.2)+'</button><input data-nomic="1" inputmode="decimal" value="'+E(fmt(f.n))+'" onchange="P11.fq('+i+',this.value)"><button onclick="P11.fq('+i+','+(f.n+1)+')">'+I('plus',16,2.2)+'</button></div></div>'+(f.open?altH(i):'');}
     return '<div class="p11it p11warn"><div class="p11w" onclick="P11.alt('+i+')"><b>'+E(f.said)+'?</b><small>'+E(L('Not sure — tap to pick the right one'))+'</small></div><span class="p11wi">'+I('alert',20)+'</span></div>'+(f.open?altH(i):'');}).join('')+'</div>';}
  h+='<div style="height:110px"></div></div>'+(n?'<div class="p11foot"><button class="p11btn" onclick="P11.eAdd()">'+E(L('Add {n} to my list').replace('{n}',n))+'</button></div>':'');
  open('m-p11e',h);}
P11.typeIt=()=>{eType=true;drawE();setTimeout(()=>{const t=$('p11et');if(t)t.focus();},60);};
P11.again2=()=>{eType=false;SPOKEN='';FOUND=[];drawE();P11.listen();};
function altH(i){const f=FOUND[i];const A=(f.alts||[]).slice(0,6);return '<div class="p11alts"><div class="p11meta">'+E(L('Pick the right one'))+'</div>'+A.map(s=>'<button onclick="P11.pickAlt('+i+',\''+J(s.id)+'\')">'+E(nmOf(s.name).a)+'</button>').join('')+'<button class="p11k" onclick="P11.keepAs('+i+')">'+E(L('Keep as written'))+': “'+E(f.said)+'”</button></div>';}
P11.alt=i=>{FOUND[i].open=!FOUND[i].open;drawE();};
P11.pickAlt=(i,sid)=>{FOUND[i].sid=sid;FOUND[i].open=false;FOUND[i].on=true;drawE();};
P11.keepAs=i=>{FOUND[i].sid=null;FOUND[i].keep=true;FOUND[i].open=false;FOUND[i].on=true;drawE();};
P11.fq=(i,v)=>{FOUND[i].n=Math.max(0,num(v)||0);FOUND[i].on=FOUND[i].n>0;drawE();};
P11.stopE=()=>{try{if(rec&&listening)rec.abort();}catch(e){}listening=false;close('m-p11e');};
P11.eAdd=()=>{try{if(rec&&listening)rec.abort();}catch(e){}listening=false;let n=0;FOUND.forEach(f=>{if(f.on===false||!f.n)return;if(f.sid)addStock(f.sid,f.n);else addCustom(f.said,f.n,f.unit||'pc');n++;});saveCart();close('m-p11e');if(n)toast('+ '+n+' '+L('items'),'green');else if(PHOTOS.length)toast(L('The photo is attached to your request.'),'green');redraw();};
P11.listen=function(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast(L("Voice doesn't work on this phone — type it or use the keyboard mic."));const ta=$('p11et');if(ta)ta.focus();return;}
  if(listening&&rec){try{rec.stop();}catch(e){}return;}
  rec=new SR();rec.lang=ES_ON()?'es-US':'en-US';rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;let fin='';
  rec.onresult=ev=>{let s='';for(let i=0;i<ev.results.length;i++)s+=ev.results[i][0].transcript;SPOKEN=s;const q=document.querySelector('#m-p11e .p11lq');if(q)q.textContent='“'+s+'”';};
  rec.onend=()=>{listening=false;if(!opened('m-p11e'))return;if(SPOKEN.trim())P11.readText(SPOKEN);else drawE();};rec.onerror=()=>{listening=false;drawE();};
  try{rec.start();listening=true;drawE();}catch(e){listening=false;}};
P11.readText=async function(txt){if(!opened('m-p11e'))return;eType=false;txt=txt!=null?txt:(($('p11et')||{}).value||'');txt=String(txt).trim();if(!txt)return;SPOKEN=txt;eBusy=true;FOUND=[];drawE();
  let items=parse(txt);eBusy=false;FOUND=items.map(matchOne);drawE();};
/* split what was said into items: "40 cajas de un gang, 3 rollos 12/2 y 2 cajas para abanico" */
function parse(txt){let s=' '+norm(txt).replace(/[;\n]+/g,',')+' ';
  s=s.replace(/\b(\d+|un|uno|una|dos|tres|cuatro|one|two|three|four)\s*-?\s*(gang|polos?|poles?|vias|way)\b/g,(w,n,u)=>' '+(NUMW[n]||n)+'~'+u+' ');
  const parts=s.split(/,|\s+y\s+|\s+and\s+|\s+e\s+|\s+mas\s+/).map(x=>x.trim()).filter(Boolean);const out=[];
  parts.forEach(p=>{const toks=p.split(/\s+/);let cur=null;toks.forEach((w,i)=>{const nx=toks[i+1]||'';const isQ=(/^\d+$/.test(w)||(NUMW[w]&&w!=='a'))&&nx&&!/^(\d|\/|"|-|amp|a$|v$|ft|pies?|pulgadas?|inch)/.test(nx)&&!/^\d+~/.test(nx);
      if(isQ&&(!cur||cur.words.length)){if(cur)out.push(cur);cur={q:/^\d+$/.test(w)?+w:NUMW[w],words:[]};}else{if(!cur)cur={q:1,words:[]};cur.words.push(w);}});if(cur&&cur.words.length)out.push(cur);});
  return out.map(o=>{const raw=o.words.join(' ').replace(/~/g,'-');const unitCoil=/\b(rollos?|rolls?|coils?)\b/.test(raw);return {q:o.q||1,said:raw.replace(/-(gang|polos?|poles?|vias|way)/g,' $1'),en:toEn(raw)+(unitCoil?' coil':'')};});}
/* pick the item: every word they said must be in the name; the most used / simplest one wins; the others stay one tap away */
const UNITW=/^(boxes|box|bags?|packs?|cajas?|bolsas?|paquetes?)\s+(of|de)\s+(.+)$/;
const BOXY=/^(\d+[ ~-]?gang|un gang|una? |dos gang|fan|ceiling|round|square|junction|outdoor|old work|new work|metal|plastic|deep|weatherproof|abanico|techo|redonda|cuadrada|registro|plastic|plastico|metalica|exterior)/;
function matchOne(it){const raw=norm(it.said||'').trim();let q=it.en||toEn(raw);const um=raw.match(UNITW);if(um&&!BOXY.test(um[3]))q=toEn(um[3]);
  const toks=norm(q).split(/\s+/).filter(w=>w&&!STOP.has(w));
  let R=search(q,30);if(!R.length)R=search(it.said||'',30);
  const fq={};try{(D.mats||[]).forEach(r=>(liItems(r)||[]).forEach(i=>{if(i.sid)fq[i.sid]=(fq[i.sid]||0)+1;}));}catch(e){}
  const coil=/\bcoil\b/.test(q),size=/\b\d+\/\d\b/.test(q)&&!/\b(uf|mc|bx|ser|thhn|xhhw|cord|soow)\b/.test(q);
  const sc=R.map(s=>{const h=' '+norm(s.name+' '+(s.cat||''))+' ';const hit=toks.filter(w=>h.includes(w.replace(/(es|s)$/,''))).length;const cov=toks.length?hit/toks.length:0;
    let v=cov*100+Math.min(fq[s.id]||0,10)*3-String(s.name).length*0.15;if(coil&&/250ft coil/i.test(s.name))v+=8;if(size&&/romex/i.test(s.name))v+=6;if(/\bbox\b/.test(q)&&!/old work|metal|fs|weatherproof|deep|junction|4"|square/.test(q)){if(/new work/i.test(s.name))v+=12;if(/plastic/i.test(s.name))v+=4;}if(!/black|ivory|almond|gray|grey|brown|red|blue|stainless/.test(q)){if(/white/i.test(s.name))v+=5;else if(/black|ivory|almond|gray|brown|stainless/i.test(s.name))v-=4;}if(/leviton/i.test(s.name))v+=2;if(/gfci/.test(q)&&!/breaker/.test(q)&&/receptacle/i.test(s.name))v+=6;return {s,v,cov};}).sort((a,b)=>b.v-a.v);
  const best=sc[0];const sure=!!best&&best.cov>=0.99;
  return {said:it.said||it.name||'',n:Math.max(1,+it.q||1),sid:sure?best.s.id:null,alts:sc.map(x=>x.s).slice(0,8),on:true,unit:'pc'};}
/* photo reading and the AI helper are off until Baruch turns the AI on (10/30) */

/* ---------- F: review & send ---------- */
const WHENS=[['Now','Now','clock'],['Tomorrow morning','Tomorrow',''],['This week','This week','']];
const SRCS=[['deliver','Deliver','truck'],['garage','Garage','gar'],['pickup','Store','store']];
P11.review=function(re){if(!cartN()&&!PHOTOS.length&&!re){toast(L('Your list is empty'));return;}
  const nm=JOB.site?sName(JOB.site):JOB.addr;
  let h='<div class="p11sh p11shbig"><div class="p11grab"></div><div class="p11rhd"><h2>'+E(L('My list'))+' · '+cartN()+' '+E(L(cartN()===1?'item':'items'))+'</h2><button class="p11hb" onclick="P11.close(\'m-p11f\')">'+I('x',20,2)+'</button></div>'
   +'<button class="p11joblink" onclick="P11.jobPick()">'+I('pin',14)+'<span>'+E(nm||L('Pick the job'))+'</span>'+I('chev',14,2)+'</button>'
   +'<div class="p11rlist">'+CART.slice(0,fMore?999:3).map(c=>{const nmx=c.sid?nmOf(c.name):{a:c.name,b:c.desc||''};const key=c.sid||'c:'+c.name;
     return '<div class="p11it"><div class="p11w"><b>'+E(nmx.a)+(c.cu?' <span class="p11tag">'+E(L('custom'))+'</span>':'')+'</b>'+(nmx.b?'<small>'+E(nmx.b)+'</small>':'')+'</div>'+stepper(key,c.n,c.sid?stepOf(gst(c.sid)):1)+'</div>';}).join('')+'</div>'
   +(CART.length>3?'<button class="p11link p11l" onclick="P11.fMore()">'+E(fMore?L('Show less'):L('Show {n} more').replace('{n}',CART.length-3))+'</button>':'')
   +(PHOTOS.length?'<div class="p11sec">'+E(L('Photos'))+'</div><div class="p11thumbs">'+PHOTOS.map((p,i)=>'<span><img src="'+E(p.d)+'"><button onclick="P11.rmPhoto('+i+')">'+I('x',13,2.4)+'</button></span>').join('')+'</div>':'')
   +'<div class="p11sec">'+E(L('Needed'))+'</div><div class="p11chips">'+WHENS.map(w=>'<button class="'+(WHEN===w[0]?'on':'')+'" onclick="P11.when(\''+w[0]+'\')">'+(w[2]?I(w[2],16):'')+E(L(w[1]))+'</button>').join('')+'</div>'
   +'<div class="p11sec">'+E(L('Get it'))+'</div><div class="p11chips">'+SRCS.map(w=>'<button class="'+(SRC===w[0]?'on':'')+'" onclick="P11.src(\''+w[0]+'\')">'+I(w[2],16)+E(L(w[1]))+'</button>').join('')+'</div>'
   +'<div class="p11srch p11ta" style="margin-top:16px">'+I('note',18)+'<textarea id="p11note" class="p11in" rows="1" placeholder="'+E(L('Note for Menachem'))+'" oninput="P11.note(this.value)">'+E(NOTE)+'</textarea></div>'
   +'<button class="p11btn" id="p11send" style="margin-top:14px" onclick="P11.send()">'+E(L('Send to Menachem'))+'</button></div>';
  open('m-p11f',h,true);};
let fMore=false;P11.fMore=()=>{fMore=!fMore;P11.review(true);};
P11.when=v=>{WHEN=v;saveCart();P11.review(true);};P11.src=v=>{SRC=v;saveCart();P11.review(true);};P11.note=v=>{NOTE=v;saveCart();};
P11.rmPhoto=i=>{PHOTOS.splice(i,1);P11.review(true);};
P11.send=function(){const m=M();if(!m)return;if(!cartN()&&!PHOTOS.length){toast(L('Your list is empty'));return;}if(!JOB.site&&!JOB.addr){toast('📍 '+L('Pick the job first'));P11.jobPick();return;}
  const b=$('p11send');if(b)b.disabled=true;
  try{const lines=CART.map(c=>fmt(c.n)+' '+unitL(c.unit)+' '+c.name+(c.cu?' ('+tt('custom')+')':''));
    const items=(JOB.addr?'📍 '+JOB.addr+' ('+tt('new address')+')\n':'')+lines.join('\n')+(NOTE.trim()?'\n'+tt('Note')+': '+NOTE.trim():'');
    const mid=nid('m');const r={id:mid,from:m.id,addr:JOB.addr||'',site:JOB.site||'',items,when:WHEN,status:'open',st:'requested',ts:Date.now(),photos:PHOTOS.slice(),src:SRC,note:NOTE.trim()||'',v2:1};
    CART.forEach(c=>liNew(r,Object.assign({t:c.name,q:fmt(c.n),u:c.unit||'pc'},c.sid?{sid:c.sid}:{cu:true},c.desc?{desc:c.desc}:{},c.img?{img:c.img}:{})));
    if(!CART.length)liNew(r,{t:tt('Photo of a list'),q:'1',u:'pc',cu:true});
    D.mats.unshift(r);const n=liItems(r).length;const where=sName(JOB.site)||JOB.addr;const wl=WHEN,sl=SRC;
    try{pushTo(D.emps.filter(e=>canHandleMat(e)&&e.id!==m.id).map(e=>e.id),()=>('📦 '+(MC_SRC[sl]?MC_SRC[sl][0]+' '+t(MC_SRC[sl][1]):t('Material'))+' — '+nameOf(m.id)+' @ '+where+': '+n+' '+t('items')+' — '+lines.slice(0,3).join(', ').slice(0,80)+(r.photos.length?' 📷'+r.photos.length:'')+' ('+t(wl)+')'+(r.note?' — '+r.note.slice(0,60):'')),'mat',{mat:mid});}catch(e){}
    save();clearCart();bq='';closeAll();tabA='open';home();try{renderMat();}catch(e){}
    toast('📦 '+L('Sent to Menachem')+' — '+n+' '+L('items'),'green');}catch(e){if(b)b.disabled=false;toast('⚠ '+(e&&e.message||e));}};

/* ---------- Garage stock (Baruch 10/30): see what's on the shelves; Took / Put back keep the count; office fixes the count ---------- */
function gq(s){const n=+((s&&s.qty)||0);return n>0?n:0;}
function garBadge(s){const n=gq(s);return n>0?'<span class="p11gb">'+I('gar',13,2)+E(L('In the garage'))+': '+E(fmt(n))+'</span>':'<span class="p11gb no">'+E(L('Not in the garage'))+'</span>';}
const canSet=m=>{m=m||M();return !!m&&(['owner','manager','office'].includes(m.role)||!!m.all);};
let gF='all',gQ='',gN=120;
P11.garage=function(re){esLoad();if(!re){gQ='';gN=120;}const chips=[['all','All'],['in','In stock']].concat(GROUPS.map(g=>[g[0],g[2]]));
  const h=hdr(L("What's in the garage"),'back',"P11.close('m-p11g')")+'<div class="p11dtop">'+searchBox('p11gq',L('Search the garage'),gQ)
   +'<div class="p11chips p11gchips">'+chips.map(c=>'<button class="'+(gF===c[0]?'on':'')+'" onclick="P11.gF(\''+c[0]+'\')">'+E(L(c[1]))+'</button>').join('')+'</div></div><div class="p11body" id="p11glist"></div>';
  open('m-p11g',h);drawG();};
P11.gF=v=>{gF=v;gN=120;P11.garage(true);};
function drawG(){const el=$('p11glist');if(!el)return;let L0=gQ.trim()?search(gQ,400):allSt();
  if(gF==='in')L0=L0.filter(s=>gq(s)>0);else if(gF!=='all')L0=L0.filter(s=>grpOf(s)===gF);
  if(!gQ.trim())L0=L0.slice().sort((a,b)=>(gq(b)>0)-(gq(a)>0)||srt(a,b));
  const tot=L0.length;L0=L0.slice(0,gN);let h='';
  if(!tot)h='<div class="p11empty">'+I('gar',30,1.5)+'<div>'+E(L(gF==='in'?'Nothing counted in the garage yet.':'Nothing found'))+'</div></div>';
  else if(gQ.trim()||gF==='in')h='<div class="p11list" style="margin-top:4px">'+L0.map(gRow).join('')+'</div>';
  else{const by={};L0.forEach(s=>{const g=grpOf(s);(by[g]=by[g]||[]).push(s);});h=GROUPS.filter(g=>by[g[0]]).map(g=>'<div class="p11sec">'+E(L(g[1]))+'</div><div class="p11list">'+by[g[0]].map(gRow).join('')+'</div>').join('');}
  if(tot>gN)h+='<button class="p11link" onclick="P11.gMore2()">'+E(L('Show {n} more').replace('{n}',Math.min(120,tot-gN)))+'</button>';
  el.innerHTML=h+'<div style="height:60px"></div>';}
P11.gMore2=()=>{gN+=120;drawG();};
function gRow(s){const n=nmOf(s.name);const c=gq(s);const K=J(s.id);
  return '<div class="p11it p11grow" data-gid="'+E(s.id)+'"><div class="p11w"><b>'+E(n.a)+'</b><small>'+E(n.b||L(c?'In the garage':'None in the garage'))+'</small></div><div class="p11cnt'+(c?'':' z')+'">'+E(fmt(c))+'<small>'+E(unitL(s.unit))+'</small></div><div class="p11gact"><button class="out" onclick="P11.gMove(\''+K+'\',\'out\')"'+(c?'':' disabled')+'>'+E(L('Took'))+'</button><button onclick="P11.gMove(\''+K+'\',\'in\')">'+E(L('Put back'))+'</button></div></div>';}
let gMv=null;
P11.gMove=function(sid,kind){const s=gst(sid);if(!s)return;const c=gq(s);if(kind==='out'&&!c)return;gMv={sid,kind,n:kind==='set'?c:(isFt(s)?10:1)};drawH();};
function drawH(){const s=gst(gMv.sid);if(!s)return;const c=gq(s);const k=gMv.kind;const u=unitL(s.unit);const n=gMv.n;const after=k==='out'?Math.max(0,c-n):k==='in'?c+n:n;const nm=nmOf(s.name);
  const h='<div class="p11sh"><div class="p11grab"></div><h2>'+E(nm.a)+'</h2>'+(nm.b?'<div class="p11meta">'+E(nm.b)+'</div>':'')+'<div class="p11meta">'+E(fmt(c))+' '+E(u)+' '+E(L('in the garage'))+'</div>'
   +(k==='set'?'<div class="p11sec" style="margin-top:14px">'+E(L('Fix the count'))+' — '+E(L('how many are on the shelf?'))+'</div>':'<div class="p11seg" style="margin:14px 0 0"><button class="'+(k==='out'?'on':'')+'" onclick="P11.hK(\'out\')"'+(c?'':' disabled')+'>'+E(L('Took'))+'</button><button class="'+(k==='in'?'on':'')+'" onclick="P11.hK(\'in\')">'+E(L('Put back'))+'</button></div>')
   +'<div class="p11bigq"><button onclick="P11.hN(-1)" aria-label="'+E(L('Less'))+'">'+I('minus',24,2.2)+'</button><input data-nomic="1" inputmode="decimal" value="'+E(fmt(n))+'" onchange="P11.hN(0,this.value)"><button onclick="P11.hN(1)" aria-label="'+E(L('More'))+'">'+I('plus',24,2.2)+'</button></div>'
   +'<div class="p11meta" style="text-align:center">'+E(u)+' · '+E(L('garage will have'))+' '+E(fmt(after))+'</div>'
   +'<button class="p11btn" id="p11hgo" style="margin-top:20px" onclick="P11.hGo()"'+((k!=='set'&&!n)?' disabled':'')+'>'+E(k==='out'?L('Took')+' '+fmt(n):k==='in'?L('Put back')+' '+fmt(n):L('Save the count')+': '+fmt(n))+'</button>'
   +(canSet()&&k!=='set'?'<button class="p11link" onclick="P11.hK(\'set\')">'+E(L('Fix the count'))+'</button>':'')+'</div>';
  open('m-p11h',h,true);}
P11.hK=k=>{const s=gst(gMv.sid);gMv.kind=k;gMv.n=k==='set'?gq(s):(isFt(s)?10:1);if(k==='out')gMv.n=Math.min(gMv.n,gq(s));drawH();};
P11.hN=(d,v)=>{const s=gst(gMv.sid);const st=isFt(s)?10:1;let n=v!=null?(num(v)||0):gMv.n+d*st;n=Math.max(0,n);if(gMv.kind==='out')n=Math.min(n,gq(s));gMv.n=n;drawH();};
let gBusy=false;
P11.hGo=async function(){if(gBusy||!gMv)return;const s=gst(gMv.sid);if(!s)return;const k=gMv.kind,n=gMv.n;if(k!=='set'&&!n)return;if(k==='out'&&n>gq(s)){toast(L('Not enough in the garage'));return;}
  gBusy=true;const b=$('p11hgo');if(b)b.disabled=true;
  try{const txn=commitStockTxn(k,[{id:s.id,name:s.name,unit:s.unit||'pc',qty:n}],null,{reason:k==='set'?'garage count (material page)':undefined});
    close('m-p11h');drawG();refreshRows(s.id);
    if(txn){const r=await confirmStockTxn(txn.id);
      if(r&&r.status==='rejected'){toast('⚠ '+(r.reason||L('Could not save')));}
      else if(r&&r.status==='queued')toast(L('Saved on the phone — it sends when there is signal.'));
      else toast('✓ '+L('Garage now')+': '+fmt(gq(gst(s.id)))+' '+unitL(s.unit),'green');}
    drawG();refreshRows(s.id);}catch(e){toast('⚠ '+(e&&e.message||e));}
  gBusy=false;};

/* ---------- G: track it ---------- */
let curT=null;
P11.track=function(id,re){if(!re&&id!==curT)gMore=false;const r=(D.mats||[]).find(x=>x.id===id);if(!r){toast(tt('That list is not on this phone (yet).'));return;}curT=id;esLoad();const m=M();
  const its=(()=>{try{return liItems(r)}catch(e){return []}})();const ix=stepIx(r);const st=stOf(r);const v=srcL(r);
  const srcTxt=v==='garage'?L('Pick up at the garage'):v==='pickup'?L('Pick up at the store'):L('Deliver to the job');
  const tm=ts=>ts?(()=>{try{return fmtT(ts)}catch(e){return new Date(ts).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}})():'';
  const day=ts=>ts?(()=>{try{return when(ts)}catch(e){return ''}})():'';
  const steps=[[L('Asked'),day(r.ts)],[L('Ordered / preparing'),ix===2?day(r.stAt):''],[L('Ready / on the way'),r.readyAt?day(r.readyAt):''],[L('At the job'),r.got?day(r.got.at):'']];
  let h=hdr(L('Request'),'back',"P11.close('m-p11x')")+'<div class="p11body"><div class="p11big"><h1>'+E(sName(r.site)||r.addr||L('No job picked'))+'</h1><div class="p11meta">'+its.length+' '+E(L('items'))+' · '+E(srcTxt)+' · '+E(L('needed'))+': '+E(L(({'Tomorrow morning':'Tomorrow'})[r.when]||r.when||''))+' · '+E(whoName(r.from))+'</div></div>'
   +'<div class="p11card p11tl">'+steps.map((s,i)=>'<div class="p11tli'+(i<ix?'':' off')+'"><span class="p11d'+(i<ix?'':' o')+'">'+(i<ix?I('chk',14,2.6):'')+'</span><span class="p11w">'+E(s[0])+'</span><span class="p11tm">'+E(i<ix?String(s[1]).trim():'')+'</span></div>').join('')+'</div>';
  if(r.miss&&!r.got)h+='<div class="p11card p11bad">'+I('alert',18)+'<div class="p11w"><b>'+E(L('Missing at the job'))+'</b><small>'+E((r.miss.items||[]).map(k=>{const i=r[k];return i?nmItem(i).a:'';}).filter(Boolean).join(', ')+(r.miss.note?' — '+r.miss.note:''))+'</small></div></div>';
  if(r.note)h+='<div class="p11note">'+I('note',16)+'<span>'+E(r.note)+'</span></div>';
  h+='<div class="p11list">'+its.slice(0,gMore?999:3).map(i=>{const n=nmItem(i);const q=num(i.q);return '<div class="p11it"><div class="p11w"><b>'+E(n.a)+(i.cu?' <span class="p11tag">'+E(L('custom'))+'</span>':'')+'</b>'+(n.b?'<small>'+E(n.b)+'</small>':'')+'</div><b class="p11qty">'+E(q!==null?fmt(q):i.q||'')+'</b></div>';}).join('')
   +(its.length>3?'<div class="p11it"><button class="p11link p11l" onclick="P11.gMore()">'+E(gMore?L('Show less'):L('Show {n} more').replace('{n}',its.length-3))+'</button></div>':'')+'</div>';
  if(r.photos&&r.photos.length)h+='<div class="p11thumbs" onclick="viewMatPhotos(\''+J(r.id)+'\')">'+r.photos.slice(0,6).map(p=>'<span><img src="'+E(p.d)+'"></span>').join('')+'</div>';
  const cs=(()=>{try{return liComments(r)}catch(e){return []}})();const ed=(()=>{try{return liCanEdit('mats',r,m)}catch(e){return r.from===m.id}})();const prep=(()=>{try{return mcPrep(r,m)}catch(e){return false}})();
  const canMsg=ed&&(prep||cs.some(c=>c.by!==m.id));
  h+='<div class="p11card p11msgs">'+(cs.length?cs.map(c=>'<div class="p11m'+(c.by===m.id?' me':'')+'"><small>'+I('msg',13)+E(c.by===m.id?L('You'):nameOf(c.by).split(' ')[0])+' · '+E(day(c.ts))+'</small><div>'+E(c.text||'')+'</div></div>').join(''):'<div class="p11meta" style="display:flex;gap:6px;align-items:center;margin:0">'+I('msg',14)+E(L('Menachem will message you here if he has a question.'))+'</div>')
   +(canMsg?'<div class="p11reply"><textarea id="p11rep" class="p11in" rows="1" placeholder="'+E(L('Reply…'))+'"></textarea><button class="p11send" onclick="P11.reply()" aria-label="'+E(L('Send'))+'">'+I('chev',18,2.4)+'</button></div>':'')+'</div>';
  const more=[];if(prep&&r.from!==m.id)more.push('<button class="p11btn p11ghost" onclick="P11.check(\''+J(r.id)+'\')">'+I('list',18)+E(L('Open checklist'))+'</button>');
  if(ed&&!isDone(r))more.push('<button class="p11link" onclick="P11.check(\''+J(r.id)+'\')">'+E(L('Edit list'))+'</button>');
  h+=more.join('')+'<div style="height:120px"></div></div>';
  if(ed&&r.from&&!r.got&&ix>=2)h+='<div class="p11foot"><div class="p11dual"><button class="p11btn p11ok" onclick="P11.gotAll()">'+I('chk',18,2.4)+E(L('All here'))+'</button><button class="p11btn p11ghost p11redt" onclick="P11.missing()">'+E(L('Something missing'))+'</button></div></div>';
  else if(ed&&r.from&&!r.got&&!isDone(r))h+='<div class="p11foot"><button class="p11btn p11ghost p11redt" onclick="P11.missing()">'+E(L('Something missing'))+'</button></div>';
  open('m-p11x',h);};
let _openList=null,gMore=false;P11.gMore=()=>{gMore=!gMore;P11.track(curT,true);};
P11.check=id=>{try{(_openList||openList)('mats',id);}catch(e){}};
P11.reply=function(){const ta=$('p11rep');if(!ta||!ta.value.trim())return;const r=(D.mats||[]).find(x=>x.id===curT);if(!r)return;r['lc_'+nid('c')]={by:M().id,ts:Date.now(),text:ta.value.trim()};try{liTouch('mats',r);}catch(e){save();}P11.track(curT,true);};
P11.gotAll=function(){const r=(D.mats||[]).find(x=>x.id===curT);if(!r)return;const m=M();r.got={by:m.id,at:Date.now()};try{liTouch('mats',r);}catch(e){save();}
  try{pushTo(D.emps.filter(e=>canHandleMat(e)&&e.id!==m.id).map(e=>e.id),()=>('✅ '+t('All here at')+' '+(sName(r.site)||r.addr)+' — '+nameOf(m.id)),'mat',{mat:r.id});}catch(e){}
  toast('✓ '+L('Thanks — Menachem knows everything arrived.'),'green');P11.track(curT,true);home();};
let missSel=null;
P11.missing=function(){const r=(D.mats||[]).find(x=>x.id===curT);if(!r)return;const its=(()=>{try{return liItems(r)}catch(e){return []}})();missSel=missSel&&missSel.id===r.id?missSel:{id:r.id,keys:new Set(),note:''};
  const h='<div class="p11sh p11shbig"><div class="p11grab"></div><h2>'+E(L('What is missing?'))+'</h2><div class="p11rlist">'+its.map(i=>{const on=missSel.keys.has(i.k);const n=nmItem(i);return '<div class="p11it'+(on?'':' dim2')+'" onclick="P11.mT(\''+J(i.k)+'\')"><span class="p11ck'+(on?' on red':'')+'">'+(on?I('x',14,2.6):'')+'</span><div class="p11w"><b>'+E(n.a)+'</b>'+(n.b?'<small>'+E(n.b)+'</small>':'')+'</div><b class="p11qty">'+E(i.q||'')+'</b></div>';}).join('')+'</div>'
   +'<div class="p11srch p11ta" style="margin-top:12px">'+I('note',18)+'<textarea id="p11mn" class="p11in" rows="1" placeholder="'+E(L('Note for Menachem'))+'" oninput="P11.mN(this.value)">'+E(missSel.note)+'</textarea></div>'
   +'<button class="p11btn p11red" style="margin-top:14px" onclick="P11.mSend()">'+E(L('Tell Menachem'))+'</button></div>';open('m-p11m',h,true);};
P11.mT=k=>{if(missSel.keys.has(k))missSel.keys.delete(k);else missSel.keys.add(k);P11.missing();};P11.mN=v=>{missSel.note=v;};
P11.mSend=function(){const r=(D.mats||[]).find(x=>x.id===missSel.id);if(!r)return;if(!missSel.keys.size&&!missSel.note.trim()){toast(L('What is missing?'));return;}const m=M();
  r.miss={by:m.id,at:Date.now(),items:[...missSel.keys],note:missSel.note.trim()};try{liTouch('mats',r);}catch(e){save();}
  const names=r.miss.items.map(k=>r[k]&&r[k].t).filter(Boolean);
  try{pushTo(D.emps.filter(e=>canHandleMat(e)&&e.id!==m.id).map(e=>e.id),()=>('⚠ '+t('Something missing at')+' '+(sName(r.site)||r.addr)+': '+names.join(', ').slice(0,90)+(r.miss.note?' — '+r.miss.note.slice(0,60):'')+' ('+nameOf(m.id)+')'),'mat',{mat:r.id});}catch(e){}
  missSel=null;close('m-p11m');toast(L('Menachem knows what is missing.'),'green');P11.track(curT,true);home();};

/* ---------- hooks into the app ---------- */
function hook(){
  if(typeof renderMat==='function'&&!renderMat.__p11){const _rm=renderMat;const f=function(){if(ON()){try{home();}catch(e){console.warn('p11 home',e);}return;}const pg=$('pg-mat');if(pg)pg.classList.remove('p11on');return _rm.apply(this,arguments);};f.__p11=1;renderMat=f;window.renderMat=f;}
  if(typeof openMat==='function'&&!openMat.__p11){const _om=openMat;const f=function(){if(ON()){if(Date.now()-rAt<400)return;/* the Material tab no longer jumps into the form */P11.newReq();return;}return _om.apply(this,arguments);};f.__p11=1;openMat=f;window.openMat=f;}
  if(typeof openList==='function'&&!openList.__p11){_openList=openList;const f=function(coll,id){if(coll==='mats'&&ON()){const r=(D.mats||[]).find(x=>x.id===id);const m=M();let prep=false;try{prep=mcPrep(r,m);}catch(e){}if(r&&!(prep&&r.from!==m.id)){P11.track(id);return;}}return _openList.apply(this,arguments);};f.__p11=1;openList=f;window.openList=f;}
  if(window.P2&&P2.newMat&&!P2.newMat.__p11){const _nm=P2.newMat;P2.newMat=function(items,site){if(!ON())return _nm.apply(this,arguments);try{closeSheet();}catch(e){}if(site)JOB={site,addr:'',sub:''};if(items){FOUND=[];SPOKEN=String(items).replace(/\n/g,', ');eMode='say';P11.newReq();drawE(true);P11.readText(SPOKEN);return;}P11.newReq();};P2.newMat.__p11=1;}
  /* Menachem's checklist shows the note, "all here" and "missing" from the new screens */
  if(typeof liDraw==='function'&&!liDraw.__p11){const _ld=liDraw;const f=function(){const out=_ld.apply(this,arguments);try{if(liCur&&liCur.coll==='mats'){const r=(D.mats||[]).find(x=>x.id===liCur.id);const box=$('liBox');if(r&&box&&(r.note||r.got||r.miss)){const d=document.createElement('div');d.className='p11 p11inj';
      d.innerHTML=(r.note?'<div class="p11note">'+I('note',16)+'<span><b>'+E(tt('Note'))+':</b> '+E(r.note)+'</span></div>':'')+(r.miss&&!r.got?'<div class="p11card p11bad">'+I('alert',18)+'<div class="p11w"><b>'+E(L('Missing at the job'))+' — '+E(nameOf(r.miss.by))+'</b><small>'+E((r.miss.items||[]).map(k=>r[k]&&r[k].t).filter(Boolean).join(', ')+(r.miss.note?' — '+r.miss.note:''))+'</small></div></div>':'')+(r.got?'<div class="p11note p11okn">'+I('chk',16,2.4)+'<span>'+E(L('Arrived — all here'))+' — '+E(nameOf(r.got.by))+'</span></div>':'');
      const h2=box.querySelector('h2');if(h2&&h2.nextSibling)h2.parentNode.insertBefore(d,h2.nextSibling.nextSibling);else box.prepend(d);}}}catch(e){}return out;};f.__p11=1;liDraw=f;}
  /* sync: redraw what is open when data comes in */
  if(!window.__p11sync){window.__p11sync=1;const _ra=window.renderAll;if(typeof renderAll==='function'){const f=function(){const o=_ra?_ra.apply(this,arguments):undefined;try{if(ON()){if($('pg-mat')&&$('pg-mat').classList.contains('on'))home();if(opened('m-p11x')&&curT)P11.track(curT,true);}}catch(e){}return o;};renderAll=f;window.renderAll=f;}}
}
try{hook();}catch(e){console.warn('p11 hook',e);}
setTimeout(()=>{try{hook();}catch(e){}},0);
document.addEventListener('DOMContentLoaded',()=>{try{hook();}catch(e){}});

/* ---------- look (one style for every screen; light + dark) ---------- */
const css=`
:root{--p11bg:#f5f6f8;--p11card:#fff;--p11line:#e7e9ef;--p11ink:#1d1f27;--p11mut:#7a8195;--p11soft:#f3f4f7;--p11btn:#1d1f27;--p11btnInk:#fff;--p11red:#d93a2b;--p11redInk:#c0392b;--p11redSoft:#fbeeec;--p11ok:#1a6b3a;--p11okBtn:#1a6b3a;--p11okSoft:#e8f7ed;--p11amb:#7a4a00;--p11ambSoft:#fff4e0;--p11dim:rgba(20,22,30,.34)}
html[data-theme=dark]{--p11bg:#000;--p11card:#1c1c1e;--p11line:#2c2c2e;--p11ink:#f2f2f7;--p11mut:#98989f;--p11soft:#2c2c2e;--p11btn:#f2f2f7;--p11btnInk:#000;--p11red:#d93a2b;--p11redInk:#ff8a80;--p11redSoft:#3a2320;--p11ok:#5fd38a;--p11okBtn:#1f8a4c;--p11okSoft:#12331f;--p11amb:#f5c26b;--p11ambSoft:#3a2b05;--p11dim:rgba(0,0,0,.6)}
#pg-mat.p11on>:not(#p11home):not(h2):not(.p8h2){display:none!important}
.p11{color:var(--p11ink);-webkit-font-smoothing:antialiased}
.p11 button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.p11 .p11in{font:inherit;color:var(--p11ink);background:transparent;border:0;outline:0;box-shadow:none;padding:0;margin:0;width:100%;min-width:0;-webkit-appearance:none;appearance:none}
.p11 textarea.p11in{resize:none;line-height:1.35;min-height:0!important;height:auto;field-sizing:content;max-height:120px}
.p11 .p11in::placeholder{color:var(--p11mut);opacity:1}
.p11ov.ov{position:fixed!important;inset:0!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;background:var(--p11bg)!important;box-shadow:none!important;border:0!important;padding:0!important}
.p11ov.ov.hid{display:none!important}
.p11ov.p11sheet{background:var(--p11dim)!important;justify-content:flex-end!important}
.p11hdr{display:flex;align-items:center;gap:4px;padding:calc(env(safe-area-inset-top) + 8px) 10px 6px;flex:none}
.p11hdr h3{flex:1;text-align:center;margin:0;font-size:16.5px;font-weight:650;color:var(--p11ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.p11hb{width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:var(--p11ink);border-radius:12px}
.p11body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:4px 16px 0;overscroll-behavior:contain}
.p11sec{font-size:12.5px;font-weight:600;color:var(--p11mut);margin:18px 2px 8px}
.p11 .p11card{display:block;width:100%;box-sizing:border-box;text-align:left;background:var(--p11card);border:1px solid var(--p11line);border-radius:16px;padding:14px 16px;margin-bottom:10px;color:var(--p11ink)}
.p11list{background:var(--p11card);border:1px solid var(--p11line);border-radius:16px;padding:0 14px}
.p11it{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--p11line);width:100%;text-align:left}
.p11it:last-child{border-bottom:0}.p11it.dim .p11w b{color:var(--p11mut);font-weight:500}.p11it.dim2{opacity:.6}
.p11w{flex:1;min-width:0}.p11w b{display:block;font-weight:600;font-size:15px;line-height:1.3;color:var(--p11ink)}.p11w small{display:block;color:var(--p11mut);font-size:12.5px;margin-top:2px;line-height:1.3}
.p11meta{color:var(--p11mut);font-size:12.5px;margin-top:3px;line-height:1.35}
.p11 .p11job .p11w b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.p11 .p11job{display:flex;box-sizing:border-box;align-items:center;gap:12px;width:100%;text-align:left;background:var(--p11card);border:1px solid var(--p11line);border-radius:16px;padding:11px 14px}
.p11ji{width:38px;height:38px;border-radius:11px;background:var(--p11redSoft);color:var(--p11redInk);display:flex;align-items:center;justify-content:center;flex:none}
.p11pick .p11ji{width:34px;height:34px}
.p11lnk{color:var(--p11redInk);font-weight:600;font-size:13.5px;flex:none}
.p11srch{display:flex;gap:10px;align-items:center;background:var(--p11card);border:1px solid var(--p11line);border-radius:14px;padding:11px 12px 11px 14px;color:var(--p11mut)}
.p11srch.p11ta{align-items:flex-start}.p11srch.p11ta svg{margin-top:2px;flex:none}
.p11srch .p11in{font-size:15px}
.p11mic{color:var(--p11ink)!important;display:flex;flex:none}
.p11stp{display:flex;align-items:center;background:var(--p11soft);border-radius:11px;flex:none}
.p11stp button{width:34px;height:34px;display:flex;align-items:center;justify-content:center;color:var(--p11ink)}
.p11stp input{width:40px;text-align:center;font:inherit;font-weight:650;font-size:15px;background:transparent;border:0;color:var(--p11ink);padding:0;outline:0;-webkit-appearance:none}
.p11add{width:34px;height:34px;border-radius:11px;border:1.5px solid var(--p11line)!important;color:var(--p11ink);display:flex;align-items:center;justify-content:center;flex:none}
html[data-theme=dark] .p11add{border-color:#48484a!important}
.p11btn{display:flex!important;align-items:center;justify-content:center;gap:8px;width:100%;background:var(--p11btn)!important;color:var(--p11btnInk)!important;font-weight:600!important;border-radius:15px!important;padding:15px!important;font-size:16px!important;border:0!important;box-sizing:border-box}
.p11btn[disabled]{opacity:.45}
.p11btn.p11red{background:var(--p11red)!important;color:#fff!important}.p11btn.p11ok{background:var(--p11okBtn)!important;color:#fff!important}
.p11btn.p11ghost{background:var(--p11card)!important;color:var(--p11ink)!important;border:1px solid var(--p11line)!important}
.p11btn.p11redt{color:var(--p11redInk)!important}
.p11link.p11l{margin:6px 0 0;font-size:13.5px;text-align:left}.p11ic.sm{width:36px;height:36px;margin:0;border-radius:11px;flex:none}.p11duo{grid-template-columns:1fr 1fr!important}.p11listen{text-align:center;padding:36px 10px 20px}.p11listen .p11bigmic{width:120px;height:120px;margin:0 auto}.p11listen .p11lt{font-size:18px;font-weight:600;margin:26px 0 8px;color:var(--p11ink)}.p11listen .p11lq{font-size:15px;margin:0 10px 6px}.p11link{display:block;margin:16px auto 0;color:var(--p11redInk)!important;font-weight:600!important;font-size:14px}
.p11foot{position:absolute;left:0;right:0;bottom:0;padding:14px 16px calc(env(safe-area-inset-bottom) + 14px);background:linear-gradient(rgba(245,246,248,0),var(--p11bg) 34%)}
html[data-theme=dark] .p11foot{background:linear-gradient(rgba(0,0,0,0),#000 34%)}
.p11cart{display:flex!important;align-items:center;width:100%;background:var(--p11btn)!important;color:var(--p11btnInk)!important;border-radius:16px!important;padding:14px 16px!important;font-weight:600;font-size:15.5px}
.p11cart.off{opacity:.55}
.p11cn{background:var(--p11red);color:#fff;border-radius:999px;min-width:24px;height:24px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;margin-right:10px;font-size:13px;box-sizing:border-box}
.p11cn2{background:#fff;color:var(--p11red);border-radius:999px;min-width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12.5px;margin-left:4px;padding:0 6px}
.p11r{margin-left:auto;display:flex;align-items:center;gap:4px;opacity:.85}
.p11pill{display:inline-block;font-size:11.5px;font-weight:600;border-radius:8px;padding:3px 9px;flex:none}
.p11p-ask{background:var(--p11soft);color:var(--p11mut)}.p11p-amb{background:var(--p11ambSoft);color:var(--p11amb)}.p11p-ok{background:var(--p11okSoft);color:var(--p11ok)}.p11p-bad{background:var(--p11redSoft);color:var(--p11redInk)}
.p11pr{display:flex;gap:4px;margin:12px 0 9px}.p11pr i{flex:1;height:5px;border-radius:3px;background:var(--p11soft)}.p11pr i.on{background:var(--p11ok)}
.p11rt{display:flex;justify-content:space-between;align-items:center;gap:10px}.p11rt b{font-weight:600;font-size:15.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.p11hint{color:var(--p11mut);font-size:13px;display:flex;gap:7px;align-items:center}.p11hint span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.p11hint svg{flex:none}
.p11seg{display:flex;background:var(--p11soft);border-radius:12px;padding:3px;margin-bottom:12px}
html:not([data-theme=dark]) .p11seg{background:#e9ebf0}
.p11seg button{flex:1;text-align:center;padding:8px!important;border-radius:9px!important;font-size:13.5px!important;font-weight:600!important;color:var(--p11mut)!important}
.p11seg button.on{background:var(--p11card)!important;color:var(--p11ink)!important;box-shadow:0 1px 3px rgba(0,0,0,.08)}
html[data-theme=dark] .p11seg button.on{background:#3a3a3c!important}
.p11seg2{width:60%;margin-top:-4px}
#p11home{padding-bottom:20px}
.p11acts{display:flex;flex-direction:column;gap:8px;margin:0 0 12px}.p11 .p11act{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;background:var(--p11card);border:1px solid var(--p11line);border-radius:16px;padding:10px 14px;font-weight:600;font-size:15px;text-align:left}.p11act span:nth-child(2){flex:1}.p11act .p11ic{width:36px;height:36px;margin:0;border-radius:11px}.p11act>svg{color:var(--p11mut)}
.p11gb{display:inline-flex;gap:4px;align-items:center;background:var(--p11okSoft);color:var(--p11ok);font-size:11.5px;font-weight:600;border-radius:7px;padding:2px 7px;margin-top:4px}.p11gb.no{background:var(--p11soft);color:var(--p11mut)}
.p11gnote{display:flex;gap:10px;align-items:flex-start;background:var(--p11okSoft);color:var(--p11ok);border-radius:14px;padding:12px 14px;margin-top:12px;font-size:13.5px;line-height:1.35}.p11gnote svg{flex:none;margin-top:1px}
.p11gchips{flex-wrap:nowrap!important;overflow-x:auto;margin-top:10px;padding-bottom:2px;scrollbar-width:none}.p11gchips::-webkit-scrollbar{display:none}.p11gchips button{white-space:nowrap;flex:none}
.p11grow .p11w b{font-size:14.5px}.p11cnt{flex:none;text-align:right;font-size:19px;font-weight:700;min-width:36px;line-height:1.1}.p11cnt small{display:block;font-size:11px;color:var(--p11mut);font-weight:500}.p11cnt.z{color:var(--p11mut);opacity:.6}
.p11gact{display:flex;gap:6px;flex:none}.p11gact button{border:1px solid var(--p11line)!important;border-radius:10px!important;padding:7px 9px!important;font-size:13px;font-weight:600;background:var(--p11card)!important}
.p11gact button.out{background:var(--p11btn)!important;color:var(--p11btnInk)!important;border-color:var(--p11btn)!important}.p11gact button[disabled]{background:var(--p11soft)!important;color:var(--p11mut)!important;border-color:var(--p11soft)!important;opacity:.7}
.p11seg button[disabled]{opacity:.4}
.p11bigq{display:flex;align-items:center;justify-content:center;gap:20px;margin:22px 0 8px}.p11bigq button{width:54px;height:54px;border-radius:16px!important;background:var(--p11soft)!important;display:flex!important;align-items:center;justify-content:center}.p11bigq input{width:96px;text-align:center;font:inherit;font-size:40px;font-weight:700;background:transparent;border:0;color:var(--p11ink);outline:0;padding:0}
.p11newwrap{position:fixed;left:16px;right:calc(max(16px,env(safe-area-inset-right,0px)) + 68px);bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:59}.p11newwrap .p11btn{height:56px;padding:0 16px!important;border-radius:28px!important;box-shadow:0 6px 18px rgba(217,58,43,.28)}#p11home{padding-bottom:96px}
.p11empty{text-align:center;color:var(--p11mut);padding:40px 20px;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:15px}
.p11empty.sm{padding:22px 10px}.p11empty small{font-size:13px}.p11empty .p11btn{margin-top:8px;width:auto}
.p11trio{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px}
.p11trio button{background:var(--p11card)!important;border:1px solid var(--p11line)!important;border-radius:16px!important;padding:14px 4px 12px!important;text-align:center;font-size:13.5px;font-weight:600}
.p11ic{width:42px;height:42px;border-radius:13px;background:var(--p11soft);margin:0 auto 8px;display:flex;align-items:center;justify-content:center;color:var(--p11ink)}
.p11kits{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.p11kits::-webkit-scrollbar{display:none}
.p11kit{flex:0 0 calc((100% - 16px)/3);box-sizing:border-box;min-width:0;display:flex!important;gap:9px;align-items:center;background:var(--p11card)!important;border:1px solid var(--p11line)!important;border-radius:14px!important;padding:10px 12px!important;text-align:left;color:var(--p11mut)}
.p11kit b{display:block;color:var(--p11ink);font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.p11kit span{min-width:0}.p11kit small{display:block;font-size:11.5px}
.p11grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.p11tile{background:var(--p11card)!important;border:1px solid var(--p11line)!important;border-radius:16px!important;padding:14px!important;min-height:104px;text-align:left}
.p11tile .p11ic{margin:0 0 12px;width:40px;height:40px}.p11tile b{display:block;font-size:14.5px;font-weight:600;line-height:1.25}.p11tile small{color:var(--p11mut);font-size:12px}
.p11dtop{padding:4px 16px 10px;flex:none}
.p11dwrap{flex:1;display:flex;min-height:0;border-top:1px solid var(--p11line)}
.p11rail{width:84px;flex:none;overflow:auto;background:var(--p11card);border-right:1px solid var(--p11line);padding-bottom:120px}
.p11rail button{display:block;width:100%;padding:12px 4px!important;text-align:center;font-size:11.5px;color:var(--p11mut);font-weight:500;position:relative;line-height:1.2}
.p11rail button svg{display:block;margin:0 auto 5px}.p11rail button.on{color:var(--p11ink);font-weight:650;background:var(--p11bg)}
.p11rail button.on:before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:var(--p11red)}
.p11right{flex:1;overflow:auto;padding:0 14px;-webkit-overflow-scrolling:touch}
.p11right .p11it{padding:10px 0}
.p11footd{left:84px}
.p11sh{background:var(--p11card);border-radius:22px 22px 0 0;padding:10px 18px calc(env(safe-area-inset-bottom) + 18px);max-height:92vh;overflow:auto;width:100%;box-sizing:border-box}
.p11shbig{max-height:94vh}
.p11sh h2{margin:0 0 4px;font-size:20px;letter-spacing:-.3px;color:var(--p11ink)}
.p11grab{width:38px;height:5px;border-radius:3px;background:var(--p11line);margin:0 auto 14px}
.p11rhd{display:flex;align-items:center;justify-content:space-between}
.p11joblink{display:inline-flex!important;gap:5px;align-items:center;color:var(--p11mut);font-size:13px;margin-bottom:4px}
.p11rlist .p11it{padding:10px 0}
.p11x{color:var(--p11mut);width:30px;display:flex;justify-content:center;flex:none}
.p11tag{display:inline-block;font-size:10.5px;font-weight:600;background:var(--p11soft);color:var(--p11mut);border-radius:6px;padding:1px 6px;vertical-align:2px}
.p11chips{display:flex;gap:8px;flex-wrap:wrap}
.p11chips button{display:flex!important;gap:7px;align-items:center;background:var(--p11card)!important;border:1px solid var(--p11line)!important;border-radius:12px!important;padding:9px 13px!important;font-size:14px;font-weight:600}
.p11chips button.on{background:var(--p11btn)!important;color:var(--p11btnInk)!important;border-color:var(--p11btn)!important}
.p11lbl{display:block;font-size:12.5px;font-weight:600;color:var(--p11mut);margin:12px 2px 6px}
.p11box{background:var(--p11soft)!important;border-radius:12px!important;padding:12px!important;font-size:15px!important}
select.p11box{width:auto}
.p11thumbs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.p11thumbs span{position:relative}.p11thumbs img{width:64px;height:64px;object-fit:cover;border-radius:11px;display:block}
.p11thumbs button{position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;background:var(--p11btn)!important;color:var(--p11btnInk)!important;display:flex;align-items:center;justify-content:center}
.p11thumbimg{max-height:110px;border-radius:12px;margin-top:10px}
.p11said{display:flex;gap:14px;align-items:center;background:var(--p11card);border:1px solid var(--p11line);border-radius:16px;padding:14px;margin-bottom:10px}
.p11said q{display:block;font-size:15px;line-height:1.4;quotes:none;color:var(--p11ink);margin-top:2px}
.p11bigmic{width:58px;height:58px;border-radius:50%;background:var(--p11soft)!important;display:flex!important;align-items:center;justify-content:center;flex:none;color:var(--p11ink)}
.p11bigmic.on{background:var(--p11red)!important;color:#fff;box-shadow:0 0 0 18px rgba(217,58,43,.15);animation:p11pulse 1.2s infinite}
@keyframes p11pulse{50%{box-shadow:0 0 0 30px rgba(217,58,43,.07)}}
@media (prefers-reduced-motion:reduce){.p11bigmic.on{animation:none}}
.p11thumb{width:58px;height:58px;border-radius:12px;flex:none;background:var(--p11soft);display:flex;align-items:center;justify-content:center;color:var(--p11mut);overflow:hidden}.p11thumb img{width:100%;height:100%;object-fit:cover}
.p11mini{flex:none;background:var(--p11btn)!important;color:var(--p11btnInk)!important;border-radius:10px!important;padding:7px 12px!important;font-size:13.5px;font-weight:600}
.p11warn .p11w b{color:var(--p11amb)}.p11warn .p11w small{color:var(--p11amb);opacity:.85}.p11wi{color:var(--p11amb);flex:none}
.p11alts{padding:4px 0 12px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--p11line)}
.p11alts button{text-align:left;background:var(--p11soft)!important;border-radius:10px!important;padding:9px 12px!important;font-size:14px}
.p11alts .p11k{color:var(--p11mut)}
.p11spin{width:22px;height:22px;border:3px solid var(--p11soft);border-top-color:var(--p11ink);border-radius:50%;animation:p11sp .8s linear infinite}
@keyframes p11sp{to{transform:rotate(360deg)}}
.p11note{display:flex;gap:8px;align-items:flex-start;background:var(--p11soft);color:var(--p11ink);border-radius:12px;padding:10px 12px;font-size:13.5px;margin:6px 0 10px;line-height:1.35}.p11note svg{flex:none;margin-top:1px;color:var(--p11mut)}
.p11okn{background:var(--p11okSoft);color:var(--p11ok)}.p11okn svg{color:var(--p11ok)}
.p11big h1{margin:2px 0 2px;font-size:24px;letter-spacing:-.4px;color:var(--p11ink);line-height:1.2}
.p11big{margin-bottom:14px}
.p11 .p11tl{padding:8px 16px}
.p11tli{display:flex;gap:12px;align-items:center;padding:7px 0;font-size:14.5px;font-weight:600}.p11tli.off{color:var(--p11mut);font-weight:500}
.p11d{width:24px;height:24px;border-radius:50%;background:var(--p11okSoft);color:var(--p11ok);display:flex;align-items:center;justify-content:center;flex:none}.p11d.o{background:var(--p11soft);color:transparent}
.p11it .p11d{width:22px;height:22px}
.p11tm{color:var(--p11mut);font-size:12.5px;font-weight:400;flex:none}
.p11qty{flex:none;font-weight:650;font-size:15px}.p11qty small{font-weight:500;color:var(--p11mut);font-size:12px}
.p11 .p11bad{display:flex;gap:10px;align-items:flex-start;background:var(--p11redSoft);border-color:transparent;color:var(--p11redInk)}.p11bad .p11w b{color:var(--p11redInk)}.p11bad .p11w small{color:var(--p11redInk);opacity:.85}
.p11msgs{margin-top:10px}
.p11m{padding:2px 0 8px;font-size:14.5px;line-height:1.4}.p11m+.p11m{border-top:1px solid var(--p11line);padding-top:8px}.p11m.me div{color:var(--p11mut)}
.p11m small{display:flex;gap:5px;align-items:center;color:var(--p11mut);font-size:12.5px;margin-bottom:3px}
.p11reply{display:flex;gap:8px;align-items:center;margin-top:8px;background:var(--p11soft);border-radius:12px;padding:8px 8px 8px 12px}.p11send{width:32px;height:32px;border-radius:10px;background:var(--p11btn)!important;color:var(--p11btnInk)!important;display:flex!important;align-items:center;justify-content:center;flex:none}.p11quiet{display:inline-flex!important;gap:6px;align-items:center;color:var(--p11mut)!important;font-size:13px;margin:2px 2px 0}
.p11dual{display:flex;gap:8px}.p11dual .p11btn{flex:1;padding:15px 6px!important;font-size:15px!important}
.p11ck{width:26px;height:26px;border-radius:8px;border:2px solid var(--p11line)!important;flex:none;display:flex!important;align-items:center;justify-content:center;color:#fff}
.p11ck.on{background:var(--p11btn)!important;border-color:var(--p11btn)!important;color:var(--p11btnInk)}.p11ck.on.red{background:var(--p11red)!important;border-color:var(--p11red)!important;color:#fff}
.p11inj{margin:6px 0 10px}
`;
const st=document.createElement('style');st.id='p11css';st.textContent=css;document.head.appendChild(st);
})();
