/* ============================================================
   モーション定義（1モーション = 1オブジェクト）
   追加したら stories/motions.stories.js にも1行足す（テストで漏れを検出する）。
   setup(stage, ctx) -> { run(x?, y?) : Promise }
   ctx.dur(ms)    再生速度を反映した時間
   ctx.reduced()  「動きを減らす」がONか
   ============================================================ */
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
      const btn = stage.firstElementChild;
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
      const btn = stage.firstElementChild;
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
  from { transform: scale(1); opacity: .3; }
  to   { transform: scale(1); opacity: 0; }
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
      const b = stage.querySelector('.screen.b');
      b.style.clipPath = `circle(0% at ${origin})`;
      const wait = ms => new Promise(r => setTimeout(r, ctx.dur(ms)));
      const run = async () => {
        let a;
        if (ctx.reduced()) {
          b.style.clipPath = 'none';
          a = b.animate([{ opacity: 0 }, { opacity: 1 }],
                        { duration: ctx.dur(300), fill: 'forwards' });
        } else {
          a = b.animate(
            [{ clipPath: `circle(0% at ${origin})` },
             { clipPath: `circle(150% at ${origin})` }],
            { duration: ctx.dur(700), easing: 'cubic-bezier(.65, 0, .35, 1)', fill: 'forwards' }
          );
        }
        await a.finished;
        await wait(700);   // 表示したまましばらく見せる
        a.cancel();
        b.style.clipPath = `circle(0% at ${origin})`;
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
    cat: 'text',
    name: '流れる文字+シーク',
    feel: '連続・にぎやか',
    use: 'タイムライン連動のテキスト',
    ms: 3000,
    easing: 'linear',
    desc: '映像の下の枠で文字が右から左へ流れる。シークバーで進めたり戻したりできる。時間は1つの文字が枠を横切る長さで、全体は約7.7秒。',
    setup(stage, ctx) {
      // 映像と重ねない・行は固定・投稿や重なり回避は作らない（docs/adr/0008）
      const CROSS = 3000;   // 1つの文字が枠を横切る時間
      const END = -140;     // 最も長い文字が枠の左に出きる位置(px)
      const ITEMS = [
        { t: 0,    lane: 0, text: 'はじまった' },
        { t: 400,  lane: 1, text: 'こんばんは' },
        { t: 900,  lane: 2, text: '音がいい' },
        { t: 1600, lane: 0, text: 'ここ好き' },
        { t: 2200, lane: 1, text: 'なるほど' },
        { t: 2800, lane: 2, text: 'もう一回見たい' },
        { t: 3400, lane: 0, text: 'きれい' },
        { t: 4000, lane: 1, text: 'わかる' },
        { t: 4700, lane: 2, text: 'おつかれさま' },
      ];
      const TOTAL = Math.max(...ITEMS.map(i => i.t)) + CROSS;

      stage.innerHTML = `
        <div class="flow">
          <div class="flow-media"></div>
          <div class="flow-frame">${ITEMS.map(i =>
            `<span class="flow-item" style="top:${8 + i.lane * 28}px">${i.text}</span>`).join('')}</div>
          <div class="flow-bar">
            <button class="flow-play" type="button" aria-label="一時停止">❚❚</button>
            <input class="flow-range" type="range" min="0" max="1000" value="0" aria-label="再生位置">
          </div>
        </div>`;
      const frame = stage.querySelector('.flow-frame');
      const els = [...stage.querySelectorAll('.flow-item')];
      const playBtn = stage.querySelector('.flow-play');
      const range = stage.querySelector('.flow-range');

      let anims = [];
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
        const time = fraction * ctx.dur(TOTAL);
        anims.forEach(a => { a.currentTime = time; });
      };
      // シークバーの表示更新は再生中だけ回し、二重に起動しない
      const tick = () => {
        if (!clock || clock.playState === 'idle') { ticking = false; return; }
        if (!dragging) range.value = Math.round(clock.currentTime / ctx.dur(TOTAL) * 1000);
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
        const W = frame.clientWidth;
        const reduced = ctx.reduced();
        anims = els.map((el, i) => {
          const { t, lane } = ITEMS[i];
          el.classList.toggle('is-static', reduced);
          if (!reduced) {
            return el.animate(
              [{ transform: `translateX(${W}px)` }, { transform: `translateX(${END}px)` }],
              { duration: ctx.dur(CROSS), delay: ctx.dur(t), easing: 'linear', fill: 'both' }
            );
          }
          // 静止表示: 同じ行の次の文字が出るまでを表示期間にして、重ならないようにする
          const next = ITEMS.find((o, j) => j > i && o.lane === lane);
          const end = Math.min(t + CROSS, next ? next.t : Infinity);
          return el.animate(
            [{ opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .9 }, { opacity: 0 }],
            { duration: ctx.dur(end - t), delay: ctx.dur(t), easing: 'linear', fill: 'both' }
          );
        });
        clock = frame.animate([], { duration: ctx.dur(TOTAL) });
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
      range.addEventListener('input', () => seek(range.value / 1000));
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
        return clock.finished.then(() => setLabel());
      };
      return { run };
    },
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
  }
];
