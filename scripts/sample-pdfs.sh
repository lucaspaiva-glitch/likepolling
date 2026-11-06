#!/bin/sh
# Prints the free sample reports (country, artist, company) to samples/*.pdf with headless Chrome.
# Usage: scripts/sample-pdfs.sh [base URL] [chrome binary]. Run weekly by .github/workflows/sample-pdfs.yml.
set -e
BASE="${1:-https://www.likepolling.com}"
CHROME="${2:-google-chrome}"
cd "$(dirname "$0")/.."
mkdir -p samples
for s in BR-PT:country artist:artist company:company; do
  "$CHROME" --headless=new --no-sandbox --disable-gpu --no-pdf-header-footer --run-all-compositor-stages-before-draw \
    --virtual-time-budget=45000 --print-to-pdf="samples/${s#*:}-report.pdf" "$BASE/report?sample=${s%%:*}"
  test -s "samples/${s#*:}-report.pdf"
done
