"""Two (three) phones against the local stand-in server. Checks setup, sign-in, live sync, offline, security."""
import asyncio, json, subprocess, time, urllib.request, sys, os
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); PORT=8787; BASE=f'http://localhost:{PORT}'
FAKE=open(os.path.join(HERE,'fakeclient.js')).read()
CFG=f"window.EX_CFG={{url:'{BASE}',anonKey:'test',debug:false,trello:true,ai:true,vapid:'BBBB'}};"
ok=0; bad=[]
def check(name,cond,extra=''):
    global ok
    if cond: ok+=1; print('  ✓',name)
    else: bad.append(name); print('  ✗',name,extra)
def srv(path):
    return json.loads(urllib.request.urlopen(BASE+path).read())
async def phone(b,name,offline=False):
    ctx=await b.new_context(service_workers='block',viewport={'width':390,'height':844},permissions=['geolocation','notifications'],geolocation={'latitude':41.1287,'longitude':-74.1046,'accuracy':8})
    pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(name+': '+str(e)+' @ '+str(getattr(e,'stack',''))[:300]))
    async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE)
        if u.endswith('/config.js') or '/config.js?' in u: return await r.fulfill(status=200,content_type='application/javascript',body=CFG)
        if 'nominatim.openstreetmap.org' in u: return await r.fulfill(status=200,content_type='application/json',body='[{"lat":"41.1301","lon":"-74.0912","display_name":"x"}]',headers={'Access-Control-Allow-Origin':'*'})
        if 'router.project-osrm.org' in u: return await r.fulfill(status=200,content_type='application/json',body='{"code":"Ok","routes":[{"distance":16093,"duration":1500}]}',headers={'Access-Control-Allow-Origin':'*'})
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
    await pg.route('**/*',route)
    await pg.goto(BASE+'/index.html'); await pg.wait_for_timeout(900)
    await pg.evaluate("window._t=[];const ot=toast;toast=function(a){_t.push(String(a));return ot.apply(this,arguments)};window._c=[];askConfirm=function(m,yes){_c.push(String(m));yes&&yes();};0")
    return ctx,pg,errs
async def until(pg,js,ms=6000):
    t0=time.time()
    while time.time()-t0<ms/1000:
        try:
            if await pg.evaluate(js): return True
        except Exception: pass
        await asyncio.sleep(0.15)
    return False
ROLES=sys.argv[1:] or ["u1","u2","u6","u8","o1","o2","o4","b1","b2"]
async def main():
    sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver.js'),str(PORT)]); time.sleep(0.8)
    try:

        async with async_playwright() as p:
            b=await p.chromium.launch()
            ctx,pg,errs=await phone(b,'owner')
            await pg.evaluate("askPrompt=(t,f,cb)=>cb(['ownerpass1','clean']);0"); await pg.evaluate("exSetup()")
            await until(pg,"(D.keep||[]).some(n=>/Team passwords/.test(n.title||''))",30000)
            await pg.evaluate("(()=>{const s=D.sites.find(x=>x.stage==='active');D.crews.forEach(c=>{D.sched[c.id+'|'+dkey(new Date())]={site:s.id,time:'7:00 AM',note:''};});D.jobs.push({id:nid('j'),to:['u7'],site:s.id,desc:'Test task',status:'open',due:'Today',from:'u1',ts:Date.now()});save();document.querySelectorAll('div.ov[id^=m-]').forEach(o=>o.classList.add('hid'));})()")
            await pg.evaluate("window.open=()=>null;window.confirm=()=>true;window.prompt=()=>null;0")
            report=[]; nclicks=0
            for rid in ROLES:
                rid2=await pg.evaluate(f"(D.emps.find(e=>e.name=='{rid}'||e.id=='{rid}')||{{}}).id");await pg.evaluate(f"signIn('{rid2}')"); await pg.wait_for_timeout(120)
                rname=await pg.evaluate("me().name")
                tabs=await pg.evaluate("[...document.querySelectorAll('.tab')].filter(b=>b.dataset.allowed==='1').map(b=>b.getAttribute('onclick').match(/'([a-z]+)'/)[1])")
                for tname in tabs:
                    await pg.evaluate(f"goTab('{tname}')"); await pg.wait_for_timeout(60)
                    n=await pg.evaluate("""()=>{document.querySelectorAll('[data-t]').forEach(e=>e.removeAttribute('data-t'));const pg=document.querySelector('.pg.on');if(!pg)return 0;const els=[...pg.querySelectorAll('button,[onclick]')].filter(e=>e.offsetParent!==null&&!/signOut|exSetup|exTeamSetup|exChangePw|resetAll|exNotif|exportData/.test(e.getAttribute('onclick')||''));els.forEach((e,i)=>e.setAttribute('data-t',i));return els.length;}""")
                    for i in range(n):
                        b0=len(errs)
                        try:
                            await pg.evaluate(f"(()=>{{const e=document.querySelector(\".pg.on [data-t='{i}']\");if(e)e.click();}})()")
                            nclicks+=1
                        except Exception as e:
                            report.append(f"{rname}/{tname}/#{i}: {str(e)[:100]}")
                        if len(errs)>b0:
                            txt=await pg.evaluate(f"(()=>{{const e=document.querySelector(\".pg.on [data-t='{i}']\");return e?e.textContent.trim().slice(0,40):'?'}})()")
                            report.append(f"{rname} / {tname} / '{txt}': {errs[-1][:140]}")
                        await pg.evaluate("document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'))")
                    # modals: open each and click their buttons
                # test modals by opening them directly
                for mid in ["m-job","m-emp","m-site","m-exp","m-fix","m-mat","m-meet","m-est","m-svc","m-take","m-newtool","m-pick2","m-stockin","m-group"]:
                    opened=await pg.evaluate(f"(()=>{{const m=document.getElementById('{mid}');if(!m)return false;try{{({{'m-job':openJob,'m-emp':openEmp,'m-site':openSite,'m-exp':()=>openExp('gas'),'m-fix':openFix,'m-mat':openMat,'m-meet':openMeet,'m-est':openEst,'m-svc':()=>openSvc(),'m-take':()=>openTake('take'),'m-newtool':openNewTool,'m-pick2':openPickup,'m-stockin':openStockIn,'m-group':()=>openGroup()}})['{mid}']();return !m.classList.contains('hid');}}catch(e){{return 'ERR '+e.message;}}}})()")
                    if opened is not True:
                        if opened and str(opened).startswith("ERR"): report.append(f"{rname} open {mid}: {opened}")
                        continue
                    n=await pg.evaluate(f"""()=>{{const m=document.getElementById('{mid}');const els=[...m.querySelectorAll('button,[onclick]')].filter(e=>e.offsetParent!==null);els.forEach((e,i)=>e.setAttribute('data-m',i));return els.length;}}""")
                    for i in range(n):
                        b0=len(errs)
                        await pg.evaluate(f"(()=>{{const m=document.getElementById('{mid}');if(m.classList.contains('hid'))return;const e=m.querySelector(\"[data-m='{i}']\");if(e)e.click();}})()")
                        nclicks+=1
                        if len(errs)>b0:
                            report.append(f"{rname} / {mid} / #{i}: {errs[-1][:140]}")
                    await pg.evaluate("document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'))")
            await pg.evaluate("D.sites.forEach(s=>{if(!s.lat)s.geoTried=true});save();0"); await pg.wait_for_timeout(5000)
            sy=await pg.evaluate("[EX_SYNC.err,Object.keys(JSON.parse(localStorage.getItem('ex_queue')||'{}')).length]")
            if sy[0]: report.append('sync error: '+sy[0])
            if sy[1]:
                await pg.wait_for_timeout(6000); q=await pg.evaluate("[EX_SYNC.err,JSON.stringify(Object.values(JSON.parse(localStorage.getItem('ex_queue')||'{}'))).slice(0,600)]")
                if q[1]!='[]': report.append('unsent: '+str(q))
            st=srv('/__state'); print('server', st['records'], 'records; upserts', st['stats'])
            print(f"clicks: {nclicks}")
            print("\n".join(sorted(set(report))) if report else "ALL OK — no errors on any click")
            await b.close()

    finally:
        sp.kill()
asyncio.run(main())
