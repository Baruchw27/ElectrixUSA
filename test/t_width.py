# Nothing on any page, for any role, is wider than a phone (no sideways sliding)
import asyncio
from playwright.async_api import async_playwright
F="/mnt/user-data/outputs/artifacts/00bdd624-ebef-4e5c-bd07-db8077466b50/index.html"
async def main():
  bad=[];n=0
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for w in (375,390,430):
      pg=await b.new_page(viewport={"width":w,"height":844});await pg.goto("file://"+F);await pg.wait_for_timeout(300)
      await pg.evaluate("signIn('u1');document.querySelectorAll('div.ov[id^=m-]').forEach(o=>o.classList.add('hid'));0")
      for rid in ["u1","u2","o1","o2","o4","u6","u7","b1"]:
        await pg.evaluate(f"setRole('{rid}');0");await pg.wait_for_timeout(80)
        tabs=await pg.evaluate("[...document.querySelectorAll('.tab')].filter(b=>b.dataset.allowed==='1').map(b=>b.getAttribute('onclick').match(/'([a-z]+)'/)[1])")
        for tb in tabs:
          await pg.evaluate(f"goTab('{tb}');0");await pg.wait_for_timeout(60);n+=1
          r=await pg.evaluate("""(()=>{const W=window.innerWidth;const sw=document.documentElement.scrollWidth;let off=[];document.querySelectorAll('.pg.on *').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&r.right>W+1&&getComputedStyle(e).position!=='fixed'){let p=e.parentElement,clip=false;while(p&&p!==document.body){const o=getComputedStyle(p).overflowX;if(o==='auto'||o==='scroll'||o==='hidden'){clip=true;break;}p=p.parentElement;}if(!clip)off.push((e.id||e.className||e.tagName)+':'+Math.round(r.right));}});return [sw,W,off.slice(0,3)];})()""")
          if r[0]>r[1] or r[2]:bad.append(f"{w}px {rid}/{tb}: page {r[0]} > {r[1]} {r[2]}")
      await pg.close()
    await b.close()
  for x in bad[:30]:print("  ✗",x)
  print(f"{n} pages checked, {len(bad)} too wide")
asyncio.run(main())
