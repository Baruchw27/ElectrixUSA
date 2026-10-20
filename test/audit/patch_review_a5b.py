"""A5b — fixes from the independent review of A5 (app side). Applied to staging/index.html and staging/sync.js."""
import sys
root=sys.argv[1]
def patch(p,pairs):
    s=open(p).read()
    for a,b in pairs:
        assert s.count(a)==1,(p,a[:90],s.count(a)); s=s.replace(a,b)
    open(p,'w').write(s); print('patched',p)
patch(root+'/index.html',[
 # pay counts everywhere use one rule
 ("  const open=D.punches.filter(p=>!p.out&&!p.away&&!p.rejected&&!p.pending&&p.in>=from&&p.in<to).length;",
  "  const open=D.punches.filter(p=>!p.out&&!p.away&&payCounts(p)&&p.in>=from&&p.in<to).length;"),
 ("  const mine=D.punches.filter(p=>p.who===id&&!p.rejected&&!p.pending);",
  "  const mine=D.punches.filter(p=>p.who===id&&payCounts(p));"),
 ("const pun=D.punches.filter(p=>inR(p.in));const hrsBy={}",
  "const pun=D.punches.filter(p=>inR(p.in)&&payCounts(p));const hrsBy={}"),
 ("let hAll=0;D.punches.filter(p=>p.site===s.id&&(p.out||p.away)).forEach(p=>hAll+=punchDur(p));",
  "let hAll=0;D.punches.filter(p=>p.site===s.id&&(p.out||p.away)&&payCounts(p)).forEach(p=>hAll+=punchDur(p));"),
 ("let hAll=0,hWk=0;D.punches.filter(p=>p.site===id&&(p.out||p.away)).forEach(p=>{",
  "let hAll=0,hWk=0;D.punches.filter(p=>p.site===id&&(p.out||p.away)&&payCounts(p)).forEach(p=>{"),
 # the server needs a reason of at least 3 letters — say so here instead of failing later
 ("  if(!why){toast(t('Write a reason for the change'));return;}\n  if(peIdx===null){",
  "  if(why.length<3){toast(t('Write a reason for the change'));return;}\n  if(peIdx===null){"),
 # rejecting / removing an entry that is still open also closes it, so the worker can clock in again
 ("    p.rejected=true;p.pending=false;p.rejectWhy=why;save();",
  "    if(!p.out){p.out=Date.now();delete p.away;delete p.breakStart;}p.rejected=true;p.pending=false;p.rejectWhy=why;save();"),
 ("    if(undo)delete p.voided;else p.voided={by:me().id,at,why};",
  "    if(undo)delete p.voided;else{p.voided={by:me().id,at,why};if(!p.out){p.out=at;delete p.away;delete p.breakStart;pushTo([p.who],'🕒 '+t('Your open clock entry was removed by the office — clock in again if you are working')+' ('+why+')','warn',{tab:'punch'});}}"),
 ("Object.assign(ES,{'Older than 4 months",
  "Object.assign(ES,{'Your open clock entry was removed by the office — clock in again if you are working':'La oficina quitó su marca abierta — marque entrada de nuevo si está trabajando','Older than 4 months"),
])
patch(root+'/sync.js',[
 # a refused clock entry is never silent: whole records and removed fields are checked too, and a refused NEW clock
 # entry is kept safely in the refused list (with a message) instead of looking saved
 ("    if(!s||s.deleted){if(row.coll==='sched')out.push({coll:row.coll,id:row.id,absent:true});return;}",
  "    if(!s||s.deleted){if(row.coll==='sched'||row.coll==='punches')out.push({coll:row.coll,id:row.id,absent:true});return;}"),
 ("    if(row.patch&&typeof row.patch==='object'){for(const f in row.patch){if(own.indexOf(f)>=0)continue;if(canon(d[f])!==canon(row.patch[f])){out.push({coll:row.coll,id:row.id});break;}}}});",
  "    const sentObj=(row.patch&&typeof row.patch==='object')?row.patch:(row.coll==='punches'&&row.full&&typeof row.full==='object'?row.full:null);\n"
  "    if(sentObj){let bad=false;for(const f in sentObj){if(own.indexOf(f)>=0)continue;if(canon(d[f])!==canon(sentObj[f])){bad=true;break;}}\n"
  "      if(!bad&&row.coll==='punches'&&Array.isArray(row.unset))bad=row.unset.some(f=>own.indexOf(f)<0&&(f in d));\n"
  "      if(bad)out.push({coll:row.coll,id:row.id});}});"),
 # a clock entry is sent even when its selfie cannot be uploaded yet (weak signal): the photo follows later, so the
 # entry is not held back and does not become "late"
 ("      try{const ch=await offloadBlobs(o.coll,o.id,target);if(ch&&live){o.data=(o.coll==='emps')?stripEmp(live):upStrip(o.coll,live);snap[o.coll][o.id]=canon(o.data);localSave();}}catch(e){skipped++;continue;}",
  "      try{const ch=await offloadBlobs(o.coll,o.id,target);if(ch&&live){o.data=(o.coll==='emps')?stripEmp(live):upStrip(o.coll,live);snap[o.coll][o.id]=canon(o.data);localSave();}}catch(e){skipped++;\n"
  "        if(o.coll==='punches'){const strip=JSON.parse(JSON.stringify(target));Object.keys(strip).forEach(f=>{if(typeof strip[f]==='string'&&strip[f].startsWith('data:'))strip[f]='';});\n"
  "          ups.push({coll:o.coll,id:o.id,patch:strip,unset:[],by:st.user||null});refs.push({});}   // stays queued: the full entry with its photo goes again next time\n"
  "        continue;}"),
])
