// STAGING copy of Electrix USA — fake data only. Points at the separate staging database (project rkkxykdkjgdsgkujanau).
// The anon key below is the PUBLIC client key of the staging project (safe to publish; it only works together with the database rules).
window.EX_CFG={
  url:'https://rkkxykdkjgdsgkujanau.supabase.co',
  anonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJra3h5a2Rramdkc2drdWphbmF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyOTcxODYsImV4cCI6MjEwNzg3MzE4Nn0._eToR_8K_eL6D6j65vkVzXea--L8OeqlYIJ-Gtt-YXw',
  vapid:'BNb_nSg78OfiNKMnR4vqhszd7I3O09BuG0MLtYb6TcppMjwxdZRdINVAFPfDF8sid-axpvTQNVDgbH_BfLpnbg0',
  trello:false,
  ai:true,         // STAGING ONLY: AI label reading (works once the staging server secret ANTHROPIC_API_KEY is set; limits in ai_take)
  fieldtest:true   // STAGING ONLY: log real-phone scans to scan_field_log (camera test)
};
// STAGING ONLY: the staging site lives on the same web address (baruchw27.github.io) as the real app, and browsers share
// saved data per address. Prefix every saved key so the staging copy can never read or upload the real app's saved data.
(function(){var P='stg__';try{['getItem','setItem','removeItem'].forEach(function(m){var f=Storage.prototype[m];Storage.prototype[m]=function(k){var a=Array.prototype.slice.call(arguments);a[0]=P+k;return f.apply(this,a);};});}catch(e){}})();
// STAGING ONLY: a small label so nobody mistakes this for the real app.
document.addEventListener('DOMContentLoaded',function(){var b=document.createElement('div');b.textContent='STAGING — fake test data';b.style.cssText='position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483647;background:#c62828;color:#fff;font:600 11px/16px system-ui,sans-serif;padding:0 8px;border-radius:0 0 6px 6px;pointer-events:none;opacity:.9';document.body.appendChild(b);document.title='STAGING · '+document.title;});
