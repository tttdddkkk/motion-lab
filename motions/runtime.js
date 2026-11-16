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
