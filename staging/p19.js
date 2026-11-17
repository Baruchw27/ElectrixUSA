/* p19 — Payroll page, cleaned up (Baruch 11/15, design approved on the canvas "Electrix Payroll — cleanup").
   • 4 tabs as words with a small line: Time cards · Today · To fix · Setup (Punch log and Job hours are gone — Reports has job hours;
     every punch is fixed from the time card: tap a day letter → that day for everyone, tap a number → that man's day, open to fix).
   • Time cards: one small "Week ▾ / Day ▾" button by the title, one "Send to Fingercheck" card (hours + travel), "Only problems".
   • Day: day strip with dates, a 6 AM – 8 PM bar per man (colors = jobs), the row opens to fix right there + a list of changes.
   • Today: Working now / Done today / Not in yet / Not on the time clock. To fix: missing punches + automatic clock warnings.
   • Setup: the long travel explanation folds behind "How travel pay works". Narrower and centered on a computer.
   Only the look and the way around change — saving, the rules and Fingercheck sending are the app's own functions. */
(function(){
if(window.EX_P19_OFF)return;
const $=id=>document.getElementById(id);
const T=s=>{try{return t(s);}catch(e){return s;}};
const E=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const J=s=>{try{return jsq(s);}catch(e){return String(s).replace(/'/g,"\\'");}};
const LOCX=()=>{try{return LOC();}catch(e){return 'en-US';}};
const CHEV='<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const OKI='<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue-mid,#d93a2b)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';
let onlyProb=false;

const css=document.createElement('style');css.textContent=
 '#pg-hours{max-width:760px;margin-left:auto;margin-right:auto}'
+'#p19h{display:flex;align-items:center;justify-content:space-between;gap:10px}#p19h h2{margin:0}'
+'.p19per{font:inherit;font-size:13.5px;font-weight:600;color:var(--g5);background:var(--g1);border:0;border-radius:8px;padding:7px 10px;display:inline-flex;align-items:center;gap:4px;cursor:pointer}'
+'#paySeg.p19tabs{display:flex;gap:20px;margin:12px 0 14px!important;border-bottom:1px solid var(--g2);overflow-x:auto;scrollbar-width:none}#paySeg.p19tabs::-webkit-scrollbar{display:none}'
+'#paySeg.p19tabs button{font:inherit;font-size:14.5px;background:none;border:0;padding:8px 0 10px;color:var(--g4);position:relative;white-space:nowrap;cursor:pointer}'
+'#paySeg.p19tabs button.on{color:var(--g5);font-weight:600}#paySeg.p19tabs button.on::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px;background:var(--blue-mid,#d93a2b)}'
+'#paySeg.p19tabs .n{display:inline-block;min-width:16px;padding:0 5px;margin-left:5px;border-radius:9px;background:#c0392b;color:#fff;font-size:11px;font-weight:600;line-height:17px;text-align:center}'
+'.p19nav{display:flex;align-items:center;justify-content:space-between;gap:8px}.p19nav button{width:38px;height:38px;border-radius:10px;border:1px solid var(--g2);background:var(--g1);color:var(--g5);font-size:18px;cursor:pointer}'
+'.p19st{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:10px}.p19st>div{background:var(--g1);border-radius:10px;padding:8px 4px;text-align:center}.p19st b{display:block;font-size:17px}.p19st span{font-size:11.5px;color:var(--g4)}'
+'.p19st .bad b{color:#c0392b}.p19st .tap{cursor:pointer}'
+'.p19words{display:flex;gap:18px;margin:12px 2px 2px}.p19words button{font:inherit;font-size:13.5px;background:none;border:0;padding:2px 0 6px;color:var(--g4);position:relative;cursor:pointer}.p19words button.on{color:var(--g5);font-weight:600}.p19words button.on::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;border-radius:2px;background:var(--g5)}'
+'.p19send{padding:4px 14px!important}.p19send .ln{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--g1);cursor:pointer}.p19send .ln:first-of-type{border-top:0}'
+'.p19strip{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:10px}.p19strip button{font:inherit;display:flex;flex-direction:column;align-items:center;padding:6px 0;border-radius:10px;border:0;background:none;color:var(--g4);font-size:11.5px;cursor:pointer}'
+'.p19strip button b{font-size:16px;color:var(--g5);font-weight:600}.p19strip button.on{background:var(--g5);color:var(--g2)}.p19strip button.on b{color:var(--g0,#fff)}'
+'.p19dh{font:inherit;background:none;border:0;padding:4px 0;cursor:pointer;display:inline-flex;flex-direction:column;align-items:center;color:var(--g4);font-size:10.5px;font-weight:600}.p19dh i{font-style:normal;font-weight:400;font-size:9.5px;color:var(--g3)}'
+'.p19cell{cursor:pointer}.p19cell:hover{background:var(--g1)}'
+'.p19bar{position:relative;height:18px;margin-top:3px}.p19bar i{position:absolute;top:0;bottom:0;border-radius:5px;background:#e4e7ec;border-right:2px solid #fff;box-sizing:border-box;font-style:normal;font-size:11px;font-weight:700;color:#3d4350;line-height:18px;text-align:center;overflow:hidden;white-space:nowrap}html[data-theme=dark] .p19bar i{background:#34363c;color:#e2e4e8;border-right-color:#1c1c1e}.p19bar i.mi{background:#f3dcdc;color:#a33}html[data-theme=dark] .p19bar i.mi{background:#4a2c2c;color:#f0b4b4}.p19lab{position:relative;height:17px;margin-top:6px}.p19lab span{position:absolute;bottom:0;font-size:11.5px;color:var(--g4);white-space:nowrap}.p19lab b{color:var(--g5);font-weight:700}.p19tim{margin-top:3px;height:15px}.p19tim span{top:0;bottom:auto;font-size:11px}.p19tim span{color:var(--g4)}'
+'.p19ax{display:flex;justify-content:space-between;font-size:10px;color:var(--g3);margin:4px 0 2px}'
+'.p19chg{font-size:12px;color:var(--g4);padding:3px 2px}'
+'.p19sec{font-size:12px;font-weight:600;color:var(--g4);text-transform:uppercase;letter-spacing:.5px;margin:16px 2px 8px}'
+'.p19row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--g1);cursor:pointer}.p19row:first-child{border-top:0}'
+'.p19nm{font-weight:600;font-size:14px;color:var(--g5);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.p19sub{font-size:12px;color:var(--g4);margin-top:2px}'
+'.p19names{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:14px}.p19names button{font:inherit;background:none;border:0;padding:0;color:var(--g5);cursor:pointer}.p19dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:#e0a33a}'
+'.p19cnt{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.p19cnt>div{text-align:center}.p19cnt b{display:block;font-size:22px}.p19cnt span{font-size:12px;color:var(--g4)}'
+'.p19fix{font:inherit;font-size:13px;font-weight:600;background:var(--g1);color:var(--g5);border:0;border-radius:9px;padding:7px 12px;cursor:pointer;white-space:nowrap}'
+'.p19how summary{cursor:pointer;color:var(--blue-mid,#d93a2b);font-weight:600;font-size:14px;margin:10px 2px;list-style:none}.p19how summary::-webkit-details-marker{display:none}'
+'.p19dim{position:fixed;inset:0;z-index:240}.p19menu{position:fixed;z-index:241;min-width:170px;background:#fff;border:1px solid var(--g2);border-radius:12px;box-shadow:0 10px 28px rgba(20,24,40,.18);padding:4px 0}'
+'html[data-theme=dark] .p19menu{background:#1c1c1e}.p19menu button{display:flex;justify-content:space-between;align-items:center;width:100%;font:inherit;font-size:14.5px;background:none;border:0;padding:11px 14px;color:var(--g5);text-align:left;cursor:pointer}.p19menu button.on{font-weight:600}';
document.head.appendChild(css);

// ── tabs ──
const SECS=[['cards','Time cards'],['today','Today'],['fix','To fix'],['setup','Setup']];
function head(){const pg=$('pg-hours');if(!pg)return;let h=$('p19h');
  if(!h){const h2=pg.querySelector('h2');h=document.createElement('div');h.id='p19h';if(h2){h2.parentNode.insertBefore(h,h2);h.appendChild(h2);}else pg.prepend(h);const r=document.createElement('div');r.id='p19slot';h.appendChild(r);}
  const sl=$('p19slot');if(sl)sl.innerHTML=paySec==='cards'?'<button class="p19per" onclick="P19.menu(this)">'+E(T(tcMode==='day'?'Day':'Week'))+CHEV+'</button>':'';}
window.renderPaySeg=function(){const el=$('paySeg');if(!el)return;if(!SECS.some(s=>s[0]===paySec))paySec='cards';
  const n=payFixCount()+clockIssues().length;el.className='p19tabs';
  el.innerHTML=SECS.map(([k,l])=>'<button class="'+(paySec===k?'on':'')+'" onclick="setPaySec(\''+k+'\')">'+E(T(l))+(k==='fix'&&n?'<span class="n">'+n+'</span>':'')+'</button>').join('');
  document.querySelectorAll('#pg-hours [data-ps]').forEach(d=>{d.style.display=d.getAttribute('data-ps')===paySec?'':'none';});
  head();};
try{renderPaySeg=window.renderPaySeg;}catch(e){}

// ── Week ▾ / Day ▾ ──
function closeMenu(){document.querySelectorAll('.p19dim,.p19menu').forEach(x=>x.remove());}
const P19=window.P19={};
// crews closed on the Time cards page (remembered on this phone)
function p19Closed(){try{return new Set(JSON.parse(localStorage.getItem('p19closed')||'[]'));}catch(e){return new Set();}}
P19.shut=function(id){const c=p19Closed();if(c.has(id))c.delete(id);else c.add(id);try{localStorage.setItem('p19closed',JSON.stringify([...c]));}catch(e){}try{renderTimeCards();}catch(e){}};
P19.menu=btn=>{closeMenu();const rc=btn.getBoundingClientRect();const d=document.createElement('div');d.className='p19dim';d.onclick=closeMenu;document.body.appendChild(d);
  const mn=document.createElement('div');mn.className='p19menu';mn.innerHTML=[['week','Week'],['day','Day']].map(([k,l])=>'<button class="'+(tcMode===k?'on':'')+'" onclick="P19.mode(\''+k+'\')">'+E(T(l))+(tcMode===k?OKI:'')+'</button>').join('');
  mn.style.top=Math.round(rc.bottom+6)+'px';mn.style.right=Math.max(8,Math.round(window.innerWidth-rc.right))+'px';document.body.appendChild(mn);};
P19.mode=k=>{closeMenu();tcOpenRow=null;tcSetMode(k);head();};
// tap a day letter → that day for everyone; tap a number → that man's day, open to fix
P19.day=(i,who)=>{tcDay=i;tcOpenRow=who?who+'|'+i:null;tcMode='day';try{localStorage.setItem('ex_tcmode','day');}catch(e){}renderTimeCards();head();
  if(who)setTimeout(()=>{const el=document.querySelector('[data-p19row="'+who+'"]');if(el)try{el.scrollIntoView({block:'center'});}catch(e){}},30);};
P19.prob=v=>{onlyProb=v;renderTimeCards();};
// open someone's day (from Today / To fix)
P19.open=(who,ms)=>{tcWs=weekStart(new Date(ms)).getTime();const di=dayIndex(ms,tcWs);setPaySec('cards');P19.day(di,who);};

// ── week table: day letters and every number open the day ──
const sCol=(()=>{const P=['#4f7cff','#e0a33a','#2f9e6b','#9b6cf0','#20a4b8','#8d96aa'];const m={};let n=0;return k=>m[k]||(m[k]=P[n++%P.length]);})();
window.tcTable=function(people,ws,sel){const DL=lang()==='es'?['D','L','M','M','J','V','S']:['S','M','T','W','T','F','S'];
  const th='<tr>'+(sel?'<th></th>':'')+'<th style="text-align:left"></th>'+DL.map((d,i)=>'<th style="padding:2px 0">'+(sel?'<span class="p19dh">'+d+'</span>':'<button class="p19dh" onclick="P19.day('+i+')" title="'+E(T('Open this day'))+'">'+d+'<i>'+new Date(ws+i*864e5+12*36e5).getDate()+'</i></button>')+'</th>').join('')+'<th style="font-size:10.5px;color:var(--g4);font-weight:600;text-align:right">'+T('Total')+'</th></tr>';
  const rows=people.map((e,ri)=>{const P=tcPunches(e.id,ws);const s=weekStats(e.id,new Date(ws+12*36e5));const bt=ri?'border-top:1px solid var(--g1);':'';
    const cells=[0,1,2,3,4,5,6].map(i=>{const dp=P.filter(p=>dayIndex(p.in,ws)===i);const miss=dp.some(tcMissing),ed=dp.some(p=>p.edits&&p.edits.length);const h=s.days[i];
      const v=miss?'<span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:50%;background:#fde8e6;color:#c0392b;font-weight:800">!</span>':h?h.toFixed(1):'·';
      return '<td class="'+(sel?'':'p19cell')+'" '+(sel?'':'onclick="event.stopPropagation();P19.day('+i+',\''+J(e.id)+'\')"')+' style="'+bt+'text-align:center;padding:9px 0;font-size:12.5px;'+(miss?'':h?'':'color:var(--g3)')+'">'+v+(ed?'<span style="color:var(--blue-mid)">•</span>':'')+'</td>';}).join('');
    const nm=e.name.split(' ')[0];
    return '<tr style="cursor:pointer" onclick="'+(sel?'tcToggle(\''+J(e.id)+'\')':'openTimeCard(\''+J(e.id)+'\')')+'">'
      +(sel?'<td style="'+bt+'width:26px"><div style="width:20px;height:20px;border-radius:6px;border:2px solid var(--blue-mid);display:flex;align-items:center;justify-content:center;font-size:12px;'+(tcSel.has(e.id)?'background:var(--blue-mid);color:#fff':'')+'">'+(tcSel.has(e.id)?'✓':'')+'</div></td>':'')
      +'<td style="'+bt+'text-align:left;font-weight:600;font-size:13px;white-space:nowrap;max-width:92px;overflow:hidden;text-overflow:ellipsis;padding:9px 4px 9px 0">'+E(nm)+(e.lead?' <span style="color:var(--amber)">★</span>':'')+'</td>'+cells
      +'<td style="'+bt+'text-align:right;white-space:nowrap;padding-left:4px"><b style="font-size:13.5px">'+s.total.toFixed(1)+'</b>'+(s.ot?'<div style="font-size:10.5px;font-weight:600;color:var(--amber)">+'+s.ot.toFixed(1)+' '+E(T('OT'))+'</div>':'')+(()=>{const tp=tcTravel(e.id,ws);return tp?'<div style="font-size:10.5px;color:var(--green)">'+money(tp)+'</div>':'';})()+'</td></tr>';}).join('');
  return '<table style="width:100%;border-collapse:collapse;table-layout:fixed"><colgroup>'+(sel?'<col style="width:28px">':'')+'<col style="width:84px">'+'<col>'.repeat(7)+'<col style="width:58px"></colgroup>'+th+rows+'</table>';};
try{tcTable=window.tcTable;}catch(e){}

// ── day rows: the 6 AM – 8 PM bar under each man (and the list of changes when his day is open) ──
const BAR_A=6,BAR_B=20;
// Baruch 11/15 (3): one plain line; each piece has its hours and its job written right on top of it — no colors to decode.
// Baruch 11/15 (5): a thinner, calm-colored line. Every piece has its job and hours written above it (labels that would
// overlap move to a second row). Under the line only the times where something changes: start, each switch (2:41 — or
// 2:42–2:53 when there was a gap), and the end. Times that fall almost together are joined into one.
// Baruch 11/16: no hour ruler — every man's line runs the full width, from his first punch-in (left) to his last punch-out (right).
function bar(dp){const t0=dp[0].in;const ends=dp.map(p=>p.out||p.away||0).filter(Boolean);const t1=Math.max(t0+36e5,ends.length?Math.max(...ends):0,...dp.map(p=>p.in+(p.out||p.away?0:36e5)));
  const pos=ms=>Math.max(0,Math.min(1,(ms-t0)/(t1-t0)));
  const short=k=>(siteName(k)||T('No site')).replace(/, NY \d{5}/g,'').split(',')[0];
  const tm=ms=>fmtT(ms).replace(/\s?([AP]M)$/i,(m0,x)=>' '+x.toLowerCase());
  const seg=dp.map(p=>{const a=pos(p.in),end=p.out||p.away;const mi=tcMissing(p);const b=end?pos(end):Math.min(1,a+0.05);return {p,a,b,w:Math.max(0.8,(b-a)*100),mi,end};});
  const hrs=p=>punchDur(p)<0.1?Math.max(1,Math.round(punchDur(p)*60))+' '+E(T('min')):punchDur(p).toFixed(1);
  const top='<div class="p19lab" data-p19lay="1">'+seg.map(x=>'<span data-p19x="'+(x.a*100).toFixed(2)+'" style="left:'+(x.a*100).toFixed(2)+'%">'+(x.mi?'<b style="color:#c25b5b">'+E(T('no punch-out'))+'</b> · '+E(short(x.p.site)):E(short(x.p.site))+(x.w<5?' <b>'+hrs(x.p)+'</b>':''))+'</span>').join('')+'</div>';
  // times where something changes
  let pts=[{x:seg[0].a,t:[seg[0].p.in]}];
  for(let i=0;i<seg.length-1;i++){const e1=seg[i].end,s2=seg[i+1].p.in;pts.push({x:seg[i].b,t:e1?[e1,s2]:[s2]});}
  const L=seg[seg.length-1];pts.push({x:L.b,t:[L.end||null]});
  const M=[];pts.forEach(q=>{const k=M[M.length-1];if(k&&q.x-k.x<0.06){k.t=k.t.concat(q.t);}else M.push({x:q.x,t:q.t.slice()});});
  const txt=q=>{const v=q.t.filter(Boolean).sort((a,b)=>a-b);if(!v.length)return '<b style="color:#c25b5b">?</b>';const lo=v[0],hi=v[v.length-1];
    return Math.abs(hi-lo)<60000?tm(lo):tm(lo)+'–'+tm(hi)+(q.t.some(x=>!x)?' ?':'');};
  const bot='<div class="p19lab p19tim" data-p19lay="1">'+M.map((q,i)=>'<span data-p19x="'+(q.x*100).toFixed(2)+'" data-p19al="'+(i===0?'l':i===M.length-1?'r':'c')+'" style="left:'+(q.x*100).toFixed(2)+'%">'+txt(q)+'</span>').join('')+'</div>';
  return top+'<div class="p19bar">'+seg.map(x=>'<i title="'+E((siteName(x.p.site)||'')+' · '+fmtT(x.p.in)+' – '+(x.end?fmtT(x.end):'?'))+'" style="left:'+(x.a*100).toFixed(2)+'%;width:'+x.w.toFixed(2)+'%"'+(x.mi?' class="mi"':'')+'>'+(x.w>=5&&!x.mi?hrs(x.p):'')+'</i>').join('')+'</div>'+bot;}
// labels that would overlap go to the next row; times sit centered on their point (first one left, last one right)
P19.lay=()=>{document.querySelectorAll('[data-p19lay]').forEach(box=>{const W=box.clientWidth;if(!W)return;const rows=[];const tim=box.classList.contains('p19tim');
  [...box.children].forEach(sp=>{sp.style.top='';const w=sp.offsetWidth;let x=parseFloat(sp.getAttribute('data-p19x'))/100*W;const al=sp.getAttribute('data-p19al');
    if(tim){x=al==='l'?x:al==='r'?x-w:x-w/2;}x=Math.max(0,Math.min(W-w,x));
    let r=0;while(rows[r]!=null&&x<rows[r]+8)r++;rows[r]=x+w;sp.style.left=x+'px';if(tim){sp.style.top=(r*15)+'px';}else{sp.style.top='auto';sp.style.bottom=(r*16)+'px';}});
  box.style.height=(Math.max(1,rows.length)*(tim?15:16)+1)+'px';});};
window.addEventListener('resize',()=>{clearTimeout(P19._rt);P19._rt=setTimeout(P19.lay,120);});
// Baruch 11/15 (2): no stacked list of jobs and hours — the day is one line with each job's hours and address written on it.
window.tcDayRow=function(e,ws,di){const dp=tcPunches(e.id,ws).filter(p=>dayIndex(p.in,ws)===di).sort((a,b)=>a.in-b.in);
  const miss=dp.some(tcMissing);const first=dp[0],last=dp[dp.length-1];const h=dp.reduce((q,p)=>q+((p.out||p.away)?punchDur(p):0),0);
  const short=k=>(siteName(k)||T('No site')).replace(/, NY \d{5}/g,'').split(',')[0];
  const sites=[...new Set(dp.map(p=>p.site||''))];const open=tcOpenRow===e.id+'|'+di;
  const night=dp.some(p=>{const e2=p.out||p.away;return e2&&new Date(e2).getDate()!==new Date(p.in).getDate();});
  const jobs=dp.length?[night?'<b style="color:var(--amber)">'+E(T('past midnight'))+'</b>':'',miss?'<b style="color:#c0392b">'+E(T('no punch-out'))+'</b>':''].filter(Boolean).join(' · '):E(T('did not punch'));
  let x='<div data-p19row="'+E(e.id)+'" style="border-top:1px solid var(--g1)"><div style="cursor:pointer;padding:10px 0 '+(dp.length?'6px':'10px')+'" onclick="tcRowTap(\''+J(e.id)+'\','+di+')">'
    +'<div style="display:flex;gap:10px;align-items:center"><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:15.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+E(e.name)+(e.lead?' <span style="color:var(--amber)">★</span>':'')+'</div>'
    +(jobs?'<div style="font-size:12.5px;color:var(--g4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+jobs+'</div>':'')+'</div>'
    +(dp.length?'<div style="font-size:12.5px;color:var(--g4);white-space:nowrap">'+fmtT(first.in)+' – '+(miss?'<b style="color:#c0392b">?</b>':fmtT(last.out||last.away))+'</div><div style="width:46px;text-align:right;font-weight:800;font-size:17px">'+(miss?'':h.toFixed(1))+'</div>':'<div style="color:var(--g3);font-size:13px">—</div>')
    +'<div style="color:var(--g4);font-size:16px;width:14px;text-align:center">'+(open?'⌃':'›')+'</div></div>'
    +(dp.length?bar(dp):'')+'</div>';
  if(open){let ed=tcDayEdit(e,ws,di,dp);const ch=[];dp.forEach(p=>(p.edits||[]).forEach(c=>ch.push(c)));
    if(ch.length){const L=ch.sort((a,b)=>(b.at||b.ts||0)-(a.at||a.ts||0)).slice(0,6).map(c=>'<div class="p19chg">'+E(nm(c.by))+' · '+E(c.at||c.ts?new Date(c.at||c.ts).toLocaleString(LOCX(),{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'')+(c.why?' — '+E(c.why):'')+'</div>').join('');
      const k=ed.lastIndexOf('</div>');ed=ed.slice(0,k)+'<div class="p19sec" style="margin:8px 2px 2px">'+E(T('Changes'))+'</div>'+L+ed.slice(k);}
    x+=ed;}
  return x+'</div>';};
try{tcDayRow=window.tcDayRow;}catch(e){}
const nm=id=>{try{return id?nameOf(id):T('Someone');}catch(e){return id;}};

// ── one Send-to-Fingercheck card (hours + travel; each line opens the app's own check-and-send screen) ──
function sendCard(ws,we){if(!canSendFC())return '';const L=fcWeekPending(ws,we);const bad=L.filter(p=>p.fcSync.state!=='pending').length;
  let tv=[];try{tv=dkey(new Date(ws+12*36e5))<'2026-11-01'?[]:tvWeek(ws,we);}catch(e){}const un=tv.filter(x=>!x.fcSent&&x.pay!=null),sent=tv.filter(x=>x.fcSent);
  if(!L.length&&!un.length&&!sent.length)return '';const men=new Set(un.map(x=>x.who)).size,amt=un.reduce((q,x)=>q+(+x.pay||0),0);
  return '<div class="card p19send"><div style="font-weight:700;font-size:14px;padding:10px 0 2px">'+E(T('Send to Fingercheck'))+'</div>'
   +(L.length?'<div class="ln" onclick="fcSendOpen()"><div style="flex:1"><div style="font-size:14px">'+E(T('Hours'))+'</div><div class="p19sub">'+L.length+' '+E(T(L.length===1?'change not sent yet':'changes not sent yet'))+(bad?' · <span style="color:#c0392b">'+bad+' '+E(T('need a look'))+'</span>':'')+'</div></div><span style="color:var(--blue-mid);font-weight:700">›</span></div>':'')
   +(un.length||sent.length?'<div class="ln" onclick="tvSendOpen()"><div style="flex:1"><div style="font-size:14px">'+E(T('Travel'))+'</div><div class="p19sub">'+(un.length?men+' '+E(T(men===1?'man':'men'))+' · '+money(amt)+' '+E(T('not sent yet')):E(T('All travel for this week was sent')))+'</div></div><span style="color:var(--blue-mid);font-weight:700">›</span></div>':'')+'</div>';}

// ── Time cards ──
function hasProb(e,ws){return tcPunches(e.id,ws).some(tcMissing);}
window.renderTimeCards=function(){const box=$('tcBox');if(!box)return;if(tcEditing()){tcLater();return;}
  const sy=window.scrollY,sc=[];{let el=box.parentElement;while(el){if(el.scrollHeight>el.clientHeight&&el.scrollTop)sc.push([el,el.scrollTop]);el=el.parentElement;}}const m=me();if(!canEditHours(m)){box.innerHTML='';return;}
  const ws=tcStart(),we=ws+7*864e5;let G=tcGroups(ws);const sel=!!tcSel&&tcMode==='week';
  if(tcDay==null){const td=dayIndex(Date.now(),ws);tcDay=td>=0&&td<7?Math.max(1,td-1):1;}
  const all=G.flatMap(g=>g.people);let tot=0,ot=0,miss=0,trv=0;all.forEach(e=>{const s=weekStats(e.id,new Date(ws+12*36e5));tot+=s.total;ot+=s.ot;miss+=tcPunches(e.id,ws).filter(tcMissing).length;trv+=tcTravel(e.id,ws);});
  const probN=all.filter(e=>hasProb(e,ws)).length;if(onlyProb&&!probN)onlyProb=false;
  const hn=typeof oldRangeNote==='function'?oldRangeNote('punches',ws,we,renderTimeCards):'';
  const lbl=new Date(ws).toLocaleDateString(LOCX(),{month:'short',day:'numeric'})+' – '+new Date(we-864e5).toLocaleDateString(LOCX(),{month:'short',day:'numeric'});
  const nav=(fn,txt,sub)=>'<div class="p19nav"><button aria-label="‹" onclick="'+fn+'(-1)">‹</button><div style="text-align:center"><b style="font-size:16px">'+txt+'</b><div style="font-size:11.5px;color:var(--g4)">'+sub+'</div></div><button aria-label="›" onclick="'+fn+'(1)">›</button></div>';
  const box_=(v,l,cls,click)=>'<div class="'+(cls||'')+(click?' tap':'')+'"'+(click?' onclick="'+click+'"':'')+'><b>'+v+'</b><span>'+E(l)+(click?' ›':'')+'</span></div>';
  let top;
  if(tcMode==='week'){
    top='<div class="card" style="padding:12px 14px">'+nav('tcMove',lbl,ws===weekStart().getTime()?T('This week'):ws===weekStart().getTime()-7*864e5?T('Last week'):'')
      +'<div class="p19st">'+box_(tot.toFixed(1),T('hours'))+box_(ot.toFixed(1),T('overtime'))+box_(miss,T('missing'),miss?'bad':'',miss?"setPaySec('fix')":'')+(TRAVEL_ON?box_(money(trv).replace(/\.00$/,''),T('travel')):'')+'</div></div>'
      +hn+sendCard(ws,we)
      +(probN?'<div class="p19words"><button class="'+(onlyProb?'':'on')+'" onclick="P19.prob(false)">'+E(T('Everyone'))+'</button><button class="'+(onlyProb?'on':'')+'" onclick="P19.prob(true)">'+E(T('Only problems'))+' · '+probN+'</button></div>':'');
    if(onlyProb)G=G.map(g=>Object.assign({},g,{people:g.people.filter(e=>hasProb(e,ws))})).filter(g=>g.people.length);}
  else{const dayDate=new Date(ws+tcDay*864e5+12*36e5);const DL=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let dh=0,dw=0,dm=0;all.forEach(e=>{const dp=tcPunches(e.id,ws).filter(p=>dayIndex(p.in,ws)===tcDay);if(dp.length)dw++;if(dp.some(tcMissing))dm++;dh+=dp.reduce((a,p)=>a+((p.out||p.away)?punchDur(p):0),0);});
    top='<div class="card" style="padding:12px 14px">'+nav('tcDayMove',dayDate.toLocaleDateString(LOCX(),{weekday:'long',month:'short',day:'numeric'}),'<span style="cursor:pointer;color:var(--blue-mid)" onclick="P19.mode(\'week\')">'+E(T('Back to the week'))+'</span>')
      +'<div class="p19strip">'+DL.map((d,i)=>'<button class="'+(i===tcDay?'on':'')+'" onclick="P19.day('+i+')">'+E(T(d).slice(0,2))+'<b>'+new Date(ws+i*864e5+12*36e5).getDate()+'</b></button>').join('')+'</div>'
      +'<div class="p19st" style="grid-template-columns:repeat(3,minmax(0,1fr))">'+box_(dh.toFixed(1),T('hours'))+box_(dw,T('worked'))+box_(dm,T('missing'),dm?'bad':'')+'</div></div>'+hn;}
  // Baruch 11/17: tap a crew's name to close it (and again to open) — only the crews you want stay open; remembered on this phone
  const CL=p19Closed();
  const body=G.map(g=>{const ids=g.people.map(e=>e.id);const allOn=sel&&ids.every(id=>tcSel.has(id));const shut=CL.has(g.id);
      const gh=tcMode==='week'?g.people.reduce((q,e)=>q+weekStats(e.id,new Date(ws+12*36e5)).total,0):g.people.reduce((q,e)=>q+tcPunches(e.id,ws).filter(p=>dayIndex(p.in,ws)===tcDay&&(p.out||p.away)).reduce((a,p)=>a+punchDur(p),0),0);
      const right=shut?'<span style="font-size:12px;color:var(--g4)">'+g.people.length+' · '+gh.toFixed(1)+' h</span>':tcMode==='day'?'<span style="font-size:12px;color:var(--blue-mid);font-weight:700;cursor:pointer;letter-spacing:.3px" onclick="tcFixCrew(\''+J(g.id)+'\')">'+T('FIX CREW')+'</span>':'<span style="font-size:12px;color:var(--g4)">'+gh.toFixed(1)+' h</span>';
      const chev='<span onclick="event.stopPropagation();P19.shut(\''+J(g.id)+'\')" style="display:inline-block;width:16px;color:var(--g4);font-size:12px;cursor:pointer;transition:transform .15s;transform:rotate('+(shut?'-90deg':'0deg')+')">▾</span>';
      return '<div class="row" style="align-items:center;margin:14px 2px 6px">'+(sel?'<span style="display:flex;gap:8px;align-items:center;cursor:pointer" onclick="tcToggleCrew(\''+J(g.id)+'\')"><span style="width:20px;height:20px;border-radius:6px;border:2px solid var(--blue-mid);display:inline-flex;align-items:center;justify-content:center;'+(allOn?'background:var(--blue-mid);color:#fff':'')+'">'+(allOn?'✓':'')+'</span>':'<span style="display:flex;align-items:center;gap:4px;cursor:pointer" onclick="P19.shut(\''+J(g.id)+'\')">')+(sel?'':chev)+'<b style="font-size:12px;letter-spacing:.5px;text-transform:uppercase;color:var(--g4)">'+E(g.name)+'</b></span>'+(sel?chev:'')+right+'</div>'+(shut?'':
        '<div class="card" style="padding:'+(tcMode==='week'?'4px 12px':'0 14px')+'">'+(tcMode==='week'?tcTable(g.people,ws,sel):g.people.map(e=>tcDayRow(e,ws,tcDay)).join('').replace('<div data-p19row','<div data-p19first data-p19row').replace(/(<div data-p19first data-p19row="[^"]*") style="border-top:1px solid var\(--g1\)"/,'$1')
          )+'</div>');}).join('');
  const foot=tcMode==='week'?(sel?'<div style="position:sticky;bottom:8px;margin-top:10px"><button class="btn" '+(tcSel.size?'':'disabled ')+'onclick="openBulkFix()">'+T('Fix together')+' · '+tcSel.size+' '+T('selected')+'</button></div><button class="btn sec2" style="margin-top:8px" onclick="tcSelMode()">'+T('Cancel')+'</button>':'<button class="btn sec2" style="margin-top:12px" onclick="tcSelMode()">'+T('Select to fix together')+'</button>')
    :'<div style="font-size:12px;color:var(--g4);margin:10px 2px 0">'+E(T('Tap a man to open his day and fix it.'))+'</div>';
  box.innerHTML=top+body+foot;try{P19.lay();}catch(e){}
  for(const k in tcDirty){const el=$(k);if(el)el.value=tcDirty[k];}
  try{sc.forEach(([el,v])=>{el.scrollTop=v;});window.scrollTo(0,sy);}catch(e){}
  head();};
try{renderTimeCards=window.renderTimeCards;}catch(e){}

// ── Today ──
window.renderAttendance=function(){const box=$('attWrap');if(!box)return;
  const was=_attFocus||(document.activeElement&&document.activeElement.id==='attSearch');const st=attRows();
  const w=st.filter(x=>x.s.status==='working').length,o=st.filter(x=>x.s.status==='out').length,n=st.filter(x=>x.s.status==='none').length;
  box.innerHTML='<div class="card"><div class="p19cnt"><div><b style="color:var(--green)">'+w+'</b><span>'+E(T('working now'))+'</span></div><div><b>'+o+'</b><span>'+E(T('done today'))+'</span></div><div><b style="color:var(--amber)">'+n+'</b><span>'+E(T('not in yet'))+'</span></div></div></div>'
   +'<input id="attSearch" type="search" placeholder="'+E(T('Search a person or job…'))+'" value="'+E(attQ)+'" onfocus="_attFocus=true" onblur="_attFocus=false" oninput="_attPos=this.selectionStart;attQ=this.value;renderAttCards()" autocomplete="off" data-nomic="1" style="margin:4px 0 2px;font-size:16px">'
   +'<div id="attGrid"></div>';
  renderAttCards();
  if(was){_attFocus=true;const s=$('attSearch');if(s){try{s.focus({preventScroll:true});s.setSelectionRange(_attPos,_attPos);}catch(e){}}}};
window.renderAttCards=function(){const el=$('attGrid');if(!el)return;const se=$('attSearch');attQ=se?se.value:attQ;const q=(attQ||'').trim().toLowerCase();
  let st=attRows();if(q)st=st.filter(({e,s})=>(e.name||'').toLowerCase().includes(q)||(s.site&&(siteName(s.site)||'').toLowerCase().includes(q)));
  const now=Date.now(),t0=new Date();t0.setHours(0,0,0,0);
  const todayP=id=>(D.punches||[]).filter(p=>p&&p.who===id&&p.in>=t0.getTime()&&!p.voided&&!p.rejected).sort((a,b)=>a.in-b.in);
  const short=s=>(siteName(s)||'—').replace(/, NY \d{5}/g,'');
  const W=st.filter(x=>x.s.status==='working'),O=st.filter(x=>x.s.status==='out'),N=st.filter(x=>x.s.status==='none');
  const row=({e,s},done)=>{const P=todayP(e.id);const last=P[P.length-1];const end=last&&(last.out||last.away);
    return '<div class="p19row" onclick="P19.open(\''+J(e.id)+'\','+now+')"><div style="min-width:0"><div class="p19nm">'+E(e.name)+'</div><div class="p19sub">'+E(short(s.site||(last&&last.site)))+' · '+(done&&P[0]&&end?fmtT(P[0].in)+' – '+fmtT(end):s.inTime?E(T('since'))+' '+fmtT(s.inTime):'')+(s.shifts>1?' · '+s.shifts+' '+E(T('jobs')):'')+(s.waiting?' · ⏳':'')+'</div></div><b style="white-space:nowrap">'+(s.hours||0).toFixed(1)+' h</b></div>';};
  const sec=(l,x)=>'<div class="p19sec">'+E(l)+'</div><div class="card" style="padding:2px 14px">'+x+'</div>';
  const off=D.emps.filter(e=>noClock(e)&&!e.inactive);
  el.innerHTML=(W.length||!q?sec(T('Working now'),W.length?W.map(x=>row(x)).join(''):'<div class="p19sub" style="padding:10px 0">'+E(T('Nobody is clocked in right now.'))+'</div>'):'')
    +(O.length?sec(T('Done today'),O.map(x=>row(x,true)).join('')):'')
    +(N.length?sec(T('Not in yet')+' · '+N.length,'<div class="p19names" style="padding:10px 0">'+N.map(({e})=>'<button onclick="P19.open(\''+J(e.id)+'\','+now+')"><i class="p19dot"></i>'+E(e.name)+'</button>').join('')+'</div>'):'')
    +(!q&&off.length?sec(T('Not on the time clock'),'<div class="p19sub" style="padding:10px 0">'+E(off.map(e=>e.name).join(', '))+'</div>'):'')
    +(q&&!st.length?'<div class="empty" style="padding:8px 2px">'+E(T('No one matches.'))+'</div>':'');};
try{renderAttendance=window.renderAttendance;renderAttCards=window.renderAttCards;}catch(e){}

// ── To fix: missing punches + automatic clock warnings ──
function clockIssues(){try{const by={};((typeof otRep!=='undefined'&&otRep&&otRep.people)||[]).forEach(x=>by[x.who]=x);
  return D.emps.filter(e=>!e.inactive&&e.appClock===true).map(e=>{const x=by[e.id];const last=x&&x.last?new Date(x.last).getTime():0;return {e,x,last,ok:last&&Date.now()-last<12*36e5};}).filter(r=>r.x&&!r.ok);}catch(e){return [];}}
window.renderMissBox=function(){const el=$('missBox');if(!el)return;
  const L=(D.punches||[]).filter(p=>p&&!p.out&&!p.away&&!p.voided&&!p.rejected&&Date.now()-p.in>14*36e5&&Date.now()-p.in<60*864e5).sort((a,b)=>b.in-a.in);
  const C=clockIssues();const n=payFixCount()+C.length;const short=s=>(siteName(s)||'—').replace(/, NY \d{5}/g,'');
  el.innerHTML=(L.length?'<div class="p19sec" style="margin-top:4px">'+E(T('Missing punches'))+' · '+L.length+'</div><div class="card" style="padding:2px 14px">'+L.map(p=>'<div class="p19row" onclick="P19.open(\''+J(p.who)+'\','+p.in+')"><div style="min-width:0"><div class="p19nm">'+E(nm(p.who))+'</div><div class="p19sub">'+E(short(p.site))+' · <span style="color:#c0392b">'+new Date(p.in).toLocaleDateString(LOCX(),{weekday:'short',month:'short',day:'numeric'})+'</span> · '+E(T('in'))+' '+fmtT(p.in)+' · '+E(T('no punch-out'))+'</div></div><button class="p19fix" onclick="event.stopPropagation();P19.open(\''+J(p.who)+'\','+p.in+')">'+E(T('Fix'))+'</button></div>').join('')+'</div>':'')
   +(C.length?'<div class="p19sec">'+E(T('Automatic time clock'))+' · '+C.length+'</div><div class="card" style="padding:2px 14px">'+C.map(r=>'<div class="p19row" style="cursor:default"><div><div class="p19nm">'+E(r.e.name)+'</div><div class="p19sub">'+(!r.x.last?E(T('not connected yet')):E(T('Phone hasn’t checked in since'))+' '+new Date(r.last).toLocaleString(LOCX(),{weekday:'short',hour:'numeric',minute:'2-digit'}))+'</div></div><span style="color:var(--amber);font-weight:600;font-size:13px;white-space:nowrap">'+E(T('Check phone'))+'</span></div>').join('')+'</div>':'')
   +(!n?'<div class="empty">✓ '+E(T('Nothing to fix right now.'))+'</div>':'');};
try{renderMissBox=window.renderMissBox;}catch(e){}
// the automatic clock card moves to To fix (only when something's wrong)
window.otPayHtml=function(){return '';};try{otPayHtml=window.otPayHtml;}catch(e){}

// ── Setup: the long travel explanation folds away ──
function foldSetup(){const pt=$('payTravel');if(!pt)return;pt.querySelectorAll('.note').forEach(n=>{if(n.closest('.p19how')||(n.innerText||'').length<140)return;
  const d=document.createElement('details');d.className='p19how';d.innerHTML='<summary>'+E(T('How travel pay works'))+' ›</summary>';n.parentNode.insertBefore(d,n);d.appendChild(n);});}
const _rh=renderHours;window.renderHours=function(){const r=_rh.apply(this,arguments);try{foldSetup();head();}catch(e){}return r;};
try{renderHours=window.renderHours;}catch(e){}

try{Object.assign(ES,{"Week":"Semana","Day":"Día","Open this day":"Abrir este día","Back to the week":"Volver a la semana","worked":"trabajaron","Everyone":"Todos","Only problems":"Solo problemas","Send to Fingercheck":"Enviar a Fingercheck","Hours":"Horas","Travel":"Viaje","Changes":"Cambios","Tap a man to open his day and fix it.":"Toque a un hombre para abrir su día y arreglarlo.",
 "working now":"trabajando","done today":"terminaron hoy","not in yet":"aún no entran","Search a person or job…":"Buscar persona o trabajo…","Working now":"Trabajando ahora","Done today":"Terminaron hoy","Not in yet":"Aún no entran","Not on the time clock":"Sin reloj de tiempo","Nobody is clocked in right now.":"Nadie está marcado ahora.","since":"desde","jobs":"trabajos",
 "Missing punches":"Marcas faltantes","no punch-out":"sin salida","in":"entrada","Fix":"Arreglar","Phone hasn’t checked in since":"El teléfono no reporta desde","Check phone":"Revisar teléfono","How travel pay works":"Cómo funciona el pago de viaje","OT":"HE","min":"min","past midnight":"pasó la medianoche","Someone":"Alguien"});}catch(e){}
})();
