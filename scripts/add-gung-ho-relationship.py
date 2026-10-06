from pathlib import Path
import json,re,html
root=Path(__file__).resolve().parents[1]
def read(n):return json.loads((root/'lib'/n).read_text())
def write(n,v):(root/'lib'/n).write_text(json.dumps(v,separators=(',',':'))+'\n')
s=Path('/tmp/gungho20.html').read_text();assert '118-HAF-2009-GUNGHO-20' in s
url='https://www.yojoe.com/action/09/gungho20.shtml';catalog=read('catalog.json');old=next((r for r in catalog if r['url']==url),None);id=old['id'] if old else 'yojoe-gung-ho-v20-2009';photo=re.search(r'<img[^>]+src="([^\"]+)"[^>]*alt=""',s)[1]
if not old:catalog.append({'id':id,'name':'Gung-Ho (v20)','line':'Rise of Cobra','year':2009,'url':url,'image':'https://www.yojoe.com'+photo,'price':None,'checked':'2026-10-05','kind':'Figure','source':'YoJoe','series':'Rise of Cobra'})
identities=read('catalog-identities.json');package='yojoe-pack-gung-ho-copperhead-2009';identities[id]={'entityType':'figure','status':'verified','version':'YoJoe v20','scale':'3.75-inch','related':[{'id':package,'role':'Originally included in'}],'sources':[{'url':url,'name':'YoJoe','sourceId':'118-HAF-2009-GUNGHO-20','checked':'2026-10-05'}],'fields':{k:{'source':url,'checked':'2026-10-05','status':'verified'} for k in ['name','year','version','packageContents']}}
if not any(x['id']==id for x in identities[package]['related']):identities[package]['related'].append({'id':id,'role':'Includes figure'})
source=read('accessory-sources.json');source[id]={'url':url,'status':'partial'};snap=read('accessory-snapshots.json');m=re.search(r'<h[23][^>]*>\s*Accessories\s*</h[23]>(.*?)(?=<h[23]|$)',s,re.S|re.I);labels=[]
for label in re.findall(r'alt="([^\"]+)"',m[1] if m else ''):
 label=html.unescape(label.split('<br')[0]).strip()
 if label and label not in labels:labels.append(label)
snap[id]={'source':url,'checked':'2026-10-05','status':'partial','note':'Exact figure gear; shared set decals, tattoo and paperwork require separate package review.','pieces':[{'id':'main','label':'Figure','quantity':1,'owned':None}]+[{'id':'gungho-'+str(i),'label':l,'quantity':1,'owned':None} for i,l in enumerate(labels)]}
for n,v in [('catalog.json',catalog),('catalog-identities.json',identities),('accessory-sources.json',source),('accessory-snapshots.json',snap)]:write(n,v)
(Path('/tmp/joe-accessory-cache')/(re.sub('[^a-zA-Z0-9]','_',url)+'.html')).write_text(s)
print('Two-pack partner linked:',id)
