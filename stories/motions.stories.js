import { expect } from 'storybook/test';
import { MOTIONS, makeCtx } from '../motions/motions.js';

export default {
  title: 'Motions',
  argTypes: {
    rate: { control: 'inline-radio', options: [0.5, 1, 2], name: '再生速度' },
    reduced: { control: 'boolean', name: '動きを減らす' },
    autoplay: { control: 'boolean', name: '自動再生' },
  },
  args: { rate: 1, reduced: false, autoplay: true },
};

/* ---- 検証で使う共通の道具 ---- */

const frame = () => new Promise(r => requestAnimationFrame(() => r(undefined)));

/* 検証用の ctx。時間を 1/4 にして、再生を速く終わらせる */
const fastCtx = reduced => makeCtx({ rate: () => 4, reduced: () => reduced });

/* ctx を作って再生を始め、1フレーム待つ（要素の寸法が決まってから検証するため）。再生が完了するのは待たない */
const startDemo = async (motion, stage, reduced = false) => {
  motion.setup(stage, fastCtx(reduced)).run().catch(() => {});
  await frame();
};

/* stage の中のアニメーションをすべて止める（自動再生や前の検証の残りを消す） */
const cancelAll = stage => stage.getAnimations({ subtree: true }).forEach(a => a.cancel());

/* シークバー（input[type=range]）を、ユーザーがドラッグしたときと同じ順で操作する。value は 0〜1000 */
const seekTo = (range, value) => {
  range.dispatchEvent(new PointerEvent('pointerdown'));
  range.value = String(value);
  range.dispatchEvent(new Event('input'));
};

/* setup の呼び出しをスパイして、animate() に渡されたキーフレームを集める */
function spyAnimate() {
  const original = Element.prototype.animate;
  const keyframes = [];
  Element.prototype.animate = function (frames, options) {
    keyframes.push(frames);
    return original.call(this, frames, options);
  };
  return { keyframes, restore: () => { Element.prototype.animate = original; } };
}

/* ---- すべてのモーションに共通の検証 ---- */

/* 再生が完了し、後片付けされる。動きを減らす版は、移動・変形を使わない */
async function checkPlayback({ motion, stage, step }, reduced) {
  await step(reduced ? '動きを減らす: 再生が完了し、移動・変形を使わない' : '通常: 再生が完了し、後片付けされる', async () => {
    const spy = spyAnimate();
    try {
      await motion.setup(stage, fastCtx(reduced)).run();
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

/* シークバーを持つモーションの共通の検証 */
async function checkSeekBar({ motion, stage, step }) {
  await step('再生前でも、文字が時刻0の位置に配置されている', async () => {
    motion.setup(stage, fastCtx(false));
    await frame();
    // 時刻で位置が決まる要素（流れる文字、または data-seek-probe="transform" を付けた要素）。
    // 見え方（opacity）だけが変わるもの（字幕）は位置を持たないので、ここでは調べない
    const transforms = [...stage.querySelectorAll('.flow-item, [data-seek-probe="transform"]')].map(el => getComputedStyle(el).transform);
    await expect(transforms).not.toContain('none');
    cancelAll(stage);
  });

  await step('シークバーを動かすと、表示が時刻に合わせて変わる', async () => {
    await startDemo(motion, stage, false);
    // setup で中身が作り直されるため、要素は取り直す
    const range = stage.querySelector('input[type="range"]');
    const item = stage.querySelector('.flow-item, [data-seek-probe]');
    const stateAt = value => {
      seekTo(range, value);
      const cs = getComputedStyle(item);
      return `${cs.transform} / ${cs.opacity}`;   // 位置か見え方のどちらかが時刻で変わる
    };
    const early = stateAt(50);
    const later = stateAt(250);
    await expect(later).not.toBe(early);
    await expect(stateAt(50)).toBe(early);
    cancelAll(stage);
  });
}

/* 条件が成り立つまで待つ（最大 3 秒）。アニメーションの完了待ちに使う */
const until = async (condition, message) => {
  const limit = performance.now() + 3000;
  while (!condition()) {
    if (performance.now() > limit) throw new Error(`待ってもならなかった: ${message}`);
    await new Promise(r => setTimeout(r, 30));
  }
};

/* 開閉オーバーレイ（本棚・カード）の共通の操作の検証。triggerSel: 開く操作の対象、overlaySel: オーバーレイ */
const overlayStep = (triggerSel, overlaySel) => async ({ motion, stage, step }) => {
  const prepare = async reduced => {
    motion.setup(stage, fastCtx(reduced));
    await frame();
    return {
      triggers: /** @type {HTMLElement[]} */ ([...stage.querySelectorAll(triggerSel)]),
      overlay: /** @type {HTMLElement} */ (stage.querySelector(overlaySel)),
      bg: /** @type {HTMLElement} */ (stage.querySelector('.overlay-bg')),
      closeBtn: /** @type {HTMLElement} */ (stage.querySelector('.overlay-close')),
    };
  };
  const finished = message => until(() => stage.getAnimations({ subtree: true }).length === 0, message);
  /* i 番目の対象をクリックして開き、開ききるまで待つ */
  const openAt = async ({ triggers, overlay }, i) => {
    triggers[i].focus();
    triggers[i].click();
    // 開くアニメーションが終わるまで、2回目の操作は受け付けない
    triggers[(i + 2) % triggers.length].click();
    await until(() => overlay.classList.contains('is-open'), '開く');
    await finished('開くアニメーションの終了');
  };
  const closers = {
    'Esc': ({ overlay }) => overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    '背景クリック': ({ bg }) => bg.click(),
    '閉じるボタン': ({ closeBtn }) => closeBtn.click(),
  };

  for (const reduced of [false, true]) {
    for (const [name, close] of Object.entries(closers)) {
      await step(`${reduced ? '動きを減らす' : '通常'}: クリックで開き、${name}で閉じる。フォーカスは開いたとき閉じるボタンへ、閉じたとき元の対象へ移る`, async () => {
        const parts = await prepare(reduced);
        const { triggers, overlay, closeBtn } = parts;
        await openAt(parts, 1);
        await expect(document.activeElement).toBe(closeBtn);
        await expect(triggers.filter(t => t.classList.contains('is-out'))).toHaveLength(1);   // 開いたのは1つだけ
        close(parts);
        await until(() => !overlay.classList.contains('is-open'), '閉じる');
        await finished('閉じるアニメーションの終了');
        await expect(document.activeElement).toBe(triggers[1]);
        await expect(triggers.filter(t => t.classList.contains('is-out'))).toHaveLength(0);
        cancelAll(stage);
      });
    }
  }

  await step('Tab を押しても、フォーカスは閉じるボタンに留まる', async () => {
    const parts = await prepare(false);
    const { overlay, closeBtn } = parts;
    await openAt(parts, 1);
    /** @type {HTMLElement} */ (document.activeElement).blur();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    overlay.dispatchEvent(tab);
    await expect(tab.defaultPrevented).toBe(true);
    await expect(document.activeElement).toBe(closeBtn);
    cancelAll(stage);
  });
};

/* ---- モーション固有の検証（id → 検証。共通の検証のあとに実行する） ---- */

const EXTRA_STEPS = {
  'shelf-open': overlayStep('.spine', '.shelf-overlay'),
  'card-draw': overlayStep('.tcard', '.deck-overlay'),

  'flow-seek-vertical': async ({ motion, stage, step }) => {
    await step('縦: 折り返した文字が重ならず、終了時には枠の外へ出きる', async () => {
      await startDemo(motion, stage, false);
      const range = stage.querySelector('input[type="range"]');
      const frameEl = stage.querySelector('.flow-frame');
      const items = [...stage.querySelectorAll('.flow-item')];
      // 折り返して2行以上になる文字がある（デモの前提）
      await expect(Math.max(...items.map(el => el.getBoundingClientRect().height))).toBeGreaterThan(30);
      const area = frameEl.getBoundingClientRect();
      for (let v = 0; v <= 1000; v += 20) {
        seekTo(range, v);
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
      seekTo(range, 0);
      const start = Math.max(...items.map(ty));   // 枠の下（出る前の位置）
      seekTo(range, 1000);
      const end = Math.min(...items.map(ty));     // 枠の上（出きった位置）
      const between = y => y < start - 0.5 && y > end + 0.5;
      for (const [from, to] of [[300, 330], [500, 530]]) {
        seekTo(range, from);
        const before = items.map(ty);
        seekTo(range, to);
        const after = items.map(ty);
        const moving = items.map((el, i) => after[i] - before[i]).filter((d, i) => between(before[i]) && between(after[i]));
        await expect(moving.length).toBeGreaterThan(1);
        for (const d of moving) await expect(Math.abs(d - moving[0])).toBeLessThan(0.5);
      }
      // 間隔: 枠の中に並んでいる文字どうしの見た目の隙間がそろっている（2行の文字のあとも同じ）
      let checkedTwoLine = false;
      for (let v = 200; v <= 700; v += 50) {
        seekTo(range, v);
        const rows = items.map(el => el.getBoundingClientRect())
          .filter(r => r.top >= area.top && r.bottom <= area.bottom)
          .sort((p, q) => p.top - q.top);
        const gaps = rows.slice(1).map((r, i) => r.top - rows[i].bottom);
        if (rows.slice(0, -1).some(r => r.height > 30)) checkedTwoLine = true;
        for (const g of gaps) await expect(Math.abs(g - gaps[0])).toBeLessThan(1);
      }
      await expect(checkedTwoLine).toBe(true);   // 2行の文字のあとの隙間も確かめた
      // 終了時: すべての文字が枠の上に出きっている
      seekTo(range, 1000);
      for (const el of items) await expect(el.getBoundingClientRect().bottom).toBeLessThanOrEqual(area.top + 1);
      seekTo(range, 0);
      cancelAll(stage);
    });

    // 枠が十分高いときと、低いとき（位置を再利用する）の両方で、表示中の文字が重ならず枠に収まる
    for (const height of [null, 290, 250]) {
      await step(`縦・動きを減らす${height ? `（枠が低い: ${height}px）` : ''}: 表示中の文字が重ならず、枠に収まる`, async () => {
        const root = stage.parentElement;
        if (height) root.style.height = `${height}px`;
        try {
          await startDemo(motion, stage, true);
          const range = stage.querySelector('input[type="range"]');
          const area = stage.querySelector('.flow-frame').getBoundingClientRect();
          const items = [...stage.querySelectorAll('.flow-item')];
          let maxShown = 0;
          for (let v = 0; v <= 1000; v += 20) {
            seekTo(range, v);
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
          cancelAll(stage);
        } finally {
          root.style.height = '';
        }
      });
    }
  },

  'chat-pop': async ({ motion, stage, step }) => {
    await step('チャット: 吹き出しが左にそろい、新しいものが最下部に積み上がる', async () => {
      motion.setup(stage, fastCtx(false)).run().catch(() => {});
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
      cancelAll(stage);
    });
  },

  'ticker': async ({ motion, stage, step }) => {
    await step('ティッカー・動きを減らす: 流す用の文字列は隠れ、1件ずつの文字だけが見える', async () => {
      await startDemo(motion, stage, true);
      await expect(getComputedStyle(stage.querySelector('.tx-track')).display).toBe('none');
      await expect(getComputedStyle(stage.querySelector('.tx-static')).display).not.toBe('none');
      cancelAll(stage);
    });
    await step('ティッカー・通常: 1件ずつの文字は隠れ、流す用の文字列が見える', async () => {
      await startDemo(motion, stage, false);
      await expect(getComputedStyle(stage.querySelector('.tx-track')).display).not.toBe('none');
      await expect(getComputedStyle(stage.querySelector('.tx-static')).display).toBe('none');
      cancelAll(stage);
    });
  },

  'viewer-count': async ({ motion, stage, step }) => {
    await step('視聴者数: 数え上げる表示は読み上げず、読み上げ用の要素には更新後の値だけが入る', async () => {
      motion.setup(stage, fastCtx(false)).run().catch(() => {});
      await frame();
      await expect(stage.querySelector('.tx-viewers').getAttribute('aria-hidden')).toBe('true');
      const status = stage.querySelector('[role="status"]');
      const num = stage.querySelector('.tx-viewers-num');
      const spoken = new Set(), shown = new Set();
      const limit = performance.now() + 800;
      while (performance.now() < limit) {
        spoken.add(status.textContent);
        shown.add(num.textContent);
        await frame();
      }
      // 表示は途中の値を数え上げるが、読み上げ用は「視聴中 N人」の形の更新後の値だけ（数件）
      await expect(shown.size).toBeGreaterThan(spoken.size + 3);
      for (const text of spoken) await expect(text).toMatch(/^視聴中 [\d,]+人$/);
      cancelAll(stage);
    });
  },

  'morph-text': async ({ motion, stage, step }) => {
    await step('モーフィング・通常: しきい値フィルターがかかり、ぼかしを使う', async () => {
      const spy = spyAnimate();
      try {
        await startDemo(motion, stage, false);
        await expect(getComputedStyle(stage.querySelector('.tx-morph-text')).filter).toContain('url(');
        const props = spy.keyframes.flat().flatMap(f => Object.keys(f));
        await expect(props).toContain('filter');
      } finally {
        spy.restore();
      }
      cancelAll(stage);
    });
    await step('モーフィング: 一番長い言葉でも枠からはみ出さない（文字が縮む）', async () => {
      motion.setup(stage, fastCtx(false)).run().catch(() => {});
      await frame();
      const text = stage.querySelector('.tx-morph-text');
      const spans = [...text.querySelectorAll('span')];
      await expect(parseFloat(text.style.fontSize)).toBeLessThan(52);
      // 言葉を入れ替えながら、どの言葉でも枠に収まることを確かめる（長い言葉は fit が測った幅と同じ）
      for (const word of ['モーフィング', '溶ける']) {
        spans[0].textContent = word;
        await expect(spans[0].offsetWidth).toBeLessThanOrEqual(stage.clientWidth);
      }
      cancelAll(stage);
    });
    await step('モーフィング・動きを減らす: フィルターを外し、ぼかさない', async () => {
      const spy = spyAnimate();
      try {
        await startDemo(motion, stage, true);
        await expect(getComputedStyle(stage.querySelector('.tx-morph-text')).filter).toBe('none');
        const props = spy.keyframes.flat().flatMap(f => Object.keys(f));
        await expect(props).not.toContain('filter');
      } finally {
        spy.restore();
      }
      cancelAll(stage);
    });
  },
};

/* ---- ストーリーの定義 ---- */

function story(id) {
  const motion = MOTIONS.find(m => m.id === id);
  if (!motion) throw new Error(`MOTIONS に id "${id}" がない`);
  const mount = (stage, args) => {
    const instance = motion.setup(stage, makeCtx({ rate: () => args.rate, reduced: () => args.reduced }));
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
      const ctx = { motion, stage, step };
      await frame();
      // 自動再生ぶんを止めて、以降の検証に混ざらないようにする
      cancelAll(stage);

      await checkPlayback(ctx, false);
      await checkPlayback(ctx, true);
      if (stage.querySelector('input[type="range"]')) await checkSeekBar(ctx);
      await EXTRA_STEPS[motion.id]?.(ctx);

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
export const SlidePush = story('slide-push');
export const SheetRise = story('sheet-rise');
export const Wipe = story('wipe');
export const ZoomFade = story('zoom-fade');
export const CrossFade = story('cross-fade');
export const CubeRotate = story('cube-rotate');
export const TvOff = story('tv-off');
export const GridFlip = story('grid-flip');
export const FlowSeek = story('flow-seek');
export const FlowSeekVertical = story('flow-seek-vertical');
export const ChatPop = story('chat-pop');
export const Toast = story('toast');
export const BannerDrop = story('banner-drop');
export const BadgePop = story('badge-pop');
export const ShelfOpen = story('shelf-open');
export const CardDraw = story('card-draw');
export const Typewriter = story('typewriter');
export const Ticker = story('ticker');
export const SyncHighlight = story('sync-highlight');
export const MorphText = story('morph-text');
export const PressSink = story('press-sink');
export const Jelly = story('jelly');
export const Shine = story('shine');
export const RingPulse = story('ring-pulse');
export const ErrorShake = story('error-shake');
export const LikeBurst = story('like-burst');
export const SubmitMorph = story('submit-morph');
export const LiveDot = story('live-dot');
export const CountdownFlip = story('countdown-flip');
export const ViewerCount = story('viewer-count');
