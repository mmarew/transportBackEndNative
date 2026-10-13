#!/usr/bin/env bash
# Regenerates the four INSA upload files from sources/.
set -euo pipefail
cd "$(dirname "$0")"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -x "$CHROME" ]; then
  CHROME="$(command -v google-chrome || command -v chromium || true)"
fi
if [ -z "$CHROME" ]; then
  echo "ERROR: Chrome/Chromium not found" >&2
  exit 1
fi

# Mermaid diagrams: refresh SVGs when the cached mermaid-cli is present.
MMDC="$HOME/.npm/_npx/d62b6517736c1e35/node_modules/.bin/mmdc"
if [ -x "$MMDC" ]; then
  echo "== Rendering diagram SVGs (mmdc) =="
  export PUPPETEER_EXECUTABLE_PATH="$CHROME"
  for mmd in sources/assets/*.mmd; do
    svg="${mmd%.mmd}.svg"
    "$MMDC" -i "$mmd" -o "$svg" -w 1600 >/dev/null 2>&1 || echo "WARN: mmdc failed for $mmd (keeping existing $(basename "$svg"))" >&2
  done
else
  echo "== mermaid-cli not cached; using existing SVGs =="
fi

echo "== Rendering SRS.pdf =="
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="SRS.pdf" "sources/srs.html" >/dev/null 2>&1

echo "== Rendering SDD.pdf =="
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="SDD.pdf" "sources/sdd.html" >/dev/null 2>&1

echo "== Building RequestResponse.zip =="
rm -f RequestResponse.zip
zip -qr RequestResponse.zip sources/request-response

echo "== Building API-Technical-Specifications-TDD-LLD.zip =="
rm -f API-Technical-Specifications-TDD-LLD.zip
zip -qr API-Technical-Specifications-TDD-LLD.zip sources/tdd

echo "== Done =="
ls -la SRS.pdf SDD.pdf RequestResponse.zip API-Technical-Specifications-TDD-LLD.zip
