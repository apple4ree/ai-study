// Reading emphasis only: preserve the source text, code, and KaTeX markup.
const TERMS = {
  math: [
    '조건부기댓값', '조건부확률', '확률밀도함수', '확률질량함수', '누적분포함수',
    '최대우도추정', '최소제곱법', '중심극한정리', '큰 수의 법칙', '신뢰구간',
    '가설검정', '유의수준', '표본분포', '불편추정량', '일치추정량', '추정량',
    '고유벡터', '고유값', '특이값 분해', '특이값', '선형독립', '선형결합',
    '선형변환', '직교투영', '정규직교', '양의 정부호', '조건수', '의사역행렬',
    '기저', '벡터공간', '벡터', '행렬', '내적', '행렬곱', '행렬분해', '랭크', '영공간',
    '연쇄법칙', '편미분', '전미분', '방향미분', '그래디언트', '기울기', '헤시안',
    '목적함수', '제약조건', '볼록함수', '볼록성', '경사하강법', '라그랑주 승수',
    '쌍대성', '정지점', '국소 최솟값', '전역 최솟값', '수렴', '학습률',
    '조건부 독립', '독립성', '기댓값', '공분산', '분산', '사전분포', '사후분포',
    '가능도', '우도', '베이즈 정리', '엔트로피', '상호정보량', '교차엔트로피',
    'KL 발산', '정보량', '정상성', '마르코프 성질', '부동소수점', '반올림 오차',
    '절단 오차', '수치적 안정성', '이산화', '푸리에 변환', '라플라스 변환',
    '미분방정식', '경계조건', '초기조건', 'PCA', 'SVD', 'KKT',
  ],
  cs: [
    '최악 시간 복잡도', '평균 시간 복잡도', '분할상환 비용', '시간 복잡도',
    '공간 복잡도', '시간복잡도', '공간복잡도', '분할상환', '최악의 경우', '최악', '평균', '불변식',
    '추상 자료형', '동적 배열', '연결 리스트', '해시 테이블', '해시 함수',
    '적재율', '충돌', '이진 탐색 트리', '균형 트리', '우선순위 큐', '최소 힙',
    '인접 행렬', '인접 리스트', '스택', '큐', '재귀', '완전탐색', '이진 탐색',
    '동적 계획법', '탐욕법', '분할 정복', '백트래킹', '정렬', '메모이제이션',
    '캐시 지역성', '캐시 적중률', '가상 메모리', '페이지 폴트', '문맥 교환',
    '임계구역', '경쟁 상태', '교착상태', '상호배제', '동기화', '프로세스', '스레드',
    '트랜잭션', '격리 수준', '동시성', '원자성', '일관성', '인덱스', '정규화',
    '기본키', '외래키', '교착 상태', '멱등성', '지연시간', '처리량',
    '선형화 가능성', '최종 일관성', '합의', '복제', '샤딩', '로드밸런싱',
    '흐름 제어', '혼잡 제어', '핸드셰이크', '패킷', '직렬화', '역직렬화',
    '버전 관리', '예외 처리', '단위 테스트', '회귀 테스트', '자료구조',
    'TCP', 'UDP', 'HTTP', 'DNS', 'TLS', 'ACID', 'BFS', 'DFS', 'BST',
  ],
  ml: [
    '데이터 누수', '학습 데이터', '훈련 데이터', '검증 데이터', '테스트 데이터',
    '분포 이동', '과적합', '과소적합', '일반화', '편향', '분산', '교차검증',
    '정밀도', '재현율', '정확도', '손실함수', '목적함수', '경사하강법', '역전파',
    '연쇄법칙', '계산 그래프', '기울기 소실', '기울기 폭발', '학습률',
    '정규화', '규제', '가중치 감쇠', '드롭아웃', '배치 정규화', '잔차 연결',
    '자기지도학습', '대조학습', '지도학습', '비지도학습', '강화학습',
    '조건부확률', '최대우도', '교차엔트로피', '어텐션', '자기어텐션', '위치 인코딩',
    '토크나이저', '토큰화', '임베딩', '파인튜닝', '미세조정', '사전학습',
    '자기회귀', '디코딩', '컨텍스트', 'KV 캐시', '양자화', '증류',
    '검색 증강 생성', '도구 호출', '환각', '재시도', '가드레일', '평가 기준',
    '학습과 추론', '추론', '서빙', '모니터링', '재현성', '지연시간', '처리량',
    'Transformer', 'Attention', 'LoRA', 'RAG', 'Agent', 'RLHF', 'DPO',
  ],
};
const CAUTIONS = [
  '상관관계는 인과관계가 아니다', '보장하지 않는다', '보장하지는 않는다',
  '같은 뜻이 아니다', '동일하지 않다', '항상 성립하지 않는다',
  '구분해야 한다', '주의해야 한다', '주의할 점', '주의사항',
];
const COMPLEXITY = '(?:O|Θ|Ω)\\s*\\((?:[^()\\n<>]|\\([^()\\n<>]*\\)){1,64}\\)';
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const EXCLUDED = 'pre,code,a,h1,h2,h3,h4,h5,h6,summary,figcaption,.katex,math,.study-emphasis';

export function emphasizeProse(root, group, sectionTitle = '') {
  if (!root || root.dataset.emphasized) return;
  root.dataset.emphasized = 'true';
  root.classList.toggle('summary-prose', /핵심 정리|핵심 요약/.test(sectionTitle));
  const terms = TERMS[group] || TERMS.math;
  const pattern = new RegExp(`(${COMPLEXITY})|(${CAUTIONS.map(escapeRegExp).join('|')})|(${[...terms].sort((a,b) => b.length-a.length).map(escapeRegExp).join('|')})`, 'giu');
  const seen = new Set();
  const perBlock = new Map();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return parent && /\S/.test(node.data) && parent.closest('p,li,td,blockquote') && !parent.closest(EXCLUDED)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const block = node.parentElement.closest('p,li,td,blockquote');
    const alreadyStrong = Boolean(node.parentElement.closest('strong,b'));
    const fragment = document.createDocumentFragment();
    let cursor = 0, changed = false;
    pattern.lastIndex = 0;
    for (const match of node.data.matchAll(pattern)) {
      const [text, complexity, caution] = match;
      // English abbreviations must be whole words; Korean particles may follow a term.
      if (/^[A-Za-z]/.test(text) && /[A-Za-z0-9_]/.test(node.data[match.index-1] || '')) continue;
      if (!complexity && /[A-Za-z]$/.test(text) && /[A-Za-z0-9_]/.test(node.data[match.index+text.length] || '')) continue;
      const key = text.toLocaleLowerCase();
      if (!complexity && (alreadyStrong || seen.has(key) || (perBlock.get(block) || 0) >= 3)) continue;
      fragment.append(document.createTextNode(node.data.slice(cursor, match.index)));
      const mark = document.createElement(alreadyStrong ? 'span' : 'strong');
      mark.className = `study-emphasis study-${complexity ? 'complexity' : caution ? 'caution' : 'keyword'}`;
      mark.textContent = text;
      fragment.append(mark);
      cursor = match.index + text.length;
      changed = true;
      if (!complexity) { seen.add(key); perBlock.set(block, (perBlock.get(block) || 0) + 1); }
    }
    if (changed) { fragment.append(document.createTextNode(node.data.slice(cursor))); node.replaceWith(fragment); }
  }
  // Inline code and typeset complexity keep their original code/MathML trees.
  root.querySelectorAll('code').forEach(code => {
    if (!code.closest('pre') && new RegExp(`^${COMPLEXITY}$`, 'u').test(code.textContent.trim())) code.classList.add('study-complexity');
  });
  root.querySelectorAll('.katex').forEach(formula => {
    const tex = formula.querySelector('annotation')?.textContent.trim() || '';
    if (/^(?:O|Θ|Ω|\\(?:mathcal\{O\}|Theta|Omega))\s*(?:\\left)?\(/u.test(tex)) formula.classList.add('study-complexity');
  });
}
