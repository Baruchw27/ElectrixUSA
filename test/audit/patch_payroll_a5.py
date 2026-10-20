"""Audit A5 (app side) — goes with db/audit_a5_payroll.sql.
 • late clock entries: Payroll queue (approve / reject with reason), labels for everyone, never auto-approved by a
   manager or a fence fix; the worker sees "waiting for Payroll"
 • removing a clock entry = "void" with a required reason (kept, struck through, not paid); restore needs a reason too
 • adding a missed punch needs a reason; the edit window shows the full server history
 • voided entries never count toward pay"""
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (a[:120], s.count(a)); s = s.replace(a, b)

rep("function payCounts(p){return !!p&&!p.rejected&&!p.pending;}",
    "function payCounts(p){return !!p&&!p.rejected&&!p.pending&&!p.voided;}")

# Spanish for the new worker/office wording
rep("function t(s){return lang()==='es'&&ES[s]?ES[s]:s",
    "Object.assign(ES,{'Sent late — waiting for Payroll approval':'Enviado tarde — esperando aprobación de nómina','Waiting for Payroll':'Esperando a nómina',"
    "'Late clock entries — waiting for Payroll':'Marcas tardías — esperando a nómina','sent':'enviado','late':'tarde','Approve':'Aprobar','Reject':'Rechazar',"
    "'Reason (required)':'Motivo (obligatorio)','Reject this clock entry':'Rechazar esta marca','Remove this clock entry':'Quitar esta marca',"
    "'Restore this clock entry':'Restaurar esta marca','Removed — kept in the history':'Quitada — queda en el historial','Restored':'Restaurada',"
    "'Removed':'Quitada','Rejected':'Rechazada','Approved by':'Aprobada por','Someone else must approve your own entry':'Otra persona debe aprobar su propia marca',"
    "'History':'Historial','created':'creada','late entry received':'marca tardía recibida','added by the office':'agregada por la oficina','edited':'editada',"
    "'approved':'aprobada','rejected':'rechazada','removed':'quitada','restored':'restaurada','deleted':'borrada','Restore':'Restaurar','Remove':'Quitar',"
    "'Your late clock entry was approved':'Su marca tardía fue aprobada','Your late clock entry was not approved':'Su marca tardía no fue aprobada'});\n"
    "function t(s){return lang()==='es'&&ES[s]?ES[s]:s")

# late entries are Payroll's: managers' "clock me in" approvals and fence fixes must not touch them
rep("D.punches.filter(p=>p.site===site&&p.pending).forEach(p=>{if(ok){",
    "D.punches.filter(p=>p.site===site&&p.pending&&!p.lateEntry).forEach(p=>{if(ok){")
rep("D.punches.filter(p=>p.site===s.id&&p.pending&&p.lat&&distFt(p.lat,p.lng,s.lat,s.lng)<=s.rad).forEach(p=>{",
    "D.punches.filter(p=>p.site===s.id&&p.pending&&!p.lateEntry&&p.lat&&distFt(p.lat,p.lng,s.lat,s.lng)<=s.rad).forEach(p=>{")
rep("const pend=D.punches.filter(p=>p.site===id&&p.pending);",
    "const pend=D.punches.filter(p=>p.site===id&&p.pending&&!p.lateEntry);")
rep("const reqs=D.sites.filter(s=>s.fenceReq||D.punches.some(p=>p.site===s.id&&p.pending));",
    "const reqs=D.sites.filter(s=>s.fenceReq||D.punches.some(p=>p.site===s.id&&p.pending&&!p.lateEntry));")
rep("if(p.pending)return {k:'wait',txt:t('Waiting for office')};",
    "if(p.pending)return {k:'wait',txt:p.lateEntry?t('Waiting for Payroll'):t('Waiting for office')};")

# the worker's own day list: say when an entry is waiting / rejected / removed
rep("return `<div class=\"plog\" style=\"flex-direction:column;align-items:stretch\"><div style=\"display:flex;justify-content:space-between\"><span><b>${esc(nameOf(p.who))}</b> · ${esc(siteName(p.site))}</span><span>${fmtT(p.in)} – ${status}</span></div>${trips}${gh}${ghBtn}</div>`;}).join('')",
    "return `<div class=\"plog\" style=\"flex-direction:column;align-items:stretch\"><div style=\"display:flex;justify-content:space-between\"><span><b>${esc(nameOf(p.who))}</b> · ${esc(siteName(p.site))}</span><span>${fmtT(p.in)} – ${status}</span></div>${trips}${gh}${punchFlags(p)}${ghBtn}</div>`;}).join('')")

# helpers: labels, history text, Payroll queue, approve / reject, void / restore
rep("// ───────────── HOURS — payroll (Shia, Miriam) + owner edit any punch ─────────────",
r"""// ───────────── late entries, removals, history (server-checked: db/audit_a5_payroll.sql) ─────────────
function punchFlags(p){const L=[];
  if(p.voided)L.push('<div style="font-size:11px;color:#c0392b;padding-left:8px">🗑 '+t('Removed')+' — '+esc(p.voided.why||'')+' ('+esc(nameOf(p.voided.by))+')</div>');
  if(p.rejected&&p.lateEntry)L.push('<div style="font-size:11px;color:#c0392b;padding-left:8px">✗ '+t('Rejected')+(p.rejectWhy?' — '+esc(p.rejectWhy):'')+'</div>');
  else if(p.pending&&p.lateEntry)L.push('<div style="font-size:11px;color:var(--amber);padding-left:8px">⏳ '+t('Sent late — waiting for Payroll approval')+'</div>');
  else if(p.lateEntry&&p.approvedBy)L.push('<div style="font-size:11px;color:var(--g4);padding-left:8px">⏱ '+t('sent')+' '+lateMin(p)+' min '+t('late')+' · '+t('Approved by')+' '+esc(nameOf(p.approvedBy))+'</div>');
  return L.join('');}
function lateMin(p){const le=p.lateEntry||{};return Math.max(0,Math.round(((+le.srvIn||0)-(+le.in||+p.in||0))/60000));}
const HIST_WORD={created:'created',late:'late entry received',added:'added by the office',edited:'edited',approved:'approved',rejected:'rejected',voided:'removed',unvoided:'restored',deleted:'deleted',restored:'restored'};
function punchHistHtml(p){const h=Array.isArray(p.hist)?p.hist:[];if(!h.length)return '';
  return '<div style="margin-top:6px"><b>'+t('History')+'</b><br>'+h.map(e=>{const when=new Date(+e.at||0).toLocaleString(LOC(),{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
    const tm=x=>x?fmtT(+x):'—';const ft=e.from&&e.to?' ('+tm(e.from.in)+'–'+tm(e.from.out)+' → '+tm(e.to.in)+'–'+tm(e.to.out)+')':(e.in?' ('+tm(e.in)+'–'+tm(e.out)+')':'');
    return '• '+when+' · '+esc(nameOf(e.by))+': '+t(HIST_WORD[e.act]||e.act)+ft+(e.why?' — '+esc(e.why):'')+(e.minutesLate?' · '+e.minutesLate+' min '+t('late'):'');}).join('<br>')+'</div>';}
function renderLateQueue(){const m=me();if(!canEditHours(m))return;let box=document.getElementById('lateQueue');
  if(!box){box=document.createElement('div');box.id='lateQueue';const fq=document.getElementById('fixQueue');(fq?fq.parentNode:document.getElementById('pg-hours')).insertBefore(box,fq||document.getElementById('hrChips'));}
  const q=(D.punches||[]).filter(p=>p.pending&&p.lateEntry&&!p.rejected&&!p.voided).sort((a,b)=>a.in-b.in);
  box.innerHTML=q.length?'<div class="sec">⏳ '+t('Late clock entries — waiting for Payroll')+' · '+q.length+'</div>'+q.map(p=>{const self=p.who===m.id&&m.role!=='owner';
    return '<div class="card" style="border-left:3px solid var(--amber)"><div class="row"><div><b>'+esc(nameOf(p.who))+'</b><div class="site">'+new Date(p.in).toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'})+' · '+fmtT(p.in)+' – '+(p.out?fmtT(p.out):'…')+' · '+esc(siteName(p.site))+'</div></div><span class="badge b-prog">'+t('sent')+' '+lateMin(p)+' min '+t('late')+'</span></div>'
      +'<div class="foot"><span class="due"></span><div class="acts">'+(self?'<span style="font-size:12px;color:var(--g4)">'+t('Someone else must approve your own entry')+'</span>':'<button class="bs r" onclick="rejectLate(\''+jsq(p.id)+'\')">'+t('Reject')+'</button><button class="bs g" onclick="approveLate(\''+jsq(p.id)+'\')">'+t('Approve')+'</button>')+'</div></div></div>';}).join(''):'';}
function approveLate(id){const p=D.punches.find(x=>x.id===id);if(!p||!p.pending)return;p.pending=false;p.approvedBy=me().id;save();renderHours();try{renderPunch();}catch(e){}
  pushTo([p.who],'✅ '+t('Your late clock entry was approved')+': '+new Date(p.in).toLocaleDateString(LOC(),{month:'short',day:'numeric'})+' '+fmtT(p.in),'info',{tab:'punch'});}
function rejectLate(id){const p=D.punches.find(x=>x.id===id);if(!p||!p.pending)return;
  askPrompt(t('Reject this clock entry'),[{label:t('Reason (required)'),value:''}],([why])=>{why=(why||'').trim();if(why.length<3){toast(t('Write a reason for the change'));return;}
    p.rejected=true;p.pending=false;p.rejectWhy=why;save();renderHours();try{renderPunch();}catch(e){}
    pushTo([p.who],'✗ '+t('Your late clock entry was not approved')+': '+new Date(p.in).toLocaleDateString(LOC(),{month:'short',day:'numeric'})+' '+fmtT(p.in)+' — '+why,'warn',{tab:'punch'});});}
// ───────────── HOURS — payroll (Shia, Miriam) + owner edit any punch ─────────────""")

# Hours list: show the flags; Payroll queue on top
rep("  const m=me();if(!canEditHours(m))return;renderAttendance();renderJobDash();renderFixQueue();",
    "  const m=me();if(!canEditHours(m))return;renderAttendance();renderJobDash();renderFixQueue();try{renderLateQueue();}catch(e){console.warn(e);}")
rep("+(p.transfer?'<div style=\"font-size:11px;color:var(--g4);padding-left:8px\">↔ '+t('switched sites')+'</div>':'')",
    "+(p.transfer?'<div style=\"font-size:11px;color:var(--g4);padding-left:8px\">↔ '+t('switched sites')+'</div>':'')+punchFlags(p)")

# edit window: server history, Remove/Restore wording
rep("  show('m-pe');}\nfunction savePunchEdit(){",
    "  if(p){const hh=punchHistHtml(p);if(hh){log.style.display='block';log.innerHTML=(log.innerHTML&&log.style.display!=='none'?log.innerHTML:'')+hh;}}\n"
    "  const pd=document.getElementById('peDel');if(pd){const L=p&&p.voided?'Restore':'Remove';pd.setAttribute('data-i18n',L);pd.textContent=t(L);}\n"
    "  show('m-pe');}\nfunction savePunchEdit(){")
rep("const log=document.getElementById('peLog');if(p&&p.edits&&p.edits.length){",
    "const log=document.getElementById('peLog');log.innerHTML='';if(p&&p.edits&&p.edits.length){")

# a reason for every manual punch too
rep("  if(peIdx===null){D.punches.push({who,site,in:inT,out:outT,edits:[{by:me().id,at:Date.now(),why:why||t('added manually'),",
    "  if(!why){toast(t('Write a reason for the change'));return;}\n  if(peIdx===null){D.punches.push({id:nid('p'),who,site,in:inT,out:outT,edits:[{by:me().id,at:Date.now(),why,")
rep("  else{if(!why){toast(t('Write a reason for the change'));return;}const p=D.punches.find(x=>x.id===peIdx);",
    "  else{const p=D.punches.find(x=>x.id===peIdx);")
rep('<input id="peWhy" placeholder="Forgot to punch out">', '<input id="peWhy" placeholder="Required — e.g. forgot to punch out">')

# removing = void with a reason (kept and shown, not paid); restoring needs a reason too
rep("function delPunch(){askConfirm(t('Delete this punch?'),()=>{const i=D.punches.findIndex(x=>x.id===peIdx);if(i<0){hide('m-pe');renderHours();return;}D.punches.splice(i,1);save();hide('m-pe');renderHours();renderPunch();},t('Delete'));}",
r"""function delPunch(){const p=D.punches.find(x=>x.id===peIdx);if(!p){hide('m-pe');renderHours();return;}const undo=!!p.voided;
  askPrompt(undo?t('Restore this clock entry'):t('Remove this clock entry'),[{label:t('Reason (required)'),value:''}],([why])=>{why=(why||'').trim();if(why.length<3){toast(t('Write a reason for the change'));return;}
    const at=Date.now(),span={in:p.in,out:p.out||p.away||null};(p.edits=p.edits||[]).push({by:me().id,at,why,void:!undo,restore:undo,from:span,to:span});
    if(undo)delete p.voided;else p.voided={by:me().id,at,why};
    save();hide('m-pe');renderHours();renderPunch();toast('✓ '+(undo?t('Restored'):t('Removed — kept in the history')),'green');});}""")

open(p, 'w').write(s); print('patched', p)
