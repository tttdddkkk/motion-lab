/* ============================================================
   差分比較（認識合わせ用）のデータ
   - 1バリアント = 1オブジェクト。バリアントの追加はデータの追加だけで済む
   - 表示するパラメータ値・実際の動き・コピーする JSON は、すべて同じ params から作る
   - MOTIONS（モーション定義）とは別物。ストーリーや「動きを減らす」版は持たない
     （代わりに、差分比較ビューは「動きを減らす」設定が有効なとき再生しない。compare-ui.js）
   DOM に依存しない。tests/compare.test.js でデータの整合を検査する。
   ============================================================ */

import { LEAVE_EASE, TOAST_TIMING } from './tokens.js';

export const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';

/* 調整 UI のイージング候補（値はそのまま WAAPI の easing に渡す） */
export const EASING_PRESETS = [
  ['linear', 'linear'],
  ['ease-out', 'ease-out'],
  ['ease-in', 'ease-in'],
  ['ease-in-out', 'ease-in-out'],
  ['バネ（少しオーバーシュート）', SPRING]
];

/* 「どれを指している？」と選ばせるセクションの id（基準を持たない。compare-ui.js が参照する） */
export const PAIR_SECTION = 'C';

export const SECTIONS = [
  { id: 'A', title: 'A. ボタン押下', lead: '基準を1つ固定し、1つの軸だけを変えて並べる。' },
  { id: 'B', title: 'B. 画面遷移', lead: '画面A→画面Bの切り替え。基準を固定し、1つの軸だけを変える。' },
  { id: 'C', title: 'C. 口頭で混同しやすいペア', lead: '同じ言葉で指しがちな動きを並べる。どれを指しているか選んで認識を合わせる。' },
  { id: 'D', title: 'D. 通知', lead: 'トーストの入り方と出方。入る → 見せる → 同じ出し方で出る、を再生する。基準を固定し、1つの軸だけを変える。' }
];

/* トラック = 1つの要素（target）に対する1回の animate() 呼び出し分。
   main: true は「調整 UI の duration / easing が効くトラック」（tests/compare.test.js が参照する） */
const track = (target, keyframes, options = {}, extra = {}) => ({
  target, keyframes, options: { fill: 'both', ...options }, ...extra
});

const FADE_OUT = [{ opacity: 1 }, { opacity: 0 }];
const ENTER = {
  fade: [{ opacity: 0 }, { opacity: 1 }],
  slide: [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
  rise: [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
  scalefade: [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'scale(1)' }],
  slidefade: [{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'translateX(0)' }]
};
const ITEM_IN = [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }];
const TOAST_FADE_KEYFRAMES = [{ opacity: 0 }, { opacity: 1 }];
/* 入ってくる側の端の外から、置き場所（0）まで */
const TOAST_SLIDE = {
  bottom: [{ transform: 'translateY(calc(100% + 16px))' }, { transform: 'translateY(0)' }],
  top: [{ transform: 'translateY(calc(-100% - 16px))' }, { transform: 'translateY(0)' }],
  left: [{ transform: 'translateX(calc(-100% - 16px))' }, { transform: 'translateX(0)' }],
  right: [{ transform: 'translateX(calc(100% + 16px))' }, { transform: 'translateX(0)' }]
};
const MOVE = [{ transform: 'translateX(-60px)' }, { transform: 'translateX(60px)' }];

/* stage ごとのトラック生成。v: バリアント, p: 調整を反映した params */
const BUILDERS = {
  button(v, p) {
    if (v.mode === 'ripple') {
      return [track('ripple',
        [{ transform: 'scale(0)', opacity: .45 }, { transform: 'scale(4)', opacity: 0 }],
        { duration: p.duration, easing: p.easing }, { main: true })];
    }
    const down = Math.round(p.duration * .4);
    const up = p.duration - down;
    const hold = p.hold || 0;
    const rest = {
      shrink: { transform: 'scale(1)' },
      sink: { transform: 'translateY(0)', boxShadow: '0 6px 14px rgba(0,0,0,.35)' },
      color: { filter: 'brightness(1)' }
    }[v.mode];
    const pressed = {
      shrink: { transform: `scale(${p.scale})` },
      sink: { transform: 'translateY(3px)', boxShadow: '0 1px 2px rgba(0,0,0,.4)' },
      color: { filter: 'brightness(.7)' }
    }[v.mode];
    return [
      track('btn', [rest, pressed], { duration: down, easing: 'ease-out', fill: 'forwards' }),
      track('btn', [pressed, rest], { duration: up, delay: down + hold, easing: p.easing, fill: 'forwards' }, { main: true })
    ];
  },

  screens(v, p) {
    const { duration, easing } = p;
    const main = { duration, easing };
    switch (v.mode) {
      case 'fade': case 'slide': case 'rise': case 'scalefade': case 'slidefade':
        return [track('incoming', ENTER[v.mode], main, { main: true })];
      case 'slide-push':
        return [
          track('outgoing', [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }], main),
          track('incoming', ENTER.slide, main, { main: true })
        ];
      case 'slide-back':
        return [
          track('outgoing', [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.9)', opacity: .4 }], main),
          track('incoming', ENTER.slide, main, { main: true })
        ];
      case 'together': case 'sequential': {
        // gap: 前の画面が消えてから次の画面が入るまでの待ち。
        // 0（together）: 前の画面は duration かけて消え、次の画面と同時に入れ替わる。
        // >0（sequential）: 前の画面は gap かけて消え、消え終わってから次の画面が入る
        const gap = p.gap || 0;
        return [
          track('outgoing', FADE_OUT, { duration: gap || duration, easing }),
          track('incoming', ENTER.slide, { ...main, delay: gap }, { main: true })
        ];
      }
      case 'symmetry': {
        const back = [...ENTER.slide].reverse();
        return [
          track('incoming', ENTER.slide, main, { main: true }),
          track('incoming', back, { duration: p.back, delay: duration + p.hold, easing: p.backEasing, fill: 'forwards' })
        ];
      }
      case 'stagger':
        return [
          track('incoming', ENTER.fade, { duration: 150, easing: 'linear' }),
          track('items', ITEM_IN, { ...main, delay: 100 }, { main: true, stagger: p.stagger })
        ];
      default:
        throw new Error(`unknown screens mode: ${v.mode}`);
    }
  },

  box(v, p) {
    const options = { duration: p.duration, easing: p.easing, delay: p.delay || 0 };
    const keyframes = {
      'float-slow': [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }],
      'float-snap': [{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'translateY(0)' }],
      'float-bounce': [
        { opacity: 0, transform: 'translateY(24px)' },
        { opacity: 1, transform: 'translateY(-6px)', offset: .6 },
        { transform: 'translateY(2px)', offset: .8 },
        { transform: 'translateY(0)' }
      ],
      'jelly-over': [
        { transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(.97)' },
        { transform: 'scale(1.02)' }, { transform: 'scale(1)' }
      ],
      'jelly-shake': [
        { transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' },
        { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(-1px)' },
        { transform: 'translateX(0)' }
      ],
      'pop-grow': [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }],
      'pop-settle': [
        { opacity: 0, transform: 'scale(.6)' },
        { opacity: 1, transform: 'scale(1.15)', offset: .6 },
        { transform: 'scale(1)' }
      ],
      'bounce-once': [
        { transform: 'translateY(0)', easing: 'ease-out' },
        { transform: 'translateY(-48px)', easing: 'ease-in' },
        { transform: 'translateY(0)' }
      ],
      'bounce-decay': [
        { transform: 'translateY(0)', easing: 'ease-out' },
        { transform: 'translateY(-48px)', offset: .25, easing: 'ease-in' },
        { transform: 'translateY(0)', offset: .5, easing: 'ease-out' },
        { transform: 'translateY(-20px)', offset: .7, easing: 'ease-in' },
        { transform: 'translateY(0)', offset: .85, easing: 'ease-out' },
        { transform: 'translateY(-8px)', offset: .93, easing: 'ease-in' },
        { transform: 'translateY(0)' }
      ],
      move: MOVE,
      'move-pause': [
        { transform: 'translateX(-60px)', easing: 'ease-in-out' },
        { transform: 'translateX(0)', offset: .3 },
        { transform: 'translateX(0)', offset: .7, easing: 'ease-in-out' },
        { transform: 'translateX(60px)' }
      ],
      'stop-overshoot': [
        { transform: 'translateX(-60px)', easing: 'ease-out' },
        { transform: 'translateX(72px)', offset: .7, easing: 'ease-in-out' },
        { transform: 'translateX(60px)' }
      ],
      'exit-fade': FADE_OUT,
      'exit-shrink': [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.8)' }],
      'exit-back': [{ transform: 'translateX(0)' }, { transform: 'translateX(120%)' }]
    }[v.mode];
    if (!keyframes) throw new Error(`unknown box mode: ${v.mode}`);
    return [track('box', keyframes, options, { main: true })];
  },

  list(v, p) {
    const options = { duration: p.duration, easing: p.easing };
    const extra = v.mode === 'tighten'
      ? { main: true, delays: p.delays }
      : { main: true, stagger: p.stagger };
    return [track('items', ITEM_IN, options, extra)];
  },

  /* トースト: 入る → hold ms 見せる → 同じ出し方で出る。出る時間は out ms（イージングは固定） */
  toast(v, p) {
    if (v.mode === 'none') {
      // アニメーションなし: 時間 0 で切り替える。調整値（時間・イージング）は効かない
      return [
        track('toast', TOAST_FADE_KEYFRAMES, { duration: 0 }, { main: true }),
        track('toast', [...TOAST_FADE_KEYFRAMES].reverse(), { duration: 0, delay: p.hold, fill: 'forwards' })
      ];
    }
    const keyframes = v.mode === 'fade' ? TOAST_FADE_KEYFRAMES : TOAST_SLIDE[p.from];
    if (!keyframes) throw new Error(`unknown toast: ${v.mode} / ${p.from}`);
    return [
      track('toast', keyframes, { duration: p.duration, easing: p.easing }, { main: true }),
      track('toast', [...keyframes].reverse(), { duration: p.out, delay: p.duration + p.hold, easing: LEAVE_EASE, fill: 'forwards' })
    ];
  },

  origin(v, p) {
    const at = `${p.x}% ${p.y}%`;
    return [track('reveal',
      [{ clipPath: `circle(0% at ${at})` }, { clipPath: `circle(150% at ${at})` }],
      { duration: p.duration, easing: p.easing }, { main: true })];
  }
};


const PRESS = { duration: 200, easing: 'ease-out', scale: .95, hold: 0 };
const SCREEN = { duration: 300, easing: 'ease-out' };
const BOX = { duration: 500, easing: 'ease-out', delay: 0 };
/* トーストの基準のパラメータ。時間とイージングは、モーション定義の toast と共有する（tokens.js） */
/** @type {import('./types.js').CompareParams} */
const TOAST = { duration: TOAST_TIMING.in, easing: TOAST_TIMING.inEase, hold: TOAST_TIMING.hold, out: TOAST_TIMING.out, from: 'bottom' };
const { from: _from, ...TOAST_FADE_PARAMS } = TOAST;   // フェードは方向を持たない

/** @type {import('./types.js').CompareGroup[]} */
export const COMPARE_GROUPS = [
  /* ---------- A. ボタン押下 ---------- */
  {
    id: 'a-speed', section: 'A', title: '速度差', stage: 'button',
    axis: '押してから戻るまでの時間だけを変える（200ms が基準）',
    variants: [
      {
        id: 'A-SPEED-1',
        name: '速い 100ms',
        tags: ['キビキビ', '軽い'],
        diff: '基準より短い（100ms）',
        use: '連打されやすい、軽快さを重視したいボタン',
        mode: 'shrink',
        params: { ...PRESS, duration: 100 }
      },
      {
        id: 'A-SPEED-2',
        name: '標準 200ms',
        tags: ['自然'],
        diff: '基準',
        use: '迷ったときの標準。主要ボタン全般',
        mode: 'shrink',
        params: PRESS,
        base: true
      },
      {
        id: 'A-SPEED-3',
        name: '微差 250ms',
        tags: ['自然'],
        diff: '基準より50ms長いだけ（差が小さい）',
        use: '200ms との差が分かるかを確かめる比較用',
        mode: 'shrink',
        params: { ...PRESS, duration: 250 },
        subtle: '200ms との微差'
      },
      {
        id: 'A-SPEED-4',
        name: 'ゆっくり 400ms',
        tags: ['やわらかい', '重厚'],
        diff: '基準より長い（400ms）',
        use: 'ゆっくり丁寧に見せたい、重要な確定操作',
        mode: 'shrink',
        params: { ...PRESS, duration: 400 }
      }
    ]
  },
  {
    id: 'a-ease', section: 'A', title: 'イージング差', stage: 'button',
    axis: '戻るときの加速の付け方だけを変える（ease-out が基準）',
    variants: [
      {
        id: 'A-EASE-1',
        name: 'linear',
        tags: ['機械的', 'チープ'],
        diff: '基準と違い、一定速度で戻る',
        use: '機械的な印象を出したいとき（通常は避ける）',
        mode: 'shrink',
        params: { ...PRESS, easing: 'linear' }
      },
      {
        id: 'A-EASE-2',
        name: 'ease-out',
        tags: ['自然', 'キビキビ'],
        diff: '基準',
        use: '標準。押した直後の反応を見せたいボタン',
        mode: 'shrink',
        params: PRESS,
        base: true
      },
      {
        id: 'A-EASE-3',
        name: 'ease-in-out',
        tags: ['なめらか', 'やわらかい'],
        diff: '基準と違い、出だしも終わりもゆっくり',
        use: '落ち着いた、なめらかな印象にしたいボタン',
        mode: 'shrink',
        params: { ...PRESS, easing: 'ease-in-out' }
      },
      {
        id: 'A-EASE-4',
        name: 'バネ',
        tags: ['弾む', '軽快'],
        diff: '基準と違い、元の大きさを少し超えてから戻る',
        use: '楽しく軽快な印象の主要ボタン',
        mode: 'shrink',
        params: { ...PRESS, easing: SPRING }
      }
    ]
  },
  {
    id: 'a-power', section: 'A', title: '強度差', stage: 'button',
    axis: '縮む量（scale）だけを変える（0.95 が基準）',
    variants: [
      {
        id: 'A-POWER-1',
        name: 'scale 0.98',
        tags: ['控えめ', '高級感'],
        diff: '基準より縮み方が小さい',
        use: '落ち着き・高級感を出したい画面',
        mode: 'shrink',
        params: { ...PRESS, scale: .98 }
      },
      {
        id: 'A-POWER-2',
        name: 'scale 0.95',
        tags: ['標準'],
        diff: '基準',
        use: '迷ったときの標準',
        mode: 'shrink',
        params: PRESS,
        base: true
      },
      {
        id: 'A-POWER-3',
        name: 'scale 0.90',
        tags: ['しっかり', '押した感'],
        diff: '基準より縮み方が大きい',
        use: '押した手応えをはっきり伝えたい大きなボタン',
        mode: 'shrink',
        params: { ...PRESS, scale: .9 }
      }
    ]
  },
  {
    id: 'a-style', section: 'A', title: '表現差', stage: 'button',
    axis: '押下の見せ方（形・位置・色・波紋）だけを変える',
    variants: [
      {
        id: 'A-STYLE-1',
        name: '縮む',
        tags: ['標準', '軽い'],
        diff: '基準',
        use: '標準。ほとんどのボタン',
        mode: 'shrink',
        params: PRESS,
        base: true
      },
      {
        id: 'A-STYLE-2',
        name: '沈む',
        tags: ['重厚', '物理的'],
        diff: '縮まず、下へ沈んで影が減る',
        use: '物理的なスイッチ感を出したい、影のあるデザインのボタン',
        mode: 'sink',
        params: { duration: 200, easing: 'ease-out' }
      },
      {
        id: 'A-STYLE-3',
        name: '色だけ',
        tags: ['控えめ', 'フラット'],
        diff: '動かず、明るさだけ変わる',
        use: '動きを抑えたいフラットな UI、リストの行',
        mode: 'color',
        params: { duration: 200, easing: 'ease-out' }
      },
      {
        id: 'A-STYLE-4',
        name: 'リップル',
        tags: ['マテリアル', '反応が分かる'],
        diff: '縮まず、波紋が広がる',
        use: '押した位置や反応を明確にしたいマテリアル系の UI',
        mode: 'ripple',
        params: { duration: 400, easing: 'ease-out' }
      }
    ]
  },
  {
    id: 'a-release', section: 'A', title: '戻り方差', stage: 'button',
    axis: '離したあとの戻り始めのタイミングだけを変える',
    variants: [
      {
        id: 'A-RELEASE-1',
        name: '離した瞬間に戻る',
        tags: ['キビキビ'],
        diff: '基準',
        use: '標準。軽快に操作させたいボタン',
        mode: 'shrink',
        params: PRESS,
        base: true
      },
      {
        id: 'A-RELEASE-2',
        name: '少し遅れて戻る',
        tags: ['もったり', '重厚'],
        diff: '基準と違い、沈んだまま150ms待ってから戻る',
        use: '押した感を余韻で残したい、重みのあるボタン',
        mode: 'shrink',
        params: { ...PRESS, hold: 150 }
      }
    ]
  },

  /* ---------- B. 画面遷移 ---------- */
  {
    id: 'b-type', section: 'B', title: '種類差', stage: 'screens',
    axis: '新しい画面の入り方の種類だけを変える（横スライドが基準）',
    variants: [
      {
        id: 'B-TYPE-1',
        name: 'フェード',
        tags: ['やわらかい', '控えめ'],
        diff: '基準と違い、透明度だけで入る',
        use: 'タブ切り替えなど、関係の弱い同階層の画面切り替え',
        mode: 'fade',
        params: SCREEN
      },
      {
        id: 'B-TYPE-2',
        name: '横スライド',
        tags: ['標準', 'キビキビ'],
        diff: '基準',
        use: '階層を進む遷移（一覧 → 詳細）',
        mode: 'slide',
        params: SCREEN,
        base: true
      },
      {
        id: 'B-TYPE-3',
        name: '下からせり上がり',
        tags: ['モーダル的', '重厚'],
        diff: '基準と違い、下から上へ入る',
        use: 'モーダルや補助的な画面（シート）',
        mode: 'rise',
        params: SCREEN
      },
      {
        id: 'B-TYPE-4',
        name: 'スケール＋フェード',
        tags: ['高級感', 'やわらかい'],
        diff: '基準と違い、少し拡大しながら現れる',
        use: '強調したい画面の登場、ダイアログ的な切り替え',
        mode: 'scalefade',
        params: SCREEN
      }
    ]
  },
  {
    id: 'b-overlap', section: 'B', title: '重なり方差', stage: 'screens',
    axis: '前の画面と次の画面の時間の重なりだけを変える',
    variants: [
      {
        id: 'B-OVERLAP-1',
        name: '同時に入れ替わる',
        tags: ['キビキビ', '連続的'],
        diff: '基準',
        use: '素早く連続して切り替えたい通常の遷移',
        mode: 'together',
        params: { ...SCREEN, gap: 0 },
        base: true
      },
      {
        id: 'B-OVERLAP-2',
        name: '消えてから出る',
        tags: ['丁寧', 'ゆっくり'],
        diff: '基準と違い、前画面が消える150ms後に次が入る',
        use: '画面の区切りを明確にしたい、丁寧な切り替え',
        mode: 'sequential',
        params: { ...SCREEN, gap: 150 }
      }
    ]
  },
  {
    id: 'b-time', section: 'B', title: '時間差', stage: 'screens',
    axis: '切り替えの時間だけを変える（300ms が基準）',
    variants: [
      {
        id: 'B-TIME-1',
        name: '150ms',
        tags: ['キビキビ', '軽い'],
        diff: '基準より短い',
        use: '頻繁に行き来する、軽い切り替え',
        mode: 'slide',
        params: { ...SCREEN, duration: 150 }
      },
      {
        id: 'B-TIME-2',
        name: '300ms',
        tags: ['標準'],
        diff: '基準',
        use: '迷ったときの標準',
        mode: 'slide',
        params: SCREEN,
        base: true
      },
      {
        id: 'B-TIME-3',
        name: '微差 350ms',
        tags: ['標準'],
        diff: '基準より50ms長いだけ（差が小さい）',
        use: '300ms との差が分かるかを確かめる比較用',
        mode: 'slide',
        params: { ...SCREEN, duration: 350 },
        subtle: '300ms との微差'
      },
      {
        id: 'B-TIME-4',
        name: '500ms',
        tags: ['ゆっくり', '重厚'],
        diff: '基準より長い',
        use: '演出的な画面など、ゆっくり見せたい場面',
        mode: 'slide',
        params: { ...SCREEN, duration: 500 }
      }
    ]
  },
  {
    id: 'b-sym', section: 'B', title: '進む・戻るの対称性', stage: 'screens',
    axis: '進んだあとの「戻り」の動きだけを変える（進む動きは同じ。再生すると進んで戻る）',
    variants: [
      {
        id: 'B-SYM-1',
        name: '同じ動きの逆再生',
        tags: ['一貫性', '自然'],
        diff: '基準',
        use: '進む・戻るを一貫させたい標準的な階層遷移',
        mode: 'symmetry',
        params: { ...SCREEN, back: 300, backEasing: 'ease-in', hold: 500 },
        base: true
      },
      {
        id: 'B-SYM-2',
        name: '戻りだけ速い',
        tags: ['キビキビ', '軽い'],
        diff: '基準と違い、戻りが150msで終わる',
        use: '戻る操作で待たせたくない画面',
        mode: 'symmetry',
        params: { ...SCREEN, back: 150, backEasing: 'ease-in', hold: 500 }
      }
    ]
  },
  {
    id: 'b-stagger', section: 'B', title: 'ずらし差', stage: 'screens',
    axis: '画面内の要素の出方だけを変える',
    variants: [
      {
        id: 'B-STAGGER-1',
        name: '全体が一斉',
        tags: ['シンプル', 'キビキビ'],
        diff: '基準',
        use: 'シンプルに素早く表示したい画面',
        mode: 'stagger',
        params: { ...SCREEN, stagger: 0 },
        base: true
      },
      {
        id: 'B-STAGGER-2',
        name: '要素が順番に出る',
        tags: ['丁寧', '高級感'],
        diff: '基準と違い、要素が70ms間隔で順に出る',
        use: '一覧やカードをリズムよく見せたい初回表示',
        mode: 'stagger',
        params: { ...SCREEN, stagger: 70 }
      }
    ]
  },

  /* ---------- C. 口頭で混同しやすいペア ---------- */
  {
    id: 'c-fade', section: 'C', title: 'フェード', stage: 'screens',
    axis: '「フェード」と言ったとき、どちらを指しているか',
    variants: [
      {
        id: 'C-FADE-1',
        name: '透明度のみ',
        tags: ['やわらかい', '控えめ'],
        diff: '位置は動かず、透明度だけが変わる',
        use: '位置を動かしたくない切り替え',
        mode: 'fade',
        params: SCREEN
      },
      {
        id: 'C-FADE-2',
        name: 'スライド＋フェード',
        tags: ['やわらかい', '軽い'],
        diff: '少し横から動きながら現れる',
        use: '方向感を少し足したい切り替え',
        mode: 'slidefade',
        params: SCREEN
      }
    ]
  },
  {
    id: 'c-slide', section: 'C', title: 'スライド', stage: 'screens',
    axis: '「スライド」と言ったとき、どれを指しているか',
    variants: [
      {
        id: 'C-SLIDE-1',
        name: '新画面だけ動く',
        tags: ['標準', '軽い'],
        diff: '旧画面は止まったまま、新画面が重なる',
        use: '戻りやすい浅い階層や、重ねて表示する画面',
        mode: 'slide',
        params: SCREEN
      },
      {
        id: 'C-SLIDE-2',
        name: '旧画面も押し出される',
        tags: ['連続的', 'キビキビ'],
        diff: '旧画面が左へ押し出される',
        use: 'ページ送りや、タブの横移動',
        mode: 'slide-push',
        params: SCREEN
      },
      {
        id: 'C-SLIDE-3',
        name: '旧画面が奥に引っ込む',
        tags: ['奥行き', '高級感'],
        diff: '旧画面が縮んで暗くなる',
        use: '奥行きを出したい階層遷移',
        mode: 'slide-back',
        params: SCREEN
      }
    ]
  },
  {
    id: 'c-float', section: 'C', title: 'ふわっと', stage: 'box',
    axis: '「ふわっと出す」と言ったとき、どれを指しているか',
    variants: [
      {
        id: 'C-FLOAT-1',
        name: 'ゆっくり立ち上がる',
        tags: ['やわらかい', '上品'],
        diff: '800ms かけて小さく浮き上がる',
        use: '通知やカードを控えめに表示したいとき',
        mode: 'float-slow',
        params: { ...BOX, duration: 800 }
      },
      {
        id: 'C-FLOAT-2',
        name: '勢いよく出て柔らかく止まる',
        tags: ['キビキビ', 'なめらか'],
        diff: '450ms。出だしが速く、減速して止まる',
        use: 'ポップアップやメニューを素早く出したいとき',
        mode: 'float-snap',
        params: { ...BOX, duration: 450, easing: 'cubic-bezier(.16, 1, .3, 1)' }
      },
      {
        id: 'C-FLOAT-3',
        name: '少し跳ねる',
        tags: ['弾む', '軽快'],
        diff: '600ms。位置を少し超えてから戻る',
        use: '遊びのある、親しみやすい表示',
        mode: 'float-bounce',
        params: { ...BOX, duration: 600 }
      }
    ]
  },
  {
    id: 'c-jelly', section: 'C', title: 'ぷるっと', stage: 'box',
    axis: '「ぷるっとさせる」と言ったとき、どちらを指しているか',
    variants: [
      {
        id: 'C-JELLY-1',
        name: 'オーバーシュートして戻る',
        tags: ['弾む', 'やわらかい'],
        diff: '大きさが膨らんでから収まる',
        use: '成功やお気に入り登録などの、前向きな反応',
        mode: 'jelly-over',
        params: { ...BOX, duration: 500, easing: 'ease-out' }
      },
      {
        id: 'C-JELLY-2',
        name: '小刻みに揺れる',
        tags: ['震える', 'エラー的'],
        diff: '左右に細かく揺れる',
        use: '入力エラーなど、注意を引きたいとき',
        mode: 'jelly-shake',
        params: { ...BOX, duration: 400, easing: 'ease-out' }
      }
    ]
  },
  {
    id: 'c-pop', section: 'C', title: 'ポップ', stage: 'box',
    axis: '「ポップに出す」と言ったとき、どちらを指しているか',
    variants: [
      {
        id: 'C-POP-1',
        name: '拡大して現れる',
        tags: ['シンプル', '軽い'],
        diff: '小さい状態から原寸まで拡大するだけ',
        use: 'バッジやトーストなどの、シンプルな出現',
        mode: 'pop-grow',
        params: { ...BOX, duration: 300, easing: 'ease-out' }
      },
      {
        id: 'C-POP-2',
        name: '拡大してから縮んで収まる',
        tags: ['弾む', 'ポップ'],
        diff: '原寸を超えて膨らみ、少し縮んで止まる',
        use: 'ポイント獲得など、嬉しい通知を目立たせたいとき',
        mode: 'pop-settle',
        params: { ...BOX, duration: 400, easing: 'ease-out' }
      }
    ]
  },
  {
    id: 'c-bounce', section: 'C', title: 'バウンド', stage: 'box',
    axis: '「バウンドさせる」と言ったとき、どちらを指しているか',
    variants: [
      {
        id: 'C-BOUNCE-1',
        name: '1回跳ねる',
        tags: ['軽い', 'シンプル'],
        diff: '1回だけ上がって戻る',
        use: 'スクロールを促すなど、軽い合図',
        mode: 'bounce-once',
        params: { ...BOX, duration: 500, easing: 'linear' }
      },
      {
        id: 'C-BOUNCE-2',
        name: '減衰して複数回',
        tags: ['弾む', '物理的'],
        diff: '跳ねる高さが小さくなりながら繰り返す',
        use: 'ゲームのような、遊びのある演出',
        mode: 'bounce-decay',
        params: { ...BOX, duration: 900, easing: 'linear' }
      }
    ]
  },
  {
    id: 'c-fast', section: 'C', title: '速い', stage: 'box',
    axis: '「速くして」と言ったとき、どれを指しているか（開始から終了までの総時間は400msにそろえている）',
    variants: [
      {
        id: 'C-FAST-1',
        name: '所要時間が短い',
        tags: ['キビキビ'],
        diff: '動く時間が200ms（開始が200ms遅れる）',
        use: '待ち時間は気にせず、動いている時間だけを短くしたいとき',
        mode: 'move',
        params: { duration: 200, easing: 'ease-in-out', delay: 200 }
      },
      {
        id: 'C-FAST-2',
        name: '動き出しが速い',
        tags: ['キビキビ', '軽い'],
        diff: '開始は即時。ease-out で出だしが急',
        use: 'タップ直後の反応など、速さを感じさせたい操作',
        mode: 'move',
        params: { duration: 400, easing: 'ease-out', delay: 0 }
      },
      {
        id: 'C-FAST-3',
        name: '開始遅延が短い',
        tags: ['標準'],
        diff: '開始が50ms後と早く、動きは350ms',
        use: '標準的な素早さ。どれが近いか迷ったときの基準',
        mode: 'move',
        params: { duration: 350, easing: 'ease-in-out', delay: 50 }
      }
    ]
  },
  {
    id: 'c-pause', section: 'C', title: '間を置く', stage: 'box',
    axis: '「間を置いて」と言ったとき、どちらを指しているか（総時間は900msにそろえている）',
    variants: [
      {
        id: 'C-PAUSE-1',
        name: '開始遅延',
        tags: ['丁寧', '余韻'],
        diff: '500ms 待ってから動く',
        use: '表示後に間を置いて、注目を集めたいとき',
        mode: 'move',
        params: { duration: 400, easing: 'ease-in-out', delay: 500 }
      },
      {
        id: 'C-PAUSE-2',
        name: '動きの途中で止まる',
        tags: ['もったり', '演出的'],
        diff: '動きの中ほどで止まり、再び動く',
        use: '演出的に、動きの区切りを見せたいとき',
        mode: 'move-pause',
        params: { duration: 900, easing: 'linear', delay: 0 }
      }
    ]
  },
  {
    id: 'c-seq', section: 'C', title: '順番に出る', stage: 'list',
    axis: '「順番に出して」と言ったとき、どちらを指しているか',
    variants: [
      {
        id: 'C-SEQ-1',
        name: '一定間隔',
        tags: ['一定', '機械的'],
        diff: '80ms ずつずらす',
        use: 'リストや一覧の標準的な順次表示',
        mode: 'stagger',
        params: { duration: 350, easing: 'ease-out', stagger: 80 }
      },
      {
        id: 'C-SEQ-2',
        name: 'だんだん間隔が詰まる',
        tags: ['加速', 'リズミカル'],
        diff: '間隔が 160→120→80→60ms と詰まる',
        use: '勢いを付けたい導入やタイトル演出',
        mode: 'tighten',
        params: { duration: 350, easing: 'ease-out', delays: [0, 160, 280, 360, 420] }
      }
    ]
  },
  {
    id: 'c-origin', section: 'C', title: '中心から広がる', stage: 'origin', needs: 'clip-path',
    axis: '「中心から広がる」と言ったとき、どこを中心にしているか',
    variants: [
      {
        id: 'C-ORIGIN-1',
        name: '画面中心',
        tags: ['標準', '対称'],
        diff: '画面の中央から広がる',
        use: '画面全体の切り替えや、読み込み後の表示',
        mode: 'origin',
        params: { duration: 600, easing: 'cubic-bezier(.2, 0, 0, 1)', x: 50, y: 50 }
      },
      {
        id: 'C-ORIGIN-2',
        name: 'タップ位置',
        tags: ['直感的', '反応が分かる'],
        diff: '押した位置（例: 右上）から広がる',
        use: 'タップが起点のメニューや、FAB の展開',
        mode: 'origin',
        params: { duration: 600, easing: 'cubic-bezier(.2, 0, 0, 1)', x: 82, y: 18 }
      },
      {
        id: 'C-ORIGIN-3',
        name: '要素中心',
        tags: ['文脈が分かる'],
        diff: '押したボタンの中心から広がる',
        use: 'ボタンから画面やパネルを開くとき',
        mode: 'origin',
        params: { duration: 600, easing: 'cubic-bezier(.2, 0, 0, 1)', x: 50, y: 72 }
      }
    ]
  },
  {
    id: 'c-exit', section: 'C', title: '消える', stage: 'box',
    axis: '「消して」と言ったとき、どれを指しているか',
    variants: [
      {
        id: 'C-EXIT-1',
        name: '透明になるだけ',
        tags: ['控えめ', 'やわらかい'],
        diff: '位置も大きさも変わらない',
        use: '目立たせずに消したい通知やトースト',
        mode: 'exit-fade',
        params: { ...BOX, duration: 300 }
      },
      {
        id: 'C-EXIT-2',
        name: '縮んで消える',
        tags: ['軽い', 'ポップ'],
        diff: '縮みながら透明になる',
        use: '削除など、なくなった感を出したいとき',
        mode: 'exit-shrink',
        params: { ...BOX, duration: 300 }
      },
      {
        id: 'C-EXIT-3',
        name: '来た方向へ戻る',
        tags: ['連続的', '一貫性'],
        diff: '入ってきた右側へ出ていく',
        use: '入ってきた方向へ戻したい、スワイプで閉じる操作',
        mode: 'exit-back',
        params: { ...BOX, duration: 300, easing: 'ease-in' }
      }
    ]
  },
  {
    id: 'c-stop', section: 'C', title: '止まる', stage: 'box',
    axis: '「止めて」と言ったとき、どれを指しているか',
    variants: [
      {
        id: 'C-STOP-1',
        name: 'ぴたっと止まる',
        tags: ['キビキビ', '機械的'],
        diff: '一定速度のまま、最後に急に止まる',
        use: '機械的・直線的な操作や、ゲージの終端',
        mode: 'move',
        params: { duration: 300, easing: 'linear', delay: 0 }
      },
      {
        id: 'C-STOP-2',
        name: '減速して止まる',
        tags: ['自然', 'なめらか'],
        diff: '終わりに向けてゆっくり止まる',
        use: '標準的な停止。移動やスクロールの終わり',
        mode: 'move',
        params: { duration: 500, easing: 'ease-out', delay: 0 }
      },
      {
        id: 'C-STOP-3',
        name: 'はみ出してから戻る',
        tags: ['弾む', '物理的'],
        diff: '目標位置を少し超えてから戻る',
        use: '弾む印象で、勢いのある配置の止まり方',
        mode: 'stop-overshoot',
        params: { duration: 600, easing: 'linear', delay: 0 }
      }
    ]
  },

  /* ---------- D. 通知 ---------- */
  {
    id: 'd-dir', section: 'D', title: '方向差', stage: 'toast',
    axis: 'スライドで入ってくる方向だけを変える（下からが基準）。トーストは入ってくる側の端に置く',
    variants: [
      {
        id: 'D-DIR-1',
        name: '下から',
        tags: ['標準', '控えめ'],
        diff: '基準',
        use: '標準。画面下の操作（保存・送信）の結果を知らせる',
        mode: 'slide',
        params: TOAST,
        base: true
      },
      {
        id: 'D-DIR-2',
        name: '上から',
        tags: ['目立つ', '知らせる'],
        diff: '基準と違い、上端から降りてくる',
        use: '画面下にボタンやタブが多く、下だと隠れてしまう画面',
        mode: 'slide',
        params: { ...TOAST, from: 'top' }
      },
      {
        id: 'D-DIR-3',
        name: '左から',
        tags: ['横の流れ', '軽い'],
        diff: '基準と違い、左端から入ってくる',
        use: '左から右へ進む流れ（ステップ・横スクロール）の中の通知',
        mode: 'slide',
        params: { ...TOAST, from: 'left' }
      },
      {
        id: 'D-DIR-4',
        name: '右から',
        tags: ['横の流れ', '軽い'],
        diff: '基準と違い、右端から入ってくる',
        use: '横幅の広い画面で、右下に積む通知',
        mode: 'slide',
        params: { ...TOAST, from: 'right' }
      }
    ]
  },
  {
    id: 'd-type', section: 'D', title: '種類差', stage: 'toast',
    axis: '出し方だけを変える（下からのスライドが基準）。置き場所は下中央でそろえている',
    variants: [
      {
        id: 'D-TYPE-1',
        name: 'スライド',
        tags: ['標準', '方向が分かる'],
        diff: '基準',
        use: '標準。どこから来たかを見せたい通知',
        mode: 'slide',
        params: TOAST,
        base: true
      },
      {
        id: 'D-TYPE-2',
        name: 'フェード',
        tags: ['やわらかい', '控えめ'],
        diff: '基準と違い、位置は動かず透明度だけが変わる',
        use: '動きを目立たせたくない、落ち着いた画面',
        mode: 'fade',
        params: TOAST_FADE_PARAMS
      },
      {
        id: 'D-TYPE-3',
        name: 'なし',
        tags: ['即時', '機械的'],
        diff: '基準と違い、時間 0 で一瞬で出て一瞬で消える',
        use: '頻繁に出る通知や、動きを入れない方針の画面',
        mode: 'none',
        params: { duration: 0, hold: 2500 }
      }
    ]
  }
];

/* 調整値を反映したトラックを作る。override: { duration?, easing? } */
export function buildTracks(group, variant, override = {}) {
  const build = BUILDERS[group.stage];
  if (!build) throw new Error(`unknown stage: ${group.stage}`);
  const params = { ...variant.params };
  if (override.duration != null) params.duration = override.duration;
  if (override.easing != null) params.easing = override.easing;
  return { params, tracks: build(variant, params) };
}

const MS_KEYS = new Set(['duration', 'delay', 'hold', 'gap', 'back', 'stagger', 'out']);
const LABELS = { x: '中心 x', y: '中心 y', backEasing: '戻りの easing', hold: 'hold（見せる時間）', out: '出る時間', from: '方向' };
const FROM_LABELS = { bottom: '下から', top: '上から', left: '左から', right: '右から' };

/* 表示用: [[ラベル, 値], ...]。params から作るので、動きとずれない */
export function formatParams(params) {
  return Object.entries(params).map(([key, value]) => [
    LABELS[key] || key,
    Array.isArray(value) ? value.join(' / ') + ' ms'
      : MS_KEYS.has(key) ? `${value}ms`
      : (key === 'x' || key === 'y') ? `${value}%`
      : key === 'from' ? FROM_LABELS[value] || String(value)
      : String(value)
  ]);
}

/* コピー用 JSON（WAAPI の keyframes と options）。stagger / delays は要素ごとの追加遅延 */
export function toWaapiJson(variant, tracks) {
  return JSON.stringify({ id: variant.id, name: variant.name, tracks }, null, 2);
}

export const ALL_TAGS = [...new Set(COMPARE_GROUPS.flatMap(g => g.variants.flatMap(v => v.tags)))];
