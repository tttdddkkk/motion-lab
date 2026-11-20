/* トラックの再生と、「動きを減らす」設定の扱い。差分比較（compare-ui.js）とカスタマイズ（custom-ui.js）で共通 */
import { q } from './dom.js';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 「動きを減らす」設定が有効なとき、再生を止めてこの注意書きを出す（ADR 0012）。bindReducedGate が data 属性で結びつける */
export const REDUCED_NOTICE_HTML = `
  <div class="cmp-notice" data-notice hidden role="status">
    この端末は「動きを減らす」設定（prefers-reduced-motion）が有効なため、再生を止めています。
    <label><input type="checkbox" data-force> このページだけ再生する</label>
  </div>`;

/**
 * 「動きを減らす」設定の扱い。root の中の [data-notice] と [data-force] に結びつける。
 * @param {HTMLElement} root
 */
export function bindReducedGate(root) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const notice = q(root, '[data-notice]');
  let forcePlay = false;
  q(root, '[data-force]').onchange = e => { forcePlay = /** @type {HTMLInputElement} */ (e.target).checked; };
  mq.addEventListener?.('change', () => { notice.hidden = !mq.matches; });
  notice.hidden = !mq.matches;
  return {
    /** 再生を止めるべきか */
    suppressed: () => mq.matches && !forcePlay,
    /** 止めていることを知らせる（再生ボタンを押されたときに呼ぶ） */
    flash() { notice.hidden = false; notice.scrollIntoView({ block: 'nearest' }); },
    /** スクロールの動きを減らすか */
    reduced: () => mq.matches
  };
}

/** ステージ内のアニメーションをすべて止める */
export function resetStage(stage) {
  [stage, ...stage.querySelectorAll('*')].forEach(el => el.getAnimations().forEach(a => a.cancel()));
}

/**
 * トラックをステージ上で再生する。target は data-t の値（'items' は data-i を持つ要素すべて）。
 * @param {HTMLElement} stage
 * @param {import('./types.js').CompareTrack[]} tracks
 */
export function playTracks(stage, tracks) {
  resetStage(stage);
  stage.querySelectorAll('.is-idle').forEach(el => el.classList.remove('is-idle'));
  const done = [];
  for (const t of tracks) {
    const els = t.target === 'items'
      ? [...stage.querySelectorAll('[data-i]')]
      : [...stage.querySelectorAll(`[data-t="${t.target}"]`)];
    els.forEach((el, i) => {
      const extra = t.delays ? (t.delays[i] ?? 0) : (t.stagger || 0) * i;
      const a = el.animate(t.keyframes, { ...t.options, delay: (t.options.delay || 0) + extra });
      done.push(a.finished.catch(() => {}));
    });
  }
  return Promise.all(done);
}
