/* 複数のファイルで同じ値を使うタイミングの定数。
   通知モーション（categories/notice.js）と差分比較（compare.js）が、同じ値を別々に書いて
   ずれないように、ここに1つだけ置く。DOM に依存しない */

/* 通知が出ていくときの加速。入るときより速く、すっと消える（トースト・バナー・差分比較の通知で共通） */
export const LEAVE_EASE = 'cubic-bezier(.4, 0, 1, 1)';

/* トーストのタイミング（ms）。in: 入る時間、hold: 見せておく時間、out: 出る時間、inEase: 入るときのイージング */
export const TOAST_TIMING = { in: 300, hold: 2500, out: 250, inEase: 'cubic-bezier(.2, 0, 0, 1)' };
