"""B6b — search forgives small misspellings ("vilola rd" finds Viola Rd), never in numbers (255 Union does not find
254 Union). From the other session's search checks."""
import sys
p=sys.argv[1];s=open(p).read()
a="const words=srchN(raw).split(/\\s+/).filter(Boolean);const hit=(...xs)=>{const n=srchN(xs.filter(x=>x!=null&&x!=='').join(' '));return words.every(w=>n.includes(w));};"
assert s.count(a)==1
s=s.replace(a,"const words=srchN(raw).split(/\\s+/).filter(Boolean);const hit=(...xs)=>{const n=srchN(xs.filter(x=>x!=null&&x!=='').join(' '));let tk=null;"
  "return words.every(w=>{if(n.includes(w))return true;if(/\\d/.test(w)||w.length<4)return false;tk=tk||n.split(/[^a-z0-9]+/).filter(x=>x.length>=3);return tk.some(x=>lev(w,x)<=(w.length>=7?2:1));});};")
open(p,'w').write(s);print('ok')
