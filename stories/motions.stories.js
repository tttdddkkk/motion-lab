import { expect } from 'storybook/test';
import { MOTIONS } from '../motions/motions.js';

export default {
  title: 'Motions',
  argTypes: {
    rate: { control: 'inline-radio', options: [0.5, 1, 2], name: '再生速度' },
    reduced: { control: 'boolean', name: '動きを減らす' },
    autoplay: { control: 'boolean', name: '自動再生' },
  },
  args: { rate: 1, reduced: false, autoplay: true },
};

const frame = () => new Promise(r => requestAnimationFrame(() => r()));

function spyAnimate() {
  const original = Element.prototype.animate;
  const keyframes = [];
  Element.prototype.animate = function (frames, options) {
    keyframes.push(frames);
    return original.call(this, frames, options);
  };
  return { keyframes, restore: () => { Element.prototype.animate = original; } };
}

function story(id) {
  const motion = MOTIONS.find(m => m.id === id);
  if (!motion) throw new Error(`MOTIONS に id "${id}" がない`);
  return {
    name: motion.name,
    parameters: { motionId: id, docs: { description: { story: motion.desc } } },
    render: args => {
      const root = document.createElement('div');
      root.className = 'ml-root';
      const stage = document.createElement('div');
      stage.className = 'stage';
      root.append(stage);
      const instance = motion.setup(stage, { dur: ms => ms / args.rate, reduced: () => args.reduced });
      if (args.autoplay) requestAnimationFrame(() => instance.run().catch(() => {}));
      return root;
    },
    play: async ({ canvasElement, step }) => {
      const stage = canvasElement.querySelector('.stage');
      await frame();
      // 自動再生ぶんを止めて、以降の検証に混ざらないようにする
      stage.getAnimations({ subtree: true }).forEach(a => a.cancel());

      for (const reduced of [false, true]) {
        await step(reduced ? '動きを減らす: 再生が完了し、移動・変形を使わない' : '通常: 再生が完了し、後片付けされる', async () => {
          const spy = spyAnimate();
          let instance;
          try {
            instance = motion.setup(stage, { dur: ms => ms / 4, reduced: () => reduced });
            await instance.run();
          } finally {
            spy.restore();
          }
          await expect(spy.keyframes.length).toBeGreaterThan(0);
          await expect(stage.querySelector('.ripple')).toBeNull();
          const running = stage.getAnimations({ subtree: true }).filter(a => a.playState === 'running');
          await expect(running).toHaveLength(0);
          if (reduced) {
            const props = spy.keyframes.flat().flatMap(f => Object.keys(f));
            await expect(props).not.toContain('transform');
            await expect(props).not.toContain('clipPath');
          }
        });
      }

      if (stage.querySelector('input[type="range"]')) {
        await step('シークバーを動かすと、表示位置が時刻に合わせて変わる', async () => {
          motion.setup(stage, { dur: ms => ms / 4, reduced: () => false }).run().catch(() => {});
          await frame();
          // setup で中身が作り直されるため、要素は取り直す
          const range = stage.querySelector('input[type="range"]');
          const item = stage.querySelector('.flow-item');
          const at = value => {
            range.dispatchEvent(new PointerEvent('pointerdown'));
            range.value = String(value);
            range.dispatchEvent(new Event('input'));
            return getComputedStyle(item).transform;
          };
          const early = at(50);
          const later = at(250);
          await expect(later).not.toBe(early);
          await expect(at(50)).toBe(early);
          stage.getAnimations({ subtree: true }).forEach(a => a.cancel());
        });
      }

      const button = stage.querySelector('button.demo-btn');
      if (button) {
        await step('ボタンをクリックするとアニメーションが始まる', async () => {
          button.click();
          await expect(button.getAnimations({ subtree: true }).length).toBeGreaterThan(0);
        });
      }
    },
  };
}

export const PressBounce = story('press-bounce');
export const Ripple = story('ripple');
export const CircleReveal = story('circle-reveal');
export const FlowSeek = story('flow-seek');
