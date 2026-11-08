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
- 引っ張って更新（v363〜）: ホーム・検索・プロフィールで上端から下に引っ張ると `App.refreshAll()`＝`Cloud.syncNow()`（記録と写真の同期）→ `App.checkUpdate()`（新版があればその場で切り替え）→ 画面の描き直し。地図は引っ張ると地図が動くので対象外（地図は開くたびに Store から作り直す）。
- 重複した店の統合（v364〜）: 設定→データ「重複した店をまとめる」`#merge-shops` → `Views.openMergeShops()`。候補は `findDuplicateShops()`（正規化した名前 `mergeNorm` が同じ／80m 以内で二文字一致率 `bigramDice` 0.5 以上／一致率 0.8 以上で 500m 以内か位置なし）。訪問の多い方を残す側にし、「逆にまとめる」で入れ替え、「別の店」は `gourmet.mergeIgnored`（id の組）に覚えて二度と出さない。
  本体は `Store.mergeShops(keepId, dropId)`: drop の訪問を `updateVisit` で keep へ、写真は本体の `shopId` を書き換えて `emit('photo','meta')`（cloud.js は `setDoc(..., {merge:true})` でメタだけ更新し本体は上げ直さない）、keep の空いている項目（住所・駅・県市・ジャンル・位置）を drop で補い、最後に `deleteShop(dropId)`（墓標に残る）。
  別端末には訪問の付け替えは同期で届き、写真は `syncPhotos()` がクラウドのメタの店 id が違うものを `Store.relinkPhoto()` で付け替える。drop の店は v365 の削除の控えで別端末からも消える。
- 削除を別端末にも伝える（v365〜）: `cloud.js` の `applyOneToCloud` は del のとき `putTombstone(kind, id)` で `users/{uid}/deleted/{kind_id}`＝`{kind, id, at}` を書いてから本体を消す（店・訪問・行きたい・写真）。
  `syncRecords()` は店・訪問・行きたいを取り込んだあと `pullDeleted()` で控えを読み、`Store.applyRemoteDelete(kind, id, at)` でこちらの記録を消す（通知も墓標も出さず、他の記録へ波及させない＝店を消したときの訪問・写真はそれぞれの控えで消える。`updatedAt` が控えの `at` より新しい記録は直したものとみなして残す）。
  写真は `removePhotoLocal`（3 ストアと指紋から消す）。90 日たった控えは取り込み時に 50 件ずつ消す。端末の墓標（`gourmet.deleted.v1`、30 日）は従来どおり「自分が消したものを復活させない」ため。
- 登録時の重複の確認（v365〜）: `Views.similarShops(name, lat, lon)`（`isSimilarShop`＝統合の候補と同じ基準）で登録済みの店に似ていれば、店名の下に `#reg-dup`「登録済み: ○○ ・ 駅 ・ N回 ／ この店にする」（`updateDupHint()`。入力・候補の選択・既存の選択・リセットのたびに更新）。
  保存 `save()` では `matchShop` に掛からなくても似た店があれば `askSameShop()`＝`Views.openActionSheet([...], onCancel)` で「○○に記録する（同じ店）／別の店として登録する」を確かめる。候補から選ばずに既存の店へ記録するときは店名を変えず、空の欄で既存の住所・駅・県市を消さない。`openActionSheet` は第2引数 `onCancel`（キャンセル・外側タップ）を取る。
- まとめの年の切り替え（v365〜）: `renderYearCard()` は訪問のある年だけを ‹ › `.yc-nav` で切り替える（`yearSel`。今年に訪問が無ければ最新の年）。訪問が1件も無ければカードごと出さない。画像の見出しは今年なら「今年のまとめ」、それ以外は「N年のまとめ」。
- 写真の付け替え・削除（v366〜）: 自分の投稿詳細の「…」（`buildPostSection` の `.pd-edit`）に、いま見えている写真（`curIdx`／`itemsRef`、端末内の写真のときだけ）の「この写真を別の訪問へ（同じ店に訪問が2つ以上のとき）／この写真を別の店へ／この写真を削除」を足した。
  付け替えは `openPhotoMove(ph, mode, done)`（全画面 `.pk-modal`。visit: 同じ店の別の訪問の一覧 ／ shop: `.pk-filter` で店名を絞り → 店 → その店の訪問（1つならそのまま））→ `Store.movePhoto(id, shopId, visitId)`（本体と指紋を書き換え `emit('photo','meta',{id, shopId, visitId, prevVisitId})`）。
  削除は `Store.deletePhoto(id)`（`deletePhotosWhere`。訪問は残る。del の通知に `visitId` を添える）。cloud.js の photo meta はメタ（店・訪問）だけ `merge` で書き、前後の訪問の公開投稿を `publishPostForVisit` で出し直す。photo del も残った写真で投稿を出し直す。
  終わったら投稿詳細を閉じて `App.refreshCurrent()`。検索タブの写真モードは `renderList()` で `exploreItems = null` にして拾い直す（古い一覧のままだと、移した写真の投稿を開いても写真が無い）。
- 月ごとの振り返り（v366〜）: 統計の「もっと見る」で今年のまとめの下 `#stat-month`（`renderMonthCard()`、`renderRecordCards()` から）。訪問のある月だけ ‹ › で切り替え（`monthSel`。今月に訪問が無ければ最新の月）。店数・回数・新しい店（初訪問がその月）の3つと、その月の写真の帯 `.mc-strip`（`.mc-ph` 72px、新しい順に最大40枚、タップで `showPostDetail`、訪問ごとに1投稿の `list` を渡す）。写真が無ければ帯だけ消す。訪問が無ければカードごと出さない。
- 速さ（v366 で再計測。店150・写真300・CPU4倍遅、v357 比）: プロフィールの写真 688→225ms、検索の「お店」初回表示 626→410ms、検索の写真の初回表示 518→192ms（40件。残り260件はスクロールで継ぎ足し）。統計は 80→97〜146ms（今年のまとめ・月のカードの分。許容）。計測台本は scratchpad の `perf366.js <port>`（`perf-final.js` を 40 件の分割描画に合わせたもの）。
- 暗色・幅360の総点検（v366）: 重複した店・今年のまとめ・月・登録の「登録済み」案内・保存の確認・更新の帯・店舗の詳細・投稿の…・付け替えの一覧・店シートを暗色／明色・幅360で撮って確認（scratchpad の `audit366.js`）。直す所は無かった。
- 画面が直前に戻る問題（v367 で修正。2つの原因があった）: ①起動 20 秒以内に新版が待機に入ると黙って再読み込みしていた（毎日の更新で、起動して画面を移った直後に戻って見えた）。`app.js` は `pointerdown`/`keydown` を一度でも受けたら（`userActed`）黙って切り替えず下の帯にし、再読み込みの前に `sessionStorage` の `bitemap.resumeTab` に今のタブを控えて起動時にそのタブへ戻る。
  ②`renderProfile()` が末尾で `showProfileTab('photos')` していたため、同期の `App.refreshCurrent()`（5分おき・前面復帰・写真の区切りごと）で統計から写真へ戻っていた。今は `pfTab` を覚え、タブで開いたとき（`App.switchTab('profile')` → `Views.enterProfileTab()`）だけ写真へ、描き直しは今の小タブのまま。描き直しで画面の状態を初期化する関数を新しく書かない（検索タブの `renderList()` は発見の今の画面を保つ）。
- 記録の編集シート（v367〜）: `openVisitEdit(visitId, onDone)`（`.ve-modal` の中央カード。味の★・料理ジャンル・訪問日・ひとこと、保存／削除）。投稿詳細の …「編集」、訪問の一覧と店舗の詳細の …「この記録を編集」（`buildVisitSection` の `ctx.editVisit`）から開く。`onDone('saved'|'deleted')` で呼び元が描き直す（削除で訪問が無くなったら一覧を閉じる）。インライン編集は v368 で削除した。
- 行きたい店の一覧（v367〜）: `openWishlist()` は「行きたい N／行けた M」の切り替え（`wishTab`）と、行きたいの並び替え `#wish-sort`（追加順／近い順＝`lastKnownPos` から／名前順。`wishSort`）。行は「記録する」（`Register.prefillWish` → 登録タブ）と …（地図で見る・ここへ行く・外す。行けた側は 記録・達成を取り消す `Store.undoWish(id)`・一覧から外す）。
- 写真をまとめて選ぶ（v367〜）: `mzItem()` に `rec`（自分の写真）があるものは長押し（450ms、8px 動いたら取り消し）で `mzSelStart(grid)`＝その格子 `.mz-grid.mz-selecting` が選択モード（検索の写真モード・発見のジャンルの格子。プロフィールの写真は店ごとのカードなので対象外）。タップで `.mz-sel` を切り替え、下の帯 `.mz-selbar`（N枚を選択・移す・削除・キャンセル）。「移す」は `openPhotoMove(配列, 'shop', done)`（v367〜 配列も受ける）。`renderList()` の先頭で `mzSelEnd()`。
- 絞り込みの数（v367〜）: `updateFilterBadge()`（`renderList()` の検索モードで毎回）がジャンル・★・都道府県の付いている数を「詳細」ボタンの `.flt-n` に出し、`#flt-clear`「条件を外す」を出し入れする（並び替え・まとめては数えない・外さない）。
- 店舗情報の編集シート（v368〜）: `openShopEdit(shopId, onDone)`（記録の編集と同じ `.ve-modal` の中央カード `.se-modal`。店名・最寄駅・都道府県・市区町村・住所と、位置の「住所から探す」`fixPosByAddress`／「地図で指定」`pickOnMap`（どちらもシートを閉じてから））。保存は v362〜 の住所→位置の求め直しを含む。入口は店舗の詳細の「その他 → 店舗情報を編集」と「ピンの位置は町名まで…直す」。`showShop(shopId, true)` の編集モードは廃止（第2・第3引数は無視される）。
- 使われなくなった部品の整理（v368）: 店舗の詳細のインライン編集（`.ve-editing`）と古い訪問カード（`.v-cover`）、写真タブ（`#view-photos`／`initPhotos`／`renderPhotos`）、`catColorForGenre`・`contribAvatarsHtml`・`fiveChipHtml`・`mapStatsLine`・`ratePairHtml`・`wireContribAvatars`、画面から参照されない CSS 約 200 規則（`.shop-card`・`.feed-card`・`.fcard-*`・`.rp-*`・`.ppc-*` など）を削除（139KB → 120KB）。消す前の判定は「js と index.html に文字列として現れない」＋数字を除いた接頭辞（`cq-l` など）が文字列として現れない、で行った。
- 接続なし・同期中の帯（v368〜）: 見出しの下 `#net-bar`（`app.js` の `watchNet()`／`updateNetBar()`）。オフラインは即「接続なし ・ 記録は端末に保存され、つながると同期します」、同期は `Cloud.onStatus` の syncing が 2 秒以上続いたときだけ「同期しています…」。普段は出さない。見出しを隠すタブ（検索・登録・地図）では出さない。
- 発見の格子（v368〜）: くくりとジャンルは記録の多い順、0件は後ろ（`.off` で薄く。色はくくりごとに固定）。くくりの下に「駅から」`.ex-stations`（訪問の多い駅 8 つ `stationRowHtml()`。タップで検索モードにしてその駅名で検索）。
- 投稿を画像カードで共有（v370〜）: `wireSocial` の `o.card`（async → `{photoUrl, shopName, rating, station, pref, city, date}`）があれば、共有ボタンは `buildPostCard(info)`（canvas 1080×1920。写真を角丸で大きく＋★バッジ、下に店名・場所・日付・BITEMAP）→ `shareImageBlob` で画像を共有シートへ。写真が無い・読めない（他人の写真の CORS など）ときは従来どおり文字だけ。投稿詳細はいま見えている写真（`itemsRef[curIdx]`）、お店の記録は最新の写真、訪問の一覧はその訪問の1枚目。
- 地図の長押しで行きたい店（v370〜）: `wireMapLongPress()`（地図の canvas に pointer で 600ms・8px 動いたら取り消し。位置指定中は無効）→ `onMapLongPress(lat, lon)` → アクションシート「ここに行きたい店を追加」→ `openWishAdd('', {lat, lon})`。位置つきで開くと `Api.nearbyShops(lat, lon, 150)` の候補を先に出し、タップで店名と位置が入る。店名を打つだけでもその位置の行きたい店として保存できる。
- 起動の速さ（v370）: 起動後の JS は 4倍遅で 60ms ほどで、時間の大半は index.html・CSS・JS の取得。①sw.js は画面（navigate）をキャッシュ優先で即返し、裏で取り直す（以前はネットワーク優先で回線待ちが起動時間に乗っていた。版の切り替えは app.js の `reg.update()` と新版の SW のプリキャッシュで保たれる）。②Google Fonts の CSS は `media="print" onload` で描画を止めずに読む。計測台本は scratchpad の `perf-start.js`（CPU4倍遅・4G 相当で最初の画面まで）・`perf-start-prof.js`（関数ごと）。
- 店の無い記録の掃除（v370〜）: `Store.cleanupOrphans()`（店の無い訪問を `deleteVisit`、訪問か店の無い写真を `deletePhotosWhere`。クラウドにも削除として伝わる）。同期で記録を取り込んだ後（ログイン時・5分ごとの sweep）に自動で呼び、設定→データ「店の無い記録を掃除」`#cleanup-orphans` からも実行できる。
- 地図のまとまり・重なったピン（v371〜）: ピンのタップは `querySourceFeatures('shops')` で同じ画面位置（±14px）の店を元データから拾い（描画で隠れた重なりも含む）、2店以上なら `openClusterList(props)`＝評価の高い順のアクションシートから選ぶ（自分の店は店シート、フォロー中だけの店はその人の店シート）。まとまり（クラスター）は展開に z15 以上が要るとき（`getClusterExpansionZoom`）だけ `getClusterLeaves` で中の店の一覧、それ以外は従来どおりズーム。
- 登録前の写真（v371〜）: 2枚目以降の帯の写真をタップ → アクションシート「1枚目（代表）にする／左へ／右へ／外す」（`renderPreviews()`。`pendingPhotos` を並べ替えて描き直す）。1枚目の ✕ と「写真を追加」は従来どおり。
- 文字の大きさ（v371〜）: 設定→表示「文字の大きさ」`#set-font`（iPhone に合わせる＝既定／小 0.92／標準 1／大 1.1／特大 1.22。`gourmet.fontScale`）。`app.js` の `applyFontScale()` が `--ui-zoom` を入れ、CSS は地図以外（`.app-header, .tabs, .view:not(#view-map), .modal, .update-bar, .toast, .mz-selbar, .reg-sticky, #lightbox`）を `zoom: var(--ui-zoom)` で拡縮する（px で組んだ画面をそのまま拡縮するため）。「iPhone に合わせる」は `font: -apple-system-body` の実寸 ÷ 17px（0.85〜1.35）。前面に戻ったとき取り直す。
- 共有カードの形（v371〜）: 共有ボタン → アクションシート「縦長の画像（ストーリー向け）／正方形の画像（投稿向け・写真2枚まで）／文字だけ」。`buildPostCard(info, shape)` は story 1080×1920（写真1枚）／square 1080×1080（`info.photoUrls` の先頭2枚を横に並べる）。`o.card()` は `photoUrls`（投稿詳細＝見えている写真と隣の1枚、お店の記録＝最新2枚、訪問の一覧＝その訪問の2枚）を返す。写真が無いときは文字で共有。
- 登録画面（v372〜）: 1枚目 `#reg-pick` は「写真を撮る／写真から選ぶ」を同じ大きさの2タイル `.reg-pick-tiles > .reg-pick-tile`（撮るだけを大きくしない。id は従来どおり `#reg-pick-cam`／`#reg-pick-lib`）、その下に「まとめて取り込む／写真なしで記録／行きたい店に入れる」の行。2枚目の写真 `.reg-photo img` は 3:2（4:3 から。店名と★まで1画面に入る）。「記録せずに行きたい店へ」「あとで記録（写真だけ保存）」は行 `#reg-more-row`「その他 ›」のアクションシートに畳んだ（あとで記録は写真があるときだけ出す。`#save-wish-btn`／`#save-later-btn` は無い）。
- 訪問の一覧の画面を店舗の詳細に統合（v372〜）: `showVisitList` は削除。店舗の詳細の `#d-visits` は、訪問が2回以上のとき `.d-vsegs` の「リスト／タイムライン」（`shopVisitMode`、`renderVisits()` でその場で描き直す）。タイムラインは module の `buildTimeline(shop, list, editVisit)`（`.vl-tl`。以前の訪問の一覧の `renderTimeline` を移した）。写真の帯 `.d-photoblock` は訪問が2回以上のときだけ（1回なら下の記録と同じ写真になるため）。お店の記録の「…」から「訪問の一覧」を外し「最新の記録を編集」は `openVisitEdit`。店舗の詳細の「その他」から「写真つきで訪問を追加」を外した（「また来た」のタイルと同じ）。
- 投稿詳細の自分の投稿（v372〜）: 投稿者の行 `.pd-sect-head` は他人の投稿だけ。自分の投稿の「…」`.pd-edit` は操作行の右端（＋の隣、`act-btn`）。ひとこと `.pd-comment` は畳まず店名・場所の下に出し、日付はジャンルの行に「ジャンル ・ 11月3日」。「詳細 ›」`.pd-more`／`.pd-morebox` は住所・お店の評価があるときだけ描く（`moreHtml`）。
- 隠れた操作と説明文（v372〜）: 写真の選択は長押しに加えて見えるボタン（検索の写真モード `.mz-tools .mz-selbtn`＝自分の写真があるとき、発見のジャンルの格子は `#explore-head .ex-sel`）→ `mzSelStart(grid)`。発見のくくり・ジャンルの 0件タイル `.ex-cat.off` は畳み `.ex-showoff`「記録のないジャンル N」で開く（`exShowOff`、`offToggleHtml()`／`wireOffToggle(box, force)`。くくり全体が0件なら全部出す）。行きたい店の追加の説明文はやめてプレースホルダーに。取り込みの説明は1行（`.im-tips` 削除）。共有の保存モーダルの注は「長押しでも保存できます」。地図の「?」の説明に長押し（行きたい店を追加）を足した。設定の上の行は「プロフィールを見る」（タブを開くだけで編集ではない）。共有の形は前回選んだものを先頭に（`gourmet.shareShape`）。
- 画面カタログの指摘のうち直さなかったもの（v372）: 「登録済み」の案内が選択済みでも出る＝テストの confirm を閉じて `preselectShop` が途中で止まった影響で実機では出ない。編集シートの日付 11/03/2026 はテストのロケール（実機は日本語）。
- タブ名（v373〜）: 下のタブの表示は ホーム／探す／記録／地図／マイページ（`data-tab` は feed／list／register／map／profile のまま。文章でも「探す」「記録」「マイページ」と書く）。マイページの見出しの数は 店・写真（`#pf-photos`、`data-ptab="photos"` で写真の小タブへ）・フォロー・フォロワー。設定の上の行は「マイページを見る」。
- 絞り込み・並び替えのシート（v373〜）: 探すの「絞り込み」`#list-detail-toggle`（条件の数 `.flt-n` 付き）→ `openFilterSheet()`。`#list-detail-filters`（ジャンルのチップ・★・都道府県・並び替え・まとめて表示と `#flt-clear`。配線は従来どおり）を下からのシート `.flt-modal > .as-box.flt-sheet` に移して見せ、閉じると `#list-filter-panel` へ戻して hidden に。下のボタンは「N 件を表示」（写真モードは「閉じる」）。シートは先に body へ入れてから中身を移す（`$('#flt-*')` が引けるように）。
- ジャンルを選ぶシート（v373〜）: 登録のジャンルの札 `#genre-pill` → `Register` の `openGenreSheet()`。検索欄 `.gp-q`（一致するジャンルのチップ `.gp-hits`）、「よく使う」`.gp-fav`（自分の訪問で多い6つ。足りなければ各くくりの先頭）、「すべて」`.gp-all` に `#f-dish-genres`（くくり→ジャンルの2段階ピッカー）を移す。選ぶと `userTouchedGenres = true`／`autoFilledGenres = false`。「決定」・✕・外側で閉じ、ピッカーを `#reg-genres` へ戻して `updateGenrePill()`。AI が自信なし・判定できずのときも選択肢は開かず、札（「ラーメン？」／「ジャンルを選ぶ」）をタップしてもらう。
- 統計（v373〜）: 「もっと見る」のタイルに 再訪率（2回以上行った店 ÷ 行った店）。カード `#stat-genres`「よく食べたジャンル」（`renderGenreRank()`、訪問に付けたジャンルの多い順に6つ、回数・割合・棒。タップで探すをそのジャンルで絞る＝`App.switchTab('list')` → `setListMode(false)` → `#flt-dish-genre` → `renderList()`。記録が無ければ出さない）。制覇マップの県のタップ（`openPrefShops`）は v303 からある。
- 取り込みの手順の帯（v374〜）: 取り込みのモーダルの見出しの下 `.im-steps`（1 選ぶ → 2 まとめる → 3 店名と★ → 4 記録）。`setStep(n)` が `.on`（今）と `.done`（済み）を付ける（開いたとき 1、写真を読み始めたら 2、候補の一覧を描いたら 3、保存を始めたら 4、「続けて写真を選ぶ」で 1）。幅 379px 以下は今の手順だけ文字を出す。
- 行きたい店はマイページの小タブ（v374〜）: `#profile-subtabs` の3つ目 `.psub[data-ptab="wishes"]` → `#ptab-wishes` に `renderWishlist(body)`（v367 の一覧をそのまま。「行きたい N／行けた M」・並び替え・記録する・…）。`openWishlist()` は `App.switchTab('profile'); showProfileTab('wishes')` だけ（探すのしおり `#list-wishes`・統計の達成カードから）。全画面モーダルの版は無い。タブで開き直すと写真に戻る（v367 の決めごとのまま）。
- ★の意味を1語で（v374〜）: `Views.ratingWord(r)`＝1〜1.5 いまいち／2〜2.5 まあまあ／3〜3.5 ふつう／4〜4.5 満足／5 最高。登録の `#f-rating-val` は「4.0 満足」（数字＋`<small>`）、記録の編集シートは星の右 `.ve-rword`。
- 暗色・幅360の総点検（v374）: 登録の1枚目・2枚目・ジャンルのシート・その他、店舗の詳細のタイムライン、発見・絞り込みのシート・写真の選択・自分の投稿詳細、マイページの見出し・行きたい・統計、取り込みを暗色／明色・幅360で撮って確認（scratchpad の `audit374.js`）。
- 空の状態と読み込み中（v375〜）: 「まだ無いとき」は全部 `emptyBox(icon, 1行, ボタン)`（`.empty`。`<p class="hint">` の空表示は使わない）。行きたい（未達成／達成 `EMPTY_IC_CHECK`）・よく行く店・制覇マップ・達成度・ホームの未ログイン（「ログインすると、フォロー中の人の記録がここに並びます」＋ `#feed-login-btn`＝設定の `#pf-login` を押すのと同じ）。発見のくくりの読み込み中は文字ではなく骨組み `SKEL_CATS`（`.skel-cats`、`display: contents` で格子に並ぶ）。
- 削除の取り消し（v375〜）: 記録・写真・行きたいの削除は `confirm` を出さず、`Store.deferDelete(kind, id)` で一覧から外して `App.toastUndo(msg, {undo, commit, ms=5000})`（`#toast.has-undo` に「元に戻す」）。押せば `Store.undoDelete` して描き直し、押さなければ `commit`＝本当に消す（`deleteVisit`／`deletePhoto`／`removeWish`）。保留中は `Store.visits()`／`visitsOf()`／`wishes()`／`allWishes()`／`doneWishes()`／`allPhotos()`／`photosOfVisit()`／`photosOfShop()` が除く（`rawVisits` などは含む）。次のトースト・`App.switchTab`・画面を離れる（pagehide／hidden）で `App.flushUndo()`＝確定。記録は `deleteVisitWithUndo(visitId, afterHide, afterCommit)`（店舗の詳細の …・編集シートの削除）。店の削除と統合は大きいので `confirm` のまま。
- コメント欄のログイン（v375〜）: 未ログインで欄を開くと入力欄の代わりに `.pd-clogin`「コメントするにはログインが必要です ・ ログイン」（`#pf-login` を押すのと同じ）。
- 共有カード・まとめの見た目（v375〜）: 記録カード・年のまとめの上の帯はグラデーションをやめアクセント1色（#C6613F）、下地は `--field`（#F5F3EC）、箱の縁は `--border-lite`、角丸は 14px 相当（1080/390 倍＝39）。投稿カードの写真の角丸も 39。金（#F2C14E）は★のバッジだけ。
- 速さの再計測（v375。店150・写真300・CPU4倍遅、`perf375.js`＝`perf366.js` の `renderPhotos` を `renderProfile` に）: プロフィールの写真 225→153〜169ms、統計 146→136〜157ms、検索の「お店」初回表示 410→489〜533ms に遅くなっていたので、`sortShops()` の並べ替えの鍵（平均★・回数・最終訪問・あなた向け・距離）を店ごとに1回だけ先に計算する形にした（比較のたびに `visitsOf` が全訪問を走査していた。CPU プロファイル `perf-prof375.js` で最上位）→ 402〜466ms。検索の写真 192→232〜258ms（40件。差は許容）。起動（`perf-start.js`、SW なし・4G相当）: 最初の画面まで 約2.0s、FCP 約1.17s。
- ホームのタブ（v376〜）: `#feed-segs` は おすすめ（`feedSeg='reco'`＝味覚一致率→新しさ）／最新 の2つ。「フォロー中」は最新と同じ並びだったので外した（ホームの投稿はすべてフォロー中の人のもの）。未ログインでは `renderFeed()` がタブを隠す。
- 地図の「行きたい店を追加」（v376〜）: `#map-add`（`.map-add-btn`。`#view-map` 直下、右下の拡大縮小・現在地の上 `bottom: 168px`）→ 画面の中央 `map.getCenter()` で `onMapLongPress(lat, lon)`（長押しと同じ流れ）。位置指定中 `body.map-picking` と店シート `body.msh-open` では隠す。
- 店舗情報の自動入力（v376〜）: `openShopEdit` の住所欄の `change` で、空いている 最寄駅・都道府県・市区町村 だけを `Api.geocodeAddress(住所)[0]` → `Api.reverseGeocode`／`Api.nearestStation` で埋める（手で入れた欄は上書きしない。探している間はプレースホルダー）。保存時の位置の求め直しは v362 のまま。
- 設定のデータ（v376〜）: 「バックアップ」（書き出す／写真込み／読み込む）と「整理」（重複した店／店の無い記録）に分け、行の下 `.set-sub2` に前回の実行（`gourmet.lastBackupAt`／`gourmet.lastRestoreAt`／`gourmet.lastCleanup`={at,visits,photos}、重複の行は店の数）。`app.js` の `settingsHooks` に入れた関数を設定を開くたびに呼ぶ（`renderDataRows`）。
- 店シートと店舗の詳細の役割（v377〜）: 地図の店シート `showMapShopSheet` は「要点だけ」＝写真・店名・駅・タイル・要点行・あなたの写真（新しい6枚まで）・「すべて見る（記録 N件・写真 M枚）›」`.msh-all`・フォロワーの写真。写真の全部と訪問の記録は店舗の詳細 `showShop`。つまみ `.msh-handle` をタップ、または上端で 40px 以上上に引き上げる（`wireSheetPullUp(ov, onUp)`、touch）と店舗の詳細へ。
- 登録の候補の並び（v377〜）: `withDistances(existing, results, ref)` が基準位置（写真の GPS → 現在地）から登録済みの店に距離を付けて近い順に並べ（予測候補は近い3件）、検索結果にも距離が無ければ付ける（結果の並び＝関連度は変えない）。表示は `renderCandidates` の `.c-dist`。
- 地図の接続なし（v377〜）: 地図タブでは見出しの帯を隠しているので、地図の上に小さな帯 `#map-offline`「接続なし ・ 見たことのある範囲だけ表示します」（`app.js` の `updateNetBar()` が出し入れ。店シート・位置指定中は隠す）。地図のタイル・TileJSON・グリフは sw.js がキャッシュ優先で最大 1500 件（`TILE_CACHE_MAX`）保持しているので、見たことのある範囲はオフラインでも描ける。
- 回帰テストの実行（v377〜）: scratchpad の `run-tests.js [同時数]` が `test-v364.js` 以降を並列（既定 4）で走らせて PASS／FAIL と所要時間をまとめる（12本で約 1 分。直列は約 12 分だった）。各テストは独立した browser と context なので並列でよい。新しいテストは `test-vNNN.js` の名前にすれば自動で入る。
- 文言の決めごと（v378〜）: 画面の文では 店は「店」（「店舗」は使わない。コードや CLAUDE.md の画面名「店舗の詳細」はそのまま）、自分の訪問は「記録」（「訪問日」「N回の訪問」のような回数・日付の言い方は可）、他人のものは「投稿」。投稿詳細の見出しは自分のものなら「記録」、他人なら「投稿」。店の情報の編集シートは「店の情報」、その他の一覧は「店の情報を編集／この店を削除」。文末の「。」はトースト・空の表示では付けない。
- 写真なしで記録の周辺の候補（v378〜）: 「写真なしで記録する」で2枚目へ進むと `nearbyForNoPhoto()` が現在地（`getCurrentPos(4000)`）を取り、`loadCandidates(lat, lon, {auto:false})` で周辺の店（登録済み → 候補）を出す。自動では選ばず、タップで選ぶ。店名を打ち始めていたら出さない。現在地は `lastGps` に入れて距離・重複の確認・位置の基準に使う。
- ホームの写真を正方形に（v378〜）: 設定→表示「ホームの写真」`#set-home-square`（写真の形のまま＝既定／正方形にそろえる。`gourmet.homeSquare`）。`paintFeed()` が `.feed-square` を付け、`mzOrder` の縦横比を 1 に、`buildFeedCard` は `mzWatch` の代わりに `aspect-ratio: 1` で描く。
- 暗色・幅360の点検（v378）: 元に戻すトースト・ホームの空の状態・コメントのログイン・設定のデータ・地図の接続なしの帯・要点だけの店シート・写真なし登録の周辺候補を暗色／明色・幅360で撮って確認（scratchpad の `audit378.js`）。直した所: 地図の接続なしの帯 `.map-offline` が幅360で左上の表示範囲のボタンに重なっていたので `top: 118px`（ボタンの下）に。
- 地図のピンのラベル（v379〜）: 店名のラベルは `pin-labels-hi`（z13＝`DROP_ZOOM` 以上、店名＋ジャンル）に加え、引いているとき用の `pin-labels-lo`（z10〜13、★4.5 以上か金の★ `five` の店だけ店名、`text-optional` で重なれば隠す）。この層はまとまりのある `shops` ではなく、評価の高い店だけを入れた別ソース `shops-hi`（`refreshMapData()` で `shops` と一緒に setData）に描く。`shops`（cluster）に z13 未満の文字の層を足すとタイルが描けなくなった（この環境で再現。安全のため本番も同じ作り）。
- 記録カードの共有（v379〜）: 統計の「記録カードを画像で共有」の大きなボタンをやめ、年のまとめと同じ `.card > .yc-head`（見出し「記録カード」＋ `.btn.small.yc-share`「画像で共有」）に。年のまとめの共有画像は `yearSel` の年を反映している（`buildYearCard(d)`）。
- 端末内の自動バックアップ（v379〜）: IndexedDB `gourmet-photos` を v4 にして `backups` ストア（keyPath `at`）を追加。`Store.putBackup(data)`（記録だけ＝`buildBackup(false)`。新しい4世代 `BACKUP_KEEP` を残す）／`listBackups()`（新しい順、`{at, n:{shops,visits,wishes}}`）／`getBackup(at)`。`app.js` の `autoBackupLocal()` が起動 20 秒後と 6 時間おきに、前回（`gourmet.lastAutoBackupAt`）から 7 日たっていれば残す。設定→バックアップ「端末内の自動バックアップ」`#auto-backups`（行の下に「前回 … ・ N世代」）→ 世代の一覧（日時・店・記録）→「ファイルに書き出す／この内容を復元する（`restoreBackup`＝新しい方を取り込む。今の記録は消えない）」。「いま残す」で手動でも残せる。
- 速さの再計測（v379。v375〜v378 の影響）: プロフィールの写真 150〜177ms、統計 113〜120ms、検索の「お店」初回表示 416〜463ms、検索の写真 208〜216ms（v375 の 402〜466／232〜258 と同じか少し速い）。遅くなった所は無かった。
- 月の振り返りの共有（v380〜）: `renderMonthCard()` の見出しに年のまとめと同じ `.btn.small.yc-share`「画像で共有」→ `buildMonthCard(d)`（1080×1350。帯に「N月」、名前、店数・回数・新しい店の3タイル、その月の写真を新しい順に最大6枚（3列・角丸39。`fullPhotoUrl` で読み、読めない写真は飛ばす）、写真が1行以下なら下に「よく行った店」3つ）→ `shareImageBlob`。
- 駅の店を地図で見る（v380〜）: 探すの検索でキーワードが登録済みの店の最寄駅と一致する（`stationOfKeyword()`。空白・全角半角・大文字小文字・末尾の「駅」は無視）とき、一覧の上に `.list-station-map`「○○駅の店を地図で見る ›」（`renderListSections(box, shops, groupFn, head)` の `head`）→ `showStationOnMap(st)`＝`pendingMapFocus = {bounds}` で地図タブへ（`applyPendingFocus` が `fitBounds`。位置のある店が無ければトースト）。発見の「駅から」のチップは従来どおり検索へ（1タップ目は変えず、2タップ目で地図）。
- 使い方（v380〜）: 設定→ヘルプ「使い方を見る」`#show-welcome` → `Views.showHelp()`（`.help-modal`＝`panel-modal`、`.hp-sect` 7つ: 記録／探す／地図／マイページ／ホーム／店の詳細と記録／バックアップ。各2〜3行）。初回の「ようこそ」`#welcome-modal` は初回起動だけで、設定からは出さない。画面名を変えたらここも直す。
- 暗色・幅360の点検（v380）: 統計（年のまとめ・月の振り返り・記録カード）・自動バックアップの一覧・使い方・発見の駅から・駅の検索の地図の行・地図を暗色／明色・幅360で撮って確認（scratchpad の `audit380.js`）。直す所は無かった。
- 店のまとめの共有（v381〜）: 店舗の詳細の `#d-share` と地図の店シートの `.msh-share`（自分の店）→ `shareShop(shopId, text)`。写真があればアクションシート「店のまとめ（画像）／文字だけ」、無ければ文字だけ。画像は `buildShopCard(shopId)`（1080×1350。帯に店名・駅 県 市 ジャンル、あなた／みんな／来店のタイル（無いものは出さない）、写真は新しい順に1枚目を全幅・2〜4枚目を下に3つ。角丸39）。他人の店シート `showNetShopSheet` は文字のまま。
- 付いている条件のチップ（v381〜）: `activeFilterChips(count, unit)` が ジャンル・★・都道府県 のチップ（`.flt-active`。「N件／N枚」＋ `.flt-chip` ×で1つずつ外す）を返し、お店は一覧の上（駅の行の下。`renderListSections` の `head`）、写真は `.mz-tools` の左（右端は「選択」）に置く。条件が無ければ何も出さない。「絞り込み」ボタンの数 `.flt-n` は従来どおり `updateFilterBadge()`。
- 文字の大きさの見本（v381〜）: 設定→表示「文字の大きさ」の行の下 `#sub-font` に `applyFontScale()` が「1.10倍 ・ 麺屋 こがね」を入れる（画面ごと拡縮するので、この行がそのまま見本。特大でも折り返さないよう nowrap＋省略）。
- 速さの再計測（v381。v379〜v380 の影響）: この容器は v379 を測ったときより 2〜3 割遅かった（v379 のコード自体が プロフィールの写真 182・統計 126・探すの「お店」490・写真 280ms の中央値）ので、v379 を `git worktree` で別ポート（5961）に置いて同じ機械で交互に4回ずつ測った（`perf381-ab.txt`）。v381 は プロフィールの写真 220・統計 137・「お店」453・写真 268ms（中央値）で v379 と同じ範囲、マイページの写真と統計だけを8回ずつ繰り返す `perf381-rep.js` でも中央値 110〜135／86〜109ms で差は無かった。遅くなった所は無い。版をまたいで比べるときは同じ機械・同じ時刻で A/B する。
- 行きたい店の「近く」（v382〜）: `renderWishlist()` は現在地（`lastKnownPos`）から 1km 以内（`NEAR_M`）の行きたい店を「近く」の見出し `.wish-group` で先頭にまとめ（距離順。行は `.wish-near`、距離の代わりに `徒歩N分`＝`walkMinutes`）、残りを「ほか」の下に今の並び順で出す。並び替えが「近い順」のときは全体が距離順なので分けない。現在地が無ければ従来どおり。
- 「また来た」の長押し（v382〜）: 店舗の詳細 `#d-revisit`・店シート `.msh-revisit` を `wireLongPress(el, onLong, ms=600)`（pointer。8px 動いたら取り消し。成立したら直後の click を capture で1回握りつぶす。contextmenu と touch-callout を止める）→ `quickRevisit(shopId, afterChange)`＝前回の記録と同じ★・ジャンル・visitType で今日の訪問を写真なしで `Store.addVisit`、`App.toastUndo('写真なしで記録しました ・ ★4.0'／'評価なし')` の「元に戻す」で `Store.deleteVisit`。タップは従来どおり `openRegisterFor`。v350 で廃止した `quickRevisit()` を「長押し＋元に戻す」の形で戻した（タップの1段階目には置かない）。
- 設定の最下段（v382〜）: ヘルプは「使い方を見る」だけ。その下に「このアプリ」`.set-about`（`#settings-status` のキーの状態とアプリの版、店舗データの出典）、最後に小さな `.set-list.set-dev` の `details.set-adv`「開発者向け設定（APIキー）」（13px・灰。中身の id は従来どおり `#settings-api-key` など）。
- 暗色・幅360の点検（v382）: 店の共有のシート・条件のチップ（お店・写真）・駅の地図の行・行きたいの「近く」・文字の大きさの見本（特大）・設定の最下段（開発者向けの開閉）・使い方を暗色／明色・幅360で撮って確認（scratchpad の `audit382.js`）。直した所: 幅360で「文字の大きさ」の見出しが折り返して見本が詰まっていたので、表示の行の選択肢を `max-width: min(118px, 40%)`・13px に（特大では見出しが折り返すが見本は1行のまま。見出しに min-width を付けると特大でモーダルが横にはみ出すので付けない）。設定の最下段と開発者向けのリンクを `--accent`（暗色で既定の青が読みにくかった）。
- 年のまとめの店名（v383〜）: `renderYearCard()` の「よく行った」「★が高かった」の店名は `.yc-shop`（ボタン。アクセント色）で、タップで `showShop`。統計の「よく行く店」`#stat-regulars` の行 `.rg-main` → `showShop` は以前からある。
- 探すの写真モードの「駅から」（v383〜）: `renderSearchPhotos()` の先頭に `.ex-station-row.ph-stations`（`topStations(8)`＝記録の多い駅。発見の「駅から」と同じ集計）。タップで `photoStation` に入れてその駅の店の写真（フォロー中の投稿は `p.station`）だけに、もう一度で解除。付いている条件のチップにも `station` として出て × で外せる。`enterListTab()`・`#flt-clear` で消える。お店モードには出さない。
- 記録の編集シートの「写真を足す」（v383〜）: `openVisitEdit` の訪問日の下 `.ve-photos`「写真 N枚／なし ・ 写真を足す」（隠した `input.ve-file`、複数可）。選ぶと `Api.compressImage` → `Store.addPhoto(shopId, visitId, 'dish', blob, fileHash)` → `warmThumb`、ログイン中は `publishPostForVisit`、`exploreItems = null`、`onDone('saved')`（シートは開いたまま。枚数を更新）。長押しの写真なしの記録にあとから写真を付けるため。
- 速さの再計測（v383。v381〜v382 の影響）: v380 を別ポートに置いて同じ機械で交互に3回ずつ（`perf383-ab.txt`）。中央値は プロフィールの写真 159→190・統計 130→134・探すの「お店」450→484・写真 259→256ms で、最初の描画だけ新しい版が2割ほど遅く見えたが、`perf381-rep.js`（8回ずつ繰り返し。新しい版を先に測る順）では プロフィールの写真 108〜118 対 105〜143、統計 104〜108 対 96〜99ms で差は無かった。v381 のときも同じ傾向だったので、最初の1回の差はこの容器のばらつき。遅くなった所は無い。
- 写真だけの全画面（v384〜）: `openPhotoViewer(items, index, {onRecord})`（`.pv-modal`。黒地。`.pv-track` は横スナップ、左右送りで前後1枚ずつ `setFullPhoto`。上に「2 / 5」、下に「11月3日 ・ ★4.5」と「記録を見る」）。拡大は2本指のピンチ（pointer で距離の比。1〜4倍）と2回タップ（2倍↔等倍）、拡大中は1本指で動かし `.zoomed` で横スクロールを止める。送ると等倍に戻す。Esc で閉じる。店舗の詳細の写真の帯 `.d-photoblock` のタップはこれ（以前は投稿詳細）。投稿詳細へは「記録を見る」。
- ホームのカードの長押し（v384〜）: `buildFeedCard` の写真 `.fpin-photo` を `wireLongPress` → アクションシート「○○ の投稿を見る（`showPublicProfile`）／行きたい店に保存・外す（`toggleWishForPost`）／店を地図で見る（位置があるとき。`focusMap` → 地図タブ）」。タップは従来どおり投稿詳細。
- 復元の差分（v384〜）: `App.backupDiff(data)`＝種類ごとに 無い（こちらに無い id）・古い（バックアップの方が updatedAt が新しい）の数と `total`（`restoreBackup` と同じ判定）。設定→自動バックアップの「この内容を復元する」は、`total` が 0 なら「今の記録と同じです（取り込むものはありません）」で終わり、あれば confirm に「店: 無い 2・古い 1／記録: 無い 5／行きたい: なし」を出してから取り込む。
- 暗色・幅360の点検（v384）: 写真だけの全画面・また来たの長押しのトースト・編集シートの写真の行・年のまとめの店名・行きたいの近く・写真モードの駅のチップ・ホームの長押しのシート・復元のシートを暗色／明色・幅360で撮って確認（scratchpad の `audit384.js`）。直す所は無かった。
- 写真のタップはどこでも写真だけの全画面（v385〜）: 投稿詳細（自分・他人。`buildPostSection` の `.pd-photo`。他人の写真は `{url}` で渡し `openPhotoViewer` が `img.src` に入れる。日付は自分の記録だけ）、お店の記録（`buildShopFeedSection` の `.sfs-slide`。その記録の写真を左右送り）、店舗の詳細のタイムライン（`.vl-tlph`）、地図の店シートの「あなたの写真」（6枚を左右送り。「記録を見る」でシートを閉じて `buildOwnShopPost` の投稿詳細）。`openLightbox` と `#lightbox` は呼び元が無くなったが公開 API と HTML は残している。
- 探すの一覧の上の行（v385〜）: `.list-head`＝左に 件数 `N件`（条件があればそのチップ `.flt-active` に件数が入るので重ねて出さない）、右に並び替えの今の値 `.list-sort`「★が高い順 ⌄」（`sortHeadButton()`。タップでアクションシート、今の値に ✓、選ぶと `#flt-sort` に書いて `renderList()`）。絞り込みのシートの並び替えはそのまま。写真モードには無い。
- 速さの再計測（v385。v383〜v384 の影響）: v382 を別ポートに置いて同じ機械で交互に3回ずつ（`perf385-ab.txt`。中央値 プロフィールの写真 147→167・統計 119→132・探すの「お店」426→368・写真 212→229ms）。新しい版を先に測る順に変えた2回（`perf385-rev.txt`）では 154／127 対 142／139、132／158 対 155／122、463／377 対 346／367、233／188 対 208／216ms と前後が入れ替わり、差は測る順とばらつきの範囲。遅くなった所は無い。交互に測るときは順も入れ替える。
- 全画面の「共有」（v386〜）: `openPhotoViewer(items, index, {shop})` に `shop`（name・station・pref・city）があれば下に `.pv-share`「共有」。いま見ている写真（正方形は次の1枚も）で `shareCardSheet(card, text, title)`＝投稿詳細の共有と同じ「縦長／正方形／文字だけ」のシート（v386 で部品にした。`wireSocial` の `.pd-share` もこれを呼ぶ）。呼び元はすべて `shop` を渡す（店舗の詳細の帯・投稿詳細・お店の記録・タイムライン・店シート・マイページ）。
- マイページの店ごとのカード（v386〜）: `renderProfilePhotos()` のカードのタップは写真だけの全画面（その店の写真を新しい順に左右送り）。お店の記録 `showShopFeed(shown, idx)` へは「記録を見る」。
- 使われなくなった部品の整理（v386）: 拡大表示 `openLightbox`／`#lightbox`（HTML・CSS `.lightbox-box`・`.lb-close`・見出しの一覧の `.lightbox-caption`・zoom の `#lightbox`）を削除（v385 で呼び元が無くなった）。js と index.html に文字列として現れない CSS（v368 と同じ基準＋数字を除いた接頭辞）: `.vl-back`・`.vl-titles`・`.vl-sub`・`.vl-head`・`.vl-tools`・`.vl-chips`・`.vl-chip`・`.save-later`・`.save-wish`・`.pd-menu-btn`・`.pd-date`・`.ex-loading`・`.stat-actions` の 21 規則を削除。`maplibregl-*` はライブラリの class なので残す。
- 暗色・幅360の点検（v386）: マイページからの全画面と共有のシート・お店の記録・探すの並び替えの見出しとシート・投稿詳細からの全画面・タイムラインとそこからの全画面・店シートからの全画面を暗色／明色・幅360で撮って確認（scratchpad の `audit386.js`）。直す所は無かった。
- 全画面の「…」と左右送り（v387〜）: `openPhotoViewer` の下の右端 `.pv-more`（端末内の写真のときだけ出す）→ アクションシート「この写真を別の記録へ（同じ店に記録が2つ以上）／別の店へ／削除」＝投稿詳細の「…」と同じ（`openPhotoMove`、`deferDelete`＋`toastUndo`）。終わると全画面を閉じて `opts.onChange()`（無ければ `App.refreshCurrent()`。店舗の詳細は `showShop` で描き直し、投稿詳細・店シートは閉じる、マイページは `renderProfilePhotos`）。左右の端に `.pv-nav`（‹ ›。端では隠す）、← → キーでも送る（`track.scrollTo` smooth）。
- 探すの写真モードの並び替え（v387〜）: `.mz-tools` の左に 枚数（条件のチップがあればそこに）、「選択」の左に `sortHeadButton(PHOTO_SORTS, photoSort, onPick)`（`photoSort`＝new 新しい順／rating ★が高い順／old 古い順。お店の見出しと同じ部品を引数ありで使う）。並べてから `mzOrder` に渡す（見た目の整え方は変えない）。`enterListTab()` で new に戻る。
- 速さの再計測（v387。v385〜v386 の影響）: v384 を別ポートに置いて同じ機械で2回ずつ順を入れ替えて（`perf387-ab.txt`。中央値 プロフィールの写真 178→153・統計 138→136・探すの「お店」441→480・写真 246→290ms）。「お店」と写真は新しい版が1〜2割遅く見えたので、同じ画面を6回ずつ繰り返す `perf387-rep.js`（一覧の描き直しと写真モードへの切り替え）で確かめると 一覧 98／87 対 109／93ms、写真 141／184 対 155／145ms と前後が入れ替わり、差はばらつきの範囲。遅くなった所は無い。
- マイページの写真の「駅から」（v388〜）: `renderProfilePhotos()` が絞り込み欄の下に `#pf-stations`（`.ex-station-row.ph-stations.pf-stations`、`topStations(8)`）を置き、タップで `pfStation` に入れてその駅の店のカードだけに（絞り込み欄の語と両方で絞る。件数 `#pf-photo-n` は「N店」）。もう一度で解除。`enterProfileTab()` で消える。
- よく食べたジャンル → 写真モード（v388〜）: 統計 `#stat-genres` の行のタップは `listResultMode = 'photo'`（`#list-mode-segs` の .on も合わせる）にしてから `renderList()`。料理のジャンルは写真に付いているので、お店の一覧より写真の方が合う。
- 店の詳細の「その他 → 最新の記録に写真を足す」（v388〜）: `pickPhotos(onFiles)`（その場で作る隠した input。選んだら消す）→ `addPhotosToVisit(vs[0], files)`（v383 の編集シートの処理を部品にした。圧縮・保存・サムネ・公開投稿の出し直し・トースト。足した枚数を返す）→ `showShop`。長押しで付けた写真なしの記録に、編集シートを開かずに写真を付けるため。
- 暗色・幅360の点検（v388）: マイページの駅のチップ・全画面の下の行（‹ ›・共有・記録を見る・…）と「…」のシート・写真モードの並び替えの行（条件のチップと同時）とそのシート・よく食べたジャンルからの写真モード・店の詳細の「その他」を暗色／明色・幅360で撮って確認（scratchpad の `audit388.js`）。直す所は無かった。
- 地図のテスト: この環境では `tiles.openfreemap.org/planet` の TileJSON が取れず style が load しない（ピンの層が無い）。Playwright では TileJSON を偽の JSON で返し、タイル・グリフは 404 にすると `load` が来てピンが描ける（`test-v371.js` の route）。
- 店舗の詳細の写真の帯（v365〜）: `#d-visits` の先頭に `.visit-block.d-photoblock`（店の写真を新しい順に全幅・左右スワイプ・点。`buildOwnShopPost` → タップで `showPostDetail`）を戻した（v338〜v363 と同じ。写真が無ければ出さない）。その下に v364 の訪問ごとの `.sfs`。
- 店舗の詳細の訪問（v364〜）: `showShop` の `#d-visits` は、訪問の一覧 `showVisitList` と同じ部品 `buildVisitSection(shopId, v, {editVisit, delVisit})` を `.pf-shopfeed.d-visitfeed`（モーダルの余白 20px の外まで広げる）に新しい順で縦に並べる。写真（★）→ 操作行（♥・コメント・経路・共有 … ＋・…）→ 日付 → ジャンル ・ 詳細 ›。「訪問記録」の見出しと ✎（`#d-visitlist`）は廃止。…の「編集」は v367〜 `openVisitEdit` のシート。v338〜v363 の店の写真カルーセルは v365 で帯として戻し、訪問履歴のサムネは無い。
- 今年のまとめ（v364〜）: 統計の「もっと見る」の先頭 `#stat-year`（`renderYearCard()`、`renderRecordCards()` の最初）。`yearSummary(year)` が今年の訪問から 店数・回数・新しい店（初訪問が今年）・都道府県数・よく行った店3・★が高かった店3（評価ありのみ）・よく食べたジャンル3 を出す。今年の訪問が無ければカードごと出さない。「画像で共有」は `buildYearCard(d)`（canvas 1080×1350）→ `shareImageBlob(blob, filename, text, title)`（Web Share → 無ければ保存モーダル。記録カード `shareRecordCard` も同じ関数）。
- 新しい版（v359〜）: sw.js は install で skipWaiting しない。app.js が 起動時・前面復帰時・30分ごとに `reg.update()` し、新版が待機に入ったら
  起動 20 秒以内なら黙って切り替え（SKIP_WAITING → controllerchange → 再読み込み）、使用中なら下の帯 `.update-bar`「新しい版があります ・ 更新」を出してタップで切り替える。記録の入力中は保存後に切り替える。
- Service Worker: `?v=` 付きのファイルはキャッシュ優先（内容は版ごとに固定）。index.html だけネットワーク優先。
- 速さの計測（v358〜）: 店150・写真300 を入れて CPU 4倍遅で測る台本がある（scratchpad の `perf-scale.js`／`perf-prof.js`。CDP の Profiler で関数ごとの時間を出す）。
  直した所: ①写真の並び `mzFit()` は読み取り（高さ）と書き込み（行数）を rAF 1回にまとめる（1枚ごとに getBoundingClientRect でレイアウトを強制しない。ResizeObserver は `contentRect.height` を使う）。
  ②検索の「お店」一覧 `renderListSections()` は 12 件ずつ描き、残りはスクロールで近づいたら足す（IntersectionObserver）。③写真の保存直後に `Views.warmThumb(id, blob)` でサムネを作る（登録・取り込み）。
  効果（店150・写真300・CPU4倍遅）: 検索の写真 592→224ms、検索の一覧の初回表示 587→327ms、プロフィールの写真（2回目）84→70ms。
  v359〜 写真の一覧（プロフィールのアルバム `.pf-mz`・検索の写真・発見・ホーム）は `appendChunked(grid, total, make)` で先頭 40 件だけ描き、番兵 `.mz-more` が近づいたら 40 件ずつ足す（並び順 `mzOrder` は先に全件で計算）。
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
  店の詳細・店シートの要点行（あなた／みんな／訪問）は none のとき「みんな」の列を出さない（v335〜。「データ不足」の箱と説明文は廃止。箱を描いていた `ratePairHtml()` は v368 で削除）。検索カードも none を出さない。地図のピンの色も none なら自分の平均。
  一致率バッジ `tasteBadge()` は「味覚一致 82%・共通12店」の形で共通店舗数を添え、共通5件未満は「共通N店・データ不足」（%なし）、5〜19件は「・参考」。
- お気に入り♥は v323 で UI を廃止（「行きたい」のしおりと紛らわしいため）。`shop.favorite` のデータと隠しチェック `#f-fav` は互換のため残す。戻さない。
- 統計タブ（v323〜）: 主役は「行った店・今年の訪問・★5をつけた店・行きたい店の達成」の4タイル（`#stat-cards`）。残り（`#stat-cards-more`＝味の平均・訪れた都道府県の2つ（v339〜）・記録カード・よく行く店・制覇マップ・グラフ…）は
  `#stat-more` に畳み「もっと見る」で開く（開閉は `gourmet.statMore` に記憶）。グラフ部品（Chart.js）はタイルを描いた後に読む。
- 「★5 ×N人」（v318〜。v356〜 数えるのは ★4.5 以上 `FIVE_MIN_RATING`）: 平均は人数が増えると 4 点台に寄るため、別に `fiveStarFans()` で数える（地図のピンの★に使う）。
  数えるのは自分と味覚一致率 `FIVE_MATCH_MIN`（70%）以上の人だけ。地図ではピンの頭を金の★にする（v320〜）。まとまりの色は ★5 の有無ではなく中で一番評価の高い店の色（利用者の希望）。
  v339〜 カードには出さない（地図のピンの★だけ。`fiveChipHtml()` は v368 で削除）。検索の「お店」一覧は v357〜 お店の記録と同じ形（写真の★バッジ＋「あなた向け」の1行）。プロフィールの写真カードは写真と店名だけ。
- 他人の投稿では日付を出さない（`isMine` で判定済み）。
- 行きたい店（v303〜）: 訪問で消さず `doneAt` を付けて「達成」にする。`Store.wishes()` は未達成のみ、達成済みも含めるなら `Store.allWishes()`、
  達成度は `Store.wishProgress()`。バックアップ・同期には達成済みも含める（`allWishes`/`rawWishes`）。
  訪問と行きたい店の照合 `findWish()` は店名の空白・全角半角・大文字小文字を無視（v334〜）。位置の無い店を記録したら行きたい店の位置を店に写す。
  地図の「行きたい店だけ」（`mapScope === 'wish'`、検索バー横の🔖）は行った店のピンを隠す。位置つきの行きたい店が無くなったら `refreshMapData()` が元の表示に戻す（空の地図にしない）。
- 店の位置の精度（v340〜）: OpenPOI の営業許可データ（`source: 'jff'`）の位置は住所から求めたもので、`level` が 8（街区・地番）未満なら町丁目の代表点＝数百m ずれる。
  `openPoiToCandidate()` が `coarse` / `posLevel`（town／block）を付け、`mergeCandidates()` は粗い候補に同じ店の正確な位置（OSM など）があればそちらを使う。
  保存時は `Register.pickBestPos(selected, lastGps)`: 粗い候補で写真・現在地が 600m 以内ならその位置（`posLevel: 'gps'`）。店には `posLevel`（gps／block／town／manual／geocode）を保存（`sanitizeRecord` も通す）。
  店舗の詳細は `posLevel === 'town'` のとき「ピンの位置は町名までのおおよそです ・ 直す」を出し、店舗情報（編集）に「住所から探す」（`fixPosByAddress` → Nominatim）と「地図で指定」（`pickOnMap` → 地図の中央の印 `#map-pick`）がある。
  店舗情報の保存 `saveShopInfo()` で住所が変わったら、保存後に `Api.geocodeAddress(住所)` の先頭で位置を更新する（v362〜、v363 で地理院に）。`geocodeAddress()` は国土地理院の住所検索（`msearch.gsi.go.jp`、無料・キー不要・丁目番地に強い）→ 駄目なら Nominatim の順で、`level` は番地まで一致なら geocode、丁目までなら town（店の `posLevel` に写す）。見つからなければトーストで「住所から探す／地図で指定」を案内。地図が開いていれば `refreshMapData()`、閉じていれば次に開くとき Store から作り直す。「住所から探す」`fixPosByAddress` も同じ関数の候補から選ぶ。
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
- 地図の店シート（v336〜）: `showMapShopSheet` / `showNetShopSheet` は共通の `sheetHeadHtml()` で「つまみ → 写真（全幅）→ 店名 → 駅 → タイル3つ → 要点行」を描く。
  タイルは「N分（現在地の控えからの徒歩。`walkMinutes()`。無ければ「経路」）／また来た（他人の店は「行きたい」）／共有」（v360〜。「地図」はシートを閉じるだけで地図はすでに後ろに見えているため廃止）。
  「あなたの写真」`.msh-myrow` は v361〜 3 列の格子（`.msh-mycard` は正方形・角丸10）で折り返し、シートごと上下にスクロールする（横スクロールの帯は廃止）。要点行は「あなた／みんな／訪問」で無いものは列ごと出さない。
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
