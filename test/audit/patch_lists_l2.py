"""L2 — shared lists (Baruch 2026-10-20 18:52): any note → punch list (original kept, linked both ways), material lists
stay editable after sending, per-item keys (li_<id>) so edits merge, conflicts kept side by side, history, two-way
notifications (server: db/audit_l2_lists.sql). One list screen (m-list) for both.
usage: python3 patch_lists_l2.py path/to/index.html path/to/sync.js"""
import sys
p, ps = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
def rep(a, b):
    global s
    c = s.count(a); assert c == 1, (c, a[:90]); s = s.replace(a, b)

# ---------- 1. the list screen + CSS ----------
rep('<div class="ov hid" id="m-mat"><div class="md"><div class="hd"></div>',
    '<div class="ov hid" id="m-list" style="z-index:246"><div class="md"><div class="hd"></div><div id="liBox"></div><button class="btn sec2" style="margin-top:12px" onclick="liClose()" data-i18n="Close">Close</button></div></div>\n'
    '<div class="ov hid" id="m-mat"><div class="md"><div class="hd"></div>')
rep('.kli{display:flex;align-items:center;gap:8px;padding:3px 0}',
    '.kli{display:flex;align-items:center;gap:8px;padding:3px 0}'
    '.lirow{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--g1)}.lirow input[type=checkbox]{width:22px;height:22px;margin-top:3px;flex-shrink:0}'
    '.lirow.d .litx{text-decoration:line-through;color:var(--g4)}.limain{flex:1;min-width:0}'
    '.litx{display:block;width:100%;border:none;background:transparent;font:inherit;font-size:15px;line-height:1.4;resize:none;white-space:pre-wrap;word-break:break-word;padding:2px 0;color:inherit;overflow:hidden}'
    '.limeta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:var(--g4);margin-top:3px}.limeta select,.limeta input{font-size:13px;padding:3px 6px;border:1px solid var(--g2);border-radius:6px;background:var(--bg,#fff);color:inherit}'
    '.liq{width:64px}.licf{background:#fff4e5;border:1px solid #f0c27a;border-radius:8px;padding:6px 8px;margin:4px 0 0 32px;font-size:13px}'
    '.lic{font-size:13px;padding:6px 0;border-bottom:1px solid var(--g1);white-space:pre-wrap}.lic b{font-weight:600}')

# ---------- 2. the shared-list code ----------
rep('function kMine(){const m=me();return (D.keep||[]).filter(n=>n.owner===m.id||(n.collab||[]).includes(m.id));}',
    r"""function kMine(){const m=me();return (D.keep||[]).filter(n=>n.owner===m.id||(n.collab||[]).includes(m.id)||(n.type==='punch'&&(n.assign||[]).includes(m.id)));}
// ───────────── L2 SHARED LISTS — punch lists (keep, type 'punch') and material lists (mats) ─────────────
// One item per key (li_<id>) so edits from different phones merge; the server keeps both versions when two phones
// change the same item at once (li_<id>~<who>~<base>), never deletes an item (gone:true), and sends the notifications.
function liKeys(r){return Object.keys(r||{}).filter(k=>/^li_/.test(k)&&k.indexOf('~')<0&&r[k]&&typeof r[k]==='object');}
function liAll(r){return liKeys(r).map(k=>Object.assign({},r[k],{k})).sort((a,b)=>((a.ord==null?1e9:+a.ord)-(b.ord==null?1e9:+b.ord))||((+a.ts||0)-(+b.ts||0)));}
function liItems(r){return liAll(r).filter(i=>!i.gone);}
function liConflicts(r){return Object.keys(r||{}).filter(k=>/^li_/.test(k)&&k.indexOf('~')>0&&r[k]&&typeof r[k]==='object'&&!r[k].gone).map(k=>Object.assign({},r[k],{k}));}
function liComments(r){return Object.keys(r||{}).filter(k=>/^lc_/.test(k)&&r[k]&&typeof r[k]==='object').map(k=>Object.assign({},r[k],{k})).sort((a,b)=>(+a.ts||0)-(+b.ts||0));}
function liHas(r){return liKeys(r).length>0;}
function liRec(coll,id){return coll==='keep'?(D.keep||[]).find(n=>n.id===id):(D.mats||[]).find(x=>x.id===id);}
function liCanEdit(coll,r,m){m=m||me();if(!r||!m)return false;if(coll==='keep')return r.owner===m.id||(r.collab||[]).includes(m.id);
  return r.from===m.id||r.to===m.id||(r.collab||[]).includes(m.id)||m.role==='owner'||m.role==='manager'||!!m.all||(m.role==='office'&&(m.title==='Material'||m.title==='Payroll'));}
// change one item: remember which version this phone started from (base) so the server can spot a clash
function liSet(r,k,ch){const it=r[k]||{};const base=('base' in it)?it.base:(+it.rev||0);r[k]=Object.assign({},it,ch,{base,rev:base+1,eby:me().id,eat:Date.now()});}
function liNew(r,f){const ords=liKeys(r).map(x=>+r[x].ord||0);const k='li_'+nid('i');r[k]=Object.assign({t:'',done:false,ord:ords.length?Math.max(...ords)+1:0,by:me().id,ts:Date.now(),rev:0},f);return k;}
function liTouch(coll,r){if(coll==='keep'){r.edited=Date.now();r.order=Date.now();}try{save();}catch(e){}}
// "25x 3-Way Switches" → qty 25 + "3-Way Switches"; anything else stays exactly as typed
function liParse(line){const m=String(line).match(/^\s*(\d+(?:\.\d+)?)\s*[xX×]\s+(\S.*)$/);return m?{q:m[1],t:m[2]}:{q:'',t:String(line)};}
function liLines(txt){return String(txt||'').split(/\r?\n/).filter(x=>x.trim());}
let liCur=null;
function openList(coll,id){const r=liRec(coll,id);if(!r){toast(t('That list is not on this phone (yet).'));return;}
  if(coll==='mats'&&!liHas(r)&&liCanEdit('mats',r)){liLines(r.items).forEach(l=>liNew(r,liParse(l)));if(liHas(r))liTouch('mats',r);}
  liCur={coll,id};show('m-list');liDraw();}
function liClose(){liCur=null;hide('m-list');try{if(document.getElementById('m-keep')&&!document.getElementById('m-keep').classList.contains('hid'))renderKeep();}catch(e){}try{renderMat();}catch(e){}}
function liOpt(sel,v,l){return '<option value="'+esc(v)+'"'+(sel===v?' selected':'')+'>'+esc(l)+'</option>';}
function liDraw(){if(!liCur)return;const {coll,id}=liCur;const r=liRec(coll,id);const box=document.getElementById('liBox');if(!r||!box){hide('m-list');return;}
  const m=me(),ed=liCanEdit(coll,r,m),its=liItems(r),open=its.filter(i=>!i.done),dn=its.filter(i=>i.done),cf=liConflicts(r);
  const A="'"+jsq(coll)+"','"+jsq(id)+"'";
  const emps=D.emps.filter(e=>!e.inactive).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const row=i=>{const mine=i.to===m.id,canTick=ed||mine,K="'"+jsq(i.k)+"'";
    return '<div class="lirow'+(i.done?' d':'')+'" data-k="'+esc(i.k)+'"><input type="checkbox" '+(i.done?'checked ':'')+(canTick?'':'disabled ')+'onchange="liTick('+A+','+K+',this.checked)" aria-label="'+t('Done')+'">'
     +'<div class="limain">'+(ed?'<textarea class="litx" rows="1" oninput="liText('+A+','+K+',this.value);liGrow(this)">'+esc(i.t||'')+'</textarea>':'<div class="litx">'+esc(i.t||'')+'</div>')
     +'<div class="limeta">'
       +(coll==='mats'?(ed?'<span>'+t('Qty')+'</span><input class="liq" inputmode="decimal" value="'+esc(i.q==null?'':String(i.q))+'" oninput="liQty('+A+','+K+',this.value)">':(i.q?'<b>'+esc(String(i.q))+'×</b>':'')):'')
       +(coll==='keep'?(ed?'<select onchange="liAssign('+A+','+K+',this.value)">'+liOpt(i.to||'','',t('Not assigned'))+emps.map(e=>liOpt(i.to||'',e.id,e.name)).join('')+'</select>':(i.to?'<span>👤 '+esc(nameOf(i.to))+'</span>':'')):'')
       +(i.done?'<span>✓ '+esc(nameOf(i.doneBy))+(i.doneAt?' · '+when(i.doneAt):'')+'</span>':'')
       +(ed?'<button class="kx2" style="margin-left:auto" onclick="liRemove('+A+','+K+')" aria-label="'+t('Remove')+'">×</button>':'')
     +'</div>'
     +cf.filter(c=>c.of===i.k).map(c=>'<div class="licf">⚠ '+esc(nameOf(c.eby))+' '+t('changed this at the same time')+': <b>'+(c.q?esc(String(c.q))+'× ':'')+esc(c.t||'')+'</b>'+(c.done?' ✓':'')
        +(ed?'<div style="margin-top:4px;display:flex;gap:6px"><button class="bs b" onclick="liUseCopy('+A+",'"+jsq(c.k)+"'"+')">'+t('Use this one')+'</button><button class="bs" onclick="liDropCopy('+A+",'"+jsq(c.k)+"'"+')">'+t('Keep the current one')+'</button></div>':'')+'</div>').join('')
     +'</div></div>';};
  let head='';
  if(coll==='keep'){head='<input class="kt" style="font-size:19px;font-weight:700;width:100%;border:none;background:transparent;margin-bottom:4px" '+(ed?'':'readonly ')+'value="'+esc(r.title||t('Punch list'))+'" oninput="(liRec('+A+')||{}).title=this.value;liTouch(\'keep\',liRec('+A+'))">'
      +'<div style="font-size:12px;color:var(--g4);margin-bottom:6px">📋 '+t('Punch list')+(r.site?' · 📍 '+esc(siteName(r.site)):'')+' · '+t('made by')+' '+esc(nameOf(r.owner))+((r.collab||[]).length?' · 👥 '+r.collab.map(x=>esc(nameOf(x).split(' ')[0])).join(', '):'')+'</div>'
      +(r.src&&(D.keep||[]).some(n=>n.id===r.src&&kMine().includes(n))?'<button class="bs" style="margin-bottom:8px" onclick="hide(\'m-list\');openKeep();kOpen(\''+jsq(r.src)+'\')">📝 '+t('Open the original note')+'</button>':'');}
  else{head='<h2 style="margin:0 0 4px">📦 '+t('Material list')+'</h2><div style="font-size:12px;color:var(--g4);margin-bottom:6px">📍 '+esc(siteName(r.site))+' · '+t('from')+' '+esc(nameOf(r.from))+' · '+t({open:'Needed',ordered:'Ordered',delivered:'Delivered'}[r.status]||'')+'</div>'
      +(ed?'<div class="limeta" style="margin-bottom:8px"><span>📨 '+t('Sent to')+'</span><select onchange="liSendTo('+A+',this.value)">'+liOpt(r.to||'','',t('Material office'))+emps.filter(e=>e.id!==r.from).map(e=>liOpt(r.to||'',e.id,e.name)).join('')+'</select></div>':(r.to?'<div class="limeta" style="margin-bottom:8px">📨 '+t('Sent to')+' '+esc(nameOf(r.to))+'</div>':''));}
  const done=dn.length,tot=its.length;
  box.innerHTML=head
   +(tot?'<div style="height:6px;background:var(--g1);border-radius:3px;overflow:hidden;margin:4px 0"><div style="width:'+Math.round(done/tot*100)+'%;height:100%;background:var(--green)"></div></div><div style="font-size:12px;color:var(--g4)">'+done+' / '+tot+' '+t('done')+'</div>':'')
   +(open.length?open.map(row).join(''):'<div class="note" style="margin:8px 0">'+(tot?'✓ '+t('Everything is done'):t('No items yet.'))+'</div>')
   +(ed?'<div style="margin-top:10px"><textarea id="liNew" rows="2" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--g2);border-radius:8px;font:inherit;white-space:pre-wrap" placeholder="'+t(coll==='mats'?'Add materials — one per line, e.g. 25x 3-Way Switches':'Add items — one per line')+'"></textarea><button class="btn" style="margin-top:6px" onclick="liAddLines('+A+')">+ '+t('Add')+'</button></div>':'')
   +(dn.length?'<div class="ksec" style="margin-top:12px">✓ '+dn.length+' '+t('completed')+'</div>'+dn.map(row).join(''):'')
   +'<div class="ksec" style="margin-top:12px">💬 '+t('Notes')+'</div>'+liComments(r).map(c=>'<div class="lic"><b>'+esc(nameOf(c.by))+'</b> · <span style="color:var(--g4)">'+when(c.ts)+'</span><br>'+esc(c.text||'')+'</div>').join('')
   +'<div style="display:flex;gap:6px;margin-top:6px"><textarea id="liCmt" rows="1" style="flex:1;padding:8px;border:1px solid var(--g2);border-radius:8px;font:inherit" placeholder="'+t('Add a note…')+'"></textarea><button class="bs b" onclick="liComment('+A+')">'+t('Send')+'</button></div>'
   +'<button class="bs" style="margin-top:10px" onclick="liHistory('+A+')">🕘 '+t('History')+'</button><div id="liHist"></div>';
  box.querySelectorAll('textarea.litx').forEach(liGrow);}
function liGrow(el){try{el.style.height='auto';el.style.height=el.scrollHeight+'px';}catch(e){}}
function liText(coll,id,k,v){const r=liRec(coll,id);if(!r||!r[k])return;liSet(r,k,{t:v});liTouch(coll,r);}
function liQty(coll,id,k,v){const r=liRec(coll,id);if(!r||!r[k])return;liSet(r,k,{q:String(v).trim()});liTouch(coll,r);}
function liAssign(coll,id,k,v){const r=liRec(coll,id);if(!r||!r[k])return;liSet(r,k,{to:v||''});liTouch(coll,r);liDraw();}
function liTick(coll,id,k,v){const r=liRec(coll,id);if(!r||!r[k])return;liSet(r,k,v?{done:true,doneBy:me().id,doneAt:Date.now()}:{done:false,doneBy:null,doneAt:null});if(v){try{buzz(15);tone('ok');}catch(e){}}liTouch(coll,r);liDraw();}
function liRemove(coll,id,k){const r=liRec(coll,id);if(!r||!r[k])return;liSet(r,k,{gone:true});liTouch(coll,r);liDraw();kUndo(t('Item removed'),()=>{const q=liRec(coll,id);if(q&&q[k]){liSet(q,k,{gone:false});liTouch(coll,q);liDraw();}});}
function liAddLines(coll,id){const r=liRec(coll,id);const ta=document.getElementById('liNew');if(!r||!ta)return;const L=liLines(ta.value);if(!L.length){toast(t('Type an item first'));return;}
  L.forEach(l=>liNew(r,coll==='mats'?liParse(l):{t:l}));ta.value='';liTouch(coll,r);liDraw();}
function liComment(coll,id){const r=liRec(coll,id);const ta=document.getElementById('liCmt');if(!r||!ta||!ta.value.trim())return;r['lc_'+nid('c')]={by:me().id,ts:Date.now(),text:ta.value};ta.value='';liTouch(coll,r);liDraw();}
function liSendTo(coll,id,v){const r=liRec(coll,id);if(!r)return;r.to=v||'';liTouch(coll,r);liDraw();toast('📨 '+t('Sent to')+' '+(v?nameOf(v):t('Material office')),'green');}
function liUseCopy(coll,id,ck){const r=liRec(coll,id);const c=r&&r[ck];if(!c||!r[c.of])return;const keep={};['t','q','to','done','doneBy','doneAt'].forEach(f=>{if(f in c)keep[f]=c[f];});liSet(r,c.of,keep);r[ck]=Object.assign({},c,{gone:true});liTouch(coll,r);liDraw();}
function liDropCopy(coll,id,ck){const r=liRec(coll,id);if(!r||!r[ck])return;r[ck]=Object.assign({},r[ck],{gone:true});liTouch(coll,r);liDraw();}
async function liHistory(coll,id){const el=document.getElementById('liHist');if(!el)return;if(!window.EX_sb){el.innerHTML='<div class="note">'+t('History needs a connection.')+'</div>';return;}
  el.innerHTML='<div class="note">⏳ '+t('Loading…')+'</div>';let rows=[];
  try{const r=await window.EX_sb.rpc('list_history',{p_coll:coll,p_id:id});if(r.error)throw r.error;rows=r.data||[];}catch(e){el.innerHTML='<div class="note">'+t('Could not load the history (no connection?).')+'</div>';return;}
  const lab=i=>(i&&i.q?i.q+'× ':'')+((i&&i.t)||'');const out=[];
  rows.forEach(h=>{const o=h.old_data||{},n=h.new_data||{};const ch=[];
    Object.keys(n).filter(k=>/^l[ic]_/.test(k)).forEach(k=>{const a=o[k],b=n[k];if(JSON.stringify(a)===JSON.stringify(b)||!b)return;
      if(/^lc_/.test(k)){ch.push('💬 '+(b.text||''));return;}if(k.indexOf('~')>0){ch.push('⚠ '+lab(b));return;}
      if(!a){ch.push('+ '+lab(b));return;}if(b.gone&&!a.gone){ch.push('− '+lab(a));return;}if(b.done&&!a.done){ch.push('✓ '+lab(b));return;}if(!b.done&&a.done){ch.push('↺ '+lab(b));return;}
      if((a.q||'')!==(b.q||''))ch.push(lab(a)+' → '+lab(b));else if((a.t||'')!==(b.t||''))ch.push('✎ '+(a.t||'')+' → '+(b.t||''));else if((a.to||'')!==(b.to||''))ch.push('👤 '+lab(b)+' → '+(b.to?nameOf(b.to):'—'));});
    if(!h.old_data)ch.unshift(t('created'));if(ch.length)out.push('<div class="lic"><span style="color:var(--g4)">'+new Date(h.at).toLocaleString(LOC(),{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'</span> · <b>'+esc(nameOf(h.by_who))+'</b><br>'+ch.map(esc).join('<br>')+'</div>');});
  el.innerHTML=out.length?out.join(''):'<div class="note">'+t('No changes yet.')+'</div>';}
// a note → a punch list: the note stays as it is; every non-blank line becomes one item, exactly as typed
function kToPunch(){const n=kGet();if(!n)return;const ex=n.punch&&(D.keep||[]).find(x=>x.id===n.punch&&!x.trashed);if(ex){hide('m-knote');openList('keep',ex.id);return;}
  const lines=n.type==='list'?(n.items||[]).map(i=>i.t||'').filter(x=>x.trim()):liLines(n.body);if(!lines.length){toast(t('Type the items first — one per line.'));return;}
  const p={id:nid('kn'),owner:me().id,type:'punch',title:n.title||t('Punch list'),src:n.id,site:n.site||null,collab:(n.collab||[]).slice(),labels:[],color:n.color||'0',body:'',items:[],created:Date.now(),edited:Date.now(),order:Date.now()};
  lines.forEach((l,i)=>{p['li_'+nid('i')]={t:l,done:false,ord:i,by:me().id,ts:Date.now(),rev:0};});
  D.keep.push(p);n.punch=p.id;kTouch();hide('m-knote');openList('keep',p.id);toast('📋 '+t('Punch list made — the note is kept as it was'),'green');}""")

# keep editor: open punch lists in the list screen; button on notes
rep("function kOpen(id,focus){kCur=id;const n=kGet();if(!n)return;",
    "function kOpen(id,focus){const pn=(D.keep||[]).find(x=>x.id===id);if(pn&&pn.type==='punch'){openList('keep',id);return;}kCur=id;const n=kGet();if(!n)return;")
rep("""  const ta=ed.querySelector('textarea.kx');if(ta){ta.style.height='auto';ta.style.height=Math.max(200,ta.scrollHeight)+'px';}""",
    """  if(n.owner===me().id||(n.collab||[]).includes(me().id))ed.insertAdjacentHTML('beforeend','<button class="btn sec2" id="kPunchBtn" style="margin-top:14px" onclick="kToPunch()">📋 '+(n.punch&&(D.keep||[]).some(x=>x.id===n.punch&&!x.trashed)?t('Open the punch list'):t('Convert to Punch List'))+'</button>');
  const ta=ed.querySelector('textarea.kx');if(ta){ta.style.height='auto';ta.style.height=Math.max(200,ta.scrollHeight)+'px';}""")
# note cards for punch lists
rep("""function kCard(n){const ex=(n.items||[]);const open=ex.filter(i=>!i.done),dn=ex.filter(i=>i.done);""",
    """function kCard(n){if(n.type==='punch'){const L=liItems(n),od=L.filter(i=>!i.done);return '<div class="knote" data-c="'+jsq(n.color||'0')+'" style="background:var(--k'+jsq(n.color||'0')+')" onclick="kOpen(\\''+jsq(n.id)+'\\')"><h4>📋 '+esc(n.title||t('Punch list'))+'</h4>'+od.slice(0,6).map(i=>'<div class="ki"><i></i><span style="white-space:pre-wrap">'+esc(i.t)+(i.to?' · 👤 '+esc(nameOf(i.to).split(' ')[0]):'')+'</span></div>').join('')+(od.length>6?'<div class="kmore">+'+(od.length-6)+' '+t('more')+'</div>':'')+'<div class="kmore">'+(L.length-od.length)+' / '+L.length+' '+t('done')+'</div></div>';}
  const ex=(n.items||[]);const open=ex.filter(i=>!i.done),dn=ex.filter(i=>i.done);""")

# ---------- 3. materials ----------
rep("""  let list=handler?D.mats:D.mats.filter(x=>x.from===m.id||(m.crew&&D.emps.find(e=>e.id===x.from&&e.crew===m.crew)));""",
    """  let list=handler?D.mats:D.mats.filter(x=>x.from===m.id||x.to===m.id||(x.collab||[]).includes(m.id)||(m.crew&&D.emps.find(e=>e.id===x.from&&e.crew===m.crew)));""")
rep("""'</div></div><span class="badge '+bc+'">'+bl+'</span></div><div class="desc">'+fmtText(x.items)+'</div>'""",
    """'</div></div><span class="badge '+bc+'">'+bl+'</span></div><div class="desc">'+(liHas(x)?liItems(x).map(i=>'<div style="white-space:pre-wrap'+(i.done?';text-decoration:line-through;color:var(--g4)':'')+'">'+(i.q?'<b>'+esc(String(i.q))+'×</b> ':'')+esc(i.t||'')+'</div>').join(''):fmtText(x.items))+'</div>'+(x.to?'<div class="site">📨 '+t('Sent to')+' '+esc(nameOf(x.to))+'</div>':'')+'<div class="acts"><button class="bs b" onclick="openList(\\'mats\\',\\''+jsq(x.id)+'\\')">📝 '+t(liCanEdit('mats',x,m)?'Open / edit list':'Open list')+'</button></div>'""")
rep("""  const mid=nid('m');D.mats.unshift({id:mid,from:me().id,""", """  const mid=nid('m');const _mr={id:mid,from:me().id,""")
rep("""items,when:document.getElementById('mtWhen').value,status:'open',ts:Date.now(),photos:mtPhotos.slice(),src:mtFrom});""",
    """items,when:document.getElementById('mtWhen').value,status:'open',ts:Date.now(),photos:mtPhotos.slice(),src:mtFrom};liLines(items).forEach(l=>liNew(_mr,liParse(l)));D.mats.unshift(_mr);""")

# ---------- 4. notification tap opens the list ----------
rep("""  if(l.job){const j=D.jobs.find(q=>q.id===l.job);""",
    """  if(l.keep){if((D.keep||[]).some(n=>n.id===l.keep)){openList('keep',l.keep);return;}}
  if(l.mat){if((D.mats||[]).some(x=>x.id===l.mat)){if(allowed('mat'))goTab('mat');openList('mats',l.mat);return;}}
  if(l.job){const j=D.jobs.find(q=>q.id===l.job);""")

# ---------- 5. Spanish ----------
rep('''Object.assign(ES,{"material run":"vuelta por material",''',
    '''Object.assign(ES,{"Convert to Punch List":"Convertir en lista de pendientes","Open the punch list":"Abrir la lista de pendientes","Open the original note":"Abrir la nota original","Punch list made — the note is kept as it was":"Lista de pendientes hecha — la nota se queda igual","Type the items first — one per line.":"Escribe los puntos primero — uno por línea.","made by":"hecha por","Not assigned":"Sin asignar","Qty":"Cant.","Done":"Hecho","Remove":"Quitar","changed this at the same time":"cambió esto al mismo tiempo","Use this one":"Usar esta","Keep the current one":"Dejar la actual","Material list":"Lista de material","Sent to":"Enviado a","Material office":"Oficina de material","Everything is done":"Todo está hecho","No items yet.":"Todavía no hay nada.","Add materials — one per line, e.g. 25x 3-Way Switches":"Agrega material — uno por línea, ej. 25x Interruptores de 3 vías","Add items — one per line":"Agrega puntos — uno por línea","completed":"completados","Add a note…":"Agrega una nota…","Send":"Enviar","History":"Historial","History needs a connection.":"El historial necesita conexión.","Could not load the history (no connection?).":"No se pudo cargar el historial (¿sin conexión?).","created":"creada","No changes yet.":"Sin cambios todavía.","Item removed":"Punto quitado","Type an item first":"Escribe un punto primero","That list is not on this phone (yet).":"Esa lista no está en este teléfono (todavía).","Open / edit list":"Abrir / editar lista","Open list":"Abrir lista","Close":"Cerrar","material run":"vuelta por material",''')
open(p, 'w', encoding='utf-8').write(s)

# ---------- 6. sync: list items are merged by the server — a server-adjusted item is not a refusal ----------
y = open(ps, encoding='utf-8').read()
a = "const SERVER_OWNED={travel:['pay','minutes','auto','status'],punches:['srvIn','hist','lateEntry']};"
assert y.count(a) == 1
y = y.replace(a, a + "\n// L2 lists: the server stamps each item (rev, who, when) and, when two phones changed the same item at once, keeps the\n// newer one in place and this phone's version next to it (li_<id>~…) — neither is a refusal.\nconst LIST_SET=['rev','base','eby','eat','by','ts'];function listSame(a,b){if(!a||!b||typeof a!=='object'||typeof b!=='object')return canon(a)===canon(b);const x=Object.assign({},a),z=Object.assign({},b);LIST_SET.forEach(f=>{delete x[f];delete z[f];});return canon(x)===canon(z);}")
b = "    if(sentObj){let bad=false;for(const f in sentObj){if(own.indexOf(f)>=0)continue;if(canon(d[f])!==canon(sentObj[f])){bad=true;break;}}"
assert y.count(b) == 1
y = y.replace(b, "    if(sentObj){let bad=false;for(const f in sentObj){if(own.indexOf(f)>=0)continue;if((row.coll==='keep'||row.coll==='mats')&&f==='assign')continue;\n      if((row.coll==='keep'||row.coll==='mats')&&/^l[ic]_/.test(f)){if(listSame(d[f],sentObj[f])||Object.keys(d).some(k=>k.indexOf(f+'~')===0))continue;bad=true;break;}\n      if(canon(d[f])!==canon(sentObj[f])){bad=true;break;}}")
open(ps, 'w', encoding='utf-8').write(y)
print('L2 applied')
