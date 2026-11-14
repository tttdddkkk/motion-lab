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
  // 縦は折り返しで高さが変わるため、文字自身の高さ(-100%)にする
  const END = vertical ? '-100%' : '-140px';
  const axis = vertical ? 'Y' : 'X';
  const ITEMS = [
    { t: 0,    lane: 0, text: 'はじまった' },
    { t: 400,  lane: 1, text: 'こんばんは' },
    { t: 900,  lane: 2, text: '音がいい' },
    { t: 1600, lane: 0, text: 'ここ好き' },
    // 縦版は枠が狭く折り返すため、2行になる長い文字を1件入れる。
    // 行は固定で重なりを自動では避けないので、前後の文字との間隔（600ms以上）を空けてある
    { t: 2200, lane: 1, text: vertical ? 'このサビが何度聴いても好き' : 'なるほど' },
    { t: 2800, lane: 2, text: 'もう一回見たい' },
    { t: 3400, lane: 0, text: 'きれい' },
    { t: 4000, lane: 1, text: 'わかる' },
    { t: 4700, lane: 2, text: 'おつかれさま' },
  ];
  const TOTAL = Math.max(...ITEMS.map(i => i.t)) + CROSS;

  stage.innerHTML = `
    <div class="flow${vertical ? ' is-vertical' : ''}">
      <div class="flow-media"></div>
      <div class="flow-frame">${ITEMS.map(i =>
        `<span class="flow-item" style="--lane:${i.lane}${vertical ? '' : `;top:${8 + i.lane * 28}px`}">${i.text}</span>`).join('')}</div>
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
    const W = vertical ? frame.clientHeight : frame.clientWidth;
    const reduced = ctx.reduced();
    anims = els.map((el, i) => {
      const { t, lane } = ITEMS[i];
      el.classList.toggle('is-static', reduced);
      if (!reduced) {
        return el.animate(
          [{ transform: `translate${axis}(${W}px)` }, { transform: `translate${axis}(${END})` }],
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
    desc: '映像の横の枠で文字が下から上へ流れる。シークバーで進めたり戻したりできる。「流れる文字+シーク」から方向だけを縦にしたもので、枠が狭いため長い文字は折り返す。時間は1つの文字が枠を横切る長さで、全体は約8.7秒。',
    setup(stage, ctx) { return flowSeek(stage, ctx, { vertical: true }); },
    code: {
      css: `.frame { position: relative; overflow: hidden; container-type: size; }
.item {
  position: absolute; top: 0; left: 8px; /* 全件、左端にそろえる */
  /* 枠が狭いので折り返す。左右に8pxの余白を残す */
  max-width: calc(100% - 16px); overflow-wrap: anywhere;
  animation: flow-up 4s linear both;
  animation-delay: var(--t); /* 出現時刻（例: 1.6s） */
}
@keyframes flow-up {
  from { transform: translateY(100cqh); }
  to   { transform: translateY(-100%); } /* 折り返しても、文字自身の高さぶん上に出きる */
}
/* シーク: 一時停止して、遅延を「出現時刻 − シーク位置」にずらす */
.frame.is-seeking .item {
  animation-play-state: paused;
  animation-delay: calc(var(--t) - var(--seek));
}`,
      waapi: `const CROSS = 4000;
const H = frame.clientHeight;
const anims = items.map(({ el, t }) => el.animate(
  [{ transform: \`translateY(\${H}px)\` },
   { transform: 'translateY(-100%)' }],   // 折り返しても、文字自身の高さぶん上に出きる
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
     表示期間 --dur は「同じ行の次の文字が出るまで（最長4s）」にして重ならないようにする */
  /* 行の間隔は、折り返して2行になっても重ならない高さ（48px）にする */
  .item { top: calc(8px + var(--lane) * 48px); left: 8px;
          animation-name: flow-fade; animation-duration: var(--dur); }
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
  }
];
