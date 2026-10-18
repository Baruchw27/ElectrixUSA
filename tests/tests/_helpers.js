const fs = require('fs');
const path = require('path');
function cfg() {
  const p = path.join(__dirname, '..', 'staging.accounts.json');
  if (!fs.existsSync(p)) throw new Error('Create staging.accounts.json from staging.accounts.example.json and fill the staging passwords (see STAGING_TEST_ACCOUNTS.txt).');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
// Sign in through the staging "login" edge function and return the access token (or null on refusal).
async function login(request, c, q, password) {
  const r = await request.post(c.supabaseUrl + '/functions/v1/login', {
    headers: { apikey: c.anonKey, 'Content-Type': 'application/json' },
    data: { q, password },
  });
  if (!r.ok()) return { token: null, status: r.status() };
  const j = await r.json();
  return { token: j.session && j.session.access_token, status: r.status() };
}
function auth(c, token) { return { apikey: c.anonKey, Authorization: 'Bearer ' + token, Accept: 'application/json' }; }
module.exports = { cfg, login, auth };
