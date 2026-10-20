"""Bug sweep B1b — where put-back material came from (supplier / invoice) is sent with the stock change and kept in
the server's history (it was only on the phone and disappeared when the server's copy arrived). Goes with
db/audit_b1_stock_src.sql."""
import sys
p=sys.argv[1];s=open(p).read()
def rep(a,b):
    global s
    assert s.count(a)==1,(a[:100],s.count(a));s=s.replace(a,b)
rep("const txn={id:nid('sl'),kind,by,site:site||undefined,moves,ts:Date.now(),reason};",
    "const src=(extra&&extra.src&&String(extra.src).trim().slice(0,200))||undefined;const txn={id:nid('sl'),kind,by,site:site||undefined,moves,ts:Date.now(),reason,src};")
rep("txn:{id:txn.id,kind:txn.kind,by:txn.by,site:txn.site,ts:txn.ts,reason:txn.reason,",
    "txn:{id:txn.id,kind:txn.kind,by:txn.by,site:txn.site,ts:txn.ts,reason:txn.reason,src:txn.src,")
open(p,'w').write(s);print('ok')
