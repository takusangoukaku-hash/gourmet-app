#!/bin/bash
# 紹介動画 v5 の収録→トリム→BGM→埋め込み用再エンコード
SP=<scratch>
curl -s -o /dev/null -w '%{http_code}' http://localhost:5960/promo5.html | grep -q 200 || { (setsid nohup python3 -m http.server 5960 --directory $SP/site >/dev/null 2>&1 &); for i in 1 2 3 4 5; do sleep 2; curl -s -o /dev/null -w '%{http_code}' http://localhost:5960/promo5.html | grep -q 200 && break; done; }
FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
rm -rf $SP/promo3/raw; cd $SP/promo3 && PW_PATH=/opt/node22/lib/node_modules/playwright CHROME_PATH=/opt/pw-browsers/chromium node record_v5.js $SP/promo3 http://localhost:5960 2>&1 | grep -v agent-proxy | tail -1
RAW=$(ls $SP/promo3/raw/*.webm | head -1)
# 収録の webm はシーク位置が不正確なので、まず固定フレームレートの mp4 に変換してから切り出す
$FF -y -i $RAW -r 30 -vsync cfr -c:v libx264 -crf 19 -pix_fmt yuv420p $SP/promo3/full.mp4 2>&1 | tail -1 | cut -c1-80
python3 - <<PYE
import subprocess, json, glob, os
from PIL import Image
FF='$FF'; SP='$SP/promo3'
marks=json.load(open(SP+'/marks.json')); ts=marks['trimSec']; t1=marks['marks'][0]['t']
# 動画の時刻はコンテキスト生成からの経過時間。S1 の直前（空白フレーム）から末尾まで
t0=ts+t1-0.15
subprocess.run([FF,'-y','-ss',f'{t0:.2f}','-i',SP+'/full.mp4','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-r','30','-movflags','+faststart',SP+'/noaudio.mp4'],capture_output=True)
for f in glob.glob('/tmp/_g*.png'): os.remove(f)
subprocess.run([FF,'-y','-i',SP+'/noaudio.mp4','-vf','fps=10,scale=96:54','/tmp/_g%04d.png'],capture_output=True)
runs=[]
for i,f in enumerate(sorted(glob.glob('/tmp/_g*.png'))):
    px=list(Image.open(f).convert('RGB').getdata()); dark=sum(1 for r,g,b in px if r<200 or b<150)/len(px)
    if dark<0.002:
        t=round(i/10,1)
        if runs and abs(t-runs[-1][1])<=0.15: runs[-1][1]=t
        else: runs.append([t,t])
print('t0',round(t0,2),'scene starts (blank runs):',runs)
for name,off in (('S1',1.5),('S1b',4.0),('S2',2.5)):
    tt=[m['t'] for m in marks['marks'] if m['text']==name[:2]][0]-t1+0.15+off
    subprocess.run([FF,'-y','-ss',f'{tt:.2f}','-i',SP+'/noaudio.mp4','-frames:v','1',SP+f'/frames/v6_{name}.png'],capture_output=True)
    Image.open(SP+f'/frames/v6_{name}.png').resize((960,540)).save(SP+f'/frames/v6_{name}_s.png')
print('ok')
PYE
DUR=$(python3 -c "
import subprocess,re
out=subprocess.run(['$FF','-i','$SP/promo3/noaudio.mp4'],capture_output=True,text=True).stderr
m=re.search(r'Duration: (\d+):(\d+):([\d.]+)',out); print(round(int(m.group(2))*60+float(m.group(3)),2))"); FO=$(python3 -c "print(round($DUR-5,2))"); echo "promo $DUR"
$FF -y -i $SP/bgm/bgm_src.mp3 -t $DUR -af "loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=1.2,afade=t=out:st=$FO:d=5.0" -ar 44100 $SP/promo3/bgm_real.wav 2>&1 | tail -1
$FF -y -i $SP/promo3/noaudio.mp4 -i $SP/promo3/bgm_real.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $SP/promo3/bitemap_intro_real.mp4 2>&1 | tail -1
$FF -y -i $SP/promo3/bitemap_intro_real.mp4 -c:v libx264 -crf 25 -preset medium -c:a aac -b:a 96k -movflags +faststart $SP/final/intro_embed.mp4 2>&1 | tail -1
cp $SP/promo3/bitemap_intro_real.mp4 /root/data/ && cp $SP/promo3/bitemap_intro_real.mp4 /home/user/gourmet-app/promo/bitemap_intro.mp4
ls -la $SP/promo3/bitemap_intro_real.mp4 $SP/final/intro_embed.mp4
echo PIPELINE_DONE
