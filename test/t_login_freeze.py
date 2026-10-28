# First sign-in can never freeze: the phone gets in even if saving the sign-in or loading the data gets stuck.
import asyncio, subprocess, time, os, sys
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__));PORT=8798;BASE=f'http://localhost:{PORT}'
APP=sys.argv[1] if len(sys.argv)>1 else '/staging/index.html'
FAKE=open(os.path.join(HERE,'fakeclient.js')).read();CFG=f"window.EX_CFG={{url:'{BASE}',anonKey:'test',debug:false}};"
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n);print(('  ✓ ' if c else '  ✗ ')+n,flush=True)
async def until(pg,js,ms=8000):
  t0=time.time()
  while time.time()-t0<ms/1000:
    try:
      if await pg.evaluate(js):return True
    except Exception:pass
    await asyncio.sleep(0.2)
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
IN="me()&&me().role==='owner'&&document.getElementById('m-login').classList.contains('hid')"
async def fresh(b):
  c=await newctx(b);pg=await c.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
  await pg.goto(BASE+APP);await until(pg,"!!window.EX_sb&&!document.getElementById('m-login').classList.contains('hid')",10000);return pg,errs
async def login(pg,pw='ownerpass1'):
  await pg.fill('#lgUser','baruch');await pg.fill('#lgPass',pw);await pg.evaluate("doLogin();0")
async def main():
  sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver.js'),str(PORT)],stdout=subprocess.DEVNULL);time.sleep(0.8)
  try:
    async with async_playwright() as p:
      b=await p.chromium.launch()
      a=await newctx(b);A=await a.new_page();await A.goto(BASE+APP);await A.wait_for_timeout(1200)
      await A.evaluate("{const o=D.emps.find(e=>e.role==='owner');if(o&&!o.name)o.name='Baruch';}askConfirm=function(m,yes){yes&&yes();};askPrompt=(t,f,cb)=>cb(['ownerpass1','clean']);exSetup()")
      chk('team set up',await until(A,"me()&&me().role==='owner'&&EX_ready()",20000))
      await until(A,"(D.keep||[]).some(n=>/Team passwords/.test(n.title||''))",60000)
      # 1. normal first sign-in on a new phone
      B,eb=await fresh(b);t0=time.time();await login(B)
      chk(f'normal sign-in gets in',await until(B,IN,15000))
      # 2. saving the sign-in freezes (what happened on Matty's iPhone)
      C,ec=await fresh(b)
      await C.evaluate("EX_sb.auth.setSession=()=>new Promise(()=>{});0")
      t0=time.time();await login(C)
      got=await until(C,IN,30000);chk(f'stuck sign-in save: still gets in ({time.time()-t0:.0f}s)',got)
      chk('…and stays signed in after reopening',(await C.reload(),await until(C,IN,15000))[1])
      # 3. wrong password while the library is stuck: clear message, no restart loop
      D_,ed=await fresh(b)
      await D_.evaluate("EX_sb.auth.setSession=()=>new Promise(()=>{});0")
      await login(D_,'wrongpass99')
      chk('wrong password says so',await until(D_,"/name and password/.test(document.getElementById('lgErr').textContent)",15000))
      await D_.wait_for_timeout(2000);chk('…and stays on the sign-in screen',await D_.evaluate("!document.getElementById('m-login').classList.contains('hid')"))
      # 4. loading the data freezes after sign-in
      E_,ee=await fresh(b)
      await E_.evaluate("window.EX_start=()=>new Promise(()=>{});0")
      t0=time.time();await login(E_)
      chk(f'stuck data load: still gets in ({time.time()-t0:.0f}s)',await until(E_,IN,70000))
      # 5. Cancel really stops a stuck sign-in
      F,ef=await fresh(b)
      await F.evaluate("EX_login=()=>new Promise(()=>{});0")
      await login(F);await F.wait_for_timeout(800);await F.evaluate("doLogin._cancel=true;0")
      chk('Cancel stops a stuck sign-in',await until(F,"/cancelled/i.test(document.getElementById('lgErr').textContent)",5000))
      errs=eb+ec+ed+ee+ef;chk('no page errors',not errs)
      if errs:print(errs[:3])
      await b.close()
  finally:sp.kill()
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
