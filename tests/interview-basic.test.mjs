import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { validateInterviewBank,filterInterview,renderInterviewPage,renderInterviewCards } from '../src/interview.js';

const bank=JSON.parse(await fs.readFile(new URL('../content/interview-basic.json',import.meta.url),'utf8'));
const advanced=JSON.parse(await fs.readFile(new URL('../content/interview-qa.json',import.meta.url),'utf8'));

test('basic bank has 100 distinct answered questions: 60 CS, 20 ML and 20 DL',async()=>{
  assert.equal(validateInterviewBank(bank),bank);
  assert.deepEqual(bank.questions.map(q=>q.id),Array.from({length:100},(_,i)=>`B${String(i+1).padStart(3,'0')}`));
  assert.equal(new Set(bank.questions.map(q=>q.question)).size,100);
  assert.equal(bank.questions.filter(q=>q.topic.startsWith('C')).length,60);
  assert.equal(filterInterview(bank,{topic:'L02'}).length,20);
  assert.equal(filterInterview(bank,{topic:'L04'}).length,20);
  assert.equal(filterInterview(bank,{focus:true}).length,32);
  assert(bank.questions.every(q=>q.level==='기초'&&q.answer.length===3&&q.followUp.question&&q.followUp.answer&&q.pitfall));
  assert.deepEqual(JSON.parse(await fs.readFile(new URL('../docs/interview-basic.json',import.meta.url),'utf8')),bank);
  const textbook=JSON.parse(await fs.readFile(new URL('../docs/data.json',import.meta.url),'utf8'));
  for(const topic of bank.topics)assert(textbook.chapters.find(c=>c.id===topic.chapterId)?.sections.some(s=>s.id===topic.sectionId));
});

test('basic search and links stay separate from the existing advanced question bank',()=>{
  assert.deepEqual(filterInterview(bank,{query:'b100 eval no_grad'}).map(q=>q.id),['B100']);
  assert.equal(filterInterview(bank,{query:'Q001'}).length,0);
  assert.equal(filterInterview(advanced,{query:'B001'}).length,0);
  const page=renderInterviewPage(bank,{topic:'L04'});
  assert.match(page,/#\/interview\/basic\/L04/);
  assert.match(page,/20 \/ 100문항/);
  assert.match(page,/<option value="기초"/);
  assert(!page.includes('<option value="상"'));
  assert.match(renderInterviewCards(bank,{query:'B100'}),/#\/read\/L04\/s8/);
  const invalid=structuredClone(bank);invalid.questions[0].id='Q001';assert.throws(()=>validateInterviewBank(invalid));
});
