#!/usr/bin/env bash
# Builds the media for the script-6 re-cut (remotion/presenter.json "script-6-recut") from script 6's own take and
# Anna clip, so the re-cut costs nothing: the VO is cut at pauses (spans below, seconds in script-6/vo.mp3) and
# re-joined in the new order, with 10 ms fades at each cut; the Anna clip is copied as it is (the re-cut uses its
# first 3.47 s, "Your Saturn return is not a birthday. Nobody's is.").
#   bash scripts/presenter-recut.sh && bash remotion/render-presenter.sh script-6-recut
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=out/presenter/script-6 DST=out/presenter/script-6-recut
[[ -f $SRC/vo.mp3 && -f $SRC/anna-hook.mp4 ]] || { echo "missing $SRC/vo.mp3 or anna-hook.mp4 (script 6's media)"; exit 1; }
mkdir -p "$DST"
cp "$SRC/anna-hook.mp4" "$DST/anna-hook.mp4"
f() { echo "[0:a]atrim=$1:$2,asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=$(python3 -c "print(round($2-$1-0.01,3))"):d=0.01[$3]"; }
ffmpeg -v error -y -i "$SRC/vo.mp3" -filter_complex \
  "$(f 35.30 41.85 a);anullsrc=r=44100:cl=mono,atrim=0:0.3[g];$(f 0 3.47 b);$(f 13.55 22.60 c);$(f 42.15 46.106 d);[a][g][b][c][d]concat=n=5:v=0:a=1[o]" \
  -map "[o]" -ar 44100 -ac 1 -c:a libmp3lame -b:a 192k "$DST/vo.mp3"
echo "  $DST/vo.mp3 ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$DST/vo.mp3") s), $DST/anna-hook.mp4"
