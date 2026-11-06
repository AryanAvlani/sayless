import json, re, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro("/home/claude/sayless/tts/kokoro-v1.0.onnx", "/home/claude/sayless/tts/voices-v1.0.bin")
LINES = [
 "Your phone charger switches the power on and off over a hundred thousand times a second.",
 "Here's why.",
 "Your outlet pushes a hundred and twenty volts, flipping direction sixty times a second. Your battery wants about four volts, flowing one way.",
 "So first, the charger turns that back-and-forth current into one direction.",
 "Then a tiny switch chops it into rapid pulses, and a transformer steps the voltage down.",
 "The faster it switches, the smaller that transformer can be. That's why new chargers made with gallium nitride are so small.",
 "But no charger is perfect. It loses up to about a tenth of the energy, and all of it turns into heat.",
 "That's the warmth you feel when you touch it.",
]
GAP = [0.3, 0.35, 0.3, 0.3, 0.35, 0.35, 0.3, 0.0]
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
