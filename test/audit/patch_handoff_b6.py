"""B6 — Baruch's Time Clock rule and the other session's checklist (test/features/HANDOFF.md on features/staging).
 • "Paid monthly" becomes a plain Time Clock YES/NO per employee (field clock:false = NO). No pay wording at all.
   Changeable only by the Owner, an all-access admin or Payroll. Old clock entries are always kept.
 • Time Clock NO people don't open on the clock screen; "Request time off" is also in More for everyone.
 • search person cards show hours / clock status only to Owner, all-access, Payroll, site managers and a crew
   leader for his own crew
 • New task: removing the job also unticks the site manager it ticked automatically
 • the task box no longer rewrites typed text when you tap out of it (it squeezed lines and removed words);
   saves keep first-line indentation; estimate texts keep indentation (pre-wrap)
 • the bell list no longer marks everything read just by opening it (each message when tapped, or "Mark all read");
   the bell count refreshes while someone is typing
 • blank by default also for: Add missed punch (person + job), garage pick-up (job), receipt (job)"""
import sys,re
p=sys.argv[1];s=open(p).read()
def rep(a,b,count=1):
    global s
    assert s.count(a)==count,(a[:120],s.count(a));s=s.replace(a,b)
# ── Time Clock YES/NO ──
rep("function canSetPay(m){return !!m&&(m.role==='owner'||(m.role==='office'&&m.title==='Payroll'));}",
    "function canSetPay(m){return !!m&&(m.role==='owner'||!!m.all||(m.role==='office'&&m.title==='Payroll'));}\n"
    "// Time Clock: clock:false = NO (never asked to punch, never 'missing'); not set = as before. Old punches are always kept.\n"
    "function noClock(e){return !!e&&e.clock===false;}")
rep("document.getElementById('ePayM').className='sw'+(ex&&ex.payMonthly?' on':'');","document.getElementById('ePayM').className='sw'+(ex&&noClock(ex)?'':' on');")
rep("if(document.getElementById('ePayM').classList.contains('on'))e.payMonthly=true;else if(e.payMonthly)e.payMonthly=false;",
    "if(!document.getElementById('ePayM').classList.contains('on'))e.clock=false;else if(e.clock===false)e.clock=true;")
rep("if(canSetPay(me())&&document.getElementById('ePayM').classList.contains('on'))ne.payMonthly=true;","if(canSetPay(me())&&!document.getElementById('ePayM').classList.contains('on'))ne.clock=false;")
rep("(me()||{}).payMonthly","noClock(me())")
rep("const pm=!!m.payMonthly&&!open;","const pm=noClock(m)&&!open;")
rep("const pmL=D.emps.filter(e=>e&&e.payMonthly&&!e.inactive);","const pmL=D.emps.filter(e=>noClock(e)&&!e.inactive);")
s=s.replace("!e.payMonthly","!noClock(e)").replace("e.payMonthly?","noClock(e)?")
assert 'payMonthly' not in s, [m.start() for m in re.finditer('payMonthly',s)]
for a,b in [("'Paid monthly — no clock-in'","'No time clock'"),("'Paid monthly'","'No time clock'")]:
    s=s.replace(a,b)
rep(""">Paid monthly — no clock-in</span><div style="font-size:11px;color:var(--g4)" data-i18n="No punch needed, never reminded. Only the owner or Payroll can change this.">No punch needed, never reminded. Only the owner or Payroll can change this.</div>""",
    """>Time clock</span><div style="font-size:11px;color:var(--g4)" data-i18n="Off = doesn't punch, never reminded, not counted as missing. Old clock entries are kept. Owner, all-access or Payroll only.">Off = doesn't punch, never reminded, not counted as missing. Old clock entries are kept. Owner, all-access or Payroll only.</div>""")
rep("""data-i18n="Paid monthly — no clock-in">""","""data-i18n="Time clock">""")
rep("""<b data-i18n="You're paid monthly">You're paid monthly</b><div style="font-size:13px;color:var(--g4);margin-top:4px" data-i18n="No need to clock in or out. Payroll set this up for you.">No need to clock in or out. Payroll set this up for you.</div>""",
    """<b data-i18n="No time clock for you">No time clock for you</b><div style="font-size:13px;color:var(--g4);margin-top:4px" data-i18n="You don't need to clock in or out.">You don't need to clock in or out.</div>""")
rep("if(m.role==='worker')document.querySelector(`.tab[onclick*=\"'punch'\"]`).click();","if(m.role==='worker'&&!noClock(m))document.querySelector(`.tab[onclick*=\"'punch'\"]`).click();else if(m.role==='worker')goTab('jobs');")
rep("""'<div class="mg" onclick="toggleLang()">""","""'<div class="mg" onclick="reqTimeOff()">🏖 '+t('Request time off')+'</div><div class="mg" onclick="toggleLang()">""")
rep("function t(s){return lang()==='es'&&ES[s]?ES[s]:s",
    "Object.assign(ES,{'No time clock':'Sin reloj','Time clock':'Reloj de marcar',\"Off = doesn't punch, never reminded, not counted as missing. Old clock entries are kept. Owner, all-access or Payroll only.\":'Apagado = no marca, nunca se le recuerda, no cuenta como ausente. Las marcas antiguas se guardan. Solo dueño, acceso total o nómina.',"
    "'No time clock for you':'Usted no usa el reloj',\"You don't need to clock in or out.\":'No necesita marcar entrada ni salida.','Mark all read':'Marcar todo leído','Pick the person':'Elija la persona','Pick the job':'Elija el trabajo','— pick —':'— elija —'});\n"
    "function t(s){return lang()==='es'&&ES[s]?ES[s]:s")
# ── search person cards: hours only for those who may see them ──
rep("function personCard(e){","function seesHoursOf(m,e){return !!m&&!!e&&(m.role==='owner'||!!m.all||m.role==='manager'||(m.role==='office'&&m.title==='Payroll')||(!!m.lead&&!!m.crew&&e.crew===m.crew));}\nfunction personCard(e){const _sh=seesHoursOf(me(),e);")
rep("+'</div><div>⏱ '+st+'</div>'+(gh?","+'</div>'+(_sh?'<div>⏱ '+st+'</div>':'')+(gh?")
rep("+'<div>🕒 <b>'+t('This week')+':</b> '+wk.total.toFixed(1)+' h'+(wk.ot?' · <span style=\"color:#c0392b\">'+wk.ot.toFixed(1)+' OT</span>':'')+'</div><div>📋",
    "+(_sh?'<div>🕒 <b>'+t('This week')+':</b> '+wk.total.toFixed(1)+' h'+(wk.ot?' · <span style=\"color:#c0392b\">'+wk.ot.toFixed(1)+' OT</span>':'')+'</div>':'')+'<div>📋")
# ── New task: blanking the job unticks the auto-ticked manager ──
rep("function siteAuto(){const s=D.sites.find(x=>x.id===document.getElementById('jSite').value);if(!s)return;const box=document.querySelector(`#jAssign input[value=\"${s.manager}\"]`);if(me().role==='owner'&&box&&![...document.querySelectorAll('#jAssign input:checked')].length)box.checked=true;}",
    "let _autoMgr=null;function siteAuto(){const s=D.sites.find(x=>x.id===document.getElementById('jSite').value);"
    "if(_autoMgr){const b0=document.querySelector(`#jAssign input[value=\"${_autoMgr}\"]`);if(b0&&b0.checked&&[...document.querySelectorAll('#jAssign input:checked')].length===1){b0.checked=false;try{jobWord();}catch(e){}}_autoMgr=null;}"
    "if(!s)return;const box=document.querySelector(`#jAssign input[value=\"${s.manager}\"]`);if(me().role==='owner'&&box&&![...document.querySelectorAll('#jAssign input:checked')].length){box.checked=true;_autoMgr=s.manager;}}")
rep("document.getElementById('jSite').onchange=siteAuto;siteAuto();","_autoMgr=null;document.getElementById('jSite').onchange=siteAuto;siteAuto();")
# ── typed task text is never rewritten on blur ──
rep("""onblur="if(this.value.trim())parseVoice(this.value)\"""","""onblur="if(this.value.trim())parseVoice(this.value,true)\"""")
rep("function parseVoice(text){","function parseVoice(text,keepText){")
rep("  // desc: strip name/site/time words\n  let d=text;","  // desc: strip name/site/time words (only for a spoken transcript — typed text stays exactly as typed)\n  if(keepText)return;\n  let d=text;")
for f in ['jDesc','svIssue','mtItems','esText','irNote']:
    rep("getElementById('%s').value.trim()"%f,"fmtClean(document.getElementById('%s').value)"%f)
s=s.replace("document.fmtClean(","fmtClean(")
rep("""<div id="epText" class="card" style="font-size:14px;white-space:pre-line"></div>""","""<div id="epText" class="card" style="font-size:14px;white-space:pre-wrap"></div>""")
rep("""<div class="desc" style="white-space:pre-line">'+esc(x.text)+'</div>'""","""<div class="desc">'+fmtText(x.text)+'</div>'""")
# ── bell ──
rep("  mine.forEach(x=>x.read=true);save();renderBell();show('m-inbox');}",
    "  {const un=mine.filter(x=>!x.read).length;if(un){document.getElementById('inboxList').insertAdjacentHTML('afterbegin','<div style=\"text-align:right;margin:0 2px 6px\"><span class=\"bs b\" onclick=\"inboxAllRead()\">✓ '+t('Mark all read')+' ('+un+')</span></div>');}}\n  renderBell();show('m-inbox');}\n"
    "function inboxAllRead(){const m=me();D.inbox.filter(x=>x.to===m.id&&!x.read).forEach(x=>x.read=true);save();renderBell();openInbox();}\n"
    "try{setInterval(()=>{try{if(typeof me==='function'&&me())renderBell();}catch(e){}},3000);}catch(e){}")
# ── blank job by default: missed punch, pick-up, receipt ──
rep("""  document.getElementById('peWho').innerHTML=D.emps.filter(e=>e.role!=='office'&&e.role!=='owner').map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join('');
  document.getElementById('peSite').innerHTML=D.sites.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('');""",
    """  document.getElementById('peWho').innerHTML=(p?'':'<option value="">— '+t('pick')+' —</option>')+D.emps.filter(e=>e.role!=='office'&&e.role!=='owner').map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join('');
  document.getElementById('peSite').innerHTML=(p?'':'<option value="">— '+t('pick')+' —</option>')+D.sites.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('');if(!p){document.getElementById('peWho').value='';document.getElementById('peSite').value='';}""")
rep("function savePunchEdit(){","function savePunchEdit(){if(!peIdx){if(!document.getElementById('peWho').value){toast(t('Pick the person'));return;}if(!document.getElementById('peSite').value){toast(t('Pick the job'));return;}}")
rep("""  document.getElementById('puSite').innerHTML=D.sites.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('');const ds=garDefaultSite();if(ds)document.getElementById('puSite').value=ds;show('m-pick2');}""",
    """  document.getElementById('puSite').innerHTML='<option value="">— '+t('pick')+' —</option>'+D.sites.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('');document.getElementById('puSite').value='';show('m-pick2');}""")
rep("""  stockSaving=true;let res;const keep=puLines;""","""  if(!site){toast(t('Pick the job'));return;}
  stockSaving=true;let res;const keep=puLines;""")
rep("""  document.getElementById('exSite').innerHTML=D.sites.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('');const sl=m.crew?D.sched[m.crew+'|'+dkey(new Date())]:null;if(sl)document.getElementById('exSite').value=sl.site;""",
    """  document.getElementById('exSite').innerHTML='<option value="">—</option>'+D.sites.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('');document.getElementById('exSite').value='';""")
rep("(w&&!o)?document.querySelector(`.tab[onclick*=\"'punch'\"]`)","(w&&!o&&!noClock(me()))?document.querySelector(`.tab[onclick*=\"'punch'\"]`)")
rep("else if(m.role==='worker')goTab('punch');})();","else if(m.role==='worker')goTab(noClock(m)?'jobs':'punch');})();")
s=s.replace("'— pick —':'— elija —'","'— pick —':'— elija —','pick':'elija'",1)
open(p,'w').write(s);print('ok')
