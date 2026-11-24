# Commission sheets → job costs (Baruch 11/24)

Two Google Sheets (owner: Baruch):
- YL Touch Ups — "Commission YL" — 1xe2GNJfbVsdZUqfqrQ_AWjx1qLtIIx4UkX0OhQxhza4 (Sheet1)
- M Linko (Menachem) — "Commission Menachem" — 1qaIABdfG7oegxdpURCt_7ov0jigsI42zUfN80Mz52sQ (Sheet1)

Columns: A job, B project cost, C invoiced, D money received, F **Commission** (= % of money received; % from the section header row "3%"/"6%"), G paid, H unpaid.
Baruch 11/24: the job cost is the **Commission column (F)** — the full amount earned on that job. Paid / unpaid do NOT matter. YL's monthly $4,000/$5,800 checks and M Linko's checks stay OUT (not job costs).

In the app: records coll=qbexp, id `comm_<siteid>`, data {site, src:"Commission sheets", lines:[{c:"sub", d, v:"YL Touch Ups"|"M Linko (Menachem)", a:"Commission 3%", m, amt, src:"comm", k:"yl|<sheet job>"|"mn|<sheet job>", t:"Commission"}]}. Owner + Payroll only (qbexp).
Opening load 11/24/2026: 38 jobs, $58,669.24, dated 2026-11-24. Rows with no app job ($1,455.60) were left out: 5 Birch St, 30 Bergen Turnpike, 15 Meron, 17 Devan, 15 & 34 Bailie Ln, 34 Peddler Hill, Livland Office, (the unnamed $600 row = 14 Dorset Rd, added 11/24 by Baruch).

## Weekly check (Monday)
1. Read both sheets (A:H). For each row with a job name: commission F.
2. Per row key k ("yl|"/"mn|" + the job text, trimmed), sum of app lines with that k = already in the app.
3. If F − already ≠ 0 (more than $0.01): add ONE line with amt = the difference, d = today, same v/a/k, m = "<job> — change this week (now $X total)". Never edit or remove old lines.
4. A row not in the map below → do not add; tell Baruch "new row on the sheet: <job> $X — which job?".
5. Report to Baruch (SendUserMessage) only what changed.

## Map (sheet row → app job)

| who | sheet row | app site | commission 11/24 |
|---|---|---|---|
| YL Touch Ups | 6 Andrew Dr, Monsey, NY 10952 | t255 | 3,215.58 |
| YL Touch Ups | 22 Old Nyack Turnpike, Monsey, NY  #102 | t217 | 208.08 |
| YL Touch Ups | 17 Nytko Dr, | t8 | 425.61 |
| YL Touch Ups | 5 Birch St, Airmont, NY 10952 | — none (left out) | 67.62 |
| YL Touch Ups | Island Time Supermarket | t150 | 15,293.25 |
| YL Touch Ups | 83 Winchester Dr, Monroe, NY 10950 | t227 | 469.80 |
| YL Touch Ups | 8 Forest Ave, Monroe, NY 10950 | t7 | 502.38 |
| YL Touch Ups | 223 Mountain Woods Cir, South Fallsburg, | sfc_223mw | 293.97 |
| YL Touch Ups | 7 Penny Ct, Monroe, NY 10950 | t232 | 1,059.84 |
| YL Touch Ups | 6 Eahal Ct, Monroe, NY 10950 | t158 | 359.61 |
| YL Touch Ups | 5 Garfield Rd, Monroe, NY 10950 | sfc_5garfield | 558.30 |
| YL Touch Ups | 529 Round Lake Park Rd, Monroe, NY 10950 | t146 | 404.52 |
| YL Touch Ups | 1 Sleep Way, Monroe, NY 10950 | t110 | 1,998.15 |
| YL Touch Ups | 213 Mountain Woods Cir, Fallsburg, NY 127 | sfc_213mw | 394.98 |
| YL Touch Ups | 30 Bergen Turnpike, Ridgefield Park | — none (left out) | 627.75 |
| YL Touch Ups | 14 Meron Dr, Monroe, NY 10950 | sfc_14meron | 37.50 |
| YL Touch Ups | 15 Meron Dr, Monroe, NY 10950 | — none (left out) | 15.15 |
| YL Touch Ups | 17 Devan Dr, Kiryas Joel, NY 10950 | — none (left out) | 76.20 |
| YL Touch Ups | 15 Bailie Ln, Monroe, NY 10950 | — none (left out) | 15.75 |
| YL Touch Ups | 34 Bailie Ln, Monroe, NY 10950 | — none (left out) | 5.25 |
| YL Touch Ups | 34 Peddler Hill Rd, Monroe, NY 10950 | — none (left out) | 10.50 |
| YL Touch Ups | Livland Office | — none (left out) | 37.38 |
| YL Touch Ups | 14 Palmer Ave, Monroe, NY 10950 | t96 | 69.00 |
| YL Touch Ups | 3 Kerestier Ct, #405 Kiryas Joel, NY 1095 | t53 | 300.00 |
| YL Touch Ups | 45 Elkay Dr, Chester, NY 10918 | simvfl4prynr3sk | 750.00 |
| YL Touch Ups | 220 Prospect Rd, Monroe, NY 10950 | t45 | 999.90 |
| YL Touch Ups | Highveiw Estates | t15 | 13.50 |
| YL Touch Ups | HE Building 1 - 3 Belz Way | t15 | 5,287.50 |
| YL Touch Ups | HE Building 2 - 5 Belz Way | t41 | 761.50 |
| YL Touch Ups | Palm Tree Estates | t30 | 90.75 |
| YL Touch Ups | PTE Building 2 - 1 Magentza Way | t175 | 8,970.00 |
| YL Touch Ups | Greens At Chester | t28 | 20.25 |
| YL Touch Ups | 11 Aspen Rd. - Water Treatment Center | t343 | 300.00 |
| YL Touch Ups | E-99 1 Arborvitae Ct. | t28 | 260.93 |
| YL Touch Ups | E-100 3 Arborvitae Ct. | t28 | 260.93 |
| YL Touch Ups | E-101 5 Arborvitae Ct. | t28 | 260.91 |
| YL Touch Ups | E-102 6 Arborvitae Ct. | t28 | 57.00 |
| YL Touch Ups | E-103 4 Arborvitae Ct. | t28 | 260.93 |
| YL Touch Ups | B-1 1 Hemlock Ct. | t28 | 260.93 |
| YL Touch Ups | B-2 3 Hemlock Ct. | t28 | 260.93 |
| YL Touch Ups | B-4 2 Hemlock Ct. | t28 | 74.55 |
| YL Touch Ups | B-5 1 Periwinkle Ct. | t226 | 514.13 |
| YL Touch Ups | B-6 3 Periwinkle Ct. | t178 | 226.05 |
| YL Touch Ups | B-7 4 Periwinkle Ct. | t28 | 74.55 |
| YL Touch Ups | B-8 2 Periwinkle Ct. | t28 | 74.55 |
| YL Touch Ups | B-9 2 Gate Way | t28 | 74.55 |
| YL Touch Ups | B-10 1 Honeysuckle Ct. | t28 | 74.55 |
| YL Touch Ups | B-11 3 Honeysuckle Ct. | t28 | 260.93 |
| YL Touch Ups | B-12 4 Honeysuckle Ct. | t28 | 74.55 |
| YL Touch Ups | B-13 2 Honeysuckle Ct. | t28 | 74.55 |
| YL Touch Ups | B-14 1 Hilltop Lane | t28 | 74.55 |
| YL Touch Ups | B-15 3 Hilltop Lane | t28 | 74.55 |
| YL Touch Ups | B-16 5 Hilltop Lane | t28 | 74.55 |
| YL Touch Ups | B-17 7 Hilltop Lane | t28 | 74.55 |
| YL Touch Ups | B-18 9 Hilltop Lane | t17 | 703.54 |
| YL Touch Ups | B-19 11 Hilltop Lane | t18 | 611.39 |
| YL Touch Ups | B-20 1 Ash Ct. | t28 | 45.00 |
| YL Touch Ups | B-22 5 Ash Ct. | t28 | 74.55 |
| YL Touch Ups | B-24 15 Hilltop Ln | t22 | 739.13 |
| YL Touch Ups | B-26 1 Pear Court | t25 | 679.08 |
| YL Touch Ups | B-27 3 Pear Court | t179 | 559.13 |
| YL Touch Ups | B-28 5 Pear Court | t24 | 732.36 |
| YL Touch Ups | B-29 4 Pear Court | t23 | 659.78 |
| YL Touch Ups | B-30 2 Pear Court | t26 | 742.13 |
| YL Touch Ups | B-48  3 Cliff Rose Ct | t154 | 1,463.09 |
| YL Touch Ups | 14 Dorset Rd (Baruch 11/24: the row with NO name, $20,000 received; key yl|14 Dorset Rd — if the name is later typed on the sheet as "14 Dorset…", it is the same row) | t70 | 600.00 |
| M Linko (Menachem) | 5 Mirror Lake Rd, Spring Valley, NY 10977 | t133 | 2,304.00 |
| M Linko (Menachem) | 18 Hazel Ct, Spring Valley, NY 10977 | t63 | 2,215.50 |
| M Linko (Menachem) | 9 Summit Ave, Monsey, NY 10952 | t47 | 912.87 |
