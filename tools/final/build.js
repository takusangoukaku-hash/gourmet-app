const pptxgen = require('pptxgenjs');
const SHOT = '/tmp/claude-0/-home-user-gourmet-app/8edbdaa3-b81a-5c49-b452-bda755b7f07f/scratchpad/final/shots/';
const REALSHOT = '/tmp/claude-0/-home-user-gourmet-app/8edbdaa3-b81a-5c49-b452-bda755b7f07f/scratchpad/real/shots/';
const REPO = '/home/user/gourmet-app/';
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
    { n: 2, t: '自分の記録が育つ', d: '訪問店は評価色のピンに。写真は店ごとに自動整理され、「いつ・何を・何点」がすぐ見返せる。SNSであると同時に、自分だけの食日記・地図・統計として毎日使える。', img: 'profile.png', real: true },
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
  s.addNotes('【1:00】核心の味覚一致率。共通で行った店の★を突き合わせ、相関と評価差から0〜100%を出します。この79%で他の人の評価を重み付けすると、同じ店が全体では★3.6、あなた向けには★4.5になる。3つの工夫：偶然の一致を防ぐ信頼度ルールは人が定義。検証では近い人79%・真逆27%。地図・ホーム・店舗詳細すべてでこの値を使っています。');
}
// ================= 5. 実機デモ =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, '実機デモ ― 実際に使っている画面と実データ（43秒）', 'DEMO');
  const fs = require('fs');
  const REAL = process.env.DEMO_EMBED || '/home/user/gourmet-app/tools/final/real_demo.mp4';
  if (fs.existsSync(REAL)) {
    s.addMedia({ type: 'video', path: REAL, x: 1.87, y: 1.55, w: 9.6, h: 5.4 });
  } else {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 1.87, y: 1.55, w: 9.6, h: 5.0, fill: { color: 'FBF8F3' }, line: { color: C.terra, width: 1.5, dashType: 'dash' }, rectRadius: 0.15 });
    s.addText('▶', { x: 1.87, y: 2.4, w: 9.6, h: 1.0, fontFace: F, fontSize: 54, color: C.terra, align: 'center', isTextBox: true, margin: 0 });
    s.addText('ここに「実際に使っている画面の録画」を挿入', { x: 1.87, y: 3.45, w: 9.6, h: 0.5, fontFace: F, fontSize: 20, bold: true, color: C.ink, align: 'center', isTextBox: true, margin: 0 });
    s.addText('PowerPoint: 挿入 → ビデオ → このデバイス… でこの枠の位置に配置（枠は削除）\nおすすめ構成: ①ホーム（味覚一致バッジ・あなた向け評価） ②地図（208店舗のピン→タップで記録） ③お店の記録 の順・合計60秒以内', { x: 2.5, y: 4.1, w: 8.3, h: 1.2, fontFace: F, fontSize: 12.5, color: C.muted, align: 'center', isTextBox: true, margin: 0 });
    s.addText('録画データを送っていただければ、こちらで埋め込んだ版を作成します（ステータスバー切り抜き・末尾のトリミング込み）', { x: 2.5, y: 5.5, w: 8.3, h: 0.5, fontFace: F, fontSize: 11, color: C.gray, align: 'center', isTextBox: true, margin: 0 });
  }
  s.addText('動画は本人アカウントの実データ（208店舗・251訪問・242枚）。予備: https://takusangoukaku-hash.github.io/gourmet-app/', { x: 1.87, y: 6.65, w: 9.6, h: 0.3, fontFace: F, fontSize: 9.5, color: C.gray, isTextBox: true, margin: 0, align: 'center' });
  foot(s, 5);
  s.addNotes('【0:45】実機・実データの録画（42秒・表示は★3以上の記録のみ・BGM小音量入り）。①ホーム：味覚一致83%のバッジと「あなた向け／全体」評価 ②アルバム：自分の食日記としての写真グリッド（190店舗・223枚）→お店の記録 ③検索：ラーメン100店の写真一覧 ④ふりかえり：統計。地図は録画に含まれないので、必要なら手元のスマホで見せる。再生できない場合は本番URLをブラウザで開いて実演。');
}
// ================= 6. AIの使い方（①②③を1枚に） =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'AIの使い方 ― つくるも、つかうもAI。決めるのは人', '審査観点 ①②③ AI活用の目的と方法／プロンプト設計／人の判断');
  const colX = [0.6, 4.72, 8.84], W = 3.9;
  const heads = [['①', '目的と方法'], ['②', 'プロンプト設計'], ['③', '人の判断・修正']];
  heads.forEach((h, i) => {
    card(s, colX[i], 1.65, W, 5.25);
    numCircle(s, colX[i] + 0.22, 1.85, h[0], 0.4);
    s.addText(h[1], { x: colX[i] + 0.72, y: 1.83, w: 3.0, h: 0.44, fontFace: F, fontSize: 16, bold: true, color: C.ink, isTextBox: true, margin: 0, valign: 'middle' });
  });
  // ① 開発ループ（縦4段）＋アプリ内AI
  const steps = [['人', '要望を日本語・画像で伝える', C.soft, C.terra], ['AI', '実装＋自動テスト（Playwright）', 'EEF3FB', '2F5D8A'], ['AI', 'コミット＆本番デプロイ', 'EEF3FB', '2F5D8A'], ['人', '実機で検証 → 採用／差し戻し', C.soft, C.terra]];
  steps.forEach((st, k) => {
    const y = 2.45 + k * 0.62;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: colX[0] + 0.22, y, w: 3.45, h: 0.5, fill: { color: st[2] }, line: { color: st[2], width: 0 }, rectRadius: 0.1 });
    s.addText(st[0], { x: colX[0] + 0.3, y, w: 0.45, h: 0.5, fontFace: F, fontSize: 11, bold: true, color: st[3], align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
    s.addText(st[1], { x: colX[0] + 0.78, y, w: 2.85, h: 0.5, fontFace: F, fontSize: 10.5, color: C.ink, valign: 'middle', isTextBox: true, margin: 0 });
    if (k < 3) s.addText('▼', { x: colX[0] + 1.85, y: y + 0.46, w: 0.3, h: 0.2, fontSize: 8, color: 'C9BFB2', align: 'center', isTextBox: true, margin: 0 });
  });
  rich(s, [{ text: '開発：', options: { bold: true, color: C.terra } }, 'コードは全量AI実装（Claude Code）。人は要望・検証・採否に専念。このループを ', { text: '295回転', options: { bold: true, color: C.terra } }, '。'], colX[0] + 0.22, 5.0, 3.45, 0.75, 10.5);
  rich(s, [{ text: 'アプリ内：', options: { bold: true, color: C.terra } }, '料理写真を Claude API（画像入力）で70+ジャンルに自動判定。迷ったら空欄にして人が選ぶ。キー未設定でも地図タグ推定で動く。'], colX[0] + 0.22, 5.75, 3.45, 1.05, 10.5);
  // ② プロンプト設計 3層
  const p2 = [['CLAUDE.md にルールを明文化', '「変更のたびに4箇所のバージョンを揃える」「星は共通SVG部品」「他人の投稿に日付を出さない」など、毎回守る決め事を文書化して全会話で共有'], ['要望は「現象」で伝える', '例：「写真一覧をタップすると少し前の投稿が出るので直して」。原因の特定はAIに任せ、人はコードを読まない。デザインは文章より画像で渡す'], ['アプリ内の分類器は「制約」で縛る', 'ジャンルは enum で一覧に固定（幻覚を出さない）／自信がなければ confident=false で空欄／JSON Schema で構造化出力']];
  p2.forEach((t, k) => {
    const y = 2.45 + k * 1.45;
    s.addText(t[0], { x: colX[1] + 0.22, y, w: 3.45, h: 0.32, fontFace: F, fontSize: 11.5, bold: true, color: C.terra, isTextBox: true, margin: 0 });
    s.addText(t[1], { x: colX[1] + 0.22, y: y + 0.34, w: 3.45, h: 1.05, fontFace: F, fontSize: 10, color: C.ink, isTextBox: true, margin: 0, valign: 'top' });
  });
  // ③ 人の判断 Before→After 3例
  const p3 = [['写真一覧の2列化', 'AIが提案・実装（v278〜280）', '実機で「一覧性が落ちた」→3版分を差し戻し'], ['ジャンルアイコン', 'AIがSVGで71種を自作', '絵柄が不統一で不採用→手持ちイラストから切り出し'], ['味覚一致率の表示', '共通2〜3店でも計算', '偶然の一致を防ぐ「5件未満は非表示」を人が定義'], ['スクロールの修正', '1回目の修正で「直った」と報告', '「まだ滑らかでない」と差し戻し→計測で原因特定させ方式変更']];
  p3.forEach((t, k) => {
    const y = 2.45 + k * 1.02;
    s.addText(t[0], { x: colX[2] + 0.22, y, w: 3.45, h: 0.28, fontFace: F, fontSize: 11, bold: true, color: C.ink, isTextBox: true, margin: 0 });
    s.addText([{ text: 'AI ', options: { bold: true, color: '2F5D8A' } }, { text: t[1], options: { color: C.muted } }, { text: '\n人 ', options: { bold: true, color: C.terra } }, { text: t[2], options: { color: C.ink } }], { x: colX[2] + 0.22, y: y + 0.28, w: 3.45, h: 0.72, fontFace: F, fontSize: 9.5, isTextBox: true, margin: 0, valign: 'top' });
  });
  s.addText('原則：AIの出力は「提案」。採否は必ず実機で触って決める', { x: colX[2] + 0.22, y: 6.5, w: 3.45, h: 0.32, fontFace: F, fontSize: 10, bold: true, color: C.terra, isTextBox: true, margin: 0 });
  foot(s, 6);
  s.addNotes('【0:50】AIの使い方を1枚で。①開発はClaude Codeにコードを全量書かせ、人は要望・検証・採否に専念。このループを295回。アプリ内では写真のジャンル判定にClaude APIを使い、迷ったら人が選ぶ。②プロンプトは3層：ルールはCLAUDE.mdに、要望は現象で、判定は制約で。③人の判断の代表例：2列UIの差し戻し、SVGアイコン不採用、信頼度ルール、スクロール修正の差し戻し。原則は、AIの出力は提案、採否は実機で決める。詳細は補足スライドに。');
}
function appendixAI1() {
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'AIの活用 ― 「つくる」も「つかう」もAI、決めるのは人', '補足 ｜ 審査観点 ① AI活用の目的と方法（詳細）');
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
  rich(s, [{ text: 'このループを ', options: {} }, { text: '295回転', options: { bold: true, color: C.terra } }, { text: '（v1〜v295）。仕様書・デザイン案は画像のまま渡し、守るべき決め事は ', options: {} }, { text: 'CLAUDE.md', options: { bold: true } }, { text: ' に明文化して全会話で共有。', options: {} }], 0.85, 3.85, 7.1, 0.75, 12);
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
  foot(s, 12);
  s.addNotes('【0:45】AIは2か所。開発ではClaude Codeにコードを全量書かせ、人は要望・検証・採否に専念。このループを295回。アプリ内では写真のジャンル判定にClaude APIを使い、自信がなければ空欄にして人が選ぶ。AIは提案役、決定は人、が一貫した方針です。');
}

function appendixAI2() {
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'プロンプト設計 ― ルールは文書に、要望は現象で', '補足 ｜ 審査観点 ② プロンプト設計（詳細）');
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
  foot(s, 13);
  s.addNotes('【0:50】プロンプト設計は3層。①CLAUDE.mdに毎回守るルールを明文化し、会話をまたいで共有。②要望は現象ベースで伝え、原因特定はAIに任せる。実物のプロンプトはこの3つ。③アプリ内の分類器はenum制約とconfidentフラグ、JSONスキーマ出力で、幻覚を出さず、迷ったら人に委ねる設計。');
}

function appendixAI3() {
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'AI出力に対する人の判断・修正（代表例）', '補足 ｜ 審査観点 ③ 人の判断・修正（詳細）');
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
  foot(s, 14);
  s.addNotes('【0:50】AIの提案をそのまま採用しなかった代表例。写真一覧の2列化は一覧性が落ちて3バージョン差し戻し。SVGアイコンは絵柄が不統一で不採用。一致率の信頼度ルールは人が定義。ジャンル判定は所有権ルール。最後は決勝までに起きた例で、1回目の修正を「まだ滑らかでない」と差し戻し、計測で原因を特定させました。共通原則は、AIの出力は提案、採否は実機で決める。');
}

// ================= 9. 予選からの改善 =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, '予選からの改善（v289 → v295）― 実利用で見つけた5点', '予選後の改良');
  const items = [
    ['v290', '写真一覧から開いた投稿がズレる不具合を修正', '検索の写真一覧をタップすると「少し前の投稿」が表示された。写真の非同期読み込みで高さが後から伸び、位置補正が切り詰められていたのが原因。「基準の投稿を画面上端に固定する」方式に変更'],
    ['v291', '投稿詳細のスクロールを滑らかに', 'v290の方式だと慣性スクロール中に補正が割り込んで止まる。写真の高さが確定してから継ぎ足し、操作中は補正しない設計に'],
    ['v292', '味の評価を0.5刻みでスマホでも確実に', '「左半分タップで.5」は26pxの星では狙えなかった。星を36pxに拡大、なぞって選択、同じ星の再タップで .5 切替、数値表示を追加'],
    ['v293', '他人の投稿の日付を全画面で非表示', 'ホームのカードと店舗シートに残っていた相対時刻を廃止。プライバシー配慮を全画面で統一'],
  ];
  // 5件目（v294-295）は下の帯で紹介
  items.forEach((it, i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 1.65 + Math.floor(i / 2) * 2.2;
    card(s, x, y, 5.98, 2.0);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 0.22, y: y + 0.2, w: 0.85, h: 0.36, fill: { color: C.terra }, line: { color: C.terra, width: 0 }, rectRadius: 0.18 });
    s.addText(it[0], { x: x + 0.22, y: y + 0.2, w: 0.85, h: 0.36, fontFace: F, fontSize: 11, bold: true, color: C.white, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
    s.addText(it[1], { x: x + 1.2, y: y + 0.18, w: 4.6, h: 0.4, fontFace: F, fontSize: 13.5, bold: true, color: C.ink, isTextBox: true, margin: 0, valign: 'middle' });
    s.addText(it[2], { x: x + 0.22, y: y + 0.7, w: 5.5, h: 1.2, fontFace: F, fontSize: 11, color: C.muted, isTextBox: true, margin: 0, valign: 'top' });
  });
  card(s, 0.6, 6.05, 12.13, 0.85, { fill: C.soft, line: 'EFD3C6', noShadow: true });
  rich(s, [{ text: 'v294-295 写真込みバックアップ：', options: { bold: true, color: C.terra } }, 'クラウド保存の写真も端末で取得して同梱し、別端末で写真ごと復元できるように（このデモ動画の実データ再現にも使用）。', { text: '　進め方は予選と同じループ：', options: { bold: true, color: C.terra } }, '日常利用で気づく → 現象を伝える → AIが修正・自動テスト → 実機で検証。'], 0.85, 6.12, 11.7, 0.75, 11.5, { valign: 'middle' });
  foot(s, 7);
  s.addNotes('【0:40】予選後の改善は4点、いずれも実利用で見つけたもの。特にv290→291は、1回目の修正で直ったと報告されたものを実機で差し戻し、計測で本当の原因を特定させた例。進め方は予選と同じループです。');
}
// ================= 10. 成果 =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, '成果 ― 「動くもの」を実生活で運用中', '審査観点 ⑤ 成果物の完成度');
  const stats = [['295', 'リリースした\nバージョン数'], ['208', '実運用で登録した\n店舗数'], ['70+', 'AI判定に対応する\n料理ジャンル'], ['1分', '1回の記録にかかる\n時間（目安）']];
  stats.forEach((st, i) => {
    const x = 0.6 + i * 2.1;
    card(s, x, 1.65, 1.95, 1.9, { fill: 'FBF8F3', noShadow: true });
    s.addText(st[0], { x, y: 1.8, w: 1.95, h: 0.9, fontFace: F, fontSize: 40, bold: true, color: C.terra, align: 'center', isTextBox: true, margin: 0 });
    s.addText(st[1], { x, y: 2.7, w: 1.95, h: 0.7, fontFace: F, fontSize: 10.5, color: C.muted, align: 'center', isTextBox: true, margin: 0 });
  });
  bullets(s, ['本番公開済み（PWA・URLを開くだけ・インストール不要）。制作者自身が毎日の外食の記録（食日記）として利用', '記録の手間：AIジャンル判定＋位置の自動補完で、手入力は店名と★だけ', 'データは本人のアカウント領域にのみ保存（Firebaseセキュリティルール）。公開は本人が公開した投稿のみ', 'AI判定は利用者自身のAPIキーで実行。最終確認・修正は利用者が行う', 'オフライン起動（Service Worker）・ダークモード・地図クラスタ表示・行きたい店ピン'], 0.6, 3.85, 8.2, 3.0, 12.5);
  shot(s, 'stats.png', 9.55, 1.65, 5.2, true);
  s.addText('統計画面（実データ）：208店舗・251訪問・242枚', { x: 8.9, y: 6.9, w: 4.4, h: 0.3, fontFace: F, fontSize: 9.5, color: C.gray, isTextBox: true, margin: 0, align: 'center' });
  foot(s, 8);
  s.addNotes('【0:25】数字で。295バージョン、実運用で208店舗、70以上のジャンル、1回の記録は1分。本番公開済みで、制作者が毎日使っています。個人情報は本人の領域にのみ保存。');
}
// ================= 11. オリジナリティ・今後 =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, 'オリジナリティと、これから', '審査観点 ④ テーマのオリジナリティ');
  const cols = [
    ['オリジナリティ', C.terra, ['「平均点」ではなく、個人の味覚をデータ化して評価を並び替える切り口', '記録のハードルをAIで「店名と★だけ」まで下げ、データが自然にたまる設計', '295バージョンのAI協働開発プロセスの記録そのものも成果物']],
    ['今後の展開', '2F5D8A', ['おすすめをフォロー外へ拡大し、「味覚の近い人」を発見できる場に', '記録に応じたバッジ・コレクションで継続を後押し', '「次に行くべき店」をAIが提案（味覚一致率×未訪問店×現在地）']],
    ['課題（正直に）', C.gray, ['店舗検索の Google Places API とクラウドは利用量に応じて課金。多人数への一般公開はコスト面の壁があり、当面は利用者自身のキー＋無料の OpenStreetMap 検索で運用', '一致率の精度向上には共通店数が必要。初期ユーザー同士をつなぐ仕組みづくり', 'AI判定の誤りの継続観測と、判定根拠の可視化']],
  ];
  cols.forEach((c, i) => {
    const x = 0.6 + i * 4.12;
    card(s, x, 1.65, 3.9, 3.15);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + 0.25, y: 1.9, w: 2.2, h: 0.42, fill: { color: c[1] }, line: { color: c[1], width: 0 }, rectRadius: 0.21 });
    s.addText(c[0], { x: x + 0.25, y: 1.9, w: 2.2, h: 0.42, fontFace: F, fontSize: 13, bold: true, color: C.white, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
    bullets(s, c[2], x + 0.25, 2.5, 3.4, 2.2, 12);
  });
  // 開発タイムライン（AI協働開発の記録そのものも成果物）
  card(s, 0.6, 5.05, 12.13, 1.85, { fill: 'FBF8F3', noShadow: true });
  s.addText('295回のループの記録 ― プロセスそのものが成果物', { x: 0.85, y: 5.17, w: 8, h: 0.35, fontFace: F, fontSize: 13, bold: true, color: C.terra, isTextBox: true, margin: 0 });
  s.addShape(pres.shapes.LINE, { x: 1.3, y: 6.05, w: 10.7, h: 0, line: { color: 'D9CFC2', width: 3 } });
  const tl = [['v1', '2026/6\n最初の記録機能'], ['v100', '地図・アルバム\nクラウド同期'], ['v200', '味覚一致率\nSNS機能'], ['v289', '8/31 予選提出\nポスター・動画'], ['v295', '決勝\n実利用での改善5件']];
  tl.forEach((t, i) => {
    const cx = 1.3 + i * 2.675;
    const last = i === tl.length - 1;
    s.addShape(pres.shapes.OVAL, { x: cx - 0.17, y: 5.88, w: 0.34, h: 0.34, fill: { color: last ? C.terra : C.white }, line: { color: C.terra, width: 2 } });
    s.addText(t[0], { x: cx - 0.8, y: 5.5, w: 1.6, h: 0.32, fontFace: F, fontSize: 11.5, bold: true, color: C.dark, align: 'center', isTextBox: true, margin: 0 });
    s.addText(t[1], { x: cx - 1.1, y: 6.28, w: 2.2, h: 0.55, fontFace: F, fontSize: 9.5, color: C.muted, align: 'center', isTextBox: true, margin: 0, valign: 'top' });
  });
  foot(s, 9);
  s.addNotes('【0:30】オリジナリティは、平均ではなく個人の味覚をデータ化する切り口と、記録のハードルをAIで極限まで下げた設計。今後はフォロー外へのおすすめ拡大と、次に行く店のAI提案。課題は正直に：Google Places API やクラウドは使うほど課金されるため、多人数への一般公開はコストの壁がある。今は利用者自身のキーと無料のOpenStreetMap検索で運用。加えて共通店数の確保とAI判定の根拠可視化。');
}
// ================= 12. まとめ =================
{
  const s = pres.addSlide();
  s.background = { path: SHOT + 'grad.png' };
  s.addText('BITEMAP', { x: 0.7, y: 0.9, w: 8, h: 1.2, fontFace: FS, fontSize: 64, bold: true, color: C.white, isTextBox: true, margin: 0, charSpacing: 4 });
  s.addText('あなたの味覚で、店を選ぶ。', { x: 0.7, y: 2.1, w: 8, h: 0.8, fontFace: F, fontSize: 32, bold: true, color: C.white, isTextBox: true, margin: 0 });
  const pts = [['1', '自分の食の記録を、AIの手を借りて無理なく続けられる'], ['2', '平均点ではなく、個人の味覚をデータ化して評価を並び替える'], ['3', 'AIは実装と判定、判断は人。295回のループで完成'] ];
  pts.forEach((p, i) => {
    const y = 3.35 + i * 0.85;
    s.addShape(pres.shapes.OVAL, { x: 0.7, y, w: 0.55, h: 0.55, fill: { color: C.white }, line: { color: C.white, width: 0 } });
    s.addText(p[0], { x: 0.7, y, w: 0.55, h: 0.55, fontFace: F, fontSize: 16, bold: true, color: C.dark, align: 'center', valign: 'middle', isTextBox: true, margin: 0 });
    s.addText(p[1], { x: 1.45, y, w: 7.2, h: 0.55, fontFace: F, fontSize: 17, color: C.white, isTextBox: true, margin: 0, valign: 'middle' });
  });
  s.addText('ご清聴ありがとうございました。質疑応答をお願いします。', { x: 0.7, y: 6.3, w: 8, h: 0.5, fontFace: F, fontSize: 14, color: 'FFE9DF', isTextBox: true, margin: 0 });
  shot(s, 'profile.png', 9.75, 0.55, 6.4, true);
  s.addNotes('【0:20】まとめ3点。平均ではなく個人の味覚。AIは実装と判定、判断は人。295回のループで毎日使えるアプリに。ご清聴ありがとうございました。');
}
// ================= 13. 補足 Q&A =================
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, '補足：想定される質問と回答（質疑応答用）', 'APPENDIX');
  const qa = [
    ['一致率は何人分のデータで検証した？', '評価傾向を変えたテストデータ（近い／真逆／無関係）で検証し 79%・27% を確認。実ユーザー間の検証は共通店5件以上が集まった段階で行う予定。'],
    ['AIの判定が間違ったらどうなる？', '利用者が登録時に必ず確認・修正できる。手動で選んだ後はAIが上書きしない「所有権」ルール。自信のない判定はそもそも空欄。'],
    ['一般公開の予定は？費用は？', 'Google Places・Claude・Firebase は利用量課金のため、多人数に無料公開すると運営費が発生し、現状は難しい。利用者自身のキーで動かし、キー未設定でも無料の OpenStreetMap 検索で使える構成。公開には無料枠内の設計か費用モデルが必要。'],
    ['なぜ全量AI実装？品質は？', '人は判断に専念し、判断の回数を最大化するため。品質は自動テスト（Playwright）＋毎回の実機検証＋差し戻しで担保。CLAUDE.mdで規約を固定。'],
    ['既存のグルメサービスとの違いは？', '「平均点」ではなく「自分と味覚が近い人」の評価で並び替える点。評価の主語が「みんな」から「あなた」に変わる。'],
    ['プライバシーは？', '記録・写真は本人のアカウント領域のみ（Firebaseルール）。公開は本人が公開した投稿のみ。他人の投稿には日付を出さない（v293で全画面統一）。'],
  ];
  qa.forEach((q, i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 1.6 + Math.floor(i / 2) * 1.78;
    card(s, x, y, 5.98, 1.62, { fill: 'FBF8F3', noShadow: true });
    s.addText('Q. ' + q[0], { x: x + 0.22, y: y + 0.14, w: 5.55, h: 0.4, fontFace: F, fontSize: 12.5, bold: true, color: C.terra, isTextBox: true, margin: 0 });
    s.addText(q[1], { x: x + 0.22, y: y + 0.55, w: 5.55, h: 1.0, fontFace: F, fontSize: 10.5, color: C.ink, isTextBox: true, margin: 0, valign: 'top' });
  });
  foot(s, 11);
  s.addNotes('質疑応答の予備。発表では飛ばす（発表者ツールで参照）。');
}

// ================= 補足: 詳細（質疑用） =================
appendixAI1(); appendixAI2(); appendixAI3();
{
  const s = pres.addSlide(); s.background = { color: C.white };
  header(s, '参考：一般向け紹介動画（アニメ＋実演・1分08秒）', '補足');
  s.addMedia({ type: 'video', path: process.env.INTRO_EMBED || (REPO + 'promo/bitemap_intro.mp4'), x: 1.87, y: 1.55, w: 9.6, h: 5.4 });
  foot(s, 15);
  s.addNotes('質疑で「一般の人にどう伝えるか」と聞かれたときの参考。発表では使わない。');
}
pres.writeFile({ fileName: '/tmp/claude-0/-home-user-gourmet-app/8edbdaa3-b81a-5c49-b452-bda755b7f07f/scratchpad/final/BITEMAP_決勝発表.pptx' }).then(f => console.log('written', f));
