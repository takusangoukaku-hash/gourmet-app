// =====================================================
// 計算ロジック（純関数のみ・DOM非依存）
//  - 基礎代謝: Mifflin-St Jeor 式
//  - 消費カロリー: MET 法（自転車は速度で MET を切替、筋トレは一律 5.0）
//  ※ いずれも推定値。個人差 ±20% 程度はある前提で扱うこと
// =====================================================
window.Calc = (() => {
  const KCAL_PER_KG_FAT = 7200; // 体脂肪1kg ≒ 7200kcal
  const MIN_KCAL = 1200;        // これ以下の目標は設定しない（安全側の下限）
  const DEFAULT_BIKE_KMH = 17;  // 距離か時間の片方しか無い時に仮定する通学速度
  const STRENGTH_MET = 5.0;     // 筋トレ（一般的な強度）。Ainsworth 2011 の 3.5〜6.0 の中間

  function bmr(p, weight) {
    if (!p || !p.age || !p.height || !weight) return 0;
    const base = 10 * weight + 6.25 * p.height - 5 * p.age;
    return Math.round(p.sex === 'female' ? base - 161 : base + 5);
  }

  function tdee(p, weight) {
    return Math.round(bmr(p, weight) * (Number(p.activity) || 1.4));
  }

  // 目標 kcal / PFC。手動設定があればそれを優先
  // tdeeOverride: 体重と摂取記録から逆算した実測TDEE（使える時だけ渡される）
  function targets(p, weight, tdeeOverride) {
    if (p.targets && Number(p.targets.kcal) > 0) {
      const t = p.targets;
      return { kcal: +t.kcal, p: +t.p || 0, f: +t.f || 0, c: +t.c || 0, mode: 'manual' };
    }
    const t = tdeeOverride || tdee(p, weight);
    if (!t) return null;
    const b = bmr(p, weight);
    let kcal = Math.round(t - (Number(p.goalKgPerWeek) || 0) * KCAL_PER_KG_FAT / 7);
    const belowBmr = kcal < b;
    kcal = Math.max(kcal, MIN_KCAL);
    const prot = Math.round((Number(p.proteinPerKg) || 2.0) * weight);
    const fat = Math.round(kcal * (Number(p.fatRatio) || 0.25) / 9);
    const carb = Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4));
    return { kcal, p: prot, f: fat, c: carb, mode: tdeeOverride ? 'measured' : 'auto', tdee: t, bmr: b, belowBmr };
  }

  function bikeMet(kmh) {
    if (kmh < 16) return 4.0;
    if (kmh < 19) return 6.8;
    if (kmh < 22) return 8.0;
    if (kmh < 25) return 10.0;
    return 12.0;
  }

  // 距離(km)・時間(分)のどちらか片方でも計算できる
  function bike(distanceKm, minutes, weight) {
    let km = Number(distanceKm) || 0, min = Number(minutes) || 0;
    if (!km && !min) return { kcal: 0, met: 0, minutes: 0, km: 0, kmh: 0 };
    if (!min) min = km / DEFAULT_BIKE_KMH * 60;
    if (!km) km = DEFAULT_BIKE_KMH * min / 60;
    const kmh = km / (min / 60);
    const met = bikeMet(kmh);
    return {
      kcal: Math.round(met * (weight || 0) * min / 60),
      met, minutes: Math.round(min), km: Math.round(km * 10) / 10, kmh: Math.round(kmh * 10) / 10,
    };
  }

  function strengthKcal(minutes, weight) {
    return Math.round(STRENGTH_MET * (weight || 0) * (Number(minutes) || 0) / 60);
  }

  function volume(sets) {
    return (sets || []).reduce((s, x) => s + (Number(x.kg) || 0) * (Number(x.reps) || 0), 0);
  }

  // 日付ベースの7日移動平均（当日を含む直近7日間に記録がある分の平均）
  function movingAvg(points, days = 7) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const end = dayNum(points[i].date);
      let sum = 0, n = 0;
      for (let j = i; j >= 0; j--) {
        if (end - dayNum(points[j].date) >= days) break;
        sum += points[j].kg; n++;
      }
      out.push({ date: points[i].date, kg: Math.round(sum / n * 100) / 100 });
    }
    return out;
  }

  function dayNum(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
  }

  function bmi(weight, heightCm) {
    if (!weight || !heightCm) return 0;
    const h = heightCm / 100;
    return Math.round(weight / (h * h) * 10) / 10;
  }

  // ---------- カロリー収支の答え合わせ ----------
  // 最小二乗の回帰直線。傾きの標準誤差も返す（誤差幅の表示用）
  function linreg(xs, ys) {
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
    const slope = sxx ? sxy / sxx : 0;
    const icpt = my - slope * mx;
    let ssr = 0;
    for (let i = 0; i < n; i++) ssr += (ys[i] - (icpt + slope * xs[i])) ** 2;
    const se = (n > 2 && sxx) ? Math.sqrt(ssr / (n - 2) / sxx) : Infinity;
    return { slope, icpt, se };
  }

  // 条件: 期間内の体重 8回以上・10日以上の幅、食事記録 10日以上かつ期間の60%以上
  const BAL_MIN_WEIGHINS = 8, BAL_MIN_SPAN = 10, BAL_MIN_INTAKE_DAYS = 10, BAL_MIN_COVERAGE = 0.6;

  // weights: 期間内の [{date,kg}] / intakeDays: 記録が揃った日の [{date,kcal}]
  // days: 期間の日数 / formulaTdee: 式による TDEE / exerciseAvg: 記録された運動の1日平均kcal
  function energyBalance({ weights, intakeDays, days, formulaTdee, exerciseAvg }) {
    const span = weights.length ? dayNum(weights[weights.length - 1].date) - dayNum(weights[0].date) : 0;
    const need = {
      weighins: Math.max(0, BAL_MIN_WEIGHINS - weights.length),
      span: Math.max(0, BAL_MIN_SPAN - span),
      intakeDays: Math.max(0, Math.max(BAL_MIN_INTAKE_DAYS, Math.ceil(days * BAL_MIN_COVERAGE)) - intakeDays.length),
    };
    const ready = !need.weighins && !need.span && !need.intakeDays;
    const avgIntake = intakeDays.length ? Math.round(intakeDays.reduce((s, d) => s + d.kcal, 0) / intakeDays.length) : 0;
    const out = { ready, need, days, weighins: weights.length, span, intakeDayCount: intakeDays.length, avgIntake };
    if (!ready) return out;

    const x0 = dayNum(weights[0].date);
    const r = linreg(weights.map(w => dayNum(w.date) - x0), weights.map(w => w.kg));
    const actualBalance = Math.round(r.slope * KCAL_PER_KG_FAT);           // kcal/日（マイナス=赤字）
    const margin = Math.round(1.96 * r.se * KCAL_PER_KG_FAT);                // 95%の誤差幅
    const measuredTdee = avgIntake - actualBalance;
    const expectedTdee = formulaTdee ? Math.round(formulaTdee + (exerciseAvg || 0)) : 0;
    return Object.assign(out, {
      kgPerWeek: Math.round(r.slope * 7 * 100) / 100,
      actualBalance, margin, measuredTdee,
      expectedTdee,
      plannedBalance: expectedTdee ? avgIntake - expectedTdee : null,       // 式どおりなら期待される収支
      gap: expectedTdee ? measuredTdee - expectedTdee : null,               // 実測 − 式
    });
  }

  return { linreg, energyBalance, bmr, tdee, targets, bike, bikeMet, strengthKcal, volume, movingAvg, dayNum, bmi, KCAL_PER_KG_FAT };
})();
