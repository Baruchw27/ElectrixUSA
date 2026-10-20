"""B6 — the other session's checklist (test/features/HANDOFF.md on features/staging), checked on this version."""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
async def card(P,q):
    await P.evaluate(f"openSearch();document.getElementById('sqInput').value='{q}';doSearch()"); await P.wait_for_timeout(120)
    r=await P.evaluate("document.getElementById('sqRes').innerText"); await P.evaluate("hide('m-search')"); return r
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            ph={}
            for who in ['Baruch','Yossi','Jon','Menachem','Miriam']:
                c,P,e,ok=await login(b,who,'Testpass123','desktop'); await ready(P); await settle(P); ph[who]=(P,e)
            O,Y,J,Me,Mi=[ph[n][0] for n in ['Baruch','Yossi','Jon','Menachem','Miriam']]
            # 1. person cards: hours / clock status only for those allowed
            for who,P,q,want in [('site manager',Y,'carlos',True),('Payroll',Mi,'carlos',True),('crew leader, own crew',J,'carlos',True),
                                 ('crew leader, other crew',J,'brian',False),('office (Material)',Me,'carlos',False)]:
                r=await card(P,q)
                shows='this week' in r.lower() or 'punched in' in r.lower()
                check(f'search card for a person: {who} {"sees" if want else "does NOT see"} hours / clock status',shows==want,r[:200])
            # 6. typed task text stays exactly as typed when tapping out of the box
            txt="Yossi tomorrow:\n  - fix   the panel\n\n  - test GFCI"
            await O.evaluate("openJob()"); await O.fill('#jDesc',txt); await O.evaluate("document.getElementById('jDesc').dispatchEvent(new Event('blur'))"); await O.wait_for_timeout(100)
            check('task box: tapping out never rewrites the typed text',await O.evaluate("document.getElementById('jDesc').value")==txt,await O.evaluate("document.getElementById('jDesc').value"))
            await O.fill('#jDesc','   indented first line\nsecond'); await O.evaluate("document.querySelector('#jAssign input').checked=true;jobWord();saveJob()"); await settle(O)
            check('… the saved task keeps first-line indentation',any((x['data'] or {}).get('desc')=='   indented first line\nsecond' for x in srv('/__records?coll=jobs')))
            # 3. New task: choosing a job ticks its manager; removing the job unticks him again
            await O.evaluate("openJob()"); await O.wait_for_timeout(100)
            await O.evaluate("(()=>{const v=[...document.querySelectorAll('#jAssign input')].map(i=>i.value).find(id=>(D.emps.find(e=>e.id===id)||{}).role==='manager');if(v&&D.sites[0])D.sites[0].manager=v;})()")
            sid=await O.evaluate("(D.sites.find(s=>s.manager&&document.querySelector('#jAssign input[value=\"'+s.manager+'\"]'))||{}).id||''")
            if sid:
                await O.evaluate(f"const s=document.getElementById('jSite');s.value='{sid}';s.onchange()")
                t1=await O.evaluate("document.querySelectorAll('#jAssign input:checked').length")
                await O.evaluate("const s=document.getElementById('jSite');s.value='';s.onchange()")
                t2=await O.evaluate("document.querySelectorAll('#jAssign input:checked').length")
                check('New task: removing the job unticks the site manager that was ticked automatically',t1==1 and t2==0,[t1,t2])
            else: check('New task: a job with its manager on the list exists for this check',False)
            await O.evaluate("hide('m-job')")
            # 8. bell: opening the list does not mark everything read; "Mark all read" does
            await O.evaluate("D.inbox.unshift({id:'nH1',to:me().id,msg:'zz one',kind:'info',ts:Date.now(),read:false},{id:'nH2',to:me().id,msg:'zz two',kind:'info',ts:Date.now(),read:false});renderBell();openInbox()"); await O.wait_for_timeout(150)
            check('opening the bell list does not mark every message read',await O.evaluate("D.inbox.filter(x=>x.id==='nH1'||x.id==='nH2').every(x=>!x.read)"))
            await O.evaluate("inboxAllRead()"); await O.wait_for_timeout(100)
            check('… "Mark all read" does, and the count goes to 0',await O.evaluate("D.inbox.filter(x=>x.to===me().id&&!x.read).length===0&&document.getElementById('bellN').style.display==='none'"))
            await O.evaluate("hide('m-inbox')")
            await O.evaluate("document.getElementById('jobFind')&&document.getElementById('jobFind').focus();D.inbox.unshift({id:'nH3',to:me().id,msg:'zz three',kind:'info',ts:Date.now(),read:false})"); await O.wait_for_timeout(3500)
            check('… the bell count updates within seconds even while someone is typing',await O.evaluate("document.getElementById('bellN').textContent")=='1')
            # blank by default: Add missed punch, garage pick-up, receipt
            await Mi.evaluate("goTab('hours');renderHours();openPunchEdit(null)"); await Mi.wait_for_timeout(100)
            check('Add missed punch opens with no person and no job',await Mi.evaluate("[document.getElementById('peWho').value,document.getElementById('peSite').value]")==['',''])
            n0=len(srv('/__records?coll=punches'))
            await Mi.fill('#peWhy','paper timesheet'); await Mi.evaluate("savePunchEdit()"); await settle(Mi)
            check('… and is not saved until a person and a job are picked',len(srv('/__records?coll=punches'))==n0)
            await Mi.evaluate("hide('m-pe')")
            await Y.evaluate("openPickup()"); await Y.wait_for_timeout(100)
            check('Garage pick-up opens with no job picked',await Y.evaluate("document.getElementById('puSite').value")=='')
            await Y.evaluate("hide('m-pick2')")
            await Y.evaluate("openExp('material','company')"); await Y.wait_for_timeout(100)
            check('Receipt opens with no job picked',await Y.evaluate("document.getElementById('exSite').value")=='')
            for n in ph: check(f'no page errors ({n})',not ph[n][1],ph[n][1][:3])
            await b.close()
    finally:
        sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
