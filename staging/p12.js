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
'Only the team can open the code book. Sign in first.':'Solo el equipo puede abrir el libro. Inicia sesión primero.','Recent searches':'Búsquedas recientes','Read the whole book':'Leer el libro completo','Stop':'Parar','Pause':'Pausa','Continue':'Seguir','Slow':'Lento','Normal speed':'Velocidad normal','This page has no words to read.':'Esta página no tiene palabras para leer.','This phone cannot read aloud.':'Este teléfono no puede leer en voz alta.','section':'sección','sections':'secciones','pages':'páginas','Other pages (index, review questions)':'Otras páginas (índice, preguntas de repaso)','e.g. code for kitchens, bonding by pool, 210.8':'ej. código para cocinas, bonding de piscina, 210.8','Zoom':'Zoom'};
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
#cbR .cbsayc button{border:0;border-radius:10px;padding:9px 14px;font-size:15px;font-weight:600;background:rgba(255,255,255,.2);color:#fff}
#cbR .cbpg i.rd{background:rgba(60,140,255,.35);mix-blend-mode:multiply}
#cbR button.ib.on{background:#1f5fbf;color:#fff}
#cbTocS{position:fixed;inset:0;z-index:2001;background:rgba(0,0,0,.35);display:flex;align-items:flex-end}
#cbTocS.hid{display:none}
#cbTocS>div{background:var(--g1);width:100%;max-height:82vh;overflow:auto;border-radius:16px 16px 0 0;padding:14px 12px calc(env(safe-area-inset-bottom,0px) + 14px)}
`;document.head.appendChild(css);

/* ---------- data ---------- */
const meta={1:null,2:null};        // per volume: [{idx,label,head}]
let toc=null;                       // {1:[...],2:[...]}
async function loadMeta(vol){
  if(meta[vol])return meta[vol];
  const c=client();if(!c)throw new Error('nosb');
  const rows=[];
  for(let from=0;;from+=1000){
    const {data,error}=await c.from('codebook_pages').select('idx,label,head').eq('vol',vol).order('idx').range(from,from+999);
    if(error)throw error;rows.push(...data);if(data.length<1000)break;
  }
  meta[vol]=rows;return rows;
}
async function loadToc(){
  if(toc)return toc;
  const {data,error}=await client().from('codebook_toc').select('vol,ord,title,idx').order('vol').order('ord').limit(5000);
  if(error)throw error;toc={1:[],2:[]};data.forEach(r=>{r.title=String(r.title||'').replace(/[\x00-\x1f]/g,' ').replace(/\s*([—–])\s*/g,'$1').replace(/\s+/g,' ').trim();(toc[r.vol]||(toc[r.vol]=[])).push(r);});return toc;
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
  const {data}=await client().from('codebook_pages').select('boxes,body').eq('vol',vol).eq('idx',idx).maybeSingle();
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
    const {data,error}=await client().storage.from('codebook').download('v'+vol+'/'+idx+'.webp');
    if(error||!data)throw error||new Error('no image');
    blob=data;
    try{const ca=await caches.open('ex-codebook');await ca.put(key,new Response(blob,{headers:{'content-type':'image/webp'}}));trimCache(ca);}catch(e){}
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
async function search(q){
  const c=client();if(!c)throw new Error('nosb');
  const {data,error}=await c.rpc('codebook_search',{q,lim:150});
  if(error)throw error;return data||[];
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
  }catch(e){el.innerHTML='<div style="color:var(--g4);padding:10px">'+E(T(String(e&&e.message)==='nosb'?'Only the team can open the code book. Sign in first.':'Could not load this page. Check your connection.'))+'</div>';}
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
  }catch(e){R.innerHTML='<div class="cbcard" style="cursor:default;color:var(--g4)">'+E(T(String(e&&e.message)==='nosb'?'Only the team can open the code book. Sign in first.':'Could not load this page. Check your connection.'))+'</div>';}
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
    '<div class="cbsay" id="cbSayBar"><div id="cbSayTx"></div><div class="cbsayc"><button id="cbSayP" onclick="CB.sayPause()"></button><button id="cbSaySp" onclick="CB.saySpeed()"></button><button onclick="CB.sayStop()">■ '+E(T('Stop'))+'</button></div></div>'+
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
const say={on:false,paused:false,rate:LS.get('rate',0.9),chunks:[],at:0,seq:0};
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
  $('cbSaySp').textContent=say.rate<0.85?T('Slow'):T('Normal speed');
}
function pickVoice(){const V=SYNTH().getVoices()||[];return V.find(v=>/^en[-_]US/i.test(v.lang)&&/samantha|google us|aria|jenny|natural/i.test(v.name))||V.find(v=>/^en[-_]US/i.test(v.lang))||V.find(v=>/^en/i.test(v.lang))||null;}
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
    const u=new SpeechSynthesisUtterance(speakable(raw));u.lang='en-US';if(voice)u.voice=voice;u.rate=say.rate;
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
CB.saySpeed=()=>{say.rate=say.rate<0.85?1:0.75;LS.set('rate',say.rate);sayUI();if(say.on&&!say.paused)sayPage(say.at);};
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
    if(isB){B.innerHTML=homeHtml();drawToc('cbToc');if(lastQ)CB.go(lastQ);}
    else if(ccTab==='load'&&!$('cbLoadLink')){B.insertAdjacentHTML('beforeend','<button id="cbLoadLink" class="cbcard" style="margin-top:12px" onclick="CB.sec(\'220.82\')"><div class="cbmeta"><span class="cbsec">220.82</span></div><b>📖 '+E(T('Read about this in the code book'))+'</b></button>');}
  };
}
})();
