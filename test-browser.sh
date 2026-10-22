#!/usr/bin/env bash
# test.html을 headless Chrome으로 열어 결과(#out)를 출력한다. 실패가 있거나 시간 안에 안 끝나면 exit 1.
cd "$(dirname "$0")" || exit 1
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
out=$("$CHROME" --headless=new --disable-gpu --virtual-time-budget=10000 --dump-dom "file://$PWD/test.html" 2>/dev/null \
  | sed -n '/<pre id="out">/,/<\/pre>/p' | sed 's/<[^>]*>//g')
echo "$out"
echo "$out" | grep -q 'passed' && ! echo "$out" | grep -q 'not ok'
