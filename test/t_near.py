# Punch-in lists only jobs within 2 miles, closest first; "Show all jobs" and search still reach everything
import asyncio
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
ok=[];bad=[]
def chk(n,c):(ok if c else bad).append(n)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();ctx=await b.new_context(viewport={"width":390,"height":844},permissions=['geolocation'],geolocation={'latitude':41.1287,'longitude':-74.1046,'accuracy':8})
    pg=await ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)));E=pg.evaluate
    await pg.goto("file://"+F);await pg.wait_for_timeout(400)
    await E("""(()=>{signIn('u1');D.demo=false;document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));
      const S=D.sites;S.forEach(s=>{delete s.lat;delete s.lng;});
      S[0].lat=41.1287;S[0].lng=-74.1046;S[0].name='A Here St';           // 0 mi
      S[1].lat=41.1400;S[1].lng=-74.1046;S[1].name='B Close Rd';          // ~0.8 mi
      S[2].lat=41.1287+0.025;S[2].lng=-74.1046;S[2].name='C Mile Ln';     // ~1.7 mi
      S[3].lat=41.30;S[3].lng=-74.10;S[3].name='D Far Away Ave';          // ~12 mi
      S.slice(0,4).forEach(s=>s.stage='active');save();setRole(D.emps.find(e=>e.name==='Yossi').id);goTab('punch');})()""")
    await pg.wait_for_timeout(2500)
    opts=await E("[...document.getElementById('punchSite').options].map(o=>o.textContent)")
    chk(f"only nearby jobs listed {opts}",len(opts)==4 and opts[-1].startswith('🔎'))
    chk("closest first",opts[0].startswith('A Here St') and opts[1].startswith('B Close Rd') and opts[2].startswith('C Mile Ln'))
    chk("shows distance",'here' in opts[0] and ' mi' in opts[1])
    chk("far job not in the short list",not any('Far Away' in o for o in opts))
    chk("nearest job picked automatically",await E("document.getElementById('punchSite').value===D.sites[0].id"))
    await E("const s=document.getElementById('punchSite');s.value='__all';s.dispatchEvent(new Event('change'));0");await pg.wait_for_timeout(400)
    n=await E("document.getElementById('punchSite').options.length");chk(f"'Show all jobs' lists everything ({n})",n>100)
    chk("…and opens the search list",await E("!!document.querySelector('.xpk')"))
    await E("document.querySelectorAll('.xpk').forEach(x=>x.remove());punchAll=false;renderPunchSites();0")
    await pg.fill('#punchFind','far away');await E("punchFilter();0");await pg.wait_for_timeout(200)
    chk("typing an address still finds far jobs",await E("[...document.getElementById('punchSite').options].some(o=>/Far Away/.test(o.textContent))"))
    await pg.fill('#punchFind','');await E("punchFilter();0")
    # nowhere near any job → full list
    await E("lastPos={latitude:40.0,longitude:-75.5,accuracy:10};renderPunchSites();0")
    n=await E("document.getElementById('punchSite').options.length");chk(f"no jobs nearby → full list ({n})",n>100)
    chk(f"no page errors {errs[:2]}",not errs)
    await b.close()
  for x in ok:print("  ✓",x)
  for x in bad:print("  ✗",x)
  print(f"{len(ok)} passed, {len(bad)} failed")
asyncio.run(main())
