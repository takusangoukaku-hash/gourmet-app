# v392 全体の見直し — 指摘の一覧と対応状況

v392 で、コード全体の精読（データ層・同期／起動と更新／登録と外部API／画面の前半・中盤・後半）と、全画面の目視（等倍・幅360・明色／暗色）を行った。
ここには見つかった指摘をすべて残す。**v392 で直したもの**は下の一覧、それ以外は未対応（次回以降の候補）。
番号は下の控えの番号（V=目視、A/E/F=views.js、S=store.js・cloud.js、P=app.js・sw.js・index.html、C=register.js・import.js・api.js）。
CSS の精読（デザインの決めごととの照合・使われていない規則）は時間の都合で途中で止めたので未実施。

## v392 で直したもの
- S1/P1/F1 写真の削除が確定しても消えていなかった（v375〜v391）。`deletePhotosWhere` が生の一覧 `rawPhotos()` を読む。確定で `pendingDel` から外す
- S2/S11 `cleanupOrphans`: 訪問があるのに店 id が違う写真は訪問の店へ付け替える（消さない）。消すのは訪問の無い写真だけ。判定は写真を読んだ後の一覧で
- S5/P8 別アカウントでのログイン時に、端末内の自動バックアップ・現在地の控え・取り込み／統合の覚え書きも消す
- S8 店の削除で、その訪問で達成になっていた行きたい店を未達成へ戻す。統合で `doneShopId` を付け替える
- S12 統合で移せなかった写真が残っていたら drop の店を消さない
- S13 IndexedDB: `onabort` を処理、接続が閉じられたら開き直す
- S4/P4 バックアップから戻した記録が次の同期でまた消える → 無かった記録は `updatedAt` を今にし、端末の削除の控えを外す
- P11 復元でプロフィールの名前・自己紹介を上書きしない（空の欄だけ）
- P2/P3 sw.js: 画面の要求は自分の `./`・`./index.html` だけ扱う（diet/・lab/ を横取りしない）。index.html を裏で書き換えない。プリキャッシュは `cache: 'reload'`
- P12 Anthropic SDK のプリキャッシュの URL を import と同じに
- P5 更新の帯は `reg.waiting` を使う。P10 初回訪問で再読み込みしない。P15 `?tab=` は許可リスト。P7 Android の共有（title/text/url でも開く）
- A1/E1/F2/C5 アクションシートの項目名を `esc()`（他人の表示名・店名、住所検索の結果）
- F3 編集シートの保存で 評価なし(★0) が ★3 になる。F4 時刻が 12:00 になる
- E2 同期のたびにマイページを描き直してスクロールが先頭へ戻る
- F6 モーダルを開いたまま引っ張ると更新が走る
- E7 全画面で後から出来たサムネが本体を上書きする
- A7/F8 自分だけの評価の店で「みんな」が出る（`conf !== 'none'` のときだけ）
- A2 行きたい店の入力で「京都勝牛」「焼肉道場」などが住所扱いになり保存できない
- A3（一部）店シートが「また来た」・タブ切り替えの後も残る → `closeMapSheets()`
- A4 マイページの「行きたい」から足しても一覧に出ない。A11（一部）達成度が外した直後のものを数える
- E3 写真→お店と続けて押すと写真の格子が残る。E5（一部）選択モードがタブ切り替え・戻るで残る
- E10 味の平均が 4.0 を「4」と出す
- C1（一部）店が自動選択・登録済み選択のあと店名を打ち替えると、既存の店が改名される／別の候補の位置・ID を引き継ぐ → 打ち替えたら選択を外す
- C7 保存直後の次の記録に「登録済み: さっきの店」が残る
- V1 探すの結果が左右に 16px はみ出す（文字が端・★バッジ切れ）。V2 店の詳細の写真の帯の上下の空き。V3 取り込みの見出しの崩れ
- V4/V5/V8/V9/V10 暗色で読めない字・白い箱（投稿者名、設定の上の行とアイコン、行きたいの区切り線、日付欄、開発者向けの入力欄）。V7（一部）地図のパネルと操作ボタンの暗色、店シート中はパネルを隠す
- V12 探すの0件のボタンの上の余白。V13 文字の大きさ「iPhone に合わせる」が Android・PC で 0.88 倍になる
- P13/V11（一部）文言: トーストの「。」、店舗名→店名、店舗データ→店のデータ ほか

## v393 で直したもの
- C3 遅れて届く結果が別の記録のフォームに入る（formSeq）。C4 訪問日の持ち方。C6 GPS つきで手入力した店の位置。C12 予測検索の基準位置。C13 候補のジャンル。C16（一部）保存ボタンの文言・文言の「。」と店舗
- S3 写真の付け替えの端末間同期（metaAt の新しい方）。S9 公開投稿の createdAt。S10 消え残る公開投稿・表紙の写真
- A8 黙って呼んだ現在地の失敗トースト。A9 絞り込みシートの listener。A10 地図の行きたいの「外す」を元に戻せるように。A11 確定後の達成度
- E6 駅のチップの行き止まり。E9 空のアルバムに残る駅の行。E13/F15（一部）文言
- F7 ユーザー名の変更。F9 お店の記録の写真の日付と編集先。F11 正方形モードの写真なしカード。F12 住所から探す。F14 いいねの二度押しと「0」

## 未対応（次回以降の候補。上にないものすべて）
とくに大きいもの:
- S6/S7 クラウドに削除の控えと本体が共存する場合の扱い、`retryDeletes` が失敗でも控えを外す
- S9 ホームの60件の切り方（出し直しの時刻順）。S10 写真も★も無くなった記録の公開投稿が残る。S14 同期の排他
- P6 地図タイル・ライブラリのキャッシュが更新のたびに消える。P9 文字の大きさを変えているときのキーボード上の位置
- C2 取り込みの途中失敗。C3 遅れて届く結果が今のフォームに入る。C4 訪問日の持ち方。C6 GPS つきで手入力した店が位置なしになる。C8〜C15
- F5 削除の確定で店の詳細が勝手に開き直す。F7 ユーザー名の変更。F9/F10 お店の記録の日付と編集先。F11〜F14
- A5/A6/A8〜A10/A12〜A16、E4/E6/E8/E9/E11〜E15、V6/V14〜V19

---
以下は見直しのときの控え（そのまま）。

# v392 全体の見直し — 控え（修正候補）

## 目視（allscreens392.js、等倍・幅360・明/暗）
V1 探すの結果: #shop-list -16 と .pf-shopfeed -16 の二重で左右16pxはみ出し（文字が端0px・★バッジ切れ）。list-head/mz-tools/ph-stations/list-station-map/mz-grid も端に密着 → style.css 576/672
V2 店の詳細の写真の帯 .d-swipe.pd-carousel: 1:1 contain で上下に帯、★が帯に浮く → 4:3 cover に（下の .sfs-slide と同じ）
V3 取り込みモーダル: .modal-head の margin -20px が padding 0 の箱で効いて ✕が画面外、手順の帯に重なる → .import-modal .modal-head を直す。h2 padding 8px 40px 0 も
V4 暗色: button.pd-author（他人の投稿の投稿者名）が黒字 → color: var(--text)
V5 暗色: #set-profile の名前が黒字。.set-ic-gray/blue/green が明色固定
V6 暗色: ようこその項目アイコンの箱が白
V7 地図: .map-panel と #map-search が #fff 固定（暗色で白）。maplibre の操作ボタンも白。検索を開くと左下に灰色の空箱。店シートを開いても絞り込みパネルが出たまま（msh-open で隠す）
V8 .wish-row の区切り var(--line, #efefef) → --line 未定義。--border-lite に
V9 記録の編集シートの日付 input.ve-date が素の見た目（暗色で白）
V10 開発者向け設定の入力欄が素の見た目（暗色で白）。見出しが大きい
V11 文言: 店舗名→店名（openShopEdit）、公開プロフィール「42 店舗」→店、設定「店舗データの出典」「店舗検索の強化」
V12 探すの0件: .empty-acts に上の余白なし
V13 systemFontScale: -apple-system-body 非対応の環境（Android/PC）で 15/17=0.88 になる → CSS.supports で判定して 1
V14 --ui-zoom≠1 のときホームの格子でカードが重なる（0.88 で確認）→ mzFit の計測を調べる
V15 登録: #reg-dup「登録済み」と候補の同じ店が二重。案内文「入力に合わせた予測候補です。…」
V16 店の詳細の見出し: ✕ とジャンルの行が詰まる
V17 設定「ログイン中のアカウントme」（表示の確認）
V18 統計: Chart.js が読めないとき空のカードが残る
V19 ようこその見出しと ✕ の縦位置

## 精読A（views.js 1–2350）— 要検証
A1 XSS: openActionSheet の a.label を esc せず innerHTML（6300）。他人の shopName（1384 openClusterList）、displayName（6246）、geocoder（6163）、register.js:242
A2 parseWishInput: addrRe /^(〒|日本|.{1,3}[都道府県])/ が「京都勝牛」「焼肉道場」「宇都宮みんみん」を住所扱い → 店名が空で保存できない（2094–2097）
A3 店シート（.mapshop-modal / body.msh-open）が、詳細から「また来た」/削除/地図で指定へ進んでも残る（1502–1506, openRegisterFor 3729, 5153, pickOnMap 6135）
A4 マイページ「行きたい」から追加しても一覧が更新されない（2167–2170）
A5 lastKnownPos が古いまま経路の origin と「現在地」に使われる（1171, 1182）
A6 地図の長押し: タイマー成立後に動かしても取り消されない（6110 moved）
A7 「みんな」: raters に自分が入るので自分だけでも出る（1483, 1543, 4762, 5079）→ conf !== 'none' で
A8 locateUser(false) でも失敗トースト（925, 1142, 1126）。toast が flushUndo を呼ぶ副作用
A9 openFilterSheet: 使い回す panel に毎回 listener 追加（2286–2287）
A10 地図の行きたいの吹き出し「外す」が即削除（1869–1874）→ deferDelete + toastUndo
A11 達成度が保留中の削除を数える／commit 後に描き直さない（2188, 2243）
A12 clusterMaxZoom 11 なので z>=15 の分岐（v371 まとまり→一覧）は到達しない（813, 892）。items.slice(0,12) で13店目以降が黙って消える（1383）
A13 他人の lat/lon/rating を数値化・範囲確認せず使用、bounds.extend が try の外（1764–1813）。sanitizeRecord も範囲なし
A14 文言: 1267 の空表示に「。」、2223「地図かホームを開くと取れます」（ホームは取らない）、1083 行きたい店の位置なしのトースト
A15 フォロワー投稿の読み込み中に開いたシートが更新されない（1935–1936）
A16 focusMapAt が setTimeout(350)+jumpTo（6169–6172）→ focusMap に

## 精読S（store.js / cloud.js）— 要検証
S1【重大】写真の削除が消えない（v375〜）: deletePhotosWhere が allPhotos()（保留中 pendingDel を除く）を読むので、deferDelete→commit の deletePhoto が何も消さない。deleteVisit の写真も同じ。pendingDel は commit で外れない（store.js:372, 602, 611）→ deletePhotosWhere は生の meta を読む。完了で pendingDel から外す
S2【重大】統合を別端末が受けると drop の店の写真を孤児として消す: syncRecords→cleanupOrphans→syncPhotos の順（cloud.js:79, 655、store.js:646）。→ cleanupOrphans は「訪問はあるが shopId が違う／店が無い」写真を visit.shopId へ付け替え、訪問が無いときだけ消す
S3 写真の付け替えの同期: (a) 同じ店の別の記録への移動は別端末に届かない（relink は shopId が違うときだけ cloud.js:332）(b) meta の書き込みは1回きり・失敗は握りつぶし → 次の syncPhotos でクラウドを正として戻される (c) uploadPhoto/hydrate が開始時の写しで上書き → metaAt を持たせ新しい方を採用
S4 バックアップから戻した削除済みの記録が次の同期でまた消える（store.js:656、app.js:746）→ restore で無かった記録は updatedAt=now・墓標を消す・クラウドの控えも消す
S5 別アカウント: wipeLocal が backups ストアを消さない（store.js:717）＋ gourmet.lastPos / lastAutoBackupAt / mergeIgnored / importSkipped.v1 / pendingDel
S6 クラウドに控えと本体が共存するゾンビ（pushAllRecords が無条件 upsert、pullDeleted の失敗握りつぶし cloud.js:273, 159）
S7 retryDeletes がクラウド削除の失敗でも端末の墓標を消す（cloud.js:155, 675…）
S8 deleteShop が訪問の達成（wish）を戻さない（store.js:423）。mergeShops が wish.doneShopId を付け替えない
S9 フィードの60件が createdAt（出し直しの時刻）順で切られる（cloud.js:436, 618）。publishAllPosts が毎回 createdAt=now
S10 publishPostForVisit: 写真も★も無くなった記録の公開投稿が残る（cloud.js:423）。表紙 p0 が順不同、ar が別の写真
S11 cleanupOrphans の id 集合が await の前（store.js:641）
S12 mergeShops: 読めなかった写真を deleteShop が消す（store.js:459）→ drop に写真が残っていたら中止
S13 IndexedDB の tx.onabort 無し、db() の接続を onclose で捨てない（store.js:178…）
S14 ログイン時の同期と sweep が排他でない、pending がログアウトで残る（cloud.js:79, 623）
S15 小: applyRemote が1件ごとに persist（O(n²)）、syncApiKeys で消したキーが復活、ready が失敗を保持、過去日の訪問の doneAt、resyncPhotos が削除済みを再取得

## 精読P（app.js / sw.js / index.html / manifest）— 要検証
P1 = S1（写真の削除。Chromium で再現済み: commit 後も IndexedDB に残り、再起動で復活）
P2【重大】sw.js: navigate をすべて BITEMAP の index.html で返す（sw.js:78-83）→ diet/・lab/ を開くと BITEMAP の HTML が返り、取り直した diet の index.html が BITEMAP の ./index.html として保存される（v370 の退行）→ 自分のシェル（root か root+index.html）だけ扱う
P3 sw.js: 裏で取り直した新しい index.html を古い版のキャッシュに入れる → 新 SW の install が終わらないままオフラインで開くと CSS/JS が無い。→ navigate では index.html を書き込まない（install のプリキャッシュだけ）。addAll は cache:'reload'
P4 = S4（復元した記録が次の同期で消える）
P5 更新の帯が最初の waiting worker を握る → 2回目のデプロイ後「更新」が効かない（app.js:469, 61）→ activate(reg.waiting || sw)。入力中に押して破棄した場合も固まる（453）
P6 地図タイル・CDN ライブラリ・ジャンルの絵が版つきキャッシュ gourmet-vNNN に入り、更新のたびに消える（sw.js:9, 41, 50）→ gourmet-cdn / gourmet-tiles を版なしに
P7 Android の共有ターゲット: manifest の action "./" に share が無く app.js:495 の params.has('share') に入らない（v327〜ずっと）→ title/text/url でも入る
P8 = S5（自動バックアップが別アカウントに残る）
P9 --kb が zoom で拡大される（app.js:51、style.css:2129, 2057）→ kb / scale
P10 初回訪問で数秒後に再読み込み（clients.claim の controllerchange。app.js:460）→ hadController のときだけ
P11 復元がプロフィールの名前・自己紹介を古い値で上書き（app.js:764）→ 空の欄だけ埋める
P12 sw.js:16 が anthropic-sdk.js?v=${VN} をプリキャッシュするが api.js:811 は ?v=330 を import → 揃える
P13 文言: app.js:288/301 トーストの「。」、453「新しいバージョンがあります。…」、index.html:608/619/626/639/628 店舗、472 友達/友だち・記録→投稿、375 しぼりこむ、app.js:157 未ログインにも「つながると同期します」
P14 aria-label の無い閉じるボタン（index.html:451, 459, 484）、ラベルの無い入力（#f-shop-name, #f-comment, #map-search, #flt-keyword, selects）、#toast に role=status
P15 ?tab= を未検証で querySelector（app.js:486）→ 許可リスト

## 精読F（views.js 4650–6881）— 要検証
F1 = S1。F2 = A1（XSS。6246 displayName）
F3【確定】編集シートの保存で 評価なし(★0) が ★3 になる（5506 `rating: rating || 3`）→ `|| 0`
F4【確定】編集シートの保存で時刻が必ず 12:00 になる（5505）→ 日付が同じなら datetime を保ち、変えたら元の時刻を引き継ぐ
F5 編集シートからの削除の commit で店の詳細が勝手に開き直す（5205、5688）。delVisit（5206）・5452・5035 も「モーダルが開いている」だけで判定 → 今見ている店 id を覚え、開いていてその店のときだけ描き直す
F6 引っ張って更新がモーダルの中の操作でも発火（5917）→ .modal の中／開いたモーダルがあれば無効
F7 「ユーザー名を変更」が即 username を空にする（5872）。やめても空のまま同期、古い handle が解放されない → 保存済みの値に触れず入力欄を出す
F8 = A7（みんなの列。5079, 4762, 1483, 1629）
F9 お店の記録（buildOwnShopPost）の写真の日付・編集先が全部最新の記録になる（6430, 6475, 6445）→ it.ph.visitId で引く
F10 投稿詳細を店の詳細の上で開いて編集・移動・削除すると、下の店の詳細が古いまま（6445, 6451, 6431）
F11 ホームの正方形モード: 写真なし／読めないカードが span 46 のままで次と重なる（6212）→ mzRO で監視か挿入後に mzFit
F12 編集シートの「住所から探す」が入力中の値を捨てて保存済みの住所で探す（5398, 6155）
F13 フォロー／解除でホームと networkLoaded が更新されない（6780, 6617）
F14 いいねの連打ガード無し、0 を「0」と表示（6313–6322）
F15 文言: 店舗（5378 店舗名, 6673, 6857）、空表示の「。」（5330, 5602, 6586, 6650, 6751, 6808, 6839）、「プロフィール画面の「ログイン」から」（5822, 6771 → 設定）、訪問（5154, 5605）、使い方 4886（写真なしで記録・行きたい店は1枚目の行）
F16 小: 公開プロフィールの「食の一致度」が tasteMatch と別式（6708）、統合一覧の写真数が古い（5325）、username なしのフォロー通知（6590）、店の左右送り（4974–5019, 5102–5112）は死にコード

## 精読E（views.js 2350–4650）— 要検証
E1 = A1（XSS）
E2【確定・再現】Cloud.onStatus('synced') のたび renderProfile()（3418）→ マイページのスクロールが 0 に戻り 40 件に戻る。synced は 5分おき・前面復帰・変更の 900ms 後に毎回出る（cloud.js:660, 638）→ このハンドラから renderProfile を外す（データが来たら refreshCurrent が呼ばれている）
E3【再現】写真→お店の競合: listSeq と searchPhotoSeq が別（3010, 3161）→ renderList で両方進める／await 後に mode を確かめる
E4 長押しで選択: 0.75 秒以上押し続けて離すと選択が外れる（2839, 2844 mz-pressed 300ms）→ wireLongPress と同じ fired 方式
E5【再現】選択モードがタブ切り替え・戻るで残る（2871。mzSelEnd は renderList と帯のボタンだけ）→ enterListTab / showExploreCats / openExploreSub / openExploreCat / switchTab で mzSelEnd
E6【再現】写真モードで駅のチップが0件だと行き止まり（3190 早期 return が駅の行とチップの前。updateFilterBadge が photoStation を数えない 2294）
E7【再現】setFullPhoto: サムネ未作成の写真は、後から出来たサムネが本体を上書き（272–279）→ fullSet フラグ
E8 loadExploreItems の同時取得の重複（2619）、explore の描画に seq なし（2676, 2720, 2968）
E9 アルバムが空になったとき 駅の行と件数が残る（3498 早期 return）
E10 味の平均タイルが 4.0 を「4」と出す（4159）→ fmtR
E11 都道府県別グラフが生の s.pref（東京/東京都が別、訪問0の店も数える 4276）
E12 評価のドーナツが半星を切り上げ（4221 Math.round）→ ★5のタイル（>=5）と食い違う
E13 文言の「。」: 2681, 3499, 2975, 3017, 3191, 3542。4065「共通店舗」
E14 renderStats が使わない allPhotos を await（4122）
E15 小: appendChunked の observer が置き換え時に切れない（2801）。buildShopFeedSection の .sfs-slide は showShop を開く（3905）= CLAUDE.md v385 の記述とずれ

## 精読C（register.js / import.js / api.js）— 要検証（12件は Chromium で再現済みとのこと）
C1【重大】店が（自動）選択されたあと店名を打ち替えても selected が残る → 既存の店が改名される／新しい店が別の候補の osmId・位置を引き継ぐ（register.js:204, 1027, 1067）→ 入力が selected.name と合わなくなったら選択を外す（少なくとも autoPicked のとき）
C2 取り込み: 途中で失敗すると半端な訪問が残り、集計も誤り、やり直すと重複（import.js:293-309, 317）→ 候補ごとに try/catch、失敗時は deleteVisit と作った店の削除
C3 遅れて届く非同期の結果が今のフォームに書かれる（loadCandidates 658, classifyPhotos 608, backfillMissing 909。resetForm は suggestSeq だけ進める）→ formSeq を導入。打ち始めていたら autoSelectBest しない
C4 visitDate が古くなる／不正（register.js:208, 585, 1018, 1158, 528）: 日付またぎ、古い写真を外したあと、EXIF が不正 → 既定は '' で保存時に今日、写真を外したら再計算、妥当性を確かめる
C5 = A1（XSS。register.js:242）
C6 GPS つきの写真で店名を手入力すると位置なしで保存、名前だけで遠くの同名店に合流（989, 1029, 1057）→ 写真の GPS を位置に使う（posLevel 'gps'）
C7 保存直後の resetForm が店名を消す前に updateDupHint → 次の記録に「登録済み: さっきの店」（1130）→ 最後に呼ぶ
C8 駅・県の取得が返る前に保存すると空のまま（968 vs 1045）→ 保存後に空の欄だけ後追い
C9 取り込みの店: 粗い位置（town）で posLevel なし、駅・県を埋めない（import.js:284）→ pickBestPos を使い、後追いで補う
C10 店名検索: 空白入りの店名の最後の語を地名扱い（796-805）→ まず全体で探す
C11 近くの候補: Overpass out 40 が id 順、coarse の距離で自動選択、クライアント側タイムアウトなし（api.js:177, 185, 204）
C12 suggestRef がセッション中ずっと同じ（41, 758）→ resetForm で null
C13 候補からのジャンルが札に出ないまま保存、前の候補のジャンルが残る（933-941）→ updateGenrePill、選び直しで消す
C14 アプリ内カメラが解像度を要求していない（431, 446）→ ideal 1920x1440、toBlob null の確認、ストリームの後始末
C15 取り込み: EXIF 日付なしは黙って今／読み込み中に閉じると壊れる（import.js:102, 74, 22）→ run token
C16 小: 同じ写真を何度も AI 判定（596）、保存ボタンの文言が「この内容で記録する」に変わる（1125）、IME の Enter で検索（166）、文言（323, 488, 589, 786, 775, 836、toLocaleDateString 328 / import.js:29）、compressImage が ImageBitmap を close しない（api.js:935）、ジャンルのシートを開くたび listener 追加（128）、Nominatim の osmId が "Node/123"（api.js:481）、views.js:2139/2156 が guessGenres(c).shopGenre を読む（実際は {dish, shop}）
