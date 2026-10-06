"""Capture exact Copperhead archive versions and provenance; never fuzzy-merge releases."""
from pathlib import Path
import json,re,subprocess,concurrent.futures,html,importlib.util
ROOT=Path(__file__).resolve().parents[1]
def read(n):return json.loads((ROOT/'lib'/n).read_text())
def write(n,v):(ROOT/'lib'/n).write_text((json.dumps(v,separators=(',',':')) if n in ['catalog.json','release-aliases.json'] else json.dumps(v,indent=2))+'\n')
catalog=read('catalog.json');snap=read('accessory-snapshots.json');sources=read('accessory-sources.json');photos=read('reference-photos.json');cache=Path('/tmp/copperhead-audit');cache.mkdir(exist_ok=True)
versions=[(1,1984,'Vintage ARAH'),(2,1989,'Vintage ARAH'),(3,2007,'Club / FSS'),(4,2008,'25th Anniversary'),(5,2009,'25th Anniversary'),(6,2009,'Club / FSS'),(7,2009,'Rise of Cobra'),(8,2010,'Rise of Cobra')]
def fetch(v):
 n,y,line=v;url=f'https://www.yojoe.com/action/{str(y)[2:]}/'+('pythoncopperhead.shtml' if n==2 else f'copperhead{n if n>1 else ""}.shtml');p=cache/f'v{n}.html'
 if not p.exists():
  r=subprocess.run(['curl','-fLs','--max-time','25','--retry','1',url],capture_output=True)
  if r.returncode==0:p.write_bytes(r.stdout)
 return v,url,p.read_text(errors='replace') if p.exists() else ''
profile={};audit=[]
for (n,y,line),url,s in concurrent.futures.ThreadPoolExecutor(max_workers=4).map(fetch,versions):
 text=re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',s)))
 if not re.search(r'COPPERHEAD\s*\(v'+str(n)+r'\)',text,re.I):raise Exception('Unable to verify Copperhead '+str(n))
 id=f'yojoe-copperhead-v{n}-{y}';name=('Python Copperhead' if n==2 else 'Copperhead')+f' (v{n})'
 img=re.search(r'<img[^>]+src="([^\"]+)"[^>]*alt=""',s)
 # Explicit exact-version image from archive, validated by actual page markup.
 image=f'https://www.yojoe.com/action/{str(y)[2:]}/images/copperhead{n if n>1 else ""}.jpg'
 if img:image='https://www.yojoe.com'+img[1] if img[1].startswith('/') else img[1]
 if not any(r['id']==id for r in catalog):catalog.append(dict(id=id,name=name,line=line,year=y,url=url,image=image,price=None,checked='2026-10-05',kind='Figure',source='YoJoe',series=line))
 intro=re.search(r'YoJoe ID:.*?Series:.*?\(\d{4}\)\s*(.*?)(?:\d+ For Sale|Images Contributed)',text,re.I)
 statement=intro[1].strip()[:900] if intro else ''
 archiveId=re.search(r'YoJoe ID:\s*([A-Z0-9-]+)',text,re.I)

 profile[id]={'entityType':'figure','version':f'YoJoe v{n}','scale':'3.75-inch','status':'verified','sources':[{'url':url,'name':'YoJoe','sourceId':archiveId[1] if archiveId else url,'checked':'2026-10-05'}],'packageNote':statement,'fields':{k:{'source':url,'checked':'2026-10-05','status':'verified'} for k in ['name','version','year','line','packageContents']},'related':[]}
 section=re.search(r'<h[23][^>]*>\s*Accessories\s*</h[23]>(.*?)(?=<h[23]|$)',s,re.I|re.S)
 gear=[]
 if section:
  # Image captions expose separately removable tripod / belt that prose groups together.
  for alt in re.findall(r'<img\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*>',section[1],re.I):
   m=re.search(r'alt=(["\'])(.*?)\1',alt,re.S)
   if not m:continue
   label=html.unescape(re.sub('<[^>]+>',' ',m[2].split('<br')[0])).strip()
   if label and label not in [p['label'] for p in gear]:gear.append({'id':'gear-'+re.sub('[^a-z0-9]+','-',label.lower()),'label':label,'quantity':1,'owned':None})
 if n==7:
  gear=[{'id':'gear-'+str(i),'label':label,'quantity':1,'owned':None} for i,label in enumerate(['Yellow shoulder holster','Black backpack','Black machine gun','Black tripod','Silver and copper ammunition belt','Black rifle','Silver and black knife','Black display stand'])]
 if gear or n==1:
  snap[id]={'source':url,'checked':'2026-10-05','status':'reviewed' if n==7 else 'partial','note':'Exact version archive. Figure accessories are separate from shared set decals, tattoo, and packaging paperwork.' if n==7 else 'Exact-version source; counts, paperwork and packing variations may need review.','pieces':[{'id':'main','label':'Figure','quantity':1,'owned':None}]+gear}
 sources[id]={'url':url,'status':snap.get(id,{}).get('status','partial')}
 # Existing image importer consumes the cached archive pages.
 target=Path('/tmp/joe-accessory-cache');target.mkdir(exist_ok=True);(target/(re.sub('[^a-zA-Z0-9]','_',url)+'.html')).write_text(s)
 audit.append({'id':id,'version':n,'year':y,'source':url})
profile['3434']={'entityType':'package','status':'partial','related':[{'id':'yojoe-copperhead-v4-2008','role':'Includes figure'}],'packageNote':'Comic two-pack with Shipwreck. Imported source year conflicts with YoJoe figure release year.','conflicts':[{'field':'year','values':[{'value':2007,'source':'https://www.actionfigure411.com/gijoe/25th-anniversary/comic-packs/copperhead-and-shipwreck-3434.php'},{'value':2008,'source':'https://www.yojoe.com/action/08/copperhead4.shtml'}]}]}
profile['3410']={'entityType':'package','status':'partial','related':[{'id':'yojoe-copperhead-v5-2009','role':'Includes figure'}],'packageNote':'Sting Raider vehicle package with Python Patrol Copperhead. Sources differ on release year.','conflicts':[{'field':'year','values':[{'value':2008,'source':'https://www.actionfigure411.com/gijoe/25th-anniversary/vehicles/sting-raider-copperhead-3410.php'},{'value':2009,'source':'https://www.yojoe.com/action/09/copperhead5.shtml'}]}]}
profile['2173']={'entityType':'package','status':'partial','related':[{'id':'yojoe-copperhead-v1-1984','role':'Includes figure'}]}
for id,p in list(profile.items()):
 for link in p.get('related',[]):profile[link['id']]['related'].append({'id':id,'role':'Originally included in'})
# Known standalone Python Patrol entry represents the same archive version. Preserve old IDs.
aliases=read('release-aliases.json');aliases['yojoe-copperhead-v2-1989']='9189';profile['9189']=profile.pop('yojoe-copperhead-v2-1989');snap['9189']=snap.pop('yojoe-copperhead-v2-1989',snap.get('9189'));sources['9189']=sources.pop('yojoe-copperhead-v2-1989');audit[1]['id']='9189'
write('catalog.json',catalog);write('release-aliases.json',aliases);write('accessory-snapshots.json',snap);write('accessory-sources.json',sources);write('catalog-identities.json',profile)
write('catalog-audits.json',[{'id':'copperhead-us-1984-2010','name':'Copperhead US 3.75-inch archive versions, 1984–2010','checked':'2026-10-05','source':'https://www.yojoe.com/action/09/copperhead7.shtml','status':'reconciled','expected':8,'releaseIds':[x['id'] for x in audit],'note':'All eight versions linked from the archive version index are represented. This does not certify international releases, paint variations, all package configurations, or later figures.'}])
print('Verified eight exact archive versions; package / figure relationships recorded.')
