#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/public"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/data/processed"

cp "$ROOT_DIR/advisor-platform.html" "$OUT_DIR/index.html"
cp "$ROOT_DIR/advisor-app.js" "$OUT_DIR/advisor-app.js"
cp "$ROOT_DIR/simulator-db.js" "$OUT_DIR/simulator-db.js"
cp "$ROOT_DIR/simulator-engine.js" "$OUT_DIR/simulator-engine.js"
cp "$ROOT_DIR/data/processed/bdi_benchmarks_2022.js" "$OUT_DIR/data/processed/bdi_benchmarks_2022.js"

cat > "$OUT_DIR/_headers" <<'EOF'
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN

/advisor-app.js
  Cache-Control: public, max-age=900

/simulator-db.js
  Cache-Control: public, max-age=900

/simulator-engine.js
  Cache-Control: public, max-age=900

/data/processed/bdi_benchmarks_2022.js
  Cache-Control: public, max-age=900
EOF

printf 'Cloudflare Pages bundle ready in %s\n' "$OUT_DIR"
