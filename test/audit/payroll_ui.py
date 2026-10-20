"""Audit A5 — the Payroll screens (simulated phones + stand-in server; the server rules themselves are tested on the
real staging database by tests/security/a5_regression.sql)."""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
def ms(min_ago): return int((time.time()-min_ago*60)*1000)
def punch(i): r=[x for x in srv('/__records?coll=punches') if x['id']==i]; return r[0]['data'] if r else None
async def answer(P,text):
    await P.fill('#ask_0',text); await P.click('#askOk'); await P.wait_for_timeout(300)
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        late={'srvIn':ms(0),'in':ms(180),'out':ms(60),'site':'t32','by':'u7'}
        rows=[{'coll':'punches','id':'zzL1','data':{'id':'zzL1','who':'u7','site':'t32','in':ms(180),'out':ms(60),'pending':True,'lateEntry':late,'hist':[{'act':'late','by':'u7','at':ms(0),'minutesLate':180}]}},
              {'coll':'punches','id':'zzL2','data':{'id':'zzL2','who':'u7','site':'t32','in':ms(170),'out':ms(150),'pending':True,'lateEntry':dict(late,**{'in':ms(170)})}},
              {'coll':'punches','id':'zzL3','data':{'id':'zzL3','who':'u8','site':'t32','in':ms(120),'pending':True,'lat':41,'lng':-74,'lateEntry':dict(late,**{'in':ms(120),'by':'u8'})}},
              {'coll':'punches','id':'zzS1','data':{'id':'zzS1','who':'u9','site':'t32','in':ms(5),'pending':True,'semi':True}},
              {'coll':'punches','id':'zzN1','data':{'id':'zzN1','who':'u10','site':'t32','in':ms(300),'out':ms(240)}}]
        srvpost('/__seed',{'users':[],'rows':rows})
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,P,e,_=await login(b,'Miriam','Testpass123','desktop'); await ready(P); await settle(P)
            await P.evaluate("goTab('hours');renderHours()"); await P.wait_for_timeout(400)
            q=await P.evaluate("(document.getElementById('lateQueue')||{}).innerText||''")
            check('Payroll sees the late entries waiting (with how late they were sent)','late clock entries' in q.lower() and 'Carlos' in q and 'min late' in q.lower(),q[:300])
            check('… a waiting late entry does not count toward pay yet',await P.evaluate("!payCounts(D.punches.find(x=>x.id==='zzL1'))"))
            check('… the "ask the office to clock me in" request is not in the Payroll queue (managers handle it)','zzS1' not in q and await P.evaluate("!(document.getElementById('lateQueue').innerText||'').includes('Brian')"))
            await P.evaluate("approveLate('zzL1')"); await settle(P)
            d=punch('zzL1'); check('Approve: the entry now counts, approver recorded',d and d.get('pending') is False and d.get('approvedBy')=='o3',d)
            check('… and counts on the phone',await P.evaluate("payCounts(D.punches.find(x=>x.id==='zzL1'))"))
            await P.evaluate("rejectLate('zzL2')"); await answer(P,'')
            check('Reject without a reason: nothing changes',(punch('zzL2') or {}).get('pending') is True)
            await P.evaluate("rejectLate('zzL2')"); await answer(P,'not on site that day'); await settle(P)
            d=punch('zzL2'); check('Reject with a reason: kept, marked rejected, reason saved',d and d.get('rejected') is True and d.get('rejectWhy')=='not on site that day' and d.get('pending') is False,d)
            # edit without / with a reason
            await P.evaluate("openPunchEdit(D.punches.findIndex(x=>x.id==='zzN1'))"); await P.fill('#peIn','06:00'); await P.fill('#peWhy',''); await P.evaluate("savePunchEdit()"); await settle(P)
            check('Changing a clock-in without a reason is not saved',len((punch('zzN1') or {}).get('edits') or [])==0)
            await P.fill('#peWhy','foreman says started at 6'); await P.evaluate("savePunchEdit()"); await settle(P)
            d=punch('zzN1'); check('… with a reason it is saved and the reason recorded',d and (d.get('edits') or [{}])[-1].get('why')=='foreman says started at 6',d and d.get('edits'))
            # add missed punch needs a reason
            n0=len(srv('/__records?coll=punches'))
            await P.evaluate("openPunchEdit(null)"); await P.fill('#peWhy',''); await P.evaluate("savePunchEdit()"); await settle(P)
            check('Adding a missed punch without a reason is not saved',len(srv('/__records?coll=punches'))==n0)
            await P.evaluate("openPunchEdit(null)"); await P.fill('#peWhy','paper timesheet')
            if await P.evaluate("!!window.EX_jobPick"): await P.evaluate("EX_jobPick(document.getElementById('peSite')).pick(D.sites[0].id)")  # Features v1: a new punch's job starts blank and must be picked
            await P.evaluate("savePunchEdit()"); await settle(P)
            check('… with a reason it is saved',len(srv('/__records?coll=punches'))==n0+1)
            # remove = void with reason; restore with reason
            await P.evaluate("openPunchEdit(D.punches.findIndex(x=>x.id==='zzN1'))"); await P.wait_for_timeout(200)
            check('the edit window says Remove (not Delete) and shows the change history',await P.evaluate("document.getElementById('peDel').textContent")=='Remove' and 'foreman says started at 6' in await P.evaluate("document.getElementById('peLog').innerText"),[await P.evaluate("document.getElementById('peDel').textContent"),await P.evaluate("document.getElementById('peLog').innerText")])
            await P.evaluate("delPunch()"); await answer(P,'x'); await settle(P)
            check('Remove with a too-short reason: nothing changes',not (punch('zzN1') or {}).get('voided'))
            await P.evaluate("openPunchEdit(D.punches.findIndex(x=>x.id==='zzN1'))"); await P.evaluate("delPunch()"); await answer(P,'duplicate entry'); await settle(P)
            d=punch('zzN1'); check('Remove with a reason: the entry is kept (marked removed), not paid',d and d.get('voided',{}).get('why')=='duplicate entry' and not any(r['id']=='zzN1' and r['deleted'] for r in srv('/__records?coll=punches')),d and d.get('voided'))
            check('… removed entries never count toward pay',await P.evaluate("!payCounts(D.punches.find(x=>x.id==='zzN1'))"))
            check('… shown struck in the Hours list with the reason',await P.evaluate("hrRange='week';renderHours();document.getElementById('hrList').innerText.includes('duplicate entry')"))
            await P.evaluate("openPunchEdit(D.punches.findIndex(x=>x.id==='zzN1'))"); await P.wait_for_timeout(150)
            check('… the same button now says Restore',await P.evaluate("document.getElementById('peDel').textContent")=='Restore')
            await P.evaluate("delPunch()"); await answer(P,'removed by mistake'); await settle(P)
            check('Restore with a reason brings it back',not (punch('zzN1') or {}).get('voided') and await P.evaluate("payCounts(D.punches.find(x=>x.id==='zzN1'))"))
            # a manager's fence fix / "clock me in" approval must not approve a late entry
            c2,Y,e2,_=await login(b,'Yossi','Testpass123','android'); await ready(Y); await settle(Y)
            await Y.evaluate("semiApprove('t32',true)"); await settle(Y)
            check('Manager approves the "clock me in" request at the job',(punch('zzS1') or {}).get('pending') is False)
            check('… but the late entry at the same job still waits for Payroll',(punch('zzL3') or {}).get('pending') is True)
            # the worker sees it
            c3,W,e3,_=await login(b,'Luis','Testpass123','iphone'); await ready(W); await settle(W)
            await W.evaluate("goTab('punch');renderPunch()"); await W.wait_for_timeout(300)
            txt=await W.evaluate("document.getElementById('punchLog').innerText")
            check('Worker sees their late entry is waiting for Payroll','waiting for Payroll' in txt,txt[:200])
            await W.evaluate("me().lang='es';renderPunch()"); await W.wait_for_timeout(200)
            txt=await W.evaluate("document.getElementById('punchLog').innerText")
            check('… in Spanish too','nómina' in txt,txt[:200])
            # a clock-in sent 40 min late from the worker's own phone (no signal at the time): saved, waits, no false alarm
            await W.evaluate("window._toasts=[];const _t=toast;toast=function(a){_toasts.push(String(a));return _t.apply(this,arguments)}")
            pid=await W.evaluate("(()=>{const id=nid('p');D.punches.push({id,who:me().id,site:'t32',in:Date.now()-40*60000,out:null,offline:true});save();return id})()")
            await settle(W); await W.wait_for_timeout(800)
            d=punch(pid); check('late clock-in from the phone reaches the server and waits for Payroll',d and d.get('pending') is True and 'lateEntry' in d,d)
            check('… the phone shows it as waiting (not as a failed save)',await W.evaluate(f"D.punches.find(x=>x.id==='{pid}').pending===true") and not any('could not be saved' in x for x in await W.evaluate("_toasts")),await W.evaluate("_toasts"))
            check('… and the worker can still punch out of it',await W.evaluate(f"(()=>{{const p=D.punches.find(x=>x.id==='{pid}');p.out=Date.now();save();return true}})()"))
            await settle(W); check('… punch-out saved on the server, still waiting',(punch(pid) or {}).get('out') and (punch(pid) or {}).get('pending') is True)
            errs=e+e2+e3; check('no page errors',not errs,errs[:3])
            await b.close()
    finally: sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
