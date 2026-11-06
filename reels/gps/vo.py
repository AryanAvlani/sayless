import json, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro("/home/claude/sayless/tts/kokoro-v1.0.onnx", "/home/claude/sayless/tts/voices-v1.0.bin")
LINES = [
 "Your phone never talks to GPS satellites.",
 "It only listens.",
 "About thirty GPS satellites circle the Earth, more than twelve thousand miles up.",
 "Each one carries an atomic clock, and keeps broadcasting two things: the exact time, and where it is.",
 "That signal takes about seven hundredths of a second to reach you.",
 "Your phone times that delay from at least four satellites, and turns each one into a distance.",
 "Only one spot on Earth fits every distance.",
 "That's you. Accurate to about sixteen feet, without ever saying a word.",
]
GAP = [0.25, 0.45, 0.35, 0.35, 0.35, 0.3, 0.15, 0.0]
sr = 24000; out = []; meta = []; t = 0.35
out.append(np.zeros(int(0.35*sr)))
for line, g in zip(LINES, GAP):
    s, sr = k.create(line, voice="am_michael", speed=1.1, lang="en-us")
    # trim leading/trailing silence
    a = np.abs(s); idx = np.where(a > 0.01)[0]; s = s[max(0, idx[0]-240): idx[-1]+480]
    d = len(s)/sr; meta.append({"text": line, "start": round(t,3), "end": round(t+d,3)})
    out += [s, np.zeros(int(g*sr))]; t += d + g
vo = np.concatenate(out); sf.write("vo.wav", vo, sr)
json.dump({"lines": meta, "total": round(t,3)}, open("vo.json","w"), indent=1)
print(json.dumps(meta, indent=1), t)
