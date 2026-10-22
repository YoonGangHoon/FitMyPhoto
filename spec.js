// 업로드 안내문 텍스트 → 규격 객체. 순수 함수: DOM·chrome.* 금지 (Node 테스트와 content script가 같이 쓴다).
// 반환: { sizes, minSide, maxSide, ratios, maxBytes, formats } 중 문구에 나온 키만. 규격이 없으면 null.

const BYTES = { kb: 1e3, mb: 1e6, gb: 1e9 }; // 1000 단위 — docs/design.md
const FORMATS = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp', heic: 'heic', bmp: 'bmp', tif: 'tiff', tiff: 'tiff', pdf: 'pdf' };

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const SIZE_RE = new RegExp(String.raw`(?<![\d.])${NUM}\s*(px|cm|mm)?\s*[xX×✕*]\s*${NUM}\s*(px|cm|mm)?`, 'g');
const BYTES_RE = new RegExp(String.raw`${NUM}\s*(kb|mb|gb)\b`, 'gi');
const RATIO_RE = new RegExp(String.raw`(?<![\d.:])${NUM}\s*:\s*${NUM}(?![\d.:])`, 'g');
const FORMAT_RE = /\b(jpe?g|png|gif|webp|heic|bmp|tiff?|pdf)\b/gi;

function parseSpec(text) {
  const t = text.replace(/(\d),(?=\d{3}(?!\d))/g, '$1'); // 1,024 → 1024
  const spec = {};

  const formats = [...new Set([...t.matchAll(FORMAT_RE)].map(m => FORMATS[m[1].toLowerCase()]))].sort();
  if (formats.length) spec.formats = formats;

  const limits = [...t.matchAll(BYTES_RE)]
    .filter(m => !/최소\s*$/.test(t.slice(0, m.index)) && !/^\s*이상/.test(t.slice(m.index + m[0].length)))
    .map(m => Math.round(m[1] * BYTES[m[2].toLowerCase()]) - (/^\s*미만/.test(t.slice(m.index + m[0].length)) ? 1 : 0));
  if (limits.length) spec.maxBytes = Math.min(...limits);

  const ratios = /비율|ratio/i.test(t) ? [...t.matchAll(RATIO_RE)].map(m => [+m[1], +m[2]]) : [];

  const sizes = [];
  for (const m of t.matchAll(SIZE_RE)) {
    const w = +m[1], h = +m[3], unit = m[4] || m[2];
    if (unit === 'cm' || unit === 'mm') { ratios.push([w, h]); continue; } // 물리 크기는 비율로만 쓴다 (DPI 가정 회피)
    const between = /^[^.,]{0,4}사이/.test(t.slice(m.index + m[0].length));
    if (between || (ratios.length && !ratios.some(r => sameRatio(r, [w, h])))) {
      // "320px X 3840px 사이", 또는 비율과 모순되는 A X B → 크기가 아니라 각 변의 범위
      spec.minSide = Math.min(w, h);
      spec.maxSide = Math.max(w, h);
    } else {
      sizes.push([w, h]);
    }
  }
  if (sizes.length) spec.sizes = sizes;
  if (ratios.length) spec.ratios = ratios;

  return Object.keys(spec).length ? spec : null;
}

function sameRatio([a, b], [c, d]) {
  return Math.abs(a / b - c / d) / (c / d) < 0.02;
}

if (typeof module === 'object') module.exports = { parseSpec };
