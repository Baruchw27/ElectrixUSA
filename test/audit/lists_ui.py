"""L2 — shared lists on real roles: Baruch (owner), Menachem (Material office), Carlos (worker), Jon (crew leader, not on
the lists). Note → punch list, assign, complete, permissions, material list edited after sending by the sender and the
office at the same time (different items merge; the same item → both versions kept and flagged), an offline edit
that syncs later, tapping a notification opens the list, line breaks / spacing kept. Every check reads the SERVER copy
unless it is about the screen."""
import sys,os
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','sched'))
from suite import *
def rec(coll,i):
    r=[x for x in srv('/__records?coll='+coll) if x['id']==i]; return r[0]['data'] if r and not r[0]['deleted'] else None
def items(d): return sorted([(k,v) for k,v in (d or {}).items() if k.startswith('li_') and '~' not in k and isinstance(v,dict)],key=lambda kv:(kv[1].get('ord',0)))
async def run():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            ph={}
            for who,kind in [('Baruch','desktop'),('Menachem','android'),('Carlos','iphone'),('Jon','android')]:
                c,P,e,ok=await login(b,who,'Testpass123',kind); await ready(P); await settle(P); ph[who]=(c,P,e); check(f'{who} signed in ({kind})',ok)
            B,M,C,J=[ph[n][1] for n in ['Baruch','Menachem','Carlos','Jon']]
            # ── 1. note → punch list ──
            body="Kitchen punch\n  - fix   GFCI by sink\n\n  - test panel (2nd floor)"
            nid_=await B.evaluate(f"(()=>{{openKeep();kNew('text');const n=kGet();n.title='Kitchen';n.body={body!r};kTouch();kRender();return n.id;}})()".replace("{body!r}",repr(body)))
            await settle(B)
            btn=await B.evaluate("(document.getElementById('kPunchBtn')||{}).textContent||''")
            check('the note shows "Convert to Punch List" to its creator','Convert to Punch List' in btn,btn)
            await B.evaluate("kToPunch()"); await B.wait_for_timeout(200); await settle(B)
            pid=await B.evaluate("liCur&&liCur.id")
            d=rec('keep',pid); its=items(d)
            check('punch list saved on the server with one item per non-blank line (3)',d and d.get('type')=='punch' and len(its)==3,[v.get('t') for k,v in its])
            check('… text kept exactly as typed (spaces kept)',[v.get('t') for k,v in its]==['Kitchen punch','  - fix   GFCI by sink','  - test panel (2nd floor)'],[v.get('t') for k,v in its])
            n0=rec('keep',nid_)
            check('… the original note is kept unchanged and both are linked',n0 and n0.get('body')==body and n0.get('punch')==pid and d.get('src')==nid_)
            check('… the list screen opened, showing the text with its spacing',await B.evaluate("[...document.querySelectorAll('#liBox textarea.litx')].map(x=>x.value).join('|')")=='Kitchen punch|  - fix   GFCI by sink|  - test panel (2nd floor)')
            # ── 2. assign item 2 to Carlos ──
            k2=its[1][0]
            await B.evaluate(f"liAssign('keep','{pid}','{k2}','u7')"); await settle(B)
            check('owner assigns an item to Carlos → server lists Carlos as assignee','u7' in (rec('keep',pid) or {}).get('assign',[]),(rec('keep',pid) or {}).get('assign'))
            ok=await until(C,f"(D.keep||[]).some(n=>n.id==='{pid}')",10000)
            check('Carlos now has the punch list on his phone',ok)
            check('… it shows among his notes',await C.evaluate(f"kMine().some(n=>n.id==='{pid}')"))
            check('Jon (crew leader, not on the list) does not get it',not await J.evaluate(f"(D.keep||[]).some(n=>n.id==='{pid}')"))
            await C.evaluate(f"openList('keep','{pid}')"); await C.wait_for_timeout(150)
            st=await C.evaluate(f"[...document.querySelectorAll('#liBox .lirow')].map(r=>[r.dataset.k,!r.querySelector('input[type=checkbox]').disabled,!!r.querySelector('textarea')])")
            check('Carlos can tick only his own item and cannot edit the text',all((ok_ == (k==k2)) and not ta for k,ok_,ta in st),st)
            await C.evaluate(f"liTick('keep','{pid}','{k2}',true)"); await settle(C)
            v=(rec('keep',pid) or {}).get(k2,{})
            check('Carlos marks his item complete → saved on the server, by him',v.get('done') is True and v.get('doneBy')=='u7',v)
            await C.evaluate(f"(()=>{{const r=liRec('keep','{pid}');liSet(r,'{its[0][0]}',{{t:'hacked'}});liTouch('keep',r);}})()"); await settle(C); await C.wait_for_timeout(500)
            check('… if his phone tries to change someone else\'s item the server refuses it (text unchanged)',(rec('keep',pid) or {}).get(its[0][0],{}).get('t')=='Kitchen punch')
            await until(B,f"(liRec('keep','{pid}')||{{}})['{k2}']&&liRec('keep','{pid}')['{k2}'].done===true",10000)
            await B.evaluate(f"liDraw()")
            check('Baruch sees it completed (in the completed section)',await B.evaluate("document.getElementById('liBox').innerText.includes('completed')"))
            await B.evaluate("liClose()")
            # ── 3. material list: Carlos sends, Baruch sends it on to Menachem, both edit after sending ──
            await C.evaluate("liClose();goTab('mat');openMat()"); await C.wait_for_timeout(200)
            await C.evaluate("document.getElementById('mtSite').value='t32';document.getElementById('mtItems').value='25x Regular Switches\\n\\n15x 3-Way Switches\\n10x 20 Amp Outlets';saveMat()"); await settle(C)
            mid=await C.evaluate("D.mats[0].id")
            md=rec('mats',mid); mi=items(md)
            check('material list sent: 3 items with their quantities',[(v.get('q'),v.get('t')) for k,v in mi]==[('25','Regular Switches'),('15','3-Way Switches'),('10','20 Amp Outlets')],[(v.get('q'),v.get('t')) for k,v in mi])
            check('… the text as typed is kept too (blank line included)',md.get('items','').startswith('25x Regular Switches\n\n15x'),md.get('items'))
            await until(B,f"D.mats.some(x=>x.id==='{mid}')",10000)
            await B.evaluate(f"goTab('mat');renderMat();openList('mats','{mid}');liSendTo('mats','{mid}','o2')"); await settle(B)
            check('Baruch sends it to Menachem',(rec('mats',mid) or {}).get('to')=='o2')
            await until(M,f"D.mats.some(x=>x.id==='{mid}'&&x.to==='o2')",10000)
            await M.evaluate(f"goTab('mat');renderMat();openList('mats','{mid}')"); await M.wait_for_timeout(150)
            check('Menachem can edit it (quantity boxes shown)',await M.evaluate("document.querySelectorAll('#liBox .liq').length")==3)
            k1,kb,kc=mi[0][0],mi[1][0],mi[2][0]
            # different items at the same moment → both kept
            await asyncio.gather(B.evaluate(f"liQty('mats','{mid}','{k1}','30')"),
                                 M.evaluate(f"(()=>{{liText('mats','{mid}','{kb}','3-Way Switches (Leviton)');document.getElementById('liNew').value='5x GFCI Outlets';liAddLines('mats','{mid}');}})()"))
            await settle(B); await settle(M); await asyncio.sleep(1.5); await settle(B); await settle(M)
            md=rec('mats',mid); mi2=items(md)
            check('two phones editing different items at once: both changes kept',md[k1].get('q')=='30' and md[kb].get('t')=='3-Way Switches (Leviton)' and any(v.get('t')=='GFCI Outlets' and v.get('q')=='5' for k,v in mi2),[(v.get('q'),v.get('t')) for k,v in mi2])
            await until(B,f"(liRec('mats','{mid}')||{{}})['{kb}']&&liRec('mats','{mid}')['{kb}'].t==='3-Way Switches (Leviton)'",10000)
            await until(M,f"(liRec('mats','{mid}')||{{}})['{k1}']&&liRec('mats','{mid}')['{k1}'].q==='30'",10000)
            check('… and each phone shows the other\'s change',await B.evaluate(f"liItems(liRec('mats','{mid}')).length")==4 and await M.evaluate(f"liRec('mats','{mid}')['{k1}'].q")=='30')
            # the same item at the same moment → nothing lost, flagged
            await until(B,f"liRec('mats','{mid}')['{k1}'].rev===(+(liRec('mats','{mid}')['{k1}'].rev))&&!('base' in liRec('mats','{mid}')['{k1}'])",8000)
            await until(M,f"!('base' in liRec('mats','{mid}')['{k1}'])&&liRec('mats','{mid}')['{k1}'].rev===2",8000)
            await asyncio.gather(B.evaluate(f"liQty('mats','{mid}','{k1}','40')"),M.evaluate(f"liQty('mats','{mid}','{k1}','35')"))
            await settle(B); await settle(M); await asyncio.sleep(1.5); await settle(B); await settle(M)
            md=rec('mats',mid); cps=[v for k,v in md.items() if k.startswith(k1+'~')]
            vals=sorted([md[k1].get('q')]+[c.get('q') for c in cps])
            check('the same item changed on two phones at once: both values are kept (one in place, one flagged)',vals==['35','40'] and len(cps)==1 and cps[0].get('conflict') is True,(md[k1],cps))
            ok=await until(B,"(liDraw(),document.querySelectorAll('#liBox .licf').length===1)",10000) and await until(M,"(liDraw(),document.querySelectorAll('#liBox .licf').length===1)",10000)
            check('… both phones show the clash so someone can pick the right one',ok)
            nr=[await P.evaluate("!(D.rejq||[]).some(x=>JSON.stringify(x).includes('"+mid+"'))&&!EX_SYNC.pending") for P in (B,M)]
            check('… and neither phone is told its save was refused (nothing set aside, nothing stuck)',all(nr),nr)
            pick=cps[0].get('q')
            await M.evaluate(f"(()=>{{const r=liRec('mats','{mid}');const ck=Object.keys(r).find(k=>k.indexOf('{k1}~')===0);liUseCopy('mats','{mid}',ck);}})()"); await settle(M)
            md=rec('mats',mid)
            check('… "Use this one" puts that value in place and clears the flag',md[k1].get('q')==pick and all(v.get('gone') for k,v in md.items() if k.startswith(k1+'~')),md[k1])
            check('no item was ever lost (4 items on the server)',len([1 for k,v in items(md) if not v.get('gone')])==4)
            # ── 4. offline edit on Menachem's phone, then it syncs ──
            cM=ph['Menachem'][0]
            await cM.set_offline(True); await M.evaluate("window.EX_SYNC&&(EX_SYNC.online=false);0")
            await M.evaluate(f"liQty('mats','{mid}','{kc}','12')"); await M.wait_for_timeout(800)
            check('offline: the change waits on the phone (server still 10)',(rec('mats',mid) or {}).get(kc,{}).get('q')=='10')
            await cM.set_offline(False); await M.evaluate("window.EX_SYNC&&(EX_SYNC.online=true);try{window.dispatchEvent(new Event('online'))}catch(e){};0")
            ok=False
            for _ in range(30):
                await asyncio.sleep(0.5)
                if (rec('mats',mid) or {}).get(kc,{}).get('q')=='12': ok=True; break
            check('… back online it reaches the server (12)',ok,(rec('mats',mid) or {}).get(kc))
            await settle(M)
            check('… and nothing is left waiting or set aside as refused',await M.evaluate("!EX_SYNC.pending&&!(D.rejq||[]).some(x=>JSON.stringify(x).includes('"+mid+"'))"))
            # ── 5. a worker who is not on the material list cannot change it ──
            await J.evaluate(f"(()=>{{const r=liRec('mats','{mid}');if(!r)return;liSet(r,'{k1}',{{q:'999'}});save();}})()"); await settle(J); await J.wait_for_timeout(500)
            check('Jon (not on the material list) cannot change it',(rec('mats',mid) or {}).get(k1,{}).get('q')!='999')
            # ── 6. tapping a notification opens the right list ──
            await M.evaluate("liClose()")
            await M.evaluate(f"(()=>{{D.inbox.unshift({{id:'nL2m',to:me().id,msg:'📦 Materials: Baruch: + x',kind:'info',ts:Date.now(),read:false,link:{{mat:'{mid}'}}}});openFromPush('nL2m');}})()"); await M.wait_for_timeout(200)
            check('tapping a material-list message opens that list',await M.evaluate(f"!document.getElementById('m-list').classList.contains('hid')&&liCur&&liCur.id==='{mid}'"))
            await C.evaluate("liClose()")
            await C.evaluate(f"(()=>{{D.inbox.unshift({{id:'nL2k',to:me().id,msg:'📋 Kitchen: Baruch: + x',kind:'info',ts:Date.now(),read:false,link:{{keep:'{pid}'}}}});openFromPush('nL2k');}})()"); await C.wait_for_timeout(200)
            check('tapping a punch-list message opens that punch list',await C.evaluate(f"!document.getElementById('m-list').classList.contains('hid')&&liCur&&liCur.id==='{pid}'"))
            # ── 7. formatting in the material card ──
            await B.evaluate("liClose();goTab('mat');renderMat()"); await B.wait_for_timeout(150)
            txt=await B.evaluate("document.getElementById('matList').innerText")
            check('material card shows one line per item with its quantity',all(s in txt for s in ['Regular Switches','3-Way Switches (Leviton)','20 Amp Outlets','GFCI Outlets']),txt[:300])
            # Spanish
            await C.evaluate("ES&&0")
            check('Spanish wording present',await C.evaluate("ES['Convert to Punch List']==='Convertir en lista de pendientes'&&ES['Material list']==='Lista de material'"))
            for n in ph: check(f'no page errors ({n})',not ph[n][2],ph[n][2][:3])
            await b.close()
    finally:
        sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
asyncio.run(run())
