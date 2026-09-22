const pptxgen = require('pptxgenjs');
const SHOT = '/tmp/claude-0/-home-user-gourmet-app/8edbdaa3-b81a-5c49-b452-bda755b7f07f/scratchpad/final/shots/';
const REALSHOT = '/tmp/claude-0/-home-user-gourmet-app/8edbdaa3-b81a-5c49-b452-bda755b7f07f/scratchpad/real/shots/';
const REPO = '/home/user/gourmet-app/';
const SP_FINAL = '/tmp/claude-0/-home-user-gourmet-app/8edbdaa3-b81a-5c49-b452-bda755b7f07f/scratchpad/final/';
const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
pres.lang = 'ja-JP';
const F = 'Yu Gothic', FS = 'Cambria';
const C = { terra: 'C6613F', dark: 'B4552F', ink: '1F1E1D', muted: '6E6960', cream: 'F5F3EC', line: 'EAE3D8', gold: 'E8A33D', purple: '8B5CF6', green: '2E8B57', white: 'FFFFFF', soft: 'FBEFE9', gray: '8A857D' };
const sh = () => ({ type: 'outer', color: '000000', blur: 6, offset: 2, angle: 90, opacity: 0.12 });

// ---------- 共通部品 ----------
function header(s, title, kicker) {
  if (kicker) s.addText(kicker, { x: 0.6, y: 0.35, w: 8, h: 0.35, fontFace: F, fontSize: 13, bold: true, color: C.terra, isTextBox: true, margin: 0, charSpacing: 2 });
  s.addText(title, { x: 0.6, y: kicker ? 0.68 : 0.45, w: 12.1, h: 0.75, fontFace: F, fontSize: 30, bold: true, color: C.ink, isTextBox: true, margin: 0 });
}
function foot(s, n) {
  s.addText('BITEMAP ｜ 2026 AI Innovators Cup @ Shibaura 決勝', { x: 0.6, y: 7.05, w: 8, h: 0.3, fontFace: F, fontSize: 9, color: C.gray, isTextBox: true, margin: 0 });
  s.addText(String(n), { x: 12.2, y: 7.05, w: 0.5, h: 0.3, fontFace: F, fontSize: 9, color: C.gray, isTextBox: true, margin: 0, align: 'right' });
}
function card(s, x, y, w, h, opt = {}) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: opt.fill || C.white }, line: { color: opt.line || C.line, width: opt.lw || 1 }, rectRadius: opt.r || 0.12, shadow: opt.noShadow ? undefined : sh() });
}
function shot(s, name, x, y, h, real) {
  const w = h * 390 / 844;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, fill: { color: C.ink }, line: { color: C.ink, width: 0 }, rectRadius: 0.22, shadow: sh() });
  s.addImage({ path: (real ? REALSHOT : SHOT) + name, x, y, w, h });
  return w;
}
function numCircle(s, x, y, n, d = 0.42, fill = C.terra) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 } });
  s.addText(String(n), { x, y, w: d, h: d, fontFace: F, fontSize: 13, bold: true, color: C.white, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
}
function arrow(s, x, y, w = 0.5) {
  s.addShape(pres.shapes.RIGHT_ARROW, { x, y, w, h: 0.34, fill: { color: 'D9CFC2' }, line: { color: 'D9CFC2', width: 0 } });
}
function bullets(s, items, x, y, w, h, size = 14, color = C.ink) {
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 5 } })),
    { x, y, w, h, fontFace: F, fontSize: size, color, isTextBox: true, margin: 0, valign: 'top' });
}
function rich(s, runs, x, y, w, h, size = 14, opt = {}) {
  s.addText(runs.map(r => (typeof r === 'string' ? { text: r } : r)), { x, y, w, h, fontFace: F, fontSize: size, color: C.ink, isTextBox: true, margin: 0, valign: opt.valign || 'top', align: opt.align || 'left' });
}

// ================= 1. タイトル =================
{
  const s = pres.addSlide();
  s.background = { path: SHOT + 'grad.png' };
  s.addText('2026 AI INNOVATORS CUP @ SHIBAURA ｜ 決勝 ｜ オープンテーマ部門', { x: 0.7, y: 0.6, w: 8, h: 0.4, fontFace: F, fontSize: 12, bold: true, color: 'FFE1D2', isTextBox: true, margin: 0, charSpacing: 2 });
  s.addText('BITEMAP', { x: 0.7, y: 1.6, w: 8, h: 1.5, fontFace: FS, fontSize: 88, bold: true, color: C.white, isTextBox: true, margin: 0, charSpacing: 4 });
  rich(s, [{ text: 'その', options: { color: C.white } }, { text: '★3.5', options: { color: 'FFD75E', bold: true } }, { text: 'は、みんなの平均。', options: { color: C.white } }], 0.7, 3.25, 8, 0.7, 32);
  s.addText('BITEMAPは「あなたの味覚」で店を選ぶ。', { x: 0.7, y: 3.95, w: 8, h: 0.6, fontFace: F, fontSize: 24, bold: true, color: C.white, isTextBox: true, margin: 0 });
  s.addText('自分だけの食の記録（アルバム・地図・統計） × 味覚一致率でパーソナライズされる評価\nAIと二人三脚で開発した PWA アプリ（本番公開・実運用中）', { x: 0.7, y: 4.75, w: 8, h: 0.9, fontFace: F, fontSize: 14, color: 'FFE9DF', isTextBox: true, margin: 0 });
  s.addText('実機画面はすべて本人アカウントの実データ（208店舗）', { x: 0.7, y: 5.75, w: 8, h: 0.35, fontFace: F, fontSize: 11, color: 'FFE1D2', isTextBox: true, margin: 0 });
  s.addText('［チーム名 ／ 氏名 ／ 学部学科］', { x: 0.7, y: 6.3, w: 8, h: 0.5, fontFace: F, fontSize: 16, bold: true, color: C.white, isTextBox: true, margin: 0 });
  shot(s, 'home.png', 9.75, 0.55, 6.4, true);
  s.addNotes('【0:20】挨拶＋一言。「レビューサイトの★3.5は、みんなの平均。BITEMAPは、あなたの味覚で店を選ぶアプリです」。右の画面は本番アプリのホーム。');
}
// ================= 2. 課題 =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'おいしいは、人の数だけある。', '課題');
  card(s, 0.6, 1.75, 5.6, 2.2);
  numCircle(s, 0.85, 2.0, 1);
  s.addText('★の平均点は、あなたの舌ではない', { x: 1.4, y: 1.98, w: 4.6, h: 0.45, fontFace: F, fontSize: 17, bold: true, color: C.ink, isTextBox: true, margin: 0 });
  bullets(s, ['同じ一杯でも ★5 の人と ★2 の人がいる', 'レビューサイトは「他人の平均」しか教えてくれない', '人気店に行っても、自分には刺さらないことがある'], 0.85, 2.5, 5.1, 1.4, 13.5, C.muted);
  card(s, 0.6, 4.2, 5.6, 2.2);
  numCircle(s, 0.85, 4.45, 2);
  s.addText('自分の記録は、続かない', { x: 1.4, y: 4.43, w: 4.6, h: 0.45, fontFace: F, fontSize: 17, bold: true, color: C.ink, isTextBox: true, margin: 0 });
  bullets(s, ['食べた記録は写真フォルダに埋もれる', '記録アプリは店名・住所・ジャンル…入力が面倒で三日坊主', '「自分の味覚」はデータとして残らない'], 0.85, 4.95, 5.1, 1.4, 13.5, C.muted);
  s.addImage({ path: SHOT + 'insight.png', x: 6.5, y: 1.75, w: 6.25, h: 3.52, rounding: false, shadow: sh() });
  s.addText('同じ一杯を3人が食べたら ★5.0／★2.0／★4.0 ― サイトの表示は「★3.7」', { x: 6.5, y: 5.4, w: 6.25, h: 0.4, fontFace: F, fontSize: 11.5, color: C.gray, isTextBox: true, margin: 0, align: 'center' });
  rich(s, [{ text: 'BITEMAPの答え：', options: { bold: true, color: C.terra } }, '①記録の手間はAIが消す　②たまった記録から「自分の味覚」をデータ化する　③自分の食日記としても、SNSとしても使える'], 6.5, 5.95, 6.25, 0.9, 14);
  foot(s, 2);
  s.addNotes('【0:50】課題は2つ。①平均点は誰の舌でもない。同じ一杯でも★5と★2の人がいて、表示されるのは★3.7。②自分の記録は続かない。入力が面倒。この2つに、記録の手間をAIで消し、たまった記録から味覚をデータ化する、という答えを出しました。');
}
// ================= 3. BITEMAPとは =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, '撮るだけで、グルメ地図が育つ', 'BITEMAP とは');
  const cols = [
    { n: 1, t: '撮って選ぶだけ', d: '写真のEXIF位置から周辺の店を自動提示。料理ジャンルはAIが写真から判定。手で入れるのは店名と★だけ（0.5刻み）。', img: 'register.png' },
    { n: 2, t: '自分の記録が育つ', d: '訪問店は評価色のピンに。写真は店ごとに自動整理され、「いつ・何を・何点」がすぐ見返せる。SNSであると同時に、自分だけの食日記・地図・統計として毎日使える。', img: 'map.png', real: true },
    { n: 3, t: '味覚でつながる', d: 'フォロー・いいね・コメント。味覚の近い人の投稿ほど上に出て、店の評価は「あなた向け」に並び替わる。', img: 'home.png', real: true },
  ];
  cols.forEach((c, i) => {
    const x = 0.6 + i * 4.12;
    card(s, x, 1.65, 3.9, 5.25);
    numCircle(s, x + 0.25, 1.9, c.n);
    s.addText(c.t, { x: x + 0.78, y: 1.88, w: 3.0, h: 0.45, fontFace: F, fontSize: 17, bold: true, color: C.ink, isTextBox: true, margin: 0 });
    s.addText(c.d, { x: x + 0.25, y: 2.4, w: 3.4, h: 1.05, fontFace: F, fontSize: 11.5, color: C.muted, isTextBox: true, margin: 0 });
    shot(s, c.img, x + 1.3, 3.55, 3.15, !!c.real);
  });
  foot(s, 3);
  s.addNotes('【0:50】使い方は3ステップ。①撮って選ぶだけ。場所は写真の位置情報から、ジャンルはAIが判定。人が入れるのは店名と★だけ。②地図とアルバムに自動で整理。③味覚でつながる。ここが核心なので次で説明します。');
}
// ================= 4. 味覚一致率 =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, '味覚一致率 ― 評価を、あなた仕様に重み付けする', '核心アイデア');
  // 左: 突き合わせ表
  card(s, 0.6, 1.65, 4.3, 2.75);
  s.addText('共通で行った店の★を突き合わせる', { x: 0.85, y: 1.8, w: 3.9, h: 0.35, fontFace: F, fontSize: 12.5, bold: true, color: C.ink, isTextBox: true, margin: 0 });
  const rows = [['店', '自分', 'ゆかりさん'], ['麺屋 こがね', '4.5', '4.5'], ['寿司処 まる海', '5.0', '4.5'], ['カフェ ひだまり', '3.0', '3.5'], ['天ぷら 松波', '5.0', '5.0']];
  s.addTable(rows.map((r, ri) => r.map((c, ci) => ({ text: c, options: { bold: ri === 0, color: ri === 0 ? C.terra : C.ink, fill: { color: ri === 0 ? C.soft : C.white }, align: ci === 0 ? 'left' : 'center', fontFace: F, fontSize: 11 } }))),
    { x: 0.85, y: 2.2, w: 3.8, colW: [1.8, 0.9, 1.1], rowH: 0.34, border: { type: 'solid', color: C.line, pt: 0.75 } });
  s.addText('ピアソン相関（上下の付け方）0.7 ＋ 評価差の近さ 0.3', { x: 0.85, y: 4.0, w: 3.9, h: 0.3, fontFace: F, fontSize: 10, color: C.gray, isTextBox: true, margin: 0 });
  arrow(s, 5.05, 2.85);
  // 中: 79%
  s.addShape(pres.shapes.OVAL, { x: 5.75, y: 1.95, w: 2.2, h: 2.2, fill: { color: C.soft }, line: { color: C.terra, width: 2 } });
  s.addText('79%', { x: 5.75, y: 2.3, w: 2.2, h: 0.9, fontFace: F, fontSize: 40, bold: true, color: C.dark, align: 'center', isTextBox: true, margin: 0 });
  s.addText('味覚一致率', { x: 5.75, y: 3.15, w: 2.2, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: C.terra, align: 'center', isTextBox: true, margin: 0 });
  arrow(s, 8.1, 2.85);
  // 右: 2カード
  card(s, 8.8, 1.75, 1.9, 1.5, { fill: C.soft, line: 'EFD3C6' });
  s.addText('あなた向け評価', { x: 8.8, y: 1.85, w: 1.9, h: 0.3, fontFace: F, fontSize: 10.5, bold: true, color: C.terra, align: 'center', isTextBox: true, margin: 0 });
  s.addText('★4.5', { x: 8.8, y: 2.15, w: 1.9, h: 0.7, fontFace: F, fontSize: 30, bold: true, color: C.dark, align: 'center', isTextBox: true, margin: 0 });
  s.addText('一致率で重み付けした平均', { x: 8.8, y: 2.85, w: 1.9, h: 0.3, fontFace: F, fontSize: 8.5, color: C.terra, align: 'center', isTextBox: true, margin: 0 });
  card(s, 10.85, 1.75, 1.9, 1.5);
  s.addText('全体評価', { x: 10.85, y: 1.85, w: 1.9, h: 0.3, fontFace: F, fontSize: 10.5, bold: true, color: C.gray, align: 'center', isTextBox: true, margin: 0 });
  s.addText('★3.6', { x: 10.85, y: 2.15, w: 1.9, h: 0.7, fontFace: F, fontSize: 30, bold: true, color: C.muted, align: 'center', isTextBox: true, margin: 0 });
  s.addText('従来の単純平均', { x: 10.85, y: 2.85, w: 1.9, h: 0.3, fontFace: F, fontSize: 8.5, color: C.gray, align: 'center', isTextBox: true, margin: 0 });
  s.addText('同じ店でも、見る人によって評価が変わる', { x: 8.8, y: 3.4, w: 3.95, h: 0.4, fontFace: F, fontSize: 11.5, bold: true, color: C.ink, align: 'center', isTextBox: true, margin: 0 });
  // 下: 3つの工夫
  const boxes = [
    ['信頼度ルール（人が定義）', '共通店が5件未満なら一致率を出さない。5〜19件は薄く表示、20件以上で通常表示。偶然の一致による誤検出を防ぐ。'],
    ['効果の検証', '評価傾向を変えたテストデータで検証。傾向が近い人は 79%、真逆の人は 27% と直感に合う値に。一致率の高い人の高評価の未訪問店が「おすすめ」上位へ。'],
    ['アプリ全体で使う', '地図のピン色・ホームの並び順・店舗詳細の評価に同じ値を使用。自分の評価は一致率100%として最重視。'],
  ];
  boxes.forEach((b, i) => {
    const x = 0.6 + i * 4.12;
    card(s, x, 4.65, 3.9, 2.2, { fill: 'FBF8F3', line: C.line, noShadow: true });
    s.addText(b[0], { x: x + 0.22, y: 4.78, w: 3.5, h: 0.35, fontFace: F, fontSize: 13, bold: true, color: C.terra, isTextBox: true, margin: 0 });
    s.addText(b[1], { x: x + 0.22, y: 5.15, w: 3.5, h: 1.6, fontFace: F, fontSize: 11.5, color: C.ink, isTextBox: true, margin: 0, valign: 'top' });
  });
  foot(s, 4);
  s.addNotes('［審査観点 ④オリジナリティ ⑤成果物 に対応］【1:00】核心の味覚一致率。共通で行った店の★を突き合わせ、相関と評価差から0〜100%を出します。この79%で他の人の評価を重み付けすると、同じ店が全体では★3.6、あなた向けには★4.5になる。3つの工夫：偶然の一致を防ぐ信頼度ルールは人が定義。検証では近い人79%・真逆27%。地図・ホーム・店舗詳細すべてでこの値を使っています。');
}
// ================= 5. 実機デモ（動画をスライド全面に） =================
{
  const s = pres.addSlide(); s.background = { color: '000000' };
  const fs = require('fs');
  const REAL = process.env.DEMO_EMBED || '/home/user/gourmet-app/tools/final/real_demo.mp4';
  if (fs.existsSync(REAL) && !process.env.NOVIDEO) {
    // 16:9 の動画をスライド全面（13.33×7.5）に。見出し・注記は発表ノートへ
    s.addMedia({ type: 'video', path: REAL, x: 0, y: 0, w: 13.333, h: 7.5 });
  } else {
    s.addImage({ path: SP_FINAL + 'demo_poster.jpg', x: 0, y: 0, w: 13.333, h: 7.5 });
    s.addText('▶ 実機デモ動画（74秒・本人アカウントの実データ・★3以上のみ）― PDF版では静止画。動画は .pptx で再生', { x: 0, y: 7.1, w: 13.333, h: 0.4, fontFace: F, fontSize: 11, bold: true, color: C.white, isTextBox: true, margin: 0, align: 'center', fill: { color: '2B2825' } });
  }
  s.addNotes('【1:15】実機デモ（74秒・スライド全面・クリックで再生開始・BGM小音量入り）。「ここからは実機、実データの動画です。表示は★3以上の記録のみ」と言ってからクリック。①ホーム：味覚一致83%のバッジと「あなた向け／全体」評価 ②アルバム：食日記としての写真グリッド→お店の記録 ③地図：訪問順にピンが1本ずつ増える→渋谷へズーム→ピンをタップして店舗シート ④検索：ジャンル別の写真一覧 ⑤ふりかえり：統計。再生できない場合は本番URL https://takusangoukaku-hash.github.io/gourmet-app/ をブラウザで開いて実演。');
}
// ================= 6. AIの使い方（①②③を1枚に） =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'AIの使い方 ― つくるも、つかうもAI。決めるのは人', 'AIの使い方');
  // 上段：開発ループ（横4段）＋ 回転数
  card(s, 0.6, 1.6, 12.13, 1.75, { fill: 'FBF8F3', noShadow: true });
  s.addText('開発ループ', { x: 0.85, y: 1.72, w: 2.5, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: C.terra, isTextBox: true, margin: 0 });
  const steps = [['人', '要望を言葉・画像で伝える', C.soft, C.terra], ['AI', '実装＋自動テスト', 'EEF3FB', '2F5D8A'], ['AI', 'コミット＆本番デプロイ', 'EEF3FB', '2F5D8A'], ['人', '実機で検証→採否を決める', C.soft, C.terra]];
  steps.forEach((st, i) => {
    const x = 0.85 + i * 2.25;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.1, w: 2.0, h: 1.0, fill: { color: st[2] }, line: { color: st[2], width: 0 }, rectRadius: 0.1 });
    s.addText(st[0], { x, y: 2.16, w: 2.0, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: st[3], align: 'center', isTextBox: true, margin: 0 });
    s.addText(st[1], { x: x + 0.08, y: 2.46, w: 1.84, h: 0.6, fontFace: F, fontSize: 11, color: C.ink, align: 'center', isTextBox: true, margin: 0, valign: 'top' });
    if (i < 3) arrow(s, x + 2.02, 2.45, 0.2);
  });
  s.addText('295', { x: 9.85, y: 1.7, w: 1.75, h: 1.0, fontFace: F, fontSize: 54, bold: true, color: C.terra, align: 'right', isTextBox: true, margin: 0, valign: 'middle' });
  s.addText('回転', { x: 11.62, y: 1.95, w: 0.9, h: 0.6, fontFace: F, fontSize: 20, bold: true, color: C.terra, isTextBox: true, margin: 0, valign: 'middle' });
  s.addText('コードは全量AI実装（Claude Code）\n人は要望・検証・採否だけ', { x: 9.85, y: 2.7, w: 2.7, h: 0.6, fontFace: F, fontSize: 10, color: C.muted, align: 'right', isTextBox: true, margin: 0 });
  // 下段：①②③ 各3点
  const colX = [0.6, 4.72, 8.84], W = 3.9;
  const cols = [
    ['①', '目的と方法', ['実装はAIに全量任せ、人は「判断の回数」を最大化する', 'アプリ内：料理写真を Claude API で 70+ ジャンルに自動判定', '迷ったら空欄にして人が選ぶ。キー未設定でも地図タグ推定で動く']],
    ['②', 'プロンプト設計', ['守るルールは CLAUDE.md に明文化し、全会話で共有（版番号4箇所・共通部品・日付非表示）', '要望は「現象」で伝える：「タップすると少し前の投稿が出る」。原因特定はAIに任せる', 'アプリ内の分類器は enum 一覧・confident フラグ・JSON Schema で縛り、幻覚を出さない']],
    ['③', '人の判断・修正', ['写真一覧の2列化：実機で「一覧性が落ちた」→ 3版分を差し戻し', '味覚一致率：偶然の一致を防ぐ「共通5件未満は非表示」を人が定義', 'AIの「直りました」を実機で差し戻し、計測で本当の原因を特定させた（次ページ）']],
  ];
  cols.forEach((c, i) => {
    card(s, colX[i], 3.55, W, 2.95);
    numCircle(s, colX[i] + 0.22, 3.75, c[0], 0.4);
    s.addText(c[1], { x: colX[i] + 0.72, y: 3.73, w: 3.0, h: 0.44, fontFace: F, fontSize: 16, bold: true, color: C.ink, isTextBox: true, margin: 0, valign: 'middle' });
    bullets(s, c[2], colX[i] + 0.22, 4.3, 3.5, 2.1, 12);
  });
  s.addText('原則：AIの出力は「提案」。採否は必ず実機で触って決める', { x: 0.6, y: 6.62, w: 12.1, h: 0.32, fontFace: F, fontSize: 11, bold: true, color: C.terra, isTextBox: true, margin: 0, align: 'right' });
  foot(s, 6);
  s.addNotes('［審査観点 ①AI活用の目的と方法 ②プロンプト設計 ③人の判断・修正 に対応］【0:50】AIの使い方を1枚で。上が開発ループ。要望を伝える→AIが実装と自動テスト→デプロイ→人が実機で検証して採否。これを295回。①目的は、実装をAIに任せて人の判断の回数を最大化すること。アプリ内でも写真のジャンル判定にAIを使い、迷ったら人が選ぶ。②プロンプトは、ルールは文書に、要望は現象で、判定は制約で。③人の判断の代表例が3つ。特に3つ目、AIが直ったと言っても人が触るまで直っていない、これを次で。詳細は補足スライドに。');
}
function appendixAI1() {
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'AIの活用 ― 「つくる」も「つかう」もAI、決めるのは人', '補足 ｜ AI活用の目的と方法（詳細）');
  // 左: 開発ループ
  card(s, 0.6, 1.65, 7.6, 5.2);
  s.addText('開発：コードは全量AI実装 × 人間は判断に専念（Claude Code）', { x: 0.85, y: 1.8, w: 7.2, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.ink, isTextBox: true, margin: 0 });
  const steps = [['人間', '要望を日本語で\n（文章・画像）', C.soft, C.terra], ['AI', '実装＋自動テスト\n（Playwright）', 'EEF3FB', '2F5D8A'], ['AI', 'コミット＆\n本番デプロイ', 'EEF3FB', '2F5D8A'], ['人間', '実機で検証\n採用／差し戻し', C.soft, C.terra]];
  steps.forEach((st, i) => {
    const x = 0.85 + i * 1.82;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.4, w: 1.55, h: 1.25, fill: { color: st[2] }, line: { color: st[2], width: 0 }, rectRadius: 0.1 });
    s.addText(st[0], { x, y: 2.47, w: 1.55, h: 0.3, fontFace: F, fontSize: 10.5, bold: true, color: st[3], align: 'center', isTextBox: true, margin: 0 });
    s.addText(st[1], { x: x + 0.05, y: 2.78, w: 1.45, h: 0.8, fontFace: F, fontSize: 10.5, color: C.ink, align: 'center', isTextBox: true, margin: 0, valign: 'top' });
    if (i < 3) arrow(s, x + 1.57, 2.85, 0.24);
  });
  rich(s, [{ text: 'このループを毎日回した', options: { bold: true, color: C.terra } }, { text: '。仕様書・デザイン案は画像のまま渡し、守るべき決め事は ', options: {} }, { text: 'CLAUDE.md', options: { bold: true } }, { text: ' に明文化して全会話で共有。', options: {} }], 0.85, 3.85, 7.1, 0.75, 12);
  bullets(s, ['目的：実装速度ではなく「判断の回数」を最大化する。1日で十数回、実機で試して直す', '人の役割：要望・検証・採否の決定。AIの役割：実装・テスト・デプロイ・原因調査', '自動テスト（Playwright）で回帰を防ぎ、本番デプロイまでAIが完結'], 0.85, 4.7, 7.1, 2.0, 12);
  // 右: アプリ内AI
  card(s, 8.45, 1.65, 4.28, 5.2);
  s.addText('アプリ内：料理写真をAIが分類（Claude API・画像入力）', { x: 8.7, y: 1.8, w: 3.9, h: 0.65, fontFace: F, fontSize: 14, bold: true, color: C.ink, isTextBox: true, margin: 0 });
  const chips = [['📷', '写真を768pxに縮小して送信'], ['🍜', '料理ジャンル（70+）と店舗ジャンルを判定'], ['❓', '自信がなければ空欄→人が選ぶ'], ['🗺', 'キー未設定でもOSMタグ推定へ自動フォールバック']];
  chips.forEach((c, i) => {
    const y = 2.6 + i * 0.78;
    s.addShape(pres.shapes.OVAL, { x: 8.7, y, w: 0.5, h: 0.5, fill: { color: C.soft }, line: { color: C.soft, width: 0 } });
    s.addText(c[0], { x: 8.7, y, w: 0.5, h: 0.5, fontSize: 15, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
    s.addText(c[1], { x: 9.32, y: y - 0.02, w: 3.3, h: 0.56, fontFace: F, fontSize: 11.5, color: C.ink, isTextBox: true, margin: 0, valign: 'middle' });
  });
  rich(s, [{ text: '目的：', options: { bold: true, color: C.terra } }, '記録の手間を「店名と★だけ」に減らす。AIは提案役、決定は利用者。判定は利用者自身のAPIキーで実行。'], 8.7, 5.75, 3.85, 1.0, 11.5);
  foot(s, 13);
  s.addNotes('［審査観点 ①AI活用の目的と方法（詳細）］【0:45】AIは2か所。開発ではClaude Codeにコードを全量書かせ、人は要望・検証・採否に専念。アプリ内では写真のジャンル判定にClaude APIを使い、自信がなければ空欄にして人が選ぶ。AIは提案役、決定は人、が一貫した方針です。');
}

function appendixAI2() {
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'プロンプト設計 ― ルールは文書に、要望は現象で', '補足 ｜ プロンプト設計（詳細）');
  // 左
  card(s, 0.6, 1.65, 6.2, 5.2);
  s.addText('開発への指示（Claude Code）', { x: 0.85, y: 1.8, w: 5.8, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.ink, isTextBox: true, margin: 0 });
  s.addText('CLAUDE.md ― 毎回守るルールを明文化（抜粋）', { x: 0.85, y: 2.25, w: 5.8, h: 0.3, fontFace: F, fontSize: 11.5, bold: true, color: C.terra, isTextBox: true, margin: 0 });
  bullets(s, ['変更のたびに4箇所のバージョンを揃える（PWAキャッシュ対策）', '星評価は共通SVG部品を使う／他人の投稿に日付を出さない', 'main へ直接 push → GitHub Pages で1〜2分後に本番反映'], 0.85, 2.57, 5.8, 1.15, 11, C.ink);
  s.addText('実際の要望プロンプト（そのまま）', { x: 0.85, y: 3.75, w: 5.8, h: 0.3, fontFace: F, fontSize: 11.5, bold: true, color: C.terra, isTextBox: true, margin: 0 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.85, y: 4.08, w: 5.7, h: 1.4, fill: { color: '2B2825' }, line: { color: '2B2825', width: 0 }, rectRadius: 0.08 });
  s.addText('「検索で麺類→ラーメンとタップして写真一覧にいったときに、勝手にジャンル一覧に戻ってしまうことがあるので修正して」\n「評価をする時に .0 だけでなく .5 でも評価できるようにして」\n「スクロールがなめらかではないのでなめらかになるようにして」', { x: 1.0, y: 4.15, w: 5.45, h: 1.28, fontFace: F, fontSize: 10.5, color: 'F4EFE8', isTextBox: true, margin: 0, valign: 'middle' });
  bullets(s, ['要望は「現象ベース」で伝え、原因の特定はAIに任せる（人はコードを読まない）', 'デザインは文章より画像（手描き・スクショ）で渡す', '差し戻しは短く：「277の状態に戻して」で3バージョン分を巻き戻し'], 0.85, 5.6, 5.8, 1.2, 11, C.ink);
  // 右
  card(s, 7.05, 1.65, 5.68, 5.2);
  s.addText('アプリ内の分類プロンプト（実物）', { x: 7.3, y: 1.8, w: 5.2, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.ink, isTextBox: true, margin: 0 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.3, y: 2.25, w: 5.18, h: 1.75, fill: { color: '2B2825' }, line: { color: '2B2825', width: 0 }, rectRadius: 0.08 });
  s.addText([{ text: 'system: ', options: { color: 'FFD75E', bold: true } }, { text: 'あなたは料理写真の分類器です。写真に写っている料理を指定されたジャンル一覧から選んで分類してください。料理が写っていない写真（外観・店内・メニュー表など）や判別が難しい場合は dishGenres を空配列、confident を false にしてください。', options: { color: 'F4EFE8' } }, { text: '\noutput: ', options: { color: 'FFD75E', bold: true } }, { text: 'JSON Schema（dishGenres: enum[70+], shopGenre: enum, confident: boolean）', options: { color: 'F4EFE8' } }],
    { x: 7.45, y: 2.32, w: 4.9, h: 1.62, fontFace: F, fontSize: 10, isTextBox: true, margin: 0, valign: 'top' });
  const tips = [['enum 制約', 'ジャンル名を一覧に固定し、表記ゆれ・幻覚を出させない'], ['confident フラグ', '自信のない判定は空欄に。利用者の選択に委ねる'], ['スキーマ出力', 'JSON Schema で構造化出力。文章の解析なしで即UIに反映'], ['縮小して送信', '768px・品質0.7に圧縮。精度を保ちつつコストと時間を1/10に']];
  tips.forEach((t, i) => {
    const y = 4.2 + i * 0.66;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.3, y, w: 1.55, h: 0.5, fill: { color: C.soft }, line: { color: C.soft, width: 0 }, rectRadius: 0.25 });
    s.addText(t[0], { x: 7.3, y, w: 1.55, h: 0.5, fontFace: F, fontSize: 10.5, bold: true, color: C.terra, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
    s.addText(t[1], { x: 8.95, y, w: 3.55, h: 0.5, fontFace: F, fontSize: 10.5, color: C.ink, isTextBox: true, margin: 0, valign: 'middle' });
  });
  foot(s, 14);
  s.addNotes('［審査観点 ②プロンプト設計（詳細）］【0:50】プロンプト設計は3層。①CLAUDE.mdに毎回守るルールを明文化し、会話をまたいで共有。②要望は現象ベースで伝え、原因特定はAIに任せる。実物のプロンプトはこの3つ。③アプリ内の分類器はenum制約とconfidentフラグ、JSONスキーマ出力で、幻覚を出さず、迷ったら人に委ねる設計。');
}

function appendixAI3() {
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'AI出力に対する人の判断・修正（代表例）', '補足 ｜ 人の判断・修正（詳細）');
  const rows = [
    ['場面', 'Before：AIの出力・提案', 'After：人の判断'],
    ['写真一覧のUI', '「店舗カード＋2列」に改善提案し、v278〜280で実装', '実機で試して「一覧性が落ちた」と判断。3バージョン差し戻し、v277の状態に復元'],
    ['ジャンルアイコン', 'AIがSVGで71種を自作', '絵柄が不統一で不採用。手持ちイラストからの切り出しに指示し直し、71種を統一'],
    ['味覚一致率', '共通2〜3店でも計算して表示', '偶然の一致を防ぐ「5件未満は非表示・20件以上で通常」の信頼度ルールを人が定義'],
    ['AIのジャンル判定', 'まれに誤判定。再判定で手動選択を上書き', '手動選択後はAIが上書きしない「所有権」ルール。AIは提案役、決定は人'],
    ['投稿詳細のスクロール', '1回目の修正（差分加算）で「直った」と報告', '実機で「まだ滑らかでない」と差し戻し → 計測で原因（scrollTopの切り詰め）を特定させ方式変更（v290-291）'],
  ];
  s.addTable(rows.map((r, ri) => r.map((c, ci) => ({ text: c, options: { bold: ri === 0 || ci === 0, color: ri === 0 ? C.white : (ci === 2 ? C.dark : C.ink), fill: { color: ri === 0 ? C.terra : (ci === 2 ? C.soft : C.white) }, fontFace: F, fontSize: ri === 0 ? 12 : 11, valign: 'middle' } }))),
    { x: 0.6, y: 1.65, w: 12.13, colW: [2.1, 4.4, 5.63], rowH: [0.42, 0.78, 0.78, 0.78, 0.78, 0.9], border: { type: 'solid', color: C.line, pt: 0.75 } });
  rich(s, [{ text: '共通する原則：', options: { bold: true, color: C.terra } }, 'AIの出力は「提案」。採否は必ず実機で触って決める。品質の基準（一覧性・絵柄の統一・信頼度）は人が言葉にして渡す。'], 0.6, 6.4, 12.1, 0.5, 12.5);
  foot(s, 15);
  s.addNotes('［審査観点 ③人の判断・修正（詳細）］【0:50】AIの提案をそのまま採用しなかった代表例。写真一覧の2列化は一覧性が落ちて3バージョン差し戻し。SVGアイコンは絵柄が不統一で不採用。一致率の信頼度ルールは人が定義。ジャンル判定は所有権ルール。最後は決勝までに起きた例で、1回目の修正を「まだ滑らかでない」と差し戻し、計測で原因を特定させました。共通原則は、AIの出力は提案、採否は実機で決める。');
}

// ================= 7. 予選からの改良 =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'AIは「直った」と言った。人が触ると、直っていなかった。', '予選後の改良 ｜ 実利用で見つけた課題を、同じループで');
  // 上段：エピソード（v290→v291）
  card(s, 0.6, 1.6, 12.13, 1.85, { fill: '2B2825', line: '2B2825', noShadow: true });
  s.addText('投稿詳細のスクロールが、途中で止まる', { x: 0.85, y: 1.7, w: 6, h: 0.35, fontFace: F, fontSize: 12, bold: true, color: 'FFD75E', isTextBox: true, margin: 0 });
  const ep = [['AI', '1回目の修正\n「直りました」', '2F5D8A', 'EEF3FB'], ['人', '実機で確認\n「まだ滑らかでない」→差し戻し', C.terra, C.soft], ['AI', '計測させて原因を特定\n（位置補正の切り詰め）', '2F5D8A', 'EEF3FB'], ['人', '方式変更を実機で検証\n→ 採用', C.terra, C.soft]];
  ep.forEach((e, i) => {
    const x = 0.85 + i * 3.0;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.15, w: 2.7, h: 1.15, fill: { color: e[3] }, line: { color: e[3], width: 0 }, rectRadius: 0.1 });
    s.addText(e[0], { x: x + 0.1, y: 2.2, w: 0.45, h: 0.3, fontFace: F, fontSize: 10.5, bold: true, color: e[2], isTextBox: true, margin: 0 });
    s.addText(e[1], { x: x + 0.12, y: 2.5, w: 2.5, h: 0.78, fontFace: F, fontSize: 11, color: C.ink, isTextBox: true, margin: 0, valign: 'top' });
    if (i < 3) s.addText('▶', { x: x + 2.72, y: 2.55, w: 0.28, h: 0.35, fontSize: 12, color: 'FFD75E', align: 'center', isTextBox: true, margin: 0 });
  });
  s.addText('AIの報告を鵜呑みにせず、実機で触って判断する', { x: 6.9, y: 1.7, w: 5.6, h: 0.35, fontFace: F, fontSize: 10.5, color: 'F4EFE8', isTextBox: true, margin: 0, align: 'right' });
  // 下段：Before / After
  const rows = [
    ['検索の写真一覧をタップすると「少し前の投稿」が開く', '基準の投稿を画面上端に固定し、写真の高さが後から伸びてもズレない'],
    ['投稿詳細のスクロールが途中で止まる', '写真の高さが確定してから継ぎ足し、操作中は補正しない'],
    ['★0.5刻みの入力が、小さな星ではスマホで狙えない', '星を36pxに拡大。なぞって選択、同じ星の再タップで .5、数値表示'],
    ['他人の投稿の日付が、一部の画面に残っていた', '全画面で非表示に統一（プライバシー配慮）'],
    ['写真はクラウドにしかなく、端末バックアップに含まれない', '写真込みで書き出し・別端末で復元（本日のデモ用の実データ再現にも使用）'],
  ];
  const y0 = 3.62, rh = 0.58;
  s.addText('Before ― 予選のとき', { x: 0.6, y: y0, w: 5.6, h: 0.35, fontFace: F, fontSize: 13, bold: true, color: C.gray, isTextBox: true, margin: 0 });
  s.addText('After ― 決勝のいま', { x: 7.1, y: y0, w: 5.6, h: 0.35, fontFace: F, fontSize: 13, bold: true, color: C.terra, isTextBox: true, margin: 0 });
  rows.forEach((r, i) => {
    const y = y0 + 0.42 + i * rh;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y, w: 5.6, h: rh - 0.1, fill: { color: 'F3F1EC' }, line: { color: 'F3F1EC', width: 0 }, rectRadius: 0.08 });
    s.addText(r[0], { x: 0.75, y, w: 5.35, h: rh - 0.1, fontFace: F, fontSize: 11, color: C.muted, isTextBox: true, margin: 0, valign: 'middle' });
    arrow(s, 6.4, y + 0.08, 0.5);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.1, y, w: 5.63, h: rh - 0.1, fill: { color: C.soft }, line: { color: 'EFD3C6', width: 0.75 }, rectRadius: 0.08 });
    s.addText(r[1], { x: 7.25, y, w: 5.38, h: rh - 0.1, fontFace: F, fontSize: 11, color: C.ink, isTextBox: true, margin: 0, valign: 'middle' });
  });
  foot(s, 7);
  s.addNotes('［審査観点 ③人の判断・修正、予選からの改良 に対応］【0:40】予選のあと1週間、毎日使って見つけた5点を、予選と同じループで直しました。いちばん覚えているのがこれ。スクロールが止まる不具合を、AIは1回目の修正で「直りました」と報告した。でも実機で触ると直っていない。差し戻して、計測させて、本当の原因を特定させ、方式を変えて採用。AIの報告を鵜呑みにせず、実機で判断する。この姿勢が決勝までに日常になりました。');
}
// ================= 8. 成果 =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, '成果 ― 毎日の食日記として、実運用中', '成果');
  // 主役：208店舗
  card(s, 0.6, 1.65, 5.3, 2.05, { fill: C.soft, line: 'EFD3C6' });
  s.addText('208', { x: 0.8, y: 1.7, w: 2.6, h: 1.3, fontFace: F, fontSize: 66, bold: true, color: C.terra, isTextBox: true, margin: 0, valign: 'middle' });
  s.addText('店舗', { x: 3.35, y: 2.15, w: 1.0, h: 0.6, fontFace: F, fontSize: 22, bold: true, color: C.terra, isTextBox: true, margin: 0, valign: 'middle' });
  s.addText('制作者自身が本番アプリに登録した実データ（訪問251回・写真242枚）。\n本番公開済み（PWA・URLを開くだけ）。毎日の外食を記録する食日記として使っている', { x: 0.8, y: 2.95, w: 4.9, h: 0.7, fontFace: F, fontSize: 10.5, color: C.ink, isTextBox: true, margin: 0 });
  [['70+', 'AI判定に対応する\n料理ジャンル'], ['約1分', '1回の記録に\nかかる時間']].forEach((st, i) => {
    const x = 6.1 + i * 1.6;
    card(s, x, 1.65, 1.5, 2.05, { fill: 'FBF8F3', noShadow: true });
    s.addText(st[0], { x, y: 1.8, w: 1.5, h: 0.8, fontFace: F, fontSize: 28, bold: true, color: C.terra, align: 'center', isTextBox: true, margin: 0 });
    s.addText(st[1], { x, y: 2.65, w: 1.5, h: 0.8, fontFace: F, fontSize: 9.5, color: C.muted, align: 'center', isTextBox: true, margin: 0 });
  });
  // 記録の Before / After
  card(s, 0.6, 3.95, 8.6, 2.95);
  s.addText('記録の手間 ― Before / After', { x: 0.85, y: 4.07, w: 6, h: 0.35, fontFace: F, fontSize: 13, bold: true, color: C.ink, isTextBox: true, margin: 0 });
  s.addText('従来の記録アプリ', { x: 0.85, y: 4.5, w: 3.8, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: C.gray, isTextBox: true, margin: 0 });
  const chips = ['店名', '住所', 'ジャンル', '料理', '日時', '写真', '評価'];
  chips.forEach((c, i) => {
    const x = 0.85 + (i % 4) * 0.95, y = 4.85 + Math.floor(i / 4) * 0.5;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 0.85, h: 0.38, fill: { color: 'F3F1EC' }, line: { color: 'DDD6CB', width: 0.75 }, rectRadius: 0.19 });
    s.addText(c, { x, y, w: 0.85, h: 0.38, fontFace: F, fontSize: 10.5, color: C.muted, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
  });
  s.addText('7項目を手入力 → 続かない', { x: 0.85, y: 5.95, w: 3.8, h: 0.35, fontFace: F, fontSize: 11.5, bold: true, color: C.gray, isTextBox: true, margin: 0 });
  arrow(s, 4.75, 5.05, 0.55);
  s.addText('BITEMAP', { x: 5.5, y: 4.5, w: 3.5, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: C.terra, isTextBox: true, margin: 0 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.5, y: 4.85, w: 1.35, h: 0.88, fill: { color: C.soft }, line: { color: 'EFD3C6', width: 0.75 }, rectRadius: 0.12 });
  s.addText('📷 写真', { x: 5.5, y: 4.85, w: 1.35, h: 0.88, fontFace: F, fontSize: 14, bold: true, color: C.dark, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
  s.addText('＋', { x: 6.85, y: 4.85, w: 0.4, h: 0.88, fontFace: F, fontSize: 18, bold: true, color: C.terra, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.25, y: 4.85, w: 1.7, h: 0.88, fill: { color: C.soft }, line: { color: 'EFD3C6', width: 0.75 }, rectRadius: 0.12 });
  s.addText('★ 評価 ＋ 店名', { x: 7.25, y: 4.85, w: 1.7, h: 0.88, fontFace: F, fontSize: 14, bold: true, color: C.dark, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
  s.addText('約1分。場所は写真の位置情報から、ジャンルはAIが判定、日時は写真から', { x: 5.5, y: 5.85, w: 3.55, h: 0.6, fontFace: F, fontSize: 10.5, bold: true, color: C.terra, isTextBox: true, margin: 0 });
  s.addText('データは本人のアカウント領域のみに保存（Firebaseルール）／AI判定は利用者自身のキーで実行／オフライン起動・ダークモード・地図クラスタ', { x: 0.85, y: 6.45, w: 8.1, h: 0.4, fontFace: F, fontSize: 9.5, color: C.gray, isTextBox: true, margin: 0 });
  shot(s, 'stats.png', 9.55, 1.65, 5.2, true);
  s.addText('ふりかえり画面（画面・動画は★3以上のみ：190店舗）', { x: 8.9, y: 6.9, w: 3.3, h: 0.3, fontFace: F, fontSize: 8.5, color: C.gray, isTextBox: true, margin: 0, align: 'center' });
  foot(s, 8);
  s.addNotes('［審査観点 ⑤成果物・デモ に対応］【0:25】成果。いちばん大事な数字は208店舗。デモ用のダミーではなく、私が本番アプリに毎日記録してきた実データです。記録の手間はここまで下がりました。従来は店名・住所・ジャンル・料理・日時・写真・評価の7項目。BITEMAPは写真と★と店名だけ、約1分。だから続く。');
}
// ================= 9. オリジナリティ =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'オリジナリティ ― 情報の流れを、逆にする', 'オリジナリティ');
  const flow = (y, label, nodes, color, fill, lineC) => {
    s.addText(label, { x: 0.85, y, w: 4, h: 0.3, fontFace: F, fontSize: 11, bold: true, color, isTextBox: true, margin: 0 });
    const n = nodes.length, gap = 0.45, w = (7.4 - gap * (n - 1)) / n;
    nodes.forEach((t, i) => {
      const x = 0.85 + i * (w + gap);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: y + 0.38, w, h: 0.85, fill: { color: fill }, line: { color: lineC, width: 1 }, rectRadius: 0.1 });
      s.addText(t, { x: x + 0.05, y: y + 0.38, w: w - 0.1, h: 0.85, fontFace: F, fontSize: 12, bold: true, color, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
      if (i < n - 1) s.addShape(pres.shapes.RIGHT_ARROW, { x: x + w + 0.06, y: y + 0.64, w: gap - 0.12, h: 0.32, fill: { color: lineC }, line: { color: lineC, width: 0 } });
    });
  };
  card(s, 0.6, 1.65, 8.4, 3.2);
  flow(1.8, '一般的なグルメサイト', ['店', '評価（みんなの平均）', 'あなた'], C.gray, 'F3F1EC', 'DDD6CB');
  flow(3.2, 'BITEMAP', ['あなたの評価', '味覚が近い人', 'その人の評価', 'まだ行っていない店'], C.dark, C.soft, C.terra);
  s.addText('評価の主語が「みんな」から「あなた」に変わる。記録するほど、自分の地図が賢くなる', { x: 0.85, y: 4.45, w: 7.9, h: 0.35, fontFace: F, fontSize: 11.5, bold: true, color: C.terra, isTextBox: true, margin: 0 });
  const orig = [['評価の重み付けを個人化', '「平均点」ではなく、共通店の★の突き合わせから味覚一致率を出し、その値で評価を並び替える'], ['記録が自然にたまる設計', '入力は写真と★だけ。場所・ジャンル・日時はAIと位置情報が埋める。食日記として毎日使うから、比較のためのデータが自然にたまる']];
  orig.forEach((o, i) => {
    const x = 0.6 + i * 4.3;
    card(s, x, 5.05, 4.1, 1.85, { fill: 'FBF8F3', noShadow: true });
    s.addText(o[0], { x: x + 0.22, y: 5.17, w: 3.7, h: 0.35, fontFace: F, fontSize: 13, bold: true, color: C.ink, isTextBox: true, margin: 0 });
    s.addText(o[1], { x: x + 0.22, y: 5.55, w: 3.7, h: 1.25, fontFace: F, fontSize: 12, color: C.muted, isTextBox: true, margin: 0, valign: 'top' });
  });
  card(s, 9.25, 1.65, 3.48, 5.25);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 9.5, y: 1.9, w: 2.0, h: 0.42, fill: { color: C.gray }, line: { color: C.gray, width: 0 }, rectRadius: 0.21 });
  s.addText('課題（正直に）', { x: 9.5, y: 1.9, w: 2.0, h: 0.42, fontFace: F, fontSize: 13, bold: true, color: C.white, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
  bullets(s, ['費用：店舗検索の Google Places API とクラウドは利用量課金。多人数への一般公開はコストの壁があり、当面は利用者自身のキー＋無料の OpenStreetMap 検索で運用', '初期の一致率：共通店が少ないうちは出せない。共通5件未満は非表示、自分の評価は一致率100%、一致率が出せない人の評価は弱く（0.15）反映し、1人でも食日記として成立する設計', 'AI判定の誤りの継続観測と、判定根拠の可視化'], 9.5, 2.5, 3.0, 4.3, 11);
  foot(s, 9);
  s.addNotes('［審査観点 ④オリジナリティ に対応］【0:30】オリジナリティは情報の流れです。一般のサイトは、店の評価の平均があなたに届く。BITEMAPは逆で、あなたの評価から味覚が近い人を見つけ、その人の評価で、まだ行っていない店を選ぶ。評価の主語が「みんな」から「あなた」に変わる。課題は正直に。Google Places やクラウドは使うほど課金され、一般公開にはコストの壁。初期の一致率は共通店が少ないと出せないので、5件未満は非表示、自分の評価を100%として使う設計で、1人でも食日記として成立します。');
}
// ================= 10. これから =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'これから ― 人が増えるほど、あなたの地図は賢くなる', '今後の展開');
  // 上：ここまで（タイムライン）
  card(s, 0.6, 1.6, 12.13, 1.75, { fill: 'FBF8F3', noShadow: true });
  s.addText('ここまで ― 295回のループの記録', { x: 0.85, y: 1.7, w: 8, h: 0.35, fontFace: F, fontSize: 13, bold: true, color: C.terra, isTextBox: true, margin: 0 });
  s.addShape(pres.shapes.LINE, { x: 1.3, y: 2.55, w: 10.7, h: 0, line: { color: 'D9CFC2', width: 3 } });
  const tl = [['v1', '2026/6\n最初の記録機能'], ['v100', '地図・アルバム\nクラウド同期'], ['v200', '味覚一致率\nSNS機能'], ['v289', '8/31 予選提出\nポスター・動画'], ['v295', '決勝\n実利用での改良5点']];
  tl.forEach((t, i) => {
    const cx = 1.3 + i * 2.675;
    const last = i === tl.length - 1;
    s.addShape(pres.shapes.OVAL, { x: cx - 0.17, y: 2.38, w: 0.34, h: 0.34, fill: { color: last ? C.terra : C.white }, line: { color: C.terra, width: 2 } });
    s.addText(t[0], { x: cx - 0.8, y: 2.02, w: 1.6, h: 0.32, fontFace: F, fontSize: 11.5, bold: true, color: C.dark, align: 'center', isTextBox: true, margin: 0 });
    s.addText(t[1], { x: cx - 1.1, y: 2.78, w: 2.2, h: 0.55, fontFace: F, fontSize: 9.5, color: C.muted, align: 'center', isTextBox: true, margin: 0, valign: 'top' });
  });
  // 下：これから（ネットワークの成長）
  s.addText('これから ― 「味覚が近い人」のネットワークを育てる', { x: 0.6, y: 3.55, w: 8, h: 0.35, fontFace: F, fontSize: 13, bold: true, color: '2F5D8A', isTextBox: true, margin: 0 });
  const grow = [['100人', 0.85, '味覚が近い人が数人見つかる', '共通店5件以上のペアが生まれ、一致率が表示され始める'], ['1,000人', 1.1, 'フォロー外にも「近い人」が現れる', 'おすすめをフォロー外へ拡大。ジャンルごとに近い人が違うことも見えてくる'], ['10,000人', 1.35, '「あなたと似た人が、まだ行っていない店」', '地域ごとに次に行く店をAIが提案（一致率 × 未訪問 × 現在地）']];
  grow.forEach((g, i) => {
    const x = 0.6 + i * 4.12, d = g[1];
    card(s, x, 4.0, 3.9, 2.9);
    s.addShape(pres.shapes.OVAL, { x: x + (3.9 - d) / 2, y: 5.45 - d, w: d, h: d, fill: { color: i === 2 ? C.terra : (i === 1 ? 'E9A98F' : 'F3D3C6') }, line: { color: C.terra, width: 0 } });
    s.addText(g[0], { x: x + (3.9 - d) / 2, y: 5.45 - d, w: d, h: d, fontFace: F, fontSize: i === 0 ? 13 : 16, bold: true, color: i === 2 ? C.white : C.dark, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
    s.addText(g[2], { x: x + 0.2, y: 5.55, w: 3.5, h: 0.4, fontFace: F, fontSize: 12.5, bold: true, color: C.ink, align: 'center', isTextBox: true, margin: 0, valign: 'middle' });
    s.addText(g[3], { x: x + 0.25, y: 5.98, w: 3.4, h: 0.85, fontFace: F, fontSize: 10.5, color: C.muted, align: 'center', isTextBox: true, margin: 0, valign: 'top' });
    if (i < 2) arrow(s, x + 3.95, 5.1, 0.14);
  });
  foot(s, 10);
  s.addNotes('［審査観点 ⑥プレゼン構成（展望） に対応］【0:30】ここまでは295回のループ。これからは人のネットワークです。100人で、味覚が近い人が数人見つかる。1,000人で、フォロー外にも近い人が現れ、おすすめが機能する。10,000人で、「あなたと似た人がまだ行っていない店」を地域ごとに提案できる。人が増えるほど、一人ひとりの地図が賢くなる設計です。');
}
// ================= 12. まとめ =================
{
  const s = pres.addSlide();
  s.background = { path: SHOT + 'grad.png' };
  s.addText('BITEMAP', { x: 0.7, y: 0.9, w: 8, h: 1.2, fontFace: FS, fontSize: 64, bold: true, color: C.white, isTextBox: true, margin: 0, charSpacing: 4 });
  s.addText('あなたの味覚で、店を選ぶ。', { x: 0.7, y: 2.1, w: 8, h: 0.8, fontFace: F, fontSize: 32, bold: true, color: C.white, isTextBox: true, margin: 0 });
  const pts = [['1', '自分の食の記録を、AIの手を借りて無理なく続けられる'], ['2', '平均点ではなく、個人の味覚をデータ化して評価を並び替える'], ['3', 'AIは実装と判定、判断は人。毎日使えるアプリになった'] ];
  pts.forEach((p, i) => {
    const y = 3.35 + i * 0.85;
    s.addShape(pres.shapes.OVAL, { x: 0.7, y, w: 0.55, h: 0.55, fill: { color: C.white }, line: { color: C.white, width: 0 } });
    s.addText(p[0], { x: 0.7, y, w: 0.55, h: 0.55, fontFace: F, fontSize: 16, bold: true, color: C.dark, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
    s.addText(p[1], { x: 1.45, y, w: 7.2, h: 0.55, fontFace: F, fontSize: 17, color: C.white, isTextBox: true, margin: 0, valign: 'middle' });
  });
  s.addText('ご清聴ありがとうございました。質疑応答をお願いします。', { x: 0.7, y: 6.3, w: 8, h: 0.5, fontFace: F, fontSize: 14, color: 'FFE9DF', isTextBox: true, margin: 0 });
  shot(s, 'profile.png', 9.75, 0.55, 6.4, true);
  s.addNotes('【0:20】まとめ3点。平均ではなく個人の味覚。AIは実装と判定、判断は人。毎日使えるアプリになりました。ご清聴ありがとうございました。');
}
// ================= 13. 補足 Q&A =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, '補足：想定される質問と回答（質疑応答用）', 'APPENDIX');
  const qa = [
    ['ユーザーが少ないと一致率は機能しないのでは？（コールドスタート）', '共通店5件未満では一致率を表示しない。初期は自分の評価を一致率100%として使い、一致率が出せない人の評価は弱く（重み0.15）反映する。だから1人でも「自分の食日記」として成立し、人が増えるほど精度が上がる。'],
    ['一致率は何人分のデータで検証した？', '評価傾向を変えたテストデータ（近い／真逆／無関係）で検証し 79%・27% を確認。本人の実データでは一致率83%のフォロー相手が1人。実ユーザー間の検証は共通店5件以上が集まった段階で行う。'],
    ['AIの判定が間違ったらどうなる？', '利用者が登録時に必ず確認・修正できる。手動で選んだ後はAIが上書きしない「所有権」ルール。自信のない判定はそもそも空欄。'],
    ['一般公開の予定は？費用は？', 'Google Places・Claude・Firebase は利用量課金のため、多人数に無料公開すると運営費が発生し、現状は難しい。利用者自身のキーで動かし、キー未設定でも無料の OpenStreetMap 検索で使える構成。公開には無料枠内の設計か費用モデルが必要。'],
    ['なぜ全量AI実装？品質は？', '人は判断に専念し、判断の回数を最大化するため。品質は自動テスト（Playwright）＋毎回の実機検証＋差し戻しで担保。AIの「直りました」も実機で確認してから採用。CLAUDE.mdで規約を固定。'],
    ['既存のグルメサービスとの違いは？', '「平均点」ではなく「自分と味覚が近い人」の評価で並び替える点。評価の主語が「みんな」から「あなた」に変わる。'],
    ['プライバシーは？', '記録・写真は本人のアカウント領域のみ（Firebaseルール）。公開は本人が公開した投稿のみ。他人の投稿には日付を出さない（全画面で統一）。'],
    ['一致率の計算はどこで？重くない？', '端末側で計算。共通店の★を突き合わせるだけ（相関0.7＋評価差0.3）なので追加のサーバー費用はなく、フォロー相手が増えても軽い。'],
  ];
  qa.forEach((q, i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 1.5 + Math.floor(i / 2) * 1.38;
    card(s, x, y, 5.98, 1.28, { fill: 'FBF8F3', noShadow: true });
    s.addText('Q. ' + q[0], { x: x + 0.2, y: y + 0.1, w: 5.6, h: 0.34, fontFace: F, fontSize: 11.5, bold: true, color: C.terra, isTextBox: true, margin: 0 });
    s.addText(q[1], { x: x + 0.2, y: y + 0.44, w: 5.6, h: 0.82, fontFace: F, fontSize: 9.5, color: C.ink, isTextBox: true, margin: 0, valign: 'top' });
  });
  foot(s, 12);
  s.addNotes('［審査観点 ⑦質疑応答 用］質疑応答の予備。発表では飛ばす（発表者ツールで参照）。');
}

// ================= 補足: 詳細（質疑用） =================
appendixAI1(); appendixAI2(); appendixAI3();
{
  const s = pres.addSlide(); s.background = { color: '000000' };
  if (!process.env.NOVIDEO) s.addMedia({ type: 'video', path: process.env.INTRO_EMBED || (REPO + 'promo/bitemap_intro.mp4'), x: 0, y: 0, w: 13.333, h: 7.5 });
  else { s.addImage({ path: SP_FINAL + 'intro_poster.jpg', x: 0, y: 0, w: 13.333, h: 7.5 }); s.addText('▶ 参考：一般向け紹介動画（71秒）― PDF版では静止画', { x: 0, y: 7.1, w: 13.333, h: 0.4, fontFace: F, fontSize: 11, bold: true, color: C.white, isTextBox: true, margin: 0, align: 'center', fill: { color: '2B2825' } }); }
  s.addNotes('補足：一般向け紹介動画（71秒・スライド全面・クリックで再生）。質疑で「一般の人にどう伝えるか」と聞かれたときの参考。発表では使わない。');
}
pres.writeFile({ fileName: '/tmp/claude-0/-home-user-gourmet-app/8edbdaa3-b81a-5c49-b452-bda755b7f07f/scratchpad/final/BITEMAP_決勝発表.pptx' }).then(f => console.log('written', f));
