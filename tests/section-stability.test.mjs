import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const contract = JSON.parse(await fs.readFile(new URL('tests/fixtures/section-titles.json', root), 'utf8'));
const catalog = JSON.parse(await fs.readFile(new URL('content/catalog.json', root), 'utf8'));

test('published H2 titles and order remain stable for all chapter bookmarks', async () => {
  assert.deepEqual(Object.keys(contract).sort(), catalog.map(c => c.id).sort());
  for (const { id } of catalog) {
    const source = await fs.readFile(new URL(`content/chapters/${id}.md`, root), 'utf8');
    const titles = [...source.matchAll(/^## (.+)$/gm)].map(m => m[1]);
    assert.deepEqual(titles, contract[id], `${id}: changing H2 order changes saved section addresses`);
  }
});
