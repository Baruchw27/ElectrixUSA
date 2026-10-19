# Same everyday flows run against TWO copies of the staging app (before V2 vs now) on the local stand-in server,
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
            chk('owner account created and signed in', await until(O, "document.getElementById('m-login').classList.contains('hid')&&me()&&me().role==='owner'", 15000))
            await until(O, "(D.keep||[]).some(n=>/Team passwords/.test(n.title||'')&&/: /.test(n.body||''))", 40000)
            note = await O.evaluate("(D.keep||[]).find(n=>/Team passwords/.test(n.title||''))?.body||''")
            pw = {l.split(': ')[0]: l.split(': ')[1] for l in note.split('\n') if ': ' in l}
            w = [x for x in await O.evaluate("D.emps.filter(e=>e.role==='worker'&&!e.inactive).map(e=>e.name)") if x in pw][0]
            cW, W, eW = await phone(b, w)
            await W.fill('#lgUser', w); await W.fill('#lgPass', 'wrong-password-1'); await W.evaluate("doLogin()"); await W.wait_for_timeout(2500)
            chk('wrong password refused', not await W.evaluate("document.getElementById('m-login').classList.contains('hid')"))
            await W.fill('#lgPass', pw[w]); await W.evaluate("doLogin()")
            chk('worker signs in', await until(W, f"document.getElementById('m-login').classList.contains('hid')&&window.EX_ME&&me()&&me().name==='{w}'", 20000))
            await W.wait_for_timeout(1500)
            wid = await ev(W, "me().id")
            # sites + jobs + clock-ins
            await ev(O, "D.sites.push({id:'site_r1',name:'7 Regression Rd',stage:'active',phase:'rough',files:[],links:[]});save();0")
            chk('new job site reaches the worker', await until(W, "D.sites.some(s=>s.id==='site_r1')", 10000))
            await ev(O, "(w)=>{D.jobs.unshift({id:'j_r1',ts:Date.now(),to:[w],from:me().id,site:'site_r1',desc:'Hang 6 cans',due:'',status:'open',media:[]});save();}", wid)
            chk('job assigned to the worker reaches the worker', await until(W, "D.jobs.some(j=>j.id==='j_r1')", 10000))
            await ev(W, "D.punches=D.punches||[];D.punches.push({id:'p_r1',who:me().id,in:Date.now()-3600000,out:Date.now(),site:'site_r1'});save();0")
            chk('worker clock-in reaches the office', await until(O, "(D.punches||[]).some(p=>p.id==='p_r1')", 10000))
            await ev(W, "(()=>{const j=D.jobs.find(j=>j.id==='j_r1');j.status='done';save();})()")
            chk('job done on the worker → office sees done', await until(O, "D.jobs.find(j=>j.id==='j_r1').status==='done'", 10000))
            # inventory screens
            await ev(O, "D.stock.push({id:'s_reg1',name:'Romex 12/2 250ft',unit:'roll',qty:0,min:0});save();0"); await until(W, "D.stock.some(s=>s.id==='s_reg1')", 10000)
            await ev(O, "openStockIn();siLines=[{id:'s_reg1',name:'Romex 12/2 250ft',unit:'roll',qty:20}];document.getElementById('siSrc').value='Supplier delivery';saveStockIn();0")
            await until(O, "!stockQ().length", 8000)
            chk('put-back screen: 20 in on the server', (rec('stock', 's_reg1') or {}).get('data', {}).get('qty') == 20, rec('stock', 's_reg1'))
            chk('worker phone shows 20', await until(W, "D.stock.find(s=>s.id==='s_reg1').qty===20", 10000))
            await ev(W, "openPickup();puLines=[{id:'s_reg1',name:'Romex 12/2 250ft',unit:'roll',qty:5}];const ps=document.getElementById('puSite');if(![...ps.options].some(o=>o.value==='site_r1')){const o=document.createElement('option');o.value='site_r1';ps.appendChild(o);}ps.value='site_r1';savePickup();0")
            await until(W, "!stockQ().length", 8000)
            chk('pick-up screen: 20 − 5 = 15 on the server', (rec('stock', 's_reg1') or {}).get('data', {}).get('qty') == 15)
            chk('office phone shows 15', await until(O, "D.stock.find(s=>s.id==='s_reg1').qty===15", 10000))
            chk('history has the put-back and the pick-up', len([x for x in srv('/__records?coll=stockLog') if any(i.get('id') == 's_reg1' for i in x['data'].get('items', []))]) >= 2)
            # offline then reconnect
            await cW.set_offline(True); await W.evaluate("window.EX_SYNC&&(EX_SYNC.online=false);0")
            await ev(W, "openPickup();puLines=[{id:'s_reg1',name:'Romex 12/2 250ft',unit:'roll',qty:3}];const ps=document.getElementById('puSite');if(![...ps.options].some(o=>o.value==='site_r1')){const o=document.createElement('option');o.value='site_r1';ps.appendChild(o);}ps.value='site_r1';savePickup();0")
            await ev(W, "D.punches.push({id:'p_r2',who:me().id,in:Date.now()-600000,out:Date.now(),site:'site_r1'});save();0"); await W.wait_for_timeout(500)
            chk('offline: nothing reached the server yet', (rec('stock', 's_reg1') or {}).get('data', {}).get('qty') == 15 and rec('punches', 'p_r2') is None)
            await cW.set_offline(False); await W.evaluate("window.EX_SYNC&&(EX_SYNC.online=true);window.EX_flushStockQ&&EX_flushStockQ();window.EX_catchUp&&EX_catchUp();0")
            await until(W, "!stockQ().length", 12000); await W.evaluate("try{save()}catch(e){};0")
            chk('back online: pick-up applied once (12)', await until(O, "D.stock.find(s=>s.id==='s_reg1').qty===12", 12000), (rec('stock', 's_reg1') or {}).get('data'))
            chk('back online: clock-in reached the office', await until(O, "(D.punches||[]).some(p=>p.id==='p_r2')", 12000))
            # rename an item: counts must not be touched by the rename
            await ev(O, "(()=>{const s=D.stock.find(s=>s.id==='s_reg1');s.name='Southwire Romex 12/2 250ft';save();})()")
            rn = await until(W, "D.stock.find(s=>s.id==='s_reg1').name.startsWith('Southwire')", 10000)
            chk('rename reaches the worker', rn, '' if rn else [await W.evaluate("JSON.stringify(D.stock.find(s=>s.id==='s_reg1'))"), await W.evaluate("Object.keys(JSON.parse(localStorage.getItem('ex_queue')||'{}'))"), (rec('stock','s_reg1') or {}).get('data')])
            await W.wait_for_timeout(1000)
            chk('count still 12 everywhere after the rename', (rec('stock', 's_reg1') or {}).get('data', {}).get('qty') == 12 and await W.evaluate("D.stock.find(s=>s.id==='s_reg1').qty===12") and await O.evaluate("D.stock.find(s=>s.id==='s_reg1').qty===12"))
            # sign out
            await W.evaluate("signOut()"); await W.wait_for_timeout(2500)
            left = await W.evaluate("(()=>{const out=[];Object.keys(localStorage).filter(k=>/electrix_v29$|__stockq$|ex_queue/.test(k)).forEach(k=>{let v=localStorage.getItem(k)||'';let d=null;try{d=JSON.parse(v)}catch(e){}const biz=d&&typeof d==='object'?['jobs','punches','stockLog','keep','exps'].filter(c=>Array.isArray(d[c])&&d[c].some(x=>x&&/reg|r1|r2|Romex|Regression|Hang/i.test(JSON.stringify(x)))).concat(Array.isArray(d.stock)&&d.stock.some(x=>x&&+x.qty>0&&x.id==='s_reg1')?['stock counts']:[]):[];if(biz.length||(/stockq|queue/.test(k)&&v.length>2))out.push(k+':'+biz.join('+'));});return out;})()")
            chk('sign-out leaves no business data on the phone (only the item/site name list kept for the next sign-in, counts zeroed — same as before)', not left, left)
            errs = eO + eW; chk(f'no page errors {errs[:2]}', not errs)
            await b.close()
    finally:
        sp.kill()
    print(f"{len(ok)} passed, {len(bad)} failed")
    json.dump({'app': R, 'pass': len(ok), 'fail': len(bad), 'ok': ok, 'bad': bad}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'regression_' + os.path.basename(R.rstrip('/')) + '.json'), 'w'), indent=1)
asyncio.run(main())
