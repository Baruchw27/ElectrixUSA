from harness import *
SEED=json.load(open(os.path.join(HERE,'seed_prod.json')))
async def main():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,P,e,ok=await login(b,'Baruch','Testpass123','iphone'); await until(P,"EX_ready&&EX_ready()",10000); await P.wait_for_timeout(6000); await until(P,"EX_ready&&EX_ready()",10000)
            k=await P.evaluate("dkey(new Date(Date.now()+864e5*2))")
            err=None
            try: await P.evaluate(f"goTab('sched');openLoan('{k}','u7')")
            except Exception as x: err=str(x).split('\n')[0]
            check('"Move a person" opens',err is None,err)
            await b.close()
    finally: sp.kill()
asyncio.run(main())
