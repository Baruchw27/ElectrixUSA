"""Review B2b — a site manager is only offered Edit / Remove for people the server lets him change (workers and crew
leaders). Before: he could open office staff / other managers, his change quietly reverted, and "Remove" still took
that person off their jobs although the person stayed on the team."""
import sys
p=sys.argv[1];s=open(p).read()
def rep(a,b):
    global s
    assert s.count(a)==1,(a[:100],s.count(a));s=s.replace(a,b)
rep("function empRow(e,canRemove){const ini=e.name.slice(0,2).toUpperCase();if(e.inactive)canRemove=canRemove;",
    "function empEditable(m,e){if(!m||!e)return false;if(m.role==='owner')return true;return !(['owner','manager','office'].includes(e.role)||!!e.all);}\n"
    "function empRow(e,canRemove){const ini=e.name.slice(0,2).toUpperCase();if(canRemove&&!empEditable(me(),e))canRemove=false;")
rep("function removeEmp(id){askConfirm(",
    "function removeEmp(id){const _tg=D.emps.find(e=>e.id===id);if(_tg&&!empEditable(me(),_tg)){toast(t('Only the owner can change this person.'));return;}askConfirm(")
rep("function t(s){return lang()==='es'&&ES[s]?ES[s]:s",
    "Object.assign(ES,{'Only the owner can change this person.':'Solo el dueño puede cambiar a esta persona.'});\nfunction t(s){return lang()==='es'&&ES[s]?ES[s]:s")
open(p,'w').write(s);print('ok')
