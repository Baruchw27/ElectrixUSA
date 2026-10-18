# The helpers that keep saved text from turning into page code: escaping, picture addresses, links, ids in buttons
import asyncio
from playwright.async_api import async_playwright
F="/tmp/claude-0/-home-claude/bd7165b7-9d93-5fa3-a44f-208a1e1dae13/scratchpad/app/index.html"
CASES=[
 ("esc turns quotes and brackets into text","esc(`7\" can, Joe's <b>`)","7&quot; can, Joe&#39;s &lt;b&gt;"),
 ("photo from the camera passes","safeSrc('data:image/jpeg;base64,AAAA')","data:image/jpeg;base64,AAAA"),
 ("voice note passes","safeSrc('data:audio/webm;codecs=opus;base64,AAAA')","data:audio/webm;codecs=opus;base64,AAAA"),
 ("web photo passes","safeSrc('https://images.thdstatic.com/a.jpg')","https://images.thdstatic.com/a.jpg"),
 ("a web page as a picture is refused","safeSrc('data:text/html;base64,AAAA')",""),
 ("a picture address with a quote is refused","safeSrc('https://x.com/a.jpg\" b')",""),
 ("plain http picture refused","safeSrc('http://x.com/a.jpg')",""),
 ("https link passes","safeHref('https://trello.com/c/abc')","https://trello.com/c/abc"),
 ("phone link passes","safeHref('tel:8455550107')","tel:8455550107"),
 ("script link refused","safeHref('javascript:void(0)')","#"),
 ("id stays the same","jsq('s_mvd71aldyq3td')","s_mvd71aldyq3td"),
 ("accented name kept","jsq('José Núñez')","José Núñez"),
 ("quotes removed from button values","jsq(`a'b\"c`)","abc"),
]
async def main():
  ok=bad=0
  async with async_playwright() as p:
    b=await p.chromium.launch();pg=await b.new_page();await pg.goto("file://"+F);await pg.wait_for_timeout(400)
    for name,js,want in CASES:
      got=await pg.evaluate(js);good=got==want;ok+=good;bad+=not good
      print(("  ✓" if good else "  ✗"),name,"" if good else f"(got {got!r})")
    await b.close()
  print(f"{ok} passed, {bad} failed")
asyncio.run(main())
