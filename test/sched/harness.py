import asyncio, json, subprocess, time, urllib.request, urllib.parse, os, sys
from playwright.async_api import async_playwright
HERE=os.path.dirname(os.path.abspath(__file__))
APP=os.path.abspath(os.environ.get('APPROOT',os.path.join(HERE,'..','..'))); PORT=int(os.environ.get('PORT','8791')); BASE=f'http://localhost:{PORT}'
FAKE=open(os.path.join(HERE,'fakeclient_sched.js')).read()
CFG=f"window.EX_CFG={{url:'{BASE}',anonKey:'test',debug:false,trello:false,ai:false,vapid:'BBBB'}};"
R=[]
def check(name,cond,extra=''):
    R.append((bool(cond),name,extra)); print(('  ✓ ' if cond else '  ✗ ')+name+('' if cond else '  '+str(extra)[:400]),flush=True)
def srv(path): return json.loads(urllib.request.urlopen(BASE+path).read())
def srvpost(path,obj):
    rq=urllib.request.Request(BASE+path,data=json.dumps(obj).encode(),headers={'Content-Type':'application/json'});return json.loads(urllib.request.urlopen(rq).read())
VIEW={'iphone':dict(viewport={'width':390,'height':844},user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Mobile/15E148 Safari/604.1',is_mobile=True,has_touch=True),
      'android':dict(viewport={'width':412,'height':915},user_agent='Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36',is_mobile=True,has_touch=True),
      'desktop':dict(viewport={'width':1366,'height':900})}
for _v in VIEW.values(): _v['timezone_id']='America/New_York'   # the company's time zone (DST changes matter for hours)
async def phone(b,name,kind='iphone',appfile='index.html'):
    ctx=await b.new_context(service_workers='block',permissions=['geolocation'],geolocation={'latitude':41.1287,'longitude':-74.1046,'accuracy':8},**VIEW[kind])
    pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(name+': '+str(e)))
    async def route(r):
        u=r.request.url
        if 'supabase-js' in u: return await r.fulfill(status=200,content_type='application/javascript',body=FAKE)
        if u.endswith('/config.js') or '/config.js?' in u: return await r.fulfill(status=200,content_type='application/javascript',body=CFG)
        if u.startswith(BASE): return await r.continue_()
        return await r.abort()
    await pg.route('**/*',route)
    await pg.goto(BASE+'/'+appfile); await pg.wait_for_timeout(900)
    await pg.add_init_script("""window.addEventListener('load',()=>{try{window._t=window._t||[];window.__reloads=(+sessionStorage.getItem('__rl')||0)+1;sessionStorage.setItem('__rl',window.__reloads);const ot=toast;toast=function(a,c){_t.push(String(a));return ot.apply(this,arguments)};window._c=[];if(window._autoYes===undefined)window._autoYes=true;askConfirm=function(m,yes,l){_c.push(String(m));if(window._autoYes){yes&&yes();}else{window._pendingYes=yes;}};}catch(e){}});""")
    await pg.reload(); await pg.wait_for_timeout(900)
    return ctx,pg,errs
async def until(pg,js,ms=6000):
    t0=time.time()
    while time.time()-t0<ms/1000:
        try:
            if await pg.evaluate(js): return True
        except Exception: pass
        await asyncio.sleep(0.15)
    return False
def start_server():
    env=dict(os.environ,APPROOT=APP)
    sp=subprocess.Popen(['node',os.path.join(HERE,'fakeserver_sched.js'),str(PORT)],env=env); time.sleep(0.8); return sp
async def setup_owner(b,kind='iphone'):
    ca,A,ea=await phone(b,'owner',kind)
    await A.evaluate("askPrompt=(t,f,cb)=>cb(['ownerpass1','clean']);0"); await A.evaluate("exSetup()")
    ok=await until(A,"document.getElementById('m-login').classList.contains('hid')&&me()&&me().role==='owner'",10000)
    await until(A,"fetch('/__state').then(r=>r.json()).then(s=>s.records>200)",15000)
    await until(A,"(D.keep||[]).some(n=>/Team passwords/.test(n.title||''))",20000)
    note=await A.evaluate("(D.keep||[]).find(n=>/Team passwords/.test(n.title||''))?.body||''")
    pw={l.split(': ')[0]:l.split(': ')[1] for l in note.split('\n') if ': ' in l}
    await until(A,"(localStorage.getItem('ex_queue')||'{}')==='{}'",15000)
    return ca,A,ea,pw,ok
async def login(b,name,pw,kind='iphone'):
    c,P,e=await phone(b,name,kind)
    await P.fill('#lgUser',name); await P.fill('#lgPass',pw); await P.evaluate("doLogin()")
    ok=await until(P,"document.getElementById('m-login').classList.contains('hid')&&me()",10000)
    await until(P,"EX_ready&&EX_ready()",10000)
    return c,P,e,ok
SEED_JS="""(()=>{const cr=[['c1','Crew 1 Jon','rough'],['c2','Crew 2 Brian','rough'],['c3','Crew 3 Christian','finish'],['c4','Crew 4 Fernando','finish'],['c5','Crew 5 Mario','rough']];
 cr.forEach(([id,name,type])=>{if(!D.crews.find(c=>c.id===id))D.crews.push({id,name,type});});
 for(let i=1;i<=40;i++){const id='t'+i;if(!D.sites.find(s=>s.id===id))D.sites.push({id,name:i+' Test St, Monsey',addr:i+' Test St, Monsey NY',stage:'active',notes:[]});}
 const names=['Jon','Brian','Christian','Fernando','Mario','Luis','Pedro','Jose','Carlos','Juan'];
 names.forEach((n,i)=>{if(!D.emps.find(e=>e.name===n))D.emps.push({id:'w'+(i+1),name:n,role:'worker',crew:'c'+((i%5)+1),phone:'',lead:i<5});});
 save();return D.crews.length+'/'+D.sites.length+'/'+D.emps.length;})()"""
