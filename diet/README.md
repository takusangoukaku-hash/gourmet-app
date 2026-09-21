# PFCログ（ダイエット記録アプリ）

BITEMAP と同じリポジトリに同居する、個人用のダイエット記録 PWA。
`diet/` 以下で完結しており、BITEMAP 本体のコードには依存しない（Service Worker もスコープ `/diet/` で別）。

本番URL（main に取り込まれた後）: https://takusangoukaku-hash.github.io/gourmet-app/diet/

## できること
| タブ | 内容 |
|---|---|
| 今日 | 食事を朝/昼/夕/間食で記録。目標 kcal と P/F/C の「残り」を表示。写真から AI（Claude）で料理ごとの kcal/PFC を推定し、確認・修正して保存 |
| 体重 | 毎日の体重を記録。30日/90日/1年の折れ線グラフ（7日移動平均・目標線付き）、7日前比・開始時比・BMI |
| 運動 | 自転車（距離/時間 → 速度別 MET で消費 kcal。通学往復は1タップ）、筋トレ（種目・重量×回数のセット・総挙上量・前回記録のコピー）、週間サマリー |
| 設定 | 性別/年齢/身長/活動レベル/減量ペースから BMR・TDEE・目標 kcal・PFC を自動計算（手動上書き可）。通学の往復距離・時間。Claude API キー。JSON 書き出し/読み込み |

## 計算の前提（推定値であることに注意）
- 基礎代謝: Mifflin-St Jeor 式。目標 kcal = TDEE − 減量ペース(kg/週) × 7200 / 7。下限 1200 kcal。
- PFC: タンパク質 = 体重 × 2.0 g（設定可）、脂質 = 目標 kcal の 25%（設定可）、炭水化物 = 残り。
- 自転車: 速度から MET（<16km/h: 4.0 / 〜19: 6.8 / 〜22: 8.0 / 〜25: 10 / それ以上: 12）。距離か時間の片方しか無い場合は 17 km/h を仮定。
- 筋トレ: MET 5.0 × 体重 × 時間。時間未入力なら 0 kcal（総挙上量だけ記録）。
- 運動の消費 kcal は既定では食事予算に **加算しない**（設定で変更可）。推定消費は過大になりがちなため。
- 写真 AI 推定は量の見積もりに依存し ±30% 程度ぶれる。必ず保存前に確認する前提の UI。

## データ
- localStorage キー `diet.v1`（食事・体重・運動・プロフィール）。写真サムネイルは IndexedDB `diet-photos`。
- Claude API キーは `diet.anthropicKey`。未設定なら BITEMAP の `gourmet.anthropicKey` を流用する（同一オリジンのため）。
- 設定タブから JSON で書き出し/読み込みできる（機種変更時はこれで移す）。

## バージョン更新（変更のたびに）
BITEMAP 本体とは別に管理する。4箇所を揃える:
1. `diet/js/app.js` の `APP_VERSION`
2. `diet/sw.js` の `VERSION`（コメントに変更概要）
3. `diet/sw.js` の `SHELL` 内の `?v=N`
4. `diet/index.html` の `?v=N`（CSS 1 + スクリプト 4 = 5箇所）

## ローカル確認
```
python3 -m http.server 5959   # リポジトリ直下で
# → http://localhost:5959/diet/
```
