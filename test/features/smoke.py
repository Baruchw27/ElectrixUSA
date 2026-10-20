from fharness import *
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            for who,kind in [('Baruch','iphone'),('Yossi','android'),('Jon','iphone'),('Shia','desktop'),('Menachem','desktop')]:
                c,P,e,ok=await go(b,who,kind)
                check(who+' signed in',ok)
                r=await P.evaluate("""(async()=>{const out={};out.feat=window.EX_FEATURES_V;openSearch();document.getElementById('sqInput').value='oak';doSearch();await new Promise(r=>setTimeout(r,200));out.res=document.querySelectorAll('#sqRes .sres').length;out.ms=window.EX_lastSearchMs;hide('m-search');
                 openInbox();out.inbox=!!document.getElementById('exNBody');EX_nTab('t');out.mt=document.getElementById('exNBody').innerHTML.length;hide('m-inbox');
                 try{openJob();out.jp=!!document.getElementById('jSite')._jp;out.jv=document.getElementById('jSite').value;hide('m-job');}catch(e){out.jerr=String(e)}
                 out.punchTab=document.querySelector('.tab[onclick*="\\'punch\\'"]').dataset.allowed;return out;})()""")
                check(who+' features '+json.dumps(r),r.get('feat')==1 and r.get('inbox'))
                check(who+' no page errors',not e,e[:3])
                await c.close()
            await b.close()
    finally: sp.kill()
    print(sum(1 for r in R if r[0]),'passed,',sum(1 for r in R if not r[0]),'failed')
asyncio.run(run())
