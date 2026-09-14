# 決勝発表スライドの生成キット

- `build.js` … pptxgenjs で `BITEMAP_決勝発表.pptx` を生成（`npm i pptxgenjs` の上で `node build.js`）。
  画像は `shots/`、デモ動画は `promo/bitemap_intro.mp4` を埋め込む
- `shots.js` … Playwright でアプリ画面を撮り直す（`index.html` と `tools/promo/promo.html` を同じ階層で配信して実行）
- 生成物: `promo/BITEMAP_final_presentation.pptx`（本番用・動画入り）／`..._preview.pdf`（閲覧用・動画なし）
