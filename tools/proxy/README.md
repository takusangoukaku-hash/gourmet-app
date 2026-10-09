# 検索中継（Cloudflare Worker）の設定手順

Yahoo!ローカルサーチ・ホットペッパーグルメ・Google Places のキーを **アプリに置かずに** 全利用者が使えるようにする仕組みです。
キーは Cloudflare Worker の Secret に置き、アプリは Worker の URL だけを知ります。
GitHub Pages（公開リポジトリ・静的サイト）にキーを書くと誰でも見えてしまうため、この形にしています。

費用: Cloudflare Workers の無料枠は 1 日 100,000 リクエスト。BITEMAP の検索量なら無料で収まります。
Node や wrangler は不要で、ブラウザのダッシュボードだけで完了します（所要 10 分）。

## 1. Worker を作る
1. https://dash.cloudflare.com/ でアカウントを作成（無料）→ 左メニュー **Workers & Pages** → **Create**。
2. **Start with Hello World!** を選び、名前を `bitemap-search` にして **Deploy**。
3. **Edit code** を開き、エディタの中身をすべて消して `tools/proxy/worker.js` の内容を貼り付け → **Deploy**。
4. 表示される URL（例: `https://bitemap-search.xxxx.workers.dev`）を控える。

## 2. キーを登録する（Secret）
Worker の **Settings → Variables and Secrets → Add** で、Type を **Secret** にして次を追加する。

| 名前 | 値 | 入れない場合 |
|---|---|---|
| `GOOGLE_KEY` | Google Maps Platform の API キー | Google 検索は提供されない |
| `YAHOO_APPID` | Yahoo! デベロッパーネットワークの Client ID | Yahoo! 検索は提供されない |
| `HOTPEPPER_KEY` | リクルート Web サービスの API キー | ホットペッパー検索は提供されない |

任意: `ALLOWED_ORIGINS`（Text）に許可する Origin をカンマ区切りで。既定は `https://takusangoukaku-hash.github.io` のみ。
ローカル確認もしたい場合は `https://takusangoukaku-hash.github.io,http://localhost:5959` のように追加する。

追加後に **Deploy** を押す（Secret の反映にも Deploy が必要）。

## 3. 各キーの安全設定（重要）
- **Google Cloud コンソール → APIとサービス → 認証情報 → 該当キー**
  - アプリケーションの制限: **なし**（Worker から呼ぶため。HTTP リファラー制限は使えない）
  - API の制限: **Places API (New) のみ** にチェック
  - **APIとサービス → Places API (New) → 割り当て** で「Text Search requests per day」に上限（例: 300）を設定。これが課金の実際の上限になる
  - 予算アラート（お支払い → 予算とアラート）を月 1,000 円などで設定
- **Yahoo!**: Worker から呼ぶため、アプリケーションの種類は **サーバーサイド** で登録した Client ID を使う。
  クライアントサイド用の ID で「許可されていないリファラー」系のエラーが出たら、サーバーサイド用を新規作成する。
- **ホットペッパー**: 制限設定はない。Worker にだけ置く。

## 4. アプリに URL を設定する
`js/api.js` の
```js
const SEARCH_PROXY = ((typeof window !== 'undefined' && window.__searchProxy) || '').replace(/\/+$/, '');
```
の `''` を Worker の URL（例: `'https://bitemap-search.xxxx.workers.dev'`）にして、バージョンを 1 つ上げて push する。
（Claude に URL を伝えれば、この作業は Claude 側で行える）

## 5. 動作確認
- ブラウザで `https://bitemap-search.xxxx.workers.dev/status` を直接開くと **403** になる（Origin が無いため。正常）。
- アプリの ⚙️ 設定を開くと「Yahoo!: 開発者提供 ／ ホットペッパー: 開発者提供 ／ Googleキー: 開発者提供」と出る。
- 登録タブで店名を検索し、候補が出ることを確認する。

## 仕組みと制限
- Worker は **Origin ヘッダが許可リストにある呼び出しだけ** 中継する。他サイトのブラウザからは使えない。
- 1 IP あたり 1 分 60 回、Google は全体で 1 分 30 回に制限（メモリ上の簡易制限。確実な上限は Google 側の割り当てで）。
- Google へは店名と位置だけを送り、FieldMask（課金区分）とページ数は Worker 側で固定する。
- 利用者が ⚙️ で自分のキーを入れた場合はそちらが優先され、開発者の枠は使われない。
- Worker の URL を知っている人がブラウザ外から Origin を偽装して呼ぶことは技術的には可能。キー自体は漏れないので、
  被害は「開発者の無料枠・割り当てを消費される」までに限られる。それを抑えるのが 3 の割り当て上限。
