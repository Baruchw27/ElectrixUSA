# The page that goes online carries no company data, and still works: sign in → everything loads from the server
import asyncio, subprocess, time, os, json
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__));PORT=8793;BASE=f'http://localhost:{PORT}'
FAKE=open(os.path.join(HERE,'fakeclient.js')).read();CFG=f"window.EX_CFG={{url:'{BASE}',anonKey:'test',debug:false}};"
ok=[];bad=[]
def chk(n,c,x=''):(ok if c else bad).append(n+(' '+str(x) if not c and x else ''))
async def phone(b,page):
  ctx=await b.new_context(service_workers='block',viewport={'width':390,'height':844},permissions=['geolocation'],geolocation={'latitude':41.1287,'longitude':-74.1046,'accuracy':8});pg=await ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
  async def route(r):
    u=r.request.url
    if 'supabase-js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE)
    if '/config.js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=CFG)
    if u.startswith(BASE): return await r.continue_()
    return await r.abort()
  await pg.route('**/*',route);await pg.goto(BASE+'/'+page);await pg.wait_for_timeout(1200);return ctx,pg,errs
async def until(pg,js,ms=8000):
  t0=time.time()
  while time.time()-t0<ms/1000:
    try:
      if await pg.evaluate(js):return True
    except Exception:pass
    await asyncio.sleep(0.2)
  return False
async def main():
  sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver.js'),str(PORT)],stdout=subprocess.DEVNULL);time.sleep(0.8)
  try:
    async with async_playwright() as p:
      b=await p.chromium.launch()
      # company already set up (from the full build)
      ca,A,ea=await phone(b,'index.html')
      await A.evaluate("askConfirm=function(m,yes){yes&&yes();};askPrompt=(t,f,cb)=>cb(['ownerpass1','clean']);exSetup()")
      await until(A,"document.getElementById('m-login').classList.contains('hid')&&me()&&me().role==='owner'",10000)
      await until(A,"fetch('/__state').then(r=>r.json()).then(s=>s.records>2000)",20000);await until(A,"(D.keep||[]).some(n=>/Team passwords/.test(n.title||''))",60000)
      note=await A.evaluate("(D.keep||[]).find(n=>/Team passwords/.test(n.title||''))?.body||''")
      pw={l.split(': ')[0]:l.split(': ')[1] for l in note.split('\n') if ': ' in l}
      chk('server has the company',json.loads(__import__('urllib.request').request.urlopen(BASE+'/__state').read())['records']>2000)
      # brand-new phone opens the PUBLIC page
      cb,B,eb=await phone(b,'public.html')
      src=await B.content()
      chk('no job addresses in the page',('Haller Crescent' not in src) and ('177 Bates' not in src))
      chk('before sign-in the phone holds no jobs',await B.evaluate("D.sites.length")==0)
      chk('login screen shows',await B.evaluate("!document.getElementById('m-login').classList.contains('hid')"))
      await B.fill('#lgUser','carlos');await B.fill('#lgPass',pw.get('Carlos',''));await B.evaluate("doLogin()")
      chk('Carlos signs in',await until(B,"document.getElementById('m-login').classList.contains('hid')&&me()&&me().name==='Carlos'",10000),await B.evaluate("document.getElementById('lgErr').textContent"))
      chk('all jobs load from the server',await until(B,"D.sites.length>400",8000),await B.evaluate("D.sites.length"))
      chk('team loads from the server',await B.evaluate("D.emps.length")>20)
      for tb in await B.evaluate("[...document.querySelectorAll('.tab')].filter(b=>b.dataset.allowed==='1').map(b=>b.getAttribute('onclick').match(/'([a-z]+)'/)[1])"):
        await B.evaluate(f"goTab('{tb}');0");await B.wait_for_timeout(120)
      # owner on a new phone with the public page
      cc,C,ec=await phone(b,'public.html')
      await C.fill('#lgUser','baruch');await C.fill('#lgPass','ownerpass1');await C.evaluate("doLogin()")
      chk('owner signs in on public page',await until(C,"document.getElementById('m-login').classList.contains('hid')&&me()&&me().role==='owner'",10000),await C.evaluate("document.getElementById('lgErr').textContent"))
      chk('owner sees all jobs',await until(C,"D.sites.length>400",8000))
      tabs=await C.evaluate("[...document.querySelectorAll('.tab')].filter(b=>b.style.display!=='none').map(b=>b.innerText.trim())")
      chk(f'Material in the owner bottom bar {tabs}','Material' in tabs and 'Punch' not in tabs)
      for tb in await C.evaluate("[...document.querySelectorAll('.tab')].filter(b=>b.dataset.allowed==='1').map(b=>b.getAttribute('onclick').match(/'([a-z]+)'/)[1])"):
        await C.evaluate(f"goTab('{tb}');0");await C.wait_for_timeout(120)
      await C.reload();await C.wait_for_timeout(1500)
      chk('reopening keeps you signed in with data',await until(C,"me()&&me().role==='owner'&&D.sites.length>400",8000))
      chk('no page errors',not(eb or ec),(eb+ec)[:3])
      await b.close()
  finally: sp.kill()
  for x in ok:print('  ✓',x)
  for x in bad:print('  ✗',x)
  print(f'{len(ok)} passed, {len(bad)} failed')
asyncio.run(main())
