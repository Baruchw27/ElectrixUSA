"""Features F1 — the five new requests, on simulated phones with the stand-in server.
(The server side — notifications in each person's language, schedule messages gathered, "Time clock" only by
Owner/all-access/Payroll — is tested on the real staging database by tests/security/f1_regression.sql.)"""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
def emp(i): r=[x for x in srv('/__records?coll=emps') if x['id']==i]; return r[0]['data'] if r else None
async def search(P,q):
    await P.evaluate("openSearch()"); await P.fill('#sqInput',q); await P.evaluate("doSearch()"); await P.wait_for_timeout(120)
    return (await P.evaluate("document.getElementById('sqRes').innerText")).lower()
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            c,A,ea,_=await login(b,'Baruch','Testpass123','iphone'); await ready(A); await settle(A)
            # ── 1. universal search ──
            await A.evaluate("""(()=>{const m=me();keepInit();
              D.keep.push({id:'knS1',owner:m.id,type:'text',title:'Panel notes',body:'Instalación del panel:\\n  - cocina 20A\\n\\n  - secadora 30A',items:[],color:'0',labels:[],collab:[],created:Date.now(),edited:Date.now()});
              D.jobs.push({id:'jS1',ts:Date.now()-86400000,to:['u7'],from:m.id,site:'t32',desc:'Replace the porcupine fixture',status:'done',doneAt:Date.now()});
              D.jobs.push({id:'jS2',ts:Date.now(),to:['u8'],from:m.id,site:'t32',desc:'Hang fans',status:'open',m_x1:{by:'u8',ts:Date.now(),text:'need the marmalade bracket'}});
              const k='c1|'+dkey(new Date());D.sched[k]=Object.assign({},D.sched[k]||{site:'t32',time:'7:00 AM'},{note:'bring the walrus extension cord'});
              D.punchlists['t32']=D.punchlists['t32']||{rough:[],finish:[]};D.punchlists['t32'].rough.push({id:'plS1',text:'label the flamingo panel',ts:Date.now()});
              D.inbox.unshift({id:'nS1',to:m.id,msg:'Kangaroo delivery confirmed',kind:'info',ts:Date.now(),read:true});
              return 1;})()""")
            r=await search(A,'instalacion panel'); check('search: finds a note, any word order, accents not needed','notes' in r and 'panel notes' in r,r[:300])
            r=await search(A,'secadora cocina'); check('search: finds words deep inside a note body','panel notes' in r,r[:200])
            r=await search(A,'porcupine'); check('search: finds FINISHED tasks too (marked done)','porcupine' in r.lower() and 'done' in r,r[:200])
            r=await search(A,'marmalade'); check('search: finds words in a task\'s chat','hang fans' in r,r[:200])
            r=await search(A,'walrus'); check('search: finds schedule notes','schedule' in r and 'walrus' in r,r[:200])
            r=await search(A,'flamingo'); check('search: finds punch-list items','punch list' in r and 'flamingo' in r,r[:200])
            r=await search(A,'kangaroo'); check('search: finds notifications','notifications' in r,r[:200])
            r=(await A.evaluate("(()=>{D.keep.push({id:'knS2',owner:'u7',type:'text',title:'Carlos private',body:'zebra secret',items:[],color:'0',labels:[],collab:[],created:Date.now(),edited:Date.now()});openSearch();document.getElementById('sqInput').value='zebra';doSearch();const r=document.getElementById('sqRes').innerText;D.keep=D.keep.filter(n=>n.id!=='knS2');return r})()")).lower(); check('search: does not show someone else\'s private note','carlos private' not in r and 'nothing found' in r,r[:200])
            r=await search(A,'carlos'); check('search: still finds people (and the answer card)','people' in r and 'carlos' in r,r[:200])
            r=await search(A,'porcupnie'); check('search: forgives a small misspelling','porcupine' in r,r[:200])
            await A.evaluate("D.sites.push({id:'zzU1',name:'254 Union Rd, Monsey',phase:'rough'})")
            r=await search(A,'255 union'); check('search: a house number must match exactly (255 Union does not find 254 Union)','254 union' not in r,r[:200])
            r=await search(A,'254 union'); check('… 254 Union is found','254 union' in r,r[:200])
            await A.evaluate("D.sites=D.sites.filter(s=>s.id!=='zzU1')")
            r=await search(A,'qqqzzzxx'); check('search: says nothing found','nothing found' in r,r[:200])
            check('search: no errors',not ea,ea)
            # ── 3. exact note formatting ──
            out=await A.evaluate("noteLines('Bring:\\n  - 3 boxes\\n\\n  - tape')")
            check('schedule note shown exactly as typed (no automatic 1. 2. numbering, indents and blank line kept)','1.' not in out and '  - 3 boxes\n\n  - tape' in out and 'class="fmt"' in out,out)
            await A.evaluate("D.jobs.unshift({id:'jF1',ts:Date.now(),to:['u7'],from:me().id,site:'t32',desc:'Steps:\\n1) kill power\\n   - check twice\\n\\n2) swap panel',status:'open'});jobFilter='all';jobView='open';goTab('jobs');renderJobs()"); await A.wait_for_timeout(200)
            t1=await A.evaluate("(()=>{const el=[...document.querySelectorAll('#pg-jobs .desc .fmt')].find(x=>x.textContent.includes('kill power'));return el?[el.innerText,getComputedStyle(el).whiteSpace]:null})()")
            check('task text shows line breaks, blank lines and indents exactly',t1 and '1) kill power\n   - check twice\n\n2) swap panel' in t1[0] and t1[1]=='pre-wrap',t1)
            h=await A.evaluate("bubbleHtml(D.jobs.find(j=>j.id==='jF1'),{id:'x',by:'u7',ts:Date.now(),text:'line one\\n    indented'},false)")
            check('chat messages keep line breaks and indents','line one\n    indented' in h and 'fmt' in h,h[:200])
            # ── 5. blank by default ──
            await A.evaluate("jobFilter='u7';openJob()"); await A.wait_for_timeout(150)
            st=await A.evaluate("[document.querySelectorAll('#jAssign input:checked').length,document.getElementById('jSite').value,document.getElementById('jDue').value,document.getElementById('jDesc').value,document.getElementById('jPri').classList.contains('on')]")
            check('New task opens blank: no person, no job site, no due time, no text, not priority (even from someone\'s list)',st==[0,'','','',False],st)
            await A.evaluate("hide('m-job')")
            c2,Y,ey,_=await login(b,'Yossi','Testpass123','android'); await ready(Y); await settle(Y)
            await Y.evaluate("openNewJob()"); await Y.wait_for_timeout(150)
            st=await Y.evaluate("[document.getElementById('njMgr').value,document.getElementById('njPhase').value,document.getElementById('njCrew').value,document.getElementById('njNote').tagName]")
            check('New job opens blank: no manager (not even yourself), no phase, no crew; note box takes several lines',st==['','','','TEXTAREA'],st)
            n0=await Y.evaluate("D.sites.length")
            await Y.fill('#njAddr','12 Blank Test Rd, Monsey'); await Y.evaluate("saveNewJob()"); await Y.wait_for_timeout(150)
            check('… a job without Rough/Finishing is not created (asks for it)',await Y.evaluate("D.sites.length")==n0 and any('Rough or Finishing' in x for x in await Y.evaluate("window._t||[]")))
            await Y.select_option('#njPhase','finish'); await Y.fill('#njNote','GC: Moshe\nDesigner: Dzign Room\n  gate code 1234'); await Y.evaluate("saveNewJob()"); await settle(Y)
            srows=[x for x in srv('/__records?coll=sites') if (x['data'] or {}).get('name')=='12 Blank Test Rd, Monsey']
            check('… with it chosen, the job is saved with the multi-line note exactly',srows and srows[0]['data'].get('phase')=='finish' and srows[0]['data'].get('note')=='GC: Moshe\nDesigner: Dzign Room\n  gate code 1234',srows and srows[0]['data'])
            ft=await Y.evaluate("(document.getElementById('fdTitle')||{}).innerText||''")
            check('… and the note shows in the job folder as typed','Designer: Dzign Room\n  gate code 1234' in ft,ft[:200])
            # ── 4. assignment notifications: the live server sends them, the phone does not send a second copy ──
            i0=len(srv('/__records?coll=inbox'))
            await A.evaluate("openJob()"); await A.wait_for_timeout(100)
            await A.evaluate("document.querySelector('#jAssign input').checked=true;jobWord();document.getElementById('jDesc').value='Check the GFCI';saveJob()"); await settle(A); await until(A,"!EX_SYNC.pending",4000); await A.wait_for_timeout(800)
            jb=[x for x in srv('/__records?coll=jobs') if (x['data'] or {}).get('desc')=='Check the GFCI']
            check('new task saved',bool(jb),[[ (x['id'],(x['data'] or {}).get('desc')) for x in srv('/__records?coll=jobs')],await A.evaluate("JSON.stringify(EX_SYNC)"),await A.evaluate("window._t||[]"),await A.evaluate("document.getElementById('m-job').className")])
            check('… and the phone did not add its own bell message (the server sends it in the worker\'s language)',len(srv('/__records?coll=inbox'))==i0,len(srv('/__records?coll=inbox'))-i0)
            check('… demo mode (no server) still sends from the phone',await A.evaluate("(()=>{const r=window.EX_REAL;window.EX_REAL=false;const n=D.inbox.length;assignPush(['u7'],'x','info',null);const ok=D.inbox.length===n+1;D.inbox.shift();window.EX_REAL=r;return ok})()"))
            # ── 2. Time Clock YES/NO (Baruch: no time clock for some people; Owner / all-access / Payroll only) ──
            c3,M,em,_=await login(b,'Miriam','Testpass123','desktop'); await ready(M); await settle(M)
            await M.evaluate("openEmp('u7')"); await M.wait_for_timeout(150)
            check('Payroll sees the "Time clock" switch, on by default',await M.evaluate("document.getElementById('ePayMWrap').style.display!=='none'&&document.getElementById('ePayM').classList.contains('on')"))
            et=(await M.evaluate("document.getElementById('m-emp').innerText")).lower()
            check('… no pay wording anywhere on the employee screen',not any(w in et for w in ['paid','monthly','salary']),et[:200])
            await M.evaluate("document.getElementById('ePayM').classList.remove('on');saveEmp()"); await settle(M)
            check('… switching it off is saved as Time clock: NO',(emp('u7') or {}).get('clock') is False,emp('u7'))
            await Y.evaluate("openEmp('u7')"); await Y.wait_for_timeout(150)
            check('a manager does not see the switch',await Y.evaluate("document.getElementById('ePayMWrap').style.display==='none'"))
            await Y.evaluate("hide('m-emp')")
            await settle(Y); await Y.wait_for_timeout(600)
            await M.evaluate("goTab('hours');renderHours()"); await M.wait_for_timeout(300)
            at=await M.evaluate("document.getElementById('attWrap').innerText")
            check('Hours: not listed as "not punched in"; shown under "No time clock"','No time clock' in at and 'Carlos' in at.split('No time clock')[1][:80] and not await M.evaluate("[...document.querySelectorAll('#attGrid .card')].some(x=>x.innerText.includes('Carlos'))"),at[:300])
            check('crew status says "No time clock" instead of "not punched in"',await M.evaluate("punchState(D.emps.find(e=>e.id==='u7')).txt.includes('No time clock')"))
            check('old clock entries are kept (nothing removed)',not any(x['deleted'] for x in srv('/__records?coll=punches') if (x['data'] or {}).get('who')=='u7'))
            c4,W,ew,_=await login(b,'Carlos','Testpass123','iphone'); await ready(W); await settle(W); await W.wait_for_timeout(500)
            check('Carlos (Time clock: NO) does not open on the clock screen after signing in',await W.evaluate("(document.querySelector('.pg.on')||{}).id")!='pg-punch',await W.evaluate("(document.querySelector('.pg.on')||{}).id"))
            check('… and can still request time off from More',await W.evaluate("goTab('more');renderMore();document.getElementById('moreGrid').innerText.includes('Request time off')"))
            await W.evaluate("goTab('punch');renderPunch()"); await W.wait_for_timeout(250)
            st=await W.evaluate("[!document.getElementById('payMNote').hidden,getComputedStyle(document.querySelector('#pg-punch .punch-big')).display]")
            check('his Clock screen says he doesn\'t need to clock in, no punch button',st[0] and st[1]=='none',st)
            await W.evaluate("me().lang='es';applyLang&&applyLang();renderPunch()"); await W.wait_for_timeout(150)
            check('… in Spanish too','reloj' in (await W.evaluate("document.getElementById('payMNote').innerText")).lower())
            await M.evaluate("openEmp('u7')"); await M.wait_for_timeout(100); await M.evaluate("document.getElementById('ePayM').classList.add('on');saveEmp()"); await settle(M)
            check('Payroll switches it back on: saved',(emp('u7') or {}).get('clock') is True,emp('u7'))
            await settle(W); await W.wait_for_timeout(800); await W.evaluate("renderPunch()"); await W.wait_for_timeout(150)
            check('… and Carlos gets his punch button back',await W.evaluate("document.getElementById('payMNote').hidden&&getComputedStyle(document.querySelector('#pg-punch .punch-big')).display!=='none'"))
            for nm,errs in [('owner',ea),('manager',ey),('payroll',em),('worker',ew)]: check(f'no errors on the {nm}\'s phone',not errs,errs[:3])
    finally:
        sp.terminate()
    ok=sum(1 for r in R if r[0]); print(f'{ok} passed, {len(R)-ok} failed')
asyncio.run(run())
