/* Electrix Assistant — practice set (Baruch 11/15).
   Real ways the team talks, asked to the REAL AI on the live app, to catch anything a change broke.
   Run it in the live app (signed in as owner or Shia): paste this file into the page, then call  await PRAC.run()  and read PRAC.out.
   SAFE: nothing is sent — tasks and material only become cards (never tapped), and notes / job steps / defaults are blocked here. */
(function(){
const T=P17.tools,calls=[];const WRAP={};
const BLOCK=new Set(['add_job_note','set_job_step','set_material_default']);
for(const k of Object.keys(T)){if(k[0]==='_')continue;const f=T[k];WRAP[k]=f;T[k]=function(i){calls.push({tool:k,input:i||{}});if(BLOCK.has(k))return {ok:true,note:'practice run — not done'};return f.apply(this,arguments);};}
const job=q=>{const r=WRAP.find_jobs({query:q});return r[0]&&r[0].id;};
const who=q=>{const r=WRAP.find_people({query:q});return r[0]&&r[0].id;};
const used=(n,f)=>calls.some(c=>c.tool===n&&(!f||f(c.input)));
const lastText=()=>{const L=P17._log();for(let i=L.length-1;i>=0;i--)if(L[i].who==='ai')return L[i].text;return '';};
const draft=k=>P17._log().find(x=>x.who==='draft'&&x.kind===k);
const CASES=[
 ['pull up six hadassah',()=>used('open_job',i=>i.job_id===job('6 Hadassah'))],
 ['pull up 600 assets lane',()=>used('open_job',i=>i.job_id===job('6 Hadassah'))],
 ['open five glenbrook',()=>used('open_job',i=>i.job_id===job('5 Glenbrook'))],
 ['make a task for Nachum to do billing for 5 Garfield',()=>{const d=draft('task');return !!d&&d.d.to.includes(who('Menachem'))&&d.d.job_id===job('5 Garfield');}],
 ['send Yossi a task to check the panel at 6 Hadassah tomorrow morning',()=>{const d=draft('task');return !!d&&d.d.to.includes(who('Yossi'));}],
 ['can you make a material request for me I need $500 switches I need one roll of 12 to wire for five Glenbrook',()=>used('find_material')&&(()=>{const d=draft('mat');return !d||(d.d.job_id===job('5 Glenbrook')&&d.d.items.some(x=>x.q==='500'));})()],
 ['necesito veinte cajas de cuatro pulgadas para 5 glenbrook',()=>used('find_material')&&(()=>{const d=draft('mat');return !d||d.d.items.some(x=>x.q==='20');})()],
 ["who's working right now",()=>used('working_now')],
 ['¿quién está trabajando ahora?',()=>used('working_now')],
 ['how many hours did crew 1 work this week',()=>used('hours')],
 ["what's open with O&R",()=>used('orr_status')],
 ['give me a summary of today',()=>used('day_summary')],
 ['did the material for 5 Glenbrook get ordered',()=>used('material_status',i=>i.job_id===job('5 Glenbrook'))],
 ['add a note to 5 Glenbrook: inspector wants a GFCI in the garage',()=>used('add_job_note',i=>i.job_id===job('5 Glenbrook')&&/gfci/i.test(i.text))],
 ['move 5 Glenbrook to rough complete',()=>used('set_job_step',i=>i.job_id===job('5 Glenbrook')&&/roughdone|rough/i.test(i.step))],
 ["what are Menachem's open tasks",()=>used('open_tasks',i=>i.person_id===who('Menachem'))],
 ["what's the schedule tomorrow",()=>used('schedule')],
 ['put in my schedule that group 3 is going to work today someday at 10:30 at 5 Glenbrook and group 4 is going to work by 80 grassland',()=>{const d=draft('sched');return !!d&&d.d.rows.some(r=>r.crew==='c3'&&r.start===630)&&d.d.rows.some(r=>r.crew==='c4');}],
];
window.PRAC={out:[],running:false,async run(only){if(this.running)return;this.running=true;this.out=[];P17.open();
  for(const [q,ok] of CASES){if(only&&!q.includes(only))continue;P17.clear();calls.length=0;const t0=Date.now();let pass=false,err='';
    try{await P17._run(q);pass=!!ok();}catch(e){err=String(e);}
    const L=P17._log();const bad=L.find(x=>x.who==='err');if(bad)err=bad.text;
    this.out.push({q,pass:pass&&!bad,secs:Math.round((Date.now()-t0)/1000),tools:calls.map(c=>c.tool+(c.input.query?'('+c.input.query+')':'')).join(' → '),answer:lastText().slice(0,160),err});}
  P17.clear();P17.close();this.running=false;return this.out;},
  summary(){const p=this.out.filter(x=>x.pass).length;return p+'/'+this.out.length+' passed'+this.out.filter(x=>!x.pass).map(x=>'\n✗ '+x.q+' — '+(x.err||x.tools+' — '+x.answer)).join('');}};
})();
