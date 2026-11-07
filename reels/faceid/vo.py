import json, re, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro("/home/claude/sayless/tts/kokoro-v1.0.onnx", "/home/claude/sayless/tts/voices-v1.0.bin")
LINES = [
 "Your phone unlocks the moment it sees your face.",
 "So why can't a photo of you do the same?",
 "Above the screen, a tiny projector fires more than thirty thousand invisible dots of infrared light.",
 "Those dots land on your nose, your cheeks, your brow.",
 "An infrared camera reads where every dot lands, and builds a 3D depth map of your face.",
 "A photo is flat. It has no depth, so it can't pass.",
 "And the matching happens on the phone itself, not in the cloud.",
 "The odds a random stranger unlocks it? Less than one in a million.",
]
GAP = [0.15, 0.4, 0.35, 0.3, 0.35, 0.35, 0.35, 0.0]
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
