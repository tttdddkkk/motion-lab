import { expect, test } from 'vitest';
import {
  EFFECTS, PRESETS, SUBJECTS, effectOf, makeLayer, sanitizeLayers, addableEffects, moveLayer, totalMs, timeline,
  buildCustomTracks, encodeLayers, decodeLayers, toCustomWaapi, toCustomJson
} from '../motions/custom.js';

const layer = raw => {
  const l = makeLayer(raw);
  if (!l) throw new Error(`layer を作れない: ${raw.effect}`);
  return l;
};
/** 効果 id の既定値でキーフレームを作る */
const framesOf = (id, params = {}) => {
  const e = effectOf(id);
  if (!e) throw new Error(`効果がない: ${id}`);
  return e.frames(layer({ effect: id, params }).params);
};
/** transform のうち、元の見た目（何も変えない値）だけでできている文字列か */
const isRest = (property, value) => {
  const rest = { transform: /^(?:(?:translate[XY]\(0px\)|rotate\(0deg\)|scale\(1(?:, 1)?\))\s?)+$/, filter: /^(?:(?:blur\(0px\)|hue-rotate\(0deg\))\s?)+$/ };
  return property === 'opacity' ? value === 1 : rest[property].test(String(value));
};
const translate = k => Number(/translate[XY]\((-?[\d.]+)px\)/.exec(String(k.transform))?.[1]);

test('効果の ID は一意で、設定項目は key が一意で既定値が範囲内にある', () => {
  expect(new Set(EFFECTS.map(e => e.id)).size).toBe(EFFECTS.length);
  for (const e of EFFECTS) {
    expect(new Set(e.params.map(p => p.key)).size, e.id).toBe(e.params.length);
    for (const p of e.params) {
      if (p.options) expect(p.value, `${e.id}.${p.key}`).toBeLessThan(p.options.length);
      else { expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
    }
  }
});

test('すべての効果は、どの設定でも、最後が元の見た目に戻り、キーフレームの offset が昇順で 0〜1 に収まる', () => {
  for (const e of EFFECTS) {
    // 既定値に加え、各設定項目を最小・最大にしたものも調べる
    const variants = [{}, ...e.params.flatMap(p => (p.options
      ? p.options.map((_, i) => ({ [p.key]: i }))
      : [{ [p.key]: p.min }, { [p.key]: p.max }]))];
    for (const params of variants) {
      const frames = framesOf(e.id, params);
      const label = `${e.id} ${JSON.stringify(params)}`;
      expect(frames.length, label).toBeGreaterThanOrEqual(2);
      expect(isRest(e.property, frames[frames.length - 1][e.property]), label).toBe(true);
      const offsets = frames.map(f => f.offset).filter(o => o != null);
      expect(offsets, label).toEqual([...offsets].sort((a, b) => a - b));
      if (offsets.length) { expect(offsets[0], label).toBe(0); expect(offsets[offsets.length - 1], label).toBe(1); }
      for (const f of frames) expect(Object.keys(f).filter(k => k === e.property).length, label).toBe(1);
    }
  }
});

test('バウンス: 回数どおりに弾み、減衰で低くなり、着地でつぶれる', () => {
  const peaks = frames => frames.filter(f => translate(f) < 0).map(f => -translate(f));
  const three = framesOf('bounce', { height: 40, count: 3, decay: 50, squash: 20 });
  expect(peaks(three)).toEqual([40, 20, 10]);
  expect(peaks(framesOf('bounce', { count: 1 }))).toHaveLength(1);
  expect(peaks(framesOf('bounce', { height: 30, count: 3, decay: 0 }))).toEqual([30, 30, 30]);
  expect(three.filter(f => String(f.transform).includes('scale(1.2, 0.8)'))).toHaveLength(2);   // 最後の着地は元の形
  expect(framesOf('bounce', { squash: 0 }).every(f => /scale\(1, 1\)/.test(String(f.transform)))).toBe(true);
  // 低い弾みほど短い（最初の1回が一番長い）
  const o = three.map(f => f.offset ?? 0);
  expect(o[2] - o[0]).toBeGreaterThan(o[4] - o[2]);
});

test('揺れ: 方向・回数・減衰・質感が、キーフレームに反映される', () => {
  const x = framesOf('shake', { axis: 0, amplitude: 10, count: 4, decay: 50 });
  expect(x.slice(1, -1).map(translate)).toEqual([10, -5, 2.5, -1.25]);   // 交互に、半分ずつ小さく
  expect(x).toHaveLength(4 + 2);
  expect(String(framesOf('shake', { axis: 1 })[1].transform)).toMatch(/^translateY/);
  expect(String(framesOf('shake', { axis: 2 })[1].transform)).toMatch(/^rotate\(.*deg\)$/);
  expect(framesOf('shake', { feel: 0 })[1].easing).toBe('ease-in-out');
  expect(framesOf('shake', { feel: 1 })[1].easing).toBe('linear');
  expect(framesOf('shake', { count: 3, decay: 0, amplitude: 6 }).slice(1, -1).map(translate)).toEqual([6, -6, 6]);
});

test('ブリンク: 回数分だけ暗くなり、質感で切り替え方が変わる', () => {
  const frames = framesOf('blink', { count: 3, min: 20 });
  expect(frames).toHaveLength(7);
  expect(frames.filter(f => f.opacity === 0.2)).toHaveLength(3);
  expect(frames[0].opacity).toBe(1);
  expect(framesOf('blink', { feel: 1 })[1].easing).toBe('step-end');
});

test('色変化・回転・ぼかしは、設定した量から元に戻る', () => {
  expect(framesOf('hue', { angle: 360 })[0].filter).toBe('hue-rotate(360deg)');
  expect(framesOf('rotate', { angle: -90 })[0].transform).toBe('rotate(-90deg)');
  expect(framesOf('blur', { radius: 12 })[0].filter).toBe('blur(12px)');
});

test('出発点は、ID・印象ワード・使いどころを持ち、同じ効果を2回使わず、opacity を競合させない', () => {
  expect(new Set(PRESETS.map(p => p.id)).size).toBe(PRESETS.length);
  for (const p of PRESETS) {
    expect(p.tags.length, p.id).toBeGreaterThan(0);
    expect(p.use.length, p.id).toBeGreaterThan(0);
    expect(p.layers.length, p.id).toBeGreaterThan(0);
    // sanitizeLayers を通しても変わらない = 重複も競合もない（定義の書き間違いで効果が黙って消えていない）
    expect(sanitizeLayers(p.layers), p.id).toEqual(p.layers);
  }
});

test('出発点は、どの対象に掛けても動く（対象に依存しない）', () => {
  for (const p of PRESETS) for (const sub of SUBJECTS) {
    const tracks = buildCustomTracks(p.layers);
    expect(tracks.length, `${p.id} ${sub.id}`).toBe(p.layers.length);
    for (const t of tracks) expect(t.target).toBe('subject');   // 対象によらず、動かす要素は data-t="subject"
  }
});

test('makeLayer は範囲外・不正な値を収め、未知の効果は作らない', () => {
  expect(makeLayer({ effect: 'nope' })).toBeNull();
  const l = layer({ effect: 'scale', duration: 99999, delay: -5, easing: 'bogus', params: { from: 99 } });
  expect(l).toMatchObject({ duration: 2000, delay: 0, easing: effectOf('scale')?.defaults.easing, params: { from: 2 } });
  expect(layer({ effect: 'fade', duration: NaN }).duration).toBe(400);
  expect(layer({ effect: 'fade' }).params).toEqual({});
  const shake = layer({ effect: 'shake', params: { axis: 9, count: 99.4, amplitude: NaN, decay: -3, unknown: 1 } });
  expect(shake.params).toEqual({ axis: 2, amplitude: 8, count: 12, decay: 0, feel: 0 });   // 選択肢は範囲内の番号、未知のキーは捨てる
});

test('sanitizeLayers は重複・未知の効果・opacity の競合（フェードとブリンク）を除く', () => {
  const out = sanitizeLayers([{ effect: 'fade' }, { effect: 'fade', duration: 900 }, { effect: 'zzz' }, null, { effect: 'blur' }, { effect: 'blink' }]);
  expect(out.map(l => l.effect)).toEqual(['fade', 'blur']);
  expect(out[0].duration).toBe(400);   // 最初のものを残す
});

test('追加できる効果は、使用済みと opacity の競合を除く。並べ替え・全体の長さ・タイムライン', () => {
  const layers = [layer({ effect: 'blink' }), layer({ effect: 'rotate', delay: 100, duration: 500 })];
  const ids = addableEffects(layers).map(e => e.id);
  expect(ids).not.toContain('blink');
  expect(ids).not.toContain('fade');   // blink と同じ opacity
  expect(ids).toContain('shake');
  expect(addableEffects([])).toHaveLength(EFFECTS.length);
  expect(moveLayer(layers, 0, 1).map(l => l.effect)).toEqual(['rotate', 'blink']);
  expect(moveLayer(layers, 0, -1).map(l => l.effect)).toEqual(['blink', 'rotate']);   // 範囲外は変えない
  expect(totalMs(layers)).toBe(600);
  const bars = timeline(layers);
  expect(bars[1].left + bars[1].width).toBeCloseTo(100);
  expect(timeline([])).toEqual([]);
});

test('トラックは layers の値を反映する。opacity 以外は composite: add で重ね、ownEasing の効果は linear にする', () => {
  const layers = [
    layer({ effect: 'fade', duration: 300, delay: 20 }),
    layer({ effect: 'slide-y', easing: 'linear', params: { distance: -10 } }),
    layer({ effect: 'hue' }),
    layer({ effect: 'shake', easing: 'cubic-bezier(.34, 1.56, .64, 1)' })
  ];
  const tracks = buildCustomTracks(layers);
  expect(tracks).toHaveLength(4);
  expect(tracks[0].options).toMatchObject({ duration: 300, delay: 20, fill: 'both' });
  expect(tracks[0].options.composite).toBeUndefined();   // opacity は置き換え
  expect(tracks[1].options).toMatchObject({ composite: 'add', easing: 'linear' });
  expect(tracks[1].keyframes[0]).toEqual({ transform: 'translateY(-10px)' });
  expect(tracks[2].options.composite).toBe('add');   // filter も重ねる（ぼかしと色変化を両立）
  expect(tracks[3].options.easing).toBe('linear');   // 揺れは自分でイージングを持つ
  for (const t of tracks) expect(t.target).toBe('subject');
  expect(buildCustomTracks([])).toEqual([]);
});

test('URL の書き出しと読み込みで、同じ対象と layers に戻る', () => {
  for (const p of PRESETS) expect(decodeLayers(encodeLayers(p.layers, 'sparkle')), p.id).toEqual({ subject: 'sparkle', layers: p.layers });
  expect(encodeLayers(PRESETS[0].layers)).not.toMatch(/[()]/);   // cubic-bezier の括弧を URL に出さない
  expect(decodeLayers(encodeLayers([], 'sparkle'))).toEqual({ subject: 'sparkle', layers: [] });   // 全部消した状態
  expect(encodeLayers(PRESETS[4].layers, 'sparkle')).toContain('@sparkle;');
});

test('壊れた URL は例外にせず、無効な部分を捨てる（効果が全部無効なら null）', () => {
  expect(decodeLayers('#custom')).toBeNull();
  expect(decodeLayers('#custom=')).toBeNull();
  expect(decodeLayers('#custom=%E0%A4%A')).toBeNull();   // 壊れた % エスケープ
  expect(decodeLayers('#custom=zzz,1,2,3,;')).toBeNull();
  expect(decodeLayers('#other=fade,400,0,ease-out,')).toBeNull();
  const out = decodeLayers('#custom=@unknown;fade,99999,abc,bogus,;fade,1,1,linear,;shake,500,0,x,count:99|axis:|bad|decay:;nope,1,1,1,1;blink,1,1,1,');
  expect(out?.subject).toBe('card');   // 未知の対象は既定に戻す
  expect(out?.layers.map(l => l.effect)).toEqual(['fade', 'shake']);   // 重複・未知・競合（blink）を捨てる
  expect(out?.layers[0]).toMatchObject({ duration: 2000, delay: 0, easing: 'ease-out' });
  expect(out?.layers[1].params).toMatchObject({ count: 12, axis: 0, decay: 40 });
});

test('コピー用の出力は、トラックと同じ値を含み、JSON は読み戻せる', () => {
  const p = PRESETS.find(x => x.id === 'wobble');
  if (!p) throw new Error('wobble がない');
  const tracks = buildCustomTracks(p.layers);
  const code = toCustomWaapi(tracks);
  expect(code.match(/el\.animate\(/g)).toHaveLength(tracks.length);
  expect(code).toContain("composite: 'add'");
  expect(code).toContain('duration: 500');
  expect(code).toContain('transform: \'translateX(10px)\'');   // キーフレームが多いときも、値が欠けない
  const json = JSON.parse(toCustomJson(p.layers, tracks, 'button'));
  expect(json).toMatchObject({ subject: 'button', layers: p.layers });
  expect(json.tracks).toHaveLength(tracks.length);
  expect(toCustomWaapi([])).toContain('選ばれていません');
});
