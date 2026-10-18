# New barcode → looked up online → "Add this item" (no typing); not found → type it; lookup slow/down → still works
import asyncio
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
SC="/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/"
INIT="""window.EX_fakeScan=(v,cb)=>{window._scan=cb;return ()=>{};};
navigator.mediaDevices=navigator.mediaDevices||{};navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=64;c.height=48;return c.captureStream();};
window.EX_upc=async(code)=>{window._asked=(window._asked||[]).concat(code);await new Promise(r=>setTimeout(r,300));
 if(code==='0078477714836')return {found:true,title:'Leviton SmartLockPro Self-Test 15A White Tamper Resistant 5-15R GFCI Outlet',brand:'Leviton',model:'R02-GFNL1-00W',image:'https://images.thdstatic.com/x.jpg'};
 if(code==='0000000000017')return null; return {found:false};};"""
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();ctx=await b.new_context(viewport={"width":390,"height":844});await ctx.add_init_script(INIT)
    await ctx.route("https://images.thdstatic.com/**",lambda r:r.fulfill(status=404))
    pg=await ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)));E=pg.evaluate
    await pg.goto("file://"+F);await pg.wait_for_timeout(400)
    await E("signIn('u1');setRole(D.emps.find(e=>e.name==='Jon').id);document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));scanQuick('out');0");await pg.wait_for_timeout(1800)
    n0=await E("D.stock.length")
    await E("_scan('078477714836');0");await pg.wait_for_timeout(100)
    chk("shows 'Looking up…' right away",await E("/Looking up/.test(document.getElementById('scSheet').innerText)"))
    await pg.wait_for_timeout(500)
    chk("product name shows",await E("/Leviton SmartLockPro/.test(document.getElementById('scLook').innerText)"))
    await pg.screenshot(path=SC+"upc1.png")
    await pg.locator('#scSheet button',has_text='Yes, add to garage items').click();await pg.wait_for_timeout(200)
    chk("then shows the store picture + asks how many",await E("/How many/.test(document.getElementById('scSheet').innerText)&&/thdstatic|data:image/.test(document.querySelector('#scSheet .scItem img,#scSheet .scNoPic')?.src||'data:image')"))
    await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    chk("new item made from the online name, barcode saved",await E(f"D.stock.length=={n0}+1&&D.stock.some(s=>/Leviton SmartLockPro/.test(s.name)&&s.codes.includes('0078477714836')&&s.brand==='Leviton')"))
    chk("counted 1 and scanner continues",await E("puLines.length===1&&puLines[0].qty===1&&!document.getElementById('scSheet').classList.contains('on')"))
    await pg.wait_for_timeout(1900);await E("_scan('078477714836');0");await pg.wait_for_timeout(150);await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    chk("next scan of same barcode is instant (no lookup)",await E("puLines[0].qty===2&&window._asked.length===1"))
    await pg.wait_for_timeout(1900);await E("_scan('0638457250695');0");await pg.wait_for_timeout(600)
    chk("not found → asks to type",await E("/Not found online/.test(document.getElementById('scLook').innerText)"))
    await pg.fill('#scFind','Magazine test');await E("scMatch();0");await pg.locator('#scRes .pk',has_text='New item').click();await pg.wait_for_timeout(150);await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    chk("typed item saved",await E("D.stock.some(s=>s.name==='Magazine test')"))
    await pg.wait_for_timeout(1900);await E("_scan('0000000000017');0");await pg.wait_for_timeout(600)
    chk("lookup down → still lets you type",await E("/Not found online/.test(document.getElementById('scLook').innerText)&&!!document.getElementById('scFind')"))
    await E("scSkip();0")
    chk(f"no page errors {errs[:2]}",not errs)
    await b.close()
  for x in ok:print("  ✓",x)
  for x in bad:print("  ✗",x)
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
