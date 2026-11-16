/* モーション定義: テキスト。1つの文章の見せ方（docs/adr/0017）。motions.js が集めて MOTIONS にする。追加したら stories/motions.stories.js にも1行足す */
import { q } from '../dom.js';
import { settle } from '../runtime.js';
import { withSeek, SEEK_BAR } from '../seek.js';

/** @type {import('../types.js').Motion[]} */
export const TEXT_MOTIONS = [
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
  },
];
