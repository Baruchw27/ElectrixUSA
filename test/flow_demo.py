import asyncio
from playwright.async_api import async_playwright
F="/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/app/index.html"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={"width":390,"height":844})
        errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        await pg.goto("file://"+F); await pg.wait_for_timeout(400); await pg.evaluate("signIn('u1');document.querySelectorAll('div.ov[id^=m-]').forEach(o=>o.classList.add('hid'))")
        R=[]
        def chk(name,ok): R.append(("OK " if ok else "FAIL ")+name)
        ev=pg.evaluate
        # owner creates a job for Yossi
        await ev("setRole('u1');goTab('jobs');openJob()")
        n0=await ev("D.jobs.length")
        await ev("document.querySelector('#jAssign input[value=\"u2\"]').checked=true;document.getElementById('jDesc').value='Test job';saveJob()")
        chk("owner creates job", await ev("D.jobs.length")==n0+1 and await ev("D.jobs[0].to.includes('u2')"))
        # move it to Shauly
        jid=await ev("D.jobs[0].id")
        await ev(f"openRe('{jid}')")
        await ev("document.querySelectorAll('#rePick input').forEach(i=>i.checked=i.value==='u3');doRe()")
        chk("move job", await ev("D.jobs[0].to.join()")=="u3")
        # Shauly sees it and marks done
        await ev("setRole('u3');goTab('jobs')")
        vis=await ev(f"visibleJobs().some(j=>j.id==='{jid}')")
        await ev(f"markDone('{jid}')"); await ev("document.getElementById('askOk').click()")
        chk("manager sees + marks done", vis and await ev("D.jobs.find(j=>j.id==='%s').status"%jid)=="done")
        await ev(f"undoDone('{jid}')"); chk("undo done", await ev("D.jobs.find(j=>j.id==='%s').status"%jid)=="open")
        # priority
        await ev(f"togglePri('{jid}')"); chk("priority toggle", await ev("D.jobs.find(j=>j.id==='%s').pri"%jid)==True)
        # notification landed for Shauly (from the move)
        chk("notification inbox", await ev("D.inbox.some(x=>x.to==='u3')"))
        # worker punch in (demo mode)
        carlos=await ev("D.emps.find(e=>e.name==='Carlos').id")
        await ev(f"setRole('{carlos}');goTab('punch');D.demo=true;D.selfie=false;save();renderPunch();checkGPS();doPunch()")
        chk("worker punch in", await ev(f"D.punches.some(p=>p.who==='{carlos}'&&!p.out)"))
        await ev("simLeave()"); chk("auto punch-out on leave", await ev(f"!!D.punches.find(p=>p.who==='{carlos}'&&p.away)"))
        await ev("simReturn()"); chk("auto punch back in", await ev(f"(D.punches.find(p=>p.who==='{carlos}'&&!p.out&&!p.away)||{{}}).trips.length===1"))
        await ev("doPunch()"); chk("punch out", await ev(f"!!D.punches.find(p=>p.who==='{carlos}'&&p.out)"))
        # worker punch fix request → Shia approves
        await ev("openFix();document.getElementById('fxWhy').value='forgot';sendFix()")
        chk("fix request", await ev("D.fixes.some(f=>f.status==='pending')"))
        fid=await ev("D.fixes[0].id")
        await ev(f"setRole('o1');goTab('hours');fixSet('{fid}','approved')")
        chk("payroll approves fix", await ev(f"D.fixes.find(f=>f.id==='{fid}').status")=="approved")
        # tools: Jon takes a tool to his van, returns it
        jon=await ev("D.emps.find(e=>e.name==='Jon').id")
        await ev(f"setRole('{jon}');goTab('tools');openTake('take','t5');tkPick='t5';document.getElementById('tkTo').value='van:{jon}';saveTake()")
        chk("take tool to van", await ev(f"D.tools.find(t=>t.id==='t5').loc.ref==='{jon}'"))
        await ev("openTake('return','t5');tkPick='t5';saveTake()")
        chk("return tool to garage", await ev("D.tools.find(t=>t.id==='t5').loc.type==='garage'"))
        # stock pickup
        q0=await ev("D.stock.find(s=>s.id==='s_1').qty")
        await ev("garageView='stock';renderTools();openPickup();puAdd('s_1');puLines[0].qty=3;savePickup()")
        chk("stock pickup reduces count", await ev("D.stock.find(s=>s.id==='s_1').qty")==q0-3)
        # material request → Menachem orders
        await ev("goTab('mat');openMat();document.getElementById('mtItems').value='10 GFI';saveMat()")
        mid=await ev("D.mats[0].id")
        await ev(f"setRole('o2');goTab('mat');matSet('{mid}','ordered')")
        chk("material request → ordered", await ev(f"D.mats.find(m=>m.id==='{mid}').status")=="ordered")
        # receipt (gas) by Carlos
        await ev(f"setRole('{carlos}');openExp('gas');exFile={{d:'data:image/jpeg;base64,/9j/',name:'r.jpg'}};saveExp()")
        chk("gas receipt saved", await ev(f"D.exps.some(x=>x.who==='{carlos}'&&x.type==='gas')"))
        # estimate request by Yossi → owner prices → approve → job created
        await ev("setRole('u2');goTab('est');openEst();document.getElementById('esText').value='100 spots';saveEst()")
        eid=await ev("D.ests[0].id")
        await ev(f"setRole('u1');openEstPrice('{eid}');document.getElementById('epPrice').value='12500';saveEstPrice()")
        n1=await ev("D.jobs.length"); await ev(f"estApprove('{eid}')")
        chk("estimate → priced → approved → job", await ev("D.jobs.length")==n1+1 and await ev(f"D.ests.find(e=>e.id==='{eid}').status")=="approved")
        # service call
        await ev("openSvc();document.getElementById('svClient').value='Mrs X';document.getElementById('svAddr').value='1 Main St';document.getElementById('svIssue').value='GFI trips';document.getElementById('svTo').value='c3';saveSvc()")
        kid=await ev("D.tickets[0].id"); await ev(f"svcDone('{kid}')")
        chk("service call → assigned → fixed", await ev(f"D.tickets.find(k=>k.id==='{kid}').status")=="done")
        # inspection: Jon ready → Matty books → pass flips phase
        await ev(f"setRole('{jon}');reqInsp('s3');document.getElementById('askOk').click()")
        iid=await ev("D.insp.find(i=>i.site==='s3'&&i.status==='requested').id")
        chk("ready for inspection → office task", await ev(f"D.jobs.some(j=>j.insp==='{iid}')"))
        await ev(f"setRole('o4');openInspBook('{iid}');saveInsp()")
        chk("office books inspection", await ev(f"D.insp.find(i=>i.id==='{iid}').status")=="booked")
        await ev(f"openInspResult('{iid}');irResult='pass';saveInspResult()")
        chk("pass → site to finishing", await ev("D.sites.find(s=>s.id==='s3').phase")=="finish")
        # meeting booked by Shia lands on owner
        await ev("setRole('o1');goTab('cal');openMeet();document.getElementById('meTitle').value='Walkthrough';saveMeet()")
        chk("meeting booked", await ev("D.meets.some(m=>m.title==='Walkthrough')"))
        # message Yossi → Shauly
        await ev("setRole('u2');goTab('msg');openChat('u3');document.getElementById('chText').value='hola';msgSend()")
        chk("message sent", await ev("D.msgs.some(m=>m.from==='u2'&&m.to==='u3')"))
        # schedule fill + worker sees today/tomorrow only
        await ev("setRole('u1');goTab('sched');schedView='plan';schedCrew='c2';renderSched();askPrompt('x',[{label:'a',options:[{v:'s2',l:'s2'}]},{label:'b',value:'10',type:'number'},{label:'c',value:'7:00 AM'}],()=>{});")
        await ev("fillRange();document.getElementById('ask_1').value='10';document.getElementById('askOk').click()")
        chk("fill schedule range", await ev("Object.keys(D.sched).filter(k=>k.startsWith('c2|')).length")>=8)
        brian=await ev("D.emps.find(e=>e.name==='Brian').id")
        await ev(f"setRole('{brian}');goTab('sched')")
        days=await ev("document.querySelectorAll('#todayBoard .card').length+document.querySelectorAll('#schedList .day').length")
        chk("worker sees 2 days only", days==2)
        # language toggle
        await ev("toggleLang()"); chk("spanish toggle", await ev("document.querySelector('[data-i18n=\"Punch\"]')?.textContent")=="Marcar"); await ev("toggleLang()")
        # employee add/remove
        await ev("setRole('u1');goTab('team');openEmp();document.getElementById('eName').value='Testguy';saveEmp()")
        chk("add employee", await ev("D.emps.some(e=>e.name==='Testguy')"))
        tid=await ev("D.emps.find(e=>e.name==='Testguy').id")
        await ev(f"removeEmp('{tid}');document.getElementById('askOk').click()"); chk("remove employee", await ev("!D.emps.some(e=>e.name==='Testguy')"))
        print("\n".join(R)); print("page errors:",errs[:5] if errs else "none")
        await b.close()
asyncio.run(main())
