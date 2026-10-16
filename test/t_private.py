# Private files: photos / receipts / voice notes open only for signed-in team members (through the app's helper)
import asyncio, subprocess, time, os, json, urllib.request, urllib.error, base64
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__));PORT=8795;BASE=f'http://localhost:{PORT}'
FAKE=open(os.path.join(HERE,'fakeclient.js')).read();CFG=f"window.EX_CFG={{url:'{BASE}',anonKey:'test',debug:false}};"
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHElEQVR4nGP8z8DAQApgIkn1qIZRDaMahqoGAD0+AR8Wv1pcAAAAAElFTkSuQmCC')
ok=[];bad=[]
def chk(n,c,x=''):(ok if c else bad).append(n+(' '+str(x) if not c and x!='' else ''))
async def until(pg,js,ms=8000):
  t0=time.time()
  while time.time()-t0<ms/1000:
    try:
      if await pg.evaluate(js):return True
    except Exception:pass
    await asyncio.sleep(0.2)
  return False
async def phone(b):
  ctx=await b.new_context(service_workers='allow',viewport={'width':390,'height':844});pg=await ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
  async def route(r):
    u=r.request.url
    if 'supabase-js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE)
    if '/config.js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=CFG)
    if u.startswith(BASE): return await r.continue_()
    return await r.abort()
  await ctx.route('**/*',route);await pg.goto(BASE+'/index.html');await pg.wait_for_timeout(1500);return ctx,pg,errs
async def main():
  sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver.js'),str(PORT)],stdout=subprocess.DEVNULL);time.sleep(0.8)
  try:
    async with async_playwright() as p:
      b=await p.chromium.launch()
      ca,A,ea=await phone(b)
      await A.evaluate("askConfirm=function(m,yes){yes&&yes();};askPrompt=(t,f,cb)=>cb(['ownerpass1','clean']);exSetup()")
      await until(A,"document.getElementById('m-login').classList.contains('hid')&&me()&&me().role==='owner'",10000)
      await until(A,"fetch('/__state').then(r=>r.json()).then(s=>s.records>2000)",20000)
      b64=base64.b64encode(PNG).decode()
      url=await A.evaluate(f"(async()=>{{const b=await (await fetch('data:image/png;base64,{b64}')).blob();return await EX_uploadBlob(new Blob([b],{{type:'image/png'}}),'media');}})()")
      chk('photo uploaded',bool(url) and '/storage/v1/object/public/files/' in url,url)
      urllib.request.urlopen(BASE+'/__private?on=1').read()
      # from outside the app the link no longer works
      try: urllib.request.urlopen(url);outside=200
      except urllib.error.HTTPError as e: outside=e.code
      chk('link opened outside the app → blocked',outside!=200,outside)
      await A.reload();await A.wait_for_timeout(2000)
      chk('helper is running',await until(A,"!!navigator.serviceWorker.controller",8000))
      chk('signed-in phone still opens the photo',await until(A,f"fetch('{url}').then(r=>r.ok)",8000))
      chk('photo shows in the page',await A.evaluate(f"new Promise(r=>{{const i=new Image();i.onload=()=>r(i.naturalWidth>0);i.onerror=()=>r(false);i.src='{url}';}})"))
      st=json.loads(urllib.request.urlopen(BASE+'/__state').read())['stats']
      chk('it went through the signed-in door',st.get('auth',0)>0,st)
      # signed-out phone gets nothing
      cb,B,eb=await phone(b)
      await B.wait_for_timeout(1500)
      chk('signed-out phone cannot open the photo',not await B.evaluate(f"fetch('{url}').then(r=>r.ok).catch(()=>false)"))
      # sign out on A → blocked too
      await A.evaluate("EX_logout();0");await A.wait_for_timeout(800)
      await A.evaluate("navigator.serviceWorker.controller&&navigator.serviceWorker.controller.postMessage({type:'ex-pass',token:null});0");await A.wait_for_timeout(300)
      chk('after signing out it is blocked',not await A.evaluate(f"fetch('{url}?x=1').then(r=>r.ok).catch(()=>false)"))
      chk('no page errors',not(ea or eb),(ea+eb)[:3])
      await b.close()
  finally: sp.kill()
  for x in ok:print('  ✓',x)
  for x in bad:print('  ✗',x)
  print(f'{len(ok)} passed, {len(bad)} failed')
asyncio.run(main())
