import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve('docs');
test('the offline install lists every deploy asset and each listed URL exists',async()=>{
  const sw=await fs.readFile(path.join(root,'sw.js'),'utf8');
  const urls=JSON.parse(sw.match(/const FILES=(\[[^\n]+\]);/)[1]);
  assert(urls.includes('./index.html'));
  assert(urls.includes('./data.json'));
  for(const url of urls){assert(url.startsWith('./'));await fs.access(path.join(root,url));}
  async function walk(p){const arr=[];for(const e of await fs.readdir(p,{withFileTypes:true})){const f=path.join(p,e.name);if(e.isDirectory())arr.push(...await walk(f));else arr.push('./'+path.relative(root,f));}return arr;}
  assert.deepEqual(new Set(urls),new Set((await walk(root)).filter(s=>s!=='./sw.js')));
});
test('styles, scripts, icons, manifest and math fonts work below the GitHub project path',async()=>{
  const html=await fs.readFile(path.join(root,'index.html'),'utf8');
  for(const [,url]of html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g))await fs.access(path.join(root,url));
  assert.match(html,/manifest.webmanifest/);
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
  for(const icon of manifest.icons)await fs.access(path.join(root,icon.src));
  const css=await fs.readFile(path.join(root,'vendor/katex/katex.min.css'),'utf8');
  for(const [,url]of css.matchAll(/url\(([^)]+)\)/g))await fs.access(path.join(root,'vendor/katex',url));
  const data=JSON.parse(await fs.readFile(path.join(root,'data.json'),'utf8'));
  for(const chapter of data.chapters)for(const section of chapter.sections)for(const [,url]of section.html.matchAll(/<img[^>]+src="([^"]+)"/g)){assert(url.startsWith('./figures/'));await fs.access(path.join(root,url));}
});
