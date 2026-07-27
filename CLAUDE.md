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
| `js/api.js` | 外部API（Overpass/Nominatim）・EXIF・画像圧縮・AIジャンル判定・ジャンル定義 |
| `js/register.js` | 登録フロー |
| `js/views.js` | 地図・一覧・写真・統計・プロフィール・投稿詳細の描画（最大のファイル） |
| `js/cloud.js` | Firebase 同期・SNS（フィード/いいね/コメント/フォロー/公開プロフィール） |
| `js/app.js` | タブ制御・共通イベント・設定・サンプルデータ |
| `tools/server.ps1` | ローカル確認用の簡易サーバー（PowerShell。UTF-8 BOM必須） |

## 規約・注意
- 星評価の表示は `views.js` の `starSvg(rating, size)` を使う（角丸SVG・ゴールドグラデ・半星対応）。
  入力用ボタンは `starBtn()`。文字の「★」ベタ塗りは使わない。
- 投稿詳細は `buildPostSection(p, close)`、ホーム一覧はカード型の `buildFeedCard(p, list, i)` で描画する（カードの写真タップで詳細が開く）。
- 他人の投稿では日付を出さない（`isMine` で判定済み）。
- `tools/*.ps1` を編集する場合は **UTF-8 with BOM** で保存する。
  Windows PowerShell 5.1 は BOM 無しを cp932 として読み、日本語コメントが壊れて構文エラーになる。
- ローカル確認: `tools/server.ps1` を起動して http://localhost:5959/ 、または
  一覧タブの「サンプルデータで試す」でデモデータを投入できる。
