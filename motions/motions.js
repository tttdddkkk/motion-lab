/* ============================================================
   モーション定義（1モーション = 1オブジェクト）
   追加したら stories/motions.stories.js にも1行足す（テストで漏れを検出する）。
   setup(stage, ctx) -> { run(x?, y?) : Promise }
   ctx.dur(ms)    再生速度を反映した時間
   ctx.wait(ms)   dur(ms) だけ待つ Promise
   ctx.reduced()  「動きを減らす」がONか
   ctx は makeCtx で作る（ビューアとストーリーで共通）。
   ============================================================ */

/**
 * モーションに渡す ctx を作る。rate は再生速度を返す関数（ビューアで途中から変わるため、値ではなく関数）。
 * @param {{ rate?: () => number, reduced?: () => boolean }} [options]
 * @returns {import('./types.js').Ctx}
 */
export function makeCtx({ rate = () => 1, reduced = () => false } = {}) {
  const dur = ms => ms / rate();
  return { dur, reduced, wait: ms => new Promise(resolve => setTimeout(resolve, dur(ms))) };
}

/* アニメーションの終了を待つ。cancel されても例外にしない */
const settle = animation => animation.finished.catch(() => {});

/* 要素を1つ取る。なければ、何を探したかが分かる例外にする（null のまま進めない） */
function q(root, selector) {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`要素が見つからない: ${selector}`);
  return /** @type {HTMLElement} */ (el);
}

/* 要素をすべて配列で取る */
function qa(root, selector) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(selector)]);
}


/* 流れる文字+シークの共通実装。vertical で横（右→左）と縦（下→上）を切り替える。
   映像と重ねない・行は固定・投稿や重なり回避は作らない（docs/adr/0008, 0013）。
   再生・シークの操作は withSeek に任せ、ここでは文字の配置と動きだけを作る */
function flowSeek(stage, ctx, { vertical }) {
  const CROSS = vertical ? 4000 : 3000;   // 1つの文字が枠を横切る時間
  // 全件を同じ距離・同じ時間で流して、速さをそろえる（文字ごとに距離を変えると、高い文字だけ速くなる）。
  // 終了位置は、最も長い（高い）文字が枠の外に出きる位置。
  //   横: 固定値。縦: 折り返しで高さが変わるため、再生のたびに最も高い文字の高さから決める（makeAnims 内）
  const END = vertical ? null : '-140px';
  const axis = vertical ? 'Y' : 'X';
  const ITEMS = [
    { t: 0,    lane: 0, text: 'はじまった' },
    { t: 400,  lane: 1, text: 'こんばんは' },
    { t: 900,  lane: 2, text: '音がいい' },
    { t: 1600, lane: 0, text: 'ここ好き' },
    // 縦版は枠が狭く折り返すため、2行になる長い文字を1件入れる
    { t: 2200, lane: 1, text: vertical ? 'このサビが何度聴いても好き' : 'なるほど' },
    { t: 2800, lane: 2, text: 'もう一回見たい' },
    { t: 3400, lane: 0, text: 'きれい' },
    { t: 4000, lane: 1, text: 'わかる' },
    { t: 4700, lane: 2, text: 'おつかれさま' },
  ];
  // 縦版: 1行の文字どうしの出現間隔。前の文字が1行より高ければ、そのぶん次を遅らせて、見た目の隙間をそろえる。
  // 縦版の出現時刻は ITEMS の t ではなく、文字の高さから makeAnims で計算し直す
  const STEP = 600;
  let times = ITEMS.map(i => i.t);   // 出現時刻。縦版は makeAnims で上書きする
  let TOTAL = Math.max(...times) + CROSS;

  stage.innerHTML = `
    <div class="flow${vertical ? ' is-vertical' : ''}">
      <div class="flow-media"></div>
      <div class="flow-frame">${ITEMS.map(i =>
        `<span class="flow-item"${vertical ? '' : ` style="top:${8 + i.lane * 28}px"`}>${i.text}</span>`).join('')}</div>
      ${SEEK_BAR}
    </div>`;
  const root = q(stage, '.flow');
  const frame = q(stage, '.flow-frame');
  const els = qa(stage, '.flow-item');

  // 縦・動きを減らす: 各文字の top を決める。表示時間が重なる文字どうしだけを避ける
  const packSlots = () => {
    const PAD = 8, H = frame.clientHeight;
    const heights = els.map(el => el.offsetHeight);
    // 文字の間隔 gap で、全件を置けるか試す。置けなかった文字があれば ok = false
    const pack = gap => {
      const placed = [];
      let cursor = PAD;   // 次に置く位置。下に空きがあるうちは下へ足していく
      let ok = true;
      const ys = heights.map((h, i) => {
        const t = times[i];
        const active = placed.filter(o => o.end > t);   // 今も表示中の文字
        const fits = y => y + h <= H - PAD && active.every(o => y + h + gap <= o.y || o.y + o.h + gap <= y);
        // 下に空きがあればそこへ。足りなくなったら上に戻り、消えた文字の位置を再利用する
        const candidates = [PAD, cursor, ...active.map(o => o.y + o.h + gap)].sort((a, b) => a - b);
        let y = candidates.find(c => c >= cursor && fits(c)) ?? candidates.find(fits);
        if (y === undefined) {
          // 足りないときだけ、最も早く消える文字の位置に重ねる（表示中の文字がなければ上端に置く）
          ok = false;
          y = active.length ? active.reduce((a, o) => (o.end < a.end ? o : a)).y : PAD;
        }
        placed.push({ y, h, end: t + CROSS });
        cursor = y + h + gap;
        return y;
      });
      return { ys, ok };
    };
    // 枠が低いときは、重ねる前に間隔を詰める（8px → 2px → 0px）
    for (const gap of [8, 2]) {
      const r = pack(gap);
      if (r.ok) return r.ys;
    }
    return pack(0).ys;
  };

  // 文字ごとのアニメーションを作る（withSeek が時計と一緒に管理する）
  const makeAnims = () => {
    const W = vertical ? frame.clientHeight : frame.clientWidth;
    const reduced = ctx.reduced();
    const heights = els.map(el => el.offsetHeight);
    const maxH = Math.max(...heights);
    if (vertical) {
      // 全件が同じ速さ（枠の高さ + 最も高い文字ぶんを CROSS で進む）なので、
      // 前の文字が1行より高いぶんの時間を足すと、文字どうしの見た目の隙間がそろう
      const minH = Math.min(...heights);
      const speed = (W + maxH) / CROSS;   // px/ms
      times = heights.map(() => 0);
      for (let i = 1; i < times.length; i++) times[i] = times[i - 1] + STEP + (heights[i - 1] - minH) / speed;
      TOTAL = times[times.length - 1] + CROSS;
    }
    const ys = vertical && reduced ? packSlots() : [];
    const endPos = vertical ? `${-maxH}px` : END;
    return els.map((el, i) => {
      const { lane } = ITEMS[i];
      const t = times[i];
      el.classList.toggle('is-static', reduced);
      if (vertical) el.style.top = reduced ? `${ys[i]}px` : '';
      if (!reduced) {
        return el.animate(
          [{ transform: `translate${axis}(${W}px)` }, { transform: `translate${axis}(${endPos})` }],
          { duration: ctx.dur(CROSS), delay: ctx.dur(t), easing: 'linear', fill: 'both' }
        );
      }
      // 静止表示。横: 同じ行の次の文字が出るまでを表示期間にして、重ならないようにする。
      // 縦: 位置は packSlots で決める。表示期間は CROSS
      const next = vertical ? -1 : ITEMS.findIndex((o, j) => j > i && o.lane === lane);
      const end = Math.min(t + CROSS, next >= 0 ? times[next] : Infinity);
      return el.animate(
        [{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .9 }, { opacity: 0 }],
        { duration: ctx.dur(end - t), delay: ctx.dur(t), easing: 'linear', fill: 'both' }
      );
    });
  };

  return withSeek(root, ctx, () => TOTAL, makeAnims);
}

/* シークバー付きの再生（テキストの字幕・同期ハイライトで共通）。
   root の中の .flow-play / .flow-range を使う。makeAnims() が返すアニメーションと
   時計（root.animate([])）の currentTime をそろえて、進めたり戻したりする */
/**
 * @param {HTMLElement} root
 * @param {import('./types.js').Ctx} ctx
 * @param {() => number} total  全体の長さ（ms）。縦の流れる文字のように、再生のたびに変わるものがあるため関数で渡す
 * @param {() => Animation[]} makeAnims
 * @returns {import('./types.js').MotionInstance}
 */
function withSeek(root, ctx, total, makeAnims) {
  const playBtn = q(root, '.flow-play');
  const range = /** @type {HTMLInputElement} */ (q(root, '.flow-range'));
  /** @type {Animation[]} */
  let anims = [];
  /** @type {Animation | null} */
  let clock = null;
  let dragging = false;
  let wasPlaying = false;
  let ticking = false;

  const isPlaying = () => clock?.playState === 'running';
  const setLabel = () => {
    playBtn.textContent = isPlaying() ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', isPlaying() ? '一時停止' : '再生');
  };
  const seek = fraction => {
    const time = fraction * ctx.dur(total());
    anims.forEach(a => { a.currentTime = time; });
  };
  // シークバーの表示更新は再生中だけ回し、二重に起動しない
  const tick = () => {
    if (!clock || clock.playState === 'idle') { ticking = false; return; }
    if (!dragging) range.value = String(Math.round(Number(clock.currentTime) / ctx.dur(total()) * 1000));
    setLabel();
    ticking = clock.playState === 'running';
    if (ticking) requestAnimationFrame(tick);
  };
  const startTick = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(tick);
  };
  const build = () => {
    anims.forEach(a => a.cancel());
    anims = makeAnims();
    clock = root.animate([], { duration: ctx.dur(total()) });
    anims.push(clock);
    startTick();
  };

  playBtn.addEventListener('click', () => {
    if (!clock) return;
    if (isPlaying()) anims.forEach(a => a.pause());
    else {
      if (clock.playState === 'finished') seek(0);
      anims.forEach(a => a.play());
      startTick();
    }
    setLabel();
  });
  range.addEventListener('pointerdown', () => {
    dragging = true;
    wasPlaying = isPlaying();
    anims.forEach(a => a.pause());
  });
  range.addEventListener('input', () => seek(Number(range.value) / 1000));
  range.addEventListener('change', () => {
    if (dragging && wasPlaying) {
      anims.forEach(a => a.play());
      startTick();
    }
    dragging = false;
    setLabel();
  });

  const run = () => {
    build();
    return /** @type {Animation} */ (clock).finished.then(() => setLabel());
  };
  // 再生前でも時刻0の状態で表示し、シークできるようにする（位置の計算に DOM の寸法が要る）
  requestAnimationFrame(() => {
    if (clock || !root.isConnected) return;
    build();
    anims.forEach(a => a.pause());
    setLabel();
  });
  return { run };
}

const SEEK_BAR = `
  <div class="flow-bar">
    <button class="flow-play" type="button" aria-label="一時停止">❚❚</button>
    <input class="flow-range" type="range" min="0" max="1000" value="0" aria-label="再生位置">
  </div>`;

/** @type {import('./types.js').Motion[]} */
export const MOTIONS = [
  {
    id: 'press-bounce',
    cat: 'button',
    name: '押下バウンス',
    feel: '弾む・軽快',
    use: '主要ボタン / タップ',
    ms: 450,
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
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    desc: 'タップした位置から波紋が広がって消える。',
    setup(stage, ctx) {
      stage.innerHTML = '<button class="demo-btn">タップしてね</button>';
      const btn = q(stage, '.demo-btn');
      const run = (x, y) => {
        const r = btn.getBoundingClientRect();
        const cx = x ?? r.width / 2, cy = y ?? r.height / 2;
        const size = Math.max(r.width, r.height) * 2.2;
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
        const r = btn.getBoundingClientRect();
        run(e.clientX - r.left, e.clientY - r.top);
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
    id: 'circle-reveal',
    cat: 'transition',
    name: '円形リヴィール',
    feel: '力強い・展開',
    use: '画面遷移 / 詳細表示',
    ms: 700,
    easing: 'cubic-bezier(.65, 0, .35, 1)',
    desc: '画面下部から円形に広がって次の画面に切り替わる。',
    setup(stage, ctx) {
      const origin = '50% 88%';
      stage.innerHTML = `
        <div class="screen a">
          <h3>一覧</h3>
          <div class="row"></div><div class="row"></div><div class="row"></div><div class="row"></div>
        </div>
        <div class="screen b">
          <h3>詳細</h3>
          <div class="hero"></div><div class="row"></div><div class="row"></div>
        </div>`;
      const next = q(stage, '.screen.b');
      next.style.clipPath = `circle(0% at ${origin})`;
      const { wait } = ctx;
      const run = async () => {
        let anim;
        if (ctx.reduced()) {
          next.style.clipPath = 'none';
          anim = next.animate([{ opacity: 0 }, { opacity: 1 }],
                        { duration: ctx.dur(300), fill: 'forwards' });
        } else {
          anim = next.animate(
            [{ clipPath: `circle(0% at ${origin})` },
             { clipPath: `circle(150% at ${origin})` }],
            { duration: ctx.dur(700), easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'forwards' }
          );
        }
        await anim.finished;
        await wait(700);   // 表示したまましばらく見せる
        anim.cancel();
        next.style.clipPath = `circle(0% at ${origin})`;
      };
      return { run };
    },
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
    id: 'flow-seek',
    cat: 'comment',
    name: '流れる文字+シーク',
    feel: '連続・にぎやか',
    use: 'タイムライン連動のテキスト',
    ms: 3000,
    easing: 'linear',
    desc: '映像の下の枠で文字が右から左へ流れる。シークバーで進めたり戻したりできる。時間は1つの文字が枠を横切る長さで、全体は約7.7秒。',
    setup(stage, ctx) { return flowSeek(stage, ctx, { vertical: false }); },
    code: {
      css: `.frame { position: relative; overflow: hidden; container-type: inline-size; }
.item {
  position: absolute; left: 100%; white-space: nowrap;
  animation: flow 3s linear both;
  animation-delay: var(--t); /* 出現時刻（例: 1.6s） */
}
@keyframes flow {
  from { transform: translateX(0); }
  to   { transform: translateX(calc(-100cqw - 140px)); }
}
/* シーク: 一時停止して、遅延を「出現時刻 − シーク位置」にずらす */
.frame.is-seeking .item {
  animation-play-state: paused;
  animation-delay: calc(var(--t) - var(--seek));
}`,
      waapi: `const CROSS = 3000, END = -140;
const W = frame.clientWidth;
const anims = items.map(({ el, t }) => el.animate(
  [{ transform: \`translateX(\${W}px)\` },
   { transform: \`translateX(\${END}px)\` }],
  { duration: CROSS, delay: t, easing: 'linear', fill: 'both' }
));

// シーク: すべてのアニメーションの再生位置を同じ時刻にそろえる
let wasPlaying = false;
range.addEventListener('pointerdown', () => {
  wasPlaying = anims[0].playState === 'running';
  anims.forEach(a => a.pause());
});
range.addEventListener('input', () => {
  const time = range.value / 1000 * TOTAL;
  anims.forEach(a => { a.currentTime = time; });
});
// 再生中にドラッグを始めたときだけ、離したら再開する
range.addEventListener('change', () => {
  if (wasPlaying) anims.forEach(a => a.play());
});`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 流さずに定位置で表示し、出入りは不透明度だけで切り替える。
     表示期間 --dur は「同じ行の次の文字が出るまで（最長3s）」にして重ならないようにする */
  .item { left: 8px; animation-name: flow-fade; animation-duration: var(--dur); }
}
@keyframes flow-fade {
  0%, 100% { opacity: 0; }
  10%, 90% { opacity: 1; }
}`
    }
  },
  {
    id: 'flow-seek-vertical',
    cat: 'comment',
    name: '流れる文字+シーク（縦）',
    feel: '連続・落ち着き',
    use: '縦長の枠での実況・字幕',
    ms: 4000,
    easing: 'linear',
    desc: '映像の横の枠で文字が下から上へ流れる。シークバーで進めたり戻したりできる。「流れる文字+シーク」から方向だけを縦にしたもので、枠が狭いため長い文字は折り返す。時間は1つの文字が枠を横切る長さで、全体は約9秒（枠の高さで少し変わる）。文字どうしの見た目の隙間がそろうよう、前の文字が2行のときは次の文字を少し遅らせて出す。',
    setup(stage, ctx) { return flowSeek(stage, ctx, { vertical: true }); },
    code: {
      css: `.frame { position: relative; overflow: hidden; container-type: size; }
.item {
  position: absolute; top: 0; left: 8px; /* 全件、左端にそろえる */
  /* 枠が狭いので折り返す。左右に8pxの余白を残す */
  max-width: calc(100% - 16px); overflow-wrap: anywhere;
  animation: flow-up 4s linear both;
  animation-delay: var(--t); /* 出現時刻。前の文字が2行なら、1行ぶん遅らせて隙間をそろえる（WAAPI のタブを参照） */
}
@keyframes flow-up {
  from { transform: translateY(100cqh); }
  to   { transform: translateY(-40px); } /* 最も高い文字（2行・40px）が出きる位置。全件を同じ距離・同じ速さで流す */
}
/* シーク: 一時停止して、遅延を「出現時刻 − シーク位置」にずらす */
.frame.is-seeking .item {
  animation-play-state: paused;
  animation-delay: calc(var(--t) - var(--seek));
}`,
      waapi: `const CROSS = 4000;
const H = frame.clientHeight;
// 終了位置は最も高い文字が出きる位置。全件を同じ距離・同じ時間で流して速さをそろえる
const END = -Math.max(...items.map(({ el }) => el.offsetHeight));
// 出現時刻: 1行どうしは 600ms 間隔。前の文字が1行より高いぶん（px ÷ 速さ）だけ次を遅らせ、見た目の隙間をそろえる
const speed = (H - END) / CROSS;   // px/ms（全件同じ速さ）
const LINE = Math.min(...items.map(({ el }) => el.offsetHeight));
items.forEach((item, i) => {
  item.t = i === 0 ? 0 : items[i - 1].t + 600 + (items[i - 1].el.offsetHeight - LINE) / speed;
});
const anims = items.map(({ el, t }) => el.animate(
  [{ transform: \`translateY(\${H}px)\` },
   { transform: \`translateY(\${END}px)\` }],
  { duration: CROSS, delay: t, easing: 'linear', fill: 'both' }
));

// シーク: すべてのアニメーションの再生位置を同じ時刻にそろえる
let wasPlaying = false;
range.addEventListener('pointerdown', () => {
  wasPlaying = anims[0].playState === 'running';
  anims.forEach(a => a.pause());
});
range.addEventListener('input', () => {
  const time = range.value / 1000 * TOTAL;
  anims.forEach(a => { a.currentTime = time; });
});
// 再生中にドラッグを始めたときだけ、離したら再開する
range.addEventListener('change', () => {
  if (wasPlaying) anims.forEach(a => a.play());
});`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 流さずに表示し、出入りは不透明度だけで切り替える。
     位置 --y は、表示時間が重なる文字どうしだけを避けて計算して決める。
     下に空きがあるうちは下へ足していき、足りなくなったら上に戻って、消えた文字の位置を再利用する。
     それでも足りないときは、文字の間隔を詰める */
  .item { top: var(--y); left: 8px; max-width: calc(100% - 16px);
          animation-name: flow-fade; animation-duration: 4s; }
}
@keyframes flow-fade {
  0%, 100% { opacity: 0; }
  10%, 90% { opacity: 1; }
}`
    }
  },
  {
    id: 'chat-pop',
    cat: 'comment',
    name: 'チャット吹き出し（ポコっと）',
    feel: '軽快・弾む',
    use: 'チャット・メッセージUIの新着表示',
    ms: 450,
    easing: 'cubic-bezier(.34, 1.56, .64, 1)',
    desc: '映像の下の枠で、吹き出しが下からポコっと現れ、先に出た吹き出しを上へ押し上げる。古いものは枠の上へ出ていく。時間は1つの吹き出しが現れる長さで、全体は約5.9秒。',
    setup(stage, ctx) {
      // 映像と重ねない・固定テキスト・投稿やサーバーは作らない・特定サービスの見た目に寄せない（docs/adr/0008, 0013）
      const POP = 450;        // 吹き出しが現れる時間
      const PUSH = 300;       // 先に出た吹き出しが押し上げられる時間
      const INTERVAL = 900;   // 次の吹き出しが出るまでの間隔
      const HOLD = 900;       // 最後の吹き出しを見せておく時間
      const EASE_POP = 'cubic-bezier(.34, 1.56, .64, 1)';   // 行き過ぎて戻る
      const EASE_PUSH = 'cubic-bezier(.2, 0, 0, 1)';
      const MESSAGES = [
        'こんにちは',
        'おはよう！今日は早いね',
        '昨日のライブ、すごくよかった',
        'わかる！もう一回見たい',
        '音がいい',
        'おつかれさま',
      ];

      stage.innerHTML = `
        <div class="chat">
          <div class="chat-media"></div>
          <div class="chat-frame" aria-live="polite"></div>
        </div>`;
      const frame = q(stage, '.chat-frame');
      const { wait } = ctx;
      let token = 0;

      // 吹き出しを1つ足す。押し上げは「足す前後の位置の差」から作る（FLIP）
      const add = text => {
        const before = qa(frame, ':scope > *').map(el => el.offsetTop);
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.textContent = text;
        frame.append(bubble);
        if (ctx.reduced()) {
          // 動きを減らす: 位置は即座に切り替え、新しい吹き出しは不透明度だけで出す
          bubble.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ctx.dur(200), easing: 'linear' });
        } else {
          qa(frame, ':scope > *').slice(0, -1).forEach((el, i) => {
            const d = before[i] - el.offsetTop;
            if (d) el.animate([{ transform: `translateY(${d}px)` }, { transform: 'translateY(0)' }],
                              { duration: ctx.dur(PUSH), easing: EASE_PUSH });
          });
          bubble.animate(
            [{ transform: 'translateY(16px) scale(.85)', opacity: 0 },
             { transform: 'translateY(0) scale(1)', opacity: 1 }],
            { duration: ctx.dur(POP), easing: EASE_POP }
          );
        }
        // 枠の上に出きった吹き出しは外す（下寄せなので、残りの位置は変わらない）
        qa(frame, ':scope > *').forEach(el => { if (el.offsetTop + el.offsetHeight < 0) el.remove(); });
      };

      const run = async () => {
        const my = ++token;
        frame.replaceChildren();
        for (let i = 0; i < MESSAGES.length; i++) {
          if (my !== token || !frame.isConnected) return;
          add(MESSAGES[i]);
          await wait(i < MESSAGES.length - 1 ? INTERVAL : POP + HOLD);
        }
        if (my === token && frame.isConnected) frame.replaceChildren();
      };
      return { run };
    },
    code: {
      css: `.chat {
  display: flex; flex-direction: column;
  justify-content: flex-end;   /* 下に寄せる。新しい吹き出しが最下部に入る */
  gap: 8px; overflow: hidden;
}
.bubble {
  align-self: flex-start; max-width: 85%; overflow-wrap: anywhere;
  transform-origin: 0 100%;
  animation: pop .45s cubic-bezier(.34, 1.56, .64, 1) both;
}
@keyframes pop {
  from { transform: translateY(16px) scale(.85); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}
/* 先に出た吹き出しの押し上げは、位置の差から作る（WAAPI のタブを参照） */`,
      waapi: `function add(text) {
  // 足す前の位置を覚えておく
  const before = [...chat.children].map(el => el.offsetTop);
  const bubble = Object.assign(document.createElement('div'),
                               { className: 'bubble', textContent: text });
  chat.append(bubble);

  // 先に出た吹き出し: 位置の差ぶん下に戻してから、0 へ
  [...chat.children].slice(0, -1).forEach((el, i) => {
    const d = before[i] - el.offsetTop;
    if (d) el.animate(
      [{ transform: \`translateY(\${d}px)\` }, { transform: 'translateY(0)' }],
      { duration: 300, easing: 'cubic-bezier(.2, 0, 0, 1)' }
    );
  });

  // 新しい吹き出し: 下からポコっと（行き過ぎて戻るイージング）
  bubble.animate(
    [{ transform: 'translateY(16px) scale(.85)', opacity: 0 },
     { transform: 'translateY(0) scale(1)', opacity: 1 }],
    { duration: 450, easing: 'cubic-bezier(.34, 1.56, .64, 1)' }
  );
}`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 位置は即座に切り替え、新しい吹き出しは不透明度だけで出す */
  .bubble { animation: bubble-fade .2s linear both; }
}
@keyframes bubble-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}`
    }
  },
  // ---- 通知。チャットはコメントに含める（docs/adr/0014） ----
  {
    id: 'toast',
    cat: 'notice',
    name: 'トースト',
    feel: 'すっと・控えめ',
    use: '保存・送信の完了通知（タップで閉じられる）',
    ms: 300,
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    desc: '画面の下中央に、ピル型の通知が下からスライドインする。2.5秒見せてから下へ戻って消える。押せばすぐ閉じる。時間は入る長さで、出る長さは250ms。方向・出し方の違いは「差分比較」の「D. 通知」で比べられる。',
    setup(stage, ctx) {
      const IN = 300, OUT = 250, HOLD = 2500;
      const OFF = 'translateY(calc(100% + 20px))';   // 下端の外
      stage.innerHTML = `
        <div class="ntf">
          <div class="ntf-row"></div><div class="ntf-row"></div><div class="ntf-row"></div><div class="ntf-row"></div>
        </div>`;
      const root = q(stage, '.ntf');
      const { wait } = ctx;
      let token = 0;

      const run = async () => {
        const my = ++token;
        qa(root, '.ntf-toast').forEach(el => el.remove());
        const toast = document.createElement('button');
        toast.type = 'button';
        toast.className = 'ntf-toast';
        toast.setAttribute('role', 'status');
        toast.innerHTML = '<span class="ntf-dot"></span>保存しました';
        root.append(toast);
        const reduced = ctx.reduced();
        const enter = reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ transform: OFF }, { transform: 'translateY(0)' }];
        await settle(toast.animate(enter, { duration: ctx.dur(reduced ? 200 : IN), easing: reduced ? 'linear' : 'cubic-bezier(.2, 0, 0, 1)', fill: 'backwards' }));
        // 押されるか、一定時間たつまで見せる
        await Promise.race([wait(HOLD), new Promise(r => toast.addEventListener('click', r, { once: true }))]);
        if (my !== token || !root.isConnected) return;
        const leave = reduced
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ transform: 'translateY(0)' }, { transform: OFF }];
        await settle(toast.animate(leave, { duration: ctx.dur(reduced ? 200 : OUT), easing: reduced ? 'linear' : 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }));
        toast.remove();
      };
      return { run };
    },
    code: {
      css: `.toast {
  position: fixed; bottom: 20px; left: 0; right: 0; margin-inline: auto; width: fit-content;
  border-radius: 999px;
  animation:
    toast-in  .3s cubic-bezier(.2, 0, 0, 1) both,
    toast-out .25s cubic-bezier(.4, 0, 1, 1) 2.8s forwards; /* 入る + 2.5s 見せてから出る */
}
@keyframes toast-in {
  from { transform: translateY(calc(100% + 20px)); }
  to   { transform: translateY(0); }
}
@keyframes toast-out {
  from { transform: translateY(0); }
  to   { transform: translateY(calc(100% + 20px)); }
}
/* 押されたらすぐ閉じる場合は、JS で toast-out を始める（WAAPI のタブを参照） */`,
      waapi: `const OFF = 'translateY(calc(100% + 20px))';
await toast.animate(
  [{ transform: OFF }, { transform: 'translateY(0)' }],
  { duration: 300, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'backwards' }
).finished;

// 押されるか、2.5秒たつまで見せる
await Promise.race([
  new Promise(r => setTimeout(r, 2500)),
  new Promise(r => toast.addEventListener('click', r, { once: true })),
]);

await toast.animate(
  [{ transform: 'translateY(0)' }, { transform: OFF }],
  { duration: 250, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }
).finished;
toast.remove();`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 縦には動かさず、不透明度だけで出入りする */
  .toast { animation: toast-fade-in .2s linear both, toast-fade-out .2s linear 2.7s forwards; }
}
@keyframes toast-fade-in  { from { opacity: 0; } to { opacity: 1; } }
@keyframes toast-fade-out { from { opacity: 1; } to { opacity: 0; } }`
    }
  },
  {
    id: 'banner-drop',
    cat: 'notice',
    name: 'バナー（上から降りる）',
    feel: '目立つ・知らせる',
    use: '重要なお知らせ・新着通知',
    ms: 400,
    easing: 'cubic-bezier(.22, 1.2, .36, 1)',
    desc: '画面の上端から通知が降りてきて、わずかに弾んで止まる。数秒見せてから上へ戻って消える。時間は降りる長さで、戻る長さは250ms、見せる時間は2.5秒。',
    setup(stage, ctx) {
      const IN = 400, OUT = 250, HOLD = 2500;
      stage.innerHTML = `
        <div class="ntf">
          <div class="ntf-row"></div><div class="ntf-row"></div><div class="ntf-row"></div><div class="ntf-row"></div>
        </div>`;
      const root = q(stage, '.ntf');
      const { wait } = ctx;
      let token = 0;

      const run = async () => {
        const my = ++token;
        qa(root, '.ntf-banner').forEach(el => el.remove());
        const banner = document.createElement('div');
        banner.className = 'ntf-banner';
        banner.setAttribute('role', 'status');
        banner.innerHTML = '<strong>新着のお知らせ</strong><span>3件の更新があります</span>';
        root.append(banner);
        const reduced = ctx.reduced();
        const enter = reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ transform: 'translateY(calc(-100% - 10px))' }, { transform: 'translateY(0)' }];
        await settle(banner.animate(enter, { duration: ctx.dur(reduced ? 200 : IN), easing: reduced ? 'linear' : 'cubic-bezier(.22, 1.2, .36, 1)', fill: 'backwards' }));
        await wait(HOLD);
        if (my !== token || !root.isConnected) return;
        const leave = reduced
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ transform: 'translateY(0)' }, { transform: 'translateY(calc(-100% - 10px))' }];
        await settle(banner.animate(leave, { duration: ctx.dur(reduced ? 200 : OUT), easing: reduced ? 'linear' : 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }));
        banner.remove();
      };
      return { run };
    },
    code: {
      css: `.banner {
  position: fixed; top: 10px; left: 10px; right: 10px;
  animation:
    banner-in  .4s cubic-bezier(.22, 1.2, .36, 1) both,
    banner-out .25s cubic-bezier(.4, 0, 1, 1) 2.9s forwards; /* 降りる + 2.5s 見せてから戻る */
}
@keyframes banner-in {
  from { transform: translateY(calc(-100% - 10px)); }
  to   { transform: translateY(0); }
}
@keyframes banner-out {
  from { transform: translateY(0); }
  to   { transform: translateY(calc(-100% - 10px)); }
}`,
      waapi: `const OFF = 'translateY(calc(-100% - 10px))';
await banner.animate(
  [{ transform: OFF }, { transform: 'translateY(0)' }],
  { duration: 400, easing: 'cubic-bezier(.22, 1.2, .36, 1)', fill: 'backwards' }
).finished;

await new Promise(r => setTimeout(r, 2500));   // 見せておく

await banner.animate(
  [{ transform: 'translateY(0)' }, { transform: OFF }],
  { duration: 250, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }
).finished;
banner.remove();`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 縦には動かさず、不透明度だけで出入りする */
  .banner { animation: banner-fade-in .2s linear both, banner-fade-out .2s linear 2.7s forwards; }
}
@keyframes banner-fade-in  { from { opacity: 0; } to { opacity: 1; } }
@keyframes banner-fade-out { from { opacity: 1; } to { opacity: 0; } }`
    }
  },
  {
    id: 'badge-pop',
    cat: 'notice',
    name: 'バッジ（件数ポコっ）',
    feel: '軽快・弾む',
    use: '未読件数・通知数の更新',
    ms: 400,
    easing: 'cubic-bezier(.34, 1.56, .64, 1)',
    desc: 'ベルのアイコンの件数バッジが、数字が変わるたびに小さな状態から弾んで現れる。件数は1秒ごとに1→2→3→4と増え、最後に少し見せて戻る。',
    setup(stage, ctx) {
      const POP = 400, STEP = 1000, HOLD = 800;
      stage.innerHTML = `
        <div class="ntf">
          <div class="ntf-head">
            <strong>受信箱</strong>
            <span class="ntf-bell" aria-label="通知">
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12 3a6 6 0 0 0-6 6v3.5L4 16v1h16v-1l-2-3.5V9a6 6 0 0 0-6-6zm0 18a2.5 2.5 0 0 0 2.4-2H9.6A2.5 2.5 0 0 0 12 21z"/></svg>
              <span class="ntf-badge" role="status">1</span>
            </span>
          </div>
          <div class="ntf-row"></div><div class="ntf-row"></div><div class="ntf-row"></div><div class="ntf-row"></div>
        </div>`;
      const root = q(stage, '.ntf');
      const badge = q(stage, '.ntf-badge');
      const { wait } = ctx;
      let token = 0;

      const bump = n => {
        badge.textContent = String(n);
        const reduced = ctx.reduced();
        badge.animate(
          reduced ? [{ opacity: .3 }, { opacity: 1 }]
                  : [{ transform: 'scale(.4)', opacity: .4 }, { transform: 'scale(1)', opacity: 1 }],
          { duration: ctx.dur(reduced ? 200 : POP), easing: reduced ? 'linear' : 'cubic-bezier(.34, 1.56, .64, 1)' }
        );
      };

      const run = async () => {
        const my = ++token;
        badge.textContent = '1';
        for (const n of [2, 3, 4]) {
          await wait(STEP);
          if (my !== token || !root.isConnected) return;
          bump(n);
        }
        await wait(POP + HOLD);
        if (my === token && root.isConnected) badge.textContent = '1';
      };
      return { run };
    },
    code: {
      css: `.badge { transform-origin: center; }
.badge.is-updated {
  animation: badge-pop .4s cubic-bezier(.34, 1.56, .64, 1);
}
@keyframes badge-pop {
  from { transform: scale(.4); opacity: .4; }
  to   { transform: scale(1); opacity: 1; }
}
/* 数字を書き換えるたびに is-updated を付け直す（animationend で外す） */`,
      waapi: `function bump(n) {
  badge.textContent = String(n);
  badge.animate(
    [{ transform: 'scale(.4)', opacity: .4 },
     { transform: 'scale(1)', opacity: 1 }],
    { duration: 400, easing: 'cubic-bezier(.34, 1.56, .64, 1)' }
  );
}`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 大きさは変えず、不透明度だけで更新を知らせる */
  .badge.is-updated { animation: badge-flash .2s linear; }
}
@keyframes badge-flash {
  from { opacity: .3; }
  to   { opacity: 1; }
}`
    }
  },

  {
    id: 'shelf-open',
    cat: 'expand',
    name: '本棚（選ぶと本が開く）',
    feel: '知的・やわらか',
    use: '棚状の一覧から選んで、詳細を全面で見せる（ライブラリ・図鑑・読み物）',
    ms: 1400,
    easing: 'cubic-bezier(.2, 0, 0, 1) / cubic-bezier(.65, 0, .35, 1)',
    desc: '縦置きの本が横に並ぶ棚から1冊を選ぶと、背表紙の面を向いた本が、縦軸で回りながらオーバーレイの中央に持ち上がって表紙が正面に来て、表紙が開いて中身の要素が順に現れる。閉じるボタン・背景・Esc で、逆の順に（表紙を閉じ、縦軸で回って背表紙の面になりながら）棚の元の位置へ収まる。時間は開く全体の長さ（背表紙から回って持ち上がる500ms → 表紙の回転600ms → 中身の要素が80ms間隔）で、デモ全体は約4秒。',
    setup(stage, ctx) {
      const LIFT = 'cubic-bezier(.2, 0, 0, 1)';       // 持ち上げ・中身の出現
      const INOUT = 'cubic-bezier(.65, 0, .35, 1)';   // 表紙の回転
      const BOOKS = [
        { title: '光の設計', author: '青木', color: '#8c2f39', h: 140, ch: ['窓のかたち', '朝の光', '影の長さ'], note: '朝の光は、窓の高さで表情を変える。低い窓は床を、高い窓は壁を照らす。' },
        { title: '海辺の植物', author: '森下', color: '#1f5f5b', h: 128, ch: ['砂の上で', '潮風と根', '小さな花'], note: '潮風の強い土地では、背の低い草ほど根を深く張る。見えない部分が全体を支える。' },
        { title: '星の数え方', author: '石川', color: '#2f4a8a', h: 150, ch: ['最初の一つ', '名前を覚える', '季節の星'], note: '数え始めるのは、いちばん明るい星から。名前を覚えると、空の見え方が変わる。' },
        { title: '台所の化学', author: '松本', color: '#6b4e1e', h: 120, ch: ['火加減', '塩のはたらき', '待つ時間'], note: '強い火は表面を、弱い火は中心を変える。待つ時間も調理の一部になる。' },
        { title: '地図の読み方', author: '高田', color: '#4b3a7a', h: 136, ch: ['北を決める', '縮尺', '記号の約束'], note: '地図は何を省くかで決まる。縮尺を変えると、同じ町が別の場所に見えてくる。' },
        { title: '雨の音', author: '村上', color: '#3b5d2e', h: 132, ch: ['屋根の上', '傘の内側', '止む前に'], note: '雨音は、当たる素材で変わる。窓辺で聞く音と、葉の上で聞く音は別のものだ。' },
        { title: '紙の歴史', author: '井上', color: '#8a4b1f', h: 146, ch: ['最初の一枚', '手漉きの町', '印刷のはじまり'], note: '一枚の紙には、繊維の向きがある。折りやすい方向を知ると、扱いが楽になる。' },
        { title: '色の名前', author: '清水', color: '#7a2f5a', h: 118, ch: ['赤と朱', '藍の深さ', '白の種類'], note: '名前がつくと、色は見分けやすくなる。白だけでも、呼び方は数えきれない。' },
        { title: '道具の手入れ', author: '山口', color: '#2d5a7a', h: 140, ch: ['刃を研ぐ', '油と布', 'しまい方'], note: '手入れは、使い終わった直後がいちばん短くて済む。続けるほど道具は手になじむ。' },
      ];
      const BOOK_H = 272;                 // 開いた本の高さ（CSS の .book3d と合わせる）
      const LEVELS = [[0, 5], [5, 9]];   // 1段目に5冊、2段目に4冊

      stage.innerHTML = `
        <div class="shelf">
          ${LEVELS.map(([from, to]) => `
          <div class="shelf-level">
            <div class="shelf-row">${BOOKS.slice(from, to).map((item, j) => `
              <button class="spine" type="button" data-i="${from + j}" aria-haspopup="dialog" aria-label="${item.title}（${item.author}）を開く"
                style="--c:${item.color};--h:${item.h}px"><span>${item.title}</span></button>`).join('')}
            </div>
            <div class="shelf-board"></div>
          </div>`).join('')}
          <div class="shelf-overlay" role="dialog" aria-modal="true" aria-label="本の中身">
            <div class="overlay-bg"></div>
            <button class="overlay-close" type="button" aria-label="閉じる">×</button>
            <div class="book3d">
              <div class="book-front">
                <div class="book-inside"><div class="book-page"></div></div>
                <div class="book-cover" aria-hidden="true"></div>
              </div>
              <div class="book-spine-face" aria-hidden="true"></div>
            </div>
          </div>
        </div>`;
      const shelf = q(stage, '.shelf');
      const levels = qa(stage, '.shelf-level');
      const spines = qa(stage, '.spine');
      const overlay = q(stage, '.shelf-overlay');
      const bg = q(stage, '.overlay-bg');
      const closeBtn = q(stage, '.overlay-close');
      const book = q(stage, '.book3d');
      const cover = q(stage, '.book-cover');
      const front = q(stage, '.book-front');
      const face = q(stage, '.book-spine-face');
      const page = q(stage, '.book-page');
      const { wait } = ctx;
      let current = -1;     // 開いている（または開こうとしている）本
      let busy = false;     // 開閉のアニメーション中。その間の操作は受け付けない
      let token = 0;

      const fill = i => {
        const info = BOOKS[i];
        book.style.setProperty('--c', info.color);
        book.style.setProperty('--k', String(BOOK_H / info.h));   // 背表紙の面を、棚の背表紙と同じ大きさにそろえる倍率
        face.innerHTML = `<span class="spine-art" style="--c:${info.color};--h:${info.h}px"><span>${info.title}</span></span>`;
        cover.innerHTML = `<span class="cover-title">${info.title}</span><span class="cover-author">${info.author}</span>`;
        page.innerHTML = `
          <div class="reveal page-head"><h4>${info.title}</h4><span>${info.author}</span></div>
          ${info.ch.map((c, n) => `<div class="reveal chap"><b>${n + 1}</b><span>${c}</span></div>`).join('')}
          <p class="reveal page-note">${info.note}</p>`;
      };
      const anim = (el, frames, duration, delay, easing) =>
        el.animate(frames, { duration: ctx.dur(duration), delay: ctx.dur(delay), easing, fill: 'both' });
      // 背表紙に重なる姿勢。本の左辺を軸に、背表紙の面が棚の背表紙と同じ位置・大きさになる移動と拡縮（FLIP）。
      // 測るのは変形がかかっていないとき（アニメーションの開始前）
      const poseOf = i => {
        const sp = spines[i].getBoundingClientRect(), b = book.getBoundingClientRect();
        const x = sp.right - b.left, y = sp.top + sp.height / 2 - (b.top + b.height / 2);
        return `translate(${x}px, ${y}px) scale(${BOOKS[i].h / BOOK_H})`;
      };
      const finish = async anims => {
        try { await Promise.all(anims.map(x => x.finished)); } catch { return false; }   // reset で中断された
        anims.forEach(x => x.cancel());
        return true;
      };

      const openBook = async (i, { focus = false } = {}) => {
        if (busy || current >= 0) return;
        busy = true; current = i;
        const reduced = ctx.reduced();
        shelf.classList.toggle('is-reduced', reduced);
        fill(i);
        overlay.classList.add('is-open');     // 最終状態は class に持たせる
        spines[i].classList.add('is-out');    // 持ち上げた本の跡は空けておく
        levels.forEach(l => { l.inert = true; });
        // 押した背表紙が inert になってフォーカスが失われないよう、先に閉じるボタンへ移す
        if (focus) closeBtn.focus({ preventScroll: true });
        const items = qa(page, '.reveal');
        let anims;
        if (reduced) {
          // 動きを減らす: 開いた状態（表紙なし・中身あり）を、オーバーレイごとフェードで表示する。不透明度だけ
          anims = [anim(overlay, [{ opacity: 0 }, { opacity: 1 }], 250, 0, 'linear')];
        } else {
          anims = [
            anim(bg, [{ opacity: 0 }, { opacity: 1 }], 250, 0, LIFT),
            anim(closeBtn, [{ opacity: 0 }, { opacity: 1 }], 250, 0, LIFT),
            // 背表紙の面を向いた姿勢から、縦軸で回りながら持ち上がり、表紙の面が正面に来る
            anim(book, [{ transform: poseOf(i) }, { transform: 'none' }], 500, 0, INOUT),
            anim(front, [{ transform: 'rotateY(90deg)', visibility: 'hidden' }, { transform: 'rotateY(0deg)', visibility: 'visible' }], 500, 0, INOUT),
            anim(face, [{ transform: 'rotateY(0deg)', visibility: 'visible' }, { transform: 'rotateY(-90deg)', visibility: 'hidden' }], 500, 0, INOUT),   // 回り終えたら消す（真横の細い線を残さない）
            anim(cover, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-100deg)' }], 600, 550, INOUT),
            ...items.map((el, n) => anim(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 300, 750 + n * 80, LIFT)),
          ];
        }
        const ok = await finish(anims);
        if (!ok) return;
        busy = false;
      };

      const closeBook = async ({ focus = false } = {}) => {
        if (busy || current < 0) return;
        busy = true;
        const i = current;
        const reduced = ctx.reduced();
        const items = qa(page, '.reveal');
        let anims;
        if (reduced) {
          anims = [anim(overlay, [{ opacity: 1 }, { opacity: 0 }], 250, 0, 'linear')];
        } else {
          anims = [
            ...items.map(el => anim(el, [{ opacity: 1 }, { opacity: 0 }], 150, 0, LIFT)),
            anim(cover, [{ transform: 'rotateY(-100deg)' }, { transform: 'rotateY(0deg)' }], 400, 100, INOUT),
            // 縦軸で回りながら棚へ戻り、背表紙の面が棚の背表紙に重なったところで終わる
            anim(book, [{ transform: 'none' }, { transform: poseOf(i) }], 500, 500, INOUT),
            anim(front, [{ transform: 'rotateY(0deg)', visibility: 'visible' }, { transform: 'rotateY(90deg)', visibility: 'hidden' }], 500, 500, INOUT),
            anim(face, [{ transform: 'rotateY(-90deg)', visibility: 'hidden' }, { transform: 'rotateY(0deg)', visibility: 'visible' }], 500, 500, INOUT),
            anim(bg, [{ opacity: 1 }, { opacity: 0 }], 300, 700, LIFT),
            anim(closeBtn, [{ opacity: 1 }, { opacity: 0 }], 300, 700, LIFT),
          ];
        }
        const ok = await finish(anims);
        if (!ok) return;
        overlay.classList.remove('is-open');   // 終わってから外し、アニメーションは cancel 済み
        spines[i].classList.remove('is-out');
        levels.forEach(l => { l.inert = false; });
        current = -1; busy = false;
        if (focus) spines[i].focus({ preventScroll: true });
      };

      const reset = () => {
        stage.getAnimations({ subtree: true }).forEach(x => x.cancel());
        overlay.classList.remove('is-open');
        spines.forEach(s => s.classList.remove('is-out'));
        levels.forEach(l => { l.inert = false; });
        current = -1; busy = false;
      };

      // 手で操作したら、デモの自動再生は止める
      spines.forEach((s, i) => s.addEventListener('click', () => { token++; openBook(i, { focus: true }); }));
      const userClose = () => { token++; closeBook({ focus: true }); };
      closeBtn.addEventListener('click', userClose);
      bg.addEventListener('click', userClose);
      overlay.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.stopPropagation(); userClose(); }
        if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus({ preventScroll: true }); }   // 操作できるのは閉じるボタンだけ
      });

      const run = async () => {
        const my = ++token;
        reset();
        const alive = () => my === token && shelf.isConnected;
        await wait(300);
        if (!alive()) return;
        await openBook(2);
        if (!alive()) return;
        await wait(1200);                // 中身を見せる
        if (!alive()) return;
        await closeBook();
        if (alive()) await wait(300);
      };
      return { run };
    },
    code: {
      css: `/* 棚: 本は縦置きで横に並べる。背表紙の文字は縦書き */
.row   { display: flex; align-items: flex-end; gap: 6px; }
.spine { width: 38px; height: var(--h); writing-mode: vertical-rl; background: var(--c); }

/* オーバーレイ: 開いたら表示し、動きを時間差でつなぐ */
.overlay { display: none; place-items: center; position: absolute; inset: 0; }
.overlay.is-open { display: grid; }
.overlay.is-open .bg { animation: fade .25s cubic-bezier(.2, 0, 0, 1) both; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }

/* 本は「表紙の面 .front」と「背表紙の面 .spine-face」を、左辺(蝶番)でつないだ箱 */
/* 遠近の中心は回転の軸（左辺）に置く。中央だと、真横を向いても細い面が見えて残る */
.book  { position: relative; perspective: 900px; perspective-origin: 0 50%; transform-origin: 0 50%; }
.front { position: absolute; inset: 0; perspective: 900px; perspective-origin: 0 50%; transform-origin: 0 50%; }
.spine-face {
  position: absolute; top: 0; right: 100%;   /* 表紙の左辺の外側。幅は背表紙の幅 ÷ 縮尺（--k） */
  width: calc(38px * var(--k)); height: 100%;
  transform-origin: 100% 50%;
  transform: rotateY(-90deg);
  visibility: hidden;                        /* 開いた状態では消す（真横の細い線を残さない） */
}

/* 1. 背表紙の面を向いた姿勢から、縦軸で回りながら持ち上がる。
      --pose は背表紙に重なる位置と大きさ（WAAPI のタブを参照） */
.overlay.is-open .book       { animation: lift .5s cubic-bezier(.65, 0, .35, 1) both; }
.overlay.is-open .front      { animation: turn-front .5s cubic-bezier(.65, 0, .35, 1) both; }
.overlay.is-open .spine-face { animation: turn-face .5s cubic-bezier(.65, 0, .35, 1) both; }
@keyframes lift       { from { transform: var(--pose); } to { transform: none; } }
@keyframes turn-front {
  from { transform: rotateY(90deg); visibility: hidden; }
  to   { transform: rotateY(0deg); visibility: visible; }
}
@keyframes turn-face  {
  from { transform: rotateY(0deg); visibility: visible; }
  to   { transform: rotateY(-90deg); visibility: hidden; }
}

/* 2. 表紙が左の辺を軸に開く。.55s 待って、回転が落ち着いてから */
.cover { transform-origin: 0 50%; backface-visibility: hidden; }
.overlay.is-open .cover {
  transform: rotateY(-100deg);
  animation: cover-open .6s cubic-bezier(.65, 0, .35, 1) .55s both;
}
@keyframes cover-open {
  from { transform: rotateY(0deg); }
  to   { transform: rotateY(-100deg); }
}

/* 3. 中身の要素が順に現れる（--i は 0, 1, 2…）。表紙が半分開いたころから */
.overlay.is-open .reveal {
  animation: reveal .3s cubic-bezier(.2, 0, 0, 1) both;
  animation-delay: calc(.75s + var(--i) * .08s);
}
@keyframes reveal {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
/* 閉じるときは逆の順（中身 → 表紙 → 縦軸で回って背表紙の面になり、棚へ収まる）。WAAPI のタブを参照 */`,
      waapi: `const LIFT = 'cubic-bezier(.2, 0, 0, 1)', INOUT = 'cubic-bezier(.65, 0, .35, 1)';
const BOOK_H = 272;   // 開いた本の高さ
const anim = (el, frames, duration, delay, easing) =>
  el.animate(frames, { duration, delay, easing, fill: 'both' });

// 背表紙に重なる姿勢: 本の左辺を軸に、背表紙の面が棚の背表紙と同じ位置・大きさになる移動と拡縮。
// 測るのは変形がかかっていないとき（アニメーションの開始前）
function poseOf(spine, bookHeight) {
  const s = spine.getBoundingClientRect(), b = book.getBoundingClientRect();
  const x = s.right - b.left;
  const y = s.top + s.height / 2 - (b.top + b.height / 2);
  return \`translate(\${x}px, \${y}px) scale(\${bookHeight / BOOK_H})\`;   // bookHeight は背表紙の高さ
}

async function open(spine, bookHeight) {
  overlay.classList.add('is-open');    // 最終状態は class に持たせる
  spine.classList.add('is-out');       // 持ち上げた本の跡は空けておく
  const anims = [
    anim(bg,    [{ opacity: 0 }, { opacity: 1 }], 250, 0, LIFT),
    anim(close, [{ opacity: 0 }, { opacity: 1 }], 250, 0, LIFT),
    // 背表紙の面を向いた姿勢から、縦軸で回りながら持ち上がる
    anim(book,  [{ transform: poseOf(spine, bookHeight) }, { transform: 'none' }], 500, 0, INOUT),
    anim(front, [{ transform: 'rotateY(90deg)', visibility: 'hidden' },
                 { transform: 'rotateY(0deg)', visibility: 'visible' }], 500, 0, INOUT),
    anim(face,  [{ transform: 'rotateY(0deg)', visibility: 'visible' },
                 { transform: 'rotateY(-90deg)', visibility: 'hidden' }], 500, 0, INOUT),   // 回り終えたら消す
    anim(cover, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-100deg)' }], 600, 550, INOUT),
    ...items.map((el, n) => anim(el,
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      300, 750 + n * 80, LIFT)),
  ];
  await Promise.all(anims.map(a => a.finished));
  anims.forEach(a => a.cancel());
}

async function closeIt(spine, bookHeight) {
  const anims = [
    ...items.map(el => anim(el, [{ opacity: 1 }, { opacity: 0 }], 150, 0, LIFT)),
    anim(cover, [{ transform: 'rotateY(-100deg)' }, { transform: 'rotateY(0deg)' }], 400, 100, INOUT),
    // 縦軸で回りながら棚へ戻り、背表紙の面が棚の背表紙に重なったところで終わる
    anim(book,  [{ transform: 'none' }, { transform: poseOf(spine, bookHeight) }], 500, 500, INOUT),
    anim(front, [{ transform: 'rotateY(0deg)', visibility: 'visible' },
                 { transform: 'rotateY(90deg)', visibility: 'hidden' }], 500, 500, INOUT),
    anim(face,  [{ transform: 'rotateY(-90deg)', visibility: 'hidden' },
                 { transform: 'rotateY(0deg)', visibility: 'visible' }], 500, 500, INOUT),
    anim(bg,    [{ opacity: 1 }, { opacity: 0 }], 300, 700, LIFT),
    anim(close, [{ opacity: 1 }, { opacity: 0 }], 300, 700, LIFT),
  ];
  await Promise.all(anims.map(a => a.finished));
  overlay.classList.remove('is-open');   // 終わってから class を外し、そのあと cancel（ちらつき防止）
  spine.classList.remove('is-out');      // 棚の背表紙が、重なっていた面と入れ替わる
  anims.forEach(a => a.cancel());
}`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 回転・拡縮・段階表示はやめる。背表紙を選ぶと、開いた状態（表紙なし・中身あり）を
     オーバーレイごとフェードで表示する。閉じるときもフェードで消す（transform は使わない） */
  .overlay.is-open { animation: fade .25s linear both; }
  .overlay.is-open .bg, .overlay.is-open .book, .overlay.is-open .front,
  .overlay.is-open .cover, .overlay.is-open .reveal { animation: none; }
  .overlay.is-open .cover { transform: none; opacity: 0; }
  .spine-face { display: none; }
}`
    }
  },
  {
    id: 'card-draw',
    cat: 'expand',
    name: 'カード（引くと回って現れる）',
    feel: '神秘的・ゆったり',
    use: '伏せたカードから1枚を選んで結果を見せる（占い・ガチャ・ご褒美・カード型の一覧）',
    ms: 2100,
    easing: 'cubic-bezier(.2, 0, 0, 1) / cubic-bezier(.3, .1, .2, 1)',
    desc: '裏向きのカードが並ぶ中から1枚を選ぶと、そのカードが右へ8pxほど滑りながらフェードアウトして消える。そのあと、オーバーレイの中央へ、同じカードが上から降りながら縦軸でゆっくり2回転して現れる（降りる1000ms・回転1800ms）。閉じるボタン・背景・Esc で、カードが少し上へ消え、元の位置に伏せたカードが戻る。デモ全体は約4.5秒。',
    setup(stage, ctx) {
      const LIFT = 'cubic-bezier(.2, 0, 0, 1)';       // 滑って消える・降りる・フェード
      const SPIN = 'cubic-bezier(.3, .1, .2, 1)';     // 回転: 勢いよく回り、ゆっくり止まる
      const SLIDE = 8;                                // 消えるときに右へ滑る距離（px）
      const ICONS = {
        star: '<polygon points="24,5 29.5,18.5 44,19.5 33,29 36.5,43 24,35.5 11.5,43 15,29 4,19.5 18.5,18.5"/>',
        moon: '<path d="M34 8A18 18 0 1 0 40 32 14 14 0 0 1 34 8z"/>',
        sun: '<circle cx="24" cy="24" r="8"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M38 10l-4 4M10 38l4-4"/>',
        flower: '<circle cx="24" cy="13" r="7"/><circle cx="24" cy="35" r="7"/><circle cx="13" cy="24" r="7"/><circle cx="35" cy="24" r="7"/><circle cx="24" cy="24" r="3"/>',
        drop: '<path d="M24 6C24 6 12 20 12 29a12 12 0 0 0 24 0C36 20 24 6 24 6z"/>',
        wave: '<path d="M5 14q6-7 12 0t12 0 12 0M5 24q6-7 12 0t12 0 12 0M5 34q6-7 12 0t12 0 12 0"/>',
      };
      const CARDS = [
        { no: 'I', name: '星', icon: 'star', color: '#b8860b', note: '遠くの光を目印に、\n歩幅を決める日。' },
        { no: 'II', name: '月', icon: 'moon', color: '#4b5aa8', note: '満ち欠けのように、\n焦らず待つ日。' },
        { no: 'III', name: '陽', icon: 'sun', color: '#c2571a', note: 'はじめの一歩は、\n朝のうちに。' },
        { no: 'IV', name: '花', icon: 'flower', color: '#a23a6b', note: '小さな手入れが、\nあとで大きく咲く。' },
        { no: 'V', name: '雫', icon: 'drop', color: '#1f6f8b', note: 'ひとつ落ちると、\n水面が静かに広がる。' },
        { no: 'VI', name: '波', icon: 'wave', color: '#2f7a5a', note: '寄せては返す。\n戻るのも進むうち。' },
      ];

      stage.innerHTML = `
        <div class="deck">
          <div class="deck-grid">${CARDS.map((_, i) => `
            <button class="tcard card-back-art" type="button" data-i="${i}" aria-haspopup="dialog" aria-label="伏せたカード ${i + 1} を引く"></button>`).join('')}
          </div>
          <div class="deck-overlay" role="dialog" aria-modal="true" aria-label="引いたカード">
            <div class="overlay-bg"></div>
            <button class="overlay-close" type="button" aria-label="閉じる">×</button>
            <div class="card3d">
              <div class="card-body">
                <div class="card-face card-front"></div>
                <div class="card-face card-back card-back-art" aria-hidden="true"></div>
              </div>
            </div>
          </div>
        </div>`;
      const deck = q(stage, '.deck');
      const grid = q(stage, '.deck-grid');
      const cards = qa(stage, '.tcard');
      const overlay = q(stage, '.deck-overlay');
      const bg = q(stage, '.overlay-bg');
      const closeBtn = q(stage, '.overlay-close');
      const drop = q(stage, '.card3d');     // 上から降りる（移動と不透明度）
      const body = q(stage, '.card-body');  // 縦軸で回る
      const front = q(stage, '.card-front');
      const { wait } = ctx;
      let current = -1;     // 開いている（または開こうとしている）カード
      let busy = false;     // 開閉のアニメーション中。その間の操作は受け付けない
      let token = 0;

      const fill = i => {
        const info = CARDS[i];
        front.style.setProperty('--c', info.color);
        front.innerHTML = `
          <span class="card-no">${info.no}</span>
          <svg class="card-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[info.icon]}</svg>
          <span class="card-name">${info.name}</span>
          <span class="card-note">${info.note}</span>`;
      };
      const anim = (el, frames, duration, delay, easing) =>
        el.animate(frames, { duration: ctx.dur(duration), delay: ctx.dur(delay), easing, fill: 'both' });
      const finish = async anims => {
        try { await Promise.all(anims.map(x => x.finished)); } catch { return false; }   // reset で中断された
        anims.forEach(x => x.cancel());
        return true;
      };

      const openCard = async (i, { focus = false } = {}) => {
        if (busy || current >= 0) return;
        busy = true; current = i;
        const reduced = ctx.reduced();
        fill(i);
        grid.inert = true;
        // 1. 選んだ伏せカードが、少し右へ滑りながらフェードアウトする（動きを減らす: 不透明度だけ）
        cards[i].classList.add('is-out');   // 消えたあとも非表示のままにする。最終状態は class に持たせる
        const out = reduced
          ? anim(cards[i], [{ opacity: 1 }, { opacity: 0 }], 200, 0, 'linear')
          : anim(cards[i], [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${SLIDE}px)` }], 300, 0, LIFT);
        if (!(await finish([out]))) return;
        // 2. 消えたあとに、オーバーレイの中央へ出す
        overlay.classList.add('is-open');
        if (focus) closeBtn.focus({ preventScroll: true });
        const anims = reduced
          ? [anim(overlay, [{ opacity: 0 }, { opacity: 1 }], 250, 0, 'linear')]
          : [
              anim(bg, [{ opacity: 0 }, { opacity: 1 }], 250, 0, LIFT),
              anim(closeBtn, [{ opacity: 0 }, { opacity: 1 }], 250, 0, LIFT),
              // 上から降りる。見え始めは早く、位置はゆっくり落ち着く
              anim(drop, [{ transform: 'translateY(-180px)', opacity: 0 }, { opacity: 1, offset: .3 }, { transform: 'none', opacity: 1 }], 1000, 0, LIFT),
              // 縦軸で2回転（720°）。降りきったあともしばらく回り、ゆっくり止まる
              anim(body, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(720deg)' }], 1800, 0, SPIN),
            ];
        if (!(await finish(anims))) return;
        busy = false;
      };

      const closeCard = async ({ focus = false } = {}) => {
        if (busy || current < 0) return;
        busy = true;
        const i = current;
        const reduced = ctx.reduced();
        const anims = reduced
          ? [anim(overlay, [{ opacity: 1 }, { opacity: 0 }], 250, 0, 'linear')]
          : [
              anim(drop, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-24px)' }], 300, 0, LIFT),
              anim(closeBtn, [{ opacity: 1 }, { opacity: 0 }], 200, 0, LIFT),
              anim(bg, [{ opacity: 1 }, { opacity: 0 }], 300, 100, LIFT),
            ];
        if (!(await finish(anims))) return;
        overlay.classList.remove('is-open');   // 終わってから外し、アニメーションは cancel 済み
        // 元の位置に伏せたカードが戻る（右から少し滑りながらフェードイン）
        cards[i].classList.remove('is-out');
        grid.inert = false;
        current = -1;
        const back = reduced
          ? anim(cards[i], [{ opacity: 0 }, { opacity: 1 }], 200, 0, 'linear')
          : anim(cards[i], [{ opacity: 0, transform: `translateX(${SLIDE}px)` }, { opacity: 1, transform: 'none' }], 300, 0, LIFT);
        if (!(await finish([back]))) return;
        busy = false;
        if (focus) cards[i].focus({ preventScroll: true });
      };

      const reset = () => {
        stage.getAnimations({ subtree: true }).forEach(x => x.cancel());
        overlay.classList.remove('is-open');
        cards.forEach(c => c.classList.remove('is-out'));
        grid.inert = false;
        current = -1; busy = false;
      };

      // 手で操作したら、デモの自動再生は止める
      cards.forEach((c, i) => c.addEventListener('click', () => { token++; openCard(i, { focus: true }); }));
      const userClose = () => { token++; closeCard({ focus: true }); };
      closeBtn.addEventListener('click', userClose);
      bg.addEventListener('click', userClose);
      overlay.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.stopPropagation(); userClose(); }
        if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus({ preventScroll: true }); }   // 操作できるのは閉じるボタンだけ
      });

      const run = async () => {
        const my = ++token;
        reset();
        const alive = () => my === token && deck.isConnected;
        await wait(300);
        if (!alive()) return;
        await openCard(2);
        if (!alive()) return;
        await wait(1200);                // 表を見せる
        if (!alive()) return;
        await closeCard();
        if (alive()) await wait(300);
      };
      return { run };
    },
    code: {
      css: `/* 伏せたカード: 5:8 の縦長。裏面は柄だけで、中身は見せない */
.card-back { aspect-ratio: 5 / 8; border-radius: 8px; background: #2a2250; }

/* 1. 選んだカードが、右へ少し滑りながらフェードアウト。消えたあとも消したままにする */
.card-back.is-picked {
  animation: card-out .3s cubic-bezier(.2, 0, 0, 1) both;
}
@keyframes card-out {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(8px); }
}

/* 2. 消えたあと(.3s)に、オーバーレイの中央へ。遠近は外側の箱、回転は内側の箱 */
.overlay { display: none; place-items: center; position: absolute; inset: 0; }
.overlay.is-open { display: grid; }
.card3d { width: 148px; height: 236px; perspective: 900px; }
.card-body { position: relative; height: 100%; transform-style: preserve-3d; }
.face { position: absolute; inset: 0; backface-visibility: hidden; }   /* 回って背中を向けたとき、表の面を隠す */
.face.back { transform: rotateY(180deg); }

/* 上から降りる(1s)。同時に縦軸で2回転(1.8s)し、ゆっくり止まる */
.overlay.is-open .card3d {
  animation: drop 1s cubic-bezier(.2, 0, 0, 1) both;
}
.overlay.is-open .card-body {
  animation: spin 1.8s cubic-bezier(.3, .1, .2, 1) both;
}
@keyframes drop {
  from { transform: translateY(-180px); opacity: 0; }
  30%  { opacity: 1; }
  to   { transform: none; opacity: 1; }
}
@keyframes spin {
  from { transform: rotateY(0deg); }
  to   { transform: rotateY(720deg); }   /* 720° = 2回転。止まったときは表の面 */
}
/* 閉じるときは、カードが少し上へ消え、元の位置に伏せたカードが戻る。WAAPI のタブを参照 */`,
      waapi: `const LIFT = 'cubic-bezier(.2, 0, 0, 1)', SPIN = 'cubic-bezier(.3, .1, .2, 1)';
const anim = (el, frames, duration, delay, easing) =>
  el.animate(frames, { duration, delay, easing, fill: 'both' });

async function draw(picked) {
  // 1. 選んだ伏せカードが、右へ少し滑りながらフェードアウト
  picked.classList.add('is-out');   // 消えたあとも非表示のまま（opacity: 0）
  const out = anim(picked,
    [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(8px)' }],
    300, 0, LIFT);
  await out.finished;
  out.cancel();

  // 2. 消えたあとに、オーバーレイの中央へ。上から降りながら、縦軸で2回転
  overlay.classList.add('is-open');
  const anims = [
    anim(bg,    [{ opacity: 0 }, { opacity: 1 }], 250, 0, LIFT),
    anim(close, [{ opacity: 0 }, { opacity: 1 }], 250, 0, LIFT),
    // card3d: 外側の箱（perspective をもつ）。降りる動き
    anim(card3d,
      [{ transform: 'translateY(-180px)', opacity: 0 },
       { opacity: 1, offset: .3 },
       { transform: 'none', opacity: 1 }],
      1000, 0, LIFT),
    // body: 内側の箱（preserve-3d）。720° = 2回転、降りきったあともゆっくり回る
    anim(body, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(720deg)' }], 1800, 0, SPIN),
  ];
  await Promise.all(anims.map(a => a.finished));
  anims.forEach(a => a.cancel());
}

async function dismiss(picked) {
  const anims = [
    anim(card3d, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-24px)' }], 300, 0, LIFT),
    anim(close,  [{ opacity: 1 }, { opacity: 0 }], 200, 0, LIFT),
    anim(bg,     [{ opacity: 1 }, { opacity: 0 }], 300, 100, LIFT),
  ];
  await Promise.all(anims.map(a => a.finished));
  overlay.classList.remove('is-open');   // 終わってから class を外し、そのあと cancel（ちらつき防止）
  picked.classList.remove('is-out');
  anims.forEach(a => a.cancel());
  // 元の位置に伏せたカードが戻る
  const back = anim(picked,
    [{ opacity: 0, transform: 'translateX(8px)' }, { opacity: 1, transform: 'none' }], 300, 0, LIFT);
  await back.finished;
  back.cancel();
}`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 滑る・降りる・回転はやめる。選んだカードは不透明度だけで消え、
     表を向いたカードが、オーバーレイごとフェードで現れる（transform は使わない） */
  .card-back.is-picked { animation: card-fade .2s linear both; }
  .overlay.is-open { animation: card-fade-in .25s linear both; }
  .overlay.is-open .card3d, .overlay.is-open .card-body { animation: none; }
}
@keyframes card-fade    { from { opacity: 1; } to { opacity: 0; } }
@keyframes card-fade-in { from { opacity: 0; } to { opacity: 1; } }`
    }
  },
  // ---- テキスト。1つの文章の見せ方（docs/adr/0017） ----
  {
    id: 'typewriter',
    cat: 'text',
    name: '字幕（1文字ずつ）',
    feel: '丁寧・語りかける',
    use: '字幕・ナレーション・チャットボットの返答',
    ms: 80,
    easing: 'linear',
    desc: '映像の下の字幕枠に、文字が1文字ずつ現れる。1文を出しきったら少し見せて、次の文に入れ替わる。シークバーで進めたり戻したりできる。時間は1文字ごとの間隔。',
    setup(stage, ctx) {
      const CHAR = 80;     // 1文字ごとの間隔
      const FADE = 60;     // 1文字が現れる時間
      const HOLD = 900;    // 1文を出しきってから見せる時間
      const SENTENCES = ['ここから少しだけ', '寄り道をしてみよう', 'この先が今日の本題です'];
      // 文ごとの開始時刻と長さ（打ち終わり + HOLD）。1本の時間軸に並べてシークできるようにする
      const spans = SENTENCES.map(t => ([...t].length - 1) * CHAR + FADE + HOLD);
      const starts = spans.map((_, k) => spans.slice(0, k).reduce((a, b) => a + b, 0));
      const TOTAL = spans.reduce((a, b) => a + b, 0);

      // 文はすべて同じ場所に重ねて置き、時刻に合わせて見せる文を切り替える。
      // シークの検証用に、1文目の最後の文字に data-seek-probe を付ける（打ち終わりの前後で見え方が変わる）
      stage.innerHTML = `
        <div class="tx tx-has-bar">
          <div class="tx-media"></div>
          <p class="tx-caption">${SENTENCES.map((t, k) => `<span class="tx-sentence">${[...t].map((c, i, all) =>
            `<span${k === 0 && i === all.length - 1 ? ' data-seek-probe="opacity"' : ''}>${c}</span>`).join('')}</span>`).join('')}</p>
          ${SEEK_BAR}
        </div>`;
      const root = q(stage, '.tx');
      const caption = q(stage, '.tx-caption');
      const sentences = [...caption.children];

      return withSeek(root, ctx, () => TOTAL, () => {
        const reduced = ctx.reduced();
        caption.classList.toggle('is-static', reduced);
        const opt = (start, dur) => ({ delay: ctx.dur(start), duration: ctx.dur(dur), easing: 'linear' });
        if (reduced) {
          // 動きを減らす: 1文字ずつにせず、1文をまとめて不透明度だけで出す（文の外では CSS で非表示）
          return sentences.map((el, k) => el.animate(
            [{ opacity: 0 }, { opacity: 1, offset: Math.min(1, 200 / spans[k]) }, { opacity: 1 }], opt(starts[k], spans[k])));
        }
        // 各文字: 自分の番で現れ、その文の終わりまで見える（前後は CSS の opacity: 0）
        return sentences.flatMap((el, k) => [...el.children].map((c, i) => {
          const t = i * CHAR, dur = spans[k] - t;
          return c.animate([{ opacity: 0 }, { opacity: 1, offset: FADE / dur }, { opacity: 1 }], opt(starts[k] + t, dur));
        }));
      });
    },
    code: {
      css: `/* 1文字ずつ span で包み、--i に何文字目か（0, 1, 2…）を入れる。
   文の入れ替えとシークは WAAPI のタブを参照 */
.caption span {
  animation: type-in 60ms linear backwards;
  animation-delay: calc(var(--i) * 80ms);
}
@keyframes type-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}`,
      waapi: `// 文を1本の時間軸に並べる。文 k の長さ = 打ち終わり + 見せる時間（900ms）
const spans = sentences.map(t => ([...t].length - 1) * 80 + 60 + 900);
const starts = spans.map((_, k) => spans.slice(0, k).reduce((a, b) => a + b, 0));

// 各文字は自分の番で現れ、その文の終わりまで見える（前後は CSS で opacity: 0）
const anims = sentenceEls.flatMap((el, k) => [...el.children].map((c, i) => {
  const dur = spans[k] - i * 80;
  return c.animate(
    [{ opacity: 0 }, { opacity: 1, offset: 60 / dur }, { opacity: 1 }],
    { delay: starts[k] + i * 80, duration: dur, easing: 'linear' }
  );
}));

// シーク: すべてのアニメーションの再生位置を同じ時刻にそろえる
range.addEventListener('input', () => {
  const time = range.value / 1000 * TOTAL;
  anims.forEach(a => { a.pause(); a.currentTime = time; });
});`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 1文字ずつにせず、1文をまとめて不透明度だけで出す */
  .caption span { animation: none; }
  .caption { animation: caption-in .2s linear; }
}
@keyframes caption-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}`
    }
  },
  {
    id: 'ticker',
    cat: 'text',
    name: 'ティッカー帯',
    feel: '連続・ニュース的',
    use: 'お知らせ帯・速報・運行情報',
    ms: 8000,
    easing: 'linear',
    desc: '画面上部の1行の帯の中を、文字が右から左へ途切れずに流れ続ける。同じ文を2つ並べて半分ずらすことで、継ぎ目なくループする。時間は1周の長さ。',
    setup(stage, ctx) {
      const LOOP = 8000;   // 1周の時間
      const ITEMS = ['本日のお知らせ', '18時からメンテナンスを行います', '新しいテーマを追加しました'];
      const line = ITEMS.join(' ・ ') + ' ・ ';
      stage.innerHTML = `
        <div class="tx-board">
          <div class="tx-band" role="marquee" aria-label="${ITEMS.join('。')}">
            <div class="tx-track"><span>${line}</span><span aria-hidden="true">${line}</span></div>
            <span class="tx-static" aria-hidden="true"></span>
          </div>
          <div class="tx-row"></div><div class="tx-row"></div><div class="tx-row"></div><div class="tx-row"></div>
        </div>`;
      const board = q(stage, '.tx-board');
      const track = q(stage, '.tx-track');
      const still = q(stage, '.tx-static');
      let token = 0;

      const run = async () => {
        const my = ++token;
        const reduced = ctx.reduced();
        track.hidden = reduced;
        still.hidden = !reduced;
        if (!reduced) {
          // 同じ文を2つ並べているので、半分（-50%）ずらすと最初と同じ見た目に戻る
          await settle(track.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }],
            { duration: ctx.dur(LOOP), easing: 'linear' }));
          return;
        }
        // 動きを減らす: 流さずに、1件ずつ不透明度だけで切り替える
        for (const text of ITEMS) {
          if (my !== token || !board.isConnected) return;
          still.textContent = text;
          await settle(still.animate(
            [{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .9 }, { opacity: 0 }],
            { duration: ctx.dur(LOOP / ITEMS.length), easing: 'linear', fill: 'both' }));
        }
      };
      return { run };
    },
    code: {
      css: `.band { overflow: hidden; white-space: nowrap; }
/* 同じ文を2つ並べた track を、半分（-50%）ずらしてループする */
.track { display: flex; width: max-content; animation: ticker 8s linear infinite; }
.track span { padding-right: 32px; }
@keyframes ticker {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}`,
      waapi: `// track の中に同じ文の span を2つ並べておく
track.animate(
  [{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }],
  { duration: 8000, easing: 'linear', iterations: Infinity }
);`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 流さずに止め、1件ずつ不透明度だけで切り替える（JS で文を差し替える） */
  .track { animation: none; }
  .static { animation: ticker-fade 2.67s linear infinite; }
}
@keyframes ticker-fade {
  0%, 100% { opacity: 0; }
  10%, 90% { opacity: 1; }
}`
    }
  },
  {
    id: 'sync-highlight',
    cat: 'text',
    name: '同期ハイライト',
    feel: '追従・落ち着き',
    use: '歌詞・書き起こし・読み上げの追従表示',
    ms: 300,
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    desc: '歌詞や書き起こしの今の行が明るくなり、一覧がその行を中央へ運ぶように動く。行は1.2秒ごとに進む。シークバーで進めたり戻したりできる。時間は次の行へ移る長さ。',
    setup(stage, ctx) {
      const LINE = 1200;   // 1行の長さ
      const MOVE = 300;    // 次の行へ移る時間（スクロールと明るさの切り替え）
      const EASE = 'cubic-bezier(.2, 0, 0, 1)';
      const LINES = ['遠くで鳴る音に', 'ふと足を止める', '見慣れた道が', '少しだけ違って見えた', 'ゆっくりでいい', 'ここから歩いていこう', 'また明日'];
      const TOTAL = LINES.length * LINE;
      const DIM = .35;

      stage.innerHTML = `
        <div class="tx-sync">
          <div class="tx-sync-frame">
            <ol class="tx-lines" data-seek-probe="transform">${LINES.map(l => `<li>${l}</li>`).join('')}</ol>
          </div>
          ${SEEK_BAR}
        </div>`;
      const root = q(stage, '.tx-sync');
      const frame = q(stage, '.tx-sync-frame');
      const list = q(stage, '.tx-lines');
      const rows = [...list.children];
      const at = ms => Math.min(1, Math.max(0, ms / TOTAL));   // 時刻 → keyframe の offset

      return withSeek(root, ctx, () => TOTAL, () => {
        const reduced = ctx.reduced();
        list.classList.toggle('is-static', reduced);
        /** @type {KeyframeAnimationOptions} */
        const opt = { duration: ctx.dur(TOTAL), easing: 'linear', fill: 'both' };
        // 行 i は i * LINE から明るくなり、次の行に移ると暗く戻る
        const anims = rows.map((el, i) => {
          const on = i * LINE, off = (i + 1) * LINE;
          const fade = reduced ? 0 : MOVE;   // 動きを減らす: 明るさは瞬時に切り替える
          const keyframes = [{ opacity: DIM, offset: 0 }];
          if (on > 0) keyframes.push({ opacity: DIM, offset: at(on), easing: EASE });
          keyframes.push({ opacity: 1, offset: at(on + fade) });
          if (off < TOTAL) keyframes.push({ opacity: 1, offset: at(off), easing: EASE }, { opacity: DIM, offset: at(off + fade) });
          keyframes.push({ opacity: keyframes[keyframes.length - 1].opacity, offset: 1 });
          return el.animate(keyframes, opt);
        });
        if (!reduced) {
          // 一覧のスクロール: 今の行の中心を枠の中心に合わせる。行が変わる時だけ MOVE かけて動く
          const y = el => frame.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2);
          const keyframes = [{ transform: `translateY(${y(rows[0])}px)`, offset: 0 }];
          rows.forEach((el, i) => {
            if (i === 0) return;
            keyframes.push({ transform: `translateY(${y(rows[i - 1])}px)`, offset: at(i * LINE), easing: EASE },
                   { transform: `translateY(${y(el)}px)`, offset: at(i * LINE + MOVE) });
          });
          keyframes.push({ transform: `translateY(${y(rows[rows.length - 1])}px)`, offset: 1 });
          anims.push(list.animate(keyframes, opt));
        }
        return anims;
      });
    },
    code: {
      css: `/* 今の行に .is-current を付け替える（JS で時刻から決める） */
.lines li { opacity: .35; transition: opacity .3s cubic-bezier(.2, 0, 0, 1); }
.lines li.is-current { opacity: 1; }
/* 一覧のスクロール: 今の行の中心を枠の中心に合わせる */
.lines { transform: translateY(var(--y)); transition: transform .3s cubic-bezier(.2, 0, 0, 1); }`,
      waapi: `const LINE = 1200, MOVE = 300, TOTAL = rows.length * LINE;
const EASE = 'cubic-bezier(.2, 0, 0, 1)';
const at = ms => Math.min(1, ms / TOTAL);
const y = el => frame.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2);

// 一覧: 行が変わる時だけ MOVE かけて、その行を中央へ運ぶ
const k = [{ transform: \`translateY(\${y(rows[0])}px)\`, offset: 0 }];
rows.forEach((el, i) => {
  if (i === 0) return;
  k.push({ transform: \`translateY(\${y(rows[i - 1])}px)\`, offset: at(i * LINE), easing: EASE },
         { transform: \`translateY(\${y(el)}px)\`, offset: at(i * LINE + MOVE) });
});
const scroll = list.animate(k, { duration: TOTAL, fill: 'both' });
// 各行の明るさも同じ TOTAL の keyframes で作り、currentTime をそろえてシークする`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 一覧は動かさず、今の行の明るさだけを瞬時に切り替える */
  .lines { transform: none; transition: none; }
  .lines li { transition: none; }
}`
    }
  }
];
