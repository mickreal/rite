#!/usr/bin/env bash
# Renders every card into content/out/. Bundles once, then renders each still/video from the bundle.
#   bash remotion/render-all.sh                 everything (12 sign stills, 2 sign MP4s, all cohorts, all quotes)
#   VIDEOS="Aries Taurus Leo" bash remotion/render-all.sh   choose which signs get the animated vertical (VIDEOS=all: all twelve)
#   SIGNS_OUT=../out/signs-2026-v2 VIDEOS=all ONLY=videos bash remotion/render-all.sh   sign verticals into another folder
#   Card and sign verticals last their voiceover + 1.6 s (scripts/card-vo.ts, text in clips/card-vo.json); with a take
#   (ELEVENLABS_API_KEY, or VO_PROVIDER=files VO_DIR=<dir> with <dir>/cards/<card id>.wav, <dir>/signs/<slug>.wav)
#   each also gets a <name>_vo.mp4 next to the silent one.
#   ONLY=signs|cohorts|quotes|videos|carousels|verticals bash remotion/render-all.sh   (or a comma list: ONLY=cohorts,quotes)
#   SCALE=2 bash remotion/render-all.sh        4K masters (cards 2160×2700, verticals 2160×3840, CRF 14) into
#     content/out/master/<group>/; scripts/downscale.ts makes the 1080 upload copies (README "4K masters")
#   VERTICALS="CohortCard:aries-first-return QuoteCard:aries-sign-line" bash remotion/render-all.sh
#     a card on a 1080×1920 frame with a slow push-in, for the TikTok / Reels slot
#     (→ cohorts/cohort-<id>-vertical.mp4, quotes/quote-<id>-vertical.mp4)
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROMIUM:-/opt/pw-browsers/chromium}"
SCALE="${SCALE:-1}"
[[ $SCALE == 1 || $SCALE == 2 ]] || { echo "SCALE must be 1 or 2"; exit 1; }
OUT="../out"; CRF=20
[[ $SCALE == 2 ]] && { OUT="../out/master"; CRF=14; }   # masters; the 1080 upload copies come from scripts/downscale.ts
VIDEOS="${VIDEOS:-Aries Taurus}"
SIGNS_OUT="${SIGNS_OUT:-$OUT/signs}"
VERTICALS="${VERTICALS:-}"
ONLY="${ONLY:-all}"
has() { [[ $ONLY == all || ,$ONLY, == *,$1,* ]]; }   # ONLY=cohorts,quotes picks several groups
mkdir -p "$OUT/signs" "$OUT/cohorts" "$OUT/quotes" "$OUT/carousels" "$SIGNS_OUT"

bun scripts/build-data.ts
npx remotion bundle src/index.ts --out-dir build --public-dir ../fonts >/dev/null
R=(--browser-executable="$CHROME" --chrome-mode=chrome-for-testing --log=error)
[[ $SCALE == 2 ]] && R+=(--scale=2)

ids() { node -e "const d=require('./data/$1.json');console.log(d.$1.map(x=>x.$2).join('\n'))"; }
cardvo() { (cd .. && bun scripts/card-vo.ts "$@"); }   # seconds <key> | mux <key> <in> <out> (paths absolute)

if has signs; then
  for s in $(ids signs sign); do
    npx remotion still build SignCard "$OUT/signs/sign-${s,,}.png" --props="{\"sign\":\"$s\"}" "${R[@]}"
    echo "  signs/sign-${s,,}.png"
  done
fi
if has videos; then
  [[ $VIDEOS == all ]] && VIDEOS=$(ids signs sign)
  for s in $VIDEOS; do
    f="$(cd "$SIGNS_OUT" && pwd)/sign-${s,,}-vertical.mp4"; secs=$(cardvo seconds "signs/${s,,}")
    npx remotion render build SignCardVertical "$f.v.mp4" --props="{\"sign\":\"$s\",\"seconds\":$secs}" --codec=h264 --crf=$CRF "${R[@]}"
    cardvo mux "signs/${s,,}" "$f.v.mp4" "$f"; rm -f "$f.v.mp4"
    echo "  $f (${secs} s)"
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
    f="$(cd "$OUT/$dir" && pwd)/$pre-$id-vertical.mp4"; secs=$(cardvo seconds "cards/$pre-$id")
    npx remotion render build VerticalCard "$f.v.mp4" --props="{\"card\":\"$card\",\"id\":\"$id\",\"seconds\":$secs}" --codec=h264 --crf=$CRF "${R[@]}"
    # silent version with a silent AAC track (some schedulers reject video with no audio stream), plus _vo with a take
    cardvo mux "cards/$pre-$id" "$f.v.mp4" "$f"; rm -f "$f.v.mp4"
    echo "  $dir/$pre-$id-vertical.mp4 (${secs} s)"
  done
fi
