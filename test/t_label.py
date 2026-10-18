# Barcode not in any store database → read the item name from the label around it (photo text)
import asyncio,json
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
SC="/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/"
TOY=open(SC+"lbl.txt").read()   # real text read from Baruch's toy-tag photo
LEV="LEVITON\nGFNT1-W\n15A 125V Self-Test GFCI Receptacle\nSmartlockPro\nMADE IN CHINA\nwww.leviton.com\n0 78477 71483 6\n"
WIRE="SOUTHWIRE\n12/2 NM-B W/G 250 FT\nRomex SIMpull\nUL Listed\nCarrollton GA\n"
INIT="""window.EX_fakeScan=(v,cb)=>{window._scan=cb;return ()=>{};};
navigator.mediaDevices=navigator.mediaDevices||{};navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const g=c.getContext('2d');setInterval(()=>{g.fillStyle='#ccc';g.fillRect(0,0,640,480)},100);return c.captureStream(10);};
window.EX_upc=async(code)=>({found:false});"""
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();ctx=await b.new_context(viewport={"width":390,"height":844});await ctx.add_init_script(INIT)
    pg=await ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)));E=pg.evaluate
    await pg.goto("file://"+F);await pg.wait_for_timeout(400)
    for txt,want in [(TOY,'7" Bananya Asst'),(LEV,'15A 125V Self-Test GFCI Receptacle'),(WIRE,'12/2 NM-B W/G 250 FT')]:
      r=await E("t=>labelLines(t)",txt);chk(f"best name {r[:1]} (want {want})",bool(r) and r[0].startswith(want))
    r=await E("t=>labelLines(t)",TOY);chk(f"junk line from the photo is not offered {r}",not any('Qurasy' in x for x in r))
    r=await E("t=>labelLines(t)","Hit\n| |\n\nNAnNLO!\n25069\n");chk(f"no name on the label → nothing guessed {r}",len(r)==0)
    await E("signIn('u1');setRole(D.emps.find(e=>e.name==='Jon').id);document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));scanQuick('out');0");await pg.wait_for_timeout(1800)
    await E("t=>{window.ocrText=async()=>{await new Promise(r=>setTimeout(r,300));return t};0}",TOY)
    await E("_scan('4611000');0");await pg.wait_for_timeout(150)
    chk("took a picture of the label",await E("(scM.snap||'').startsWith('data:image/jpeg')"))
    await pg.wait_for_timeout(700)
    txt=await E("document.getElementById('scSheet').innerText")
    chk("shows the name from the label",'Bananya' in txt)
    await pg.screenshot(path=SC+"lbl_shot.png")
    await pg.locator('#scAddLbl').click();await pg.wait_for_timeout(200);await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    chk("item made with that name + barcode saved",await E("D.stock.some(s=>/Bananya/.test(s.name)&&(s.codes||[]).includes('4611000'))"))
    chk("counted",await E("puLines.some(l=>/Bananya/.test(l.name))"))
    await pg.wait_for_timeout(1900);await E("_scan('4611000');0");await pg.wait_for_timeout(150);await pg.locator('#scQok').click();await pg.wait_for_timeout(150)
    chk("next scan knows it right away",await E("puLines.find(l=>/Bananya/.test(l.name)).qty===2"))
    # OCR can't load → falls back to typing, never hangs
    await E("window.ocrText=async()=>{throw new Error('ocr-load')};0")
    await pg.wait_for_timeout(1900);await E("_scan('5551234');0");await pg.wait_for_timeout(500)
    chk("label reader down → type the item",await E("/type the item/.test(document.getElementById('scLook').innerText)"))
    await E("scSkip();0")
    chk(f"no page errors {errs[:2]}",not errs)
    await b.close()
  for x in ok:print("  ✓",x)
  for x in bad:print("  ✗",x)
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
