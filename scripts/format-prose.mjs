import fs from 'node:fs/promises';
import { marked } from '../vendor/marked/lib/marked.esm.js';

// Split only long prose paragraphs. Never summarize or rewrite their wording.
const segmenter = new Intl.Segmenter('ko', { granularity: 'sentence' });
for (const file of process.argv.slice(2)) {
  const source = await fs.readFile(file, 'utf8');
  let split = 0;
  const result = marked.lexer(source).map(token => {
    if (token.type !== 'paragraph' || token.raw.length < 240 || /^!\[/.test(token.raw)) return token.raw;
    const protectedText = [];
    const safe = token.raw.replace(/\$\$[\s\S]*?\$\$|(?<![\\$])\$(?!\$).*?(?<!\\)\$|(`+)[\s\S]*?\1|\[[^\]]+\]\([^)]+\)/gs,
      value => `⟪保護${protectedText.push(value)-1}⟫`);
    const sentences = [...segmenter.segment(safe)].map(item => item.segment.trim()).filter(Boolean);
    if (sentences.length < 4) return token.raw;
    const paragraphs = [];
    for (let i=0; i<sentences.length; i+=2) paragraphs.push(sentences.slice(i,i+2).join(' '));
    split++;
    return paragraphs.join('\n\n').replace(/⟪保護(\d+)⟫/g, (_, n) => protectedText[Number(n)]) + '\n';
  }).join('');
  if (source.replace(/\s+/g,' ').trim() !== result.replace(/\s+/g,' ').trim()) {
    throw new Error(`Refusing to change prose content: ${file}`);
  }
  await fs.writeFile(file, result);
  console.log(`${file}: split ${split} long paragraphs; all wording preserved`);
}
