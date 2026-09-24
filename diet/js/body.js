// =====================================================
// 体組成の推定と、体脂肪率・筋肉量に応じた人体図（SVG）の生成
//  - 体脂肪率の推定は 体組成計の値 > 骨格筋率からの換算 > BMI式 の順に使う
//  - 骨格筋率→体脂肪率は、家庭用体組成計（オムロン等）の 18〜39歳の標準範囲どうしを
//    線形に対応づけた近似。機種・年齢で定義が違うので、体脂肪率が表示される機種ならその値を使う
//  - 見た目は写真ではなくイラスト。体脂肪率と筋肉量（FFMI）で輪郭と筋の見え方を変える
// =====================================================
window.Body = (() => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const r1 = v => Math.round(v * 10) / 10;

  // ---------- 推定 ----------
  // 優先順: 体脂肪率 > 除脂肪量 > 筋肉量 > 骨格筋率 > BMI式
  //  ffm: 除脂肪量kg / mm: 筋肉量kg（体組成計の「筋肉量」= 除脂肪量 − 推定骨量）
  //  seg: 部位別筋肉量kg { trunk, ra, la, rl, ll } / inseam: 股下cm
  function estimate({ sex, age, height, weight, sm, bf, ffm, mm, seg, inseam }) {
    if (!height || !weight) return null;
    const h = height / 100;
    const bmi = weight / (h * h);
    const male = sex !== 'female';
    let method, fat;
    if (bf > 2 && bf < 70) {
      method = 'bf'; fat = bf;
    } else if (ffm > 15 && ffm < weight) {
      method = 'ffm'; fat = (1 - ffm / weight) * 100;
    } else if (mm > 15 && mm < weight) {
      // 骨量は除脂肪量のおよそ5%（体組成計の推定骨量と同程度）
      method = 'mm'; fat = (1 - mm / 0.95 / weight) * 100;
    } else if (sm > 10 && sm < 60) {
      method = 'sm';
      // 男性: 骨格筋率 33.3〜39.3% ↔ 体脂肪率 21〜11%、女性: 24.3〜30.3% ↔ 35〜21%
      fat = male ? 21 - (sm - 33.3) * (10 / 6) : 35 - (sm - 24.3) * (14 / 6);
    } else {
      method = 'bmi';
      // Deurenberg 式（BMI・年齢・性別）。筋肉が多い人は高めに出る
      fat = 1.2 * bmi + 0.23 * (age || 25) - 10.8 * (male ? 1 : 0) - 5.4;
    }
    fat = clamp(fat, male ? 4 : 10, 60);
    const segKg = cleanSeg(seg);
    return derive({ sex, height, weight, bf: fat, method, sm, segKg, inseam });
  }

  const SEG_KEYS = ['trunk', 'ra', 'la', 'rl', 'll'];
  function cleanSeg(seg) {
    if (!seg) return null;
    const out = {};
    SEG_KEYS.forEach(k => { if (seg[k] > 0) out[k] = +seg[k]; });
    return Object.keys(out).length ? out : null;
  }

  // 部位別筋肉量の標準（kg/身長m²）。FFMI 男性20・女性16 の体型に相当する値
  const SEG_REF = {
    male: { trunk: 9.35, ra: 1.08, la: 1.08, rl: 3.45, ll: 3.45 },
    female: { trunk: 7.8, ra: 0.76, la: 0.76, rl: 2.9, ll: 2.9 },
  };
  // 標準に対する割合（1.0 = 標準）
  function segRatio(sex, height, segKg) {
    if (!segKg) return null;
    const h2 = (height / 100) ** 2, ref = SEG_REF[sex === 'female' ? 'female' : 'male'];
    const out = {};
    Object.keys(segKg).forEach(k => { out[k] = segKg[k] / h2 / ref[k]; });
    return out;
  }

  function derive({ sex, height, weight, bf, method, sm, segKg, inseam }) {
    const h = height / 100;
    const fatKg = weight * bf / 100;
    const ffm = weight - fatKg;
    const ffmi = ffm / (h * h);
    return {
      sex, height, weight: r1(weight), bf: r1(bf), fatKg: r1(fatKg), ffm: r1(ffm),
      ffmi: r1(ffmi), ffmiNorm: r1(ffmi + 6.1 * (1.8 - h)), bmi: r1(weight / (h * h)), method, sm,
      segKg: segKg || null, segRatio: segRatio(sex, height, segKg), inseam: inseam || null,
    };
  }

  // 体重を newWeight にした時の予測。
  // 減量: 筋トレ＋十分なタンパク質なら減った分の約85%が脂肪、筋トレなしなら約70%
  // 増量: 筋トレしていても増えた分の約60%は脂肪（初心者以外）
  function project(cur, newWeight, trained = true) {
    const dw = newWeight - cur.weight;
    const share = dw < 0 ? (trained ? 0.85 : 0.70) : 0.60;
    // 必須脂肪（男性約5%・女性約12%）より下には落ちない。そこから先に減るのは筋肉などの除脂肪
    const minFat = newWeight * (cur.sex === 'female' ? 0.12 : 0.05);
    const want = cur.fatKg + dw * share;
    const fatKg = Math.max(minFat, want);
    const ffmScale = (newWeight - fatKg) / cur.ffm;
    const segKg = cur.segKg ? Object.fromEntries(Object.entries(cur.segKg).map(([k, v]) => [k, v * ffmScale])) : null;
    const e = derive({ sex: cur.sex, height: cur.height, weight: newWeight, bf: fatKg / newWeight * 100, method: cur.method, sm: null, segKg, inseam: cur.inseam });
    e.depleted = want < minFat;
    return e;
  }

  // ---------- 見た目の段階 ----------
  const TIERS = {
    male: [
      [6, '大会の仕上がり', '全身に血管と筋肉の筋が浮く。日常生活で維持するのは難しい水準。'],
      [9, 'バキバキ', '腹筋がくっきり割れ、肩・腕・脚の筋肉の境目まで見える。顔もかなりシャープ。'],
      [12, 'シックスパック', '腹筋6つがはっきり見え、腕に血管が浮く。いわゆる細マッチョの完成形。'],
      [15, '腹筋の輪郭が見える', '光の当たり方次第で腹筋が割れて見える。服の上からでも締まった体。'],
      [18, '引き締まった体', '腹筋の上部がうっすら。脇腹に少し脂肪が残る。'],
      [22, '平均的', '腹筋は見えない。お腹は平ら〜少し出る。成人男性の平均的な体。'],
      [27, 'ぽっちゃり', 'お腹が前に出て脇腹がつまめる。胸にも丸みが出る。'],
      [99, '肥満体型', '全体に丸みが強く、お腹が大きくせり出す。顔や首にも脂肪がつく。'],
    ],
    female: [
      [14, '競技者レベル', '筋肉の筋が全身に見える。月経不順などの健康リスクがある水準。'],
      [18, 'アスリート体型', '腹筋の縦線と輪郭、肩や腕の筋が見える。'],
      [22, '引き締まった体', 'お腹に縦線（11字腹筋）が出る。二の腕や脚もすっきり。'],
      [26, 'ほっそり', 'お腹は平らで、健康的に細い印象。'],
      [33, '平均的', '成人女性の平均的な体。下腹・お尻・太ももに脂肪がつく。'],
      [38, 'ぽっちゃり', '下腹が出て、二の腕・太ももが太めになる。'],
      [99, '肥満体型', '全体に丸く、お腹・腰回りに脂肪が多い。'],
    ],
  };
  function describe(sex, bf, depleted) {
    if (depleted) return { label: '痩せすぎ', text: '脂肪がほぼ残っておらず、ここから先に減るのは筋肉。体調を崩す危険な水準。' };
    const t = TIERS[sex === 'female' ? 'female' : 'male'].find(x => bf < x[0]);
    return { label: t[1], text: t[2] };
  }
  // これを下回ると健康リスクが高い体脂肪率
  const tooLean = (sex, bf) => bf < (sex === 'female' ? 16 : 7);

  // ---------- 人体図 ----------
  // 身長にかかわらず高さ400で描く（体脂肪率とFFMIは身長で正規化済みなので、比率で見た目が決まる）
  function svg(e, opts = {}) {
    const male = e.sex !== 'female';
    const bf = e.bf, fm = e.ffmiNorm;
    // 基準体型からのずれ（男性: 体脂肪15%・FFMI20、女性: 25%・16）
    const fa = (bf - (male ? 15 : 25)) / 10;
    const mu = clamp((fm - (male ? 20 : 16)) / (male ? 3 : 2.5), -1.5, 2);
    const fpos = Math.max(0, fa), fneg = Math.min(0, fa);
    // 部位別の筋肉量があれば部位ごとに太さを決める（標準比 +15% ≒ FFMI +3 と同じ変化）。無い部位は全身の値
    const sr = e.segRatio || {};
    const segMu = k => sr[k] ? clamp((sr[k] - 1) / (male ? 0.15 : 0.156), -1.8, 2.5) : mu;
    const muT = segMu('trunk');
    // 正面から見た図なので、本人の右腕・右足は画面の左側（s = -1）
    const muArm = s => segMu(s < 0 ? 'ra' : 'la');
    const muLeg = s => segMu(s < 0 ? 'rl' : 'll');
    const muLegAvg = (muLeg(1) + muLeg(-1)) / 2;

    const B = male
      ? { sh: 54, ch: 40, wa: 33, hi: 38, arm: 11.5, fore: 9, th: 21, calf: 13.5, neck: 12 }
      : { sh: 46, ch: 36, wa: 29, hi: 42, arm: 10, fore: 8, th: 22, calf: 13, neck: 10 };
    const sh = B.sh + 5 * muT + 3 * fpos + 1.5 * fneg;
    const ch = B.ch + 3.5 * muT + 5 * fpos + 2 * fneg;
    const wa = Math.max(B.wa - 4, B.wa + 0.8 * muT + (male ? 9 : 6) * fpos + 3 * fneg);
    const belly = male ? Math.max(0, (bf - 20) * 0.9) : Math.max(0, (bf - 30) * 0.6);
    // お腹が出たら腰もそれ以上に張る（お腹の横だけ膨らんで腰がくびれる不自然な形を避ける）
    const hi = Math.max(B.hi + 1.5 * muLegAvg + (male ? 6 : 8) * fpos + 3 * fneg, wa + belly * 0.85);
    const armW = s => B.arm + 2.2 * muArm(s) + 1.6 * fpos + 0.8 * fneg;
    const foreW = s => B.fore + 1.3 * muArm(s) + 1.2 * fpos + 0.5 * fneg;
    const thW = s => B.th + 2.5 * muLeg(s) + (male ? 4 : 5.5) * fpos + 1.5 * fneg;
    const calfW = s => B.calf + 1.2 * muLeg(s) + 1.5 * fpos + 0.5 * fneg;
    const arm = Math.max(armW(1), armW(-1)), th = (thW(1) + thW(-1)) / 2;
    const neck = B.neck + 1.8 * muT + 1.5 * fpos;

    // 見え方（0〜1）
    const absV = clamp(((male ? 17 : 24) - bf) / 6, 0, 1);
    const obV = clamp(((male ? 13 : 20) - bf) / 5, 0, 1);
    const pecV = male ? clamp((22 - bf) / 10, 0, 1) * clamp(0.5 + muT * 0.4, 0.3, 1) : 0;
    const veinV = clamp(((male ? 11 : 17) - bf) / 4, 0, 1);
    const quadV = clamp(((male ? 14 : 21) - bf) / 5, 0, 1);
    const foldV = male ? clamp((bf - 23) / 8, 0, 1) : clamp((bf - 32) / 8, 0, 1);

    const cx = 100, X = x => cx + x, M = x => cx - x;
    const f = n => n.toFixed(1);

    // 胴体（右半分の点を上から、左は鏡像）
    const torsoR = [
      ['M', neck * 0.8, 50], ['L', neck, 64],
      ['C', neck + 10, 68, sh - 14, 68, sh - 4, 74],
      ['C', sh + 2, 78, sh + 2, 92, ch + 2, 104],
      ['C', ch + 1, 112, ch, 120, ch - 2, 128],
      ['C', ch - 3, 140, wa, 148, wa, 158],
      ['C', wa + belly * 0.8, 166, wa + belly, 176, hi - 1 + belly * 0.3, 190],
      ['C', hi + 1, 196, hi + 1, 204, hi, 214],
    ];
    const mirror = pts => pts.slice().reverse();
    let torso = `M${f(X(torsoR[0][1]))},${torsoR[0][2]}`;
    torsoR.slice(1).forEach(p => {
      if (p[0] === 'L') torso += ` L${f(X(p[1]))},${p[2]}`;
      else torso += ` C${f(X(p[1]))},${p[2]} ${f(X(p[3]))},${p[4]} ${f(X(p[5]))},${p[6]}`;
    });
    torso += ` L${f(M(torsoR[torsoR.length - 1][5]))},${torsoR[torsoR.length - 1][6]}`;
    // 左側は逆順に辿る
    for (let i = torsoR.length - 1; i >= 1; i--) {
      const p = torsoR[i], prev = torsoR[i - 1];
      const end = prev[0] === 'C' ? [prev[5], prev[6]] : [prev[1], prev[2]];
      if (p[0] === 'L') torso += ` L${f(M(end[0]))},${end[1]}`;
      else torso += ` C${f(M(p[3]))},${p[4]} ${f(M(p[1]))},${p[2]} ${f(M(end[0]))},${end[1]}`;
    }
    torso += ' Z';

    // 脚
    const legC = hi * 0.5 + 1;
    const leg = s => {
      const o = x => cx + s * x;
      const th = thW(s), calf = calfW(s);
      const inner = Math.max(1.5, legC - th);
      const kneeC = legC * 0.82, kn = 8.5 + 0.8 * muLeg(s) + 1.2 * fpos;
      const ankC = legC * 0.72, an = 5.5;
      return `M${f(o(hi - 1))},206 C${f(o(hi))},230 ${f(o(legC + th * 0.95))},250 ${f(o(legC + th * 0.8))},262
        C${f(o(legC + th * 0.6))},276 ${f(o(kneeC + kn + 2))},284 ${f(o(kneeC + kn))},292
        C${f(o(kneeC + calf + 2))},304 ${f(o(ankC + calf))},330 ${f(o(ankC + an))},378
        L${f(o(ankC + an + 5))},392 L${f(o(ankC - an - 2))},394 L${f(o(ankC - an))},378
        C${f(o(ankC - calf + 3))},330 ${f(o(kneeC - calf))},304 ${f(o(kneeC - kn))},292
        C${f(o(kneeC - kn - 2))},276 ${f(o(inner + 1))},258 ${f(o(inner))},244 L${f(o(inner))},214 L${f(o(0))},214 Z`;
    };

    // 腕（胴体から少し離して垂らす）
    const side = Math.max(ch, wa + belly * 0.9, hi * 0.92);
    const arm_ = s => {
      const o = x => cx + s * x;
      const arm = armW(s), fore = foreW(s);
      const shX = sh - 6, elX = side + arm * 0.9 + 3, wrX = elX + 3;
      return `M${f(o(shX - arm))},82 C${f(o(shX - arm))},72 ${f(o(shX + arm * 0.7))},70 ${f(o(shX + arm))},84
        C${f(o(elX + arm + 1))},112 ${f(o(elX + arm * 0.8))},130 ${f(o(elX + fore))},150
        C${f(o(wrX + fore))},170 ${f(o(wrX + 5))},196 ${f(o(wrX + 5))},204
        C${f(o(wrX + 7))},214 ${f(o(wrX - 1))},226 ${f(o(wrX - 4))},222
        C${f(o(wrX - 7))},214 ${f(o(wrX - 6))},206 ${f(o(wrX - 5))},204
        C${f(o(wrX - fore))},184 ${f(o(elX - fore))},166 ${f(o(elX - fore))},150
        C${f(o(elX - arm))},128 ${f(o(shX - arm * 1.2))},108 ${f(o(shX - arm))},82 Z`;
    };

    const line = (d, op, w = 1.3) => op > 0.02 ? `<path d="${d}" fill="none" stroke="var(--body-line)" stroke-width="${w}" stroke-linecap="round" opacity="${op.toFixed(2)}"/>` : '';
    let detail = '';
    // 胸
    if (male) {
      const sag = Math.max(0, (bf - 20) * 0.5);
      detail += line(`M${f(X(3))},${122 + sag * 0.3} C${f(X(ch * 0.4))},${128 + sag} ${f(X(ch - 6))},${124 + sag * 0.6} ${f(X(ch - 3))},${110}`, Math.max(pecV, sag > 1 ? 0.35 : 0));
      detail += line(`M${f(M(3))},${122 + sag * 0.3} C${f(M(ch * 0.4))},${128 + sag} ${f(M(ch - 6))},${124 + sag * 0.6} ${f(M(ch - 3))},${110}`, Math.max(pecV, sag > 1 ? 0.35 : 0));
      detail += line(`M${cx},96 L${cx},${124}`, pecV * 0.6, 1);
      // 三角筋
      detail += line(`M${f(X(sh - 10))},86 C${f(X(sh - 12))},96 ${f(X(sh - 8))},102 ${f(X(sh - 4))},106`, pecV * 0.7);
      detail += line(`M${f(M(sh - 10))},86 C${f(M(sh - 12))},96 ${f(M(sh - 8))},102 ${f(M(sh - 4))},106`, pecV * 0.7);
    }
    // 腹筋
    const aw = Math.min(wa * 0.42, 14);
    detail += line(`M${cx},130 L${cx},${184}`, absV * 0.9);
    [142, 155, 168].forEach((y, i) => {
      const op = absV * (i === 2 ? 0.7 : 0.9) * (male ? 1 : 0.6);
      detail += line(`M${f(X(2))},${y} C${f(X(aw * 0.5))},${y + 2} ${f(X(aw))},${y} ${f(X(aw + 1))},${y - 2}`, op);
      detail += line(`M${f(M(2))},${y} C${f(M(aw * 0.5))},${y + 2} ${f(M(aw))},${y} ${f(M(aw + 1))},${y - 2}`, op);
    });
    detail += line(`M${f(X(aw + 2))},132 C${f(X(aw + 4))},150 ${f(X(aw + 3))},170 ${f(X(aw))},186`, absV * 0.6);
    detail += line(`M${f(M(aw + 2))},132 C${f(M(aw + 4))},150 ${f(M(aw + 3))},170 ${f(M(aw))},186`, absV * 0.6);
    // 腹斜筋・Vライン
    detail += line(`M${f(X(wa - 3))},172 C${f(X(wa - 6))},190 ${f(X(12))},200 ${f(X(5))},212`, obV * 0.8);
    detail += line(`M${f(M(wa - 3))},172 C${f(M(wa - 6))},190 ${f(M(12))},200 ${f(M(5))},212`, obV * 0.8);
    // へそ・お腹の段
    detail += `<ellipse cx="${cx}" cy="${174 + belly * 0.3}" rx="1.6" ry="${2 + belly * 0.05}" fill="var(--body-line)" opacity=".55"/>`;
    detail += line(`M${f(M(wa + belly * 0.6))},${192 + belly * 0.2} C${f(M(wa * 0.4))},${200 + belly * 0.4} ${f(X(wa * 0.4))},${200 + belly * 0.4} ${f(X(wa + belly * 0.6))},${192 + belly * 0.2}`, foldV * 0.7, 1.5);
    // 腕の血管・大腿四頭筋
    [1, -1].forEach(s => {
      const o = x => cx + s * x;
      const elX = side + armW(s) * 0.9 + 3;
      detail += line(`M${f(o(elX + 1))},160 C${f(o(elX + 3))},176 ${f(o(elX + 1))},188 ${f(o(elX + 4))},200`, veinV * 0.5, 0.9);
      detail += line(`M${f(o(sh - 4))},104 C${f(o(elX + 2))},118 ${f(o(elX + 3))},132 ${f(o(elX + 1))},146`, pecV * 0.35 * (male ? 1 : 0), 0.9);
      detail += line(`M${f(o(legC + 2))},238 C${f(o(legC + 4))},256 ${f(o(legC + 2))},272 ${f(o(legC * 0.9))},284`, quadV * 0.6);
      detail += line(`M${f(o(legC - th * 0.5))},250 C${f(o(legC - 2))},268 ${f(o(legC * 0.85))},280 ${f(o(legC * 0.8))},286`, quadV * 0.45);
    });

    // 衣類（男性: ショートパンツ、女性: スポーツブラ＋ショートパンツ）
    const shortsBottom = 244;
    const legCo = legC + th * 0.95;
    const shorts = `<path d="M${f(M(hi + 0.5))},200 L${f(X(hi + 0.5))},200 C${f(X(hi + 2))},212 ${f(X(legCo + 1))},228 ${f(X(legCo))},${shortsBottom}
      Q${f(X(legC))},${shortsBottom + 3} ${f(X(Math.max(1, legC - th) - 0.5))},${shortsBottom - 2} L${cx},228 L${f(M(Math.max(1, legC - th) - 0.5))},${shortsBottom - 2} Q${f(M(legC))},${shortsBottom + 3} ${f(M(legCo))},${shortsBottom}
      C${f(M(legCo + 1))},228 ${f(M(hi + 2))},212 ${f(M(hi + 0.5))},200 Z" fill="var(--body-cloth)"/>`;
    const bra = male ? '' : `<path d="M${f(M(ch + 1))},104 C${f(M(ch * 0.5))},98 ${f(X(ch * 0.5))},98 ${f(X(ch + 1))},104
      C${f(X(ch + 0.5))},116 ${f(X(ch - 1))},126 ${f(X(ch - 3))},132 L${f(M(ch - 3))},132 C${f(M(ch - 1))},126 ${f(M(ch + 0.5))},116 ${f(M(ch + 1))},104 Z" fill="var(--body-cloth)"/>
      <path d="M${f(X(ch * 0.55))},100 L${f(X(sh - 16))},72 M${f(M(ch * 0.55))},100 L${f(M(sh - 16))},72" stroke="var(--body-cloth)" stroke-width="3" fill="none"/>`;

    // 頭・髪
    const head = `<ellipse cx="${cx}" cy="30" rx="${male ? 17 : 16}" ry="21" fill="var(--body-skin)" stroke="var(--body-stroke)" stroke-width="1.2"/>
      <path d="M${cx - (male ? 17 : 16.5)},28 C${cx - 17},6 ${cx + 17},6 ${cx + (male ? 17 : 16.5)},28 C${cx + 12},${male ? 16 : 14} ${cx - 12},${male ? 16 : 14} ${cx - (male ? 17 : 16.5)},28 Z" fill="var(--body-hair)"/>
      ${male ? '' : `<path d="M${cx - 16},24 C${cx - 22},40 ${cx - 20},56 ${cx - 14},62 L${cx - 12},40 Z M${cx + 16},24 C${cx + 22},40 ${cx + 20},56 ${cx + 14},62 L${cx + 12},40 Z" fill="var(--body-hair)"/>`}`;

    const skin = `fill="var(--body-skin)" stroke="var(--body-stroke)" stroke-width="1.2" stroke-linejoin="round"`;
    const w = opts.width || 120;
    // 股下: 基準の図は股の位置が y=212（股下/身長 ≒ 0.455）。股下比に合わせて肩(72)〜足(396)の間を伸縮する
    const legRatio = e.inseam && e.height ? clamp(e.inseam / e.height, 0.40, 0.52) : 0.455;
    const crotchY = 396 - 388 * (legRatio + 0.019);
    const mapY = y => y <= 72 ? y : y <= 212 ? 72 + (y - 72) * (crotchY - 72) / 140 : crotchY + (y - 212) * (396 - crotchY) / 184;
    const warp = str => str.replace(/ d="([^"]*)"/g, (m, d) => ' d="' + d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (mm, x, y) => `${x},${mapY(+y).toFixed(1)}`) + '"')
      .replace(/ cy="(\d+(?:\.\d+)?)"(?= rx="1\.6")/g, (m, y) => ` cy="${mapY(+y).toFixed(1)}"`);
    return warp(`<svg class="body-fig" viewBox="0 0 200 400" width="${w}" height="${w * 2}" role="img" aria-label="${opts.label || ''}">
      <path d="${arm_(1)}" ${skin}/><path d="${arm_(-1)}" ${skin}/>
      <path d="${leg(1)}" ${skin}/><path d="${leg(-1)}" ${skin}/>
      <path d="${torso}" ${skin}/>
      <rect x="${cx - neck * 0.8}" y="44" width="${neck * 1.6}" height="10" fill="var(--body-skin)"/>
      ${head}
      ${shorts}${bra}
      <g>${detail}</g>
    </svg>`);
  }

  return { estimate, derive, project, describe, tooLean, svg, segRatio, SEG_KEYS };
})();
