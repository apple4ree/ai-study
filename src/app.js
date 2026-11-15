import { emphasizeProse } from './emphasis.js';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const STORAGE_KEY = 'ai-study:reader:v1';
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const GROUPS = {
  math: { title: '공학 수학', short: '수학', symbol: '∑', description: '모델을 이해하는 수학의 언어', color: 'math' },
  cs: { title: '컴퓨터과학', short: 'CS', symbol: '{ }', description: '코드가 실행되고 연결되는 원리', color: 'cs' },
  ml: { title: 'ML / DL', short: 'ML / DL', symbol: '↗', description: '학습의 원리부터 AI 시스템까지', color: 'ml' },
  advanced: { title: '심화 수학', short: '수학 · 심화', color: 'math' },
  optional: { title: '선택 수학', short: '수학 · 선택', color: 'math' },
};
const ICONS = {
  book: '<path d="M3 4.5c3-.8 6-.2 9 2 3-2.2 6-2.8 9-2v15c-3-.8-6-.2-9 2-3-2.2-6-2.8-9-2z"/><path d="M12 6.5v15"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  left: '<path d="m14.5 5-7 7 7 7"/>',
  right: '<path d="m9.5 5 7 7-7 7"/>',
  bookmark: '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2.5-3 4.5M12 17h.01"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6m8 0v6M10 15v6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7M12 7v5l3 2"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
};
const app = document.querySelector('#app');
const dialogRoot = document.querySelector('#dialog-root');
let data, chapterMap, sectionMap, orderedSections, searchIndex;
let progress, route = { type: 'home' }, filter = 'all', query = '', reviewTab = 'confused', tocMode = 'chapter';
let pendingScroll = null, scrollTimer, searchTimer, toastTimer, scrollLocked = false, storageErrorShown = false;
let pendingImport = null, readySent = false;
let offlineReady = Boolean(navigator.serviceWorker?.controller);
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.book}</svg>`;
}
function esc(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function norm(value = '') { return String(value).normalize('NFKC').toLocaleLowerCase(); }
function keyOf(chapterId, sectionId) { return `${chapterId}/${sectionId}`; }
function readHref(chapterId, sectionId = 's0') { return `#/read/${encodeURIComponent(chapterId)}/${encodeURIComponent(sectionId)}`; }
function groupOf(chapter) { return GROUPS[chapter.group] || GROUPS.ml; }
function belongsTo(chapter, selected) { return selected === 'all' || (selected === 'math' ? ['math', 'advanced', 'optional'].includes(chapter.group) : chapter.group === selected); }
function defaultProgress() { return { version: 1, lastRead: null, bookmarks: [], review: {}, settings: { fontSize: 20, lineHeight: 1.9, theme: 'system' } }; }
function toast(message) {
  const node = document.querySelector('#toast');
  clearTimeout(toastTimer);
  node.textContent = message; node.classList.add('visible');
  toastTimer = setTimeout(() => node.classList.remove('visible'), 4200);
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); storageErrorShown = false; return true; }
  catch { if (!storageErrorShown) toast('저장 공간을 사용할 수 없어 기록을 저장하지 못했어요. 설정에서 내보내기로 보관할 수 있어요.'); storageErrorShown = true; return false; }
}
function validRecord(raw, strict = false) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) throw new Error('지원하지 않는 기록 파일입니다.');
  const clean = defaultProgress();
  if (raw.settings !== undefined) {
    const s = raw.settings;
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('글자 설정 형식이 올바르지 않습니다.');
    if (s.fontSize !== undefined) { if (!Number.isInteger(s.fontSize) || s.fontSize < 18 || s.fontSize > 24) throw new Error('글자 크기는 18~24px이어야 합니다.'); clean.settings.fontSize = s.fontSize; }
    if (s.lineHeight !== undefined) { if (!Number.isFinite(s.lineHeight) || s.lineHeight < 1.6 || s.lineHeight > 2.2) throw new Error('줄 간격 값이 올바르지 않습니다.'); clean.settings.lineHeight = Math.round(s.lineHeight * 10) / 10; }
    if (s.theme !== undefined) { if (!['system', 'light', 'dark'].includes(s.theme)) throw new Error('테마 값이 올바르지 않습니다.'); clean.settings.theme = s.theme; }
  }
  const checkKey = key => typeof key === 'string' && sectionMap.has(key);
  if (raw.bookmarks !== undefined) {
    if (!Array.isArray(raw.bookmarks) || raw.bookmarks.length > 10000 || raw.bookmarks.some(k => typeof k !== 'string')) throw new Error('북마크 형식이 올바르지 않습니다.');
    if (strict && raw.bookmarks.some(k => !checkKey(k))) throw new Error('현재 개념서에 없는 북마크가 포함되어 있습니다.');
    clean.bookmarks = [...new Set(raw.bookmarks.filter(checkKey))];
  }
  if (raw.review !== undefined) {
    if (!raw.review || typeof raw.review !== 'object' || Array.isArray(raw.review)) throw new Error('이해 기록 형식이 올바르지 않습니다.');
    const entries = Object.entries(raw.review);
    if (entries.length > 10000) throw new Error('이해 기록이 너무 많습니다.');
    for (const [key, status] of entries) {
      if (!['understood', 'confused'].includes(status)) throw new Error('이해 기록 값이 올바르지 않습니다.');
      if (!checkKey(key)) { if (strict) throw new Error('현재 개념서에 없는 이해 기록이 포함되어 있습니다.'); continue; }
      clean.review[key] = status;
    }
  }
  if (raw.lastRead !== undefined && raw.lastRead !== null) {
    const r = raw.lastRead;
    if (!r || typeof r !== 'object' || !Number.isFinite(r.scrollY) || r.scrollY < 0 || r.scrollY > 10000000 || typeof r.chapterId !== 'string' || typeof r.sectionId !== 'string') throw new Error('이어 읽기 위치가 올바르지 않습니다.');
    if (checkKey(keyOf(r.chapterId, r.sectionId))) clean.lastRead = { chapterId: r.chapterId, sectionId: r.sectionId, scrollY: r.scrollY };
    else if (strict) throw new Error('현재 개념서에 없는 읽기 위치입니다.');
  }
  return clean;
}
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    if (raw.length > MAX_IMPORT_BYTES) throw new Error();
    return validRecord(JSON.parse(raw));
  } catch { setTimeout(() => toast('저장된 기록을 읽지 못했어요. 이 기기에서 새 기록으로 시작합니다.'), 200); return defaultProgress(); }
}
function applySettings() {
  const settings = progress.settings;
  document.documentElement.style.setProperty('--reader-font', `${settings.fontSize}px`);
  document.documentElement.style.setProperty('--reader-leading', settings.lineHeight);
  document.documentElement.dataset.theme = settings.theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : settings.theme;
  document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
}
function saveScroll() {
  clearTimeout(scrollTimer);
  if (route.type !== 'reader' || !sectionMap?.has(keyOf(route.chapterId, route.sectionId)) || scrollLocked) return;
  progress.lastRead = { chapterId: route.chapterId, sectionId: route.sectionId, scrollY: Math.max(0, window.scrollY) };
  persist();
}
function parseRoute() {
  try {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length) return { type: 'home' };
    if (parts[0] === 'review' && parts.length === 1) return { type: 'review' };
    if (parts[0] === 'read' && parts[1]) {
      const chapter = chapterMap.get(parts[1]);
      if (!chapter) return { type: 'missing' };
      const sectionId = parts[2] || chapter.sections[0]?.id;
      if (parts.length > 3 || !sectionMap.has(keyOf(chapter.id, sectionId))) return { type: 'missing' };
      return { type: 'reader', chapterId: chapter.id, sectionId };
    }
  } catch { /* malformed hash */ }
  return { type: 'missing' };
}
function navigate(hash, options = {}) {
  saveScroll(); closeDialogs(); pendingScroll = options.scrollY ?? 0;
  if (location.hash === hash) renderRoute(); else location.hash = hash;
}
function header() {
  return `<header class="site-header"><a class="brand" href="#/" aria-label="AI 개념서 서재">${icon('book')}<span>AI 개념서</span><span class="brand-dot" aria-hidden="true"></span></a><div class="header-actions"><a class="header-link ${route.type === 'review' ? 'active' : ''}" href="#/review">복습 노트</a><button class="icon-button" data-action="settings" aria-label="읽기 설정">${icon('settings')}</button></div></header>`;
}
function bottomBar() {
  return `<nav class="bottom-bar" aria-label="주요 메뉴"><a href="#/" class="bottom-item ${route.type === 'home' ? 'active' : ''}" ${route.type === 'home' ? 'aria-current="page"' : ''}>${icon('book')}<span>서재</span></a><button class="bottom-item" data-action="toc">${icon('menu')}<span>목차</span></button><a href="#/review" class="bottom-item ${route.type === 'review' ? 'active' : ''}" ${route.type === 'review' ? 'aria-current="page"' : ''}>${icon('history')}<span>복습</span></a><button class="bottom-item" data-action="settings">${icon('settings')}<span>글자 설정</span></button></nav>`;
}
function sectionCard(item, suffix = '') {
  const { chapter, section } = item, key = keyOf(chapter.id, section.id);
  return `<a class="section-card" href="${readHref(chapter.id, section.id)}"><div><span class="eyebrow">${esc(groupOf(chapter).short)} · ${esc(chapter.id)}</span><h3>${esc(section.title || chapter.title)}</h3><p>${esc(chapter.title)}</p></div><span class="card-arrow">${icon('right')}</span>${suffix}</a>`;
}
function renderHome() {
  const last = progress.lastRead && sectionMap.get(keyOf(progress.lastRead.chapterId, progress.lastRead.sectionId));
  const first = data.chapters.find(c => c.group === 'math') || data.chapters[0];
  return `${header()}<main id="main" class="home-main"><section class="home-intro"><p class="eyebrow">나만의 공부 서재</p><h1 tabindex="-1">원리를 읽고,<br>직접 이해하기.</h1><p class="intro-copy">공학 수학, 컴퓨터과학, 머신러닝.<br class="mobile-break"> 세 갈래의 지식을 한 권의 개념서로.</p></section>${last ? `<section class="continue-panel" aria-label="이어 읽기"><div class="continue-icon">${icon('bookmark')}</div><div class="continue-copy"><p class="eyebrow">이어서 읽을 곳</p><h2>${esc(last.chapter.title)}</h2><p>${esc(last.section.title)}</p></div><button class="button button-primary" data-action="resume">이어 읽기 ${icon('right')}</button></section>` : `<section class="start-panel"><p>처음이라면 수학의 기초부터.<br><span>익숙한 단원은 건너뛰어도 좋아요.</span></p><a class="button button-primary" href="${readHref(first.id, first.sections[0].id)}">첫 장 펼치기 ${icon('right')}</a></section>`}<section class="track-grid" aria-label="세 가지 공부 갈래">${['math', 'cs', 'ml'].map(group => `<button class="track-card ${group} ${filter === group ? 'selected' : ''}" data-action="filter" data-filter="${group}" aria-pressed="${filter === group}"><span class="track-symbol" aria-hidden="true">${esc(GROUPS[group].symbol)}</span><span class="track-text"><strong>${esc(GROUPS[group].title)}</strong><span>${esc(GROUPS[group].description)}</span></span><span class="track-arrow">${icon('right')}</span></button>`).join('')}</section><section class="library-section" aria-labelledby="library-title"><div class="section-heading"><h2 id="library-title">단원 찾아보기</h2><button class="text-button" data-action="filter" data-filter="all" ${filter === 'all' ? 'hidden' : ''}>전체 보기</button></div><label class="search-box" for="search">${icon('search')}<input id="search" type="search" aria-label="개념서 전체 검색" placeholder="개념이나 단원 검색 · 예: 가상 메모리" value="${esc(query)}" autocomplete="off" spellcheck="false"><kbd aria-hidden="true">/</kbd></label><div id="discovery">${discoveryContent()}</div></section><p class="device-note">읽기 위치와 북마크는 이 기기에만 저장돼요. 설정에서 기록을 내보낼 수 있어요.</p></main>${bottomBar()}`;
}
function chapterRow(chapter) {
  const bookmarked = chapter.sections.some(s => progress.bookmarks.includes(keyOf(chapter.id, s.id)));
  return `<a class="chapter-row" href="${readHref(chapter.id, chapter.sections[0].id)}"><span class="chapter-code">${esc(chapter.id)}</span><span class="chapter-row-copy"><strong>${esc(chapter.title)}</strong><span>${esc(chapter.sections[0]?.title || '')}</span></span>${bookmarked ? icon('bookmark', 'tiny-bookmark') : ''}${icon('right', 'row-arrow')}</a>`;
}
function chapterGroup(group) {
  const chapters = data.chapters.filter(c => c.group === group);
  if (!chapters.length) return '';
  return `<section class="chapter-group ${group}"><div class="group-heading"><span class="group-dot"></span><h3>${esc(GROUPS[group]?.title || group)}</h3></div><div class="chapter-list">${chapters.map(chapterRow).join('')}</div></section>`;
}
function discoveryContent() {
  if (query.trim()) {
    const terms = norm(query).trim().split(/\s+/).filter(Boolean);
    const results = searchIndex.filter(item => belongsTo(item.chapter, filter) && terms.every(t => item.search.includes(t)));
    return `<div class="search-meta" role="status">${results.length ? `${results.length}개의 절에서 찾았어요.` : '검색 결과가 없어요. 다른 용어로 찾아보세요.'}</div><div class="search-results">${results.slice(0, 40).map(item => `<a class="search-result" href="${readHref(item.chapter.id, item.section.id)}"><span class="eyebrow">${esc(item.chapter.id)} · ${esc(item.chapter.title)}</span><h3>${highlight(item.section.title, terms)}</h3><p>${snippet(item.section.plain, terms)}</p></a>`).join('')}</div>${results.length > 40 ? '<p class="muted small">처음 40개를 표시했어요. 용어를 더 입력하면 좁혀집니다.</p>' : ''}`;
  }
  let html = '';
  if (filter === 'all' || filter === 'math') {
    html += chapterGroup('math');
    for (const group of ['advanced', 'optional']) {
      const chapters = data.chapters.filter(c => c.group === group);
      if (chapters.length) html += `<details class="subgroup"><summary><span>${esc(GROUPS[group].title)}</span><span class="subgroup-note">${group === 'advanced' ? '기초에서 한 걸음 더' : '필요할 때 깊게 읽기'}</span>${icon('right')}</summary><div class="chapter-list">${chapters.map(chapterRow).join('')}</div></details>`;
    }
  }
  if (filter === 'all' || filter === 'cs') html += chapterGroup('cs');
  if (filter === 'all' || filter === 'ml') html += chapterGroup('ml');
  return html;
}
function highlight(value, terms) {
  const text = String(value || ''), lower = norm(text);
  const term = terms.find(t => lower.includes(t));
  if (!term) return esc(text);
  const index = lower.indexOf(term);
  return `${esc(text.slice(0, index))}<mark>${esc(text.slice(index, index + term.length))}</mark>${esc(text.slice(index + term.length))}`;
}
function snippet(value, terms) {
  const text = String(value || '').replace(/\s+/g, ' '), lower = norm(text);
  let index = terms.map(t => lower.indexOf(t)).find(i => i >= 0) ?? 0;
  const start = Math.max(0, index - 48), end = Math.min(text.length, start + 160);
  return `${start ? '…' : ''}${highlight(text.slice(start, end), terms)}${end < text.length ? '…' : ''}`;
}
function tocContent() {
  if (tocMode === 'chapter' && route.type === 'reader') {
    const chapter = chapterMap.get(route.chapterId);
    return `<div class="toc-chapter-title"><span class="eyebrow">${esc(chapter.id)} · ${esc(groupOf(chapter).short)}</span><h2>${esc(chapter.title)}</h2></div><ol class="section-toc">${chapter.sections.map((section, i) => {
      const key = keyOf(chapter.id, section.id), active = section.id === route.sectionId;
      const status = progress.review[key];
      return `<li><a href="${readHref(chapter.id, section.id)}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}><span class="toc-number">${String(i + 1).padStart(2, '0')}</span><span>${esc(section.title)}</span>${status ? `<span class="toc-status ${status}" aria-label="${status === 'understood' ? '이해한 절' : '헷갈리는 절'}">${icon(status === 'understood' ? 'check' : 'question')}</span>` : ''}</a></li>`;
    }).join('')}</ol>`;
  }
  return `<div class="curriculum-toc">${['math', 'advanced', 'optional', 'cs', 'ml'].map(group => {
    const chapters = data.chapters.filter(c => c.group === group);
    if (!chapters.length) return '';
    return `<section><h3>${esc(GROUPS[group].title)}</h3>${chapters.map(c => `<a class="${route.chapterId === c.id ? 'active' : ''}" href="${readHref(c.id, c.sections[0].id)}"><span>${esc(c.id)}</span><strong>${esc(c.title)}</strong></a>`).join('')}</section>`;
  }).join('')}</div>`;
}
function tocTabs() {
  return `<div class="segmented toc-tabs" aria-label="목차 범위"><button data-action="toc-mode" data-mode="chapter" class="${tocMode === 'chapter' ? 'active' : ''}" aria-pressed="${tocMode === 'chapter'}" ${route.type !== 'reader' ? 'disabled' : ''}>이 장 목차</button><button data-action="toc-mode" data-mode="all" class="${tocMode === 'all' ? 'active' : ''}" aria-pressed="${tocMode === 'all'}">전체 단원</button></div>`;
}
function stripLeadingHeading(html, title) {
  const template = document.createElement('template'); template.innerHTML = html;
  const first = template.content.firstElementChild;
  if (first && /^H[1-3]$/.test(first.tagName) && norm(first.textContent.trim()) === norm(title.trim())) first.remove();
  return template.innerHTML;
}
function recordButtons(key) {
  const status = progress.review[key];
  return `<div class="understanding-buttons"><button class="understanding-button ${status === 'understood' ? 'selected' : ''}" data-action="review-state" data-status="understood" data-key="${esc(key)}" aria-pressed="${status === 'understood'}">${icon('check')} 이해했어요</button><button class="understanding-button confused ${status === 'confused' ? 'selected' : ''}" data-action="review-state" data-status="confused" data-key="${esc(key)}" aria-pressed="${status === 'confused'}">${icon('question')} 다시 읽고 싶어요</button></div>`;
}
function renderReader() {
  const chapter = chapterMap.get(route.chapterId), section = chapter.sections.find(s => s.id === route.sectionId);
  const key = keyOf(chapter.id, section.id), index = orderedSections.findIndex(s => s.key === key);
  const prev = orderedSections[index - 1], next = orderedSections[index + 1];
  const marked = progress.bookmarks.includes(key), minutes = Number(section.minutes);
  return `${header()}<div class="reader-layout"><aside class="desktop-toc" aria-label="학습 목차">${tocTabs()}<div class="toc-body">${tocContent()}</div><p class="sidebar-note">방문한 절은 자동으로<br>이해한 절이 되지 않아요.</p></aside><main id="main" class="reader-main"><article><header class="reading-header"><div class="reading-breadcrumb"><button class="text-button mobile-toc-trigger" data-action="toc">${icon('menu')} 목차</button><span>${esc(groupOf(chapter).short)} <span aria-hidden="true">/</span> ${esc(chapter.id)}</span><button class="bookmark-button ${marked ? 'selected' : ''}" data-action="bookmark" data-key="${esc(key)}" aria-pressed="${marked}" aria-label="${marked ? '북마크 해제' : '이 절 북마크'}">${icon('bookmark')}<span>${marked ? '저장됨' : '북마크'}</span></button></div><p class="chapter-kicker">${esc(chapter.title)}</p><h1 tabindex="-1">${esc(section.title)}</h1><div class="reading-meta"><span>${chapter.sections.findIndex(s => s.id === section.id) + 1} / ${chapter.sections.length}절</span>${minutes > 0 ? `<span>읽기 약 ${esc(Math.ceil(minutes))}분</span>` : ''}<button class="text-button" data-action="settings">가<span class="smaller-aa">가</span> 글자 설정</button></div></header><div class="section-prose">${stripLeadingHeading(section.html || '', section.title)}</div><footer class="reading-footer"><div class="understanding-prompt"><p>지금 읽은 내용은 어땠나요?</p><span>직접 표시한 절만 복습 노트에 남아요.</span></div>${recordButtons(key)}<nav class="section-navigation" aria-label="이전 절과 다음 절">${prev ? `<a class="section-nav prev" href="${readHref(prev.chapter.id, prev.section.id)}">${icon('left')}<span><small>${prev.chapter.id === chapter.id ? '이전 절' : '이전 단원'}</small><strong>${esc(prev.section.title)}</strong></span></a>` : '<span></span>'}${next ? `<a class="section-nav next" href="${readHref(next.chapter.id, next.section.id)}"><span><small>${next.chapter.id === chapter.id ? '다음 절' : `다음 단원 · ${esc(next.chapter.id)}`}</small><strong>${esc(next.section.title)}</strong></span>${icon('right')}</a>` : `<a class="section-nav next" href="#/"><span><small>여기까지 읽었어요</small><strong>서재로 돌아가기</strong></span>${icon('right')}</a>`}</nav><div class="chapter-source">${chapter.notionUrl ? `<a href="${esc(chapter.notionUrl)}" target="_blank" rel="noopener noreferrer">Notion 원문 보기 ↗</a>` : '<span>AI 개념서</span>'}<button class="text-button" data-action="toc">전체 목차 ${icon('menu')}</button></div></footer></article></main></div>${bottomBar()}`;
}
function renderReview() {
  let items;
  if (reviewTab === 'bookmarks') items = progress.bookmarks.map(key => sectionMap.get(key)).filter(Boolean);
  else items = orderedSections.filter(item => progress.review[item.key] === reviewTab);
  const empty = reviewTab === 'bookmarks' ? '기억해 두고 싶은 절에서 북마크를 눌러보세요.' : reviewTab === 'understood' ? '절을 읽은 뒤 ‘이해했어요’를 누르면 여기에 남아요.' : '읽다가 헷갈리는 절을 표시해 두면 다시 찾기 쉬워요.';
  return `${header()}<main id="main" class="review-main"><div class="page-intro"><p class="eyebrow">배운 내용을 내 것으로</p><h1 tabindex="-1">복습 노트</h1><p>다시 생각할 개념과 기억해 둘 문장을 모았어요.</p></div><div class="review-tabs segmented" aria-label="복습 기록 종류">${[['confused', '다시 읽을 절'], ['bookmarks', '북마크'], ['understood', '이해한 절']].map(([id, label]) => `<button class="${reviewTab === id ? 'active' : ''}" data-action="review-tab" data-tab="${id}" aria-pressed="${reviewTab === id}">${label}</button>`).join('')}</div><div class="review-list">${items.length ? items.map(item => `<div class="review-entry">${sectionCard(item)}<button class="icon-button remove-record" data-action="remove-record" data-key="${esc(item.key || keyOf(item.chapter.id, item.section.id))}" aria-label="${esc(item.section.title)} ${reviewTab === 'bookmarks' ? '북마크' : '이해 표시'} 해제">${icon('close')}</button></div>`).join('') : `<div class="empty-state"><div class="empty-symbol">${icon(reviewTab === 'bookmarks' ? 'bookmark' : 'book')}</div><h2>아직 기록한 절이 없어요.</h2><p>${empty}</p><a href="#/" class="button button-secondary">단원 찾아보기 ${icon('right')}</a></div>`}</div><p class="device-note">이 기록은 이 기기에만 있어요. 다른 기기로 옮기려면 설정에서 내보내기를 이용하세요.</p></main>${bottomBar()}`;
}
function renderMissing() {
  return `${header()}<main id="main" class="missing-main"><span class="eyebrow">페이지를 찾을 수 없어요</span><h1 tabindex="-1">다시 서재에서<br>이어가 볼까요?</h1><p>현재 개념서에 없는 단원이나 절입니다.</p><a href="#/" class="button button-primary">서재로 돌아가기 ${icon('right')}</a></main>${bottomBar()}`;
}
function renderRoute() {
  if (!data) return;
  saveScroll(); const previousRoute = route; route = parseRoute();
  if (route.type !== 'reader') tocMode = 'all'; else if (previousRoute.type !== 'reader' || previousRoute.chapterId !== route.chapterId) tocMode = 'chapter';
  scrollLocked = true;
  app.innerHTML = route.type === 'reader' ? renderReader() : route.type === 'review' ? renderReview() : route.type === 'missing' ? renderMissing() : renderHome();
  document.title = route.type === 'reader' ? `${sectionMap.get(keyOf(route.chapterId, route.sectionId)).section.title} · AI 개념서` : route.type === 'review' ? '복습 노트 · AI 개념서' : 'AI 개념서';
  decorateProse();
  const y = pendingScroll ?? 0; pendingScroll = null;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo({ top: y, behavior: 'instant' });
    const heading = app.querySelector('h1'); if (heading) heading.focus({ preventScroll: true });
    scrollLocked = false;
    if (route.type === 'reader') { progress.lastRead = { chapterId: route.chapterId, sectionId: route.sectionId, scrollY: Math.max(0, window.scrollY) }; persist(); }
  }));
}
function decorateProse() {
  if (route.type === 'reader') {
    const current = sectionMap.get(keyOf(route.chapterId, route.sectionId));
    emphasizeProse(app.querySelector('.section-prose'), current.chapter.group, current.section.title);
  }
  app.querySelectorAll('.section-prose img').forEach(image => {
    image.tabIndex = 0; image.setAttribute('role', 'button');
    image.setAttribute('aria-label', `${image.alt || '그림'} 크게 보기`); image.title = '눌러서 크게 보기';
  });
  app.querySelectorAll('.section-prose a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
  app.querySelectorAll('.section-prose table').forEach(table => {
    if (!table.parentElement.classList.contains('table-scroll')) { const wrapper = document.createElement('div'); wrapper.className = 'table-scroll'; table.replaceWith(wrapper); wrapper.append(table); }
  });
}
function makeDialog(id, className, label, content) {
  let dialog = document.getElementById(id);
  if (dialog) dialog.remove();
  dialog = document.createElement('dialog'); dialog.id = id; dialog.className = className;
  dialog.setAttribute('aria-label', label); dialog.innerHTML = content; dialogRoot.append(dialog);
  const opener = document.activeElement;
  dialog.addEventListener('close', () => { if (opener?.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true }); });
  dialog.addEventListener('click', event => { if (event.target === dialog && (event.offsetX < 0 || event.offsetX > dialog.clientWidth || event.offsetY < 0 || event.offsetY > dialog.clientHeight)) dialog.close(); });
  dialog.showModal(); return dialog;
}
function closeDialogs() { dialogRoot.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); }
function openToc() {
  if (route.type !== 'reader') tocMode = 'all';
  makeDialog('toc-dialog', 'sheet toc-sheet', '학습 목차', `<div class="dialog-heading"><h2>목차</h2><button class="icon-button" data-action="close-dialog" aria-label="목차 닫기">${icon('close')}</button></div>${tocTabs()}<div class="toc-body">${tocContent()}</div>`);
}
function openSettings() {
  const settings = progress.settings;
  makeDialog('settings-dialog', 'sheet settings-sheet', '읽기 설정', `<div class="dialog-heading"><h2>읽기 설정</h2><button class="icon-button" data-action="close-dialog" aria-label="설정 닫기">${icon('close')}</button></div><div class="settings-body"><div class="setting-field"><label for="font-size">글자 크기 <output id="font-output">${settings.fontSize}px</output></label><div class="range-row"><span aria-hidden="true">가</span><input id="font-size" data-setting="fontSize" type="range" min="18" max="24" step="1" value="${settings.fontSize}"><span class="range-large" aria-hidden="true">가</span></div></div><div class="setting-field"><label for="line-height">줄 간격 <output id="line-output">${settings.lineHeight.toFixed(1)}</output></label><input id="line-height" data-setting="lineHeight" type="range" min="1.6" max="2.2" step="0.1" value="${settings.lineHeight}"></div><div class="setting-field"><label for="theme">화면 테마</label><select id="theme" data-setting="theme">${[['system', '기기 설정 따르기'], ['light', '밝은 화면'], ['dark', '어두운 화면']].map(([value, label]) => `<option value="${value}" ${settings.theme === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="reading-preview">이해는 한 문장씩 쌓입니다.<br>편안한 크기로 천천히 읽어보세요.</div><hr><p class="offline-status small muted">${offlineReady ? '오프라인으로도 읽을 준비가 되었어요.' : '처음 연결할 때 읽을 자료를 기기에 준비합니다.'}</p><h3>읽기 기록 옮기기</h3><p class="settings-note">읽기 위치·북마크·이해 표시·설정은 이 브라우저에만 저장돼요. JSON 파일로 내보내 다른 기기에서 가져올 수 있어요.</p><div class="transfer-buttons"><button class="button button-secondary" data-action="export">${icon('download')} 내보내기</button><button class="button button-secondary" data-action="import">${icon('upload')} 가져오기</button></div><input type="file" id="import-file" accept="application/json,.json" hidden><p class="small muted">가져오면 현재 기기의 기록을 파일 내용으로 바꿉니다. 개인정보나 본문은 내보내지 않아요.</p></div>`);
}
function openImage(image) {
  const dialog = makeDialog('image-dialog', 'image-dialog', '그림 확대 보기', `<div class="dialog-heading"><h2>${esc(image.alt || '그림 확대')}</h2><div class="zoom-tools"><button class="icon-button" data-action="zoom-out" aria-label="그림 축소">${icon('minus')}</button><output id="zoom-output">100%</output><button class="icon-button" data-action="zoom-in" aria-label="그림 확대">${icon('plus')}</button><button class="icon-button" data-action="close-dialog" aria-label="그림 닫기">${icon('close')}</button></div></div><div class="zoom-stage"><img src="${esc(image.currentSrc || image.src)}" alt="${esc(image.alt || '학습 그림')}" class="zoom-image"></div><p class="zoom-note">확대한 그림은 좌우로 움직여 볼 수 있어요.</p>`);
  dialog.dataset.zoom = '1';
}
function changeZoom(delta) {
  const dialog = document.querySelector('#image-dialog'); if (!dialog) return;
  const zoom = Math.min(3, Math.max(1, Number(dialog.dataset.zoom || 1) + delta)); dialog.dataset.zoom = String(zoom);
  dialog.querySelector('.zoom-image').style.width = `${zoom * 100}%`; dialog.querySelector('#zoom-output').textContent = `${Math.round(zoom * 100)}%`;
}
function syncRecords() {
  app.querySelectorAll('[data-action="bookmark"]').forEach(button => {
    const selected = progress.bookmarks.includes(button.dataset.key); button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); button.setAttribute('aria-label', selected ? '북마크 해제' : '이 절 북마크'); button.innerHTML = `${icon('bookmark')}<span>${selected ? '저장됨' : '북마크'}</span>`;
  });
  app.querySelectorAll('[data-action="review-state"]').forEach(button => { const selected = progress.review[button.dataset.key] === button.dataset.status; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  const sidebar = app.querySelector('.desktop-toc .toc-body'); if (sidebar) sidebar.innerHTML = tocContent();
}
function exportProgress() {
  saveScroll();
  const payload = { app: 'ai-study-reader', version: 1, exportedAt: new Date().toISOString(), contentVersion: data.version, progress };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `ai-study-records-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); toast('읽기 기록을 JSON 파일로 내보냈어요.');
}
async function importProgress(file) {
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) { toast('기록 파일은 2MB 이하여야 합니다.'); return; }
  try {
    const raw = JSON.parse(await file.text());
    if (!raw || raw.app !== 'ai-study-reader' || raw.version !== 1 || !raw.progress) throw new Error('이 개념서에서 내보낸 기록 파일을 선택해주세요.');
    pendingImport = validRecord(raw.progress, true);
    makeDialog('import-dialog', 'confirm-dialog', '기록 가져오기 확인', `<div class="dialog-heading"><h2>이 기록으로 바꿀까요?</h2><button class="icon-button" data-action="close-dialog" aria-label="가져오기 취소">${icon('close')}</button></div><p>현재 기기의 읽기 위치·북마크·이해 표시·설정을 파일에 저장된 내용으로 바꿉니다.</p><div class="confirm-actions"><button class="button button-secondary" data-action="close-dialog">취소</button><button class="button button-primary" data-action="confirm-import">기록 가져오기</button></div>`);
  } catch (error) { pendingImport = null; toast(error.message || '기록 파일을 읽을 수 없어요.'); }
}
function refreshHome() {
  const area = document.querySelector('#discovery'); if (area) area.innerHTML = discoveryContent();
  app.querySelectorAll('.track-card').forEach(card => { const selected = card.dataset.filter === filter; card.classList.toggle('selected', selected); card.setAttribute('aria-pressed', String(selected)); });
  const all = app.querySelector('[data-filter="all"]'); if (all) all.hidden = filter === 'all';
}

document.addEventListener('click', event => {
  if (event.target.closest('.skip-link')) { event.preventDefault(); const main = document.querySelector('#main'); main?.setAttribute('tabindex', '-1'); main?.focus({ preventScroll: true }); main?.scrollIntoView({ block: 'start' }); return; }
  const image = event.target.closest('.section-prose img'); if (image) { event.preventDefault(); openImage(image); return; }
  const anchor = event.target.closest('a[href^="#/"]');
  if (anchor && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); navigate(anchor.getAttribute('href')); return; }
  const button = event.target.closest('[data-action]'); if (!button || button.disabled || !progress) return;
  const action = button.dataset.action, key = button.dataset.key;
  if (action === 'settings') openSettings();
  else if (action === 'toc') { if (route.type === 'reader') tocMode = 'chapter'; openToc(); }
  else if (action === 'close-dialog') button.closest('dialog')?.close();
  else if (action === 'toc-mode') { tocMode = button.dataset.mode; const dialog = button.closest('dialog'); if (dialog) { dialog.querySelector('.toc-tabs').outerHTML = tocTabs(); dialog.querySelector('.toc-body').innerHTML = tocContent(); dialog.querySelector(`[data-mode="${tocMode}"]`)?.focus(); } else { app.querySelector('.desktop-toc .toc-tabs').outerHTML = tocTabs(); app.querySelector('.desktop-toc .toc-body').innerHTML = tocContent(); app.querySelector(`.desktop-toc [data-mode="${tocMode}"]`)?.focus(); } }
  else if (action === 'filter') { filter = button.dataset.filter; refreshHome(); if (filter === 'all') document.querySelector('#library-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  else if (action === 'resume') { const last = { ...progress.lastRead }; tocMode = 'chapter'; navigate(readHref(last.chapterId, last.sectionId), { scrollY: last.scrollY }); }
  else if (action === 'bookmark' && sectionMap.has(key)) { const index = progress.bookmarks.indexOf(key); if (index >= 0) progress.bookmarks.splice(index, 1); else progress.bookmarks.push(key); persist(); syncRecords(); toast(index >= 0 ? '북마크를 해제했어요.' : '북마크에 저장했어요.'); }
  else if (action === 'review-state' && sectionMap.has(key)) { if (progress.review[key] === button.dataset.status) delete progress.review[key]; else progress.review[key] = button.dataset.status; persist(); syncRecords(); toast(progress.review[key] === 'understood' ? '이해한 절로 표시했어요.' : progress.review[key] === 'confused' ? '다시 읽을 절에 모아 두었어요.' : '이해 표시를 해제했어요.'); }
  else if (action === 'review-tab') { reviewTab = button.dataset.tab; const y = window.scrollY; app.innerHTML = renderReview(); window.scrollTo({ top: y, behavior: 'instant' }); app.querySelector(`[data-tab="${reviewTab}"]`)?.focus({ preventScroll: true }); }
  else if (action === 'remove-record') { if (reviewTab === 'bookmarks') progress.bookmarks = progress.bookmarks.filter(k => k !== key); else delete progress.review[key]; persist(); app.innerHTML = renderReview(); app.querySelector(`[data-tab="${reviewTab}"]`)?.focus({ preventScroll: true }); toast('기록에서 표시를 해제했어요.'); }
  else if (action === 'export') exportProgress();
  else if (action === 'import') document.querySelector('#import-file')?.click();
  else if (action === 'confirm-import' && pendingImport) { progress = pendingImport; pendingImport = null; persist(); applySettings(); closeDialogs(); route = { type: 'home' }; pendingScroll = 0; if (location.hash === '#/') renderRoute(); else location.hash = '#/'; toast('읽기 기록을 가져왔어요.'); }
  else if (action === 'zoom-in') changeZoom(0.5);
  else if (action === 'zoom-out') changeZoom(-0.5);
});
document.addEventListener('input', event => {
  if (event.target.id === 'search') { query = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(refreshHome, 120); }
  if (event.target.dataset.setting) {
    const setting = event.target.dataset.setting;
    progress.settings[setting] = setting === 'theme' ? event.target.value : Number(event.target.value); applySettings(); persist();
    const output = document.querySelector(setting === 'fontSize' ? '#font-output' : '#line-output'); if (output && setting !== 'theme') output.textContent = setting === 'fontSize' ? `${progress.settings.fontSize}px` : progress.settings.lineHeight.toFixed(1);
  }
});
document.addEventListener('change', event => { if (event.target.id === 'import-file') { importProgress(event.target.files?.[0]); event.target.value = ''; } });
document.addEventListener('keydown', event => {
  const image = event.target.closest?.('.section-prose img');
  if (image && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openImage(image); }
  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) && !dialogRoot.querySelector('dialog[open]')) { const search = document.querySelector('#search'); if (search) { event.preventDefault(); search.focus(); } }
});
window.addEventListener('hashchange', () => { closeDialogs(); renderRoute(); });
window.addEventListener('scroll', () => { if (scrollLocked || route.type !== 'reader') return; clearTimeout(scrollTimer); scrollTimer = setTimeout(saveScroll, 350); }, { passive: true });
window.addEventListener('pagehide', saveScroll);
window.addEventListener('offline-ready', () => { offlineReady = true; document.querySelectorAll('.offline-status').forEach(node => { node.textContent = '오프라인으로도 읽을 준비가 되었어요.'; }); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveScroll(); });
systemTheme.addEventListener('change', () => { if (progress?.settings.theme === 'system') applySettings(); });

async function boot() {
  try {
    const response = await fetch(new URL('./data.json', document.baseURI));
    if (!response.ok) throw new Error(`자료를 불러오지 못했습니다 (${response.status}).`);
    data = await response.json();
    if (!Array.isArray(data.chapters) || !data.chapters.length) throw new Error('단원 데이터 형식이 올바르지 않습니다.');
    chapterMap = new Map(); sectionMap = new Map(); orderedSections = [];
    for (const chapter of data.chapters) {
      if (!/^[A-Za-z0-9_-]+$/.test(chapter.id) || typeof chapter.title !== 'string' || !Array.isArray(chapter.sections) || !chapter.sections.length || chapterMap.has(chapter.id)) throw new Error('단원 데이터에 올바르지 않은 항목이 있습니다.');
      chapterMap.set(chapter.id, chapter);
      for (const section of chapter.sections) {
        const key = keyOf(chapter.id, section.id);
        if (!/^[A-Za-z0-9_-]+$/.test(section.id) || typeof section.title !== 'string' || typeof section.html !== 'string' || typeof section.plain !== 'string' || sectionMap.has(key)) throw new Error('절 데이터 형식이 올바르지 않습니다.');
        const entry = { chapter, section, key }; sectionMap.set(key, entry); orderedSections.push(entry);
      }
    }
    searchIndex = orderedSections.map(item => ({ ...item, search: norm(`${item.chapter.id} ${item.chapter.title} ${item.section.title} ${item.section.plain}`) }));
    progress = loadProgress(); applySettings();
    const initial = parseRoute(); tocMode = initial.type === 'reader' ? 'chapter' : 'all';
    if (initial.type === 'reader' && progress.lastRead?.chapterId === initial.chapterId && progress.lastRead?.sectionId === initial.sectionId) pendingScroll = progress.lastRead.scrollY;
    renderRoute();
    if (!readySent) { readySent = true; window.dispatchEvent(new Event('app-ready')); }
  } catch (error) {
    app.innerHTML = `<main id="main" class="missing-main"><span class="eyebrow">개념서를 불러오지 못했어요</span><h1>잠시 후 다시<br>펼쳐주세요.</h1><p>${esc(error.message || '처음 연결할 때는 인터넷이 필요해요.')}</p><button class="button button-primary" id="retry-load">다시 불러오기</button></main>`;
    document.querySelector('#retry-load')?.addEventListener('click', boot);
  }
}
boot();
