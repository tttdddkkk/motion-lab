import { expect, test } from 'vitest';
import { MOTIONS } from '../motions/motions.js';
import { TOAST_TIMING, LEAVE_EASE } from '../motions/tokens.js';
import { COMPARE_GROUPS, SECTIONS, PAIR_SECTION, buildTracks, formatParams, toWaapiJson } from '../motions/compare.js';

/* id からグループを取る。なければテストを失敗させる */
const groupOf = id => {
  const g = COMPARE_GROUPS.find(x => x.id === id);
  if (!g) throw new Error(`グループがない: ${id}`);
  return g;
};

const variants = COMPARE_GROUPS.flatMap(g => g.variants.map(v => ({ g, v })));
const TARGETS = new Set(['btn', 'ripple', 'incoming', 'outgoing', 'items', 'box', 'reveal', 'toast']);
/* アニメーションなし（mode: 'none'）は時間 0 で切り替える。時間とイージングの検査は別のテストで行う */
const isNone = v => v.mode === 'none';

test('バリアント ID は一意で、グループは必ずいずれかのセクションに属する', () => {
  const ids = variants.map(({ v }) => v.id);
  expect(new Set(ids).size).toBe(ids.length);
  const sections = new Set(SECTIONS.map(s => s.id));
  for (const g of COMPARE_GROUPS) expect(sections.has(g.section)).toBe(true);
});

test('A・B のグループには基準がちょうど1つ、C のグループには基準がない', () => {
  for (const g of COMPARE_GROUPS) {
    const bases = g.variants.filter(v => v.base).length;
    expect(bases, g.id).toBe(g.section === PAIR_SECTION ? 0 : 1);
  }
});

test('基準以外のバリアントには「基準から何が違うか」の説明がある', () => {
  for (const { v } of variants) if (!v.base) expect(v.diff.length, v.id).toBeGreaterThan(0);
});

test('すべてのバリアントに使いどころの一言がある', () => {
  for (const { v } of variants) expect(v.use?.length, v.id).toBeGreaterThan(0);
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
      if (!isNone(v)) expect(t.options.duration, v.id).toBeGreaterThan(0);
    }
    expect(tracks.some(t => t.main), v.id).toBe(true);
    expect(formatParams(params).length, v.id).toBeGreaterThan(0);
    JSON.parse(toWaapiJson(v, tracks));

    const adjusted = buildTracks(g, v, { duration: 777, easing: 'linear' });
    expect(adjusted.params.duration).toBe(777);
    const main = adjusted.tracks.find(t => t.main);
    if (!isNone(v)) expect(main.options.easing, v.id).toBe('linear');
  }
});

test('アニメーションなしは、すべてのトラックが時間 0 で、調整値（時間・イージング）を受けても動かない', () => {
  const nones = variants.filter(({ v }) => isNone(v));
  expect(nones.length).toBeGreaterThan(0);
  for (const { g, v } of nones) {
    for (const override of [{}, { duration: 777, easing: 'linear' }]) {
      for (const t of buildTracks(g, v, override).tracks) {
        expect(t.options.duration, v.id).toBe(0);
        expect(t.options.easing, v.id).toBeUndefined();
      }
    }
  }
});

test('通知の方向差は from だけが違う', () => {
  const g = groupOf('d-dir');
  const strip = v => ({ ...v.params, from: '' });
  for (const v of g.variants) expect(strip(v)).toEqual(strip(g.variants[0]));
  expect(new Set(g.variants.map(v => v.params.from)).size).toBe(g.variants.length);
});

test('速度差・時間差のバリアントは duration だけが違う', () => {
  for (const id of ['a-speed', 'b-time']) {
    const g = groupOf(id);
    const strip = v => ({ ...v.params, duration: 0 });
    for (const v of g.variants) expect(strip(v)).toEqual(strip(g.variants[0]));
  }
});

/* 通知モーションのトーストと、差分比較の通知（D）は、同じタイミングを共有する（tokens.js）。
   片方に値を直接書き戻すとずれるので、一致を確かめる */
test('通知の差分比較の基準は、トーストのモーションと同じタイミングを使う', () => {
  const toast = MOTIONS.find(m => m.id === 'toast');
  expect(toast?.ms).toBe(TOAST_TIMING.in);
  expect(toast?.easing).toBe(TOAST_TIMING.inEase);

  for (const id of ['d-dir', 'd-type']) {
    const base = groupOf(id).variants.find(v => v.base);
    expect(base?.params.duration, id).toBe(TOAST_TIMING.in);
    expect(base?.params.easing, id).toBe(TOAST_TIMING.inEase);
    expect(base?.params.hold, id).toBe(TOAST_TIMING.hold);
    expect(base?.params.out, id).toBe(TOAST_TIMING.out);
  }
});

test('通知の差分比較で、出るときのイージングは共有の値（LEAVE_EASE）を使う', () => {
  const g = groupOf('d-dir');
  const base = g.variants.find(v => v.base);
  if (!base) throw new Error('基準がない');
  const exit = buildTracks(g, base).tracks.find(t => !t.main);
  expect(exit?.options.easing).toBe(LEAVE_EASE);
});
