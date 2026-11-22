/* モーション定義: 画面遷移。motions.js が集めて MOTIONS にする。追加したら stories/motions.stories.js にも1行足す */
import { q } from '../dom.js';

const SCREENS_HTML = `
  <div class="screen a">
    <h3>一覧</h3>
    <div class="row"></div><div class="row"></div><div class="row"></div><div class="row"></div>
  </div>
  <div class="screen b">
    <h3>詳細</h3>
    <div class="hero"></div><div class="row"></div><div class="row"></div>
  </div>`;

/* 「動きを減らす」版の入り方（不透明度だけ）の長さ */
const REDUCED_FADE_MS = 300;

/**
 * 「一覧 → 詳細」の画面遷移モーションの共通部分。
 * ここが持つもの: 2枚の画面の用意、次の画面を隠した初期状態、再生手順（入る → 見せる → 初期状態に戻す）、動きを減らす版（不透明度だけで入る）。
 * 何がどう動くかは、呼び出し側が hidden / enter / leave で渡す。
 * @param {HTMLElement} stage
 * @param {import('../types.js').Ctx} ctx
 * @param {object} spec
 * @param {Record<string, string>} spec.hidden  再生前の、次の画面を隠すインラインスタイル（camelCase）
 * @param {Keyframe[]} spec.enter  次の画面の入り方
 * @param {Keyframe[]} [spec.leave]  前の画面の去り方（なければ動かさない）
 * @param {number} spec.ms
 * @param {string} spec.easing
 */
function screenTransition(stage, ctx, { hidden, enter, leave, ms, easing }) {
  stage.innerHTML = SCREENS_HTML;
  const prev = q(stage, '.screen.a');
  const next = q(stage, '.screen.b');
  Object.assign(next.style, hidden);
  const run = async () => {
    /** @type {Animation[]} */
    const anims = [];
    if (ctx.reduced()) {
      next.style.cssText = '';
      anims.push(next.animate([{ opacity: 0 }, { opacity: 1 }],
                              { duration: ctx.dur(REDUCED_FADE_MS), fill: 'forwards' }));
    } else {
      const options = { duration: ctx.dur(ms), easing, fill: /** @type {FillMode} */ ('forwards') };
      anims.push(next.animate(enter, options));
      if (leave) anims.push(prev.animate(leave, options));
    }
    await Promise.all(anims.map(a => a.finished));
    await ctx.wait(700);   // 表示したまましばらく見せる
    anims.forEach(a => a.cancel());
    next.style.cssText = '';
    Object.assign(next.style, hidden);
  };
  return { run };
}

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
];
