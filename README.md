# Electrix Field — the real app

Home-screen web app for Electrix USA. One shared database, so every phone sees the same jobs, punches, tasks, notes and alerts.

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | The app |
| `sync.js` | Keeps every phone in sync with the shared database; works offline and catches up later |
| `extras.js` | Phone notifications, opening files inside the app, AI features |
| `config.js` | The only file you fill in: your database address and key |
| `sw.js`, `manifest.json`, `icon-*.png` | Lets the app install on the home screen and open with no signal |
| `schema.sql` | Sets up the database (paste into Supabase once) |
| `functions/` | Optional server pieces: `notify` (phone alerts), `trello` (move cards and open Trello files), `ai` (AI estimates) |
| `test/` | The test suite (two-phone sync, every button for every role, database rules) |

## Setup (about 15 minutes)

### 1. Database (Supabase)
1. Go to supabase.com and sign up (you can sign up with GitHub).
2. Click **New project**. Name it `electrix`, pick a database password (save it), and choose region **East US**.
3. When it's ready, open **SQL Editor**, paste all of `schema.sql`, and tap **Run**.
4. Open **Authentication → Sign In / Providers → Email** and turn **Confirm email** OFF. Leave Email sign-in ON.
5. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key into `config.js`.

### 2. Put it online (GitHub Pages)
1. On github.com, create a public repository called `electrix-app` and upload every file in this folder.
2. In the repository, open **Settings → Pages**. Set **Source** to *Deploy from a branch*, **Branch** to `main`, folder `/ (root)`.
3. The app's address is `https://<your-github-name>.github.io/electrix-app/`.

### 3. First sign-in (Baruch)
1. Open the address and tap **First-time setup (owner only)**.
2. Choose your password, then pick **A clean slate** (keeps the jobs, crews and catalog, and drops the demo tasks, punches and expenses).
3. Tap **Create sign-ins**. Every employee gets a password, and the list is saved in a private note that only you can see.
4. Send each person the link and their password. They sign in with their **name** (or phone number) and password.

### 4. Each phone
- **iPhone:** open the link in Safari, tap **Share → Add to Home Screen**, then open the app from the home screen. Sign in, then go to **More → Phone notifications**.
- **Android:** open the link in Chrome and tap **Install app**. Sign in, then go to **More → Phone notifications**.

## Optional add-ons

| Add-on | What you need | Where it goes |
|---|---|---|
| Phone notifications when the app is closed | Deploy `functions/notify`. Set secrets `VAPID_PUBLIC`, `VAPID_PRIVATE`, `PUSH_SECRET`. | Then run in SQL Editor: `insert into server_config values ('functions_url','https://<project>.supabase.co/functions/v1'),('secret','<same PUSH_SECRET>');` |
| Trello: moving a job's stage moves its card, and Trello files open inside the app | A Trello API key and token. Deploy `functions/trello` with secrets `TRELLO_KEY`, `TRELLO_TOKEN`, `PUSH_SECRET`. | Set `trello:true` in `config.js` |
| AI estimates, receipt reading and smart search | An Anthropic API key. Deploy `functions/ai` with secret `ANTHROPIC_API_KEY`. | Set `ai:true` in `config.js` |

## Everyday office jobs
- **New employee:** Team → add the person. The app creates their sign-in and shows the password once.
- **Forgot password:** Team → open the person → type a new password → Save.
- **Someone leaves:** Team → open the person → switch Active off. They lose access right away.
- **Backup:** More → Export data saves everything to a file.

## How it stays safe
- Only people on the team list who are switched to Active can read or change anything. A stranger who signs up sees nothing.
- Each sign-in is tied to one employee record, so nobody can claim someone else's account.
- Notes are private: only the person who wrote a note and the people it's shared with can see it, and the database itself enforces this.
- Only you, the managers and payroll can reset passwords.
