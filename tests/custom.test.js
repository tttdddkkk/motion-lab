import { expect, test } from 'vitest';
import {
  EFFECTS, PRESETS, makeLayer, sanitizeLayers, addableEffects, moveLayer, totalMs, timeline,
  buildCustomTracks, encodeLayers, decodeLayers, toCustomWaapi, toCustomJson
} from '../motions/custom.js';

const layer = raw => {
  const l = makeLayer(raw);
  if (!l) throw new Error(`layer を作れない: ${raw.effect}`);
  return l;
};

test('効果の ID は一意で、開始と置き場所の2つのキーフレームを作り、置き場所は元の見た目（何も変えない値）になる', () => {
  expect(new Set(EFFECTS.map(e => e.id)).size).toBe(EFFECTS.length);
  const rest = { opacity: 1, transform: /^(translate[XY]\(0px\)|scale\(1\)|rotate\(0deg\))$/, filter: 'blur(0px)' };
  for (const e of EFFECTS) {
    const frames = e.frames(e.param?.value);
    expect(frames, e.id).toHaveLength(2);
    const end = frames[1][e.property];
    const expected = rest[e.property];
    if (expected instanceof RegExp) expect(String(end), e.id).toMatch(expected);
    else expect(end, e.id).toBe(expected);
  }
});

test('出発点の組み合わせは、ID・印象ワード・使いどころを持ち、同じ効果を2回使わない', () => {
  expect(new Set(PRESETS.map(p => p.id)).size).toBe(PRESETS.length);
  for (const p of PRESETS) {
    expect(p.tags.length, p.id).toBeGreaterThan(0);
    expect(p.use.length, p.id).toBeGreaterThan(0);
    expect(p.layers.length, p.id).toBeGreaterThan(0);
    expect(new Set(p.layers.map(l => l.effect)).size, p.id).toBe(p.layers.length);
  }
});

test('makeLayer は範囲外・不正な値を収め、未知の効果は作らない', () => {
  expect(makeLayer({ effect: 'nope' })).toBeNull();
  const l = layer({ effect: 'scale', duration: 99999, delay: -5, easing: 'bogus', amount: 99 });
  expect(l).toMatchObject({ duration: 1500, delay: 0, easing: EFFECTS.find(e => e.id === 'scale')?.defaults.easing, amount: 1.5 });
  expect(layer({ effect: 'fade', duration: NaN }).duration).toBe(400);
  expect(layer({ effect: 'fade' }).amount).toBeUndefined();   // 量のない効果は amount を持たない
});

test('sanitizeLayers は重複と未知の効果を除く', () => {
  const out = sanitizeLayers([{ effect: 'fade' }, { effect: 'fade', duration: 900 }, { effect: 'zzz' }, null, { effect: 'blur' }]);
  expect(out.map(l => l.effect)).toEqual(['fade', 'blur']);
  expect(out[0].duration).toBe(400);   // 最初のものを残す
});

test('トラックは layers の値を反映し、transform の効果だけ composite: add で重ねる', () => {
  const layers = [layer({ effect: 'fade', duration: 300, delay: 20 }), layer({ effect: 'slide-y', amount: -10, easing: 'linear' }), layer({ effect: 'blur' })];
  const tracks = buildCustomTracks(layers);
  expect(tracks).toHaveLength(3);
  expect(tracks[0].options).toMatchObject({ duration: 300, delay: 20, fill: 'both' });
  expect(tracks[0].options.composite).toBeUndefined();
  expect(tracks[1].options).toMatchObject({ composite: 'add', easing: 'linear' });
  expect(tracks[1].keyframes[0]).toEqual({ transform: 'translateY(-10px)' });
  expect(tracks[2].options.composite).toBeUndefined();   // filter は置き換え
  for (const t of tracks) expect(t.target).toBe('card');
  expect(buildCustomTracks([])).toEqual([]);
});

test('追加できる効果・並べ替え・全体の長さ・タイムライン', () => {
  const layers = [layer({ effect: 'fade' }), layer({ effect: 'rotate', delay: 100, duration: 500 })];
  expect(addableEffects(layers).map(e => e.id)).not.toContain('fade');
  expect(addableEffects(layers)).toHaveLength(EFFECTS.length - 2);
  expect(moveLayer(layers, 0, 1).map(l => l.effect)).toEqual(['rotate', 'fade']);
  expect(moveLayer(layers, 0, -1).map(l => l.effect)).toEqual(['fade', 'rotate']);   // 範囲外は変えない
  expect(totalMs(layers)).toBe(600);
  const bars = timeline(layers);
  expect(bars[1].left).toBeCloseTo(100 / 600 * 100);
  expect(bars[1].left + bars[1].width).toBeCloseTo(100);
  expect(timeline([])).toEqual([]);
});

test('URL の書き出しと読み込みで、同じ layers に戻る。cubic-bezier の easing も崩れない', () => {
  for (const p of PRESETS) expect(decodeLayers(encodeLayers(p.layers)), p.id).toEqual(p.layers);
  expect(encodeLayers([])).toBe('#custom');
  expect(encodeLayers(PRESETS[0].layers)).not.toMatch(/[()]/);
});

test('壊れた URL は例外にせず、無効な部分を捨てる（全部無効なら null）', () => {
  expect(decodeLayers('#custom')).toBeNull();
  expect(decodeLayers('#custom=')).toBeNull();
  expect(decodeLayers('#custom=%E0%A4%A')).toBeNull();   // 壊れた % エスケープ
  expect(decodeLayers('#custom=zzz,1,2,3,4;')).toBeNull();
  expect(decodeLayers('#other=fade,400,0,ease-out,')).toBeNull();
  const out = decodeLayers('#custom=fade,99999,abc,bogus,;fade,1,1,linear,;slide-y,500,0,ease-out,9999;nope,1,1,1,1');
  expect(out?.map(l => l.effect)).toEqual(['fade', 'slide-y']);
  expect(out?.[0]).toMatchObject({ duration: 1500, delay: 0, easing: 'ease-out' });
  expect(out?.[1].amount).toBe(80);
});

test('コピー用の出力は、トラックと同じ値を含み、JSON は読み戻せる', () => {
  const layers = PRESETS[0].layers;
  const tracks = buildCustomTracks(layers);
  const code = toCustomWaapi(tracks);
  expect(code.match(/el\.animate\(/g)).toHaveLength(tracks.length);
  expect(code).toContain("composite: 'add'");
  expect(code).toContain(`duration: ${layers[1].duration}`);
  expect(JSON.parse(toCustomJson(layers, tracks)).layers).toEqual(layers);
  expect(toCustomWaapi([])).toContain('選ばれていません');
});
