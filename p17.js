/* p17 — ✨ Ask (Baruch 11/15): ask anything, or tell it what to do ("pull up 6 Hadassah", "task for Menachem: billing for 5 Garfield").
   Claude runs on the server (function "ask"); every TOOL runs here on the phone, on the data this phone already has,
   through the app's own screens and buttons — so it can never see or do more than the person using it.
   Owner, managers and office only. English + Spanish, light + dark. */
(function(){
const P17=window.P17={};
const $=id=>document.getElementById(id);
const T=s=>{try{return t(s);}catch(e){return s;}};
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const M=()=>{try{return me();}catch(e){return null;}};
const allowed=()=>{const m=M();return !!m&&!m.inactive&&(m.role==='owner'||m.role==='manager'||m.role==='office'||!!m.all);};
const LG=()=>{try{return lang();}catch(e){return 'en';}};
let msgs=[],busy=false,log=[];   // msgs: what Claude sees; log: what the screen shows

// ── matching spoken / misspelled names ──
const ABBR={rd:'road',dr:'drive',ln:'lane',ave:'avenue',av:'avenue',ct:'court',st:'street',pl:'place',blvd:'boulevard',hwy:'highway',tpke:'turnpike',ter:'terrace',cir:'circle',pkwy:'parkway'};
const STOP=new Set(['ny','nj','spring','valley','monsey','suffern','airmont','monroe','new','city','the','job','jobs','at','in','on','for','of','to','pull','up','open','show','me','please','a','an','unit']);
const norm=w=>{w=String(w||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');w=ABBR[w]||w;return w.replace(/(.)\1+/g,'$1');};
const words=s=>String(s||'').split(/[\s,.#\-\/]+/).map(norm).filter(Boolean);
function lev(a,b){if(a===b)return 0;const m=a.length,n=b.length;if(!m||!n)return m||n;let p=Array(n+1).fill(0).map((_,i)=>i);for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c;}return p[n];}
const sim=(a,b)=>{if(a===b)return 1;if(/^\d/.test(a)||/^\d/.test(b))return 0;if(b.startsWith(a)&&a.length>=3)return .9;return 1-lev(a,b)/Math.max(a.length,b.length);};
function score(q,name){const Q=words(q).filter(w=>!STOP.has(w)),N=words(name);if(!Q.length||!N.length)return 0;let s=0,need=0;
  for(const w of Q){let b=0;for(const x of N)b=Math.max(b,sim(w,x));if(/^\d/.test(w)){need++;if(b<1)return 0;}s+=b>=.62?b:0;}
  return s/Q.length;}
function bestOf(list,q,nameFn,n){return list.map(x=>({x,s:score(q,nameFn(x))})).filter(o=>o.s>=.5).sort((a,b)=>b.s-a.s).slice(0,n||8);}

// ── what the phone may see ──
const vis=s=>{try{return siteVisible(s,M());}catch(e){return true;}};
const jobsAll=()=>(D.sites||[]).filter(s=>s&&!s.deleted&&vis(s));
const crewName=id=>{const c=(D.crews||[]).find(x=>x.id===id);return c?c.name:'';};
const nm=id=>{try{return nameOf(id);}catch(e){return id;}};
const sname=id=>{try{return siteName(id);}catch(e){const s=(D.sites||[]).find(x=>x.id===id);return s?s.name:'';}};
const dk=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
const dayStart=k=>{const [y,m,d]=String(k).split('-').map(Number);const g=new Date(Date.UTC(y,m-1,d,12));const off=new Date(g.toLocaleString('en-US',{timeZone:'America/New_York'})).getTime()-new Date(g.toLocaleString('en-US',{timeZone:'UTC'})).getTime();return Date.UTC(y,m-1,d)-off;};
const hm=ms=>new Date(ms).toLocaleTimeString(LG()==='es'?'es-US':'en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'});
const tosOf=j=>Array.isArray(j.to)?j.to:j.to?[j.to]:[];
const closeAsk=()=>{const o=$('p17');if(o)o.classList.add('hid');};

const TOOLS={
  find_jobs({query}){return bestOf(jobsAll(),query,s=>s.name,8).map(({x,s})=>({id:x.id,name:x.name,stage:x.stage||'',crew:crewName(x.crew),match:+s.toFixed(2)}));},
  open_job({job_id}){const s=(D.sites||[]).find(x=>x.id===job_id);if(!s||!vis(s))return {ok:false,error:'no such job'};closeAsk();openFolder(job_id);return {ok:true,opened:s.name,_act:'📂 '+T('Opened')+' '+s.name};},
  job_summary({job_id}){const s=(D.sites||[]).find(x=>x.id===job_id);if(!s||!vis(s))return {error:'no such job'};const now=Date.now();
    const tasks=(D.jobs||[]).filter(j=>j.site===job_id&&j.status!=='done'&&!j.deleted).slice(0,15).map(j=>({to:tosOf(j).map(x=>nm(x)||crewName(x)),what:String(j.desc||'').slice(0,120),due:j.due||'',from:nm(j.from)}));
    const notes=(s.notes||[]).slice(-5).map(n=>({by:nm(n.by),text:String(n.text||n.body||'').slice(0,200),when:n.ts?dk(n.ts):''}));
    const orr=(D.orr||[]).filter(o=>o.site===job_id&&!o.deleted).map(o=>({step:o.step||'',wo:o.wo||'',last:((o.log||[]).slice(-1)[0]||{}).txt||''}));
    let hrs=null;try{const ps=hrPunches(now-14*864e5,now,p=>p.site===job_id);const by={};ps.forEach(p=>{by[nm(p.who)]=(by[nm(p.who)]||0)+punchDur(p);});hrs=Object.fromEntries(Object.entries(by).map(([k,v])=>[k,+v.toFixed(2)]));}catch(e){}
    return {name:s.name,stage:s.stage||'',crew:crewName(s.crew),managers:(()=>{try{return mgrNames(s);}catch(e){return '';}})(),open_tasks:tasks,latest_notes:notes,orr,files:(s.files||[]).length,hours_last_14_days:hrs};},
  find_people({query}){const P=(D.emps||[]).filter(e=>!e.inactive).map(e=>({id:e.id,name:e.name,role:e.role,title:e.title||'',crew:crewName(e.crew),aka:e.id==='o2'||/menachem/i.test(e.name)?'Nachum':''}));
    const C=(D.crews||[]).map(c=>({id:c.id,name:c.name,role:'crew',title:c.type||'',crew:'',aka:''}));
    return bestOf(P.concat(C),query,x=>x.name+' '+x.aka+' '+x.title,8).map(({x,s})=>Object.assign({},x,{match:+s.toFixed(2)}));},
  create_task({to,text,job_id,due,priority}){const m=M();text=String(text||'').trim();if(!text)return {ok:false,error:'no text'};
    let tg=[];try{tg=assignTargets().map(x=>x.id);}catch(e){}tg.push(m.id);
    to=(Array.isArray(to)?to:[to]).filter(Boolean);const bad=to.filter(x=>!tg.includes(x));if(bad.length)return {ok:false,error:'cannot send to: '+bad.join(', ')};if(!to.length)return {ok:false,error:'nobody picked'};
    if(job_id&&!(D.sites||[]).some(s=>s.id===job_id&&vis(s)))return {ok:false,error:'no such job'};
    const before=(D.jobs[0]||{}).id;
    openJob();
    document.querySelectorAll('#jAssign input').forEach(i=>{i.checked=to.includes(i.value);});try{jobWord();}catch(e){}
    const sel=$('jSite');if(job_id){if(![...sel.options].some(o=>o.value===job_id)){const o=document.createElement('option');o.value=job_id;o.textContent=sname(job_id);sel.appendChild(o);}sel.value=job_id;}else sel.value='';
    document.querySelectorAll('#jAssign input').forEach(i=>{i.checked=to.includes(i.value);});
    $('jDesc').value=text;const dv=['','Today','Tomorrow morning','This week','ASAP'].includes(due||'')?(due||''):'';$('jDue').value=dv;
    $('jPri').className=priority?'sw on':'sw';
    saveJob();
    const nj=D.jobs[0];if(!nj||nj.id===before){hide('m-job');return {ok:false,error:'not sent'};}
    hide('m-job');const who=to.map(x=>nm(x)||crewName(x)).join(' + ');
    return {ok:true,task_id:nj.id,sent_to:who,job:job_id?sname(job_id):'',_act:'✅ '+T('Task sent to')+' '+who+(job_id?' — '+sname(job_id):''),_undo:nj.id};},
  open_tasks({person_id,job_id}){const L=(D.jobs||[]).filter(j=>j.status!=='done'&&!j.deleted&&(!job_id||j.site===job_id)&&(!person_id||tosOf(j).includes(person_id)||j.from===person_id));
    return {count:L.length,tasks:L.slice(0,25).map(j=>({to:tosOf(j).map(x=>nm(x)||crewName(x)),what:String(j.desc||'').slice(0,100),job:j.site?sname(j.site):'',due:j.due||'',from:nm(j.from),days_old:Math.floor((Date.now()-(j.ts||0))/864e5),priority:!!j.pri}))};},
  async hours({from,to,person_id,job_id}){const a=dayStart(from),b=dayStart(to)+864e5;if(!(a<b))return {error:'bad dates'};
    try{if(a<Date.now()-118*864e5&&window.EX_loadRange)await window.EX_loadRange('punches',a,b);}catch(e){}
    const m=M();const ps=hrPunches(a,b,p=>(!person_id||p.who===person_id)&&(!job_id||p.site===job_id)&&(()=>{try{const e=(D.emps||[]).find(x=>x.id===p.who);return p.who===m.id||seesHoursOf(m,e);}catch(_){return true;}})());
    const add=(o,k,v)=>{o[k]=+((o[k]||0)+v).toFixed(2);};const byP={},byJ={},byD={};let tot=0;
    ps.forEach(p=>{const h=punchDur(p);tot+=h;add(byP,nm(p.who),h);add(byJ,p.site?sname(p.site):(p.newJob&&p.newJob.text)||'(no job)',h);add(byD,dk(p.in),h);});
    return {from,to,total:+tot.toFixed(2),by_person:byP,by_job:byJ,by_day:byD,shifts:ps.length};},
  working_now(){const now=Date.now(),m=M();const open=(D.punches||[]).filter(p=>!p.out&&!p.voided&&p.in>now-20*36e5&&p.in<=now);
    const seen=e=>{try{return p=>p.who===m.id||seesHoursOf(m,(D.emps||[]).find(x=>x.id===p.who));}catch(_){return ()=>true;}};
    const L=open.filter(seen()).map(p=>({who:nm(p.who),job:p.site?sname(p.site):(p.newJob&&p.newJob.text)||'',since:hm(p.in),away:p.away?hm(p.away):''}));
    return {clocked_in:L,schedule_today:TOOLS.schedule({date:dk(now)}).crews};},
  schedule({date}){const out=[];(D.crews||[]).forEach(c=>{let s=null;try{s=schedDay(c.id+'|'+date);}catch(e){s=(D.sched||{})[c.id+'|'+date];}
    if(!s)return;const as=Array.isArray(s.assignments)&&s.assignments.length?s.assignments:[s];as.forEach(a=>{if(a&&a.site)out.push({crew:c.name,job:sname(a.site),time:a.time||(a.start!=null?Math.floor(a.start/60)+':'+String(a.start%60).padStart(2,'0'):''),note:a.note||''});});});
    return {date,crews:out};},
  orr_status({job_id}){const L=(D.orr||[]).filter(o=>!o.deleted&&(job_id?o.site===job_id:o.step!=='done'));
    return {count:L.length,requests:L.slice(0,30).map(o=>({job:o.site?sname(o.site):(o.addr||''),wo:o.wo||'',step:o.step||'',last_note:(((o.log||[]).slice(-1)[0]||{}).txt||'').slice(0,160)}))};},
  open_screen({screen}){const ok=['home','jobs','sites','punch','hours','sched','cal','mat','team','orr','rep','more','exp','est','code','msg','trello'];if(!ok.includes(screen))return {ok:false,error:'unknown screen'};
    closeAsk();goTab(screen);return {ok:true,_act:'↗ '+T('Opened')+' '+screen};},
};

// ── the conversation ──
async function call(){const s=window.EX_sb?(await EX_sb.auth.getSession()).data.session:null;const C=window.EX_CFG||{};
  const r=await fetch(C.url.replace(/\/$/,'')+'/functions/v1/ask',{method:'POST',headers:{'Content-Type':'application/json',apikey:C.anonKey,...(s?{Authorization:'Bearer '+s.access_token}:{})},body:JSON.stringify({messages:msgs,lang:LG()})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw {status:r.status,error:j.error||''};return j;}
function errText(e){const k=e&&e.error;if(e&&e.status===429||k==='limit')return T("Today's limit for Ask is used up — try again tomorrow.");if(k==='off')return T('Ask is not switched on yet — the AI key is missing.');
  if(e&&(e.status===401||e.status===403))return T('Ask is for the owner, managers and office.');return T('Could not reach Ask — check the signal and try again.');}
async function send(text){text=String(text||'').trim();if(!text||busy)return;busy=true;
  msgs.push({role:'user',content:text});log.push({who:'me',text});render(true);
  try{for(let round=0;round<8;round++){const j=await call();const content=j.content||[];msgs.push({role:'assistant',content});
      const said=content.filter(c=>c.type==='text').map(c=>c.text).join('\n').trim();if(said)log.push({who:'ai',text:said});
      const uses=content.filter(c=>c.type==='tool_use');if(!uses.length||j.stop_reason!=='tool_use')break;
      const results=[];for(const u of uses){let out;try{out=await (TOOLS[u.name]?TOOLS[u.name](u.input||{}):{error:'unknown tool'});}catch(e){out={error:String(e&&e.message||e).slice(0,200)};}
        if(out&&out._act){log.push({who:'act',text:out._act,undo:out._undo||null});}const clean=Array.isArray(out)?out:Object.assign({},out);if(!Array.isArray(clean)){delete clean._act;delete clean._undo;}
        results.push({type:'tool_result',tool_use_id:u.id,content:JSON.stringify(clean).slice(0,12000)});}
      msgs.push({role:'user',content:results});render(true);}
  }catch(e){log.push({who:'err',text:errText(e)});msgs.pop();}
  busy=false;render(true);}
function bubble(x,i){if(x.who==='me')return '<div class="p17b me">'+E(x.text)+'</div>';
  if(x.who==='act')return '<div class="p17act">'+E(x.text)+(x.undo?' <button class="p17undo" onclick="P17.undo(\''+E(x.undo)+'\')">'+E(T('Undo'))+'</button>':'')+'</div>';
  if(x.who==='err')return '<div class="p17act p17err">⚠ '+E(x.text)+'</div>';
  return '<div class="p17b ai">'+(typeof fmtText==='function'?fmtText(x.text):E(x.text).replace(/\n/g,'<br>'))+'</div>';}
function render(scroll){const b=$('p17list');if(!b)return;
  b.innerHTML=(log.length?log.map(bubble).join(''):'<div class="p17hint">'+E(T('Ask anything, or tell me what to do. For example:'))+'<div class="p17ex" onclick="P17.ex(this)">'+E(T('Pull up 6 Hadassah'))+'</div><div class="p17ex" onclick="P17.ex(this)">'+E(T('Make a task for Menachem to do billing for 5 Garfield'))+'</div><div class="p17ex" onclick="P17.ex(this)">'+E(T('Who is working now?'))+'</div><div class="p17ex" onclick="P17.ex(this)">'+E(T('How many hours on 14 Dorset this month?'))+'</div></div>')
    +(busy?'<div class="p17b ai p17dots"><span></span><span></span><span></span></div>':'');
  const sb=$('p17send');if(sb)sb.disabled=busy;if(scroll)b.scrollTop=b.scrollHeight;}
P17.ex=el=>{const i=$('p17in');i.value=el.textContent;i.focus();};
P17.undo=id=>{try{P14.cancel(id);}catch(e){}};
P17.go=()=>{const i=$('p17in');const v=i.value;i.value='';i.style.height='';send(v);};
P17.clear=()=>{if(busy)return;msgs=[];log=[];render();};
P17.open=()=>{if(!allowed())return;build();try{$('p17t').textContent='✨ '+(LG()==='es'?'Preguntar':'Ask');$('p17nw').textContent=T('New');$('p17in').placeholder=T('Ask or tell me what to do…');}catch(e){}$('p17').classList.remove('hid');render(true);setTimeout(()=>{try{$('p17in').focus();}catch(e){}},150);};
P17.close=closeAsk;
P17.mic=()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast(T("Voice doesn't work on this phone — type it or use the keyboard mic."));return;}
  const r=new SR();r.lang=LG()==='es'?'es-US':'en-US';r.interimResults=true;r.continuous=false;const i=$('p17in');const base=i.value?i.value+' ':'';const mb=$('p17mic');mb.classList.add('on');
  r.onresult=e=>{let s='';for(const x of e.results)s+=x[0].transcript;i.value=base+s;};r.onend=()=>{mb.classList.remove('on');if(i.value.trim())P17.go();};r.onerror=()=>mb.classList.remove('on');try{r.start();}catch(e){mb.classList.remove('on');}};
P17.tools=TOOLS;P17._score=score;

function build(){if($('p17'))return;const o=document.createElement('div');o.id='p17';o.className='hid';
  o.innerHTML='<div class="p17top"><button class="p17x" onclick="P17.close()" aria-label="close">✕</button><b id="p17t">✨ '+(LG()==='es'?'Preguntar':'Ask')+'</b><button class="p17new" id="p17nw" onclick="P17.clear()">'+E(T('New'))+'</button></div>'
    +'<div id="p17list"></div>'
    +'<div class="p17row"><button id="p17mic" class="p17mic" onclick="P17.mic()" aria-label="mic">🎤</button><textarea id="p17in" data-nomic="1" rows="1" placeholder="'+E(T('Ask or tell me what to do…'))+'" oninput="this.style.height=\'auto\';this.style.height=Math.min(120,this.scrollHeight)+\'px\'" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();P17.go();}"></textarea><button id="p17send" class="p17send" onclick="P17.go()" aria-label="send">➤</button></div>';
  document.body.appendChild(o);}
const css=document.createElement('style');css.textContent=
 '#p17{position:fixed;inset:0;z-index:260;background:var(--g0,#f8f9fb);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top)}#p17.hid{display:none}'
+'.p17top{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--g2);background:var(--pnbg,#fff)}.p17top b{flex:1;font-size:17px}'
+'.p17x,.p17new{border:0;background:var(--g1);color:var(--g5);border-radius:10px;padding:8px 12px;font-size:15px}'
+'#p17list{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;-webkit-overflow-scrolling:touch}'
+'.p17b{max-width:86%;padding:9px 12px;border-radius:14px;font-size:15px;line-height:1.4;word-wrap:break-word;white-space:normal}'
+'.p17b.me{align-self:flex-end;background:var(--blue-mid,#d93a2b);color:#fff;border-bottom-right-radius:4px;white-space:pre-wrap}'
+'.p17b.ai{align-self:flex-start;background:var(--pnbg,#fff);color:var(--g5);border:1px solid var(--g2);border-bottom-left-radius:4px}'
+'.p17act{align-self:center;font-size:13px;color:var(--green,#1a6b3a);background:var(--green-bg,#e8f7ed);border-radius:10px;padding:6px 10px;max-width:92%;text-align:center}.p17err{color:var(--red);background:var(--red-bg)}'
+'.p17undo{border:0;background:transparent;color:var(--blue-mid);font-weight:600;text-decoration:underline;font-size:13px;padding:0 0 0 6px}'
+'.p17hint{color:var(--g4);font-size:14px;padding:10px 4px}.p17ex{margin-top:8px;padding:9px 12px;border-radius:12px;background:var(--pnbg,#fff);border:1px solid var(--g2);color:var(--g5);cursor:pointer}'
+'.p17row{display:flex;align-items:flex-end;gap:8px;padding:8px 10px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--g2);background:var(--pnbg,#fff)}'
+'.p17row textarea{flex:1;resize:none;border:1px solid var(--g2);border-radius:20px;padding:10px 14px;font-size:16px;min-height:42px;max-height:120px;background:var(--g0);color:var(--g5)}'
+'.p17mic,.p17send{flex:none;width:42px;height:42px;border-radius:50%;border:0;font-size:18px;background:var(--g1);color:var(--g5)}.p17send{background:var(--blue-mid,#d93a2b);color:#fff}.p17send:disabled{opacity:.5}.p17mic.on{background:#c0392b;color:#fff}'
+'.p17dots{display:flex;gap:4px;padding:12px 14px}.p17dots span{width:7px;height:7px;border-radius:50%;background:var(--g3);animation:p17d 1s infinite}.p17dots span:nth-child(2){animation-delay:.2s}.p17dots span:nth-child(3){animation-delay:.4s}@keyframes p17d{0%,80%,100%{opacity:.3}40%{opacity:1}}';
document.head.appendChild(css);

// ✨ button in the top bar, next to 🔍 — only for those who may use it, and only in the real app
function btn(){const sb=$('searchBtn');if(!sb)return;let b=$('askBtn');const on=allowed()&&!!window.EX_REAL;
  if(!b){b=document.createElement('button');b.id='askBtn';b.className='role-sel';b.style.cssText='padding:7px 10px';b.textContent='✨';b.setAttribute('aria-label','Ask');b.onclick=()=>P17.open();sb.parentNode.insertBefore(b,sb);}
  b.hidden=!on;}
setInterval(btn,3000);setTimeout(btn,800);
try{Object.assign(ES,{"Ask":"Preguntar","New":"Nuevo","Opened":"Abierto","Undo":"Deshacer","Ask or tell me what to do…":"Pregunte o dígame qué hacer…",
  "Ask anything, or tell me what to do. For example:":"Pregunte lo que sea, o dígame qué hacer. Por ejemplo:","Pull up 6 Hadassah":"Abre 6 Hadassah",
  "Make a task for Menachem to do billing for 5 Garfield":"Haz una tarea para Menachem: facturar 5 Garfield","Who is working now?":"¿Quién está trabajando ahora?",
  "How many hours on 14 Dorset this month?":"¿Cuántas horas en 14 Dorset este mes?","Today's limit for Ask is used up — try again tomorrow.":"Se acabó el límite de hoy — intente mañana.",
  "Ask is not switched on yet — the AI key is missing.":"Preguntar aún no está activado — falta la clave de IA.","Ask is for the owner, managers and office.":"Preguntar es para el dueño, los gerentes y la oficina.",
  "Could not reach Ask — check the signal and try again.":"No se pudo conectar — revise la señal e intente otra vez."});}catch(e){}
})();

/* ── AI key (Baruch 11/15): the owner or Payroll (Shia) pastes the Anthropic key here, under Hours next to Fingercheck.
   It goes to the locked part of the server (ai_set_key) — after saving nobody can see it again, only the last 4 characters. ── */
(function(){
const $=id=>document.getElementById(id);const T=s=>{try{return t(s);}catch(e){return s;}};
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const can=()=>{try{const m=me();return !!m&&(m.role==='owner'||(m.role==='office'&&m.title==='Payroll'));}catch(e){return false;}};
let ST;   // undefined = not asked yet · null = no key · {last4,at,by}
async function status(){try{const r=await EX_sb.rpc('ai_key_status');if(r.error)throw r.error;ST=r.data||null;}catch(e){ST=undefined;}return ST;}
const line=()=>ST===undefined?T('Checking…'):ST?'✓ '+T('Saved')+' · '+T('ends in')+' …'+E(ST.last4||''):T('Not set — ✨ Ask is off');
P17.keyCard=()=>{if(!can()||!window.EX_REAL||!window.EX_sb)return '';if(ST===undefined&&!P17._kq){P17._kq=1;status().then(()=>{const el=$('aiKeyLine');if(el)el.innerHTML=line();P17._kq=0;});}
  return '<div class="card" style="padding:11px 13px;display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="P17.keySheet()"><div><b>✨ '+E(T('AI key (for Ask)'))+'</b><div style="font-size:12px;color:var(--g4)" id="aiKeyLine">'+line()+'</div></div><span style="color:var(--blue-mid);font-size:18px">›</span></div>';};
P17.keySheet=async()=>{if(!can())return;await status();
  rateSheet('<div style="font-weight:700;font-size:17px;margin-bottom:2px">✨ '+E(T('AI key (for Ask)'))+'</div>'
    +'<div style="font-size:12px;color:var(--g4);margin-bottom:8px">'+E(T('Paste the key from console.anthropic.com (Settings → API Keys). It starts with sk-ant-. After saving, nobody can see it again — not you, not Payroll, not Claude. Only the server uses it.'))+'</div>'
    +(ST?'<div style="font-size:13px;color:var(--green);margin-bottom:6px">✓ '+E(T('Saved'))+' · '+E(T('ends in'))+' …'+E(ST.last4||'')+(ST.at?' · '+E(new Date(ST.at).toLocaleDateString())+(ST.by?' · '+E(nameOf(ST.by)):''):'')+'</div>':'<div style="font-size:13px;color:var(--g4);margin-bottom:6px">'+E(T('Not saved'))+'</div>')
    +'<input type="password" autocomplete="off" spellcheck="false" data-nomic="1" id="aiKeyIn" placeholder="'+E(ST?T('Paste a new one to replace it'):T('Paste it here'))+'" style="font-size:15px">'
    +'<button class="btn" style="margin-top:12px" onclick="P17.keySave()">'+E(T('Save'))+'</button>'
    +'<button class="btn gr" style="margin-top:8px" onclick="P17.keyTest()">'+E(T('Test the key'))+'</button><div id="aiKeyRes" style="font-size:13px;margin-top:10px"></div>'
    +(ST?'<div style="text-align:center;margin-top:12px"><span style="color:#c0392b;font-size:13px;cursor:pointer" onclick="P17.keyRemove()">'+E(T('Remove the key'))+'</span></div>':''));};
P17.keySave=async()=>{const el=$('aiKeyIn');const v=el?el.value.trim():'';if(!v){toast(T('Paste a key first'));return;}
  if(!/^sk-ant-\S+$/.test(v)){toast(T('That does not look like an Anthropic key — it starts with sk-ant-'));return;}
  const r=await EX_sb.rpc('ai_set_key',{p_v:v});el.value='';if(r.error){toast(T('Not saved')+': '+(r.error.message||''));return;}
  toast('✓ '+T('Saved'),'green');await P17.keySheet();P17.keyTest();try{const l=$('aiKeyLine');if(l)l.innerHTML=line();}catch(e){}};
P17.keyTest=async()=>{const out=$('aiKeyRes');if(out)out.textContent='⏳ '+T('Testing…');
  try{const s=(await EX_sb.auth.getSession()).data.session;const C=window.EX_CFG||{};
    const r=await fetch(C.url.replace(/\/$/,'')+'/functions/v1/ask',{method:'POST',headers:{'Content-Type':'application/json',apikey:C.anonKey,...(s?{Authorization:'Bearer '+s.access_token}:{})},body:JSON.stringify({ping:true})});
    const j=await r.json().catch(()=>({}));
    const msg=r.status===503?'✗ '+T('No key saved yet.'):j.ok?'✓ '+T('The key works — ✨ Ask is on.'):j.status===401?'✗ '+T('Anthropic says this key is wrong — paste it again.'):(j.status===402||j.status===403)?'✗ '+T('The key is right, but the Anthropic account has no credit — add billing at console.anthropic.com.'):'✗ '+T('Could not check right now')+' ('+(j.status||r.status)+')';
    if(out){out.textContent=msg;out.style.color=j.ok?'var(--green)':'#c0392b';}}catch(e){if(out){out.textContent='✗ '+T('Could not check right now');out.style.color='#c0392b';}}};
P17.keyRemove=async()=>{if(!confirm(T('Remove the AI key? ✨ Ask stops working until a key is saved again.')))return;const r=await EX_sb.rpc('ai_set_key',{p_v:''});if(r.error){toast(T('Not saved')+': '+(r.error.message||''));return;}
  ST=null;toast('✓ '+T('Removed'),'green');P17.keySheet();};
try{Object.assign(ES,{"AI key (for Ask)":"Clave de IA (para Preguntar)","Not set — ✨ Ask is off":"Sin clave — ✨ Preguntar está apagado","Checking…":"Revisando…",
  "Paste the key from console.anthropic.com (Settings → API Keys). It starts with sk-ant-. After saving, nobody can see it again — not you, not Payroll, not Claude. Only the server uses it.":"Pegue la clave de console.anthropic.com (Settings → API Keys). Empieza con sk-ant-. Después de guardarla nadie la puede ver otra vez — ni usted, ni Nómina, ni Claude. Solo la usa el servidor.",
  "Test the key":"Probar la clave","Testing…":"Probando…","Remove the key":"Quitar la clave","No key saved yet.":"Todavía no hay clave guardada.","The key works — ✨ Ask is on.":"La clave funciona — ✨ Preguntar está activo.",
  "Anthropic says this key is wrong — paste it again.":"Anthropic dice que la clave es incorrecta — péguela otra vez.","The key is right, but the Anthropic account has no credit — add billing at console.anthropic.com.":"La clave está bien, pero la cuenta de Anthropic no tiene crédito — agregue pago en console.anthropic.com.",
  "Could not check right now":"No se pudo revisar ahora","That does not look like an Anthropic key — it starts with sk-ant-":"Eso no parece una clave de Anthropic — empieza con sk-ant-",
  "Remove the AI key? ✨ Ask stops working until a key is saved again.":"¿Quitar la clave de IA? ✨ Preguntar deja de funcionar hasta que se guarde otra."});}catch(e){}
})();
