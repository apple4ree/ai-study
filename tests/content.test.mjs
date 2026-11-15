import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await fs.readFile(process.env.CONTENT_DATA || path.join(root, 'docs/data.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(root, 'content/catalog.json'), 'utf8'));
const audit = JSON.parse(await fs.readFile(path.join(root, 'scripts/export-content/audit.json'), 'utf8'));
const sources = new Map(await Promise.all(catalog.map(async entry => [entry.id, await fs.readFile(path.join(root, entry.contentPath), 'utf8')])));

function decode(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (_, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()];
  });
}

// Small HTML tree reader keeps nested KaTeX spans separate from visible prose.
// It does not render HTML or execute scripts, and needs no browser dependency.
function parseHtml(html) {
  const tree = { tag: 'root', attrs: {}, children: [] }, stack = [tree];
  for (const token of html.match(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+|</g) || []) {
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) {
      const tag = /^<\/([^\s>]+)/.exec(token)[1].toLowerCase();
      const index = stack.findLastIndex(node => node.tag === tag);
      if (index > 0) stack.length = index;
    } else if (/^<[a-zA-Z]/.test(token)) {
      const tag = /^<([^\s/>]+)/.exec(token)[1].toLowerCase(), attrs = {};
      for (const attr of token.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[attr[1]] = decode(attr[2] ?? attr[3]);
      const node = { tag, attrs, children: [] };
      stack.at(-1).children.push(node);
      if (!/\/$/.test(token.slice(0, -1)) && !/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag)) stack.push(node);
    } else stack.at(-1).children.push(decode(token));
  }
  return tree;
}

function find(node, predicate) {
  if (typeof node === 'string') return [];
  return [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => find(child, predicate))];
}
const hasClass = (node, name) => (node.attrs.class || '').split(/\s+/).includes(name);
const plain = node => typeof node === 'string' ? node : node.children.map(plain).join('');
const texNode = node => node.tag === 'annotation' && node.attrs.encoding === 'application/x-tex';
const trees = new Map(data.chapters.map(chapter => [chapter.id, chapter.sections.map(section => parseHtml(section.html))]));
const allNodes = (id, predicate) => trees.get(id).flatMap(tree => find(tree, predicate));
const allHtml = chapter => chapter.sections.map(section => section.html).join('\n');

function mathInSource(source) {
  source = source.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '');
  return [...source.matchAll(/\$\$([\s\S]*?)\$\$|(?<![\\$])\$(?!\$)(.*?)(?<!\\)\$/gs)].map(match => (match[1] ?? match[2]).trim());
}
function codeInSource(source) {
  return [...source.matchAll(/^```[^\n]*\n([\s\S]*?)^```[^\n]*$/gm)].map(match => match[1]);
}
const compact = text => text.replace(/\s+/g, ' ').trim();
const mathText = tex => `⟪${compact(tex)}⟫`;
function renderedText(node) {
  if (typeof node === 'string') return node;
  if (hasClass(node, 'katex')) {
    const annotation = find(node, texNode);
    assert.equal(annotation.length, 1);
    return mathText(plain(annotation[0]));
  }
  return node.children.map(renderedText).join('');
}
function markdownText(source) {
  const protectedText = [];
  const protect = text => `\u0000${protectedText.push(text) - 1}\u0000`;
  source = source.replace(/\$\$([\s\S]*?)\$\$|(?<![\\$])\$(?!\$)(.*?)(?<!\\)\$/gs, (_, a, b) => protect(mathText((a ?? b).trim())));
  source = source.replace(/`([^`]+)`/g, (_, code) => protect(code));
  source = source.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/<\/?(?:b|i|em|strong|code)>/g, '');
  source = source.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\\([\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e])/g, '$1');
  return decode(source).replace(/\u0000(\d+)\u0000/g, (_, index) => protectedText[Number(index)]);
}
function splitRow(row) {
  const cells = [], inner = row.trim().slice(1, -1);
  let cell = '';
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '|' && (i === 0 || inner[i - 1] !== '\\')) { cells.push(cell.trim()); cell = ''; }
    else cell += inner[i];
  }
  cells.push(cell.trim());
  return cells.map(cell => compact(markdownText(cell)));
}
function tablesInSource(source) {
  const lines = source.split('\n'), tables = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].startsWith('|') || !/^\|[\s:|\-]+\|$/.test(lines[i + 1])) continue;
    const rows = [splitRow(lines[i])]; i += 2;
    while (i < lines.length && lines[i].startsWith('|')) rows.push(splitRow(lines[i++]));
    tables.push(rows); i--;
  }
  return tables;
}

test('44 chapter records and every source chapter survive section splitting', () => {
  assert.equal(data.chapters.length, 44);
  assert.deepEqual(data.chapters.map(chapter => chapter.id), catalog.map(chapter => chapter.id));
  assert.equal(new Set(data.chapters.map(chapter => chapter.id)).size, 44);
  for (const chapter of data.chapters) {
    const source = sources.get(chapter.id);
    assert.ok(chapter.sections.length > 0, chapter.id);
    assert.ok(chapter.sections.every(section => section.html.trim()), chapter.id);
    assert.equal(new Set(chapter.sections.map(section => section.id)).size, chapter.sections.length, chapter.id);
    const headings = [...source.matchAll(/^## (.+)$/gm)].map(match => match[1]);
    assert.deepEqual(chapter.sections.filter(section => section.title !== '들어가며').map(section => section.title), headings, chapter.id);
    assert.ok(!allHtml(chapter).includes('math-error'), chapter.id);
  }
});

test('all TeX annotations preserve the exact current source, including table pipes and underscores', () => {
  let count = 0;
  for (const chapter of data.chapters) {
    const expected = mathInSource(sources.get(chapter.id));
    const actual = allNodes(chapter.id, texNode).map(plain);
    assert.deepEqual(actual, expected, `Math text changed in ${chapter.id}`);
    assert.equal(actual.length, audit.chapters.find(entry => entry.id === chapter.id).mathExpressions, chapter.id);
    count += actual.length;
  }
  assert.equal(count, audit.mathExpressionCount);
  assert.ok(count >= 2747, 'Original mathematical coverage must not shrink');
});

test('all fenced code blocks preserve code and whitespace exactly', () => {
  for (const chapter of data.chapters) {
    const expected = codeInSource(sources.get(chapter.id));
    const actual = allNodes(chapter.id, node => node.tag === 'pre').map(node => {
      const codes = find(node, child => child.tag === 'code');
      assert.equal(codes.length, 1, chapter.id);
      return plain(codes[0]);
    });
    assert.deepEqual(actual, expected, `Code changed in ${chapter.id}`);
    const inlineSource = sources.get(chapter.id).replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, '');
    const expectedInline = [...inlineSource.matchAll(/(?<!`)(`+)([\s\S]*?)\1(?!`)/g)].map(match => {
      const value = match[2].replace(/\r?\n/g, ' ');
      return value.startsWith(' ') && value.endsWith(' ') && /[^ ]/.test(value) ? value.slice(1, -1) : value;
    });
    const blockCodes = new Set(allNodes(chapter.id, node => node.tag === 'pre').flatMap(node => find(node, child => child.tag === 'code')));
    const actualInline = allNodes(chapter.id, node => node.tag === 'code').filter(node => !blockCodes.has(node)).map(plain);
    assert.deepEqual(actualInline, expectedInline, `Inline code changed in ${chapter.id}`);
  }
});

test('table headers, rows, cell text and math match the Markdown source', () => {
  for (const chapter of data.chapters) {
    const expected = tablesInSource(sources.get(chapter.id));
    const actual = allNodes(chapter.id, node => node.tag === 'table').map(table => find(table, node => node.tag === 'tr').map(row => row.children.filter(child => typeof child !== 'string' && ['th', 'td'].includes(child.tag)).map(cell => compact(renderedText(cell)))));
    assert.deepEqual(actual, expected, `Table content changed in ${chapter.id}`);
  }
});

test('all local figures and solved exercises remain accessible', async () => {
  let figures = 0, solutions = 0;
  for (const chapter of data.chapters) {
    const images = allNodes(chapter.id, node => node.tag === 'img');
    assert.equal(images.length, chapter.figureIds.length, chapter.id);
    for (const image of images) {
      assert.ok(image.attrs.alt, chapter.id);
      assert.equal(image.attrs.src, `./figures/${chapter.id}.svg`);
      await fs.access(path.join(root, 'public', image.attrs.src.slice(2)));
    }
    const details = allNodes(chapter.id, node => node.tag === 'details');
    assert.ok(details.length >= 3, `${chapter.id}: retain at least three solved exercises`);
    const expected = [...sources.get(chapter.id).matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)];
    assert.equal(details.length, expected.length, chapter.id);
    assert.equal(details.length, audit.chapters.find(entry => entry.id === chapter.id).solutions, chapter.id);
    for (let i = 0; i < details.length; i++) {
      assert.equal(find(details[i], node => node.tag === 'summary').length, 1, chapter.id);
      assert.equal(compact(plain(find(details[i], node => node.tag === 'summary')[0])), compact(decode(expected[i][1])), chapter.id);
      const body = find(details[i], node => hasClass(node, 'solution-body'));
      assert.equal(body.length, 1, chapter.id);
      assert.equal(compact(renderedText(body[0])), compact(markdownText(expected[i][2])), `Solution body changed in ${chapter.id} #${i + 1}`);
    }
    figures += images.length; solutions += details.length;
  }
  assert.equal(figures, audit.figureCount); assert.equal(solutions, audit.solutionCount);
  assert.ok(figures >= 37); assert.ok(solutions >= 132);
});

test('chapter links resolve and external references preserve their destinations', () => {
  const ids = new Set(catalog.map(chapter => chapter.id));
  for (const chapter of data.chapters) {
    const anchors = allNodes(chapter.id, node => node.tag === 'a');
    for (const anchor of anchors) if (anchor.attrs.href.startsWith('#/read/')) assert.ok(ids.has(anchor.attrs.href.slice(7)), `${chapter.id}: ${anchor.attrs.href}`);
    const expected = [...sources.get(chapter.id).matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map(match => match[1]);
    const actual = anchors.filter(anchor => /^https?:/.test(anchor.attrs.href)).map(anchor => anchor.attrs.href);
    assert.deepEqual(actual, expected, `External source changed in ${chapter.id}`);
  }
});

test('search text retains long prose phrases and never exposes math placeholders', () => {
  const missing = [];
  for (const chapter of data.chapters) {
    const searchable = compact(chapter.sections.map(section => `${section.title} ${section.plain}`).join(' '));
    assert.ok(!searchable.includes('AIStudyMathPipe'), `${chapter.id}: internal math placeholder exposed in search text`);
    // Independent prose samples contain no Markdown formatting delimiters.
    // Comparing them catches '< ... >' being mistaken for an HTML tag over
    // multiple paragraphs without mirroring the build's text extraction.
    const phrases = sources.get(chapter.id).match(/[가-힣][가-힣 ,.?!·\d()−+=:%/]{22,}/g) || [];
    for (const phrase of phrases) {
      const expected = compact(phrase);
      if (!searchable.includes(expected)) missing.push(`${chapter.id}: ${expected}`);
    }
  }
  assert.deepEqual(missing, [], 'Ordinary textbook prose disappeared from search text');
});
