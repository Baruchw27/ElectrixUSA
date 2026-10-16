# WhatsApp-style voice notes & videos on tasks: hold / slide-to-cancel / tap hands-free, send with no text, play, reply, video
import asyncio, os
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
VID=os.path.join(os.path.dirname(os.path.abspath(__file__)),'sample.mp4')
FAKE="""
(()=>{function wav(sec){const sr=8000,n=sr*sec,b=new ArrayBuffer(44+n*2),v=new DataView(b);const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
 w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.sin(i/4)*3000,true);return b;}
 navigator.mediaDevices=navigator.mediaDevices||{};navigator.mediaDevices.getUserMedia=async()=>{window._gum=(window._gum||0)+1;return {getTracks:()=>[{stop(){window._stopped=(window._stopped||0)+1;}}]};};
 window.MediaRecorder=class{static isTypeSupported(m){return false;}constructor(s,o){this.state='inactive';this.mimeType='audio/wav';}start(){this.state='recording';this._t0=Date.now();}
   stop(){this.state='inactive';const sec=Math.max(1,Math.round((Date.now()-this._t0)/1000));this.ondataavailable&&this.ondataavailable({data:new Blob([wav(sec)],{type:'audio/wav'})});setTimeout(()=>this.onstop&&this.onstop(),5);}};
})();"""
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();ctx=await b.new_context(viewport={"width":390,"height":844},has_touch=True);await ctx.add_init_script(FAKE)
    pg=await ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)));E=pg.evaluate
    await pg.goto("file://"+F);await pg.wait_for_timeout(400)
    await E("signIn('u1');window._t=[];const ot=toast;toast=function(a){_t.push(String(a));return ot.apply(this,arguments)};0");await pg.wait_for_timeout(500)
    await E("document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));openJob();0");await pg.wait_for_timeout(200)
    chk("new task shows 🎙 Hold to talk + 🎥 Video",await E("!!document.querySelector('#jMediaBar .mrec')&&!!document.querySelector('#jMediaBar .mvid')"))
    box=await pg.locator('#jMediaBar .mrec').bounding_box();cx=box['x']+box['width']/2;cy=box['y']+box['height']/2
    # 1. hold 1.6 s and let go → voice note attached
    await pg.mouse.move(cx,cy);await pg.mouse.down();await pg.wait_for_timeout(600)
    chk("recording shows red dot + timer + slide hint",await E("!document.getElementById('mlive_new').hidden&&/Slide to cancel/.test(document.getElementById('mlive_new').innerText)"))
    await pg.wait_for_timeout(1000);await pg.mouse.up();await pg.wait_for_timeout(300)
    n=await E("jMedia.length");chk(f"hold + let go attaches the voice note ({n})",n==1)
    chk("voice bubble shows with ▶ and length",await E("!!document.querySelector('#jMediaList .mb .mplay')&&/0:0[12]/.test(document.querySelector('#jMediaList .mdur').textContent)"))
    chk("mic released after recording",await E("window._stopped>=1"))
    # 2. slide left → cancelled
    await pg.mouse.move(cx,cy);await pg.mouse.down();await pg.wait_for_timeout(700);await pg.mouse.move(cx-120,cy,steps=5);await pg.wait_for_timeout(200);await pg.mouse.up();await pg.wait_for_timeout(200)
    chk("slide left cancels",await E("jMedia.length")==1 and await E("_t.some(x=>/deleted/.test(x))"))
    # 3. quick tap → hands-free with Cancel / Done
    await pg.mouse.move(cx,cy);await pg.mouse.down();await pg.wait_for_timeout(120);await pg.mouse.up();await pg.wait_for_timeout(300)
    chk("quick tap → hands-free (Done / Cancel)",await E("!!document.querySelector('#mlive_new .mok')"))
    await pg.wait_for_timeout(1300);await pg.locator('#mlive_new .mok').click();await pg.wait_for_timeout(300)
    chk("Done attaches second voice note",await E("jMedia.length")==2)
    # remove one
    await pg.locator('#jMediaList .mx').first.click();chk("✕ removes a voice note",await E("jMedia.length")==1)
    # 4. video
    await pg.locator('#jMediaBar .mvid').click();await pg.wait_for_timeout(150)
    await pg.set_input_files('#mVidIn',VID);await pg.wait_for_timeout(1500)
    chk("video attached",await E("jMedia.filter(m=>m.kind==='video').length")==1)
    chk("video shows a player",await E("!!document.querySelector('#jMediaList video')"))
    # 5. send with NO text
    await E("(()=>{const y=D.emps.find(e=>e.name==='Yossi');document.querySelectorAll('#jAssign input').forEach(i=>i.checked=i.value===y.id);document.getElementById('jDesc').value='';})();0")
    await E("window._n0=D.inbox.length;saveJob();0");await pg.wait_for_timeout(300)
    j=await E("({desc:D.jobs[0].desc,media:(D.jobs[0].media||[]).map(m=>m.kind),to:D.jobs[0].to})")
    chk(f"task sent with only a voice note + video {j}",j['media']==['audio','video'] and 'Voice note' in j['desc'])
    chk("Yossi notified",await E("D.inbox.slice(0,D.inbox.length-_n0).some(x=>x.to===D.jobs[0].to[0])"))
    chk("form cleared for next task",await E("jMedia.length")==0)
    await E("goTab('jobs');jobFilter='all';jobView='open';renderJobs();0");await pg.wait_for_timeout(300)
    chk("task card shows 🎙 and 🎥",await E("(()=>{const c=document.querySelector('.card[data-j=\"'+D.jobs[0].id+'\"]');return !!c&&/🎙 0:0\\d/.test(c.innerText)&&/🎥/.test(c.innerText);})()"))
    # 6. Yossi opens the chat: plays, replies by voice and text
    await E("setRole(D.jobs[0].to[0]);openJobDetail(D.jobs[0].id);0");await pg.wait_for_timeout(300)
    chk("chat shows the task + voice note + video",await E("document.querySelectorAll('#jdChat .cb').length===3&&document.querySelectorAll('#jdChat .mplay').length===1&&document.querySelectorAll('#jdChat video').length===1"))
    await pg.locator('#jdChat .mplay').click();await pg.wait_for_timeout(500)
    chk("▶ plays (button turns to pause)",await E("document.querySelector('#jdChat .mplay').dataset.st==='pause'"))
    await pg.wait_for_timeout(1800)
    chk("finishes and resets",await E("document.querySelector('#jdChat .mplay').dataset.st==='play'"))
    # starting to record silences a voice note that's playing
    await pg.locator('#jdChat .mplay').click();await pg.wait_for_timeout(300)
    rb=await pg.locator('#jdMic').bounding_box();await pg.mouse.move(rb['x']+20,rb['y']+10);await pg.mouse.down();await pg.wait_for_timeout(300)
    chk("recording stops the voice note that was playing",await E("_mAud===null&&document.querySelector('#jdChat .mplay').dataset.st==='play'"))
    await pg.mouse.move(rb['x']-150,rb['y']+10,steps=4);await pg.mouse.up();await pg.wait_for_timeout(300)
    chk("WhatsApp-style icons (mic / send / camera are drawn icons)",await E("!!document.querySelector('#jdMic svg')&&!!document.querySelector('#jdSend svg')&&!!document.querySelector('.cvid svg')"))
    chk("typing bar with 🎥, message box and 🎙",await E("!!document.querySelector('#jobdBody .cmp .cvid')&&!!document.getElementById('jdTxt')&&!document.getElementById('jdMic').hidden"))
    rb=await pg.locator('#jdMic').bounding_box();await pg.mouse.move(rb['x']+20,rb['y']+10);await pg.mouse.down();await pg.wait_for_timeout(1500);await pg.mouse.up();await pg.wait_for_timeout(400)
    chk("voice reply saved as a chat message",await E("Object.keys(D.jobs[0]).filter(k=>k.startsWith('m_')).length")==1)
    chk("Baruch notified of the reply",await E("D.inbox.some(x=>x.to==='u1'&&/Voice note from/.test(x.msg))"))
    chk("reply bubble on the right (mine)",await E("document.querySelectorAll('#jdChat .cb.me .mplay').length===1"))
    await pg.fill('#jdTxt','On my way, 20 min');await E("chatTyping(document.getElementById('jdTxt'));0")
    chk("typing swaps 🎙 for ➤",await E("!document.getElementById('jdSend').hidden&&document.getElementById('jdMic').hidden"))
    await pg.locator('#jdSend').click();await pg.wait_for_timeout(200)
    chk("text message in the chat",await E("/On my way, 20 min/.test(document.getElementById('jdChat').innerText)"))
    chk("Baruch notified of the text",await E("D.inbox.some(x=>x.to==='u1'&&/On my way/.test(x.msg))"))
    chk("my message shows a single ✓ (Baruch hasn't got it yet)",await E("(()=>{const b=[...document.querySelectorAll('#jdChat .cb.me')].pop();const tk=b.querySelector('.tick');return !!tk&&tk.title==='Sent';})()"))
    # swipe a message → reply to it
    bb=await pg.locator('#jdChat .cb').first.locator('.cbx').bounding_box()
    await pg.mouse.move(bb['x']+20,bb['y']+bb['height']/2);await pg.mouse.down();await pg.mouse.move(bb['x']+60,bb['y']+bb['height']/2,steps=4);await pg.mouse.move(bb['x']+110,bb['y']+bb['height']/2,steps=4);await pg.mouse.up();await pg.wait_for_timeout(300)
    chk("swipe right shows 'Replying to Baruch'",await E("!document.getElementById('jdQuote').hidden&&/Replying to Baruch/.test(document.getElementById('jdQuote').innerText)"))
    await pg.locator('.cqx').click();chk("✕ cancels the reply",await E("document.getElementById('jdQuote').hidden&&jdReply===null"))
    await pg.mouse.move(bb['x']+20,bb['y']+bb['height']/2);await pg.mouse.down();await pg.mouse.move(bb['x']+110,bb['y']+bb['height']/2,steps=8);await pg.mouse.up();await pg.wait_for_timeout(200)
    await pg.fill('#jdTxt','Which boiler?');await E("chatTyping(document.getElementById('jdTxt'));0");await pg.locator('#jdSend').click();await pg.wait_for_timeout(200)
    chk("reply remembers the message it answers",await E("(()=>{const j=D.jobs[0];const k=Object.keys(j).filter(k=>k.startsWith('m_')).find(k=>j[k].text==='Which boiler?');return !!k&&j[k].re==='task';})()"))
    chk("reply bubble shows the quote",await E("(()=>{const b=[...document.querySelectorAll('#jdChat .cb.me')].pop();const q=b.querySelector('.cq');return !!q&&/Baruch/.test(q.innerText);})()"))
    chk("quote bar cleared after sending",await E("document.getElementById('jdQuote').hidden"))
    await E("[...document.querySelectorAll('#jdChat .cb.me')].pop().querySelector('.cq').click();0");await pg.wait_for_timeout(150)
    chk("tapping the quote jumps to the original",await E("document.querySelector('#jdChat .cb[data-mid=\"task\"]').classList.contains('cflash')"))
    # finger swipe (iPhone uses touch, not mouse)
    sw=await E("""(()=>{const b=document.querySelector('#jdChat .cb[data-mid="task"] .cbx');const r=b.getBoundingClientRect();const x=r.left+20,y=r.top+r.height/2;
      const T=(cx,cy)=>new Touch({identifier:7,target:b,clientX:cx,clientY:cy});const fire=(type,cx,cy)=>{const ev=new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[T(cx,cy)],changedTouches:[T(cx,cy)]});b.dispatchEvent(ev);return ev.defaultPrevented;};
      fire('touchstart',x,y);let p=false;[15,35,60,85].forEach(d=>{p=fire('touchmove',x+d,y+2)||p;});fire('touchend',x+85,y+2);return [p,jdReply];})()""")
    chk(f"finger swipe right → reply ({sw})",sw[1]=='task' and sw[0])
    await E("clearReply();0")
    sw=await E("""(()=>{const b=document.querySelector('#jdChat .cb[data-mid="task"] .cbx');const r=b.getBoundingClientRect();const x=r.left+20,y=r.top+10;
      const T=(cx,cy)=>new Touch({identifier:8,target:b,clientX:cx,clientY:cy});const fire=(type,cx,cy)=>{const ev=new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[T(cx,cy)],changedTouches:[T(cx,cy)]});b.dispatchEvent(ev);return ev.defaultPrevented;};
      fire('touchstart',x,y);let p=false;[12,30,60].forEach(d=>{p=fire('touchmove',x+4,y+d)||p;});fire('touchend',x+4,y+60);return [p,jdReply];})()""")
    chk(f"finger scroll up/down is left alone (no reply, page scrolls) {sw}",sw[1] is None and not sw[0])
    # a short vertical scroll over a bubble doesn't trigger a reply
    await pg.mouse.move(bb['x']+20,bb['y']+5);await pg.mouse.down();await pg.mouse.move(bb['x']+30,bb['y']+80,steps=5);await pg.mouse.up();await pg.wait_for_timeout(150)
    chk("scrolling up/down doesn't start a reply",await E("jdReply===null"))
    # 7. Baruch: unread badge, opens → Yossi's ticks turn blue
    await E("hide('m-jobd');setRole('u1');goTab('jobs');jobFilter='all';jobView='open';renderJobs();0");await pg.wait_for_timeout(300)
    chk("Baruch's card shows unread count",await E("(()=>{const c=document.querySelector('.card[data-j=\"'+D.jobs[0].id+'\"] .cun');return !!c&&c.textContent==='3';})()"))
    await E("openJobDetail(D.jobs[0].id);0");await pg.wait_for_timeout(300)
    chk("Baruch's own task message is blue (Yossi opened it)",await E("(()=>{const b=document.querySelector('#jdChat .cb.me .tick');return !!b&&b.title==='Seen';})()"))
    chk("Yossi's messages show on the left",await E("[...document.querySelectorAll('#jdChat .cb.them')].length===3"))
    await E("hide('m-jobd');setRole(D.jobs[0].to[0]);openJobDetail(D.jobs[0].id);0");await pg.wait_for_timeout(300)
    chk("Yossi now sees blue ✓✓ on his message",await E("(()=>{const b=[...document.querySelectorAll('#jdChat .cb.me')].pop();const tk=b.querySelector('.tick');return !!tk&&tk.title==='Seen'&&tk.innerHTML.includes('#34B7F1');})()"))
    await E("hide('m-jobd');setRole('u1');renderJobs();0");await pg.wait_for_timeout(200)
    chk("unread count clears after reading",await E("!document.querySelector('.card[data-j=\"'+D.jobs[0].id+'\"] .cun')"))
    # closing the window while recording throws it away
    await E("openJobDetail(D.jobs[0].id);0");await pg.wait_for_timeout(200)
    rb=await pg.locator('#jdMic').bounding_box();await pg.mouse.move(rb['x']+20,rb['y']+10);await pg.mouse.down();await pg.wait_for_timeout(120);await pg.mouse.up();await pg.wait_for_timeout(300)
    n0=await E("Object.keys(D.jobs[0]).filter(k=>k.startsWith('m_')).length")
    await E("hide('m-jobd');0");await pg.wait_for_timeout(1200)
    chk("closing mid-recording stops the mic",await E("recM===null") and await E("Object.keys(D.jobs[0]).filter(k=>k.startsWith('m_')).length")==n0)
    # 8. worker not on the task can't reply
    await E("setRole(D.emps.find(e=>e.name==='Carlos').id);openJobDetail(D.jobs[0].id);0");await pg.wait_for_timeout(200)
    chk("someone not on the task can't reply",not await E("!!document.querySelector('#jobdBody .cmp')"))
    await E("hide('m-jobd');setRole('u1');0")
    # Spanish labels
    await E("me().lang='es';openJob();0");chk("Spanish: Mantén para hablar",await E("/Mantén para hablar/.test(document.getElementById('jMediaBar').innerText)"));await E("me().lang='en';hide('m-job');0")
    # no recorder on this phone → message, no crash
    await E("window._MR=window.MediaRecorder;delete window.MediaRecorder;openJob();0");await pg.wait_for_timeout(150)
    await pg.locator('#jMediaBar .mrec').dispatch_event('pointerdown');await pg.wait_for_timeout(200)
    tl=await E("_t.slice(-3)");chk(f"no recorder → clear message {tl}",any("record" in x for x in tl))
    chk(f"no page errors {errs[:2]}",not errs)
    await b.close()
  for x in ok:print("  ✓",x)
  for x in bad:print("  ✗",x)
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
