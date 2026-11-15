/* ============================================================
   差分比較（認識合わせ用）のデータ
   - 1バリアント = 1オブジェクト。バリアントの追加はデータの追加だけで済む
   - 表示するパラメータ値・実際の動き・コピーする JSON は、すべて同じ params から作る
   - MOTIONS（モーション定義）とは別物。ストーリーや「動きを減らす」版の対象ではない
     （差分比較ビューは、動きを減らす設定のときは再生を止める）
   DOM に依存しない。tests/compare.test.js でデータの整合を検査する。
   ============================================================ */

export const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';

/* 調整 UI のイージング候補（値はそのまま WAAPI の easing に渡す） */
export const EASING_PRESETS = [
  ['linear', 'linear'],
  ['ease-out', 'ease-out'],
  ['ease-in', 'ease-in'],
  ['ease-in-out', 'ease-in-out'],
  ['バネ（少しオーバーシュート）', SPRING]
];

export const SECTIONS = [
  { id: 'A', title: 'A. ボタン押下', lead: '基準を1つ固定し、1つの軸だけを変えて並べる。' },
  { id: 'B', title: 'B. 画面遷移', lead: '画面A→画面Bの切り替え。基準を固定し、1つの軸だけを変える。' },
  { id: 'C', title: 'C. 口頭で混同しやすいペア', lead: '同じ言葉で指しがちな動きを並べる。どれを指しているか選んで認識を合わせる。' },
  { id: 'D', title: 'D. 通知', lead: 'トーストの入り方と出方。入る → 見せる → 同じ出し方で出る、を再生する。基準を固定し、1つの軸だけを変える。' }
];

/* トラック = 1つの要素（target）に対する1回の animate() 呼び出し分 */
const T = (target, keyframes, options = {}, extra = {}) => ({
  target, keyframes, options: { fill: 'both', ...options }, ...extra
});

const FADE_OUT = [{ opacity: 1 }, { opacity: 0 }];
const IN = {
  fade: [{ opacity: 0 }, { opacity: 1 }],
  slide: [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
  rise: [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
  scalefade: [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'scale(1)' }],
  slidefade: [{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'translateX(0)' }]
};
const ITEM_IN = [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'translateY(0)' }];
const TOAST_FADE = [{ opacity: 0 }, { opacity: 1 }];
/* 入ってくる側の端の外から、置き場所（0）まで */
const TOAST_SLIDE = {
  bottom: [{ transform: 'translateY(calc(100% + 16px))' }, { transform: 'translateY(0)' }],
  top: [{ transform: 'translateY(calc(-100% - 16px))' }, { transform: 'translateY(0)' }],
  left: [{ transform: 'translateX(calc(-100% - 16px))' }, { transform: 'translateX(0)' }],
  right: [{ transform: 'translateX(calc(100% + 16px))' }, { transform: 'translateX(0)' }]
};
const TOAST_EXIT_EASE = 'cubic-bezier(.4, 0, 1, 1)';
const MOVE = [{ transform: 'translateX(-60px)' }, { transform: 'translateX(60px)' }];

/* stage ごとのトラック生成。v: バリアント, p: 調整を反映した params */
const BUILDERS = {
  button(v, p) {
    if (v.mode === 'ripple') {
      return [T('ripple',
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
      T('btn', [rest, pressed], { duration: down, easing: 'ease-out', fill: 'forwards' }),
      T('btn', [pressed, rest], { duration: up, delay: down + hold, easing: p.easing, fill: 'forwards' }, { main: true })
    ];
  },

  screens(v, p) {
    const d = p.duration, e = p.easing;
    const main = { duration: d, easing: e };
    switch (v.mode) {
      case 'fade': case 'slide': case 'rise': case 'scalefade': case 'slidefade':
        return [T('incoming', IN[v.mode], main, { main: true })];
      case 'slide-push':
        return [
          T('outgoing', [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }], main),
          T('incoming', IN.slide, main, { main: true })
        ];
      case 'slide-back':
        return [
          T('outgoing', [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.9)', opacity: .4 }], main),
          T('incoming', IN.slide, main, { main: true })
        ];
      case 'together': case 'sequential': {
        const gap = p.gap || 0;
        return [
          T('outgoing', FADE_OUT, { duration: gap || d, easing: e }),
          T('incoming', IN.slide, { ...main, delay: gap }, { main: true })
        ];
      }
      case 'symmetry': {
        const back = [...IN.slide].reverse();
        return [
          T('incoming', IN.slide, main, { main: true }),
          T('incoming', back, { duration: p.back, delay: d + p.hold, easing: p.backEasing, fill: 'forwards' })
        ];
      }
      case 'stagger':
        return [
          T('incoming', IN.fade, { duration: 150, easing: 'linear' }),
          T('items', ITEM_IN, { ...main, delay: 100 }, { main: true, stagger: p.stagger })
        ];
      default:
        throw new Error(`unknown screens mode: ${v.mode}`);
    }
  },

  box(v, p) {
    const o = { duration: p.duration, easing: p.easing, delay: p.delay || 0 };
    const k = {
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
    if (!k) throw new Error(`unknown box mode: ${v.mode}`);
    return [T('box', k, o, { main: true })];
  },

  list(v, p) {
    const o = { duration: p.duration, easing: p.easing };
    const extra = v.mode === 'tighten'
      ? { main: true, delays: p.delays }
      : { main: true, stagger: p.stagger };
    return [T('items', ITEM_IN, o, extra)];
  },

  /* トースト: 入る → hold ms 見せる → 同じ出し方で出る。出る時間は out ms（イージングは固定） */
  toast(v, p) {
    if (v.mode === 'none') {
      // アニメーションなし: 時間 0 で切り替える。調整値（時間・イージング）は効かない
      return [
        T('toast', TOAST_FADE, { duration: 0 }, { main: true }),
        T('toast', [...TOAST_FADE].reverse(), { duration: 0, delay: p.hold, fill: 'forwards' })
      ];
    }
    const k = v.mode === 'fade' ? TOAST_FADE : TOAST_SLIDE[p.from];
    if (!k) throw new Error(`unknown toast: ${v.mode} / ${p.from}`);
    return [
      T('toast', k, { duration: p.duration, easing: p.easing }, { main: true }),
      T('toast', [...k].reverse(), { duration: p.out, delay: p.duration + p.hold, easing: TOAST_EXIT_EASE, fill: 'forwards' })
    ];
  },

  origin(v, p) {
    const at = `${p.x}% ${p.y}%`;
    return [T('reveal',
      [{ clipPath: `circle(0% at ${at})` }, { clipPath: `circle(150% at ${at})` }],
      { duration: p.duration, easing: p.easing }, { main: true })];
  }
};

const V = (id, name, tags, diff, use, mode, params, extra = {}) => ({ id, name, tags, diff, use, mode, params, ...extra });
const BASE = { base: true };

const PRESS = { duration: 200, easing: 'ease-out', scale: .95, hold: 0 };
const SCREEN = { duration: 300, easing: 'ease-out' };
const BOX = { duration: 500, easing: 'ease-out', delay: 0 };
/* モーション定義の toast と同じ値（入る 300ms・見せる 2.5s・出る 250ms）。変えるときは両方を合わせる */
const TOAST = { duration: 300, easing: 'cubic-bezier(.2, 0, 0, 1)', hold: 2500, out: 250, from: 'bottom' };
const { from: _from, ...TOAST_FADE_PARAMS } = TOAST;   // フェードは方向を持たない

export const COMPARE_GROUPS = [
  /* ---------- A. ボタン押下 ---------- */
  {
    id: 'a-speed', section: 'A', title: '速度差', stage: 'button',
    axis: '押してから戻るまでの時間だけを変える（200ms が基準）',
    variants: [
      V('A-SPEED-1', '速い 100ms', ['キビキビ', '軽い'], '基準より短い（100ms）', '連打されやすい、軽快さを重視したいボタン', 'shrink', { ...PRESS, duration: 100 }),
      V('A-SPEED-2', '標準 200ms', ['自然'], '基準', '迷ったときの標準。主要ボタン全般', 'shrink', PRESS, BASE),
      V('A-SPEED-3', '微差 250ms', ['自然'], '基準より50ms長いだけ（差が小さい）', '200ms との差が分かるかを確かめる比較用', 'shrink', { ...PRESS, duration: 250 }, { subtle: '200ms との微差' }),
      V('A-SPEED-4', 'ゆっくり 400ms', ['やわらかい', '重厚'], '基準より長い（400ms）', 'ゆっくり丁寧に見せたい、重要な確定操作', 'shrink', { ...PRESS, duration: 400 })
    ]
  },
  {
    id: 'a-ease', section: 'A', title: 'イージング差', stage: 'button',
    axis: '戻るときの加速の付け方だけを変える（ease-out が基準）',
    variants: [
      V('A-EASE-1', 'linear', ['機械的', 'チープ'], '基準と違い、一定速度で戻る', '機械的な印象を出したいとき（通常は避ける）', 'shrink', { ...PRESS, easing: 'linear' }),
      V('A-EASE-2', 'ease-out', ['自然', 'キビキビ'], '基準', '標準。押した直後の反応を見せたいボタン', 'shrink', PRESS, BASE),
      V('A-EASE-3', 'ease-in-out', ['なめらか', 'やわらかい'], '基準と違い、出だしも終わりもゆっくり', '落ち着いた、なめらかな印象にしたいボタン', 'shrink', { ...PRESS, easing: 'ease-in-out' }),
      V('A-EASE-4', 'バネ', ['弾む', '軽快'], '基準と違い、元の大きさを少し超えてから戻る', '楽しく軽快な印象の主要ボタン', 'shrink', { ...PRESS, easing: SPRING })
    ]
  },
  {
    id: 'a-power', section: 'A', title: '強度差', stage: 'button',
    axis: '縮む量（scale）だけを変える（0.95 が基準）',
    variants: [
      V('A-POWER-1', 'scale 0.98', ['控えめ', '高級感'], '基準より縮み方が小さい', '落ち着き・高級感を出したい画面', 'shrink', { ...PRESS, scale: .98 }),
      V('A-POWER-2', 'scale 0.95', ['標準'], '基準', '迷ったときの標準', 'shrink', PRESS, BASE),
      V('A-POWER-3', 'scale 0.90', ['しっかり', '押した感'], '基準より縮み方が大きい', '押した手応えをはっきり伝えたい大きなボタン', 'shrink', { ...PRESS, scale: .9 })
    ]
  },
  {
    id: 'a-style', section: 'A', title: '表現差', stage: 'button',
    axis: '押下の見せ方（形・位置・色・波紋）だけを変える',
    variants: [
      V('A-STYLE-1', '縮む', ['標準', '軽い'], '基準', '標準。ほとんどのボタン', 'shrink', PRESS, BASE),
      V('A-STYLE-2', '沈む', ['重厚', '物理的'], '縮まず、下へ沈んで影が減る', '物理的なスイッチ感を出したい、影のあるデザインのボタン', 'sink', { duration: 200, easing: 'ease-out' }),
      V('A-STYLE-3', '色だけ', ['控えめ', 'フラット'], '動かず、明るさだけ変わる', '動きを抑えたいフラットな UI、リストの行', 'color', { duration: 200, easing: 'ease-out' }),
      V('A-STYLE-4', 'リップル', ['マテリアル', '反応が分かる'], '縮まず、波紋が広がる', '押した位置や反応を明確にしたいマテリアル系の UI', 'ripple', { duration: 400, easing: 'ease-out' })
    ]
  },
  {
    id: 'a-release', section: 'A', title: '戻り方差', stage: 'button',
    axis: '離したあとの戻り始めのタイミングだけを変える',
    variants: [
      V('A-RELEASE-1', '離した瞬間に戻る', ['キビキビ'], '基準', '標準。軽快に操作させたいボタン', 'shrink', PRESS, BASE),
      V('A-RELEASE-2', '少し遅れて戻る', ['もったり', '重厚'], '基準と違い、沈んだまま150ms待ってから戻る', '押した感を余韻で残したい、重みのあるボタン', 'shrink', { ...PRESS, hold: 150 })
    ]
  },

  /* ---------- B. 画面遷移 ---------- */
  {
    id: 'b-type', section: 'B', title: '種類差', stage: 'screens',
    axis: '新しい画面の入り方の種類だけを変える（横スライドが基準）',
    variants: [
      V('B-TYPE-1', 'フェード', ['やわらかい', '控えめ'], '基準と違い、透明度だけで入る', 'タブ切り替えなど、関係の弱い同階層の画面切り替え', 'fade', SCREEN),
      V('B-TYPE-2', '横スライド', ['標準', 'キビキビ'], '基準', '階層を進む遷移（一覧 → 詳細）', 'slide', SCREEN, BASE),
      V('B-TYPE-3', '下からせり上がり', ['モーダル的', '重厚'], '基準と違い、下から上へ入る', 'モーダルや補助的な画面（シート）', 'rise', SCREEN),
      V('B-TYPE-4', 'スケール＋フェード', ['高級感', 'やわらかい'], '基準と違い、少し拡大しながら現れる', '強調したい画面の登場、ダイアログ的な切り替え', 'scalefade', SCREEN)
    ]
  },
  {
    id: 'b-overlap', section: 'B', title: '重なり方差', stage: 'screens',
    axis: '前の画面と次の画面の時間の重なりだけを変える',
    variants: [
      V('B-OVERLAP-1', '同時に入れ替わる', ['キビキビ', '連続的'], '基準', '素早く連続して切り替えたい通常の遷移', 'together', { ...SCREEN, gap: 0 }, BASE),
      V('B-OVERLAP-2', '消えてから出る', ['丁寧', 'ゆっくり'], '基準と違い、前画面が消える150ms後に次が入る', '画面の区切りを明確にしたい、丁寧な切り替え', 'sequential', { ...SCREEN, gap: 150 })
    ]
  },
  {
    id: 'b-time', section: 'B', title: '時間差', stage: 'screens',
    axis: '切り替えの時間だけを変える（300ms が基準）',
    variants: [
      V('B-TIME-1', '150ms', ['キビキビ', '軽い'], '基準より短い', '頻繁に行き来する、軽い切り替え', 'slide', { ...SCREEN, duration: 150 }),
      V('B-TIME-2', '300ms', ['標準'], '基準', '迷ったときの標準', 'slide', SCREEN, BASE),
      V('B-TIME-3', '微差 350ms', ['標準'], '基準より50ms長いだけ（差が小さい）', '300ms との差が分かるかを確かめる比較用', 'slide', { ...SCREEN, duration: 350 }, { subtle: '300ms との微差' }),
      V('B-TIME-4', '500ms', ['ゆっくり', '重厚'], '基準より長い', '演出的な画面など、ゆっくり見せたい場面', 'slide', { ...SCREEN, duration: 500 })
    ]
  },
  {
    id: 'b-sym', section: 'B', title: '進む・戻るの対称性', stage: 'screens',
    axis: '進んだあとの「戻り」の動きだけを変える（進む動きは同じ。再生すると進んで戻る）',
    variants: [
      V('B-SYM-1', '同じ動きの逆再生', ['一貫性', '自然'], '基準', '進む・戻るを一貫させたい標準的な階層遷移', 'symmetry', { ...SCREEN, back: 300, backEasing: 'ease-in', hold: 500 }, BASE),
      V('B-SYM-2', '戻りだけ速い', ['キビキビ', '軽い'], '基準と違い、戻りが150msで終わる', '戻る操作で待たせたくない画面', 'symmetry', { ...SCREEN, back: 150, backEasing: 'ease-in', hold: 500 })
    ]
  },
  {
    id: 'b-stagger', section: 'B', title: 'ずらし差', stage: 'screens',
    axis: '画面内の要素の出方だけを変える',
    variants: [
      V('B-STAGGER-1', '全体が一斉', ['シンプル', 'キビキビ'], '基準', 'シンプルに素早く表示したい画面', 'stagger', { ...SCREEN, stagger: 0 }, BASE),
      V('B-STAGGER-2', '要素が順番に出る', ['丁寧', '高級感'], '基準と違い、要素が70ms間隔で順に出る', '一覧やカードをリズムよく見せたい初回表示', 'stagger', { ...SCREEN, stagger: 70 })
    ]
  },

  /* ---------- C. 口頭で混同しやすいペア ---------- */
  {
    id: 'c-fade', section: 'C', title: 'フェード', stage: 'screens',
    axis: '「フェード」と言ったとき、どちらを指しているか',
    variants: [
      V('C-FADE-1', '透明度のみ', ['やわらかい', '控えめ'], '位置は動かず、透明度だけが変わる', '位置を動かしたくない切り替え', 'fade', SCREEN),
      V('C-FADE-2', 'スライド＋フェード', ['やわらかい', '軽い'], '少し横から動きながら現れる', '方向感を少し足したい切り替え', 'slidefade', SCREEN)
    ]
  },
  {
    id: 'c-slide', section: 'C', title: 'スライド', stage: 'screens',
    axis: '「スライド」と言ったとき、どれを指しているか',
    variants: [
      V('C-SLIDE-1', '新画面だけ動く', ['標準', '軽い'], '旧画面は止まったまま、新画面が重なる', '戻りやすい浅い階層や、重ねて表示する画面', 'slide', SCREEN),
      V('C-SLIDE-2', '旧画面も押し出される', ['連続的', 'キビキビ'], '旧画面が左へ押し出される', 'ページ送りや、タブの横移動', 'slide-push', SCREEN),
      V('C-SLIDE-3', '旧画面が奥に引っ込む', ['奥行き', '高級感'], '旧画面が縮んで暗くなる', '奥行きを出したい階層遷移', 'slide-back', SCREEN)
    ]
  },
  {
    id: 'c-float', section: 'C', title: 'ふわっと', stage: 'box',
    axis: '「ふわっと出す」と言ったとき、どれを指しているか',
    variants: [
      V('C-FLOAT-1', 'ゆっくり立ち上がる', ['やわらかい', '上品'], '800ms かけて小さく浮き上がる', '通知やカードを控えめに表示したいとき', 'float-slow', { ...BOX, duration: 800 }),
      V('C-FLOAT-2', '勢いよく出て柔らかく止まる', ['キビキビ', 'なめらか'], '450ms。出だしが速く、減速して止まる', 'ポップアップやメニューを素早く出したいとき', 'float-snap', { ...BOX, duration: 450, easing: 'cubic-bezier(.16, 1, .3, 1)' }),
      V('C-FLOAT-3', '少し跳ねる', ['弾む', '軽快'], '600ms。位置を少し超えてから戻る', '遊びのある、親しみやすい表示', 'float-bounce', { ...BOX, duration: 600 })
    ]
  },
  {
    id: 'c-jelly', section: 'C', title: 'ぷるっと', stage: 'box',
    axis: '「ぷるっとさせる」と言ったとき、どちらを指しているか',
    variants: [
      V('C-JELLY-1', 'オーバーシュートして戻る', ['弾む', 'やわらかい'], '大きさが膨らんでから収まる', '成功やお気に入り登録などの、前向きな反応', 'jelly-over', { ...BOX, duration: 500, easing: 'ease-out' }),
      V('C-JELLY-2', '小刻みに揺れる', ['震える', 'エラー的'], '左右に細かく揺れる', '入力エラーなど、注意を引きたいとき', 'jelly-shake', { ...BOX, duration: 400, easing: 'ease-out' })
    ]
  },
  {
    id: 'c-pop', section: 'C', title: 'ポップ', stage: 'box',
    axis: '「ポップに出す」と言ったとき、どちらを指しているか',
    variants: [
      V('C-POP-1', '拡大して現れる', ['シンプル', '軽い'], '小さい状態から原寸まで拡大するだけ', 'バッジやトーストなどの、シンプルな出現', 'pop-grow', { ...BOX, duration: 300, easing: 'ease-out' }),
      V('C-POP-2', '拡大してから縮んで収まる', ['弾む', 'ポップ'], '原寸を超えて膨らみ、少し縮んで止まる', 'ポイント獲得など、嬉しい通知を目立たせたいとき', 'pop-settle', { ...BOX, duration: 400, easing: 'ease-out' })
    ]
  },
  {
    id: 'c-bounce', section: 'C', title: 'バウンド', stage: 'box',
    axis: '「バウンドさせる」と言ったとき、どちらを指しているか',
    variants: [
      V('C-BOUNCE-1', '1回跳ねる', ['軽い', 'シンプル'], '1回だけ上がって戻る', 'スクロールを促すなど、軽い合図', 'bounce-once', { ...BOX, duration: 500, easing: 'linear' }),
      V('C-BOUNCE-2', '減衰して複数回', ['弾む', '物理的'], '跳ねる高さが小さくなりながら繰り返す', 'ゲームのような、遊びのある演出', 'bounce-decay', { ...BOX, duration: 900, easing: 'linear' })
    ]
  },
  {
    id: 'c-fast', section: 'C', title: '速い', stage: 'box',
    axis: '「速くして」と言ったとき、どれを指しているか（開始から終了までの総時間は400msにそろえている）',
    variants: [
      V('C-FAST-1', '所要時間が短い', ['キビキビ'], '動く時間が200ms（開始が200ms遅れる）', '待ち時間は気にせず、動いている時間だけを短くしたいとき', 'move', { duration: 200, easing: 'ease-in-out', delay: 200 }),
      V('C-FAST-2', '動き出しが速い', ['キビキビ', '軽い'], '開始は即時。ease-out で出だしが急', 'タップ直後の反応など、速さを感じさせたい操作', 'move', { duration: 400, easing: 'ease-out', delay: 0 }),
      V('C-FAST-3', '開始遅延が短い', ['標準'], '開始が50ms後と早く、動きは350ms', '標準的な素早さ。どれが近いか迷ったときの基準', 'move', { duration: 350, easing: 'ease-in-out', delay: 50 })
    ]
  },
  {
    id: 'c-pause', section: 'C', title: '間を置く', stage: 'box',
    axis: '「間を置いて」と言ったとき、どちらを指しているか（総時間は900msにそろえている）',
    variants: [
      V('C-PAUSE-1', '開始遅延', ['丁寧', '余韻'], '500ms 待ってから動く', '表示後に間を置いて、注目を集めたいとき', 'move', { duration: 400, easing: 'ease-in-out', delay: 500 }),
      V('C-PAUSE-2', '動きの途中で止まる', ['もったり', '演出的'], '動きの中ほどで止まり、再び動く', '演出的に、動きの区切りを見せたいとき', 'move-pause', { duration: 900, easing: 'linear', delay: 0 })
    ]
  },
  {
    id: 'c-seq', section: 'C', title: '順番に出る', stage: 'list',
    axis: '「順番に出して」と言ったとき、どちらを指しているか',
    variants: [
      V('C-SEQ-1', '一定間隔', ['一定', '機械的'], '80ms ずつずらす', 'リストや一覧の標準的な順次表示', 'stagger', { duration: 350, easing: 'ease-out', stagger: 80 }),
      V('C-SEQ-2', 'だんだん間隔が詰まる', ['加速', 'リズミカル'], '間隔が 160→120→80→60ms と詰まる', '勢いを付けたい導入やタイトル演出', 'tighten', { duration: 350, easing: 'ease-out', delays: [0, 160, 280, 360, 420] })
    ]
  },
  {
    id: 'c-origin', section: 'C', title: '中心から広がる', stage: 'origin', needs: 'clip-path',
    axis: '「中心から広がる」と言ったとき、どこを中心にしているか',
    variants: [
      V('C-ORIGIN-1', '画面中心', ['標準', '対称'], '画面の中央から広がる', '画面全体の切り替えや、読み込み後の表示', 'origin', { duration: 600, easing: 'cubic-bezier(.2, 0, 0, 1)', x: 50, y: 50 }),
      V('C-ORIGIN-2', 'タップ位置', ['直感的', '反応が分かる'], '押した位置（例: 右上）から広がる', 'タップが起点のメニューや、FAB の展開', 'origin', { duration: 600, easing: 'cubic-bezier(.2, 0, 0, 1)', x: 82, y: 18 }),
      V('C-ORIGIN-3', '要素中心', ['文脈が分かる'], '押したボタンの中心から広がる', 'ボタンから画面やパネルを開くとき', 'origin', { duration: 600, easing: 'cubic-bezier(.2, 0, 0, 1)', x: 50, y: 72 })
    ]
  },
  {
    id: 'c-exit', section: 'C', title: '消える', stage: 'box',
    axis: '「消して」と言ったとき、どれを指しているか',
    variants: [
      V('C-EXIT-1', '透明になるだけ', ['控えめ', 'やわらかい'], '位置も大きさも変わらない', '目立たせずに消したい通知やトースト', 'exit-fade', { ...BOX, duration: 300 }),
      V('C-EXIT-2', '縮んで消える', ['軽い', 'ポップ'], '縮みながら透明になる', '削除など、なくなった感を出したいとき', 'exit-shrink', { ...BOX, duration: 300 }),
      V('C-EXIT-3', '来た方向へ戻る', ['連続的', '一貫性'], '入ってきた右側へ出ていく', '入ってきた方向へ戻したい、スワイプで閉じる操作', 'exit-back', { ...BOX, duration: 300, easing: 'ease-in' })
    ]
  },
  {
    id: 'c-stop', section: 'C', title: '止まる', stage: 'box',
    axis: '「止めて」と言ったとき、どれを指しているか',
    variants: [
      V('C-STOP-1', 'ぴたっと止まる', ['キビキビ', '機械的'], '一定速度のまま、最後に急に止まる', '機械的・直線的な操作や、ゲージの終端', 'move', { duration: 300, easing: 'linear', delay: 0 }),
      V('C-STOP-2', '減速して止まる', ['自然', 'なめらか'], '終わりに向けてゆっくり止まる', '標準的な停止。移動やスクロールの終わり', 'move', { duration: 500, easing: 'ease-out', delay: 0 }),
      V('C-STOP-3', 'はみ出してから戻る', ['弾む', '物理的'], '目標位置を少し超えてから戻る', '弾む印象で、勢いのある配置の止まり方', 'stop-overshoot', { duration: 600, easing: 'linear', delay: 0 })
    ]
  },

  /* ---------- D. 通知 ---------- */
  {
    id: 'd-dir', section: 'D', title: '方向差', stage: 'toast',
    axis: 'スライドで入ってくる方向だけを変える（下からが基準）。トーストは入ってくる側の端に置く',
    variants: [
      V('D-DIR-1', '下から', ['標準', '控えめ'], '基準', '標準。画面下の操作（保存・送信）の結果を知らせる', 'slide', TOAST, BASE),
      V('D-DIR-2', '上から', ['目立つ', '知らせる'], '基準と違い、上端から降りてくる', '画面下にボタンやタブが多く、下だと隠れてしまう画面', 'slide', { ...TOAST, from: 'top' }),
      V('D-DIR-3', '左から', ['横の流れ', '軽い'], '基準と違い、左端から入ってくる', '左から右へ進む流れ（ステップ・横スクロール）の中の通知', 'slide', { ...TOAST, from: 'left' }),
      V('D-DIR-4', '右から', ['横の流れ', '軽い'], '基準と違い、右端から入ってくる', '横幅の広い画面で、右下に積む通知', 'slide', { ...TOAST, from: 'right' })
    ]
  },
  {
    id: 'd-type', section: 'D', title: '種類差', stage: 'toast',
    axis: '出し方だけを変える（下からのスライドが基準）。置き場所は下中央でそろえている',
    variants: [
      V('D-TYPE-1', 'スライド', ['標準', '方向が分かる'], '基準', '標準。どこから来たかを見せたい通知', 'slide', TOAST, BASE),
      V('D-TYPE-2', 'フェード', ['やわらかい', '控えめ'], '基準と違い、位置は動かず透明度だけが変わる', '動きを目立たせたくない、落ち着いた画面', 'fade', TOAST_FADE_PARAMS),
      V('D-TYPE-3', 'なし', ['即時', '機械的'], '基準と違い、時間 0 で一瞬で出て一瞬で消える', '頻繁に出る通知や、動きを入れない方針の画面', 'none', { duration: 0, hold: 2500 })
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
  return Object.entries(params).map(([k, v]) => [
    LABELS[k] || k,
    Array.isArray(v) ? v.join(' / ') + ' ms'
      : MS_KEYS.has(k) ? `${v}ms`
      : (k === 'x' || k === 'y') ? `${v}%`
      : k === 'from' ? FROM_LABELS[v] || String(v)
      : String(v)
  ]);
}

/* コピー用 JSON（WAAPI の keyframes と options）。stagger / delays は要素ごとの追加遅延 */
export function toWaapiJson(variant, tracks) {
  return JSON.stringify({ id: variant.id, name: variant.name, tracks }, null, 2);
}

export const ALL_TAGS = [...new Set(COMPARE_GROUPS.flatMap(g => g.variants.flatMap(v => v.tags)))];
