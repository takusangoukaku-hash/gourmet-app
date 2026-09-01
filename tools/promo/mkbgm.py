# 仮BGM（自動生成・軽快なポップ調）。 python3 mkbgm.py 出力.wav 秒数
import sys, numpy as np, wave
out_path=sys.argv[1]; total=float(sys.argv[2])
SR=44100; BPM=124; beat=60/BPM; n=int(SR*total); out=np.zeros(n)
def note(freq, start, dur, amp=0.18, kind='pluck'):
    i0=int(start*SR); i1=min(n,int((start+dur)*SR))
    if i1<=i0: return
    tt=np.arange(i1-i0)/SR; env=np.exp(-tt*(6 if kind=='pluck' else 2.2))*(1-np.exp(-tt*400))
    out[i0:i1]+=(np.sin(2*np.pi*freq*tt)*0.6+np.sin(2*np.pi*freq*2*tt)*0.25+np.sin(2*np.pi*freq*3*tt)*0.1)*env*amp
chords=[[261.63,329.63,392.0],[196.0,246.94,293.66],[220.0,261.63,329.63],[174.61,220.0,261.63]]
bass=[130.81,98.0,110.0,87.31]
arp=[[523.25,659.25,783.99,1046.5],[392.0,493.88,587.33,783.99],[440.0,523.25,659.25,880.0],[349.23,440.0,523.25,698.46]]
bar=0; time=0.0
while time<total:
    c=bar%4
    for b in range(4):
        tb=time+b*beat; note(bass[c], tb, beat*0.9, 0.22, 'pad')
        for f in chords[c]: note(f, tb, beat*0.5, 0.07)
        for s in range(2): note(arp[c][(b*2+s)%4], tb+s*beat/2, beat*0.45, 0.11)
    time+=4*beat; bar+=1
def kick(start):
    i0=int(start*SR); i1=min(n,i0+int(0.18*SR))
    if i1<=i0: return
    tt=np.arange(i1-i0)/SR; out[i0:i1]+=np.sin(2*np.pi*(60+120*np.exp(-tt*40))*tt)*np.exp(-tt*22)*0.5
def hat(start, amp):
    i0=int(start*SR); i1=min(n,i0+int(0.05*SR))
    if i1<=i0: return
    out[i0:i1]+=np.random.uniform(-1,1,i1-i0)*np.exp(-np.arange(i1-i0)/SR*120)*amp
time=0.0
while time<total:
    kick(time); kick(time+2*beat)
    for h in range(8): hat(time+h*beat/2, 0.05 if h%2 else 0.08)
    time+=4*beat
out=out/np.max(np.abs(out))*0.7
fi=int(1.2*SR); out[:fi]*=np.linspace(0,1,fi); fo=int(5*SR); out[-fo:]*=np.linspace(1,0,fo)
w=wave.open(out_path,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out*32767).astype(np.int16).tobytes()); w.close()
print('bgm ok', out_path)
