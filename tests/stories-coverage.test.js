import { expect, test } from 'vitest';
import { MOTIONS } from '../motions/motions.js';
import * as stories from '../stories/motions.stories.js';

test('MOTIONS のすべての id にストーリーがある', () => {
  const storyIds = Object.entries(stories)
    .filter(([key]) => key !== 'default')
    .map(([, s]) => s.parameters.motionId);
  expect(storyIds.sort()).toEqual(MOTIONS.map(m => m.id).sort());
});
