# Garage barcode scanner: known barcode → item + count; unknown → pick once, remembered; counts with +/−; lines land in Take out / Put back
import asyncio
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
INIT="""window.EX_fakeScan=(v,cb)=>{window._scan=cb;return ()=>{window._scanStopped=1;};};
navigator.mediaDevices=navigator.mediaDevices||{};navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=64;c.height=48;const s=c.captureStream?c.captureStream():null;window._camOn=1;return s||{getTracks:()=>[{stop(){}}]};};"""
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();ctx=await b.new_context(viewport={"width":390,"height":844});await ctx.add_init_script(INIT)
    pg=await ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)));E=pg.evaluate
    await pg.goto("file://"+F);await pg.wait_for_timeout(400)
    await E("signIn('u1');setRole(D.emps.find(e=>e.name==='Jon').id);0");await pg.wait_for_timeout(500)
    await E("document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));openPickup();0");await pg.wait_for_timeout(200)
    chk("Take out has 'Scan barcodes'",await E("/Scan barcodes/.test(document.getElementById('m-pick2').innerText)"))
    await pg.locator('#m-pick2 button',has_text='Scan barcodes').click();await pg.wait_for_timeout(2000)
    chk("camera scanner opens",await E("!!document.getElementById('scanOv')&&window._camOn===1&&typeof window._scan==='function'"))
    # unknown barcode → asks which item
    await E("_scan('012345678905');0");await pg.wait_for_timeout(200)
    chk("new barcode asks which item",await E("document.getElementById('scSheet').classList.contains('on')&&/New barcode/.test(document.getElementById('scSheet').innerText)"))
    chk("UPC-A stored as EAN-13",await E("scM.pausedCode==='0012345678905'"))
    await pg.fill('#scFind','12/2 romex');await E("scMatch();0");await pg.wait_for_timeout(100)
    await pg.locator('#scRes .pk').first.click();await pg.wait_for_timeout(200)
    chk("then asks how many, with the item name",await E("/How many are you taking out/.test(document.getElementById('scSheet').innerText)&&/12\\/2/.test(document.getElementById('scSheet').innerText)"))
    await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    linked=await E("D.stock.find(s=>(s.codes||[]).includes('0012345678905'))?.name||''")
    chk(f"barcode remembered on the item ({linked})",'12/2' in linked)
    chk("first box counted",await E("puLines.length===1&&puLines[0].qty===1"))
    # scan same box again (after the repeat-guard) → 2
    await pg.wait_for_timeout(1900);await E("_scan('012345678905');0");await pg.wait_for_timeout(150)
    chk("known barcode → shows the item + 'how many?' right away",await E("/How many/.test(document.getElementById('scSheet').innerText)&&!!document.querySelector('#scSheet .scItem')"))
    await E("_scan('012345678905');0");await pg.wait_for_timeout(100)
    chk("a second scan while asking is ignored",await E("puLines[0].qty===1&&!!document.getElementById('scQok')"))
    await pg.locator('.scChips .chip',has_text='5').first.click()
    chk("tap 5 → button says Take out 5",await E("/Take out 5/.test(document.getElementById('scQok').textContent)"))
    await pg.locator('.scStep button').last.click()
    chk("+ makes it 6",await E("document.getElementById('scQn').value==='6'"))
    await pg.fill('#scQn','12')
    chk("typing 12 works",await E("/Take out 12/.test(document.getElementById('scQok').textContent)"))
    await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    chk("12 more added → 13",await E("puLines[0].qty===13"))
    # +/- on the list
    await pg.locator('.scRow button',has_text='+').first.click();chk("+ adds one",await E("puLines[0].qty===14"))
    await pg.locator('.scRow button',has_text='−').first.click();chk("− removes one",await E("puLines[0].qty===13"))
    # wrong item → barcode taken off, asks again
    await pg.wait_for_timeout(1900);await E("_scan('012345678905');0");await pg.wait_for_timeout(150)
    await pg.locator('#scSheet button',has_text='Wrong item').click();await pg.wait_for_timeout(150)
    chk("Wrong item → asks which item again",await E("/New barcode/.test(document.getElementById('scSheet').innerText)&&!D.stock.some(s=>(s.codes||[]).includes('0012345678905'))"))
    await pg.fill('#scFind','12/2 romex');await E("scMatch();0");await pg.wait_for_timeout(100)
    await pg.locator('#scRes .pk').first.click();await pg.wait_for_timeout(150);await pg.locator('.scStep button').first.click()
    chk("can't take out 0 / − stops at 1",await E("document.getElementById('scQn').value==='1'"))
    await pg.locator('#scSheet button',has_text='Cancel').click();await pg.wait_for_timeout(100)
    chk("Cancel adds nothing",await E("puLines[0].qty===13"))
    # brand new item typed in
    await pg.wait_for_timeout(1900);await E("_scan('4006381333931');0");await pg.wait_for_timeout(150)
    await pg.fill('#scFind','Wago 221-413 box');await E("scMatch();0");await pg.wait_for_timeout(100)
    await pg.locator('#scRes .pk',has_text='New item').click();await pg.wait_for_timeout(150)
    await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    chk("new item created with its barcode",await E("D.stock.some(s=>s.name==='Wago 221-413 box'&&(s.codes||[]).includes('4006381333931'))"))
    chk("two lines now",await E("puLines.length===2"))
    # skip
    await pg.wait_for_timeout(1900);await E("_scan('999');0");await pg.wait_for_timeout(100);await pg.locator('#scSheet button',has_text='Skip').click()
    chk("skip leaves list as is",await E("puLines.length===2&&!document.getElementById('scSheet').classList.contains('on')"))
    # done → lines in Take out, camera off
    await pg.locator('.scBack').click();await pg.wait_for_timeout(200)
    chk("✕ closes and stops the camera",await E("!document.getElementById('scanOv')&&window._scanStopped===1"))
    chk("lines show in Take out",await E("/12\\/2/.test(document.getElementById('puLines').innerText)&&/Wago/.test(document.getElementById('puLines').innerText)"))
    # Put back knows the barcode now (another person)
    await E("hide('m-pick2');setRole(D.emps.find(e=>e.name==='Brian').id);openStockIn();0");await pg.wait_for_timeout(200)
    await pg.locator('#m-stockin button',has_text='Scan barcodes').click();await pg.wait_for_timeout(2000)
    await E("_scan('012345678905');0");await pg.wait_for_timeout(150)
    chk("Put back asks 'how many are you putting back'",await E("/putting back/.test(document.getElementById('scSheet').innerText)"))
    await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    chk("Put back recognizes the remembered barcode right away",await E("siLines.length===1&&/12\\/2/.test(siLines[0].name)&&!document.getElementById('scSheet').classList.contains('on')"))
    await E("scanClose();0")
    chk(f"no page errors {errs[:2]}",not errs)
    await b.close()
  for x in ok:print("  ✓",x)
  for x in bad:print("  ✗",x)
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
