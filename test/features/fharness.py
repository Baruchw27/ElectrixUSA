"""Shared helpers for the Features v1 tests: the schedule test harness (local stand-in server, real app code in Chromium,
iPhone / Android / desktop profiles) plus production-shaped data and a few extra people (Solomon, Matty)."""
import os, sys, json
HERE=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE,'..','sched'))
os.environ.setdefault('APPROOT', os.path.join(HERE,'..','..','staging'))
os.environ.setdefault('PORT','8795')
import harness as H
from harness import *  # noqa
SEED=json.load(open(os.path.join(HERE,'..','sched','seed_prod.json')))
# extra people so every office title is covered
def _extra():
    users=[];rows=[]
    for i,(id,name,role,title) in enumerate([('b1','Solomon','office','Bookkeeper'),('o4','Matty','office','Inspections')]):
        uid=f"00000000-0000-0000-0000-{900+i:012d}";email=f"{id}@electrixusa.app"
        users.append({"email":email,"id":uid,"pass":"Testpass123"})
        rows.append({"coll":"emps","id":id,"data":{"id":id,"name":name,"role":role,"title":title,"authUid":uid,"authEmail":email,"lang":"en"}})
    return users,rows
_u,_r=_extra()
SEED={'users':SEED['users']+_u,'rows':SEED['rows']+_r}
async def ready(P): await until(P,"EX_ready&&EX_ready()",12000)
async def settle(P,ms=8000): return await until(P,"!EX_SYNC.pending&&!EX_SYNC.flushing",ms)
def records(coll): return [r for r in srv('/__records?coll='+coll) if not r['deleted']]
async def go(b,name,kind='iphone'):
    c,P,e,ok=await login(b,name,'Testpass123',kind); await ready(P); return c,P,e,ok
