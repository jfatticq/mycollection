const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const exportsForTest={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/collection-photos.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsForTest});
const {collectionPhotos,withCollectionPhotos}=exportsForTest;
assert.equal(collectionPhotos({photo:'old',photos:['old','new']}).join(','),'old,new');
const record=withCollectionPhotos({photo:'old'},['new','old','new']);assert.equal(record.photo,'new');assert.equal(record.photos.length,2);assert.equal(withCollectionPhotos(record,[]).photo,'');
console.log('Reusable collection photo ordering, cover and removal checks passed.');
