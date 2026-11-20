/* ============================================================
   カスタマイズ（効果を重ねて、自分の動きを作る）のデータとロジック（ADR 0023）
   - 効果（EFFECTS）を重ね、効果ごとに 時間・遅れ・イージング・量 を決める。重ねた結果が1つの動きになる
   - 表示する値・再生する動き・コピーするコードは、すべて同じ layers から作る（差分比較と同じ考え方）
   - 対象（SUBJECTS）に、動きの部品（EFFECTS）を重ねる。部品は複数の設定（params）を持つ。
     例: 揺れ = 方向・振れ幅・回数・減衰・質感。バウンス = 高さ・回数・減衰・つぶれ
   - 重ね方: transform と filter の効果は composite: 'add' で合成する（同じ要素の transform を取り合わない）。
     opacity は足し算にならないので、opacity を動かす効果（フェード・ブリンク）は同時に1つまで。同じ効果も1回まで
   - 弾み・揺れ・点滅のように1つの効果の中で動きが変わるものは、キーフレームごとにイージングを持つ（ownEasing）。
     その効果ではレイヤー全体のイージングを linear にして、選べないようにする
   DOM に依存しない。tests/custom.test.js で検査する。
   ============================================================ */
import { EASING_PRESETS, SPRING } from './compare.js';

export const DURATION_RANGE = { min: 50, max: 2000, step: 10 };
export const DELAY_RANGE = { min: 0, max: 2000, step: 10 };

/** 動かす対象。見た目は custom-ui.js の STAGE_HTML */
export const SUBJECTS = [
  { id: 'card', name: 'カード' },
  { id: 'sparkle', name: 'キラキラ' },
  { id: 'button', name: 'ボタン' }
];
export const DEFAULT_SUBJECT = 'card';
const isSubject = id => SUBJECTS.some(s => s.id === id);

const numParam = (key, label, unit, min, max, step, value) => ({ key, label, unit, min, max, step, value });
const selParam = (key, label, options, value = 0) => ({ key, label, options, value });

const round = (n, d = 4) => { const f = 10 ** d; return Math.round(n * f) / f; };
const SMOOTH = 'ease-in-out';

/* 弾み・揺れ・点滅の「質感」。キーフレームごとのイージングになる */
const FEEL_OPTIONS = ['なめらか', 'カクカク'];
const feelEasing = feel => (feel === 1 ? 'linear' : SMOOTH);

/** 揺れ: 方向ごとの transform */
const SHAKE_AXES = [
  { name: '横', fn: v => `translateX(${round(v, 2)}px)` },
  { name: '縦', fn: v => `translateY(${round(v, 2)}px)` },
  { name: '回転', fn: v => `rotate(${round(v, 2)}deg)` }
];

/** @type {import('./types.js').CustomEffect[]} */
export const EFFECTS = [
  {
    id: 'fade', name: 'フェード', feel: 'やわらかい', property: 'opacity',
    defaults: { duration: 400, delay: 0, easing: 'ease-out' }, params: [],
    frames: () => [{ opacity: 0 }, { opacity: 1 }]
  },
  {
    id: 'slide-y', name: '縦スライド', feel: '軽い・上品', property: 'transform',
    defaults: { duration: 500, delay: 0, easing: 'ease-out' },
    params: [numParam('distance', '距離（＋で下から）', 'px', -80, 80, 2, 24)],
    frames: p => [{ transform: `translateY(${p.distance}px)` }, { transform: 'translateY(0px)' }]
  },
  {
    id: 'slide-x', name: '横スライド', feel: '流れる', property: 'transform',
    defaults: { duration: 500, delay: 0, easing: 'ease-out' },
    params: [numParam('distance', '距離（＋で右から）', 'px', -80, 80, 2, 24)],
    frames: p => [{ transform: `translateX(${p.distance}px)` }, { transform: 'translateX(0px)' }]
  },
  {
    id: 'scale', name: '拡大縮小', feel: '弾む・ポップ', property: 'transform',
    defaults: { duration: 450, delay: 0, easing: SPRING },
    params: [numParam('from', '開始の大きさ', '倍', 0, 2, 0.02, 0.9)],
    frames: p => [{ transform: `scale(${p.from})` }, { transform: 'scale(1)' }]
  },
  {
    id: 'rotate', name: '回転', feel: 'くるっ・ひらり', property: 'transform',
    defaults: { duration: 600, delay: 0, easing: 'ease-out' },
    params: [numParam('angle', '開始の角度（360 で1回転）', '度', -720, 720, 5, 180)],
    frames: p => [{ transform: `rotate(${p.angle}deg)` }, { transform: 'rotate(0deg)' }]
  },
  {
    id: 'bounce', name: 'バウンス', feel: '弾む・軽快', property: 'transform', ownEasing: true,
    defaults: { duration: 900, delay: 0, easing: 'linear' },
    params: [
      numParam('height', '最初の高さ', 'px', 4, 80, 2, 36),
      numParam('count', '弾む回数', '回', 1, 6, 1, 3),
      numParam('decay', '減衰（弾むたびに低くなる割合）', '%', 0, 90, 5, 45),
      numParam('squash', '着地のつぶれ', '%', 0, 40, 5, 15)
    ],
    /* 着地ごとに高さが (1 - 減衰) 倍になる。1回の長さは高さの平方根に比例（低いほど短い） */
    frames(p) {
      const keep = 1 - p.decay / 100;
      const peaks = Array.from({ length: p.count }, (_, k) => p.height * keep ** k);
      const weights = peaks.map(Math.sqrt);
      const sum = weights.reduce((a, b) => a + b, 0) || 1;
      const rest = 'translateY(0px) scale(1, 1)';
      const land = `translateY(0px) scale(${1 + p.squash / 100}, ${1 - p.squash / 100})`;
      /** @type {Keyframe[]} */
      const frames = [{ offset: 0, transform: rest, easing: 'ease-out' }];
      let at = 0;
      peaks.forEach((peak, k) => {
        const w = weights[k] / sum;
        frames.push({ offset: round(at + w / 2), transform: `translateY(${-round(peak, 2)}px) scale(1, 1)`, easing: 'ease-in' });
        at += w;
        const last = k === peaks.length - 1;
        frames.push(last ? { offset: 1, transform: rest } : { offset: round(at), transform: land, easing: 'ease-out' });
      });
      return frames;
    }
  },
  {
    id: 'shake', name: '揺れ', feel: 'ぶるぶる・注意', property: 'transform', ownEasing: true,
    defaults: { duration: 600, delay: 0, easing: 'linear' },
    params: [
      selParam('axis', '方向', SHAKE_AXES.map(a => a.name)),
      numParam('amplitude', '振れ幅（横・縦は px、回転は度）', '', 1, 40, 1, 8),
      numParam('count', '揺れる回数', '回', 1, 12, 1, 6),
      numParam('decay', '減衰（揺れるたびに小さくなる割合）', '%', 0, 100, 5, 40),
      selParam('feel', '質感', FEEL_OPTIONS)
    ],
    /* 左右（上下）に交互に、振れ幅を減衰させながら count 回揺れて、元に戻る */
    frames(p) {
      const fn = SHAKE_AXES[p.axis].fn;
      const keep = 1 - p.decay / 100;
      const easing = feelEasing(p.feel);
      /** @type {Keyframe[]} */
      const frames = [{ offset: 0, transform: fn(0), easing }];
      for (let k = 0; k < p.count; k++) {
        const sign = k % 2 === 0 ? 1 : -1;
        frames.push({ offset: round((k + 1) / (p.count + 1)), transform: fn(sign * p.amplitude * keep ** k), easing });
      }
      frames.push({ offset: 1, transform: fn(0) });
      return frames;
    }
  },
  {
    id: 'blink', name: 'ブリンク', feel: 'ちかちか・きらっ', property: 'opacity', ownEasing: true,
    defaults: { duration: 600, delay: 0, easing: 'linear' },
    params: [
      numParam('count', '点滅の回数', '回', 1, 10, 1, 3),
      numParam('min', '暗いときの明るさ', '%', 0, 90, 5, 20),
      selParam('feel', '質感', ['なめらか', 'パッと切り替え'])
    ],
    frames(p) {
      const easing = p.feel === 1 ? 'step-end' : SMOOTH;
      const total = p.count * 2;
      return Array.from({ length: total + 1 }, (_, k) => ({
        offset: round(k / total), opacity: k % 2 === 0 ? 1 : p.min / 100, ...(k < total ? { easing } : {})
      }));
    }
  },
  {
    id: 'hue', name: '色変化', feel: 'カラフル・虹色', property: 'filter',
    defaults: { duration: 900, delay: 0, easing: 'ease-in-out' },
    params: [numParam('angle', '開始の色相のずれ（360 で一周）', '度', -360, 360, 10, 180)],
    frames: p => [{ filter: `hue-rotate(${p.angle}deg)` }, { filter: 'hue-rotate(0deg)' }]
  },
  {
    id: 'blur', name: 'ぼかし', feel: 'ピントが合う', property: 'filter',
    defaults: { duration: 400, delay: 0, easing: 'ease-out' },
    params: [numParam('radius', '開始のぼかし', 'px', 0, 20, 1, 8)],
    frames: p => [{ filter: `blur(${p.radius}px)` }, { filter: 'blur(0px)' }]
  }
];

const EFFECT_BY_ID = new Map(EFFECTS.map(e => [e.id, e]));
export const effectOf = id => EFFECT_BY_ID.get(id);

/* easing は調整 UI と同じ候補だけ使う。URL では 'spring' と書く（cubic-bezier の括弧とカンマを避けるため） */
const EASING_KEYS = new Map(EASING_PRESETS.map(([, value]) => [value === SPRING ? 'spring' : value, value]));
const easingKey = value => [...EASING_KEYS].find(([, v]) => v === value)?.[0] ?? 'ease-out';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const snap = (n, range) => clamp(Math.round(n / range.step) * range.step, range.min, range.max);

/* パラメータ1つの値を、範囲（選択肢）に収める */
function fitParam(spec, raw) {
  const v = Number.isFinite(raw) ? /** @type {number} */ (raw) : spec.value;
  if (spec.options) return clamp(Math.round(v), 0, spec.options.length - 1);
  return round(clamp(Math.round(v / spec.step) * spec.step, spec.min, spec.max), 4);
}

/**
 * 値を範囲に収めて、正しい layer にする。未知の効果なら null
 * @param {{ effect: string, duration?: number, delay?: number, easing?: string, params?: Record<string, number> }} raw
 * @returns {import('./types.js').CustomLayer | null}
 */
export function makeLayer(raw) {
  const effect = effectOf(raw.effect);
  if (!effect) return null;
  const d = effect.defaults;
  const num = (v, fallback) => (Number.isFinite(v) ? /** @type {number} */ (v) : fallback);
  return {
    effect: effect.id,
    duration: snap(num(raw.duration, d.duration), DURATION_RANGE),
    delay: snap(num(raw.delay, d.delay), DELAY_RANGE),
    easing: [...EASING_KEYS.values()].includes(/** @type {string} */ (raw.easing)) ? /** @type {string} */ (raw.easing) : d.easing,
    params: Object.fromEntries(effect.params.map(spec => [spec.key, fitParam(spec, raw.params?.[spec.key])]))
  };
}

/* 同じ効果は1回まで。opacity を動かす効果も1つまで。重複と未知の効果を除く */
export function sanitizeLayers(list) {
  const seen = new Set();
  let opacityUsed = false;
  return list.flatMap(raw => {
    const layer = raw && makeLayer(raw);
    if (!layer || seen.has(layer.effect)) return [];
    const isOpacity = effectOf(layer.effect)?.property === 'opacity';
    if (isOpacity && opacityUsed) return [];
    seen.add(layer.effect);
    if (isOpacity) opacityUsed = true;
    return [layer];
  });
}

/** 追加できる効果（使用済み・opacity が競合するものを除く） */
export const addableEffects = layers => EFFECTS.filter(e => sanitizeLayers([...layers, { effect: e.id }]).length > layers.length);

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
    layers: [{ effect: 'fade' }, { effect: 'slide-y', duration: 600 }] },
  { id: 'pop', name: 'ポップ', tags: ['弾む', '軽快'], use: '完了・成功の強調',
    layers: [{ effect: 'fade', duration: 200 }, { effect: 'scale', params: { from: 0.8 } }] },
  { id: 'focus', name: 'ピント合わせ', tags: ['なめらか', '印象的'], use: 'ヒーロー・画像の登場',
    layers: [{ effect: 'fade' }, { effect: 'blur', duration: 600, params: { radius: 10 } }, { effect: 'scale', duration: 600, easing: 'ease-out', params: { from: 0.96 } }] },
  { id: 'twinkle', name: 'きらっ', tags: ['きらきら', '軽快'], use: '新着・お気に入りの強調',
    layers: [{ effect: 'scale', duration: 500, params: { from: 0.3 } }, { effect: 'rotate', duration: 700, params: { angle: 180 } }, { effect: 'blink', delay: 500, duration: 700, params: { count: 3, min: 20 } }] },
  { id: 'rainbow', name: '虹色キラキラ', tags: ['カラフル', '祝福'], use: 'レベルアップ・達成',
    layers: [{ effect: 'rotate', duration: 1200, params: { angle: 360 } }, { effect: 'hue', duration: 1200, params: { angle: 360 } }, { effect: 'bounce', duration: 800, params: { height: 20, count: 2 } }] },
  { id: 'boing', name: 'ぽよん', tags: ['弾む', 'ゆるい'], use: '押せることの示唆',
    layers: [{ effect: 'bounce', duration: 900, params: { height: 30, count: 3, decay: 45, squash: 20 } }] },
  { id: 'wobble', name: 'ぶるぶる', tags: ['注意', '否定'], use: '入力エラー・拒否',
    layers: [{ effect: 'shake', duration: 500, params: { axis: 0, amplitude: 10, count: 6, decay: 40 } }] }
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
 * layers から、実際に再生するトラックを作る。target はステージ内の 'subject'
 * @returns {import('./types.js').CompareTrack[]}
 */
export function buildCustomTracks(layers) {
  return layers.flatMap(l => {
    const e = effectOf(l.effect);
    if (!e) return [];
    return [{
      target: 'subject',
      keyframes: e.frames(l.params),
      options: {
        fill: 'both', duration: l.duration, delay: l.delay,
        easing: e.ownEasing ? 'linear' : l.easing,
        ...(e.property === 'opacity' ? {} : { composite: 'add' })
      }
    }];
  });
}

/* ---- URL（#custom=@対象;効果,時間,遅れ,easing,キー:値|キー:値;…）。壊れた値でも例外にしない ---- */
export const HASH_PREFIX = '#custom';

export function encodeLayers(layers, subject = DEFAULT_SUBJECT) {
  const parts = [`@${subject}`, ...layers.map(l => [
    l.effect, l.duration, l.delay, easingKey(l.easing),
    Object.entries(l.params).map(([k, v]) => `${k}:${v}`).join('|')
  ].join(','))];
  return `${HASH_PREFIX}=${parts.join(';')}`;
}

/**
 * ハッシュから対象と layers を作る。'#custom' だけ・壊れた値・効果が全部無効なら null（呼び出し側が既定の組み合わせにする）。
 * 効果の指定がなく対象だけなら、layers は空（全部消した状態を復元する）
 * @returns {{ subject: string, layers: import('./types.js').CustomLayer[] } | null}
 */
export function decodeLayers(hash) {
  if (!hash.startsWith(`${HASH_PREFIX}=`)) return null;
  let body;
  try { body = decodeURIComponent(hash.slice(HASH_PREFIX.length + 1)); } catch { return null; }
  const parts = body.split(';').filter(Boolean);
  const subjectPart = parts.find(x => x.startsWith('@'))?.slice(1) ?? '';
  const subject = isSubject(subjectPart) ? subjectPart : DEFAULT_SUBJECT;
  const raws = parts.filter(x => !x.startsWith('@')).map(part => {
    const [effect, duration, delay, easing, params = ''] = part.split(',');
    return {
      effect, duration: Number(duration), delay: Number(delay),
      easing: EASING_KEYS.get(easing),
      params: Object.fromEntries(params.split('|').filter(Boolean).map(kv => {
        const [k, v] = kv.split(':');
        return [k, v === '' || v == null ? NaN : Number(v)];
      }))
    };
  });
  if (!parts.length || (raws.length === 0 && !subjectPart)) return null;
  const layers = sanitizeLayers(raws);
  return layers.length || raws.length === 0 ? { subject, layers } : null;
}

/* ---- コピー用の出力 ---- */
const js = value => (typeof value === 'string' ? `'${value}'` : String(value));
const obj = o => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${js(v)}`).join(', ')} }`;

/* キーフレームが多いものは、1行に1つずつ書く */
const frames = list => (list.length > 3 ? `[\n${list.map(k => `    ${obj(k)}`).join(',\n')}\n  ]` : `[${list.map(obj).join(', ')}]`);

export function toCustomWaapi(tracks) {
  if (!tracks.length) return '// 効果が選ばれていません';
  return [
    "// 同じ要素に重ねる。transform と filter の効果は composite: 'add' で合成する",
    ...tracks.map(t => `el.animate(\n  ${frames(t.keyframes)},\n  ${obj(t.options)}\n);`)
  ].join('\n');
}

export function toCustomJson(layers, tracks, subject = DEFAULT_SUBJECT) {
  return JSON.stringify({ subject, layers, tracks }, null, 2);
}
