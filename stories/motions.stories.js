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
  const mount = (stage, args) => {
    const instance = motion.setup(stage, { dur: ms => ms / args.rate, reduced: () => args.reduced });
    if (args.autoplay) requestAnimationFrame(() => instance.run().catch(() => {}));
  };
  return {
    name: motion.name,
    parameters: { motionId: id, docs: { description: { story: motion.desc } } },
    render: args => {
      const root = document.createElement('div');
      root.className = 'ml-root';
      const stage = document.createElement('div');
      stage.className = 'stage';
      root.append(stage);
      mount(stage, args);
      return root;
    },
    play: async ({ canvasElement, step, args }) => {
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
        await step('再生前でも、文字が時刻0の位置に配置されている', async () => {
          motion.setup(stage, { dur: ms => ms / 4, reduced: () => false });
          await frame();
          const transforms = [...stage.querySelectorAll('.flow-item')].map(el => getComputedStyle(el).transform);
          await expect(transforms).not.toContain('none');
          stage.getAnimations({ subtree: true }).forEach(a => a.cancel());
        });

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

      if (stage.querySelector('.flow.is-vertical') || motion.id === 'flow-seek-vertical') {
        await step('縦: 折り返した文字が重ならず、終了時には枠の外へ出きる', async () => {
          motion.setup(stage, { dur: ms => ms / 4, reduced: () => false }).run().catch(() => {});
          await frame();
          const range = stage.querySelector('input[type="range"]');
          const frameEl = stage.querySelector('.flow-frame');
          const items = [...stage.querySelectorAll('.flow-item')];
          const seekTo = value => {
            range.dispatchEvent(new PointerEvent('pointerdown'));
            range.value = String(value);
            range.dispatchEvent(new Event('input'));
          };
          // 折り返して2行以上になる文字がある（デモの前提）
          await expect(Math.max(...items.map(el => el.getBoundingClientRect().height))).toBeGreaterThan(30);
          const area = frameEl.getBoundingClientRect();
          for (let v = 0; v <= 1000; v += 20) {
            seekTo(v);
            const shown = items.map(el => el.getBoundingClientRect())
              .filter(r => r.bottom > area.top && r.top < area.bottom);
            // 枠の右端からはみ出さない
            for (const r of shown) await expect(r.right).toBeLessThanOrEqual(area.right + 1);
            for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
              const a = shown[i], b = shown[j];
              const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
              await expect(overlap).toBe(false);
            }
          }
          // 速さ: 流れている途中の文字は、すべて同じ距離だけ動く（折り返した文字も同じ速さ）
          const ty = el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
          seekTo(0);
          const start = Math.max(...items.map(ty));   // 枠の下（出る前の位置）
          seekTo(1000);
          const end = Math.min(...items.map(ty));     // 枠の上（出きった位置）
          const between = y => y < start - 0.5 && y > end + 0.5;
          for (const [from, to] of [[300, 330], [500, 530]]) {
            seekTo(from);
            const a = items.map(ty);
            seekTo(to);
            const b = items.map(ty);
            const moving = items.map((el, i) => b[i] - a[i]).filter((d, i) => between(a[i]) && between(b[i]));
            await expect(moving.length).toBeGreaterThan(1);
            for (const d of moving) await expect(Math.abs(d - moving[0])).toBeLessThan(0.5);
          }
          // 間隔: 枠の中に並んでいる文字どうしの見た目の隙間がそろっている（2行の文字のあとも同じ）
          let checkedTwoLine = false;
          for (let v = 200; v <= 700; v += 50) {
            seekTo(v);
            const rows = items.map(el => el.getBoundingClientRect())
              .filter(r => r.top >= area.top && r.bottom <= area.bottom)
              .sort((p, q) => p.top - q.top);
            const gaps = rows.slice(1).map((r, i) => r.top - rows[i].bottom);
            if (rows.slice(0, -1).some(r => r.height > 30)) checkedTwoLine = true;
            for (const g of gaps) await expect(Math.abs(g - gaps[0])).toBeLessThan(1);
          }
          await expect(checkedTwoLine).toBe(true);   // 2行の文字のあとの隙間も確かめた
          // 終了時: すべての文字が枠の上に出きっている
          seekTo(1000);
          for (const el of items) await expect(el.getBoundingClientRect().bottom).toBeLessThanOrEqual(area.top + 1);
          seekTo(0);
          stage.getAnimations({ subtree: true }).forEach(a => a.cancel());
        });
      }

      if (motion.id === 'chat-pop') {
        await step('チャット: 吹き出しが左にそろい、新しいものが最下部に積み上がる', async () => {
          motion.setup(stage, { dur: ms => ms / 4, reduced: () => false }).run().catch(() => {});
          await new Promise(r => setTimeout(r, 900));
          const area = stage.querySelector('.chat-frame').getBoundingClientRect();
          const bubbles = [...stage.querySelectorAll('.chat-bubble')];
          await expect(bubbles.length).toBeGreaterThanOrEqual(3);
          const rects = bubbles.map(el => el.getBoundingClientRect());
          // 枠の外（右・下）にはみ出さず、左端がそろっている
          for (const r of rects) {
            await expect(r.right).toBeLessThanOrEqual(area.right + 1);
            await expect(r.bottom).toBeLessThanOrEqual(area.bottom + 1);
          }
          await expect(new Set(bubbles.map(el => el.offsetLeft)).size).toBe(1);
          // 後に出たものほど下にある（吹き出し同士は重ならない）
          for (let i = 1; i < bubbles.length; i++) {
            await expect(bubbles[i].offsetTop).toBeGreaterThanOrEqual(bubbles[i - 1].offsetTop + bubbles[i - 1].offsetHeight);
          }
          stage.getAnimations({ subtree: true }).forEach(a => a.cancel());
        });
      }

      if (motion.id === 'flow-seek-vertical') {
        // 枠が十分高いときと、低いとき（位置を再利用する）の両方で、表示中の文字が重ならず枠に収まる
        for (const height of [null, 290, 250]) {
          await step(`縦・動きを減らす${height ? `（枠が低い: ${height}px）` : ''}: 表示中の文字が重ならず、枠に収まる`, async () => {
            const root = stage.parentElement;
            if (height) root.style.height = `${height}px`;
            try {
              motion.setup(stage, { dur: ms => ms / 4, reduced: () => true }).run().catch(() => {});
              await frame();
              const range = stage.querySelector('input[type="range"]');
              const area = stage.querySelector('.flow-frame').getBoundingClientRect();
              const items = [...stage.querySelectorAll('.flow-item')];
              const seekTo = value => {
                range.dispatchEvent(new PointerEvent('pointerdown'));
                range.value = String(value);
                range.dispatchEvent(new Event('input'));
              };
              let maxShown = 0;
              for (let v = 0; v <= 1000; v += 20) {
                seekTo(v);
                const shown = items.filter(el => Number(getComputedStyle(el).opacity) > 0.01).map(el => el.getBoundingClientRect());
                maxShown = Math.max(maxShown, shown.length);
                for (const r of shown) {
                  await expect(r.top).toBeGreaterThanOrEqual(area.top);
                  await expect(r.bottom).toBeLessThanOrEqual(area.bottom + 1);
                }
                for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
                  const a = shown[i], b = shown[j];
                  await expect(a.top < b.bottom && b.top < a.bottom).toBe(false);
                }
              }
              await expect(maxShown).toBeGreaterThan(3);   // 3件までの固定位置ではない
              if (!height) {
                // 枠に空きがあるときは、全件が専用の位置（入れ替わらない）
                await expect(new Set(items.map(el => el.offsetTop)).size).toBe(items.length);
              }
              stage.getAnimations({ subtree: true }).forEach(a => a.cancel());
            } finally {
              root.style.height = '';
            }
          });
        }
      }

      const button = stage.querySelector('button.demo-btn');
      if (button) {
        await step('ボタンをクリックするとアニメーションが始まる', async () => {
          button.click();
          await expect(button.getAnimations({ subtree: true }).length).toBeGreaterThan(0);
        });
      }

      // 検証で書き換えた表示を、Controls の設定どおりの状態に戻す。
      // 中身は setup が作り直すので、ここでアニメーションを cancel しない
      // （クリックで始まった ripple の finished が reject され、未処理エラーになる）
      mount(stage, args);
    },
  };
}

export const PressBounce = story('press-bounce');
export const Ripple = story('ripple');
export const CircleReveal = story('circle-reveal');
export const FlowSeek = story('flow-seek');
export const FlowSeekVertical = story('flow-seek-vertical');
export const ChatPop = story('chat-pop');
