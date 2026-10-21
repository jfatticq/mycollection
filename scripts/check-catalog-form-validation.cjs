const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const exportsObject={},frames=[];
class Details {constructor(parent){this.parentElement=parent;this.open=false;}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/catalog-form-validation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject,HTMLDetailsElement:Details,requestAnimationFrame:fn=>frames.push(fn)});
const {revealInvalidCatalogField}=exportsObject;
const outer=new Details(null),inner=new Details(outer);let tab,focused=false,reported=false;
const invalid={validity:{valid:false},parentElement:inner,closest:()=>({dataset:{editorPanel:'contents'}}),focus(){focused=true;assert(inner.open&&outer.open);assert.equal(tab,'contents');},reportValidity(){reported=true;}};
assert(revealInvalidCatalogField({elements:[{validity:{valid:true}},invalid]},value=>tab=value));
assert.equal(tab,'contents');assert.equal(focused,false);frames.shift()();assert(focused&&reported);
assert.equal(revealInvalidCatalogField({elements:[{validity:{valid:true}},{willValidate:false,validity:{valid:false}},{tagName:'FIELDSET'}]},()=>assert.fail()),false);
let nameFocused=false;
assert(revealInvalidCatalogField({elements:[{validity:{valid:false},parentElement:null,closest:()=>null,focus(){nameFocused=true;},reportValidity(){}}]},()=>assert.fail()));frames.shift()();assert(nameFocused);
console.log('PASS catalog validation: routes to hidden tabs, opens nested disclosures, defers focus, handles persistent name, permits valid drafts.');
