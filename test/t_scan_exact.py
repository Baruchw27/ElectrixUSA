# Scanner names the exact item: box barcodes, maker from the barcode, part number from the label, "New inventory"
# The label texts are real OCR output from Baruch's garage photos (Leviton 5603-P2W, 80409-NW, Luxrite LR25022).
import asyncio,os,sys
from playwright.async_api import async_playwright
F=sys.argv[1] if len(sys.argv)>1 else os.path.dirname(os.path.abspath(__file__))+"/../staging/index.html"
H=os.path.dirname(os.path.abspath(__file__))+"/"
SW=open(H+"lbl_leviton_switch.txt").read();WP=open(H+"lbl_leviton_plate.txt").read();LX=open(H+"lbl_luxrite_trim.txt").read()
INIT="""window.EX_fakeScan=(v,cb)=>{window._scan=cb;return ()=>{};};
navigator.mediaDevices=navigator.mediaDevices||{};navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const g=c.getContext('2d');setInterval(()=>{g.fillStyle='#ccc';g.fillRect(0,0,640,480)},100);return c.captureStream(10);};
window.EX_upc=async(code)=>{window._asked=code;return {found:false};};"""
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();ctx=await b.new_context(viewport={"width":390,"height":844});await ctx.add_init_script(INIT)
    pg=await ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.route("**/*",lambda r:r.abort() if r.request.url.startswith("http") else r.continue_())
    E=pg.evaluate;await pg.goto("file://"+F);await pg.wait_for_timeout(600)
    await E("window.EX_upc=async(code)=>{window._asked=code;return {found:false};};0")
    for txt,code,want in [(SW,"30078477339641","Leviton 5603-P2W 3-Way Switch"),(WP,"30078477488509","Leviton 80409-NW 2G Std Decora Wallplate"),(LX,"0793888426948","Luxrite LR25022 2\" Round White Trim")]:
      r=await E("([t,c])=>labelParse(t,c).name",[txt,code]);chk(f"exact name {r!r}",r.startswith(want))
    chk("box barcode → item barcode inside",await E("bcInner('30078477339641')==='0078477339640'"))
    chk("misread box barcode is not trusted",await E("bcInner('30078477644688')===''"))
    chk("maker from the barcode alone",await E("bcBrand('30078477488509')==='Leviton'&&bcBrand('793888426948')==='Luxrite'"))
    chk("ratings / listings are never taken as part numbers",await E("['15A-120/277V AC/CA','UL LISTED 262B NOM 057','12/2 NM-B 250FT','3RJW'].every(x=>labelPart(x)==='')"))
    await E("signIn('u1');setRole(D.emps.find(e=>e.name==='Jon').id);document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));scanQuick('in');0");await pg.wait_for_timeout(1800)
    await E("t=>{window.ocrText=async()=>{await new Promise(r=>setTimeout(r,200));return t};0}",SW)
    await E("_scan('30078477339641');0");await pg.wait_for_timeout(1200)
    chk("online lookup asked with the single-item barcode",await E("window._asked==='0078477339640'"))
    txt=await E("document.getElementById('scSheet').innerText");chk("offers 'Leviton 5603-P2W …'",'Leviton 5603-P2W' in txt)
    await pg.locator('#scAddLbl').click();await pg.wait_for_timeout(200)
    chk("item saved with part number + maker",await E("D.stock.some(s=>s.model==='5603-P2W'&&s.brand==='Leviton'&&(s.codes||[]).includes('30078477339641'))"))
    await pg.locator('#scQok').click();await pg.wait_for_timeout(200)
    await pg.wait_for_timeout(1900);await E("_scan('078477339640');0");await pg.wait_for_timeout(200)
    txt=await E("document.getElementById('scSheet').innerText");chk("single switch barcode → same item right away",'5603-P2W' in txt and 'putting back' in txt.lower())
    await E("scSkip();0")
    # an item already in the list with that part number → offered first, no duplicate
    await E("D.stock.push({id:'s_lev_wp',name:'Leviton 80409-NW 2-gang Decora plate white',unit:'pc',qty:40,min:0});0")
    await E("t=>{window.ocrText=async()=>t;0}",WP)
    await pg.wait_for_timeout(1900);await E("_scan('30078477488509');0");await pg.wait_for_timeout(900)
    txt=await E("document.getElementById('scSheet').innerText");chk("asks 'Is it this one?' with the existing plate",'Is it this one?' in txt and '2-gang Decora' in txt)
    await pg.locator('#scSheet button',has_text='Is it this one?').click();await pg.wait_for_timeout(200)
    chk("box barcode linked to the existing item (no duplicate)",await E("D.stock.filter(s=>/80409/.test(s.name)).length===1&&D.stock.find(s=>s.id==='s_lev_wp').codes.includes('30078477488509')"))
    await pg.locator('#scQok').click();await pg.wait_for_timeout(200)
    # finish as New inventory
    await E("scanFinish();0");await pg.wait_for_timeout(200)
    txt=await E("document.getElementById('scSheet').innerText");chk("'New inventory' choice is there",'New inventory' in txt)
    await E("scFrom('new');0");chk("New inventory hides job and supplier",await E("document.getElementById('scJob').style.display==='none'&&document.getElementById('scSup').style.display==='none'"))
    before=await E("D.stock.find(s=>s.id==='s_lev_wp').qty")
    await E("scComplete();0");await pg.wait_for_timeout(500)
    chk("saved as New inventory, stock went up",await E("b=>D.stockLog.some(l=>l.kind==='in'&&/New inventory/.test(l.src||''))&&D.stock.find(s=>s.id==='s_lev_wp').qty>b",before))
    chk(f"no page errors {errs[:2]}",not errs)
    await b.close()
  for x in ok:print("  ✓",x)
  for x in bad:print("  ✗",x)
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
