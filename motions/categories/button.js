/* モーション定義: ボタン。motions.js が集めて MOTIONS にする。追加したら stories/motions.stories.js にも1行足す */
import { q } from '../dom.js';
import { scaleOf, settle } from '../runtime.js';

/**
 * ボタンのデモに渡す道具。a はアニメーションを ctx の再生速度に合わせて作る（duration と delay を ms で渡す）。
 * spawn は、再生中だけ使う要素（光・粒など）を作る。再生が終わるか、再生し直したときに取り除かれる
 * @typedef {{
 *   stage: HTMLElement,
 *   btn: HTMLElement,
 *   a: (el: Element, frames: Keyframe[], ms: number, extra?: { easing?: string, delay?: number, fill?: FillMode }) => Animation,
 *   spawn: (className: string, parent?: HTMLElement) => HTMLElement,
 * }} ButtonEls
 */

/**
 * ボタンのモーション（押下バウンス・リップル以外）の共通部分。
 * ここが持つもの: ボタンの用意、クリックでの再生、再生し直したときに前の再生を止めること、再生中だけ使う要素の後片付け。
 * 何がどう動くかは、呼び出し側が play（通常版）と reduced（動きを減らす版。transform / clip-path を使わない）で渡す。
 * @param {HTMLElement} stage
 * @param {import('../types.js').Ctx} ctx
 * @param {{ html: string, play: (els: ButtonEls) => Animation[], reduced: (els: ButtonEls) => Animation[] }} spec
 */
function buttonDemo(stage, ctx, { html, play, reduced }) {
  stage.innerHTML = html;
  const btn = q(stage, '.demo-btn');
  /** @type {HTMLElement[]} */
  const spawned = [];
  const removeSpawned = () => spawned.splice(0).forEach(el => el.remove());
  /** @type {ButtonEls} */
  const els = {
    stage, btn,
    a: (el, frames, ms, { delay = 0, ...extra } = {}) =>
      el.animate(frames, { ...extra, duration: ctx.dur(ms), delay: ctx.dur(delay) }),
    spawn: (className, parent = btn) => {
      const el = document.createElement('span');
      el.className = className;
      parent.append(el);
      spawned.push(el);
      return el;
    },
  };
  /** @type {Animation[]} */
  let active = [];
  const run = async () => {
    // 再生し直したら、前の再生を止めて作り直す（止めた再生の finished は AbortError で終わる）
    active.forEach(x => x.cancel());
    removeSpawned();
    const anims = active = (ctx.reduced() ? reduced : play)(els);
    try {
      await Promise.all(anims.map(x => x.finished));
    } finally {
      if (active === anims) removeSpawned();
    }
  };
  btn.addEventListener('click', () => { run().catch(() => {}); });
  return { run };
}

/* 各キーフレームに同じイージングを付ける（区間ごとに効かせる） */
const eachEase = (/** @type {Keyframe[]} */ frames, /** @type {string} */ easing) => frames.map(f => ({ easing, ...f }));

/* 沈み込み: 押す前の影（キーの厚み）と、押したときの影 */
const KEY_UP = '0 6px 0 #3b5bb5';
const KEY_DOWN = '0 2px 0 #3b5bb5';

/* 輪が広がる: アクセント色（#6ea8ff）の輪 */
const RING = (/** @type {number} */ spread, /** @type {number} */ alpha) => `0 0 0 ${spread}px rgba(110, 168, 255, ${alpha})`;

/* エラーで震える: 赤い枠（内側の影）。見えない枠と見える枠 */
const RED_OFF = 'inset 0 0 0 2px rgba(255, 90, 95, 0)';
const RED_ON = 'inset 0 0 0 2px rgba(255, 90, 95, 1)';

/* いいね: 粒の数・飛ぶ距離・色 */
const BURST = { count: 8, distance: 38, colors: ['#ff6b8b', '#ffd166'] };
const burstOffset = (/** @type {number} */ i, /** @type {number} */ r) => {
  const t = (i / BURST.count) * Math.PI * 2;
  return [Math.round(Math.cos(t) * r), Math.round(Math.sin(t) * r)];
};
const HEART_OFF = '#9097a3';
const HEART_ON = '#ff4d6d';

/* 送信 → 完了: 全体の時間 */
const SUBMIT_MS = 1800;

/** @type {import('../types.js').Motion[]} */
export const BUTTON_MOTIONS = [
  {
    id: 'press-bounce',
    cat: 'button',
    name: '押下バウンス',
    feel: '弾む・軽快',
    use: '主要ボタン / タップ',
    ms: 450,
    msLabel: '押して戻るまでの全体',
    easing: 'cubic-bezier(.34, 1.56, .64, 1)',
    desc: '押すと少し沈み、離すとオーバーシュートして戻る。',
    setup(stage, ctx) {
      stage.innerHTML = '<button class="demo-btn">購入する</button>';
      const btn = q(stage, '.demo-btn');
      const run = () => {
        if (ctx.reduced()) {
          return btn.animate(
            [{ opacity: 1 }, { opacity: .6 }, { opacity: 1 }],
            { duration: ctx.dur(240) }
          ).finished;
        }
        return btn.animate([
          { transform: 'scale(1)',   easing: 'cubic-bezier(.2, 0, 0, 1)' },
          { transform: 'scale(.94)', offset: .25, easing: 'cubic-bezier(.34, 1.56, .64, 1)' },
          { transform: 'scale(1)' }
        ], { duration: ctx.dur(450) }).finished;
      };
      btn.addEventListener('click', run);
      return { run };
    },
    code: {
      css: `.btn {
  transition: transform .45s cubic-bezier(.34, 1.56, .64, 1);
}
.btn:active {
  transform: scale(.94);
  transition-duration: .1s; /* 沈むのは速く、戻りはゆっくり */
}`,
      waapi: `btn.addEventListener('click', () => {
  btn.animate([
    { transform: 'scale(1)',   easing: 'cubic-bezier(.2, 0, 0, 1)' },
    { transform: 'scale(.94)', offset: .25,
      easing: 'cubic-bezier(.34, 1.56, .64, 1)' },
    { transform: 'scale(1)' }
  ], { duration: 450 });
});`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  .btn { transition: opacity .15s linear; }
  .btn:active { transform: none; opacity: .6; }
}`
    }
  },

  {
    id: 'ripple',
    cat: 'button',
    name: 'リップル',
    feel: 'なめらか・触覚的',
    use: 'タップ位置の強調',
    ms: 600,
    msLabel: '波紋が広がって消えるまで',
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    desc: 'タップした位置から波紋が広がって消える。',
    setup(stage, ctx) {
      stage.innerHTML = '<button class="demo-btn">タップしてね</button>';
      const btn = q(stage, '.demo-btn');
      const run = (x, y) => {
        const w = btn.offsetWidth, h = btn.offsetHeight;   // 縮小表示でも変わらない、本来の大きさ
        const cx = x ?? w / 2, cy = y ?? h / 2;
        const size = Math.max(w, h) * 2.2;
        const dot = document.createElement('span');
        dot.className = 'ripple';
        Object.assign(dot.style, {
          width: size + 'px', height: size + 'px',
          left: cx - size / 2 + 'px', top: cy - size / 2 + 'px'
        });
        btn.appendChild(dot);
        const frames = ctx.reduced()
          ? [{ opacity: .3 }, { opacity: 0 }]
          : [{ transform: 'scale(0)', opacity: .35 }, { transform: 'scale(1)', opacity: 0 }];
        const a = dot.animate(frames, {
          duration: ctx.dur(ctx.reduced() ? 250 : 600),
          easing: 'cubic-bezier(.2, 0, 0, 1)'
        });
        return a.finished.then(() => dot.remove());
      };
      btn.addEventListener('click', e => {
        const r = btn.getBoundingClientRect(), k = scaleOf(stage);
        run((e.clientX - r.left) / k, (e.clientY - r.top) / k);
      });
      return { run: () => run() };
    },
    code: {
      css: `.btn { position: relative; overflow: hidden; }
.ripple {
  position: absolute; border-radius: 50%;
  background: #fff; opacity: 0; pointer-events: none;
  animation: ripple .6s cubic-bezier(.2, 0, 0, 1);
}
@keyframes ripple {
  from { transform: scale(0); opacity: .35; }
  to   { transform: scale(1); opacity: 0; }
}`,
      waapi: `btn.addEventListener('click', e => {
  const r = btn.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.2;
  const dot = document.createElement('span');
  dot.className = 'ripple';
  Object.assign(dot.style, {
    width: size + 'px', height: size + 'px',
    left: e.clientX - r.left - size / 2 + 'px',
    top:  e.clientY - r.top  - size / 2 + 'px'
  });
  btn.appendChild(dot);
  dot.animate(
    [{ transform: 'scale(0)', opacity: .35 },
     { transform: 'scale(1)', opacity: 0 }],
    { duration: 600, easing: 'cubic-bezier(.2, 0, 0, 1)' }
  ).finished.then(() => dot.remove());
});`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  .ripple { animation: ripple-fade .25s linear; }
}
@keyframes ripple-fade {
  from { opacity: .3; }
  to   { opacity: 0; }
}`
    }
  },
  {
    id: 'press-sink',
    cat: 'button',
    name: '沈み込み',
    feel: '重厚・物理的',
    use: '影のあるボタン、物理的なスイッチ感を出したいとき',
    ms: 280,
    msLabel: '押して戻るまでの全体',
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    desc: '押すと 4px 下へ沈み、その分だけ下の影（キーの厚み）が薄くなる。',
    setup: (stage, ctx) => buttonDemo(stage, ctx, {
      html: '<button class="demo-btn btn-key">決定する</button>',
      play: ({ btn, a }) => [a(btn, [
        { transform: 'translateY(0)', boxShadow: KEY_UP, easing: 'cubic-bezier(.2, 0, 0, 1)' },
        { transform: 'translateY(4px)', boxShadow: KEY_DOWN, offset: .3 },
        { transform: 'translateY(4px)', boxShadow: KEY_DOWN, offset: .55, easing: 'cubic-bezier(.2, 0, 0, 1)' },
        { transform: 'translateY(0)', boxShadow: KEY_UP },
      ], 280)],
      reduced: ({ btn, a }) => [a(btn, [
        { boxShadow: KEY_UP, filter: 'brightness(1)' },
        { boxShadow: KEY_DOWN, filter: 'brightness(.9)', offset: .3 },
        { boxShadow: KEY_DOWN, filter: 'brightness(.9)', offset: .55 },
        { boxShadow: KEY_UP, filter: 'brightness(1)' },
      ], 280)],
    }),
    code: {
      css: `.btn {
  box-shadow: 0 6px 0 #3b5bb5;   /* キーの厚み */
  transition: transform .15s cubic-bezier(.2, 0, 0, 1),
              box-shadow .15s cubic-bezier(.2, 0, 0, 1);
}
.btn:active {
  transform: translateY(4px);
  box-shadow: 0 2px 0 #3b5bb5;   /* 沈んだ分だけ影を薄く */
  transition-duration: .08s;
}`,
      waapi: `btn.addEventListener('click', () => {
  btn.animate([
    { transform: 'translateY(0)', boxShadow: '0 6px 0 #3b5bb5',
      easing: 'cubic-bezier(.2, 0, 0, 1)' },
    { transform: 'translateY(4px)', boxShadow: '0 2px 0 #3b5bb5', offset: .3 },
    { transform: 'translateY(4px)', boxShadow: '0 2px 0 #3b5bb5', offset: .55,
      easing: 'cubic-bezier(.2, 0, 0, 1)' },
    { transform: 'translateY(0)', boxShadow: '0 6px 0 #3b5bb5' }
  ], { duration: 280 });
});`,
      reduced: `/* 位置は動かさず、影が薄くなって少し暗くなる */
@media (prefers-reduced-motion: reduce) {
  .btn { transition: box-shadow .15s linear, filter .15s linear; }
  .btn:active { transform: none; box-shadow: 0 2px 0 #3b5bb5; filter: brightness(.9); }
}`
    }
  },

  {
    id: 'jelly',
    cat: 'button',
    name: 'ぷるん',
    feel: '遊び心・やわらかい',
    use: 'カジュアルなアプリ、ゲームのボタン',
    ms: 600,
    msLabel: '潰れてから落ち着くまで',
    easing: 'ease-in-out',
    desc: '横に潰れ、縦に伸び、揺れが小さくなりながら元の形に落ち着く。',
    setup: (stage, ctx) => buttonDemo(stage, ctx, {
      html: '<button class="demo-btn">はじめる</button>',
      play: ({ btn, a }) => [a(btn, eachEase([
        { transform: 'scale(1, 1)' },
        { transform: 'scale(1.15, .85)', offset: .3 },
        { transform: 'scale(.9, 1.1)', offset: .5 },
        { transform: 'scale(1.05, .95)', offset: .7 },
        { transform: 'scale(.98, 1.02)', offset: .85 },
        { transform: 'scale(1, 1)' },
      ], 'ease-in-out'), 600)],
      reduced: ({ btn, a }) => [a(btn, eachEase([
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.25)', offset: .3 },
        { filter: 'brightness(1)', offset: .5 },
        { filter: 'brightness(1.12)', offset: .7 },
        { filter: 'brightness(1)' },
      ], 'ease-in-out'), 600)],
    }),
    code: {
      css: `.btn:active { animation: jelly .6s; }
@keyframes jelly {
  0%, 100% { transform: scale(1, 1); }
  30% { transform: scale(1.15, .85); }
  50% { transform: scale(.9, 1.1); }
  70% { transform: scale(1.05, .95); }
  85% { transform: scale(.98, 1.02); }
}
/* 区間ごとに ease-in-out */
.btn { animation-timing-function: ease-in-out; }`,
      waapi: `btn.addEventListener('click', () => {
  btn.animate([
    { transform: 'scale(1, 1)' },
    { transform: 'scale(1.15, .85)', offset: .3 },
    { transform: 'scale(.9, 1.1)', offset: .5 },
    { transform: 'scale(1.05, .95)', offset: .7 },
    { transform: 'scale(.98, 1.02)', offset: .85 },
    { transform: 'scale(1, 1)' }
  ].map(f => ({ easing: 'ease-in-out', ...f })), { duration: 600 });
});`,
      reduced: `/* 形は変えず、明るさを2回弾ませる */
@media (prefers-reduced-motion: reduce) {
  .btn:active { animation-name: jelly-reduced; }
}
@keyframes jelly-reduced {
  0%, 50%, 100% { filter: brightness(1); }
  30% { filter: brightness(1.25); }
  70% { filter: brightness(1.12); }
}`
    }
  },

  {
    id: 'shine',
    cat: 'button',
    name: 'キラッと光る',
    feel: '高級感・きらめき',
    use: '購入・CTA・「新着」など、目を引きたいボタン',
    ms: 700,
    msLabel: '光が横切るまで',
    easing: 'cubic-bezier(.4, 0, .2, 1)',
    desc: '斜めの光の筋が、ボタンの表面を左から右へ横切る。',
    setup: (stage, ctx) => buttonDemo(stage, ctx, {
      html: '<button class="demo-btn">今すぐ購入</button>',
      play: ({ a, spawn }) => [a(spawn('btn-shine'),
        [{ backgroundPosition: '100% 0' }, { backgroundPosition: '0% 0' }],
        700, { easing: 'cubic-bezier(.4, 0, .2, 1)' })],
      reduced: ({ a, spawn }) => [a(spawn('btn-shine'), [
        { backgroundPosition: '50% 0', opacity: 0 },
        { backgroundPosition: '50% 0', opacity: 1, offset: .4 },
        { backgroundPosition: '50% 0', opacity: 0 },
      ], 700, { easing: 'ease-in-out' })],
    }),
    code: {
      css: `.btn { position: relative; overflow: hidden; }
/* 光の筋。画面の 2.5 倍の画像の中央に置き、位置を動かして横切らせる */
.btn::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(105deg,
    transparent 40%, rgba(255,255,255,.65) 50%, transparent 60%) no-repeat;
  background-size: 250% 100%;
  background-position: 100% 0;   /* 左の外 */
}
.btn:hover::after {
  background-position: 0% 0;     /* 右の外 */
  transition: background-position .7s cubic-bezier(.4, 0, .2, 1);
}`,
      waapi: `// shine は、上の CSS の ::after と同じ見た目の要素
shine.animate(
  [{ backgroundPosition: '100% 0' }, { backgroundPosition: '0% 0' }],
  { duration: 700, easing: 'cubic-bezier(.4, 0, .2, 1)' }
);`,
      reduced: `/* 光は流さず、中央でふわっと出して消す */
@media (prefers-reduced-motion: reduce) {
  .btn::after { background-position: 50% 0; opacity: 0; }
  .btn:hover::after { animation: shine-reduced .7s ease-in-out; transition: none; }
}
@keyframes shine-reduced {
  0%, 100% { opacity: 0; }
  40% { opacity: 1; }
}`
    }
  },

  {
    id: 'ring-pulse',
    cat: 'button',
    name: '輪が広がる',
    feel: '反応・合図',
    use: '確定・開始など、行動を促すボタン',
    ms: 600,
    msLabel: '輪が広がって消えるまで',
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    desc: 'ボタンの縁から、アクセント色の輪が外へ広がって消える。',
    setup: (stage, ctx) => buttonDemo(stage, ctx, {
      html: '<button class="demo-btn">スタート</button>',
      play: ({ btn, a }) => [a(btn, [{ boxShadow: RING(0, .9) }, { boxShadow: RING(20, 0) }],
        600, { easing: 'cubic-bezier(.2, 0, 0, 1)' })],
      reduced: ({ btn, a }) => [a(btn, [
        { boxShadow: RING(3, 0) },
        { boxShadow: RING(3, .8), offset: .25 },
        { boxShadow: RING(3, 0) },
      ], 600, { easing: 'ease-out' })],
    }),
    code: {
      css: `.btn:active { animation: ring-pulse .6s cubic-bezier(.2, 0, 0, 1); }
@keyframes ring-pulse {
  from { box-shadow: 0 0 0 0 rgba(110, 168, 255, .9); }
  to   { box-shadow: 0 0 0 20px rgba(110, 168, 255, 0); }
}`,
      waapi: `btn.addEventListener('click', () => {
  btn.animate(
    [{ boxShadow: '0 0 0 0 rgba(110, 168, 255, .9)' },
     { boxShadow: '0 0 0 20px rgba(110, 168, 255, 0)' }],
    { duration: 600, easing: 'cubic-bezier(.2, 0, 0, 1)' }
  );
});`,
      reduced: `/* 輪は広げず、縁（3px）に出して消す */
@media (prefers-reduced-motion: reduce) {
  .btn:active { animation: ring-reduced .6s ease-out; }
}
@keyframes ring-reduced {
  0%, 100% { box-shadow: 0 0 0 3px rgba(110, 168, 255, 0); }
  25% { box-shadow: 0 0 0 3px rgba(110, 168, 255, .8); }
}`
    }
  },

  {
    id: 'error-shake',
    cat: 'button',
    name: 'エラーで震える',
    feel: '警告・きっぱり',
    use: '入力の誤り、送信の失敗を伝えるとき',
    ms: 400,
    msLabel: '震えが止まるまで',
    easing: 'linear',
    desc: '左右に数回震えて揺れ幅が小さくなり、その間は枠が赤くなる。',
    setup: (stage, ctx) => buttonDemo(stage, ctx, {
      html: '<button class="demo-btn">ログイン</button>',
      play: ({ btn, a }) => [a(btn, [
        { transform: 'translateX(0)', boxShadow: RED_OFF },
        { transform: 'translateX(-8px)', boxShadow: RED_ON, offset: .1 },
        { transform: 'translateX(8px)', offset: .25 },
        { transform: 'translateX(-6px)', offset: .4 },
        { transform: 'translateX(6px)', offset: .55 },
        { transform: 'translateX(-3px)', offset: .7 },
        { transform: 'translateX(0)', boxShadow: RED_ON, offset: .85 },
        { transform: 'translateX(0)', boxShadow: RED_OFF },
      ], 400)],
      // 震えの代わりに、赤い枠を2回点滅させる。点滅は 1 秒に 3 回より遅くする（800ms で2回）
      reduced: ({ btn, a }) => [a(btn, [
        { boxShadow: RED_OFF },
        { boxShadow: RED_ON, offset: .2 },
        { boxShadow: RED_OFF, offset: .45 },
        { boxShadow: RED_ON, offset: .65 },
        { boxShadow: RED_OFF },
      ], 800)],
    }),
    code: {
      css: `.btn.is-error { animation: shake .4s linear; }
@keyframes shake {
  0%   { transform: translateX(0);    box-shadow: inset 0 0 0 2px rgba(255, 90, 95, 0); }
  10%  { transform: translateX(-8px); box-shadow: inset 0 0 0 2px rgba(255, 90, 95, 1); }
  25%  { transform: translateX(8px); }
  40%  { transform: translateX(-6px); }
  55%  { transform: translateX(6px); }
  70%  { transform: translateX(-3px); }
  85%  { transform: translateX(0);    box-shadow: inset 0 0 0 2px rgba(255, 90, 95, 1); }
  100% { transform: translateX(0);    box-shadow: inset 0 0 0 2px rgba(255, 90, 95, 0); }
}`,
      waapi: `btn.animate([
  { transform: 'translateX(0)',    boxShadow: 'inset 0 0 0 2px rgba(255, 90, 95, 0)' },
  { transform: 'translateX(-8px)', boxShadow: 'inset 0 0 0 2px rgba(255, 90, 95, 1)', offset: .1 },
  { transform: 'translateX(8px)',  offset: .25 },
  { transform: 'translateX(-6px)', offset: .4 },
  { transform: 'translateX(6px)',  offset: .55 },
  { transform: 'translateX(-3px)', offset: .7 },
  { transform: 'translateX(0)',    boxShadow: 'inset 0 0 0 2px rgba(255, 90, 95, 1)', offset: .85 },
  { transform: 'translateX(0)',    boxShadow: 'inset 0 0 0 2px rgba(255, 90, 95, 0)' }
], { duration: 400 });`,
      reduced: `/* 震えの代わりに、赤い枠を2回点滅させる（800ms。点滅は 1 秒に 3 回より遅く） */
@media (prefers-reduced-motion: reduce) {
  .btn.is-error { animation: shake-reduced .8s linear; }
}
@keyframes shake-reduced {
  0%, 45%, 100% { box-shadow: inset 0 0 0 2px rgba(255, 90, 95, 0); }
  20%, 65% { box-shadow: inset 0 0 0 2px rgba(255, 90, 95, 1); }
}`
    }
  },

  {
    id: 'like-burst',
    cat: 'button',
    name: 'いいね',
    feel: '楽しい・祝福',
    use: 'いいね、お気に入り、ブックマーク',
    ms: 700,
    msLabel: 'ハートが弾んで落ち着くまで',
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    desc: 'ハートが一度縮んでから大きく弾んで色が付き、周りに8つの粒が飛び散る。',
    setup: (stage, ctx) => buttonDemo(stage, ctx, {
      html: '<div class="btn-wrap"><button class="demo-btn like-btn" aria-label="いいね"><span class="like-heart">♥</span></button></div>',
      play: ({ stage, btn, a, spawn }) => {
        const wrap = q(stage, '.btn-wrap');
        return [
          a(q(btn, '.like-heart'), [
            { transform: 'scale(1)', color: HEART_OFF },
            { transform: 'scale(.7)', color: HEART_OFF, offset: .25 },
            { transform: 'scale(1.3)', color: HEART_ON, offset: .55 },
            { transform: 'scale(1)', color: HEART_ON },
          ], 700, { easing: 'cubic-bezier(.2, 0, 0, 1)' }),
          ...Array.from({ length: BURST.count }, (_, i) => {
            const dot = spawn('burst-dot', wrap);
            dot.style.background = BURST.colors[i % 2];
            const [x, y] = burstOffset(i, BURST.distance);
            const [x2, y2] = burstOffset(i, BURST.distance * 1.15);
            return a(dot, [
              { transform: 'translate(0, 0) scale(.6)', opacity: 0 },
              { transform: 'translate(0, 0) scale(.6)', opacity: 1, offset: .1 },
              { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1, offset: .6 },
              { transform: `translate(${x2}px, ${y2}px) scale(0)`, opacity: 0 },
            ], 500, { delay: 120, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'backwards' });
          }),
        ];
      },
      // 粒は飛ばさず、飛び散った先の位置にその場で出して消す。ハートは大きさを変えず色だけ変える
      reduced: ({ stage, btn, a, spawn }) => {
        const wrap = q(stage, '.btn-wrap');
        return [
          a(q(btn, '.like-heart'), [
            { color: HEART_OFF }, { color: HEART_ON, offset: .3 }, { color: HEART_ON },
          ], 700),
          ...Array.from({ length: BURST.count }, (_, i) => {
            const dot = spawn('burst-dot', wrap);
            const [x, y] = burstOffset(i, BURST.distance);
            Object.assign(dot.style, { background: BURST.colors[i % 2], left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` });
            return a(dot, [{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0 }],
              500, { delay: 120, fill: 'backwards' });
          }),
        ];
      },
    }),
    code: {
      css: `/* 粒（.burst-dot × 8）は、ボタンを包む .btn-wrap の中央に置く。--x / --y は飛ぶ先 */
.like-heart { display: inline-block; color: #9097a3; }
.is-liked .like-heart { animation: like-heart .7s cubic-bezier(.2, 0, 0, 1) forwards; }
@keyframes like-heart {
  0%   { transform: scale(1);   color: #9097a3; }
  25%  { transform: scale(.7);  color: #9097a3; }
  55%  { transform: scale(1.3); color: #ff4d6d; }
  100% { transform: scale(1);   color: #ff4d6d; }
}
.burst-dot {
  position: absolute; left: 50%; top: 50%;
  width: 8px; height: 8px; margin: -4px; border-radius: 50%;
  opacity: 0; pointer-events: none;
}
.is-liked .burst-dot { animation: burst .5s cubic-bezier(.2, 0, 0, 1) .12s backwards; }
@keyframes burst {
  0%   { transform: translate(0, 0) scale(.6); opacity: 0; }
  10%  { transform: translate(0, 0) scale(.6); opacity: 1; }
  60%  { transform: translate(var(--x), var(--y)) scale(1); opacity: 1; }
  100% { transform: translate(calc(var(--x) * 1.15), calc(var(--y) * 1.15)) scale(0); opacity: 0; }
}`,
      waapi: `heart.animate([
  { transform: 'scale(1)',   color: '#9097a3' },
  { transform: 'scale(.7)',  color: '#9097a3', offset: .25 },
  { transform: 'scale(1.3)', color: '#ff4d6d', offset: .55 },
  { transform: 'scale(1)',   color: '#ff4d6d' }
], { duration: 700, easing: 'cubic-bezier(.2, 0, 0, 1)' });

// 粒 8 つを、45° ずつの向きへ 38px 飛ばす（終わりは 1.15 倍の位置で消える）
dots.forEach((dot, i) => {
  const t = i / 8 * Math.PI * 2;
  const x = Math.round(Math.cos(t) * 38), y = Math.round(Math.sin(t) * 38);
  const x2 = Math.round(Math.cos(t) * 38 * 1.15), y2 = Math.round(Math.sin(t) * 38 * 1.15);
  dot.animate([
    { transform: 'translate(0, 0) scale(.6)', opacity: 0 },
    { transform: 'translate(0, 0) scale(.6)', opacity: 1, offset: .1 },
    { transform: 'translate(' + x + 'px, ' + y + 'px) scale(1)', opacity: 1, offset: .6 },
    { transform: 'translate(' + x2 + 'px, ' + y2 + 'px) scale(0)', opacity: 0 }
  ], { duration: 500, delay: 120, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'backwards' });
});`,
      reduced: `/* ハートは大きさを変えず色だけ変える。粒は飛ばさず、飛び散った先（left / top）に出して消す */
@media (prefers-reduced-motion: reduce) {
  .is-liked .like-heart { animation: like-heart-reduced .7s forwards; }
  .burst-dot { left: calc(50% + var(--x)); top: calc(50% + var(--y)); }
  .is-liked .burst-dot { animation: burst-reduced .5s .12s backwards; }
}
@keyframes like-heart-reduced {
  0% { color: #9097a3; }
  30%, 100% { color: #ff4d6d; }
}
@keyframes burst-reduced {
  0%, 100% { opacity: 0; }
  30% { opacity: 1; }
}`
    }
  },

  {
    id: 'submit-morph',
    cat: 'button',
    name: '送信 → 完了',
    feel: '明快・安心',
    use: '送信・保存など、結果を待つボタン',
    ms: SUBMIT_MS,
    msLabel: '丸くなる → 回る → チェック → 元に戻るまでの全体',
    easing: 'cubic-bezier(.4, 0, .2, 1)',
    desc: 'ボタンが丸く縮んで回転する輪に変わり、チェックが弾んで出たあと、元のボタンに戻る。',
    setup: (stage, ctx) => buttonDemo(stage, ctx, {
      html: `<button class="demo-btn submit-btn">
        <span class="sm-text sm-label">送信する</span><span class="sm-text sm-sending" aria-hidden="true">送信中…</span><span class="sm-text sm-done" aria-hidden="true">完了 ✓</span>
        <span class="sm-spinner" aria-hidden="true"></span><span class="sm-check" aria-hidden="true">✓</span>
      </button>`,
      play: ({ btn, a }) => {
        // ボタンの幅と高さ（縮小表示の影響を受けない offsetWidth / offsetHeight）。高さと同じ幅の丸に縮める
        const w = btn.offsetWidth, h = btn.offsetHeight;
        const ease = 'cubic-bezier(.4, 0, .2, 1)';
        const wide = { width: `${w}px`, paddingLeft: '32px', paddingRight: '32px', borderRadius: '14px' };
        const round = { width: `${h}px`, paddingLeft: '0px', paddingRight: '0px', borderRadius: `${h / 2}px` };
        return [
          a(btn, [
            { ...wide, easing: ease }, { ...round, offset: .17 }, { ...round, offset: .83, easing: ease }, wide,
          ], SUBMIT_MS),
          a(q(btn, '.sm-label'), [{ opacity: 1 }, { opacity: 0, offset: .08 }, { opacity: 0, offset: .92 }, { opacity: 1 }], SUBMIT_MS),
          a(q(btn, '.sm-spinner'), [
            { opacity: 0, transform: 'rotate(0deg)' },
            { opacity: 0, transform: 'rotate(0deg)', offset: .17 },
            { opacity: 1, transform: 'rotate(54deg)', offset: .2 },
            { opacity: 1, transform: 'rotate(720deg)', offset: .55 },
            { opacity: 0, transform: 'rotate(800deg)', offset: .6 },
            { opacity: 0, transform: 'rotate(800deg)' },
          ], SUBMIT_MS),
          a(q(btn, '.sm-check'), [
            { opacity: 0, transform: 'scale(.5)' },
            { opacity: 0, transform: 'scale(.5)', offset: .58, easing: 'cubic-bezier(.34, 1.56, .64, 1)' },
            { opacity: 1, transform: 'scale(1)', offset: .7 },
            { opacity: 1, transform: 'scale(1)', offset: .83 },
            { opacity: 0, transform: 'scale(1)', offset: .88 },
            { opacity: 0, transform: 'scale(1)' },
          ], SUBMIT_MS),
        ];
      },
      // 形は変えず、文字を「送信する → 送信中… → 完了 ✓ → 送信する」とフェードで切り替える
      reduced: ({ btn, a }) => [
        a(q(btn, '.sm-label'), [{ opacity: 1 }, { opacity: 0, offset: .08 }, { opacity: 0, offset: .92 }, { opacity: 1 }], SUBMIT_MS),
        a(q(btn, '.sm-sending'), [
          { opacity: 0 }, { opacity: 0, offset: .1 }, { opacity: 1, offset: .18 },
          { opacity: 1, offset: .55 }, { opacity: 0, offset: .6 }, { opacity: 0 },
        ], SUBMIT_MS),
        a(q(btn, '.sm-done'), [
          { opacity: 0 }, { opacity: 0, offset: .6 }, { opacity: 1, offset: .68 },
          { opacity: 1, offset: .85 }, { opacity: 0, offset: .9 }, { opacity: 0 },
        ], SUBMIT_MS),
      ],
    }),
    code: {
      css: `/* 中身は1つのマスに重ねる（.sm-label / .sm-spinner / .sm-check）。
   幅は JS で測って --w（元の幅）と --h（高さ）に入れる。
   飾り（.sm-spinner / .sm-check）と、ふだん見えていない文字（.sm-sending / .sm-done）には
   aria-hidden="true" を付け、スクリーンリーダーに続けて読まれないようにする */
.btn { display: inline-grid; box-sizing: border-box; overflow: hidden; white-space: nowrap; }
.btn > * { grid-area: 1 / 1; place-self: center; }
.sm-spinner {
  width: 20px; height: 20px; border-radius: 50%; opacity: 0;
  border: 3px solid rgba(11, 18, 32, .3); border-top-color: currentColor;
}
.sm-check { opacity: 0; font-size: 20px; }
.btn.is-sending { animation: sm-btn 1.8s forwards; }
.is-sending .sm-label   { animation: sm-label 1.8s forwards; }
.is-sending .sm-spinner { animation: sm-spinner 1.8s linear forwards; }
.is-sending .sm-check   { animation: sm-check 1.8s forwards; }
@keyframes sm-btn {
  0%, 100% { width: var(--w); padding-inline: 32px; border-radius: 14px;
             animation-timing-function: cubic-bezier(.4, 0, .2, 1); }
  17%, 83% { width: var(--h); padding-inline: 0; border-radius: calc(var(--h) / 2); }
  83% { animation-timing-function: cubic-bezier(.4, 0, .2, 1); }
}
@keyframes sm-label { 0%, 100% { opacity: 1; } 8%, 92% { opacity: 0; } }
@keyframes sm-spinner {
  0%, 17% { opacity: 0; transform: rotate(0deg); }
  20% { opacity: 1; transform: rotate(54deg); }
  55% { opacity: 1; transform: rotate(720deg); }
  60%, 100% { opacity: 0; transform: rotate(800deg); }
}
@keyframes sm-check {
  0% { opacity: 0; transform: scale(.5); }
  58% { opacity: 0; transform: scale(.5);
        animation-timing-function: cubic-bezier(.34, 1.56, .64, 1); }
  70%, 83% { opacity: 1; transform: scale(1); }
  88%, 100% { opacity: 0; transform: scale(1); }
}`,
      waapi: `const w = btn.offsetWidth, h = btn.offsetHeight;
const ease = 'cubic-bezier(.4, 0, .2, 1)';
const wide  = { width: w + 'px', paddingLeft: '32px', paddingRight: '32px', borderRadius: '14px' };
const round = { width: h + 'px', paddingLeft: '0px', paddingRight: '0px', borderRadius: h / 2 + 'px' };
const o = { duration: 1800 };
btn.animate([{ ...wide, easing: ease }, { ...round, offset: .17 },
             { ...round, offset: .83, easing: ease }, wide], o);
label.animate([{ opacity: 1 }, { opacity: 0, offset: .08 },
               { opacity: 0, offset: .92 }, { opacity: 1 }], o);
spinner.animate([
  { opacity: 0, transform: 'rotate(0deg)' },
  { opacity: 0, transform: 'rotate(0deg)', offset: .17 },
  { opacity: 1, transform: 'rotate(54deg)', offset: .2 },
  { opacity: 1, transform: 'rotate(720deg)', offset: .55 },
  { opacity: 0, transform: 'rotate(800deg)', offset: .6 },
  { opacity: 0, transform: 'rotate(800deg)' }
], o);
check.animate([
  { opacity: 0, transform: 'scale(.5)' },
  { opacity: 0, transform: 'scale(.5)', offset: .58, easing: 'cubic-bezier(.34, 1.56, .64, 1)' },
  { opacity: 1, transform: 'scale(1)', offset: .7 },
  { opacity: 1, transform: 'scale(1)', offset: .83 },
  { opacity: 0, transform: 'scale(1)', offset: .88 },
  { opacity: 0, transform: 'scale(1)' }
], o);`,
      reduced: `/* 形は変えず、文字を「送信する → 送信中… → 完了 ✓ → 送信する」とフェードで切り替える。
   3つの文字（.sm-label / .sm-sending / .sm-done）は同じマスに重ねる */
@media (prefers-reduced-motion: reduce) {
  .btn.is-sending, .is-sending .sm-spinner, .is-sending .sm-check { animation: none; }
  .sm-sending, .sm-done { opacity: 0; }
  .is-sending .sm-sending { animation: sm-sending 1.8s forwards; }
  .is-sending .sm-done    { animation: sm-done 1.8s forwards; }
}
@keyframes sm-sending { 0%, 10%, 60%, 100% { opacity: 0; } 18%, 55% { opacity: 1; } }
@keyframes sm-done    { 0%, 60%, 90%, 100% { opacity: 0; } 68%, 85% { opacity: 1; } }`
    }
  },

  {
    id: 'cheer-rise',
    cat: 'button',
    name: '応援の連打（下から湧く）',
    feel: '盛り上がり・連続',
    use: '拍手・応援・ハートの連打（押すたびに1つ湧く）',
    ms: 1200,
    msLabel: '1粒が昇って消える',
    easing: 'cubic-bezier(.2, 0, .4, 1)',
    desc: '押すたびにボタンが小さく沈み、ハートが1つ、左右に揺れながら上へ昇って消える。連打しても前の粒は止めずに重ねる。同時に出す粒は8個までで、超えたら古いものから消す。横の出だし位置は事前に決めた6通りを順に使い、重なりは判定しない。デモでは150msおきに7回押す（ボタンを押しても湧く）。時間は1粒が昇って消える長さ。',
    setup(stage, ctx) {
      const RISE = 1200, TAP_GAP = 150, TAPS = 7, MAX = 8, HEIGHT = 80, SWAY = 12;
      const LANES = [-12, 6, -4, 12, -8, 2];   // 横の出だし位置（px）。重なりを判定せず、順番に使う
      const COLORS = ['#ff6b8b', '#ffd166', '#6ea8ff'];
      const EASE = 'cubic-bezier(.2, 0, .4, 1)';
      stage.innerHTML = '<div class="btn-wrap cheer-wrap"><button class="demo-btn cheer-btn" aria-label="応援する"><span aria-hidden="true">♥</span></button></div>';
      const wrap = q(stage, '.cheer-wrap');
      const btn = q(stage, '.cheer-btn');
      /** @type {{ el: HTMLElement, anim: Animation }[]} */
      let live = [];
      let count = 0;
      let token = 0;

      /* 1回押す: ボタンが沈み、粒が1つ湧く。粒が消えたら解決する */
      const tap = () => {
        const reduced = ctx.reduced();
        btn.animate(reduced
          ? [{ filter: 'brightness(1.3)' }, { filter: 'brightness(1)' }]
          : [{ transform: 'scale(.92)' }, { transform: 'scale(1)' }],
          { duration: ctx.dur(200), easing: 'cubic-bezier(.2, 0, 0, 1)' });
        if (live.length >= MAX) {   // 上限を超えたら、古い粒から消す
          const old = /** @type {{ el: HTMLElement, anim: Animation }} */ (live.shift());
          old.anim.cancel();
          old.el.remove();
        }
        const i = count++;
        const x = LANES[i % LANES.length];
        const dir = i % 2 ? -1 : 1;
        const el = document.createElement('span');
        el.className = 'cheer-dot';
        el.textContent = '♥';
        el.style.color = COLORS[i % COLORS.length];
        wrap.append(el);
        let anim;
        if (reduced) {
          // 動きを減らす: 昇らせず、ボタンの上の決まった位置に出して消す
          Object.assign(el.style, { left: `calc(50% + ${x}px)`, top: `${-24 - (i % 3) * 18}px` });
          anim = el.animate([{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .6 }, { opacity: 0 }],
            { duration: ctx.dur(RISE), easing: 'linear' });
        } else {
          anim = el.animate([
            { transform: `translate(${x}px, 0) scale(.6)`, opacity: 0 },
            { transform: `translate(${x + SWAY * dir}px, ${-HEIGHT * .35}px) scale(1)`, opacity: 1, offset: .3 },
            { transform: `translate(${x - SWAY * dir * .5}px, ${-HEIGHT * .7}px) scale(1)`, opacity: 1, offset: .65 },
            { transform: `translate(${x}px, ${-HEIGHT}px) scale(.9)`, opacity: 0 },
          ], { duration: ctx.dur(RISE), easing: EASE });
        }
        const entry = { el, anim };
        live.push(entry);
        return settle(anim).then(() => {
          el.remove();
          live = live.filter(e => e !== entry);
        });
      };

      const run = async () => {
        const my = ++token;
        live.forEach(e => { e.anim.cancel(); e.el.remove(); });
        live = [];
        count = 0;
        const done = [];
        for (let t = 0; t < TAPS; t++) {
          if (my !== token || !wrap.isConnected) return;
          done.push(tap());
          await ctx.wait(TAP_GAP);
        }
        await Promise.all(done);
      };
      // 押すたびに1つ足す（前の粒は止めない）
      btn.addEventListener('click', () => { tap(); });
      return { run };
    },
    code: {
      css: `/* 粒は押すたびに JS で1つ作り、.cheer-wrap（ボタンを包む要素）の上端の中央に置く。
   --x: 横の出だし位置（事前に決めた数通りを順に使う）、--sway: 揺れ幅（左右交互に ±12px） */
.cheer-dot {
  position: absolute; left: 50%; top: 0; margin-left: -8px;
  pointer-events: none;
  animation: cheer-rise 1.2s cubic-bezier(.2, 0, .4, 1) forwards;
}
@keyframes cheer-rise {
  0%   { transform: translate(var(--x), 0) scale(.6); opacity: 0; }
  30%  { transform: translate(calc(var(--x) + var(--sway)), -28px) scale(1); opacity: 1; }
  65%  { transform: translate(calc(var(--x) - var(--sway) / 2), -56px) scale(1); opacity: 1; }
  100% { transform: translate(var(--x), -80px) scale(.9); opacity: 0; }
}
/* animationend で取り除く。同時に8個を超えたら、古いものから取り除く */`,
      waapi: `const LANES = [-12, 6, -4, 12, -8, 2];   // 重なりは判定せず、順番に使う
const live = [];   // 表示中の粒と、そのアニメーション
let count = 0;
button.addEventListener('click', () => {
  if (live.length >= 8) {   // 上限を超えたら古いものから、アニメーションも止めて消す
    const old = live.shift();
    old.anim.cancel();
    old.dot.remove();
  }
  const i = count++, x = LANES[i % LANES.length], s = i % 2 ? -12 : 12;
  const dot = document.createElement('span');
  dot.className = 'cheer-dot';
  dot.textContent = '♥';
  wrap.append(dot);
  const anim = dot.animate([
    { transform: \`translate(\${x}px, 0) scale(.6)\`, opacity: 0 },
    { transform: \`translate(\${x + s}px, -28px) scale(1)\`, opacity: 1, offset: .3 },
    { transform: \`translate(\${x - s / 2}px, -56px) scale(1)\`, opacity: 1, offset: .65 },
    { transform: \`translate(\${x}px, -80px) scale(.9)\`, opacity: 0 }
  ], { duration: 1200, easing: 'cubic-bezier(.2, 0, .4, 1)' });
  const entry = { dot, anim };
  live.push(entry);
  anim.finished.then(() => {
    dot.remove();
    const at = live.indexOf(entry);
    if (at >= 0) live.splice(at, 1);
  }, () => {});   // 上限で止めた粒（cancel）は、ここでは何もしない
});`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 昇らせず、ボタンの上の決まった位置（--x と、3段の高さ）に出して消す */
  .cheer-dot { left: calc(50% + var(--x)); top: var(--y); animation: cheer-fade 1.2s linear forwards; }
}
@keyframes cheer-fade {
  0%, 100% { opacity: 0; }
  20%, 60% { opacity: 1; }
}`
    }
  },

  {
    id: 'ticket-tear',
    cat: 'button',
    name: 'チケットのもぎり',
    feel: '達成・手触り',
    use: '入場・チェックイン・購入の完了',
    ms: 800,
    msLabel: '切れて半券が引き取られるまで',
    easing: 'cubic-bezier(.2, 0, 0, 1) → cubic-bezier(.4, 0, 1, 1)',
    desc: 'チケットを押すと、半券がミシン目の下側からめくれるように切れ、係員の手に引き取られるように右上へ抜けて消える。本体は引っ張られた分だけわずかに動いて戻り、丸で囲んだ「済」の印が押される。めくれるまでは速く出て止まり、引き取られるところは加速して去る。時間は切れてから半券が引き取られるまでの長さ。',
    setup: (stage, ctx) => buttonDemo(stage, ctx, {
      html: `<button class="demo-btn tk" aria-label="チケットをもぎる">
          <span class="tk-main"><small>OPEN 18:00</small><strong>A列 12番</strong><span class="tk-stamp" aria-hidden="true">済</span></span>
          <span class="tk-stub"><small>半券</small></span>
        </button>`,
      play: ({ btn, a }) => [
        // 本体: 半券を引かれた分だけ、わずかに右へ引っ張られて戻る
        a(q(btn, '.tk-main'), [
          { transform: 'translateX(0)' }, { transform: 'translateX(3px)', offset: .3 }, { transform: 'translateX(0)' },
        ], 500, { easing: 'cubic-bezier(.2, 0, 0, 1)' }),
        // 半券: 左上の角を支点に下側からめくれ（ミシン目の下が開く）、右上へ引き取られて消える
        a(q(btn, '.tk-stub'), [
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 1, easing: 'cubic-bezier(.2, 0, 0, 1)' },
          { transform: 'translate(2px, 0) rotate(-8deg)', opacity: 1, offset: .4, easing: 'cubic-bezier(.4, 0, 1, 1)' },
          { transform: 'translate(44px, -14px) rotate(-8deg)', opacity: 0 },
        ], 800, { fill: 'forwards' }),
        a(q(btn, '.tk-stamp'), [
          { transform: 'rotate(-12deg) scale(1.4)', opacity: 0 },
          { transform: 'rotate(-12deg) scale(1)', opacity: 1 },
        ], 300, { delay: 600, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'both' }),
      ],
      // めくれたり動いたりせず、半券は薄れて消え、印は不透明度だけで現れる
      reduced: ({ btn, a }) => [
        a(q(btn, '.tk-stub'), [{ opacity: 1 }, { opacity: 0 }], 500, { easing: 'linear', fill: 'forwards' }),
        a(q(btn, '.tk-stamp'), [{ opacity: 0 }, { opacity: 1 }], 300, { delay: 400, easing: 'linear', fill: 'both' }),
      ],
    }),
    code: {
      css: `/* 本体と半券を横に並べ、半券の左端をミシン目（破線）にする。印（.stamp）は本体に重ねる。
   半券は左上の角を支点に回す（下側からめくれて、ミシン目の下が開く） */
.ticket { display: flex; overflow: visible; }
.stub  { transform-origin: left top; }
.stamp { opacity: 0; transform: rotate(-12deg); }
.ticket.is-torn .main  { animation: tk-tug .5s cubic-bezier(.2, 0, 0, 1); }
.ticket.is-torn .stub  { animation: tk-take .8s forwards; }
.ticket.is-torn .stamp { animation: tk-stamp .3s cubic-bezier(.2, 0, 0, 1) .6s both; }
@keyframes tk-tug { 30% { transform: translateX(3px); } }
@keyframes tk-take {
  0%   { transform: translate(0, 0) rotate(0); animation-timing-function: cubic-bezier(.2, 0, 0, 1); }
  40%  { transform: translate(2px, 0) rotate(-8deg); opacity: 1; animation-timing-function: cubic-bezier(.4, 0, 1, 1); }
  100% { transform: translate(44px, -14px) rotate(-8deg); opacity: 0; }
}
@keyframes tk-stamp {
  from { transform: rotate(-12deg) scale(1.4); opacity: 0; }
  to   { transform: rotate(-12deg) scale(1);   opacity: 1; }
}`,
      waapi: `// 半券は CSS で transform-origin: left top にしておく
main.animate(
  [{ transform: 'translateX(0)' }, { transform: 'translateX(3px)', offset: .3 }, { transform: 'translateX(0)' }],
  { duration: 500, easing: 'cubic-bezier(.2, 0, 0, 1)' }
);
stub.animate([
  { transform: 'translate(0, 0) rotate(0deg)', opacity: 1, easing: 'cubic-bezier(.2, 0, 0, 1)' },
  { transform: 'translate(2px, 0) rotate(-8deg)', opacity: 1, offset: .4, easing: 'cubic-bezier(.4, 0, 1, 1)' },
  { transform: 'translate(44px, -14px) rotate(-8deg)', opacity: 0 }
], { duration: 800, fill: 'forwards' });
stamp.animate([
  { transform: 'rotate(-12deg) scale(1.4)', opacity: 0 },
  { transform: 'rotate(-12deg) scale(1)', opacity: 1 }
], { duration: 300, delay: 600, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'both' });`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* めくれたり動いたりせず、半券は薄れて消え、印は不透明度だけで現れる */
  .ticket.is-torn .main  { animation: none; }
  .ticket.is-torn .stub  { animation: tk-fade-out .5s linear forwards; }
  .ticket.is-torn .stamp { animation: tk-fade-in .3s linear .4s both; }
}
@keyframes tk-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes tk-fade-in  { from { opacity: 0; } to { opacity: 1; } }`
    }
  },
];
