#!/usr/bin/env bash
# Renders every card into content/out/. Bundles once, then renders each still/video from the bundle.
#   bash remotion/render-all.sh                 everything (12 sign stills, 2 sign MP4s, all cohorts, all quotes)
#   VIDEOS="Aries Taurus Leo" bash remotion/render-all.sh   choose which signs get the 8 s vertical MP4
#   ONLY=signs|cohorts|quotes|videos bash remotion/render-all.sh
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROMIUM:-/opt/pw-browsers/chromium}"
OUT="../out"
VIDEOS="${VIDEOS:-Aries Taurus}"
ONLY="${ONLY:-all}"
mkdir -p "$OUT/signs" "$OUT/cohorts" "$OUT/quotes"

bun scripts/build-data.ts
npx remotion bundle src/index.ts --out-dir build --public-dir ../fonts >/dev/null
R=(--browser-executable="$CHROME" --chrome-mode=chrome-for-testing --log=error)

ids() { node -e "const d=require('./data/$1.json');console.log(d.$1.map(x=>x.$2).join('\n'))"; }

if [[ $ONLY == all || $ONLY == signs ]]; then
  for s in $(ids signs sign); do
    npx remotion still build SignCard "$OUT/signs/sign-${s,,}.png" --props="{\"sign\":\"$s\"}" "${R[@]}"
    echo "  signs/sign-${s,,}.png"
  done
fi
if [[ $ONLY == all || $ONLY == videos ]]; then
  for s in $VIDEOS; do
    npx remotion render build SignCardVertical "$OUT/signs/sign-${s,,}-vertical.mp4" --props="{\"sign\":\"$s\"}" --codec=h264 --crf=20 "${R[@]}"
    echo "  signs/sign-${s,,}-vertical.mp4"
  done
fi
if [[ $ONLY == all || $ONLY == cohorts ]]; then
  for c in $(ids cohorts id); do
    npx remotion still build CohortCard "$OUT/cohorts/cohort-$c.png" --props="{\"id\":\"$c\"}" "${R[@]}"
    echo "  cohorts/cohort-$c.png"
  done
fi
if [[ $ONLY == all || $ONLY == quotes ]]; then
  for q in $(ids quotes id); do
    npx remotion still build QuoteCard "$OUT/quotes/quote-$q.png" --props="{\"id\":\"$q\"}" "${R[@]}"
    echo "  quotes/quote-$q.png"
  done
fi
