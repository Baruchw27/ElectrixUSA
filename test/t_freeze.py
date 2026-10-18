# Freeze-proof: the app opens instantly from the phone even when the server is down or slow, keeps edits, catches up after sleep,
# signs out with no signal, and a brand-new phone never sits on "Loading…" forever.
import asyncio, subprocess, time, os, json, urllib.request
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__));PORT=8797;BASE=f'http://localhost:{PORT}'
FAKE=open(os.path.join(HERE,'fakeclient.js')).read();CFG=f"window.EX_CFG={{url:'{BASE}',anonKey:'test',debug:false}};"
ok=[];bad=[]
def chk(n,c,x=''):(ok if c else bad).append(n+(' '+str(x) if not c and x!='' else ''))
def net(mode):urllib.request.urlopen(BASE+'/__net?mode='+mode).read()
def srv(p):return json.loads(urllib.request.urlopen(BASE+p).read())
async def until(pg,js,ms=8000):
  t0=time.time()
  while time.time()-t0<ms/1000:
    try:
      if await pg.evaluate(js):return True
    except Exception:pass
    await asyncio.sleep(0.15)
  return False
async def newctx(b):
  ctx=await b.new_context(service_workers='block',viewport={'width':390,'height':844})
  async def route(r):
    u=r.request.url
    if 'supabase-js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE)
    if '/config.js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=CFG)
    if u.startswith(BASE): return await r.continue_()
    return await r.abort()
  await ctx.route('**/*',route);return ctx
async def main():
  sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver.js'),str(PORT)],stdout=subprocess.DEVNULL);time.sleep(0.8)
  try:
    async with async_playwright() as p:
      b=await p.chromium.launch()
      ca=await newctx(b);A=await ca.new_page();ea=[];A.on('pageerror',lambda e:ea.append(str(e)[:200]))
      await A.goto(BASE+'/index.html');await A.wait_for_timeout(1200)
      await A.evaluate("askConfirm=function(m,yes){yes&&yes();};askPrompt=(t,f,cb)=>cb(['ownerpass1','clean']);exSetup()")
      await until(A,"me()&&me().role==='owner'&&document.getElementById('m-login').classList.contains('hid')",10000)
      await until(A,"fetch('/__state').then(r=>r.json()).then(s=>s.records>2000)",20000)
      await until(A,"(D.keep||[]).some(n=>/Team passwords/.test(n.title||''))",60000)
      # --- 1. server DOWN, reopen: must open from the phone right away
      net('down')
      t0=time.time();await A.reload(wait_until='domcontentloaded')
      opened=await until(A,"!document.getElementById('exBoot')&&typeof me==='function'&&me()&&me().role==='owner'&&D.sites.length>400&&!!document.querySelector('.pg.on')",6000)
      chk(f'server down: app opens from the phone in {time.time()-t0:.1f}s',opened and time.time()-t0<6)
      chk('no frozen Loading screen',not await A.evaluate("!!document.getElementById('exBoot')"))
      for tb in ['home','sites','jobs','sched','more']:
        await A.evaluate(f"goTab('{tb}');0");await A.wait_for_timeout(80)
      chk('can move around the app while the server is down',await A.evaluate("document.querySelector('.pg.on').id==='pg-more'"))
      await A.evaluate("D.jobs.push({id:'joff1',ts:Date.now(),to:[D.emps.find(e=>e.name==='Yossi').id],from:me().id,desc:'Made while server was down',status:'open',due:'Today'});save();0")
      chk('edit kept on the phone',await A.evaluate("JSON.parse(localStorage.getItem('ex_queue')||'{}')['jobs\\u0001joff1']!==undefined"))
      # --- 2. server back: the edit goes out by itself
      net('ok')
      chk('server back: edit reaches the server by itself',await until(A,"fetch('/__records?coll=jobs').then(r=>r.json()).then(a=>a.some(r=>r.id==='joff1'))",70000))
      chk('…and nothing was lost from the phone',await A.evaluate("D.jobs.some(j=>j.id==='joff1')&&D.sites.length>400"))
      # --- 3. SLOW server (4 s per call): still opens instantly
      net('4000');t0=time.time();await A.reload(wait_until='domcontentloaded')
      opened=await until(A,"!document.getElementById('exBoot')&&me()&&me().role==='owner'&&!!document.querySelector('.pg.on')",6000)
      chk(f'slow server: opens in {time.time()-t0:.1f}s',opened and time.time()-t0<6)
      net('ok');await until(A,"EX_ready()",30000)
      # --- 4. catch-up after sleep: another phone changes things while this one's live feed is dead
      await A.evaluate("EX_sb.removeAllChannels();0");await A.wait_for_timeout(300)
      cb=await newctx(b);B=await cb.new_page();await B.goto(BASE+'/index.html');await B.wait_for_timeout(1200)
      await B.fill('#lgUser','baruch');await B.fill('#lgPass','ownerpass1');await B.evaluate("doLogin()")
      await until(B,"EX_ready()&&me()&&me().role==='owner'",15000)
      await B.evaluate("D.jobs.push({id:'jwake',ts:Date.now(),to:[me().id],from:me().id,desc:'Made while the other phone slept',status:'open',due:'Today'});save();0")
      await until(B,"fetch('/__records?coll=jobs').then(r=>r.json()).then(a=>a.some(r=>r.id==='jwake'))",8000)
      await A.wait_for_timeout(800)
      chk('sleeping phone did not get it live (feed was dead)',not await A.evaluate("D.jobs.some(j=>j.id==='jwake')"))
      await A.evaluate("EX_catchUp();0")
      chk('waking up pulls what changed',await until(A,"D.jobs.some(j=>j.id==='jwake')",8000))
      chk('…using a small catch-up, not a full download',srv('/__state')['stats'].get('catchups',0)>=1)
      await B.evaluate("D.jobs.push({id:'jlive2',ts:Date.now(),to:[me().id],from:me().id,desc:'live again',status:'open',due:'Today'});save();0")
      chk('live feed reconnected after waking',await until(A,"D.jobs.some(j=>j.id==='jlive2')",8000))
      # --- 5. sign out with NO signal
      net('down');t0=time.time();await A.evaluate("signOut();0")
      back=await until(A,"!document.getElementById('m-login').classList.contains('hid')",9000)
      chk(f'sign out works with no signal ({time.time()-t0:.1f}s)',back and time.time()-t0<9)
      # --- 6. brand-new phone, server down: shows "try again", never stuck
      cc=await newctx(b);C=await cc.new_page();await C.goto(BASE+'/index.html',wait_until='domcontentloaded')
      got=await until(C,"!document.getElementById('exBoot')||/Try again|Sign in/.test(document.getElementById('exBoot').innerText)||!document.getElementById('m-login').classList.contains('hid')",20000)
      chk('new phone with no server: clear message, not frozen',got)
      net('ok')
      chk('no page errors',not ea,ea[:3])
      await b.close()
  finally:
    try:net('ok')
    except Exception:pass
    sp.kill()
  for x in ok:print('  ✓',x)
  for x in bad:print('  ✗',x)
  print(f'{len(ok)} passed, {len(bad)} failed')
asyncio.run(main())
