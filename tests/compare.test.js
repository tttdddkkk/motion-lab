import { expect, test } from 'vitest';
import { COMPARE_GROUPS, SECTIONS, buildTracks, formatParams, toWaapiJson } from '../motions/compare.js';

const variants = COMPARE_GROUPS.flatMap(g => g.variants.map(v => ({ g, v })));
const TARGETS = new Set(['btn', 'ripple', 'incoming', 'outgoing', 'items', 'box', 'reveal']);

test('バリアント ID は一意で、グループは必ずいずれかのセクションに属する', () => {
  const ids = variants.map(({ v }) => v.id);
  expect(new Set(ids).size).toBe(ids.length);
  const sections = new Set(SECTIONS.map(s => s.id));
  for (const g of COMPARE_GROUPS) expect(sections.has(g.section)).toBe(true);
});

test('A・B のグループには基準がちょうど1つ、C のグループには基準がない', () => {
  for (const g of COMPARE_GROUPS) {
    const bases = g.variants.filter(v => v.base).length;
    expect(bases, g.id).toBe(g.section === 'C' ? 0 : 1);
  }
});

test('基準以外のバリアントには「基準から何が違うか」の説明がある', () => {
  for (const { v } of variants) if (!v.base) expect(v.diff.length, v.id).toBeGreaterThan(0);
});

test('A と B に「微差」の組が1つずつある', () => {
  for (const sec of ['A', 'B']) {
    const n = variants.filter(({ g, v }) => g.section === sec && v.subtle).length;
    expect(n, sec).toBe(1);
  }
});

test('すべてのバリアントが有効なトラックを作れ、調整値が反映される', () => {
  for (const { g, v } of variants) {
    expect(v.tags.length, v.id).toBeGreaterThan(0);
    const { params, tracks } = buildTracks(g, v);
    expect(tracks.length, v.id).toBeGreaterThan(0);
    for (const t of tracks) {
      expect(TARGETS.has(t.target), `${v.id} ${t.target}`).toBe(true);
      expect(t.keyframes.length, v.id).toBeGreaterThanOrEqual(2);
      expect(t.options.duration, v.id).toBeGreaterThan(0);
    }
    expect(tracks.some(t => t.main), v.id).toBe(true);
    expect(formatParams(params).length, v.id).toBeGreaterThan(0);
    JSON.parse(toWaapiJson(v, tracks));

    const adjusted = buildTracks(g, v, { duration: 777, easing: 'linear' });
    expect(adjusted.params.duration).toBe(777);
    const main = adjusted.tracks.find(t => t.main);
    expect(main.options.easing, v.id).toBe('linear');
  }
});

test('速度差・時間差のバリアントは duration だけが違う', () => {
  for (const id of ['a-speed', 'b-time']) {
    const g = COMPARE_GROUPS.find(x => x.id === id);
    const strip = v => ({ ...v.params, duration: 0 });
    for (const v of g.variants) expect(strip(v)).toEqual(strip(g.variants[0]));
  }
});
