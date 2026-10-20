"""Schedule v2.1 — extra checks: closing the app, sign-out / switching people on one phone, copy never deletes or
changes anything it shouldn't, moving employees between jobs (and what the worker then sees)."""
from suite import *   # helpers (harness, seed, sched(), sites_of(), …)
async def relaunch(ctx,P):
    """close the app and open it again on the same phone (same storage)"""
    await P.close(); Q=await ctx.new_page(); errs=[]; Q.on('pageerror',lambda e:errs.append(str(e)))
    async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE)
        if u.endswith('/config.js') or '/config.js?' in u: return await r.fulfill(status=200,content_type='application/javascript',body=CFG)
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
    await Q.route('**/*',route); await Q.goto(BASE+'/index.html'); await Q.wait_for_timeout(900); return Q,errs
async def run2():
    sp=start_server()
    try:
        srvpost('/__seed',SEED)
        async with async_playwright() as p:
            b=await p.chromium.launch()
            ca,A,ea,_=await login(b,'Baruch','Testpass123','iphone'); await ready(A)
            cb,B,eb,_=await login(b,'Yossi','Testpass123','android'); await ready(B)
            # ── F. closing the app / sign-out / switching people ──
            print('F. close, sign out, switch person')
            k=await day(A,50)
            await ca.set_offline(True); await A.evaluate("window.dispatchEvent(new Event('offline'))")
            await open_day(A,'c1',k); await add_full(A,'t32'); await tap_save(A); await A.wait_for_timeout(400)
            await ca.set_offline(False); net('refuse')   # (the page itself must load; the server stays unreachable)
            A,ea2=await relaunch(ca,A); await A.wait_for_timeout(500); net('ok')
            await until(A,"EX_ready&&EX_ready()",20000); await settle(A,15000)
            check('saved offline, app closed, reopened online → reaches the server',sched(f'c1|{k}') is not None)
            # sign out with unsent work, then the SAME person signs back in
            k=await day(A,51)
            net('refuse')   # no signal (the page itself still opens, like the installed app does)
            await open_day(A,'c2',k); await add_full(A,'t150'); await tap_save(A); await A.wait_for_timeout(16000)
            await A.evaluate("hide('m-ask');signOut()"); await A.wait_for_timeout(1500); await until(A,"!!document.getElementById('m-login')",10000)
            check('sign out while offline with an unsent booking → signed out (kept, encrypted)',await A.evaluate("!document.getElementById('m-login').classList.contains('hid')"))
            check('… not sent to the server yet',sched(f'c2|{k}') is None)
            net('ok')
            # a DIFFERENT person signs in on this phone first: must not send Baruch's booking as theirs
            await A.fill('#lgUser','Yossi'); await A.fill('#lgPass','Testpass123'); await A.evaluate("doLogin()")
            await until(A,"document.getElementById('m-login').classList.contains('hid')&&me()&&me().name==='Yossi'",10000); await ready(A); await settle(A,8000)
            check("another person signing in on the same phone does NOT send Baruch's unsent booking",sched(f'c2|{k}') is None)
            check("… and does not see it",not await A.evaluate(f"!!D.sched['c2|{k}']"))
            await A.evaluate("signOut()"); await A.wait_for_timeout(1500); await until(A,"!!document.getElementById('lgUser')",10000)
            await A.fill('#lgUser','Baruch'); await A.fill('#lgPass','Testpass123'); await A.evaluate("doLogin()")
            await until(A,"document.getElementById('m-login').classList.contains('hid')&&me()&&me().name==='Baruch'",10000); await ready(A); await settle(A,10000)
            d=sched(f'c2|{k}'); pays=[x for x in srv('/__payloads') for r in x['rows'] if r['id']==f'c2|{k}']
            check('Baruch signs back in → his booking is sent, as Baruch',d is not None and all(x['who'].startswith('u1@') for x in pays),pays[:1])
            # same person, two devices
            k=await day(A,52)
            await open_day(A,'c3',k); await add_full(A,'t27'); await tap_save(A); await settle(A)
            c3,A2,e3,_=await login(b,'Baruch','Testpass123','desktop'); await ready(A2)
            check('switch to desktop → the booking is there',await A2.evaluate(f"sig=effectiveAsgs('c3','{k}').map(a=>a.site).join();sig==='t27'"))
            await open_day(A2,'c3',k); await A2.evaluate("slotSet(0,'site','t49')"); await tap_save(A2); await settle(A2)
            check('edit on desktop → phone shows the edit',await until(A,f"effectiveAsgs('c3','{k}').map(a=>a.site).join()==='t49'",8000))
            await c3.close()
            # refresh right after "Saved"
            k=await day(A,53); await open_day(A,'c4',k); await add_full(A,'t70'); await clear_toasts(A); await tap_save(A)
            await until(A,"(window._t||[]).some(x=>/Saved/.test(x))",15000); await A.reload(); await ready(A)
            check('refresh right after "Saved" → still there (from the server)',await A.evaluate(f"effectiveAsgs('c4','{k}').map(a=>a.site).join()==='t70'") and sched(f'c4|{k}') is not None)

            # ── G. copy never deletes / changes what it shouldn't ──
            print('G. copy safety')
            src=await day(A,60); t1=await day(A,61); t2=await day(A,62)
            await open_day(A,'c1',src); await add_full(A,'t32'); await tap_save(A); await settle(A)
            await open_day(A,'c2',t1); await add_full(A,'t150'); await tap_save(A); await settle(A)      # another crew on a target day
            await A.evaluate(f"openLoan('{t1}','u10')"); await A.select_option('#loanSite','t54'); await A.click("#m-loan button.btn"); await settle(A)
            before_src=json.dumps(sched(f'c1|{src}'),sort_keys=True); before_c2=json.dumps(sched(f'c2|{t1}'),sort_keys=True); before_loan=json.dumps(sched(f'L:u10|{t1}'),sort_keys=True)
            n0=len(srv('/__payloads'))
            await open_day(A,'c1',src); await A.click("#slotBody button:has-text('Copy day')"); await A.wait_for_timeout(200)
            for x in (t1,t2): await A.click(f"#askBody [data-k='{x}']")
            await A.click('#askOk'); await settle(A)
            check('copy one crew: source day unchanged',json.dumps(sched(f'c1|{src}'),sort_keys=True)==before_src)
            check("… other crews on the target day unchanged",json.dumps(sched(f'c2|{t1}'),sort_keys=True)==before_c2)
            check("… people moves on the target day unchanged",json.dumps(sched(f'L:u10|{t1}'),sort_keys=True)==before_loan)
            check('… copied to both days',sites_of(sched(f'c1|{t1}'))==sites_of(sched(f'c1|{src}'))==sites_of(sched(f'c1|{t2}')))
            sent=[r for x in srv('/__payloads')[n0:] for r in x['rows']]
            check('… nothing was deleted (no delete sent)',not any(r.get('deleted') for r in sent),[r['id'] for r in sent if r.get('deleted')])
            check('… only the two new days were written',sorted(r['id'] for r in sent)==sorted([f'c1|{t1}',f'c1|{t2}']),[r['id'] for r in sent])
            # whole-day copy onto a day booked for some crews: "only fill empty" must not send anything for booked crews
            w=await day(A,63)
            await open_day(A,'c2',w); await add_full(A,'t27'); await tap_save(A); await settle(A)
            keep_c2=json.dumps(sched(f'c2|{w}'),sort_keys=True); n0=len(srv('/__payloads'))
            await A.evaluate(f"schedView='today';boardDay={await A.evaluate(f'Math.round((new Date(\"{w}T12:00\")-new Date(new Date().setHours(12,0,0,0)))/864e5)')};renderSched()")
            await A.evaluate(f"EX_copyDay('{t1}',['{w}'],D.crews.map(c=>c.id),true)"); await A.wait_for_timeout(300)
            await A.click("#askBody button:has-text('Only fill what is empty')"); await settle(A)
            sent=[r for x in srv('/__payloads')[n0:] for r in x['rows']]
            check('"only fill empty": booked crew untouched and never sent',json.dumps(sched(f'c2|{w}'),sort_keys=True)==keep_c2 and not any(r['id']==f'c2|{w}' for r in sent),[r['id'] for r in sent])
            check('"only fill empty": empty crew and the person move were filled',sched(f'c1|{w}') is not None and sched(f'L:u10|{w}') is not None)
            # cancel really cancels
            n0=len(srv('/__payloads'))
            await A.evaluate(f"EX_copyDay('{t1}',['{w}'],D.crews.map(c=>c.id),true)"); await A.wait_for_timeout(300)
            if await modal_open(A,'m-ask'): await A.click("#askBody button:has-text('Cancel')")
            await A.wait_for_timeout(800)
            check('Cancel on the warning → nothing written',len(srv('/__payloads'))==n0)
            # a target day covered by an ongoing ("until reassigned") job counts as booked
            o=await day(A,70)
            await open_day(A,'c5',o); await A.evaluate("slotPickMode('menu');slotPickMode('ong')"); await A.select_option('#slotAddSite','t49'); await A.click("#slotBody button:has-text('Set ongoing')"); await settle(A)
            await A.evaluate("hide('m-slot')")
            wd=None
            for i in range(71,80):
                kk=await day(A,i)
                if await A.evaluate(f"[1,2,3,4,5].includes(new Date('{kk}T12:00').getDay())"): wd=kk; break
            s5=await day(A,69); await open_day(A,'c5',s5); await A.evaluate("slotOneoffs=[];renderSlotEditor()"); await add_full(A,'t32'); await tap_save(A); await settle(A)
            await A.evaluate(f"EX_copyDay('{s5}',['{wd}'],['c5'],false)"); await A.wait_for_timeout(300)
            check('a day covered by an ongoing job is treated as booked (warns)',await modal_open(A,'m-ask') and 'already booked' in (await A.evaluate("document.getElementById('askTitle').innerText")).lower())
            await A.click("#askBody button:has-text('Only fill what is empty')"); await settle(A)
            check('… "only fill empty" keeps the ongoing job there',await A.evaluate(f"effectiveAsgs('c5','{wd}').map(a=>a.site).join()")=='t49')

            # ── H. moving employees between jobs ──
            print('H. moves')
            m=await day(A,80)
            await open_day(A,'c1',m); await add_full(A,'t32'); await tap_save(A); await settle(A)
            await A.evaluate(f"openLoan('{m}','u7')"); await A.select_option('#loanSite','t70'); await A.fill('#loanStart','12:00'); await A.fill('#loanEnd','15:00'); await A.click("#m-loan button.btn"); await settle(A)
            r=sched(f'L:u7|{m}')
            check('move Carlos to another job for the afternoon → saved',r and r['assignments'][0]['site']=='t70' and r['assignments'][0]['start']==720 and r['assignments'][0]['end']==900,r)
            await A.evaluate(f"schedView='today';boardDay=80;renderSched()"); await A.wait_for_timeout(200)
            txt=await A.evaluate("document.getElementById('todayBoard').innerText")
            check('… the Day board lists the move',('Carlos' in txt and 'Individual moves' in txt),txt[-300:])
            await A.evaluate(f"openLoan('{m}','u7')"); await A.wait_for_timeout(100)
            check('… reopening shows the saved site and times',await A.evaluate("document.getElementById('loanSite').value==='t70'&&document.getElementById('loanStart').value==='12:00'&&document.getElementById('loanEnd').value==='15:00'"))
            await A.select_option('#loanSite','t54'); await A.click("#m-loan button.btn"); await settle(A)
            check('… change the move to another site → updated',sched(f'L:u7|{m}')['assignments'][0]['site']=='t54')
            cw,W,ew,okw=await login(b,'Carlos','Testpass123','iphone'); await ready(W)
            if okw:
                await W.evaluate(f"(()=>{{const d=new Date('{m}T12:00');const now=new Date();now.setHours(12,0,0,0);return 0}})()")
                vis=await W.evaluate(f"loansFor('u7','{m}').map(a=>a.site).join()")
                check("… Carlos's own phone has the move",vis=='t54',vis)
            await cw.close()
            await A.evaluate(f"clearLoanFor('u7','{m}')"); await A.wait_for_timeout(300)
            asked=await modal_open(A,'m-ask') and 'Remove this move' in await A.evaluate("document.getElementById('askTitle').innerText")
            check('… remove the move asks first',asked)
            if asked: await A.click('#askOk')
            await A.wait_for_timeout(300); await settle(A)
            check('… then removes it on the server',sched(f'L:u7|{m}') is None)
            # one person moved to two jobs at overlapping times → warned
            await A.evaluate(f"openLoan('{m}','u8')"); await A.select_option('#loanSite','t70'); await A.fill('#loanStart','09:00'); await A.fill('#loanEnd','11:00'); await A.click("#m-loan button.btn"); await settle(A)
            check('second person (Luis) moved → saved, Carlos unaffected',sched(f'L:u8|{m}') is not None and sched(f'L:u7|{m}') is None)
            errs=ea+ea2+eb+e3+ew
            check('no page errors',not errs,errs[:3])
            await b.close()
    finally: sp.kill()
    print(f"\n{sum(1 for x in R if x[0])} passed, {sum(1 for x in R if not x[0])} failed")
if __name__=='__main__': asyncio.run(run2())
