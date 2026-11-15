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
const NUMW={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10};
const words=s=>String(s||'').split(/[\s,.#\-\/]+/).map(w=>{const k=String(w).toLowerCase();return NUMW[k]!=null?String(NUMW[k]):w;}).map(norm).filter(Boolean);
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
    // older months come from the server — only the person/job asked about, so nothing gets cut off
    let part=false;try{if(a<Date.now()-118*864e5&&window.EX_loadRange){const r=await window.EX_loadRange('punches',a,Math.min(b,Date.now()),{site:job_id||null,who:person_id||null,limit:5000});part=!r||!r.ok||!!r.full;}}catch(e){part=true;}
    const m=M();const ps=hrPunches(a,b,p=>(!person_id||p.who===person_id)&&(!job_id||p.site===job_id)&&(()=>{try{const e=(D.emps||[]).find(x=>x.id===p.who);return p.who===m.id||seesHoursOf(m,e);}catch(_){return true;}})());
    const add=(o,k,v)=>{o[k]=+((o[k]||0)+v).toFixed(2);};const byP={},byJ={},byD={};let tot=0;
    ps.forEach(p=>{const h=punchDur(p);tot+=h;add(byP,nm(p.who),h);add(byJ,p.site?sname(p.site):(p.newJob&&p.newJob.text)||'(no job)',h);add(byD,dk(p.in),h);});
    const out={from,to,total:+tot.toFixed(2),by_person:byP,by_job:byJ,by_day:byD,shifts:ps.length};if(part)out.warning='Some older entries could not be loaded — the numbers may be low. Ask for one job or one person, or a shorter period.';return out;},
  working_now(){const now=Date.now(),m=M();const open=(D.punches||[]).filter(p=>!p.out&&!p.voided&&p.in>now-20*36e5&&p.in<=now);
    const seen=e=>{try{return p=>p.who===m.id||seesHoursOf(m,(D.emps||[]).find(x=>x.id===p.who));}catch(_){return ()=>true;}};
    const L=open.filter(seen()).map(p=>({who:nm(p.who),job:p.site?sname(p.site):(p.newJob&&p.newJob.text)||'',since:hm(p.in),away:p.away?hm(p.away):''}));
    return {clocked_in:L,schedule_today:TOOLS.schedule({date:dk(now)}).crews};},
  schedule({date}){const out=[];(D.crews||[]).forEach(c=>{let s=null;try{s=schedDay(c.id+'|'+date);}catch(e){s=(D.sched||{})[c.id+'|'+date];}
    if(!s)return;const as=Array.isArray(s.assignments)&&s.assignments.length?s.assignments:[s];as.forEach(a=>{if(a&&a.site)out.push({crew:c.name,job:sname(a.site),time:a.time||(a.start!=null?Math.floor(a.start/60)+':'+String(a.start%60).padStart(2,'0'):''),note:a.note||''});});});
    return {date,crews:out};},
  orr_status({job_id}){const L=(D.orr||[]).filter(o=>!o.deleted&&(job_id?o.site===job_id:o.step!=='done'));
    return {count:L.length,requests:L.slice(0,30).map(o=>({job:o.site?sname(o.site):(o.addr||''),wo:o.wo||'',step:o.step||'',last_note:(((o.log||[]).slice(-1)[0]||{}).txt||'').slice(0,160)}))};},
  // 11/15 (Baruch): the SAME numbers as Reports → Job cost (laborModel/repPun/repHist): labor = what each man was really paid
  // that week (Fingercheck paycheck), otherwise his rate with overtime ("estimate"); + material receipts; + travel (Fingercheck + app).
  async job_cost({job_id,from,to}){const m=M();if(!(m&&(m.role==='owner'||(m.role==='office'&&m.title==='Payroll'))))return {error:'Costs are only for the owner and Payroll.'};
    const s=(D.sites||[]).find(x=>x.id===job_id);if(!s)return {error:'no such job'};
    const a=from?dayStart(from):0,b=to?dayStart(to)+864e5:Infinity;const inR=ts=>ts>=a&&ts<b;
    let H=null;try{H=repHist(a,()=>{});for(let n=0;H&&H.state!=='ok'&&!(H.state==='fail'&&n>3)&&n<80;n++){await new Promise(r=>setTimeout(r,250));H=repHist(a,()=>{});}}catch(e){H=null;}
    const L=laborModel(a,b,H);const pun=repPun(a,b,H).filter(p=>p.site===job_id);const wkOf=p=>p.wk||L.wkey(p.in);
    let h=0,lab=0,est=false;const noRate={},per={};
    pun.forEach(p=>{const k=p.who+'|'+wkOf(p);const pr=L.perHour(k);if(pr.est)est=true;if(pr.none)noRate[p.who]=(noRate[p.who]||0)+p.h;h+=p.h;lab+=p.h*pr.r;const P=per[p.who]||(per[p.who]={hours:0,cost:0});P.hours+=p.h;P.cost+=p.h*pr.r;});
    const mats=(D.exps||[]).filter(x=>x.type==='material'&&x.site===job_id&&inR(new Date(x.date+'T12:00').getTime()));const mat=mats.reduce((q,x)=>q+(+x.amt||0),0);
    let tr=0;(D.travel||[]).forEach(x=>{if(x.site!==job_id)return;const ts=new Date(x.date+'T12:00').getTime();if(travelCounts(x)&&!L.paidTr[x.who+'|'+L.wkey(ts)]&&inR(ts))tr+=travelPayOf(x);});
    (D.fcpay||[]).forEach(c=>{if(!c||c.deleted||!c.periodBegin||!Array.isArray(c.trJobs)||!inR(new Date(c.periodBegin+'T12:00').getTime()))return;c.trJobs.forEach(z=>{if(z.site===job_id)tr+=+z.amt||0;});});
    const ins=pun.filter(p=>p.in).map(p=>p.in),wks=pun.filter(p=>p.wk).map(p=>new Date(p.wk+'T12:00').getTime()),all=ins.concat(wks);
    const r2=v=>Math.round(v*100)/100;
    return {job:s.name,period:all.length?dk(Math.min(...all))+' to '+dk(Math.max(...all)):'',hours:r2(h),labor:r2(lab),material:r2(mat),material_receipts:mats.length,travel:r2(tr),total:r2(lab+mat+tr),
      some_weeks_estimated:est,people_with_no_pay_info:Object.keys(noRate).map(nm),hours_not_priced:r2(Object.values(noRate).reduce((q,v)=>q+v,0)),
      by_person:Object.fromEntries(Object.entries(per).sort((x,y)=>y[1].cost-x[1].cost).map(([w,P])=>[nm(w),{hours:r2(P.hours),cost:r2(P.cost)}])),
      ...(H&&H.state!=='ok'&&a<Date.now()-115*864e5?{warning:'Older months could not be loaded from the server — the numbers may be low.'}:{}),
      how:'Same as Reports → Job cost: labor = hours × what each man was actually paid that week (his Fingercheck paycheck, overtime included); weeks with no paycheck yet use his hourly rate with overtime (estimate). Plus material receipts entered on the job and travel (paid in Fingercheck for this job, plus the app\'s trips for weeks not paid yet). Not included: payroll taxes, insurance, material bought without a receipt in the app.'};},
  open_screen({screen}){const ok=['home','jobs','sites','punch','hours','sched','cal','mat','team','orr','rep','more','exp','est','code','msg','trello'];if(!ok.includes(screen))return {ok:false,error:'unknown screen'};
    closeAsk();goTab(screen);return {ok:true,_act:'↗ '+T('Opened')+' '+screen};},
};

// ── the conversation (11/15 v2: looks and works like the Claude app — clean page, live status, real listening) ──
async function call(){const s=window.EX_sb?(await EX_sb.auth.getSession()).data.session:null;const C=window.EX_CFG||{};
  const r=await fetch(C.url.replace(/\/$/,'')+'/functions/v1/ask',{method:'POST',headers:{'Content-Type':'application/json',apikey:C.anonKey,...(s?{Authorization:'Bearer '+s.access_token}:{})},body:JSON.stringify({messages:msgs,lang:LG()})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw {status:r.status,error:j.error||''};return j;}
function errText(e){const k=e&&e.error;if(e&&e.status===429||k==='limit')return T("Today's limit for Ask is used up — try again tomorrow.");if(k==='off')return T('Ask is not switched on yet — the AI key is missing.');
  if(e&&(e.status===401||e.status===403))return T('Ask is for the owner, managers and office.');return T('Could not reach Ask — check the signal and try again.');}
// what it's doing right now, in plain words
const STEP={find_jobs:i=>T('Looking for')+' '+(i.query||'')+'…',open_job:()=>T('Opening the job…'),job_summary:()=>T('Reading the job…'),find_people:i=>T('Looking for')+' '+(i.query||'')+'…',
  create_task:()=>T('Sending the task…'),open_tasks:()=>T('Checking open tasks…'),hours:()=>T('Adding up the hours…'),working_now:()=>T('Checking who is clocked in…'),schedule:()=>T('Checking the schedule…'),
  orr_status:()=>T('Checking O&R…'),job_cost:()=>T('Adding up the job cost…'),open_screen:()=>T('Opening…')};
let status='';
async function send(text){text=String(text||'').trim();if(!text||busy)return;busy=true;try{speechSynthesis.cancel();}catch(e){}P17._spoken=log.length;
  msgs.push({role:'user',content:text});log.push({who:'me',text});status=T('Thinking…');render(true);
  try{for(let round=0;round<8;round++){const j=await call();const content=j.content||[];msgs.push({role:'assistant',content});
      const said=content.filter(c=>c.type==='text').map(c=>c.text).join('\n').trim();const uses=content.filter(c=>c.type==='tool_use');
      if(said&&(!uses.length||j.stop_reason!=='tool_use'))log.push({who:'ai',text:said});else if(said)status=said.split('\n')[0].slice(0,90);
      if(!uses.length||j.stop_reason!=='tool_use')break;
      const results=[];for(const u of uses){status=(STEP[u.name]||(()=>T('Working…')))(u.input||{});render(true);let out;
        try{out=await (TOOLS[u.name]?TOOLS[u.name](u.input||{}):{error:'unknown tool'});}catch(e){out={error:String(e&&e.message||e).slice(0,200)};}
        if(out&&out._act){log.push({who:'act',text:out._act,undo:out._undo||null,kind:u.name});}const clean=Array.isArray(out)?out:Object.assign({},out);if(!Array.isArray(clean)){delete clean._act;delete clean._undo;}
        results.push({type:'tool_result',tool_use_id:u.id,content:JSON.stringify(clean).slice(0,12000)});}
      msgs.push({role:'user',content:results});status=T('Thinking…');render(true);}
  }catch(e){log.push({who:'err',text:errText(e)});if(msgs.length&&msgs[msgs.length-1].role==='user'&&typeof msgs[msgs.length-1].content==='string')msgs.pop();}
  busy=false;status='';render(true);
  if(talk||heard){const said=log.slice(P17._spoken).filter(x=>x.who==='ai').map(x=>x.text).join('. ');if(said)speak(said);}heard=false;P17._spoken=log.length;}
// small, safe Markdown: **bold**, - bullets, 1. lists, line breaks
function md(t){const L=E(t).split('\n');let h='',ul=false,ol=false;const close=()=>{if(ul){h+='</ul>';ul=false;}if(ol){h+='</ol>';ol=false;}};
  const inl=x=>x.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<i>$2</i>');
  L.forEach(l=>{let m;if((m=/^\s*[-•*]\s+(.*)$/.exec(l))){if(!ul){close();h+='<ul>';ul=true;}h+='<li>'+inl(m[1])+'</li>';}
    else if((m=/^\s*\d+[.)]\s+(.*)$/.exec(l))){if(!ol){close();h+='<ol>';ol=true;}h+='<li>'+inl(m[1])+'</li>';}
    else{close();if(l.trim())h+='<p>'+inl(l)+'</p>';}});close();return h;}
const IC={spk:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
  mute:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>',
  copy:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  mic:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>',
  up:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  stop:'<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
  x:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  edit:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  spark:'<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"/><path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" opacity=".6"/></svg>',
  job:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/></svg>',
  task:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  clock:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  cost:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.8 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3"/></svg>'};
const greet=()=>{const h=+new Date().toLocaleString('en-US',{hour:'numeric',hour12:false,timeZone:'America/New_York'});const n=((M()||{}).name||'').split(' ')[0];
  return (LG()==='es'?(h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches'):(h<12?'Good morning':h<18?'Good afternoon':'Good evening'))+(n?', '+n:'');};
const canCost=()=>{const m=M();return !!m&&(m.role==='owner'||(m.role==='office'&&m.title==='Payroll'));};
function item(x,i){
  if(x.who==='me')return '<div class="p17u"><div>'+E(x.text).replace(/\n/g,'<br>')+'</div></div>';
  if(x.who==='act'){const ic=x.kind==='create_task'?IC.task:IC.job;return '<div class="p17card"><span class="p17ci">'+ic+'</span><span class="p17ct">'+E(String(x.text).replace(/^[^\w¿¡]+/,''))+'</span>'+(x.undo?'<button class="p17lnk" onclick="P17.undo(\''+E(x.undo)+'\')">'+E(T('Undo'))+'</button>':'')+'</div>';}
  if(x.who==='err')return '<div class="p17card p17bad"><span class="p17ct">'+E(x.text)+'</span></div>';
  return '<div class="p17a">'+md(x.text)+'<div class="p17tools"><button onclick="P17.say('+i+')" aria-label="read it">'+IC.spk+'</button><button onclick="P17.copy('+i+')" aria-label="copy">'+IC.copy+'</button></div></div>';}
function render(scroll){const b=$('p17list');if(!b)return;
  if(!log.length){const sug=[[IC.job,T('Pull up a job'),T('Pull up ')],[IC.task,T('Make a task'),T('Make a task for ')],[IC.clock,T('Who is working now?'),T('Who is working now?')]].concat(canCost()?[[IC.cost,T('What did a job cost?'),T('What did  cost?')]]:[[IC.clock,T('Hours this week'),T('How many hours this week on ')]]);
    b.innerHTML='<div class="p17home"><div class="p17mark">'+IC.spark+'</div><div class="p17hi">'+E(greet())+'</div><div class="p17sub">'+E(T('Ask about jobs, hours, tasks and costs — or tell me what to do.'))+'</div>'
      +'<div class="p17sug">'+sug.map(s=>'<button onclick="P17.start(\''+E(s[2]).replace(/'/g,'&#39;')+'\')"><span>'+s[0]+'</span>'+E(s[1])+'</button>').join('')+'</div></div>';}
  else b.innerHTML='<div class="p17col">'+log.map(item).join('')+(busy?'<div class="p17st"><span class="p17spin"></span>'+E(status||T('Thinking…'))+'</div>':'')+'</div>';
  const sb=$('p17send');if(sb)sb.disabled=busy;if(scroll)b.scrollTop=b.scrollHeight;}
P17.start=t=>{const i=$('p17in');i.value=t;i.focus();try{i.setSelectionRange(t.indexOf('  ')>=0?t.indexOf('  ')+1:t.length,t.indexOf('  ')>=0?t.indexOf('  ')+1:t.length);}catch(e){}grow();};
P17.copy=i=>{const x=log[i];if(!x)return;try{navigator.clipboard.writeText(x.text);toast('✓ '+T('Copied'),'green');}catch(e){}};
P17.ex=el=>{const i=$('p17in');i.value=el.textContent;i.focus();};
P17.undo=id=>{try{P14.cancel(id);}catch(e){}};
const grow=()=>{const i=$('p17in');if(!i)return;i.style.height='auto';i.style.height=Math.min(160,i.scrollHeight)+'px';const s=$('p17send');if(s)s.classList.toggle('on',!!i.value.trim()||rec.on);};
P17.go=()=>{if(rec.on){P17.mic();return;}const i=$('p17in');const v=i.value;i.value='';grow();send(v);};
P17.clear=()=>{if(busy)return;msgs=[];log=[];render();};
P17.open=()=>{if(!allowed())return;build();paintSpk();try{$('p17ttl').textContent=LG()==='es'?'Asistente Electrix':'Electrix Assistant';$('p17lis').lastChild.textContent=T('Listening… talk as long as you want, then tap ■');}catch(e){}try{$('p17in').placeholder=T('Ask anything, or tell me what to do…');}catch(e){}$('p17').classList.remove('hid');render(true);setTimeout(()=>{try{$('p17in').focus();}catch(e){}},150);};
P17.close=()=>{try{speechSynthesis.cancel();}catch(e){}if(rec.on)stopRec(false);closeAsk();};

// 🎤 listening that keeps going: it does not stop when you pause — it stops when you tap ■ (or after 40 s of silence).
// Phones end a listening session by themselves after a pause; it is restarted at once and the words are kept.
const rec={on:false,r:null,done:'',live:'',last:0,base:''};
function recUI(){const c=$('p17comp');if(c)c.classList.toggle('rec',rec.on);const m=$('p17mic');if(m)m.innerHTML=rec.on?IC.stop:IC.mic;const l=$('p17lis');if(l)l.hidden=!rec.on;grow();}
function stopRec(sendIt){rec.on=false;try{rec.r&&rec.r.stop();}catch(e){}rec.r=null;recUI();const i=$('p17in');if(sendIt&&i&&i.value.trim()){heard=true;const v=i.value;i.value='';grow();send(v);}}
function startOne(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;const r=new SR();rec.r=r;r.lang=LG()==='es'?'es-US':'en-US';r.interimResults=true;r.continuous=true;r.maxAlternatives=1;
  r.onresult=e=>{let fin='',tmp='';for(let k=e.resultIndex;k<e.results.length;k++){const x=e.results[k];if(x.isFinal)fin+=x[0].transcript;else tmp+=x[0].transcript;}
    if(fin)rec.done=(rec.done+' '+fin).replace(/\s+/g,' ').trim();rec.live=tmp;rec.last=Date.now();const i=$('p17in');i.value=(rec.base+' '+rec.done+' '+rec.live).replace(/\s+/g,' ').trim();grow();};
  r.onerror=ev=>{if(ev&&(ev.error==='not-allowed'||ev.error==='service-not-allowed')){toast(T('Allow the microphone for this app in the phone settings.'));stopRec(false);}};
  r.onend=()=>{if(!rec.on)return;if(Date.now()-rec.last>40000){stopRec(false);return;}setTimeout(()=>{if(rec.on)try{startOne();}catch(e){stopRec(false);}},120);};
  try{r.start();}catch(e){}}
P17.mic=()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast(T("Voice doesn't work on this phone — use the microphone on the keyboard."));try{$('p17in').focus();}catch(e){}return;}
  if(rec.on){stopRec(true);return;}try{speechSynthesis.cancel();}catch(e){}const i=$('p17in');rec.on=true;rec.done='';rec.live='';rec.base=i.value.trim();rec.last=Date.now();recUI();startOne();};
// 🔊 reads the answers out loud (the phone's own voice — free, no AI). On/off is remembered; asking with 🎤 always answers out loud.
let talk=false,heard=false;try{talk=localStorage.getItem('p17talk')==='1';}catch(e){}
const cleanSay=s=>String(s||'').replace(/\*\*/g,'').replace(/^[-•]\s*/gm,'').replace(/[✨📂✅↗⚠]/g,'').replace(/(\d),(\d{3})/g,'$1$2').replace(/\$(\d+(?:\.\d+)?)/g,'$1 dollars');
function speak(text){try{const ss=window.speechSynthesis;if(!ss)return;ss.cancel();const t=cleanSay(text);if(!t.trim())return;
  const es=/[ñáéíóú¿¡]/i.test(t)||/\b(el|la|los|las|para|con|que|está|horas)\b/i.test(t)&&!/\b(the|and|with|hours)\b/i.test(t);
  const lang=es?'es-US':'en-US';const vs=ss.getVoices();const v=vs.find(v=>v.lang===lang&&/natural|enhanced|premium|samantha|google|neural/i.test(v.name))||vs.find(v=>v.lang===lang)||vs.find(v=>v.lang&&v.lang.slice(0,2)===lang.slice(0,2));
  (t.match(/[^.!?\n]{1,220}[.!?]?/g)||[t]).filter(x=>x.trim().replace(/[.,!? ]/g,'')).forEach(x=>{const u=new SpeechSynthesisUtterance(x.trim());u.lang=lang;u.rate=1.02;if(v)u.voice=v;ss.speak(u);});}catch(e){}}
P17.say=i=>{const x=log[i];if(x)speak(x.text);};
function paintSpk(){const b=$('p17spk');if(b){b.innerHTML=talk?IC.spk:IC.mute;b.classList.toggle('on',talk);b.setAttribute('aria-pressed',talk?'true':'false');}}
P17.talk=()=>{talk=!talk;try{localStorage.setItem('p17talk',talk?'1':'0');}catch(e){}if(!talk)try{speechSynthesis.cancel();}catch(e){}paintSpk();toast(talk?T('Answers will be read out loud'):T('Answers will not be read out loud'));};
P17._spoken=0;
P17.tools=TOOLS;P17._score=score;

function build(){if($('p17'))return;const o=document.createElement('div');o.id='p17';o.className='hid';
  o.innerHTML='<div class="p17top"><button class="p17ib" onclick="P17.close()" aria-label="close">'+IC.x+'</button><div class="p17ttl" id="p17ttl"></div>'
    +'<button class="p17ib" id="p17spk" onclick="P17.talk()" aria-label="read answers out loud"></button><button class="p17ib" onclick="P17.clear()" aria-label="new chat">'+IC.edit+'</button></div>'
    +'<div id="p17list"></div>'
    +'<div class="p17foot"><div class="p17comp" id="p17comp"><div class="p17lis" id="p17lis" hidden><span class="p17dot"></span>'+E(T('Listening… talk as long as you want, then tap ■'))+'</div>'
    +'<textarea id="p17in" data-nomic="1" rows="1" oninput="P17._g()" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();P17.go();}"></textarea>'
    +'<div class="p17bar"><button class="p17ib p17mic" id="p17mic" onclick="P17.mic()" aria-label="talk">'+IC.mic+'</button><span style="flex:1"></span><button class="p17send" id="p17send" onclick="P17.go()" aria-label="send">'+IC.up+'</button></div></div></div>';
  document.body.appendChild(o);}
P17._g=()=>grow();
const css=document.createElement('style');css.textContent=
 '#p17{--a-bg:#faf9f7;--a-ink:#1f1e1c;--a-mute:#77746d;--a-line:#e7e4dd;--a-user:#efece6;--a-card:#fff;--a-acc:var(--blue-mid,#d93a2b);position:fixed;inset:0;z-index:260;background:var(--a-bg);color:var(--a-ink);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top)}'
+'html[data-theme=dark] #p17{--a-bg:#1f1e1d;--a-ink:#eceae5;--a-mute:#9c9890;--a-line:#363431;--a-user:#2e2c2a;--a-card:#272624}#p17.hid{display:none}'
+'.p17top{display:flex;align-items:center;gap:4px;padding:8px 8px}.p17ttl{flex:1;text-align:center;font-weight:600;font-size:15.5px;letter-spacing:.1px}'
+'.p17ib{width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:var(--a-ink);display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.p17ib:active{background:var(--a-user)}.p17ib.on{color:var(--a-acc)}'
+'#p17list{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}.p17col{max-width:720px;margin:0 auto;padding:14px 18px 24px;display:flex;flex-direction:column;gap:18px}'
+'.p17u{display:flex;justify-content:flex-end}.p17u>div{background:var(--a-user);padding:10px 15px;border-radius:20px;max-width:85%;font-size:16px;line-height:1.45;white-space:normal;word-wrap:break-word}'
+'.p17a{font-size:16.5px;line-height:1.62}.p17a p{margin:0 0 10px}.p17a ul,.p17a ol{margin:0 0 10px;padding-left:22px}.p17a li{margin:3px 0}.p17a b{font-weight:650}'
+'.p17tools{display:flex;gap:2px;margin-top:-2px;opacity:.75}.p17tools button{border:0;background:transparent;color:var(--a-mute);width:34px;height:30px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center}.p17tools button:active{background:var(--a-user)}'
+'.p17card{display:flex;align-items:center;gap:10px;background:var(--a-card);border:1px solid var(--a-line);border-radius:14px;padding:10px 12px;font-size:14.5px}.p17ci{width:32px;height:32px;border-radius:9px;background:var(--a-user);display:inline-flex;align-items:center;justify-content:center;color:var(--a-acc);flex:none}.p17ct{flex:1;min-width:0}.p17bad{color:var(--red,#b42318)}'
+'.p17lnk{border:0;background:transparent;color:var(--a-acc);font-weight:600;font-size:14px;padding:6px}'
+'.p17st{display:flex;align-items:center;gap:10px;color:var(--a-mute);font-size:14.5px}.p17spin{width:16px;height:16px;border-radius:50%;border:2px solid var(--a-line);border-top-color:var(--a-acc);animation:p17r .8s linear infinite}@keyframes p17r{to{transform:rotate(360deg)}}'
+'.p17home{max-width:560px;margin:0 auto;padding:12vh 22px 20px;text-align:center}.p17mark{color:var(--a-acc);margin-bottom:10px}.p17hi{font-size:27px;font-weight:600;letter-spacing:-.3px;margin-bottom:6px}.p17sub{color:var(--a-mute);font-size:15px;margin-bottom:24px}'
+'.p17sug{display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:left}.p17sug button{display:flex;align-items:center;gap:9px;background:var(--a-card);border:1px solid var(--a-line);border-radius:14px;padding:12px;color:var(--a-ink);font-size:14.5px;line-height:1.25;cursor:pointer}.p17sug span{color:var(--a-acc);display:inline-flex}'
+'.p17foot{padding:6px 12px calc(10px + env(safe-area-inset-bottom))}.p17comp{max-width:720px;margin:0 auto;background:var(--a-card);border:1px solid var(--a-line);border-radius:24px;padding:10px 10px 8px 16px;box-shadow:0 2px 14px rgba(0,0,0,.06)}'
+'.p17comp textarea{display:block;width:100%;border:0;outline:0;resize:none;background:transparent;color:var(--a-ink);font-size:16.5px;line-height:1.45;min-height:26px;max-height:160px;padding:4px 0}'
+'.p17bar{display:flex;align-items:center;gap:6px;margin-top:4px}.p17mic{border-radius:50%;color:var(--a-mute)}.p17comp.rec{border-color:var(--a-acc)}.p17comp.rec .p17mic{background:var(--a-acc);color:#fff}'
+'.p17send{width:38px;height:38px;border-radius:50%;border:0;background:var(--a-line);color:var(--a-mute);display:inline-flex;align-items:center;justify-content:center}.p17send.on{background:var(--a-acc);color:#fff}.p17send:disabled{opacity:.5}'
+'.p17lis{display:flex;align-items:center;gap:8px;color:var(--a-acc);font-size:13.5px;font-weight:600;margin-bottom:4px}.p17dot{width:9px;height:9px;border-radius:50%;background:var(--a-acc);animation:p17p 1s ease-in-out infinite}@keyframes p17p{50%{transform:scale(1.6);opacity:.5}}'
+'.p17lis[hidden]{display:none!important}#p17 .p17comp textarea,#p17 .p17comp textarea:focus{border:0!important;outline:0!important;box-shadow:none!important;-webkit-appearance:none;border-radius:0;margin:0}.p17sug button{text-align:left;justify-content:flex-start}'
+'@media(min-width:700px){.p17sug{grid-template-columns:1fr 1fr 1fr 1fr}}';
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
  "Could not reach Ask — check the signal and try again.":"No se pudo conectar — revise la señal e intente otra vez.","Looking for":"Buscando","Opening the job…":"Abriendo el trabajo…","Reading the job…":"Leyendo el trabajo…","Sending the task…":"Enviando la tarea…","Checking open tasks…":"Revisando tareas abiertas…","Adding up the hours…":"Sumando las horas…","Checking who is clocked in…":"Revisando quién está marcado…","Checking the schedule…":"Revisando el horario…","Checking O&R…":"Revisando O&R…","Adding up the job cost…":"Sumando el costo del trabajo…","Opening…":"Abriendo…","Working…":"Trabajando…","Thinking…":"Pensando…","Pull up a job":"Abrir un trabajo","Pull up ":"Abre ","Make a task":"Hacer una tarea","Make a task for ":"Haz una tarea para ","What did a job cost?":"¿Cuánto costó un trabajo?","What did  cost?":"¿Cuánto costó  ?","Hours this week":"Horas esta semana","How many hours this week on ":"¿Cuántas horas esta semana en ","Ask about jobs, hours, tasks and costs — or tell me what to do.":"Pregunte por trabajos, horas, tareas y costos — o dígame qué hacer.","Ask anything, or tell me what to do…":"Pregunte lo que sea, o dígame qué hacer…","Listening… talk as long as you want, then tap ■":"Escuchando… hable lo que quiera y luego toque ■","Allow the microphone for this app in the phone settings.":"Permita el micrófono para esta app en los ajustes del teléfono.","Voice doesn't work on this phone — use the microphone on the keyboard.":"La voz no funciona en este teléfono — use el micrófono del teclado.","Copied":"Copiado","Answers will be read out loud":"Las respuestas se leerán en voz alta","Answers will not be read out loud":"Las respuestas no se leerán en voz alta"});}catch(e){}
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
