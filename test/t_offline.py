import asyncio,os,time,subprocess
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'t_sync.py')).read().split('async def main')[0])
async def m():
    sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver.js'),str(PORT)]);time.sleep(0.8)
    try:
      async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':390,'height':844})
        pg=await ctx.new_page()
        await pg.goto(BASE+'/index.html');await pg.wait_for_timeout(1500)
        await pg.screenshot(path='/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/login.png')
        sw=await pg.evaluate("navigator.serviceWorker.ready.then(r=>!!r.active)")
        await pg.reload();await pg.wait_for_timeout(1000)
        await ctx.set_offline(True)
        await pg.reload();await pg.wait_for_timeout(1500)
        ok=await pg.evaluate("!!document.getElementById('m-login')")
        print('service worker active',sw,'| app opens with no signal',ok)
        await b.close()
    finally: sp.kill()
asyncio.run(m())
