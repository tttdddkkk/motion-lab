/* ============================================================
   型定義（JSDoc）。実行時には何も export しない。
   他のファイルからは次のように参照する:
     /** @type {import('./types.js').Motion[]} *\/
   型の検査は `npm run typecheck`（tsc --noEmit）で行う（ADR 0018）。
   ============================================================ */

/**
 * モーションに渡す実行環境。makeCtx（motions.js）で作る。
 * @typedef {object} Ctx
 * @property {(ms: number) => number} dur  再生速度を反映した時間
 * @property {(ms: number) => Promise<void>} wait  dur(ms) だけ待つ
 * @property {() => boolean} reduced  「動きを減らす」がONか
 */

/**
 * setup が返す、再生の操作口。
 * @typedef {object} MotionInstance
 * @property {(x?: number, y?: number) => Promise<unknown>} run  再生する。x, y はタップ位置（リップルなど）
 */

/** @typedef {'button' | 'transition' | 'comment' | 'notice' | 'expand' | 'text'} MotionCategory */

/**
 * ビューアに表示する、コピー用のコード（表示用の文字列。setup の実装とは手で合わせる）。
 * @typedef {object} MotionCode
 * @property {string} css
 * @property {string} waapi
 * @property {string} reduced  「動きを減らす」版。transform と clip-path は使わない
 */

/**
 * モーション定義（MOTIONS の1要素）。
 * @typedef {object} Motion
 * @property {string} id
 * @property {MotionCategory} cat
 * @property {string} name
 * @property {string} feel  印象ワード
 * @property {string} use  使いどころの一言
 * @property {number} ms  代表となる時間（意味はモーションごとに違う。desc を参照）
 * @property {string} easing
 * @property {string} desc
 * @property {(stage: HTMLElement, ctx: Ctx) => MotionInstance} setup
 * @property {MotionCode} code
 */

/**
 * 差分比較バリアントのパラメータ。使うキーは stage と mode ごとに違うので、duration 以外は省略可。
 * @typedef {object} CompareParams
 * @property {number} duration  ms
 * @property {string} [easing]
 * @property {number} [scale]  ボタンの縮み量
 * @property {number} [hold]  ms。押したまま／見せておく時間
 * @property {number} [gap]  ms。前の画面が消えてから次が入るまでの待ち
 * @property {number} [back]  ms。戻りの時間
 * @property {string} [backEasing]
 * @property {number} [stagger]  ms。要素ごとの遅れ
 * @property {number[]} [delays]  ms。要素ごとの遅れ（間隔が一定でないとき）
 * @property {number} [delay]  ms
 * @property {number} [out]  ms。出る時間
 * @property {number} [x]  %。広がりの中心
 * @property {number} [y]  %
 * @property {'bottom' | 'top' | 'left' | 'right'} [from]  トーストが入ってくる方向
 */

/**
 * @typedef {object} CompareVariant
 * @property {string} id
 * @property {string} name
 * @property {string[]} tags  印象ワード
 * @property {string} diff  基準から何が違うか
 * @property {string} use  使いどころの一言
 * @property {string} mode  stage ごとの BUILDERS が解釈する動きの種類
 * @property {CompareParams} params
 * @property {boolean} [base]  基準
 * @property {string} [subtle]  微差の説明
 */

/** @typedef {'button' | 'screens' | 'box' | 'list' | 'toast' | 'origin'} CompareStage */

/**
 * @typedef {object} CompareGroup
 * @property {string} id
 * @property {string} section  SECTIONS の id
 * @property {string} title
 * @property {CompareStage} stage
 * @property {string} axis  何の軸を変えているか
 * @property {CompareVariant[]} variants
 * @property {string} [needs]  必要なブラウザ機能（'clip-path'）
 */

/**
 * 1つの要素に対する1回の animate() 呼び出し分。
 * @typedef {object} CompareTrack
 * @property {string} target  STAGE_HTML の data-t（'items' は data-i を持つ要素すべて）
 * @property {Keyframe[]} keyframes
 * @property {KeyframeAnimationOptions} options
 * @property {boolean} [main]  調整 UI の duration / easing が効く
 * @property {number} [stagger]
 * @property {number[]} [delays]
 */

export {};
