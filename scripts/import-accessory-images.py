"""Capture image metadata from exact-release pages; image binaries stay at their source."""
import json,re,html,hashlib
from pathlib import Path
from urllib.parse import urljoin,urlparse
root=Path(__file__).resolve().parents[1];catalog=json.loads((root/'lib/catalog.json').read_text());aliases=json.loads((root/'lib/release-aliases.json').read_text());snap=json.loads((root/'lib/accessory-snapshots.json').read_text());sources=json.loads((root/'lib/accessory-sources.json').read_text());out=json.loads((root/'lib/accessory-images.json').read_text())
def clean(s):return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]*>',' ',s))).strip()
def key(url):
 n=2166136261
 for b in url.encode():n=((n^b)*16777619)&0xffffffff
 return format(n,'08x')
def read(h,url):
 result=[];seen=set()
 for u,body in re.findall(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',h,re.I|re.S):
  tag=re.search(r"<img\b(?:[^>\"']|\"[^\"]*\"|'[^']*')*>",body,re.I)
  m=re.search(r"src=[\"']([^\"']+)[\"']",tag[0],re.I) if tag else None
  if not m:continue
  full=urljoin(url,html.unescape(u));thumb=urljoin(url,html.unescape(m[1]))
  if full in seen or not all(urlparse(x).hostname=='www.yojoe.com' and re.search(r'\.(?:jpg|jpeg|png|gif|webp)(?:\?|$)',x,re.I) for x in (full,thumb)):continue
  seen.add(full);alt=re.search(r'alt="([^"]*)"',tag[0],re.I);alt=alt[1] if alt else '';p=re.search(r'<p[^>]*>(.*?)</p>',body,re.I|re.S);caption=clean(p[1] if p else re.split('<br',alt,flags=re.I)[0]) or 'Accessory';credit=re.search(r'Contributed by:\s*([^<]*)',alt,re.I)
  result.append({'key':key(full),'caption':caption,'full':full,'thumbnail':thumb,'credit':'Photo: '+clean(credit[1]) if credit else 'YoJoe reference photo'})
 return result
for r in catalog:
 if r['id'] in aliases:continue
 u=sources.get(r['id'],{}).get('url') or snap.get(r['id'],{}).get('source') or r.get('accessoryUrl') or (r['url'] if r.get('source')=='YoJoe' else None)
 if not u or urlparse(u).hostname!='www.yojoe.com':continue
 p=Path('/tmp/joe-accessory-cache')/(re.sub('[^a-zA-Z0-9]','_',u)+'.html')
 if not p.exists():continue
 h=p.read_text(errors='replace')
 def section(heading):
  m=re.search(r'<h[23][^>]*>\s*'+heading+r'\s*</h[23]>(.*?)(?=<h[23]|$)',h,re.I|re.S);return m[1] if m else ''
 main=read(section('Images'),u);gear=read(section('Accessories'),u)
 if not gear and r['kind']=='Vehicle / playset':gear=[p for p in main if re.search(r'\b(?:parts|missiles?|bombs?|canopy|antenna|landing gear|wheels?|cannons?|guns?|ramp|panels?|doors?|engine|rotors?|propellers?|hoses?|seats?|launchers?|fuel tanks?|wings?)\b',p['caption'],re.I)]
 gear=list(gear)
 data={'source':u,'images':gear}
 if main:data['reference']=next((p['full'] for p in main if p['caption'].lower()=='front'),main[0]['full'])
 if gear or main:out[r['id']]=data
(root/'lib/accessory-images.json').write_text(json.dumps(out,separators=(',',':'))+'\n');print('Photo galleries:',sum(bool(v['images']) for v in out.values()),'Accessory photos:',sum(len(v['images']) for v in out.values()),'Release reference originals:',sum(bool(v.get('reference')) for v in out.values()))
