#!/usr/bin/env bash
# 배포용 zip: 확장에 필요한 파일만 (테스트·문서·설정 제외) → dist/upload-fit-<version>.zip
# 지인 공유(압축 풀고 "압축해제된 확장 프로그램 로드")와 Chrome 웹 스토어 업로드에 같은 zip을 쓴다.
cd "$(dirname "$0")" || exit 1
v=$(jq -r .version manifest.json)
mkdir -p dist && rm -f "dist/upload-fit-$v.zip"
zip -qr "dist/upload-fit-$v.zip" manifest.json spec.js convert.js content.js icons
echo "dist/upload-fit-$v.zip"
