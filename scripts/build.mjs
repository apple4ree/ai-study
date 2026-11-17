import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { marked } from '../vendor/marked/lib/marked.esm.js';
import katex from '../vendor/katex/dist/katex.mjs';
import { auditContent } from './audit-content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs');
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mathErrors = [];
let chapterId = '';
let mathCount = 0;
function math(tex, displayMode) {
  tex=tex.replaceAll('AIStudyMathPipe','\\|');
  mathCount++;
  try {
    const html = katex.renderToString(tex.trim(), {displayMode, throwOnError:true, trust:false, strict:'ignore', maxExpand:1000, macros:{'\\bm':'\\boldsymbol'}});
    return displayMode ? `<div class="math-display" tabindex="0" aria-label="수식">${html}</div>\n` : html;
  } catch (e) {
    mathErrors.push({chapterId,tex,error:e.message});
    return `<code class="math-error">${escape(tex)}</code>`;
  }
}
marked.use({gfm:true,breaks:false, extensions:[
  {name:'blockMath',level:'block',start:s=>s.indexOf('$$'),tokenizer(src){const m=/^\$\$([\s\S]+?)\$\$(?:[ \t]*\n|$)/.exec(src); if(m)return{type:'blockMath',raw:m[0],tex:m[1]};},renderer:t=>math(t.tex,true)},
  {name:'inlineMath',level:'inline',start:s=>s.indexOf('$'),tokenizer(src){const m=/^\$(?!\$)((?:\\.|[^\\$\n])+?)\$(?!\$)/.exec(src);if(m)return{type:'inlineMath',raw:m[0],tex:m[1]};},renderer:t=>math(t.tex,false)},
  {name:'solution',level:'block',start:s=>s.indexOf('<details>'),tokenizer(src){const m=/^<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>\s*/.exec(src);if(m)return{type:'solution',raw:m[0],title:m[1],body:m[2]};},renderer:t=>`<details class="solution"><summary>${escape(t.title)}</summary><div class="solution-body">${marked.parse(t.body)}</div></details>\n`}
],renderer:{
  image({href,text}) { if(!/^\/figures\/[A-Z]\d{2}\.svg$/.test(href)) throw new Error(`Unexpected image ${href}`); return `<figure><img src=".${href}" alt="${escape(text)}" loading="lazy" decoding="async" tabindex="0" role="button" aria-label="그림 확대: ${escape(text)}"><figcaption>${escape(text)}</figcaption></figure>`; },
  link({href,tokens}) {const label=this.parser.parseInline(tokens); if(!/^(https?:\/\/|#\/)/.test(href))return label; return `<a href="${escape(href)}"${href.startsWith('http')?' target="_blank" rel="noopener noreferrer"':''}>${label}</a>`;},
  table(token) {let html='<thead><tr>'+token.header.map(c=>`<th>${this.parser.parseInline(c.tokens)}</th>`).join('')+'</tr></thead><tbody>';for(const row of token.rows)html+='<tr>'+row.map(c=>`<td>${this.parser.parseInline(c.tokens)}</td>`).join('')+'</tr>';return `<div class="table-scroll" tabindex="0" aria-label="가로로 넘겨 보는 표"><table>${html}</tbody></table></div>`;},
  html({text}) {return text.replace(/<!--[\s\S]*?-->/g,'').replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi,(tag,name)=>/^(b|i|em|strong|sub|sup|br|code|kbd)$/.test(name.toLowerCase())?tag.replace(/\s+[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,''):escape(tag));}
}});

const catalog=JSON.parse(await fs.readFile(path.join(root,'content/catalog.json'),'utf8'));
const audit=await auditContent(root,catalog);
const chapters=[];
for(const entry of catalog){
  chapterId=entry.id;
  let md=await fs.readFile(path.join(root,entry.contentPath),'utf8');
  if(md.includes('AIStudyMathPipe'))throw new Error('Reserved math sentinel in source');
  // GFM removes the escape in \| before inline tokenization. Preserve the
  // original TeX norm symbol across table lexing, without changing code.
  md=md.replace(/(^`{3,}[^\n]*\n[\s\S]*?^`{3,}[ \t]*$|^~{3,}[^\n]*\n[\s\S]*?^~{3,}[ \t]*$|`[^`\n]*`)|(\$\$[\s\S]*?\$\$|\$(?:\\.|[^\\$\n])+?\$)/gm,(all,code,formula)=>code||formula.replaceAll('\\|','AIStudyMathPipe'));
  // A parent-page breadcrumb is navigation rather than textbook prose.
  md=md.replace(/^(?:\[[^\n]+\]\(#\/\)(?: · )?)+\n+/,'');
  const tokens=marked.lexer(md);
  const sections=[];let title='들어가며',body='';
  const flush=()=>{if(!body.trim())return;const html=marked.parse(body);const plain=body.replaceAll('AIStudyMathPipe','\\|').replace(/<\/?(?:details|summary)>/g,' ').replace(/!?(\[([^\]]+)\])\([^)]+\)/g,'$2').replace(/[#*`$>]/g,'').replace(/\s+/g,' ').trim();sections.push({id:`s${sections.length}`,title,html,plain,minutes:Math.max(1,Math.ceil(plain.length/500))});};
  for(const token of tokens){if(token.type==='heading'&&token.depth===2){flush();title=token.text;body='';}else body+=token.raw;}
  flush();
  chapters.push({id:entry.id,title:entry.title,group:entry.group,figureIds:entry.figureIds,sections});
}
if(mathErrors.length){await fs.writeFile(path.join(root,'work-math-errors.json'),JSON.stringify(mathErrors,null,2));throw new Error(`${mathErrors.length} math errors. See work-math-errors.json`);}
await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
await fs.cp(path.join(root,'public'),out,{recursive:true});
await fs.cp(path.join(root,'src'),path.join(out,'src'),{recursive:true});
await fs.copyFile(path.join(root,'index.html'),path.join(out,'index.html'));
await fs.mkdir(path.join(out,'vendor/katex'),{recursive:true});
await fs.mkdir(path.join(out,'vendor/katex/fonts'),{recursive:true});
for(const font of await fs.readdir(path.join(root,'vendor/katex/dist/fonts'))){if(font.endsWith('.woff2'))await fs.copyFile(path.join(root,'vendor/katex/dist/fonts',font),path.join(out,'vendor/katex/fonts',font));}
const fontCss=(await fs.readFile(path.join(root,'vendor/katex/dist/katex.min.css'),'utf8')).replace(/,url\([^)]*\.(?:woff|ttf)\) format\("[^"]+"\)/g,'');
await fs.writeFile(path.join(out,'vendor/katex/katex.min.css'),fontCss);
await fs.copyFile(path.join(root,'vendor/katex/LICENSE'),path.join(out,'vendor/katex/LICENSE'));
await fs.copyFile(path.join(root,'vendor/marked/LICENSE.md'),path.join(out,'vendor/marked-LICENSE.md'));
const data={version:(audit.lastEditedAt || audit.exportedAt).slice(0,10),updatedAt:audit.lastEditedAt || audit.exportedAt,chapters};
await fs.writeFile(path.join(out,'data.json'),JSON.stringify(data));
for(const filename of ['interview-qa.json','interview-basic.json']) {
  const bank=JSON.parse(await fs.readFile(path.join(root,'content',filename),'utf8'));
  await fs.writeFile(path.join(out,filename),JSON.stringify(bank));
}
await fs.writeFile(path.join(out,'.nojekyll'),'');
async function walk(dir){const files=[];for(const d of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())files.push(...await walk(p));else files.push(p);}return files;}
const files=(await walk(out)).filter(f=>!f.endsWith('/sw.js'));
const digest=crypto.createHash('sha256');for(const f of files.sort())digest.update(await fs.readFile(f));
const cacheVersion=digest.digest('hex').slice(0,14);
const urls=files.map(f=>'./'+path.relative(out,f).replaceAll(path.sep,'/'));
await fs.writeFile(path.join(out,'sw.js'),`// Generated from the complete, verified static build.\nconst CACHE='ai-study-${cacheVersion}';\nconst FILES=${JSON.stringify(urls)};\nself.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting())));\nself.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ai-study-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));\nself.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(caches.open(CACHE).then(async c=>{const hit=await c.match(e.request,{ignoreSearch:true});if(hit)return hit;try{return await fetch(e.request);}catch(err){if(e.request.mode==='navigate')return c.match('./index.html');throw err;}}));});\n`);
console.log(JSON.stringify({chapters:chapters.length,sections:chapters.reduce((s,c)=>s+c.sections.length,0),figures:chapters.reduce((s,c)=>s+c.figureIds.length,0),solutions:chapters.reduce((s,c)=>s+c.sections.reduce((n,x)=>n+(x.html.match(/class="solution"/g)||[]).length,0),0),math:mathCount,cacheVersion},null,2));
