# AI Engineer 개념서

**[개념서 열기](https://apple4ree.github.io/ai-study/)**

공학 수학, CS, ML/DL을 장과 절 단위로 읽는 모바일 학습 리더입니다. 기초부터 수학 심화·선택 과정까지 Notion 개념서 44장의 전체 본문, 그림 37개, 복습 문제와 풀이 165개를 포함합니다. 각 장 끝에는 대학 강의·공식 문서·공개 교재 등의 참고문헌을 그대로 남겼습니다.

- CS 면접 준비: 6개 분야의 답변·꼬리질문 60개, 계산 예제와 4시간 복습 순서
- 절 단위 읽기와 목차, 본문 검색, 이어 읽기
- 북마크와 ‘이해했어요 / 헷갈려요’ 복습 표시
- 글자 크기·줄 간격·화면 테마 설정
- 수식과 표의 가로 스크롤, 그림 확대, 접을 수 있는 풀이
- 홈 화면에 추가할 수 있는 PWA와 오프라인 읽기
- 학습 기록 내보내기·가져오기

## 휴대폰에서 사용

1. [사이트](https://apple4ree.github.io/ai-study/)를 엽니다.
2. iPhone Safari는 공유 → ‘홈 화면에 추가’, Android Chrome은 메뉴 → ‘홈 화면에 추가’로 설치할 수 있습니다.
3. 첫 접속에서 오프라인 저장이 끝나면 인터넷 없이 본문·수식·그림을 읽을 수 있습니다.

학습 기록은 현재 브라우저에 저장됩니다. 브라우저 데이터를 지우면 기록도 사라지므로 설정에서 기록을 내보내 백업하세요. 기기 사이 자동 동기화는 제공하지 않습니다. Notion 수정사항은 배포본에 실시간으로 반영되지 않습니다.

## 내용 구성

| 대단원 | 구성 |
| --- | --- |
| 공학 수학 | 기초 7장 · 심화 14장 · 선택 4장 |
| CS | 프로그래밍·자료구조·알고리즘·컴퓨터구조·운영체제·네트워크·DB·개발환경 등 10장 |
| ML/DL | 머신러닝·평가·딥러닝·Transformer·LLM·학습 시스템 등 9장 |

## 개발과 배포

Node.js 20 이상만 필요하며, 빌드와 실행에는 API 키·서버·npm 설치가 필요하지 않습니다. Markdown과 수식 렌더러는 라이선스와 함께 `vendor/`에 포함되어 있습니다.

```sh
npm run build
npm test
npm run preview
```

로컬 주소: `http://127.0.0.1:4173/ai-study/`

- `content/catalog.json`: 장 제목·분류
- `content/chapters/*.md`: 개념서 전체 Markdown
- `public/figures/*.svg`: Matplotlib으로 작성한 그림
- `src/`: 모바일 독서 화면과 브라우저 학습 기록
- `scripts/build.mjs`: Markdown·KaTeX 렌더링, 오프라인 파일 목록 생성
- `docs/`: GitHub Pages에 제공하는 완성 배포본

내용을 수정한 뒤 `npm run build`와 `npm test`를 실행하고 `docs/`까지 커밋합니다. GitHub Pages는 `main` 브랜치의 `/docs`를 배포합니다. 원본 Notion 응답이나 인증 정보는 배포하지 않습니다.

## 사용한 오픈소스

- [Marked](https://github.com/markedjs/marked) 15.0.12 — MIT, `vendor/marked/LICENSE.md`
- [KaTeX](https://github.com/KaTeX/KaTeX) 0.16.22 — MIT, `vendor/katex/LICENSE`

외부 자료는 참고문헌으로 연결하며, 외부 교재 전체를 복제하지 않습니다.
