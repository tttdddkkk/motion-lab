/* モーション定義: 展開。motions.js が集めて MOTIONS にする。追加したら stories/motions.stories.js にも1行足す */
import { q, qa } from '../dom.js';
import { scaleOf } from '../runtime.js';

/* 持ち上げ・降りる・フェード・中身の出現に使う、出だしが速く、ゆっくり止まるイージング */
const LIFT = 'cubic-bezier(.2, 0, 0, 1)';

/* アニメーションを ctx の再生速度に合わせて作る。最終状態は class に持たせるため fill: 'both' */
function makeAnim(ctx) {
  return (el, frames, duration, delay, easing) =>
    el.animate(frames, { duration: ctx.dur(duration), delay: ctx.dur(delay), easing, fill: 'both' });
}

/* すべてのアニメーションの終了を待ち、cancel して後片付けする。reset で中断されたら false */
async function playToEnd(anims) {
  try { await Promise.all(anims.map(x => x.finished)); } catch { return false; }
  anims.forEach(x => x.cancel());
  return true;
}

/* 開くとき、オーバーレイの背景と閉じるボタンが現れる（250ms）。動きを減らす版は、オーバーレイ全体を不透明度だけで出す */
function openOverlayFades(anim, { overlay, bg, closeBtn }, reduced) {
  if (reduced) return [anim(overlay, [{ opacity: 0 }, { opacity: 1 }], 250, 0, 'linear')];
  return [
    anim(bg, [{ opacity: 0 }, { opacity: 1 }], 250, 0, LIFT),
    anim(closeBtn, [{ opacity: 0 }, { opacity: 1 }], 250, 0, LIFT),
  ];
}

/**
 * 開閉オーバーレイを持つモーション（本棚・カード）の共通部分。
 * ここが持つもの: 状態（開いている項目・開閉中か・自動再生の世代）、手で操作したときの自動再生の停止、
 * 閉じるボタン・背景・Esc・Tab の扱い、デモの再生手順（項目を開く → 見せる → 閉じる）。
 * 何がどう動くかは、呼び出し側が open / close / reset で渡す。
 * @param {object} p
 * @param {import('../types.js').Ctx} p.ctx
 * @param {HTMLElement} p.stage
 * @param {HTMLElement} p.root  DOM から外れたら、デモの自動再生を止める
 * @param {HTMLElement} p.overlay  開いている間だけ is-open を付ける
 * @param {HTMLElement} p.bg  押すと閉じる背景
 * @param {HTMLElement} p.closeBtn
 * @param {HTMLElement[]} p.triggers  開く操作の対象（背表紙・伏せたカード）。i 番目が i 番目の項目を開く
 * @param {(i: number, o: { reduced: boolean, focus: boolean }) => Promise<boolean>} p.open
 *   開くアニメーションを再生する。reset で中断されたら false。focus が true なら、閉じるボタンへフォーカスを移す
 * @param {(i: number, o: { reduced: boolean }) => Promise<boolean>} p.close  閉じるアニメーションを再生する。中断されたら false
 * @param {() => void} p.reset  DOM を初期状態に戻す。アニメーションの cancel と overlay の is-open は、ここでは行わない
 * @returns {import('../types.js').MotionInstance}
 */
function createOverlayFlow({ ctx, stage, root, overlay, bg, closeBtn, triggers, open, close, reset }) {
  const DEMO = { pick: 2, before: 300, show: 1200, after: 300 };   // デモで開く項目と、前後・見せておく時間（ms）
  let current = -1;     // 開いている（または開こうとしている）項目
  let busy = false;     // 開閉のアニメーション中。その間の操作は受け付けない
  let token = 0;        // 自動再生の世代。手で操作したり再生し直したりすると進み、古い再生を止める

  const openItem = async (i, { focus = false } = {}) => {
    if (busy || current >= 0) return;
    busy = true; current = i;
    if (await open(i, { reduced: ctx.reduced(), focus })) busy = false;
  };

  const closeItem = async ({ focus = false } = {}) => {
    if (busy || current < 0) return;
    busy = true;
    const i = current;
    if (!(await close(i, { reduced: ctx.reduced() }))) return;
    current = -1; busy = false;
    if (focus) triggers[i].focus({ preventScroll: true });
  };

  const resetAll = () => {
    stage.getAnimations({ subtree: true }).forEach(x => x.cancel());
    overlay.classList.remove('is-open');
    reset();
    current = -1; busy = false;
  };

  // 手で操作したら、デモの自動再生は止める
  triggers.forEach((el, i) => el.addEventListener('click', () => { token++; openItem(i, { focus: true }); }));
  const userClose = () => { token++; closeItem({ focus: true }); };
  closeBtn.addEventListener('click', userClose);
  bg.addEventListener('click', userClose);
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); userClose(); }
    if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus({ preventScroll: true }); }   // 操作できるのは閉じるボタンだけ
  });

  const run = async () => {
    const my = ++token;
    resetAll();
    const alive = () => my === token && root.isConnected;
    await ctx.wait(DEMO.before);
    if (!alive()) return;
    await openItem(DEMO.pick);
    if (!alive()) return;
    await ctx.wait(DEMO.show);
    if (!alive()) return;
    await closeItem();
    if (alive()) await ctx.wait(DEMO.after);
  };
  return { run };
}

/** @type {import('../types.js').Motion[]} */
export const EXPAND_MOTIONS = [
  {
    id: 'shelf-open',
    cat: 'expand',
    name: '本棚（選ぶと本が開く）',
    feel: '知的・やわらか',
    use: '棚状の一覧から選んで、詳細を全面で見せる（ライブラリ・図鑑・読み物）',
    ms: 1400,
    msLabel: '開き始めから中身が出きるまで',
    easing: 'cubic-bezier(.2, 0, 0, 1) / cubic-bezier(.65, 0, .35, 1)',
    desc: '縦置きの本が横に並ぶ棚から1冊を選ぶと、背表紙の面を向いた本が、縦軸で回りながらオーバーレイの中央に持ち上がって表紙が正面に来て、表紙が開いて中身の要素が順に現れる。閉じるボタン・背景・Esc で、逆の順に（表紙を閉じ、縦軸で回って背表紙の面になりながら）棚の元の位置へ収まる。時間は開く全体の長さ（背表紙から回って持ち上がる500ms → 表紙の回転600ms → 中身の要素が80ms間隔）で、デモ全体は約4秒。',
    setup(stage, ctx) {
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
      const anim = makeAnim(ctx);

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
      // 背表紙に重なる姿勢。本の左辺を軸に、背表紙の面が棚の背表紙と同じ位置・大きさになる移動と拡縮（FLIP）。
      // 測るのは変形がかかっていないとき（アニメーションの開始前）
      const poseOf = i => {
        const sp = spines[i].getBoundingClientRect(), b = book.getBoundingClientRect(), k = scaleOf(stage);
        const x = (sp.right - b.left) / k, y = (sp.top + sp.height / 2 - (b.top + b.height / 2)) / k;
        return `translate(${x}px, ${y}px) scale(${BOOKS[i].h / BOOK_H})`;
      };
      const open = async (i, { reduced, focus }) => {
        shelf.classList.toggle('is-reduced', reduced);
        fill(i);
        overlay.classList.add('is-open');     // 最終状態は class に持たせる
        spines[i].classList.add('is-out');    // 持ち上げた本の跡は空けておく
        levels.forEach(l => { l.inert = true; });
        // 押した背表紙が inert になってフォーカスが失われないよう、先に閉じるボタンへ移す
        if (focus) closeBtn.focus({ preventScroll: true });
        const items = qa(page, '.reveal');
        // 動きを減らす: 開いた状態（表紙なし・中身あり）を、オーバーレイごとフェードで表示する。不透明度だけ
        const fades = openOverlayFades(anim, { overlay, bg, closeBtn }, reduced);
        if (reduced) return playToEnd(fades);
        return playToEnd([
          ...fades,
          // 背表紙の面を向いた姿勢から、縦軸で回りながら持ち上がり、表紙の面が正面に来る
          anim(book, [{ transform: poseOf(i) }, { transform: 'none' }], 500, 0, INOUT),
          anim(front, [{ transform: 'rotateY(90deg)', visibility: 'hidden' }, { transform: 'rotateY(0deg)', visibility: 'visible' }], 500, 0, INOUT),
          anim(face, [{ transform: 'rotateY(0deg)', visibility: 'visible' }, { transform: 'rotateY(-90deg)', visibility: 'hidden' }], 500, 0, INOUT),   // 回り終えたら消す（真横の細い線を残さない）
          anim(cover, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(-100deg)' }], 600, 550, INOUT),
          ...items.map((el, n) => anim(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 300, 750 + n * 80, LIFT)),
        ]);
      };

      const close = async (i, { reduced }) => {
        const items = qa(page, '.reveal');
        const anims = reduced
          ? [anim(overlay, [{ opacity: 1 }, { opacity: 0 }], 250, 0, 'linear')]
          : [
              ...items.map(el => anim(el, [{ opacity: 1 }, { opacity: 0 }], 150, 0, LIFT)),
              anim(cover, [{ transform: 'rotateY(-100deg)' }, { transform: 'rotateY(0deg)' }], 400, 100, INOUT),
              // 縦軸で回りながら棚へ戻り、背表紙の面が棚の背表紙に重なったところで終わる
              anim(book, [{ transform: 'none' }, { transform: poseOf(i) }], 500, 500, INOUT),
              anim(front, [{ transform: 'rotateY(0deg)', visibility: 'visible' }, { transform: 'rotateY(90deg)', visibility: 'hidden' }], 500, 500, INOUT),
              anim(face, [{ transform: 'rotateY(-90deg)', visibility: 'hidden' }, { transform: 'rotateY(0deg)', visibility: 'visible' }], 500, 500, INOUT),
              anim(bg, [{ opacity: 1 }, { opacity: 0 }], 300, 700, LIFT),
              anim(closeBtn, [{ opacity: 1 }, { opacity: 0 }], 300, 700, LIFT),
            ];
        if (!(await playToEnd(anims))) return false;
        overlay.classList.remove('is-open');   // 終わってから外し、アニメーションは cancel 済み
        spines[i].classList.remove('is-out');
        levels.forEach(l => { l.inert = false; });
        return true;
      };

      const reset = () => {
        spines.forEach(sp => sp.classList.remove('is-out'));
        levels.forEach(l => { l.inert = false; });
      };

      return createOverlayFlow({ ctx, stage, root: shelf, overlay, bg, closeBtn, triggers: spines, open, close, reset });
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
    msLabel: '選んでから回転が止まるまで',
    easing: 'cubic-bezier(.2, 0, 0, 1) / cubic-bezier(.3, .1, .2, 1)',
    desc: '裏向きのカードが並ぶ中から1枚を選ぶと、そのカードが右へ8pxほど滑りながらフェードアウトして消える。そのあと、オーバーレイの中央へ、同じカードが上から降りながら縦軸でゆっくり2回転して現れる（降りる1000ms・回転1800ms）。閉じるボタン・背景・Esc で、カードが少し上へ消え、元の位置に伏せたカードが戻る。デモ全体は約4.5秒。',
    setup(stage, ctx) {
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
      const anim = makeAnim(ctx);

      const fill = i => {
        const info = CARDS[i];
        front.style.setProperty('--c', info.color);
        front.innerHTML = `
          <span class="card-no">${info.no}</span>
          <svg class="card-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[info.icon]}</svg>
          <span class="card-name">${info.name}</span>
          <span class="card-note">${info.note}</span>`;
      };
      const open = async (i, { reduced, focus }) => {
        fill(i);
        grid.inert = true;
        // 1. 選んだ伏せカードが、少し右へ滑りながらフェードアウトする（動きを減らす: 不透明度だけ）
        cards[i].classList.add('is-out');   // 消えたあとも非表示のままにする。最終状態は class に持たせる
        const out = reduced
          ? anim(cards[i], [{ opacity: 1 }, { opacity: 0 }], 200, 0, 'linear')
          : anim(cards[i], [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${SLIDE}px)` }], 300, 0, LIFT);
        if (!(await playToEnd([out]))) return false;
        // 2. 消えたあとに、オーバーレイの中央へ出す
        overlay.classList.add('is-open');
        if (focus) closeBtn.focus({ preventScroll: true });
        const fades = openOverlayFades(anim, { overlay, bg, closeBtn }, reduced);
        if (reduced) return playToEnd(fades);
        return playToEnd([
          ...fades,
          // 上から降りる。見え始めは早く、位置はゆっくり落ち着く
          anim(drop, [{ transform: 'translateY(-180px)', opacity: 0 }, { opacity: 1, offset: .3 }, { transform: 'none', opacity: 1 }], 1000, 0, LIFT),
          // 縦軸で2回転（720°）。降りきったあともしばらく回り、ゆっくり止まる
          anim(body, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(720deg)' }], 1800, 0, SPIN),
        ]);
      };

      const close = async (i, { reduced }) => {
        const anims = reduced
          ? [anim(overlay, [{ opacity: 1 }, { opacity: 0 }], 250, 0, 'linear')]
          : [
              anim(drop, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-24px)' }], 300, 0, LIFT),
              anim(closeBtn, [{ opacity: 1 }, { opacity: 0 }], 200, 0, LIFT),
              anim(bg, [{ opacity: 1 }, { opacity: 0 }], 300, 100, LIFT),
            ];
        if (!(await playToEnd(anims))) return false;
        overlay.classList.remove('is-open');   // 終わってから外し、アニメーションは cancel 済み
        // 元の位置に伏せたカードが戻る（右から少し滑りながらフェードイン）
        cards[i].classList.remove('is-out');
        grid.inert = false;
        return playToEnd([reduced
          ? anim(cards[i], [{ opacity: 0 }, { opacity: 1 }], 200, 0, 'linear')
          : anim(cards[i], [{ opacity: 0, transform: `translateX(${SLIDE}px)` }, { opacity: 1, transform: 'none' }], 300, 0, LIFT)]);
      };

      const reset = () => {
        cards.forEach(c => c.classList.remove('is-out'));
        grid.inert = false;
      };

      return createOverlayFlow({ ctx, stage, root: deck, overlay, bg, closeBtn, triggers: cards, open, close, reset });
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
];
