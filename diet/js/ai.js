// =====================================================
// 写真からの食事推定（Claude API）
//  - API キーは利用者自身のブラウザ localStorage にのみ保存（個人用アプリ）
//  - BITEMAP と同一オリジンなので、そちらで設定済みのキーがあれば流用する
//  - 推定値の精度は「量」の見積もりに依存し ±30% 程度ぶれる。必ず利用者が確認・修正する前提
// =====================================================
window.AI = (() => {
  const KEY_STORAGE = 'diet.anthropicKey';
  const LEGACY_KEY_STORAGE = 'gourmet.anthropicKey'; // BITEMAP 側の設定
  const MODEL = 'claude-opus-5';

  const getApiKey = () => localStorage.getItem(KEY_STORAGE) || localStorage.getItem(LEGACY_KEY_STORAGE) || '';
  function setApiKey(key) {
    if (key && key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
    clientPromise = null;
  }
  const hasApiKey = () => !!getApiKey();
  const keySource = () => localStorage.getItem(KEY_STORAGE) ? 'diet' : (localStorage.getItem(LEGACY_KEY_STORAGE) ? 'bitemap' : '');

  // 公式SDK（@anthropic-ai/sdk）を遅延ロード
  let clientPromise = null;
  function client() {
    if (!clientPromise) {
      clientPromise = import('https://esm.sh/@anthropic-ai/sdk@0.72.1')
        .then(({ default: Anthropic }) => new Anthropic({
          apiKey: getApiKey(),
          dangerouslyAllowBrowser: true, // 個人用: キーは利用者自身のブラウザにのみ保存
        }));
    }
    return clientPromise;
  }

  async function compressImage(file, maxDim, quality) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      return await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    } catch {
      return file;
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  const SCHEMA = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: '写真に写っている料理・食品ごとの推定。料理が写っていなければ空配列',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '料理名（日本語・短く）' },
            amount: { type: 'string', description: '推定した量。例: 「1杯 約250g」「1枚 約120g」' },
            kcal: { type: 'number', description: '推定エネルギー kcal' },
            protein_g: { type: 'number', description: 'タンパク質 g' },
            fat_g: { type: 'number', description: '脂質 g' },
            carb_g: { type: 'number', description: '炭水化物 g' },
          },
          required: ['name', 'amount', 'kcal', 'protein_g', 'fat_g', 'carb_g'],
          additionalProperties: false,
        },
      },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: '量の推定を含めた全体の確信度' },
      note: { type: 'string', description: '推定の根拠や、ぶれやすい点を1〜2文で。例: 「ご飯の量が見えにくいので並盛(250g)と仮定」' },
    },
    required: ['items', 'confidence', 'note'],
    additionalProperties: false,
  };

  const SYSTEM = [
    'あなたは管理栄養士です。食事の写真から、写っている料理・食品を特定し、エネルギーとPFC（タンパク質・脂質・炭水化物）を推定します。',
    '手順: (1) 料理を特定する (2) 皿・器・箸などから量を見積もる。手がかりが無ければ日本の外食・家庭の標準的な一人前を仮定する (3) 日本食品標準成分表（八訂）に基づく代表値で計算する。',
    '複数の料理が写っていれば料理ごとに分ける。ドレッシング・油・砂糖など見えにくい成分も常識的な範囲で含める。',
    '数値は整数〜小数1桁で出す。過小評価より過大評価の方が減量目的では安全なので、迷ったらやや多めに見積もる。',
    '料理が写っていない写真（風景・人物・メニュー表など）は items を空にして confidence を low にする。',
    '利用者からヒント（料理名やサイズ）があればそれを優先する。',
  ].join('\n');

  // 戻り値: { items:[{name, amount, kcal, p, f, c}], confidence, note }
  async function estimateMeal(file, hint) {
    if (!hasApiKey()) throw new Error('APIキーが未設定です（設定タブ）');
    const blob = await compressImage(file, 1024, 0.75);
    const base64 = await blobToBase64(blob);
    const c = await client();

    const userText = hint && hint.trim()
      ? `この食事のエネルギーとPFCを推定してください。ヒント: ${hint.trim()}`
      : 'この食事のエネルギーとPFCを推定してください。';

    const res = await c.beta.messages.create({
      model: MODEL,
      max_tokens: 4096,
      // 安全分類器による拒否時はサーバー側で別モデルへ自動フォールバック
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: userText },
        ],
      }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    });

    if (res.stop_reason === 'refusal') throw new Error('AIがこの写真の判定を拒否しました');
    const text = res.content.find(b => b.type === 'text');
    if (!text) throw new Error('AIから結果が返りませんでした');
    const j = JSON.parse(text.text);
    return {
      items: (j.items || []).map(it => ({
        name: it.name, amount: it.amount,
        kcal: Math.round(+it.kcal || 0),
        p: Math.round((+it.protein_g || 0) * 10) / 10,
        f: Math.round((+it.fat_g || 0) * 10) / 10,
        c: Math.round((+it.carb_g || 0) * 10) / 10,
      })),
      confidence: j.confidence || 'low',
      note: j.note || '',
    };
  }

  return { getApiKey, setApiKey, hasApiKey, keySource, estimateMeal, compressImage, MODEL };
})();
