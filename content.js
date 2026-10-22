// 진입점 (content script). 파일 선택 이벤트를 페이지보다 먼저 잡아서 처리한 뒤 다시 쏜다.
// 브라우저는 파일을 고르면 input → change 순서로 이벤트를 쏜다. 둘 다 window capture 단계에서 멈추고,
// change 때 처리한 다음 둘을 다시 쏜다. document_start에 등록하므로 페이지 리스너보다 항상 먼저다.

const CARD = 'upload-fit-card'; // 우리 UI의 호스트 태그
let replaying = false;
// 최근 클릭 (새 것부터). 업로드 트리거가 input과 DOM상 멀리 있는 사이트 대응 — Play Console은 모든 슬롯이 패널 속 input 하나를 공유한다
const recentClicks = [];
const latest = new WeakMap(); // input → 가장 최근 선택의 토큰. 예전 선택이 늦게 끝나 새 선택을 덮어쓰지 않게
const openCards = new WeakMap(); // input → 떠 있는 카드를 닫는 함수

window.addEventListener('click', e => {
  const path = e.composedPath();
  if (!(path[0] instanceof Element) || path.some(n => n.localName === CARD)) return; // 카드 자신의 문구("8MB 이하")를 규격으로 읽지 않게
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
  const token = {};
  latest.set(input, token);
  openCards.get(input)?.(); // 이전 선택의 카드가 떠 있으면 닫는다 — 그 선택은 버려진다
  const current = () => latest.get(input) === token;
  let out = files;
  let busy;
  try {
    const images = files.filter(f => f.type.startsWith('image/'));
    const spec = images.length ? withAccept(findSpec(input), input.accept) : null;
    const checks = [];
    if (spec) for (const f of images) { const c = await inspect(f, spec); if (c) checks.push(c); } // 한 장씩 (메모리)
    const need = new Set(checks.filter(c => c.needed).map(c => c.file));
    if (need.size && current()) {
      const fit = await ask(input, spec, checks);
      if (fit && current()) {
        busy = toast('규격에 맞추는 중…', 0);
        out = [];
        for (const f of files) out.push(need.has(f) ? await convert(f, spec, fit) : f); // 필요한 파일만
      }
    }
  } catch (e) {
    console.warn('[upload-fit]', e);
    toast(`규격에 맞추지 못해 원본을 넣었어요. (${e.message})`);
    out = files;
  } finally {
    busy?.remove();
  }
  if (!current()) return; // 그 사이 다시 골랐다 — 새 선택이 이긴다
  if (!input.isConnected) return void toast('업로드 칸이 닫혀서 파일을 넣지 못했어요. 다시 골라 주세요.');
  replay(input, out);
}

// 기준점 후보: 최근 클릭(새 것부터) → aria-describedby → input 자신. 후보마다 조상으로 올라가며 처음 나오는 규격을 쓴다.
// parseSpec은 슬롯 규격이 섞이면 null이므로, 너무 넓게 올라간 후보는 저절로 건너뛰고 다음 후보로 넘어간다.
function findSpec(input) {
  const clicks = recentClicks.filter(c => c.el.isConnected && Date.now() - c.at < 5 * 60e3).map(c => c.el);
  const described = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)).filter(Boolean);
  const seen = new Set();
  for (const start of [...clicks, ...described, input]) {
    for (let el = start; el; el = el.parentElement || el.getRootNode().host) {
      if (seen.has(el)) break; // 앞 후보가 이미 본 조상: 여기부터 위는 전부 null이었다
      seen.add(el);
      if (!el.checkVisibility()) continue; // 안 보이는 요소의 innerText는 줄바꿈 없이 합쳐져 줄 단위 판단이 깨진다
      const text = el.innerText;
      if (text.length > 10_000) break; // ponytail: 너무 넓으면 포기 — 페이지 전체의 엉뚱한 문구로 오탐하느니 안 하는 게 낫다. Play는 패널을 열어도 6천 자대
      const spec = parseSpec(text);
      if (spec) return spec;
    }
  }
  return null;
}

// input의 accept도 형식 규격으로 쓴다 (".png"만 받는 칸에 JPEG를 넣지 않게). 안내문과 겹치면 교집합.
function withAccept(spec, accept) {
  if (!spec) return null;
  const list = accept.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length || list.some(s => s === '*' || s.endsWith('/*'))) return spec;
  const fromAccept = [...new Set(list.map(s => FORMATS[s.replace(/^\.|^image\//, '')]).filter(Boolean))];
  if (!fromAccept.length) return spec;
  const both = spec.formats ? spec.formats.filter(f => fromAccept.includes(f)) : fromAccept;
  return { ...spec, formats: both.length ? both.sort() : spec.formats };
}

// 이미 규격에 맞는지, 맞추면 어떤 크기가 되는지. 손댈 수 없으면 null:
// 허용 형식을 canvas가 못 만들거나(PDF·GIF만), 못 읽는 이미지(HEIC 등)
async function inspect(file, spec) {
  if (!outputType(spec, false)) return null;
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  const [w, h] = [bmp.width, bmp.height];
  bmp.close();
  const cover = plan(w, h, spec, 'cover');
  const contain = plan(w, h, spec, 'contain');
  const typeOk = !spec.formats || spec.formats.includes(file.type.replace('image/', ''));
  const needed = cover.w !== w || cover.h !== h || !typeOk || (spec.maxBytes && file.size > spec.maxBytes);
  return { file, w, h, cover, contain, needed };
}

// 확인 카드. "맞춰서 넣기" → 'cover' | 'contain', "원본 그대로"·Esc·다시 고름 → null
function ask(input, spec, checks) {
  if (innerWidth < 360 || innerHeight < 240) return Promise.resolve(null); // 카드가 안 들어가는 작은 iframe — 묻지 않고 원본
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
    const done = v => { host.remove(); openCards.delete(input); resolve(v); };
    openCards.set(input, () => done(null));
    root.getElementById('apply').onclick = () => done(fit());
    root.getElementById('orig').onclick = () => done(null);
    root.addEventListener('keydown', e => { if (e.key === 'Escape') done(null); });
    isolate(host);
    document.documentElement.append(host);
    root.getElementById('apply').focus();
  });
}

function toast(message, ms = 6000) {
  const host = document.createElement(CARD);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `${STYLE}<div class="card" role="status"></div>`;
  root.querySelector('.card').textContent = message;
  isolate(host);
  document.documentElement.append(host);
  if (ms) setTimeout(() => host.remove(), ms);
  return host;
}

// 카드에서 난 이벤트가 페이지로 새지 않게 — 페이지의 "바깥 클릭/Esc로 닫기" 모달이 업로드 칸째 닫히는 걸 막는다.
// capture 단계에서 듣는 페이지 리스너는 못 막는다 (docs/design.md 리스크)
function isolate(host) {
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'focusin', 'focusout', 'input', 'change']) {
    host.addEventListener(type, e => e.stopPropagation());
  }
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
