import asyncio, sys
from playwright.async_api import async_playwright
F="/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/app/index.html"
ROLES=sys.argv[1:] or ["u1","u2","u6","u8","o1","o2","o4","b1","b2"]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={"width":390,"height":844})
        errs=[]
        pg.on("pageerror",lambda e:errs.append(str(e)))
        await pg.goto("file://"+F); await pg.wait_for_timeout(400); await pg.evaluate("signIn('u1');document.querySelectorAll('div.ov[id^=m-]').forEach(o=>o.classList.add('hid'))")
        report=[]; nclicks=0
        for rid in ROLES:
            rid2=await pg.evaluate(f"(D.emps.find(e=>e.name=='{rid}'||e.id=='{rid}')||{{}}).id");await pg.evaluate(f"setRole('{rid2}')"); await pg.wait_for_timeout(120)
            rname=await pg.evaluate("me().name")
            tabs=await pg.evaluate("[...document.querySelectorAll('.tab')].filter(b=>b.dataset.allowed==='1').map(b=>b.getAttribute('onclick').match(/'([a-z]+)'/)[1])")
            for tname in tabs:
                await pg.evaluate(f"goTab('{tname}')"); await pg.wait_for_timeout(60)
                n=await pg.evaluate("""()=>{document.querySelectorAll('[data-t]').forEach(e=>e.removeAttribute('data-t'));const pg=document.querySelector('.pg.on');if(!pg)return 0;const els=[...pg.querySelectorAll('button,[onclick]')].filter(e=>e.offsetParent!==null);els.forEach((e,i)=>e.setAttribute('data-t',i));return els.length;}""")
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
        print(f"clicks: {nclicks}")
        print("\n".join(sorted(set(report))) if report else "ALL OK — no errors on any click")
        await b.close()
asyncio.run(main())
