// 업로드 안내문 텍스트 → 규격 객체. 순수 함수: DOM·chrome.* 금지 (Node 테스트와 content script가 같이 쓴다).
// 반환: { sizes, minSize, maxSize, minSide, maxSide, ratios, maxBytes, formats } 중 문구에 나온 키만. 없거나 모호하면 null.
//
// 줄 단위로 읽고, 요구 표현(이하·최대·~해 주세요…)이 있는 줄만 규격으로 인정한다.
// "크기: 1080x1920px" 같은 메타데이터 표시(Play 애셋 패널)를 걸러내기 위해서다.
// 줄끼리 같은 키에 다른 값을 말하면(한 화면에 슬롯이 여러 개) 어느 쪽인지 모르니 null.

const BYTES = { kb: 1e3, mb: 1e6, gb: 1e9 }; // 1000 단위 — docs/design.md
const FORMATS = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp', heic: 'heic', bmp: 'bmp', tif: 'tiff', tiff: 'tiff', pdf: 'pdf' };

const CUE = /이어야|여야|해야|이하|이내|미만|초과|이상|최대|최소|까지|사이|권장|기준|규격|제한|가능|허용|용량|형식|형태|확장자|업로드|등록|첨부|하세요|해\s*주세요|주십시오|바랍니다|합니다|가로\s*\(?\s*\d|\b(?:must|should|max(?:imum)?|min(?:imum)?|up to|between|less than|at least|no more than|required|allowed|accepted|only|recommended|formats?)\b/i;
const BETWEEN = /사이(?!즈)|between/i;
const MIN_Q = /이상|at least|or (?:more|larger)/i;
const MAX_Q = /이내|이하|미만|까지|at most|up to|or (?:less|smaller)/i;

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const RANGE = String.raw`${NUM}(?:\s*~\s*${NUM})?`;
const UNIT = String.raw`(px|pixels?|픽셀|cm|mm)?`;
// "가로 413 픽셀(pixel), 세로 531 픽셀" · "가로(120px), 세로(160px)" · "가로 395~431 픽셀, 세로 507~550 픽셀"
const WH_RE = new RegExp(String.raw`가로\s*\(?\s*${RANGE}\s*${UNIT}\s*\)?[^\d가-힣]{0,20}?세로\s*\(?\s*${RANGE}\s*${UNIT}\s*\)?`, 'gi');
// "512 x 512px" · "1024px X 500px" · "3.5cm*4.5cm" · "137 x 177 pixel"
const AXB_RE = new RegExp(String.raw`(?<![\d.])${NUM}\s*${UNIT}\s*[x×*]\s*${NUM}\s*${UNIT}`, 'gi');
const BYTES_RE = new RegExp(String.raw`${NUM}\s*(kb|mb|gb)\b`, 'gi');
const RATIO_RE = new RegExp(String.raw`(?<![\d.:])${NUM}\s*:\s*${NUM}(?![\d.:])`, 'g');
// 파일 이름의 확장자("07.png", "이름.jpg")는 형식 목록이 아니다
const FORMAT_RE = /(?<![\w가-힣]\.)\b(jpe?g|png|gif|webp|heic|bmp|tiff?|pdf)\b/gi;

function parseSpec(text) {
  const t = text
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1') // 1,024 → 1024
    .replace(/[∶：]/g, ':')
    .replace(/㎝/g, 'cm').replace(/㎜/g, 'mm')
    .replace(/[ｘＸ✕]/g, 'x');
  const spec = {};
  for (const line of t.split('\n')) {
    if (!CUE.test(line)) continue;
    for (const [k, v] of Object.entries(parseLine(line))) {
      if (k in spec && JSON.stringify(spec[k]) !== JSON.stringify(v)) return null;
      spec[k] = v;
    }
  }
  return Object.keys(spec).length ? spec : null;
}

function parseLine(line) {
  const spec = {};
  const after = m => line.slice(m.index + m[0].length);

  const formats = [...new Set([...line.matchAll(FORMAT_RE)].map(m => FORMATS[m[1].toLowerCase()]))].sort();
  if (formats.length) spec.formats = formats;

  const limits = [...line.matchAll(BYTES_RE)]
    .filter(m => !/최소\s*$/.test(line.slice(0, m.index)) && !/^\s*이상/.test(after(m)))
    .map(m => Math.round(m[1] * BYTES[m[2].toLowerCase()]) - (/^\s*미만/.test(after(m)) ? 1 : 0));
  if (limits.length) spec.maxBytes = Math.min(...limits);

  // 가로·세로 표현을 먼저 읽고 그 자리를 지운 뒤 A x B를 읽는다 (같은 숫자를 두 번 세지 않게)
  const wh = [...line.matchAll(WH_RE)];
  const masked = wh.reduce((s, m) => s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length), line);
  const dims = [
    ...wh.map(m => ({ m, w: [+m[1], +(m[2] ?? m[1])], h: [+m[4], +(m[5] ?? m[4])], unit: m[3] || m[6] })),
    ...[...masked.matchAll(AXB_RE)].map(m => ({ m, w: [+m[1], +m[1]], h: [+m[3], +m[3]], unit: m[2] || m[4] })),
  ];

  const ratios = /비율|ratio/i.test(line) ? [...line.matchAll(RATIO_RE)].map(m => [+m[1], +m[2]]).filter(([a, b]) => a && b) : [];
  const px = [];
  for (const d of dims) {
    if (!d.w[0] || !d.h[0]) continue; // 0이 든 값은 크기가 아니다 ("0x1F")
    const unit = (d.unit || '').toLowerCase();
    const small = [d.w[1] <= 20, d.h[1] <= 20];
    // cm·mm, 또는 단위 없는 작은 수("반명함판(3X4)")는 물리 크기 → 비율로만 쓴다 (DPI 가정 회피)
    if (unit === 'cm' || unit === 'mm' || (!unit && small[0] && small[1])) ratios.push([d.w[0], d.h[0]]);
    else if (!unit && (small[0] || small[1])) continue; // 단위 없이 한쪽만 작으면 크기가 아니다 ("3,000 x 2개")
    else px.push(d);
  }
  const uniqRatios = [...new Map(ratios.map(r => [r.join(':'), r])).values()];
  if (uniqRatios.length) spec.ratios = uniqRatios;

  const sizes = [];
  for (const { m, w: [w, wMax], h: [h, hMax] } of px) {
    const tail = after(m).match(/^[^\d,.(]*/)[0]; // 크기 바로 뒤, 다음 숫자·쉼표·마침표 전까지
    const head = line.slice(Math.max(0, m.index - 6), m.index);
    if (w !== wMax || h !== hMax) { spec.minSize = [w, h]; spec.maxSize = [wMax, hMax]; }
    else if (BETWEEN.test(tail)) Object.assign(spec, sideRange(w, h));
    else if (MIN_Q.test(tail) || /최소/.test(head)) spec.minSize = [w, h];
    else if (MAX_Q.test(tail) || /최대/.test(head)) spec.maxSize = [w, h];
    else if (uniqRatios.length && !uniqRatios.some(r => sameRatio(r, [w, h]))) Object.assign(spec, sideRange(w, h)); // 비율과 모순 → 변 범위
    else sizes.push([w, h]);
  }
  if (sizes.length) spec.sizes = sizes;
  return spec;
}

function sideRange(a, b) {
  return { minSide: Math.min(a, b), maxSide: Math.max(a, b) };
}

function sameRatio([a, b], [c, d]) {
  return Math.abs(a / b - c / d) / (c / d) < 0.02;
}

if (typeof module === 'object') module.exports = { parseSpec, sameRatio };
