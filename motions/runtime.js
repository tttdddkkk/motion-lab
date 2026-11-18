/* モーションの実行環境の共通部分（ctx の作り方と、アニメーションの終了待ち） */

/**
 * モーションに渡す ctx を作る。rate は再生速度を返す関数（ビューアで途中から変わるため、値ではなく関数）。
 * @param {{ rate?: () => number, reduced?: () => boolean }} [options]
 * @returns {import('./types.js').Ctx}
 */
export function makeCtx({ rate = () => 1, reduced = () => false } = {}) {
  const dur = ms => ms / rate();
  return { dur, reduced, wait: ms => new Promise(resolve => setTimeout(resolve, dur(ms))) };
}

/* アニメーションの終了を待つ。cancel されても例外にしない */
export const settle = animation => animation.finished.catch(() => {});

/**
 * 要素の画面上の幅 ÷ 本来の幅。ビューアはスマホ幅でプレビューを縮小して表示するため、
 * getBoundingClientRect() や clientX で測った座標は、この倍率で割らないと、デモ内の座標（px）と合わない。
 * 縮小していなければ 1。測る対象は、自分では変形しない要素（ステージ）を渡す
 * @param {HTMLElement} el
 */
export const scaleOf = el => (el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1);
