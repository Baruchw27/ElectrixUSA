/* Electrix USA — P14: Shia's task page, layout D (Baruch 2026-11-05 00:41: "I think I want to go with number D for now" +
   "it should be drop downs by everything … it has one kind that has 20 tasks … close that up to be able to see everything else").
   Grouped boxes like iPhone Settings + a progress ring. Every box title folds its box (remembered per phone).
   Picked features (Baruch 11/4–11/5): 1 waiting on others by person with days + Nudge · 2 waiting for a reply until a day ·
   3 show by When · 4 type counts as quick filters · 5 days-old tag · 6 repeating tasks · 7 show by From ·
   12 cover when someone is out · 14 done today with undo · no Open/Done switch · other people's things in their own box ("Others").
   Only for the people in P10's LIST_OFFICE list (Shia) for now; everyone else keeps their page. Off: window.EX_P14_OFF. */
(function(){
if(window.EX_P14_OFF)return;
const $=id=>document.getElementById(id);
const tt=x=>{try{return typeof t==='function'?t(x):x;}catch(e){return x;}};
const M=()=>{try{return me();}catch(e){return null;}};
const D1=86400000;
const day0=()=>{const d=new Date();d.setHours(0,0,0,0);return d.getTime();};
const ymd=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const fromYmd=s=>new Date(s+'T12:00').getTime();
const today=()=>ymd(Date.now());
const OPEN=j=>j&&j.status!=='done'&&!j.deleted;
const due=j=>{if(j&&j.dueDate&&/^\d{4}-\d{2}-\d{2}$/.test(j.dueDate)){try{return gpDay(new Date(j.dueDate+'T12:00'));}catch(e){}}try{return gpDue(j);}catch(e){return null;}};
const late=j=>{const d=due(j);return d!==null&&d<day0();};
const first=id=>String(nameOf(id)||'').split(' ')[0];
const short=s=>String(s||'').split(',')[0];
const txt=j=>{let x='';try{x=jobText(j);}catch(e){x=j.desc||'';}return String(x||'').replace(/^O&R · [^:]*: /,'');};
const boss=m=>!!m&&(m.role==='owner'||m.role==='manager'||!!m.all||(m.role==='office'&&m.title==='Payroll'));
const fdate=s=>{try{return new Date(fromYmd(s)).toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'});}catch(e){return s;}};
const ftime=ms=>{try{return new Date(ms).toLocaleTimeString(LOC(),{hour:'numeric',minute:'2-digit'});}catch(e){return '';}};
const isMine=(j,m)=>has(j,m.id)||(m.crew&&has(j,m.crew));

/* drawn icons (no emojis) */
const P={insp:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
 doc:'<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h7M9 17h7"/>',box:'<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
 bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',plan:'<path d="M3 5v14a2 2 0 0 0 2 2h14V7H7a2 2 0 0 1-2-2 2 2 0 0 1 2-2h12v4"/><path d="M9 11h6v6H9z"/>',
 dollar:'<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
 check:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',tick:'<path d="m5 12 5 5 9-10"/>',chev:'<path d="m9 6 6 6-6 6"/>',back:'<path d="m15 6-6 6 6 6"/>',
 alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h0"/>',cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
 pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',rep:'<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
 msg:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',cam:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
 away:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 9-5.2M16 16l5 5M21 16l-5 5"/>',undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'};
const ic=(n,c)=>'<svg class="p14i'+(c?' '+c:'')+'" viewBox="0 0 24 24" aria-hidden="true">'+(P[n]||'')+'</svg>';
const TYPES=[['insp','insp','Inspections'],['bill','doc','Billing'],['mat','box','Material'],['orr','bolt','O&R'],['pay','clock','Payroll'],['est','plan','Estimates'],['coll','dollar','Collections'],['other','list','Other']];
const typeOf=j=>{try{return window.P10_typeOf(j);}catch(e){return 'other';}};
const REP={d:'Every day',w:'Every week',m:'Every month'};

/* remembered per phone */
const LS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}return null;};
const FOLD_DEF={done:1,park:1};
const folded=k=>{const v=LS('p14f_'+k);return v===null?!!FOLD_DEF[k]:v==='1';};
const byGet=()=>{const v=LS('p14by');return ['job','type','when','from'].includes(v)?v:'job';};
const tfGet=()=>LS('p14tf')||'';
const parked=j=>!!(j.park&&j.park>today());
const ageTag=j=>{if(!j.ts)return '';const n=Math.floor((day0()-gpDay(j.ts))/D1);return '<span class="p14age'+(n>=7?' r':'')+'">'+(n<=0?esc(tt('today')):n+esc(tt('d')))+'</span>';};

/* ── who's out / who covers (Baruch or Shia set it). Kept as one text value in the app's settings. ── */
const outMap=()=>{try{const o=JSON.parse(D.taskOut||'{}');return o&&typeof o==='object'?o:{};}catch(e){return {};}};
const outSave=o=>{const k=Object.keys(o);if(k.length)D.taskOut=JSON.stringify(o);else delete D.taskOut;};
function coverAdd(j,who,cov){const L=tos(j).filter(Boolean);if(L.includes(cov)||j.cov)return false;j.to=L.concat(cov);j.cov={o:who,c:cov};return true;}
function setOut(who,cov,until){const m=M();if(!m||!who||!cov||who===cov)return;const o=outMap();o[who]={c:cov,u:until||'',by:m.id,ts:Date.now()};outSave(o);
  let n=0;(D.jobs||[]).forEach(j=>{if(OPEN(j)&&has(j,who)&&coverAdd(j,who,cov))n++;});save();
  try{pushTo([cov],()=>(t('You are covering for')+' '+nameOf(who)+(until?' '+t('until')+' '+fdate(until):'')+' — '+n+' '+t('tasks')),'info');}catch(e){}
  toast('✓ '+first(cov)+' '+tt('covers for')+' '+first(who)+' · '+n+' '+tt('tasks'),'green');}
function setBack(who,quiet){const o=outMap();if(!o[who]&&!quiet)return;delete o[who];outSave(o);
  (D.jobs||[]).forEach(j=>{if(!j.cov||j.cov.o!==who)return;if(OPEN(j))j.to=tos(j).filter(x=>x!==j.cov.c);delete j.cov;});save();}
function outExpire(){const m=M();if(!boss(m))return;const o=outMap();let ch=false;Object.keys(o).forEach(k=>{if(o[k].u&&o[k].u<today()){setBack(k,true);ch=true;}});return ch;}

/* ── the page ── */
const css=`
#pg-jobs.p14{--p14card:#fff;--p14line:#eeeff1;--p14mut:#80858f;--p14ink:#0f1115;--p14chip:#ebecef;--p14ok:#1e8e4e;--p14okS:#e6f4ec;--p14red:#d93a2b;--p14redS:#fdecea;--p14blue:#2563eb;--p14blueS:#eaf1ff;--p14ring:#e3e5e8}
html[data-theme=dark] #pg-jobs.p14,html[data-theme=dark] #m-p14o{--p14card:#1c1c1e;--p14line:#2c2c2e;--p14mut:#8e8e93;--p14ink:#f2f2f7;--p14chip:#2c2c2e;--p14ok:#4cd98a;--p14okS:#163323;--p14red:#ff6b5e;--p14redS:#3a1714;--p14blue:#7aa7ff;--p14blueS:#17264a;--p14ring:#2c2c2e}
#m-p14o{--p14card:#fff;--p14line:#eeeff1;--p14mut:#80858f;--p14ink:#0f1115;--p14chip:#ebecef;--p14ok:#1e8e4e;--p14okS:#e6f4ec;--p14red:#d93a2b;--p14redS:#fdecea;--p14blue:#2563eb;--p14blueS:#eaf1ff;--p14ring:#e3e5e8}
#pg-jobs.p14 #jobChips,#pg-jobs.p14 #p2snzNote,#pg-jobs.p14 .stats,#pg-jobs.p14 #addJobBtn,#pg-jobs.p14 #p10chkbox{display:none!important}
#pg-jobs.p14 div:has(>#vOpen){display:none!important}
.p14i{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.p14top{display:flex;align-items:center;gap:13px;margin:0 0 12px}
.p14ring{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none}
.p14ring i{width:42px;height:42px;border-radius:50%;background:var(--bg,#f2f2f7);display:flex;align-items:center;justify-content:center;font-style:normal;font-size:12.5px;font-weight:700;color:var(--p14ink)}
html[data-theme=dark] .p14ring i{background:#000}
.p14top b{display:block;font-size:15px;font-weight:650;color:var(--p14ink)}.p14top small{display:block;font-size:12.5px;color:var(--p14mut);margin-top:1px}
.p14by{display:flex;align-items:center;gap:2px;padding:3px;border-radius:11px;background:var(--p14chip);margin:0 0 8px;overflow-x:auto}
.p14by span{font-size:12px;color:var(--p14mut);padding:0 6px 0 7px;flex:none}
.p14by button{border:0;background:none;font:600 13px/1 inherit;font-family:inherit;padding:7px 12px;border-radius:8px;color:var(--p14mut);flex:1;white-space:nowrap}
.p14by button.on{background:var(--p14card);color:var(--p14ink);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.p14tf{display:flex;gap:6px;overflow-x:auto;margin:0 -16px 4px;padding:2px 16px 6px;scrollbar-width:none}.p14tf::-webkit-scrollbar{display:none}
.p14tf button{flex:none;display:inline-flex;align-items:center;gap:5px;border:0;box-shadow:0 0 0 1px var(--p14line);background:var(--p14card);color:var(--p14ink);border-radius:999px;padding:6px 11px;font:600 12.5px/1 inherit;font-family:inherit}
.p14tf button em{font-style:normal;color:var(--p14mut);font-weight:600}
.p14tf button.on{background:var(--p14ink);color:var(--p14card);box-shadow:none}.p14tf button.on em{color:inherit;opacity:.7}
.p14h{display:flex;align-items:center;gap:6px;padding:14px 4px 6px 14px;font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--p14mut);cursor:pointer;-webkit-user-select:none;user-select:none}
.p14h .n{margin-left:auto;font-weight:600;letter-spacing:0}.p14h .lt{color:var(--p14red);text-transform:none;letter-spacing:0}
.p14h .cv{transition:transform .15s;transform:rotate(90deg);width:14px;height:14px}.p14h.fold .cv{transform:none}
.p14h.r{color:var(--p14red)}.p14h.b{color:var(--p14blue)}.p14h.g{color:var(--p14ok)}
.p14h.fold+.p14box{display:none}
.p14box{background:var(--p14card);border-radius:14px;overflow:hidden}
.p14r{display:flex;gap:11px;align-items:flex-start;padding:10px 13px;cursor:pointer}
.p14r+.p14r,.p14box>.p14ln+.p14ln{border-top:1px solid var(--p14line)}
.p14c{flex:none;width:21px;height:21px;border-radius:50%;border:1.8px solid #c7c9ce;background:none;margin-top:1px;padding:0;cursor:pointer}
.p14r.red .p14c{border-color:var(--p14red)}
.p14cm{border:none!important;display:flex;align-items:center;justify-content:center;color:#b7791f;cursor:pointer}.p14cm .p14i{width:19px;height:19px}
.p14r .cv{flex:none;width:16px;height:16px;color:var(--g3);align-self:center}
.p14r .p14more{flex:0 0 auto!important;width:34px!important;max-width:34px!important;min-width:0!important;height:30px;margin:0!important;align-self:center;border:none!important;background:none!important;box-shadow:none!important;color:var(--g4);font-size:22px;line-height:1;padding:0!important;cursor:pointer;font-family:inherit}
.p14r>.w{flex:1 1 auto;min-width:0}
.p14r .w{flex:1;min-width:0}.p14r .w b{display:block;font-weight:500;font-size:15px;line-height:1.3;color:var(--p14ink)}
.p14r .w small{display:block;color:var(--p14mut);font-size:12.5px;margin-top:2px}.p14r .w small .l{color:var(--p14red);font-weight:600}
.p14age{display:inline-block;font-size:11px;font-weight:600;color:var(--p14mut);background:var(--p14chip);border-radius:6px;padding:1px 6px;margin-left:6px;vertical-align:2px}
.p14age.r{color:var(--p14red);background:var(--p14redS)}
.p14tag{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:var(--p14blue);margin-left:6px;vertical-align:1px}.p14tag .p14i{width:12px;height:12px}
.p14rt{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-size:11px;color:var(--p14mut);font-weight:600;align-self:center}
.p14btn{border:0;border-radius:999px;padding:6px 12px;font:600 12.5px/1 inherit;font-family:inherit;background:var(--p14blueS);color:var(--p14blue);cursor:pointer;flex:none;align-self:center}
.p14btn.g{background:var(--p14chip);color:var(--p14ink)}.p14btn[disabled]{opacity:.55}
.p14dn .p14c{background:var(--p14ok);border-color:var(--p14ok);display:flex;align-items:center;justify-content:center;color:#fff}.p14dn .p14c .p14i{width:13px;height:13px;stroke-width:2.6}
.p14dn .w b{text-decoration:line-through;color:var(--p14mut)!important}
.p14dn.cx .p14c{background:var(--p14mut);border-color:var(--p14mut)}
.p14ln{display:flex;align-items:center;gap:10px;padding:13px 14px;font-size:15px;font-weight:600;color:var(--p14ink);cursor:pointer}
.p14ln .n{margin-left:auto;font-size:13.5px;color:var(--p14mut);font-weight:500}.p14ln .cv{color:#b5b8be}
.p14ln.b>.p14i:first-child{color:var(--p14blue)}.p14ln.g>.p14i:first-child{color:var(--p14ok)}.p14ln.o>.p14i:first-child{color:#c27c0e}
.p14pp{font-size:14px;font-weight:650;color:var(--p14ink);padding:12px 14px 2px;display:flex}.p14pp span{margin-left:auto;color:var(--p14mut);font-weight:500;font-size:13px}
.p14chk{padding:10px 13px}.p14chk+.p14chk{border-top:1px solid var(--p14line)}.p14chk b{font-size:14.5px;font-weight:600;color:var(--p14ink)}.p14chk small{display:block;color:var(--p14mut);font-size:12px;margin-top:2px}
.p14chk .bt{display:flex;gap:6px;margin-top:8px}.p14chk .ph{display:flex;gap:5px;margin-top:6px;overflow-x:auto}.p14chk .ph img{width:44px;height:44px;object-fit:cover;border-radius:7px;flex:none}
.p14empty{text-align:center;color:var(--p14mut);padding:22px 0;font-size:13.5px}
.p14more{display:block;width:100%;border:0;background:none;color:var(--p14blue);font:600 13.5px/1 inherit;font-family:inherit;padding:12px}
#m-p14o.ov{padding:0;align-items:stretch;background:var(--bg,#f2f2f7);z-index:99}
html[data-theme=dark] #m-p14o.ov{background:#000}
#m-p14o>.md{max-width:640px;width:100%;margin:0 auto;height:100%;max-height:none;border-radius:0;padding:calc(env(safe-area-inset-top) + 8px) 16px 40px;background:transparent!important;overflow-y:auto;-webkit-overflow-scrolling:touch;color:var(--p14ink)}
#m-p14o .mback{display:none!important}
.p14oh{display:flex;align-items:center;gap:8px;padding:6px 0 2px}.p14oh button{border:0;background:none;color:var(--p14blue);padding:6px 4px 6px 0;display:flex}
.p14oh .p14i{width:24px;height:24px}.p14oh h2{font-size:28px;font-weight:700;margin:0;color:var(--p14ink)}
.p14osub{font-size:13.5px;color:var(--p14mut);margin:0 0 4px}
#p14det{margin:8px 0}#p14det .rw{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0}
#p14det label{font-size:11px;font-weight:700;letter-spacing:.4px;color:var(--g4);text-transform:uppercase;margin:0;flex-basis:100%}
.p14seg{display:flex;flex-wrap:wrap;gap:6px}.p14seg button{border:1px solid var(--g2,#dcdde1);background:var(--card,#fff);color:inherit;border-radius:16px;padding:5px 11px;font-size:12.5px;font-family:inherit}
.p14seg button.on{background:#1f2937;color:#fff;border-color:#1f2937}
html[data-theme=dark] .p14seg button{background:#1c1c1e;border-color:#3a3a3c;color:#f2f2f7}html[data-theme=dark] .p14seg button.on{background:#e5e7eb;color:#111;border-color:#e5e7eb}
.p14park{display:flex;align-items:center;gap:8px;background:#fff6e5;color:#8a5a00;border-radius:10px;padding:8px 10px;font-size:13px;font-weight:600}
html[data-theme=dark] .p14park{background:#3a2a0a;color:#ffc861}
#p14newrep{margin-top:10px}#p14newrep label{display:block;margin-bottom:5px}
`;
const st=document.createElement('style');st.id='p14css';st.textContent=css;document.head.appendChild(st);

const P14=window.P14={};
P14.fold=k=>{const f=!folded(k);LS('p14f_'+k,f?'1':'0');document.querySelectorAll('.p14h[data-k="'+CSS.escape(k)+'"]').forEach(h=>h.classList.toggle('fold',f));};
const head=(k,label,n,cls,icon,extra)=>'<div class="p14h'+(cls?' '+cls:'')+(folded(k)?' fold':'')+'" data-k="'+esc(k)+'" onclick="P14.fold(\''+jsq(k)+'\')">'+(icon?ic(icon):'')+'<span>'+esc(label)+'</span>'+(extra||'')+'<span class="n">'+n+'</span>'+ic('chev','cv')+'</div>';

function matRow(j,m,o){o=o||{};const I=jsq(j.__mat);const lt=late(j);const bits=[];
  if(o.site!==false&&(j.site||j.addr))bits.push(esc(short(j.site?siteName(j.site):j.addr)));
  if(o.from!==false&&j.from&&j.from!==m.id)bits.push(esc(tt('from'))+' '+esc(first(j.from)));
  if(j.dueDate)bits.push(lt?'<span class="l">'+esc(tt('Late'))+'</span>':esc(tt('get it ready'))+' '+esc(j.dueDate===today()?tt('today'):j.dueDate===ymd(day0()+D1)?tt('tomorrow'):fdate(j.dueDate)));
  if(j.need)bits.push(esc(tt('needed'))+': '+esc(j.needD&&j.needD!==today()&&j.needD!==ymd(day0()+D1)?fdate(j.needD):tt(j.need)));
  if(o.park)bits.push(esc(tt('back on'))+' '+esc(fdate(j.park)));
  const tag='<span class="p14tag">'+ic('box')+esc(tt(j.part?'Partly ready':'Material request'))+'</span>';
  const right=o.park?'<button class="p14btn g" onclick="event.stopPropagation();P14.matSet(\''+I+'\',\'park\',null)">'+esc(tt('Back now'))+'</button>'
    :'<button class="p14more" aria-label="'+esc(tt('Options'))+'" onclick="event.stopPropagation();P14.matOpts(\''+I+'\')">⋯</button>';
  return '<div class="p14r'+(j.pri||lt?' red':'')+'" onclick="P14.mat(\''+I+'\')"><span class="p14c p14cm">'+ic('box')+'</span>'
    +'<div class="w"><b>'+esc(j.desc)+ageTag(j)+tag+'</b>'+(bits.length?'<small>'+bits.join(' · ')+'</small>':'')+'</div>'+right+'</div>';}
// task options for a material request (saved on the request itself): when to get it ready, urgent, waiting for a reply
P14.matSet=(id,f,v)=>{const x=(D.mats||[]).find(r=>r.id===id);if(!x)return;if(v===null||v===undefined)delete x[f];else x[f]=v;
  try{if(typeof liTouch==='function')liTouch('mats',x);else save();}catch(e){save();}rerender();};
P14.matOpts=id=>{const x=(D.mats||[]).find(r=>r.id===id);if(!x||!window.P15||!P15.list)return P14.mat(id);
  const t=today(),tm=ymd(day0()+D1);let d2=day0()+2*D1;while([0,6].includes(new Date(d2).getDay()))d2+=D1;const d2y=ymd(d2);const cur=doByYmd(x);
  const mark=v=>cur===v?' ✓':'';const isPri=x.pri===undefined?/asap/i.test(x.when||''):!!x.pri;
  const pickDay=()=>askPrompt(tt('Get it ready by'),[{label:tt('Day'),value:cur||t,type:'date'}],([v])=>{v=String(v||'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))P14.matSet(id,'doBy',v);});
  const waitDay=()=>{let d=Date.now()+3*D1;if(new Date(d).getDay()===6)d+=D1;askPrompt(tt('Waiting for a reply'),[{label:tt('Put it back on my list on'),value:ymd(d),type:'date'}],([v])=>{v=String(v||'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<=t){toast(tt('Pick a day after today'));return;}P14.matSet(id,'park',v);toast(tt('Waiting for a reply')+' · '+tt('back on')+' '+fdate(v),'green');});};
  P15.list(matTitle(x),tt('needed')+': '+tt(x.when||'—')+(x.site?' · '+short(siteName(x.site)):''),[
    {t:tt('Open the request'),go:()=>P14.mat(id)},
    {t:tt('Get it ready today')+mark(t),go:()=>P14.matSet(id,'doBy',t)},
    {t:tt('Get it ready tomorrow')+mark(tm),go:()=>P14.matSet(id,'doBy',tm)},
    {t:tt('Get it ready on')+' '+fdate(d2y)+mark(d2y),go:()=>P14.matSet(id,'doBy',d2y)},
    {t:tt('Pick a day…'),go:pickDay},
    {t:isPri?tt('Not urgent'):tt('Mark urgent'),go:()=>P14.matSet(id,'pri',!isPri)},
    x.park?{t:tt('Back now'),go:()=>P14.matSet(id,'park',null)}:{t:tt('Waiting for a reply'),s:tt('Hide it until a day you pick'),go:waitDay}]);};
function row(j,m,o){if(j&&j.__mat)return matRow(j,m,o);o=o||{};const I=jsq(j.id);const lt=late(j);const red=!!j.pri||lt;
  const bits=[];
  if(o.site!==false&&j.site)bits.push(esc(short(siteName(j.site))));
  if(o.from!==false&&j.from&&j.from!==m.id)bits.push(esc(tt('from'))+' '+esc(first(j.from)));
  else if(j.orrAuto&&o.from!==false)bits.push(esc(tt('from the app')));
  if(j.due||j.dueDate)bits.push(lt?'<span class="l">'+esc(tt('Late'))+'</span>':esc(j.dueDate&&!j.due?fdate(j.dueDate):tt(j.due)));
  if(o.park)bits.push(esc(tt('back on'))+' '+esc(fdate(j.park)));
  const tags=(j.rep&&REP[j.rep]?'<span class="p14tag">'+ic('rep')+esc(tt(REP[j.rep]))+'</span>':'')+(j.needPhoto?'<span class="p14tag">'+ic('cam')+esc(tt('photo needed'))+'</span>':'');
  let tick='';try{tick=jobTicks(j);}catch(e){}
  const right=o.park?'<button class="p14btn g" onclick="event.stopPropagation();P14.unpark(\''+I+'\')">'+esc(tt('Back now'))+'</button>':'<span class="p14rt">'+tick+'</span>';
  return '<div class="p14r'+(red?' red':'')+'" onclick="P14.open(\''+I+'\')"><button class="p14c" aria-label="'+esc(tt('Done'))+'" onclick="event.stopPropagation();markDone(\''+I+'\')"></button>'
    +'<div class="w"><b>'+esc(txt(j))+ageTag(j)+tags+'</b>'+(bits.length?'<small>'+bits.join(' · ')+'</small>':'')+'</div>'+right+'</div>';}
function doneRow(j,m,o){o=o||{};const I=jsq(j.id);const who=(j.cancel?tt('Cancelled')+(j.cancelBy&&j.cancelBy!==m.id?' '+tt('by')+' '+first(j.cancelBy):'')+(j.cancelWhy?' ('+j.cancelWhy+')':''):(j.doneBy&&j.doneBy!==m.id?first(j.doneBy):''));const whoS=who?who+' · ':'';
  return '<div class="p14r p14dn'+(j.cancel?' cx':'')+'" onclick="P14.open(\''+I+'\')"><span class="p14c">'+ic('tick')+'</span><div class="w"><b>'+esc(txt(j))+'</b><small>'+(j.site&&o.site!==false?esc(short(siteName(j.site)))+' · ':'')+esc(whoS)+esc(ftime(j.doneAt))+'</small></div>'
    +(o.undo?'<button class="p14btn g" onclick="event.stopPropagation();P14.undo(\''+I+'\')">'+esc(tt('Undo'))+'</button>':'')+'</div>';}
function checkRow(j){const I=jsq(j.id);const ph=(j.photos||[]).filter(p=>p&&p.d).slice(-4);
  return '<div class="p14chk"><b>'+esc(first(j.doneBy))+' '+esc(tt('finished'))+': '+esc(txt(j))+'</b><small>'+(j.site?esc(short(siteName(j.site)))+' · ':'')+esc(ftime(j.doneAt))+'</small>'
    +(ph.length?'<div class="ph">'+ph.map(p=>'<img src="'+safeSrc(p.d)+'" onclick="P14.open(\''+I+'\')">').join('')+'</div>':'')
    +'<div class="bt"><button class="p14btn" style="background:var(--p14okS);color:var(--p14ok)" onclick="P10.ok(\''+I+'\')">'+esc(tt('OK'))+'</button><button class="p14btn g" style="color:var(--p14red)" onclick="P10.bad(\''+I+'\')">'+esc(tt('Not done right'))+'</button></div></div>';}

const sortT=(a,b)=>(late(b)-late(a))||((due(a)===null)-(due(b)===null))||((due(a)||0)-(due(b)||0))||((a.ts||0)-(b.ts||0));
function groups(L,by){const G={},order=[];const put=(k,lab,icon,j,rank)=>{if(!G[k]){G[k]={k,lab,icon,rank:rank||0,L:[]};order.push(k);}G[k].L.push(j);};
  if(by==='type'){L.forEach(j=>{const k=typeOf(j);const T=TYPES.find(x=>x[0]===k)||TYPES[7];put('t_'+k,tt(T[2]),T[1],j,TYPES.indexOf(T));});}
  else if(by==='when'){const td=day0();L.forEach(j=>{const d=due(j);
      if(d!==null&&d<td)put('w_late',tt('Late'),'alert',j,0);else if(d===td||j.due==='ASAP')put('w_today',tt('Today'),'cal',j,1);
      else if(d!==null&&d<=td+D1)put('w_tom',tt('Tomorrow'),'cal',j,2);else if(d!==null&&d<=td+7*D1)put('w_week',tt('Next 7 days'),'cal',j,3);
      else if(d!==null)put('w_later',tt('Later'),'cal',j,4);else put('w_none',tt('No date'),'list',j,5);});}
  else if(by==='from'){const m=M();L.forEach(j=>{const f=j.orrAuto?'app':(j.from||'');put('f_'+(f||'none'),f==='app'?tt('The app'):f===m.id?tt('My own'):f?tt('From')+' '+nameOf(f):tt('Other'),'users',j,f===m.id?2:f==='app'?1:0);});}
  else{L.forEach(j=>{const k=j.site||'';put('s_'+(k||'none'),k?short(siteName(k)):tt('Other tasks'),'pin',j,k?0:1);});}
  const out=order.map(k=>G[k]);out.forEach(g=>g.L.sort(sortT));
  if(by==='job'||by==='from')out.sort((a,b)=>(a.rank-b.rank)||(b.L.some(late)-a.L.some(late))||String(a.lab).localeCompare(String(b.lab)));else out.sort((a,b)=>a.rank-b.rank);
  return out;}

/* Baruch 11/6: Menachem's material requests show on his task page like a task; tapping one opens the real request.
   They are not tasks (nothing new is saved) — the line goes away when the request is ready / picked up / done. */
const matHandler=m=>!!m&&m.role==='office'&&m.title==='Material';
const matState=x=>{try{return matSt(x);}catch(e){return x.status==='delivered'?'completed':x.status==='ordered'?'ready':'requested';}};
function matTitle(x){let L=[];try{L=liItems(x).filter(i=>!i.done).map(i=>(i.q?i.q+'× ':'')+(i.t||i.name||''));}catch(e){}
  if(!L.length)L=String(x.items||'').split('\n').map(z=>z.trim()).filter(z=>z&&!/^📍/.test(z));
  L=L.filter(Boolean);return (L[0]||tt('Material request')).slice(0,70)+(L.length>1?' +'+(L.length-1):'');}
// when the crew needs it, read from what they picked ("Today", "Tomorrow morning", "Friday, Nov 6", "This week", "ASAP")
function needYmd(x){const w=String(x.when||'').toLowerCase();const t0=day0();if(!w)return '';
  if(/asap|today|this morning|hoy|urgente/.test(w))return ymd(gpDay(x.ts||Date.now()));   // asked for 'today' 3 days ago = late
  if(/tomorrow|mañana/.test(w)){const b=gpDay(x.ts||Date.now());return ymd(b+D1);}
  if(/this week|esta semana/.test(w)){const d=new Date(gpDay(x.ts||Date.now()));const add=(5-d.getDay()+7)%7;return ymd(d.getTime()+add*D1);}
  const mm=w.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/);
  if(mm){const MO=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(mm[1]);const y=new Date().getFullYear();let d=new Date(y,MO,+mm[2],12);if(d.getTime()<t0-180*D1)d=new Date(y+1,MO,+mm[2],12);return ymd(d.getTime());}
  return '';}
// the day Menachem should get it ready: what he set, else the working day before it is needed (never before today)
function prevWork(y){let d=fromYmd(y)-D1;while([0,6].includes(new Date(d).getDay()))d-=D1;return ymd(d);}
function doByYmd(x){if(x.doBy)return x.doBy;const n=needYmd(x);if(!n)return '';const t=today();if(n<=t)return n;const p=prevWork(n);return p<t?t:p;}
function matTasks(m){if(!matHandler(m))return [];
  return (D.mats||[]).filter(x=>x&&!x.deleted&&['requested','partial'].includes(matState(x))&&!(Array.isArray(x.assign)&&x.assign.length&&!x.assign.includes(m.id)))
    .map(x=>({id:'mat:'+x.id,__mat:x.id,kind:'mat',status:'open',desc:matTitle(x),site:x.site||'',addr:x.addr||'',from:x.from,ts:x.ts||0,need:x.when||'',needD:needYmd(x),dueDate:doByYmd(x)||undefined,park:x.park||undefined,part:matState(x)==='partial',pri:x.pri===undefined?/asap/i.test(x.when||''):!!x.pri}));}
P14.mat=id=>{try{if(typeof openList==='function')openList('mats',id);else goTab('mat');}catch(e){try{goTab('mat');}catch(x){}}};
function data(m){const all=(D.jobs||[]).filter(j=>j&&!j.deleted);const t0=day0();
  const mineAll=all.filter(j=>isMine(j,m));
  const open=mineAll.filter(OPEN);
  const cover=open.filter(j=>j.cov&&j.cov.c===m.id);
  const park0=open.filter(j=>!(j.cov&&j.cov.c===m.id)&&parked(j));
  const MT=matTasks(m);
  const mine=open.filter(j=>!(j.cov&&j.cov.c===m.id)&&!parked(j)).concat(MT.filter(j=>!parked(j)));
  const doneToday=mineAll.filter(j=>j.status==='done'&&(j.doneAt||0)>=t0&&(j.doneBy===m.id||!j.doneBy)).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  const sent=all.filter(j=>j.from===m.id&&!isMine(j,m));
  const waiting=sent.filter(OPEN);
  const othersDone=all.filter(j=>j.from===m.id&&j.status==='done'&&(j.doneAt||0)>=t0&&j.doneBy&&j.doneBy!==m.id).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  const chk=all.filter(j=>j.status==='done'&&j.check&&j.chk==='wait'&&j.from===m.id).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  const park=park0.concat(MT.filter(parked));
  return {mine,park,cover,doneToday,waiting,othersDone,chk};}

function render(m,el){const pg=$('pg-jobs');pg.classList.add('p14');
  if(outExpire())m=M();
  const X=data(m);const by=byGet();let tf=tfGet();
  const cnt={};X.mine.forEach(j=>{const k=typeOf(j);cnt[k]=(cnt[k]||0)+1;});
  if(tf&&!cnt[tf]){tf='';LS('p14tf',null);}
  const pass=j=>!tf||typeOf(j)===tf;
  const mine=X.mine.filter(pass),park=X.park.filter(pass);
  const doneN=X.doneToday.length,left=X.mine.length,tot=doneN+left,pct=tot?Math.round(doneN*100/tot):0;
  let h='<div class="p14top"><div class="p14ring" style="background:conic-gradient(var(--p14ok) 0 '+pct+'%,var(--p14ring) '+pct+'% 100%)"><i>'+doneN+'/'+tot+'</i></div><div><b>'+esc(new Date().toLocaleDateString(LOC(),{weekday:'long',month:'short',day:'numeric'}))+'</b><small>'+(left?left+' '+esc(tt('left today')):esc(tt('All caught up.')))+'</small></div></div>';
  h+='<div class="p14by"><span>'+esc(tt('Show by'))+'</span>'+[['job','Job'],['type','Type'],['when','When'],['from','From']].map(([k,l])=>'<button class="'+(by===k?'on':'')+'" onclick="P14.by(\''+k+'\')">'+esc(tt(l))+'</button>').join('')+'</div>';
  const types=TYPES.filter(x=>cnt[x[0]]);
  if(types.length>1)h+='<div class="p14tf"><button class="'+(tf?'':'on')+'" onclick="P14.tf(\'\')">'+esc(tt('All'))+' <em>'+X.mine.length+'</em></button>'+types.map(([k,icn,l])=>'<button class="'+(tf===k?'on':'')+'" onclick="P14.tf(\''+k+'\')">'+ic(icn)+esc(tt(l))+' <em>'+cnt[k]+'</em></button>').join('')+'</div>';
  if(X.chk.length)h+=head('chk',tt('Check it'),X.chk.length,'g','check')+'<div class="p14box">'+X.chk.map(checkRow).join('')+'</div>';
  const urg=mine.filter(j=>j.pri).sort(sortT),rest=mine.filter(j=>!j.pri);
  if(urg.length)h+=head('urg',tt('Urgent'),urg.length,'r','alert')+'<div class="p14box">'+urg.map(j=>row(j,m)).join('')+'</div>';
  groups(rest,by).forEach(g=>{const lateN=by==='when'?0:g.L.filter(late).length;
    h+=head(g.k,g.lab,g.L.length,g.k==='w_late'?'r':'',by==='job'?'':g.icon,lateN?' <span class="lt">· '+lateN+' '+esc(tt('late'))+'</span>':'')
      +'<div class="p14box">'+g.L.map(j=>row(j,m,{site:by!=='job',from:by!=='from'})).join('')+'</div>';});
  if(!mine.length&&!X.chk.length)h+='<div class="p14empty">'+esc(tt(tf?'Nothing of this type.':'All caught up.'))+'</div>';
  // covering for someone who is out
  const CV={};X.cover.filter(pass).forEach(j=>{(CV[j.cov.o]=CV[j.cov.o]||[]).push(j);});
  Object.keys(CV).forEach(o=>{const u=(outMap()[o]||{}).u;h+=head('cov_'+o,tt('Covering for')+' '+first(o)+(u?' · '+tt('until')+' '+fdate(u):''),CV[o].length,'b','away')+'<div class="p14box">'+CV[o].sort(sortT).map(j=>row(j,m)).join('')+'</div>';});
  if(park.length)h+=head('park',tt('Waiting for a reply'),park.length,'','clock')+'<div class="p14box">'+park.sort((a,b)=>String(a.park).localeCompare(String(b.park))).map(j=>row(j,m,{park:true})).join('')+'</div>';
  // other people's things — their own box (opens the Others page)
  const outN=Object.keys(outMap()).length;
  h+=head('oth',tt('Others'),'','b','')+'<div class="p14box">'
    +'<div class="p14ln b" onclick="P14.others()">'+ic('users')+'<span>'+esc(tt('Waiting on others'))+'</span><span class="n">'+X.waiting.length+'</span>'+ic('chev','cv')+'</div>'
    +'<div class="p14ln g" onclick="P14.others()">'+ic('check')+'<span>'+esc(tt('Done by others today'))+'</span><span class="n">'+X.othersDone.length+'</span>'+ic('chev','cv')+'</div>'
    +(boss(m)||outN?'<div class="p14ln o" onclick="P14.others(\'out\')">'+ic('away')+'<span>'+esc(tt("Who's out"))+'</span><span class="n">'+outN+'</span>'+ic('chev','cv')+'</div>':'')+'</div>';
  h+=head('done',tt('Done today'),doneN,'g','check')+'<div class="p14box">'+(doneN?X.doneToday.map(j=>doneRow(j,m,{undo:true})).join(''):'<div class="p14empty" style="padding:14px">'+esc(tt('Nothing done yet today'))+'</div>')+'</div>';
  el.innerHTML=h;
  if(!$('m-p14o')||$('m-p14o').classList.contains('hid'))return;renderOthers();}
P14.render=render;
const rerender=()=>{try{renderJobs();}catch(e){}};
P14.by=v=>{LS('p14by',v);rerender();};
P14.tf=v=>{LS('p14tf',v||null);rerender();};
P14.open=id=>{try{openJobDetail(id);}catch(e){}};
P14.undo=id=>{const j=(D.jobs||[]).find(x=>x.id===id);if(!j)return;j.status='open';delete j.doneAt;delete j.doneBy;delete j.cancel;delete j.cancelBy;delete j.cancelWhy;
  if(j.chk==='wait')j.chk='';Object.keys(j).forEach(k=>{if(k.startsWith('done_'))delete j[k];});save();rerender();toast(tt('Back on your list'),'green');};
P14.unpark=id=>{const j=(D.jobs||[]).find(x=>x.id===id);if(!j)return;delete j.park;delete j.parkBy;save();rerender();try{if(!$('m-jobd').classList.contains('hid'))openJobDetail(id);}catch(e){}};
P14.park=id=>{const j=(D.jobs||[]).find(x=>x.id===id);const m=M();if(!j||!m)return;let d=Date.now()+3*D1;if(new Date(d).getDay()===6)d+=D1;
  askPrompt(tt('Waiting for a reply'),[{label:tt('Put it back on my list on'),value:ymd(d),type:'date'}],([v])=>{v=String(v||'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<=today()){toast(tt('Pick a day after today'));return;}
    j.park=v;j.parkBy=m.id;save();rerender();try{openJobDetail(id);}catch(e){}toast(tt('Waiting for a reply')+' · '+tt('back on')+' '+fdate(v),'green');});};
P14.rep=(id,v,btn)=>{const j=(D.jobs||[]).find(x=>x.id===id);if(!j)return;if(REP[v]){j.rep=v;if(!j.dueDate&&!j.due)j.dueDate=today();}else delete j.rep;save();
  try{btn.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v===(REP[v]?v:'')));}catch(e){}rerender();};
P14.nudge=id=>{const j=(D.jobs||[]).find(x=>x.id===id);const m=M();if(!j||!m)return;if(j.nudgeAt&&Date.now()-j.nudgeAt<3600000){toast(tt('Already nudged in the last hour'));return;}
  const to=tos(j).filter(x=>x&&x!==m.id);if(!to.length)return;
  try{pushTo(to,()=>(t('Reminder from')+' '+nameOf(m.id)+': '+String(j.desc||'').slice(0,70)),j.pri?'pri':'info',{job:j.id});}catch(e){}
  j.nudgeAt=Date.now();j.nudgeBy=m.id;save();toast(tt('Nudge sent to')+' '+to.map(first).join(', '),'green');renderOthers();};

/* ── the Others page: what I sent (still waiting, by person) · done by others today · who's out ── */
function ov(){let o=$('m-p14o');if(o)return o;o=document.createElement('div');o.className='ov hid';o.id='m-p14o';o.innerHTML='<div class="md"></div>';document.body.appendChild(o);return o;}
function renderOthers(){const m=M();const o=$('m-p14o');if(!m||!o)return;const X=data(m);const md=o.querySelector('.md');
  let h='<div class="p14oh"><button onclick="navBack()" aria-label="'+esc(tt('Back'))+'">'+ic('back')+'</button><h2>'+esc(tt('Others'))+'</h2></div>'
    +'<div class="p14osub">'+esc(tt('Tasks you sent'))+' · '+X.waiting.length+' '+esc(tt('waiting'))+' · '+X.othersDone.length+' '+esc(tt('done today'))+'</div>';
  // waiting on others, by person
  const BY={};X.waiting.forEach(j=>{const k=tos(j).filter(x=>x!==m.id).map(first).join(', ')||'—';(BY[k]=BY[k]||[]).push(j);});
  const people=Object.keys(BY).sort((a,b)=>BY[b].length-BY[a].length||a.localeCompare(b));
  h+=head('o_wait',tt('Waiting on others'),X.waiting.length,'b','users')+'<div class="p14box">'
    +(people.length?people.map(p=>'<div class="p14pp">'+esc(p)+'<span>'+BY[p].length+'</span></div>'+BY[p].sort((a,b)=>(a.ts||0)-(b.ts||0)).map(j=>{const I=jsq(j.id);const recent=j.nudgeAt&&Date.now()-j.nudgeAt<3600000;
        return '<div class="p14r'+(j.pri||late(j)?' red':'')+'" onclick="P14.open(\''+I+'\')"><span class="p14c" style="cursor:default"></span><div class="w"><b>'+esc(txt(j))+ageTag(j)+'</b><small>'+[j.site?esc(short(siteName(j.site))):'',j.nudgeAt?esc(tt('nudged'))+' '+esc(ftime(j.nudgeAt)):''].filter(Boolean).join(' · ')+'</small></div>'
          +'<button class="p14btn"'+(recent?' disabled':'')+' onclick="event.stopPropagation();P14.nudge(\''+I+'\')">'+esc(tt(recent?'Nudged':'Nudge'))+'</button></div>';}).join('')).join('')
      :'<div class="p14empty" style="padding:14px">'+esc(tt('Nothing waiting on others'))+'</div>')+'</div>';
  h+=head('o_done',tt('Done by others today'),X.othersDone.length,'g','check')+'<div class="p14box">'+(X.othersDone.length?X.othersDone.map(j=>doneRow(j,m)).join(''):'<div class="p14empty" style="padding:14px">'+esc(tt('Nothing yet today'))+'</div>')+'</div>';
  // who's out
  const O=outMap();const ks=Object.keys(O);
  if(boss(m)||ks.length){h+='<div id="p14out"></div>'+head('o_out',tt("Who's out"),ks.length,'','away')+'<div class="p14box">'
    +ks.map(k=>{const x=O[k];const n=(D.jobs||[]).filter(j=>OPEN(j)&&j.cov&&j.cov.o===k).length;
      return '<div class="p14r" style="cursor:default"><span class="p14c" style="border-color:#c27c0e"></span><div class="w"><b>'+esc(nameOf(k))+'</b><small>'+esc(first(x.c))+' '+esc(tt('covers'))+(x.u?' · '+esc(tt('until'))+' '+esc(fdate(x.u)):'')+' · '+n+' '+esc(tt('tasks'))+'</small></div>'
        +(boss(m)?'<button class="p14btn g" onclick="P14.back(\''+jsq(k)+'\')">'+esc(tt('Is back'))+'</button>':'')+'</div>';}).join('')
    +(boss(m)?'<button class="p14more" onclick="P14.outAsk()">+ '+esc(tt('Someone is out'))+'</button>':'')+'</div>';}
  md.innerHTML=h;}
P14.others=sec=>{ov();renderOthers();show('m-p14o');const md=$('m-p14o').querySelector('.md');if(sec==='out'){const a=$('p14out');if(a)setTimeout(()=>a.scrollIntoView({block:'start'}),30);}else md.scrollTop=0;};
P14.back=k=>{askConfirm(nameOf(k)+' '+tt('is back — their tasks go back to them only?'),()=>{setBack(k);rerender();renderOthers();toast(tt('Back on their own list'),'green');},tt('Is back'));};
P14.outAsk=()=>{const ppl=(D.emps||[]).filter(e=>!e.inactive&&e.role!=='worker'||(!e.inactive&&e.lead)).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  const opts=ppl.map(e=>({v:e.id,l:e.name}));let d=Date.now()+D1;
  askPrompt(tt('Someone is out'),[{label:tt('Who is out?'),options:opts},{label:tt('Who covers?'),options:opts},{label:tt('Until (they are back the next day)'),value:ymd(d),type:'date'}],([who,cov,u])=>{
    if(!who||!cov||who===cov){toast(tt('Pick two different people'));return;}u=String(u||'').trim();if(u&&!/^\d{4}-\d{2}-\d{2}$/.test(u))u='';if(u&&u<today()){toast(tt('Pick today or later'));return;}
    setOut(who,cov,u);rerender();renderOthers();});};

/* hook into the task page (P10 calls P14.render for the people on its office list) */
/* new task: repeat; a task sent to someone who is out also goes to whoever covers */
const RCH=(cur,fn)=>'<div class="p14seg">'+[['','Never'],['d','Every day'],['w','Every week'],['m','Every month']].map(([k,l])=>'<button type="button" data-v="'+k+'" class="'+(cur===k?'on':'')+'" onclick="'+fn+'(\''+k+'\',this)">'+esc(tt(l))+'</button>').join('')+'</div>';
P14.pickRep=(v,btn)=>{window._p14rep=v;try{btn.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));}catch(e){}};
const onList=()=>{try{return window.P10_officeList&&window.P10_officeList(M());}catch(e){return false;}};
if(typeof window.openJob==='function'){const _oj=window.openJob;window.openJob=function(){const r=_oj.apply(this,arguments);try{
    let b=$('p14newrep');if(b)b.remove();window._p14rep='';
    if(onList()){const after=$('p10newtype')||$('p10opts');if(after){b=document.createElement('div');b.id='p14newrep';b.innerHTML='<label>'+esc(tt('Repeat'))+'</label>'+RCH('','P14.pickRep');after.parentNode.insertBefore(b,after.nextSibling);}}}catch(e){}return r;};try{openJob=window.openJob;}catch(x){}}
if(typeof window.saveJob==='function'){const _sj=window.saveJob;window.saveJob=function(){const before=(D.jobs[0]||{}).id;const rep=window._p14rep||'';const r=_sj.apply(this,arguments);
  try{const j=D.jobs[0];if(j&&j.id!==before){let ch=false;
      if(REP[rep]){j.rep=rep;if(!j.dueDate)j.dueDate=today();ch=true;}
      const O=outMap();tos(j).forEach(x=>{const o=O[x];if(o&&o.c&&!has(j,o.c)&&coverAdd(j,x,o.c)){ch=true;try{pushTo([o.c],()=>(t('New task for')+' '+nameOf(x)+' ('+t('you are covering')+'): '+String(j.desc||'').slice(0,60)),j.pri?'pri':'info',{job:j.id});}catch(e){}}});
      if(ch){save();rerender();}}}catch(e){}window._p14rep='';return r;};try{saveJob=window.saveJob;}catch(x){}}
/* task detail: waiting for a reply · repeat */
if(typeof window.openJobDetail==='function'){const _od=window.openJobDetail;window.openJobDetail=function(id){const r=_od.apply(this,arguments);try{
    const old=$('p14det');if(old)old.remove();const j=(D.jobs||[]).find(x=>x.id===id);const m=M();const ch=$('jdChat');
    if(!j||!m||!ch||!onList()||!OPEN(j)||!isMine(j,m))return r;
    const I=jsq(j.id);const d=document.createElement('div');d.id='p14det';
    d.innerHTML=(parked(j)?'<div class="p14park">'+ic('clock')+'<span style="flex:1">'+esc(tt('Waiting for a reply'))+' · '+esc(tt('back on'))+' '+esc(fdate(j.park))+'</span><button class="p14btn g" onclick="P14.unpark(\''+I+'\')">'+esc(tt('Back now'))+'</button></div>'
        :'<div class="rw"><button type="button" class="btn sec2" style="width:auto;padding:8px 13px;display:inline-flex;align-items:center;gap:6px" onclick="P14.park(\''+I+'\')">'+ic('clock')+esc(tt('Waiting for a reply…'))+'</button></div>')
      +'<div class="rw"><label>'+esc(tt('Repeat'))+'</label>'+RCH(REP[j.rep]?j.rep:'','P14.rep.bind(null,\''+I+'\')')+'</div>';
    const anchor=$('p10dtype')||ch;anchor.parentNode.insertBefore(d,anchor);
    if($('m-p14o')&&!$('m-p14o').classList.contains('hid')){/* opened from the Others page: keep the task on top */}
  }catch(e){}return r;};try{openJobDetail=window.openJobDetail;}catch(x){}}
/* a repeating task that is done: the next one is made by the server (it also takes it away again on Undo) */

try{if(typeof ES==='object')Object.assign(ES,{"left today":"pendientes hoy","When":"Cuándo","From":"De","All":"Todas","today":"hoy","d":"d","Today":"Hoy","Tomorrow":"Mañana","Next 7 days":"Próximos 7 días","Later":"Más adelante","No date":"Sin fecha","The app":"La app","My own":"Mías","from the app":"de la app",
  "Others":"Otros","Waiting on others":"Esperando a otros","Done by others today":"Hecho por otros hoy","Who's out":"Quién falta","Done today":"Hecho hoy","Nothing done yet today":"Nada hecho todavía hoy","Undo":"Deshacer","Back on your list":"De vuelta en tu lista",
  "Waiting for a reply":"Esperando respuesta","Waiting for a reply…":"Esperando respuesta…","back on":"vuelve el","Back now":"Volver ya","Put it back on my list on":"Volver a ponerla en mi lista el","Pick a day after today":"Elige un día después de hoy",
  "Repeat":"Repetir","Never":"Nunca","Every day":"Cada día","Every week":"Cada semana","Every month":"Cada mes","Covering for":"Cubriendo a","until":"hasta","covers":"cubre","covers for":"cubre a","tasks":"tareas","Is back":"Ya volvió",
  "Someone is out":"Alguien falta","Who is out?":"¿Quién falta?","Who covers?":"¿Quién cubre?","Until (they are back the next day)":"Hasta (vuelve al día siguiente)","Pick two different people":"Elige dos personas distintas","Pick today or later":"Elige hoy o después",
  "is back — their tasks go back to them only?":"ya volvió — ¿sus tareas vuelven solo a él/ella?","Back on their own list":"De vuelta en su propia lista","You are covering for":"Estás cubriendo a","New task for":"Nueva tarea para","you are covering":"tú cubres",
  "Tasks you sent":"Tareas que enviaste","waiting":"esperando","done today":"hechas hoy","Nudge":"Recordar","Nudged":"Recordado","nudged":"recordado","Nudge sent to":"Recordatorio enviado a","Already nudged in the last hour":"Ya se recordó en la última hora","Reminder from":"Recordatorio de",
  "Nothing waiting on others":"Nada esperando a otros","Nothing yet today":"Nada todavía hoy","Nothing of this type.":"Nada de este tipo.","Back":"Atrás"});}catch(e){}

/* ── Baruch 11/5 11:40: cancel a task that isn't needed ("a task to make an O&R service … not always necessary";
   "the customer didn't want it in the end … marked it as done, but it's not technically done"). Cancelled = closed, off every list,
   marked "Cancelled" (not "Done"), the sender is told. Works on an open task, and on one already marked done by mistake. ── */
const canCancel=(j,m)=>!!j&&!!m&&!j.deleted&&(boss(m)||m.role==='office'||j.from===m.id||isMine(j,m));
P14.cancel=id=>{const j=(D.jobs||[]).find(x=>x.id===id);const m=M();if(!canCancel(j,m))return;
  askPrompt(tt(j.status==='done'?'It was not done — cancel it':'Cancel this task'),[{label:tt('Why? (optional)'),value:''}],([why])=>{why=String(why||'').trim().slice(0,120);
    const wasDone=j.status==='done';j.status='done';j.cancel=true;j.cancelBy=m.id;j.cancelAt=Date.now();if(why)j.cancelWhy=why;else delete j.cancelWhy;
    if(!wasDone){j.doneAt=Date.now();j.doneBy=m.id;}else{j.doneBy=m.id;}
    Object.keys(j).forEach(k=>{if(k.startsWith('done_'))delete j[k];});if(j.chk==='wait')j.chk='';
    // the automatic "Apply to O&R" task: cancelling it means this job needs no O&R request
    if(j.orrAuto==='apply'){const s=(D.sites||[]).find(x=>x.id===j.site);if(s)s.orrNone=true;}
    // done already → the server sent "Done by …" back then; tell the sender it was cancelled after all
    if(wasDone){try{const to=[j.from].filter(x=>x&&x!==m.id);if(to.length)pushTo(to,()=>('✕ '+t('Cancelled by')+' '+nameOf(m.id)+': '+String(j.desc||'').slice(0,60)+(why?' — '+why:'')),'info',{job:j.id});}catch(e){}}
    save();try{hide('m-jobd');}catch(e){}try{renderJobs();}catch(e){}try{if(typeof renderHome==='function')renderHome();}catch(e){}toast(tt('Task cancelled'),'green');});};
P14.uncancel=id=>{const j=(D.jobs||[]).find(x=>x.id===id);const m=M();if(!j||!m||!(boss(m)||j.cancelBy===m.id||j.from===m.id))return;
  j.status='open';delete j.cancel;delete j.cancelBy;delete j.cancelAt;delete j.cancelWhy;delete j.doneAt;delete j.doneBy;save();try{openJobDetail(id);}catch(e){}try{renderJobs();}catch(e){}toast(tt('Back on the list'),'green');};
if(typeof window.openJobDetail==='function'){const _oc=window.openJobDetail;window.openJobDetail=function(id){const r=_oc.apply(this,arguments);try{
    const old=$('p14cx');if(old)old.remove();const j=(D.jobs||[]).find(x=>x.id===id);const m=M();const ch=$('jdChat');if(!j||!m||!ch)return r;
    // the O&R bar belongs only to O&R tasks still open (it stayed on from the task opened before)
    if(!(j.orr||j.orrAuto)||j.cancel||m.role==='worker')document.querySelectorAll('#m-jobd .orrtaskbar').forEach(x=>x.remove());
    if(j.cancel)document.querySelectorAll('#m-jobd button[onclick*="undoDone"]').forEach(x=>x.style.display='none');
    const d=document.createElement('div');d.id='p14cx';d.style.cssText='margin:8px 0';const I=jsq(j.id);
    if(j.cancel){d.innerHTML='<div class="p14cxb">'+ic('alert')+'<span style="flex:1"><b>'+esc(tt('Cancelled'))+'</b> · '+esc(first(j.cancelBy||j.doneBy))+(j.cancelAt?' · '+esc(new Date(j.cancelAt).toLocaleDateString(LOC(),{month:'short',day:'numeric'}))+' '+esc(ftime(j.cancelAt)):'')+(j.cancelWhy?'<small>'+esc(j.cancelWhy)+'</small>':'')+'</span>'
        +((boss(m)||j.cancelBy===m.id||j.from===m.id)?'<button class="p14cxu" onclick="P14.uncancel(\''+I+'\')">'+esc(tt('Undo'))+'</button>':'')+'</div>';}
    else if(canCancel(j,m)){d.innerHTML='<button class="p14cxbtn" onclick="P14.cancel(\''+I+'\')">'+ic('x')+esc(tt(j.status==='done'?'It was not done — cancel it':'Cancel task — not needed'))+'</button>';}
    else return r;
    ch.parentNode.insertBefore(d,ch);
  }catch(e){}return r;};try{openJobDetail=window.openJobDetail;}catch(x){}}
P.x='<path d="M18 6 6 18M6 6l12 12"/>';
if(typeof window.undoDone==='function'){const _ud=window.undoDone;window.undoDone=function(id){const j=(D.jobs||[]).find(x=>x.id===id);if(j&&j.cancel){delete j.cancel;delete j.cancelBy;delete j.cancelAt;delete j.cancelWhy;}return _ud.apply(this,arguments);};try{undoDone=window.undoDone;}catch(x){}}
(function(){const st=document.createElement('style');st.textContent=`
.p14cxbtn{display:inline-flex;align-items:center;gap:6px;border:0;background:none;color:#c0392b;font:600 13.5px/1 inherit;font-family:inherit;padding:8px 2px;cursor:pointer}
html[data-theme=dark] .p14cxbtn{color:#ff6b5e}
.p14cxb{display:flex;align-items:center;gap:9px;background:#f1f2f4;color:#3c4049;border-radius:11px;padding:9px 11px;font-size:13.5px}
.p14cxb small{display:block;color:#80858f;font-size:12.5px;margin-top:2px}
.p14cxu{border:0;border-radius:999px;background:#fff;color:#0f1115;font:600 12.5px/1 inherit;font-family:inherit;padding:7px 12px;box-shadow:0 0 0 1px #e3e5e8}
html[data-theme=dark] .p14cxb{background:#2c2c2e;color:#e5e5ea}html[data-theme=dark] .p14cxu{background:#1c1c1e;color:#f2f2f7;box-shadow:0 0 0 1px #3a3a3c}
`;document.head.appendChild(st);})();
try{if(typeof ES==='object')Object.assign(ES,{"get it ready":"preparar","Get it ready by":"Preparar para","Get it ready today":"Preparar hoy","Get it ready tomorrow":"Preparar mañana","Get it ready on":"Preparar el","Pick a day…":"Elegir día…","Day":"Día","Open the request":"Abrir el pedido","Mark urgent":"Marcar urgente","Not urgent":"Quitar urgente","Hide it until a day you pick":"Ocultar hasta el día que elijas","Options":"Opciones","tomorrow":"mañana","Material request":"Pedido de material","Partly ready":"Parcialmente listo","needed":"para","request":"pedido","Cancelled":"Cancelada","by":"por","Cancelled by":"Cancelada por","Cancel this task":"Cancelar esta tarea","Cancel task — not needed":"Cancelar tarea — no hace falta","It was not done — cancel it":"No se hizo — cancelarla","Why? (optional)":"¿Por qué? (opcional)","Task cancelled":"Tarea cancelada","Back on the list":"De vuelta en la lista"});}catch(e){}
})();