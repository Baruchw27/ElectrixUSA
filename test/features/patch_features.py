"""Features v1 (app side) — small, exact edits to the main app file; everything else lives in features-v1.js.
Run on a copy of the app: python3 patch_features.py ../../staging/index.html
Every edit must match exactly once (or the script stops), so it can be re-applied safely after other work lands.
 • loads features-v1.js after the schedule module
 • clockReq(): the one rule for "Time Clock Required" (used by the home screen, punch card, weekly summary)
 • task / service / injury / inspection / clock-in-request / estimate / material text shown with its line breaks,
   blank lines and indentation (pre-wrap, not pre-line which squeezes spaces)
 • the task box no longer rewrites what was typed when you tap out of it"""
import sys
p = sys.argv[1]; s = open(p).read()
if 'features-v1.js' in s:
    print('already patched'); sys.exit(0)
def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (a[:120], s.count(a)); s = s.replace(a, b)

# load the module (after the schedule module, before the on-phone self-test)
rep('<script src="sched-v21.js?vsch21a"></script>',
    '<script src="sched-v21.js?vsch21a"></script><script src="features-v1.js?vfeat1"></script>')

# Time Clock Required — one rule: clock:false = NO, clock:true = YES, not set = old behaviour (workers + site managers punch)
rep("const seesAll=e=>e.role==='owner'||!!e.all;",
    "const seesAll=e=>e.role==='owner'||!!e.all;\nfunction clockReq(e){if(!e||e.inactive)return false;if(e.clock===false)return false;if(e.clock===true)return true;return e.role==='worker'||e.role==='manager';}")
# home screen: "on the job now x/y" and "scheduled but not punched in" count only people who punch
rep("const field=D.emps.filter(e=>e.role==='worker');",
    "const field=D.emps.filter(e=>e.role==='worker'&&clockReq(e));")
rep(".flatMap(c=>D.emps.filter(e=>e.crew===c.id)).filter(e=>!D.punches.find(",
    ".flatMap(c=>D.emps.filter(e=>e.crew===c.id)).filter(e=>clockReq(e)&&!D.punches.find(")
# weekly hours message only to people on the clock
rep("const field=D.emps.filter(e=>e.role==='worker'&&e.active!==false);",
    "const field=D.emps.filter(e=>e.role==='worker'&&e.active!==false&&clockReq(e));")
# punch card on the worker's home screen
rep("function renderPunchSched(){const m=me(),el=document.getElementById('punchSched');if(m.role!=='worker'||!m.crew){",
    "function renderPunchSched(){const m=me(),el=document.getElementById('punchSched');if(m.role!=='worker'||!m.crew||!clockReq(m)){")

# typed task text: tapping out of the box only offers the people / job it mentions; it never rewrites the text
rep('id="jDesc" onblur="if(this.value.trim())parseVoice(this.value)"',
    'id="jDesc" onblur="if(this.value.trim())parseVoice(this.value,true)"')

# text shown exactly as typed
rep('<div class="desc">${esc(jobText(j))}', '<div class="desc" style="white-space:pre-wrap">${esc(jobText(j))}')
rep("<div class=\"desc\">'+esc(k.issue)+'</div>", "<div class=\"desc\" style=\"white-space:pre-wrap\">'+esc(k.issue)+'</div>")
rep("'+t('Issue')+'</div>'+esc(k.issue)+'</div>", "'+t('Issue')+'</div><span class=\"ptx\">'+esc(k.issue)+'</span></div>")
rep("<div class=\"desc\">'+esc(i.result.note)+'</div>", "<div class=\"desc\" style=\"white-space:pre-wrap\">'+esc(i.result.note)+'</div>")
rep("color:var(--g4)\">“'+esc(p.why)+'”</div>", "color:var(--g4);white-space:pre-wrap\">“'+esc(p.why)+'”</div>")
rep("'🚑 '+t('INJURED')+' — '+esc((p.check.injury||{}).what||'')", "'🚑 '+t('INJURED')+' — <span class=\"ptx\">'+esc((p.check.injury||{}).what||'')+'</span>'")
rep('white-space:pre-line">\'+esc(x.items)+\'</div>', 'white-space:pre-wrap">\'+esc(x.items)+\'</div>')
rep('white-space:pre-line">\'+esc(x.text)+\'</div>', 'white-space:pre-wrap">\'+esc(x.text)+\'</div>')
rep('white-space:pre-line"></div>', 'white-space:pre-wrap"></div>')

# saving: exact text (".trim()" also removed the first line's indentation); only empty lines at the start/end go
rep("function clockReq(e){", "function exTxt(s){s=String(s==null?'':s).replace(/\\r\\n?/g,'\\n');return s.replace(/^(?:[ \\t]*\\n)+/,'').replace(/\\s+$/,'');}\nfunction clockReq(e){")
for fid in ['jDesc','esText','svIssue','irNote','smWhy']:
    rep("document.getElementById('%s').value.trim()" % fid, "exTxt(document.getElementById('%s').value)" % fid)
rep("p.check.injury={what:document.getElementById('poInjWhat').value.trim()", "p.check.injury={what:exTxt(document.getElementById('poInjWhat').value)")
rep("(ta.value.trim()?'\\n'+ta.value.trim():'')", "(ta.value.trim()?'\\n'+exTxt(ta.value):'')")
rep("let items=document.getElementById('mtItems').value.trim()", "let items=exTxt(document.getElementById('mtItems').value)")

open(p, 'w').write(s); print('patched', p)
