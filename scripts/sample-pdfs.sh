#!/bin/sh
# Prints the free sample reports (country, artist, company) in every site language with headless Chrome,
# then uploads them to the public Supabase Storage bucket "samples" as <lang>/<type>-report.pdf.
# Usage: SUPABASE_URL=... SUPABASE_KEY=... scripts/sample-pdfs.sh [base URL] [chrome binary]
# Run weekly by .github/workflows/sample-pdfs.yml.
set -e
BASE="${1:-https://www.likepolling.com}"
CHROME="${2:-google-chrome}"
OUT="$(mktemp -d)"
for lang in en en-GB pt pt-PT es de ru uk ko ja; do
  for s in BR-PT:country artist:artist company:company; do
    f="$OUT/$lang-${s#*:}.pdf"
    "$CHROME" --headless=new --no-sandbox --disable-gpu --no-pdf-header-footer --run-all-compositor-stages-before-draw \
      --virtual-time-budget=45000 --print-to-pdf="$f" "$BASE/report?sample=${s%%:*}&lang=$lang" 2>/dev/null
    test -s "$f"
    curl -sf -X POST "${SUPABASE_URL%/}/storage/v1/object/samples/$lang/${s#*:}-report.pdf" \
      -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" -H "Content-Type: application/pdf" \
      -H "x-upsert: true" -H "Cache-Control: max-age=3600" --data-binary "@$f" > /dev/null
    echo "uploaded $lang/${s#*:}-report.pdf"
  done
done
