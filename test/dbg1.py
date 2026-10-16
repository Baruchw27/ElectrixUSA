import asyncio,subprocess,time,os,json,urllib.request
from playwright.async_api import async_playwright
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'t_sync.py')).read().split('async def main')[0])
async def m():
    sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver.js'),str(PORT)]);time.sleep(0.8)
    try:
      async with async_playwright() as p:
        b=await p.chromium.launch();ca,A,ea=await phone(b,'o')
        A.on('console',lambda m:print('C',m.text[:200]))
        await A.evaluate("askPrompt=(t,f,cb)=>cb(['ownerpass1','clean']);0");await A.evaluate("exSetup()")
        await A.wait_for_timeout(9000)
        print(await A.evaluate("[_t.slice(-6),_c.map(x=>x.slice(0,80)),(D.keep||[]).length,me()&&me().name]"))
        print(ea)
    finally: sp.kill()
asyncio.run(m())
