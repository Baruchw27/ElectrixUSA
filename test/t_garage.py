# Material screen: Request on top, Garage Take out / Put back → scan → Done → which job → Complete
import asyncio
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
INIT="""window.EX_fakeScan=(v,cb)=>{window._scan=cb;return ()=>{window._scanStopped=1;};};
navigator.mediaDevices=navigator.mediaDevices||{};navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=64;c.height=48;return c.captureStream?c.captureStream():{getTracks:()=>[{stop(){}}]};};"""
ok=[];bad=[]
async def walk(pg,mode,how,shot=None):
    await pg.locator('#matActs button',has_text='Material from the garage').click();await pg.wait_for_timeout(200)
    if shot:await pg.screenshot(path=shot+'a.png')
    await pg.locator('#garBody button',has_text=mode).click();await pg.wait_for_timeout(150)
    if shot:await pg.screenshot(path=shot+'b.png')
    await pg.locator('#garBody button',has_text=how).click()
def chk(n,c):(ok if c else bad).append(n)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();ctx=await b.new_context(viewport={"width":390,"height":844});await ctx.add_init_script(INIT)
    pg=await ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)));E=pg.evaluate
    await pg.goto("file://"+F);await pg.wait_for_timeout(400)
    await E("signIn('u1');setRole(D.emps.find(e=>e.name==='Jon').id);0");await pg.wait_for_timeout(400)
    await E("document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));goTab('mat');0");await pg.wait_for_timeout(300)
    txt=await E("document.getElementById('matActs')?document.getElementById('matActs').innerText:document.body.innerText")
    chk("Request new material button",'Request new material' in txt)
    chk("Material from the garage button",'Material from the garage' in txt and 'Take out' not in txt)
    await pg.screenshot(path="/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/g1.png")
    site=await E("visSites().filter(s=>s.stage!=='done').slice(-1)[0].id");sname=await E(f"siteName('{site}')")
    q0=await E("(D.stock.find(s=>/12\\/2/.test(s.name))||{}).qty")
    await walk(pg,'Take out','Scan barcode','/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/w');await pg.wait_for_timeout(1800)
    chk("Take out opens the camera",await E("!!document.getElementById('scanOv')&&typeof window._scan==='function'"))
    code=await E("(()=>{const s=D.stock.find(s=>/12\\/2/.test(s.name));s.codes=['0012345678905'];return 1})()")
    await E("_scan('012345678905');0");await pg.wait_for_timeout(200);await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    await pg.wait_for_timeout(1900);await E("_scan('012345678905');0");await pg.wait_for_timeout(200);await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    chk("2 counted",await E("puLines.length===1&&puLines[0].qty===2"))
    await pg.locator('.scX').click();await pg.wait_for_timeout(250)
    chk("Done asks 'For which job?'",await E("/For which job/.test(document.getElementById('scSheet').innerText)&&document.getElementById('scSheet').classList.contains('on')"))
    await pg.screenshot(path="/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/g2.png")
    # keep scanning goes back
    await pg.locator('#scSheet button',has_text='Keep scanning').click();await pg.wait_for_timeout(300)
    chk("Keep scanning hides the question",await E("!document.getElementById('scSheet').classList.contains('on')&&!!document.getElementById('scanOv')"))
    await pg.locator('.scX').click();await pg.wait_for_timeout(250)
    await pg.select_option('#scJob',site)
    n0=await E("D.stockLog.length")
    await pg.locator('#scSheet button',has_text='Complete pick-up').click();await pg.wait_for_timeout(300)
    chk("pick-up saved for that job",await E(f"(()=>{{const l=D.stockLog[D.stockLog.length-1];return D.stockLog.length=={n0}+1&&l.kind==='out'&&l.site==='{site}'&&l.items[0].qty===2}})()"))
    chk("garage count went down by 2",await E("(D.stock.find(s=>/12\\/2/.test(s.name))||{}).qty")==max(0,q0-2))
    chk("scanner + window closed",await E("!document.getElementById('scanOv')&&document.getElementById('m-pick2').classList.contains('hid')"))
    # Put back from a job
    await walk(pg,'Put back','Scan barcode');await pg.wait_for_timeout(1800)
    await E("_scan('012345678905');0");await pg.wait_for_timeout(200);await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    await pg.locator('.scX').click();await pg.wait_for_timeout(250)
    chk("Put back asks where it's coming from",await E("/Coming from/.test(document.getElementById('scSheet').innerText)"))
    await pg.select_option('#scJob',site)
    await pg.screenshot(path="/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/g3.png")
    await pg.locator('#scSheet button',has_text='Complete put back').click();await pg.wait_for_timeout(300)
    chk("put back saved with job",await E(f"(()=>{{const l=D.stockLog[D.stockLog.length-1];return l.kind==='in'&&l.site==='{site}'&&/Returned from/.test(l.src)}})()"))
    chk("count back up",await E("(D.stock.find(s=>/12\\/2/.test(s.name))||{}).qty")==max(0,q0-2)+1)
    # Put back = supplier delivery
    await walk(pg,'Put back','Scan barcode');await pg.wait_for_timeout(1800)
    await pg.wait_for_timeout(100);await E("_scan('012345678905');0");await pg.wait_for_timeout(200);await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    await pg.locator('.scX').click();await pg.wait_for_timeout(250)
    await pg.locator('#scSheet button',has_text='Supplier delivery').click()
    await pg.locator('#scSheet button',has_text='Complete put back').click();await pg.wait_for_timeout(200)
    chk("supplier needs a name",await E("!!document.getElementById('scanOv')"))
    await pg.fill('#scSup','Cooper inv 5512');await pg.locator('#scSheet button',has_text='Complete put back').click();await pg.wait_for_timeout(300)
    chk("supplier delivery saved",await E("(()=>{const l=D.stockLog[D.stockLog.length-1];return l.kind==='in'&&l.src==='Cooper inv 5512'&&!l.site})()"))
    # nothing scanned → Done just closes
    await walk(pg,'Take out','Scan barcode');await pg.wait_for_timeout(1800)
    await pg.locator('.scX').click();await pg.wait_for_timeout(200)
    chk("Done with nothing scanned just closes",await E("!document.getElementById('scanOv')"))
    # picture path: photo window opens with job preselected from schedule/nearby
    await pg.locator('#matActs button',has_text='Material from the garage').click();await pg.wait_for_timeout(150)
    await pg.locator('#garBody button',has_text='Put back').click();await pg.wait_for_timeout(100)
    await E("window._camClick=0;document.getElementById('siCam').click=function(){window._camClick=this.id};0")
    await pg.locator('#garBody button',has_text='Take a picture').click();await pg.wait_for_timeout(200)
    v=await E("window._camClick");chk(f"Take a picture opens the camera ({v})",v=="siCam")
    chk("Put back window has 'From which job?'",await E("!document.getElementById('m-stockin').classList.contains('hid')&&document.getElementById('siSite').options.length>1"))
    await E("hide('m-stockin');0")
    # Spanish
    await E("D.emps.find(e=>e.id===me().id).lang='es';try{setLang&&setLang('es')}catch(e){};renderAll();0")
    chk(f"no page errors {errs[:2]}",not errs)
    await b.close()
  for x in ok:print("  ✓",x)
  for x in bad:print("  ✗",x)
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
