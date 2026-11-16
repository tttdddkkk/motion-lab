/* モーション定義: コメント（映像と重ならない別枠。docs/adr/0008, 0013）。motions.js が集めて MOTIONS にする。追加したら stories/motions.stories.js にも1行足す */
import { q, qa } from '../dom.js';
import { withSeek, SEEK_BAR } from '../seek.js';

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

/** @type {import('../types.js').Motion[]} */
export const COMMENT_MOTIONS = [
  {
    id: 'flow-seek',
    cat: 'comment',
    name: '流れる文字+シーク',
    feel: '連続・にぎやか',
    use: 'タイムライン連動のテキスト',
    ms: 3000,
    msLabel: '1つの文字が枠を横切る',
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
    msLabel: '1つの文字が枠を横切る',
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
    msLabel: '1つの吹き出しが現れる',
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
];
