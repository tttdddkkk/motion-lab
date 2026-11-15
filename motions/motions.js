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
      const root = stage.querySelector('.ntf');
      const wait = ms => new Promise(r => setTimeout(r, ctx.dur(ms)));
      const finish = a => a.finished.catch(() => {});
      let token = 0;

      const run = async () => {
        const my = ++token;
        root.querySelectorAll('.ntf-toast').forEach(el => el.remove());
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
        await finish(toast.animate(enter, { duration: ctx.dur(reduced ? 200 : IN), easing: reduced ? 'linear' : 'cubic-bezier(.2, 0, 0, 1)', fill: 'backwards' }));
        // 押されるか、一定時間たつまで見せる
        await Promise.race([wait(HOLD), new Promise(r => toast.addEventListener('click', r, { once: true }))]);
        if (my !== token || !root.isConnected) return;
        const leave = reduced
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ transform: 'translateY(0)' }, { transform: OFF }];
        await finish(toast.animate(leave, { duration: ctx.dur(reduced ? 200 : OUT), easing: reduced ? 'linear' : 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }));
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
      const root = stage.querySelector('.ntf');
      const wait = ms => new Promise(r => setTimeout(r, ctx.dur(ms)));
      const finish = a => a.finished.catch(() => {});
      let token = 0;

      const run = async () => {
        const my = ++token;
        root.querySelectorAll('.ntf-banner').forEach(el => el.remove());
        const banner = document.createElement('div');
        banner.className = 'ntf-banner';
        banner.setAttribute('role', 'status');
        banner.innerHTML = '<strong>新着のお知らせ</strong><span>3件の更新があります</span>';
        root.append(banner);
        const reduced = ctx.reduced();
        const enter = reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ transform: 'translateY(calc(-100% - 10px))' }, { transform: 'translateY(0)' }];
        await finish(banner.animate(enter, { duration: ctx.dur(reduced ? 200 : IN), easing: reduced ? 'linear' : 'cubic-bezier(.22, 1.2, .36, 1)', fill: 'backwards' }));
        await wait(HOLD);
        if (my !== token || !root.isConnected) return;
        const leave = reduced
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ transform: 'translateY(0)' }, { transform: 'translateY(calc(-100% - 10px))' }];
        await finish(banner.animate(leave, { duration: ctx.dur(reduced ? 200 : OUT), easing: reduced ? 'linear' : 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' }));
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
      const root = stage.querySelector('.ntf');
      const badge = stage.querySelector('.ntf-badge');
      const wait = ms => new Promise(r => setTimeout(r, ctx.dur(ms)));
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
  }
];
