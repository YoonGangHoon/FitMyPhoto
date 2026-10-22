// test.html을 headless Chrome에서 열고, #out에 찍힌 결과 줄을 node:test 테스트로 옮긴다.
// CDP(Chrome DevTools Protocol)를 Node 내장 WebSocket으로 직접 쓴다 — 의존성 없음.
// --dump-dom + --virtual-time-budget은 이미지 인코딩 같은 실제 비동기 작업을 기다려주지 않아서 이 방식을 쓴다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

test('브라우저 (test.html)', { skip: !existsSync(CHROME) && `Chrome 없음: ${CHROME}` }, async t => {
  const profile = mkdtempSync(path.join(tmpdir(), 'upload-fit-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const cdp = await connect(await devtoolsUrl(chrome));
    const { targetId } = await cdp.send('Target.createTarget', { url: pathToFileURL(path.join(__dirname, 'test.html')).href });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const out = await poll(async () => {
      const { result } = await cdp.send('Runtime.evaluate', { expression: "document.getElementById('out')?.textContent", returnByValue: true }, sessionId);
      return /passed$/.test(result.value || '') && result.value;
    }, 60_000);
    cdp.close();
    for (const line of out.split('\n').filter(l => /^(not )?ok - /.test(l))) {
      const [, not, rest] = line.match(/^(not )?ok - (.*)$/s);
      const [name, detail] = rest.split(' :: ');
      await t.test(name, () => assert.ok(!not, detail));
    }
  } finally {
    const exited = chrome.exitCode === null ? new Promise(r => chrome.once('exit', r)) : null;
    chrome.kill();
    await exited; // 종료 전에 지우면 Chrome이 아직 프로필에 쓰고 있어서 ENOTEMPTY
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
  }
});

function devtoolsUrl(proc) {
  return new Promise((resolve, reject) => {
    let err = '';
    proc.stderr.on('data', d => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
    proc.on('exit', code => reject(new Error(`Chrome이 바로 종료됨 (${code}): ${err}`)));
  });
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  };
  const send = (method, params, sessionId) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ send, close: () => ws.close() });
    ws.onerror = reject;
  });
}

async function poll(fn, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`test.html이 ${timeout}ms 안에 끝나지 않음`);
}
