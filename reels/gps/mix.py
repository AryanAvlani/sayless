import json, numpy as np, soundfile as sf
SR=48000
vo_meta=json.load(open('vo.json')); L=[(l['start'],l['end']) for l in vo_meta['lines']]
END=vo_meta['total']+2.6
N=int(END*SR); t=np.arange(N)/SR
vo,_=sf.read('vo48.wav'); vo=np.pad(vo,(0,max(0,N-len(vo))))[:N]
rng=np.random.default_rng(3)
def env(n,a=0.005,r=0.3):
    x=np.arange(n)/SR; return np.minimum(1,x/max(a,1e-4))*np.exp(-x/r)
def add(buf,sig,at):
    i=int(at*SR); j=min(len(buf),i+len(sig));
    if j>i: buf[i:j]+=sig[:j-i]
def lp(x,a):
    y=np.zeros_like(x); acc=0.0; a=np.broadcast_to(np.asarray(a,float),x.shape)
    for i in range(len(x)): acc+=a[i]*(x[i]-acc); y[i]=acc
    return y
# ---- music bed: soft pad chords (A minor - F - C - G), 4 s each, detuned saws softened
def note(f): return 440*2**((f-69)/12)
chords=[[57,60,64,69],[53,57,60,65],[48,55,60,64],[55,59,62,67]]
music=np.zeros(N)
seg=4.0
for k in range(int(END/seg)+1):
    ch=chords[k%4]; st=k*seg; n=int((seg+1.5)*SR); x=np.arange(n)/SR
    e=np.minimum(1,x/1.2)*np.minimum(1,np.maximum(0,(seg+1.5-x)/1.5))
    s=sum(np.sin(2*np.pi*note(m)*x*(1+d))*0.25 for m in ch for d in (-0.002,0.002))
    s+=0.35*np.sin(2*np.pi*note(ch[0]-12)*x)
    add(music,s*e,st)
# gentle pulse (sub plucks) for momentum from 4.8s
for b in np.arange(4.8,END-1.5,0.5):
    ch=chords[int(b//seg)%4]; n=int(0.4*SR); x=np.arange(n)/SR
    add(music,np.sin(2*np.pi*note(ch[0]-12)*x)*env(n,0.004,0.12)*0.5,b)
music=music/np.max(np.abs(music))
# ducking under voice
venv=np.convolve(np.abs(vo),np.ones(2400)/2400,mode='same'); venv=venv/venv.max()
duck=1-0.55*np.clip(venv*4,0,1)
music*=duck*np.minimum(1,t/1.0)*np.minimum(1,(END-t)/1.2)
# ---- sfx
sfx=np.zeros(N)
def whoosh(dur=0.7,seed=1):
    r=np.random.default_rng(seed); n=int(dur*SR); x=r.standard_normal(n); u=np.arange(n)/n
    y=lp(x,0.02+0.18*u)*np.sin(np.pi*u)**2; return y/np.max(np.abs(y))
def ping(f,dur=0.9):
    n=int(dur*SR); x=np.arange(n)/SR; return (np.sin(2*np.pi*f*x)+0.3*np.sin(2*np.pi*2*f*x))*env(n,0.002,0.25)
for i,at in enumerate([L[2][0],L[3][0],L[4][0],L[5][0],L[7][0]]):
    add(sfx,whoosh(0.8,i)*0.35,at-0.45)
for k in range(4):  # listen rings
    add(sfx,ping(1318.5,0.6)*0.12,L[1][0]+k*0.47)
add(sfx,ping(1567.98)*0.25,L[4][0]+0.4+1.8)
for i in range(4): add(sfx,ping([1046.5,1174.7,1318.5,1568][i])*0.22,L[5][0]+0.3+i*0.35+1.4)
for k in range(int((L[3][1]-L[3][0])*4)):   # clock ticks
    n=int(0.02*SR); add(sfx,rng.standard_normal(n)*env(n,0.0005,0.004)*0.12,L[3][0]+k*0.25)
# riser + impact for "That's you"
n=int(1.6*SR); x=np.arange(n)/SR; f=200+600*(x/1.6)**2
riser=np.sin(2*np.pi*np.cumsum(f)/SR)*(x/1.6)**2*0.25+lp(rng.standard_normal(n),0.1)*(x/1.6)**2*0.5
add(sfx,riser,L[7][0]-1.6)
n=int(2.5*SR); x=np.arange(n)/SR
add(sfx,(np.sin(2*np.pi*55*x)*0.8+np.sin(2*np.pi*note(69)*x)*0.15+np.sin(2*np.pi*note(76)*x)*0.12)*env(n,0.003,0.9),L[7][0])
# end chime
for k,m in enumerate([69,73,76,81]): add(sfx,ping(note(m),2.0)*0.15,vo_meta['total']+0.15+k*0.09)
mix=vo*1.0+music*0.13+sfx*0.5
mix=mix/np.max(np.abs(mix))*0.9
sf.write('mix.wav',np.stack([mix,mix],1),SR)
print('ok',END, 'vo rms',np.sqrt((vo**2).mean()),'music rms',np.sqrt(((music*0.13)**2).mean()))
