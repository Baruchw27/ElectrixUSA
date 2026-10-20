"""Run the on-phone self-test (staging/selftest.js) in the emulator, to make sure the script itself is right before a
real phone runs it."""
from harness import *
SEED=json.load(open(os.path.join(HERE,'seed_prod.json')))
async def main():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,P,e,ok=await login(b,'Baruch','Testpass123',os.environ.get('KIND','iphone'))
            # use the app's real confirmation dialogs (the test harness normally auto-answers them)
            await P.add_init_script("window.addEventListener('load',()=>{askConfirm=function(msg,onYes,okLabel){ask(msg,'',onYes,okLabel);};});")
            await P.goto(BASE+'/index.html?selftest=1'); await P.wait_for_timeout(1500)
            okb=await until(P,"!!document.querySelector('#stBtns button')",30000)
            if not okb: print('STATE',await P.evaluate("JSON.stringify({src:[...document.scripts].map(s=>s.src).filter(s=>/selftest/.test(s)),ready:EX_ready(),me:!!me(),login:document.getElementById('m-login').className,box:!!document.getElementById('stLog'),q:location.search})"),e)
            await P.click('#stBtns button')
            async def log(): return await P.evaluate("(document.getElementById('stLog')||{}).innerText||''")
            # after the mid-save reload it asks about the offline test
            await until(P,"/Airplane/.test((document.getElementById('stBtns')||{}).innerText||'')||/Continue/.test((document.getElementById('stBtns')||{}).innerText||'')",180000)
            await c.set_offline(True); await P.evaluate("window.dispatchEvent(new Event('offline'))"); await P.click("#stBtns button:has-text('Continue')")
            await until(P,"/turn OFF/i.test(document.body.innerText)||/Continue/.test(document.getElementById('stBtns').innerText)",30000); await P.wait_for_timeout(3000)
            await c.set_offline(False); await P.click("#stBtns button:has-text('Continue')")
            await until(P,"/RESULT/.test(document.getElementById('stLog').innerText)&&/Report saved/.test(document.getElementById('stLog').innerText)",120000)
            print(await log()); print('errors',e)
            reps=[r for r in srv('/__records?coll=selftest')]; print('reports on server:',len(reps))
            await b.close()
    finally: sp.kill()
asyncio.run(main())
