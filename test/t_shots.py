import asyncio,os,time,subprocess
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'t_sync.py')).read().split('async def main')[0])
SP='/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/'
async def m():
    sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver.js'),str(PORT)]);time.sleep(0.8)
    try:
      async with async_playwright() as p:
        b=await p.chromium.launch()
        ca,A,ea=await phone(b,'owner')
        await A.screenshot(path=SP+'real_login.png')
        await A.evaluate("askPrompt=(t,f,cb)=>cb(['ownerpass1','clean']);0"); await A.evaluate("exSetup()")
        await until(A,"(D.keep||[]).some(n=>/Team passwords/.test(n.title||''))",30000)
        await A.evaluate("document.querySelectorAll('div.ov[id^=m-]').forEach(o=>o.classList.add('hid'));goTab('home')"); await A.wait_for_timeout(800)
        await A.screenshot(path=SP+'real_home.png')
        await A.evaluate("goTab('more')"); await A.wait_for_timeout(400); await A.screenshot(path=SP+'real_more.png')
        print(ea); await b.close()
    finally: sp.kill()
asyncio.run(m())
