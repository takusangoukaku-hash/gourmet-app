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
4. `index.html` の各アセットの `?v=NNN`（CSS 1 + スクリプト7 = 8箇所。v326 で `js/import.js` が増えた）

これを怠るとスマホが古いキャッシュを使い続け、変更が反映されない。
バージョンは単調増加（現在の最新は sw.js を見て +1）。

## コード構成
| ファイル | 役割 |
|---|---|
| `index.html` | 画面レイアウト（ホーム/検索/登録/地図/プロフィールの5タブ。プロフィールの中は写真/統計） |
| `css/style.css` | スタイル |
| `js/store.js` | データ層（店舗Shop/訪問Visit）。localStorage + 写真はIndexedDB（v3: 本体 photos／一覧用メタ meta／サムネ thumbs の3ストア。一覧は meta だけを読む） |
| `js/api.js` | 外部API（OpenPOI/Overpass/Nominatim/Photon/Yahoo!/ホットペッパー/Google）・EXIF・画像圧縮・AIジャンル判定・ジャンル定義。店舗検索は OpenPOI（無料・キー不要）→地図データ→Google は最後の手段（課金を避ける）。OpenPOI 由来の店は `dataLicenses`/`dataAttributions` を一緒に保存し、設定画面の出典表示を消さない |
| `js/register.js` | 登録フロー |
| `js/import.js` | 過去の写真のまとめて取り込み（v326〜）。一度に最大100枚を「日付×場所」で訪問候補にまとめ、店名（既存の店→周辺検索の候補→入力）と★を付けて一括で記録。取り込み済みは指紋で除外、飛ばした写真は `gourmet.importSkipped.v1`。AI判定は `classifyDishPhoto(file, {bulk:true})`（Worker の別枠 1日200枚） |
| `js/views.js` | 地図・一覧・写真・統計・プロフィール・投稿詳細の描画（最大のファイル） |
| `js/cloud.js` | Firebase 同期・SNS（フィード/いいね/コメント/フォロー/公開プロフィール） |
| `js/app.js` | タブ制御・共通イベント・設定・サンプルデータ・バックアップ（取り込み時に形式と型を検証） |
| `js/vendor/anthropic-sdk.js` | Anthropic 公式SDK 0.72.1 のブラウザ用バンドル（esbuild）。外部CDNから実行時に読み込まない |
| `firebase/*.rules` | Firestore / Storage の推奨セキュリティルール。コンソールに貼り付けて公開する |
| `tools/server.ps1` | ローカル確認用の簡易サーバー（PowerShell。UTF-8 BOM必須） |
| `tools/proxy/` | 検索中継の Cloudflare Worker（`worker.js`）と設定手順（`README.md`）。Yahoo!/ホットペッパー/Google のキーは Worker の Secret に置き、アプリには置かない。アプリ側は `js/api.js` の `SEARCH_PROXY` に Worker の URL を書くだけ（利用者が⚙️で入れた自分のキーが優先）。v324〜 写真の AI ジャンル判定も `/classify` で中継（`ANTHROPIC_KEY`、Haiku 5.5、1端末1日30枚）。アプリ側は `Api.canClassify()`／`keySource('anthropic')` |

## 速さの決めごと（v298〜）
- 写真の一覧・グリッドは `Store.allPhotos()`（メタ情報のみ・本体を含まない）で描く。本体は `Store.getPhotoBlob(id)`、
  サムネは `Store.getThumb(id)` で1枚ずつ読む。`views.js` では `setThumb()` / `setFullPhoto()` / `fullPhotoUrl()` を使う。
  `rec.blob` を前提にしたコードを書かない（`rec.hasBlob` で判定）。
- 地図(MapLibre)・グラフ(Chart.js)・EXIF(exifr) は `App.loadLib(name)` で必要になった画面で読み込む。
  index.html に `<script>` を戻さない。ライブラリを足すときは `app.js` の `LIBS` に integrity 付きで追加する。
- Firebase SDK は最初の描画後（アイドル時）に読み込む。この端末でログインしたことがなければ、ログインを押すまで読まない。
- Service Worker: `?v=` 付きのファイルはキャッシュ優先（内容は版ごとに固定）。index.html だけネットワーク優先。

## セキュリティの決めごと（v296〜）
- 他人由来の文字列（投稿・コメント・プロフィール・バックアップファイル）は必ず `esc()` を通すか、
  DOM API（textContent / img.src）で入れる。数値は `Number(x) || 0` で固定する。
- バックアップの取り込みは `app.js` の `sanitizeRecord()` を通す。localStorage のキーは許可リストのみ。
- 外部スクリプトはバージョン固定＋ `integrity` 属性。Anthropic SDK は `js/vendor/` に同梱。
- 課金・登録制のキー（Google/Yahoo!/ホットペッパー）をリポジトリや `DEFAULT_KEYS` に書かない（公開リポジトリ＋静的サイトなので誰でも読める）。
  全利用者に提供するときは `tools/proxy/` の Worker 経由にする（v302〜）。
- 別アカウントでのログイン時は端末データを消してから同期する（`cloud.js` の `gourmet.lastUid`）。
- 削除は `Store` の墓標（`gourmet.deleted.v1`）に残し、同期で復活させない。

## 規約・注意
- 星評価の表示は `views.js` の `starSvg(rating, size)` を使う（角丸SVG・ゴールドグラデ・半星対応）。
  入力用ボタンは `starBtn()`。文字の「★」ベタ塗りは使わない。
- 投稿詳細は `buildPostSection(p, close)`、ホーム一覧は Pinterest 風カードの `buildFeedCard(p, list, i)` で描画する（v314〜。カードの写真タップで詳細が開く。
  カードは写真（投稿者の★バッジ・行きたい保存）・店名・投稿者・いいねの4要素に絞る（v323〜。ジャンル・県・一致率・全体評価・★5チップは詳細や検索へ）。
  「あなた向け評価」は `ratingPair().conf === 'ok'`（3人以上かつ一致率が出せる人2人以上）のときだけカードに出す。
  「あなた向け評価」は BITEMAP の中心の機能なので、カードを作り替えるときも消さない。
- 行きたい店の追加（v327〜）: `openWishAdd(prefill)`。店名か Google／Apple マップの共有リンク（文章ごと可）を `parseWishInput()` で店名・位置・住所に分解し、
  位置が無ければ `Api.searchShopsFast` の候補から選ぶ。入口は「まずは1皿」カード・行きたい一覧の `#wish-add`・manifest の `share_target`（Android の共有 → `?share=1&title=&text=&url=` を app.js が拾う）。
  wish には `address` も保存（`sanitizeRecord` も対応）。
- まとめて取り込み（v326〜）: 入口は登録タブ下の `.import-entry` とホームの「まずは1皿」カード（`[data-import-open]`）。sw.js の SHELL と index.html の `<script>` に `import` が入っている。
  ★が無い候補は記録しない（仮の評価で統計を汚さない）。新しい店は `foundBy: 'import'`。
- ホーム上部（v328〜）: v325 で入れた「近くの行きたい店／しばらく行っていない名店／近くの自分の店／N年前の今ごろ／最近の記録」の段と「行きたい店を追加」ボタンは
  利用者の希望で廃止した。戻さない。`#home-mine` は記録がまったく無いときの「まずは1皿」案内だけ（`renderHomeMine()`）。
  v325 の部品で残っているもの: `memoryVisit()`（統計の「N年前の今ごろ」）、`rememberPos()`／`gourmet.lastPos`（現在地の控え）、
  `focusMap(lon, lat, zoom)`（地図へ寄せる。初期化前なら控えて最初の描画で寄せる。setTimeout で jumpTo しない）。
- 信頼度（v323〜）: `ratingPair()` は `{personal, overall, raters, reliable, conf}` を返す。`conf` は ok／ref（参考: 2人以上・一致率が出せる人1人以上）／none（データ不足）。
  店の詳細・店シートは `ratePairHtml()` が ref に「参考」、none に「データ不足」を出す。検索カードは none を出さない。地図のピンの色も none なら自分の平均。
  一致率バッジ `tasteBadge()` は「味覚一致 82%・共通12店」の形で共通店舗数を添え、共通5件未満は「共通N店・データ不足」（%なし）、5〜19件は「・参考」。
- お気に入り♥は v323 で UI を廃止（「行きたい」のしおりと紛らわしいため）。`shop.favorite` のデータと隠しチェック `#f-fav` は互換のため残す。戻さない。
- 統計タブ（v323〜）: 主役は「行った店・今年の訪問・★5をつけた店・行きたい店の達成」の4タイル（`#stat-cards`）。残り（`#stat-cards-more`・記録カード・よく行く店・制覇マップ・グラフ…）は
  `#stat-more` に畳み「もっと見る」で開く（開閉は `gourmet.statMore` に記憶）。グラフ部品（Chart.js）はタイルを描いた後に読む。
- 「★5 ×N人」（v318〜）: 平均は人数が増えると 4 点台に寄るため、別に `fiveStarFans()` で数えてホームのカードと検索の一覧に `fiveChipHtml()` で出す。
  数えるのは自分と味覚一致率 `FIVE_MATCH_MIN`（70%）以上の人だけ。地図ではピンの頭を金の★にする（v320〜）。まとまりの色は ★5 の有無ではなく中で一番評価の高い店の色（利用者の希望）。
  v323〜 ホームのカードには出さない（検索の一覧だけ）。
- 他人の投稿では日付を出さない（`isMine` で判定済み）。
- 行きたい店（v303〜）: 訪問で消さず `doneAt` を付けて「達成」にする。`Store.wishes()` は未達成のみ、達成済みも含めるなら `Store.allWishes()`、
  達成度は `Store.wishProgress()`。バックアップ・同期には達成済みも含める（`allWishes`/`rawWishes`）。
- 星0の訪問は「評価なし」（写真なしの「また来た」）。平均や評価の集計では `rating > 0` だけを使う。
- 制覇マップの境界データ `data/japan-prefs.json` は国土数値情報（CC BY 4.0）の加工。画面と記録カードの出典表示を消さない。
- 地図の見た目は `views.js` の `baseMapStyle(dark)`（iPhone のマップ風の自前スタイル）。v305 で試した OpenFreeMap Liberty は
  「ごちゃつく」ため v306 で戻した。ピンは平らな一色の涙型（幅19×高さ30px、v311〜）で、頭の印は白丸（平均 .0〜.4・行きたい店）、白の半月◐（平均 .5 以上。v322〜。v309〜v321 の金丸は★と紛らわしいため廃止）、
  白縁の金の★（自分か味覚一致率70%以上の人が ★5 を付けた店＝`fiveStarFans()`、v320〜。半月より優先）の3種類。金色は ★5 の印だけに使う。
  拡大率は `PIN_SCALE_STOPS`（ラベル・吹き出しの位置もこれに連動）。地図の凡例は評価の色だけ出し、頭の印の説明は凡例の「?」→`showMapLegendHelp()`（v323〜。初めて地図を開いたとき一度だけ自動で出す。`gourmet.mapLegendSeen`）。
  地図の駅名・幹線道路の縁・鉄道は v323 で少し強くした（位置関係をつかむため。全体の薄さは保つ）。
  まとまり（クラスター）は Leaflet.markercluster 風の丸＋淡い輪で、丸も輪も中で一番評価の高い店の評価色（`maxR`、v321〜）。
  件数での色分けと、乗せたときに範囲を囲む表示は利用者の希望で廃止（v321）。戻さない。
- 写真の一覧（プロフィールの写真・他の人のプロフィールの写真・検索の写真）は Pinterest 風の `mzItem()` / `.mz-grid` で描く（v312〜）。行は 4px 刻みで、
  写真が読み込まれたら `mzFit()` が高さに合わせて `grid-row-end: span N` を決める（他の人のプロフィールは v313〜）。
- 役割分担（v315〜）: プロフィール＝自分のアルバム（「写真」と「統計」の2タブ。写真の上の `#pf-photo-q` で絞り込み）、
  検索タブ＝条件で探す・比べる（横長の `shopCard()` 一覧と写真の切り替え）。同じ機能を2か所に置かない（v314 のプロフィール「お店をさがす」は廃止）。
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
