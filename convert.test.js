// plan(): 원본 크기 + 규격 → 출력 크기. 규격은 실제 안내문 원문을 parseSpec으로 읽어서 만든다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSpec, sameRatio } = require('./spec.js');
globalThis.sameRatio = sameRatio; // content script에선 spec.js가 먼저 로드되어 전역이다
const { plan, outputType } = require('./convert.js');

const PLAY_PHONE = parseSpec('휴대전화 스크린샷을 2~8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 320px X 3840px 사이여야 합니다.');
const PLAY_ICON = parseSpec('앱 아이콘은 PNG 또는 JPEG, 최대 1MB, 512 x 512px이어야 하며 디자인 사양 및 메타데이터 정책을 준수해야 합니다.');
const PLAY_XR = parseSpec('스크린샷을 4~8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 720px X 7680px이어야 합니다.');
const PLAY_TABLET10 = parseSpec('10인치 태블릿 스크린샷을 최대 8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 1,080px X 7,680px이어야 합니다.');
const PASSPORT = parseSpec('가로 413 픽셀(pixel), 세로 531 픽셀 사이즈 권장(가로 395~431 픽셀, 세로 507~550 픽셀 이내만 업로드 가능) ');
const QNET_MIN = parseSpec('- 크기 → 300 X 400 픽셀 이상');
const QNET_MAX = parseSpec('- 증명사진 파일(jpg형식을 확인 후, 상체가 너무 많이 나오지않았는지, 가로 300px 세로400px 이내인지 확인)');
const HISTORY = parseSpec('※ 사진 파일은 JPG 또는 GIF 형식만 가능합니다.');

test('Play 휴대전화: 1080×2340 캡처(2.17:1)를 cover면 9:16으로 잘라낸다', () => {
  assert.deepEqual(plan(1080, 2340, PLAY_PHONE, 'cover'), { w: 1080, h: 1920 });
});
test('Play 휴대전화: contain이면 가로에 여백을 붙인다', () => {
  assert.deepEqual(plan(1080, 2340, PLAY_PHONE, 'contain'), { w: 1316, h: 2340 });
});
test('Play 휴대전화: 이미 9:16이고 범위 안이면 그대로', () => {
  assert.deepEqual(plan(1080, 1920, PLAY_PHONE), { w: 1080, h: 1920 });
});
test('Play 앱 아이콘: 정확한 크기가 있으면 그 크기', () => {
  assert.deepEqual(plan(1000, 800, PLAY_ICON), { w: 512, h: 512 });
});
test('Play 10인치 태블릿: 아이폰 1170×2532를 9:16으로 자르고, 짧은 변 1080 이상이라 확대는 없음', () => {
  assert.deepEqual(plan(1170, 2532, PLAY_TABLET10), { w: 1170, h: 2080 });
});
test('Play XR: 짧은 변이 720 미만이면 확대한다', () => {
  assert.deepEqual(plan(400, 711, PLAY_XR), { w: 720, h: 1280 });
});
test('여권: 권장 크기 413×531이 있으면 그 크기 (범위보다 우선)', () => {
  assert.deepEqual(plan(3000, 4000, PASSPORT), { w: 413, h: 531 });
});
test('Q-Net "300 X 400 픽셀 이상": 작으면 키운다', () => {
  assert.deepEqual(plan(150, 200, QNET_MIN), { w: 300, h: 400 });
});
test('Q-Net "가로 300px 세로400px 이내": 크면 줄인다', () => {
  assert.deepEqual(plan(3000, 4000, QNET_MAX), { w: 300, h: 400 });
});
test('크기 규격이 없으면 원본 크기 그대로', () => {
  assert.deepEqual(plan(1234, 567, HISTORY), { w: 1234, h: 567 });
});

test('형식: 투명 영역이 있고 PNG 허용이면 PNG', () => assert.equal(outputType(PLAY_ICON, true), 'png'));
test('형식: 투명 영역이 없으면 JPEG 우선 (canvas PNG의 알파 채널 회피)', () => assert.equal(outputType(PLAY_ICON, false), 'jpeg'));
test('형식: JPG/GIF만 허용이면 JPEG (GIF는 canvas가 못 만든다)', () => assert.equal(outputType(HISTORY, false), 'jpeg'));
test('형식: 형식 규격이 없으면 JPEG', () => assert.equal(outputType(QNET_MIN, false), 'jpeg'));
