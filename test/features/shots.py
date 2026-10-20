from fharness import *
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'shots')
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,O,e,ok=await go(b,'Baruch','iphone')
            await O.evaluate("D.jobs.unshift({id:'j1',ts:Date.now(),to:['u6'],from:'u1',site:'t32',desc:'Kitchen:\\n\\n* 5 outlets\\n* 3 switches\\n\\n\\nBasement:\\n    * 6 lights',status:'open',due:'Today'});pushTo(['u1'],'📋 Jon finished: Hang fixtures','info',{job:'j1'});pushTo(['u1'],'🔴 PRIORITY — Panel at 29 Oxford','pri',{job:'j1'});save();0")
            await O.evaluate("openSearch()"); await O.fill('#sqInput','union'); await O.wait_for_timeout(300); await O.screenshot(path=OUT+'/1_search.png')
            await O.evaluate("hide('m-search');openInbox('n')"); await O.wait_for_timeout(200); await O.screenshot(path=OUT+'/2_notifications.png')
            await O.evaluate("EX_nTab('t')"); await O.wait_for_timeout(200); await O.screenshot(path=OUT+'/3_mytasks.png')
            await O.evaluate("hide('m-inbox');openJob()"); await O.click('#m-job .exjp input'); await O.keyboard.type('viola'); await O.wait_for_timeout(200); await O.screenshot(path=OUT+'/4_jobpicker.png')
            await O.evaluate("hide('m-job');openEmp('u2')"); await O.wait_for_timeout(200)
            await O.evaluate("document.getElementById('exClockWrap').scrollIntoView()"); await O.screenshot(path=OUT+'/5_timeclock.png')
            await O.evaluate("hide('m-emp');goTab('jobs')"); await O.wait_for_timeout(300); await O.screenshot(path=OUT+'/6_taskcard.png')
            print(e)
            await b.close()
    finally: sp.kill()
asyncio.run(run())
