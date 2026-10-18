# 150 people, a year of data: every screen must stay fast on a phone
import asyncio, json
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch();ctx=await b.new_context(viewport={"width":390,"height":844})
    pg=await ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)));E=pg.evaluate
    # slow it down like a mid-range phone
    cdp=await ctx.new_cdp_session(pg);await cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
    await pg.goto("file://"+F);await pg.wait_for_timeout(500)
    info=await E("""(()=>{signIn('u1');document.querySelectorAll('.ov').forEach(o=>o.classList.add('hid'));
      const crews=D.crews.map(c=>c.id);for(let i=0;i<130;i++)D.emps.push({id:'x'+i,name:'Worker '+i,role:'worker',crew:crews[i%crews.length],phone:''});
      const W=D.emps.filter(e=>e.role==='worker').map(e=>e.id);const S=D.sites.map(s=>s.id);const day=86400000,now=Date.now();
      for(let d=1;d<=250;d++){const base=now-d*day;W.forEach((w,k)=>{const t0=new Date(base);t0.setHours(7,(k%20),0,0);D.punches.push({id:'p'+d+'_'+k,who:w,site:S[(d+k)%S.length],in:t0.getTime(),out:t0.getTime()+8.5*3600000});});}
      for(let i=0;i<6000;i++)D.jobs.push({id:'jj'+i,ts:now-i*3600000,to:[D.emps[3+(i%20)].id],from:'u1',site:S[i%S.length],desc:'Task number '+i,status:i<5800?'done':'open',due:'Today',doneAt:now-i*3600000});
      for(let i=0;i<20000;i++)D.inbox.push({id:'in'+i,to:D.emps[i%D.emps.length].id,msg:'Note '+i,ts:now-i*600000,read:true});
      for(let i=0;i<3000;i++)D.exps.push({id:'xe'+i,who:W[i%W.length],type:'gas',src:'company',amt:40+(i%30),date:dkey(new Date(now-(i%300)*day)),ts:now-(i%300)*day,rec:{d:''},status:'new'});
      const pr=pruneOld();save();
      return {pruned:pr,emps:D.emps.length,punches:D.punches.length,jobs:D.jobs.length,inbox:D.inbox.length,size:Math.round(JSON.stringify(D).length/1048576*10)/10+' MB'};})()""")
    print('data:',info)
    res={}
    for rid in ['u1','u2','o1']:
      await E(f"setRole('{rid}');0")
      tabs=await E("[...document.querySelectorAll('.tab')].filter(b=>b.dataset.allowed==='1').map(b=>b.getAttribute('onclick').match(/'([a-z]+)'/)[1])")
      for tb in tabs+['rep','hours','exp','team']:
        ms=await E(f"(()=>{{const t=performance.now();try{{goTab('{tb}');}}catch(e){{return -1}}return Math.round(performance.now()-t);}})()")
        res[f'{rid}/{tb}']=ms
    await E("goTab('jobs');0")
    ms=await E("(()=>{const t=performance.now();renderAll();return Math.round(performance.now()-t);})()");res['renderAll']=ms
    parts=await E("(()=>{const o={};const f={markGot,applyLang,renderBell,applyTabs,renderRoleSel,renderMyList,renderTravel,renderMsgBadge,renderJobs};for(const k in f){const t=performance.now();try{f[k]();}catch(e){}o[k]=Math.round(performance.now()-t);}return o;})()")
    print('renderAll parts:',parts)
    ms=await E("(()=>{const t=performance.now();save();return Math.round(performance.now()-t);})()");res['save']=ms
    slow={k:v for k,v in res.items() if v>400}
    print('slowest:',sorted(res.items(),key=lambda x:-x[1])[:12])
    print('over 400ms:',slow)
    print('errors:',errs[:3])
    await b.close()
asyncio.run(main())
