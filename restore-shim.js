/* Rollback safety net (only used if the Schedule v2.1 release is ever rolled back).
   Schedule v2.1 also keeps unsent work in IndexedDB, for when phone storage is full. This older app version only
   reads localStorage, so at start this copies any NEWER waiting work from IndexedDB back into localStorage and
   reloads once — nothing created by v2.1 is stranded. Reads/writes only this database's own copy (never staging). */
(function(){try{if(!window.indexedDB)return;const CFG=window.EX_CFG||{};
  const DB='ex_durable_'+String(CFG.url||'local').replace(/^https?:\/\//,'').replace(/[^a-z0-9]/gi,'_');
  const KEYS=['ex_queue','ex_rejects','electrix_v29__stockq','ex_sched_drafts'];
  const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{try{r.result.createObjectStore('kv');}catch(e){}};
  r.onsuccess=()=>{const db=r.result;let changed=false,left=KEYS.length;
    KEYS.forEach(k=>{try{const g=db.transaction('kv','readonly').objectStore('kv').get(k);
      g.onsuccess=()=>{const rec=g.result;const ls=+(localStorage.getItem('ex_dseq__'+k)||0);
        if(rec&&typeof rec.v==='string'&&rec.seq>ls){try{localStorage.setItem(k,rec.v);localStorage.setItem('ex_dseq__'+k,String(rec.seq));changed=true;}catch(e){}}
        if(--left===0)done();};
      g.onerror=()=>{if(--left===0)done();};}catch(e){if(--left===0)done();}});
    function done(){if(changed){try{if(!sessionStorage.getItem('ex_rb_restored')){sessionStorage.setItem('ex_rb_restored','1');location.reload();}}catch(e){}}}};
}catch(e){}})();
