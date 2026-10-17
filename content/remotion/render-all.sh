#!/usr/bin/env bash
# Renders every card into content/out/. Bundles once, then renders each still/video from the bundle.
#   bash remotion/render-all.sh                 everything (12 sign stills, 2 sign MP4s, all cohorts, all quotes)
#   VIDEOS="Aries Taurus Leo" bash remotion/render-all.sh   choose which signs get the 8 s vertical MP4
#   ONLY=signs|cohorts|quotes|videos|carousels|verticals bash remotion/render-all.sh   (or a comma list: ONLY=cohorts,quotes)
#   VERTICALS="CohortCard:aries-first-return QuoteCard:aries-sign-line" bash remotion/render-all.sh
#     a card on a 1080×1920 frame, 10 s with a slow push-in, for the TikTok / Reels slot
#     (→ cohorts/cohort-<id>-vertical.mp4, quotes/quote-<id>-vertical.mp4)
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROMIUM:-/opt/pw-browsers/chromium}"
OUT="../out"
VIDEOS="${VIDEOS:-Aries Taurus}"
VERTICALS="${VERTICALS:-}"
ONLY="${ONLY:-all}"
has() { [[ $ONLY == all || ,$ONLY, == *,$1,* ]]; }   # ONLY=cohorts,quotes picks several groups
mkdir -p "$OUT/signs" "$OUT/cohorts" "$OUT/quotes" "$OUT/carousels"

bun scripts/build-data.ts
npx remotion bundle src/index.ts --out-dir build --public-dir ../fonts >/dev/null
R=(--browser-executable="$CHROME" --chrome-mode=chrome-for-testing --log=error)

ids() { node -e "const d=require('./data/$1.json');console.log(d.$1.map(x=>x.$2).join('\n'))"; }

if has signs; then
  for s in $(ids signs sign); do
    npx remotion still build SignCard "$OUT/signs/sign-${s,,}.png" --props="{\"sign\":\"$s\"}" "${R[@]}"
    echo "  signs/sign-${s,,}.png"
  done
fi
if has videos; then
  for s in $VIDEOS; do
    npx remotion render build SignCardVertical "$OUT/signs/sign-${s,,}-vertical.mp4" --props="{\"sign\":\"$s\"}" --codec=h264 --crf=20 "${R[@]}"
    echo "  signs/sign-${s,,}-vertical.mp4"
  done
fi
if has cohorts; then
  for c in $(ids cohorts id); do
    npx remotion still build CohortCard "$OUT/cohorts/cohort-$c.png" --props="{\"id\":\"$c\"}" "${R[@]}"
    echo "  cohorts/cohort-$c.png"
  done
fi
if has quotes; then
  for q in $(ids quotes id); do
    npx remotion still build QuoteCard "$OUT/quotes/quote-$q.png" --props="{\"id\":\"$q\"}" "${R[@]}"
    echo "  quotes/quote-$q.png"
  done
fi
if has carousels; then
  for line in $(node -e "const d=require('./data/carousels.json');for(const c of d.carousels)c.slides.forEach((_,i)=>console.log(c.id+':'+(i+1)))"); do
    c=${line%%:*}; n=${line##*:}; f="$OUT/carousels/$c-$(printf %02d "$n").png"
    npx remotion still build CarouselSlide "$f" --props="{\"id\":\"$c\",\"n\":$n}" "${R[@]}"
    echo "  carousels/$(basename "$f")"
  done
fi
if has verticals; then
  for v in $VERTICALS; do
    card=${v%%:*}; id=${v##*:}; dir=cohorts; pre=cohort; [[ $card == QuoteCard ]] && { dir=quotes; pre=quote; }
    f="$OUT/$dir/$pre-$id-vertical.mp4"
    npx remotion render build VerticalCard "$f.v.mp4" --props="{\"card\":\"$card\",\"id\":\"$id\"}" --codec=h264 --crf=20 "${R[@]}"
    # add a silent AAC track, like the dial clips (some schedulers reject video with no audio stream)
    ffmpeg -y -hide_banner -loglevel error -i "$f.v.mp4" -f lavfi -i anullsrc=r=48000:cl=stereo -map 0:v -map 1:a -c:v copy -c:a aac -b:a 128k -shortest -movflags +faststart "$f"
    rm -f "$f.v.mp4"
    echo "  $dir/$pre-$id-vertical.mp4"
  done
fi
