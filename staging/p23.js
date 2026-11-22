/* p23 — Schedule page cleanup (Baruch 11/18, ideas he picked out of 40)
   Top:   one sticky box — month + Hebrew month, a holiday line ("Thanksgiving" / "Chanukah in 17 days"), a date strip you swipe
          like an iPhone (Hebrew day, plain weather icon + temperature, a thin line that fills with how many crews are booked),
          a small "‹ 18" arrow to jump back to today once you swiped away, and one ⋯ (Copy the whole day / Same as yesterday).
          Long-press a day → make it a day off (Settings → Days off). A day off shows "No work" — no booking, no reminders.
   Crews: a crew with no job first, outlined, with "+ Book a job". Each crew: job (tap it → small box with photos, notes,
          files, tasks, "Open full job"), a plain repeat icon for an ongoing job, a grey "Day 3" tag, hours only when they are
          not the normal day, the day as a line when the crew moves mid-day, men sent elsewhere inside the crew, warnings,
          "Changed by Yossi · 9:12 AM", and one ⋯ (Send to another job · Split the crew · Copy · Change job).
          Stay late = swipe the crew left, then confirm. "3/4 in" only for crews on the app clock; the others say Fingercheck.
          Past days are read-only and show each man's hours. On a computer: 2 columns, and drag a man onto another crew.
          After a change: "Undo" for 10 seconds. */
(function(){
if(typeof D==='undefined'||typeof renderDayBoard!=='function'||window.P23)return;
const T=s=>{try{return t(s);}catch(e){return s;}};const E=s=>esc(s==null?'':String(s));
const DAY_START=480,DAY_END=1140,FRI_END=795;
const isFri=k=>new Date(k+'T12:00').getDay()===5;const endOf=k=>isFri(k)?FRI_END:DAY_END;
const addD=(k,n)=>{const d=new Date(k+'T12:00');d.setDate(d.getDate()+n);return dkey(d);};
const todayK=()=>dkey(new Date());const nowMin=()=>{const d=new Date();return d.getHours()*60+d.getMinutes();};
const selK=()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+boardDay);return dkey(d);};
const real=list=>(list||[]).filter(a=>a&&a.site&&a.start!=null);
const fine=()=>{try{return matchMedia('(pointer:fine)').matches;}catch(e){return false;}};
const wide=()=>window.innerWidth>=900;
const satB=k=>{try{return typeof satBooked==='function'?satBooked(k):D.crews.some(c=>slotHasAny(c.id+'|'+k))||loansForDay(k).length>0;}catch(e){return false;}};

/* ───────── Spanish ───────── */
Object.assign(ES,{'Copy the whole day':'Copiar todo el día','Same as yesterday':'Igual que ayer','No job yet':'Todavía sin trabajo','+ Book a job':'+ Reservar un trabajo',
 'Open full job':'Abrir el trabajo','open tasks':'tareas abiertas','open task':'tarea abierta','files':'archivos','file':'archivo','No photos yet':'Todavía no hay fotos',
 'Day':'Día','Changed by':'Cambiado por','Fingercheck':'Fingercheck','in':'adentro','Stay late':'Quedarse tarde','Send home':'Mandar a casa',
 'Keep this crew late today?':'¿Dejar esta cuadrilla más tarde hoy?','Send this crew home?':'¿Mandar esta cuadrilla a casa?','They get a message.':'Reciben un mensaje.',
 'Change job':'Cambiar trabajo','Undo':'Deshacer','Undone':'Deshecho','Changed':'Cambiado','No work':'No se trabaja','No bookings · no punch-in reminders':'Sin reservas · sin recordatorios de entrada',
 'Day off':'Día libre','Days off':'Días libres','Make it a day off':'Hacerlo día libre','It is a work day':'Es día de trabajo','Turn on the days the company does not work.':'Active los días que la compañía no trabaja.',
 'Add a day off':'Agregar un día libre','Name (optional)':'Nombre (opcional)','Add':'Agregar','Upcoming holidays':'Próximos feriados','Your days off':'Sus días libres',
 'in':'en','days':'días','day':'día','Tomorrow':'Mañana','Today':'Hoy','crews booked':'cuadrillas reservadas','of':'de','No GPS fence — punch-in won\'t work':'Sin cerca GPS — no se puede marcar entrada',
 'Move':'Mover','to':'a','for the rest of today':'por el resto del día','for this day':'por este día','is off this day':'tiene libre este día','Staying late':'Se quedan más tarde','from':'desde',
 'This day is a day off.':'Este día es día libre.','Weather':'Clima','Only the owner can change days off.':'Solo el dueño puede cambiar los días libres.'});

/* ───────── Hebrew calendar ───────── */
const HF=(()=>{try{return new Intl.DateTimeFormat('en-u-ca-hebrew',{day:'numeric',month:'long',year:'numeric'});}catch(e){return null;}})();
const hebCache={};
function heb(k){if(hebCache[k])return hebCache[k];let o=null;try{const p=HF.formatToParts(new Date(k+'T12:00'));const g=x=>(p.find(q=>q.type===x)||{}).value;o={d:+g('day'),m:g('month'),y:+String(g('year')).replace(/\D/g,'')};}catch(e){}return hebCache[k]=o;}
function gem(n){if(n===15)return 'ט״ו';if(n===16)return 'ט״ז';const tens=['','י','כ','ל'][Math.floor(n/10)]||'';const ones=['','א','ב','ג','ד','ה','ו','ז','ח','ט'][n%10]||'';const s=tens+ones;return s.length>1?s.slice(0,-1)+'״'+s.slice(-1):s+'׳';}
const HMHE={Tishri:'תשרי',Heshvan:'חשון',Kislev:'כסלו',Tevet:'טבת',Shevat:'שבט',Adar:'אדר','Adar I':'אדר א׳','Adar II':'אדר ב׳',Nisan:'ניסן',Iyar:'אייר',Sivan:'סיון',Tamuz:'תמוז',Av:'אב',Elul:'אלול'};
const HMEN={Tishri:'Tishrei',Heshvan:'Cheshvan',Kislev:'Kislev',Tevet:'Teves',Shevat:'Shevat',Adar:'Adar','Adar I':'Adar I','Adar II':'Adar II',Nisan:'Nisan',Iyar:'Iyar',Sivan:'Sivan',Tamuz:'Tammuz',Av:'Av',Elul:'Elul'};
/* holidays — Jewish (diaspora) and US. off:true = normally a day off (Yom Tov); the owner decides in Settings → Days off */
function jewishOn(k){const h=heb(k);if(!h)return null;const m=h.m,d=h.d;const adar=(m==='Adar'||m==='Adar II');
  if(m==='Tishri'){if(d===1||d===2)return {n:'Rosh Hashanah',off:1};if(d===10)return {n:'Yom Kippur',off:1};if(d===15||d===16)return {n:'Sukkos',off:1};if(d>=17&&d<=21)return {n:'Chol Hamoed Sukkos'};if(d===22)return {n:'Shemini Atzeres',off:1};if(d===23)return {n:'Simchas Torah',off:1};}
  if(m==='Kislev'&&d>=25)return {n:'Chanukah'};if(m==='Tevet'&&d<=2)return {n:'Chanukah'};
  if(m==='Kislev'&&d===24)return null;
  if(adar&&d===14)return {n:'Purim'};
  if(m==='Nisan'){if(d===14)return {n:'Erev Pesach'};if(d===15||d===16)return {n:'Pesach',off:1};if(d>=17&&d<=20)return {n:'Chol Hamoed Pesach'};if(d===21||d===22)return {n:'Pesach',off:1};}
  if(m==='Sivan'&&(d===6||d===7))return {n:'Shavuos',off:1};
  if(m==='Av'&&d===9)return {n:'Tisha B\'Av'};
  return null;}
function usOn(k){const d=new Date(k+'T12:00'),y=d.getFullYear(),mo=d.getMonth(),dt=d.getDate(),wd=d.getDay();
  if(mo===0&&dt===1)return {n:'New Year\'s Day'};if(mo===6&&dt===4)return {n:'Independence Day'};if(mo===11&&dt===25)return {n:'Christmas'};
  if(mo===4&&wd===1&&dt+7>31)return {n:'Memorial Day'};if(mo===8&&wd===1&&dt<=7)return {n:'Labor Day'};if(mo===10&&wd===4&&dt>=22&&dt<=28)return {n:'Thanksgiving'};return null;}
function holiday(k){return jewishOn(k)||usOn(k);}
/* the company's days off: D.daysOff = [{id:'YYYY-MM-DD', off:true|false, name}] — a record wins; no record = a work day */
// the server keeps days off by id (D.daysOff = {'2026-11-26':{...}}); a phone that made one before the first sync may hold a list
const offList=()=>{const o=D.daysOff;if(!o)return [];if(Array.isArray(o))return o.filter(Boolean);return Object.keys(o).map(k=>Object.assign({id:k},o[k]||{}));};
function dayOffRec(k){return offList().find(x=>x&&x.id===k&&!x.deleted);}
function isOff(k){const r=dayOffRec(k);return !!(r&&r.off);}
function offName(k){const r=dayOffRec(k);const h=holiday(k);return (r&&r.name)||(h&&h.n)||T('Day off');}
window.EX_isDayOff=isOff;
function nextHoliday(k){for(let i=1;i<120;i++){const x=addD(k,i);const h=holiday(x);if(h&&(h.off||/Chanukah|Purim|Thanksgiving|Christmas|Pesach|Sukkos|Shavuos|Rosh/.test(h.n))&&!(i>1&&holiday(addD(x,-1))&&holiday(addD(x,-1)).n===h.n))return {k:x,n:h.n,i};}return null;}

/* ───────── weather (open-meteo, free, no key) — Suffern office ───────── */
let WX=null;try{WX=JSON.parse(localStorage.getItem('p23wx')||'null');}catch(e){}
function wxLoad(){if(WX&&Date.now()-WX.at<3*36e5)return;if(wxLoad.busy)return;wxLoad.busy=1;
  fetch('https://api.open-meteo.com/v1/forecast?latitude=41.115&longitude=-74.149&daily=weathercode,temperature_2m_max&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=16')
   .then(r=>r.json()).then(j=>{const o={at:Date.now(),d:{}};(j.daily.time||[]).forEach((k,i)=>{o.d[k]={c:j.daily.weathercode[i],t:Math.round(j.daily.temperature_2m_max[i])};});WX=o;try{localStorage.setItem('p23wx',JSON.stringify(o));}catch(e){}
     if(document.getElementById('p23strip'))renderSched();}).catch(()=>{}).finally(()=>{wxLoad.busy=0;});}
const SVG=(p,w)=>'<svg width="'+(w||15)+'" height="'+(w||15)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
const IC={sun:SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  cloud:SVG('<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z"/>'),
  rain:SVG('<path d="M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>'),
  snow:SVG('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>'),
  storm:SVG('<path d="M7 13h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 13z"/><path d="M12 14l-2 4h4l-2 4"/>'),
  rep:SVG('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',14),
  off:SVG('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M9.5 13.5l5 5M14.5 13.5l-5 5"/>',26),
  offS:SVG('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M9.5 13.5l5 5M14.5 13.5l-5 5"/>',12),
  clock:SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',20),home:SVG('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',20),
  more:SVG('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',22),warn:SVG('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',13)};
function wxIcon(c){if(c==null)return '';if(c<=1)return IC.sun;if(c<=3||c===45||c===48)return IC.cloud;if((c>=71&&c<=77)||c===85||c===86)return IC.snow;if(c>=95)return IC.storm;return IC.rain;}

/* ───────── CSS ───────── */
(function css(){const st=document.createElement('style');st.id='p23css';st.textContent=
 '.p23top{position:sticky;z-index:20;background:var(--bg,#f2f2f7);padding:6px 0 4px;margin:0 -2px}'
+'.p23box{background:var(--card,#fff);border-radius:14px;padding:8px 6px 6px;box-shadow:0 1px 2px rgba(0,0,0,.05)}'
+'html[data-theme=dark] .p23box{background:#1c1c1e}html[data-theme=dark] .p23top{background:#000}'
+'.p23hd{display:flex;align-items:center;gap:8px;padding:0 8px 2px;font-size:13px;color:var(--g4)}.p23hd b{color:inherit;font-weight:700}.p23hd .sp{flex:1}'
+'.p23hol{font-size:12.5px;color:var(--g4);padding:0 8px 4px}.p23hol b{color:var(--text,inherit);font-weight:600}'
+'.p23more{background:none;border:0;color:var(--g4);padding:2px 4px;cursor:pointer;line-height:0}'
+'.p23sw{position:relative}.p23strip{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:2px 0}.p23strip::-webkit-scrollbar{display:none}'
+'.p23d{flex:0 0 calc(100%/7);scroll-snap-align:start;display:flex;flex-direction:column;align-items:center;gap:1px;background:none;border:0;padding:3px 0;color:inherit;cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}'
+'.p23d .w{font-size:11.5px;color:var(--g4)}.p23d .n{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700}'
+'.p23d.td .n{color:#d93025}.p23d.on .n{background:#d93025;color:#fff}.p23d.off .n{color:var(--g3);text-decoration:line-through}.p23d.on.off .n{background:var(--g3);color:#fff;text-decoration:none}'
+'.p23d .h{font-size:10.5px;color:var(--g3);height:13px;direction:rtl}.p23d .hn{font-size:9px;line-height:10px;color:var(--g4);height:20px;max-width:100%;overflow:hidden;text-align:center;padding:0 1px;font-weight:600}.p23d .x{height:16px;color:var(--g4);display:flex;align-items:center;gap:2px;font-size:10.5px}'
+'.p23d .l{width:24px;height:3px;border-radius:2px;background:var(--g2);overflow:hidden;margin-top:2px}.p23d .l i{display:block;height:3px;background:#5a6bd8}.p23d .l.gap i{background:#c0392b}'
+'.p23back{background:var(--card,#fff);border:1.5px solid #f0c2bd;color:#d93025;font-weight:700;font-size:13px;border-radius:10px;padding:3px 8px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.12)}'
+'html[data-theme=dark] .p23back{background:#1c1c1e}.p23back.l{left:2px}.p23back.r{right:2px}'
+'.p23sum{font-size:13px;color:var(--g4);margin:8px 4px 8px}'
+'.p23list{display:grid;grid-template-columns:1fr;gap:10px}@media(min-width:900px){.p23list{grid-template-columns:1fr 1fr}}'
+'.p23c{position:relative;border-radius:14px;overflow:hidden;background:#c0392b}.p23c.home{background:#1a8a4a}'
+'.p23c .act{position:absolute;right:0;top:0;bottom:0;width:104px;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:700;font-size:13px;cursor:pointer}'
+'.p23card{position:relative;background:var(--card,#fff);display:flex;gap:12px;padding:13px 12px 12px 12px;transition:transform .18s;touch-action:pan-y;min-height:100%}'
+'html[data-theme=dark] .p23card{background:#1c1c1e}.p23c.nolate{background:none}'
+'.p23rt{flex:0 0 46px;display:flex;flex-direction:column;align-items:center;gap:2px}.p23rt .sc-ring{flex:none;width:40px;height:40px}.p23rt .sc-type{font-size:8.5px;letter-spacing:.02em;line-height:1}.p23card .sc-ring{flex:0 0 40px;width:40px;height:40px}.p23w{flex:1;min-width:0}'
+'.p23a{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.p23a .ad{font-size:16.5px;font-weight:700;cursor:pointer}.p23a .rp{color:var(--g4);line-height:0}'
+'.p23tag{font-size:11px;font-weight:700;color:var(--g4);background:var(--g1);border-radius:7px;padding:2px 7px}'
+'.p23t{font-size:13px;color:var(--g4);margin-top:1px}.p23half{margin-top:12px}.p23sub{margin-left:-2px;border-radius:10px}.p23subcard{padding:4px 2px 6px 2px!important;gap:0!important}.p23sub.p23half{margin-top:12px}.p23sub.p23half .p23subcard{border-top:1px solid var(--g2);padding-top:10px!important}.p23hr{font-size:12.5px;color:var(--g4);margin-top:2px}'
+'.p23r{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:0 0 auto}.p23in{font-size:13px;font-weight:700}.p23in.fc{font-size:11.5px;font-weight:600;color:var(--g3)}'
+'.p23by{font-size:11.5px;color:var(--g3);margin-top:6px}.p23warn{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:#a3261b;background:#fdecea;border-radius:8px;padding:3px 8px;margin-top:6px}'
+'html[data-theme=dark] .p23warn{background:#4a1d19;color:#ffb4ab}'
+'.p23late{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:#7a4a00;background:#fff4d6;border-radius:7px;padding:2px 8px;margin-top:6px}html[data-theme=dark] .p23late{background:#4a3a10;color:#f5c26b}'
+'.p23line{margin-top:8px}.p23bar{position:relative;height:20px;border-radius:6px;background:var(--g1);overflow:hidden}.p23bar i{position:absolute;top:0;bottom:0;color:#fff;font-size:10.5px;font-weight:700;font-style:normal;padding:3px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-right:2px solid var(--card,#fff)}'
+'.p23ax{display:flex;justify-content:space-between;font-size:10px;color:var(--g3);margin-top:2px}'
+'.p23pv{margin-top:10px;border:1px solid var(--g2);border-radius:12px;padding:10px;background:var(--g1);cursor:default}.p23ph{display:flex;gap:6px;overflow:hidden}.p23ph img{width:64px;height:48px;object-fit:cover;border-radius:7px;flex:none}'
+'.p23pv .nt{font-size:13px;margin-top:8px;line-height:1.4;color:var(--text,inherit)}.p23pv .mt{font-size:12.5px;color:var(--g4);margin-top:6px}.p23pv .go{display:block;text-align:right;margin-top:8px;font-weight:700;color:var(--blue-mid,#2f6fde);background:none;border:0;width:100%;cursor:pointer;font-size:14px}'
+'.p23none{border:2px solid #d93025;border-radius:14px;background:var(--card,#fff);display:flex;gap:12px;padding:13px 12px}html[data-theme=dark] .p23none{background:#1c1c1e}'
+'.p23none .ad{font-size:16.5px;font-weight:700;color:#d93025}.p23bk{display:block;width:100%;margin-top:10px;background:#d93025;color:#fff;border:0;border-radius:10px;padding:11px;font-weight:700;font-size:15px;cursor:pointer}'
+'.p23dayoff{text-align:center;padding:26px 16px;background:var(--card,#fff);border-radius:14px;color:var(--g4)}html[data-theme=dark] .p23dayoff{background:#1c1c1e}.p23dayoff b{display:block;color:var(--text,inherit);font-size:18px;margin:6px 0 2px}'
+'.p23undo{position:fixed;left:50%;transform:translateX(-50%);bottom:84px;z-index:9999;background:#1d1d24;color:#fff;border-radius:12px;padding:11px 14px;display:flex;gap:18px;align-items:center;font-size:14.5px;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:92vw}'
+'.p23undo button{background:none;border:0;color:#7fb2ff;font-weight:800;font-size:14.5px;cursor:pointer}'
+'.p23av[draggable=true]{cursor:grab}.p23c.drop .p23card{outline:3px dashed var(--blue,#2f6fde);outline-offset:-3px}'
+'.p23hrs{font-size:13.5px;color:var(--g4);margin-top:6px;line-height:1.5}.p23hrs b{color:var(--text,inherit);font-weight:600}'
+'.p23offl{max-height:60vh;overflow:auto}.p23o{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 2px;border-top:1px solid var(--g2);font-size:14.5px}.p23o small{display:block;color:var(--g4);font-size:12px}'
+'.p23tg{flex:none;width:44px;height:26px;border-radius:13px;background:var(--g2);position:relative;border:0;cursor:pointer}.p23tg::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}.p23tg.on{background:#1a8a4a}.p23tg.on::after{left:21px}'
+'.p23sec{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--g4);margin:12px 2px 2px}';
document.head.appendChild(st);})();

/* ───────── small helpers ───────── */
const crewGuys=c=>D.emps.filter(e=>e.crew===c.id&&e.active!==false&&!e.inactive).sort((a,b)=>(b.lead?1:0)-(a.lead?1:0));
const appClockCrew=c=>crewGuys(c).some(e=>e.appClock&&String(e.clock)!=='false');
const crewNum=c=>String(c.name||'').replace(/\D+/g,'')||String(c.name||'?')[0];
function ruleFor(cid,k){try{return (rulesForCrew(cid)||[]).filter(r=>(r.from||'')<=k&&(!r.to||r.to>=k)).sort((a,b)=>String(b.from||'').localeCompare(String(a.from||'')))[0]||null;}catch(e){return null;}}
function changedBy(cid,k){let r=D.sched[cid+'|'+k];if(!r||!r.by){const ru=ruleFor(cid,k);if(ru)r=D.sched['ONG:'+cid+':'+ru.ruleId];}
  if(!r||!r.by||!r.at)return '';const d=new Date(r.at);const when=dkey(d)===todayK()?fmtT(r.at):d.toLocaleDateString(LOC(),{month:'short',day:'numeric'})+' '+fmtT(r.at);
  return T('Changed by')+' '+String(nameOf(r.by)||'').split(' ')[0]+' · '+when;}
// Baruch 11/22: Day 1, 2, 3… keeps counting across weekends — a day the crew wasn't booked anywhere (Sunday, Saturday, a day off)
// is skipped; only a day at a DIFFERENT job starts the count again (it used to restart every Monday once Sunday wasn't booked)
function dayCount(cid,k,site){let n=1,x=k;for(let i=0;i<120;i++){x=addD(x,-1);if(isOff(x))continue;
  const L=real(effectiveAsgs(cid,x));if(L.some(a=>a.site===site))n++;else if(!L.length)continue;else break;}return n;}
const fullDay=(a,k)=>a.start<=DAY_START&&(a.end==null||a.end>=endOf(k));
function lateIds(cid){const t0=new Date().toDateString();const last={};(D.goHomeLog||[]).filter(x=>x&&new Date(x.ts).toDateString()===t0).sort((a,b)=>a.ts-b.ts).forEach(x=>{last[x.who]=x;});return crewGuys({id:cid}).map(e=>e.id).filter(id=>last[id]&&last[id].kind==='late');}
function dayHours(id,k){return (D.punches||[]).filter(p=>p&&p.who===id&&p.in!=null&&dkey(new Date(p.in))===k&&!p.voided&&!p.rejected&&(typeof payCounts!=='function'||payCounts(p))&&(p.out||p.away)).reduce((s,p)=>s+punchDur(p),0);}
function sitePhotos(s){const L=[];(s.files||[]).forEach(f=>{if(f&&f.kind==='img'&&(f.d||f.url))L.push({src:f.d||f.url,ts:f.ts||0});});(s.notes||[]).forEach(n=>{if(n&&n.photo)L.push({src:n.photo,ts:n.ts||0});});
  (D.jobs||[]).forEach(j=>{if(j.site!==s.id)return;(j.photos||[]).forEach(p=>{const src=typeof p==='string'?p:(p&&(p.d||p.url));if(src)L.push({src,ts:(p&&p.ts)||j.ts||0});});});return L.sort((a,b)=>b.ts-a.ts);}
const COLS=['#4a5bd8','#8e57d6','#1a8a6a','#c27a12','#2a7fb8'];

/* ───────── state ───────── */
const P={pv:null,swiped:null,stripX:null};

/* ───────── top box ───────── */
function stripDays(k){const out=[];const t0=todayK();const from=addD(k<t0?k:t0,-21);const to=addD(k>t0?k:t0,60);for(let x=from;x<=to;x=addD(x,1)){const wd=new Date(x+'T12:00').getDay();if(wd===6&&!satB(x)&&x!==k)continue;out.push(x);}return out;}
function topBox(k){const t0=todayK();const d=new Date(k+'T12:00');const h=heb(k);const N=D.crews.length||1;
  const rel=k===t0?T('Today'):k===addD(t0,1)?T('Tomorrow'):k===addD(t0,-1)?T('Yesterday'):'';
  const cell=x=>{const dd=new Date(x+'T12:00');const hh=heb(x);const off=isOff(x);const n=D.crews.filter(c=>slotHasAny(c.id+'|'+x)).length;const w=WX&&WX.d&&WX.d[x];const hol=holiday(x);
    return '<button type="button" class="p23d'+(x===k?' on':'')+(x===t0?' td':'')+(off?' off':'')+'" data-k="'+x+'"><span class="w">'+E(T(DN[dd.getDay()]).slice(0,3))+'</span><span class="n">'+dd.getDate()+'</span>'
      +'<span class="h">'+(hh?gem(hh.d):'')+'</span><span class="hn">'+(hol?E(hol.n):'')+'</span><span class="x">'+(off?IC.offS:(w?wxIcon(w.c)+'<span>'+w.t+'°</span>':''))+'</span>'
      +(off||dd.getDay()===6?'<span class="l" style="visibility:hidden"></span>':'<span class="l'+(n<N&&x>=t0?' gap':'')+'"><i style="width:'+Math.round(n/N*100)+'%"></i></span>')+'</button>';};
  const ed=schedCanEdit();
  return '<div class="p23top" id="p23top"><div class="sc-head" style="margin-bottom:6px"><div><div class="sc-wd">'+E(d.toLocaleDateString(LOC(),{weekday:'long'}))+(h?' · <span dir="rtl">'+gem(h.d)+' '+(HMHE[h.m]||'')+'</span>':'')+'</div><div class="sc-md">'+E(d.toLocaleDateString(LOC(),{month:'long',day:'numeric'}))+(rel?'<span class="sc-rel'+(k===t0?' td':'')+'">'+E(rel)+'</span>':'')+'</div></div>'
    +'<div style="margin-left:auto;display:flex;align-items:center;gap:8px"><button type="button" class="p23back" style="display:none" id="p23back" onclick="P23.today()"></button>'+(ed&&k>=t0&&!isOff(k)?'<button type="button" class="p23more" aria-label="More" onclick="P23.dayMenu(\''+k+'\')">'+IC.more+'</button>':'')+'</div></div>'
    +'<div class="p23box"><div class="p23sw"><div class="p23strip" id="p23strip">'+stripDays(k).map(cell).join('')+'</div></div></div></div>';}

/* ───────── crew cards ───────── */
const ringT=(c,html)=>'<div class="p23rt">'+html+'<span class="sc-type '+(c.type==='finish'?'f':'r')+'">'+E(T(c.type==='finish'?'Finishing':'Rough'))+'</span></div>';
function avs(guys,k,isT,today,dragOk){return '<div class="sc-avs">'+guys.map(g=>{const st=scDayState(g,isT,today,k);return '<span class="sc-av p23av '+st.k+'" title="'+E(g.name)+'"'+(dragOk?' draggable="true" data-emp="'+E(g.id)+'"':'')+'>'+scInit(g.name)+'</span>';}).join('')+'</div>';}
function lineBar(list,k){// Baruch 11/18: the bar runs past the end of the day when a job does (a move at 6:47 PM must show)
  const L=list.slice().sort((a,b)=>a.start-b.start);const endB=Math.max(endOf(k),...L.map(a=>a.end!=null?a.end:a.start+60));const span=endB-DAY_START;let i=0;
  const segs=L.map((a,j)=>{const nx=L[j+1];const s=Math.max(a.start,DAY_START),e=Math.min(a.end!=null?a.end:(nx?nx.start:endB),endB);const l=(s-DAY_START)/span*100,w=Math.max(4,(e-s)/span*100);
    return '<i style="left:'+l.toFixed(1)+'%;width:'+w.toFixed(1)+'%;background:'+COLS[(i++)%COLS.length]+'" title="'+E(siteName(a.site))+' · '+E(slotAsgLabel(a))+'">'+scAddr(a.site).a+'</i>';}).join('');
  const mid=endB>endOf(k)?endOf(k):Math.round((DAY_START+endB)/2);return '<div class="p23line"><div class="p23bar">'+segs+'</div><div class="p23ax"><span>'+fMin(DAY_START)+'</span><span>'+fMin(mid)+'</span><span>'+fMin(endB)+'</span></div></div>';}
// Baruch 11/18: on today, the crew's job is where they should be NOW — the latest booking that has started (a move later in the
// day takes over the card); before the first start, the first one. Other days: the first booking, as before.
function curAsg(asgs,k){if(!asgs.length)return null;if(k!==todayK())return asgs[0];const nm=nowMin();const st=asgs.filter(a=>a.start<=nm);return st.length?st[st.length-1]:asgs[0];}
function preview(siteId){const s=D.sites.find(x=>x.id===siteId);if(!s)return '';const ph=sitePhotos(s).slice(0,5);const notes=(s.notes||[]).filter(n=>n&&(n.text||n.txt)).sort((a,b)=>(b.ts||0)-(a.ts||0));
  const files=(s.files||[]).filter(f=>f&&f.kind!=='img').length+((s.links||[]).length||0);const tasks=(D.jobs||[]).filter(j=>j&&j.site===s.id&&j.status!=='done'&&!j.deleted).length;
  return '<div class="p23pv" onclick="event.stopPropagation()">'+(ph.length?'<div class="p23ph">'+ph.map(p=>'<img loading="lazy" src="'+E(safeSrc?safeSrc(p.src):p.src)+'" alt="">').join('')+'</div>':'<div class="mt">'+E(T('No photos yet'))+'</div>')
   +(notes[0]?'<div class="nt">📝 '+E(String(notes[0].text||notes[0].txt).slice(0,160))+'</div>':'')
   +'<div class="mt">'+[files?files+' '+E(T(files===1?'file':'files')):'',tasks?tasks+' '+E(T(tasks===1?'open task':'open tasks')):''].filter(Boolean).join(' · ')+'</div>'
   +'<button type="button" class="go" onclick="event.stopPropagation();openFolder(\''+jsq(s.id)+'\')">'+E(T('Open full job'))+' ›</button></div>';}
function crewCard(c,k){const t0=todayK();const isT=k===t0,past=k<t0;const today=new Date().toDateString();const ed=schedCanEdit()&&!past;const guys=crewGuys(c);
  const asgs=real(slotAsgs(c.id+'|'+k)).sort((a,b)=>a.start-b.start);const a0=curAsg(asgs,k);const aPrev=a0&&asgs.indexOf(a0)>0?asgs[asgs.indexOf(a0)-1]:null;const app=appClockCrew(c);
  const st=guys.map(g=>scDayState(g,isT,today,k));const on=st.filter(x=>x.k==='in').length;
  const s0=a0&&D.sites.find(x=>x.id===a0.site);const ad=a0?scAddr(a0.site):{a:'',b:''};
  const days=a0?dayCount(c.id,k,a0.site):1;const ong=a0&&(a0.ongoing||!!ruleFor(c.id,k)&&!D.sched[c.id+'|'+k]);
  let h='<div class="p23a"><span class="ad" onclick="event.stopPropagation();P23.pv(\''+jsq(c.id)+'\')">'+ad.a+'</span>'+(ong?'<span class="rp" title="'+E(T('Ongoing'))+'">'+IC.rep+'</span>':'')+(days>1?'<span class="p23tag">'+E(T('Day'))+' '+days+'</span>':'')+'</div>';
  if(!a0)h='';   // Baruch 11/19: crew split by people (no job of its own) — each half is drawn below as its own full job
  h+='<div class="p23t">'+ad.b+(aPrev?' · '+E(T('from'))+' '+E(fMin(a0.start)):'')+'</div>';
  if(aPrev)h+='<div class="p23hr" style="opacity:.75">'+scAddr(aPrev.site).a+' · '+E(fMin(aPrev.start))+' – '+E(fMin(a0.start))+'</div>';   // Baruch 11/18: where they were before the move
  if(asgs.length>1){h+=lineBar(asgs,k);}else if(a0)h+='<div class="p23hr">'+E(slotAsgLabel(a0))+'</div>';   // Baruch 11/18: the hours on every crew, under the town
  if(a0&&a0.note)h+='<div class="p23hr">'+E(a0.note)+'</div>';
  // the men (sent-elsewhere men go under their own little line)
  const main=new Set(asgs.map(a=>a.site));const moved={};guys.forEach(g=>{real(loansFor(g.id,k)).filter(a=>!main.has(a.site)).forEach(a=>{const gk=a.site+'|'+a.start+'|'+(a.end==null?'':a.end);(moved[gk]=moved[gk]||{a,men:[]}).men.push(g);});});
  const movedIds=new Set();Object.values(moved).forEach(G=>G.men.forEach(g=>movedIds.add(g.id)));
  if(past){const hrs=guys.map(g=>({g,h:dayHours(g.id,k)})).filter(x=>x.h>0);const tot=hrs.reduce((s,x)=>s+x.h,0);
    h+='<div class="p23hrs">'+(hrs.length?hrs.map(x=>'<b>'+E(x.g.name.split(' ')[0])+(x.g.lead?' ★':'')+'</b> '+x.h.toFixed(1)+' h').join(' · '):E(T('No hours')))+'</div>';
    return {html:'<div class="p23c nolate" data-crew="'+E(c.id)+'"><div class="p23card">'+ringT(c,scRing(c,0,0,false))+'<div class="p23w">'+h+'</div><div class="p23r"><span class="p23in">'+(tot?tot.toFixed(1)+' h':'')+'</span></div></div></div>'};}
  if(!a0){// Baruch 11/19: a crew split in halves — every half looks the same: address big, town, hours, its men. No arrows.
    // Baruch 11/19 (evening): each man is shown at the job he is at NOW (his latest started booking); a man moved later in the
    // day shows the move like a crew card does — "from 6:35 PM", the earlier job underneath, and the time bar. Halves = men
    // with the same day; each half can be kept late on its own.
    const byMan={};guys.forEach(g=>{const L=real(loansFor(g.id,k)).slice().sort((a,b)=>a.start-b.start);if(L.length)byMan[g.id]=L;});
    const halves={};Object.keys(byMan).forEach(id=>{const L=byMan[id];const cur=curAsg(L,k);const key=L.map(a=>a.site+'@'+a.start+'-'+(a.end==null?'':a.end)).join(',');
      (halves[key]=halves[key]||{L,cur,men:[]}).men.push(guys.find(g=>g.id===id));});
    const lateAll=isT?lateIds(c.id):[];
    Object.values(halves).sort((x,y)=>x.L[0].start-y.L[0].start||String(x.cur.site).localeCompare(String(y.cur.site))).forEach((G,gi)=>{
      const cur=G.cur,ci=G.L.indexOf(cur),prev=ci>0?G.L[ci-1]:null;const ad2=scAddr(cur.site);const pk=c.id+'@'+cur.site;const ids=G.men.map(g=>g.id);
      const lateH=ids.every(id=>lateAll.includes(id));
      const canH=isT&&ed&&window.P9L;const hk=c.id+'#'+gi;   // Baruch 11/19: swipe a half to the left = Stay late for those men, like every crew card
      h+='<div class="p23c p23sub'+(lateH?' home':'')+(canH?'':' nolate')+(gi?' p23half':'')+'" data-crew="'+E(hk)+'">'+(canH?'<div class="act" onclick="event.stopPropagation();P23.lateHalf('+E(JSON.stringify(ids))+','+(lateH?1:0)+')">'+(lateH?IC.home:IC.clock)+'<span>'+E(T(lateH?'Send home':'Stay late'))+'</span></div>':'')+'<div class="p23card p23subcard" data-crew="'+E(hk)+'"><div style="flex:1;min-width:0">'
      +'<div class="p23a"><span class="ad" onclick="event.stopPropagation();P23.pv(\''+jsq(pk)+'\')">'+ad2.a+'</span></div><div class="p23t">'+ad2.b+(prev?' · '+E(T('from'))+' '+E(fMin(cur.start)):'')+'</div>'
      +(prev?'<div class="p23hr" style="opacity:.75">'+scAddr(prev.site).a+' · '+E(fMin(prev.start))+' – '+E(fMin(cur.start))+'</div>':'')
      +(G.L.length>1?lineBar(G.L,k):'<div class="p23hr">'+E(slotAsgLabel(cur))+'</div>')+(cur.note?'<div class="p23hr">'+E(cur.note)+'</div>':'')
      +avs(G.men,k,isT,today,ed&&fine()&&wide())
      +(P.pv===pk?preview(cur.site):'')+'</div></div></div>';});
    const fr=guys.filter(g=>!movedIds.has(g.id));
    if(fr.length){h+='<div'+(GS.length?' class="p23half"':'')+'><div class="p23a"><span class="ad" style="color:#d93025">'+E(T('No job yet'))+'</span></div>'+avs(fr,k,isT,today,ed&&fine()&&wide())
      +(ed?'<button type="button" class="p23bk" onclick="event.stopPropagation();P21.book(\''+jsq(c.id)+'\',\''+k+'\')">'+E(T('+ Book a job'))+'</button>':'')+'</div>';}
  }else{
  {const fr=guys.filter(g=>!movedIds.has(g.id));if(fr.length)h+=avs(fr,k,isT,today,ed&&fine()&&wide());}
  Object.values(moved).sort((x,y)=>x.a.start-y.a.start).forEach(G=>{h+='<div class="p21mv" onclick="event.stopPropagation();openLoan(\''+k+'\',\''+jsq(G.men[0].id)+'\')"><div class="sc-top"><span class="sc-addr">↪ '+scAddr(G.a.site).a+'</span><span class="sc-time">'+E(slotAsgLabel(G.a))+'</span></div>'+(G.a.note?'<div class="sc-sub" style="margin:0 0 2px">'+E(G.a.note)+'</div>':'')+avs(G.men,k,isT,today,ed&&fine()&&wide())+'</div>';});
  }
  const late=isT?lateIds(c.id):[];if(late.length)h+='<div class="p23late">'+IC.clock.replace('width="20" height="20"','width="13" height="13"')+' '+E(T('Staying late'))+(late.length<guys.length?' · '+late.map(id=>String(nameOf(id)).split(' ')[0]).join(', '):'')+'</div>';
  // warnings
  const w=[];try{if(crewHasConflict(c.id,k))w.push(...crewConflictMsgs(c.id,k));}catch(e){}
  if(app&&a0){asgs.forEach(a=>{const s=D.sites.find(x=>x.id===a.site);if(s&&(s.lat==null||s.lng==null))w.push(scAddr(a.site).a.replace(/&amp;/g,'&')+': '+T('No GPS fence — punch-in won\'t work'));});}
  guys.forEach(g=>{try{if(D.timeoff.find(r=>r.who===g.id&&r.status==='approved'&&r.from<=k&&r.to>=k))w.push(g.name.split(' ')[0]+' '+T('is off this day'));}catch(e){}});
  w.forEach(x=>{h+='<div class="p23warn">'+IC.warn+E(x)+'</div><br>';});if(w.length)h=h.replace(/<br>$/,'');
  // details when the card is open (each man's status today)
  if(schExp.has(c.id)&&isT)h+='<div class="sc-more">'+guys.map((g,i)=>'<div class="sc-p"><span class="sc-av '+st[i].k+'">'+scInit(g.name)+'</span><span class="sc-pn">'+E(g.name)+(g.lead?' <em>'+E(T('Lead'))+'</em>':'')+'</span><span class="sc-ps '+st[i].k+'">'+E(st[i].txt)+'</span></div>').join('')+'</div>';
  if(P.pv===c.id&&a0)h+=preview(a0.site);
  const by=changedBy(c.id,k);if(by)h+='<div class="p23by">'+E(by)+'</div>';
  const inTxt=isT?(app?(nowMin()>=420&&nowMin()<=endOf(k)+120?'<span class="p23in">'+on+'/'+guys.length+' '+E(lang()==='es'?'adentro':'in')+'</span>':''):'<span class="p23in fc">Fingercheck</span>'):'';
  const right='<div class="p23r">'+inTxt+(ed?'<button type="button" class="p23more" aria-label="More" onclick="event.stopPropagation();P23.crewMenu(\''+jsq(c.id)+'\',\''+k+'\')">'+IC.more+'</button>':'')+'</div>';
  const canLate=ed&&isT&&window.P9L&&!!a0;const home=late.length>0;   // a split crew (no job of its own): each half swipes on its own
  const act=canLate?'<div class="act" onclick="event.stopPropagation();P23.late(\''+jsq(c.id)+'\')">'+(home?IC.home:IC.clock)+'<span>'+E(T(home?'Send home':'Stay late'))+'</span></div>':'';
  return {html:'<div class="p23c'+(home?' home':'')+(canLate?'':' nolate')+'" data-crew="'+E(c.id)+'">'+act+'<div class="p23card" data-crew="'+E(c.id)+'" onclick="P23.tap(\''+jsq(c.id)+'\')">'+ringT(c,scRing(c,on,guys.length,isT&&app))+'<div class="p23w">'+h+'</div>'+right+'</div></div>'};}
function noneCard(c,k){const guys=crewGuys(c);const ed=schedCanEdit()&&k>=todayK();
  return '<div class="p23none" data-crew="'+E(c.id)+'">'+ringT(c,scRing(c,0,0,false).replace(/fill="var\(--sc-(fin|rgh)\)"/g,'fill="#d93025"'))+'<div class="p23w"><div class="ad">'+E(T('No job yet'))+'</div><div class="sc-avs" style="margin-top:6px">'+guys.map(g=>'<span class="sc-av" title="'+E(g.name)+'">'+scInit(g.name)+'</span>').join('')+'</div>'
    +(ed?'<button type="button" class="p23bk" onclick="P21.book(\''+jsq(c.id)+'\',\''+k+'\')">'+E(T('+ Book a job'))+'</button>':'')+'</div></div>';}

/* ───────── the page ───────── */
renderDayBoard=function(){const m=me();const el=document.getElementById('todayBoard');if(!el)return;const k=selK();const t0=todayK();const isT=k===t0;
  if(P.lastK!==k){P.pv=null;P.lastK=k;}
  wxLoad();
  const crews=D.crews.slice().sort((a,b)=>(+crewNum(a)||0)-(+crewNum(b)||0));
  const off=isOff(k);const anyMoved=c=>crewGuys(c).some(g=>real(loansFor(g.id,k)).length);   // Baruch 11/18: men booked one by one ("Pick people") count — the card shows them
  const booked=c=>(off?!!(D.sched[c.id+'|'+k]&&real(slotAsgs(c.id+'|'+k)).length):slotHasAny(c.id+'|'+k))||anyMoved(c);
  const work=crews.filter(booked),free=crews.filter(c=>!booked(c)&&crewGuys(c).length);
  let body='';
  if(off){body='<div class="p23dayoff">'+IC.off+'<b>'+E(offName(k))+' — '+E(T('No work'))+'</b>'+E(T('No bookings · no punch-in reminders'))+'</div>'+(work.length?'<div class="p23list" style="margin-top:10px">'+work.map(c=>crewCard(c,k).html).join('')+'</div>':'');}
  else{
    const wd=new Date(k+'T12:00').getDay();
    let sum=work.length+' '+T('of')+' '+crews.length+' '+T('crews booked');
    const appC=work.filter(appClockCrew);if(isT&&appC.length&&nowMin()>=420){appC.forEach(c=>{const g=crewGuys(c);const on=g.filter(x=>scDayState(x,true,new Date().toDateString(),k).k==='in').length;sum+=' · '+c.name+': '+on+' '+T('of')+' '+g.length+' '+(lang()==='es'?'adentro':'in');});}
    body='<p class="p23sum">'+E(sum)+(isOff(k)?' · '+E(offName(k)):'')+'</p>';
    const cards=(k>=t0&&wd!==6?free.map(c=>noneCard(c,k)):[]).concat(work.map(c=>crewCard(c,k).html));
    body+='<div class="p23list">'+cards.join('')+'</div>';
    if(k<t0&&free.length)body+='<p class="p23sum" style="margin-top:10px">'+E(T('Not booked'))+': '+free.map(c=>E(c.name)).join(', ')+'</p>';}
  el.innerHTML=timeOffQueue()+'<div class="sc p23">'+topBox(k)+body+'</div>';
  const gb=document.getElementById('goHomeBox2');if(gb){gb.innerHTML='';gb.style.display='none';}
  wire(k);};

/* sticky top under the app's top bar; strip: swipe, tap, long-press; back arrow; swipe-left on crews; drag men */
function wire(k){const top=document.getElementById('p23top');try{const tb=document.querySelector('.top');const cs=tb&&getComputedStyle(tb);const h=tb&&(cs.position==='fixed'||cs.position==='sticky')?tb.getBoundingClientRect().height:0;if(top)top.style.top=h+'px';}catch(e){}
  const sp=document.getElementById('p23strip');if(sp){const cells=[...sp.querySelectorAll('.p23d')];const on=cells.find(b=>b.dataset.k===k);
    const cw=cells[0]?cells[0].getBoundingClientRect().width:48;
    if(P.stripX!=null&&P.stripK===k)sp.scrollLeft=P.stripX;else if(on){const i=cells.indexOf(on);sp.scrollLeft=Math.max(0,(i-Math.floor(i>=0?new Date(k+'T12:00').getDay():3))*cw);}
    const back=()=>{const b=document.getElementById('p23back');if(!b)return;const t=cells.find(x=>x.dataset.k===todayK());if(!t){b.style.display='none';return;}
      const L=t.offsetLeft-sp.scrollLeft,W=sp.clientWidth;const away=L<-cw/3||L>W-cw*2/3;
      if(!away){b.style.display='none';return;}const left=L<0;b.className='p23back';b.textContent=left?'‹ '+new Date().getDate():new Date().getDate()+' ›';b.style.display='';};
    sp.addEventListener('scroll',()=>{P.stripX=sp.scrollLeft;P.stripK=k;back();},{passive:true});back();requestAnimationFrame(back);setTimeout(back,300);
    cells.forEach(b=>{let tm=null,long=false;const x=b.dataset.k;
      const start=()=>{long=false;tm=setTimeout(()=>{long=true;try{navigator.vibrate&&navigator.vibrate(30);}catch(e){}P23.offMenu(x);},550);};const stop=()=>{clearTimeout(tm);};
      b.addEventListener('touchstart',start,{passive:true});b.addEventListener('touchend',stop);b.addEventListener('touchmove',stop,{passive:true});
      b.addEventListener('mousedown',start);b.addEventListener('mouseup',stop);b.addEventListener('mouseleave',stop);
      b.addEventListener('contextmenu',e=>{e.preventDefault();});
      b.addEventListener('click',e=>{if(long){e.preventDefault();long=false;return;}P.stripX=sp.scrollLeft;P.stripK=x;boardPick(x);});});}
  // swipe a crew left → Stay late / Send home (then confirm)
  document.querySelectorAll('#todayBoard .p23c:not(.nolate) .p23card').forEach(card=>{let x0=null,y0=null,dx=0,drag=false;const cid=card.dataset.crew;
    if(P.swiped===cid)card.style.transform='translateX(-104px)';
    card.addEventListener('touchstart',e=>{const p=e.touches[0];x0=p.clientX;y0=p.clientY;dx=0;drag=false;card.style.transition='none';},{passive:true});
    card.addEventListener('touchmove',e=>{if(x0==null)return;const p=e.touches[0];const mx=p.clientX-x0,my=p.clientY-y0;if(!drag&&Math.abs(mx)>10&&Math.abs(mx)>Math.abs(my)*1.3)drag=true;
      if(drag){dx=Math.max(-130,Math.min(0,mx+(P.swiped===cid?-104:0)));card.style.transform='translateX('+dx+'px)';}},{passive:true});
    card.addEventListener('touchend',()=>{card.style.transition='';if(drag){const openIt=dx<-55;P.swiped=openIt?cid:null;card.style.transform=openIt?'translateX(-104px)':'';
        document.querySelectorAll('#todayBoard .p23card').forEach(o=>{if(o!==card)o.style.transform='';});card.__noTap=Date.now();}x0=null;});});
  // computer: drag a man onto another crew
  document.querySelectorAll('#todayBoard .p23av[draggable=true]').forEach(av=>{av.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',av.dataset.emp);e.dataTransfer.effectAllowed='move';});});
  document.querySelectorAll('#todayBoard .p23c:not(.p23sub)').forEach(box=>{const cid=box.dataset.crew;
    box.addEventListener('dragover',e=>{e.preventDefault();box.classList.add('drop');});box.addEventListener('dragleave',()=>box.classList.remove('drop'));
    box.addEventListener('drop',e=>{e.preventDefault();box.classList.remove('drop');const emp=e.dataTransfer.getData('text/plain');if(emp)P23.moveMan(emp,cid,k);});});}

/* ───────── undo: remember the schedule as it was drawn; a save of schedule rows can be taken back for 10 s ───────── */
let SNAP={};function snap(){try{SNAP=JSON.parse(JSON.stringify(D.sched||{}));}catch(e){SNAP={};}}
const _rs=renderSched;renderSched=function(){const r=_rs.apply(this,arguments);try{const cp=document.querySelector('#todayBoard .p21copy');if(cp)cp.remove();}catch(e){}snap();return r;};
let undoing=false;
if(typeof window.EX_saveNow==='function'){const _sn=window.EX_saveNow;window.EX_saveNow=async function(o){const keys=(o&&o.keys||[]).filter(x=>x&&x[0]==='sched').map(x=>x[1]);
  const before={};keys.forEach(k=>{before[k]=Object.prototype.hasOwnProperty.call(SNAP,k)?SNAP[k]:undefined;});
  const r=await _sn.apply(this,arguments);if(!undoing&&keys.length&&r&&r.ok&&schedCanEdit())undoBar(before);return r;};}
function undoBar(before){const old=document.getElementById('p23undo');if(old)old.remove();const b=document.createElement('div');b.className='p23undo';b.id='p23undo';
  b.innerHTML='<span>✓ '+E(T('Changed'))+'</span><button type="button">'+E(T('Undo'))+'</button>';document.body.appendChild(b);
  const tm=setTimeout(()=>b.remove(),10000);
  b.querySelector('button').onclick=async()=>{clearTimeout(tm);b.remove();undoing=true;try{const keys=Object.keys(before);
      keys.forEach(k=>{const cur=D.sched[k];const rv=((cur&&cur.rev)||0)+1;if(before[k]===undefined)delete D.sched[k];else D.sched[k]=Object.assign({},before[k],{rev:rv,by:me().id,at:Date.now()});});
      save();const r=await EX_saveNow({keys:keys.map(k=>['sched',k]),waitMs:15000});renderSched();toast(r&&r.ok?'↩ '+T('Undone'):'⏳ '+T('Saved on this phone — it will be sent automatically'),r&&r.ok?'green':'blue');}
    catch(e){console.warn(e);}finally{undoing=false;}};}

/* ───────── menus ───────── */
function sheet(title,rows){ask(title,'<div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">'+rows.map(r=>'<button class="btn sec2" type="button" style="text-align:left'+(r.red?';color:#c0392b':'')+'" onclick="hide(\'m-ask\');'+r.on+'">'+r.l+(r.s?'<div style="font-size:12px;font-weight:400;color:var(--g4)">'+r.s+'</div>':'')+'</button>').join('')+'</div>',null);
  const ok=document.getElementById('askOk');if(ok&&ok.parentNode)ok.parentNode.style.display='none';}
window.P23={
  tap:cid=>{const c=document.querySelector('#todayBoard .p23card[data-crew="'+cid+'"]');if(c&&c.__noTap&&Date.now()-c.__noTap<400)return;if([...document.querySelectorAll('#todayBoard .p23subcard')].some(x=>x.__noTap&&Date.now()-x.__noTap<400))return;   // a half was just swiped
    if(P.swiped){P.swiped=null;renderSched();return;}scToggle(cid);},
  pv:cid=>{P.pv=P.pv===cid?null:cid;renderSched();},
  today:()=>{P.stripX=null;boardDay=0;renderSched();},
  lateHalf:(ids,isLate)=>{P.swiped=null;if(isLate)P9L.home(null,ids);else P9L.lateIds(ids);setTimeout(renderSched,300);},
  // Baruch 11/22: one box, not two — Stay late opens "Till when?" right away; Send home opens its own "Send them home now?"
  late:cid=>{const late=lateIds(cid).length>0;P.swiped=null;document.querySelectorAll('#todayBoard .p23card').forEach(o=>{o.style.transform='';});if(late)P9L.home(cid);else P21.late(cid);},
  crewMenu:(cid,k)=>{const c=D.crews.find(x=>x.id===cid);const own=real(slotAsgs(cid+'|'+k));const halves=[...new Set(crewGuys(c||{id:cid}).flatMap(g=>real(loansFor(g.id,k)).map(a=>a.site)))];const rows=[{l:'↪ '+E(T('Send to another job')),on:"P21.send('"+jsq(cid)+"','"+k+"')"},{l:'✂ '+E(T('Split the crew')),on:"P21.split('"+jsq(cid)+"','"+k+"')"},
      {l:'⧉ '+E(T('Copy')),on:"P21.copy('"+jsq(cid)+"','"+k+"')"},{l:'✎ '+E(T('Change job')),on:(own.length?"editSlot('":"P21.split('")+jsq(cid)+"','"+k+"')"}];   // Baruch 11/19: a crew split by people changes its jobs man by man
    if(k===todayK()&&window.P9L&&(fine()||wide())){const late=lateIds(cid).length>0;rows.push({l:'🕖 '+E(T(late?'Send home':'Stay late')),on:"P23.late('"+jsq(cid)+"')",red:!late});}
    sheet((c?c.name:'')+' · '+(own.length?scAddr(own[0].site).a:halves.map(x=>scAddr(x).a).join(' + ')).replace(/&amp;/g,'&'),rows);},
  dayMenu:k=>{const y=addD(k,-1);sheet(new Date(k+'T12:00').toLocaleDateString(LOC(),{weekday:'long',month:'short',day:'numeric'}),[
      {l:'⧉ '+E(T('Same as yesterday')),s:E(new Date(y+'T12:00').toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'}))+' → '+E(new Date(k+'T12:00').toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'})),on:"EX_sameAsPrev('"+k+"')"},
      {l:'⧉ '+E(T('Copy the whole day')),on:"EX_copyWholeDay('"+k+"')"}]);},
  // long-press a day → day off
  offMenu:k=>{const m=me();if(!(m.role==='owner'||m.all)){toast(T('Only the owner can change days off.'));return;}const off=isOff(k);const h=holiday(k);
    sheet(new Date(k+'T12:00').toLocaleDateString(LOC(),{weekday:'long',month:'long',day:'numeric'})+(h?' · '+h.n:''),[
      off?{l:'✓ '+E(T('It is a work day')),on:"P23.setOff('"+k+"',false)"}:{l:E(T('Make it a day off')),on:"P23.setOff('"+k+"',true)",red:true},
      {l:E(T('Days off'))+' ›',on:"P23.offSettings()"}]);},
  setOff:async(k,on,name)=>{const m=me();if(!(m.role==='owner'||m.all))return;if(!D.daysOff||Array.isArray(D.daysOff)){const o={};(D.daysOff||[]).forEach(x=>{if(x&&x.id)o[x.id]=x;});D.daysOff=o;}const h=holiday(k);let r=D.daysOff[k];
    if(!r){r={id:k};D.daysOff[k]=r;}r.off=!!on;r.name=name||r.name||(h?h.n:'');r.by=m.id;r.at=Date.now();delete r.deleted;save();
    try{if(window.EX_saveNow)await EX_saveNow({keys:[['daysOff',k]],waitMs:15000});}catch(e){}renderSched();if(document.getElementById('p23off'))P23.offSettings();
    toast('✓ '+new Date(k+'T12:00').toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric'})+' — '+T(on?'Day off':'It is a work day'),'green');},
  offSettings:()=>{const m=me();const can=m.role==='owner'||m.all;const t0=todayK();const L=[];const seen=new Set();
    for(let i=0;i<400;i++){const k=addD(t0,i);const h=holiday(k);if(!h)continue;if(!h.off&&!/Thanksgiving|Christmas|New Year|Memorial|Independence|Labor|Purim|Erev Pesach|Tisha/.test(h.n))continue;
      const prev=holiday(addD(k,-1));const grp=h.n+'|'+(prev&&prev.n===h.n?'':k);L.push({k,h,cont:prev&&prev.n===h.n});}
    const own=offList().filter(x=>x&&!x.deleted&&x.off&&x.id>=t0&&!holiday(x.id)).sort((a,b)=>a.id.localeCompare(b.id));
    const row=(k,n)=>{const on=isOff(k);return '<div class="p23o"><span>'+E(n)+'<small>'+E(new Date(k+'T12:00').toLocaleDateString(LOC(),{weekday:'short',month:'short',day:'numeric',year:'numeric'}))+(heb(k)?' · <span dir="rtl">'+gem(heb(k).d)+' '+(HMHE[heb(k).m]||'')+'</span>':'')+'</small></span>'+(can?'<button type="button" class="p23tg'+(on?' on':'')+'" onclick="P23.setOff(\''+k+'\','+(!on)+')" aria-label="'+E(T('Day off'))+'"></button>':'<span>'+(on?'✓':'')+'</span>')+'</div>';};
    ask(T('Days off'),'<div id="p23off"><div class="p23s" style="font-size:13px;color:var(--g4)">'+E(T('Turn on the days the company does not work.'))+'</div>'
      +(can?'<div style="display:flex;gap:6px;margin:10px 0 4px"><input type="date" id="p23od" min="'+t0+'" style="flex:1;font-size:15px;padding:8px;border-radius:9px;border:1px solid var(--g2);background:var(--g1);color:inherit"><input id="p23on" placeholder="'+E(T('Name (optional)'))+'" style="flex:1;font-size:15px;padding:8px;border-radius:9px;border:1px solid var(--g2);background:var(--g1);color:inherit"><button class="btn" style="width:auto;padding:8px 12px" onclick="const d=document.getElementById(\'p23od\').value;if(d)P23.setOff(d,true,document.getElementById(\'p23on\').value.trim())">'+E(T('Add'))+'</button></div>':'')
      +'<div class="p23offl">'+(own.length?'<div class="p23sec">'+E(T('Your days off'))+'</div>'+own.map(x=>row(x.id,x.name||T('Day off'))).join(''):'')
      +'<div class="p23sec">'+E(T('Upcoming holidays'))+'</div>'+L.map(x=>row(x.k,x.h.n)).join('')+'</div></div>',null);
    const ok=document.getElementById('askOk');if(ok&&ok.parentNode)ok.parentNode.style.display='none';},
  moveMan:(emp,cid,k)=>{const e=D.emps.find(x=>x.id===emp);if(!e||e.crew===cid&&!loansFor(emp,k).length)return;const a=real(slotAsgs(cid+'|'+k))[0];const c=D.crews.find(x=>x.id===cid);
    if(!a){toast(T('No job yet'));return;}const isT=k===todayK();const st=isT?Math.max(DAY_START,Math.floor(nowMin()/5)*5):DAY_START;
    askConfirm(T('Move')+' '+e.name.split(' ')[0]+' '+T('to')+' '+(c?c.name:'')+' ('+scAddr(a.site).a.replace(/&amp;/g,'&')+') '+T(isT?'for the rest of today':'for this day')+'?',async()=>{
      const key=loanKey(emp,k);const keep=real(loansFor(emp,k)).filter(x=>x.start<st).map(x=>Object.assign({},x,{end:(x.end==null||x.end>st)?st:x.end,remind:false}));
      const back=e.crew===cid;const list=back?keep:keep.concat([{id:newAsgId(),site:a.site,start:st,end:endOf(k),note:'',remind:false}]);
      if(list.length)D.sched[key]={emp,assignments:list.map(x=>({id:x.id||newAsgId(),site:x.site,start:x.start,end:x.end==null?null:x.end,note:x.note||''})),rev:rowRev(key)+1,by:me().id,at:Date.now()};else delete D.sched[key];
      save();let r=null;try{r=await EX_saveNow({keys:[['sched',key]],waitMs:15000});}catch(err){}renderSched();if(r&&r.ok)toast('✓ '+e.name.split(' ')[0]+' → '+(c?c.name:''),'green');},T('Move'));}};

/* a day off can't be booked */
if(window.P21){const _b=P21.book;P21.book=function(cid,k){if(isOff(k)){toast(T('This day is a day off.'));return;}return _b.apply(this,arguments);};}

/* Settings → Days off (owner + all-access) */
if(typeof window.renderMore==='function'){const _rm=window.renderMore;window.renderMore=function(){const r=_rm.apply(this,arguments);try{const m=me();const pg=document.getElementById('pg-more');
  if(pg&&(m.role==='owner'||m.all||m.role==='manager')&&!document.getElementById('p23set')){const b=document.createElement('div');b.id='p23set';b.className='card';b.style.cssText='padding:12px 14px;margin:10px 0;cursor:pointer;display:flex;align-items:center;gap:10px';
    b.innerHTML='<span style="color:var(--g4);line-height:0">'+IC.offS.replace(/width="12" height="12"/,'width="20" height="20"')+'</span><span style="flex:1"><b>'+E(T('Days off'))+'</b><div style="font-size:12.5px;color:var(--g4)">'+E(T('Turn on the days the company does not work.'))+'</div></span><span style="color:var(--g3)">›</span>';
    b.onclick=()=>P23.offSettings();const g=document.getElementById('moreGrid');if(g)pg.insertBefore(b,g);else pg.appendChild(b);}}catch(e){console.warn(e);}return r;};}
})();
