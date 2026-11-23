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
    msLabel: '1文字ごとの間隔',
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
    msLabel: '1周',
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
    msLabel: '次の行へ移る',
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

  {
    id: 'morph-text',
    cat: 'text',
    name: 'モーフィング（溶けて変わる）',
    feel: '柔らかい・変身',
    use: 'キャッチコピーの切り替え・ヒーロー見出し・ローディング文言',
    ms: 1000,
    msLabel: '溶け合う時間',
    easing: 'linear',
    desc: '文字がにじんで溶け、別の言葉に変わる。ぼかしを強めながら消える文字と、ぼかしがほどけながら現れる文字を重ね、全体にしきい値フィルターをかけて輪郭をくっきり保つ。言葉は1.2秒見せてから切り替わる。時間は溶け合う長さ。',
    setup(stage, ctx) {
      const HOLD = 1200;   // 1つの言葉を見せる時間
      const MORPH = 1000;  // 溶け合う時間
      const STEPS = 12;    // 溶け合いのキーフレームの数（ぼかしは直線でなく曲線なので、細かく刻む）
      const MAX_BLUR = 40;
      const BLUR = 2;      // ぼかしの強さの係数。文字が大きいほど大きくできる
      const SIZE = 52;     // 文字の大きさの上限（px）
      const SIDE = 16;     // 枠の左右に残す余白（px）
      const WORDS = ['溶ける', 'ことば', 'モーフィング', 'かたち', '変わる'];

      // フィルターの matrix の最後の行（0 0 0 255 -140）が「しきい値」: 薄く透けた部分は消え、濃い部分はくっきり残る。
      // これで、ぼかした2つの文字が溶け合って見える
      stage.innerHTML = `
        <div class="tx-morph" role="img" aria-label="${WORDS.join('、')}">
          <svg class="tx-morph-defs" aria-hidden="true" focusable="false">
            <filter id="tx-morph-goo" color-interpolation-filters="sRGB">
              <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 255 -140"/>
            </filter>
          </svg>
          <div class="tx-morph-text" aria-hidden="true"><span class="tx-morph-a"></span><span class="tx-morph-b"></span></div>
        </div>`;
      const text = q(stage, '.tx-morph-text');
      const a = q(stage, '.tx-morph-a');   // 消えていく側
      const b = q(stage, '.tx-morph-b');   // 現れる側
      a.textContent = WORDS[0];
      let token = 0;

      // 一番長い言葉が枠に収まるように、文字の大きさを決める（全部の言葉で同じ大きさにして、切り替え中に大きさが変わらないようにする）。
      // 枠の幅は offsetWidth で測る。縮小表示（transform）の影響を受けない
      const fit = () => {
        text.style.fontSize = `${SIZE}px`;
        const widest = Math.max(...WORDS.map(w => { a.textContent = w; return a.offsetWidth; }));
        const room = stage.offsetWidth - SIDE * 2;
        if (widest > room) text.style.fontSize = `${Math.floor(SIZE * room / widest)}px`;
      };

      // 進み具合 f（0〜1）でのぼかしと不透明度。端でぼかしが無限大にならないよう上限を決める
      const blurIn = f => Math.min(BLUR / f - BLUR, MAX_BLUR);
      const fadeIn = f => Math.pow(f, .4);

      const run = async () => {
        const my = ++token;
        const reduced = ctx.reduced();
        fit();
        text.classList.toggle('is-static', reduced);   // 動きを減らす: しきい値フィルターを外す
        const total = HOLD + MORPH;
        const at = f => (HOLD + f * MORPH) / total;    // 溶け合いの進み具合 → keyframe の offset
        /** @type {KeyframeAnimationOptions} */
        const opt = { duration: ctx.dur(total), easing: 'linear', fill: 'both' };
        let prev = [];
        for (let i = 0; i < WORDS.length; i++) {
          if (my !== token || !stage.isConnected) return;
          a.textContent = WORDS[i];
          b.textContent = WORDS[(i + 1) % WORDS.length];
          prev.forEach(x => x.cancel());
          let out, inn;
          if (reduced) {
            // 動きを減らす: ぼかさず、不透明度だけで入れ替える
            out = a.animate([{ opacity: 1, offset: at(0) }, { opacity: 0, offset: 1 }], opt);
            inn = b.animate([{ opacity: 0, offset: at(0) }, { opacity: 1, offset: 1 }], opt);
          } else {
            const outFrames = [{ opacity: 1, filter: 'blur(0px)', offset: 0 }];
            const inFrames = [{ opacity: 0, filter: `blur(${MAX_BLUR}px)`, offset: 0 }];
            for (let k = 1; k <= STEPS; k++) {
              const f = k / STEPS;
              // 消える側は、進み具合を反転させて同じ式を使う
              outFrames.push({ opacity: k === STEPS ? 0 : fadeIn(1 - f), filter: `blur(${(k === STEPS ? MAX_BLUR : blurIn(1 - f)).toFixed(2)}px)`, offset: at(f) });
              inFrames.push({ opacity: fadeIn(f), filter: `blur(${(k === STEPS ? 0 : blurIn(f)).toFixed(2)}px)`, offset: at(f) });
            }
            // 溶け合い始めるまでは、それぞれ最初の状態を保つ
            outFrames.splice(1, 0, { ...outFrames[0], offset: at(0) });
            inFrames.splice(1, 0, { ...inFrames[0], offset: at(0) });
            out = a.animate(outFrames, opt);
            inn = b.animate(inFrames, opt);
          }
          prev = [out, inn];
          await Promise.all([settle(out), settle(inn)]);
        }
      };
      return { run };
    },
    code: {
      css: `/* 2つの文字を同じ場所に重ね、全体にしきい値フィルターをかける。
   ぼかして薄くなった部分はフィルターで消え、2つの文字が溶け合って見える */
.morph { filter: url(#goo); }
.morph span { grid-area: 1 / 1; }
.out { animation: morph-out 1s linear forwards; }
.in  { animation: morph-in  1s linear forwards; }
@keyframes morph-out {
  0%   { filter: blur(0);    opacity: 1; }
  50%  { filter: blur(2px);  opacity: .76; }
  80%  { filter: blur(8px);  opacity: .52; }
  100% { filter: blur(40px); opacity: 0; }
}
@keyframes morph-in {
  0%   { filter: blur(40px); opacity: 0; }
  20%  { filter: blur(8px);  opacity: .52; }
  50%  { filter: blur(2px);  opacity: .76; }
  100% { filter: blur(0);    opacity: 1; }
}
/* HTML に1つ置く（画面には出さない）。最後の行（0 0 0 255 -140）がしきい値 */
/* <svg width="0" height="0"><filter id="goo" color-interpolation-filters="sRGB">
     <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 255 -140"/>
   </filter></svg> */`,
      waapi: `const HOLD = 1200, MORPH = 1000, STEPS = 12, MAX = 40, K = 2;   // K: ぼかしの強さの係数（文字が大きいほど大きくできる）
const blur = f => Math.min(K / f - K, MAX);   // f: 溶け合いの進み具合（0〜1）
const fade = f => Math.pow(f, .4);
const at = f => (HOLD + f * MORPH) / (HOLD + MORPH);

// out: 消える文字、incoming: 現れる文字（上の CSS の .morph に重ねてある）
const outFrames = [{ opacity: 1, filter: 'blur(0px)', offset: 0 },
                   { opacity: 1, filter: 'blur(0px)', offset: at(0) }];
const inFrames  = [{ opacity: 0, filter: \`blur(\${MAX}px)\`, offset: 0 },
                   { opacity: 0, filter: \`blur(\${MAX}px)\`, offset: at(0) }];
for (let k = 1; k <= STEPS; k++) {
  const f = k / STEPS;
  outFrames.push({ opacity: k === STEPS ? 0 : fade(1 - f), filter: \`blur(\${k === STEPS ? MAX : blur(1 - f)}px)\`, offset: at(f) });
  inFrames.push({ opacity: fade(f), filter: \`blur(\${k === STEPS ? 0 : blur(f)}px)\`, offset: at(f) });
}
const opt = { duration: HOLD + MORPH, easing: 'linear', fill: 'both' };
out.animate(outFrames, opt);
incoming.animate(inFrames, opt);
// 終わったら文字を入れ替え（out に今の言葉、incoming に次の言葉）、次の言葉でもう一度

// 長い言葉でも枠に収める: 一番長い言葉の幅を測り、はみ出すなら文字を縮める（全部の言葉で同じ大きさ）
text.style.fontSize = '52px';
const widest = Math.max(...words.map(w => { out.textContent = w; return out.offsetWidth; }));
const room = stage.offsetWidth - 32;
if (widest > room) text.style.fontSize = Math.floor(52 * room / widest) + 'px';`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* ぼかさず、しきい値フィルターも外して、不透明度だけで入れ替える */
  .morph { filter: none; }
  .out { animation: fade-out 1s linear forwards; }
  .in  { animation: fade-in  1s linear forwards; }
}
@keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes fade-in  { from { opacity: 0; } to { opacity: 1; } }`
    }
  },

  {
    id: 'countdown-flip',
    cat: 'text',
    name: '開演カウントダウン',
    feel: '期待・高まり',
    use: '開演・開始・販売開始までの残り時間',
    ms: 400,
    msLabel: '1桁の切り替え',
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    desc: '残り時間が1秒ごとに減り、変わった桁だけが、古い数字は上へ抜け、新しい数字が下から入れ替わる。変わらない桁は止まったままなので、どこが進んだかが目で追える。デモは 01:02 から 00:58 まで（1:00 → 0:59 で3桁が同時に変わる）。時間は1桁が入れ替わる長さ。',
    setup(stage, ctx) {
      const STEP = 1000, SWAP = 400, START = 62, END = 58;
      const EASE = 'cubic-bezier(.2, 0, 0, 1)';
      const fmt = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      const spoken = sec => `${Math.floor(sec / 60)}分${sec % 60}秒`;
      stage.innerHTML = `
        <div class="tx-board tx-count-board">
          <div class="tx-count">
            <span class="tx-count-label">開演まで</span>
            <span class="tx-count-time" role="timer"></span>
          </div>
          <div class="tx-row"></div><div class="tx-row"></div><div class="tx-row"></div>
        </div>`;
      const board = q(stage, '.tx-count-board');
      const time = q(stage, '.tx-count-time');
      let token = 0;

      const reset = () => {
        time.setAttribute('aria-label', `開演まで ${spoken(START)}`);
        time.innerHTML = [...fmt(START)].map(ch => ch === ':'
          ? '<span class="tx-colon" aria-hidden="true">:</span>'
          : `<span class="tx-digit" aria-hidden="true"><span>${ch}</span></span>`).join('');
      };

      /* 1桁を入れ替える。古い数字は上へ抜け、新しい数字が下から入る */
      const swap = (slot, ch) => {
        const old = /** @type {HTMLElement} */ (slot.lastElementChild);
        const next = document.createElement('span');
        next.textContent = ch;
        slot.append(next);
        const reduced = ctx.reduced();
        /** @type {KeyframeAnimationOptions} */
        const opt = { duration: ctx.dur(reduced ? 200 : SWAP), easing: reduced ? 'linear' : EASE };
        const out = old.animate(reduced
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-100%)', opacity: 0 }], { ...opt, fill: 'forwards' });
        const inn = next.animate(reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { ...opt, fill: 'backwards' });
        return Promise.all([settle(out), settle(inn)]).then(() => old.remove());
      };

      const run = async () => {
        const my = ++token;
        time.getAnimations({ subtree: true }).forEach(a => a.cancel());
        reset();
        /** @type {Promise<unknown>} */
        let swaps = Promise.resolve();
        for (let sec = START - 1; sec >= END; sec--) {
          await ctx.wait(STEP);
          if (my !== token || !board.isConnected) return;
          const slots = [...time.querySelectorAll('.tx-digit')];
          const chars = [...fmt(sec)].filter(ch => ch !== ':');
          time.setAttribute('aria-label', `開演まで ${spoken(sec)}`);
          // 変わった桁だけを動かす
          swaps = Promise.all(slots.map((slot, i) => slot.lastElementChild?.textContent === chars[i] ? null : swap(slot, chars[i])));
        }
        await swaps;
      };
      reset();
      return { run };
    },
    code: {
      css: `/* 1桁ずつ枠に入れ、枠の外は隠す。古い数字と新しい数字は同じマスに重ねる */
.digit { display: inline-grid; overflow: hidden; font-variant-numeric: tabular-nums; }
.digit > span { grid-area: 1 / 1; }
.digit .is-out { animation: digit-out .4s cubic-bezier(.2, 0, 0, 1) forwards; }
.digit .is-in  { animation: digit-in  .4s cubic-bezier(.2, 0, 0, 1) backwards; }
@keyframes digit-out {
  from { transform: translateY(0);     opacity: 1; }
  to   { transform: translateY(-100%); opacity: 0; }
}
@keyframes digit-in {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
/* 1秒ごとに、値が変わった桁だけ新しい span（is-in）を足し、古い span に is-out を付ける。
   読み上げは role="timer" の要素に aria-label で残り時間を持たせ、桁の span は aria-hidden にする */`,
      waapi: `// 変わった桁（slot）だけ呼ぶ
async function swap(slot, ch) {
  const old = slot.lastElementChild;
  const next = document.createElement('span');
  next.textContent = ch;
  slot.append(next);
  const opt = { duration: 400, easing: 'cubic-bezier(.2, 0, 0, 1)' };
  await Promise.all([
    old.animate([{ transform: 'translateY(0)', opacity: 1 },
                 { transform: 'translateY(-100%)', opacity: 0 }], { ...opt, fill: 'forwards' }).finished,
    next.animate([{ transform: 'translateY(100%)', opacity: 0 },
                  { transform: 'translateY(0)', opacity: 1 }], { ...opt, fill: 'backwards' }).finished,
  ]);
  old.remove();
}`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 上下には動かさず、その場で不透明度だけで入れ替える */
  .digit .is-out { animation: digit-fade-out .2s linear forwards; }
  .digit .is-in  { animation: digit-fade-in  .2s linear backwards; }
}
@keyframes digit-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes digit-fade-in  { from { opacity: 0; } to { opacity: 1; } }`
    }
  },

  {
    id: 'viewer-count',
    cat: 'text',
    name: '視聴者数の増減',
    feel: '熱気・数値の動き',
    use: '同時視聴者数・参加人数・応援数など、増減する数値',
    ms: 600,
    msLabel: '数値が追いつく',
    easing: 'cubic-bezier(.2, 0, 0, 1)',
    desc: '数値が新しい値まで数え上がる（下がる）。増えたときは数字が下から4px、減ったときは上から4px寄って止まり、隣に増減の差（+455 など）が浮かんで消える。数値は1.2秒ごとに更新される。時間は数値が新しい値に追いつく長さ。',
    setup(stage, ctx) {
      const TWEEN = 600, STEP = 1200, NUDGE = 4, DELTA = 900;
      const EASE = 'cubic-bezier(.2, 0, 0, 1)';
      const START = 12480;
      const VALUES = [12935, 13410, 13102, 13560];
      const fmt = n => n.toLocaleString('ja-JP');
      stage.innerHTML = `
        <div class="tx-board tx-viewers-board">
          <div class="tx-viewers">
            <span class="tx-viewers-label">視聴中</span>
            <span class="tx-viewers-num" role="status"></span>
            <span class="tx-viewers-unit">人</span>
            <span class="tx-viewers-delta" aria-hidden="true"></span>
          </div>
          <div class="tx-row"></div><div class="tx-row"></div><div class="tx-row"></div>
        </div>`;
      const board = q(stage, '.tx-viewers-board');
      const num = q(stage, '.tx-viewers-num');
      const delta = q(stage, '.tx-viewers-delta');
      num.textContent = fmt(START);
      let token = 0;

      // 数え上げのイージング（ease-out の3次）
      const easeOut = t => 1 - Math.pow(1 - t, 3);
      /* from から to まで、表示を数え上げる。再生し直されたら途中でやめる */
      const tween = (from, to, my) => new Promise(resolve => {
        const total = ctx.dur(TWEEN);
        const t0 = performance.now();
        const tick = now => {
          if (my !== token || !board.isConnected) return resolve(undefined);
          const t = Math.min((now - t0) / total, 1);
          num.textContent = fmt(Math.round(from + (to - from) * easeOut(t)));
          if (t < 1) requestAnimationFrame(tick); else resolve(undefined);
        };
        requestAnimationFrame(tick);
      });

      const update = (from, to, my) => {
        const up = to > from;
        const reduced = ctx.reduced();
        delta.textContent = `${up ? '+' : '−'}${fmt(Math.abs(to - from))}`;
        delta.classList.toggle('is-down', !up);
        const shown = [settle(delta.animate(reduced
          ? [{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .7 }, { opacity: 0 }]
          : [{ opacity: 0, transform: `translateY(${up ? NUDGE : -NUDGE}px)` }, { opacity: 1, transform: 'translateY(0)', offset: .2 },
             { opacity: 1, transform: 'translateY(0)', offset: .7 }, { opacity: 0, transform: `translateY(${up ? -NUDGE * 2 : NUDGE * 2}px)` }],
          { duration: ctx.dur(DELTA), easing: 'linear', fill: 'both' }))];
        if (reduced) {
          // 動きを減らす: 数え上げず、すぐ新しい値にして、不透明度だけで変化を知らせる
          num.textContent = fmt(to);
          shown.push(settle(num.animate([{ opacity: .4 }, { opacity: 1 }], { duration: ctx.dur(200), easing: 'linear' })));
        } else {
          shown.push(settle(num.animate(
            [{ transform: `translateY(${up ? NUDGE : -NUDGE}px)` }, { transform: 'translateY(0)' }],
            { duration: ctx.dur(TWEEN), easing: EASE })));
          shown.push(tween(from, to, my));
        }
        return Promise.all(shown);
      };

      const run = async () => {
        const my = ++token;
        board.getAnimations({ subtree: true }).forEach(a => a.cancel());
        num.textContent = fmt(START);
        let value = START;
        for (const next of VALUES) {
          const step = Promise.all([update(value, next, my), ctx.wait(STEP)]);
          value = next;
          await step;
          if (my !== token || !board.isConnected) return;
        }
      };
      return { run };
    },
    code: {
      css: `/* 数値の書き換え（数え上げ）は JS で行う。CSS は寄って止まる動きと、差の表示だけ */
.count { display: inline-block; font-variant-numeric: tabular-nums; }   /* 桁の幅をそろえ、数え上げ中に横に揺れない */
.count.is-up   { animation: count-up   .6s cubic-bezier(.2, 0, 0, 1); }
.count.is-down { animation: count-down .6s cubic-bezier(.2, 0, 0, 1); }
@keyframes count-up   { from { transform: translateY(4px); }  to { transform: translateY(0); } }
@keyframes count-down { from { transform: translateY(-4px); } to { transform: translateY(0); } }
.delta { opacity: 0; animation: delta .9s linear both; }   /* 差（+455 など）。更新のたびに付け直す */
@keyframes delta {
  0%      { opacity: 0; transform: translateY(4px); }
  20%, 70% { opacity: 1; transform: translateY(0); }
  100%    { opacity: 0; transform: translateY(-8px); }
}`,
      waapi: `function countTo(el, from, to, duration = 600) {
  const ease = t => 1 - Math.pow(1 - t, 3);   // ease-out
  const up = to > from;
  el.animate(
    [{ transform: \`translateY(\${up ? 4 : -4}px)\` }, { transform: 'translateY(0)' }],
    { duration, easing: 'cubic-bezier(.2, 0, 0, 1)' }
  );
  return new Promise(resolve => {
    const t0 = performance.now();
    const tick = now => {
      const t = Math.min((now - t0) / duration, 1);
      el.textContent = Math.round(from + (to - from) * ease(t)).toLocaleString('ja-JP');
      t < 1 ? requestAnimationFrame(tick) : resolve();
    };
    requestAnimationFrame(tick);
  });
}`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 数え上げず、すぐ新しい値にする（JS 側で分岐）。寄る動きはやめ、不透明度だけで知らせる */
  .count.is-up, .count.is-down { animation: count-flash .2s linear; }
  .delta { animation-name: delta-fade; }
}
@keyframes count-flash { from { opacity: .4; } to { opacity: 1; } }
@keyframes delta-fade {
  0%, 100% { opacity: 0; }
  20%, 70% { opacity: 1; }
}`
    }
  },
];
