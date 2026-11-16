import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Public audit: only counts derived from public Markdown.
// Import provenance and build fingerprints stay in ignored work/.
export async function auditContent(root, catalog) {
  const target = path.join(root, 'scripts/export-content/audit.json');
  const statePath = path.join(root, 'work/source-build-state.json');
  let previous = {};
  try { previous = JSON.parse(await fs.readFile(statePath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const fingerprints = {};
  const chapters = [];
  for (const entry of catalog) {
    const source = await fs.readFile(path.join(root, entry.contentPath), 'utf8');
    fingerprints[entry.id] = crypto.createHash('sha256').update(source).digest('hex');
    const prose = source.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '');
    chapters.push({
      id: entry.id,
      sourceCharacters: source.length,
      mathExpressions: [...prose.matchAll(/\$\$([\s\S]*?)\$\$|(?<![\\$])\$(?!\$)(.*?)(?<!\\)\$/gs)].length,
      codeBlocks: [...source.matchAll(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm)].length,
      tables: [...source.matchAll(/^\|[\s:|\-]+\|[ \t]*$/gm)].length,
      figures: [...source.matchAll(/!\[[^\]]*\]\(\/figures\/[A-Z]\d{2}\.svg\)/g)].length,
      solutions: [...source.matchAll(/<details>\s*<summary>[\s\S]*?<\/summary>[\s\S]*?<\/details>/g)].length,
    });
  }
  const total = field => chapters.reduce((sum, chapter) => sum + chapter[field], 0);
  const audit = {
    schemaVersion: 1,
    chapterCount: chapters.length,
    figureCount: total('figures'),
    solutionCount: total('solutions'),
    mathExpressionCount: total('mathExpressions'),
    chapters,
  };
  const unchanged = JSON.stringify(fingerprints) === JSON.stringify(previous.chapters);
  const lastEditedAt = unchanged && previous.lastEditedAt ? previous.lastEditedAt : new Date().toISOString();
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify({ chapters: fingerprints, lastEditedAt }, null, 2) + '\n');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(audit, null, 2) + '\n');
  // Build timestamp returned in memory; never merged into the public audit.
  return { ...audit, lastEditedAt };
}
