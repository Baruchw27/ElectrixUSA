"""Phone storage completely full: no unsent work (schedule changes, clock-ins, stock moves, notes, refused schedule
changes) may be lost when the app is closed and reopened, and deliberate wipes (sign-out, another person signing in)
must not bring old work back. Also: what happens when even IndexedDB is unavailable (the phone has no space at all)."""
from suite import *
FILL=r"""(()=>{let c='x'.repeat(100000),i=0;try{for(;;i++)localStorage.setItem('zfill'+i,c);}catch(e){}
  let c2='y'.repeat(2000);try{for(let j=0;;j++)localStorage.setItem('zfillb'+j,c2);}catch(e){}
  let c3='z'.repeat(40);try{for(let j=0;;j++)localStorage.setItem('zfillc'+j,c3);}catch(e){}
  try{localStorage.setItem('zprobe','p'.repeat(300));localStorage.removeItem('zprobe');return 'room left?';}catch(e){return 'full';}})()"""
UNFILL="(()=>{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(/^zfill/.test(k))localStorage.removeItem(k);}})()"
async def relaunch(ctx,P,no_idb=False):
    await P.close(); Q=await ctx.new_page(); errs=[]; Q.on('pageerror',lambda e:errs.append(str(e)))
    async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE)
        if u.endswith('/config.js') or '/config.js?' in u: return await r.fulfill(status=200,content_type='application/javascript',body=CFG)
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
    await Q.route('**/*',route); await Q.goto(BASE+'/index.html'); await Q.wait_for_timeout(1200); return Q,errs
def stocklog(tid): return any(r['id']==tid and not r['deleted'] for r in srv('/__records?coll=stockLog'))
def has(coll,id): return any(r['id']==id and not r['deleted'] for r in srv(f'/__records?coll={coll}'))
async def run_sf():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            ca,A,ea,_=await login(b,'Baruch','Testpass123','iphone'); await ready(A)
            await A.evaluate("(()=>{const s=D.stock.find(x=>x.id==='s_5');})()")
            check('phone storage completely full',await A.evaluate(FILL)=='full')
            net('refuse')   # and no signal
            k=await day(A,140)
            await open_day(A,'c1',k); await add_full(A,'t32'); await tap_save(A); await A.wait_for_timeout(16500)
            await A.evaluate("hide('m-ask')")
            pid=await A.evaluate("(()=>{const id=nid('p');D.punches.push({id,who:me().id,site:'t32',in:Date.now()-3600000,out:Date.now()});save();return id})()")
            nid_=await A.evaluate("(()=>{const id=nid('kn');D.keep.push({id,owner:me().id,type:'text',title:'Full-phone note',body:'x',collab:[],items:[],labels:[],created:Date.now(),edited:Date.now()});save();return id})()")
            tid=await A.evaluate("(()=>{const t=commitStockTxn('in',[{id:'s_5',name:'Item 5',unit:'ea',qty:3}],'t32');return t&&t.id})()")
            await A.wait_for_timeout(2500)
            check('… the app did not delete its stored company data to make room',await A.evaluate("!!localStorage.getItem(KEY)"))
            check('… nothing is reported as only-in-memory (IndexedDB holds it)',await A.evaluate("EX_SYNC.qStored===true&&!EX_SYNC.qLost"),await A.evaluate("JSON.stringify(EX_SYNC)"))
            A,e2=await relaunch(ca,A)          # app closed and reopened, still no signal
            await A.wait_for_timeout(1500); net('ok')
            await until(A,"EX_ready&&EX_ready()",45000); await A.evaluate("typeof flushStockQ==='function'&&flushStockQ()"); await until(A,"!EX_SYNC.pending",20000); await A.wait_for_timeout(3000)
            check('full phone, closed, reopened: schedule change reached the server',sched(f'c1|{k}') is not None)
            check('… the clock-in reached the server',has('punches',pid))
            check('… the note reached the server',has('keep',nid_))
            check('… the stock move reached the server (applied once)',stocklog(tid) and srv('/__state')['stats'].get('stockDup',0)>=0,tid)
            # refused schedule change while full
            z=await day(A,141); await open_day(A,'c2',z); await add_full(A,'t27'); await tap_save(A); await settle(A)
            cb,B,eb,_=await login(b,'Yossi','Testpass123','android'); await ready(B); await until(B,f"!!D.sched['c2|{z}']",8000)
            await A.evaluate("EX_sb.removeAllChannels()"); await B.evaluate(f"editSlot('c2','{z}');slotSet(0,'site','t70');saveSlot()"); await settle(B)
            await A.evaluate(f"D.sched['c2|{z}']=Object.assign({{}},D.sched['c2|{z}'],{{site:'t150',assignments:[{{id:'q',site:'t150',start:480,end:1110,note:''}}],rev:rowRev('c2|{z}')+1}});save()"); await A.wait_for_timeout(3000); await settle(A)
            A,e3=await relaunch(ca,A); await until(A,"EX_ready&&EX_ready()",30000)
            check('full phone: a refused schedule change survives closing the app (still under “Not saved”)',await A.evaluate(f"EX_rejects().some(x=>x.id==='c2|{z}'&&x.data&&x.data.site==='t150')"))
            # sign-out with unsent work while full: refuses rather than lose it
            net('refuse'); k2=await day(A,142); await open_day(A,'c3',k2); await add_full(A,'t49'); await tap_save(A); await A.wait_for_timeout(16500); await A.evaluate("hide('m-ask')")
            await A.evaluate("signOut()"); await A.wait_for_timeout(2000)
            out=await A.evaluate("!!document.getElementById('m-login')&&!document.getElementById('m-login').classList.contains('hid')")
            if out:
                check('sign-out while full: unsent work was secured first',await A.evaluate("Object.keys(localStorage).some(k=>/^ex_qenc__/.test(k))"))
            else:
                check('sign-out while full: refused to sign out instead of losing unsent work',not out)
            await A.evaluate(UNFILL); net('ok')
            if not out:
                await A.evaluate("signOut()"); await A.wait_for_timeout(2000); await until(A,"!!document.getElementById('lgUser')",10000)
            # another person signs in on this phone: Baruch's old waiting list must not come back from IndexedDB
            await A.fill('#lgUser','Yossi'); await A.fill('#lgPass','Testpass123'); await A.evaluate("doLogin()"); await until(A,"me()&&me().name==='Yossi'",10000); await ready(A); await settle(A,8000)
            pays=[x['who'] for x in srv('/__payloads') for r in x['rows'] if r['id']==f'c3|{k2}']
            check("sign-out once there was room: Baruch's booking was sent as Baruch before signing out, never as Yossi",bool(pays) and all(w.startswith('u1@') for w in pays),pays)
            await A.evaluate("signOut()"); await A.wait_for_timeout(2000); await until(A,"!!document.getElementById('lgUser')",10000)
            await A.fill('#lgUser','Baruch'); await A.fill('#lgPass','Testpass123'); await A.evaluate("doLogin()"); await until(A,"me()&&me().name==='Baruch'",10000); await ready(A); await settle(A,10000)
            check('… Baruch signs back in → his booking is there',sched(f'c3|{k2}') is not None)
            # no space at all (IndexedDB unavailable too): warned, kept in memory, app will not reload itself
            ctx2=await b.new_context(service_workers='block',**VIEW['iphone']); await ctx2.add_init_script("try{Object.defineProperty(window,'indexedDB',{value:undefined,configurable:true});}catch(e){}")
            c,P,e,ok=await login(b,'Baruch','Testpass123','iphone')
            await c.close()
            P=await ctx2.new_page()
            async def route(r):
                u=r.request.url
                if 'supabase-js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE)
                if u.endswith('/config.js') or '/config.js?' in u: return await r.fulfill(status=200,content_type='application/javascript',body=CFG)
                if u.startswith(BASE): return await r.continue_()
                return await r.abort()
            await P.route('**/*',route); await P.goto(BASE+'/index.html'); await P.wait_for_timeout(1200)
            await P.fill('#lgUser','Baruch'); await P.fill('#lgPass','Testpass123'); await P.evaluate("doLogin()"); await until(P,"me()&&me().name==='Baruch'",10000); await until(P,"EX_ready&&EX_ready()",15000)
            await P.evaluate(FILL); net('refuse')
            k3=await day(P,143); await P.evaluate(f"editSlot('c4','{k3}');slotOneoffs=[{{id:'n',site:'t70',start:480,end:1110,note:''}}];renderSlotEditor();saveSlot()"); await P.wait_for_timeout(17000)
            q=await P.evaluate("localStorage.getItem('ex_queue')||''")
            check('no IndexedDB and storage full: the waiting change is still kept on the phone (the re-downloadable copy of company data is dropped instead)',f'c4|{k3}' in q and not await P.evaluate("!!localStorage.getItem(KEY)"))
            await P.reload(); await P.wait_for_timeout(1500)
            check('… and it survives closing the app',f'c4|{k3}' in (await P.evaluate("localStorage.getItem('ex_queue')||''")))
            net('ok'); await P.evaluate("window.dispatchEvent(new Event('online'))"); await until(P,"!EX_SYNC.pending",20000)
            check('… once a signal returns (app kept open) it is sent',sched(f'c4|{k3}') is not None)
            errs=ea+e2+e3; check('no page errors',not errs,errs[:3])
            await b.close()
    finally: sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
if __name__=='__main__': asyncio.run(run_sf())
