"""Stress — five people on five phones at once, every role, with a bad connection, phones closed in the middle of a save,
saves that reach the server but whose answer is lost, and everyone changing the same job at the same moment. Every
check reads the SERVER's copy (what is really saved), not the phone's screen."""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
def rec(coll,i):
    r=[x for x in srv('/__records?coll='+coll) if x['id']==i]; return r[0] if r else None
async def reopen(ctx):
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append('reopened: '+str(e)))
    async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE)
        if u.endswith('/config.js') or '/config.js?' in u: return await r.fulfill(status=200,content_type='application/javascript',body=CFG)
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
    await pg.route('**/*',route); await pg.goto(BASE+'/index.html'); return pg,errs
def drop(n=1): urllib.request.urlopen(BASE+'/__dropresp?n='+str(n))
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            ph={}
            for who,kind in [('Baruch','iphone'),('Yossi','android'),('Miriam','desktop'),('Carlos','iphone'),('Luis','android')]:
                c,P,e,ok=await login(b,who,'Testpass123',kind); await ready(P); await settle(P); ph[who]=(c,P,e)
                check(f'{who} signed in ({kind})',ok)
            O,Y,M,C,L=[ph[n][1] for n in ['Baruch','Yossi','Miriam','Carlos','Luis']]
            # ── 1. weak connection (every request 2.5 s late) — every role works at the same time ──
            net('2500')
            pid=await C.evaluate("(()=>{const id=nid('p');D.punches.push({id,who:me().id,site:'t32',in:Date.now()-60000,out:null});save();return id})()")
            jid=await Y.evaluate("(()=>{const id=nid('j');D.jobs.unshift({id,ts:Date.now(),to:['u8'],from:me().id,site:'t32',desc:'Stress task',status:'open'});save();return id})()")
            sid=await O.evaluate("(()=>{const id=nid('s');D.sites.push({id,name:'77 Stress Test Ln, Monsey',client:'Stress',phase:'rough',files:[],links:[],insp:[],rad:300});save();return id})()")
            kid=await L.evaluate("(()=>{const id=nid('kn');keepInit();D.keep.push({id,owner:me().id,type:'text',title:'Stress note',body:'line 1\\n  line 2',items:[],color:'0',labels:[],collab:[],created:Date.now(),edited:Date.now()});save();return id})()")
            xid=await M.evaluate("(()=>{const id=nid('x');D.exps.unshift({id,who:me().id,type:'material',src:'company',paid:false,amt:12.5,vendor:'Stress Supply',site:'t32',date:dkey(new Date()),note:''});save();return id})()")
            for n in ph: await settle(ph[n][1],30000)
            net('ok')
            for n in ph: await settle(ph[n][1],15000)
            r=rec('punches',pid); check('slow connection: worker\'s clock-in saved on the server',r and not r['deleted'] and r['data'].get('who')=='u7',r)
            r=rec('jobs',jid); check('… manager\'s new task saved',r and r['data'].get('desc')=='Stress task',r)
            r=rec('sites',sid); check('… owner\'s new job saved',r and r['data'].get('client')=='Stress',r)
            r=rec('keep',kid); check('… worker\'s note saved exactly as typed',r and r['data'].get('body')=='line 1\n  line 2',r)
            r=rec('exps',xid); check('… Payroll\'s receipt saved with the amount',r and r['data'].get('amt')==12.5,r)
            # the others see it (live) without reloading
            await until(L,f"D.jobs.some(j=>j.id==='{jid}')",10000)
            check('… and the worker it was given to sees the task on his phone',await L.evaluate(f"D.jobs.some(j=>j.id==='{jid}')"))
            # ── 2. phone closed in the middle of a save ──
            net('1500')
            cC,_,_=ph['Carlos']
            await C.evaluate(f"(()=>{{const p=D.punches.find(x=>x.id==='{pid}');p.out=Date.now();save();}})()"); await C.wait_for_timeout(300)
            await C.close()
            net('ok')
            C2,e2=await reopen(cC); await until(C2,"EX_ready&&EX_ready()",20000); await settle(C2,15000)
            r=rec('punches',pid); check('phone closed while sending the clock-out: after opening the app again it is on the server',r and r['data'].get('out'),r and r['data'])
            check('… once (one entry, not two)',len([x for x in srv('/__records?coll=punches') if (x['data'] or {}).get('who')=='u7' and not x['deleted'] and (x['data'] or {}).get('site')=='t32' and abs(((x['data'] or {}).get('in') or 0)-(r['data'].get('in') or 0))<1000])==1)
            # ── 3. the save reaches the server but the answer is lost ──
            drop(1)
            await Y.evaluate(f"(()=>{{const j=D.jobs.find(x=>x.id==='{jid}');j.due='Today';save();}})()"); await Y.wait_for_timeout(1500); await settle(Y,20000); await Y.wait_for_timeout(1500); await settle(Y,20000)
            r=rec('jobs',jid); check('answer lost after saving: the change is on the server and the phone does not get stuck',r and r['data'].get('due')=='Today' and await Y.evaluate("!EX_SYNC.pending"),[r and r['data'],await Y.evaluate("JSON.stringify(EX_SYNC)")])
            # ── 4. everyone changes the same job at the same moment ──
            await until(L,f"D.jobs.some(j=>j.id==='{jid}')",8000); await until(O,f"D.jobs.some(j=>j.id==='{jid}')",8000)
            await asyncio.gather(
                L.evaluate(f"(()=>{{const j=D.jobs.find(x=>x.id==='{jid}');j.status='prog';save();}})()"),
                Y.evaluate(f"(()=>{{const j=D.jobs.find(x=>x.id==='{jid}');j['m_'+nid('m')]={{by:me().id,ts:Date.now(),text:'from Yossi'}};save();}})()"),
                O.evaluate(f"(()=>{{const j=D.jobs.find(x=>x.id==='{jid}');j['m_'+nid('m')]={{by:me().id,ts:Date.now(),text:'from Baruch'}};j.pri=true;save();}})()"),
                L.evaluate(f"(()=>{{const j=D.jobs.find(x=>x.id==='{jid}');j['m_'+nid('m')]={{by:me().id,ts:Date.now(),text:'from Luis'}};save();}})()"))
            for n in ['Baruch','Yossi','Luis']: await settle(ph[n][1],15000)
            d=(rec('jobs',jid) or {}).get('data') or {}
            msgs=sorted(v.get('text') for k,v in d.items() if k.startswith('m_'))
            check('same job changed on 3 phones at once: every chat message kept',msgs==['from Baruch','from Luis','from Yossi'],msgs)
            check('… the worker\'s status and the owner\'s priority both kept',d.get('status')=='prog' and d.get('pri') is True,{k:d.get(k) for k in ('status','pri')})
            await asyncio.sleep(2)
            same=[await ph[n][1].evaluate(f"(()=>{{const j=D.jobs.find(x=>x.id==='{jid}');return j?Object.keys(j).filter(k=>k.startsWith('m_')).length+'|'+j.status+'|'+j.pri:null}})()") for n in ['Baruch','Yossi','Luis']]
            check('… and all three phones show the same final job',len(set(same))==1 and same[0]=='3|prog|true',same)
            # ── 5. all five phones online again, nothing left waiting, no errors ──
            for n in ['Baruch','Yossi','Miriam','Luis']:
                check(f'{n}: nothing left unsent',await ph[n][1].evaluate("!EX_SYNC.pending"))
            check('Carlos (reopened): nothing left unsent',await C2.evaluate("!EX_SYNC.pending"))
            errs=sum([ph[n][2] for n in ph],[])+e2
            check('no page errors on any phone',not errs,errs[:3])
            await b.close()
    finally:
        sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
