#!/bin/bash
# usage: tools/render_half.sh <Comp> <name> <a|b>   (run from engine/) — renders half the frames (each half < 10 min)
set -e
B=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
comp=$1; name=$2; part=$3; mkdir -p out
N=$(npx remotion compositions src/index.ts --browser-executable=$B 2>/dev/null | awk -v c=$comp '$1==c{print $4}')
H=$(( N / 2 ))
if [ "$part" = a ]; then R="0-$((H-1))"; else R="$H-$((N-1))"; fi
echo "frames $N range $R"
npx remotion render src/index.ts $comp out/${name}_$part.mp4 --frames=$R --gl=swangle --codec h264 --crf 16 --muted --browser-executable=$B --concurrency=2 --log=error
echo PART_DONE $part
