import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Keep import provenance, but measure the current author-edited Markdown.
export async function auditContent(root, catalog) {
  const target = path.join(root, 'scripts/export-content/audit.json');
  const previous = JSON.parse(await fs.readFile(target, 'utf8'));
  let changed = false;
  const chapters = [];
  for (const entry of catalog) {
    const source = await fs.readFile(path.join(root, entry.contentPath), 'utf8');
    const old = previous.chapters.find(chapter => chapter.id === entry.id) || {};
    const revisionSha256 = crypto.createHash('sha256').update(source).digest('hex');
    if ((old.revisionSha256 || old.localAuthorSha256) !== revisionSha256) changed = true;
    const prose = source.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '');
    chapters.push({
      ...old,
      id: entry.id,
      revisionSha256,
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
    ...previous,
    canonicalSource: 'Reviewed local Markdown; original import hashes retained as provenance.',
    lastEditedAt: changed ? new Date().toISOString() : previous.lastEditedAt || previous.exportedAt,
    chapterCount: chapters.length,
    figureCount: total('figures'),
    solutionCount: total('solutions'),
    mathExpressionCount: total('mathExpressions'),
    chapters,
  };
  await fs.writeFile(target, JSON.stringify(audit, null, 2) + '\n');
  return audit;
}
