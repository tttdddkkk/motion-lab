/* シークバー付きの再生。テキストの字幕・同期ハイライトと、流れる文字で共通 */
import { q } from './dom.js';

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
export function withSeek(root, ctx, total, makeAnims) {
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

export const SEEK_BAR = `
  <div class="flow-bar">
    <button class="flow-play" type="button" aria-label="一時停止">❚❚</button>
    <input class="flow-range" type="range" min="0" max="1000" value="0" aria-label="再生位置">
  </div>`;
