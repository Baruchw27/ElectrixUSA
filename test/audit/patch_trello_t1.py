"""T1 — personal Trello on the Tasks page ("📋 My Trello"). Applies to staging/index.html (idempotent)."""
import sys, os
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'staging', 'index.html')
s = open(P, encoding='utf-8').read()
if 'function renderPT(' in s:
    print('already patched'); sys.exit(0)

a = """onclick="jobView='done';doneDays=7;renderJobs()">✓ <span data-i18n="Done">Done</span></button>"""
assert s.count(a) == 1, 'chip anchor'
s = s.replace(a, a + """<button class="chip" id="vTrello" style="flex:1;border:none;text-align:center;display:none" onclick="jobView='trello';renderJobs()">📋 <span data-i18n="My Trello">My Trello</span></button>""")

b = """document.getElementById('vOpen').className='chip'+(jobView==='open'?' on':'');document.getElementById('vDone').className='chip'+(jobView==='done'?' on':'');"""
assert s.count(b) == 1, 'view anchor'
s = s.replace(b, b + """{const vt=document.getElementById('vTrello');const okT=ptAvail();if(vt){vt.style.display=okT?'':'none';vt.className='chip'+(jobView==='trello'?' on':'');}if(jobView==='trello'){if(okT){renderPT();return;}jobView='open';document.getElementById('vOpen').className='chip on';}}""")

js = r"""
<script>
// T1 personal Trello: a person's own Trello boards (all of them) on their own Tasks page. Only they see it (and the owner,
// who can switch to it). Ticking off / editing / adding here goes back to their Trello within seconds (server sync).
let ptWho=null,ptShowDone=false,ptEdit=null,ptAdding=false,ptSyncT=null;
function ptAvail(){const m=me();return !!m&&(D.ptask||[]).some(x=>x&&x.meta&&(x.owner===m.id||m.role==='owner'));}
function ptOwners(){const m=me();return [...new Set((D.ptask||[]).filter(x=>x&&x.meta&&(x.owner===m.id||m.role==='owner')).map(x=>x.owner))];}
function ptGet(id){return (D.ptask||[]).find(x=>x&&x.id===id);}
function ptRow(x){const id=jsq(x.id);const url=/^https:\/\/trello\.com\//.test(x.url||'')?safeHref(x.url):'';
  const ed=ptEdit===x.id;
  return '<div class="card ptrow" data-id="'+esc(x.id)+'" style="padding:10px 12px;display:flex;gap:12px;align-items:flex-start;margin-bottom:8px">'
   +'<input type="checkbox" class="ptchk" '+(x.done?'checked':'')+' onchange="ptDone(\''+id+'\',this.checked)" aria-label="'+t('Done')+'" style="width:28px;height:28px;flex:0 0 28px;margin-top:2px;box-shadow:none">'
   +'<div style="flex:1;min-width:0">'
   +(ed?'<input id="ptEt" value="'+esc(x.t||'')+'" style="margin-bottom:6px"><textarea id="ptEd" rows="4" placeholder="'+t('Notes')+'" style="white-space:pre-wrap">'+esc(x.desc||'')+'</textarea><div style="display:flex;gap:6px;margin-top:6px"><button class="btn" style="padding:10px" onclick="ptSave(\''+id+'\')">'+t('Save')+'</button><button class="btn sec2" style="padding:10px" onclick="ptEdit=null;renderJobs()">'+t('Cancel')+'</button></div>'
      :'<div class="ptt" style="font-weight:600;white-space:pre-wrap;word-break:break-word'+(x.done?';text-decoration:line-through;color:var(--g4)':'')+'">'+esc(x.t||'')+'</div>'
       +(x.desc?'<div class="ptd" style="font-size:13px;color:var(--g5);white-space:pre-wrap;word-break:break-word;margin-top:4px">'+esc(x.desc)+'</div>':'')
       +'<div style="font-size:12px;color:var(--g4);margin-top:4px">'+[esc(x.listName||''),x.due?'📅 '+new Date(x.due).toLocaleDateString(LOC(),{month:'short',day:'numeric'}):'',x.push?'⏳ '+t('sending to Trello…'):'',x.pushErr?'<span style="color:#c0392b">⚠ '+t('Trello did not take this change yet — it will try again')+'</span>':''].filter(Boolean).join(' · ')+'</div>')
   +'</div><div style="display:flex;flex-direction:column;gap:4px">'+(ed?'':'<button class="bs" onclick="ptEdit=\''+id+'\';renderJobs()" aria-label="'+t('Edit')+'">✎</button>')+(url?'<a class="bs" href="'+url+'" target="_blank" rel="noopener" aria-label="Trello">↗</a>':'')+'</div></div>';}
function renderPT(){const m=me();const own=ptOwners();if(!ptWho||!own.includes(ptWho))ptWho=own.includes(m.id)?m.id:own[0];
  document.getElementById('jobChips').innerHTML=own.length>1||ptWho!==m.id?own.map(o=>'<div class="chip '+(o===ptWho?'on':'')+'" onclick="ptWho=\''+jsq(o)+'\';ptEdit=null;ptAdding=false;renderJobs()">'+esc(o===m.id?t('Mine'):nameOf(o).split(' ')[0])+'</div>').join(''):'';
  ['moreDone','addJobBtn'].forEach(k=>{const e=document.getElementById(k);if(e)e.style.display='none';});const at=document.getElementById('addJobTop');if(at)at.style.display='none';
  const meta=ptGet('ptmeta_'+ptWho)||{boards:[]};const boards=meta.boards||[];
  const all=(D.ptask||[]).filter(x=>x&&!x.meta&&x.owner===ptWho&&!x.gone);const open=all.filter(x=>!x.done),done=all.filter(x=>x.done);
  const mine=ptWho===m.id;
  let h='<div class="note" style="margin-bottom:8px">📋 '+(mine?t('Your own Trello — only you see this.'):esc(nameOf(ptWho))+': '+t('their own Trello — only they and the owner see this.'))+' '+t('Last synced')+' '+(meta.syncedAt?when(meta.syncedAt):'—')+(mine?' <button class="bs" id="ptSyncBtn" onclick="ptSync(true)">↻ '+t('Sync now')+'</button>':'')+'</div>';
  if(mine&&boards.some(b=>(b.lists||[]).length)){h+='<button class="btn" id="ptAddBtn" style="margin-bottom:8px" onclick="ptAdding=!ptAdding;renderJobs()">+ '+t('Add to my Trello')+'</button>';
    if(ptAdding)h+='<div class="card" style="padding:10px 12px;margin-bottom:10px"><select id="ptList" style="margin-bottom:6px">'+boards.map(b=>'<optgroup label="'+esc(b.name)+'">'+(b.lists||[]).map(l=>'<option value="'+esc(b.id+'|'+l.id)+'">'+esc(l.name)+'</option>').join('')+'</optgroup>').join('')+'</select><input id="ptNewT" placeholder="'+t('Task')+'" style="margin-bottom:6px"><textarea id="ptNewD" rows="3" placeholder="'+t('Notes (optional)')+'"></textarea><button class="btn" style="margin-top:6px" onclick="ptAdd()">'+t('Add')+'</button></div>';}
  const order=boards.map(b=>b.id);const byB={};open.forEach(x=>{(byB[x.board]=byB[x.board]||[]).push(x);});
  const bids=[...order.filter(b=>byB[b]),...Object.keys(byB).filter(b=>!order.includes(b))];
  if(!open.length)h+='<div class="empty">'+t('Nothing open on your Trello.')+'</div>';
  bids.forEach(b=>{const bn=(boards.find(x=>x.id===b)||{}).name||(byB[b][0]||{}).boardName||'Trello';const lo=((boards.find(x=>x.id===b)||{}).lists||[]).map(l=>l.id);
    const items=byB[b].slice().sort((p,q)=>(lo.indexOf(p.list)-lo.indexOf(q.list))||String(p.t).localeCompare(String(q.t)));
    h+='<div class="ksec" style="margin:12px 0 6px;font-weight:700">'+esc(bn)+' <span style="color:var(--g4);font-weight:500">('+items.length+')</span></div>'+items.map(ptRow).join('');});
  if(done.length)h+='<button class="btn sec2" id="ptDoneBtn" style="margin:8px 0" onclick="ptShowDone=!ptShowDone;renderJobs()">✓ '+done.length+' '+t('done')+(ptShowDone?' ▲':' ▼')+'</button>'+(ptShowDone?done.map(ptRow).join(''):'');
  document.getElementById('jobList').innerHTML=h;}
function ptSyncSoon(){clearTimeout(ptSyncT);ptSyncT=setTimeout(()=>ptSync(false),2500);}
async function ptSync(loud){try{if(window.EX_saveNow)await window.EX_saveNow();}catch(e){}
  if(!window.EX_sb||!window.EX_sb.functions){if(loud)toast(t('Saved on the phone — it goes to Trello when you are online'));return;}
  try{const r=await window.EX_sb.functions.invoke('trello-personal',{body:{}});const s=r&&r.data&&r.data.synced&&r.data.synced[0];
    if(loud)toast(s&&!s.error?'✓ '+t('Trello is up to date'):'⚠ '+t('Could not reach Trello — it will try again in a few minutes'),s&&!s.error?'green':undefined);
    if(window.EX_catchUp)window.EX_catchUp();}catch(e){if(loud)toast(t('Could not reach Trello — it will try again in a few minutes'));}}
function ptDone(id,v){const x=ptGet(id);if(!x)return;x.done=!!v;x.push=true;if(v){try{buzz(15);}catch(e){}}save();renderJobs();ptSyncSoon();}
function ptSave(id){const x=ptGet(id);if(!x)return;const tt=(document.getElementById('ptEt').value||'').trim();if(!tt){toast(t('Type the task'));return;}x.t=tt;x.desc=document.getElementById('ptEd').value;x.push=true;ptEdit=null;save();renderJobs();ptSyncSoon();}
function ptAdd(){const m=me();const v=(document.getElementById('ptList').value||'').split('|');const tt=(document.getElementById('ptNewT').value||'').trim();if(!tt){toast(t('Type the task'));return;}
  const meta=ptGet('ptmeta_'+m.id)||{boards:[]};const b=(meta.boards||[]).find(x=>x.id===v[0])||{};const l=(b.lists||[]).find(x=>x.id===v[1])||{};
  D.ptask=D.ptask||[];D.ptask.push({id:nid('pt'),owner:m.id,t:tt,desc:document.getElementById('ptNewD').value||'',board:v[0],boardName:b.name||'',list:v[1],listName:l.name||'',done:false,push:true});
  ptAdding=false;save();renderJobs();toast('✓ '+t('Added — going to your Trello'),'green');ptSyncSoon();}
try{Object.assign(ES,{"My Trello":"Mi Trello","Your own Trello — only you see this.":"Tu propio Trello — solo tú lo ves.","their own Trello — only they and the owner see this.":"su propio Trello — solo esa persona y el dueño lo ven.","Last synced":"Última sincronización","Sync now":"Sincronizar","Add to my Trello":"Agregar a mi Trello","Notes (optional)":"Notas (opcional)","Nothing open on your Trello.":"Nada pendiente en tu Trello.","sending to Trello…":"enviando a Trello…","Trello did not take this change yet — it will try again":"Trello aún no aceptó este cambio — lo intentará de nuevo","Trello is up to date":"Trello está al día","Could not reach Trello — it will try again in a few minutes":"No se pudo conectar con Trello — lo intentará en unos minutos","Added — going to your Trello":"Agregado — va a tu Trello","Saved on the phone — it goes to Trello when you are online":"Guardado en el teléfono — irá a Trello cuando tengas conexión","Type the task":"Escribe la tarea","Mine":"Mías"});}catch(e){}
</script>
"""
c = '</body>'
assert s.count(c) == 1, 'body anchor'
s = s.replace(c, js + c)
open(P, 'w', encoding='utf-8').write(s)
print('patched')
