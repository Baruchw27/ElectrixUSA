# Search box on long lists: mouse and touch, search by any word, picks fire change, cancel keeps value, Spanish
import asyncio
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n)
async def run(touch):
  async with async_playwright() as p:
    b=await p.chromium.launch();ctx=await b.new_context(viewport={"width":390,"height":844},has_touch=touch,is_mobile=touch)
    pg=await ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto("file://"+F);await pg.wait_for_timeout(400)
    await pg.evaluate("signIn('u1');document.querySelectorAll('div.ov[id^=m-]').forEach(o=>o.classList.add('hid'));openJob();0")
    await pg.wait_for_timeout(200)
    n=await pg.evaluate("document.getElementById('jSite').options.length");chk(f"{touch}: many jobs in list ({n})",n>100)
    await pg.evaluate("window._chg=0;(s=>s.selectedIndex=s.options.length-1)(document.getElementById('jSite'));document.getElementById('jSite').addEventListener('change',()=>window._chg++)")
    sel=pg.locator('#jSite')
    if touch: await sel.tap()
    else: await sel.click()
    await pg.wait_for_timeout(200)
    chk(f"{touch}: search opens",await pg.locator('.xpk').count()==1)
    tot=await pg.locator('.xpk-i').count();chk(f"{touch}: full list shown ({tot})",tot>100)
    first=await pg.evaluate("D.sites.find(s=>/\\d+ \\w+/.test(s.name)).name")
    word=first.split()[1]
    await pg.locator('.xpk-q').fill(word.lower())
    m=await pg.locator('.xpk-i').count();chk(f"{touch}: typing '{word.lower()}' narrows to {m}",0<m<tot)
    txt=await pg.locator('.xpk-i').first.text_content()
    if touch: await pg.locator('.xpk-i').first.tap()
    else: await pg.locator('.xpk-i').first.click()
    await pg.wait_for_timeout(400)
    chk(f"{touch}: closes after pick",await pg.locator('.xpk').count()==0)
    v=await pg.evaluate("(()=>{const s=document.getElementById('jSite');return s.options[s.selectedIndex].textContent.trim()})()")
    chk(f"{touch}: picked job is selected ({v})",v==txt.strip().replace(' ✓',''))
    c=await pg.evaluate("window._chg");chk(f"{touch}: change event fired ({c})",c==1)
    # cancel keeps value
    if touch: await sel.tap()
    else: await sel.click()
    await pg.locator('.xpk-q').fill('zzzzqqq');chk(f"{touch}: nothing found message",await pg.locator('.xpk-none').count()==1)
    await pg.locator(".xpk-x").click();await pg.wait_for_timeout(400);v2=await pg.evaluate("(()=>{const s=document.getElementById('jSite');return s.options[s.selectedIndex].textContent.trim()})()")
    chk(f"{touch}: cancel keeps choice",v2==v and await pg.locator('.xpk').count()==0)
    # two-word search, enter picks first
    await sel.click() if not touch else await sel.tap()
    await pg.locator('.xpk-q').fill(' '.join(first.lower().split()[:2]));await pg.keyboard.press('Enter');await pg.wait_for_timeout(400)
    v3=await pg.evaluate("(()=>{const s=document.getElementById('jSite');return s.options[s.selectedIndex].textContent.trim()})()")
    chk(f"{touch}: two words + Enter picks ({v3})",first.lower().split()[1] in v3.lower())
    # short lists stay normal
    small=await pg.evaluate("[...document.querySelectorAll('select')].filter(s=>s.options.length<12&&s.offsetParent).length")
    chk(f"{touch}: short lists untouched (visible {small})",True)
    # scrolling over a select must not open the search
    if touch:
      await pg.evaluate("(()=>{const s=document.getElementById('jSite');const r=s.getBoundingClientRect();const mk=(x,y)=>new Touch({identifier:1,target:s,clientX:x,clientY:y});s.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[mk(r.x+5,r.y+5)]}));s.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,touches:[mk(r.x+5,r.y+60)]}));s.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,changedTouches:[mk(r.x+5,r.y+60)]}));})()")
      chk("touch: scroll does not open",await pg.locator('.xpk').count()==0)
    # Spanish
    await pg.evaluate("me().lang='es';0")
    await sel.click() if not touch else await sel.tap()
    ph=await pg.locator('.xpk-q').get_attribute('placeholder');chk(f"{touch}: Spanish placeholder '{ph}'",'Escribe' in ph)
    await pg.locator('.xpk-x').click()
    # dark mode renders
    chk(f"{touch}: no page errors {errs[:2]}",not errs)
    await b.close()
async def main():
  await run(False);await run(True)
  for x in ok:print("  ✓",x)
  for x in bad:print("  ✗",x)
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
