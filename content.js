// 진입점 (content script). 파일 선택 이벤트를 페이지보다 먼저 잡아서 처리한 뒤 다시 쏜다.
// 브라우저는 파일을 고르면 input → change 순서로 이벤트를 쏜다. 둘 다 window capture 단계에서 멈추고,
// change 때 처리한 다음 둘을 다시 쏜다. document_start에 등록하므로 페이지 리스너보다 항상 먼저다.

let replaying = false;
// 최근 클릭 (새 것부터). 업로드 트리거가 input과 DOM상 멀리 있는 사이트 대응 — Play Console은 모든 슬롯이 패널 속 input 하나를 공유한다
const recentClicks = [];

window.addEventListener('click', e => {
  recentClicks.unshift({ el: e.composedPath()[0], at: Date.now() });
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

async function handle(input, files) {
  const spec = findSpec(input);
  console.debug('[upload-fit] 규격', spec);
  // TODO(4~5단계): 확인 카드 → 변환. 지금은 그대로 통과.
  replay(input, files);
}

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
