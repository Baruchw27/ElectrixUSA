#!/usr/bin/env python3
"""Electrix USA off-site backup tool (owner's computer).

  python3 backup_tool.py newkey  owner_private.pem owner_public.pem
      Make the owner's key pair once. Keep owner_private.pem OFFLINE (USB stick + a printed copy in the safe);
      the public key goes into the server (server_config 'backup_pubkey') so backups can be locked with it.
  python3 backup_tool.py decrypt owner_private.pem electrix-backup-YYYY-MM-DD.enc  backup.json
      Unlock a backup file (checks it is complete and undamaged).
  python3 backup_tool.py summary backup.json
      What is inside: number of records per kind, files, when it was taken.
  python3 backup_tool.py files   backup.json  out_folder
      Write every uploaded file (photos, receipts…) back out as normal files.
  python3 backup_tool.py sql     backup.json  restore.sql [check|missing|all]
      Make the SQL to paste into the Supabase SQL editor to restore (default: check = change nothing, just report).
"""
import base64, hashlib, json, os, sys
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def newkey(priv, pub):
    k = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    open(priv, 'wb').write(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    open(pub, 'wb').write(k.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    os.chmod(priv, 0o600); print('made', priv, '(keep offline) and', pub)

def decrypt(priv, src, dst):
    raw = open(src, 'rb').read(); nl = raw.index(b'\n'); hdr = json.loads(raw[:nl]); ct = base64.b64decode(raw[nl + 1:])
    if hdr.get('format') != 'electrix-backup-enc-1': sys.exit('not an Electrix backup file')
    key = serialization.load_pem_private_key(open(priv, 'rb').read(), password=None)
    aes = key.decrypt(base64.b64decode(hdr['key']), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    plain = AESGCM(aes).decrypt(base64.b64decode(hdr['iv']), ct, None)   # raises if the file was changed in any way
    if hashlib.sha256(plain).hexdigest() != hdr['sha256_plain']: sys.exit('backup is damaged (checksum mismatch)')
    data = json.loads(plain)
    recs = data.get('records') or []
    open(dst, 'wb').write(plain); print('ok:', len(recs), 'records,', len(data.get('files') or []), 'files, taken', data['meta'].get('taken_at'))

def summary(src):
    d = json.load(open(src)); m = d['meta']; by = {}
    for r in d['records']: by[r['coll']] = by.get(r['coll'], 0) + 1
    print('taken:', m.get('taken_at'), '| records:', m.get('records'), '| files:', len(d.get('files') or []), '| file errors:', m.get('file_errors'))
    for k in sorted(by): print(f'  {k:14} {by[k]}')

def files(src, out):
    d = json.load(open(src)); n = 0
    for f in d.get('files') or []:
        if 'b64' not in f: print('  missing in backup:', f['name']); continue
        p = os.path.join(out, f['name']); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'wb').write(base64.b64decode(f['b64'])); n += 1
    print('wrote', n, 'files to', out)

def sql(src, dst, mode='check'):
    d = json.load(open(src)); d.pop('files', None)   # files go back with the files command / storage upload
    body = json.dumps(d, separators=(',', ':'))
    tag = 'electrix_' + hashlib.md5(body.encode()).hexdigest()[:8]
    assert ('$' + tag + '$') not in body
    open(dst, 'w').write(f"-- Electrix restore ({mode}) of backup taken {d['meta'].get('taken_at')}\nselect public.backup_restore(${tag}${body}${tag}$::jsonb, '{mode}');\n")
    print('wrote', dst, f'({len(body)//1024} KB). Paste it into the Supabase SQL editor of the project to restore into.')

if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    {'newkey': newkey, 'decrypt': decrypt, 'summary': summary, 'files': files, 'sql': sql}[a[0]](*a[1:])
