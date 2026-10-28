# Test sign-in passwords WITHOUT storing passwords in any record (C13 removed the "Team passwords" note).
# After the owner's first-time setup has created everyone's sign-in, the owner's phone gives each test employee a
# fresh random password for THIS run only (the same admin_set_password the Team screen uses). Nothing is written to
# the app's data; the passwords live only in this Python process.
import asyncio, secrets, string, time, json

def _pw():
    return 'Tst' + ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(9)) + '7'

async def team_passwords(owner_page, timeout=40):
    """owner_page: the signed-in owner's page. Returns {employee name: password} for active non-owner employees."""
    names = await owner_page.evaluate("D.emps.filter(e=>!e.inactive&&e.role!=='owner').map(e=>e.name)")
    out = {}; t0 = time.time()
    while names and time.time() - t0 < timeout:
        for n in list(names):
            pw = _pw()
            r = await owner_page.evaluate(
                "async([n,pw])=>{const e=D.emps.find(x=>x.name===n);if(!e)return {err:'noemp'};return await EX_setPassword(e,pw);}", [n, pw])
            if r and r.get('ok'):
                out[n] = pw; names.remove(n)
        if names: await asyncio.sleep(0.5)   # sign-ins are still being created by the first-time setup
    return out
