# Phones pick up a new version by themselves (not while typing / in a window), and never reload in a loop
import asyncio, subprocess, time, os, json, shutil
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.dirname(HERE);PORT=8791;BASE=f'http://localhost:{PORT}'
FAKE=open(os.path.join(HERE,'fakeclient.js')).read()
CFG=f"window.EX_CFG={{url:'{BASE}',anonKey:'test',debug:false}};"
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n)
VJ=os.path.join(ROOT,'version.json');orig=open(VJ).read()
async def main():
  sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver.js'),str(PORT)],stdout=subprocess.DEVNULL);time.sleep(0.8)
  try:
    async with async_playwright() as p:
      b=await p.chromium.launch();ctx=await b.new_context(service_workers='block',viewport={'width':390,'height':844});pg=await ctx.new_page()
      async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE)
        if '/config.js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=CFG)
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
      await pg.route('**/*',route)
      await pg.goto(BASE+'/index.html');await pg.wait_for_timeout(1500)
      v0=json.loads(orig)['v'];chk("app knows its version",await pg.evaluate("window.EX_VER")==v0)
      await pg.evaluate("window._mark=1;0");await pg.evaluate("EX_checkVersion()");await pg.wait_for_timeout(600)
      chk("same version → no reload",await pg.evaluate("window._mark===1"))
      open(VJ,'w').write(json.dumps({'v':'vNEW1'}))
      # busy: a window is open
      await pg.evaluate("document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));document.getElementById('m-login').classList.remove('hid');0")
      await pg.evaluate("EX_checkVersion()");await pg.wait_for_timeout(800)
      chk("waits while a window is open",await pg.evaluate("window._mark===1"))
      await pg.evaluate("document.getElementById('m-login').classList.add('hid');document.activeElement&&document.activeElement.blur();0")
      try:
        await pg.wait_for_function("!window._mark",timeout=9000);chk("reloads once the window closes",True)
      except Exception: chk("reloads once the window closes",False)
      await pg.wait_for_timeout(1500)
      # the page itself is still the old build (version.json changed only) → must NOT loop
      await pg.evaluate("window._mark2=1;0");await pg.evaluate("EX_checkVersion()");await pg.wait_for_timeout(1500)
      chk("never reloads in a loop",await pg.evaluate("window._mark2===1"))
      # coming back to the app triggers the check
      open(VJ,'w').write(json.dumps({'v':'vNEW2'}))
      await pg.evaluate("document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));document.activeElement&&document.activeElement.blur();window._mark3=1;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});document.dispatchEvent(new Event('visibilitychange'));0")
      try:
        await pg.wait_for_function("!window._mark3",timeout=6000);chk("opening the app again picks up the update",True)
      except Exception: chk("opening the app again picks up the update",False)
      await b.close()
  finally:
    open(VJ,'w').write(orig);sp.kill()
  for x in ok:print("  ✓",x)
  for x in bad:print("  ✗",x)
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
