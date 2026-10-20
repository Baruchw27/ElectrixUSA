"""Features v1 — regression suite (real app code in Chromium, local stand-in server, production-shaped data:
480 job sites, 1,796 stock items, 5 crews, 20 people). iPhone, Android and desktop profiles; several roles at once.
Run:  python3 suite.py           (APPROOT defaults to ../../staging)"""
from fharness import *
import re

TEXT="Kitchen:\n\n* 5 outlets\n* 3 switches\n\n\n\nSecond Floor:\n\n    * 10 outlets\n\t* 4 dimmers\n\nBasement:\n\n* 6 lights"

async def search(P,q):
    await P.evaluate("openSearch()"); await P.fill('#sqInput',q); await P.wait_for_timeout(220)
    return await P.evaluate("""(()=>{const g={};document.querySelectorAll('#sqRes .exsr-g').forEach(x=>{const h=x.querySelector('.exsr-h span').textContent.split(' · ')[0];g[h]=[...x.querySelectorAll('.sres .n')].map(n=>n.textContent);});return g;})()""")
async def close_all(P): await P.evaluate("document.querySelectorAll('.ov:not(.hid)').forEach(o=>hide(o.id))")
async def unread(P): return await P.evaluate("D.inbox.filter(x=>x.to===me().id&&!x.read).length")

async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            cO,O,eO,ok=await go(b,'Baruch','iphone'); check('owner signed in (iPhone)',ok)
            cJ,J,eJ,ok=await go(b,'Jon','android'); check('crew leader Jon signed in (Android)',ok)
            cS,S,eS,ok=await go(b,'Shia','desktop'); check('Payroll Shia signed in (desktop)',ok)
            cY,Y,eY,ok=await go(b,'Yossi','iphone'); check('site manager Yossi signed in',ok)
            cC,C,eC,ok=await go(b,'Carlos','iphone'); check('worker Carlos signed in',ok)
            cM,M,eM,ok=await go(b,'Menachem','desktop'); check('Material office Menachem signed in',ok)
            cP,Pd,eP,ok=await go(b,'Pedro','android'); check('worker Pedro (other crew) signed in',ok)

            # ── data used below: part-numbered stock, a punch for Carlos ──
            await O.evaluate("""D.stock.push({id:'s_lb240',name:'Leviton 40A 2-pole breaker (LB240)',unit:'pc',qty:0,min:0},{id:'s_5601',name:'Leviton 5601-2W Decora rocker switch',unit:'pc',qty:0,min:0});
              D.punches.push({id:'p_carlos1',who:'u7',site:'t32',in:Date.now()-5*3600000,out:Date.now()-3600000,edits:[{by:'u1',at:Date.now(),why:'test',from:{},to:{}}]});save();0""")
            await settle(O); await asyncio.sleep(1.2)

            # ════════ 1. universal search ════════
            g=await search(O,'viola')
            check('S1 owner: address "viola" → Job sites group', any('Viola' in x for x in g.get('Job sites',[])), g)
            g=await search(O,'vilola rd')
            check('S2 misspelling "vilola rd" still finds Viola Rd', any('Viola' in x for x in g.get('Job sites',[])), g)
            g=await search(O,'lb 240'); g2=await search(O,'LB-240'); g3=await search(O,'5601 2w')
            check('S3 part numbers: "lb 240", "LB-240", "5601 2w" → inventory', any('LB240' in x for x in g.get('Inventory',[])) and any('LB240' in x for x in g2.get('Inventory',[])) and any('5601' in x for x in g3.get('Inventory',[])), [g,g2,g3])
            g=await search(O,'254 union'); g2=await search(O,'255 union')
            check('S4 house number must match: 254 Union found, 255 Union not', any(x.startswith('254 Union') for x in g.get('Job sites',[])) and not any(x.startswith('254 Union') for x in g2.get('Job sites',[])), [g,g2])
            g=await search(O,'carl')
            check('S5 partial word "carl" → Carlos (employee) + his hours', any('Carlos' in x for x in g.get('Employees',[])) and any('Carlos' in x for x in g.get('Hours',[])), g)
            hdr=await O.evaluate("[...document.querySelectorAll('#sqRes .exsr-h span')].map(x=>x.textContent)")
            check('S6 results grouped by category with counts', len(hdr)>=2 and all(' · ' in h for h in hdr), hdr)
            # tap a result → exact item
            await search(O,'69 viola'); await O.click("#sqRes .exsr-g .sres >> nth=0"); await O.wait_for_timeout(400)
            fd=await O.evaluate("!document.getElementById('m-folder').classList.contains('hid')&&D.sites.find(s=>s.id===fdSite).name")
            check('S7 tapping a job result opens that job folder', bool(fd) and 'Viola' in str(fd), fd); await close_all(O)
            # speed with thousands of records (1,798 stock + 480 sites + tasks + punches)
            ms=[]
            for q in ['romex','brkr 20a','union rd monsey','gfci','leviton plate']:
                await search(O,q); ms.append(await O.evaluate("window.EX_lastSearchMs"))
            n=await O.evaluate("EX_searchIndex().length")
            check(f'S8 fast: {n} records searched in {max(ms)} ms (worst of 5)', max(ms)<150, ms)
            await close_all(O)
            big=await O.evaluate("""(()=>{const keep=D.stock;D.stock=keep.concat(Array.from({length:10000},(_,i)=>({id:'zz'+i,name:'Test item '+i+' 12-2 romex box '+(i%97),unit:'pc',qty:1})));
              const t0=performance.now();EX_searchIndex();const build=performance.now()-t0;const tk=EX_fuzzy.toks('romex box 45');const I=EX_searchIndex();
              const t1=performance.now();let n=0;for(const x of I)if(EX_fuzzy.score(tk,x.h)>0)n++;const q=performance.now()-t1;D.stock=keep;EX_bumpData();return {n:I.length,build:Math.round(build),q:Math.round(q)};})()""")
            check(f'S8b {big["n"]} records: one keystroke searched in {big["q"]} ms (index built once in {big["build"]} ms)', big['q']<200, big)
            # permissions
            g=await search(C,'carl')
            check('S9 worker Carlos: no Employees group, sees only his own hours', 'Employees' not in g and all('Carlos' in x for x in g.get('Hours',[])), g)
            g=await search(Y,'carlos')
            check('S10 site manager (no hours access): no Hours results', 'Hours' not in g, g)
            g=await search(C,'leviton')
            check('S11 worker: no garage inventory in results', 'Inventory' not in g, g)
            # task visibility
            await O.evaluate("""D.jobs.unshift({id:'j_s1',ts:Date.now(),to:['u6'],from:'u1',site:'t32',desc:'Replace GFCI in kitchen',status:'open',due:'Today'});save();0"""); await settle(O); await asyncio.sleep(1.5)
            gJ=await search(J,'gfci kitchen'); gC=await search(C,'gfci kitchen'); gP=await search(Pd,'gfci kitchen')
            check('S12 task found by its assignee only (Jon yes, Carlos/Pedro no)', 'Tasks' in gJ and 'Tasks' not in gC and 'Tasks' not in gP, [gJ,gC,gP])
            # private notes
            await O.evaluate("""D.keep.unshift({id:'k_gate',owner:'u1',type:'text',title:'Gate code',body:'Gate code 4512 at the back',items:[],collab:[],created:Date.now(),edited:Date.now()});save();0"""); await settle(O); await asyncio.sleep(1.5)
            gO=await search(O,'gate code'); gY=await search(Y,'gate code')
            check('S13 private note: owner finds it, Yossi does not', 'Notes' in gO and 'Notes' not in gY, [gO,gY])
            # schedule
            g=await search(O,'crew 1 today'); gJ=await search(J,'today'); gP=await search(Pd,'crew 1')
            check('S14 schedule: owner finds "crew 1 today"; Jon sees his crew; Pedro sees no Crew 1', 'Schedule' in g and 'Schedule' in gJ and not any('Crew 1' in x for x in gP.get('Schedule',[])), [g,gJ,gP])
            # material lists
            await C.evaluate("""D.mats.unshift({id:'m_s1',from:'u7',site:'t32',items:'Romex 12-2 250ft\\n\\n  2 boxes wire nuts',when:'Tomorrow',status:'open',ts:Date.now(),photos:[],src:'garage'});save();0"""); await settle(C); await asyncio.sleep(1.5)
            gM=await search(M,'romex 12 2'); gP=await search(Pd,'romex 12 2')
            check('S15 material list: Material office finds it, other crew does not', 'Material lists' in gM and 'Material lists' not in gP, [gM,gP])
            await M.evaluate("EX_openMat('m_s1')"); await M.wait_for_timeout(200)
            mt=await M.evaluate("document.querySelector('#exdBody .ptx').innerText")
            check('S16 material list opens with its exact lines', mt=='Romex 12-2 250ft\n\n  2 boxes wire nuts', repr(mt)); await close_all(M)
            idx=await C.evaluate("(()=>{const I=EX_searchIndex();return {punchOther:I.filter(r=>r.cat==='hours'&&!/Carlos/.test(r.title)).length,notes:I.filter(r=>r.cat==='notes').length}})()")
            check('S17 worker index holds no one else\'s hours and no private notes', idx['punchOther']==0 and idx['notes']==0, idx)
            # keyboard on a computer
            await close_all(S); await S.keyboard.press('Control+k'); await S.wait_for_timeout(150)
            check('S18 Ctrl+K opens search on a computer', await S.evaluate("!document.getElementById('m-search').classList.contains('hid')")); await close_all(S)

            # pick-ups & returns (inventory history)
            await O.evaluate("openPickup();EX_jobPick(document.getElementById('puSite')).pick('t32');puLines=[{id:'s_lb240',name:'Leviton 40A 2-pole breaker (LB240)',unit:'pc',qty:2}];savePickup()"); await asyncio.sleep(2.5)
            g=await search(O,'lb240')
            check('S19 garage pick-up appears under Pick-ups & returns', any('LB240' in x for x in g.get('Pick-ups & returns',[])), g); await close_all(O)
            # ════════ 2. Time Clock Required ════════
            check('C1 Yossi (site manager) has the clock today', await Y.evaluate("document.querySelector('.tab[onclick*=\"\\'punch\\'\"]').dataset.allowed")=='1')
            await O.evaluate("openEmp('u2')"); await O.wait_for_timeout(150)
            st=await O.evaluate("({y:document.getElementById('exClockY').classList.contains('on'),dis:document.getElementById('exClockY').disabled})")
            check('C2 owner sees Time Clock Required = YES for Yossi, can change it', st['y'] and not st['dis'], st)
            await O.evaluate("EX_setClockSel(false);saveEmp()"); await settle(O); await asyncio.sleep(1.5)
            rec=[r for r in records('emps') if r['id']=='u2'][0]['data']
            check('C3 saved on the server: clock=false (no pay data added)', rec.get('clock') is False and not any(k in rec for k in ('rate','pay','salary','wage')), rec)
            await until(Y,"D.emps.find(e=>e.id==='u2').clock===false",8000); await Y.evaluate("applyTabs()")
            check('C4 Yossi: no Clock In tab any more', await Y.evaluate("document.querySelector('.tab[onclick*=\"\\'punch\\'\"]').dataset.allowed")=='0')
            await Y.evaluate("window._t=[];doPunch()")
            check('C5 Yossi: punching is refused even if called directly', not await Y.evaluate("D.punches.some(p=>p.who==='u2'&&!p.out)") and any('not tracked' in x for x in await Y.evaluate("window._t")))
            await Y.evaluate("window._w=0;const n=notify;notify=function(m){if(/not punched in/.test(m))window._w++;return n.apply(this,arguments)};startWatch()")
            check('C6 Yossi: no "you are at a site but not punched in" reminders', await Y.evaluate("typeof watchId==='undefined'||!watchId"))
            att=await S.evaluate("attField().map(e=>e.id)")
            check('C7 Payroll attendance board no longer expects Yossi', 'u2' not in att and 'u3' in att, att)
            check('C8 Yossi shows "No time clock", not "not punched in"', await S.evaluate("punchState(D.emps.find(e=>e.id==='u2')).txt")=='No time clock')
            # office people: NO by default; manager can't change office people, can change a worker
            await O.evaluate("hide('m-emp');openEmp('o1')"); await O.wait_for_timeout(100)
            check('C9 Shia (office) starts as NO — same as before', await O.evaluate("document.getElementById('exClockN').classList.contains('on')"))
            await O.evaluate("hide('m-emp')")
            await Y.evaluate("openEmp('o3')"); await Y.wait_for_timeout(100)
            check('C10 site manager cannot change an office person\'s clock setting', await Y.evaluate("document.getElementById('exClockY').disabled"))
            await Y.evaluate("hide('m-emp');openEmp('u7')"); await Y.wait_for_timeout(100)
            check('C11 site manager can change a worker\'s setting', not await Y.evaluate("document.getElementById('exClockY').disabled")); await Y.evaluate("hide('m-emp')")
            check('C12 nobody can change their own setting', not await Y.evaluate("(()=>{const m=me();return document.getElementById('exClockY')&&(openEmp(m.id),!document.getElementById('exClockY').disabled)})()")); await close_all(Y)
            # worker set to NO: home count + hours list; history kept
            homeBefore=await O.evaluate("(goTab('home'),0)") ; await O.wait_for_timeout(300)
            await O.evaluate("openEmp('u7');EX_setClockSel(false);saveEmp()"); await settle(O); await asyncio.sleep(1)
            await O.evaluate("goTab('home')"); await O.wait_for_timeout(500)
            homeTxt=await O.evaluate("document.getElementById('homeBody').innerText")
            check('C13 home "On the job now" no longer counts Carlos', bool(re.search(r'(?i)On the job now\s*\d+/(\d+)',homeTxt)) and int(re.search(r'(?i)On the job now\s*\d+/(\d+)',homeTxt).group(1))==await O.evaluate("D.emps.filter(e=>e.role==='worker'&&clockReq(e)).length"), homeTxt[:200])
            check('C14 Carlos\' old punches are kept', any(r['id']=='p_carlos1' for r in records('punches')))
            await S.evaluate("goTab('hours')"); await S.wait_for_timeout(300)
            check('C15 Hours list still lists Carlos (he has punches); Yossi gone (none)', await S.evaluate("(()=>{const o=[...document.getElementById('hrWho').options].map(x=>x.value);return o.includes('u7')&&!o.includes('u2')})()"))
            # back to YES
            await O.evaluate("openEmp('u2');EX_setClockSel(true);saveEmp()"); await settle(O)
            await until(Y,"D.emps.find(e=>e.id==='u2').clock===true",8000); await Y.evaluate("applyTabs()")
            check('C16 switching back to YES brings the clock back', await Y.evaluate("document.querySelector('.tab[onclick*=\"\\'punch\\'\"]').dataset.allowed")=='1')
            await O.evaluate("openEmp('u7');EX_setClockSel(true);saveEmp()"); await settle(O)

            # ════════ 3. text exactly as typed ════════
            await O.evaluate("openJob()"); await O.fill('#jDesc',TEXT); await O.evaluate("document.getElementById('jDesc').blur()"); await O.wait_for_timeout(250)
            check('T1 tapping out of the task box keeps the text exactly', await O.evaluate("document.getElementById('jDesc').value")==TEXT)
            await O.evaluate("document.querySelector('#jAssign input[value=\"u6\"]').checked=true;saveJob()"); await settle(O); await asyncio.sleep(1.5)
            j=[r for r in records('jobs') if r['data'].get('desc','').startswith('Kitchen:')]
            check('T2 saved on the server exactly (blank lines, 4 blank lines, spaces, tab)', bool(j) and j[0]['data']['desc']==TEXT, j[:1])
            jid=j[0]['id'] if j else ''
            await until(J,f"D.jobs.some(x=>x.id==='{jid}')",8000)
            check('T3 the other phone receives it exactly', await J.evaluate(f"D.jobs.find(x=>x.id==='{jid}').desc")==TEXT)
            await J.evaluate("goTab('jobs')"); await J.wait_for_timeout(300)
            shown=await J.evaluate(f"(()=>{{const c=[...document.querySelectorAll('#pg-jobs .desc')].find(d=>d.textContent.startsWith('Kitchen'));return c?{{t:c.innerText,ws:getComputedStyle(c).whiteSpace}}:null}})()")
            check('T4 shown on the task card with every line and blank line', bool(shown) and shown['ws']=='pre-wrap' and shown['t'].split('\n')==TEXT.split('\n'), shown)
            await J.evaluate(f"openJobDetail('{jid}')"); await J.wait_for_timeout(400)
            ct=await J.evaluate("(()=>{const c=document.querySelector('#jdChat .ctask');return c?{t:c.innerText,ws:getComputedStyle(c).whiteSpace}:null})()")
            check('T5 shown in the task chat the same way', bool(ct) and ct['ws']=='pre-wrap' and TEXT.split('\n')[2] in ct['t'] and '\n\n\n\n' in ct['t'], ct)
            await cJ.grant_permissions(['clipboard-read','clipboard-write'])
            await J.evaluate("document.querySelector('#jobdBody .exshare button').click()"); await J.wait_for_timeout(300)
            clip=await J.evaluate("navigator.clipboard.readText().catch(e=>'ERR '+e)")
            check('T6 Copy puts the exact text on the clipboard', clip==TEXT, repr(clip[:80]))
            await J.evaluate(f"EX_printText('t',D.jobs.find(x=>x.id==='{jid}').desc)"); await J.wait_for_timeout(80)
            check('T7 Print shows the exact text', await J.evaluate("document.querySelector('#exPrint .ptx').innerText")==TEXT); await close_all(J)
            # material request typed with blank lines + indentation
            await C.evaluate("openMat()"); await C.fill('#mtItems',TEXT); await C.evaluate("mtSitePick('t32');saveMat()"); await settle(C); await asyncio.sleep(1.2)
            mm=[r for r in records('mats') if r['data'].get('items','').startswith('Kitchen:')]
            check('T8 material list saved exactly', bool(mm) and mm[0]['data']['items']==TEXT, mm[:1])
            await C.evaluate("goTab('mat')"); await C.wait_for_timeout(300)
            mshown=await C.evaluate("(()=>{const c=[...document.querySelectorAll('#matList .desc')].find(d=>d.textContent.startsWith('Kitchen'));return c?{t:c.innerText,ws:getComputedStyle(c).whiteSpace}:null})()")
            check('T9 material list shown with indentation kept (pre-wrap, not pre-line)', bool(mshown) and mshown['ws']=='pre-wrap' and '    * 10 outlets' in mshown['t'], mshown)
            # Windows line endings from a computer
            await S.evaluate("openJob()"); await S.evaluate("document.getElementById('jDesc').value='A\\r\\n\\r\\nB\\r\\n  C';document.querySelector('#jAssign input').checked=true;saveJob()"); await settle(S)
            check('T10 Windows line endings become normal line breaks, blank line kept', await S.evaluate("D.jobs[0].desc")=='A\n\nB\n  C', await S.evaluate("JSON.stringify(D.jobs[0].desc)"))
            check('T11 first-line indentation kept on save', await O.evaluate("EX_txt('   indented\\n\\nnext   \\n\\n')")=='   indented\n\nnext')
            # notes (Keep) round trip
            await O.evaluate(f"D.keep.unshift({{id:'k_txt',owner:'u1',type:'text',title:'Layout',body:{json.dumps(TEXT)},items:[],collab:['u2'],created:Date.now(),edited:Date.now()}});save();0"); await settle(O)
            await until(Y,"D.keep.some(k=>k.id==='k_txt')",8000)
            await Y.evaluate("kOpen('k_txt')"); await Y.wait_for_timeout(250)
            check('T12 shared note reopens on another phone exactly', await Y.evaluate("document.querySelector('#kEd textarea.kx').value")==TEXT); await Y.evaluate("kClose()")
            # voice path keeps line breaks
            await O.evaluate("openJob();parseVoice('Jon tomorrow\\nline two\\n\\nline three')");
            check('T13 voice note text keeps its line breaks', '\n\n' in await O.evaluate("document.getElementById('jDesc').value")); await close_all(O)
            # service call issue / estimate / material dictation append
            await O.evaluate("openSvc();['svClient','svAddr'].forEach(i=>document.getElementById(i).value='T');document.getElementById('svIssue').value='No power\\n\\n  - kitchen\\n  - bath';saveSvc()"); await settle(O)
            check('T14 service call issue saved exactly', await O.evaluate("D.tickets[0].issue")=='No power\n\n  - kitchen\n  - bath')
            await O.evaluate("openSvcDetail(D.tickets[0].id)"); await O.wait_for_timeout(200)
            check('T15 service call shows its lines', '  - kitchen' in await O.evaluate("document.querySelector('#svdBody .ptx').innerText")); await close_all(O)

            # ════════ 4. notifications ════════
            u0=await unread(J)
            await O.evaluate("D.jobs.unshift({id:'j_n1',ts:Date.now(),to:['u6'],from:'u1',site:'t32',desc:'Hang fixtures',status:'open',due:'Today'});pushTo(['u6'],'New job from Baruch: Hang fixtures','info',{job:'j_n1'});0"); await settle(O)
            got=await until(J,f"D.inbox.filter(x=>x.to===me().id&&!x.read).length>{u0}",10000)
            await until(J,f"+document.getElementById('bellN').textContent>{u0}",5000); bell=await J.evaluate("+document.getElementById('bellN').textContent")
            check('B1 assignment reaches the other phone; bell count goes up', got and bell>u0, [got,bell,u0])
            await J.evaluate("openInbox()"); await J.wait_for_timeout(200)
            check('B2 opening the list does not mark everything read', await unread(J)>u0)
            nid=await J.evaluate("D.inbox.find(x=>x.link&&x.link.job==='j_n1').id")
            await J.evaluate(f"EX_nToggle('{nid}')"); r1=await J.evaluate(f"D.inbox.find(x=>x.id==='{nid}').read")
            await J.evaluate(f"EX_nToggle('{nid}')"); r2=await J.evaluate(f"D.inbox.find(x=>x.id==='{nid}').read")
            check('B3 mark read / mark unread', r1 is True and r2 is False)
            await J.click(f".exn-row:has-text('Hang fixtures')"); await J.wait_for_timeout(400)
            check('B4 tapping it opens that exact task and marks it read', await J.evaluate("!document.getElementById('m-jobd').classList.contains('hid')&&jdOpen==='j_n1'") and await J.evaluate(f"D.inbox.find(x=>x.id==='{nid}').read"))
            await close_all(J)
            # phone notification tap (app closed → opens at #n=…)
            await O.evaluate("D.jobs.unshift({id:'j_n2',ts:Date.now(),to:['u6'],from:'u1',site:'t32',desc:'Check panel',status:'open',due:'Today'});pushTo(['u6'],'New job from Baruch: Check panel','info',{job:'j_n2'});0"); await settle(O)
            await until(J,"D.inbox.some(x=>x.link&&x.link.job==='j_n2')",8000)
            nid2=await J.evaluate("D.inbox.find(x=>x.link&&x.link.job==='j_n2').id")
            await J.evaluate(f"location.hash='n={nid2}'"); await J.wait_for_timeout(900)
            check('B5 opening the app from a phone notification opens the exact task', await J.evaluate("!document.getElementById('m-jobd').classList.contains('hid')&&jdOpen==='j_n2'")); await close_all(J)
            # offline: alert sent while the phone has no signal arrives on reconnect
            await J.evaluate("window.__offline=true"); urllib.request.urlopen(BASE+'/__net?mode=down')
            await O.evaluate("D.jobs.unshift({id:'j_n3',ts:Date.now(),to:['u6'],from:'u1',site:'t32',desc:'Offline test',status:'open',due:'Today'});pushTo(['u6'],'New job from Baruch: Offline test','info',{job:'j_n3'});0")
            await asyncio.sleep(1.5); urllib.request.urlopen(BASE+'/__net?mode=ok')
            await settle(O,40000)
            got=await until(J,"D.inbox.some(x=>x.link&&x.link.job==='j_n3')",30000)
            if not got:
                await J.evaluate("EX_catchUp&&EX_catchUp()"); got=await until(J,"D.inbox.some(x=>x.link&&x.link.job==='j_n3')",10000)
            check('B6 a notification sent while offline is there after reconnecting', got)
            # duplicates
            await O.evaluate("const n0=D.inbox.length;pushTo(['u6'],'Same alert','info',{job:'j_n1'});pushTo(['u6'],'Same alert','info',{job:'j_n1'});window._dup=D.inbox.length-n0")
            check('B7 the exact same alert twice in a row is sent once', await O.evaluate("window._dup")==1)
            await O.evaluate("const n0=D.inbox.length;pushTo(['u6'],'Other alert','pri',{job:'j_n1'});window._dup=D.inbox.length-n0")
            check('B8 a different alert is never held back', await O.evaluate("window._dup")==1)
            # crew-wide task → whole crew; privacy
            await O.evaluate("pushTo(['c1'],'Crew 1: bring the lift','info',{tab:'jobs'});0"); await settle(O)
            gotC=await until(C,"D.inbox.some(x=>x.msg==='Crew 1: bring the lift')",8000); gotP=await Pd.evaluate("D.inbox.some(x=>x.msg==='Crew 1: bring the lift')")
            check('B9 a crew alert reaches each crew member, not other crews', gotC and not gotP)
            check('B10 nobody receives someone else\'s notifications', not await Pd.evaluate("D.inbox.some(x=>x.to!==me().id)") and not await J.evaluate("D.inbox.some(x=>x.to!==me().id)"))
            check('B10b the server only lets each person read their own', all(r['data'].get('to')=='u13' for r in await Pd.evaluate("fetch('/records?select=*&coll=eq.inbox',{headers:{Authorization:'Bearer '+(JSON.parse(localStorage.getItem('sb')||localStorage.getItem('stg__sb')||'null')||{}).access_token}}).then(r=>r.json()).catch(()=>[])") if isinstance(r,dict)))
            # note shared → opens the note; edited by a collaborator → owner told
            await O.evaluate("kOpen('k_gate');kCollab('u3',true);kClose()"); await settle(O)
            await until(cY and Y,"true",100)
            cS3,S3,eS3,ok=await go(b,'Shauly','iphone')
            await until(S3,"D.inbox.some(x=>x.link&&x.link.note==='k_gate')",8000)
            n3=await S3.evaluate("(D.inbox.find(x=>x.link&&x.link.note==='k_gate')||{}).id")
            await S3.evaluate(f"nGo('{n3}')"); await S3.wait_for_timeout(300)
            check('B11 "shared a note with you" opens that note', await S3.evaluate("!document.getElementById('m-knote').classList.contains('hid')&&kCur==='k_gate'"))
            await S3.evaluate("kGet().body+='\\nnew line from Shauly';kClose()"); await settle(S3)
            check('B12 note edited by a collaborator → the owner is told', await until(O,"D.inbox.some(x=>x.to==='u1'&&x.link&&x.link.note==='k_gate'&&/updated the note/.test(x.msg))",8000))
            await cS3.close()
            # crew leader change tells the person
            await O.evaluate("toggleLead('u8')"); await settle(O)
            check('B13 made crew leader → that person is told', any(r['data'].get('to')=='u8' and 'crew leader' in r['data'].get('msg','') for r in records('inbox')))
            await O.evaluate("toggleLead('u8')"); await settle(O)
            # My Tasks
            await J.evaluate("openInbox('t')"); await J.wait_for_timeout(200)
            mt=await J.evaluate("document.getElementById('exNBody').innerText")
            check('B14 My Tasks: new assignments for Jon listed', 'New assignments' in mt and 'Offline test' in mt, mt[:300])
            await C.evaluate("openFix();EX_jobPick(document.getElementById('fxSite')).pick('t32');document.getElementById('fxIn').value='07:00';document.getElementById('fxOut').value='15:30';document.getElementById('fxWhy').value='forgot to punch';sendFix()"); await settle(C)
            await until(S,"D.fixes.some(f=>f.who==='u7'&&f.status==='pending')",8000)
            await S.evaluate("openInbox('t')"); await S.wait_for_timeout(200)
            st=await S.evaluate("document.getElementById('exNBody').innerText")
            check('B15 Payroll: punch fix waiting for approval shows in My Tasks', 'Waiting for my approval' in st and 'Carlos' in st, st[:300])
            await M.evaluate("openInbox('t')"); await M.wait_for_timeout(150)
            check('B16 Material office: open material requests to handle', 'Material to handle' in await M.evaluate("document.getElementById('exNBody').innerText"))
            await close_all(J); await close_all(S); await close_all(M)
            await O.evaluate("goTab('more')"); await O.wait_for_timeout(200)
            check('B17 "My Tasks & Notifications" reachable from More', await O.evaluate("!!document.getElementById('exMoreMine')"))
            # service worker: the tap opens the alert id
            sw=open(os.path.join(os.environ['APPROOT'],'sw.js')).read()
            check('B18 phone notification carries the alert id and opens #n=<id>', "'#n='" in sw and 'data:{id:d.id' in sw)

            # ════════ 5. job fields start blank ════════
            await O.evaluate("openJob()"); await O.wait_for_timeout(100)
            st=await O.evaluate("(()=>{const s=document.getElementById('jSite');return {v:s.value,inp:s._jp.inp.value,ph:s._jp.inp.placeholder,hidden:s.classList.contains('exjp-sel')?'none':'shown'}})()")
            check('J1 new task: job field empty, "Search or select a job"', st['v']=='' and st['inp']=='' and st['ph']=='Search or select a job' and st['hidden']=='none', st)
            await O.click('#m-job .exjp input'); await O.keyboard.type('viola'); await O.wait_for_timeout(150)
            first=await O.evaluate("document.querySelector('#m-job .exjp-it[data-i]').innerText")
            await O.keyboard.press('Enter'); await O.wait_for_timeout(100)
            v=await O.evaluate("document.getElementById('jSite').value"); vn=await O.evaluate("siteName(document.getElementById('jSite').value)")
            check('J2 tap, type "viola", Enter → that job is selected', 'Viola' in first and 'Viola' in vn, [first,vn])
            await O.evaluate("const a=document.getElementById('jSite')._jp;a.inp.value='';a.inp.focus()"); await O.keyboard.type('violla rd'); await O.wait_for_timeout(150)
            check('J3 typo "violla rd" still finds it', 'Viola' in await O.evaluate("(document.querySelector('#m-job .exjp-it[data-i]')||{}).innerText||''"))
            await O.evaluate("const a=document.getElementById('jSite')._jp;a.inp.value='';a.inp.focus()"); await O.keyboard.type('254 union'); await O.wait_for_timeout(150)
            check('J4 search by address with house number', (await O.evaluate("(document.querySelector('#m-job .exjp-it[data-i]')||{}).innerText||''")).startswith('254 Union'))
            await close_all(O)
            # editing keeps the job; new is blank
            await O.evaluate("openPunchEdit(D.punches.findIndex(p=>p.id==='p_carlos1'))")
            check('J5 editing an existing punch keeps its job', await O.evaluate("document.getElementById('peSite').value")=='t32'); await close_all(O)
            await O.evaluate("openPunchEdit(null)")
            check('J6 adding a missed punch starts blank', await O.evaluate("document.getElementById('peSite').value")==''); await close_all(O)
            await O.evaluate("openSvc(D.tickets[0].id)")
            check('J7 editing a service call keeps its job/address', await O.evaluate("document.getElementById('svSite').value")==await O.evaluate("D.tickets[0].site||''")); await close_all(O)
            # required jobs can't be saved empty
            await O.evaluate("window._t=[];openEst();document.getElementById('esText').value='Add 2 outlets';const n0=D.ests.length;saveEst();window._n=D.ests.length-n0")
            check('J8 estimate request without a job is not saved ("Pick the job")', await O.evaluate("window._n")==0 and 'Pick the job' in await O.evaluate("window._t.join('|')"))
            await O.evaluate("EX_jobPick(document.getElementById('esSite')).pick('t32');const n0=D.ests.length;saveEst();window._n=D.ests.length-n0")
            check('J9 after picking the job it saves with that job', await O.evaluate("window._n")==1 and await O.evaluate("D.ests[0].site")=='t32'); await close_all(O)
            await C.evaluate("window._t=[];openFix();document.getElementById('fxIn').value='07:00';document.getElementById('fxWhy').value='x';const n0=D.fixes.length;sendFix();window._n=D.fixes.length-n0")
            check('J10 punch fix request without a job is not sent', await C.evaluate("window._n")==0); await close_all(C)
            await M.evaluate("window._t=[];openPickup();puLines=[{id:'s_lb240',name:'x',unit:'pc',qty:1}];window._p=savePickup()")
            check('J11 garage take-out without a job is not saved', await M.evaluate("document.getElementById('puSite').value")=='' and 'Pick the job' in await M.evaluate("window._t.join('|')")); await close_all(M)
            await M.evaluate("window._t=[];openStockIn();siLines=[{id:'s_lb240',name:'x',unit:'pc',qty:1}];saveStockIn()")
            check('J12 put-back with no job and no supplier is not saved', 'Pick the job' in await M.evaluate("window._t.join('|')")); await close_all(M)
            # schedule "add a job"
            k=await O.evaluate("dkey(new Date(Date.now()+2*86400000))")
            await O.evaluate(f"goTab('sched');schedCrew='c2';openSlot('{k}')"); await O.wait_for_timeout(250)
            await O.evaluate("slotAddMode='menu';renderSlotEditor()"); await O.wait_for_timeout(100)
            check('J13 schedule "Add a job": job starts blank', await O.evaluate("document.getElementById('slotAddSite').value")=='')
            await O.evaluate("window._t=[];slotAddFull()")
            check('J14 schedule: "Full day" without a job is refused', 'Pick the job' in await O.evaluate("window._t.join('|')"))
            await O.evaluate("EX_jobPick(document.getElementById('slotAddSite')).pick('t49');slotAddMode='spec';renderSlotEditor()"); await O.wait_for_timeout(100)
            check('J15 schedule: the picked job is kept when switching to "Specific hours"', await O.evaluate("document.getElementById('slotAddSite').value")=='t49'); await close_all(O)
            # material request starts empty
            await J.evaluate("openMat()")
            check('J16 material request: job starts empty', await J.evaluate("document.getElementById('mtSite').value===''&&document.getElementById('mtSiteFind').value===''")); await close_all(J)
            # suggestions: today's job one tap away
            await J.evaluate("openFix()"); await J.click('#m-fix .exjp input'); await J.wait_for_timeout(150)
            sug=await J.evaluate("[...document.querySelectorAll('#m-fix .exjp-gh')].map(x=>x.textContent).join('|')")
            check('J17 empty field offers "Your job today" first (one tap, never auto-filled)', 'Your job today' in sug and await J.evaluate("document.getElementById('fxSite').value")=='', sug); await close_all(J)
            # words in a typed task offer a job, never pick it silently
            await O.evaluate("openJob();document.getElementById('jDesc').value='Go to 69 Viola Rd in Monsey and fix the light';document.getElementById('jDesc').dispatchEvent(new Event('blur'))"); await O.wait_for_timeout(250)
            check('J18 a job named in the text is offered, not selected', await O.evaluate("document.getElementById('jSite').value")=='' and await O.evaluate("!!document.querySelector('#m-job .exjp-sug button')")); await close_all(O)
            # mobile layout: list stays on screen
            await O.evaluate("openJob()"); await O.click('#m-job .exjp input'); await O.wait_for_timeout(120)
            bb=await O.evaluate("(()=>{const r=document.querySelector('#m-job .exjp-list').getBoundingClientRect();return {l:r.left,r:r.right,w:innerWidth}})()")
            check('J19 the job list fits the phone screen', bb['l']>=0 and bb['r']<=bb['w']+1, bb); await close_all(O)

            # ── no errors anywhere ──
            for nm,e in [('owner',eO),('Jon',eJ),('Shia',eS),('Yossi',eY),('Carlos',eC),('Menachem',eM),('Pedro',eP)]:
                check(f'no page errors: {nm}', not e, e[:3])
            await b.close()
    finally: sp.kill()
    print(sum(1 for r in R if r[0]),'passed,',sum(1 for r in R if not r[0]),'failed')
asyncio.run(run())
