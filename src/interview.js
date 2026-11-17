const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase();
const safeUrl = url => { try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch { return false; } };
const paragraph = value => `<p>${escape(value)}</p>`;

function renderExplanation(q) {
  const e=q.explanation;
  if (!e) return q.answer.map(paragraph).join('');
  const table=e.table?`<section class="qa-explanation-section"><h3>비교해서 이해하기</h3><div class="qa-table-scroll" tabindex="0" role="region" aria-label="${escape(q.id)} 비교 표"><table><thead><tr>${e.table.headers.map(h=>`<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${e.table.rows.map(row=>`<tr>${row.map((c,i)=>i===0?`<th scope="row">${escape(c)}</th>`:`<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`:'';
  const code=e.code?`<section class="qa-explanation-section"><h3>코드 예시 <span class="qa-code-language">${escape(e.code.language)}</span></h3><pre tabindex="0"><code>${escape(e.code.body)}</code></pre></section>`:'';
  return `<div class="qa-explanation"><section class="qa-explanation-section"><h3>개념과 핵심 용어</h3>${paragraph(e.introduction)}<dl class="qa-terms">${e.terms.map(t=>`<div><dt>${escape(t.term)}</dt><dd>${escape(t.definition)}</dd></div>`).join('')}</dl></section><section class="qa-explanation-section"><h3>원리와 동작</h3>${q.answer.map(paragraph).join('')}${e.formula?`<div class="qa-formula" tabindex="0" aria-label="관계식"><code>${escape(e.formula)}</code></div>`:''}</section>${table}<section class="qa-explanation-section"><h3>예시와 적용</h3>${q.scenario?`<blockquote class="qa-scenario"><strong>적용 질문</strong>${paragraph(q.scenario)}</blockquote>`:''}${paragraph(e.example)}</section>${code}</div>`;
}

export function validateInterviewBank(bank) {
  if (bank?.version !== 1 || !Array.isArray(bank.topics) || !Array.isArray(bank.questions) || bank.questions.length !== 100) throw new Error('면접 자료 형식을 확인해 주세요.');
  const ids = new Set(), topics = new Set(bank.topics.map(t => t.id));
  const basic=bank.kind==='basic';
  if (topics.size !== (basic?8:6)) throw new Error('면접 자료의 분야 구성을 확인해 주세요.');
  for (const q of bank.questions) {
    if (!(basic?/^B\d{3}$/:/^Q\d{3}$/).test(q.id) || ids.has(q.id) || !topics.has(q.topic) || !(basic?['기초']:['중상','상']).includes(q.level) || typeof q.focus !== 'boolean') throw new Error('면접 문항의 식별자를 확인해 주세요.');
    ids.add(q.id);
    if (typeof q.question !== 'string' || !q.question.trim() || !Array.isArray(q.answer) || q.answer.length !== 3 || q.answer.some(a => typeof a !== 'string' || !a.trim()) || !q.followUp?.question || !q.followUp?.answer || !q.pitfall) throw new Error('면접 문항에 빠진 답변이 있습니다.');
    if (bank.answerFormat==='concept-explanation-v1') {
      const e=q.explanation;
      if (!e || typeof e.introduction!=='string' || !e.introduction.trim() || typeof e.example!=='string' || !e.example.trim() || !Array.isArray(e.terms) || e.terms.length<2 || e.terms.some(t=>!t.term||!t.definition) || !Array.isArray(e.references) || !e.references.length || e.references.some(r=>!r.title||!safeUrl(r.url))) throw new Error('면접 문항의 개념·용어·예시·참고자료를 확인해 주세요.');
      if (e.table && (!Array.isArray(e.table.headers)||e.table.headers.length<2||!Array.isArray(e.table.rows)||e.table.rows.some(row=>!Array.isArray(row)||row.length!==e.table.headers.length))) throw new Error('면접 문항의 비교 표를 확인해 주세요.');
      if (e.code && (!e.code.language||!e.code.body)) throw new Error('면접 문항의 코드 예시를 확인해 주세요.');
    }
  }
  for (const topic of bank.topics) {
    if (bank.questions.filter(q => q.topic === topic.id).length !== topic.count || !/^[CL]\d{2}$/.test(topic.chapterId) || !/^s\d+$/.test(topic.sectionId)) throw new Error('분야별 면접 문항 수를 확인해 주세요.');
    if (!Array.isArray(topic.sources) || topic.sources.some(s => !/^https:\/\//.test(s.url) || !s.title)) throw new Error('면접 자료의 출처를 확인해 주세요.');
  }
  return bank;
}

export function filterInterview(bank, {topic='all', level='all', focus=false, query=''}={}) {
  const terms=normalize(query).trim().split(/\s+/).filter(Boolean);
  return bank.questions.filter(q => (topic==='all'||q.topic===topic) && (level==='all'||q.level===level) && (!focus||q.focus) && terms.every(term => normalize([q.id,q.question,q.scenario||'',...q.answer,q.followUp.question,q.followUp.answer,q.pitfall,q.explanation?.introduction,q.explanation?.example,...(q.explanation?.terms||[]).flatMap(t=>[t.term,t.definition]),q.explanation?.formula,JSON.stringify(q.explanation?.table||{}),q.explanation?.code?.body].join(' ')).includes(term)));
}

export function renderInterviewCards(bank, options={}) {
  const questions=filterInterview(bank,options), topics=new Map(bank.topics.map(t=>[t.id,t]));
  if (!questions.length) return '<p class="qa-empty">일치하는 문항이 없어요. 검색어 또는 필터를 바꿔 보세요.</p>';
  return questions.map(q => {
    const topic=topics.get(q.topic);
    const refs=q.explanation?.references?.filter(r=>safeUrl(r.url))||[];
    return `<article class="qa-card" data-topic="${escape(q.topic)}" aria-labelledby="qa-${q.id}"><div class="qa-meta"><span>${escape(q.id)} · ${escape(topic.title)}</span><span class="qa-level ${q.level==='상'?'qa-high':''}">난도 ${escape(q.level)}</span>${q.focus?'<span class="qa-focus">우선 복습</span>':''}</div><h2 id="qa-${q.id}"><span class="qa-letter">Q.</span> ${escape(q.question)}</h2><details class="qa-answer"><summary>A. 답변 확인</summary>${renderExplanation(q)}<div class="qa-pitfall"><strong>피할 답변</strong><p>${escape(q.pitfall)}</p></div><p class="qa-book-link"><a href="#/read/${topic.chapterId}/${topic.sectionId}">개념서에서 원리·예제 읽기 →</a></p>${refs.length?`<section class="qa-references"><h3>참고자료</h3><ul>${refs.map(r=>`<li><a href="${escape(r.url)}" target="_blank" rel="noopener noreferrer">${escape(r.title)}</a></li>`).join('')}</ul></section>`:''}</details><details class="qa-follow"><summary>꼬리질문: ${escape(q.followUp.question)}</summary>${q.followUp.answer.split('\n\n').map(paragraph).join('')}</details></article>`;
  }).join('');
}

export function renderInterviewPage(bank, options={}) {
  const topic=options.topic||'all', basic=bank.kind==='basic';
  const base=basic?'#/interview/basic':'#/interview';
  const levels=[...new Set(bank.questions.map(q=>q.level))];
  const focusCount=bank.questions.filter(q=>q.focus).length;
  const title=basic?'기초 면접<br>CS · ML/DL 100문항':'CS 심화 면접<br>100문항';
  const intro=basic?'CS 60문항과 ML 20문항·DL 20문항으로 기본 개념을 연결합니다.':'조건·반례·설계 선택·장애 원인을 설명하는 연습입니다.';
  const guide=`<p><strong>개념과 핵심 용어 → 원리와 동작 → 예시와 적용</strong>을 문단으로 설명합니다. 필요한 문항에는 비교 표·관계식·코드 예시가 있습니다. 약어와 영어 용어는 뜻을 함께 확인하세요.</p>${basic?'<p>CS는 자료구조·알고리즘·운영체제·네트워크·DB·분산 시스템 각 10문항, ML과 DL은 각 20문항입니다. 기초 개념부터 원리를 이해하고 자기 말로 답해 보세요.</p>':'<p><strong>중상 38문항:</strong> 원리와 적용 조건을 설명합니다.<br><strong>상 62문항:</strong> 경쟁 상태·부분 실패·보장 범위·대안의 비용까지 비교합니다. 개념을 읽은 뒤 각 문항의 적용 질문과 꼬리질문으로 연결하세요.</p>'}<p>답변 구성은 <a href="https://github.com/boost-devs/ai-tech-interview" target="_blank" rel="noopener noreferrer">boost-devs/ai-tech-interview</a>를 참고했습니다. 설명은 독립적으로 작성하고 공식 문서·교재를 우선했습니다. 참고 저장소의 모든 질문과 분야를 전부 수록한 것은 아닙니다.</p>`;
  return `<main id="main" class="qa-main"><a class="qa-back" href="#/">← 서재</a><nav class="qa-bank-nav" aria-label="면접 문항 세트"><a href="#/interview/basic" ${basic?'aria-current="page"':''}>기초 · CS/ML/DL 100</a><a href="#/interview" ${!basic?'aria-current="page"':''}>심화 · CS 100</a></nav><p class="eyebrow">${basic?'기본 개념 · 이해에서 설명까지':'Computer Science · 원리에서 설계까지'}</p><h1 tabindex="-1">${title}</h1><p class="qa-intro">${intro}<br>먼저 답한 뒤 <strong>A. 답변 확인</strong>을 펼쳐 보세요.</p><details class="qa-guide"><summary>구성과 활용 방법</summary>${guide}<p>‘우선 복습’ ${focusCount}문항은 각 분야의 기본 연결을 먼저 훑는 선택이며 실제 출제 빈도를 뜻하지 않습니다. 실제 회사 기출·평가 기준이 아닌 연습 문제입니다.</p></details><nav class="qa-topic-nav" aria-label="면접 질문 분야"><a href="${base}" ${topic==='all'?'aria-current="page"':''}>전체 100</a>${bank.topics.map(t=>`<a href="${base}/${t.id}" ${topic===t.id?'aria-current="page"':''}>${escape(t.title)} ${t.count}</a>`).join('')}</nav><div class="qa-controls"><label class="qa-search-label" for="qa-search">질문·답변 검색<input type="search" id="qa-search" placeholder="${basic?'예: B081, 과적합, 역전파':'예: Q083, 재시도, p99'}" value="${escape(options.query||'')}" autocomplete="off"></label><label for="qa-level">난도<select id="qa-level"><option value="all">전체 난도</option>${levels.map(level=>`<option value="${escape(level)}" ${options.level===level?'selected':''}>${escape(level)}</option>`).join('')}</select></label><label class="qa-focus-filter"><input type="checkbox" id="qa-focus" ${options.focus?'checked':''}>우선 복습만</label></div><div class="qa-results-bar"><p id="qa-result-count" role="status">${filterInterview(bank,options).length} / 100문항</p><div class="qa-answer-tools"><button type="button" data-action="qa-open">답변 모두 펼치기</button><button type="button" data-action="qa-close">답변 모두 접기</button></div></div><div id="qa-list">${renderInterviewCards(bank,options)}</div><details class="qa-sources"><summary>주제별 참고 문서·교재</summary>${bank.topics.filter(t=>topic==='all'||t.id===topic).map(t=>`<section><h2>${escape(t.title)}</h2><ul>${t.sources.map(s=>`<li><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)}</a></li>`).join('')}</ul></section>`).join('')}</details></main>`;
}
