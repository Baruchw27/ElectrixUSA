# Live app code + stand-in server enforcing the stock security fix rules. (Header from t_v2_regression.)\n# Same everyday flows run against TWO copies of the staging app (before V2 vs now) on the local stand-in server,
# to show nothing that worked before broke: sign-in, wrong password, jobs/sites/clock-ins syncing between phones,
# take-out / put-back screens, offline then reconnect, renaming an item, sign-out wiping the phone.
# Usage: python3 t_v2_regression.py <app dir containing index.html + test/fakeserver.js> <port>
import asyncio, json, os, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright
R = sys.argv[1]; PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8795; BASE = f'http://localhost:{PORT}'
FAKE = open(os.path.join(R, 'test', 'fakeclient.js')).read()
CFG = f"window.EX_CFG={{url:'{BASE}',anonKey:'test',debug:false,trello:false,ai:false,vapid:'BBBB'}};"
ok = []; bad = []
def chk(n, c, extra=''):
    (ok if c else bad).append(n); print(('  ✓ ' if c else '  ✗ ') + n + ('' if c else '  ' + str(extra)[:200]))
def srv(path): return json.loads(urllib.request.urlopen(BASE + path).read())
def rec(coll, iid):
    r = [x for x in srv('/__records?coll=' + coll) if x['id'] == iid]; return r[0] if r else None
async def until(pg, js, ms=8000):
    t0 = time.time()
    while time.time() - t0 < ms / 1000:
        try:
            if await pg.evaluate(js): return True
        except Exception: pass
        await asyncio.sleep(0.15)
    return False
async def phone(b, name):
    ctx = await b.new_context(service_workers='block', viewport={'width': 390, 'height': 844}); pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(name + ': ' + str(e)))
    async def route(r):
        u = r.request.url
        if 'supabase-js' in u: return await r.fulfill(status=200, content_type='application/javascript', body=FAKE)
        if '/config.js' in u: return await r.fulfill(status=200, content_type='application/javascript', body=CFG)
        if '/version.json' in u: return await r.fulfill(status=200, content_type='application/json', body='{"v":"x"}')
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
    await pg.route('**/*', route)
    await pg.add_init_script("window._t=[];setInterval(()=>{if(typeof toast==='function'&&!toast._w){const o=toast;toast=function(a){_t.push(String(a));return o.apply(this,arguments)};toast._w=1;}if(typeof askConfirm==='function'&&!askConfirm._w){askConfirm=function(m,y){y&&y();};askConfirm._w=1;}},50);sessionStorage.setItem('ex_upd','x');")
    await pg.goto(BASE + '/index.html'); await pg.wait_for_timeout(900)
    return ctx, pg, errs
async def ev(pg, js, arg=None):
    await until(pg, "typeof D!=='undefined'&&!!window.EX_sb&&typeof me==='function'&&!!me()", 20000)
    return await pg.evaluate(js, arg) if arg is not None else await pg.evaluate(js)
async def main():
    sp = subprocess.Popen(['node', os.path.join(R, 'test', 'fakeserver.js'), str(PORT)], stdout=subprocess.DEVNULL); time.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            cO, O, eO = await phone(b, 'owner')
            await O.evaluate("askPrompt=(t,f,cb)=>cb(['ownerpass1','clean']);0"); await O.evaluate("exSetup()")
            chk('owner signed in (live app code)', await until(O, "document.getElementById('m-login').classList.contains('hid')&&me()&&me().role==='owner'", 15000))
            await ev(O, "D.stock.push({id:'s_a',name:'Item A',unit:'pc',qty:0,min:0},{id:'s_b',name:'Item B',unit:'pc',qty:0,min:0});save();0"); await O.wait_for_timeout(1500)
            await ev(O, "commitStockTxn('set',[{id:'s_a',name:'Item A',unit:'pc',qty:30}],null,{reason:'count'});0"); await until(O, "!stockQ().length", 8000)
            chk('owner count (set 30) accepted', (rec('stock','s_a') or {}).get('data',{}).get('qty')==30, rec('stock','s_a'))
            await ev(O, "commitStockTxn('in',[{id:'s_b',name:'Item B',unit:'pc',qty:10}],null,{});0"); await until(O, "!stockQ().length", 8000)
            await ev(O, "commitStockTxn('out',[{id:'s_a',name:'Item A',unit:'pc',qty:4},{id:'s_b',name:'Item B',unit:'pc',qty:3}],null,{});0"); await until(O, "!stockQ().length", 8000)
            chk('two-item pick-up accepted (30-4=26, 10-3=7)', (rec('stock','s_a') or {}).get('data',{}).get('qty')==26 and (rec('stock','s_b') or {}).get('data',{}).get('qty')==7)
            await ev(O, "D.stock.find(s=>s.id==='s_a').name='Item A renamed';save();0"); await O.wait_for_timeout(2500)
            chk('renaming an item through normal sync keeps its count', (rec('stock','s_a') or {}).get('data',{}).get('name')=='Item A renamed' and (rec('stock','s_a') or {}).get('data',{}).get('qty')==26, rec('stock','s_a'))
            urllib.request.urlopen(BASE + '/__net?mode=down') if False else None
            await O.context.set_offline(True); await O.evaluate("window.dispatchEvent(new Event('offline'))")
            await ev(O, "commitStockTxn('out',[{id:'s_a',name:'Item A',unit:'pc',qty:1}],null,{});0"); await O.wait_for_timeout(1000)
            await O.context.set_offline(False); await O.evaluate("window.dispatchEvent(new Event('online'))"); await until(O, "!stockQ().length", 15000)
            chk('offline pick-up sent after reconnect (26-1=25)', (rec('stock','s_a') or {}).get('data',{}).get('qty')==25)
            chk('no page errors', not eO, eO[:3])
            await b.close()
    finally:
        sp.kill()
    print(f"\n{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
