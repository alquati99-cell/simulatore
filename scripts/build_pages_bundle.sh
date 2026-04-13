#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/public"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/data/processed" "$OUT_DIR/data/uploads"

cp "$ROOT_DIR/advisor-platform.html" "$OUT_DIR/index.html"
cp "$ROOT_DIR/advisor-app.js" "$OUT_DIR/advisor-app.js"
cp "$ROOT_DIR/simulator-db.js" "$OUT_DIR/simulator-db.js"
cp "$ROOT_DIR/simulator-engine.js" "$OUT_DIR/simulator-engine.js"
cp "$ROOT_DIR/data/processed/bdi_benchmarks_2022.js" "$OUT_DIR/data/processed/bdi_benchmarks_2022.js"
cp "$ROOT_DIR/cloudflare/pages-auth/_worker.js" "$OUT_DIR/_worker.js"

# Include uploaded risk datasets so a commit on main produces a deployable asset.
find "$ROOT_DIR" -maxdepth 1 -type f -name 'risk_db_*.json' -exec cp {} "$OUT_DIR/data/uploads/" \;

if [ -d "$ROOT_DIR/data/uploads" ]; then
  find "$ROOT_DIR/data/uploads" -maxdepth 1 -type f -name '*.json' -exec cp {} "$OUT_DIR/data/uploads/" \;
fi

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

/data/uploads/*.json
  Cache-Control: public, max-age=900
EOF

printf 'Cloudflare Pages bundle ready in %s\n' "$OUT_DIR"
