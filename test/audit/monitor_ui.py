"""M1 — automatic error reports on the phone (the server side is tests/security/m1_regression.sql)."""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,W,ew,_=await login(b,'Carlos','Testpass123','iphone'); await ready(W); await settle(W)
            await W.evaluate("setTimeout(()=>{throw new Error('zz boom on a screen')},0)"); await W.wait_for_timeout(300)
            await W.evaluate("setTimeout(()=>{throw new Error('zz boom on a screen')},0)"); await W.wait_for_timeout(300)
            buf=await W.evaluate("EX_errBuf()")
            check('an app crash is written down on the phone (same problem counted, not repeated)',any('zz boom on a screen' in x['msg'] and x['n']==2 and x['kind']=='error' for x in buf),buf)
            await W.evaluate("window.dispatchEvent(new CustomEvent('ex-rejected',{detail:{rows:[{coll:'jobs',id:'x'}]}}))")
            check('a save the server refused is written down',any(x['kind']=='refused' and 'jobs' in x['msg'] for x in await W.evaluate("EX_errBuf()")))
            await W.evaluate("(()=>{Promise.reject(new Error('Failed to fetch'));return 1})()"); await W.wait_for_timeout(200)
            check('lost-connection noise is not reported',not any('Failed to fetch' in x['msg'] for x in await W.evaluate("EX_errBuf()")))
            await W.evaluate("EX_sendErrors()"); await W.wait_for_timeout(500)
            check('if the server can\'t take the report yet, it is kept for later',len(await W.evaluate("EX_errBuf()"))>=2)
            calls=[]
            await W.evaluate("(()=>{const sb=window.EX_sb;const o=sb.rpc.bind(sb);sb.rpc=(n,a)=>n==='log_client_errors'?(window._sent=a,Promise.resolve({data:a.p_rows.length,error:null})):o(n,a);})()")
            await W.evaluate("EX_sendErrors()"); await W.wait_for_timeout(500)
            sent=await W.evaluate("window._sent")
            check('reports go to the server with only the problem, the screen and the phone type (no personal data)',sent and all(set(r.keys())<= {'kind','msg','src','n','ver','ua'} for r in sent['p_rows']),sent)
            check('… and are cleared from the phone once received',len(await W.evaluate("EX_errBuf()"))==0)
            check('no other page errors than the test ones',all(('zz boom' in x or 'Failed to fetch' in x) for x in ew),ew[:3])
    finally:
        sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
