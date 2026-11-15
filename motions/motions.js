/* ============================================================
   モーション定義（1モーション = 1オブジェクト）
   追加したら stories/motions.stories.js にも1行足す（テストで漏れを検出する）。
   setup(stage, ctx) -> { run(x?, y?) : Promise }
   ctx.dur(ms)    再生速度を反映した時間
   ctx.reduced()  「動きを減らす」がONか
   ============================================================ */
/* 流れる文字+シークの共通実装。vertical で横（右→左）と縦（下→上）を切り替える。
   映像と重ねない・行は固定・投稿や重なり回避は作らない（docs/adr/0008, 0013） */
function flowSeek(stage, ctx, { vertical }) {
  const CROSS = vertical ? 4000 : 3000;   // 1つの文字が枠を横切る時間
  // 文字が枠の端に出きる位置。横は最長の文字が左に出きる位置(px)。
  // 縦は折り返しで高さが変わるため、再生のたびに最も高い文字の高さから決める（build 内）。
  // 全件を同じ距離・同じ時間で流し、速さをそろえる（文字ごとの高さにすると、高い文字だけ速くなる）
  const END = vertical ? null : '-140px';
  const axis = vertical ? 'Y' : 'X';
  const ITEMS = [
    { t: 0,    lane: 0, text: 'はじまった' },
    { t: 400,  lane: 1, text: 'こんばんは' },
    { t: 900,  lane: 2, text: '音がいい' },
    { t: 1600, lane: 0, text: 'ここ好き' },
    // 縦版は枠が狭く折り返すため、2行になる長い文字を1件入れる。
    // 縦版の出現時刻は t ではなく、文字の高さから計算する（build 内の timesFor）
    { t: 2200, lane: 1, text: vertical ? 'このサビが何度聴いても好き' : 'なるほど' },
    { t: 2800, lane: 2, text: 'もう一回見たい' },
    { t: 3400, lane: 0, text: 'きれい' },
    { t: 4000, lane: 1, text: 'わかる' },
    { t: 4700, lane: 2, text: 'おつかれさま' },
  ];
  // 縦版: 1行の文字どうしの出現間隔。前の文字が1行より高ければ、そのぶん次を遅らせて、見た目の隙間をそろえる
  const STEP = 600;
  let times = ITEMS.map(i => i.t);   // 出現時刻。縦版は build で計算し直す
  let TOTAL = Math.max(...times) + CROSS;

  stage.innerHTML = `
    <div class="flow${vertical ? ' is-vertical' : ''}">
      <div class="flow-media"></div>
      <div class="flow-frame">${ITEMS.map(i =>
        `<span class="flow-item"${vertical ? '' : ` style="top:${8 + i.lane * 28}px"`}>${i.text}</span>`).join('')}</div>
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
          // 足りないときだけ、最も早く消える文字の位置に重ねる
          ok = false;
          y = active.reduce((a, o) => (o.end < a.end ? o : a)).y;
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

  const build = () => {
    anims.forEach(a => a.cancel());
    const W = vertical ? frame.clientHeight : frame.clientWidth;
    const reduced = ctx.reduced();
    // 縦の静止表示: 表示時間が重なる文字どうしだけを避けて位置を決める。
    // 下に空きがあるうちは下へ足していき（全件が専用の位置）、足りなくなったら上に戻って再利用する
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
    anims = els.map((el, i) => {
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
      // 縦: 位置は packSlots で決める（表示時間が重なる文字どうしを避ける）。表示期間は CROSS
      const next = vertical ? -1 : ITEMS.findIndex((o, j) => j > i && o.lane === lane);
      const end = Math.min(t + CROSS, next >= 0 ? times[next] : Infinity);
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
  // 再生前でも時刻0の配置で表示し、シークできるようにする。
  // 位置の計算に枠の幅が要るため、DOM に入った後（次のフレーム）で作る
  requestAnimationFrame(() => {
    if (clock || !frame.isConnected) return;
    build();
    anims.forEach(a => a.pause());
    setLabel();
  });
  return { run };
}

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
      const frame = stage.querySelector('.chat-frame');
      const wait = ms => new Promise(r => setTimeout(r, ctx.dur(ms)));
      let token = 0;

      // 吹き出しを1つ足す。押し上げは「足す前後の位置の差」から作る（FLIP）
      const add = text => {
        const before = [...frame.children].map(el => el.offsetTop);
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.textContent = text;
        frame.append(bubble);
        if (ctx.reduced()) {
          // 動きを減らす: 位置は即座に切り替え、新しい吹き出しは不透明度だけで出す
          bubble.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ctx.dur(200), easing: 'linear' });
        } else {
          [...frame.children].slice(0, -1).forEach((el, i) => {
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
        [...frame.children].forEach(el => { if (el.offsetTop + el.offsetHeight < 0) el.remove(); });
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

  {
    id: 'shelf-open',
    cat: 'expand',
    name: '本棚リスト（本が開く）',
    feel: '知的・やわらか',
    use: '縦並びの一覧から選んで、中身をその場で展開する（目次・ライブラリ・設定）',
    ms: 700,
    easing: 'cubic-bezier(.65, 0, .35, 1)',
    desc: '縦に並んだ本の背表紙を選ぶと、その本の表紙が上へ開いてページが現れる。別の本を選ぶと、開いていた本は閉じる。背表紙はクリックでも開閉できる。時間は1冊が開く長さ（高さ500ms + 表紙の回転500msを200msずらす）で、全体は約4秒。',
    setup(stage, ctx) {
      const OPEN_H = 132;                          // ページ部分の高さ（CSS の --open-h と合わせる）
      const EASE = 'cubic-bezier(.65, 0, .35, 1)';
      const BOOKS = [
        { title: '光の設計', author: '青木', color: '#8c2f39', chapter: '第1章 窓のかたち', text: '朝の光は、窓の高さで表情を変える。低い窓は床を照らし、高い窓は壁を伝って奥まで届く。' },
        { title: '海辺の植物', author: '森下', color: '#1f5f5b', chapter: '第3章 砂の上で', text: '潮風にさらされる土地では、背の低い草ほど根を深く張る。見えない部分が、全体を支えている。' },
        { title: '星の数え方', author: '石川', color: '#2f4a8a', chapter: '第2章 最初の一つ', text: '数え始めるのは、いちばん明るい星から。名前を覚えると、空の見え方が少し変わる。' },
        { title: '台所の化学', author: '松本', color: '#6b4e1e', chapter: '第5章 火加減', text: '強い火は表面を、弱い火は中心を変える。待つ時間もまた、調理の一部になる。' },
        { title: '地図の読み方', author: '高田', color: '#4b3a7a', chapter: '第1章 北を決める', text: '地図は、何を省くかで決まる。縮尺を変えると、同じ町が別の場所に見えてくる。' },
      ];

      stage.innerHTML = `
        <div class="shelf">
          ${BOOKS.map((b, i) => `
          <div class="book" style="--c:${b.color}">
            <button class="book-spine" type="button" aria-expanded="false" aria-controls="shelf-pages-${i}">
              <span class="book-title">${b.title}</span><span class="book-author">${b.author}</span>
            </button>
            <div class="book-pages" id="shelf-pages-${i}" role="region" aria-label="${b.title}の本文" inert>
              <div class="book-paper"><div class="book-page"><h4>${b.chapter}</h4><p>${b.text}</p></div></div>
              <div class="book-cover" aria-hidden="true">${b.title}</div>
            </div>
          </div>`).join('')}
          <div class="shelf-board"></div>
        </div>`;
      const shelf = stage.querySelector('.shelf');
      const books = [...stage.querySelectorAll('.book')];
      const wait = ms => new Promise(r => setTimeout(r, ctx.dur(ms)));
      const busy = new Set();   // 開閉中の本。連打で状態が壊れないよう、その間の操作は受け付けない
      let openIdx = -1;
      let token = 0;

      // 1冊を開く / 閉じる。最終状態は .is-open で持ち、アニメーションは途中の見た目だけを担う（終わったら cancel）
      const move = async (i, open) => {
        const book = books[i];
        const pages = book.querySelector('.book-pages');
        const cover = book.querySelector('.book-cover');
        const reduced = ctx.reduced();
        shelf.classList.toggle('is-reduced', reduced);
        book.querySelector('.book-spine').setAttribute('aria-expanded', String(open));
        pages.inert = !open;
        if (open) book.classList.add('is-open');
        const a = (el, frames, duration, delay = 0, easing = EASE) =>
          el.animate(frames, { duration: ctx.dur(duration), delay: ctx.dur(delay), easing, fill: 'both' });
        let anims;
        if (reduced) {
          // 動きを減らす: 高さと不透明度だけ。transform は使わない
          anims = [
            a(pages, open ? [{ height: '0px' }, { height: `${OPEN_H}px` }] : [{ height: `${OPEN_H}px` }, { height: '0px' }], 250, 0, 'linear'),
            a(cover, open ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], 250, 0, 'linear'),
          ];
        } else if (open) {
          anims = [
            a(pages, [{ height: '0px' }, { height: `${OPEN_H}px` }], 500),
            a(cover, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-100deg)' }], 500, 200),   // 高さが伸び始めてから表紙を開く
          ];
        } else {
          anims = [
            a(cover, [{ transform: 'rotateX(-100deg)' }, { transform: 'rotateX(0deg)' }], 350),       // 表紙が先に戻る
            a(pages, [{ height: `${OPEN_H}px` }, { height: '0px' }], 400, 150),
          ];
        }
        busy.add(i);
        try {
          await Promise.all(anims.map(x => x.finished));
        } catch { return; }   // run の頭の reset で中断された
        busy.delete(i);
        if (!open) book.classList.remove('is-open');
        anims.forEach(x => x.cancel());
      };

      // 本を選ぶ。開いている本があれば、同時に閉じる
      const choose = i => {
        if (busy.has(i) || (openIdx >= 0 && busy.has(openIdx))) return Promise.resolve();
        const jobs = [];
        if (openIdx >= 0) jobs.push(move(openIdx, false));
        if (openIdx === i) openIdx = -1;
        else { jobs.push(move(i, true)); openIdx = i; }
        return Promise.all(jobs);
      };

      const reset = () => {
        stage.getAnimations({ subtree: true }).forEach(x => x.cancel());
        books.forEach(book => {
          book.classList.remove('is-open');
          book.querySelector('.book-spine').setAttribute('aria-expanded', 'false');
          book.querySelector('.book-pages').inert = true;
        });
        busy.clear();
        openIdx = -1;
      };

      books.forEach((book, i) => {
        book.querySelector('.book-spine').addEventListener('click', () => { token++; choose(i); });
      });

      const run = async () => {
        const my = ++token;
        reset();
        const alive = () => my === token && shelf.isConnected;
        await wait(300);
        if (!alive()) return;
        await choose(2);                 // 開く
        if (!alive()) return;
        await wait(900);
        if (!alive()) return;
        await choose(0);                 // 別の本を選ぶ: 開いていた本は閉じ、選んだ本が開く
        if (!alive()) return;
        await wait(900);
        if (!alive()) return;
        await choose(0);                 // 閉じる
        if (alive()) await wait(300);
      };
      return { run };
    },
    code: {
      css: `.book { perspective: 700px; }
.pages { position: relative; height: 0; /* 閉じる: 表紙が先に戻り、高さは .15s 遅れて縮む */
  transition: height .4s cubic-bezier(.65, 0, .35, 1) .15s; }
.book.is-open .pages { height: 132px; /* 開く: 高さが伸び始めて .2s 後に表紙が回る */
  transition: height .5s cubic-bezier(.65, 0, .35, 1) 0s; }
.cover {
  position: absolute; inset: 0;          /* ページの領域と同じ大きさ（高さに追従する） */
  transform-origin: 50% 0;               /* 背表紙の下の辺を蝶番にする */
  backface-visibility: hidden;           /* 90°を超えたら見えなくなる */
  transition: transform .35s cubic-bezier(.65, 0, .35, 1) 0s;
}
.book.is-open .cover {
  transform: rotateX(-100deg);
  transition: transform .5s cubic-bezier(.65, 0, .35, 1) .2s;
}`,
      waapi: `const OPEN_H = 132, EASE = 'cubic-bezier(.65, 0, .35, 1)';
const anim = (el, frames, duration, delay = 0) =>
  el.animate(frames, { duration, delay, easing: EASE, fill: 'both' });

function open(book) {
  book.classList.add('is-open');   // 最終状態は class に持たせる
  const pages = book.querySelector('.pages');
  const cover = book.querySelector('.cover');
  return Promise.all([
    anim(pages, [{ height: '0px' }, { height: OPEN_H + 'px' }], 500),
    anim(cover, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-100deg)' }], 500, 200),
  ].map(a => a.finished.then(() => a.cancel())));
}

async function close(book) {
  const pages = book.querySelector('.pages');
  const cover = book.querySelector('.cover');
  const anims = [
    anim(cover, [{ transform: 'rotateX(-100deg)' }, { transform: 'rotateX(0deg)' }], 350),
    anim(pages, [{ height: OPEN_H + 'px' }, { height: '0px' }], 400, 150),
  ];
  await Promise.all(anims.map(a => a.finished));
  book.classList.remove('is-open');   // 終わってから class を外し、そのあと cancel（ちらつき防止）
  anims.forEach(a => a.cancel());
}

// 本を選ぶ: 開いている本があれば同時に閉じる
let current = null;
shelf.addEventListener('click', e => {
  const book = e.target.closest('.book');
  if (!book) return;
  if (current && current !== book) close(current);
  if (current === book) { close(book); current = null; }
  else { open(book); current = book; }
});`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 表紙は回さず、高さと不透明度だけで開閉する（transform は使わない） */
  .pages, .book.is-open .pages { transition: height .25s linear 0s; }
  .cover, .book.is-open .cover {
    transform: none;
    transition: opacity .25s linear 0s;
  }
  .book.is-open .cover { opacity: 0; }
}`
    }
  }
];
