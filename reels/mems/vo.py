import json, re, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro("/home/claude/sayless/tts/kokoro-v1.0.onnx", "/home/claude/sayless/tts/voices-v1.0.bin")
LINES = [
 "There's a tiny weight inside your phone that never sits still.",
 "It lives in a chip just two millimetres wide.",
 "Inside, a sliver of silicon hangs on microscopic springs.",
 "Around it are comb-like fingers, each thinner than a human hair.",
 "Tilt your phone, and gravity pulls the weight slightly to one side.",
 "The gaps between the fingers change, and so does the electric charge between them.",
 "The chip reads that change hundreds of times a second, in all three directions.",
 "That's how your screen knows when to rotate. And how your phone counts your steps.",
]
GAP = [0.35, 0.35, 0.3, 0.35, 0.3, 0.3, 0.3, 0.0]
sr = 24000; out = [np.zeros(int(0.3*sr))]; meta = []; t = 0.3
for line, g in zip(LINES, GAP):
    s, sr = k.create(line, voice="am_michael", speed=1.1, lang="en-us")
    a = np.abs(s); idx = np.where(a > 0.01)[0]; s = s[max(0, idx[0]-240): idx[-1]+480]
    d = len(s)/sr; meta.append({"text": line, "start": round(t,3), "end": round(t+d,3)})
    out += [s, np.zeros(int(g*sr))]; t += d + g
sf.write("vo.wav", np.concatenate(out), sr)
words=[]
for li,l in enumerate(meta):
    ws=l['text'].split()
    wt=[len(re.sub(r'[^\w]','',w))+1.5+(2.5 if re.search(r'[,:.]$',w) else 0) for w in ws]
    tot=sum(wt); tt=l['start']; dur=l['end']-l['start']
    for w,x in zip(ws,wt):
        dd=dur*x/tot; words.append({'w':w,'s':round(tt,3),'e':round(tt+dd,3),'line':li}); tt+=dd
json.dump({"lines": meta, "total": round(t,3), "words": words}, open("vo.json","w"))
for m in meta: print(m['start'], m['end'], m['text'])
print(t)
