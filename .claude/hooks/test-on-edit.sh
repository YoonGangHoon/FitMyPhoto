#!/usr/bin/env bash
# PostToolUse(Edit|Write): .js를 고치면 node --test (Node 테스트 + browser.test.js가 headless Chrome으로 test.html 실행).
# 실패하면 exit 2 → stderr가 Claude에게 전달된다.
# *.test.js 수정은 건너뜀 — TDD red 단계에선 실패가 정상이라 소음만 된다.
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  *.test.js) exit 0 ;;
  *.js) ;;
  *) exit 0 ;;
esac
cd "$CLAUDE_PROJECT_DIR" || exit 0
out=$(node --test 2>&1) || { printf '%s\n' "$out" | grep -vE '^\s*✔' | tail -n 40 >&2; exit 2; }
