# upload-fit

업로드 칸 근처 안내문(크기·용량·형식)을 읽고, 사용자가 고른 이미지를 그 규격에 맞게 변환해 업로드 칸에 넣어주는 Chrome 확장 (MV3).
대상: Play Console·App Store Connect 스크린샷, 원서 접수 사이트(토익 등) 증명사진.

설계·단계·가정: @docs/design.md
작업 전에 현재 단계를 확인하고, 단계가 끝나면 체크박스와 "확인된 사실"을 갱신한다.

## 명령
- 테스트: `node --test` 하나로 전부. Node 테스트(`spec.test.js`, `convert.test.js`) + `browser.test.js`가 headless Chrome을 CDP로 띄워
  `test.html`(DOM·canvas가 필요한 `content.js`·`convert.js`)의 결과를 하위 테스트로 가져온다. 2~3초.
  `.js`를 고치면 hook이 자동 실행하고 실패하면 결과를 돌려준다. `*.test.js` 수정 때는 건너뛴다.
- `test.html`의 가로채기 테스트는 `content.js`를 빼면 실패해야 한다 (가로챘다는 증거를 확인하는 테스트만 의미가 있다).
- 실제 사이트 검증은 확장 설치 없이도 된다: Claude in Chrome의 javascript_tool로 `spec.js`·`findSpec`을 페이지에 주입하고,
  `HTMLInputElement.prototype.click`을 막아 파일 선택창이 안 뜨게 한 뒤 실제 클릭으로 확인. 저장·업로드 버튼은 누르지 않는다.
- 브라우저 실행: `chrome://extensions` → 개발자 모드 → "압축해제된 확장 프로그램을 로드합니다" → 이 폴더.
  코드를 고친 뒤 **확장 카드 새로고침 + 대상 탭 새로고침** 둘 다 해야 반영된다.

## 구조
| 파일 | 역할 | 실행 환경 |
|---|---|---|
| `manifest.json` | MV3 선언. content script만 등록 (background·popup 없음) | — |
| `spec.js` | 안내문 텍스트 → 규격 객체 | 순수 함수. Node 테스트 |
| `convert.js` | 이미지 + 규격 → 변환된 `File`. `plan()`(출력 크기)만 순수 함수 | 브라우저 (OffscreenCanvas). `plan()`은 Node |
| `content.js` | 진입점: 클릭 기록, `input[type=file]` 가로채기, `findSpec`, 확인 카드 | 브라우저 |
| `spec.test.js` | 실제 사이트 안내문 원문 = 테스트 케이스 | Node |
| `convert.test.js` | `plan()`·`outputType()` | Node |
| `test.html` | 브라우저 테스트. content script처럼 `spec.js`→`convert.js`→`content.js` 순서로 먼저 로드 | headless Chrome |
| `browser.test.js` | `test.html` 실행기 (CDP, Node 내장 WebSocket) | Node + Chrome |

## 규칙
- 빌드 도구·npm 의존성을 추가하지 않는다. 필요해 보이면 먼저 사용자에게 묻는다.
- content script는 ES module이 아니다. 파일끼리는 manifest `js` 배열 순서 + 전역 함수로 공유하고,
  Node 테스트용으로 파일 끝에 `if (typeof module === 'object') module.exports = { ... }`를 둔다.
- `spec.js`에는 DOM·`chrome.*` API를 쓰지 않는다 (Node에서 돌아야 한다).
- 네트워크 요청 금지. 이미지는 브라우저 밖으로 나가지 않는다 — 이게 제품의 약속이다.
- 페이지에 그리는 UI는 전부 Shadow DOM 안에 둔다 (호스트 사이트 CSS와 격리).
- 규격을 못 찾으면 아무것도 하지 않는다 (원본 그대로 통과). 사용자가 확인 카드에서 승인하기 전엔 파일을 바꾸지 않는다.
- 사이트 이름을 하드코딩하지 않는다 (6단계 프리셋 폴백만 예외). 차별점이 "어느 사이트든 자동"이다.
- 테스트 케이스의 안내문은 실제 사이트 원문 그대로 붙인다. 지어내지 않는다. 출처 URL·수집일을 주석으로 남긴다.
  예외: 오탐 방지용 음성 케이스(안내문이 아닌 텍스트 → `null`)만 합성 허용. `spec.test.js`의 "합성" 블록에 따로 둔다.

## 기록
- 함정·결정은 `docs/learning/<주제>.md`에 쌓는다 (`/postmortem`). 확정된 사실만.
- 사용자는 크롬 확장이 처음이다. 새 개념(content script, `DataTransfer` 등)이 처음 나오면 한두 줄로 설명한다.
