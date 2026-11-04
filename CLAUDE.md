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
| `js/register.js` | 登録フロー。v337〜 2段階: 1枚目 `#reg-pick`（写真を撮る／写真から選ぶ／まとめて取り込む／写真なしで記録／行きたい店に入れる）→ 2枚目 `#record-card`（`#view-register.step2`。`updateStep()` が写真・店名・`forceStep2` で判定）。2枚目は 写真（1枚目は全幅 `#reg-photo`、2枚目以降は帯）→ 店名（枠なしの入力 `#f-shop-name`）→ 駅 `#reg-station`＋ジャンルの札 `#genre-pill`（`updateGenrePill()`。選択肢 `#reg-genres` は札をタップしたときか AI が判定できないときだけ開く。自信なしは「ラーメン？」）→ 星 → 行「ひとこと／住所・最寄駅／記録せずに行きたい店へ／あとで記録」→ 下に固定の「記録する」`.reg-sticky`。2枚目に写真が無いとき（＋から店を選んで来た・写真なしで記録）は `#reg-photo.no-photo` に「写真を撮る／写真から選ぶ」の2タイル `.reg-photo-empty`（v348〜）。検索・登録・地図では `body[data-tab]` でアプリの見出しを隠す |
| `js/import.js` | 過去の写真のまとめて取り込み（v326〜）。一度に最大100枚を「日付×場所」で訪問候補にまとめ、店名（既存の店→周辺検索の候補→入力）と★を付けて一括で記録。取り込み済みは指紋で除外、飛ばした写真は `gourmet.importSkipped.v1`。AI判定は `classifyDishPhoto(file, {bulk:true})`（Worker の別枠 1日200枚） |
| `js/views.js` | 地図・一覧・写真・統計・プロフィール・投稿詳細の描画（最大のファイル） |
| `js/cloud.js` | Firebase 同期・SNS（フィード/いいね/コメント/フォロー/公開プロフィール） |
| `js/app.js` | タブ制御・共通イベント・設定・サンプルデータ・バックアップ（取り込み時に形式と型を検証） |
| `js/vendor/anthropic-sdk.js` | Anthropic 公式SDK 0.72.1 のブラウザ用バンドル（esbuild）。外部CDNから実行時に読み込まない |
| `firebase/*.rules` | Firestore / Storage の推奨セキュリティルール。コンソールに貼り付けて公開する |
| `tools/server.ps1` | ローカル確認用の簡易サーバー（PowerShell。UTF-8 BOM必須） |
| `tools/proxy/` | 検索中継の Cloudflare Worker（`worker.js`）と設定手順（`README.md`）。Yahoo!/ホットペッパー/Google のキーは Worker の Secret に置き、アプリには置かない。アプリ側は `js/api.js` の `SEARCH_PROXY` に Worker の URL を書くだけ（利用者が⚙️で入れた自分のキーが優先）。v324〜 写真の AI ジャンル判定も `/classify` で中継（`ANTHROPIC_KEY`、Haiku 5.5、1端末1日30枚）。アプリ側は `Api.canClassify()`／`keySource('anthropic')`。`classifyDishPhoto()` は `{dishGenres, shopGenre, confident}` を返し、自信なしでも候補は捨てない（登録画面は「参考」＋「この内容にする」ボタン、v329〜） |

## 速さの決めごと（v298〜）
- 写真の一覧・グリッドは `Store.allPhotos()`（メタ情報のみ・本体を含まない）で描く。本体は `Store.getPhotoBlob(id)`、
  サムネは `Store.getThumb(id)` で1枚ずつ読む。`views.js` では `setThumb()` / `setFullPhoto()` / `fullPhotoUrl()` を使う。
  `rec.blob` を前提にしたコードを書かない（`rec.hasBlob` で判定）。
- 地図(MapLibre)・グラフ(Chart.js)・EXIF(exifr) は `App.loadLib(name)` で必要になった画面で読み込む。
  index.html に `<script>` を戻さない。ライブラリを足すときは `app.js` の `LIBS` に integrity 付きで追加する。
- Firebase SDK は最初の描画後（アイドル時）に読み込む。この端末でログインしたことがなければ、ログインを押すまで読まない。
- 同期（v359〜）: 起動時の全同期に加え、開いている間も `autoBackupSweep()` が 5分おき・前面に戻ったとき・オンライン復帰時に
  記録（店・訪問・行きたい）の取り込み＋押し上げ（`syncRecords()`、前回から2分以内は間引く）と写真の差分（`syncPhotos()`）を行う。
  別端末で付けた記録・写真は再起動なしで届く。`syncPhotos()` は 60 枚ごとに区切って最後まで取り込み、区切りごとに画面を描き直す（以前は 60 枚で打ち切り）。
  `pullCollection()` は updatedAt が新しいものだけ取り込んで件数を返す（同じ時刻は触らない）。
- 新しい版（v359〜）: sw.js は install で skipWaiting しない。app.js が 起動時・前面復帰時・30分ごとに `reg.update()` し、新版が待機に入ったら
  起動 20 秒以内なら黙って切り替え（SKIP_WAITING → controllerchange → 再読み込み）、使用中なら下の帯 `.update-bar`「新しい版があります ・ 更新」を出してタップで切り替える。記録の入力中は保存後に切り替える。
- Service Worker: `?v=` 付きのファイルはキャッシュ優先（内容は版ごとに固定）。index.html だけネットワーク優先。
- 速さの計測（v358〜）: 店150・写真300 を入れて CPU 4倍遅で測る台本がある（scratchpad の `perf-scale.js`／`perf-prof.js`。CDP の Profiler で関数ごとの時間を出す）。
  直した所: ①写真の並び `mzFit()` は読み取り（高さ）と書き込み（行数）を rAF 1回にまとめる（1枚ごとに getBoundingClientRect でレイアウトを強制しない。ResizeObserver は `contentRect.height` を使う）。
  ②検索の「お店」一覧 `renderListSections()` は 12 件ずつ描き、残りはスクロールで近づいたら足す（IntersectionObserver）。③写真の保存直後に `Views.warmThumb(id, blob)` でサムネを作る（登録・取り込み）。
  効果（店150・写真300・CPU4倍遅）: 検索の写真 592→224ms、検索の一覧の初回表示 587→327ms、プロフィールの写真（2回目）84→70ms。
  v359〜 写真の一覧（プロフィールのアルバム `.pf-mz`・検索の写真・発見・ホーム・`#photo-grid`）は `appendChunked(grid, total, make)` で先頭 40 件だけ描き、番兵 `.mz-more` が近づいたら 40 件ずつ足す（並び順 `mzOrder` は先に全件で計算）。
  一覧に N 件を一度に描く・画像1枚ごとにレイアウトを読む、の2つを新しく書かない。計測は `performance.clearMarks` してから mark する（累積しない）。

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
  カードは写真（投稿者の★バッジ）・店名・投稿者の3要素（v339〜。いいね・行きたい保存・時刻・ジャンル・県・一致率・全体評価・★5チップは投稿詳細へ）。
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
  店の詳細・店シートは `ratePairHtml()` が ref に「参考」を添え、none のときは「あなた向け」の箱を出さない（v335〜。「データ不足」の箱と説明文は廃止）。見出しは「あなた向け」「みんな」。検索カードも none を出さない。地図のピンの色も none なら自分の平均。
  一致率バッジ `tasteBadge()` は「味覚一致 82%・共通12店」の形で共通店舗数を添え、共通5件未満は「共通N店・データ不足」（%なし）、5〜19件は「・参考」。
- お気に入り♥は v323 で UI を廃止（「行きたい」のしおりと紛らわしいため）。`shop.favorite` のデータと隠しチェック `#f-fav` は互換のため残す。戻さない。
- 統計タブ（v323〜）: 主役は「行った店・今年の訪問・★5をつけた店・行きたい店の達成」の4タイル（`#stat-cards`）。残り（`#stat-cards-more`＝味の平均・訪れた都道府県の2つ（v339〜）・記録カード・よく行く店・制覇マップ・グラフ…）は
  `#stat-more` に畳み「もっと見る」で開く（開閉は `gourmet.statMore` に記憶）。グラフ部品（Chart.js）はタイルを描いた後に読む。
- 「★5 ×N人」（v318〜。v356〜 数えるのは ★4.5 以上 `FIVE_MIN_RATING`）: 平均は人数が増えると 4 点台に寄るため、別に `fiveStarFans()` で数えてホームのカードと検索の一覧に `fiveChipHtml()` で出す。
  数えるのは自分と味覚一致率 `FIVE_MATCH_MIN`（70%）以上の人だけ。地図ではピンの頭を金の★にする（v320〜）。まとまりの色は ★5 の有無ではなく中で一番評価の高い店の色（利用者の希望）。
  v339〜 カードには出さない（地図のピンの★だけ。`fiveChipHtml()` は未使用）。検索の「お店」一覧は v357〜 お店の記録と同じ形（写真の★バッジ＋「あなた向け」の1行）。プロフィールの写真カードは写真と店名だけ。
- 他人の投稿では日付を出さない（`isMine` で判定済み）。
- 行きたい店（v303〜）: 訪問で消さず `doneAt` を付けて「達成」にする。`Store.wishes()` は未達成のみ、達成済みも含めるなら `Store.allWishes()`、
  達成度は `Store.wishProgress()`。バックアップ・同期には達成済みも含める（`allWishes`/`rawWishes`）。
  訪問と行きたい店の照合 `findWish()` は店名の空白・全角半角・大文字小文字を無視（v334〜）。位置の無い店を記録したら行きたい店の位置を店に写す。
  地図の「行きたい店だけ」（`mapScope === 'wish'`、検索バー横の🔖）は行った店のピンを隠す。位置つきの行きたい店が無くなったら `refreshMapData()` が元の表示に戻す（空の地図にしない）。
- 店の位置の精度（v340〜）: OpenPOI の営業許可データ（`source: 'jff'`）の位置は住所から求めたもので、`level` が 8（街区・地番）未満なら町丁目の代表点＝数百m ずれる。
  `openPoiToCandidate()` が `coarse` / `posLevel`（town／block）を付け、`mergeCandidates()` は粗い候補に同じ店の正確な位置（OSM など）があればそちらを使う。
  保存時は `Register.pickBestPos(selected, lastGps)`: 粗い候補で写真・現在地が 600m 以内ならその位置（`posLevel: 'gps'`）。店には `posLevel`（gps／block／town／manual／geocode）を保存（`sanitizeRecord` も通す）。
  店舗の詳細は `posLevel === 'town'` のとき「ピンの位置は町名までのおおよそです ・ 直す」を出し、店舗情報（編集）に「住所から探す」（`fixPosByAddress` → Nominatim）と「地図で指定」（`pickOnMap` → 地図の中央の印 `#map-pick`）がある。
- 星0の訪問は「評価なし」（写真なしの「また来た」）。平均や評価の集計では `rating > 0` だけを使う。
- 制覇マップの境界データ `data/japan-prefs.json` は国土数値情報（CC BY 4.0）の加工。画面と記録カードの出典表示を消さない。
- 地図の見た目は `views.js` の `baseMapStyle(dark)`（iPhone のマップ風の自前スタイル）。v305 で試した OpenFreeMap Liberty は
  「ごちゃつく」ため v306 で戻した。ピンは平らな一色の涙型（幅19×高さ30px、v311〜）で、頭の印は白丸（平均 .0〜.4・行きたい店）、白の半月◐（平均 .5 以上。v322〜。v309〜v321 の金丸は★と紛らわしいため廃止）、
  白縁の金の★（自分か味覚一致率70%以上の人が ★4.5 以上を付けた店＝`fiveStarFans()`、`FIVE_MIN_RATING`。v320〜、v356 で ★5 → ★4.5 以上に。半月より優先）の3種類。金色は ★5 の印だけに使う。
  拡大率は `PIN_SCALE_STOPS`（ラベル・吹き出しの位置もこれに連動）。地図の凡例は評価の色だけ出し、頭の印の説明は凡例の「?」→`showMapLegendHelp()`（v323〜。初めて地図を開いたとき一度だけ自動で出す。`gourmet.mapLegendSeen`）。
  v339〜 2回目からは凡例を畳んで「?」だけ（`.map-legend-float.mini`）。地図の検索欄は丸いボタン `#map-search-open` で、タップで開き空のまま離れると閉じる（`.map-search-field.collapsed`）。地図タブでは見出しを隠し、`#view-map` を `position: fixed` で上端から下のタブ（`.tabs` の高さ 57px＋safe-area）まで隙間なく埋める（v345〜。高さ計算で伸ばす方式は上下に隙間が出た）。iOS の PWA は `apple-mobile-web-app-status-bar-style` が `default` のため、ステータスバー（時計の帯）の下までは描けない（`black-translucent` にすると時計が白文字になり白い画面で読めなくなるので採らない）。
  地図の駅名・幹線道路の縁・鉄道は v323 で少し強くした（位置関係をつかむため。全体の薄さは保つ）。
  まとまり（クラスター）は Leaflet.markercluster 風の丸＋淡い輪で、丸も輪も中で一番評価の高い店の評価色（`maxR`、v321〜）。
  件数での色分けと、乗せたときに範囲を囲む表示は利用者の希望で廃止（v321）。戻さない。
- 写真の一覧（プロフィールの写真・他の人のプロフィールの写真・検索の写真）は Pinterest 風の `mzItem()` / `.mz-grid` で描く（v312〜）。行は 4px 刻みで、
  写真が読み込まれたら `mzFit()` が高さに合わせて `grid-row-end: span N` を決める（他の人のプロフィールは v313〜）。
- 見た目が整う並び（v331〜）: 検索タブの写真モードとホームは `mzOrder(list, arOf, cols, extra)` で並べてから描く。新着順（ホームはおすすめ順）を土台に、
  ①同じ列に縦長／横長が続くなら直近3枚から形の違う写真を先に、②最後の4枚は列の底が揃う順、の2つだけ（写真が動くのは最大3つ分）。
  描いたあとに並べ替えない。詳細の左右送り（`showPostDetail` の `list`）も並べ替え後の順を渡す。プロフィールの写真（自分のアルバム）と他の人のプロフィールは新着順のまま。
  縦横比は写真メタの `ar`（縦/横）: `Api.compressImage()` が `blob.aspect` に付け `Store.addPhoto()` が保存、古い写真はサムネ作成時・表示時に `Store.setPhotoAspect()` で後追い。
  公開投稿（`publicPosts`）にも `ar` を入れる（他人の投稿は `Number(p.ar) || 0`。無ければ正方形扱い）。
- 役割分担（v315〜）: プロフィール＝自分のアルバム（「写真」と「統計」の2タブ。写真の上の `#pf-photo-q` で絞り込み）、
  検索タブ＝条件で探す・比べる（「お店」は v357〜 お店の記録と同じ `.sfs` の並びを `renderListSections()` で描く（`buildShopFeedSection(g, {lite:true})`＝写真はサムネだけ、写真の無い店は器の印、「あなた向け」を1行）。横長の `shopCard()` は廃止。写真モードとの切り替えは `#list-mode-segs`）。同じ機能を2か所に置かない（v314 のプロフィール「お店をさがす」は廃止）。
- スマホ表示（v330〜）: 幅 360〜390px で見切れないことを基準にする。全画面モーダルの ✕（`.modal.modal-full .modal-close`）は `flex-shrink: 0`（列 flex で潰れて見出しに重なった）、
  店シートのボタン列 `.msh-btns` は折り返し、評価の箱の見出し `.rp-label` は折り返す、地図の凡例 `.map-legend-float` は `max-width: calc(100% - 70px)` でズームボタンを避ける。
  画面を足したら幅 360px でも確認する。
- 一画面の情報は少ないほどよい（v335〜。利用者の方針）: 説明文・案内文・「必須」は出さない（足りなければボタンを薄くし、押されたらトーストで理由を言う）。
  無いデータは「データ不足」と書かず、その箱ごと出さない。同じ数字を1画面に2回出さない。見出し・店名は明朝をやめてゴシック（`--serif` は未使用）。点線の枠は使わない。
  デザイン刷新は v335（土台）→ v336 店シート → v337 登録の2段階 → v338 お店の記録 の順で進めた。
  お店の記録（`showShopFeed` / `buildShopFeedSection`、v338〜）: 店ごとに「写真（★1つ・ドットは写真の上）→ 操作行 → 店名 → 駅 ・ 県 市 → 日付（`fmtDateJa`）→ 訪問の写真（2回以上のときだけ）→ コメント欄」。
  投稿詳細（`buildPostSection`）とお店の記録は同じ並び（v343〜）: 写真 → 操作行 `.act-row`（`actRowHtml()`: ♥いいね（数）・コメント（数）・経路・共有 … 右端は 保存（他人の投稿）／また来た（自分）＋…）→ 店名 `.pd-shop` → 場所 `locHtml(駅, 県, 市)` → ジャンル ・ 詳細 ›（投稿詳細）／日付（お店の記録）。
  いいね・コメント・経路・共有の配線は `wireSocial(root, postId, {nav, shareText})` 1つ（コメント一覧は欄を開いたときに読む。`socialReady()`＝ログインしたことのある端末だけ Firebase を読む）。
  お店の記録のいいね・コメントは最新の写真の訪問 id（＝公開投稿の id）に付く。投稿詳細の星の行と大きな「ここへ行く」は廃止（★は写真のバッジ、経路は操作行）。数が 0 のときは出さない。
  訪問の一覧（`showVisitList`、v344〜）も同じ `.sfs` の並び: 写真（★）→ 操作行（右端は ＋・…＝編集／削除）→ 日付 `.pd-shop` → ジャンル ・ 詳細 ›（ひとこと）。
  操作行の ＋（お店の記録・訪問の一覧・自分の投稿詳細）と、店シート・店舗詳細の「また来た」タイル・統計「よく行く店」の「＋また来た」は、すべて `openRegisterFor(shopId)`＝開いている画面を閉じ、その店を選んだ状態で登録画面の2枚目へ（v346〜、v350 で統一）。写真なしのワンタップ記録 `quickRevisit()` は廃止した。
  上の統計タイル（訪問回数・平均評価・最終訪問）・下の「＋ 新しい記録を追加」・左スワイプの編集/削除は廃止（件数は見出しの下だけ）。リスト／タイムラインの切り替えとジャンルの札は残す。
  枠・影・「N回訪問」「最終訪問」「すべての訪問履歴」・店ごとの大きなボタンは無し。縦写真も切り抜く（`.portrait` の contain から外した）。案のモック: https://claude.ai/artifact/SGQmzsHtrH7QtNCnbKt95Q
- 地図の店シート（v336〜）: `showMapShopSheet` / `showNetShopSheet` は共通の `sheetHeadHtml()` で「つまみ → 写真（全幅）→ 店名 → 駅 → タイル4つ → 要点行」を描く。
  タイルは「N分（現在地の控えからの徒歩。`walkMinutes()`。無ければ「経路」）／また来た（他人の店は「行きたい」）／地図／共有」。要点行は「あなた／みんな／訪問」で無いものは列ごと出さない。
  ジャンル・★バッジ・「あなたの写真」の見出しと枚数は出さない。開いている間は `body.msh-open` でアプリの見出し・地図の検索バー・表示範囲ボタンを隠す。
  「フォロワーの写真」（`renderFollowSection`）は v359〜 投稿詳細と同じ `buildPostSection(p, close, {inShop:true})` を1投稿ずつ縦に並べる（店名・場所は出さない）。並び順（一致率順／新しい順／古い順）の切り替えは残す。
- 配色（v354〜）: v347〜v353 で試した白黒基調（テラコッタの廃止・灰のピンと地図・黒い★）は、利用者の希望で v354 に v346 以前の配色へ戻した。
  `--accent` はテラコッタ（#C6613F、暗色では #D97757）、`--accent-soft` は淡いテラコッタ、★は金のグラデーション `#star-grad`、評価の色は ★1灰→★2青→★3緑→★4橙→★5赤（`--r1`〜`--r5`＝JS の `PIN_COLORS`）、
  行きたい店は紫（`WISH_COLOR` #8B5CF6）、地図は iPhone のマップ風の配色（`baseMapStyle()`）、発見のジャンルの絵は色つき。v347〜v353 の機能の変更（登録2枚目の写真タイル・「また来た」→登録画面・店シートのタイル揃え）は残っている。
  CSS は v346 の `css/style.css` を土台に v348・v350 の規則だけ再適用した（v347 で足した `--on-accent`／`--like`／`--danger`／`--ill` は無い）。色を変える要望が来たら、まず「どの範囲か（UI だけか・データの色もか）」を確かめてから着手する。
- Edge-to-Edge（v355〜。@miyayu_jp の「背景は端まで、操作 UI と文字は安全な領域に」を当てた）:
  下: 下のタブは `padding-bottom: env(safe-area-inset-bottom)` で背景がホームインジケータの裏まで伸びる。全画面の一覧（`.vl-body`）・投稿（`.pd-scroll`）・店舗詳細（`.modal-full #modal-body`）・店シート（`.msh-sheet`）・アクションシート（`.as-box`）・取り込みの足（`.im-foot`）・カメラの操作列は下に safe-area の余白を持つ。新しい全画面・シートを足すときも同じにする。
  キーボード（IME）: `app.js` の `watchKeyboard()` が visualViewport からキーボードの高さを `--kb` に入れる。`position: fixed` の下固定（登録の「記録する」`.reg-sticky`・トースト）は `bottom: max(通常の位置, var(--kb))` でキーボードの上に出る。iOS はキーボードが出ても fixed の基準が縮まないため。
  上（ステータスバー）: iOS の PWA は `apple-mobile-web-app-status-bar-style` が `default`（白地に黒の時計）のため、ステータスバーの裏までは描けない。`black-translucent` は時計が白文字固定で白い画面で読めなくなるので採らない（Edge-to-Edge の「上」は iOS の Web アプリでは諦める）。
- 見た目の決めごと（v332〜。heydamir の unslop の手順を手で当てた）: 絵文字を UI のアイコンに使わない。線画 SVG は `views.js` の `IC_*`（`Views.icons` で register.js / import.js / app.js からも使う）1組で、
  `.ic` 14px（`.btn` 内 16px）・太さ 1.75、閉じるは `.x-ic` 18px、写真の仮表示は `.ph-ic`、プロフィール写真の仮表示は `.av-ic`（お椀）。トーストや状態の文には印を付けず文だけ。
  文字サイズは 11/12/13/14/15/16/18/20/22/24/28/32/40/48px の尺から選ぶ（11px 未満は地図の凡例・ピンのラベル・出典だけ）。余白は 4px 刻み（2px・6px・10px・14px の半歩は可）。
  角丸は 10（ボタン・チップ・小さい写真）／14（カード・入力欄）／18（シート・モーダル）の3種類＋小物の 4px。サンプル写真の絵文字（canvas に描く中身）と発見タイルの絵は対象外。
  太字は見出し・店名・カードの名前が 700 まで（v333〜）。800 は評価の数字・統計の数字・バッジだけに使う。
  形式の統一（v341〜）: グラデーションは使わない（`--grad` は `var(--accent)` の別名）。流れの中のカード（`.card`・`.pf-shopcard`・`.ex-cat`・`.mz-card` など）に影を付けない。
  影は浮いている部品（シート・モーダル・トースト・地図のボタン）だけ。日付は `fmtDate()`＝「11月1日」（今年以外は「2025年11月1日」）で統一し `toLocaleDateString` を直接使わない。
  折りたたみの開閉は `.row-toggle`（「見出し ›」の行。開いたら `.open` で › が下向き）で統一し「▸ 詳細」の文字は使わない。
  店舗の詳細（`showShop`）も店シートと同じタイル（経路／また来た／共有／その他）＋要点行（あなた／みんな／訪問）。地図で見る・訪問を追加・店舗情報・閉店・削除は「その他」の一覧（`openActionSheet`）。
  主ボタン（v342〜）: `.btn.primary` はアクセント1色の塗り・太さ700。全幅の `.btn.big`（登録の「記録する」・ようこその「はじめる」・取り込みの「写真を選ぶ」）は高さ52・角丸10で、店シートのタイル（`.msh-tile`、角丸10）と同じ形。角丸はボタン10／カード14／シート18のまま。
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

## サブアプリ: ラボ片付け（`lab/`）
- 研究室の後片付け（曜日で繰り返し・完了はその日だけ）と依頼事項（依頼者・期限）をトグルで管理する別 PWA。詳細は `lab/README.md`。
- 本体・diet とはコード・Service Worker・localStorage キー（`lab.*`）・キャッシュ名（`lab-*`）を分ける。本体の `APP_VERSION` は変更しない。
- バージョン: `lab/js/app.js` の `APP_VERSION`、`lab/sw.js` の `VERSION` と `SHELL` の `?v=`、`lab/index.html` の `?v=`（2箇所）を揃える。
- 本番URL: https://takusangoukaku-hash.github.io/gourmet-app/lab/
