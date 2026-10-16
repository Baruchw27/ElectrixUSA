# Meetings with anyone (only the maker / Baruch can change), home cards for managers, GPS best-reading logic
import asyncio
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();pg=await b.new_page(viewport={"width":390,"height":844});errs=[];pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto("file://"+F);await pg.wait_for_timeout(400)
    E=lambda js:pg.evaluate(js)
    await E("signIn('u1');document.querySelectorAll('div.ov[id^=m-]').forEach(o=>o.classList.add('hid'));0")
    ids=await E("(()=>{const f=n=>(D.emps.find(e=>e.name.split(' ')[0]===n)||{}).id;return {shia:f('Shia'),yossi:f('Yossi'),shauly:f('Shauly'),jon:f('Jon'),carlos:f('Carlos')}})()")
    chk(f"people found {ids}",all(ids.values()))
    # Shia books Yossi + Jon (Baruch preselected)
    await E(f"setRole('{ids['shia']}');0");await pg.wait_for_timeout(100)
    await E("openMeet();0");await pg.wait_for_timeout(100)
    pre=await E("meWith.slice()");chk(f"Baruch preselected for Shia {pre}",pre==['u1'])
    n=await E("document.querySelectorAll('#meWho .chip').length");chk(f"everyone listed to pick ({n})",n>=20)
    await pg.fill('#meWhoQ','jon');n2=await E("document.querySelectorAll('#meWho .chip').length");chk(f"name search narrows ({n2})",0<n2<n)
    await pg.locator('#meWho .chip',has_text='Jon').first.click();await pg.fill('#meWhoQ','');await E("meWhoDraw();0")
    await E(f"meWhoTog('{ids['yossi']}');0")
    await pg.fill('#meTitle','Panel walk');await E("document.getElementById('meDate').value=dkey(new Date(Date.now()+86400000));0")
    before=await E("D.inbox.length")
    await E("saveMeet();0");await pg.wait_for_timeout(100)
    x=await E("D.meets[D.meets.length-1]")
    chk(f"saved with people {x.get('with')}",set(x.get('with',[]))=={'u1',ids['jon'],ids['yossi']} and x['by']==ids['shia'])
    tos=await E(f"D.inbox.slice(0,D.inbox.length-{before}).map(i=>i.to)")
    chk(f"notified everyone invited {tos}",set(tos)=={'u1',ids['jon'],ids['yossi']})
    # empty attendee list blocked
    await E("openMeet();meWith=[];document.getElementById('meTitle').value='X';0");cnt=await E("D.meets.length");await E("saveMeet();0");chk("needs at least one person",await E("D.meets.length")==cnt);await E("hide('m-meet');0")
    mid=x['id']
    # Yossi: invited, home tab, can't change
    await E(f"setRole('{ids['yossi']}');0");await pg.wait_for_timeout(100)
    chk("Yossi has Home tab",await E("document.querySelector(`.tab[onclick*=\"'home'\"]`).style.display!=='none'"))
    await E("goTab('home');0");await pg.wait_for_timeout(100)
    h=(await E("document.getElementById('homeBody').innerText")).lower()
    chk("Yossi home: Upcoming meetings shows it","upcoming meetings" in h and "panel walk" in h)
    chk("Yossi home: New for you shows it","new for you" in h)
    chk("Yossi home: no receipts/money chip","receipts need amount" not in h)
    await E(f"openMeet('{mid}');0");chk("Yossi can't open to edit",await E("document.getElementById('m-meet').classList.contains('hid')"))
    await E(f"delMeet('{mid}');0");chk("Yossi can't delete",await E(f"!!D.meets.find(q=>q.id==='{mid}')"))
    await E(f"moveMeet('{mid}');0");chk("Yossi can't move",await E("!document.querySelector('.ov:not(.hid) input[type=date]')") )
    await E("document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));0")
    # Shauly not invited: does not see it
    await E(f"setRole('{ids['shauly']}');0");await E("goTab('home');0");await pg.wait_for_timeout(100)
    chk("Shauly (not invited) doesn't see it","Panel walk" not in await E("document.getElementById('homeBody').innerText"))
    await E("goTab('cal');0");chk("Shauly's meetings list doesn't show it","Panel walk" not in await E("document.getElementById('calList').innerText"))
    # Shia (maker) can edit, adds Shauly → Shauly notified
    await E(f"setRole('{ids['shia']}');0");await E(f"openMeet('{mid}');0")
    chk("maker can open to edit",await E("!document.getElementById('m-meet').classList.contains('hid')"))
    b2=await E("D.inbox.length");await E(f"meWhoTog('{ids['shauly']}');saveMeet();0")
    tos=await E(f"D.inbox.slice(0,D.inbox.length-{b2}).map(i=>i.to)");chk(f"added person notified only {tos}",tos==[ids['shauly']])
    # Baruch sees all + can edit
    await E("setRole('u1');goTab('home');0");await pg.wait_for_timeout(100)
    chk("Baruch home shows it","Panel walk" in await E("document.getElementById('homeBody').innerText"))
    await E(f"openMeet('{mid}');0");chk("Baruch can edit",await E("!document.getElementById('m-meet').classList.contains('hid')"));await E("hide('m-meet');0")
    # Jon (crew leader) has no home; Carlos (worker) no home
    await E(f"setRole('{ids['carlos']}');0");chk("workers have no Home tab",await E("document.querySelector(`.tab[onclick*=\"'home'\"]`).style.display==='none'"))
    # Spanish
    await E(f"setRole('{ids['yossi']}');me().lang='es';goTab('home');0");await pg.wait_for_timeout(100)
    chk("Spanish home words","próximas reuniones" in (await E("document.getElementById('homeBody').innerText")).lower());await E("me().lang='en';0")
    # GPS best reading: rough first, then precise → uses precise
    r=await E("""new Promise(res=>{const pts=[{latitude:41.2,longitude:-74.1,accuracy:400},{latitude:41.1001,longitude:-74.1001,accuracy:15}];
      const real=navigator.geolocation;_gW=null;_gLast=null;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:(ok)=>{pts.forEach((c,i)=>setTimeout(()=>ok({coords:c}),50*(i+1)));return 7;},clearWatch:()=>{}}});
      bestFix(p=>res(p.coords.accuracy),()=>res('err'));})""")
    chk(f"GPS keeps the precise reading ({r})",r==15)
    r=await E("""new Promise(res=>{_gW=null;_gLast=null;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:(ok,er)=>{setTimeout(()=>er({code:1}),30);return 1;},clearWatch:()=>{}}});bestFix(()=>res('ok'),e=>res(e.code));})""")
    chk(f"GPS blocked → clear error ({r})",r==1)
    r=await E("""new Promise(res=>{const s={lat:41.1,lng:-74.1,rad:300};_gW=null;_gLast=null;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:(ok)=>{setTimeout(()=>ok({coords:{latitude:41.1+380/364000,longitude:-74.1,accuracy:40}}),30);return 1;},clearWatch:()=>{}}});
      bestFix(p=>{const c=p.coords;const d=distFt(c.latitude,c.longitude,s.lat,s.lng);res([Math.round(d),d<=s.rad+Math.min(c.accuracy*3.281,150)]);},()=>res('err'));})""")
    chk(f"380 ft away with ±130 ft GPS counts as on site {r}",r!='err' and r[1]==True)
    r=await E("""new Promise(res=>{const s={lat:41.1,lng:-74.1,rad:300};_gW=null;_gLast=null;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:(ok)=>{setTimeout(()=>ok({coords:{latitude:41.1+900/364000,longitude:-74.1,accuracy:10}}),30);return 1;},clearWatch:()=>{}}});
      bestFix(p=>{const c=p.coords;const d=distFt(c.latitude,c.longitude,s.lat,s.lng);res([Math.round(d),d<=s.rad+Math.min(c.accuracy*3.281,150)]);},()=>res('err'));})""")
    chk(f"900 ft away with good GPS is blocked {r}",r!='err' and r[1]==False)
    # travel only past 25 min; Google Maps directions
    r=await E("(()=>{D.travelRate=30;delete D.travelMin;const s={id:'x'};return [travelPayFor(s,12),travelPayFor(s,25),travelPayFor(s,40),travelPayFor({travelPay:15},10)];})()")
    chk(f"travel: 12 min=0, 25 min=0, 40 min paid, fixed overrides {r}",r[0]==0 and r[1]==0 and r[2]==20 and r[3]==15)
    r=await E("(()=>{D.travelMin=20;const v=travelPayFor({id:'x'},22);delete D.travelMin;return v;})()");chk(f"local limit can be changed ({r})",r==11)
    u=await E("gmapsDir({lat:41.1,lng:-74.1,name:'x'})");chk(f"directions open Google Maps",u.startswith('https://www.google.com/maps/dir/'))
    chk("no Apple Maps left",await E("!document.documentElement.innerHTML.includes('maps.apple.com')"))
    # no zoom / no sideways slide
    vp=await E("document.querySelector('meta[name=viewport]').content");chk(f"zoom locked in page settings",'user-scalable=no' in vp and 'maximum-scale=1' in vp)
    pz=await E("""(()=>{const e=new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[new Touch({identifier:1,target:document.body,clientX:10,clientY:10}),new Touch({identifier:2,target:document.body,clientX:60,clientY:60})]});document.body.dispatchEvent(e);return e.defaultPrevented;})()""")
    chk("two-finger pinch is blocked",pz)
    w=await E("[document.documentElement.scrollWidth,window.innerWidth]");chk(f"nothing wider than the screen {w}",w[0]<=w[1])
    chk(f"no page errors {errs[:2]}",not errs)
    await b.close()
  for x in ok:print("  ✓",x)
  for x in bad:print("  ✗",x)
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
