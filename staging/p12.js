/* p12.js — Code book reader (Mike Holt, Understanding the 2023 NEC, Volumes 1 & 2).
   Lives on the Code & calculators page as the first chip, "Code book".
   Search words or section numbers -> list of pages -> tap -> the page opens with the words highlighted.
   Contents (table of contents) by article, Prev / Next / go to page, zoom, swipe.
   Pages are private: images in the 'codebook' storage bucket, text in codebook_pages; only signed-in team members can read.
   No AI: plain word search in the database. English + Spanish labels (the book itself is English), light + dark. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const ES_ON=()=>{try{return lang()==='es'}catch(e){return false}};
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const S_ES={'Code book':'Libro del código','Search the code book':'Buscar en el libro del código','e.g. GFCI garage, 210.8, service size':'ej. GFCI garaje, 210.8, tamaño del servicio',
'Search':'Buscar','Contents':'Contenido','Volume':'Volumen','Vol':'Vol','page':'página','Page':'Página','pages found':'páginas encontradas','page found':'página encontrada',
'Nothing found. Try fewer or different words.':'No se encontró nada. Prueba con menos palabras o diferentes.','Searching…':'Buscando…','Loading…':'Cargando…',
'Keep reading':'Seguir leyendo','Open the book':'Abrir el libro','Go to page':'Ir a la página','Go':'Ir','Prev':'Anterior','Next':'Siguiente',
'Match':'Resultado','of':'de','Front of the book':'Inicio del libro','Back':'Atrás','The book is in English.':'El libro está en inglés.',
'Could not load this page. Check your connection.':'No se pudo cargar esta página. Revisa tu conexión.','Rules 1–4 (Chapters 1–4)':'Reglas 1–4 (Capítulos 1–4)',
'Chapters 5–9':'Capítulos 5–9','Chapters 1–4':'Capítulos 1–4','Read about this in the code book':'Leer sobre esto en el libro del código','No such page in this volume.':'No existe esa página en este volumen.',
'Only the team can open the code book. Sign in first.':'Solo el equipo puede abrir el libro. Inicia sesión primero.','Recent searches':'Búsquedas recientes','Find the wire':'Encontrar el cable','Check a wire':'Revisar un cable','Max voltage drop %':'Caída de voltaje máx. %','NEC recommends 3% for a branch circuit or feeder, 5% for both together. You can type any % you accept.':'El NEC recomienda 3% para un circuito derivado o alimentador, 5% para los dos juntos. Puedes poner el % que aceptes.','Type the amps, the length and the % you accept.':'Pon los amperios, la distancia y el % que aceptas.','Smallest wire that works':'El cable más chico que sirve','max':'máx.','set':'juego','sets':'juegos','No wire size works. Try more sets, a higher voltage, or allow more %.':'Ningún calibre sirve. Prueba más juegos, más voltaje o permite más %.','1 set (no parallel)':'1 juego (sin paralelo)','sets in parallel':'juegos en paralelo','lost':'se pierden','Each set carries':'Cada juego lleva','wire is good for':'el cable aguanta','every set: same size, same length, same type':'todos los juegos: mismo calibre, mismo largo, mismo tipo','Resistance from NEC Chapter 9 Table 8 (uncoated copper / aluminum, 75°C).':'Resistencia de NEC Capítulo 9 Tabla 8 (cobre / aluminio sin recubrir, 75°C).','Always check the code book and your inspector.':'Siempre revisa el libro del código y a tu inspector.','Getting the book ready to work with no service…':'Preparando el libro para usarlo sin señal…','No service — the book will finish saving when you have signal.':'Sin señal — el libro terminará de guardarse cuando tengas señal.','Try again':'Intentar de nuevo','Search works with no service.':'La búsqueda funciona sin señal.','All pages saved on this phone.':'Todas las páginas guardadas en este teléfono.','Saving pages…':'Guardando páginas…','Save all pages on this phone':'Guardar todas las páginas en este teléfono','use Wi-Fi':'usa Wi-Fi','No service right now. Pages you already opened, and saved pages, still work.':'Sin señal ahora. Las páginas que ya abriste y las guardadas siguen funcionando.','Voice':'Voz','Choose a voice':'Elige una voz','Tap a voice to hear it. ★ = best quality.':'Toca una voz para escucharla. ★ = mejor calidad.','No voices found on this phone.':'No se encontraron voces en este teléfono.','More natural voices: on iPhone go to Settings → Accessibility → Spoken Content → Voices → English, and download a Premium voice like Ava or Zoe. Then come back here and pick it.':'Voces más naturales: en el iPhone ve a Configuración → Accesibilidad → Contenido leído → Voces → Inglés, y descarga una voz Premium como Ava o Zoe. Luego vuelve aquí y elígela.','Read the whole book':'Leer el libro completo','Stop':'Parar','Pause':'Pausa','Continue':'Seguir','Slow':'Lento','Normal speed':'Velocidad normal','This page has no words to read.':'Esta página no tiene palabras para leer.','This phone cannot read aloud.':'Este teléfono no puede leer en voz alta.','section':'sección','sections':'secciones','pages':'páginas','Other pages (index, review questions)':'Otras páginas (índice, preguntas de repaso)','e.g. code for kitchens, bonding by pool, 210.8':'ej. código para cocinas, bonding de piscina, 210.8','Zoom':'Zoom'};
const T=s=>ES_ON()&&S_ES[s]?S_ES[s]:s;
const LS={get(k,d){try{const v=localStorage.getItem('cb_'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem('cb_'+k,JSON.stringify(v))}catch(e){}}};
const VOLN={1:'Chapters 1–4',2:'Chapters 5–9'};
const CB=window.CB={};
const client=()=>{if(window.EX_sb)return window.EX_sb;try{return sb}catch(e){return null}};

/* ---------- styles ---------- */
const css=document.createElement('style');css.textContent=`
#cbHome .cbsr{display:flex;gap:8px;align-items:center;background:var(--card-bg,#fff);border:1.5px solid var(--g2);border-radius:14px;padding:4px 6px 4px 12px}
html[data-theme=dark] #cbHome .cbsr,html[data-theme=dark] .cbcard{background:#1c1c1e}
#cbHome .cbsr input{flex:1;border:0;outline:0;background:transparent;font-size:16px;padding:10px 0;color:inherit;min-width:0}
#cbHome .cbgo{border:0;background:#d93a2b;color:#fff;font-weight:600;border-radius:10px;padding:10px 14px;font-size:15px}
.cbcard{display:block;background:#fff;border:1px solid var(--g2);border-radius:14px;padding:12px 14px;margin-bottom:8px;cursor:pointer;color:inherit;text-align:left;width:100%;font:inherit}
.cbmeta{font-size:12.5px;color:var(--g4);display:flex;gap:8px;align-items:center;margin-bottom:3px}
.cbsec{font-weight:700;color:#d93a2b}
.cbsnip{font-size:14px;line-height:1.45}
.cbsnip b{background:rgba(255,204,0,.45);color:inherit;border-radius:3px;padding:0 1px;font-weight:600}
.cbh{font-size:13px;font-weight:700;color:var(--g4);text-transform:uppercase;letter-spacing:.04em;margin:18px 2px 8px}
.cbseg{display:flex;background:var(--g2);border-radius:10px;padding:2px;margin-bottom:10px}
.cbseg span{flex:1;text-align:center;padding:8px 4px;border-radius:8px;font-size:14px;cursor:pointer}
.cbseg span.on{background:#fff;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.12)}
html[data-theme=dark] .cbseg span.on{background:#48484a}
.cbart{border:1px solid var(--g2);border-radius:12px;margin-bottom:6px;background:#fff;overflow:hidden}
html[data-theme=dark] .cbart{background:#1c1c1e}
.cbart>div{padding:11px 14px;cursor:pointer;display:flex;justify-content:space-between;gap:10px}
.cbart>div b{font-weight:600}
.cbart .cbsecs{display:none;border-top:1px solid var(--g2);padding:4px 0}
.cbart.open .cbsecs{display:block}
.cbsecs a{display:flex;justify-content:space-between;gap:10px;padding:8px 14px;font-size:14px;color:inherit;text-decoration:none;cursor:pointer}
.cbsecs a span:last-child,.cbart>div span{color:var(--g4);font-size:12.5px;white-space:nowrap}
.cbrec{display:flex;gap:6px;flex-wrap:wrap}
#cbR{position:fixed;inset:0;z-index:2000;background:#e9e9ee;display:flex;flex-direction:column}
html[data-theme=dark] #cbR{background:#000}
#cbR.hid{display:none}
#cbR .cbtop{display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top,0px) + 8px) 10px 8px;background:#fff;border-bottom:1px solid var(--g2)}
html[data-theme=dark] #cbR .cbtop,html[data-theme=dark] #cbR .cbbot{background:#1c1c1e}
#cbR .cbtop .tt{flex:1;min-width:0;font-size:14px;line-height:1.25}
#cbR .cbtop .tt b{display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cbR .cbtop .tt span{color:var(--g4)}
#cbR button.ib{border:0;background:var(--g1);color:inherit;border-radius:10px;min-width:40px;height:40px;font-size:17px;padding:0 10px;cursor:pointer}
#cbR .cbscr{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y pinch-zoom}
#cbR .cbpg{position:relative;margin:8px auto;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15)}
html[data-theme=dark] #cbR .cbpg img{filter:brightness(.88)}
#cbR .cbpg img{display:block;width:100%;height:auto}
#cbR .cbpg i{position:absolute;background:rgba(255,204,0,.42);border-radius:2px;mix-blend-mode:multiply;pointer-events:none}
#cbR .cbmsg{padding:40px 20px;text-align:center;color:var(--g4)}
#cbR .cbmatch{display:flex;align-items:center;gap:8px;justify-content:center;padding:6px 10px;background:#fff8d6;color:#5a4500;font-size:13.5px}
html[data-theme=dark] #cbR .cbmatch{background:#3a2b05;color:#f5c26b}
#cbR .cbmatch.hid{display:none}
#cbR .cbmatch button{border:0;background:rgba(0,0,0,.08);color:inherit;border-radius:8px;padding:5px 12px;font-size:14px}
#cbR .cbbot{display:flex;align-items:center;gap:8px;padding:8px 10px calc(env(safe-area-inset-bottom,0px) + 8px);background:#fff;border-top:1px solid var(--g2)}
#cbR .cbbot .nv{flex:1;border:0;border-radius:12px;height:46px;font-size:16px;font-weight:600;background:#d93a2b;color:#fff}
#cbR .cbbot .nv:disabled{opacity:.35}
#cbR .cbbot .pn{display:flex;align-items:center;gap:4px;font-size:14px;color:var(--g4)}
#cbR .cbbot .pn input{width:58px;height:40px;text-align:center;font-size:16px;border:1px solid var(--g2);border-radius:10px;background:transparent;color:inherit}
#cbHome .cbread{display:flex;gap:8px;margin-top:10px}
#cbHome .cbread .cbcard{flex:1;margin:0;text-align:center;padding:12px 8px}
#cbR .cbsay{display:none;padding:10px 14px;background:#1f5fbf;color:#fff;font-size:19px;line-height:1.35;max-height:28vh;overflow:auto}
#cbR .cbsay.on{display:block}
#cbR .cbsayc{display:flex;gap:8px;margin-top:8px}
#cbR .cbsayc{flex-wrap:wrap}
#cbR .cbsayc button{border:0;border-radius:10px;padding:9px 14px;font-size:15px;font-weight:600;background:rgba(255,255,255,.2);color:#fff}
#cbR .cbspd{display:flex;background:rgba(0,0,0,.18);border-radius:10px;padding:2px}
#cbR .cbspd button{background:transparent;padding:7px 12px;min-width:44px}
#cbR .cbspd button.on{background:#fff;color:#1f5fbf}
#cbVoc{position:fixed;inset:0;z-index:2002;background:rgba(0,0,0,.35);display:flex;align-items:flex-end}
#cbVoc.hid{display:none}
#cbVoc>div{background:var(--g1);width:100%;max-height:75vh;overflow:auto;border-radius:16px 16px 0 0;padding:14px 12px calc(env(safe-area-inset-bottom,0px) + 14px)}
#cbVoc .vrow{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;text-align:left;font:inherit;color:inherit;background:#fff;border:1px solid var(--g2);border-radius:12px;padding:12px 14px;margin-bottom:6px}
html[data-theme=dark] #cbVoc .vrow{background:#1c1c1e}
#cbVoc .vrow.on{border:2px solid #1f5fbf}
#cbVoc .vrow small{color:var(--g4)}
#cbR .cbpg i.rd{background:rgba(60,140,255,.35);mix-blend-mode:multiply}
#cbR button.ib.on{background:#1f5fbf;color:#fff}
#cbTocS{position:fixed;inset:0;z-index:2001;background:rgba(0,0,0,.35);display:flex;align-items:flex-end}
#cbTocS.hid{display:none}
#cbTocS>div{background:var(--g1);width:100%;max-height:82vh;overflow:auto;border-radius:16px 16px 0 0;padding:14px 12px calc(env(safe-area-inset-bottom,0px) + 14px)}
`;document.head.appendChild(css);

/* ---------- data: kept on the phone so the book works with no service ----------
   The text of every page (for search, highlights and read aloud) is saved in the phone's storage (IndexedDB) the
   first time the Code book is opened (~10 MB). Page pictures are saved as they're viewed; "Save all pages" saves
   the whole book (~160 MB, best on Wi-Fi). Search runs on the phone: instant, and works with no signal. */
const meta={1:null,2:null};        // per volume: [{idx,label,head}]
let toc=null;                       // {1:[...],2:[...]}
let LOCAL=null;                     // {pages:{'v/i':{vol,idx,label,head,body,boxes}}, toc:[...]} once on the phone
const DBN='ex-codebook',DBV=1;
function idb(){return new Promise((ok,no)=>{try{const r=indexedDB.open(DBN,DBV);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv');};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);}catch(e){no(e)}});}
async function kvGet(k){const d=await idb();return new Promise((ok,no)=>{const q=d.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});}
async function kvPut(k,v){const d=await idb();return new Promise((ok,no)=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>ok();t.onerror=()=>no(t.error);});}
const BOOKV=1; // bump if the book data changes
let localP=null,dl={busy:false,done:0,total:1280,err:''};
function cleanTitle(t){return String(t||'').replace(/[\x00-\x1f]/g,' ').replace(/\s*([—–])\s*/g,'$1').replace(/\s+/g,' ').trim();}
function useLocal(L){
  LOCAL=L;const P=L.pages;
  [1,2].forEach(v=>{meta[v]=Object.values(P).filter(p=>p.vol===v).sort((a,b)=>a.idx-b.idx).map(p=>({idx:p.idx,label:p.label,head:p.head}));});
  toc={1:[],2:[]};L.toc.forEach(r=>(toc[r.vol]||(toc[r.vol]=[])).push({vol:r.vol,ord:r.ord,title:cleanTitle(r.title),idx:r.idx}));
  Object.values(toc).forEach(a=>a.sort((x,y)=>x.ord-y.ord));
  buildIndex();
}
// load the saved copy; if there is none yet, download the text once (in parts, so a bad signal can pick up where it stopped)
function ensureLocal(){
  if(LOCAL)return Promise.resolve(LOCAL);
  if(localP)return localP;
  localP=(async()=>{
    try{const L=await kvGet('book');if(L&&L.v===BOOKV&&L.pages&&Object.keys(L.pages).length>=1280){useLocal(L);return LOCAL;}}catch(e){}
    const c=client();if(!c)throw new Error('nosb');
    dl.busy=true;dl.err='';drawDl();
    let part={};try{part=(await kvGet('bookpart'))||{};}catch(e){}
    const pages=part.pages||{};dl.done=Object.keys(pages).length;drawDl();
    for(const v of [1,2]){
      for(let from=0;;from+=80){
        const have=Object.values(pages).filter(p=>p.vol===v&&p.idx>=from&&p.idx<from+80).length;
        if(have===80){continue;}
        let r=null;for(let tries=0;tries<4&&!r;tries++){try{r=await withTimeout(c.from('codebook_pages').select('vol,idx,label,head,body,boxes').eq('vol',v).gte('idx',from).lt('idx',from+80).order('idx'),30000);if(r.error)throw r.error;}catch(e){r=null;await new Promise(z=>setTimeout(z,1500*(tries+1)));}}
        if(!r){dl.busy=false;dl.err='net';drawDl();localP=null;throw new Error('net');}
        r.data.forEach(p=>{pages[p.vol+'/'+p.idx]=p;});dl.done=Object.keys(pages).length;drawDl();
        try{await kvPut('bookpart',{pages});}catch(e){}
        if(r.data.length<80)break;
      }
    }
    const t=await withTimeout(c.from('codebook_toc').select('vol,ord,title,idx').order('vol').order('ord').limit(5000),30000);
    if(t.error){dl.busy=false;dl.err='net';drawDl();localP=null;throw t.error;}
    const L={v:BOOKV,pages,toc:t.data};
    try{await kvPut('book',L);await kvPut('bookpart',null);}catch(e){}
    useLocal(L);dl.busy=false;drawDl();return LOCAL;
  })();
  return localP;
}
// use the saved copy if it's already on the phone (doesn't wait for a download)
let qlP=null;function quickLocal(){if(LOCAL)return Promise.resolve(LOCAL);if(!qlP)qlP=kvGet('book').then(L=>{if(L&&L.v===BOOKV&&L.pages&&Object.keys(L.pages).length>=1280&&!LOCAL)useLocal(L);return LOCAL;}).catch(()=>null);return qlP;}
function withTimeout(p,ms){return Promise.race([p,new Promise((_,no)=>setTimeout(()=>no(new Error('timeout')),ms))]);}
async function loadMeta(vol){
  if(meta[vol])return meta[vol];
  await quickLocal();if(meta[vol])return meta[vol];
  const c=client();if(!c)throw new Error('nosb');
  const rows=[];
  for(let from=0;;from+=1000){
    const {data,error}=await withTimeout(c.from('codebook_pages').select('idx,label,head').eq('vol',vol).order('idx').range(from,from+999),20000);
    if(error)throw error;rows.push(...data);if(data.length<1000)break;
  }
  meta[vol]=rows;return rows;
}
async function loadToc(){
  if(toc)return toc;
  await quickLocal();if(toc)return toc;
  const {data,error}=await withTimeout(client().from('codebook_toc').select('vol,ord,title,idx').order('vol').order('ord').limit(5000),20000);
  if(error)throw error;toc={1:[],2:[]};data.forEach(r=>{r.title=cleanTitle(r.title);(toc[r.vol]||(toc[r.vol]=[])).push(r);});return toc;
}
// group the flat bookmarks into articles: "Introduction to Article 210—Branch Circuits" starts a group
function groups(list){
  const G=[];let cur={title:T('Front of the book'),idx:list.length?list[0].idx:0,items:[]};
  list.forEach(r=>{
    const m=r.title.match(/^Introduction to\s+(Article|Chapter)\s+(\d+)\s*[—–-]\s*(.*)$/i);
    if(m&&/article/i.test(m[1])){if(cur.items.length||G.length===0)G.push(cur);cur={title:'Article '+m[2]+' — '+m[3],idx:r.idx,items:[]};}
    else if(m){if(cur.items.length)G.push(cur);cur={title:'Chapter '+m[2]+' — '+m[3],idx:r.idx,items:[],chap:true};}
    else cur.items.push(r);
  });
  G.push(cur);return G.filter(g=>g.items.length||g.chap||/^Article/.test(g.title));
}
const boxCache=new Map();
async function pageData(vol,idx){
  const k=vol+'/'+idx;if(boxCache.has(k))return boxCache.get(k);
  let data=LOCAL&&LOCAL.pages[k];
  if(!data){const r=await withTimeout(client().from('codebook_pages').select('boxes,body').eq('vol',vol).eq('idx',idx).maybeSingle(),20000);data=r.data;}
  const B=(data&&data.boxes||'').split('\n').filter(Boolean).map(l=>{const p=l.split(' ');return [+p[0],+p[1],+p[2],+p[3],p.slice(4).join(' ')]});
  const r={boxes:B,body:(data&&data.body)||''};
  boxCache.set(k,r);if(boxCache.size>60)boxCache.delete(boxCache.keys().next().value);return r;
}
async function boxes(vol,idx){return (await pageData(vol,idx)).boxes;}
// page image: from the phone's cache if seen before, otherwise a short-lived private link
const urlCache=new Map();
async function img(vol,idx){
  const k=vol+'/'+idx;if(urlCache.has(k))return urlCache.get(k);
  const key='https://codebook.local/v'+vol+'/'+idx+'.webp';
  let blob=null;
  try{const ca=await caches.open('ex-codebook');const hit=await ca.match(key);if(hit)blob=await hit.blob();}catch(e){}
  if(!blob){
    const {data,error}=await withTimeout(client().storage.from('codebook').download('v'+vol+'/'+idx+'.webp'),25000);
    if(error||!data)throw error||new Error('no image');
    blob=data;
    try{const ca=await caches.open('ex-codebook');await ca.put(key,new Response(blob,{headers:{'content-type':'image/webp'}}));if(!LS.get('saveall',false))trimCache(ca);}catch(e){}
  }
  const u=URL.createObjectURL(blob);urlCache.set(k,u);
  if(urlCache.size>24){const [ok,ou]=urlCache.entries().next().value;urlCache.delete(ok);try{URL.revokeObjectURL(ou)}catch(e){}}
  return u;
}
let trimT=0;function trimCache(ca){if(Date.now()-trimT<60000)return;trimT=Date.now();ca.keys().then(ks=>{if(ks.length>500)ks.slice(0,ks.length-500).forEach(r=>ca.delete(r));}).catch(()=>{});}

/* ---------- search ---------- */
const STOP=new Set(('a an and are as at be by for from how i in is it of on or the to what whats which where when with do does need my can should must '+
 'code codes nec around near about me tell show find give get we our requirement requirements required rule rules section sections article articles '+
 'this that there all any everything info information book say says page pages').split(' '));
const SYN={pool:['swim'],pools:['swim'],swim:['pool'],bond:['equipotenti'],bonding:['equipotenti'],spa:['tub'],tub:['spa'],jacuzzi:['tub','spa'],gfi:['gfci'],
 romex:['nm'],panel:['panelboard','switchboard'],ev:['vehicl'],solar:['pv','photovolta'],grounding:['ground']};
function terms(q){
  const T0=String(q||'').toLowerCase().replace(/['’]s\b/g,'').split(/[^a-z0-9.()]+/).map(w=>w.replace(/^[.()]+|[.()]+$/g,'')).filter(w=>w&&!STOP.has(w)&&(w.length>1||/\d/.test(w)));
  const out=[];T0.forEach(w=>{out.push(w);(SYN[w]||[]).forEach(x=>out.push(x));});return out;
}
function wordHit(w,TS){
  w=w.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g,'');if(!w)return false;
  return TS.some(t=>{
    if(/\d\.\d/.test(t))return w.indexOf(t)===0;
    if(t.length<=3)return w===t||w===t+'s';
    const st=t.length>5?t.slice(0,t.length-2):t.replace(/s$/,'');return w.indexOf(st)===0;
  });
}
let lastQ='',results=[],resIdx=-1;
// ---- search on the phone (same rules as the server search) ----
let IDX=null,TITLE=null;
function stem(w){if(/\d/.test(w))return w;let s=w;for(const x of ['ations','ation','ings','ing','ers','ies','ed','es','s']){if(s.length>x.length+2&&s.endsWith(x)){s=s.slice(0,-x.length);break;}}return s;}
function buildIndex(){
  IDX=[];TITLE={};
  Object.values(toc||{}).forEach(a=>a.forEach(r=>{const h=(r.title.match(/^(\d{2,3}\.\d+[A-Z]?)\s/)||[])[1];if(h&&!TITLE[r.vol+'|'+h])TITLE[r.vol+'|'+h]=r.title;}));
  Object.values(LOCAL.pages).forEach(p=>{const low=(p.head+' '+p.body).toLowerCase();const toks=new Set(low.split(/[^a-z0-9.]+/).map(t=>t.replace(/^\.+|\.+$/g,'')).filter(Boolean));
    IDX.push({p,low,toks:[...toks],other:p.label&&(/^[ivxlc]+$/.test(p.label)||/(review questions|final exam|\| *index)/i.test(p.body.slice(0,60)))});});
}
const SYNQ={pool:['swim'],pools:['swim'],swim:['pool'],bond:['equipotenti'],bonding:['equipotenti'],spa:['tub'],tub:['spa'],jacuzzi:['tub','spa'],gfi:['gfci'],gfis:['gfci'],
 romex:['nm'],panel:['panelboard','switchboard'],ev:['vehicl'],solar:['pv','photovolta'],grounding:['ground']};
function localSearch(q){
  const qq=String(q||'').toLowerCase();
  const secs=(qq.match(/\d{2,3}\.\d+/g)||[]);
  const words=qq.replace(/(\d{2,3}\.\d+)(\([a-z0-9]+\))*/g,' ').replace(/['’]s\b/g,'').split(/[^a-z0-9]+/).filter(w=>w&&!STOP.has(w));
  const groupsQ=words.map(w=>[stem(w),...(SYNQ[w]||[])]);   // each word: its stem + trade words that mean the same
  if(!groupsQ.length&&!secs.length)return [];
  const out=[];
  IDX.forEach(e=>{
    const p=e.p;let n=0,tf=0;
    groupsQ.forEach(g=>{let hit=false;for(const t of e.toks){if(g.some(s=>t.startsWith(s))){hit=true;tf++;}}if(hit)n++;});
    const isSec=secs.includes(p.head);
    if(!n&&!isSec)return;
    const ttl=p.head?TITLE[p.vol+'|'+p.head]||null:null;let inT=0;
    if(ttl){const tl=ttl.toLowerCase();groupsQ.forEach(g=>{if(g.some(s=>new RegExp('\\b'+s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(tl)))inT++;});}
    let sc=n+inT*0.6+Math.min(1,tf/40)+(isSec?5:0)+(secs.some(x=>e.low.includes(x))?0.5:0);
    sc*=e.other?0.08:(p.head?1:0.45);
    out.push({vol:p.vol,idx:p.idx,label:p.label,head:p.head,title:ttl,score:sc,_e:e,_g:groupsQ});
  });
  out.sort((a,b)=>b.score-a.score||a.vol-b.vol||a.idx-b.idx);
  return out.slice(0,150).map(r=>{r.snip=localSnip(r._e.p.body,r._g,secs);delete r._e;delete r._g;return r;});
}
function localSnip(body,G,secs){
  const b=body.replace(/\s+/g,' ');const low=b.toLowerCase();let at=-1;
  const stems=G.flat();for(const s of stems.concat(secs)){const re=new RegExp('\\b'+s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));const m=low.match(re);if(m&&(at<0||m.index<at))at=m.index;}
  if(at<0)at=0;let a=Math.max(0,at-60);const sp=b.lastIndexOf(' ',a);if(sp>0&&at-sp<90)a=sp+1;
  let t=b.slice(a,at+150);
  stems.concat(secs).forEach(s=>{if(!s)return;t=t.replace(new RegExp('\\b('+s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[a-z0-9]*)','gi'),'<<$1>>');});
  return (a>0?'… ':'')+t+' …';
}
// ---- save every page picture on the phone (for jobs with no service) ----
const saveAll={busy:false,done:0,total:1280};
async function countSaved(){try{const ca=await caches.open('ex-codebook');return (await ca.keys()).length;}catch(e){return 0;}}
CB.saveAll=async()=>{
  if(saveAll.busy){saveAll.busy=false;drawDl();return;}   // tap again = pause
  LS.set('saveall',true);saveAll.busy=true;drawDl();
  try{await ensureLocal();}catch(e){}
  const ca=await caches.open('ex-codebook');const have=new Set((await ca.keys()).map(r=>r.url));
  const todo=[];[1,2].forEach(v=>(meta[v]||[]).forEach(m=>{const key='https://codebook.local/v'+v+'/'+m.idx+'.webp';if(!have.has(key))todo.push([v,m.idx,key]);}));
  saveAll.total=(meta[1]||[]).length+(meta[2]||[]).length||1280;saveAll.done=saveAll.total-todo.length;drawDl();
  let fails=0;
  const worker=async()=>{while(saveAll.busy&&todo.length){const [v,i,key]=todo.shift();
    try{const {data,error}=await withTimeout(client().storage.from('codebook').download('v'+v+'/'+i+'.webp'),30000);if(error||!data)throw error;await ca.put(key,new Response(data,{headers:{'content-type':'image/webp'}}));saveAll.done++;fails=0;}
    catch(e){todo.push([v,i,key]);if(++fails>12){saveAll.busy=false;}await new Promise(z=>setTimeout(z,1500));}
    if(saveAll.done%10===0)drawDl();}};
  await Promise.all([worker(),worker(),worker()]);
  saveAll.busy=false;drawDl();
};
function drawDl(){
  const el=$('cbDl');if(!el)return;
  const L=!!LOCAL;
  let h='';
  if(!L&&dl.busy)h='⏳ '+T('Getting the book ready to work with no service…')+' '+Math.round(dl.done/12.8)+'%';
  else if(!L&&dl.err)h='⚠️ '+T('No service — the book will finish saving when you have signal.')+' <a onclick="CB.retryDl()" style="text-decoration:underline;cursor:pointer">'+T('Try again')+'</a>';
  else if(L){
    const full=saveAll.done>=saveAll.total;
    h='✓ '+T('Search works with no service.')+' '+
      (full?T('All pages saved on this phone.'):
       '<a onclick="CB.saveAll()" style="text-decoration:underline;cursor:pointer;font-weight:600">'+(saveAll.busy?T('Saving pages…')+' '+saveAll.done+'/'+saveAll.total+' — '+T('Pause'):T('Save all pages on this phone')+' (160 MB, '+T('use Wi-Fi')+')'+(saveAll.done?' — '+saveAll.done+'/'+saveAll.total:''))+'</a>');
  }
  el.innerHTML=h;
}
CB.retryDl=()=>{dl.err='';ensureLocal().then(()=>{drawToc('cbToc');}).catch(()=>{});drawDl();};
async function search(q){
  if(LOCAL)return localSearch(q);
  const c=client();if(!c)throw new Error('nosb');
  try{const {data,error}=await withTimeout(c.rpc('codebook_search',{q,lim:150}),15000);if(error)throw error;return data||[];}
  catch(e){ // weak signal: wait for the saved copy if it's coming
    if(localP){try{await localP;return localSearch(q);}catch(x){}}
    throw new Error('net');}
}
function snipHtml(s){return E(String(s||'').replace(/[\uE000-\uF8FF}]/g,'').replace(/\s*\|\s*/g,' · ')).replace(/&lt;&lt;/g,'<b>').replace(/&gt;&gt;/g,'</b>').replace(/\s+/g,' ');}

/* ---------- home (inside Code & calculators) ---------- */
let tvol=LS.get('tvol',1),openArt=null;
function homeHtml(){
  const last=LS.get('last',null),rec=LS.get('rec',[]);
  return '<div id="cbHome">'+
  '<form class="cbsr" onsubmit="event.preventDefault();CB.go()"><svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="color:var(--g4);flex:none"><circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/></svg>'+
  '<input id="cbQ" data-nomic="1" type="search" enterkeyhint="search" autocomplete="off" placeholder="'+E(T('e.g. code for kitchens, bonding by pool, 210.8'))+'" value="'+E(lastQ)+'"><button class="cbgo" type="submit">'+E(T('Search'))+'</button></form>'+
  '<div style="font-size:12px;color:var(--g4);margin:6px 4px 0">Mike Holt — Understanding the 2023 NEC'+(ES_ON()?' · '+E(T('The book is in English.')):'')+'</div>'+
  '<div id="cbDl" style="font-size:12.5px;color:var(--g4);margin:6px 4px 0;line-height:1.4"></div>'+
  '<div class="cbread">'+[1,2].map(v=>'<button class="cbcard" onclick="CB.read('+v+')"><b>📖 '+E(T('Read the whole book'))+'</b><div class="cbmeta" style="margin:3px 0 0">'+E(T('Volume'))+' '+v+' · '+E(T(VOLN[v]))+'</div></button>').join('')+'</div>'+
  '<div id="cbRes"></div>'+
  '<div id="cbIdle">'+
   (rec.length?'<div class="cbh">'+E(T('Recent searches'))+'</div><div class="cbrec">'+rec.map(r=>'<span class="chip" onclick="CB.go(\''+E(r).replace(/'/g,'&#39;')+'\')">'+E(r)+'</span>').join('')+'</div>':'')+
   (last?'<div class="cbh">'+E(T('Keep reading'))+'</div><button class="cbcard" onclick="CB.open('+(+last.v)+','+(+last.i)+')"><div class="cbmeta"><span>'+E(T('Vol'))+' '+(+last.v)+'</span><span>·</span><span>'+E(T('page'))+' '+E(last.l)+'</span></div><b>'+E(last.h||'')+'</b></button>':'')+
   '<div class="cbh">'+E(T('Contents'))+'</div>'+
   '<div class="cbseg">'+[1,2].map(v=>'<span class="'+(tvol===v?'on':'')+'" onclick="CB.tv('+v+')">'+E(T('Volume'))+' '+v+'<br><small style="color:var(--g4)">'+E(T(VOLN[v]))+'</small></span>').join('')+'</div>'+
   '<div id="cbToc"><div style="color:var(--g4);padding:10px">'+E(T('Loading…'))+'</div></div>'+
  '</div></div>';
}
async function drawToc(target,inSheet){
  const el=$(target);if(!el)return;
  try{
    const tc=await loadToc();const G=groups(tc[tvol]||[]);const M=await loadMeta(tvol);
    const lab=i=>(M[i]&&M[i].label)||'';
    el.innerHTML='<button class="cbcard" style="text-align:center;font-weight:600" onclick="CB.open('+tvol+','+(G[0]?G[0].idx:0)+')">'+E(T('Open the book'))+' — '+E(T('Volume'))+' '+tvol+'</button>'+
    G.map((g,gi)=>'<div class="cbart'+(openArt===tvol+':'+gi?' open':'')+'"><div onclick="CB.art(this,\''+tvol+':'+gi+'\')"><b>'+E(g.title)+'</b><span>'+(g.items.length?g.items.length+' ›':E(T('page'))+' '+E(lab(g.idx)))+'</span></div>'+
      '<div class="cbsecs"><a onclick="CB.open('+tvol+','+g.idx+')"><span>'+E(g.title)+'</span><span>'+E(lab(g.idx))+'</span></a>'+
      g.items.map(r=>'<a onclick="CB.open('+tvol+','+r.idx+')"><span>'+E(r.title)+'</span><span>'+E(lab(r.idx))+'</span></a>').join('')+'</div></div>').join('');
  }catch(e){el.innerHTML='<div style="color:var(--g4);padding:10px">'+E(T(String(e&&e.message)==='nosb'?'Only the team can open the code book. Sign in first.':'No service right now. Pages you already opened, and saved pages, still work.'))+'</div>';}
}
CB.tv=v=>{tvol=v;LS.set('tvol',v);document.querySelectorAll('.cbseg span').forEach((s,i)=>s.classList.toggle('on',i===v-1));drawToc(document.getElementById('cbTocS')&&!$('cbTocS').classList.contains('hid')?'cbTocIn':'cbToc');};
CB.art=(el,k)=>{const a=el.parentNode;const on=!a.classList.contains('open');document.querySelectorAll('.cbart.open').forEach(x=>x.classList.remove('open'));if(on){a.classList.add('open');openArt=k;}else openArt=null;};
// results grouped by section: "680.26 Equipotential Bonding — 5 pages"; pages with no section (index, review questions) at the end
let groupsR=[];
function groupResults(rows){
  const G=new Map();
  rows.forEach(r=>{const k=r.head?r.vol+'|'+r.head:'other';if(!G.has(k))G.set(k,{k,vol:r.vol,head:r.head,title:r.title||'',best:r,score:r.score,pages:[]});const g=G.get(k);g.pages.push(r);if(r.score>g.score){g.score=r.score;g.best=r;}});
  const L=[...G.values()].sort((a,b)=>(a.k==='other')-(b.k==='other')||b.score-a.score);
  L.forEach(g=>g.pages.sort((a,b)=>a.vol-b.vol||a.idx-b.idx));
  return L;
}
CB.go=async q=>{
  const inp=$('cbQ');if(q!=null&&inp)inp.value=q;q=(q!=null?q:inp?inp.value:'').trim();
  const R=$('cbRes'),I=$('cbIdle');if(!R)return;
  if(q.length<2){R.innerHTML='';if(I)I.style.display='';return;}
  lastQ=q;if(inp)inp.blur();if(I)I.style.display='none';
  R.innerHTML='<div style="color:var(--g4);padding:14px 4px">'+E(T('Searching…'))+'</div>';
  try{
    const rows=await search(q);
    const rec=LS.get('rec',[]).filter(x=>x.toLowerCase()!==q.toLowerCase());rec.unshift(q);LS.set('rec',rec.slice(0,8));
    groupsR=groupResults(rows);
    results=[];groupsR.forEach(g=>g.pages.forEach(p=>results.push(p)));   // reading order for "Match 2 of 16"
    const nSec=groupsR.filter(g=>g.k!=='other').length;
    const pr=(g)=>{const a=g.pages[0].label,b=g.pages[g.pages.length-1].label;return g.pages.length===1?T('page')+' '+a:T('pages')+' '+a+'–'+b;};
    R.innerHTML='<div class="cbh">'+(nSec?nSec+' '+E(T(nSec===1?'section':'sections'))+' · ':'')+results.length+' '+E(T(results.length===1?'page found':'pages found'))+'</div>'+
      (groupsR.length?groupsR.map((g,gi)=>{
        const first=results.indexOf(g.best);
        if(g.k==='other')return '<details class="cbcard" style="cursor:default"><summary style="cursor:pointer;color:var(--g4)">'+E(T('Other pages (index, review questions)'))+' · '+g.pages.length+'</summary>'+
          g.pages.map(p=>'<button class="cbcard" style="margin-top:8px" onclick="CB.hit('+results.indexOf(p)+')"><div class="cbmeta"><span>'+E(T('Vol'))+' '+p.vol+'</span><span>·</span><span>'+E(T('page'))+' '+E(p.label)+'</span></div><div class="cbsnip">'+snipHtml(p.snip)+'</div></button>').join('')+'</details>';
        const ttl=g.title?g.title.replace(new RegExp('^'+g.head.replace(/\./g,'\\.')+'\\s*'),''):'';
        return '<button class="cbcard" onclick="CB.hit('+first+')"><div style="display:flex;gap:8px;align-items:baseline"><span class="cbsec" style="font-size:16px">'+E(g.head)+'</span><b style="font-size:16px;line-height:1.25">'+E(ttl)+'</b></div>'+
          '<div class="cbmeta" style="margin:4px 0 6px"><span>'+E(T('Vol'))+' '+g.vol+'</span><span>·</span><span>'+E(pr(g))+'</span></div><div class="cbsnip">'+snipHtml(g.best.snip)+'</div></button>';
      }).join('')
      :'<div class="cbcard" style="cursor:default;color:var(--g4)">'+E(T('Nothing found. Try fewer or different words.'))+'</div>');
  }catch(e){R.innerHTML='<div class="cbcard" style="cursor:default;color:var(--g4)">'+E(T(String(e&&e.message)==='nosb'?'Only the team can open the code book. Sign in first.':'No service right now. Pages you already opened, and saved pages, still work.'))+'</div>';}
};
CB.hit=i=>{resIdx=i;const r=results[i];if(r)CB.open(r.vol,r.idx,true);};

/* ---------- reader ---------- */
let cur={v:1,i:0},zoom=LS.get('zoom',1),hl=false,loadSeq=0;
function readerEl(){
  let R=$('cbR');if(R)return R;
  R=document.createElement('div');R.id='cbR';R.className='hid';
  R.innerHTML='<div class="cbtop"><button class="ib" onclick="CB.close()" aria-label="Back">‹</button><div class="tt" id="cbTT"></div>'+
    '<button class="ib" onclick="CB.say()" id="cbSay" aria-label="Read aloud">🔊</button><button class="ib" onclick="CB.zoom()" id="cbZ" aria-label="Zoom"></button><button class="ib" onclick="CB.toc()" aria-label="Contents">☰</button></div>'+
    '<div class="cbmatch hid" id="cbM"></div>'+
    '<div class="cbsay" id="cbSayBar"><div id="cbSayTx"></div><div class="cbsayc"><button id="cbSayP" onclick="CB.sayPause()"></button><span class="cbspd" id="cbSpd"></span><button id="cbSayV" onclick="CB.voices()"></button><button onclick="CB.sayStop()">■ '+E(T('Stop'))+'</button></div></div>'+
    '<div class="cbscr" id="cbS"></div>'+
    '<div class="cbbot"><button class="nv" id="cbP" onclick="CB.step(-1)"></button><form class="pn" onsubmit="event.preventDefault();CB.jump()"><input id="cbN" data-nomic="1" inputmode="text" enterkeyhint="go"><span id="cbOf"></span></form><button class="nv" id="cbNx" onclick="CB.step(1)"></button></div>'+
    '<div id="cbTocS" class="hid" onclick="if(event.target===this)CB.tocClose()"><div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><b style="font-size:17px">'+'<span id="cbTocH"></span></b><button class="ib" onclick="CB.tocClose()">✕</button></div><div class="cbseg" id="cbTocSeg"></div><div id="cbTocIn"></div></div></div>';
  document.body.appendChild(R);
  // swipe left / right to turn the page (only when not zoomed in)
  let sx=0,sy=0,st=0;const S=R.querySelector('#cbS');
  S.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;sx=e.touches[0].clientX;sy=e.touches[0].clientY;st=Date.now();},{passive:true});
  S.addEventListener('touchend',e=>{if(zoom>1||!st)return;const t=e.changedTouches[0];const dx=t.clientX-sx,dy=t.clientY-sy;st=0;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.6)CB.step(dx<0?1:-1);},{passive:true});
  document.addEventListener('keydown',e=>{if(R.classList.contains('hid')||/INPUT/.test((e.target||{}).tagName||''))return;if(e.key==='ArrowRight')CB.step(1);if(e.key==='ArrowLeft')CB.step(-1);if(e.key==='Escape')CB.close();});
  return R;
}
CB.open=async(v,i,fromSearch)=>{
  const R=readerEl();hl=!!fromSearch;if(!fromSearch)resIdx=-1;
  cur={v:+v,i:+i};
  if(R.classList.contains('hid')){R.classList.remove('hid');try{history.pushState({cb:1},'');}catch(e){}}
  $('cbP').textContent='‹ '+T('Prev');$('cbNx').textContent=T('Next')+' ›';
  await draw();
};
CB.close=()=>{const R=$('cbR');if(!R||R.classList.contains('hid'))return;CB.sayStop();R.classList.add('hid');CB.tocClose();try{if(history.state&&history.state.cb)history.back();}catch(e){}};
window.addEventListener('popstate',()=>{const R=$('cbR');if(R&&!R.classList.contains('hid')){CB.sayStop();R.classList.add('hid');CB.tocClose();}});
async function draw(){
  const seq=++loadSeq;const {v,i}=cur;const S=$('cbS');
  let M=[];try{M=await loadMeta(v);}catch(e){}
  const n=M.length||1,m=M[i]||{};
  $('cbTT').innerHTML='<b>'+E(m.head||(T('Volume')+' '+v))+'</b><span>'+E(T('Vol'))+' '+v+' · '+E(T('page'))+' '+E(m.label||i+1)+'</span>';
  $('cbN').value=m.label||'';$('cbOf').textContent='/ '+((M[n-1]||{}).label||n);
  $('cbP').disabled=i<=0;$('cbNx').disabled=i>=n-1;
  $('cbZ').textContent=zoom===1?T('Zoom'):'×'+zoom;
  // match bar
  const MB=$('cbM');
  if(hl&&resIdx>=0&&results.length){MB.classList.remove('hid');MB.innerHTML='<button onclick="CB.res(-1)" '+(resIdx<=0?'disabled':'')+'>‹</button><span>'+E(T('Match'))+' '+(resIdx+1)+' '+E(T('of'))+' '+results.length+' — “'+E(lastQ)+'”</span><button onclick="CB.res(1)" '+(resIdx>=results.length-1?'disabled':'')+'>›</button><button onclick="CB.unhl()">✕</button>';}
  else MB.classList.add('hid');
  S.innerHTML='<div class="cbpg" id="cbPg" style="width:'+(Math.min(860,Math.max(300,S.clientWidth-16))*zoom)+'px;aspect-ratio:612/783"><div class="cbmsg">'+E(T('Loading…'))+'</div></div>';
  S.scrollTop=0;S.scrollLeft=0;
  LS.set('last',{v,i,l:m.label||'',h:m.head||''});
  try{
    const u=await img(v,i);if(seq!==loadSeq)return;
    const P=$('cbPg');P.innerHTML='<img alt="" src="'+u+'">';
    if(hl&&lastQ){
      const TS=terms(lastQ);const B=await boxes(v,i);if(seq!==loadSeq)return;
      const hits=B.filter(b=>wordHit(b[4],TS));
      P.insertAdjacentHTML('beforeend',hits.map(b=>'<i style="left:'+(b[0]/10-.3)+'%;top:'+(b[1]/10-.15)+'%;width:'+(b[2]/10+.6)+'%;height:'+(b[3]/10+.3)+'%"></i>').join(''));
      if(hits.length){const y=Math.min(...hits.map(b=>b[1]))/1000*P.clientHeight;S.scrollTop=Math.max(0,y-S.clientHeight*.3);}
    }
  }catch(e){if(seq!==loadSeq)return;$('cbPg').innerHTML='<div class="cbmsg">'+E(T('Could not load this page. Check your connection.'))+'</div>';}
  // get the next and previous pages ready
  setTimeout(()=>{if(seq!==loadSeq)return;[i+1,i-1].forEach(k=>{if(k>=0&&k<n)img(v,k).catch(()=>{});});},300);
}
CB.step=d=>{let M=meta[cur.v]||[];const n=M.length||1;const k=cur.i+d;if(k<0||k>=n)return;cur.i=k;const p=draw();if(say.on)p.then(()=>sayPage());};
CB.res=d=>{const k=resIdx+d;if(k<0||k>=results.length)return;resIdx=k;const r=results[k];cur={v:r.vol,i:r.idx};hl=true;draw();};
CB.unhl=()=>{hl=false;resIdx=-1;draw();};
// open a whole volume from the start (or where you left off in it)
CB.read=async v=>{const last=LS.get('last',null);if(last&&+last.v===v&&last.i>0)return CB.open(v,last.i);let i=0;try{const tc=await loadToc();if(tc[v]&&tc[v][0])i=tc[v][0].idx;}catch(e){}CB.open(v,i);};

/* ---------- read aloud (the phone's own voice, no AI, works for any page) ---------- */
const say={on:false,paused:false,spd:[1,2,3].includes(LS.get('spd',1))?LS.get('spd',1):1,chunks:[],at:0,seq:0};
const RATE={1:1.05,2:2,3:3}; // 1× is a normal talking speed; 2× and 3× for fast listening
const SYNTH=()=>window.speechSynthesis;
function cleanForSpeech(body){
  let t=String(body||'');
  t=t.replace(/[\uE000-\uF8FF}▶►]/g,' ');
  t=t.split('\n').filter(l=>!/(Mike ?Holt|Understanding the 2023 National|1st Printing|Copyright\s+\d{4}|www\.)/i.test(l)).join('\n');
  t=t.replace(/(\w)-\n(\w)/g,'$1$2').replace(/\bFigure\s+\d+[–-]\d+\b/g,' ').replace(/_{2,}/g,' blank ');
  t=t.replace(/^\s*(\d{2,3}\.\d+)\s*\|\s*([^\n]+)/,'Section $1, $2.\n');
  t=t.replace(/\s*\|\s*/g,', ').replace(/\s+/g,' ').trim();
  return t;
}
function speakable(s){
  return s.replace(/(\d+)\.(\d+)/g,'$1 point $2').replace(/\bAWG\b/g,'A W G').replace(/(\d)\s?ft\b/g,'$1 feet').replace(/(\d)\s?in\.(?=\s|$)/g,'$1 inches')
          .replace(/(\d)\s?V\b/g,'$1 volts').replace(/(\d)\s?A\b/g,'$1 amps').replace(/(\d)\s?kW\b/g,'$1 kilowatts').replace(/(\d)\s?VA\b/g,'$1 volt amps').replace(/°F/g,' degrees');
}
function chunksOf(text){
  const out=[];text.split(/(?<=[.!?;:])\s+/).forEach(s=>{s=s.trim();if(!s)return;
    while(s.length>220){let k=s.lastIndexOf(' ',220);if(k<80)k=220;out.push(s.slice(0,k));s=s.slice(k).trim();}
    if(s.length<3&&out.length)out[out.length-1]+=' '+s;else out.push(s);});
  return out;
}
const nw=w=>String(w||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function markWords(raw,B,from){
  // light up the words being read, so slow readers can follow along on the page
  const P=$('cbPg');if(!P)return from;P.querySelectorAll('i.rd').forEach(x=>x.remove());
  const W=raw.split(/\s+/).map(nw).filter(Boolean);if(!W.length||!B.length)return from;
  let s=-1,j0=0;
  for(let j=0;j<Math.min(3,W.length)&&s<0;j++){for(let k=from;k<Math.min(B.length,from+250);k++){if(nw(B[k][4])===W[j]&&(j+1>=W.length||k+1>=B.length||nw(B[k+1][4])===W[j+1]||nw(B[k+2]&&B[k+2][4])===W[j+1])){s=k;j0=j;break;}}}
  if(s<0)return from;
  const L=B.slice(s,s+W.length-j0);
  P.insertAdjacentHTML('beforeend',L.map(b=>'<i class="rd" style="left:'+(b[0]/10-.3)+'%;top:'+(b[1]/10-.15)+'%;width:'+(b[2]/10+.6)+'%;height:'+(b[3]/10+.3)+'%"></i>').join(''));
  const S=$('cbS'),y=L[0][1]/1000*P.clientHeight;if(y<S.scrollTop+40||y>S.scrollTop+S.clientHeight*.7)S.scrollTop=Math.max(0,y-S.clientHeight*.3);
  return s+W.length;
}
function sayUI(){
  const bar=$('cbSayBar');if(!bar)return;bar.classList.toggle('on',say.on);$('cbSay').classList.toggle('on',say.on);
  $('cbSayP').textContent=say.paused?'▶ '+T('Continue'):'❚❚ '+T('Pause');
  $('cbSpd').innerHTML=[1,2,3].map(k=>'<button class="'+(say.spd===k?'on':'')+'" onclick="CB.saySpeed('+k+')">'+k+'×</button>').join('');
  const v=pickVoice();$('cbSayV').textContent='🗣 '+(v?shortName(v):T('Voice'));
}
// the nicest voices first: the phone's "Premium" / "Enhanced" / natural voices, then well-known good ones
const GOOD=/premium|enhanced|natural|neural|siri|online|wavenet/i, NICE=/\b(ava|zoe|evan|nathan|noelle|joelle|samantha|allison|susan|tom|aria|jenny|guy|michelle|google us english)\b/i, BAD=/compact|fred|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
function voiceScore(v){let s=0;if(/^en[-_]US/i.test(v.lang))s+=30;else if(/^en/i.test(v.lang))s+=15;else return -1;if(GOOD.test(v.name))s+=40;if(NICE.test(v.name))s+=20;if(BAD.test(v.name))s-=60;if(v.localService===false)s+=5;return s;}
function voicesList(){try{return (SYNTH().getVoices()||[]).filter(v=>voiceScore(v)>0).sort((a,b)=>voiceScore(b)-voiceScore(a)||a.name.localeCompare(b.name));}catch(e){return [];}}
function shortName(v){return String(v.name).replace(/^(Microsoft|Google|Apple)\s+/i,'').replace(/\s*\(.*?\)\s*/g,' ').replace(/\s+-\s+English.*$/i,'').replace(/\s+Online/i,'').trim().split(' ').slice(0,2).join(' ')+(GOOD.test(v.name)?' ★':'');}
function pickVoice(){const L=voicesList();const want=LS.get('voice','');return (want&&L.find(v=>v.name===want))||L[0]||null;}
try{if(window.speechSynthesis)speechSynthesis.onvoiceschanged=()=>{if(say.on)sayUI();};}catch(e){}
CB.voices=()=>{
  let O=$('cbVoc');if(!O){O=document.createElement('div');O.id='cbVoc';O.className='hid';O.onclick=e=>{if(e.target===O)O.classList.add('hid');};document.body.appendChild(O);}
  const L=voicesList(),cur=pickVoice();
  O.innerHTML='<div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="font-size:17px">'+E(T('Choose a voice'))+'</b><button class="ib" onclick="document.getElementById(\'cbVoc\').classList.add(\'hid\')" style="border:0;background:var(--g2);border-radius:10px;width:40px;height:40px">✕</button></div>'+
   '<div style="font-size:13px;color:var(--g4);margin-bottom:10px">'+E(T('Tap a voice to hear it. ★ = best quality.'))+'</div>'+
   (L.length?L.map((v,k)=>'<button class="vrow'+(cur&&v.name===cur.name?' on':'')+'" onclick="CB.pickV('+k+')"><span><b>'+E(shortName(v))+'</b><br><small>'+E(v.name)+'</small></span><span>'+(cur&&v.name===cur.name?'✓':'▶')+'</span></button>').join(''):'<div class="vrow">'+E(T('No voices found on this phone.'))+'</div>')+
   '<div style="font-size:13px;color:var(--g4);margin-top:10px;line-height:1.45">'+E(T('More natural voices: on iPhone go to Settings → Accessibility → Spoken Content → Voices → English, and download a Premium voice like Ava or Zoe. Then come back here and pick it.'))+'</div></div>';
  O.classList.remove('hid');
};
CB.pickV=k=>{const v=voicesList()[k];if(!v)return;LS.set('voice',v.name);
  try{SYNTH().cancel();const u=new SpeechSynthesisUtterance('Hi, this is '+shortName(v).replace(' ★','')+'. Section 210 point 8, GFCI protection.');try{u.voice=v;u.lang=v.lang;}catch(e){}u._vn=v.name;u.rate=RATE[say.spd];if(!say.on)SYNTH().speak(u);}catch(e){}
  CB.voices();if(say.on){sayUI();sayPage(say.at);}};
async function sayPage(startAt){
  const seq=++say.seq;try{SYNTH().cancel();}catch(e){}
  const {v,i}=cur;let d;try{d=await pageData(v,i);}catch(e){d={body:'',boxes:[]};}
  if(seq!==say.seq||!say.on)return;
  const raw=cleanForSpeech(d.body);say.chunks=chunksOf(raw);say.at=Math.min(startAt||0,Math.max(0,say.chunks.length-1));let wpos=0;
  if(!say.chunks.length){say.chunks=[T('This page has no words to read.')];}
  const voice=pickVoice();
  const next=()=>{
    if(seq!==say.seq||!say.on)return;
    if(say.at>=say.chunks.length){ // end of the page: go on to the next page
      const M=meta[cur.v]||[];if(cur.i<M.length-1){cur.i++;draw().then(()=>{if(seq===say.seq&&say.on)sayPage();});}else CB.sayStop();return;}
    const raw=say.chunks[say.at];$('cbSayTx').textContent=raw;wpos=markWords(raw,d.boxes,wpos);
    const u=new SpeechSynthesisUtterance(speakable(raw));u.lang='en-US';if(voice){try{u.voice=voice;u.lang=voice.lang;}catch(e){}u._vn=voice.name;}u.rate=RATE[say.spd];
    u.onend=()=>{if(seq!==say.seq)return;say.at++;next();};u.onerror=()=>{if(seq!==say.seq)return;say.at++;setTimeout(next,50);};
    SYNTH().speak(u);
  };
  setTimeout(next,120);
}
CB.say=()=>{
  if(!SYNTH()||typeof SpeechSynthesisUtterance==='undefined'){try{toast(T('This phone cannot read aloud.'))}catch(e){}return;}
  if(say.on){CB.sayStop();return;}
  say.on=true;say.paused=false;sayUI();sayPage();
};
CB.sayPause=()=>{if(!say.on)return;if(say.paused){SYNTH().resume();say.paused=false;}else{SYNTH().pause();say.paused=true;}sayUI();};
CB.saySpeed=k=>{say.spd=k;LS.set('spd',k);sayUI();if(say.on&&!say.paused)sayPage(say.at);};
CB.sayStop=()=>{say.seq++;say.on=false;say.paused=false;try{SYNTH().cancel();}catch(e){}const P=$('cbPg');if(P)P.querySelectorAll('i.rd').forEach(x=>x.remove());sayUI();};
CB.zoom=()=>{zoom=zoom===1?1.6:zoom===1.6?2.4:1;LS.set('zoom',zoom);draw();};
CB.jump=()=>{const v=$('cbN').value.trim().toLowerCase();const M=meta[cur.v]||[];
  let k=M.findIndex(m=>String(m.label).toLowerCase()===v);
  if(k<0&&/^\d{2,3}\.\d+/.test(v))k=M.findIndex(m=>m.head===v);
  if(k<0){try{toast(T('No such page in this volume.'))}catch(e){alertless()}return;}
  $('cbN').blur();cur.i=k;draw();};
function alertless(){const n=$('cbN');n.style.borderColor='#d93a2b';setTimeout(()=>n.style.borderColor='',1200);}
CB.toc=()=>{const S=$('cbTocS');S.classList.remove('hid');tvol=cur.v;$('cbTocH').textContent=T('Contents');
  $('cbTocSeg').innerHTML=[1,2].map(v=>'<span class="'+(tvol===v?'on':'')+'" onclick="CB.tv('+v+')">'+E(T('Volume'))+' '+v+'</span>').join('');drawToc('cbTocIn',true);};
CB.tocClose=()=>{const S=$('cbTocS');if(S)S.classList.add('hid');};
const _open=CB.open;CB.open=(v,i,f)=>{CB.tocClose();return _open(v,i,f);};

/* ---------- open from a section number (used by the calculators) ---------- */
CB.sec=async(sec,vol)=>{try{for(const v of (vol?[vol]:[1,2])){const M=await loadMeta(v);const k=M.findIndex(m=>m.head===sec);if(k>=0){lastQ=sec;results=[];resIdx=-1;return CB.open(v,k,true);}}}catch(e){}CB.open(vol||1,0);};

/* ---------- Voltage drop: "Find the wire" (Yossi, 11/2) ----------
   Type amps + one-way length (+ volts, phase, Cu/Al, the % drop you accept) -> the smallest wire that works,
   for 1, 2, 3 and 4 parallel sets. Each answer must pass BOTH the drop limit and the ampacity (Table 310.16, 75°C
   column per 110.14(C), split across the sets); parallel sets are 1/0 or larger (310.10(G)). The old "Check a wire"
   screen stays as the second option. */
let vdMode=LS.get('vdmode','find');
const VDK='cb_vdf';
function vdVals(){const d={A:100,L:200,V:'240',P:'1',M:'cu',X:3};try{return Object.assign(d,JSON.parse(localStorage.getItem(VDK)||'{}'));}catch(e){return d;}}
function vdFind(B){
  const top='<div class="cbseg" style="margin-bottom:12px">'+[['find',T('Find the wire')],['check',T('Check a wire')]].map(([k,l])=>'<span class="'+(vdMode===k?'on':'')+'" onclick="CB.vdMode(\''+k+'\')">'+E(l)+'</span>').join('')+'</div>';
  if(vdMode==='check'){B.insertAdjacentHTML('afterbegin',top);return;}
  const v=vdVals();const tt2=x=>{try{return t(x)}catch(e){return x}};
  const inp=(id,val,lab,step)=>'<div style="flex:1;min-width:130px"><label style="margin-top:8px">'+E(lab)+'</label><input id="'+id+'" type="number" inputmode="decimal" '+(step?'step="'+step+'" ':'')+'value="'+E(val)+'" oninput="CB.vdCalc()"></div>';
  const sl=(id,opts,val,lab)=>'<div style="flex:1;min-width:130px"><label style="margin-top:8px">'+E(lab)+'</label><select id="'+id+'" onchange="CB.vdCalc()">'+opts.map(([k,l])=>'<option value="'+k+'"'+(String(val)===k?' selected':'')+'>'+E(l)+'</option>').join('')+'</select></div>';
  const rw=(...f)=>'<div style="display:flex;gap:10px;flex-wrap:wrap">'+f.join('')+'</div>';
  B.innerHTML=top+'<div class="card" style="padding:14px 16px">'+
    rw(inp('vf_A',v.A,tt2('Amps')),inp('vf_L',v.L,tt2('One-way length (ft)')))+
    rw(sl('vf_V',[['120','120V'],['208','208V'],['240','240V'],['277','277V'],['480','480V']],v.V,tt2('Volts')),sl('vf_P',[['1',tt2('Single-phase')],['3',tt2('Three-phase')]],v.P,tt2('Phase')))+
    rw(sl('vf_M',[['cu',tt2('Copper')],['al',tt2('Aluminum')]],v.M,tt2('Wire')),inp('vf_X',v.X,T('Max voltage drop %'),'0.5'))+
    '<div style="font-size:12px;color:var(--g4);margin-top:8px">'+E(T('NEC recommends 3% for a branch circuit or feeder, 5% for both together. You can type any % you accept.'))+'</div>'+
  '</div><div id="vf_R"></div>';
  CB.vdCalc();
}
CB.vdMode=k=>{vdMode=k;LS.set('vdmode',k);try{renderCode();}catch(e){}};
CB.vdCalc=()=>{
  const R=$('vf_R');if(!R)return;
  const g=id=>($(id)||{}).value;const A=parseFloat(g('vf_A'))||0,L=parseFloat(g('vf_L'))||0,V=+g('vf_V'),P=g('vf_P'),M=g('vf_M'),X=parseFloat(g('vf_X'))||0;
  try{localStorage.setItem(VDK,JSON.stringify({A,L,V:String(V),P,M,X}));}catch(e){}
  if(!(A>0&&L>0&&X>0)){R.innerHTML='<div class="card" style="padding:14px 16px;color:var(--g4)">'+E(T('Type the amps, the length and the % you accept.'))+'</div>';return;}
  const f=P==='3'?Math.sqrt(3):2;
  let SZ=[],AM={},RS={};try{SZ=AWG;AM=AMP;RS=R8;}catch(e){}
  const cap=(s)=>{const a=(AM[M]||{})[s];if(!a)return 0;let c=a[1];const small=M==='cu'?{'14':15,'12':20,'10':30}:{'12':15,'10':25};if(small[s])c=Math.min(c,small[s]);return c;};
  const wn=s=>(/^\d{3}$/.test(s)?s+' kcmil':'#'+s)+' '+(M==='al'?'Al':'Cu');
  const rows=[1,2,3,4].map(n=>{
    const per=A/n;let why='';
    for(const s of SZ){
      if(n>1&&SZ.indexOf(s)<SZ.indexOf('1/0'))continue;
      const r=(RS[M]||{})[s];if(!r)continue;
      const vd=f*L*r*per/1000,pct=vd/V*100;
      if(cap(s)<per){why='amps';continue;}
      if(pct>X+1e-9){why='drop';continue;}
      return {n,s,pct,vd,load:V-vd,cap:cap(s),per};
    }
    return {n,none:true};
  });
  const best=rows.find(r=>!r.none);
  R.innerHTML='<div class="cbh" style="margin-top:16px">'+E(T('Smallest wire that works'))+' · '+E(T('max'))+' '+X+'%</div>'+
    rows.map(r=>r.none?'<div class="card" style="padding:12px 14px;color:var(--g4)"><b>'+r.n+' '+E(T(r.n===1?'set':'sets'))+'</b> — '+E(T('No wire size works. Try more sets, a higher voltage, or allow more %.'))+'</div>':
      '<div class="card" style="padding:12px 14px'+(r===best?';border:2px solid var(--green)':'')+'"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">'+
      '<div><div style="font-size:13px;color:var(--g4)">'+(r.n===1?E(T('1 set (no parallel)')):r.n+' '+E(T('sets in parallel')))+'</div><div style="font-size:24px;font-weight:700;letter-spacing:-.4px">'+(r.n>1?r.n+' × ':'')+E(wn(r.s))+'</div></div>'+
      '<div style="text-align:right"><div style="font-size:22px;font-weight:700;color:var(--green)">'+r.pct.toFixed(2)+'%</div><div style="font-size:12.5px;color:var(--g4)">'+r.vd.toFixed(1)+' V '+E(T('lost'))+' → '+r.load.toFixed(0)+' V</div></div></div>'+
      '<div style="font-size:12.5px;color:var(--g4);margin-top:6px">'+(r.n>1?E(T('Each set carries'))+' '+r.per.toFixed(1)+' A · ':'')+E(T('wire is good for'))+' '+r.cap+' A (310.16, 75°C)'+(r.n>1?' · '+E(T('every set: same size, same length, same type'))+' (310.10(G))':'')+'</div></div>').join('')+
    '<div style="font-size:12px;color:var(--g4);margin:6px 2px 0;line-height:1.5">'+E(T('Resistance from NEC Chapter 9 Table 8 (uncoated copper / aluminum, 75°C).'))+' '+(P==='3'?'√3':'2')+' × '+L+' ft × R × A ÷ 1000. '+E(T('Always check the code book and your inspector.'))+'</div>';
};

/* ---------- hook into Code & calculators ---------- */
if(typeof renderCode==='function'){
  const _rc=renderCode;
  renderCode=function(){
    _rc.apply(this,arguments);
    const C=$('ccChips');if(!C)return;
    const isB=(typeof ccTab!=='undefined'&&ccTab==='book');
    if(isB)C.querySelectorAll('.chip.on').forEach(c=>c.classList.remove('on'));
    C.insertAdjacentHTML('afterbegin','<div class="chip '+(isB?'on':'')+'" onclick="ccTab=\'book\';try{localStorage.setItem(\'electrix_cc\',ccTab)}catch(e){};renderCode()">📖 '+E(T('Code book'))+'</div>');
    const B=$('ccBody');if(!B)return;
    if(ccTab==='vd')vdFind(B);
    if(isB){B.innerHTML=homeHtml();drawDl();drawToc('cbToc');if(lastQ)CB.go(lastQ);
      ensureLocal().then(()=>{drawDl();countSaved().then(n=>{saveAll.done=n;saveAll.total=(meta[1]||[]).length+(meta[2]||[]).length;drawDl();if(LS.get('saveall',false)&&n<saveAll.total&&!saveAll.busy)CB.saveAll();});}).catch(()=>drawDl());}
    else if(ccTab==='load'&&!$('cbLoadLink')){B.insertAdjacentHTML('beforeend','<button id="cbLoadLink" class="cbcard" style="margin-top:12px" onclick="CB.sec(\'220.82\')"><div class="cbmeta"><span class="cbsec">220.82</span></div><b>📖 '+E(T('Read about this in the code book'))+'</b></button>');}
  };
}
})();
