# Receipts: real gas receipt → total filled; non-receipt (pants) rejected; can't save without amount; list shows amount big
import asyncio, os
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
IMG=os.path.join(os.path.dirname(os.path.abspath(__file__)),'receipt.jpg')
MOCK="""window.Tesseract={createWorker:async()=>({recognize:async()=>{window._ocrCalls=(window._ocrCalls||0)+1;if(window._ocrFail)throw new Error('x');return {data:{text:window._ocr||''}};}})};"""
GAS="SHELL\\n123 ROUTE 59 SPRING VALLEY\\n10/16/26 07:42\\nPUMP 4\\nUNLEADED 12.402 GAL\\nPRICE/GAL $3.459\\nFUEL SALE $42.90\\nTOTAL $42.90\\nVISA ****1234\\nAPPROVED AUTH 00231\\nTHANK YOU"
PANTS="GAP\\n32 X 30\\nSLIM"
HD="THE HOME DEPOT\\n2 SPRING VALLEY\\n12/2 ROMEX 250FT 98.00\\nGFCI 20A 21.97\\nSUBTOTAL 119.97\\nTAX 10.35\\nTOTAL $130.32\\nVISA APPROVED"
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n)
async def snap(pg,ocr):
  await pg.evaluate(f"window._ocr={ocr!r};0") if ocr is not None else None
  await pg.evaluate("document.getElementById('exCam').value='';0");await pg.set_input_files('#exCam',IMG);await pg.wait_for_timeout(1500)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();ctx=await b.new_context(viewport={"width":390,"height":844});await ctx.add_init_script(MOCK)
    pg=await ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)));E=pg.evaluate
    await pg.goto("file://"+F);await pg.wait_for_timeout(400)
    await E("signIn('u1');setRole(D.emps.find(e=>e.name==='Christian').id);window._t=[];const ot=toast;toast=function(a){_t.push(String(a));return ot.apply(this,arguments)};0");await pg.wait_for_timeout(500)
    await E("document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));openExp('gas','personal');0");await pg.wait_for_timeout(200)
    # pants
    await snap(pg,PANTS)
    chk("photo of pants is rejected",await E("exFile===null&&/not a receipt/i.test(document.getElementById('exVerify').innerText)"))
    chk("can't save it",await E("document.getElementById('exSaveBtn').disabled"))
    chk("no 'send anyway' after one try",await E("!/It IS a receipt/.test(document.getElementById('exVerify').innerText)"))
    await snap(pg,PANTS)
    chk("after two tries: 'It IS a receipt — office checks' option",await E("/It IS a receipt/.test(document.getElementById('exVerify').innerText)"))
    # real gas receipt
    await snap(pg,GAS)
    chk("gas receipt accepted",await E("!!exFile&&exFile.ai&&exFile.ai.kind==='gas'"))
    v=await E("document.getElementById('exAmtIn').value");chk(f"total filled in automatically ({v})",v=='42.90')
    chk("shows the amount to check",await E("/42\\.90/.test(document.getElementById('exVerify').innerText)&&/Check the amount/.test(document.getElementById('exVerify').innerText)"))
    # amount required
    await E("document.getElementById('exAmtIn').value='';saveExp();0");chk("can't save without the amount",await E("!document.getElementById('m-exp').classList.contains('hid')")and await E("_t.some(x=>/Type the total/.test(x))"))
    await E("document.getElementById('exAmtIn').value='42.90';saveExp();0");await pg.wait_for_timeout(200)
    x=await E("({amt:D.exps[0].amt,type:D.exps[0].type,verified:D.exps[0].verified})");chk(f"saved with amount {x}",x['amt']==42.9 and x['verified'])
    # material receipt in the gas slot → accepted but flagged
    await E("openExp('gas','company');0");await pg.wait_for_timeout(150);await snap(pg,HD)
    chk("material receipt under Gas → flagged for the office",await E("!!exFile&&exFile.doubt===true&&/office will check/.test(document.getElementById('exVerify').innerText)"))
    v=await E("document.getElementById('exAmtIn').value");chk(f"Home Depot total picked (not subtotal/tax) ({v})",v=='130.32')
    await E("saveExp();0");await pg.wait_for_timeout(200)
    # material
    await E("openExp('material','company');exStore='Home Depot';0");await pg.wait_for_timeout(150);await snap(pg,HD)
    chk("material receipt accepted",await E("!!exFile&&!exFile.doubt"))
    await E("hide('m-exp');0")
    # reader can't run (offline / old phone) → saved for office check, must type amount
    await E("openExp('gas','company');window._ocrFail=true;0");await pg.wait_for_timeout(150);await snap(pg,None)
    chk("reader unavailable → office check, type amount",await E("!!exFile&&exFile.unverified&&/type the amount/.test(document.getElementById('exVerify').innerText)"))
    await E("window._ocrFail=false;hide('m-exp');0")
    # office view: amounts big, open receipt, flags
    await E("setRole('u1');moneyView='receipts';goTab('exp');renderExp();0");await pg.wait_for_timeout(300)
    chk("list shows the amount",await E("/\\$42\\.90/.test(document.getElementById('pg-exp').innerText)"))
    chk("📄 opens the receipt",await E("(()=>{const o=[...document.querySelectorAll('#pg-exp [onclick^=\"viewExp\"]')];return o.length>0&&/📄/.test(o[0].innerText);})()"))
    chk("flagged receipt marked 'Check this receipt'",await E("/Check this receipt/.test(document.getElementById('pg-exp').innerText)"))
    await E("document.querySelector('#pg-exp [onclick^=\"viewExp\"]').click();0");await pg.wait_for_timeout(300)
    chk("receipt picture opens to verify",await E("!![...document.querySelectorAll('.ov:not(.hid) img, #pv:not([hidden]) img')].length"))
    chk(f"no page errors {errs[:2]}",not errs)
    await b.close()
  for x in ok:print("  ✓",x)
  for x in bad:print("  ✗",x)
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
