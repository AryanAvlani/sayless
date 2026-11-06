#!/bin/bash
# usage: tools/render.sh <Comp> <reel_dir> <final_name>   (run from engine/)
# renders the composition, muxes reel_dir/mix.wav, writes ../final/<name>.mp4, scans for blank frames
set -e
B=/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
comp=$1; reel=$2; name=$3; mkdir -p out ../final
npx remotion render src/index.ts $comp out/${name}_v.mp4 --gl=swangle --codec h264 --crf 16 --muted --browser-executable=$B --concurrency=2 --log=error
ffmpeg -loglevel error -y -i out/${name}_v.mp4 -i $reel/mix.wav -map 0:v -map 1:a -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset veryfast -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart ../final/$name.mp4
ffmpeg -loglevel error -i ../final/$name.mp4 -vf "scale=32:56,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - | grep -o "YAVG=[0-9.]*" | cut -d= -f2 | awk '{n++; if($1<20) low++; if(min==""||$1<min)min=$1} END{print "QC:", n, "frames, blank:", low+0, "min brightness:", min}'
ffmpeg -loglevel error -y -i ../final/$name.mp4 -vf "fps=1/2.5,scale=270:-1,tile=4x4" -frames:v 1 out/${name}_sheet.png
echo DONE $name
