import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {validateInterviewBank,filterInterview,renderInterviewCards} from '../src/interview.js';

const banks=await Promise.all(['interview-basic','interview-qa'].map(async n=>JSON.parse(await fs.readFile(`content/${n}.json`,'utf8'))));

test('all 200 answers include independent concept explanations, defined terms and developed follow-ups',()=>{
  for(const bank of banks){
    validateInterviewBank(bank);
    assert.equal(bank.answerFormat,'concept-explanation-v1');
    for(const q of bank.questions){
      const e=q.explanation;
      assert(e.introduction.length>=70,`${q.id}: introductory reasoning`);
      assert(e.example.length>=70,`${q.id}: concrete example`);
      assert(e.terms.every(t=>t.term.trim()&&t.definition.trim()),q.id);
      assert.equal(new Set(e.terms.map(t=>t.term)).size,e.terms.length,q.id);
      assert(q.followUp.answer.split('\n\n').length>=2,q.id);
      if(bank.kind!=='basic')assert(q.scenario&&q.question!==q.scenario,q.id);
    }
  }
  const invalid=structuredClone(banks[0]);delete invalid.questions[4].explanation.example;
  assert.throws(()=>validateInterviewBank(invalid));
});

test('search finds explanatory terminology and preserved applied scenarios',()=>{
  const [basic,advanced]=banks;
  assert.deepEqual(filterInterview(basic,{query:'B079 고유벡터'}).map(q=>q.id),['B079']);
  assert.deepEqual(filterInterview(basic,{query:'B071 베르누이'}).map(q=>q.id),['B071']);
  assert.deepEqual(filterInterview(advanced,{query:'Q001 두 배'}).map(q=>q.id),['Q001']);
  assert.deepEqual(filterInterview(advanced,{query:'Q095 펜싱'}).map(q=>q.id),['Q095']);
});

test('structured paragraphs, terms, tables, code and references remain accessible and safely escaped',()=>{
  const bank=structuredClone(banks[0]);
  const q=bank.questions.find(q=>q.id==='B100');
  q.explanation.introduction='<img src=x onerror=alert(1)>';
  q.explanation.terms[0].definition='<script>alert(1)</script>';
  q.explanation.table.rows[0][0]='<svg onload=alert(1)>';
  q.explanation.code.body='<script>alert(1)</script>';
  q.explanation.references.push({title:'unsafe',url:'javascript:alert(1)'});
  const html=renderInterviewCards(bank,{query:'B100'});
  assert.match(html,/<dl class="qa-terms">/);
  assert.match(html,/<th scope="col">/);
  assert.match(html,/<th scope="row">/);
  assert.match(html,/tabindex="0" role="region"/);
  assert.match(html,/<pre tabindex="0"><code>/);
  assert.match(html,/참고자료/);
  assert(!/<(?:script|img|svg)\b/.test(html));
  assert(!html.includes('javascript:'));
  assert(!/<details[^>]*\bopen\b/.test(html));
  assert.throws(()=>validateInterviewBank(bank));
});

test('interview changes preserve the complete existing textbook blob',async()=>{
  const bytes=await fs.readFile('docs/data.json');
  const sha=crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(sha,'775a320f1971326f59d376c88b40e7f421853f33');
});
