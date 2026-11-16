import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { validateInterviewBank, filterInterview, renderInterviewCards, renderInterviewPage } from '../src/interview.js';

const bank = JSON.parse(await fs.readFile(new URL('../content/interview-qa.json',import.meta.url),'utf8'));

test('100 complete, unique interview Q&A records resolve to the existing six chapters',async()=>{
  assert.equal(validateInterviewBank(bank),bank);
  assert.deepEqual(bank.questions.map(q=>q.id),Array.from({length:100},(_,i)=>`Q${String(i+1).padStart(3,'0')}`));
  assert.equal(new Set(bank.questions.map(q=>q.question)).size,100);
  assert.equal(bank.questions.filter(q=>q.focus).length,36);
  assert.deepEqual(bank.topics.map(t=>t.count),[18,16,16,16,18,16]);
  const built=JSON.parse(await fs.readFile(new URL('../docs/data.json',import.meta.url),'utf8'));
  for(const topic of bank.topics){
    const chapter=built.chapters.find(c=>c.id===topic.chapterId);
    assert(chapter?.sections.some(s=>s.id===topic.sectionId&&s.title==='핵심 정리'));
    assert.equal(bank.questions.filter(q=>q.topic===topic.id&&q.focus).length,6);
  }
  assert.deepEqual(JSON.parse(await fs.readFile(new URL('../docs/interview-qa.json',import.meta.url),'utf8')),bank);
});

test('topic, level, focus and multi-term answer searches compose without losing IDs',()=>{
  assert.equal(filterInterview(bank).length,100);
  assert.equal(filterInterview(bank,{level:'상'}).length,62);
  assert.equal(filterInterview(bank,{level:'중상'}).length,38);
  assert.equal(filterInterview(bank,{focus:true}).length,36);
  const selected=filterInterview(bank,{topic:'C03',focus:true,query:'LRU 잠금'});
  assert.equal(selected.length,1);
  assert.equal(selected[0].id,'Q005');
  assert.deepEqual(filterInterview(bank,{query:'q100'}).map(q=>q.id),['Q100']);
  assert.equal(filterInterview(bank,{topic:'C08',query:'Q001'}).length,0);
  assert.equal(filterInterview(bank,{query:'존재하지않는검색조건'}).length,0);
});

test('Q&A view keeps answers hidden by default and escapes search and content markup',()=>{
  const html=renderInterviewCards(bank,{query:'Q001'});
  assert.equal((html.match(/class="qa-card"/g)||[]).length,1);
  assert(!/<details[^>]*\bopen\b/.test(html));
  assert.match(html,/A\. 답변 확인/);
  assert.match(html,/꼬리질문/);
  assert.match(html,/피할 답변/);
  assert.match(html,/#\/read\/C03\/s9/);
  assert.match(renderInterviewCards(bank,{query:'없음없는문항'}),/일치하는 문항이 없어요/);
  const unsafe=structuredClone(bank);unsafe.questions[0].question='<img src=x onerror=alert(1)>';
  assert(!renderInterviewCards(unsafe,{query:'Q001'}).includes('<img'));
  const page=renderInterviewPage(bank,{query:'" onfocus="alert(1)'});
  assert(page.includes('&quot; onfocus=&quot;'));
  assert(!page.includes('value="" onfocus="'));
});
