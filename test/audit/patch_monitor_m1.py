"""M1 — automatic error monitoring (app side). Goes with db/audit_m1_monitoring.sql.
Every phone keeps a short list of its own problems (app crashes, saves the server refused, stock moves set aside,
changes stuck unsent for more than 6 hours) and sends it to the server every 2 minutes when online; the owner gets one
morning summary when anything went wrong. Nothing personal is sent: the error text, the screen file/line, the app
version and the phone type."""
import sys,os
root=sys.argv[1]
def patch(fn,pairs):
    p=os.path.join(root,fn);s=open(p).read()
    for a,b in pairs:
        assert s.count(a)==1,(fn,a[:100],s.count(a));s=s.replace(a,b)
    open(p,'w').write(s);print('ok',p)
patch('extras.js',[("""// ---------- phone notifications ----------""","""// ---------- automatic error reports (M1) ----------
(function(){const KB='ex_errbuf';const VER=((document.querySelector('script[src*="sync.js"]')||{}).src||'').split('?')[1]||'';
  const buf=()=>{try{const a=JSON.parse(localStorage.getItem(KB)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}};
  const put=a=>{try{localStorage.setItem(KB,JSON.stringify(a.slice(-50)));}catch(e){}};
  window.EX_report=function(kind,msg,src){try{msg=String(msg||'').slice(0,500);if(!msg)return;const a=buf();const k=kind+'|'+msg;const x=a.find(y=>y.k===k);
    if(x){x.n=(x.n||1)+1;x.last=Date.now();}else a.push({k,kind,msg,src:String(src||'').slice(0,200),n:1,at:Date.now()});put(a);}catch(e){}};
  window.EX_errBuf=buf;
  window.addEventListener('error',e=>{const m=(e&&e.message)||'';if(!m||/ResizeObserver|^Script error\\.?$/.test(m))return;EX_report('error',m,String(e.filename||'').split('/').pop().split('?')[0]+':'+(e.lineno||''));});
  window.addEventListener('unhandledrejection',e=>{const r=e&&e.reason;const m=(r&&(r.message||String(r)))||'';if(!m||/AbortError|NetworkError|Failed to fetch|Load failed|timeout|offline/i.test(m))return;EX_report('error','(async) '+m,'');});
  window.addEventListener('ex-rejected',e=>{const rows=(e.detail&&e.detail.rows)||[];if(rows.length)EX_report('refused','server refused a save: '+[...new Set(rows.map(r=>r.coll))].join(', '),'');});
  // changes waiting more than 6 hours while the phone is online = stuck (reported once)
  setInterval(()=>{try{const s=window.EX_SYNC||{};const now=Date.now();let since=+localStorage.getItem('ex_pend_since')||0;
    if(s.pending>0){if(!since){since=now;localStorage.setItem('ex_pend_since',String(now));}
      if(s.online&&now-since>6*3600000&&!localStorage.getItem('ex_stuck_rep')){EX_report('stuck','changes waiting '+Math.round((now-since)/3600000)+' h ('+s.pending+'), last error: '+(s.err||'-'),'');localStorage.setItem('ex_stuck_rep','1');}}
    else{if(since)localStorage.removeItem('ex_pend_since');localStorage.removeItem('ex_stuck_rep');}}catch(e){}},60000);
  async function send(){try{const a=buf();if(!a.length||!window.EX_sb||!(window.EX_SYNC&&EX_SYNC.online)||!(typeof me==='function'&&me()))return;
    const part=a.slice(0,20);const r=await EX_sb.rpc('log_client_errors',{p_rows:part.map(x=>({kind:x.kind,msg:x.msg,src:x.src,n:x.n,ver:VER,ua:navigator.userAgent.slice(0,120)}))});
    if(r&&!r.error){const sent=new Set(part.map(x=>x.k));put(buf().filter(x=>!sent.has(x.k)));}}catch(e){}}
  window.EX_sendErrors=send;setInterval(send,120000);setTimeout(send,20000);
})();

// ---------- phone notifications ----------""")])
patch('index.html',[("""          stockOutcomes[txn.id]={status:'rejected',reason:perm};""","""          stockOutcomes[txn.id]={status:'rejected',reason:perm};try{window.EX_report&&EX_report('stock',perm,txn.kind);}catch(e){}""")])
