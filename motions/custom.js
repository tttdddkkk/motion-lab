/* ============================================================
   カスタマイズ（効果を重ねて、自分の動きを作る）のデータとロジック（ADR 0023）
   - 効果（EFFECTS）を重ね、効果ごとに 時間・遅れ・イージング・量 を決める。重ねた結果が1つの動きになる
   - 表示する値・再生する動き・コピーするコードは、すべて同じ layers から作る（差分比較と同じ考え方）
   - 重ね方: transform の効果は composite: 'add' で合成する（同じ要素の transform を取り合わない）。
     opacity / filter は1つの効果だけが持つので、同じ効果は1回までにしている
   DOM に依存しない。tests/custom.test.js で検査する。
   ============================================================ */
import { EASING_PRESETS, SPRING } from './compare.js';

export const DURATION_RANGE = { min: 50, max: 1500, step: 10 };
export const DELAY_RANGE = { min: 0, max: 1500, step: 10 };

/** @type {import('./types.js').CustomEffect[]} */
export const EFFECTS = [
  {
    id: 'fade', name: 'フェード', feel: 'やわらかい', property: 'opacity',
    defaults: { duration: 400, delay: 0, easing: 'ease-out' },
    frames: () => [{ opacity: 0 }, { opacity: 1 }]
  },
  {
    id: 'slide-y', name: '縦スライド', feel: '軽い・上品', property: 'transform',
    defaults: { duration: 500, delay: 0, easing: 'ease-out' },
    param: { label: '距離（＋で下から）', unit: 'px', min: -80, max: 80, step: 2, value: 24 },
    frames: v => [{ transform: `translateY(${v}px)` }, { transform: 'translateY(0px)' }]
  },
  {
    id: 'slide-x', name: '横スライド', feel: '流れる', property: 'transform',
    defaults: { duration: 500, delay: 0, easing: 'ease-out' },
    param: { label: '距離（＋で右から）', unit: 'px', min: -80, max: 80, step: 2, value: 24 },
    frames: v => [{ transform: `translateX(${v}px)` }, { transform: 'translateX(0px)' }]
  },
  {
    id: 'scale', name: '拡大縮小', feel: '弾む・ポップ', property: 'transform',
    defaults: { duration: 450, delay: 0, easing: SPRING },
    param: { label: '開始の大きさ', unit: '倍', min: 0.5, max: 1.5, step: 0.02, value: 0.9 },
    frames: v => [{ transform: `scale(${v})` }, { transform: 'scale(1)' }]
  },
  {
    id: 'rotate', name: '回転', feel: 'ひらり・遊び心', property: 'transform',
    defaults: { duration: 500, delay: 0, easing: 'ease-out' },
    param: { label: '開始の角度', unit: '度', min: -45, max: 45, step: 1, value: -8 },
    frames: v => [{ transform: `rotate(${v}deg)` }, { transform: 'rotate(0deg)' }]
  },
  {
    id: 'blur', name: 'ぼかし', feel: 'ピントが合う', property: 'filter',
    defaults: { duration: 400, delay: 0, easing: 'ease-out' },
    param: { label: '開始のぼかし', unit: 'px', min: 0, max: 20, step: 1, value: 8 },
    frames: v => [{ filter: `blur(${v}px)` }, { filter: 'blur(0px)' }]
  }
];

const EFFECT_BY_ID = new Map(EFFECTS.map(e => [e.id, e]));
export const effectOf = id => EFFECT_BY_ID.get(id);

/* easing は調整 UI と同じ候補だけ使う。URL では 'spring' と書く（cubic-bezier の括弧とカンマを避けるため） */
const EASING_KEYS = new Map(EASING_PRESETS.map(([, value]) => [value === SPRING ? 'spring' : value, value]));
const easingKey = value => [...EASING_KEYS].find(([, v]) => v === value)?.[0] ?? 'ease-out';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const snap = (n, range) => clamp(Math.round(n / range.step) * range.step, range.min, range.max);
const round2 = n => Math.round(n * 100) / 100;

/**
 * 値を範囲に収めて、正しい layer にする。未知の効果なら null
 * @param {Partial<import('./types.js').CustomLayer> & { effect: string }} raw
 * @returns {import('./types.js').CustomLayer | null}
 */
export function makeLayer(raw) {
  const effect = effectOf(raw.effect);
  if (!effect) return null;
  const d = effect.defaults;
  const num = (v, fallback) => (Number.isFinite(v) ? /** @type {number} */ (v) : fallback);
  /** @type {import('./types.js').CustomLayer} */
  const layer = {
    effect: effect.id,
    duration: snap(num(raw.duration, d.duration), DURATION_RANGE),
    delay: snap(num(raw.delay, d.delay), DELAY_RANGE),
    easing: [...EASING_KEYS.values()].includes(/** @type {string} */ (raw.easing)) ? /** @type {string} */ (raw.easing) : d.easing
  };
  if (effect.param) {
    const p = effect.param;
    layer.amount = round2(clamp(num(raw.amount, p.value), p.min, p.max));
  }
  return layer;
}

/* 同じ効果は1回まで。重複と未知の効果を除く */
export function sanitizeLayers(list) {
  const seen = new Set();
  return list.flatMap(raw => {
    const layer = raw && makeLayer(raw);
    if (!layer || seen.has(layer.effect)) return [];
    seen.add(layer.effect);
    return [layer];
  });
}

export const addableEffects = layers => EFFECTS.filter(e => !layers.some(l => l.effect === e.id));

/** 並べ替え。範囲外なら何もしない（新しい配列を返す） */
export function moveLayer(layers, index, delta) {
  const to = index + delta;
  if (index < 0 || index >= layers.length || to < 0 || to >= layers.length) return [...layers];
  const next = [...layers];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** 出発点になる組み合わせ。ID・印象ワード・使いどころを持つ（CLAUDE.md のバリアント方針） */
export const PRESETS = [
  { id: 'rise', name: 'ふわっと上昇', tags: ['やわらかい', '上品'], use: 'カード・パネルの表示',
    layers: [{ effect: 'fade' }, { effect: 'slide-y', amount: 24, duration: 600 }] },
  { id: 'pop', name: 'ポップ', tags: ['弾む', '軽快'], use: '完了・成功の強調',
    layers: [{ effect: 'fade', duration: 200 }, { effect: 'scale', amount: 0.8 }] },
  { id: 'focus', name: 'ピント合わせ', tags: ['なめらか', '印象的'], use: 'ヒーロー・画像の登場',
    layers: [{ effect: 'fade' }, { effect: 'blur', amount: 10, duration: 600 }, { effect: 'scale', amount: 0.96, duration: 600, easing: 'ease-out' }] },
  { id: 'flutter', name: 'ひらり', tags: ['遊び心', '流れる'], use: 'ステッカー・バッジ',
    layers: [{ effect: 'fade' }, { effect: 'slide-x', amount: 32 }, { effect: 'rotate', amount: -10, delay: 60 }] }
].map(p => ({ ...p, layers: sanitizeLayers(p.layers) }));

/* 全体の長さ（遅れを含む。ms） */
export const totalMs = layers => layers.reduce((m, l) => Math.max(m, l.delay + l.duration), 0);

/**
 * タイムラインの棒（全体の長さに対する割合 %）
 * @returns {{ effect: string, left: number, width: number }[]}
 */
export function timeline(layers) {
  const total = totalMs(layers) || 1;
  return layers.map(l => ({ effect: l.effect, left: (l.delay / total) * 100, width: (l.duration / total) * 100 }));
}

/**
 * layers から、実際に再生するトラックを作る。target はステージ内の 'card'
 * @returns {import('./types.js').CompareTrack[]}
 */
export function buildCustomTracks(layers) {
  return layers.flatMap(l => {
    const e = effectOf(l.effect);
    if (!e) return [];
    return [{
      target: 'card',
      keyframes: e.frames(l.amount),
      options: {
        fill: 'both', duration: l.duration, delay: l.delay, easing: l.easing,
        ...(e.property === 'transform' ? { composite: 'add' } : {})
      }
    }];
  });
}

/* ---- URL（#custom=効果,時間,遅れ,easing,量;効果,...）。壊れた値でも例外にしない ---- */
export const HASH_PREFIX = '#custom';

export function encodeLayers(layers) {
  const body = layers.map(l => [l.effect, l.duration, l.delay, easingKey(l.easing), l.amount ?? ''].join(',')).join(';');
  return body ? `${HASH_PREFIX}=${body}` : HASH_PREFIX;
}

/**
 * ハッシュから layers を作る。'#custom' だけ・壊れた値・空は null（呼び出し側が既定の組み合わせにする）
 * @returns {import('./types.js').CustomLayer[] | null}
 */
export function decodeLayers(hash) {
  if (!hash.startsWith(`${HASH_PREFIX}=`)) return null;
  let body;
  try { body = decodeURIComponent(hash.slice(HASH_PREFIX.length + 1)); } catch { return null; }
  const raws = body.split(';').filter(Boolean).map(part => {
    const [effect, duration, delay, easing, amount] = part.split(',');
    return {
      effect, duration: Number(duration), delay: Number(delay),
      easing: EASING_KEYS.get(easing),
      amount: amount === '' || amount == null ? NaN : Number(amount)
    };
  });
  const layers = sanitizeLayers(raws);
  return layers.length ? layers : null;
}

/* ---- コピー用の出力 ---- */
const js = value => (typeof value === 'string' ? `'${value}'` : String(value));
const obj = o => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${js(v)}`).join(', ')} }`;

export function toCustomWaapi(tracks) {
  if (!tracks.length) return '// 効果が選ばれていません';
  return [
    "// 同じ要素に重ねる。transform の効果は composite: 'add' で合成する",
    ...tracks.map(t => `el.animate(\n  [${t.keyframes.map(obj).join(', ')}],\n  ${obj(t.options)}\n);`)
  ].join('\n');
}

export function toCustomJson(layers, tracks) {
  return JSON.stringify({ layers, tracks }, null, 2);
}
