"""Every button on every tab, for every role, on production-shaped data (live app vs release) — records any page error."""
from harness import *
import sys
SEED=json.load(open(os.path.join(HERE,'seed_prod.json')))
ROLES=["u1","u2","u3","u6","u7","o1","o2","o3"]
async def main():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            ctx,pg,errs,ok=await login(b,'Baruch','Testpass123','iphone'); await until(pg,"EX_ready&&EX_ready()",10000); await pg.wait_for_timeout(6000); await until(pg,"EX_ready&&EX_ready()",10000)
            await pg.evaluate("(()=>{const s=D.sites.find(x=>x.stage==='active')||D.sites[0];D.crews.forEach(c=>{D.sched[c.id+'|'+dkey(new Date())]={site:s.id,time:'7:00 AM',note:''};});D.jobs.push({id:nid('j'),to:['u7'],site:s.id,desc:'Test task',status:'open',due:'Today',from:'u1',ts:Date.now()});save();document.querySelectorAll('div.ov[id^=m-]').forEach(o=>o.classList.add('hid'));})()")
            await pg.evaluate("window.open=()=>null;window.confirm=()=>true;window.prompt=()=>null;askConfirm=function(m,yes){};0")
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
            await pg.wait_for_timeout(5000)
            sy=await pg.evaluate("[EX_SYNC.err,Object.keys(JSON.parse(localStorage.getItem('ex_queue')||'{}')).length]")
            if sy[0]: report.append('sync error: '+sy[0])
            print(f"clicks: {nclicks}")
            print("\n".join(sorted(set(report))) if report else "ALL OK — no errors on any click")
            await b.close()
    finally: sp.kill()
asyncio.run(main())
