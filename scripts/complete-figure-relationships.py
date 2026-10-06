"""Curate figure / original-package relationships from fetched exact archive pages."""
from pathlib import Path
import json,re,html
R=Path(__file__).resolve().parents[1]
def load(n):return json.loads((R/'lib'/n).read_text())
def save(n,data):(R/'lib'/n).write_text(json.dumps(data,indent=2)+'\n')
c=load('catalog.json');identities=load('catalog-identities.json');sources=load('accessory-sources.json');snap=load('accessory-snapshots.json')
def add(row):
 if not any(r['id']==row['id'] for r in c):c.append(row)
def images(s):return re.findall(r'<a\b[^>]+href="([^\"]+)"[^>]*>\s*<img[^>]+alt="([^\"]*)',s,re.S)
for n,id,name in [(7,'yojoe-pack-gung-ho-copperhead-2009','Gung-Ho vs. Copperhead (Walmart two-pack)'),(8,'yojoe-pack-sting-raider-2010','Sting Raider with Copperhead and Swamp-Viper')]:
 source=f'https://www.yojoe.com/action/{"09" if n==7 else "10"}/copperhead{n}.shtml';s=Path(f'/tmp/copperhead-audit/v{n}.html').read_text();package=re.search(r'<h[23][^>]*>\s*Packaging Information\s*</h[23]>(.*?)(?=<h[23]|$)',s,re.S|re.I);pic=next((url for url,label in images(package[1] if package else '') if 'Back' not in label),'');pic='https://www.yojoe.com'+pic if pic.startswith('/') else pic
 figure=f'yojoe-copperhead-v{n}-{2009 if n==7 else 2010}';year=2009 if n==7 else 2010
 add(dict(id=id,name=name,line='Rise of Cobra',year=year,url=source,image=pic,price=None,checked='2026-10-05',kind='Retail package',source='YoJoe',series='Rise of Cobra'))
 identities[id]={'entityType':'package','status':'partial','packageNote':'Exact archive association; full set contents and packaging variants still require verification.','related':[{'id':figure,'role':'Includes figure'}]};identities[figure]['related']=[x for x in identities[figure]['related'] if x['id']!=id]+[{'id':id,'role':'Originally included in'}]
# Ace is independently collectible; Skystriker remains an existing record.
s=Path('/tmp/ace83.html').read_text();plain=re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',s)))
assert '118-HAF-1983-ACE-01' in plain
url='https://www.yojoe.com/action/83/ace.shtml';id='yojoe-ace-v1-1983';image=re.search(r'<img[^>]+src="([^\"]+)"[^>]*alt=""',s)[1]
add(dict(id=id,name='Ace (v1)',line='Vintage ARAH',year=1983,url=url,image='https://www.yojoe.com'+image,price=None,checked='2026-10-05',kind='Figure',source='YoJoe',series='Vintage ARAH'))
identities[id]={'entityType':'figure','status':'verified','version':'YoJoe v1','scale':'3.75-inch','packageNote':'Originally included with the 1983 Skystriker; later mail-order offers also existed.','related':[{'id':'2142','role':'Originally included in'}],'sources':[{'url':url,'name':'YoJoe','sourceId':'118-HAF-1983-ACE-01','checked':'2026-10-05'}],'fields':{field:{'source':url,'checked':'2026-10-05','status':'verified'} for field in ['name','year','version','packageContents']}}
identities['2142']={'entityType':'package','status':'partial','packageNote':'Skystriker vehicle package originally included Ace. Record a vehicle without its driver as vehicle, not complete package.','related':[{'id':id,'role':'Includes figure'}]}
sources[id]={'url':url,'status':'partial'}
section=re.search(r'<h[23][^>]*>\s*Accessories\s*</h[23]>(.*?)(?=<h[23]|$)',s,re.I|re.S);labels=[]
if section:
 for alt in re.findall(r'alt="([^\"]+)"',section[1]):
  label=html.unescape(alt.split('<br')[0]).strip()
  if label and label not in labels:labels.append(label)
snap[id]={'source':url,'checked':'2026-10-05','status':'partial','note':'Figure gear from exact archive; mail-order and package paperwork vary.','pieces':[{'id':'main','label':'Figure','quantity':1,'owned':None}]+[{'id':'ace-'+str(i),'label':label,'quantity':1,'owned':None} for i,label in enumerate(labels)]}
cache=Path('/tmp/joe-accessory-cache');cache.mkdir(exist_ok=True);(cache/(re.sub('[^a-zA-Z0-9]','_',url)+'.html')).write_text(s)
for name,data in [('catalog.json',c),('catalog-identities.json',identities),('accessory-sources.json',sources),('accessory-snapshots.json',snap)]:save(name,data)
print('Standalone Ace and two Copperhead packages linked without altering existing collection records.')
