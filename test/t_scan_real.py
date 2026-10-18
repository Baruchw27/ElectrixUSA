# Real barcode reading (no fake): a camera that shows a printed barcode, slightly blurred and tilted; the real ZXing reader must read it.
import asyncio,base64,sys
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
Z="/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/zx/"
def cam(png,angle,scale,portrait=True):
  b64=base64.b64encode(open(Z+png,'rb').read()).decode()
  W,H=(720,1280) if portrait else (1280,720)
  return """try{delete window.BarcodeDetector}catch(e){};window.BarcodeDetector=undefined;delete window.BarcodeDetector;
navigator.mediaDevices=navigator.mediaDevices||{};navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=%d;c.height=%d;const x=c.getContext('2d');const im=new Image();im.src='data:image/png;base64,%s';await im.decode();
 let f=0;const draw=()=>{x.fillStyle='#8a8a80';x.fillRect(0,0,c.width,c.height);x.save();x.translate(c.width/2+Math.sin(f++/5)*6,c.height/2);x.rotate(%f*Math.PI/180);const w=im.width*%f,h=im.height*%f;x.drawImage(im,-w/2,-h/2,w,h);x.restore();
 const d=x.getImageData(0,0,c.width,c.height);for(let i=0;i<d.data.length;i+=4){const n=(Math.random()-.5)*40;d.data[i]+=n;d.data[i+1]+=n;d.data[i+2]+=n;}x.putImageData(d,0,0);};draw();setInterval(draw,100);window._camOn=1;return c.captureStream(15);};"""%(W,H,b64,angle,scale,scale)
async def run(p,png,angle,scale,want,portrait=True):
  b=await p.chromium.launch();ctx=await b.new_context(viewport={"width":390,"height":844});await ctx.add_init_script(cam(png,angle,scale,portrait))
  await ctx.route("**/@zxing/library@0.21.3/umd/index.min.js",lambda r:r.fulfill(path=Z+"zxing.umd.js",content_type="application/javascript"))
  pg=await ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)));E=pg.evaluate
  await pg.goto("file://"+F);await pg.wait_for_timeout(400)
  await E("signIn('u1');setRole(D.emps.find(e=>e.name==='Jon').id);document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));0")
  await E("window._hits=[];const o=scHit;scHit=function(c){window._hits.push(c);return o.apply(this,arguments)};scanQuick('out');0")
  t=0
  while t<8000:
    await pg.wait_for_timeout(250);t+=250
    h=await E("window._hits")
    if h:break
  await b.close()
  return h,t,errs
async def main():
  ok=bad=0
  async with async_playwright() as p:
    for png,ang,sc,want,por in [('ean.png',0,1.0,'0012345678905',True),('ean.png',4,0.8,'0012345678905',True),('ean2.png',-6,1.3,'4006381333931',False),('ean.png',90,1.0,'0012345678905',True),('ean2.png',0,0.6,'4006381333931',True)]:
      h,t,e=await run(p,png,ang,sc,want,por)
      good=any(x.lstrip('0')==want.lstrip('0') for x in h) and not e
      print(("  ✓" if good else "  ✗"),f"{png} tilt {ang}° size {sc} {'portrait' if por else 'landscape'} → {h[:1]} in {t} ms",e[:1]);ok+=good;bad+=not good
  print(f"{ok} passed, {bad} failed")
asyncio.run(main())
