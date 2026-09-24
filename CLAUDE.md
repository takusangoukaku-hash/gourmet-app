# CLAUDE.md — 開発の決めごと

このリポジトリで作業する Claude Code / AI エージェント向けの指示。
ローカル・claude.ai/code（スマホ含む）・別PC、どの環境でもこの内容に従うこと。

## アプリ概要
BITEMAP: 料理写真で自分のグルメアルバムを作る PWA（静的サイト）。
Firebase(Auth/Firestore/Storage) でクラウド同期・SNS機能。詳細は README.md 参照。
ビルド工程なし（素の HTML/CSS/JS）。Node も不要。

## デプロイと反映（最重要）
- **変更は `main` ブランチに直接コミットして push する。ブランチも Pull Request も作らない。**
  （利用者が1人のため。利用者が明示的に PR を求めた場合のみ例外）
- push すると GitHub Pages が自動で再ビルドし、1〜2分で本番へ反映される。
  本番URL: https://takusangoukaku-hash.github.io/gourmet-app/
- 反映が始まらない時は Pages ビルドを手動リクエスト:
  `gh api -X POST repos/takusangoukaku-hash/gourmet-app/pages/builds`
- push 後は本番が新バージョンを配信しているか確認してから完了報告する:
  `curl -s "https://takusangoukaku-hash.github.io/gourmet-app/js/app.js?cb=$RANDOM" | grep APP_VERSION`
- スマホの PWA は Service Worker でキャッシュするため、反映後はアプリを
  完全に閉じて開き直す（切り替えに2回必要なことあり）。

## バージョン更新（変更のたびに必須）
コードを変更したら必ずバージョンを1つ繰り上げ、**4箇所を揃える**:
1. `js/app.js` の `const APP_VERSION = 'vNNN'`
2. `js/api.js` の `FILE_VERSION: 'vNNN'`
3. `sw.js` の `const VERSION = 'vNNN'`（コメントに変更概要も書く）
4. `index.html` の各アセットの `?v=NNN`（CSS 1 + スクリプト6 = 7箇所）

これを怠るとスマホが古いキャッシュを使い続け、変更が反映されない。
バージョンは単調増加（現在の最新は sw.js を見て +1）。

## コード構成
| ファイル | 役割 |
|---|---|
| `index.html` | 画面レイアウト（ホーム/検索/登録/地図/プロフィールの5タブ） |
| `css/style.css` | スタイル |
| `js/store.js` | データ層（店舗Shop/訪問Visit）。localStorage + 写真はIndexedDB |
| `js/api.js` | 外部API（Overpass/Nominatim/Photon/Yahoo!/ホットペッパー/Google）・EXIF・画像圧縮・AIジャンル判定・ジャンル定義。店舗検索は無料の検索源→Google は最後の手段（課金を避ける） |
| `js/register.js` | 登録フロー |
| `js/views.js` | 地図・一覧・写真・統計・プロフィール・投稿詳細の描画（最大のファイル） |
| `js/cloud.js` | Firebase 同期・SNS（フィード/いいね/コメント/フォロー/公開プロフィール） |
| `js/app.js` | タブ制御・共通イベント・設定・サンプルデータ・バックアップ（取り込み時に形式と型を検証） |
| `js/vendor/anthropic-sdk.js` | Anthropic 公式SDK 0.72.1 のブラウザ用バンドル（esbuild）。外部CDNから実行時に読み込まない |
| `firebase/*.rules` | Firestore / Storage の推奨セキュリティルール。コンソールに貼り付けて公開する |
| `tools/server.ps1` | ローカル確認用の簡易サーバー（PowerShell。UTF-8 BOM必須） |

## セキュリティの決めごと（v296〜）
- 他人由来の文字列（投稿・コメント・プロフィール・バックアップファイル）は必ず `esc()` を通すか、
  DOM API（textContent / img.src）で入れる。数値は `Number(x) || 0` で固定する。
- バックアップの取り込みは `app.js` の `sanitizeRecord()` を通す。localStorage のキーは許可リストのみ。
- 外部スクリプトはバージョン固定＋ `integrity` 属性。Anthropic SDK は `js/vendor/` に同梱。
- 別アカウントでのログイン時は端末データを消してから同期する（`cloud.js` の `gourmet.lastUid`）。
- 削除は `Store` の墓標（`gourmet.deleted.v1`）に残し、同期で復活させない。

## 規約・注意
- 星評価の表示は `views.js` の `starSvg(rating, size)` を使う（角丸SVG・ゴールドグラデ・半星対応）。
  入力用ボタンは `starBtn()`。文字の「★」ベタ塗りは使わない。
- 投稿詳細は `buildPostSection(p, close)`、ホーム一覧はカード型の `buildFeedCard(p, list, i)` で描画する（カードの写真タップで詳細が開く）。
- 他人の投稿では日付を出さない（`isMine` で判定済み）。
- `tools/*.ps1` を編集する場合は **UTF-8 with BOM** で保存する。
  Windows PowerShell 5.1 は BOM 無しを cp932 として読み、日本語コメントが壊れて構文エラーになる。
- ローカル確認: `tools/server.ps1` を起動して http://localhost:5959/ 、または
  一覧タブの「サンプルデータで試す」でデモデータを投入できる。

## サブアプリ: PFCログ（`diet/`）
- `diet/` 以下はダイエット記録用の別 PWA（食事PFC・体重グラフ・体型イラスト〔部位別筋肉量・股下を反映〕・自転車/筋トレ・写真AI推定）。詳細は `diet/README.md`。
- BITEMAP 本体とはコード・Service Worker・localStorage キー（`diet.*`）を分けている。本体側の変更で `diet/` を触る必要はない。
- **バージョン管理は本体と別**: `diet/js/app.js` の `APP_VERSION`、`diet/sw.js` の `VERSION` と `SHELL` の `?v=`、`diet/index.html` の `?v=`（CSS 1 + スクリプト 5 = 6箇所）を揃える。本体の `APP_VERSION` は変更しない。
- Anthropic SDK は `diet/js/vendor/anthropic-sdk.js` に本体と同じものをコピーして使う（本体の更新に巻き込まれないよう独立）。
- Service Worker のキャッシュ名は本体 `gourmet-*`、diet `diet-*`。**更新時に消してよいのは自分の接頭辞のキャッシュだけ**（v298 で本体側を修正済み）。
- 本番URL: https://takusangoukaku-hash.github.io/gourmet-app/diet/
