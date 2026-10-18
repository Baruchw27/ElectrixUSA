# Strong password rules in the app (same rules the server enforces)
import asyncio
from playwright.async_api import async_playwright
F="/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/app/index.html"
cases={'abc':0,'1234':0,'password123':0,'onlyletters':0,'12345678':0,'Electrix99':0,'aaaaaaa1a':1,'wire123456':1,'Brian2026x':1,'fresh123':1}
async def main():
  ok=bad=0
  async with async_playwright() as p:
    b=await p.chromium.launch();pg=await b.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)))
    await pg.goto("file://"+F);await pg.wait_for_timeout(500)
    for k,want in cases.items():
      r=await pg.evaluate("p=>pwBad(p)",k);good=(r=='')==bool(want);ok+=good;bad+=not good;print(("  ✓" if good else "  ✗"),k,'→',r or 'accepted')
    gens=await pg.evaluate("[...Array(300)].map(()=>exGenPw())");allok=await pg.evaluate("g=>g.every(x=>pwBad(x)==='')",gens)
    print(("  ✓" if allok else "  ✗"),"300 auto passwords all pass the rules, e.g.",gens[:3]);ok+=allok;bad+=not allok
    print(("  ✓" if not errs else "  ✗"),"no page errors",errs[:1]);ok+=not errs;bad+=bool(errs)
    await b.close()
  print(f"{ok} passed, {bad} failed")
asyncio.run(main())
