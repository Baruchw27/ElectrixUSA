# The iPhone camera path end to end in a real browser: camera stream → the app's frame crops (centre / full / turned)
# → binarizer rows → the app's own UPC-E reader → double-read rule → scHit. ZXing itself can't be downloaded here,
# so a stand-in with ZXing's exact interface is used (it never finds a code, so every frame goes through the whole
# path). This is the test that would have caught a broken line in the frame-crop code.
import asyncio, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); F = os.path.join(HERE, '..', '..', 'staging', 'index.html')
UPCE = '04710493'
L = ['3211','2221','2122','1411','1132','1231','1114','1312','1213','3112']; G = [x[::-1] for x in L]
PAR = ['EEEOOO','EEOEOO','EEOOEO','EEOOOE','EOEEOO','EOOEEO','EOOOEE','EOEOEO','EOEOOE','EOOEOE']
def enc(c):
    p = PAR[int(c[7])]; s = '111' + ''.join((L if p[i] == 'O' else G)[int(c[1 + i])] for i in range(6)); return s + '111111'
SBS = enc(UPCE)
INIT = """
delete window.BarcodeDetector;
window._hits=[]; window._errs=[];
navigator.mediaDevices=navigator.mediaDevices||{};
navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;const g=c.getContext('2d');
  const sbs='%s'.split('').map(Number);const m=6;const tot=sbs.reduce((a,b)=>a+b,0);
  const draw=()=>{g.fillStyle='#eee';g.fillRect(0,0,1280,720);let x=(1280-tot*m)/2;g.fillStyle='#111';sbs.forEach((w,i)=>{if(i%%2===0)g.fillRect(x,260,w*m,200);x+=w*m;});};
  draw();setInterval(draw,100);return c.captureStream(10);};
// stand-in for ZXing 0.21.3 (same names the app uses); never finds a code itself
window._zxCalls={decode:0,rows:0};
window.ZXing=(()=>{const BarcodeFormat={EAN_13:7,EAN_8:6,UPC_A:14,UPC_E:15,CODE_128:4,CODE_39:2,ITF:8,QR_CODE:11,DATA_MATRIX:5};
  const DecodeHintType={POSSIBLE_FORMATS:2,TRY_HARDER:3};
  class HTMLCanvasElementLuminanceSource{constructor(c){this.w=c.width;this.h=c.height;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;this.l=new Uint8Array(this.w*this.h);for(let i=0;i<this.l.length;i++)this.l[i]=(d[i*4]+d[i*4+1]+d[i*4+2])/3;}}
  class HybridBinarizer{constructor(s){this.s=s;}} class GlobalHistogramBinarizer{constructor(s){this.s=s;}}
  class BinaryBitmap{constructor(b){this.s=b.s;}getWidth(){return this.s.w}getHeight(){return this.s.h}
    getBlackRow(y){window._zxCalls.rows++;const s=this.s,row=s.l.subarray(y*s.w,(y+1)*s.w);return {get:i=>row[i]<128};}}
  class MultiFormatReader{setHints(){}decodeWithState(){window._zxCalls.decode++;const e=new Error('NotFound');e.name='NotFoundException';throw e;}reset(){}}
  return {BarcodeFormat,DecodeHintType,HTMLCanvasElementLuminanceSource,HybridBinarizer,GlobalHistogramBinarizer,BinaryBitmap,MultiFormatReader};})();
""" % SBS
async def main():
    ok = []; bad = []
    def chk(n, c, x=''): (ok if c else bad).append(n); print(('  ✓ ' if c else '  ✗ ') + n + ('' if c else '  ' + str(x)[:200]))
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 390, 'height': 844}); await ctx.add_init_script(INIT)
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/*', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
        await pg.goto('file://' + F); await pg.wait_for_timeout(700)
        await pg.evaluate("loadZX=()=>Promise.resolve(window.ZXing);signIn('u1');setRole(D.emps.find(e=>e.name==='Jon').id);document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));0")
        await pg.evaluate("const h=window.scHit;window.scHit=function(raw,fmt,via){_hits.push([raw,fmt,Date.now()]);return h.apply(this,arguments)};0")
        await pg.evaluate("scanQuick('in');0"); await pg.wait_for_timeout(4000)
        hits = await pg.evaluate("_hits"); calls = await pg.evaluate("_zxCalls")
        chk('camera frames go through the decoder (no errors in the crop/turn code)', calls['decode'] > 10 and not errs, (calls, errs[:2]))
        chk('the app\'s UPC-E reader reads the real bars from the camera frames', any(h[0] == UPCE and h[1] == 'UPC_E' for h in hits), hits[:3])
        chk('item sheet opens for that barcode', 'New barcode' in await pg.evaluate("(document.getElementById('scSheet')||{}).innerText||''"))
        chk('read time recorded', (await pg.evaluate("scM&&scM.decodeMs")) is not None)
        await b.close()
    print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
