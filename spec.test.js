// 실제 사이트 안내문 원문 → 기대 규격.
// 원문은 한 글자도 고치지 않는다 (지어낸 케이스 금지 — CLAUDE.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSpec } = require('./spec.js');

const MB = 1000 * 1000; // 1000 단위: 사이트가 1024 단위여도 항상 한도 안에 들어간다
const PNG_JPEG = ['jpeg', 'png']; // formats는 정규화 후 알파벳순

// Play Console > 기본 스토어 등록정보 > 그래픽 (2026-10-22 수집, 업로드 섹션 본문)
const play = [
  {
    name: 'Play 앱 아이콘',
    text: '앱 아이콘은 PNG 또는 JPEG, 최대 1MB, 512 x 512px이어야 하며 디자인 사양 및 메타데이터 정책을 준수해야 합니다.',
    want: { sizes: [[512, 512]], maxBytes: 1 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play 그래픽 이미지 — 천 단위 쉼표, 대문자 X',
    text: '그래픽 이미지는 PNG 또는 JPEG, 최대 15MB, 1,024px X 500px이어야 합니다. 앱을 추천하도록 선택하면 이 이미지가 사용됩니다. 자세히 알아보기',
    want: { sizes: [[1024, 500]], maxBytes: 15 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play 휴대전화 스크린샷 — "A X B 사이"는 크기가 아니라 변 범위',
    text: '휴대전화 스크린샷을 2~8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 320px X 3840px 사이여야 합니다.',
    want: { minSide: 320, maxSide: 3840, ratios: [[16, 9], [9, 16]], maxBytes: 8 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play 7인치 태블릿 스크린샷',
    text: '7인치 태블릿 스크린샷을 최대 8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 320px X 3840px 사이여야 합니다.',
    want: { minSide: 320, maxSide: 3840, ratios: [[16, 9], [9, 16]], maxBytes: 8 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play 10인치 태블릿 — "사이"가 없어도 비율(16:9)과 모순되는 A X B는 변 범위',
    text: '10인치 태블릿 스크린샷을 최대 8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 1,080px X 7,680px이어야 합니다.',
    want: { minSide: 1080, maxSide: 7680, ratios: [[16, 9], [9, 16]], maxBytes: 8 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play 데스크톱 스크린샷',
    text: '스크린샷을 4~8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 1,080px X 7,680px이어야 합니다.',
    want: { minSide: 1080, maxSide: 7680, ratios: [[16, 9], [9, 16]], maxBytes: 8 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play Android XR 스크린샷 — 쉼표 없는 7680',
    text: '스크린샷을 4~8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 720px X 7680px이어야 합니다.',
    want: { minSide: 720, maxSide: 7680, ratios: [[16, 9], [9, 16]], maxBytes: 8 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play 동영상 안내 — 규격 없음',
    text: 'YouTube URL을 입력하여 동영상을 추가합니다. 이 동영상은 공개 또는 일부 공개여야 하며 광고는 사용 중지되어 있고 연령 제한이 없어야 합니다.',
    want: null,
  },
];

for (const c of [...play]) {
  test(c.name, () => assert.deepEqual(parseSpec(c.text), c.want));
}
