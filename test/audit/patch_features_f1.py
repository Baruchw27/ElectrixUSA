"""Features F1 (app side) — goes with db/audit_f1_features.sql.
 1. Universal search: the 🔍 box finds people, job sites, tasks (open AND done, incl. their chat), notes, direct
    messages, notifications, schedule notes, punch-list items, material, garage stock, tools, service calls and
    meetings — any word order, with or without accents; each person only finds what they may already see.
 2. "Paid monthly — no clock-in" (Owner / Payroll only): never reminded to clock in, not counted as "not in",
    the Clock screen tells them they don't need to punch, shown separately in Hours.
 3. Exact note formatting: notes, task text, chat, schedule notes, service-call notes, material lists and meeting
    notes show exactly as typed (line breaks, blank lines, indents, bullets) — no automatic numbering or trimming.
    The new-job note and service-call note boxes take several lines.
 4. Automatic assignment notifications: with the live server the SERVER now sends them (in each person's language,
    also when the change was saved offline) — the phone no longer sends its own copy, so nobody gets two.
 5. Blank by default: "New task" and "New job" open with nothing pre-picked (no person, no job site, no due time,
    no manager, no phase); a new job must have Rough / Finishing chosen."""
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (a[:140], s.count(a)); s = s.replace(a, b)

# ---------- shared: CSS + translations ----------
i = s.index('</style>'); s = s[:i] + '.fmt{white-space:pre-wrap;overflow-wrap:anywhere}\n' + s[i:]
rep("function t(s){return lang()==='es'&&ES[s]?ES[s]:s",
    "Object.assign(ES,{'Paid monthly — no clock-in':'Pago mensual — sin marcar','Paid monthly':'Pago mensual',"
    "'No punch needed, never reminded. Only the owner or Payroll can change this.':'No necesita marcar, nunca se le recuerda. Solo el dueño o nómina pueden cambiarlo.',"
    "\"You're paid monthly\":'Usted cobra mensual','No need to clock in or out. Payroll set this up for you.':'No necesita marcar entrada ni salida. Nómina lo configuró así.',"
    "'People':'Personas','Job sites':'Trabajos','Notes':'Notas','Messages':'Mensajes','Notifications':'Notificaciones','Schedule':'Horario',"
    "'Punch list':'Lista de pendientes','Material':'Material','Garage':'Garaje','Tools':'Herramientas','Service calls':'Llamadas de servicio','Meetings':'Reuniones','Tasks':'Tareas',"
    "'Search everything — people, jobs, tasks, notes, messages, stock…':'Buscar todo — personas, trabajos, tareas, notas, mensajes, material…',"
    "'Searches people, job sites, tasks (also finished ones), notes, messages, schedule notes, punch lists, material, stock, tools and meetings.':'Busca personas, trabajos, tareas (también terminadas), notas, mensajes, notas del horario, listas de pendientes, material, inventario, herramientas y reuniones.',"
    "'— When? (optional) —':'— ¿Cuándo? (opcional) —','— Pick one —':'— Elija uno —','Pick Rough or Finishing':'Elija Rough o Terminación','Done':'Terminado'});\n"
    "function t(s){return lang()==='es'&&ES[s]?ES[s]:s")

# ---------- 3. exact note formatting ----------
rep("""function noteLines(n){const ls=String(n||'').split(/\\n/).map(x=>x.trim()).filter(Boolean);if(ls.length<=1)return esc(ls[0]||'');return '<div style="margin-top:2px">'+ls.map((x,i)=>'<div style="font-size:13px;color:var(--g5)"><span style="color:var(--g4)">'+(i+1)+'.</span> '+esc(x)+'</div>').join('')+'</div>';}""",
    """// notes are shown exactly as typed: line breaks, blank lines, indents and bullets kept; nothing renumbered or trimmed inside
function fmtClean(v){return String(v==null?'':v).replace(/\\r\\n?/g,'\\n').replace(/^\\n+/,'').replace(/\\s+$/,'');}
function fmtText(v){return '<span class="fmt">'+esc(fmtClean(v))+'</span>';}
function noteLines(n){const v=fmtClean(n);if(!v)return '';return v.includes('\\n')?'<div class="fmt" style="display:block;margin-top:2px;font-size:13px;color:var(--g5)">'+esc(v)+'</div>':fmtText(v);}""")
rep('<div class="desc">${esc(jobText(j))}', '<div class="desc">${fmtText(jobText(j))}')
rep("""body='<div class="ctask">'+(j.pri&&j.status!=='done'?'🔴 ':'')+esc(msg.text)+(msg.orig?'<div class="corig">'+esc(msg.orig)+'</div>':'')+'</div>';""",
    """body='<div class="ctask">'+(j.pri&&j.status!=='done'?'🔴 ':'')+fmtText(msg.text)+(msg.orig?'<div class="corig">'+fmtText(msg.orig)+'</div>':'')+'</div>';""")
rep("""body='<div class="ctext">'+esc(msg.text||'').replace(/\\n/g,'<br>')+'</div>';""", """body='<div class="ctext">'+fmtText(msg.text||'')+'</div>';""")
rep("if(x.kind==='text')inner=esc(x.text).replace(/\\n/g,'<br>');", "if(x.kind==='text')inner=fmtText(x.text);")
rep("""'<div style="padding:8px 0;border-bottom:1px solid var(--g1)"><div style="font-size:14px">'+esc(n.text)+'</div>'""",
    """'<div style="padding:8px 0;border-bottom:1px solid var(--g1)"><div style="font-size:14px">'+fmtText(n.text)+'</div>'""")
rep("""'<div class="plog" style="flex-direction:column;align-items:stretch"><div>'+esc(n.text)+'</div><div""",
    """'<div class="plog" style="flex-direction:column;align-items:stretch"><div>'+fmtText(n.text)+'</div><div""")
rep("""</span></div><div class="desc">'+esc(k.issue)+'</div>""", """</span></div><div class="desc">'+fmtText(k.issue)+'</div>""")
rep("""t('Issue')+'</div>'+esc(k.issue)+'</div>'""", """t('Issue')+'</div>'+fmtText(k.issue)+'</div>'""")
rep("""'<div class="desc" style="margin-top:4px">'+esc(x.note)+'</div>'""", """'<div class="desc" style="margin-top:4px">'+fmtText(x.note)+'</div>'""")
rep("""'<div class="desc" style="margin-top:3px">'+esc(x.note)+'</div>'""", """'<div class="desc" style="margin-top:3px">'+fmtText(x.note)+'</div>'""")
rep("""'<div style="font-size:12px;color:var(--g4)">'+esc(x.note)+'</div>'""", """'<div style="font-size:12px;color:var(--g4)">'+fmtText(x.note)+'</div>'""")
rep("""<div class="desc" style="white-space:pre-line">'+esc(x.items)+'</div>'""", """<div class="desc">'+fmtText(x.items)+'</div>'""")
rep("""todo.length?todo.map((x,i)=>'<div class="ln" style="padding:6px 0"><span><span style="color:var(--g4)">'+(i+1)+'.</span> '+esc(x)+'</span></div>').join('')""",
    """todo.length?'<div class="fmt" style="display:block;font-size:14px;padding:6px 0">'+esc(fmtClean(sl.note))+'</div>'""")
rep("""<input id="svdNote" placeholder="'+t('Add a note')+'" style="flex:1">""",
    """<textarea id="svdNote" rows="2" placeholder="'+t('Add a note')+'" style="flex:1;font-size:16px;resize:vertical"></textarea>""")
rep("""<input id="njNote" placeholder="Designer: The Dzign Room · GC: …">""",
    """<textarea id="njNote" rows="3" placeholder="Designer: The Dzign Room · GC: …" style="font-size:16px;resize:vertical"></textarea>""")
# the new-job note was only shown when a customer name was filled in
rep("""(s.note?' · '+esc(s.note):'')+'</div>':'')""",
    """'</div>':'')+(s.note?'<div class="fmt" style="display:block;font-size:13px;color:var(--g5);margin-top:4px">'+esc(fmtClean(s.note))+'</div>':'')""")

# ---------- 5. blank by default ----------
rep("""value="${x.id}" ${x.id===jobFilter?'checked':''} onchange="jobWord()">""", """value="${x.id}" onchange="jobWord()">""")
rep("""if(me().role!=='office'&&D.sites.length)document.getElementById('jSite').selectedIndex=1;""", "")
rep("""document.getElementById('jDesc').value='';document.getElementById('jPri').className='sw';""",
    """document.getElementById('jDesc').value='';document.getElementById('jDue').value='';document.getElementById('jPri').className='sw';""")
rep("""<select id="jDue"><option value="Tomorrow morning" """, """<select id="jDue"><option value="" data-i18n="— When? (optional) —">— When? (optional) —</option><option value="Tomorrow morning" """)
rep("""if(m.role==='manager')document.getElementById('njMgr').value=m.id;""", "")
rep("""document.getElementById('njNote').value='';""", """document.getElementById('njNote').value='';document.getElementById('njPhase').value='';""")
rep("""<select id="njPhase"><option value="rough" """, """<select id="njPhase"><option value="" data-i18n="— Pick one —">— Pick one —</option><option value="rough" """)
rep("""function saveNewJob(){const m=me();const addr=document.getElementById('njAddr').value.trim();if(!addr){toast(t('Enter the address'));return;}""",
    """function saveNewJob(){const m=me();const addr=document.getElementById('njAddr').value.trim();if(!addr){toast(t('Enter the address'));return;}if(!document.getElementById('njPhase').value){toast(t('Pick Rough or Finishing'));return;}""")

# ---------- 2. paid monthly — no clock-in ----------
rep("""function attField(){return D.emps.filter(e=>e&&e.role!=='office'&&e.role!=='owner'&&!e.inactive);}""",
    """function canSetPay(m){return !!m&&(m.role==='owner'||(m.role==='office'&&m.title==='Payroll'));}
function attField(){return D.emps.filter(e=>e&&e.role!=='office'&&e.role!=='owner'&&!e.inactive&&!e.payMonthly);}""")
rep("""box.innerHTML=summary+search+'<div id="attGrid"></div>';""",
    """const pmL=D.emps.filter(e=>e&&e.payMonthly&&!e.inactive);box.innerHTML=summary+(pmL.length?'<div class="note" style="margin-top:6px">📅 '+t('Paid monthly — no clock-in')+': '+esc(pmL.map(e=>e.name).join(', '))+'</div>':'')+search+'<div id="attGrid"></div>';""")
rep("""if(here&&Date.now()-lastNag>5*60*1000){""", """if(here&&!(me()||{}).payMonthly&&Date.now()-lastNag>5*60*1000){""")
rep("""const field=D.emps.filter(e=>e.role==='worker');""", """const field=D.emps.filter(e=>e.role==='worker'&&!e.payMonthly&&!e.inactive);""")
rep(""".flatMap(c=>D.emps.filter(e=>e.crew===c.id)).filter(e=>!D.punches.find(""", """.flatMap(c=>D.emps.filter(e=>e.crew===c.id&&!e.payMonthly&&!e.inactive)).filter(e=>!D.punches.find(""")
rep("""if(!p)return {dot:'var(--g3)',txt:t('not punched in'),sub:'',h:0};""",
    """if(!p)return e.payMonthly?{dot:'var(--blue-mid)',txt:'📅 '+t('Paid monthly — no clock-in'),sub:'',h:0}:{dot:'var(--g3)',txt:t('not punched in'),sub:'',h:0};""")
rep(""":'⚪ '+t('not punched in today');""", """:(e.payMonthly?'📅 '+t('Paid monthly — no clock-in'):'⚪ '+t('not punched in today'));""")
rep("""<div id="punchSched"></div>""",
    """<div id="punchSched"></div>
  <div class="card" id="payMNote" hidden style="text-align:center;padding:18px 14px"><div style="font-size:30px">📅</div><b data-i18n="You're paid monthly">You're paid monthly</b><div style="font-size:13px;color:var(--g4);margin-top:4px" data-i18n="No need to clock in or out. Payroll set this up for you.">No need to clock in or out. Payroll set this up for you.</div></div>""")
rep("""  const open=D.punches.find(p=>p.who===m.id&&!p.out);
  const away=D.punches.find(p=>p.who===m.id&&p.away);""",
    """  const open=D.punches.find(p=>p.who===m.id&&!p.out);
  {const pm=!!m.payMonthly&&!open;const nb=document.getElementById('payMNote');if(nb)nb.hidden=!pm;const pb=document.querySelector('#pg-punch .punch-big');if(pb)pb.style.display=pm?'none':'';}
  const away=D.punches.find(p=>p.who===m.id&&p.away);""")
rep("""<div class="tog"><span data-i18n="Driver's license">Driver's license</span><div class="sw" id="eDL" onclick="this.classList.toggle('on')"></div></div>""",
    """<div class="tog"><span data-i18n="Driver's license">Driver's license</span><div class="sw" id="eDL" onclick="this.classList.toggle('on')"></div></div>
  <div class="tog" id="ePayMWrap"><span><span data-i18n="Paid monthly — no clock-in">Paid monthly — no clock-in</span><div style="font-size:11px;color:var(--g4)" data-i18n="No punch needed, never reminded. Only the owner or Payroll can change this.">No punch needed, never reminded. Only the owner or Payroll can change this.</div></span><div class="sw" id="ePayM" onclick="this.classList.toggle('on')"></div></div>""")
rep("""document.getElementById('eLead').className='sw'+(ex&&ex.lead?' on':'');""",
    """document.getElementById('eLead').className='sw'+(ex&&ex.lead?' on':'');document.getElementById('ePayM').className='sw'+(ex&&ex.payMonthly?' on':'');document.getElementById('ePayMWrap').style.display=canSetPay(m)?'':'none';""")
rep("""e.inactive=!document.getElementById('eActive').classList.contains('on');save();hide('m-emp');renderAll();toast('✓ '+n,'green');return;}""",
    """e.inactive=!document.getElementById('eActive').classList.contains('on');if(canSetPay(me())){if(document.getElementById('ePayM').classList.contains('on'))e.payMonthly=true;else if(e.payMonthly)e.payMonthly=false;}save();hide('m-emp');renderAll();toast('✓ '+n,'green');return;}""")
rep("""if(role==='office'){ne.title=title;if(all)ne.all=true;}D.emps.push(ne);""",
    """if(role==='office'){ne.title=title;if(all)ne.all=true;}if(canSetPay(me())&&document.getElementById('ePayM').classList.contains('on'))ne.payMonthly=true;D.emps.push(ne);""")

# ---------- 4. assignment notifications come from the server (live app) ----------
rep("""function pushTo(ids,msg,kind,link){""",
    """// assignment messages: with the live server the database sends them (each person's own language, also for changes
// saved offline) — so the phone does not send a second copy. Demo mode (no server) keeps sending them from the phone.
function assignPush(ids,msg,kind,link){if(window.EX_REAL)return;pushTo(ids,msg,kind,link);}
function pushTo(ids,msg,kind,link){""")
rep("""const nj=D.jobs[0];pushTo(nj.to,""", """const nj=D.jobs[0];assignPush(nj.to,""")
rep("""if(added.length)pushTo(added,(j.pri?'🔴 '+t('PRIORITY')+' — ':'')+t('Moved to you by')""", """if(added.length)assignPush(added,(j.pri?'🔴 '+t('PRIORITY')+' — ':'')+t('Moved to you by')""")
rep("""if(removed.length)pushTo(removed,t('Taken off your list')""", """if(removed.length)assignPush(removed,t('Taken off your list')""")
rep("""if(k.to&&k.to!==was)pushTo(""", """if(k.to&&k.to!==was)assignPush(""")
rep("""if(to)pushTo([to],(k.pri""", """if(to)assignPush([to],(k.pri""")
rep("""pushTo([cid],'📁 '""", """assignPush([cid],'📁 '""")
rep("""if(old&&old!==cid)pushTo([old],'📁 '""", """if(old&&old!==cid)assignPush([old],'📁 '""")
rep("""if(crew)pushTo([id],'👷 '+t('You are now on')""", """if(crew)assignPush([id],'👷 '+t('You are now on')""")
rep("""if(who.length)pushTo(who,'🏗 '""", """if(who.length)assignPush(who,'🏗 '""")
rep("""pushTo([schedCrew],'📅 '""", """assignPush([schedCrew],'📅 '""")

# ---------- 1. universal search ----------
a = s.index("function doSearch(){"); b = s.index("\n", s.index("const cards=answerCards(q);el.innerHTML=", a))
s = s[:a] + r"""function srchN(x){return String(x==null?'':x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function doSearch(){const m=me();const raw=document.getElementById('sqInput').value.trim();const q=raw.toLowerCase();const el=document.getElementById('sqRes');document.getElementById('sqAnswer').innerHTML='';if(q.length<2){el.innerHTML='';return;}
  const words=srchN(raw).split(/\s+/).filter(Boolean);const hit=(...xs)=>{const n=srchN(xs.filter(x=>x!=null&&x!=='').join(' '));return words.every(w=>n.includes(w));};
  const first=(raw.split(/\s+/)[0]||'').toLowerCase();const snip=v=>{v=String(v||'').replace(/\s+/g,' ');const i=v.toLowerCase().indexOf(first);const a=Math.max(0,i-25);return (a?'…':'')+v.slice(a,a+90)+(v.length>a+90?'…':'');};
  const row=(ic,n,s2,act)=>'<div class="sres" onclick="hide(\'m-search\');'+act+'"><div class="ic">'+ic+'</div><div style="flex:1;min-width:0"><div class="n">'+n+'</div><div class="s">'+s2+'</div></div></div>';
  const groups=[];const add=(title,rows)=>{if(rows.length)groups.push('<div class="sec" style="margin:10px 2px 4px">'+esc(title)+' · '+rows.length+'</div>'+rows.join(''));};
  const wide=m.role!=='worker'||m.lead;const sn=id=>esc(String(siteName(id)||'').split(',')[0]);
  try{if(wide)add(t('People'),D.emps.filter(e=>hit(e.name,e.title,e.phone,e.email)).slice(0,6).map(e=>row('👤',esc(e.name),esc(t(e.title||ROLE_LABEL[e.role]))+(e.crew?' · '+esc(nameOf(e.crew)):'')+(e.payMonthly?' · 📅 '+t('Paid monthly'):''),"jobFilter='"+jsq(e.id)+"';jobView='open';goTab('jobs')")));}catch(e){}
  try{add(t('Job sites'),visSites().filter(s=>hit(s.name,s.client,s.phone,s.note)).slice(0,6).map(s=>row('📁',esc(s.name),esc(s.client||'')+(s.crew?' · '+esc(nameOf(s.crew)):'')+' · '+t(s.phase==='finish'?'Finishing':'Rough'),"openFolder('"+jsq(s.id)+"')")));}catch(e){}
  try{const L=visibleJobs().filter(j=>hit(j.desc,j.descTr,j.site?siteName(j.site):'',Object.keys(j).filter(k=>k.startsWith('m_')).map(k=>(j[k]||{}).text||'').join(' '))).sort((a,b)=>(a.status==='done'?1:0)-(b.status==='done'?1:0)||(b.ts||0)-(a.ts||0)).slice(0,8);
    add(t('Tasks'),L.map(j=>row(j.status==='done'?'✓':j.pri?'🔴':'📋',esc(jobText(j).slice(0,60)),esc(nameList(j))+(j.site?' · '+sn(j.site):'')+(j.status==='done'?' · '+t('Done'):''),"openJobDetail('"+jsq(j.id)+"')")));}catch(e){}
  try{keepInit();add(t('Notes'),kMine().filter(n=>!n.trashed&&hit(n.title,n.body,(n.items||[]).map(i=>i.t).join(' '))).slice(0,6).map(n=>row('🗒',esc((n.title||snip(n.body)||(n.items||[]).map(i=>i.t).join(', ')).slice(0,70)),(n.site?'📍 '+sn(n.site)+' · ':'')+esc(when(n.edited||n.created||0)),"kOpen('"+jsq(n.id)+"')")));}catch(e){}
  try{if(typeof canMsg!=='function'||canMsg(m))add(t('Messages'),D.msgs.filter(x=>x.kind==='text'&&(x.from===m.id||x.to===m.id)&&hit(x.text)).slice(-6).reverse().map(x=>{const o=x.from===m.id?x.to:x.from;return row('💬',esc(nameOf(o)),esc(snip(x.text))+' · '+esc(when(x.ts)),"goTab('msg');openChat('"+jsq(o)+"')");}));}catch(e){}
  try{add(t('Notifications'),D.inbox.filter(x=>x.to===m.id&&hit(x.msg)).slice(0,5).map(x=>row('🔔',esc(snip(x.msg)),esc(when(x.ts)),"nGo('"+jsq(x.id)+"')")));}catch(e){}
  try{const cr=wide?D.crews:D.crews.filter(c=>c.id===m.crew);const R=[];Object.keys(D.sched||{}).forEach(k=>{const [c,d]=k.split('|');if(!d||!/^\d{4}-\d\d-\d\d$/.test(d)||!cr.some(x=>x.id===c))return;const sl=D.sched[k];if(!sl)return;const nt=[sl.note,...(sl.assignments||[]).map(a=>a.note)].filter(Boolean).join(' · ');if(nt&&hit(nt,sl.site?siteName(sl.site):''))R.push({k,c,d,nt,sl});});
    add(t('Schedule'),R.sort((a,b)=>b.d.localeCompare(a.d)).slice(0,6).map(r=>row('📅',esc(nameOf(r.c))+' · '+esc(new Date(r.d+'T12:00').toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'})),(r.sl.site?sn(r.sl.site)+' · ':'')+esc(snip(r.nt)),"schedCrew='"+jsq(r.c)+"';goTab('sched')")));}catch(e){}
  try{const R=[];visSites().forEach(s=>['rough','finish'].forEach(ph=>((((D.punchlists||{})[s.id]||{})[ph])||[]).forEach(x=>{if(x&&hit(x.text))R.push(row(x.done?'☑':'☐',esc(String(x.text).slice(0,60)),sn(s.id)+' · '+t(ph==='finish'?'Finishing':'Rough'),"openFolder('"+jsq(s.id)+"')"));})));add(t('Punch list'),R.slice(0,6));}catch(e){}
  try{if(wide&&seesMat(m))add(t('Material'),D.mats.filter(x=>hit(x.items,x.site?siteName(x.site):'')).slice(0,5).map(x=>row('📦',esc(snip(x.items)),esc(nameOf(x.from))+' · '+sn(x.site)+' · '+esc(t(x.status==='delivered'?'Delivered':x.status==='open'?'Open':x.status||'')),"goTab('mat')")));}catch(e){}
  try{if(wide)add(t('Garage'),(D.stock||[]).filter(x=>hit(x.name,x.brand,x.cat,x.upc,x.sku)).slice(0,5).map(x=>row('🧰',esc(x.name),t('Garage')+' · '+x.qty+' '+esc(x.unit||''),"goTab('tools')")));}catch(e){}
  try{if(wide)add(t('Tools'),(D.tools||[]).filter(x=>hit(x.name)).slice(0,4).map(x=>row('🔧',esc(x.name),x.who?t('Out with')+' '+esc(nameOf(x.who)):t('In the garage'),"goTab('tools')")));}catch(e){}
  try{if(wide&&seesSvc(m))add(t('Service calls'),(D.tickets||[]).filter(k=>hit(k.client,k.addr,k.issue,(k.notes||[]).map(n=>n.text).join(' '))).slice(0,4).map(k=>row('🛎',esc(k.client||k.addr),esc(snip(k.issue)),"openSvcDetail('"+jsq(k.id)+"')")));}catch(e){}
  try{if(canBook(m))add(t('Meetings'),D.meets.filter(x=>(m.role==='owner'||inMeet(x,m.id))&&hit(x.title,x.note,x.site?siteName(x.site):'')).sort((a,b)=>b.at-a.at).slice(0,4).map(x=>row('🗓',esc(x.title||t('Meeting')),esc(new Date(x.at).toLocaleString(LOC(),{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))+(x.site?' · '+sn(x.site):''),"goTab('cal')")));}catch(e){}
  let cards='';try{cards=answerCards(q);}catch(e){}el.innerHTML=cards+(groups.length?groups.join(''):(cards?'':'<div class="empty">'+t('Nothing found for')+' “'+esc(raw)+'”</div>'))+'<div style="text-align:center;margin-top:10px"><span class="bs b" onclick="askClaudeSearch()">🤖 '+t('Ask Claude this question')+'</span></div>';}""" + s[b:]
rep("""'<div style="font-size:13px;color:var(--g3);padding:8px 4px">'+t('Try: where is Jon · who is at Oxford · Carlos hours · what did rough leave for finishing at Willow Tree')+'</div>'""",
    """'<div style="font-size:13px;color:var(--g3);padding:8px 4px">'+t('Searches people, job sites, tasks (also finished ones), notes, messages, schedule notes, punch lists, material, stock, tools and meetings.')+'<br>'+t('Try: where is Jon · who is at Oxford · Carlos hours · what did rough leave for finishing at Willow Tree')+'</div>'""")
rep("""<input id="sqInput" placeholder="Ask anything… where is Jon? who's at Oxford? Carlos hours" """,
    """<input id="sqInput" type="search" placeholder="Search everything — people, jobs, tasks, notes, messages, stock…" data-i18n-ph="Search everything — people, jobs, tasks, notes, messages, stock…" """)
open(p, 'w').write(s); print('ok', p)
