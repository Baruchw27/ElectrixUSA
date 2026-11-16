/* p20 — choose your own password from a personal link (Baruch 11/15: "send them the app on email, and they should set up a
password for themselves"). The office (owner or Payroll) makes a one-time link for a field worker (Team → the man → Sign-in link),
it is good for 7 days and works once. Opening it shows "Hi Mario — choose your password" in his language; after saving he is
signed straight in. Nobody else ever sees or types his password. */
(function(){
const $=id=>document.getElementById(id);
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const L={es:{hi:'Hola',title:'Elija su contraseña',sub:'Esta es su entrada a la app de Electrix. Use por lo menos 8 letras y números.',p1:'Contraseña nueva',p2:'Escríbala otra vez',save:'Guardar y entrar',show:'Mostrar',
  short:'Necesita por lo menos 8 letras y números.',mix:'Use letras y también números.',same:'Las dos contraseñas no son iguales.',common:'Esa contraseña es muy fácil. Use otra.',
  used:'Este enlace ya se usó. Si olvidó su contraseña, pida un enlace nuevo a la oficina.',old:'Este enlace ya venció. Pida un enlace nuevo a la oficina.',bad:'Este enlace no sirve. Pida un enlace nuevo a la oficina.',net:'No hay conexión. Intente otra vez.',wait:'Guardando…',done:'Listo — entrando…',lang:'English'},
 en:{hi:'Hi',title:'Choose your password',sub:'This is your sign-in for the Electrix app. Use at least 8 letters and numbers.',p1:'New password',p2:'Type it again',save:'Save and sign in',show:'Show',
  short:'It needs at least 8 letters and numbers.',mix:'Use letters and numbers too.',same:'The two passwords are not the same.',common:'That password is too easy. Use another one.',
  used:'This link was already used. If you forgot your password, ask the office for a new link.',old:'This link expired. Ask the office for a new link.',bad:'This link does not work. Ask the office for a new link.',net:'No connection. Try again.',wait:'Saving…',done:'Done — signing in…',lang:'Español'}};
let lg='es',info=null,code=null;
const tx=k=>(L[lg]||L.es)[k];
function codeOf(){const m=(location.hash||'').match(/setup=([A-Za-z0-9_-]{16,64})/)||(location.search||'').match(/setup=([A-Za-z0-9_-]{16,64})/);return m?m[1]:null;}
const css=document.createElement('style');css.textContent='#p20{position:fixed;inset:0;z-index:900;background:#fff;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto}'
+'html[data-theme=dark] #p20{background:#000;color:#f2f2f7}#p20 .bx{width:100%;max-width:380px}#p20 h1{font-size:24px;margin:18px 0 6px}#p20 p{color:var(--g4,#8e8e93);font-size:14.5px;line-height:1.45;margin:0 0 18px}'
+'#p20 label{display:block;font-size:13px;font-weight:600;margin:12px 0 5px}#p20 input{width:100%;box-sizing:border-box;font-size:17px;padding:12px;border-radius:12px;border:1px solid var(--g2,#e5e5ea);background:var(--g1,#f2f2f7);color:inherit}'
+'#p20 .err{color:#c0392b;font-size:14px;min-height:20px;margin:12px 0 4px}#p20 .go{width:100%;padding:14px;border:0;border-radius:12px;background:#d93a2b;color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer;margin-top:6px}'
+'#p20 .row{display:flex;justify-content:space-between;align-items:center;margin-top:16px;font-size:13.5px}#p20 .lk{background:none;border:0;color:var(--blue-mid,#d93a2b);font:inherit;cursor:pointer;padding:0}#p20 img{height:34px}';
document.head.appendChild(css);
function logo(){const s=document.querySelector('.logo img');const dark=document.documentElement.getAttribute('data-theme')==='dark';return '<img alt="Electrix" src="'+(dark?'logo-dark.svg':'logo-light.svg')+'" onerror="this.style.display=\'none\'">';}
function paint(msg){let el=$('p20');if(!el){el=document.createElement('div');el.id='p20';document.body.appendChild(el);}
  if(!info||!info.ok){el.innerHTML='<div class="bx">'+logo()+'<h1>Electrix</h1><p style="font-size:16px;color:inherit">'+E(msg||tx(info?info.why||'bad':'bad'))+'</p><div class="row"><span></span><button class="lk" onclick="P20.lang()">'+tx('lang')+'</button></div></div>';return;}
  el.innerHTML='<div class="bx">'+logo()+'<h1>'+E(tx('hi'))+' '+E(info.first)+' 👋</h1><h1 style="font-size:19px;margin-top:0">'+E(tx('title'))+'</h1><p>'+E(tx('sub'))+'</p>'
  +'<label>'+E(tx('p1'))+'</label><input id="p20a" type="password" autocomplete="new-password" autocapitalize="off">'
  +'<label>'+E(tx('p2'))+'</label><input id="p20b" type="password" autocomplete="new-password" autocapitalize="off" onkeydown="if(event.key===\'Enter\')P20.save()">'
  +'<div class="err" id="p20e">'+E(msg||'')+'</div><button class="go" id="p20g" onclick="P20.save()">'+E(tx('save'))+'</button>'
  +'<div class="row"><button class="lk" onclick="P20.show()">'+E(tx('show'))+'</button><button class="lk" onclick="P20.lang()">'+E(tx('lang'))+'</button></div></div>';}
const sb=()=>new Promise(res=>{let n=0;const tk=()=>{if(window.EX_sb)return res(window.EX_sb);if(++n>200)return res(null);setTimeout(tk,100);};tk();});
const P20=window.P20={};
P20.lang=()=>{const a=$('p20a'),b=$('p20b');const va=a?a.value:'',vb=b?b.value:'';lg=lg==='es'?'en':'es';paint();if($('p20a')){$('p20a').value=va;$('p20b').value=vb;}};
P20.show=()=>{['p20a','p20b'].forEach(i=>{const x=$(i);if(x)x.type=x.type==='password'?'text':'password';});};
P20.save=async()=>{const a=$('p20a').value,b=$('p20b').value,er=$('p20e'),g=$('p20g');
  if(a.length<8){er.textContent=tx('short');return;}if(!/[A-Za-z]/.test(a)||!/[0-9]/.test(a)){er.textContent=tx('mix');return;}if(a!==b){er.textContent=tx('same');return;}
  if(g.disabled)return;g.disabled=true;g.style.opacity='.6';er.textContent=tx('wait');
  const c=await sb();let r=null;try{r=c?await c.rpc('setup_link_use',{p_code:code,p_pass:a}):null;}catch(e){r=null;}
  g.disabled=false;g.style.opacity='';
  if(!r){er.textContent=tx('net');return;}
  if(r.error){const m=String(r.error.message||'');er.textContent=/common/.test(m)?tx('common'):/short/.test(m)?tx('short'):/letters/.test(m)?tx('mix'):/valid/.test(m)?tx('used'):/sign-in/.test(m)?tx('bad'):tx('net');return;}
  er.textContent=tx('done');const name=(r.data&&r.data.name)||'';
  try{history.replaceState(null,'',location.pathname);}catch(e){location.hash='';}
  try{localStorage.setItem('ex_lang',lg);}catch(e){}
  // sign in the normal way with his name and the password he just chose
  setTimeout(()=>{const el=$('p20');if(el)el.remove();try{if(typeof needLogin==='function')needLogin();}catch(e){}
    const u=$('lgUser'),p=$('lgPass');if(u&&p&&typeof doLogin==='function'){u.value=name;p.value=a;doLogin();}},300);};
async function start(){code=codeOf();if(!code)return;paint(tx('wait'));const c=await sb();
  try{const r=c?await c.rpc('setup_link_info',{p_code:code}):null;info=r&&!r.error?r.data:{ok:false,why:'bad'};}catch(e){info={ok:false,why:'bad'};}
  if(!c&&!info){paint(tx('net'));return;}paint();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
window.addEventListener('hashchange',()=>{if(codeOf()&&codeOf()!==code)start();});

// ── office side: Team → the man → "Sign-in link" (owner or Payroll, field workers only) ──
P20.linkFor=async(who)=>{const c=await sb();if(!c)return null;const r=await c.rpc('setup_link_make',{p_who:who});if(r.error)throw new Error(r.error.message);
  const u=new URL(location.href);u.search='';u.hash='setup='+r.data;return u.toString();};
P20.make=async()=>{const id=typeof empEditId!=='undefined'?empEditId:null;if(!id)return;const e=(D.emps||[]).find(x=>x.id===id);const out=$('p20out');
  try{out.textContent='…';const link=await P20.linkFor(id);const first=String(e&&e.name||'').split(' ')[0];
    const msg='Hola '+first+' — esta es su entrada a la app de Electrix. Toque el enlace y elija su contraseña (sirve una vez, por 7 días):\n'+link;
    out.innerHTML='<div style="font-size:12.5px;word-break:break-all;margin:6px 0">'+E(link)+'</div><button class="btn sec2" type="button" onclick="P20.share()">'+E(t('Send / copy'))+'</button>';P20._msg=msg;}
  catch(err){out.textContent=/only for field/.test(err.message)?t('Links are only for field workers.'):t('Could not make the link.');}};
P20.share=()=>{const s=P20._msg||'';if(navigator.share)navigator.share({text:s}).catch(()=>{});else if(navigator.clipboard)navigator.clipboard.writeText(s).then(()=>{try{toast('📋 '+t('Copied'),'green');}catch(e){}});};
function addBtn(){const p=$('ePass');if(!p||$('p20btn'))return;const m=typeof me==='function'?me():null;if(!m||!(m.role==='owner'||(m.role==='office'&&m.title==='Payroll')))return;
  const id=typeof empEditId!=='undefined'?empEditId:null;const e=id&&(D.emps||[]).find(x=>x.id===id);if(!e||e.role!=='worker')return;
  const d=document.createElement('div');d.id='p20btn';d.style.margin='6px 0 4px';d.innerHTML='<button class="btn sec2" type="button" onclick="P20.make()">🔗 '+E(t('Sign-in link — he picks his own password'))+'</button><div id="p20out"></div>';
  p.insertAdjacentElement('afterend',d);}
try{const _o=openEmp;window.openEmp=function(){const r=_o.apply(this,arguments);try{const b=$('p20btn');if(b)b.remove();addBtn();}catch(e){}return r;};try{openEmp=window.openEmp;}catch(e){}}catch(e){}
// Baruch 11/15 (late): Settings showed field workers the company switches (hourly reminders, 9pm push, photo to close a job,
// selfie at punch-in) — and a worker could even flip the company-wide selfie switch. Only the owner / all-access see them now.
function hideCompany(){const w=$('p7notif');if(!w)return;const m=typeof me==='function'?me():null;w.style.display=m&&(m.role==='owner'||m.all)?'':'none';}
try{if(typeof window.renderMore==='function'){const _rm=window.renderMore;window.renderMore=function(){const r=_rm.apply(this,arguments);try{hideCompany();}catch(e){}return r;};try{renderMore=window.renderMore;}catch(e){}}}catch(e){}
try{const _gt=window.goTab;if(typeof _gt==='function'){window.goTab=function(){const r=_gt.apply(this,arguments);try{hideCompany();}catch(e){}return r;};try{goTab=window.goTab;}catch(e){}}}catch(e){}
setTimeout(()=>{try{hideCompany();}catch(e){}},500);
// Baruch 11/16: on the Punch page last week showed only a number per day — now each day opens like this week does:
// which job, punch in – punch out, and the hours, so a worker can check his week before it is paid.
// Baruch 11/16: last week looks different from this week — a "pay stub" card: every day with each job and its
// in – out times written out, and the total / regular / overtime at the bottom. P20.LW_OPEN: false = the card starts
// closed as one line ("Last week · 60.4 h ›") and opens with a tap.
P20.LW_OPEN=false;let lwShow=null;
P20.lwt=()=>{lwShow=!(lwShow==null?P20.LW_OPEN:lwShow);try{lastWeek();}catch(e){}};
const lwCss=document.createElement('style');lwCss.textContent='.lw{margin:6px 14px 10px;border:1px solid var(--g2);border-radius:14px;background:#fff;overflow:hidden}html[data-theme=dark] .lw{background:#1c1c1e;border-color:#2c2c2e}'
+'.lw-h{display:flex;align-items:center;gap:8px;padding:12px 14px;cursor:pointer}.lw-h b{font-size:15px;color:var(--g5)}.lw-h .d{font-size:12px;color:var(--g4)}.lw-h .t{margin-left:auto;font-size:17px;font-weight:700;color:var(--g5);white-space:nowrap}'
+'.lw-pay{display:inline-block;font-size:11px;font-weight:700;color:#1a6b3a;background:#e3f4e9;border-radius:10px;padding:2px 8px;margin-top:3px}html[data-theme=dark] .lw-pay{background:#1d3b28;color:#8fdcab}'
+'.lw-day{padding:9px 14px;border-top:1px solid var(--g1)}.lw-day .r{display:flex;justify-content:space-between;font-size:14px;font-weight:600;color:var(--g5)}.lw-j{display:flex;gap:8px;font-size:12.5px;color:var(--g4);margin-top:3px}.lw-j .tm{white-space:nowrap;min-width:118px;color:var(--g5)}.lw-j .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lw-j .h{white-space:nowrap}'
+'.lw-f{display:flex;justify-content:space-between;gap:8px;padding:11px 14px;background:var(--g1);font-size:13px;color:var(--g4)}.lw-f b{color:var(--g5)}';document.head.appendChild(lwCss);
function lastWeek(){const wb=$('weekBox');if(!wb)return;const m=typeof me==='function'?me():null;if(!m)return;
  const ref=new Date();ref.setDate(ref.getDate()-7);const s=weekStats(m.id,ref);const f=d=>new Date(d).toLocaleDateString(LOC(),{month:'short',day:'numeric'});
  const tm=ms=>fmtT(ms).replace(/\s?([AP])\.?\s?M\.?$/i,(a,x)=>' '+x.toLowerCase()+'m');const open=lwShow==null?P20.LW_OPEN:lwShow;
  let h='';for(let i=0;i<7;i++){const a=addDaysMs(s.ws,i),b=addDaysMs(s.ws,i+1);
    const L=(D.punches||[]).filter(p=>p&&p.who===m.id&&p.in>=a&&p.in<b&&!p.voided&&!p.rejected).sort((x,y)=>x.in-y.in);if(!L.length)continue;
    const k=dkey(new Date(a));const tv=TRAVEL_ON?(D.travel||[]).filter(x=>x&&travelCounts(x)&&x.who===m.id&&x.date===k):[];const tp=tv.reduce((q,x)=>q+travelPayOf(x),0);
    h+='<div class="lw-day"><div class="r"><span>'+E(new Date(a).toLocaleDateString(LOC(),{weekday:'long',day:'numeric'}))+'</span><span>'+(s.days[i]?s.days[i].toFixed(1)+' h':'–')+'</span></div>'
      +L.map(p=>{const end=p.out||p.away;return '<div class="lw-j"><span class="tm">'+tm(p.in)+' – '+(end?tm(end):'<b style="color:#c0392b">?</b>')+'</span><span class="nm">'+E(pnName(p))+'</span><span class="h">'+(end?punchDur(p).toFixed(1):'<b style="color:#c0392b">'+E(t('no punch-out'))+'</b>')+'</span></div>';}).join('')
      +(tv.length?'<div class="lw-j"><span class="tm">🚗 '+tv.length+' '+E(t(tv.length===1?'trip':'trips'))+'</span><span class="nm"></span><span class="h">'+(tp?money(tp):'')+'</span></div>':'')+'</div>';}
  wb.innerHTML='<div class="lw"><div class="lw-h" onclick="P20.lwt()"><div><b>'+E(t('Last week'))+'</b> <span class="d">'+f(s.ws)+' – '+f(s.ws+6*864e5)+'</span><div><span class="lw-pay">'+E(t('Paid this Friday'))+'</span></div></div><span class="t">'+s.total.toFixed(1)+' h</span><span style="color:var(--g4)">'+(open?'⌄':'›')+'</span></div>'
    +(open?(h||'<div class="lw-day" style="color:var(--g4);font-size:13px">'+E(t('No punches'))+'</div>')
      +'<div class="lw-f"><span>'+E(t('Regular'))+' <b>'+s.reg.toFixed(1)+'</b></span><span>'+E(t('Overtime'))+' <b>'+s.ot.toFixed(1)+'</b></span><span>'+E(t('Total'))+' <b>'+s.total.toFixed(1)+' h</b></span></div>':'')+'</div>';
  const sec=wb.previousElementSibling;if(sec&&sec.classList.contains('sec'))sec.style.display='none';}
try{const _rp=window.renderPunch;if(typeof _rp==='function'){window.renderPunch=function(){const r=_rp.apply(this,arguments);try{lastWeek();}catch(e){}return r;};try{renderPunch=window.renderPunch;}catch(e){}}}catch(e){}
try{Object.assign(ES,{"Sign-in link — he picks his own password":"Enlace de entrada — él elige su contraseña","Send / copy":"Enviar / copiar","Links are only for field workers.":"Los enlaces son solo para trabajadores de campo.","Could not make the link.":"No se pudo hacer el enlace.","paid this week":"se paga esta semana","Paid this Friday":"Se paga este viernes","Last week":"Semana pasada"});}catch(e){}
})();
