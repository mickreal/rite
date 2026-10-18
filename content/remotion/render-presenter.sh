#!/usr/bin/env bash
# Renders a presenter reel (remotion/presenter.json) to content/out/presenter/<id>.mp4.
#   bash remotion/render-presenter.sh script-6
# Media for each reel lives in content/out/presenter/<id>/ (git-ignored): the presenter clip(s) named in the segments
# and the VO take (`audio`). They are served over a local HTTP port because OffthreadVideo can't read file:// paths.
# An interim reel (`interimOf`: Anna taken out, no voice) needs no media: it gets a silent AAC track, and the brand
# soundtrack at export like every other video.
# Output: H.264 CRF 17, 30 fps, AAC 48 kHz, VO loudness-normalised to −16 LUFS / −2 dBTP like the other reels.
set -euo pipefail
cd "$(dirname "$0")"
ID="${1:?reel id from presenter.json}"
PORT="${PORT:-8873}"
OUT="../out/presenter"
CHROME="${CHROMIUM:-/opt/pw-browsers/chromium}"
# what the reel needs: "audio media" flags from reels.ts (resolved: interim reels have neither)
read -r HAS_AUDIO HAS_MEDIA < <(bun -e "import { getReel } from './src/reels.ts'; const r = getReel('$ID'); console.log(r.audio ? 1 : 0, r.audio || r.segments.some((s) => s.kind === 'presenter') ? 1 : 0)")
mkdir -p "$OUT"
if [[ $HAS_MEDIA == 1 ]]; then [[ -d "$OUT/$ID" ]] || { echo "missing $OUT/$ID (presenter clips + vo)"; exit 1; }; else mkdir -p "$OUT/$ID"; fi
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$OUT" >/dev/null 2>&1 &
SRV=$!; trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 0.5
npx remotion render src/index.ts PresenterReel "$OUT/$ID.raw.mp4" --props="{\"id\":\"$ID\",\"base\":\"http://127.0.0.1:$PORT\"}" \
  --browser-executable="$CHROME" --chrome-mode=chrome-for-testing --public-dir ../fonts --codec h264 --crf 17 --log=error
if [[ $HAS_AUDIO == 1 ]]; then
  # loudness: two-pass loudnorm on the VO, video copied
  M=$(ffmpeg -hide_banner -i "$OUT/$ID.raw.mp4" -af loudnorm=I=-16:TP=-2:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
  g() { echo "$M" | python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
  ffmpeg -hide_banner -loglevel error -y -i "$OUT/$ID.raw.mp4" -c:v copy \
    -af "loudnorm=I=-16:TP=-2:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true" \
    -ar 48000 -c:a aac -b:a 192k -movflags +faststart "$OUT/$ID.mp4"
else
  # no voice: a silent AAC track (schedulers want one; the soundtrack is mixed in at export)
  ffmpeg -hide_banner -loglevel error -y -i "$OUT/$ID.raw.mp4" -f lavfi -i anullsrc=r=48000:cl=stereo -map 0:v -map 1:a -c:v copy \
    -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT/$ID.mp4"
fi
rm -f "$OUT/$ID.raw.mp4"
echo "  presenter/$ID.mp4"
