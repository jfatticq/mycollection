"""Refresh exact-release inventories; ambiguous mappings remain unverified.
Usage: python scripts/import-accessories.py --cache /tmp/joe-accessory-cache
No fuzzy-name or cross-year matching; reviewed exceptions live in accessory-sources.json.
"""
import argparse, concurrent.futures, hashlib, html, json, re, subprocess
from pathlib import Path
from datetime import date
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
def text(s):return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',s))).strip()
def pieces_from(h):
 m=re.search(r'<h[23][^>]*>\s*Accessories\s*</h[23]>(.*?)(?=<h[23]|$)',h,re.I|re.S)
 if not m:
  # Vehicle pages expose an included driver and component-image captions.
  out=[]
  driver=re.search(r'<h2[^>]*>\s*<b>Driver/Pilot:\s*(.*?)</b>\s*</h2>',h,re.I|re.S)
  if driver:
   names=text(driver[1]);multiple=bool(re.search(r' / | & | AND ',names,re.I));out.append({'id':'driver','label':('Included figures / packing variants: ' if multiple else 'Included figure: ')+names,'quantity':1,'quantityConfirmed':not multiple,'owned':None})
  images=re.search(r'<h2[^>]*>\s*Images\s*</h2>(.*?)(?=<h2)',h,re.I|re.S)
  if images:
   seen=set()
   for caption in re.findall(r'<p[^>]*>(.*?)</p>',images[1],re.I|re.S):
    label=text(caption)
    if len(label)>70 or not re.search(r'\b(?:missiles?|bombs?|canopy|antenna|landing gear|wheels?|tires?|cannons?|guns?|ramp|panels?|doors?|engine covers?|rotors?|propellers?|hoses?|seats?|steering wheel|roll bar|launchers?|fuel tanks?|stabilizers?|wings?)\b',label,re.I):continue
    key=re.sub(r'\b(missile|bomb|panel|launcher|cannon|wheel|wing|door|rotor|propeller)s\b',r'\1',label.lower())
    if key in seen:continue
    seen.add(key);out.append({'id':'component-'+hashlib.sha256(label.lower().encode()).hexdigest()[:12],'label':label,'quantity':1,'quantityConfirmed':False,'owned':None})
  return out
 # Only the introductory contents sentence, never captions, construction or variants.
 paras=re.findall(r'<p[^>]*>(.*?)</p>',m[1],re.I|re.S)
 intro=next((text(p) for p in paras if re.search(r'came (?:with|equipped with)|included|includes',text(p),re.I)), '')
 clause=re.sub(r'^.*?(?:came (?:with|equipped with)|includes?|included)\s*:?\s*','',intro,flags=re.I)
 clause=re.split(r'\.\s+(?=[A-Z])',clause)[0].rstrip('.')
 clause=re.sub(r'^the following (?:weapons|accessories|equipment)\s*:\s*','',clause,flags=re.I)
 if not clause or len(clause)>1500:return []
 # Commas are safe boundaries. Split conjunctions only before a new counted noun.
 chunks=re.split(r',\s*(?:and\s+)?|\s+and\s+(?=(?:a|an|one|two|three|four|five|six|\d+)\s)',clause)
 nums={'a':1,'an':1,'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,'nine':9,'ten':10}
 out=[]
 for raw in chunks:
  match=re.match(r'^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(.+)',raw.strip(),re.I)
  label=match[2] if match else raw.strip();quantity=nums.get(match[1].lower(),int(match[1]) if match[1].isdigit() else 1) if match else 1
  if match and re.match(r'^(?:part|piece)\s+',label,re.I):
   label=match[1]+'-'+label;quantity=1
  if len(label)<2 or len(label)>200:continue
  removable=re.match(r'^(.*?)\s+with (?:a |an )?removable (.+)$',label,re.I)
  if removable:
   out.append({'id':'gear-'+hashlib.sha256(removable[1].lower().encode()).hexdigest()[:12],'label':removable[1],'quantity':quantity,'owned':None})
   label='Removable '+removable[2]+' for '+removable[1]
  out.append({'id':'gear-'+hashlib.sha256(label.lower().encode()).hexdigest()[:12],'label':label,'quantity':quantity,'owned':None})
 return out

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--cache',default='/tmp/joe-accessory-cache');ap.add_argument('--limit',type=int);ap.add_argument('--offline',action='store_true');ap.add_argument('--refresh-cache',action='store_true');ap.add_argument('--explicit-only',action='store_true');args=ap.parse_args();cache=Path(args.cache);cache.mkdir(parents=True,exist_ok=True)
 catalog=json.loads((ROOT/'lib/catalog.json').read_text());aliases=json.loads((ROOT/'lib/release-aliases.json').read_text());snap=json.loads((ROOT/'lib/accessory-snapshots.json').read_text());sources=json.loads((ROOT/'lib/accessory-sources.json').read_text())
 tasks=[]
 for r in catalog:
  if r['id'] in aliases:continue
  explicit=sources.get(r['id']);url=explicit['url'] if explicit else r.get('accessoryUrl') or (r['url'] if any(d in r['url'] for d in ('yojoe.com','3djoes.com')) else None)
  if args.explicit_only and not explicit:continue
  cached=(cache/(re.sub('[^a-zA-Z0-9]','_',url or '')+'.html')).exists()
  if not url or r['id'] in snap and not explicit and not (args.refresh_cache and cached):continue
  if urlparse(url).hostname not in ('www.yojoe.com','www.3djoes.com'):continue
  tasks.append((r,url,explicit))
 if args.limit:tasks=tasks[:args.limit]
 def get(task):
  r,url,explicit=task;path=cache/(re.sub('[^a-zA-Z0-9]','_',url)+'.html')
  if not path.exists():
   old=Path('/tmp/joe-expansion-cache')/path.name
   roc=Path('/tmp')/('roc-'+url.split('/')[-1].replace('.shtml','')+'.html')
   if old.exists():path.write_bytes(old.read_bytes())
   elif '/action/09/' in url and roc.exists():path.write_bytes(roc.read_bytes())
   elif not args.offline:
    proc=subprocess.run(['curl','-fLs','--retry','1','--max-time','18',url],capture_output=True)
    if proc.returncode==0 and len(proc.stdout)>1000:path.write_bytes(proc.stdout)
  if not path.exists():return r['id'],None,'unavailable'
  h=path.read_text(errors='replace');ps=explicit.get('inventory') if explicit and explicit.get('inventory') else pieces_from(h)
  if not ps:return r['id'],None,'no structured accessory inventory'
  return r['id'],{'pieces':ps,'source':url,'checked':date.today().isoformat(),'status':explicit.get('status','partial') if explicit else 'partial','matchNote':explicit.get('note','') if explicit else 'Exact archive URL connected to this release.','note':explicit.get('inventoryNote','Sourced accessory inventory; packaging paperwork and vehicle subassemblies may be incomplete.') if explicit else ('Vehicle components from source captions; counts and removability require review. Check included figures against packing variants.' if r['kind']=='Vehicle / playset' else 'Sourced accessory inventory; packaging paperwork and vehicle subassemblies may be incomplete.')},None
 failures={};added=0
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
  for i,(id,entry,error) in enumerate(ex.map(get,tasks),1):
   if entry:snap[id]=entry;added+=1
   else:failures[id]=error
   if i%40==0:
    (ROOT/'lib/accessory-snapshots.json').write_text(json.dumps(snap,indent=2)+'\n');print(f'{i}/{len(tasks)} checked, {added} inventories imported',flush=True)
 (ROOT/'lib/accessory-snapshots.json').write_text(json.dumps(snap,indent=2)+'\n')
 (ROOT/'lib/accessory-import-report.json').write_text(json.dumps({'checked':date.today().isoformat(),'attempted':len(tasks),'imported':added,'unresolved':failures},indent=2)+'\n')
 print(f'Finished: {added} imported; {len(failures)} unresolved',flush=True)
if __name__=='__main__':main()
