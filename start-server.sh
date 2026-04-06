#!/bin/bash
# D&D Lite 로컬 서버 실행 스크립트
# 웹캠 + 외부 CDN 접근을 위해 localhost에서 실행해야 함

cd "$(dirname "$0")"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     D&D Lite — 로컬 서버 시작        ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

PORT=8080

# Python 3
if command -v python3 &>/dev/null; then
  echo "  → http://localhost:$PORT/splat-face-demo.html 을 브라우저에서 열어주세요"
  echo "  → 종료: Ctrl+C"
  echo ""
  python3 server.py $PORT

# Python 2 fallback
elif command -v python &>/dev/null; then
  echo "  → http://localhost:$PORT/splat-face-demo.html"
  echo ""
  python -m SimpleHTTPServer $PORT

# Node fallback
elif command -v npx &>/dev/null; then
  echo "  → http://localhost:$PORT/splat-face-demo.html"
  echo ""
  npx serve . -p $PORT

else
  echo "  ⚠ Python 또는 Node.js가 필요합니다."
  echo "  설치 후 다시 실행해주세요."
fi
