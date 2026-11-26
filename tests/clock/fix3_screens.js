const {chromium}=require('/opt/npm-tools/node_modules/playwright');
const OUT='/home/claude/work/shots/out';require('fs').mkdirSync(OUT,{recursive:true});
const T=hm=>new Date('2026-11-25T'+hm+':00-05:00').getTime();
async function page(b,{dark,lang,who}){const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,timezoneId:'America/New_York',colorScheme:dark?'dark':'light'});
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));await pg.route(/^https?:\/\//,r=>r.abort());
  await pg.clock.install({time:new Date('2026-11-25T22:40:00-05:00')});
  await pg.goto('file:///home/claude/work/shots/app/index.html');await pg.waitForTimeout(600);
  await pg.evaluate(([T0,dark,lang])=>{const T=hm=>new Date('2026-11-25T'+hm+':00-05:00').getTime();
    D.sites=[{id:'t45',name:'220 Prospect Rd, Monroe, NY 10950',lat:41.38,lng:-74.19,rad:500,stage:'rough'},{id:'t70',name:'14 Dorset Rd, Spring Valley, NY 10977',lat:41.12,lng:-74.04,rad:150,stage:'rough'}];
    if(!D.emps.find(e=>e.id==='o1'))D.emps.push({id:'o1',name:'Shia',role:'office',title:'Payroll'});
    D.emps.find(e=>e.id==='u1').name='Baruch';
    const c=D.emps.find(e=>e.id==='u7');c.name='Carlos';c.lang=lang;D.emps.find(e=>e.id==='o1').lang=lang;
    D.punches=[{id:'pA',who:'u7',site:'t45',in:T('08:25'),out:T('12:50'),autoClosed:{how:'left'}},{id:'pB',who:'u7',site:'t45',in:T('13:57'),out:T('16:48'),auto:'back'},{id:'pC',who:'u7',site:'t45',in:T('18:21'),out:T('21:07'),auto:'back'}];
    D.fixes=[];save();try{localStorage.setItem('electrix_theme',dark?'dark':'light');}catch(e){}},[0,dark,lang]);
  await pg.evaluate(w=>signIn(w),who);await pg.waitForTimeout(500);
  await pg.evaluate(()=>{try{applyTheme();}catch(e){}document.querySelectorAll('div.ov[id^=m-]').forEach(o=>o.classList.add('hid'));});
  return {pg,ctx,errs};}
async function shot(pg,name){await pg.waitForTimeout(250);const el=await pg.$('#m-fix:not(.hid) .md');if(el)await el.screenshot({path:OUT+'/'+name});else await pg.screenshot({path:OUT+'/'+name});}
(async()=>{const b=await chromium.launch();const all=[];
for(const [lang,dark] of [['en',false],['es',true]]){
  // 1) Carlos fills the new form: taps the 8:25 AM clock → "app closed my clock but I was still working" → 9:06 PM
  let {pg,ctx,errs}=await page(b,{dark,lang,who:'u7'});
  await pg.evaluate(()=>{openFix();fxPick('pA');fxKind('gap');document.getElementById('fxOut').value='21:06';fxCheck();document.getElementById('fxWhy').value='Por falta de señal';});
  await shot(pg,`fix_form_${lang}_${dark?'dark':'light'}.png`);
  // 2) the AM/PM mistake he made on 11/25 → warned and refused, no duplicate
  await pg.evaluate(()=>{openFix();fxKind('missing');document.getElementById('fxSite').value='t45';document.getElementById('fxIn').value='20:25';document.getElementById('fxOut').value='21:06';fxCheck();});
  await shot(pg,`fix_mistake_${lang}_${dark?'dark':'light'}.png`);
  // send the good request
  await pg.evaluate(()=>{openFix();fxPick('pA');fxKind('gap');document.getElementById('fxOut').value='21:06';document.getElementById('fxWhy').value='Por falta de señal';sendFix();});
  const fixes=await pg.evaluate(()=>JSON.stringify(D.fixes));all.push(...errs);await ctx.close();
  // 3) Payroll sees Before → After, approves
  ({pg,ctx,errs}=await page(b,{dark,lang:lang==='es'?'es':'en',who:'o1'}));
  await pg.evaluate(f=>{D.fixes=JSON.parse(f);save();goTab('hours');setPaySec('fix');renderFixQueue();window.scrollTo(0,0);},fixes);await pg.waitForTimeout(300);
  const q=await pg.$('#fixQueue');await q.screenshot({path:OUT+`/payroll_queue_${lang}_${dark?'dark':'light'}.png`});
  const id=await pg.evaluate(()=>D.fixes[0].id);await pg.evaluate(i=>fixSet(i,'approved'),id);
  const res=await pg.evaluate(()=>D.punches.filter(p=>p.who==='u7').map(p=>({id:p.id,in:new Date(p.in).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}),out:p.out?new Date(p.out).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):null,voided:!!p.voided})));
  console.log(lang,'after approve:',JSON.stringify(res),'fix status:',await pg.evaluate(()=>D.fixes[0].status));
  all.push(...errs);await ctx.close();}
console.log('page errors:',all.length?all:'none');await b.close();})();
