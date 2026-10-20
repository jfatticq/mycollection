const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const sqlite = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(file => file.endsWith('.sql')).sort()) {
  sqlite.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
}
let failWrite = false, batches = 0;
function database() {
  return {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return sqlite.prepare(sql).get(...args) ?? null; },
        execute() {
          if (failWrite && sql.startsWith('UPDATE taxonomy')) throw Error('Injected failure');
          return sqlite.prepare(sql).run(...args);
        },
      };
      return statement;
    },
    async batch(statements) {
      batches++;
      sqlite.exec('BEGIN');
      try { statements.forEach(statement => statement.execute()); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      return [];
    },
  };
}
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/catalog-faction-bootstrap.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject, crypto: require('node:crypto').webcrypto, TextEncoder, WeakMap });
const { ensureCatalogFactions, catalogFactionHierarchy, factionSetupKey } = exportsObject;
const insert = sqlite.prepare("INSERT INTO taxonomy(id,kind,name,parent_id) VALUES(?,'faction',?,?)");
insert.run('existing-joe', 'G.I. Joe', null);
insert.run('existing-cobra', 'Cobra', null);
insert.run('existing-dreadnoks', 'Dreadnoks', 'existing-cobra');
insert.run('existing-oktober', 'Oktober Guard', null);
insert.run('existing-ninja', 'Ninja Force', 'existing-joe');
insert.run('custom-team', 'Custom team', 'existing-cobra');
const row = name => sqlite.prepare("SELECT * FROM taxonomy WHERE kind='faction' AND name=? COLLATE NOCASE").get(name);
(async () => {
  const db = database();
  failWrite = true;
  await assert.rejects(ensureCatalogFactions(db), /Injected failure/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM taxonomy').get().n, 6);
  assert(!sqlite.prepare('SELECT * FROM settings WHERE id=?').get(factionSetupKey));
  failWrite = false;
  await Promise.all([ensureCatalogFactions(db), ensureCatalogFactions(db)]);
  assert.equal(batches, 3, 'Failed initialization retries; simultaneous requests share both setup phases');
  assert.equal(row('G.I. Joe').id, 'existing-joe');
  assert.equal(row('Dreadnoks').id, 'existing-dreadnoks');
  for (const [name, parent] of catalogFactionHierarchy) {
    const currentName = name === 'Ninja Force' ? 'Ninja Force (G.I. Joe)' : name;
    assert(row(currentName), currentName);
    assert.equal(row(currentName).parent_id, parent ? row(parent).id : null, currentName);
  }
  assert(!row('Ninja Force'));
  assert.equal(row('Ninja Force (G.I. Joe)').id, 'existing-ninja');
  assert.equal(row('Ninja Force (Cobra)').parent_id, 'existing-cobra');
  assert.equal(row('Custom team').parent_id, 'existing-cobra');
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM taxonomy').get().n, catalogFactionHierarchy.length + 2);
  const cobraChildren = sqlite.prepare(`WITH RECURSIVE tree(id) AS (
    SELECT id FROM taxonomy WHERE name='Cobra' UNION ALL
    SELECT t.id FROM taxonomy t JOIN tree p ON t.parent_id=p.id
  ) SELECT name FROM taxonomy WHERE id IN(SELECT id FROM tree)`).all().map(row => row.name);
  assert(cobraChildren.includes('Python Patrol'));
  assert(cobraChildren.includes('Ninja Force (Cobra)'));
  assert(!cobraChildren.includes('Ninja Force (G.I. Joe)'));
  assert(!cobraChildren.includes('Iron Grenadiers'));
  assert(!cobraChildren.includes('Dreadnoks'));
  sqlite.prepare("UPDATE taxonomy SET parent_id='existing-cobra' WHERE name='Tiger Force'").run();
  await ensureCatalogFactions(database());
  assert.equal(row('Tiger Force').parent_id, 'existing-cobra', 'Later admin edits survive a worker restart');
  assert.equal(batches, 3);
  const choiceExports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/faction-choices.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: choiceExports });
  const terms = sqlite.prepare('SELECT * FROM taxonomy').all();
  const joeNinjaId = row('Ninja Force (G.I. Joe)').id;
  const choices = choiceExports.factionChoices([...terms, ...terms, {id:joeNinjaId,kind:'faction',name:' Ninja Force (G.I. Joe) ',parent_id:'existing-joe'}]);
  assert.equal(choices.filter(choice => choice.name === 'Ninja Force (G.I. Joe)').length, 1);
  assert.equal(choices.find(choice => choice.name === 'Ninja Force (G.I. Joe)').label, 'Ninja Force (G.I. Joe)');
  assert.equal(choices.find(choice => choice.name === 'Ninja Force (Cobra)').label, 'Ninja Force (Cobra)');
  console.log('PASS faction setup: full hierarchy, existing IDs, unrelated terms, atomic rollback/retry, concurrent calls, and durable completion.');
})().catch(error => { console.error(error); process.exitCode = 1; });
