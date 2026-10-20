"""Bug sweep B1 (app side) — findings of the independent notification and inventory reviews (staging).
Notifications
 • every bell / phone message is written in the RECIPIENT's language (was: the sender's) — each message is built
   once per person, with that person's language
 • nobody is notified about their own action; turned-off (inactive) employees get nothing
 • the bell list shows newest first and says who a message is from
 • iPhone: notifications are switched on from a button the person taps (iPhone ignores the automatic request)
 • tapping a phone notification opens the right job / screen
 • inspection reminders: two phones running at once no longer send two copies
Inventory
 • an online pick-up / put-back / count waits for the server's real answer (it said "will sync when online" and a
   refusal lost the typed lines); "running low" alert to Material works again
 • a stock change the server refuses with an unknown error no longer blocks every later move on that phone
 • a pick-up of an item that isn't on the garage list is stopped on the phone (it left a junk item behind)
 • decimals (12.5 ft) are kept in manual lines and counts
 • stock search waits for typing to pause and shows at most 80 matches; the first load saves counts once
 • the camera is always released when the scanner closes (also while it was still starting) and when the app is
   hidden; it restarts when the app comes back"""
import sys, re
p = sys.argv[1]; s = open(p).read()
def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (a[:140], s.count(a)); s = s.replace(a, b)

# ── per-recipient language: wrap the message argument of every pushTo(...) / assignPush(...) call in ()=>(...) ──
def scan_args(src, i):
    """src[i] == '(' ; returns (end_index_of_closing_paren, [(start,end) of each top-level argument])"""
    depth = 0; j = i; args = []; start = i + 1; stack = []
    while j < len(src):
        c = src[j]
        if c in '\'"`':
            q = c; j += 1
            while j < len(src):
                if src[j] == '\\': j += 2; continue
                if q == '`' and src[j] == '$' and src[j+1] == '{':
                    # template expression: skip to matching }
                    k = j + 2; d2 = 1
                    while d2:
                        if src[k] in '\'"':
                            qq = src[k]; k += 1
                            while src[k] != qq:
                                k += 2 if src[k] == '\\' else 1
                        elif src[k] == '{': d2 += 1
                        elif src[k] == '}': d2 -= 1
                        k += 1
                    j = k; continue
                if src[j] == q: break
                j += 1
        elif c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
            if depth == 0:
                args.append((start, j)); return j, args
        elif c == ',' and depth == 1:
            args.append((start, j)); start = j + 1
        j += 1
    raise ValueError('unbalanced at %d' % i)

out = []; pos = 0; n = 0
for m in re.finditer(r'(?<![A-Za-z0-9_$.])(pushTo|assignPush)\(', s):
    if m.start() < pos: continue
    before = s[max(0, m.start()-9):m.start()]
    if before.endswith('function '): continue
    i = m.end() - 1
    end, args = scan_args(s, i)
    if len(args) < 2: continue
    a0, a1 = args[1]
    arg = s[a0:a1]
    if arg.strip().startswith('()=>') or arg.strip() in ('msg',): continue
    out.append(s[pos:a0]); out.append('()=>(' + arg + ')'); pos = a1; n += 1
out.append(s[pos:]); s = ''.join(out)
assert n >= 60, n
print('wrapped messages:', n)

rep("function lang(){const m=me();return (m&&m.lang)||'en';}",
    "function lang(){if(window.__LANG)return window.__LANG;const m=me();return (m&&m.lang)||'en';}\n"
    "// build a text as it reads for someone else (their language, their date format)\n"
    "function inLang(l,fn){const o=window.__LANG;window.__LANG=l||'en';try{return String(fn());}finally{window.__LANG=o;}}")
rep("""function pushTo(ids,msg,kind,link){const list=[];ids.forEach(id=>{const c=crewOf(id);if(c){D.emps.filter(e=>e.crew===c.id&&(e.lead||true)).forEach(e=>list.push(e.id));}else list.push(id);});
  [...new Set(list)].forEach(id=>D.inbox.unshift({id:nid('n'),to:id,msg,kind:kind||'info',ts:Date.now(),read:false,link:link||null}));
  save();renderBell();const m=me();if(list.includes(m.id))notify(msg);}""",
    """// one bell + phone message per person, written in THAT person's language; never to people who are turned off, and not to
// yourself unless it is only for you. idBase (optional) gives the same message the same id on every phone (no doubles).
function pushTo(ids,msg,kind,link,idBase){const m=me();const list=[];(ids||[]).forEach(id=>{const c=crewOf(id);if(c){D.emps.filter(e=>e.crew===c.id).forEach(e=>list.push(e.id));}else list.push(id);});
  const onlyMe=!!m&&(ids||[]).length===1&&ids[0]===m.id;
  const L=[...new Set(list)].filter(id=>{const e=D.emps.find(x=>x.id===id);return !(e&&e.inactive)&&(onlyMe||!m||id!==m.id);});
  const txt=id=>{if(typeof msg!=='function')return msg;const e=D.emps.find(x=>x.id===id);return inLang((e&&e.lang)||'en',msg);};
  L.forEach(id=>{const nid_=idBase?String(idBase)+'_'+id:nid('n');if(idBase&&D.inbox.some(x=>x.id===nid_))return;D.inbox.unshift({id:nid_,to:id,from:m?m.id:undefined,msg:txt(id),kind:kind||'info',ts:Date.now(),read:false,link:link||null});});
  save();renderBell();if(m&&L.includes(m.id))notify(txt(m.id));}""")
rep("""function openInbox(){const m=me();const mine=D.inbox.filter(x=>x.to===m.id);""",
    """function openInbox(){const m=me();const mine=D.inbox.filter(x=>x.to===m.id).sort((a,b)=>(b.ts||0)-(a.ts||0));""")
rep("""<div style="font-size:11px;color:var(--g4);display:flex;justify-content:space-between"><span>'+when(x.ts)+'</span>""",
    """<div style="font-size:11px;color:var(--g4);display:flex;justify-content:space-between"><span>'+when(x.ts)+(x.from&&x.from!==m.id&&!x.auto?' · '+t('from')+' '+esc(nameOf(x.from)):'')+'</span>""")
# inspection reminders: same id on every phone
rep("""save();pushTo(who,()=>('⏰ '+t('Tomorrow')+': '+inspKindLabel(i.kind)+' '+fmtT(i.at)+' — '+siteName(i.site)),'pri',{insp:i.id});""",
    """save();pushTo(who,()=>('⏰ '+t('Tomorrow')+': '+inspKindLabel(i.kind)+' '+fmtT(i.at)+' — '+siteName(i.site)),'pri',{insp:i.id},'ni'+i.id+'d1'+i.at);""")
rep("""save();pushTo(who,()=>('⏰ '+t('Today')+' '+fmtT(i.at)+': '+inspKindLabel(i.kind)+' — '+siteName(i.site)),'pri',{insp:i.id});""",
    """save();pushTo(who,()=>('⏰ '+t('Today')+' '+fmtT(i.at)+': '+inspKindLabel(i.kind)+' — '+siteName(i.site)),'pri',{insp:i.id},'ni'+i.id+'m'+i.at);""")
# iPhone: ask for notifications from a tap, never automatically
rep("""if(n==='punch'){try{if('Notification'in window&&Notification.permission==='default')Notification.requestPermission();}catch(e){}renderPunch();startWatch();}""",
    """if(n==='punch'){renderPunch();startWatch();}try{notifBanner();}catch(e){}""")
rep("""async function exNotif(){""",
    """// a small banner until notifications are on for this phone (iPhone only allows the question after a tap)
function notifBanner(){let b=document.getElementById('notifBan');const ok=window.EX_REAL&&typeof me==='function'&&me()&&('Notification' in window)&&('PushManager' in window)&&('serviceWorker' in navigator)&&Notification.permission==='default';
  let later=0;try{later=+localStorage.getItem('ex_notif_later')||0;}catch(e){}
  if(!ok||Date.now()<later){if(b)b.remove();return;}
  if(!b){b=document.createElement('div');b.id='notifBan';b.className='card';b.style.cssText='margin:8px 12px;padding:10px 12px;display:flex;gap:10px;align-items:center;border-color:#b8ccee;background:var(--blue-light)';const pg=document.querySelector('.pg.on');(pg||document.body).insertBefore(b,(pg||document.body).firstChild);}
  b.innerHTML='<span style="font-size:22px">🔔</span><span style="flex:1;font-size:13px">'+t('Turn on notifications to hear about new jobs and schedule changes.')+'</span><button class="bs b" onclick="exNotif().then(()=>notifBanner())">'+t('Turn on')+'</button><span style="cursor:pointer;color:var(--g4);font-size:12px" onclick="try{localStorage.setItem(\\'ex_notif_later\\',Date.now()+3*86400000)}catch(e){};notifBanner()">'+t('Not now')+'</span>';}
async function exNotif(){""")
rep("""signIn(u.id);try{EX_pushOn(true);}catch(e){}setTimeout(exOfferFaceId,900);""",
    """signIn(u.id);try{EX_pushOn(true).then(()=>{try{notifBanner();}catch(e){}});}catch(e){}setTimeout(exOfferFaceId,900);""")
# tapping a phone notification: open that message's job / screen
rep("""async function exNotif(){""",
    """function openFromPush(id){if(!id||typeof me!=='function'||!me())return false;const x=D.inbox.find(n=>n.id===id);if(!x)return false;try{nGo(id);}catch(e){}return true;}
try{if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{const d=e.data||{};if(d.type==='ex-open'&&d.id){let n=0;const go=()=>{if(!openFromPush(d.id)&&n++<20)setTimeout(go,500);};go();}});}catch(e){}
try{const _n=new URLSearchParams(location.search).get('n');if(_n){let k=0;const go=()=>{if(!openFromPush(_n)&&k++<40)setTimeout(go,500);};setTimeout(go,800);}}catch(e){}
async function exNotif(){""")
rep("function t(s){return lang()==='es'&&ES[s]?ES[s]:s",
    "Object.assign(ES,{'Turn on notifications to hear about new jobs and schedule changes.':'Active las notificaciones para enterarse de trabajos nuevos y cambios de horario.',"
    "'Turn on':'Activar','Not now':'Ahora no','from':'de','is not on the garage list. Put it in (or count it) first.':'no está en la lista del garaje. Primero regístrelo (o cuéntelo).',"
    "'Not saved — the server refused this stock change. The office can see it.':'No se guardó — el servidor rechazó este cambio. La oficina puede verlo.','more — type more of the name':'más — escriba más del nombre'});\n"
    "function t(s){return lang()==='es'&&ES[s]?ES[s]:s")

# ── inventory ──
rep("""async function flushStockQ(){if(stockFlushing)return;""",
    """// one flush at a time; a second caller waits for the one already running, then runs again if its move is still waiting
let stockFlushP=null;
function flushStockQ(){if(stockFlushP)return stockFlushP;stockFlushP=_flushStockQ().finally(()=>{stockFlushP=null;});return stockFlushP;}
async function _flushStockQ(){if(stockFlushing)return;""")
rep("""  try{await Promise.race([flushStockQ(),new Promise(r=>setTimeout(r,8000))]);}catch(e){} // a stalled network never blocks the next pick-up""",
    """  const t0=Date.now();try{for(let k=0;k<3&&!stockOutcomes[id]&&stockQ().some(x=>x.id===id&&!x.rej)&&Date.now()-t0<8000;k++){await Promise.race([flushStockQ(),new Promise(r=>setTimeout(r,8000-(Date.now()-t0)))]);}}catch(e){} // a stalled network never blocks the next pick-up""")
rep("""        if(!perm&&/^(22|23|P0)/.test(_c))perm=t('This stock change was refused by the server')+' ('+String(r.error.message||_c).slice(0,80)+').';""",
    """        if(!perm&&/^(22|23|P0)/.test(_c))perm=t('This stock change was refused by the server')+' ('+String(r.error.message||_c).slice(0,80)+').';
        // any other answer FROM the server (not a lost connection): after 3 tries it is set aside for the office instead of
        // blocking every later move on this phone
        if(!perm&&_c&&!/^(08|53|57|PGRST3)/.test(_c)&&!/fetch|network|timeout|jwt|load failed/i.test(String(r.error.message||''))){
          const cq=stockQ();const ci=cq.findIndex(x=>x.id===txn.id);if(ci>=0){cq[ci].tries=(+cq[ci].tries||0)+1;stockQSave(cq);if(cq[ci].tries>=3)perm=t('Not saved — the server refused this stock change. The office can see it.')+' ('+String(r.error.message||_c).slice(0,60)+')';}}""")
rep("""  const lines=puLines.map(l=>{const s=l.id?stockItem(l.id):stockFind(l.name);return {id:s?s.id:nid('s_'),name:s?s.name:l.name,unit:s?s.unit:(l.unit||'pc'),qty:Math.abs(+l.qty||0)};}).filter(l=>l.qty>0);
  if(!lines.length){toast(t('Add at least one item'));return;}""",
    """  const unk=puLines.filter(l=>(+l.qty||0)>0&&!(l.id?stockItem(l.id):stockFind(l.name)));
  if(unk.length){toast('⚠ '+unk.map(l=>'“'+l.name+'”').join(', ')+' '+t('is not on the garage list. Put it in (or count it) first.'),'bad');return;}
  const lines=puLines.map(l=>{const s=l.id?stockItem(l.id):stockFind(l.name);return {id:s.id,name:s.name,unit:s.unit,qty:Math.abs(+l.qty||0)};}).filter(l=>l.qty>0);
  if(!lines.length){toast(t('Add at least one item'));return;}""")
rep("""onchange="'+fn+'[' +i+'].qty=parseInt(this.value)||0">""", """onchange="'+fn+'[' +i+'].qty=Math.max(0,Math.round((parseFloat(this.value)||0)*100)/100)">""")
rep("""const newQty=Math.max(0,parseInt(q)||0);s.min=Math.max(0,parseInt(mn)||0);""",
    """const newQty=Math.max(0,Math.round((parseFloat(q)||0)*100)/100);s.min=Math.max(0,Math.round((parseFloat(mn)||0)*100)/100);""")
rep("""<input id="skSearch" placeholder="Search stock… romex, GFI, slims" oninput="renderStock()" """,
    """<input id="skSearch" placeholder="Search stock… romex, GFI, slims" oninput="clearTimeout(window._skT);window._skT=setTimeout(renderStock,200)" """)
rep("""if(skFilter==='all'&&!q)list=list.slice(0,80);""",
    """const _more=list.length>80&&(q||skFilter!=='all')?list.length-80:0;if(list.length>80)list=list.slice(0,80);""")
rep("""  document.getElementById('skLog').innerHTML=D.stockLog.slice().sort(""",
    """  if(_more){const sl=document.getElementById('skList');if(sl)sl.insertAdjacentHTML('beforeend','<div class="sub" style="text-align:center;padding:8px">+'+_more+' '+t('more — type more of the name')+'</div>');}
  document.getElementById('skLog').innerHTML=D.stockLog.slice().sort(""")
rep("""  if(!stale){if(qv!=null&&!isNaN(+qv)){stockSrvV[id]=+qv;try{localStorage.setItem(STOCKQ_KEY+'_srvv',JSON.stringify(stockSrvV));}catch(e){}}
    stockSrv[id]=+q;try{localStorage.setItem(STOCKQ_KEY+'_srv',JSON.stringify(stockSrv));}catch(e){}}""",
    """  if(!stale){if(qv!=null&&!isNaN(+qv))stockSrvV[id]=+qv;stockSrv[id]=+q;stockPersistSoon();}""")
rep("""function stockFromServer(id,q,skip,qv){""",
    """// the server counts are written to the phone once per batch (the first load brings thousands)
let _stockPT=null;function stockPersistSoon(){if(_stockPT)return;_stockPT=setTimeout(()=>{_stockPT=null;try{localStorage.setItem(STOCKQ_KEY+'_srvv',JSON.stringify(stockSrvV));}catch(e){}try{localStorage.setItem(STOCKQ_KEY+'_srv',JSON.stringify(stockSrv));}catch(e){}},0);}
try{window.addEventListener('pagehide',()=>{if(_stockPT){clearTimeout(_stockPT);_stockPT=null;try{localStorage.setItem(STOCKQ_KEY+'_srvv',JSON.stringify(stockSrvV));localStorage.setItem(STOCKQ_KEY+'_srv',JSON.stringify(stockSrv));}catch(e){}}});}catch(e){}
function stockFromServer(id,q,skip,qv){""")
# camera: never left running
rep("""  document.body.appendChild(ov);scM={mode,last:'',lastT:0,stop:null,stream:null,pausedCode:null};scList();
  const v=document.getElementById('scVid');
  try{scM.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});v.srcObject=scM.stream;""",
    """  document.body.appendChild(ov);const S={mode,last:'',lastT:0,stop:null,stream:null,pausedCode:null};scM=S;scList();
  const v=document.getElementById('scVid');
  // closed while the camera was still starting: release it right away
  const gone=()=>{if(scM===S)return false;try{S.stream&&S.stream.getTracks().forEach(x=>x.stop());}catch(e){}try{S.stop&&S.stop();}catch(e){}return true;};
  try{const st=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});S.stream=st;if(gone())return;v.srcObject=st;""")
rep("""  catch(e){document.getElementById('scHint').innerHTML=t('Allow the camera for this app in your phone settings.');return;}
  try{scM.stop=await bcEngine(v,scHit);}catch(e){document.getElementById('scHint').innerHTML=t('The scanner could not start. Type the item in the box instead.');}}""",
    """  catch(e){if(gone())return;const h=document.getElementById('scHint');if(h)h.innerHTML=t('Allow the camera for this app in your phone settings.');return;}
  if(gone())return;
  try{S.stop=await bcEngine(v,scHit);if(gone())return;}catch(e){if(gone())return;const h=document.getElementById('scHint');if(h)h.innerHTML=t('The scanner could not start. Type the item in the box instead.');}}
// app hidden (screen locked, another app): the camera is switched off; it comes back when the app is opened again
try{document.addEventListener('visibilitychange',()=>{const S=scM;if(!S)return;
  if(document.hidden){try{S.stop&&S.stop();}catch(e){}S.stop=null;try{S.stream&&S.stream.getTracks().forEach(x=>x.stop());}catch(e){}S.stream=null;S.hiddenOff=true;}
  else if(S.hiddenOff){S.hiddenOff=false;const v=document.getElementById('scVid');if(!v)return;
    navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false}).then(async st=>{if(scM!==S){st.getTracks().forEach(x=>x.stop());return;}S.stream=st;v.srcObject=st;try{await v.play();}catch(e){}
      const sh=document.getElementById('scSheet');if(sh&&sh.classList.contains('on'))return; // a question is open: the reader restarts with "Keep scanning"
      try{S.stop=await bcEngine(v,scHit);if(scM!==S){try{S.stop&&S.stop();}catch(e){}}}catch(e){}}).catch(()=>{});}});}catch(e){}""")
open(p, 'w').write(s); print('ok', p)
