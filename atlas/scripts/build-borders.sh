#!/usr/bin/env bash
# Rebuilds public/data/borders/*.json from the historical-basemaps dataset.
# Usage: bash scripts/build-borders.sh   (needs git + `npm i -g mapshaper`)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="${TMPDIR:-/tmp}/historical-basemaps"
OUT="$ROOT/public/data/borders"
[ -d "$TMP" ] || git clone --depth 1 https://github.com/aourednik/historical-basemaps.git "$TMP"
mkdir -p "$OUT"; rm -f "$OUT"/*.json
years=()
for f in "$TMP"/geojson/world_*.geojson; do
  y="$(basename "$f" .geojson)"; y="${y#world_}"
  case "$y" in bc123000|bc10000|bc8000|bc5000) continue;; esac
  if [[ "$y" == bc* ]]; then n="-${y#bc}"; else n="$y"; fi
  mapshaper -i "$f" -filter-fields NAME,SUBJECTO,PARTOF,BORDERPRECISION \
    -simplify 25% keep-shapes -o "$OUT/$n.json" format=topojson quantization=1e5 precision=0.001 >/dev/null 2>&1
  years+=("$n")
done
printf '%s\n' "${years[@]}" | sort -n | node -e '
  const ys=require("fs").readFileSync(0,"utf8").trim().split("\n").map(Number);
  require("fs").writeFileSync(process.argv[1], JSON.stringify({snapshots:ys}));
' "$OUT/index.json"
echo "Built ${#years[@]} snapshots into $OUT"
