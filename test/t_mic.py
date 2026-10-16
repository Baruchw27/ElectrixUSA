# 🎤 on every typing box: shows on focus, fills the box from speech, works in tasks/notes/search, not on passwords
import asyncio
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
FAKE="""window.SpeechRecognition=class extends EventTarget{constructor(){super();window._sr=this;this.lang='';}start(){window._srLang=this.lang;setTimeout(()=>{this.dispatchEvent(new Event('start'));const words=(window._say||'hang six recessed lights').split(' ');let acc=[];words.forEach((w,i)=>setTimeout(()=>{acc.push(w);const r=[[{transcript:acc.join(' ')}]];this.dispatchEvent(new Event('result'));this.onresult&&this.onresult({results:r});},20*i));},20);}stop(){setTimeout(()=>{this.dispatchEvent(new Event('end'));this.onend&&this.onend();},10);}abort(){this.stop();}};"""
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for touch in (False,True):
      ctx=await b.new_context(viewport={"width":390,"height":844},has_touch=touch,is_mobile=touch);await ctx.add_init_script(FAKE)
      pg=await ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)))
      await pg.goto("file://"+F);await pg.wait_for_timeout(400);E=pg.evaluate
      await E("signIn('u1');document.querySelectorAll('div.ov[id^=m-]').forEach(o=>o.classList.add('hid'));openJob();0");await pg.wait_for_timeout(200)
      chk(f"{touch}: hidden before typing",await E("getComputedStyle(document.getElementById('exMic')).display==='none'"))
      tap=(lambda sel: pg.locator(sel).tap()) if touch else (lambda sel: pg.locator(sel).click())
      await tap('#jDesc');await pg.wait_for_timeout(100)
      chk(f"{touch}: 🎤 shows in the task box",await E("getComputedStyle(document.getElementById('exMic')).display==='flex'"))
      inside=await E("(()=>{const a=document.getElementById('exMic').getBoundingClientRect(),r=document.getElementById('jDesc').getBoundingClientRect();return a.left>=r.left&&a.right<=r.right+1&&a.top>=r.top-1&&a.bottom<=r.bottom+1;})()")
      chk(f"{touch}: 🎤 sits inside the box",inside)
      await E("window._inp=0;document.getElementById('jDesc').addEventListener('input',()=>_inp++);0")
      await tap('#exMic');await pg.wait_for_timeout(250)
      chk(f"{touch}: listening (red)",await E("document.getElementById('exMic').classList.contains('on')"))
      v=await E("document.getElementById('jDesc').value");chk(f"{touch}: words typed into the task ({v})",v=='Hang six recessed lights')
      chk(f"{touch}: box still has focus",await E("document.activeElement.id==='jDesc'"))
      chk(f"{touch}: app is told about the new text",await E("_inp")>0)
      await tap('#exMic');await pg.wait_for_timeout(100)
      chk(f"{touch}: tap again stops",not await E("document.getElementById('exMic').classList.contains('on')"))
      # adds to what's already there
      await E("window._say='in the kitchen';0");await tap('#exMic');await pg.wait_for_timeout(200);await tap('#exMic')
      v=await E("document.getElementById('jDesc').value");chk(f"{touch}: adds to existing text ({v})",v=='Hang six recessed lights in the kitchen')
      # Spanish
      await E("me().lang='es';0");await tap('#exMic');await pg.wait_for_timeout(80);await tap('#exMic');chk(f"{touch}: Spanish listening",await E("_srLang")=='es-US');await E("me().lang='en';0")
      # closes with the window
      await E("hide('m-job');0");await pg.wait_for_timeout(700)
      chk(f"{touch}: 🎤 goes away when the window closes",await E("getComputedStyle(document.getElementById('exMic')).display==='none'"))
      # search box + meeting title + note
      await E("goTab('sites');0");await pg.wait_for_timeout(150);await tap('#siteFind');await pg.wait_for_timeout(80)
      chk(f"{touch}: 🎤 on job search",await E("getComputedStyle(document.getElementById('exMic')).display==='flex'"))
      await E("document.activeElement.blur();openMeet();0");await pg.wait_for_timeout(150);await tap('#meTitle');await pg.wait_for_timeout(80)
      chk(f"{touch}: 🎤 on meeting title",await E("getComputedStyle(document.getElementById('exMic')).display==='flex'"))
      await E("window._say='walkthrough with homeowner';0");await tap('#exMic');await pg.wait_for_timeout(200);await tap('#exMic')
      chk(f"{touch}: meeting title filled",(await E("document.getElementById('meTitle').value"))=='Walkthrough with homeowner')
      await E("hide('m-meet');0")
      # never on passwords / dates / numbers
      r=await E("""(()=>{const out=[];['password','date','time','number','email','tel'].forEach(ty=>{const i=document.createElement('input');i.type=ty;document.body.appendChild(i);i.focus();out.push(getComputedStyle(document.getElementById('exMic')).display);i.remove();});return out;})()""")
      chk(f"{touch}: no 🎤 on password/date/number boxes {r}",all(x=='none' for x in r))
      # no microphone support → helpful message, no crash
      await E("window._t=[];const ot=toast;toast=function(a){_t.push(String(a));};0")
      chk(f"{touch}: no page errors {errs[:2]}",not errs)
      await ctx.close()
    # a mic that hangs (iPhone home-screen bug): the app gives up cleanly after 7 s instead of freezing
    ctx=await b.new_context(viewport={"width":390,"height":844});await ctx.add_init_script("window.SpeechRecognition=class extends EventTarget{start(){window._hung=1;}stop(){}abort(){window._aborted=1;}};")
    pg=await ctx.new_page();await pg.goto("file://"+F);await pg.wait_for_timeout(300)
    await pg.evaluate("signIn('u1');window._t=[];toast=function(a){_t.push(String(a));};0");await pg.wait_for_timeout(600);await pg.evaluate("document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));openJob();0");await pg.wait_for_timeout(150)
    await pg.locator('#jDesc').click();await pg.locator('#exMic').click();await pg.wait_for_timeout(300)
    chk("hung mic: listening shown",await pg.evaluate("document.getElementById('exMic').classList.contains('on')"))
    await pg.wait_for_timeout(7500)
    chk("hung mic: stops by itself after 7 s",not await pg.evaluate("document.getElementById('exMic').classList.contains('on')") and await pg.evaluate("window._aborted===1"))
    chk("hung mic: tells you what to do",any('keyboard' in x or 'microphone' in x for x in await pg.evaluate("_t")))
    chk("hung mic: app still works",await pg.evaluate("(()=>{document.getElementById('jDesc').value='typed';return document.getElementById('jDesc').value==='typed'})()"))
    # the old task voice-note button gets the same guard
    await pg.evaluate("toggleRec();0");await pg.wait_for_timeout(7600)
    chk("hung mic: task voice-note button also recovers",await pg.evaluate("!recOn"))
    await ctx.close()
    # phone without speech support
    ctx=await b.new_context(viewport={"width":390,"height":844});await ctx.add_init_script("delete window.SpeechRecognition;delete window.webkitSpeechRecognition;")
    pg=await ctx.new_page();await pg.goto("file://"+F);await pg.wait_for_timeout(300)
    await pg.evaluate("signIn('u1');document.querySelectorAll('div.ov[id^=m-]').forEach(o=>o.classList.add('hid'));window._t=[];toast=function(a){_t.push(String(a));};0");await pg.wait_for_timeout(600);await pg.evaluate("document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));openJob();0");await pg.wait_for_timeout(150)
    await pg.locator('#jDesc').click();await pg.locator('#exMic').click()
    chk("no speech support → tells you to use the keyboard 🎤",any('keyboard' in x for x in await pg.evaluate("_t")))
    await b.close()
  for x in ok:print("  ✓",x)
  for x in bad:print("  ✗",x)
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
