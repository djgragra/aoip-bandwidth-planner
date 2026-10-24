const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SOURCES = { en: 'dev/manual/manual.en.md', it: 'dev/manual/manual.it.md', es: 'dev/manual/manual.es.md' };
const count = (lang, re) => (read(SOURCES[lang]).match(re) || []).length;

test('the manual has the same chapters and the same structure in English, Italian and Spanish', () => {
  const chapters = count('en', /^## /gm);
  assert.ok(chapters >= 5);
  for (const lang of ['it', 'es']) {
    assert.equal(count(lang, /^## /gm), chapters, `${lang} chapters`);
    assert.equal(count(lang, /^### /gm), count('en', /^### /gm), `${lang} sections`);
    assert.equal(count(lang, /^\|---/gm), count('en', /^\|---/gm), `${lang} tables`);
  }
});

test('build.py makes the three PDFs with the standard names and the Release workflow attaches them', () => {
  const build = read('dev/manual/build.py');
  assert.match(build, /NAME = "AoIP-Bandwidth-Planner"/);
  assert.match(build, /\{NAME\}-Manual-\{lang\.upper\(\)\}-\{VER\}/);
  for (const f of Object.values(SOURCES)) assert.ok(fs.existsSync(path.join(__dirname, '..', f)), f);
  const wf = read('.github/workflows/release.yml');
  assert.match(wf, /dev\/manual\/build\.py/);
  assert.match(wf, /files: manuals\/\*\.pdf/);
});
