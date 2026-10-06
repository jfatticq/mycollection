const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function moduleAt(path,requireFn=require){const context={exports:{},require:requireFn,TextEncoder,URL};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);return context.exports;}
const {collectionPhotos,withCollectionPhotos}=moduleAt('lib/collection-photos.ts');
assert.equal(collectionPhotos({photo:'old'}).join(','),'old');assert.equal(collectionPhotos({photo:'old',photos:['old','new']}).join(','),'old,new');
let record=withCollectionPhotos({photo:'old',name:'Test'},['old','new','detail']);assert.equal(record.photo,'old');assert.equal(record.photos.length,3);
record=withCollectionPhotos(record,['detail','old','new']);assert.equal(record.photo,'detail');record=withCollectionPhotos(record,['old','new']);assert.equal(record.photo,'old');record=withCollectionPhotos(record,[]);assert.equal(record.photo,'');assert.equal(record.photos.length,0);
const {parseAccessoryImages,allowedAccessoryImage}=moduleAt('lib/accessory-images.ts',name=>name==='./catalog'?{canonicalId:id=>id,default:[]}:name==='./db'?{}:name.endsWith('.json')?{}:require(name));
const source='https://www.yojoe.com/action/07/cobraairtrooper.shtml';const gallery=parseAccessoryImages(fs.readFileSync('scripts/fixtures/air-trooper-images.html','utf8'),source);
assert.equal(gallery.images.length,8);assert.equal(gallery.images.filter(p=>p.caption==='Helmet').length,2);assert.equal(new Set(gallery.images.map(p=>p.key)).size,8);assert(gallery.images.every(p=>p.credit.includes('Phillip Donnelly')));assert(gallery.reference.endsWith('cobraairtrooperlarge.jpg'));
assert.equal(allowedAccessoryImage('https://evil.example/photo.jpg'),false);assert.equal(allowedAccessoryImage('http://www.yojoe.com/photo.jpg'),false);assert.equal(allowedAccessoryImage('https://www.yojoe.com/a.svg'),false);
const manifest=JSON.parse(fs.readFileSync('lib/accessory-images.json'));assert.equal(manifest['3308'].images[0].key,gallery.images[0].key);
console.log('Legacy/multiple photos, cover/removal, exact-release accessory extraction, credits and allowed hosts passed.');
