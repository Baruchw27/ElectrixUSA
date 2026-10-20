"""Review B2 (independent offline/permissions review) — app side.
 • start-up: the server's copy and the phone's unsent work are combined BEFORE anything else can run (a tap or a timer
   during start-up could otherwise turn an offline clock-in into a delete)
 • phone storage full: old job photos are left out of the PHONE copy only (they used to be removed for everyone)
 • a refused new record or refused delete is reported for every kind of record (was: schedule and clock only) —
   except bell messages to other people, which the sender is not allowed to read back
 • catch-up after sleep uses the server's clock, not the phone's (a phone with a fast clock missed changes)"""
import sys,os
root=sys.argv[1]
def patch(fn,pairs):
    p=os.path.join(root,fn);s=open(p).read()
    for a,b in pairs:
        assert s.count(a)==1,(fn,a[:120],s.count(a));s=s.replace(a,b)
    open(p,'w').write(s);print('ok',p)
patch('sync.js',[
("""  if(rows.length){applyRows(rows,{replace:true});
    // stock history""","""  if(rows.length){applyRows(rows,{replace:true});applyPendingQueue();takeSnap();   // B2: unsent work back on top at once — no wait in between
    // stock history"""),
("""  if(rows.length){try{const u=(await sb.auth.getUser()).data.user;""","""  if(rows.length){try{const u=(await withTO(sb.auth.getUser(),6000,'who')).data.user;"""),
("""  applyPendingQueue();takeSnap();
  seeded.forEach(k=>""","""  if(!rows.length){applyPendingQueue();takeSnap();}
  seeded.forEach(k=>"""),
("""    if(!s||s.deleted){if(row.coll==='sched'||row.coll==='punches')out.push({coll:row.coll,id:row.id,absent:true});return;}""",
 """    // B2: for every kind of record — except bell messages to other people (the sender may not read those back)
    if(!s||s.deleted){if(row.coll!=='inbox'&&row.coll!=='push')out.push({coll:row.coll,id:row.id,absent:true});return;}"""),
("""      const refused=part.filter(o=>{if(o.coll!=='sched')return false;""","""      const refused=part.filter(o=>{if(o.coll==='inbox')return false;"""),
("""  await pages(()=>sb.from('records').select('coll,id,data,deleted').not('coll','in','('+HIST_COLLS.join(',')+')'));
  await pages(()=>sb.from('records').select('coll,id,data,deleted').in('coll',HIST_COLLS).gt('updated_at',since));
  lastPull=t0;""","""  await pages(()=>sb.from('records').select('coll,id,data,deleted,updated_at').not('coll','in','('+HIST_COLLS.join(',')+')'));
  await pages(()=>sb.from('records').select('coll,id,data,deleted,updated_at').in('coll',HIST_COLLS).gt('updated_at',since));
  lastPull=srvTime(rows,t0);"""),
("""async function pullAll(){""","""// the newest change time the SERVER reported (its clock, not this phone's) — the next catch-up starts from there
function srvTime(rows,fallback){let mx=0;for(const r of rows){const v=r&&r.updated_at?Date.parse(r.updated_at):0;if(v>mx)mx=v;}return mx||fallback;}
async function pullAll(){"""),
("""    while(true){const r=await withTO(sb.from('records').select('coll,id,data,deleted').gt('updated_at',since).range(from,from+999),20000,'catch-up');if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<1000)break;from+=1000;}
    lastPull=t0;""","""    while(true){const r=await withTO(sb.from('records').select('coll,id,data,deleted,updated_at').gt('updated_at',since).order('updated_at').range(from,from+999),20000,'catch-up');if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<1000)break;from+=1000;}
    lastPull=rows.length?srvTime(rows,t0):(lastPull||t0);""")])
patch('index.html',[("""if(!_st){const old=Date.now()-14*86400000;D.jobs.forEach(j=>{if(j.status==='done'&&(j.doneAt||0)<old&&j.photos&&j.photos.length>1)j.photos=j.photos.slice(-1);});try{localStorage.setItem(KEY,JSON.stringify(D));_st=true;}catch(e2){}}""",
"""if(!_st){const old=Date.now()-14*86400000;/* B2: leave old photos out of the PHONE copy only — never change the job itself (that would remove them for everyone) */
  try{const lite=Object.assign({},D,{jobs:D.jobs.map(j=>(j.status==='done'&&j.doneAt&&j.doneAt<old&&j.photos&&j.photos.length>1)?Object.assign({},j,{photos:j.photos.slice(-1)}):j)});localStorage.setItem(KEY,JSON.stringify(lite));_st=true;}catch(e2){}}""")])
