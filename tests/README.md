# Electrix USA — staging end-to-end tests (Playwright)

Runs against the **staging** site + Supabase only: `https://baruchw27.github.io/ElectrixUSA/staging/` and
`https://rkkxykdkjgdsgkujanau.supabase.co`. Never point these at production.

## Why this exists
Claude's sandbox has no network route to the staging site or Supabase, so Claude could only test at the database level.
These tests exercise the real HTTPS endpoints and the real browser, so you (or ChatGPT, on a machine with internet)
get actual pass/fail, screenshots and logs — the live verification that's still outstanding.

## Setup
1. `npm install`
2. `npx playwright install chromium`
3. Copy `staging.accounts.example.json` to `staging.accounts.json` and paste the 8 staging passwords from
   `STAGING_TEST_ACCOUNTS.txt` (these work only on staging). Do not commit the filled file.

## Run
- Everything:        `npm test`
- API security only: `npm run test:api`   (REST/RPC/Storage/login over HTTPS — the account-to-account checks)
- UI smoke only:     `npm run test:ui`     (loads the site, sign-in, sign-out; screenshots in ./shots)
- HTML report:       `npm run report`

Raw machine-readable results land in `results.json`; traces/videos for any failure under `test-results/`.

## Coverage vs ChatGPT's 8 areas
1. Login every role incl. wrong password / unknown user → api test 1, ui test 2 (+ sign in each role by reusing helper)
2. Employee privacy (A cannot read B hours/receipts/notes/address/emergency/files) → api tests 2a,2b,6a,6c
3. Clock in/out, jobs, inventory, receipts, sync → **UI: scaffolded in ui_smoke (needs the on-screen controls wired)**
4. Offline, reconnect, logout, account switch → **UI: drive with page.context().setOffline(true) + the stash checks** (scaffold notes in ui_smoke)
5. Rejected saves show an error, not false success → api test 5 (server), UI toast needs the live app
6. File upload/download/overwrite/access → api tests 6a–6d
7. Realtime between two accounts → **needs @supabase/supabase-js realtime; see note below**
8. Leftover local storage after logout incl. biometric → ui test 3 (checks stg__electrix_v29 + stg__electrix_bio cleared)

### Still to wire by whoever runs it (needs eyes on the live UI)
- The clock-in/receipt/job UI flows (area 3) and the offline toggle flow (area 4): the selectors depend on the live
  screens; the scaffold shows where to add them.
- Realtime (area 7): open two supabase-js clients (one signed in as A, one as B), subscribe A to `records`, have B
  update B's `keep` note, assert A never receives it. Left as a documented step because it needs a short live script.

Anything these tests cannot execute is called out here rather than assumed to pass.
