#!/bin/bash
# 実機デモ動画の収録→トリム→BGM→埋め込み用再エンコード
SP=<scratch>
curl -s -o /dev/null -w '%{http_code}' http://localhost:5960/demo.html | grep -q 200 || { (setsid nohup python3 -m http.server 5960 --directory $SP/site >/dev/null 2>&1 &); for i in 1 2 3 4 5; do sleep 2; curl -s -o /dev/null -w '%{http_code}' http://localhost:5960/demo.html | grep -q 200 && break; done; }
FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
rm -rf $SP/demo/raw; cd $SP/demo && node record.js 2>&1 | grep -v agent-proxy | tail -1
RAW=$(ls $SP/demo/raw/*.webm | head -1)
$FF -y -i $RAW -r 30 -vsync cfr -c:v libx264 -crf 19 -pix_fmt yuv420p $SP/demo/full.mp4 2>&1 | tail -1 | cut -c1-80
python3 - <<PYE
import subprocess, json, glob, os
from PIL import Image
FF='$FF'; SP='$SP/demo'
marks=json.load(open(SP+'/marks.json')); ts=marks['trimSec']; t1=marks['marks'][0]['t']
t0=ts+t1-0.15
subprocess.run([FF,'-y','-ss',f'{t0:.2f}','-i',SP+'/full.mp4','-c:v','libx264','-crf','19','-pix_fmt','yuv420p','-r','30','-movflags','+faststart',SP+'/real_demo_v.mp4'],capture_output=True)
os.makedirs(SP+'/frames',exist_ok=True)
for name,off in (('intro1',1.0),('intro2',3.5),('home',7.5)):
    subprocess.run([FF,'-y','-ss',f'{off:.2f}','-i',SP+'/real_demo_v.mp4','-frames:v','1',SP+f'/frames/v2_{name}.png'],capture_output=True)
ims=[Image.open(SP+f'/frames/v2_{n}.png').convert('RGB').resize((640,360)) for n in ('intro1','intro2','home')]
W=Image.new('RGB',(1920,360),'white')
for i,im in enumerate(ims): W.paste(im,(i*640,0))
W.save(SP+'/frames/v2_open.png'); print('t0',round(t0,2),'marks',[(m['text'],round(m['t']-t1,1)) for m in marks['marks']])
PYE
DUR=$(python3 -c "
import subprocess,re
out=subprocess.run(['$FF','-i','$SP/demo/real_demo_v.mp4'],capture_output=True,text=True).stderr
m=re.search(r'Duration: (\d+):(\d+):([\d.]+)',out); print(round(int(m.group(2))*60+float(m.group(3)),2))"); FO=$(python3 -c "print(round($DUR-5,2))"); echo "demo $DUR"
$FF -y -i $SP/bgm/bgm_src.mp3 -t $DUR -af "loudnorm=I=-22:TP=-3:LRA=11,afade=t=in:st=0:d=1.5,afade=t=out:st=$FO:d=5.0" -ar 44100 $SP/demo/bgm_demo.wav 2>&1 | tail -1
$FF -y -i $SP/demo/real_demo_v.mp4 -i $SP/demo/bgm_demo.wav -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart $SP/demo/real_demo_bgm.mp4 2>&1 | tail -1
$FF -y -i $SP/demo/real_demo_bgm.mp4 -c:v libx264 -crf 25 -preset medium -c:a aac -b:a 96k -movflags +faststart $SP/final/demo_embed.mp4 2>&1 | tail -1
cp $SP/demo/real_demo_bgm.mp4 /root/data/real_demo_bgm.mp4; cp $SP/demo/real_demo_bgm.mp4 /home/user/gourmet-app/tools/final/real_demo.mp4; cp $SP/demo/real_demo_bgm.mp4 /home/user/gourmet-app/promo/bitemap_real_demo.mp4
ls -la $SP/demo/real_demo_bgm.mp4 $SP/final/demo_embed.mp4; echo "DEMO_DUR $DUR"; echo PIPELINE_DONE
