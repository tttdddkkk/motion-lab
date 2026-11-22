/* モーション定義: 画面遷移。motions.js が集めて MOTIONS にする。追加したら stories/motions.stories.js にも1行足す */
import { q } from '../dom.js';

/* 一覧と詳細の中身。グリッドのタイルも同じ中身を複製して使う */
const SCREEN_A_INNER = `
    <h3>一覧</h3>
    <div class="row"></div><div class="row"></div><div class="row"></div><div class="row"></div>`;
const SCREEN_B_INNER = `
    <h3>詳細</h3>
    <div class="hero"></div><div class="row"></div><div class="row"></div>`;
const SCREENS_HTML = `<div class="screen a">${SCREEN_A_INNER}</div><div class="screen b">${SCREEN_B_INNER}</div>`;

/* 「動きを減らす」版の入り方（不透明度だけ）の長さ */
const REDUCED_FADE_MS = 300;

/**
 * 遷移の動き（通常版）を作る関数。setup のときに1回呼ばれ、追加の DOM（ノイズ・タイルなど）があればここで作る。
 * 返す関数は再生のたびに呼ばれ、作ったアニメーションを返す。後片付けは cancel だけで済むように作る
 * @typedef {(els: { stage: HTMLElement, prev: HTMLElement, next: HTMLElement }, ctx: import('../types.js').Ctx)
 *   => (options: KeyframeAnimationOptions) => Animation[]} TransitionBuild
 */

/**
 * 「一覧 → 詳細」の画面遷移モーションの共通部分。
 * ここが持つもの: 2枚の画面の用意、次の画面を隠した初期状態、再生手順（入る → 見せる → 初期状態に戻す）、動きを減らす版（不透明度だけで入る）。
 * 何がどう動くかは、呼び出し側が enter / leave（キーフレームだけで済む場合）か build（追加の DOM が要る場合）で渡す。
 * @param {HTMLElement} stage
 * @param {import('../types.js').Ctx} ctx
 * @param {object} spec
 * @param {Record<string, string>} spec.hidden  再生前の、次の画面を隠すインラインスタイル（camelCase）
 * @param {Keyframe[]} [spec.enter]  次の画面の入り方
 * @param {Keyframe[]} [spec.leave]  前の画面の去り方（なければ動かさない）
 * @param {TransitionBuild} [spec.build]  enter / leave の代わりに、動き全体を組み立てる
 * @param {number} spec.ms
 * @param {string} spec.easing
 */
function screenTransition(stage, ctx, { hidden, enter, leave, build, ms, easing }) {
  stage.innerHTML = SCREENS_HTML;
  const prev = q(stage, '.screen.a');
  const next = q(stage, '.screen.b');
  Object.assign(next.style, hidden);
  /** @type {(options: KeyframeAnimationOptions) => Animation[]} */
  const play = build ? build({ stage, prev, next }, ctx) : options => [
    ...(enter ? [next.animate(enter, options)] : []),
    ...(leave ? [prev.animate(leave, options)] : []),
  ];
  const run = async () => {
    const anims = ctx.reduced()
      ? (next.style.cssText = '',
         [next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ctx.dur(REDUCED_FADE_MS), fill: 'forwards' })])
      : play({ duration: ctx.dur(ms), easing, fill: 'forwards' });
    await Promise.all(anims.map(a => a.finished));
    await ctx.wait(700);   // 表示したまましばらく見せる
    anims.forEach(a => a.cancel());
    next.style.cssText = '';
    Object.assign(next.style, hidden);
  };
  return { run };
}

/* ---- ブラウン管のプツン（tv-off）の部品 ---- */

/* 段ごとに切り替わる（補間しない）キーフレームにする。ノイズのちらつきに使う */
const stepped = frames => frames.map(f => ({ ...f, easing: 'step-end' }));

/* ノイズの帯の位置（%）と、帯ごとの横ずれ（px）。乱数にせず、毎回同じ見え方にする */
const TV_BANDS = [
  { top: 14, height: 3, shift: [0, -18, 10, -6, 0] },
  { top: 31, height: 7, shift: [0, 12, -22, 8, 0] },
  { top: 52, height: 2, shift: [0, -8, 16, -12, 0] },
  { top: 66, height: 5, shift: [0, 20, -10, 4, 0] },
  { top: 83, height: 3, shift: [0, -12, 6, 18, 0] },
];

/* ノイズが見えている区間（全体を 0〜1 とした位置）。消える直前と、点く直後に入る */
const TV_NOISE = stepped([
  { offset: 0, opacity: 0 }, { offset: .02, opacity: 1 }, { offset: .08, opacity: .4 }, { offset: .13, opacity: 1 },
  { offset: .24, opacity: 0 }, { offset: .62, opacity: 0 }, { offset: .66, opacity: .8 }, { offset: .8, opacity: 0 },
  { offset: 1, opacity: 0 },
]);

/* 前の画面: 揺れる → 横一本の線に潰れる → 点になって消える */
const TV_PREV = [
  { offset: 0, transform: 'translateX(0) scale(1, 1)', filter: 'brightness(1)' },
  { offset: .06, transform: 'translateX(-6px) scale(1, 1)' },
  { offset: .12, transform: 'translateX(8px) scale(1, 1)' },
  { offset: .18, transform: 'translateX(-3px) scale(1, 1)' },
  { offset: .24, transform: 'translateX(0) scale(1, 1)', filter: 'brightness(1)', easing: 'cubic-bezier(.7, 0, 1, 1)' },
  { offset: .4, transform: 'translateX(0) scale(1, .004)', filter: 'brightness(5)', easing: 'ease-in' },
  { offset: .52, transform: 'translateX(0) scale(0, .004)', filter: 'brightness(5)' },
  { offset: 1, transform: 'translateX(0) scale(0, .004)', filter: 'brightness(5)' },
];

/* 次の画面: 暗転のあと、横一本の線が伸び、縦に開いて点く */
const TV_NEXT = [
  { offset: 0, opacity: 0, transform: 'scale(0, .004)', filter: 'brightness(5)' },
  { offset: .62, opacity: 0, transform: 'scale(0, .004)', filter: 'brightness(5)' },
  { offset: .62, opacity: 1, transform: 'scale(0, .004)', filter: 'brightness(5)', easing: 'cubic-bezier(.2, 0, 0, 1)' },
  { offset: .7, opacity: 1, transform: 'scale(1, .004)', filter: 'brightness(5)', easing: 'cubic-bezier(.2, 0, 0, 1)' },
  { offset: .84, opacity: 1, transform: 'scale(1, 1)', filter: 'brightness(1.4)' },
  { offset: 1, opacity: 1, transform: 'scale(1, 1)', filter: 'brightness(1)' },
];

/** @type {TransitionBuild} */
const buildTvOff = ({ stage, prev, next }) => {
  const off = document.createElement('div');
  off.className = 'tv-off';
  stage.prepend(off);   // 画面の後ろの黒。画面が潰れたときだけ見える
  const noise = document.createElement('div');
  noise.className = 'tv-noise';
  noise.innerHTML = TV_BANDS.map(b => `<div class="tv-band" style="top: ${b.top}%; height: ${b.height}%"></div>`).join('');
  stage.append(noise);
  const bands = [...noise.children];
  return options => [
    prev.animate(TV_PREV, options),
    next.animate(TV_NEXT, options),
    noise.animate(TV_NOISE, options),
    ...bands.map((band, i) => band.animate(
      stepped(TV_BANDS[i].shift.map(x => ({ transform: `translateX(${x}px)` }))),
      { ...options, duration: Number(options.duration) * .26 })),
  ];
};

/* ---- グリッドのパタパタ（grid-flip）の部品 ---- */

const GRID = { cols: 4, rows: 6, tileMs: 400, stepMs: 45 };
/* すべてのタイルが返りきるまで。左上から右下へ、斜めの波で順に返る */
const GRID_MS = GRID.tileMs + (GRID.cols - 1 + GRID.rows - 1) * GRID.stepMs;

/** @type {TransitionBuild} */
const buildGridFlip = ({ stage }, ctx) => {
  const { cols, rows } = GRID;
  const grid = document.createElement('div');
  grid.className = 'flip-grid';
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  // 各タイルは、表に一覧、裏に詳細の、自分の位置の切れ端を持つ（同じ中身を複製し、ずらして切り取る）
  const piece = (cls, inner, c, r) =>
    `<div class="flip-face ${cls}"><div class="screen ${cls === 'front' ? 'a' : 'b'}" style="inset: auto; left: ${-c * 100}%; top: ${-r * 100}%; width: ${cols * 100}%; height: ${rows * 100}%">${inner}</div></div>`;
  grid.innerHTML = Array.from({ length: cols * rows }, (_, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    return `<div class="flip-tile" data-wave="${c + r}">${piece('front', SCREEN_A_INNER, c, r)}${piece('back', SCREEN_B_INNER, c, r)}</div>`;
  }).join('');
  stage.append(grid);
  const tiles = /** @type {HTMLElement[]} */ ([...grid.children]);
  return options => [
    // タイルの層は、再生中だけ見せる（CSS の既定は opacity: 0。cancel で元に戻る）
    grid.animate([{ opacity: 1 }, { opacity: 1 }], { duration: options.duration, fill: 'forwards' }),
    ...tiles.map(tile => tile.animate(
      [{ transform: 'perspective(600px) rotateY(0deg)' }, { transform: 'perspective(600px) rotateY(180deg)' }],
      { ...options, duration: ctx.dur(GRID.tileMs), delay: ctx.dur(Number(tile.dataset.wave) * GRID.stepMs) })),
  ];
};

/* 動きを減らす版の表示用コード。transform / clip-path を使わず、不透明度だけで入る */
const reducedCode = `@media (prefers-reduced-motion: reduce) {
  .next { transform: none; opacity: 0; transition: opacity .3s linear; }
  .next.is-open { opacity: 1; }
}`;

/** @type {import('../types.js').Motion[]} */
export const TRANSITION_MOTIONS = [
  {
    id: 'circle-reveal',
    cat: 'transition',
    name: '円形リヴィール',
    feel: '力強い・展開',
    use: '画面遷移 / 詳細表示',
    ms: 700,
    msLabel: '円が広がるまで',
    easing: 'cubic-bezier(.65, 0, .35, 1)',
    desc: '画面下部から円形に広がって次の画面に切り替わる。',
    setup: (stage, ctx) => screenTransition(stage, ctx, {
      hidden: { clipPath: 'circle(0% at 50% 88%)' },
      enter: [{ clipPath: 'circle(0% at 50% 88%)' }, { clipPath: 'circle(150% at 50% 88%)' }],
      ms: 700,
      easing: 'cubic-bezier(.65, 0, .35, 1)'
    }),
    code: {
      css: `.next {
  clip-path: circle(0% at 50% 88%);
  transition: clip-path .7s cubic-bezier(.65, 0, .35, 1);
}
.next.is-open {
  clip-path: circle(150% at 50% 88%);
}`,
      waapi: `next.animate(
  [{ clipPath: 'circle(0% at 50% 88%)' },
   { clipPath: 'circle(150% at 50% 88%)' }],
  { duration: 700,
    easing: 'cubic-bezier(.65, 0, .35, 1)',
    fill: 'forwards' }
);`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  .next { clip-path: none; opacity: 0; transition: opacity .3s linear; }
  .next.is-open { opacity: 1; }
}`
    }
  },
  {
    id: 'slide-push',
    cat: 'transition',
    name: '横スライド（押し出し）',
    feel: 'キビキビ・標準',
    use: '階層を進む遷移（一覧 → 詳細）',
    ms: 400,
    msLabel: '次の画面が入りきるまで',
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    desc: '次の画面が右から入り、前の画面は少しだけ左へ下がる。',
    setup: (stage, ctx) => screenTransition(stage, ctx, {
      hidden: { transform: 'translateX(100%)' },
      enter: [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
      leave: [{ transform: 'translateX(0)' }, { transform: 'translateX(-30%)' }],
      ms: 400,
      easing: 'cubic-bezier(.2, 0, 0, 1)'
    }),
    code: {
      css: `.next {
  transform: translateX(100%);
  transition: transform .4s cubic-bezier(.2, 0, 0, 1);
}
.prev {
  transition: transform .4s cubic-bezier(.2, 0, 0, 1);
}
.is-open .next { transform: translateX(0); }
.is-open .prev { transform: translateX(-30%); }`,
      waapi: `const options = { duration: 400, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'forwards' };
next.animate(
  [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], options);
prev.animate(
  [{ transform: 'translateX(0)' }, { transform: 'translateX(-30%)' }], options);`,
      reduced: reducedCode
    }
  },
  {
    id: 'sheet-rise',
    cat: 'transition',
    name: '下からせり上がり',
    feel: '重厚・モーダル',
    use: 'モーダル・補助的な画面（シート）',
    ms: 450,
    msLabel: '画面がせり上がるまで',
    easing: 'cubic-bezier(.32, .72, 0, 1)',
    desc: '次の画面が下から上へ入る。前の画面は動かず、その上に重なる。',
    setup: (stage, ctx) => screenTransition(stage, ctx, {
      hidden: { transform: 'translateY(100%)' },
      enter: [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
      ms: 450,
      easing: 'cubic-bezier(.32, .72, 0, 1)'
    }),
    code: {
      css: `.next {
  transform: translateY(100%);
  transition: transform .45s cubic-bezier(.32, .72, 0, 1);
}
.next.is-open {
  transform: translateY(0);
}`,
      waapi: `next.animate(
  [{ transform: 'translateY(100%)' },
   { transform: 'translateY(0)' }],
  { duration: 450,
    easing: 'cubic-bezier(.32, .72, 0, 1)',
    fill: 'forwards' }
);`,
      reduced: reducedCode
    }
  },
  {
    id: 'wipe',
    cat: 'transition',
    name: 'ワイプ',
    feel: 'シャープ・切り替え',
    use: 'ステップ送り、前後の入れ替え',
    ms: 600,
    msLabel: 'ワイプが終わるまで',
    easing: 'cubic-bezier(.65, 0, .35, 1)',
    desc: '左から右へ境界線が走り、次の画面に切り替わる。',
    setup: (stage, ctx) => screenTransition(stage, ctx, {
      hidden: { clipPath: 'inset(0 100% 0 0)' },
      enter: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
      ms: 600,
      easing: 'cubic-bezier(.65, 0, .35, 1)'
    }),
    code: {
      css: `.next {
  clip-path: inset(0 100% 0 0);
  transition: clip-path .6s cubic-bezier(.65, 0, .35, 1);
}
.next.is-open {
  clip-path: inset(0 0 0 0);
}`,
      waapi: `next.animate(
  [{ clipPath: 'inset(0 100% 0 0)' },
   { clipPath: 'inset(0 0 0 0)' }],
  { duration: 600,
    easing: 'cubic-bezier(.65, 0, .35, 1)',
    fill: 'forwards' }
);`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  .next { clip-path: none; opacity: 0; transition: opacity .3s linear; }
  .next.is-open { opacity: 1; }
}`
    }
  },
  {
    id: 'zoom-fade',
    cat: 'transition',
    name: '拡大フェード',
    feel: '高級感・やわらかい',
    use: '強調したい画面の登場、ダイアログ的な切り替え',
    ms: 450,
    msLabel: '次の画面が現れきるまで',
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    desc: '次の画面が少し小さい状態から、拡大しながら現れる。',
    setup: (stage, ctx) => screenTransition(stage, ctx, {
      hidden: { opacity: '0', transform: 'scale(.92)' },
      enter: [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'scale(1)' }],
      ms: 450,
      easing: 'cubic-bezier(.2, 0, 0, 1)'
    }),
    code: {
      css: `.next {
  opacity: 0;
  transform: scale(.92);
  transition: opacity .45s cubic-bezier(.2, 0, 0, 1),
              transform .45s cubic-bezier(.2, 0, 0, 1);
}
.next.is-open {
  opacity: 1;
  transform: scale(1);
}`,
      waapi: `next.animate(
  [{ opacity: 0, transform: 'scale(.92)' },
   { opacity: 1, transform: 'scale(1)' }],
  { duration: 450,
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    fill: 'forwards' }
);`,
      reduced: reducedCode
    }
  },
  {
    id: 'cross-fade',
    cat: 'transition',
    name: 'クロスフェード',
    feel: 'やわらかい・控えめ',
    use: 'タブ切り替えなど、関係の弱い同階層の画面切り替え',
    ms: 350,
    msLabel: '次の画面が現れきるまで',
    easing: 'ease-in-out',
    desc: '位置を動かさず、不透明度だけで次の画面に切り替わる。',
    setup: (stage, ctx) => screenTransition(stage, ctx, {
      hidden: { opacity: '0' },
      enter: [{ opacity: 0 }, { opacity: 1 }],
      ms: 350,
      easing: 'ease-in-out'
    }),
    code: {
      css: `.next {
  opacity: 0;
  transition: opacity .35s ease-in-out;
}
.next.is-open {
  opacity: 1;
}`,
      waapi: `next.animate(
  [{ opacity: 0 }, { opacity: 1 }],
  { duration: 350,
    easing: 'ease-in-out',
    fill: 'forwards' }
);`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  .next { transition-duration: .3s; transition-timing-function: linear; }
}`
    }
  },
  {
    id: 'cube-rotate',
    cat: 'transition',
    name: 'キューブ回転',
    feel: '立体的・遊び心',
    use: '同じ階層の横移動（タブ・ステップ）を目立たせたいとき',
    ms: 700,
    msLabel: '箱が回りきるまで',
    easing: 'cubic-bezier(.65, 0, .35, 1)',
    desc: '画面を箱の側面に見立て、縦軸で90度回して次の面に切り替える。',
    setup: (stage, ctx) => screenTransition(stage, ctx, {
      hidden: { transformOrigin: '0% 50%', transform: 'perspective(1000px) translateX(100%) rotateY(90deg)' },
      enter: [{ transform: 'perspective(1000px) translateX(100%) rotateY(90deg)' },
              { transform: 'perspective(1000px) translateX(0) rotateY(0deg)' }],
      leave: [{ transformOrigin: '100% 50%', transform: 'perspective(1000px) translateX(0) rotateY(0deg)' },
              { transformOrigin: '100% 50%', transform: 'perspective(1000px) translateX(-100%) rotateY(-90deg)' }],
      ms: 700,
      easing: 'cubic-bezier(.65, 0, .35, 1)'
    }),
    code: {
      css: `/* 前の画面は右端、次の画面は左端を軸に回す。2枚の辺が合わさって箱の角になる */
.prev, .next {
  transition: transform .7s cubic-bezier(.65, 0, .35, 1);
}
.prev { transform-origin: 100% 50%; }
.next {
  transform-origin: 0% 50%;
  transform: perspective(1000px) translateX(100%) rotateY(90deg);
}
.is-open .prev {
  transform: perspective(1000px) translateX(-100%) rotateY(-90deg);
}
.is-open .next {
  transform: perspective(1000px) translateX(0) rotateY(0deg);
}`,
      waapi: `const options = { duration: 700, easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'forwards' };
prev.style.transformOrigin = '100% 50%';
next.style.transformOrigin = '0% 50%';
prev.animate(
  [{ transform: 'perspective(1000px) translateX(0) rotateY(0deg)' },
   { transform: 'perspective(1000px) translateX(-100%) rotateY(-90deg)' }], options);
next.animate(
  [{ transform: 'perspective(1000px) translateX(100%) rotateY(90deg)' },
   { transform: 'perspective(1000px) translateX(0) rotateY(0deg)' }], options);`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  .prev, .next { transform: none; }
  .next { opacity: 0; transition: opacity .3s linear; }
  .is-open .next { opacity: 1; }
}`
    }
  },
  {
    id: 'tv-off',
    cat: 'transition',
    name: 'ブラウン管のプツン',
    feel: 'レトロ・ノイジー',
    use: 'ゲーム・演出寄りの画面切り替え、チャンネルを変える比喩',
    ms: 800,
    msLabel: 'ノイズ → 消灯 → 次の画面が点くまで',
    easing: 'linear',
    desc: '横ノイズが走って画面が一本の線に潰れ、暗転のあと、次の画面が線から開いて点く。全体は linear で、区間ごとにイージングを変える。',
    setup: (stage, ctx) => screenTransition(stage, ctx, {
      hidden: { opacity: '0' },
      build: buildTvOff,
      ms: 800,
      easing: 'linear'
    }),
    code: {
      css: `/* 画面の後ろに黒（.tv-off）、上にノイズの帯（.tv-noise > .tv-band）を置く */
.is-open .prev  { animation: tv-prev .8s linear forwards; }
.is-open .next  { animation: tv-next .8s linear forwards; }
.is-open .tv-noise { animation: tv-noise .8s step-end forwards; }
.next { opacity: 0; }
.tv-noise { opacity: 0; pointer-events: none; }
.tv-band {
  position: absolute; left: -10%; right: -10%;
  background: repeating-linear-gradient(90deg,
    rgba(255,255,255,.85) 0 2px, rgba(0,0,0,.5) 2px 5px);
  mix-blend-mode: screen;
}
@keyframes tv-prev {
  0%, 24% { transform: scale(1, 1); filter: brightness(1);
            animation-timing-function: cubic-bezier(.7, 0, 1, 1); }
  40%  { transform: scale(1, .004); filter: brightness(5);
         animation-timing-function: ease-in; }
  52%, 100% { transform: scale(0, .004); filter: brightness(5); }
}
@keyframes tv-next {
  0%, 61.9% { opacity: 0; }
  62%  { opacity: 1; transform: scale(0, .004); filter: brightness(5);
         animation-timing-function: cubic-bezier(.2, 0, 0, 1); }
  70%  { transform: scale(1, .004); filter: brightness(5);
         animation-timing-function: cubic-bezier(.2, 0, 0, 1); }
  84%  { transform: scale(1, 1); filter: brightness(1.4); }
  100% { opacity: 1; transform: scale(1, 1); filter: brightness(1); }
}
@keyframes tv-noise {
  0% { opacity: 0; } 2% { opacity: 1; } 8% { opacity: .4; }
  13% { opacity: 1; } 24% { opacity: 0; }
  66% { opacity: .8; } 80%, 100% { opacity: 0; }
}`,
      waapi: `const options = { duration: 800, easing: 'linear', fill: 'forwards' };
const step = frames => frames.map(f => ({ ...f, easing: 'step-end' }));
prev.animate([
  { offset: 0,   transform: 'scale(1, 1)', filter: 'brightness(1)' },
  { offset: .24, transform: 'scale(1, 1)', filter: 'brightness(1)', easing: 'cubic-bezier(.7, 0, 1, 1)' },
  { offset: .4,  transform: 'scale(1, .004)', filter: 'brightness(5)', easing: 'ease-in' },
  { offset: .52, transform: 'scale(0, .004)', filter: 'brightness(5)' },
  { offset: 1,   transform: 'scale(0, .004)', filter: 'brightness(5)' }
], options);
next.animate([
  { offset: 0,   opacity: 0, transform: 'scale(0, .004)', filter: 'brightness(5)' },
  { offset: .62, opacity: 0, transform: 'scale(0, .004)', filter: 'brightness(5)' },
  { offset: .62, opacity: 1, transform: 'scale(0, .004)', filter: 'brightness(5)', easing: 'cubic-bezier(.2, 0, 0, 1)' },
  { offset: .7,  opacity: 1, transform: 'scale(1, .004)', filter: 'brightness(5)', easing: 'cubic-bezier(.2, 0, 0, 1)' },
  { offset: .84, opacity: 1, transform: 'scale(1, 1)', filter: 'brightness(1.4)' },
  { offset: 1,   opacity: 1, transform: 'scale(1, 1)', filter: 'brightness(1)' }
], options);
noise.animate(step([
  { offset: 0, opacity: 0 }, { offset: .02, opacity: 1 }, { offset: .08, opacity: .4 },
  { offset: .13, opacity: 1 }, { offset: .24, opacity: 0 }, { offset: .62, opacity: 0 },
  { offset: .66, opacity: .8 }, { offset: .8, opacity: 0 }, { offset: 1, opacity: 0 }
]), options);
// 帯ごとに横へずらす（例: 1本目）
band.animate(step([0, -18, 10, -6, 0].map(x => ({ transform: \`translateX(\${x}px)\` }))),
  { ...options, duration: 800 * .26 });`,
      reduced: `/* ノイズのちらつき（点滅）と潰れる動きを外し、不透明度だけで切り替える */
@media (prefers-reduced-motion: reduce) {
  .tv-noise { display: none; }
  .is-open .prev, .is-open .next { animation: none; }
  .next { opacity: 0; transition: opacity .3s linear; }
  .is-open .next { opacity: 1; }
}`
    }
  },
  {
    id: 'grid-flip',
    cat: 'transition',
    name: 'グリッドのパタパタ',
    feel: '軽快・にぎやか',
    use: 'ギャラリーやダッシュボードの切り替え、イベント告知などの演出',
    ms: GRID_MS,
    msLabel: 'すべてのタイルが返りきるまで（1枚 400ms、45ms ずつずらす）',
    easing: 'cubic-bezier(.4, 0, .2, 1)',
    desc: '画面を 4×6 のタイルに分け、左上から右下へ波のように1枚ずつ裏返して次の画面にする。',
    setup: (stage, ctx) => screenTransition(stage, ctx, {
      hidden: { opacity: '0' },
      build: buildGridFlip,
      ms: GRID_MS,
      easing: 'cubic-bezier(.4, 0, .2, 1)'
    }),
    code: {
      css: `/* 各タイルの表に前の画面、裏に次の画面の切れ端を置く。--wave は 列 + 行 */
.flip-tile {
  position: relative; transform-style: preserve-3d;
  transition: transform .4s cubic-bezier(.4, 0, .2, 1);
  transition-delay: calc(var(--wave) * 45ms);
}
.flip-face { position: absolute; inset: 0; overflow: hidden; backface-visibility: hidden; }
.flip-face.back { transform: rotateY(180deg); }
.is-open .flip-tile { transform: perspective(600px) rotateY(180deg); }`,
      waapi: `tiles.forEach(tile => {
  tile.animate(
    [{ transform: 'perspective(600px) rotateY(0deg)' },
     { transform: 'perspective(600px) rotateY(180deg)' }],
    { duration: 400,
      delay: Number(tile.dataset.wave) * 45,   // 列 + 行。左上から右下への波
      easing: 'cubic-bezier(.4, 0, .2, 1)',
      fill: 'forwards' }
  );
});`,
      reduced: `/* タイルを使わず、不透明度だけで切り替える */
@media (prefers-reduced-motion: reduce) {
  .flip-grid { display: none; }
  .next { opacity: 0; transition: opacity .3s linear; }
  .is-open .next { opacity: 1; }
}`
    }
  },
];
