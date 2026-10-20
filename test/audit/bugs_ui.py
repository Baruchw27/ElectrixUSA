"""Bug sweep B1 — notification and inventory fixes, on simulated phones with the stand-in server.
(The phone-notification server function and database parts are checked on staging: functions/notify (B1),
db/audit_b1_notify.sql, db/audit_b1_stock_deleted.sql.)"""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
def inbox(): return [r for r in srv('/__records?coll=inbox') if not r['deleted']]
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
            c,Y,ey,_=await login(b,'Yossi','Testpass123','android'); await ready(Y); await settle(Y)
            # ── notifications ──
            await Y.evaluate("D.emps.find(e=>e.id==='u7').lang='es';D.emps.find(e=>e.id==='u8').lang='en';0")
            await Y.evaluate("pushTo(['u7','u8'],()=>('✓ '+t('Done by')+' '+nameOf(me().id)+': '+t('Approved')),'info',null)"); await settle(Y)
            rows={r['data']['to']:r['data']['msg'] for r in inbox() if 'Yossi' in (r['data'].get('msg') or '')}
            check('each person gets the message in THEIR language (Spanish worker: Spanish, English worker: English)',rows.get('u7')=='✓ Terminado por Yossi: Aprobado' and rows.get('u8')=='✓ Done by Yossi: Approved',rows)
            check('… and the sender\'s own screen stays in his language',await Y.evaluate("t('Approved')")=='Approved')
            # a real screen: marking someone's task done tells the person who made it, in their language
            await Y.evaluate("D.jobs.unshift({id:'jB1',ts:Date.now(),to:['u2'],from:'u7',site:'t32',desc:'Hang the fixture',descLang:'en',descTr:'Colgar la lámpara',status:'open'});save()"); await settle(Y)
            await Y.evaluate("const _f=window.askPhoto;try{markDone('jB1')}catch(e){console.warn(e)}"); await settle(Y); await Y.wait_for_timeout(400)
            m7=[r['data']['msg'] for r in inbox() if r['data'].get('to')=='u7' and 'Yossi' in (r['data'].get('msg') or '') and 'Aprobado' not in r['data']['msg']]
            check('marking a task done: the Spanish-speaking worker who made it reads it in Spanish',any('Terminado por' in x or 'Colgar' in x for x in m7),m7)
            n0=len(inbox())
            await Y.evaluate("pushTo([me().id,'u7'],()=>'zz self test','info',null)"); await settle(Y)
            mine=[r for r in inbox() if r['data'].get('msg')=='zz self test']
            check('your own action does not notify you (only the others)',[r['data']['to'] for r in mine]==['u7'],[r['data']['to'] for r in mine])
            await Y.evaluate("pushTo([me().id],()=>'zz only me','info',null)"); await settle(Y)
            check('… a reminder meant only for you still reaches you',any(r['data'].get('msg')=='zz only me' and r['data']['to']=='u2' for r in inbox()))
            await Y.evaluate("D.emps.find(e=>e.id==='u13').inactive=true;pushTo(['u13','u12'],()=>'zz inactive test','info',null)"); await settle(Y)
            check('a turned-off employee gets nothing',[r['data']['to'] for r in inbox() if r['data'].get('msg')=='zz inactive test']==['u12'])
            await Y.evaluate("D.emps.find(e=>e.id==='u13').inactive=false;0")
            await Y.evaluate("pushTo(['u7'],()=>'zz reminder once','pri',{insp:'i1'},'niTEST');pushTo(['u7'],()=>'zz reminder once','pri',{insp:'i1'},'niTEST')"); await settle(Y)
            check('inspection reminders: the same reminder from two phones is one message',len([r for r in inbox() if r['data'].get('msg')=='zz reminder once'])==1)
            await Y.evaluate("D.inbox.push({id:'nOld',to:me().id,msg:'zz old one',kind:'info',ts:Date.now()-86400000,read:false,from:'u1'});D.inbox.unshift({id:'nNew',to:me().id,msg:'zz new one',kind:'info',ts:Date.now(),read:false,from:'u1'});openInbox()"); await Y.wait_for_timeout(200)
            txt=await Y.evaluate("document.getElementById('inboxList').innerText")
            check('the bell shows newest first and who sent it',txt.find('zz new one')<txt.find('zz old one') and 'from Baruch' in txt,txt[:300])
            await Y.evaluate("hide('m-inbox')")
            check('tapping a phone notification opens that message (job opens)',await Y.evaluate("(()=>{const id=D.inbox.find(x=>x.link&&x.link.job)?.id;if(!id)return 'none';return openFromPush(id)})()") is True)
            # ── inventory ──
            sid=await Y.evaluate("D.stock.find(x=>x.qty>0&&x.qty<100).id")
            srv('/__counted?id='+sid)   # S1: shortages are only refused for counted items — this one is counted
            base=await Y.evaluate(f"stockItem('{sid}').qty")
            await Y.evaluate(f"openPickup();puLines=[{{id:'{sid}',name:stockItem('{sid}').name,unit:'pc',qty:{base+50}}}];puRender();document.getElementById('puSite').value='t32';window._t=[]")
            await Y.evaluate("savePickup()"); await Y.wait_for_timeout(2500)
            tt=await Y.evaluate("window._t")
            check('online pick-up the server refuses (more than the garage has): clear message, NOT "saved — will sync"',any('Not enough' in x for x in tt) and not any('will sync' in x for x in tt),tt)
            check('… the typed lines are kept so it can be fixed',await Y.evaluate("puLines.length")==1)
            # put 5 back, then take 2 out: real answers, counts right
            await Y.evaluate(f"window._t=[];(async()=>{{const tx=commitStockTxn('in',[{{id:'{sid}',name:stockItem('{sid}').name,unit:'pc',qty:5}}],null,{{src:'test'}});window._r1=await confirmStockTxn(tx.id)}})()"); await Y.wait_for_timeout(2000)
            check('put-back online: the app waits for the server and reports saved',await Y.evaluate("window._r1&&window._r1.status")=='saved',await Y.evaluate("window._r1"))
            await Y.evaluate(f"window._t=[];puLines=[{{id:'{sid}',name:stockItem('{sid}').name,unit:'pc',qty:2}}];savePickup()"); await Y.wait_for_timeout(2500)
            tt=await Y.evaluate("window._t")
            check('pick-up online: confirmed by the server (job named), count right',any('→' in x for x in tt) and not any('will sync' in x for x in tt) and await Y.evaluate(f"stockItem('{sid}').qty")==base+3,[tt,await Y.evaluate(f"stockItem('{sid}').qty")])
            await Y.evaluate("window._t=[];openPickup();puLines=[{name:'zz Unknown Widget 9000',unit:'pc',qty:1}];puRender();savePickup()"); await Y.wait_for_timeout(300)
            tt=await Y.evaluate("window._t")
            check('pick-up of something not on the garage list is stopped on the phone (no junk item made)',any('not on the garage list' in x for x in tt) and not await Y.evaluate("D.stock.some(s=>s.name==='zz Unknown Widget 9000')"),tt)
            await Y.evaluate(f"puLines=[{{id:'{sid}',name:'x',unit:'ft',qty:1}}];puRender()")
            await Y.fill('#puLines input',''); await Y.fill('#puLines input','12.5'); await Y.dispatch_event('#puLines input','change')
            check('decimals are kept (12.5 ft)',await Y.evaluate("puLines[0].qty")==12.5,await Y.evaluate("puLines[0].qty"))
            await Y.evaluate("hide('m-pick2')")
            # an unknown server error: after 3 tries it is set aside, later moves go through
            await Y.evaluate("""(()=>{const sb=window.EX_sb;window._rpc0=sb.rpc.bind(sb);let n=0;sb.rpc=function(name,args){if(name==='apply_stock_txn'&&args&&args.txn&&args.txn.reason==='zz-bad'){n++;window._badTries=n;return Promise.resolve({data:null,error:{code:'42883',message:'function x does not exist'}});}return window._rpc0(name,args);};})()""")
            await Y.evaluate(f"window._t=[];commitStockTxn('in',[{{id:'{sid}',name:'x',unit:'pc',qty:1}}],null,{{reason:'zz-bad'}});commitStockTxn('in',[{{id:'{sid}',name:'x',unit:'pc',qty:1}}],null,{{reason:'zz-good'}})")
            for _ in range(3):
                await Y.evaluate("flushStockQ()"); await Y.wait_for_timeout(500)
            check('a short hiccup (several quick retries within a minute) counts as ONE try — the move is not set aside',await Y.evaluate("stockQ().some(x=>x.reason==='zz-bad'&&x.tries===1)"),await Y.evaluate("stockQ().map(x=>[x.reason,x.tries])"))
            for _ in range(3):
                await Y.evaluate("(()=>{const q=stockQ();q.forEach(x=>x.lastTry=0);stockQSave(q)})()"); await Y.evaluate("flushStockQ()"); await Y.wait_for_timeout(700)
            q=await Y.evaluate("stockQ().map(x=>x.reason)")
            check('a move the server refuses with an unknown error is set aside after 3 tries (kept for the office) and does not block the next one',q==[] and await Y.evaluate("(D.rejq||[]).some(x=>x.src==='stock')"),[q,await Y.evaluate("window._badTries")])
            await Y.evaluate("window.EX_sb.rpc=window._rpc0")
            # camera
            await Y.evaluate("""(()=>{window._streams=[];const g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=c=>g(c).then(s=>{_streams.push(s);return new Promise(r=>setTimeout(()=>r(s),600));});})()""")
            await Y.evaluate("scanOpen('out');setTimeout(scanClose,100)"); await Y.wait_for_timeout(1500)
            st=await Y.evaluate("_streams.map(s=>s.getTracks().map(t=>t.readyState).join())")
            check('scanner closed while the camera was still starting: the camera is released',st and all(x=='ended' for x in st),st)
            await Y.evaluate("_streams=[];scanOpen('out')"); await Y.wait_for_timeout(1500)
            await Y.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))"); await Y.wait_for_timeout(300)
            st=await Y.evaluate("_streams.map(s=>s.getTracks().map(t=>t.readyState).join())")
            check('app hidden (screen locked): the camera is switched off',st and all(x=='ended' for x in st),st)
            await Y.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))"); await Y.wait_for_timeout(1500)
            st=await Y.evaluate("_streams.map(s=>s.getTracks().map(t=>t.readyState).join())")
            check('… and back on when the app is opened again',len(st)>=2 and st[-1]=='live',st)
            await Y.evaluate("scanClose()"); await Y.wait_for_timeout(300)
            check('… and off again when the scanner is closed',all(x=='ended' for x in await Y.evaluate("_streams.map(s=>s.getTracks().map(t=>t.readyState).join())")))
            # stock search speed
            await Y.evaluate("goTab('tools');garageView='stock';renderStock()"); await Y.wait_for_timeout(200)
            await Y.evaluate("document.getElementById('skSearch').value='item';document.getElementById('skSearch').dispatchEvent(new Event('input'))"); await Y.wait_for_timeout(500)
            n=await Y.evaluate("document.querySelectorAll('#skList .card').length")
            check('stock search shows at most 80 matches (with "type more")',n<=80 and 'more' in (await Y.evaluate("document.getElementById('skList').innerText")).lower(),n)
            check('no errors on the phone',not ey,ey[:3])
    finally:
        sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
