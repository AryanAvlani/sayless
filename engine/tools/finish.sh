#!/bin/bash
# usage: tools/finish.sh <reel_dir> <name>  — concat halves, mux mix.wav, QC, contact sheet (same settings as render.sh)
set -e
reel=$1; name=$2; mkdir -p ../final
printf "file '%s'\nfile '%s'\n" "$PWD/out/${name}_a.mp4" "$PWD/out/${name}_b.mp4" > out/${name}_list.txt
ffmpeg -loglevel error -y -f concat -safe 0 -i out/${name}_list.txt -c copy out/${name}_v.mp4
ffmpeg -loglevel error -y -i out/${name}_v.mp4 -i $reel/mix.wav -map 0:v -map 1:a -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset veryfast -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart ../final/$name.mp4
ffmpeg -loglevel error -i ../final/$name.mp4 -vf "scale=32:56,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - | grep -o "YAVG=[0-9.]*" | cut -d= -f2 | awk '{n++; if($1<20) low++; if(min==""||$1<min)min=$1} END{print "QC:", n, "frames, blank:", low+0, "min brightness:", min}'
ffmpeg -loglevel error -y -i ../final/$name.mp4 -vf "fps=1/2.5,scale=270:-1,tile=4x4" -frames:v 1 out/${name}_sheet.png
ls -la ../final/$name.mp4; echo DONE $name
