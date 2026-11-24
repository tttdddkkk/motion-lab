/* モーション定義: 通知。チャットはコメントに含める（docs/adr/0014）。motions.js が集めて MOTIONS にする。追加したら stories/motions.stories.js にも1行足す */
import { q, qa } from '../dom.js';
import { settle } from '../runtime.js';
import { LEAVE_EASE, TOAST_TIMING } from '../tokens.js';

/* 通知のデモの舞台: アプリ画面に見立てたダミーの行を並べる。head には画面上部の要素の HTML を渡す。.ntf を返す */
function mountNoticeStage(stage, head = '') {
  stage.innerHTML = `<div class="ntf">${head}${'<div class="ntf-row"></div>'.repeat(4)}</div>`;
  return q(stage, '.ntf');
}

/**
 * 通知の出入り: 入る → 見せる → 出る → 取り除く。
 * 「動きを減らす」ときは、位置を動かさず、不透明度だけで出入りする（200ms）。
 * @param {object} p
 * @param {import('../types.js').Ctx} p.ctx
 * @param {HTMLElement} p.el
 * @param {string} p.off  画面の外の位置（transform）。ここから入り、ここへ出ていく
 * @param {number} p.inMs  入る時間
 * @param {string} p.inEase  入るときのイージング
 * @param {number} p.outMs  出る時間
 * @param {() => Promise<unknown>} p.hold  入りきったあとに呼ぶ。これが解決するまで見せておく
 * @param {() => boolean} p.alive  見せたあとに false なら、出さずに止める（再生し直されたとき）
 */
async function showNotice({ ctx, el, off, inMs, inEase, outMs, hold, alive }) {
  const reduced = ctx.reduced();
  const enter = reduced
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [{ transform: off }, { transform: 'translateY(0)' }];
  await settle(el.animate(enter, { duration: ctx.dur(reduced ? 200 : inMs), easing: reduced ? 'linear' : inEase, fill: 'backwards' }));
  await hold();
  if (!alive()) return;
  const leave = reduced
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ transform: 'translateY(0)' }, { transform: off }];
  await settle(el.animate(leave, { duration: ctx.dur(reduced ? 200 : outMs), easing: reduced ? 'linear' : LEAVE_EASE, fill: 'forwards' }));
  el.remove();
}

/** @type {import('../types.js').Motion[]} */
export const NOTICE_MOTIONS = [
  {
    id: 'toast',
    cat: 'notice',
    name: 'トースト',
    feel: 'すっと・控えめ',
    use: '保存・送信の完了通知（タップで閉じられる）',
    ms: TOAST_TIMING.in,
    msLabel: '入る',
    easing: TOAST_TIMING.inEase,
    desc: '画面の下中央に、ピル型の通知が下からスライドインする。2.5秒見せてから下へ戻って消える。押せばすぐ閉じる。時間は入る長さで、出る長さは250ms。方向・出し方の違いは「差分比較」の「D. 通知」で比べられる。',
    setup(stage, ctx) {
      const { in: IN, out: OUT, hold: HOLD, inEase } = TOAST_TIMING;
      const OFF = 'translateY(calc(100% + 20px))';   // 下端の外
      const root = mountNoticeStage(stage);
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
        await showNotice({
          ctx, el: toast, off: OFF, inMs: IN, inEase, outMs: OUT,
          // 押されるか、一定時間たつまで見せる
          hold: () => Promise.race([wait(HOLD), new Promise(r => toast.addEventListener('click', r, { once: true }))]),
          alive: () => my === token && root.isConnected,
        });
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
    msLabel: '降りる',
    easing: 'cubic-bezier(.22, 1.2, .36, 1)',
    desc: '画面の上端から通知が降りてきて、わずかに弾んで止まる。数秒見せてから上へ戻って消える。時間は降りる長さで、戻る長さは250ms、見せる時間は2.5秒。',
    setup(stage, ctx) {
      const IN = 400, OUT = 250, HOLD = 2500;
      const root = mountNoticeStage(stage);
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
        await showNotice({
          ctx, el: banner, off: 'translateY(calc(-100% - 10px))', inMs: IN, inEase: 'cubic-bezier(.22, 1.2, .36, 1)', outMs: OUT,
          hold: () => wait(HOLD),
          alive: () => my === token && root.isConnected,
        });
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
    msLabel: '1回の更新で弾む',
    easing: 'cubic-bezier(.34, 1.56, .64, 1)',
    desc: 'ベルのアイコンの件数バッジが、数字が変わるたびに小さな状態から弾んで現れる。件数は1秒ごとに1→2→3→4と増え、最後に少し見せて戻る。',
    setup(stage, ctx) {
      const POP = 400, STEP = 1000, HOLD = 800;
      const root = mountNoticeStage(stage, `
          <div class="ntf-head">
            <strong>受信箱</strong>
            <span class="ntf-bell" aria-label="通知">
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12 3a6 6 0 0 0-6 6v3.5L4 16v1h16v-1l-2-3.5V9a6 6 0 0 0-6-6zm0 18a2.5 2.5 0 0 0 2.4-2H9.6A2.5 2.5 0 0 0 12 21z"/></svg>
              <span class="ntf-badge" role="status">1</span>
            </span>
          </div>`);
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
    id: 'live-dot',
    cat: 'notice',
    name: 'LIVE 表示の脈動',
    feel: '緊張感・現在進行',
    use: '配信中・開催中であることを示す印（状態が続くあいだ脈打つ）',
    ms: 1600,
    msLabel: '1周期',
    easing: 'ease-in-out',
    desc: '「LIVE」の札の赤い点が、ゆっくり明滅しながら、外側へ輪が広がって消える。状態が続くあいだ繰り返す（デモでは3周で止まる）。1回だけ注目を集める「リング波紋」と違い、「いまも続いている」ことを示す。時間は1周期の長さ。',
    setup(stage, ctx) {
      const PERIOD = 1600, CYCLES = 3;
      const root = mountNoticeStage(stage, `
          <div class="ntf-head">
            <strong>ステージ配信</strong>
            <span class="ntf-live"><span class="ntf-live-mark" aria-hidden="true"><span class="ntf-live-halo"></span><span class="ntf-live-dot"></span></span>LIVE</span>
          </div>`);
      const dot = q(root, '.ntf-live-dot');
      const halo = q(root, '.ntf-live-halo');
      let prev = [];

      const run = async () => {
        prev.forEach(a => a.cancel());
        const reduced = ctx.reduced();
        /** @type {KeyframeAnimationOptions} */
        const opt = { duration: ctx.dur(PERIOD), easing: 'ease-in-out', iterations: CYCLES };
        // 動きを減らす: 輪は広げず、点の明滅だけ（幅も浅くする）
        prev = [dot.animate([{ opacity: 1 }, { opacity: reduced ? .5 : .35 }, { opacity: 1 }], opt)];
        if (!reduced) {
          prev.push(halo.animate(
            [{ transform: 'scale(1)', opacity: .6 }, { transform: 'scale(2.4)', opacity: 0 }],
            { ...opt, easing: 'cubic-bezier(.2, 0, 0, 1)' }));
        }
        await Promise.all(prev.map(settle));
      };
      return { run };
    },
    code: {
      css: `.live-mark { position: relative; width: 8px; height: 8px; }
.live-dot, .live-halo { position: absolute; inset: 0; border-radius: 50%; background: #ff4d4f; }
.live-dot  { animation: live-blink 1.6s ease-in-out infinite; }
.live-halo { animation: live-halo 1.6s cubic-bezier(.2, 0, 0, 1) infinite; }
@keyframes live-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: .35; }
}
@keyframes live-halo {
  from { transform: scale(1);   opacity: .6; }
  to   { transform: scale(2.4); opacity: 0; }
}`,
      waapi: `const opt = { duration: 1600, iterations: Infinity };
dot.animate(
  [{ opacity: 1 }, { opacity: .35 }, { opacity: 1 }],
  { ...opt, easing: 'ease-in-out' }
);
halo.animate(
  [{ transform: 'scale(1)', opacity: .6 }, { transform: 'scale(2.4)', opacity: 0 }],
  { ...opt, easing: 'cubic-bezier(.2, 0, 0, 1)' }
);
// 配信が終わったら止める: dot.getAnimations().forEach(a => a.cancel())`,
      reduced: `@media (prefers-reduced-motion: reduce) {
  /* 輪は広げず、点の明滅だけを浅く残す */
  .live-halo { animation: none; opacity: 0; }
  .live-dot  { animation: live-blink-soft 1.6s ease-in-out infinite; }
}
@keyframes live-blink-soft {
  0%, 100% { opacity: 1; }
  50%      { opacity: .5; }
}`
    }
  },
];
