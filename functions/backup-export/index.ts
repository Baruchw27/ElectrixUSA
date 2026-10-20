// Supabase Edge Function "backup-export": the nightly off-site backup (works on the FREE Supabase plan).
// It hands out ENCRYPTED backups only: everything is locked with the owner's PUBLIC key (RSA-OAEP 4096 wraps a fresh
// AES-256-GCM key per file), so a backup is useless to anyone without the owner's private key, wherever it is stored.
//
// Who may ask:
//   • the nightly GitHub job of the owner's PRIVATE backup repository — proven with GitHub's signed OIDC token
//     (no password stored anywhere; the repository name is checked against server_config 'backup_repo'), or
//   • a test with the drill secret (header x-backup-secret = server_config 'backup_secret'; staging drills only).
// What it returns:
//   ?part=records            → every record (incl. removed ones), stock-applied list and database rules  (default)
//   ?part=files&since=ISO    → every uploaded file (photos, receipts, voice notes) added since that time; the
//                               backup job keeps all file batches, so each file is stored once, not every night
//   ?dry=1                   → small JSON summary (counts), nothing encrypted — for monitoring
//   ?sample=N                → records backup with only the first N records (restore drills)
// Every successful backup is noted in server_config ('last_backup_records' / 'last_backup_files'); a daily check
// in the database alerts the owner in the app if the last good backup is more than 30 hours old.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const enc = new TextEncoder();
function b64(u8: Uint8Array): string { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s: string): Uint8Array { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function unb64url(s: string): Uint8Array { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return unb64(s); }
async function sha256hex(u8: Uint8Array) { const h = new Uint8Array(await crypto.subtle.digest("SHA-256", u8)); return [...h].map((x) => x.toString(16).padStart(2, "0")).join(""); }

export async function encryptFor(publicKeyPem: string, plain: Uint8Array) {
  const der = unb64(publicKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
  const pub = await crypto.subtle.importKey("spki", der, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", aes));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, plain));
  const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, raw));
  const header = { format: "electrix-backup-enc-1", alg: "RSA-OAEP-256+A256GCM", key: b64(wrapped), iv: b64(iv), sha256_plain: await sha256hex(plain) };
  return enc.encode(JSON.stringify(header) + "\n" + b64(ct));
}

// GitHub Actions OIDC token check (RS256, GitHub's published keys)
async function githubJobOk(token: string, repo: string): Promise<string | null> {
  try {
    const [h, p, s] = token.split("."); if (!h || !p || !s) return "bad token";
    const head = JSON.parse(new TextDecoder().decode(unb64url(h))); const claims = JSON.parse(new TextDecoder().decode(unb64url(p)));
    if (head.alg !== "RS256") return "bad alg";
    const jwks = await (await fetch("https://token.actions.githubusercontent.com/.well-known/jwks")).json();
    const jwk = (jwks.keys || []).find((k: { kid: string }) => k.kid === head.kid); if (!jwk) return "unknown key";
    const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, unb64url(s), enc.encode(h + "." + p))) return "bad signature";
    const now = Date.now() / 1000;
    if (claims.iss !== "https://token.actions.githubusercontent.com") return "bad issuer";
    if (claims.aud !== "electrix-backup") return "bad audience";
    if (!(claims.exp > now) || (claims.nbf && claims.nbf > now + 60)) return "expired";
    if (claims.repository !== repo) return "wrong repository";
    if (claims.ref !== "refs/heads/main") return "wrong branch";
    return null;
  } catch (e) { return "token check failed: " + (e as Error).message; }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await adm.from("server_config").select("k,v").in("k", ["backup_secret", "backup_pubkey", "backup_repo"]);
  const c: Record<string, string> = {}; for (const r of cfg || []) c[r.k] = r.v;
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  let ok = false;
  if (c.backup_secret && req.headers.get("x-backup-secret") === c.backup_secret) ok = true;
  else if (bearer && c.backup_repo) { const why = await githubJobOk(bearer, c.backup_repo); if (!why) ok = true; else return new Response("forbidden: " + why, { status: 403 }); }
  if (!ok) return new Response("forbidden", { status: 403 });
  if (!c.backup_pubkey && url.searchParams.get("dry") !== "1") return new Response("no backup public key set", { status: 500 });
  const note = (k: string, v: unknown) => adm.rpc("backup_note", { p_k: k, p_v: JSON.stringify(v) });

  if (url.searchParams.get("part") === "files") {
    const since = url.searchParams.get("since") || "1970-01-01T00:00:00Z";
    const { data: list, error } = await adm.rpc("backup_files_since", { p_since: since });
    if (error) return new Response("file list failed: " + error.message, { status: 500 });
    if (url.searchParams.get("dry") === "1") return Response.json({ ok: true, meta: { since, files: (list || []).length } });
    const files: unknown[] = []; let errors = 0, bytes = 0, upto = since;
    for (const f of (list || []) as { name: string; type?: string; created_at: string }[]) {
      const { data: blob, error: e } = await adm.storage.from("files").download(f.name);
      if (e || !blob) { errors++; continue; }       // not counted as backed up: "upto" stops before it, retried next night
      const u8 = new Uint8Array(await blob.arrayBuffer()); bytes += u8.length;
      files.push({ name: f.name, type: f.type || blob.type, created_at: f.created_at, b64: b64(u8) });
      if (!errors) upto = f.created_at;
    }
    const body = { meta: { format: "electrix-files-1", taken_at: new Date().toISOString(), since, upto, files: files.length, bytes, errors }, files };
    const out = await encryptFor(c.backup_pubkey, enc.encode(JSON.stringify(body)));
    if (!errors) await note("last_backup_files", { at: body.meta.taken_at, files: files.length, bytes, upto });
    return new Response(out, { headers: { "Content-Type": "application/octet-stream", "x-files": String(files.length), "x-file-errors": String(errors), "x-upto": upto } });
  }

  const { data: snap, error } = await adm.rpc("backup_snapshot");
  if (error || !snap) return new Response("snapshot failed: " + (error?.message || "empty"), { status: 500 });
  if (url.searchParams.get("dry") === "1") return Response.json({ ok: true, meta: snap.meta });
  const sample = Number(url.searchParams.get("sample") || 0);
  const body = sample > 0
    ? { ...snap, records: (snap.records || []).slice(0, sample), schema: {}, meta: { ...snap.meta, records: Math.min(sample, (snap.records || []).length), sample: true } }
    : snap;
  const out = await encryptFor(c.backup_pubkey, enc.encode(JSON.stringify(body)));
  if (!sample) await note("last_backup_records", { at: snap.meta?.taken_at, records: snap.meta?.records, bytes: out.length });
  return new Response(out, { headers: { "Content-Type": "application/octet-stream", "x-records": String(body.meta?.records ?? "") } });
});
