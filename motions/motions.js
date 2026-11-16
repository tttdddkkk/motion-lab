/* ============================================================
   モーション定義の入口（1モーション = 1オブジェクト）。
   定義はカテゴリごとのファイル（categories/）にあり、ここで集めて MOTIONS にする。
   追加したら stories/motions.stories.js にも1行足す（テストで漏れを検出する）。
   新しいカテゴリを作るときは、ここの import と MOTIONS、viewer.js の CATS、types.js の MotionCategory を足す。
   setup(stage, ctx) -> { run(x?, y?) : Promise }
   ctx.dur(ms)    再生速度を反映した時間
   ctx.wait(ms)   dur(ms) だけ待つ Promise
   ctx.reduced()  「動きを減らす」がONか
   ctx は makeCtx（runtime.js）で作る（ビューアとストーリーで共通）。
   ============================================================ */
import { BUTTON_MOTIONS } from './categories/button.js';
import { TRANSITION_MOTIONS } from './categories/transition.js';
import { COMMENT_MOTIONS } from './categories/comment.js';
import { NOTICE_MOTIONS } from './categories/notice.js';
import { EXPAND_MOTIONS } from './categories/expand.js';
import { TEXT_MOTIONS } from './categories/text.js';

export { makeCtx } from './runtime.js';

/** @type {import('./types.js').Motion[]} */
export const MOTIONS = [
  ...BUTTON_MOTIONS,
  ...TRANSITION_MOTIONS,
  ...COMMENT_MOTIONS,
  ...NOTICE_MOTIONS,
  ...EXPAND_MOTIONS,
  ...TEXT_MOTIONS,
];
