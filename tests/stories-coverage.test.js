import { expect, test } from 'vitest';
import { MOTIONS } from '../motions/motions.js';
import * as stories from '../stories/motions.stories.js';

test('MOTIONS のすべての id にストーリーがある', () => {
  const storyIds = Object.entries(stories)
    .filter(([key]) => key !== 'default')
    .map(([, s]) => s.parameters.motionId);
  expect(storyIds.sort()).toEqual(MOTIONS.map(m => m.id).sort());
});

/* 「動きを減らす」版の表示用コードでは transform と clip-path を使わない。
   setup の実装はストーリーのテストで検査するが、表示用の文字列は検査されないため、ここで確かめる。
   コメントと、動きを打ち消す「transform: none」は検査から除く */
test('MOTIONS の code.reduced は transform と clip-path を使わない', () => {
  for (const m of MOTIONS) {
    const used = m.code.reduced
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(transform|clip-path)\s*:\s*none/g, '');
    expect(used, m.id).not.toMatch(/transform|clip-path/);
  }
});
