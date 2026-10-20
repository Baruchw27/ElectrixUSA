"""Review B5 — findings of the final independent review of today's changes (app side).
 • a save the server refuses is kept on the phone for every kind of record (was: deleted with only a message)
 • automatic reminders reach the person whose phone sent them (weekly summary, inspection reminders)
 • sign-out really removes this phone's notification sign-up
 • pick-up with a 0-quantity unknown line no longer crashes
 • a short server hiccup no longer sets a stock move aside after one tap
 • camera never left on when the app is hidden while it starts
 • opening from a notification doesn't reopen it on every reload"""
import sys,os
root=sys.argv[1]
def patch(fn,pairs):
    p=os.path.join(root,fn);s=open(p).read()
    for a,b in pairs:
        assert s.count(a)==1,(fn,a[:120],s.count(a));s=s.replace(a,b)
    open(p,'w').write(s);print('ok',p)
patch('sync.js',[
("function keepRej(list){const all=loadRej().concat(memRej.filter(m=>!loadRej().some(y=>y.id===m.id&&y.by===m.by)));list.forEach(x=>{if(!x||x.coll!=='sched')return;",
 "function keepRej(list){const all=loadRej().concat(memRej.filter(m=>!loadRej().some(y=>y.id===m.id&&y.by===m.by)));list.forEach(x=>{if(!x||x.coll==='inbox'||x.coll==='push'||x.coll==='_')return;/* B5: every kind of record (was: schedule only) */"),
("    if(!s||s.deleted){if(row.coll!=='inbox'&&row.coll!=='push')out.push({coll:row.coll,id:row.id,absent:true});return;}",
 "    if(!s||s.deleted){if(row.coll!=='inbox'&&row.coll!=='push'&&row.coll!=='_')out.push({coll:row.coll,id:row.id,absent:true});return;}"),
("const P=(window.D&&D.push)||[];","const P=(typeof D!=='undefined'&&D&&D.push)||[];"),
])
patch('index.html',[
("function pushTo(ids,msg,kind,link,idBase){const m=me();","function pushTo(ids,msg,kind,link,idBase,keepMe){const m=me();"),
("const onlyMe=!!m&&(ids||[]).length===1&&ids[0]===m.id;","const onlyMe=(!!m&&(ids||[]).length===1&&ids[0]===m.id)||!!idBase||!!keepMe;   // timers/reminders reach the sender too"),
("'+field.length+' '+t('people')),'info',{tab:'hours'});","'+field.length+' '+t('people')),'info',{tab:'hours'},null,true);"),
("  const unk=puLines.filter(l=>(+l.qty||0)>0&&!(l.id?stockItem(l.id):stockFind(l.name)));",
 "  puLines=puLines.filter(l=>(+l.qty||0)>0);\n  const unk=puLines.filter(l=>!(l.id?stockItem(l.id):stockFind(l.name)));"),
("        if(!perm&&_c&&!/^(08|53|57|PGRST3)/.test(_c)&&!/fetch|network|timeout|jwt|load failed/i.test(String(r.error.message||''))){\n          const cq=stockQ();const ci=cq.findIndex(x=>x.id===txn.id);if(ci>=0){cq[ci].tries=(+cq[ci].tries||0)+1;stockQSave(cq);",
 "        if(!perm&&_c&&!/^(08|40|53|57|PGRST0|PGRST3)/.test(_c)&&!/fetch|network|timeout|jwt|load failed/i.test(String(r.error.message||''))){\n          const cq=stockQ();const ci=cq.findIndex(x=>x.id===txn.id);if(ci>=0&&Date.now()-(+cq[ci].lastTry||0)>60000){cq[ci].tries=(+cq[ci].tries||0)+1;cq[ci].lastTry=Date.now();stockQSave(cq);"),
("S.stream=st;if(gone())return;v.srcObject=st;","S.stream=st;if(gone())return;if(S.hiddenOff){st.getTracks().forEach(x=>x.stop());S.stream=null;return;}v.srcObject=st;"),
("  try{S.stop=await bcEngine(v,scHit);if(gone())return;}","  try{S.stop=await bcEngine(v,scHit);if(gone())return;if(S.hiddenOff){try{S.stop&&S.stop();}catch(e){}S.stop=null;return;}}"),
("const _n=new URLSearchParams(location.search).get('n');if(_n){","const _n=new URLSearchParams(location.search).get('n');if(_n){try{history.replaceState(null,'',location.pathname);}catch(e){}"),
("function t(s){return lang()==='es'&&ES[s]?ES[s]:s","Object.assign(ES,{'Meeting':'Reunión'});\nfunction t(s){return lang()==='es'&&ES[s]?ES[s]:s"),
])
