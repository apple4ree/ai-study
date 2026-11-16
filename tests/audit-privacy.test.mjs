import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditContent } from '../scripts/audit-content.mjs';

test('public content audit cannot inherit import provenance or build fingerprints', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'study-audit-'));
  try {
    await fs.mkdir(path.join(root, 'content'), { recursive: true });
    await fs.mkdir(path.join(root, 'scripts/export-content'), { recursive: true });
    await fs.writeFile(path.join(root, 'content/sample.md'), '## Example\n\n$x^2$\n');
    await fs.writeFile(path.join(root, 'scripts/export-content/audit.json'), JSON.stringify({
      exportedAt: 'private-import-time', privateSource: 'import-provenance-sentinel',
      chapters: [{ id: 'T01', source: 'import-provenance-sentinel', rawSha256: 'old-import-hash' }],
    }));
    const catalog = [{ id: 'T01', contentPath: 'content/sample.md' }];
    const first = await auditContent(root, catalog);
    const repeated = await auditContent(root, catalog);
    assert.equal(first.lastEditedAt, repeated.lastEditedAt);
    const raw = await fs.readFile(path.join(root, 'scripts/export-content/audit.json'), 'utf8');
    const audit = JSON.parse(raw);
    assert.deepEqual(Object.keys(audit).sort(), ['schemaVersion', 'chapterCount', 'figureCount', 'solutionCount', 'mathExpressionCount', 'chapters'].sort());
    assert.deepEqual(Object.keys(audit.chapters[0]).sort(), ['id', 'sourceCharacters', 'mathExpressions', 'codeBlocks', 'tables', 'figures', 'solutions'].sort());
    assert.equal(audit.mathExpressionCount, 1);
    assert.ok(!raw.includes('import-provenance-sentinel'));
    assert.ok(!raw.includes('Sha256') && !raw.includes('EditedAt') && !raw.includes('exportedAt'));
    const state = JSON.parse(await fs.readFile(path.join(root, 'work/source-build-state.json'), 'utf8'));
    assert.match(state.chapters.T01, /^[a-f0-9]{64}$/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
