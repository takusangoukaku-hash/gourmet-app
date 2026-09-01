# 紹介動画の制作キット

- `promo.html` … 1920x1080 のシーン台本（アニメ＋アプリ実演）。`index.html` と同じ階層に `promo2.html` として置く
- `record.js` … Playwright で自動操作しながら収録。`node record.js 出力先 http://localhost:5960`
  - 環境変数 `PW_PATH`（playwrightの場所）`CHROME_PATH`（Chromium実行ファイル）`BGM_CREDIT`（エンドクレジット文）
- `mkbgm.py` … 仮BGM生成（`python3 mkbgm.py out.wav 68.1`）。本番は DOVA-SYNDROME「カナリアスキップ」を使う

仕上げ（ffmpeg）:
```
ffmpeg -ss <marks.json の trimSec> -i raw/*.webm -t <総尺> -c:v libx264 -crf 19 -pix_fmt yuv420p -r 30 noaudio.mp4
ffmpeg -i bgm.mp3 -t <総尺> -af "loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=1.2,afade=t=out:st=<総尺-5>:d=5" bgm.wav
ffmpeg -i noaudio.mp4 -i bgm.wav -c:v copy -c:a aac -b:a 192k -shortest final.mp4
```
