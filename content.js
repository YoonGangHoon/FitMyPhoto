// 진입점 (content script). 파일 선택 이벤트를 페이지보다 먼저 잡아서 처리한 뒤 다시 쏜다.
// 브라우저는 파일을 고르면 input → change 순서로 이벤트를 쏜다. 둘 다 window capture 단계에서 멈추고,
// change 때 처리한 다음 둘을 다시 쏜다. document_start에 등록하므로 페이지 리스너보다 항상 먼저다.

let replaying = false;

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
  // TODO(3~5단계): 규격 찾기 → 확인 카드 → 변환. 지금은 그대로 통과.
  replay(input, files);
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
