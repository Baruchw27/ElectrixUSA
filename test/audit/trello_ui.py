"""T1 — personal Trello on the Tasks page. Menachem (connected) sees "📋 My Trello" with his cards grouped by board, ticks
one off, edits one, adds one (also offline → sent later); Carlos (not connected) sees nothing; Baruch (owner) can switch to
Menachem's. Spacing/line breaks kept. Every check about saving reads the SERVER copy."""
import sys,os,copy
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
def rec(i):
    r=[x for x in srv('/__records?coll=ptask') if x['id']==i]; return r[0]['data'] if r and not r[0]['deleted'] else None
SEED2=copy.deepcopy(SEED)
META={'owner':'o2','meta':True,'syncedAt':1792550000000,'boards':[{'id':'b_bill','name':'Billing','lists':[{'id':'l_todo','name':'To do'},{'id':'l_done','name':'Done'}]},{'id':'b_pers','name':'Personal','lists':[{'id':'l_p1','name':'This week'}]}]}
DESC="Line 1\n  indented line\n\nLine 3"
SEED2['rows']+= [
  {'coll':'ptask','id':'ptmeta_o2','data':dict(META,id='ptmeta_o2')},
  {'coll':'ptask','id':'pt_o2_c1','data':{'id':'pt_o2_c1','owner':'o2','card':'c1','t':'Invoice 12 Oak St — final','desc':DESC,'board':'b_bill','boardName':'Billing','list':'l_todo','listName':'To do','done':False,'url':'https://trello.com/c/inv1','gone':False}},
  {'coll':'ptask','id':'pt_o2_c2','data':{'id':'pt_o2_c2','owner':'o2','card':'c2','t':'Chase payment 7 Elm','desc':'','board':'b_bill','boardName':'Billing','list':'l_done','listName':'Done','done':True,'url':'https://trello.com/c/inv2','gone':False}},
  {'coll':'ptask','id':'pt_o2_c3','data':{'id':'pt_o2_c3','owner':'o2','card':'c3','t':'Call accountant','desc':'','board':'b_pers','boardName':'Personal','list':'l_p1','listName':'This week','done':False,'due':'2026-10-22T14:00:00.000Z','url':'https://trello.com/c/p1','gone':False}},
  {'coll':'ptask','id':'pt_o2_c4','data':{'id':'pt_o2_c4','owner':'o2','card':'c4','t':'Archived in Trello','desc':'','board':'b_bill','boardName':'Billing','list':'l_todo','listName':'To do','done':False,'gone':True}},
]
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED2)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            ph={}
            for who,kind in [('Menachem','iphone'),('Carlos','android'),('Baruch','desktop')]:
                c,P,e,ok=await login(b,who,'Testpass123',kind); await ready(P); await settle(P); ph[who]=(c,P,e); check(f'{who} signed in ({kind})',ok)
            M,C,B=[ph[n][1] for n in ['Menachem','Carlos','Baruch']]
            for P in (M,C,B): await P.evaluate("goTab('jobs');renderJobs()"); await P.wait_for_timeout(150)
            vis=lambda P:P.evaluate("(()=>{const v=document.getElementById('vTrello');return !!v&&v.style.display!=='none'})()")
            check('Menachem (connected) sees the "📋 My Trello" switch on Tasks',await vis(M))
            check('Carlos (not connected) does not see it',not await vis(C))
            check('Baruch (owner) sees it (to switch to Menachem\'s)',await vis(B))
            await M.evaluate("jobView='trello';renderJobs()"); await M.wait_for_timeout(150)
            txt=await M.evaluate("document.getElementById('jobList').innerText")
            check('his open cards are listed, grouped by board',all(s in txt for s in ['Billing','Personal','Invoice 12 Oak St — final','Call accountant']),txt[:300])
            check('… archived cards are not shown, done ones are folded away',('Archived in Trello' not in txt) and ('Chase payment' not in txt) and '1 done' in txt.lower(),txt[:300])
            pre=await M.evaluate("(()=>{const r=[...document.querySelectorAll('.ptrow')].find(x=>x.dataset.id==='pt_o2_c1');return r?r.querySelector('.ptd').textContent:null})()")
            check('line breaks and spacing of the Trello note are kept exactly',pre==DESC,repr(pre))
            ws=await M.evaluate("getComputedStyle(document.querySelector('.ptd')).whiteSpace")
            check('… and shown on separate lines (pre-wrap)',ws=='pre-wrap',ws)
            big=await M.evaluate("(()=>{const r=document.querySelector('.ptchk').getBoundingClientRect();return Math.min(r.width,r.height)})()")
            check('checkboxes are big enough to tap (≥ 24 px)',big>=24,big)
            # tick off
            await M.evaluate("ptDone('pt_o2_c3',true)"); await settle(M)
            d=rec('pt_o2_c3'); check('ticking a task off saves it on the server (marked to go to Trello)',d and d.get('done') is True and d.get('push') is True,d)
            # edit
            await M.evaluate("ptEdit='pt_o2_c1';renderJobs()"); await M.wait_for_timeout(100)
            await M.fill('#ptEt','Invoice 12 Oak St — final (sent)'); await M.fill('#ptEd',DESC+"\nSent Oct 20")
            await M.evaluate("ptSave('pt_o2_c1')"); await settle(M)
            d=rec('pt_o2_c1'); check('editing the text and note saves exactly what was typed',d and d.get('t')=='Invoice 12 Oak St — final (sent)' and d.get('desc')==DESC+"\nSent Oct 20" and d.get('push') is True,d)
            # add
            await M.evaluate("ptAdding=true;renderJobs()"); await M.wait_for_timeout(100)
            await M.evaluate("document.getElementById('ptList').value='b_pers|l_p1'"); await M.fill('#ptNewT','Order checks'); await M.fill('#ptNewD','  2 boxes\n\nblue')
            await M.evaluate("ptAdd()"); await settle(M)
            new=[x for x in srv('/__records?coll=ptask') if (x['data'] or {}).get('t')=='Order checks']
            check('adding a task saves it on the server for HIS Personal → This week list',len(new)==1 and new[0]['data'].get('list')=='l_p1' and new[0]['data'].get('owner')=='o2' and new[0]['data'].get('desc')=='  2 boxes\n\nblue',new)
            # offline add then reconnect
            net('refuse'); await M.evaluate("ptAdding=true;renderJobs()"); await M.wait_for_timeout(100)
            await M.fill('#ptNewT','Offline task'); await M.evaluate("document.getElementById('ptList').value='b_bill|l_todo';ptAdd()"); await M.wait_for_timeout(1500)
            check('an offline task waits on the phone …',not any((x['data'] or {}).get('t')=='Offline task' for x in srv('/__records?coll=ptask')))
            net('ok'); await settle(M,20000)
            check('… and reaches the server once back online',any((x['data'] or {}).get('t')=='Offline task' for x in srv('/__records?coll=ptask')))
            # owner switch
            await B.evaluate("jobView='trello';renderJobs()"); await B.wait_for_timeout(150)
            bt=await B.evaluate("document.getElementById('jobList').innerText"); chips=await B.evaluate("document.getElementById('jobChips').innerText")
            check('Baruch can switch to Menachem\'s Trello (read his list)','Menachem' in chips and 'Invoice 12 Oak St' in bt,[chips,bt[:200]])
            check('… without an "Add" button for someone else\'s Trello',await B.evaluate("!document.getElementById('ptAddBtn')"))
            # the normal Tasks views still work
            await M.evaluate("jobView='open';renderJobs()"); await M.wait_for_timeout(100)
            check('switching back to Open shows the normal tasks again',await M.evaluate("document.getElementById('vOpen').className.includes('on')&&!document.querySelector('.ptrow')"))
            # Spanish
            await C.evaluate("D.ptask=[];renderJobs()")
            for n in ph: check(f'no page errors ({n})',not ph[n][2],ph[n][2][:3])
            await b.close()
    finally:
        sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
