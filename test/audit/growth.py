"""Audit — six months of everyday use must not fill office phones or slow start-up without end.
  • start-up downloads only recent history (punches/travel/stock history/messages), everything else in full
  • clock-in selfies go to file storage instead of riding inside every punch (offline: sent once a signal returns)"""
import sys,os,datetime,random,base64
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
def iso(days_ago): return (datetime.datetime.utcnow()-datetime.timedelta(days=days_ago)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
def ms(days_ago): return int((time.time()-days_ago*86400)*1000)
FAKE_JPEG='data:image/jpeg;base64,'+base64.b64encode(bytes(random.getrandbits(8) for _ in range(7000))).decode()
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        emp=[r for r in SEED['rows'] if r['coll']=='emps'][0]['id']
        old=[{'coll':'punches','id':f'pold{i}','data':{'id':f'pold{i}','who':emp,'site':'t32','in':ms(200+i),'out':ms(200+i)+8*3600000},'updated_at':iso(200+i)} for i in range(30)]
        new=[{'coll':'punches','id':f'pnew{i}','data':{'id':f'pnew{i}','who':emp,'site':'t32','in':ms(2+i),'out':ms(2+i)+8*3600000},'updated_at':iso(2+i)} for i in range(10)]
        oldsite=[{'coll':'sites','id':'tOLD','data':{'id':'tOLD','name':'Old job, still open','lat':41,'lng':-74},'updated_at':iso(400)}]
        srvpost('/__seed',{'users':[],'rows':old+new+oldsite})
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,A,e,_=await login(b,'Baruch','Testpass123','iphone'); await ready(A); await settle(A)
            ids=await A.evaluate("D.punches.map(x=>x.id)")
            check('start-up: recent clock entries are on the phone',all(f'pnew{i}' in ids for i in range(10)),len(ids))
            check('start-up: clock entries untouched for 130+ days are not downloaded again',not any(f'pold{i}' in ids for i in range(30)))
            check('… they are still on the server (nothing deleted)',sum(1 for r in srv('/__records?coll=punches') if r['id'].startswith('pold') and not r['deleted'])==30)
            check('start-up: a job not changed for over a year is still downloaded (only history is windowed)',await A.evaluate("D.sites.some(s=>s.id==='tOLD')"))
            # selfie on a clock-in
            pid=await A.evaluate(f"(()=>{{const id=nid('p');D.punches.push({{id,who:me().id,site:'t32',in:Date.now(),selfie:'{FAKE_JPEG}'}});save();return id}})()")
            await settle(A,15000); await A.wait_for_timeout(1000)
            row=[r for r in srv('/__records?coll=punches') if r['id']==pid]
            sv=row and row[0]['data'].get('selfie','')
            check('clock-in selfie is stored as a file, not inside the punch',bool(row) and str(sv).startswith('http'),(sv or '')[:60])
            check('… the phone copy holds the link too (small)',await A.evaluate(f"(D.punches.find(x=>x.id==='{pid}').selfie||'').length<400"))
            # offline clock-in with a selfie: waits, then goes up once there is a signal
            net('refuse')
            pid2=await A.evaluate(f"(()=>{{const id=nid('p');D.punches.push({{id,who:me().id,site:'t32',in:Date.now(),selfie:'{FAKE_JPEG}'}});save();return id}})()")
            await A.wait_for_timeout(4000)
            check('no signal: the selfie clock-in waits on the phone',not any(r['id']==pid2 for r in srv('/__records?coll=punches')))
            net('ok'); await A.evaluate("window.dispatchEvent(new Event('online'))"); await settle(A,20000); await A.wait_for_timeout(1500)
            row=[r for r in srv('/__records?coll=punches') if r['id']==pid2]
            check('… signal back: clock-in reaches the server with its selfie as a file',bool(row) and str(row[0]['data'].get('selfie','')).startswith('http'),row[:1])
            # a reload after all this: still fine, history window holds
            await A.reload(); await A.wait_for_timeout(1200); await until(A,"EX_ready&&EX_ready()",20000)
            ids=await A.evaluate("D.punches.map(x=>x.id)")
            check('after reopening: today\'s clock-ins are there, old ones still not downloaded',pid in ids and pid2 in ids and not any(i.startswith('pold') for i in ids))
            errs=e; check('no page errors',not errs,errs[:3])
            await b.close()
    finally: sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
