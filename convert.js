// 이미지 + 규격 → 규격에 맞게 바꾼 File. 브라우저 전용 (createImageBitmap·OffscreenCanvas).
// plan()은 순수 함수라 Node에서도 테스트한다 (sameRatio는 spec.js의 전역).

const ENCODABLE = ['jpeg', 'png', 'webp']; // canvas가 만들 수 있는 형식

// 출력 크기. fit: 'cover'(비율이 안 맞으면 잘라냄) | 'contain'(여백을 붙임)
function plan(srcW, srcH, spec, fit = 'cover') {
  const r0 = srcW / srcH;
  if (spec.sizes) {
    const [w, h] = closest(spec.sizes, r0);
    return { w, h };
  }
  let w = srcW, h = srcH;
  if (spec.ratios && !spec.ratios.some(r => sameRatio(r, [w, h]))) {
    const [a, b] = closest(spec.ratios, r0);
    const r = a / b;
    // cover면 남는 쪽을 줄이고, contain이면 모자란 쪽을 늘린다
    if ((fit === 'cover') === (r0 > r)) w = h * r;
    else h = w / r;
  }
  const sMin = Math.max(0, ...(spec.minSize ? [spec.minSize[0] / w, spec.minSize[1] / h] : []), spec.minSide ? spec.minSide / Math.min(w, h) : 0);
  const sMax = Math.min(Infinity, ...(spec.maxSize ? [spec.maxSize[0] / w, spec.maxSize[1] / h] : []), spec.maxSide ? spec.maxSide / Math.max(w, h) : Infinity);
  const s = Math.min(Math.max(1, sMin), sMax); // 하한·상한이 충돌하면 상한이 이긴다 (넘치면 거부되니까)
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

// 원본 비율에 가장 가까운 [w, h] (로그 비율 거리)
function closest(list, r0) {
  return list.reduce((best, x) => (Math.abs(Math.log(x[0] / x[1] / r0)) < Math.abs(Math.log(best[0] / best[1] / r0)) ? x : best));
}

// 투명 영역이 있고 PNG가 허용되면 PNG, 아니면 JPEG 우선. canvas PNG는 항상 RGBA라서
// 알파 채널을 거부하는 곳(Apple, Play 그래픽)에 불필요하게 PNG를 내보내지 않는다.
// ponytail: 투명 없는 PNG가 꼭 필요하면 RGB PNG 인코더(CompressionStream('deflate'))로 업그레이드
function outputType(spec, alpha) {
  const allowed = (spec.formats || ENCODABLE).filter(f => ENCODABLE.includes(f));
  if (alpha && allowed.includes('png')) return 'png';
  if (allowed.includes('jpeg')) return 'jpeg';
  return allowed[0] || null; // null: canvas로 만들 수 있는 허용 형식이 없다 (예: GIF만)
}

async function convert(file, spec, fit = 'cover') {
  if (!file.type.startsWith('image/')) return file;
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); // EXIF 회전 반영
  const alpha = /png|webp|gif/.test(file.type) && hasAlpha(bmp);
  const type = outputType(spec, alpha);
  if (!type) return file;
  let { w, h } = plan(bmp.width, bmp.height, spec, fit);
  for (let tries = 0; tries < 12; tries++) {
    const blob = await encode(render(bmp, w, h, fit, type === 'png' && alpha), type, spec.maxBytes);
    if (blob) return new File([blob], rename(file.name, type), { type: blob.type, lastModified: Date.now() });
    // 품질을 낮춰도 용량을 못 맞춤 → 크기가 고정이 아니고 하한 위라면 줄여서 다시
    const [nw, nh] = [Math.round(w * 0.85), Math.round(h * 0.85)];
    if (spec.sizes || !aboveMin(nw, nh, spec)) break;
    [w, h] = [nw, nh];
  }
  throw new Error(`용량 ${spec.maxBytes}바이트 이하로 맞출 수 없음`);
}

function aboveMin(w, h, spec) {
  return (!spec.minSize || (w >= spec.minSize[0] && h >= spec.minSize[1])) && (!spec.minSide || Math.min(w, h) >= spec.minSide);
}

function render(bmp, w, h, fit, keepAlpha) {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!keepAlpha) {
    ctx.fillStyle = '#fff'; // 투명 영역과 contain 여백
    ctx.fillRect(0, 0, w, h);
  }
  const s = (fit === 'cover' ? Math.max : Math.min)(w / bmp.width, h / bmp.height);
  const [dw, dh] = [bmp.width * s, bmp.height * s];
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return canvas;
}

async function encode(canvas, type, maxBytes) {
  const at = quality => canvas.convertToBlob({ type: `image/${type}`, quality });
  const first = await at(0.92);
  if (!maxBytes || first.size <= maxBytes) return first;
  if (type === 'png') return null; // PNG는 품질 조절이 없다
  let [lo, hi, best] = [0.4, 0.92, null];
  for (let i = 0; i < 6; i++) {
    const q = (lo + hi) / 2;
    const b = await at(q);
    if (b.size <= maxBytes) [best, lo] = [b, q];
    else hi = q;
  }
  return best;
}

// 64×64로 줄여서 알파 < 255인 픽셀이 있는지 본다
function hasAlpha(bmp) {
  const ctx = new OffscreenCanvas(64, 64).getContext('2d');
  ctx.drawImage(bmp, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

function rename(name, type) {
  return `${name.replace(/\.[^.]+$/, '')}.${type === 'jpeg' ? 'jpg' : type}`;
}

if (typeof module === 'object') module.exports = { plan, outputType };
