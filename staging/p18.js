/* p18 — Reports v2 (Baruch 11/15, design approved on the canvas: "B — period as one button", tab "Labor").
   Built from the owner's view: what the company spent, per job, on whom and on what — only from data the app already has.
   Pages: Overview · Jobs (→ one job) · Labor · Material. One small period button next to the title.
   Money for labor/travel (wages) only for the owner and Payroll (canEditHours); receipts as before for everyone who sees Reports.
   Same numbers as before: labor = hours × what each man was actually paid that week (Fingercheck paycheck, overtime included),
   weeks with no paycheck yet = his hourly rate with overtime (estimate); travel = paid in Fingercheck + the app's trips not paid yet. */
(function(){
if(window.EX_P18_OFF)return;
const $=id=>document.getElementById(id);
const T=s=>{try{return t(s);}catch(e){return s;}};
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const M=()=>{try{return me();}catch(e){return null;}};
const DAY=864e5;
const LG=()=>{try{return lang();}catch(e){return 'en';}};
const LOCX=()=>LG()==='es'?'es-US':'en-US';
const $$=v=>'$'+Math.round(+v||0).toLocaleString('en-US');
const H1=v=>(Math.round((+v||0)*10)/10).toLocaleString('en-US');
const money=()=>{const m=M();try{return !!m&&canEditHours(m);}catch(e){return false;}};
const sname=id=>{if(!id||id==='none')return T('No job');if(String(id).startsWith('fc:'))return String(id).slice(3);try{return siteName(id)||id;}catch(e){return id;}};
const short=id=>String(sname(id)).split(',')[0];
const nm=id=>{try{return nameOf(id);}catch(e){return id;}};
const crewNm=id=>{const c=(D.crews||[]).find(x=>x.id===id);return c?c.name:'';};
const wkKey=ts=>{try{return dkey(weekStart(new Date(ts)));}catch(e){return '';}};
const tsOf=d=>new Date(d+'T12:00').getTime();
const fmtD=(ms,o)=>new Date(ms).toLocaleDateString(LOCX(),o||{month:'short',day:'numeric'});

let S={tab:'ov',per:'month',ca:null,cb:null,job:null,jobAll:true,sort:'cost',q:'',menu:'',allPpl:false,allRec:false,allP:false,stuck:false};

// ── periods (a current period is compared with the same number of days of the one before) ──
function per(){const now=Date.now();const t0=new Date();t0.setHours(0,0,0,0);const d0=t0.getTime();
  const ws=(()=>{try{return weekStart(new Date(d0)).getTime();}catch(e){return d0-t0.getDay()*DAY;}})();
  const ms=new Date(t0.getFullYear(),t0.getMonth(),1).getTime(),ys=new Date(t0.getFullYear(),0,1).getTime();
  const pm=new Date(t0.getFullYear(),t0.getMonth()-1,1).getTime(),ppm=new Date(t0.getFullYear(),t0.getMonth()-2,1).getTime();
  const R={week:{a:ws,b:ws+7*DAY,pa:ws-7*DAY,cur:1,l:'This week',c:'vs same days last week'},
    lastweek:{a:ws-7*DAY,b:ws,pa:ws-14*DAY,pb:ws-7*DAY,l:'Last week',c:'vs the week before'},
    month:{a:ms,b:new Date(t0.getFullYear(),t0.getMonth()+1,1).getTime(),pa:pm,cur:1,l:'This month',c:'vs same days last month'},
    lastmonth:{a:pm,b:ms,pa:ppm,pb:pm,l:'Last month',c:'vs the month before'},
    year:{a:ys,b:new Date(t0.getFullYear()+1,0,1).getTime(),pa:new Date(t0.getFullYear()-1,0,1).getTime(),cur:1,l:'This year',c:'vs same days last year'}};
  let r=R[S.per];
  if(S.per==='custom'&&S.ca){const a=tsOf(S.ca)-12*36e5,b=tsOf(S.cb||S.ca)+12*36e5;r={a,b,pa:a-(b-a),pb:a,l:fmtD(a)+' – '+fmtD(b-DAY),c:'vs the days before'};}
  if(!r)r=R.month;r=Object.assign({},r);
  if(r.cur){r.pb=r.pa+(Math.min(now,r.b)-r.a);}   // same number of days so far
  r.shown=fmtD(r.a)+' – '+fmtD(Math.min(now,r.b-1));return r;}

// ── loading older months (same server helper the old Reports used) ──
let H=null;
function hist(from){try{H=repHist(Math.max(from,new Date(2025,0,1).getTime()),()=>render());}catch(e){H=null;}return H;}
function punIn(a,b){const ok=H&&H.state==='ok';const inR=ts=>ts>=a&&ts<b;const out=[];
  (D.punches||[]).forEach(p=>{if(p&&inR(p.in)&&payCounts(p)&&(p.out||p.away)&&!(ok&&p.in<H.cut))out.push({who:p.who,in:p.in,site:p.site||'none',h:punchDur(p)});});
  if(ok){H.agg.forEach(x=>{const w=tsOf(x.wk);if(w>=a-6*DAY&&w<b&&inR(Math.max(w,a)))out.push(x);});
    H.raw.forEach(p=>{if(inR(p.in)&&payCounts(p)&&(p.out||p.away))out.push({who:p.who,in:p.in,site:p.site||'none',h:punchDur(p)});});}
  return out;}

// ── one pass over everything in a period ──
function calc(a,b){const L=laborModel(a,b,H);const inR=ts=>ts>=a&&ts<b;
  const J={},P={},tot={h:0,lab:0,mat:0,tr:0,gas:0,gasN:0,otH:0,otPay:0,est:false,noRate:{}};
  const job=k=>J[k]||(J[k]={h:0,lab:0,mat:0,tr:0,ppl:{},wk:{},rec:[]});
  const pp=k=>P[k]||(P[k]={h:0,lab:0,tr:0,gas:0,otH:0,otPay:0,jobs:{}});
  const wkH={};
  punIn(a,b).forEach(p=>{const wk=p.wk||L.wkey(p.in);const k=p.who+'|'+wk;const pr=L.perHour(k);if(pr.est)tot.est=true;if(pr.none)tot.noRate[p.who]=1;
    const c=p.h*pr.r,j=job(p.site);j.h+=p.h;j.lab+=c;const q=j.ppl[p.who]||(j.ppl[p.who]={h:0,c:0});q.h+=p.h;q.c+=c;j.wk[wk]=(j.wk[wk]||0)+c;
    const P1=pp(p.who);P1.h+=p.h;P1.lab+=c;P1.jobs[p.site]=1;tot.h+=p.h;tot.lab+=c;wkH[k]=1;});
  // overtime: weeks that start inside the period — the paycheck's overtime when there is one, else hours over 40 at time and a half
  Object.keys(wkH).forEach(k=>{const [who,wk]=k.split('|');const w=tsOf(wk);if(w<a-DAY||w>=b)return;
    const c=(D.fcpay||[]).filter(x=>x&&!x.deleted&&x.who===who&&x.periodBegin===wk);let oh=0,op=0;
    if(c.length){c.forEach(x=>{oh+=+x.otH||0;op+=+x.ot||0;});}
    else{const h=L.wk[k]||0;oh=Math.max(0,h-OT_AFTER);const r=rateOf(who);op=r!=null?oh*r*1.5:0;}
    if(oh>0){const P1=pp(who);P1.otH+=oh;P1.otPay+=op;tot.otH+=oh;tot.otPay+=op;P1.otWk=Math.max(P1.otWk||0,L.wk[k]||0);}});
  const stores={},mats=[],gas=[];
  (D.exps||[]).forEach(x=>{if(!x||x.deleted||!x.date||!inR(tsOf(x.date)))return;const v=+x.amt||0;
    if(x.type==='material'){const j=job(x.site||'none');j.mat+=v;j.rec.push(x);tot.mat+=v;const s=x.vendor||T('Other');stores[s]=(stores[s]||0)+v;mats.push(x);}
    else if(x.type==='gas'){tot.gas+=v;tot.gasN++;pp(x.who).gas+=v;gas.push(x);}});
  const appTr=x=>travelCounts(x)&&!L.paidTr[x.who+'|'+L.wkey(tsOf(x.date))];
  (D.travel||[]).forEach(x=>{if(!x||!x.date||!inR(tsOf(x.date))||!appTr(x))return;const v=travelPayOf(x);job(x.site||'none').tr+=v;pp(x.who).tr+=v;tot.tr+=v;});
  (D.fcpay||[]).forEach(c=>{if(!c||c.deleted||!c.periodBegin||!inR(tsOf(c.periodBegin)))return;
    (Array.isArray(c.trJobs)?c.trJobs:[]).forEach(z=>{const k=z.site||(z.job?'fc:'+z.job:'none');job(k).tr+=+z.amt||0;tot.tr+=+z.amt||0;});
    if(+c.travel>0)pp(c.who).tr+=+c.travel;});
  return {J,P,tot,stores,mats,gas};}
const PL=(n,one,many)=>n+' '+T(n===1?one:many);
const cost=(x,m)=>(m?x.lab+x.tr:0)+x.mat;

// ── look ──
const IC={chev:'<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  back:'<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  ok:'<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue-mid,#d93a2b)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>',
  search:'<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  dl:'<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>'};
const css=document.createElement('style');css.textContent=
 '#r18{--r18l:#2c3347;--r18m:var(--blue-mid,#d93a2b);--r18t:#f2b45a;max-width:640px;margin:0 auto;padding-bottom:30px}'
+'html[data-theme=dark] #r18{--r18l:#c9ccd6}'
+'#r18 .rh{display:flex;align-items:center;justify-content:space-between;gap:10px}#r18 .rh h2{margin:0}'
+'#r18 .per{font:inherit;font-size:13.5px;font-weight:600;color:var(--g5);background:var(--g1);border:0;border-radius:8px;padding:7px 10px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap}'
+'#r18 .r18t{display:flex;gap:24px;margin:12px 0 0;border-bottom:1px solid var(--g2);overflow-x:auto}'
+'#r18 .r18t{scrollbar-width:none}#r18 .r18t::-webkit-scrollbar{display:none}'
+'#r18 .r18t button{font:inherit;font-size:14.5px;background:none;border:0;padding:8px 0 10px;color:var(--g4);position:relative;white-space:nowrap}'
+'#r18 .r18t button.on{color:var(--g5);font-weight:600}#r18 .r18t button.on::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px;background:var(--r18m)}'
+'#r18 .sub{font-size:12.5px;color:var(--g4);margin:10px 0 0}'
+'#r18 .sec{font-size:12px;font-weight:600;color:var(--g4);text-transform:uppercase;letter-spacing:.5px;margin:18px 2px 8px;display:flex;justify-content:space-between;align-items:baseline}'
+'#r18 .sec button{font:inherit;text-transform:none;letter-spacing:0;color:var(--r18m);background:none;border:0;padding:0;font-weight:600}'
+'#r18 .g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}#r18 .g2 .card{margin:0}'
+'#r18 .tl{font-size:12px;color:var(--g4)}#r18 .tv{font-size:21px;font-weight:650;color:var(--g5);margin-top:3px;letter-spacing:-.3px}#r18 .td{font-size:11.5px;color:var(--g4);margin-top:2px}'
+'#r18 .up{color:var(--red)}#r18 .dn{color:var(--green)}'
+'#r18 .split{display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--g1)}'
+'#r18 .lab{background:var(--r18l)}#r18 .mat{background:var(--r18m)}#r18 .trv{background:var(--r18t)}'
+'#r18 .leg{display:flex;gap:12px;font-size:12px;color:var(--g4);margin-top:8px;flex-wrap:wrap}#r18 .dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px}'
+'#r18 .row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--g1)}#r18 .row:first-child{border-top:0}'
+'#r18 .jr{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:none;border:0;border-top:1px solid var(--g1);padding:10px 0}#r18 .jr:first-child{border-top:0}'
+'#r18 .rn{font-weight:600;color:var(--g5);font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis}#r18 .rs{font-size:12px;color:var(--g4);margin-top:2px}#r18 .rv{font-weight:650;color:var(--g5);text-align:right;white-space:nowrap}'
+'#r18 .bars{display:flex;align-items:flex-end;gap:8px;height:96px}#r18 .bars div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;height:100%;font-size:11px;color:var(--g4)}'
+'#r18 .bars span{display:block;width:100%;border-radius:4px 4px 2px 2px;background:var(--g3);min-height:2px}#r18 .bars .cur span{background:var(--r18l)}'
+'#r18 .stg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;text-align:center}#r18 .stg b{display:block;font-size:20px;color:var(--g5);font-weight:650}#r18 .stg span{font-size:11px;color:var(--g4);line-height:1.2}'
+'#r18 .warn{color:var(--amber);font-weight:600}'
+'#r18 .hb{height:6px;border-radius:3px;background:var(--g1);margin-top:6px;overflow:hidden}#r18 .hb i{display:block;height:100%;border-radius:3px}'
+'#r18 .fun{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}#r18 .fun div{text-align:center;background:var(--g1);border-radius:10px;padding:10px 4px}#r18 .fun b{display:block;font-size:20px;color:var(--g5)}#r18 .fun span{font-size:11.5px;color:var(--g4)}'
+'#r18 .srch{display:flex;gap:8px;align-items:center;margin-top:12px;color:var(--g4)}#r18 .srch input{flex:1;margin:0}'
+'#r18 .lnk{font:inherit;background:none;border:0;color:var(--g4);padding:0;display:inline-flex;align-items:center;gap:3px;font-size:13px}#r18 .lnk b{color:var(--g5)}'
+'#r18 .back{font:inherit;background:none;border:0;color:var(--r18m);display:inline-flex;align-items:center;gap:4px;padding:0;font-size:14px}'
+'#r18 .big{font-size:30px;font-weight:700;color:var(--g5);letter-spacing:-.5px}'
+'#r18 table{width:100%;border-collapse:collapse;font-size:13.5px}#r18 td{padding:8px 0;border-top:1px solid var(--g1);vertical-align:top}#r18 tr:first-child td{border-top:0}#r18 td.n{text-align:right;font-weight:600;color:var(--g5);white-space:nowrap;padding-left:10px}#r18 td.m{text-align:right;color:var(--g4);white-space:nowrap;padding-left:10px}'
+'#r18 .more{font:inherit;background:none;border:0;color:var(--r18m);font-weight:600;padding:8px 0 0;font-size:13.5px}'
+'#r18 .xbtn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:16px}'
+'#r18 .note2{font-size:12.5px;color:var(--g4);margin-top:8px}'
+'.r18dim{position:fixed;inset:0;z-index:240;background:rgba(20,24,40,.15)}'
+'.r18menu{position:fixed;z-index:241;min-width:210px;background:#fff;border:1px solid var(--g2);border-radius:12px;box-shadow:0 10px 28px rgba(20,24,40,.18);padding:4px 0}'
+'html[data-theme=dark] .r18menu{background:#1c1c1e}'
+'.r18menu button{display:flex;justify-content:space-between;align-items:center;width:100%;font:inherit;font-size:14.5px;background:none;border:0;padding:11px 14px;color:var(--g5);text-align:left}.r18menu button.on{font-weight:600}.r18menu hr{border:0;border-top:1px solid var(--g1);margin:4px 0}';
document.head.appendChild(css);

const SPLIT=(x,m)=>{const tt=cost(x,m)||1;return '<div class="split"><div class="lab" style="width:'+(m?x.lab/tt*100:0)+'%"></div><div class="mat" style="width:'+(x.mat/tt*100)+'%"></div><div class="trv" style="width:'+(m?x.tr/tt*100:0)+'%"></div></div>';};
const LEG=m=>'<div class="leg">'+(m?'<span><i class="dot lab"></i>'+E(T('Labor'))+'</span>':'')+'<span><i class="dot mat"></i>'+E(T('Material'))+'</span>'+(m?'<span><i class="dot trv"></i>'+E(T('Travel'))+'</span>':'')+'</div>';
const chg=(v,p)=>{if(!p)return '';const d=Math.round((v-p)/p*100);if(!isFinite(d))return '';return '<span class="'+(d>0?'up':'dn')+'">'+(d>0?'↑ ':'↓ ')+Math.abs(d)+'%</span> ';};
const tile=(l,v,d)=>'<div class="card"><div class="tl">'+E(l)+'</div><div class="tv">'+v+'</div>'+(d?'<div class="td">'+d+'</div>':'')+'</div>';
const sec=(l,btn)=>'<div class="sec"><span>'+E(l)+'</span>'+(btn||'')+'</div>';

// ── pages ──
function head(){const r=per();
  return '<div class="rh"><h2>'+E(T('Reports'))+'</h2><button class="per" onclick="R18.menu(this,\'per\')">'+E(T(r.l))+IC.chev+'</button></div>'
   +'<div class="r18t" role="tablist">'+[['ov','Overview'],['jobs','Jobs'],['lab','Labor'],['mat','Material']].map(([k,l])=>'<button role="tab" class="'+(S.tab===k?'on':'')+'" onclick="R18.tab(\''+k+'\')">'+E(T(l))+'</button>').join('')+'</div>'
   +'<div class="sub">'+E(r.shown)+' · '+E(T(r.c))+'</div>';}
function histNote(){if(!H||H.state==='ok')return '';return '<div class="note2">'+(H.state==='loading'?'⏳ '+E(T('Loading older months from the server…')):'<span class="warn">'+E(T('Older months could not be loaded (no connection?) — numbers may be low.'))+'</span>')+'</div>';}
function estNote(c,m){const n=Object.keys(c.tot.noRate);let s='';if(m&&c.tot.est)s+=E(T('Weeks not paid yet are estimated from hourly rates.'))+' ';if(m&&n.length)s+=E(T('No pay info for'))+' '+E(n.map(nm).join(', '))+'. ';return s?'<div class="note2">'+s+'</div>':'';}

function pgOv(r,c,p,m){const t=c.tot,q=p.tot;
  let h='<div class="g2">'+(m?tile(T('Total cost'),$$(t.lab+t.mat+t.tr),chg(t.lab+t.mat+t.tr,q.lab+q.mat+q.tr)+E(T('vs before')))+tile(T('Labor'),$$(t.lab),chg(t.lab,q.lab)+(t.lab+t.mat+t.tr?Math.round(t.lab/(t.lab+t.mat+t.tr)*100)+'% '+E(T('of cost')):''))
      :tile(T('Hours worked'),H1(t.h)+' h',chg(t.h,q.h)+E(T('vs before')))+tile(T('Overtime'),H1(t.otH)+' h',''))
    +tile(T('Material'),$$(t.mat),chg(t.mat,q.mat)+E(T('receipts')))+(m?tile(T('Travel'),$$(t.tr),chg(t.tr,q.tr)):tile(T('Gas'),$$(t.gas),t.gasN+' '+E(T('fill-ups'))))+'</div>';
  if(m)h+='<div class="card" style="margin-top:8px"><div class="row" style="padding:0 0 10px;border:0"><div><div class="rs" style="margin:0">'+E(T('Hours worked'))+'</div><div class="rn" style="font-size:18px">'+H1(t.h)+' h</div></div><div style="text-align:right"><div class="rs" style="margin:0">'+E(T('Overtime'))+'</div><div class="rn" style="font-size:18px">'+H1(t.otH)+' h · <span class="up">'+$$(t.otPay)+'</span></div></div></div>'+SPLIT(t,m)+LEG(m)+'</div>';
  // last 6 months
  const ms=[];const now=new Date();for(let i=5;i>=0;i--){const a=new Date(now.getFullYear(),now.getMonth()-i,1).getTime(),b=new Date(now.getFullYear(),now.getMonth()-i+1,1).getTime();const cc=calc(a,b).tot;ms.push({l:new Date(a).toLocaleDateString(LOCX(),{month:'short'}),v:m?cc.lab+cc.mat+cc.tr:cc.h});}
  const mx=Math.max(1,...ms.map(x=>x.v));
  h+=sec(m?T('Cost · last 6 months'):T('Hours · last 6 months'))+'<div class="card"><div class="bars">'+ms.map((x,i)=>'<div class="'+(i===5?'cur':'')+'" title="'+E(m?$$(x.v):H1(x.v)+' h')+'"><span style="height:'+Math.round(x.v/mx*72)+'px"></span>'+E(x.l)+'</div>').join('')+'</div></div>';
  const top=Object.keys(c.J).filter(k=>k!=='none').sort((a,b)=>cost(c.J[b],m)-cost(c.J[a],m)||c.J[b].h-c.J[a].h).slice(0,4);
  h+=sec(T('Top jobs'),'<button onclick="R18.tab(\'jobs\')">'+E(T('All jobs'))+' ›</button>')+'<div class="card">'+(top.length?top.map(k=>jobRow(k,c.J[k],m)).join(''):'<div class="rs">—</div>')+'</div>';
  h+=sec(T('Where jobs stand'))+stand();
  return h;}
function stand(){const now=Date.now();const live=(D.sites||[]).filter(s=>s&&!s.deleted&&s.stage!=='done'&&!s.archived);
  const K=[['upcoming','Upcoming'],['ready','Confirmed'],['active','Roughing'],['roughdone','Rough Complete'],['inspection','Finishing']];
  const cnt=k=>live.filter(s=>(s.stage==='priced'?'upcoming':s.stage||'upcoming')===k).length;
  const stuck=live.filter(s=>['ready','active','roughdone','inspection'].includes(s.stage)&&s.stageAt&&now-s.stageAt>30*DAY).sort((a,b)=>a.stageAt-b.stageAt);
  const orr=(D.orr||[]).filter(o=>o&&!o.deleted&&!['done','cancel'].includes(o.status));const wait=orr.filter(o=>o.status==='sent');
  const oldest=orr.length?Math.max(...orr.map(o=>Math.floor((now-(o.upd||o.ts||now))/DAY))):0;
  const t0=new Date();t0.setHours(0,0,0,0);const booked=(D.insp||[]).filter(i=>i&&i.status==='booked'&&i.at>=t0.getTime()&&i.at<t0.getTime()+7*DAY).length;
  const req=(D.insp||[]).filter(i=>i&&i.status==='requested').length;
  return '<div class="card"><div class="stg">'+K.map(([k,l])=>'<div><b>'+cnt(k)+'</b><span>'+E(T(l))+'</span></div>').join('')+'</div>'
   +'<button class="jr" style="margin-top:8px" onclick="R18.set(\'stuck\',!R18.S.stuck)"><div class="row" style="padding:0;border:0"><span class="rn" style="font-weight:500">'+E(T("Haven't moved in 30+ days"))+'</span><span class="'+(stuck.length?'warn':'rv')+'">'+stuck.length+' '+E(T(stuck.length===1?'job':'jobs'))+'</span></div></button>'
   +(S.stuck&&stuck.length?'<div style="padding:0 0 6px">'+stuck.map(s=>'<div class="rs" style="display:flex;justify-content:space-between"><span>'+E(short(s.id))+' · '+E(T((STAGE[s.stage]||[''])[0]))+'</span><span>'+Math.floor((now-s.stageAt)/DAY)+' '+E(T('days'))+'</span></div>').join('')+'</div>':'')
   +'<div class="row"><span class="rn" style="font-weight:500;flex:none">'+E(T('O&R open'))+'</span><span style="text-align:right" class="'+(wait.length?'warn':'rv')+'">'+orr.length+(orr.length?' · '+wait.length+' '+E(T('waiting on O&R'))+' · '+E(T('longest'))+' '+oldest+' '+E(T('days')):'')+'</span></div>'
   +'<div class="row"><span class="rn" style="font-weight:500;flex:none">'+E(T('Inspections booked'))+'</span><span class="rv" style="white-space:normal">'+booked+' '+E(T('in the next 7 days'))+(req?' · <span class="warn">'+req+' '+E(T('to book'))+'</span>':'')+'</span></div></div>';}
function jobRow(k,j,m){const s=(D.sites||[]).find(x=>x.id===k);const sub=[s&&s.crew?crewNm(s.crew):'',s&&s.stage?T((STAGE[s.stage]||[''])[0]):''].filter(Boolean).join(' · ');
  return '<button class="jr" onclick="R18.open(\''+String(k).replace(/'/g,"\\'")+'\')"><div style="display:flex;justify-content:space-between;gap:10px"><div style="min-width:0"><div class="rn">'+E(short(k))+'</div><div class="rs">'+E(sub)+'</div></div><div class="rv">'+(m||j.mat?$$(cost(j,m)):'')+'<div class="rs" style="font-weight:400">'+H1(j.h)+' h</div></div></div><div style="margin-top:8px">'+SPLIT(j,m)+'</div></button>';}
function pgJobs(r,c,m){const q=S.q.trim().toLowerCase();let ks=Object.keys(c.J).filter(k=>k!=='none'&&(!q||sname(k).toLowerCase().includes(q)));
  const st=k=>{const s=(D.sites||[]).find(x=>x.id===k);return s?Object.keys(STAGE).indexOf(s.stage):99;};
  const so={cost:(a,b)=>cost(c.J[b],m)-cost(c.J[a],m)||c.J[b].h-c.J[a].h,hours:(a,b)=>c.J[b].h-c.J[a].h,az:(a,b)=>sname(a).localeCompare(sname(b)),step:(a,b)=>st(a)-st(b)||sname(a).localeCompare(sname(b))};
  ks.sort(so[S.sort]||so.cost);const SL={cost:m?'Highest cost':'Most material',hours:'Most hours',az:'A–Z',step:'Step'};
  const all=Object.keys(c.J).filter(k=>k!=='none').reduce((s,k)=>s+cost(c.J[k],m),0);
  return '<div class="srch">'+IC.search+'<input type="search" placeholder="'+E(T('Search a job'))+'" value="'+E(S.q)+'" oninput="R18.q(this.value)" data-nomic="1"></div>'
   +'<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px"><span class="rs" style="margin:0">'+E(PL(ks.length,'job','jobs'))+'</span><button class="lnk" onclick="R18.menu(this,\'sort\')">'+E(T('Sort'))+': <b>'+E(T(SL[S.sort]))+'</b>'+IC.chev+'</button></div>'
   +'<div class="card" style="margin-top:8px">'+(ks.length?ks.map(k=>jobRow(k,c.J[k],m)).join(''):'<div class="rs">'+E(T('No jobs with hours or receipts in this period.'))+'</div>')+'</div>'
   +(m||all?'<div class="card" style="display:flex;justify-content:space-between"><span class="rn" style="font-weight:500">'+E(T('All jobs'))+'</span><span class="rv">'+$$(all)+'</span></div>':'')+LEG(m)
   +(c.J.none&&(c.J.none.h||c.J.none.mat)?'<div class="note2">'+E(T('Not on a job'))+': '+H1(c.J.none.h)+' h'+(c.J.none.mat?' · '+$$(c.J.none.mat):'')+'</div>':'');}
function pgJob(r,m){const k=S.job;const a=S.jobAll?0:r.a,b=S.jobAll?Infinity:r.b;if(S.jobAll)hist(0);
  const c=calc(a,b===Infinity?Date.now()+DAY:b);const j=c.J[k]||{h:0,lab:0,mat:0,tr:0,ppl:{},wk:{},rec:[]};const s=(D.sites||[]).find(x=>x.id===k);
  const sub=[s&&s.crew?crewNm(s.crew):'',s&&s.stage?T((STAGE[s.stage]||[''])[0]):''].filter(Boolean).join(' · ');
  let h='<button class="back" onclick="R18.open(null)">'+IC.back+E(T('Jobs'))+'</button>'
   +'<div class="rh" style="margin-top:8px"><h2 style="font-size:20px">'+E(short(k))+'</h2><button class="per" onclick="R18.menu(this,\'job\')">'+E(S.jobAll?T('Whole job'):T(r.l))+IC.chev+'</button></div>'
   +'<div class="sub">'+E(sub)+(S.jobAll?'':' · '+E(r.shown))+'</div>'+histNote();
  const ppl=Object.keys(j.ppl).sort((x,y)=>(m?j.ppl[y].c-j.ppl[x].c:0)||j.ppl[y].h-j.ppl[x].h);
  h+='<div class="card" style="margin-top:12px"><div class="rs" style="margin:0">'+E(m?T('Total cost'):T('Hours'))+(S.jobAll?' · '+E(T('so far')):'')+'</div><div class="big">'+(m?$$(cost(j,m)):H1(j.h)+' h')+'</div><div style="margin-top:10px">'+SPLIT(j,m)+'</div>'
   +'<table style="margin-top:8px">'+(m?'<tr><td><i class="dot lab"></i>'+E(T('Labor'))+' · '+H1(j.h)+' h · '+E(PL(ppl.length,'person','people'))+'</td><td class="n">'+$$(j.lab)+'</td></tr>':'<tr><td>'+E(T('Hours'))+' · '+E(PL(ppl.length,'person','people'))+'</td><td class="n">'+H1(j.h)+' h</td></tr>')
   +'<tr><td><i class="dot mat"></i>'+E(T('Material'))+' · '+E(PL(j.rec.length,'receipt','receipts'))+'</td><td class="n">'+$$(j.mat)+'</td></tr>'+(m?'<tr><td><i class="dot trv"></i>'+E(T('Travel'))+'</td><td class="n">'+$$(j.tr)+'</td></tr>':'')+'</table>'+estNote(c,m)+'</div>';
  const wks=Object.keys(j.wk).sort().slice(-8);if(wks.length){const mx=Math.max(1,...wks.map(w=>j.wk[w]));
    const hw={};if(!m){Object.keys(j.wk).forEach(w=>hw[w]=0);}
    h+=sec(m?T('Labor by week'):T('Weeks worked'))+'<div class="card"><div class="bars">'+wks.map((w,i)=>'<div class="'+(i===wks.length-1?'cur':'')+'" title="'+E(m?$$(j.wk[w]):'')+'"><span style="height:'+Math.round(j.wk[w]/mx*72)+'px"></span>'+E(fmtD(tsOf(w)))+'</div>').join('')+'</div></div>';}
  if(ppl.length){const show=S.allPpl?ppl:ppl.slice(0,5);
    h+=sec(T('Who worked here'))+'<div class="card"><table>'+show.map(w=>{const e=(D.emps||[]).find(x=>x.id===w);return '<tr><td><div class="rn" style="font-size:13.5px">'+E(nm(w))+'</div><div class="rs">'+E(e&&e.crew?crewNm(e.crew):'')+'</div></td><td class="m">'+H1(j.ppl[w].h)+' h</td>'+(m?'<td class="n">'+$$(j.ppl[w].c)+'</td>':'')+'</tr>';}).join('')+'</table>'
     +(ppl.length>5?'<button class="more" onclick="R18.set(\'allPpl\',!R18.S.allPpl)">'+E(S.allPpl?T('Show less'):T('All')+' '+ppl.length)+'</button>':'')+'</div>';}
  if(j.rec.length){const rec=j.rec.slice().sort((x,y)=>String(y.date).localeCompare(String(x.date)));const show=S.allRec?rec:rec.slice(0,4);
    h+=sec(T('Material receipts'))+'<div class="card"><table>'+show.map(x=>'<tr><td>'+E(x.vendor||T('Store not entered'))+'<div class="rs">'+E(fmtD(tsOf(x.date)))+' · '+E(nm(x.who))+'</div></td><td class="n">'+(x.amt?$$(x.amt):'<span class="warn">'+E(T('no amount'))+'</span>')+'</td></tr>').join('')+'</table>'
     +(rec.length>4?'<button class="more" onclick="R18.set(\'allRec\',!R18.S.allRec)">'+E(S.allRec?T('Show less'):T('All')+' '+rec.length)+'</button>':'')+'</div>';}
  if(s){h+=sec(T('Step'))+'<div class="card"><div class="row" style="padding:0;border:0"><span class="rn">'+E(T((STAGE[s.stage]||['—'])[0]))+'</span><span class="rs" style="margin:0">'+(s.stageAt?E(T('since'))+' '+E(fmtD(s.stageAt))+' · '+Math.floor((Date.now()-s.stageAt)/DAY)+' '+E(T('days')):'')+'</span></div></div>';}
  h+='<button class="btn sec2 xbtn" onclick="R18.exportJob()">'+IC.dl+E(T('Export this job (Excel)'))+'</button>';
  return h;}
function pgLab(r,c,p,m){const t=c.tot;const P=c.P;
  let h='<div class="g2">'+tile(T('Hours worked'),H1(t.h)+' h',chg(t.h,p.tot.h)+E(T('vs before')))+tile(T('Overtime'),H1(t.otH)+' h',m?$$(t.otPay)+' '+E(T('overtime pay')):'')+'</div>';
  const cr={};Object.keys(P).forEach(w=>{const e=(D.emps||[]).find(x=>x.id===w);const k=e&&e.crew||'';const o=cr[k]||(cr[k]={h:0,c:0,n:0,ot:0});o.h+=P[w].h;o.c+=P[w].lab;if(P[w].h)o.n++;if(P[w].otH)o.ot++;});
  const ck=Object.keys(cr).filter(k=>cr[k].h).sort((a,b)=>{const ia=(D.crews||[]).findIndex(x=>x.id===a),ib=(D.crews||[]).findIndex(x=>x.id===b);return (ia<0?99:ia)-(ib<0?99:ib);});const cmx=Math.max(1,...ck.map(k=>cr[k].h));
  h+=sec(T('By crew'))+'<div class="card">'+(ck.length?ck.map(k=>{const cc=(D.crews||[]).find(x=>x.id===k);const ty=cc&&cc.type?T(cc.type==='finish'?'Finish':'Rough'):'';
      return '<div class="row" style="display:block"><div style="display:flex;justify-content:space-between;gap:10px"><div><div class="rn">'+E(k?crewNm(k):T('Office & others'))+'</div><div class="rs">'+E([ty,PL(cr[k].n,'person','people'),H1(cr[k].h)+' h'].filter(Boolean).join(' · '))+'</div></div><div class="rv">'+(m?$$(cr[k].c):'')+(cr[k].ot?'<div class="rs" style="font-weight:400">'+cr[k].ot+' '+E(T('on overtime'))+'</div>':'')+'</div></div><div class="hb"><i style="width:'+Math.round(cr[k].h/cmx*100)+'%;background:var(--r18l)"></i></div></div>';}).join(''):'<div class="rs">—</div>')+'</div>';
  const ot=Object.keys(P).filter(w=>P[w].otH>0).sort((a,b)=>P[b].otH-P[a].otH);
  h+=sec(T('Overtime'))+'<div class="card">'+(ot.length?ot.map(w=>{const e=(D.emps||[]).find(x=>x.id===w);return '<div class="row"><div><div class="rn">'+E(nm(w))+'</div><div class="rs">'+E(e&&e.crew?crewNm(e.crew):'')+(P[w].otWk?' · '+E(T('longest week'))+' '+H1(P[w].otWk)+' h':'')+'</div></div><div class="rv"><span class="warn">'+H1(P[w].otH)+' h</span>'+(m?'<div class="rs" style="font-weight:400">'+$$(P[w].otPay)+'</div>':'')+'</div></div>';}).join(''):'<div class="rs">'+E(T('No overtime in this period.'))+'</div>')+'</div>';
  const pl=Object.keys(P).filter(w=>P[w].h>0).sort((a,b)=>P[b].h-P[a].h);const show=S.allP?pl:pl.slice(0,8);
  h+=sec(T('Hours by person'))+'<div class="card"><table>'+show.map(w=>{const e=(D.emps||[]).find(x=>x.id===w);return '<tr><td><div class="rn" style="font-size:13.5px">'+E(nm(w))+'</div><div class="rs">'+E(e&&e.crew?crewNm(e.crew):'')+' · '+E(PL(Object.keys(P[w].jobs).filter(x=>x!=='none').length,'job','jobs'))+'</div></td><td class="m">'+H1(P[w].h)+' h</td>'+(m?'<td class="n">'+$$(P[w].lab)+'</td>':'')+'</tr>';}).join('')+'</table>'
   +(pl.length>8?'<button class="more" onclick="R18.set(\'allP\',!R18.S.allP)">'+E(S.allP?T('Show less'):T('All')+' '+pl.length)+'</button>':'')+'</div>';
  const tg=Object.keys(P).filter(w=>(m&&P[w].tr)||P[w].gas).sort((a,b)=>((m?P[b].tr:0)+P[b].gas)-((m?P[a].tr:0)+P[a].gas));
  if(tg.length)h+=sec(m?T('Travel & gas by person'):T('Gas by person'))+'<div class="card"><table><tr><td class="rs">'+E(T('Person'))+'</td>'+(m?'<td class="m">'+E(T('Travel'))+'</td>':'')+'<td class="m">'+E(T('Gas'))+'</td></tr>'+tg.slice(0,10).map(w=>'<tr><td>'+E(nm(w))+'</td>'+(m?'<td class="n">'+$$(P[w].tr)+'</td>':'')+'<td class="n">'+$$(P[w].gas)+'</td></tr>').join('')+'</table></div>';
  if(!m)h+='<div class="note2">'+E(T('Pay and costs show only for the owner and Payroll.'))+'</div>';
  return h+estNote(c,m);}
function pgMat(r,c,p,m){const t=c.tot;const now=Date.now();
  let h='<div class="g2">'+tile(T('Material'),$$(t.mat),chg(t.mat,p.tot.mat)+E(T('vs before')))+tile(T('Gas'),$$(t.gas),chg(t.gas,p.tot.gas)+t.gasN+' '+E(T('fill-ups')))+'</div>';
  const R=(D.mats||[]).filter(x=>x&&!x.deleted&&x.ts>=r.a&&x.ts<r.b);
  const ordered=R.filter(x=>x.status!=='open'||(x.st&&x.st!=='requested')).length,deliv=R.filter(x=>x.status==='delivered'||x.got).length;
  const tms=R.filter(x=>x.got&&x.got.at&&x.got.at>x.ts).map(x=>(x.got.at-x.ts)/DAY);const avg=tms.length?tms.reduce((s,v)=>s+v,0)/tms.length:null;
  const late=(D.mats||[]).filter(x=>x&&!x.deleted&&x.status==='open'&&(!x.st||x.st==='requested')&&now-x.ts>2*DAY).length;
  h+=sec(T('Requests to Menachem'))+'<div class="card"><div class="fun"><div><b>'+R.length+'</b><span>'+E(T('Asked'))+'</span></div><div><b>'+ordered+'</b><span>'+E(T('Ordered'))+'</span></div><div><b>'+deliv+'</b><span>'+E(T('Delivered'))+'</span></div></div>'
   +(avg!=null?'<div class="row" style="margin-top:8px"><span class="rn" style="font-weight:500">'+E(T('Asked → at the job'))+'</span><span class="rv">'+(Math.round(avg*10)/10)+' '+E(T('days avg'))+'</span></div>':'')
   +'<div class="row"><span class="rn" style="font-weight:500">'+E(T('Not ordered after 2 days'))+'</span><span class="'+(late?'warn':'rv')+'">'+late+'</span></div></div>';
  const st=Object.keys(c.stores).sort((a,b)=>c.stores[b]-c.stores[a]);const smx=Math.max(1,...st.map(k=>c.stores[k]));
  h+=sec(T('By store'))+'<div class="card">'+(st.length?st.slice(0,8).map(k=>'<div class="row" style="display:block"><div style="display:flex;justify-content:space-between"><span class="rn" style="font-weight:500">'+E(k)+'</span><span class="rv">'+$$(c.stores[k])+'</span></div><div class="hb"><i style="width:'+Math.round(c.stores[k]/smx*100)+'%;background:var(--r18m)"></i></div></div>').join(''):'<div class="rs">—</div>')+'</div>';
  const jk=Object.keys(c.J).filter(k=>c.J[k].mat>0).sort((a,b)=>c.J[b].mat-c.J[a].mat);
  h+=sec(T('By job'),'<button onclick="R18.tab(\'jobs\')">'+E(T('All'))+' ›</button>')+'<div class="card"><table>'+(jk.length?jk.slice(0,6).map(k=>'<tr><td>'+E(short(k))+'</td><td class="n">'+$$(c.J[k].mat)+'</td></tr>').join(''):'<tr><td class="rs">—</td></tr>')+'</table></div>';
  const tk={};(D.stockLog||[]).forEach(x=>{if(!x||x.kind!=='out'||!(x.ts>=r.a&&x.ts<r.b))return;(x.items||[]).forEach(i=>{const k=i.name||i.id;tk[k]=(tk[k]||0)+(+i.qty||0);});});
  const tks=Object.keys(tk).sort((a,b)=>tk[b]-tk[a]);
  h+=sec(T('Taken from the garage'))+'<div class="card"><table>'+(tks.length?tks.slice(0,6).map(k=>'<tr><td>'+E(k)+'</td><td class="n">'+H1(tk[k])+'</td></tr>').join(''):'<tr><td class="rs">'+E(T('Nothing taken in this period.'))+'</td></tr>')+'</table></div>';
  const noAmt=c.mats.filter(x=>!x.amt).length;if(noAmt)h+='<div class="note2"><span class="warn">'+noAmt+' '+E(T('receipts have no amount yet — totals are low until the office enters them.'))+'</span></div>';
  return h;}

// ── draw ──
function render(){const m0=M();if(!m0)return;try{if(!seesRep(m0))return;}catch(e){}
  const pg=$('pg-rep');if(!pg)return;if(!$('r18')){pg.innerHTML='<div id="r18"></div>';}
  const box=$('r18');const r=per();const m=money();
  const need=S.tab==='ov'?Math.min(r.pa,new Date(new Date().getFullYear(),new Date().getMonth()-5,1).getTime()):r.pa;
  if(!S.job)hist(need);
  let body='';try{
    if(S.job)body=pgJob(r,m);
    else{const c=calc(r.a,r.b),p=calc(r.pa,r.pb);
      body=head()+histNote()+(S.tab==='jobs'?pgJobs(r,c,m):S.tab==='lab'?pgLab(r,c,p,m):S.tab==='mat'?pgMat(r,c,p,m):pgOv(r,c,p,m)+estNote(c,m))
        +'<button class="btn sec2 xbtn" onclick="R18.export()">'+IC.dl+E(T('Export (Excel)'))+'</button>';}
  }catch(e){console.error('p18',e);body=head()+'<div class="card" style="margin-top:12px">'+E(T('Could not build the report'))+': '+E(e&&e.message)+'</div>';}
  const fo=document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#r18')&&document.activeElement.type==='search';
  box.innerHTML=body;if(fo){const i=box.querySelector('input[type=search]');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}}}

const R18=window.R18={S};
R18.tab=k=>{S.tab=k;S.job=null;render();try{window.scrollTo(0,0);}catch(e){}};
R18.set=(k,v)=>{S[k]=v;render();};
let qT=0;R18.q=v=>{S.q=v;clearTimeout(qT);qT=setTimeout(render,120);};
R18.open=k=>{S.job=k;S.jobAll=true;S.allPpl=false;S.allRec=false;render();try{window.scrollTo(0,0);}catch(e){}};
function closeMenu(){document.querySelectorAll('.r18dim,.r18menu').forEach(x=>x.remove());}
R18.menu=(btn,kind)=>{closeMenu();const rc=btn.getBoundingClientRect();let items=[];
  if(kind==='per')items=[['week','This week'],['lastweek','Last week'],['month','This month'],['lastmonth','Last month'],['year','This year'],['-'],['custom','Pick dates…']].map(([k,l])=>k==='-'?'<hr>':'<button class="'+(S.per===k?'on':'')+'" onclick="R18.pick(\'per\',\''+k+'\')">'+E(T(l))+(S.per===k?IC.ok:'')+'</button>');
  if(kind==='sort'){const m=money();items=[['cost',m?'Highest cost':'Most material'],['hours','Most hours'],['az','A–Z'],['step','Step']].map(([k,l])=>'<button class="'+(S.sort===k?'on':'')+'" onclick="R18.pick(\'sort\',\''+k+'\')">'+E(T(l))+(S.sort===k?IC.ok:'')+'</button>');}
  if(kind==='job'){const r=per();items=[['all',T('Whole job')],['per',T(r.l)]].map(([k,l])=>{const on=(k==='all')===S.jobAll;return '<button class="'+(on?'on':'')+'" onclick="R18.pick(\'job\',\''+k+'\')">'+E(l)+(on?IC.ok:'')+'</button>';});}
  const d=document.createElement('div');d.className='r18dim';d.onclick=closeMenu;document.body.appendChild(d);
  const mn=document.createElement('div');mn.className='r18menu';mn.innerHTML=items.join('');mn.style.top=Math.round(rc.bottom+6)+'px';mn.style.right=Math.max(8,Math.round(window.innerWidth-rc.right))+'px';document.body.appendChild(mn);};
R18.pick=(kind,v)=>{closeMenu();
  if(kind==='per'){if(v==='custom'){const d0=new Date().toISOString().slice(0,10);try{askPrompt(T('Pick dates'),[{label:T('From'),value:S.ca||d0,type:'date'},{label:T('To'),value:S.cb||d0,type:'date'}],([a,b])=>{if(!a)return;if(b&&b<a)[a,b]=[b,a];S.ca=a;S.cb=b||a;S.per='custom';render();});}catch(e){}return;}S.per=v;}
  if(kind==='sort')S.sort=v;if(kind==='job')S.jobAll=v==='all';render();};
function dl(name,rows){const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  try{const b=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);toast('✓ '+T('Saved')+' — '+name,'green');}catch(e){toast(T('Could not export'));}}
const r2=v=>Math.round((+v||0)*100)/100;
R18.export=()=>{const r=per(),m=money(),c=calc(r.a,r.b);const ks=Object.keys(c.J).sort((a,b)=>cost(c.J[b],m)-cost(c.J[a],m));
  dl('Electrix report '+dkey(new Date(r.a))+'.csv',[[T('Job'),T('Hours')].concat(m?[T('Labor')]:[]).concat([T('Material')]).concat(m?[T('Travel'),T('Total')]:[])].concat(ks.map(k=>{const j=c.J[k];return [sname(k),r2(j.h)].concat(m?[r2(j.lab)]:[]).concat([r2(j.mat)]).concat(m?[r2(j.tr),r2(cost(j,m))]:[]);})));};
R18.exportJob=()=>{const r=per(),m=money();const a=S.jobAll?0:r.a,b=S.jobAll?Date.now()+DAY:r.b;const c=calc(a,b);const j=c.J[S.job];if(!j){toast(T('Nothing to export'));return;}
  const rows=[[sname(S.job)],[],[T('Person'),T('Hours')].concat(m?[T('Pay')]:[])].concat(Object.keys(j.ppl).map(w=>[nm(w),r2(j.ppl[w].h)].concat(m?[r2(j.ppl[w].c)]:[])))
    .concat([[],[T('Date'),T('Store'),T('Who'),T('Amount')]]).concat(j.rec.map(x=>[x.date,x.vendor||'',nm(x.who),r2(x.amt)]))
    .concat([[],[T('Labor'),m?r2(j.lab):''],[T('Material'),r2(j.mat)],[T('Travel'),m?r2(j.tr):''],[T('Total'),m?r2(cost(j,m)):r2(j.mat)]]);
  dl(short(S.job)+' — job cost.csv',rows);};

// take over the Reports page (no old page kept as a fallback — Baruch 11/15)
window.renderRep=render;try{renderRep=render;}catch(e){}
try{Object.assign(ES,{"Overview":"Resumen","Jobs":"Trabajos","Labor":"Mano de obra","Material":"Material","Travel":"Viaje","This week":"Esta semana","Last week":"Semana pasada","This month":"Este mes","Last month":"Mes pasado","This year":"Este año","Pick dates…":"Elegir fechas…","Pick dates":"Elegir fechas","From":"Desde","To":"Hasta",
 "vs same days last week":"vs mismos días de la semana pasada","vs the week before":"vs la semana anterior","vs same days last month":"vs mismos días del mes pasado","vs the month before":"vs el mes anterior","vs same days last year":"vs mismos días del año pasado","vs the days before":"vs los días anteriores","vs before":"vs antes",
 "Total cost":"Costo total","of cost":"del costo","Hours worked":"Horas trabajadas","Overtime":"Horas extra","receipts":"recibos","Gas":"Gasolina","fill-ups":"cargas","Cost · last 6 months":"Costo · últimos 6 meses","Hours · last 6 months":"Horas · últimos 6 meses","Top jobs":"Trabajos principales","All jobs":"Todos los trabajos",
 "Where jobs stand":"Cómo van los trabajos","Upcoming":"Próximos","Confirmed":"Confirmados","Roughing":"Rough","Rough Complete":"Rough terminado","Finishing":"Terminación","Haven't moved in 30+ days":"Sin moverse en 30+ días","jobs":"trabajos","job":"trabajo","person":"persona","receipt":"recibo","days":"días","O&R open":"O&R abiertos","waiting on O&R":"esperando a O&R","longest":"el más largo","Inspections booked":"Inspecciones agendadas","in the next 7 days":"en los próximos 7 días","to book":"por agendar",
 "Search a job":"Buscar un trabajo","Sort":"Ordenar","Highest cost":"Mayor costo","Most material":"Más material","Most hours":"Más horas","A–Z":"A–Z","Step":"Paso","No jobs with hours or receipts in this period.":"No hay trabajos con horas o recibos en este período.","Not on a job":"Sin trabajo",
 "Whole job":"Todo el trabajo","so far":"hasta ahora","Hours":"Horas","people":"personas","Labor by week":"Mano de obra por semana","Weeks worked":"Semanas trabajadas","Who worked here":"Quién trabajó aquí","Show less":"Mostrar menos","All":"Todos","Material receipts":"Recibos de material","Store not entered":"Tienda sin poner","no amount":"sin monto","since":"desde","Export this job (Excel)":"Exportar este trabajo (Excel)","Export (Excel)":"Exportar (Excel)",
 "overtime pay":"pago de horas extra","By crew":"Por equipo","Office & others":"Oficina y otros","Finish":"Terminación","Rough":"Rough","on overtime":"con horas extra","longest week":"semana más larga","No overtime in this period.":"Sin horas extra en este período.","Hours by person":"Horas por persona","Travel & gas by person":"Viaje y gasolina por persona","Gas by person":"Gasolina por persona","Person":"Persona","Pay and costs show only for the owner and Payroll.":"El pago y los costos solo los ven el dueño y Nómina.",
 "Requests to Menachem":"Pedidos a Menachem","Asked":"Pedidos","Ordered":"Ordenados","Delivered":"Entregados","Asked → at the job":"Pedido → en el trabajo","days avg":"días en promedio","Not ordered after 2 days":"Sin ordenar después de 2 días","By store":"Por tienda","By job":"Por trabajo","Taken from the garage":"Sacado del garaje","Nothing taken in this period.":"No se sacó nada en este período.","Other":"Otro",
 "Weeks not paid yet are estimated from hourly rates.":"Las semanas aún no pagadas se estiman con la tarifa por hora.","No pay info for":"Sin información de pago para","Loading older months from the server…":"Cargando meses anteriores del servidor…","Older months could not be loaded (no connection?) — numbers may be low.":"No se pudieron cargar los meses anteriores (¿sin conexión?) — los números pueden salir bajos.","No job":"Sin trabajo","Could not build the report":"No se pudo hacer el reporte","Could not export":"No se pudo exportar","Nothing to export":"Nada que exportar","Job":"Trabajo","Total":"Total","Pay":"Pago","Date":"Fecha","Store":"Tienda","Who":"Quién","Amount":"Monto"});}catch(e){}
})();
