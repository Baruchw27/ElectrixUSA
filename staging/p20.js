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
  if(info&&info.lang==='en')lg='en';if(!c&&!info){paint(tx('net'));return;}paint();}
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
try{Object.assign(ES,{"Sign-in link — he picks his own password":"Enlace de entrada — él elige su contraseña","Send / copy":"Enviar / copiar","Links are only for field workers.":"Los enlaces son solo para trabajadores de campo.","Could not make the link.":"No se pudo hacer el enlace."});}catch(e){}
})();
