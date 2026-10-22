// 진입점 (content script). 파일 선택 이벤트를 페이지보다 먼저 잡아서 처리한 뒤 다시 쏜다.
// 브라우저는 파일을 고르면 input → change 순서로 이벤트를 쏜다. 둘 다 window capture 단계에서 멈추고,
// change 때 처리한 다음 둘을 다시 쏜다. document_start에 등록하므로 페이지 리스너보다 항상 먼저다.

const CARD = 'upload-fit-card'; // 우리 UI의 호스트 태그
let replaying = false;
// 최근 클릭 (새 것부터). 업로드 트리거가 input과 DOM상 멀리 있는 사이트 대응 — Play Console은 모든 슬롯이 패널 속 input 하나를 공유한다
const recentClicks = [];

window.addEventListener('click', e => {
  const path = e.composedPath();
  if (path.some(n => n.localName === CARD)) return; // 카드 자신의 문구("8MB 이하")를 규격으로 읽지 않게
  recentClicks.unshift({ el: path[0], at: Date.now() });
  recentClicks.length = Math.min(recentClicks.length, 5);
}, true);

window.addEventListener('input', e => {
  if (!replaying && isFileInput(e.target) && e.target.files.length) e.stopImmediatePropagation();
}, true);

window.addEventListener('change', e => {
  const input = e.target;
  if (replaying || !isFileInput(input) || !input.files.length) return;
  e.stopImmediatePropagation();
  handle(input, [...input.files]);
}, true);

// 규격 찾기 → (맞출 게 있으면) 확인 카드 → 변환 → 다시 넣기. 어디서 실패하든 원본은 반드시 들어간다.
async function handle(input, files) {
  let out = files;
  try {
    const spec = findSpec(input);
    const images = files.filter(f => f.type.startsWith('image/'));
    const checks = spec && images.length ? (await Promise.all(images.map(f => inspect(f, spec)))).filter(Boolean) : [];
    if (checks.some(c => c.needed)) {
      const fit = await ask(spec, checks);
      if (fit) out = await Promise.all(files.map(f => convert(f, spec, fit)));
    }
  } catch (e) {
    console.warn('[upload-fit]', e);
    toast(`규격에 맞추지 못해 원본을 넣었어요. (${e.message})`);
    out = files;
  }
  replay(input, out);
}

// 이미 규격에 맞는지, 맞추면 어떤 크기가 되는지. 못 읽는 이미지(HEIC 등)는 null — 손대지 않는다.
async function inspect(file, spec) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  const [w, h] = [bmp.width, bmp.height];
  const cover = plan(w, h, spec, 'cover');
  const contain = plan(w, h, spec, 'contain');
  const typeOk = !spec.formats || spec.formats.includes(file.type.replace('image/', ''));
  const needed = cover.w !== w || cover.h !== h || !typeOk || (spec.maxBytes && file.size > spec.maxBytes);
  return { file, w, h, cover, contain, needed };
}

// 확인 카드. "맞춰서 넣기" → 'cover' | 'contain', "원본 그대로"·Esc → null
function ask(spec, checks) {
  return new Promise(resolve => {
    const host = document.createElement(CARD);
    const root = host.attachShadow({ mode: 'open' });
    const first = checks.find(c => c.needed);
    const canFit = checks.some(c => c.cover.w !== c.contain.w || c.cover.h !== c.contain.h);
    root.innerHTML = `${STYLE}
      <div class="card" role="dialog" aria-labelledby="t" aria-describedby="d">
        <p class="title" id="t">업로드 규격에 맞출까요?</p>
        <p class="spec" id="d"></p>
        <p class="file"><span id="from"></span> → <b id="to"></b><span id="more"></span></p>
        ${canFit ? `<fieldset><legend>비율이 다를 때</legend>
          <label><input type="radio" name="fit" value="cover" checked> 잘라내기</label>
          <label><input type="radio" name="fit" value="contain"> 여백 넣기</label></fieldset>` : ''}
        <div class="actions"><button id="orig" type="button">원본 그대로</button><button id="apply" type="button" class="primary">맞춰서 넣기</button></div>
      </div>`;
    // 파일 이름 등 바깥 값은 textContent로만 넣는다
    root.getElementById('d').textContent = describeSpec(spec);
    root.getElementById('from').textContent = `${first.file.name} ${first.w}×${first.h}`;
    root.getElementById('more').textContent = checks.length > 1 ? ` 외 ${checks.length - 1}장` : '';
    const fit = () => root.querySelector('input[name=fit]:checked')?.value || 'cover';
    const preview = () => { root.getElementById('to').textContent = `${first[fit()].w}×${first[fit()].h}`; };
    preview();
    root.addEventListener('change', preview);
    const done = v => { host.remove(); resolve(v); };
    root.getElementById('apply').onclick = () => done(fit());
    root.getElementById('orig').onclick = () => done(null);
    root.addEventListener('keydown', e => { if (e.key === 'Escape') done(null); });
    document.documentElement.append(host);
    root.getElementById('apply').focus();
  });
}

function toast(message) {
  const host = document.createElement(CARD);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `${STYLE}<div class="card" role="status"></div>`;
  root.querySelector('.card').textContent = message;
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 6000);
}

function describeSpec(s) {
  const px = ([w, h]) => `${w}×${h}`;
  const parts = [];
  if (s.sizes) parts.push(s.sizes.map(px).join(' 또는 '));
  if (s.minSize && s.maxSize) parts.push(`${s.minSize[0]}~${s.maxSize[0]}×${s.minSize[1]}~${s.maxSize[1]}`);
  else if (s.minSize) parts.push(`${px(s.minSize)} 이상`);
  else if (s.maxSize) parts.push(`${px(s.maxSize)} 이하`);
  if (s.minSide) parts.push(`변 ${s.minSide}~${s.maxSide}px`);
  if (s.ratios) parts.push(s.ratios.map(r => r.join(':')).join(' 또는 '));
  if (s.maxBytes) parts.push(`${s.maxBytes >= 1e6 ? `${+(s.maxBytes / 1e6).toFixed(1)}MB` : `${Math.ceil(s.maxBytes / 1e3)}KB`} 이하`);
  if (s.formats) parts.push(s.formats.map(f => f.toUpperCase()).join('/'));
  return parts.join(' · ');
}

const STYLE = `<style>
  :host { all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; color-scheme: light dark;
    font: 14px/1.5 system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
  .card { box-sizing: border-box; width: 340px; max-width: calc(100vw - 32px); padding: 16px; border-radius: 12px;
    background: Canvas; color: CanvasText; border: 1px solid #8885; box-shadow: 0 8px 28px #0004; }
  p { margin: 0 0 8px; } .title { font-weight: 600; } .spec, .file { font-size: 13px; opacity: .85; }
  fieldset { border: 0; padding: 0; margin: 4px 0 12px; display: flex; gap: 12px; } legend { font-size: 12px; opacity: .7; margin-bottom: 4px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid #8886; background: transparent; color: inherit; cursor: pointer; }
  button.primary { background: #1a73e8; border-color: #1a73e8; color: #fff; }
  button:focus-visible, input:focus-visible { outline: 2px solid #1a73e8; outline-offset: 2px; }
</style>`;

// 기준점 후보: 최근 클릭(새 것부터) → aria-describedby → input 자신. 후보마다 조상으로 올라가며 처음 나오는 규격을 쓴다.
// parseSpec은 슬롯 규격이 섞이면 null이므로, 너무 넓게 올라간 후보는 저절로 건너뛰고 다음 후보로 넘어간다.
function findSpec(input) {
  const clicks = recentClicks.filter(c => Date.now() - c.at < 5 * 60e3).map(c => c.el);
  const described = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)).filter(Boolean);
  for (const start of [...clicks, ...described, input]) {
    for (let el = start; el; el = el.parentElement || el.getRootNode().host) {
      const spec = parseSpec(el.innerText || '');
      if (spec) return spec;
    }
  }
  return null;
}

function replay(input, files) {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  input.files = dt.files;
  replaying = true;
  try {
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } finally {
    replaying = false;
  }
}

function isFileInput(el) {
  return el instanceof HTMLInputElement && el.type === 'file';
}
