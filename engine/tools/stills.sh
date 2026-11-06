#!/bin/bash
# usage: tools/stills.sh <Comp> <outdir> <frame> [frame...]  -> one contact sheet
set -e
B=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
comp=$1; out=$2; shift 2; mkdir -p $out; rm -f $out/f_*.png
for f in "$@"; do npx remotion still src/index.ts $comp $out/f_$(printf %05d $f).png --frame=$f --gl=swangle --browser-executable=$B --log=error >/dev/null; done
ffmpeg -loglevel error -y -pattern_type glob -i "$out/f_*.png" -vf "scale=360:-1,tile=4x$(( ($#+3)/4 ))" -frames:v 1 $out/sheet.png
