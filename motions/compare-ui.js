/* 差分比較ビューの描画。データは compare.js、ここはそれを描画して再生するだけ */
import {
  COMPARE_GROUPS, SECTIONS, PAIR_SECTION, ALL_TAGS, EASING_PRESETS,
  buildTracks, formatParams, toWaapiJson
} from './compare.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* 「どれを指している？」の選択肢の記号（A, B, C） */
const LETTERS = 'ABC';
const isPair = group => group.section === PAIR_SECTION;
const rowsHtml = n => Array.from({ length: n }, () => '<div class="row"></div>').join('');

const STAGE_HTML = {
  button: v => `<div class="cmp-center"><button type="button" tabindex="-1" class="demo-btn cmp-btn${v.mode === 'sink' ? ' is-sink' : ''}" data-t="btn">購入する<span class="ripple" data-t="ripple"></span></button></div>`,
  screens: () => `<div class="screen a" data-t="outgoing"><h3>画面 A</h3>${rowsHtml(4)}</div>`
    + `<div class="screen b is-idle" data-t="incoming"><h3>画面 B</h3><div class="hero" data-i></div><div class="row" data-i></div><div class="row" data-i></div></div>`,
  box: () => '<div class="cmp-center"><div class="cmp-box" data-t="box"><span></span><span></span></div></div>',
  list: () => `<div class="cmp-center cmp-listwrap">${'<div class="cmp-item" data-i></div>'.repeat(5)}</div>`,
  toast: v => `<div class="screen a"><h3>画面</h3>${rowsHtml(4)}</div>`
    + `<div class="cmp-toast is-idle" data-t="toast" data-from="${v.params.from || 'bottom'}"><i></i>保存しました</div>`,
  origin: v => `<div class="screen a"><h3>画面 A</h3><button type="button" tabindex="-1" class="demo-btn cmp-anchor">ボタン</button></div>`
    + `<div class="screen b is-idle" data-t="reveal"><h3>画面 B</h3><div class="hero"></div></div>`
    + `<i class="cmp-mark" style="left:${v.params.x}%;top:${v.params.y}%"></i>`
};

const clipSupported = () => {
  try { return CSS.supports('clip-path', 'circle(0% at 50% 50%)'); } catch { return false; }
};

/**
 * 画面に出している1枚のカード（1バリアント）の状態。
 * @typedef {object} Card
 * @property {import('./types.js').CompareGroup} group
 * @property {import('./types.js').CompareVariant} variant
 * @property {HTMLElement} el
 * @property {HTMLElement} stage
 * @property {{ duration?: number, easing?: string }} over  調整 UI で上書きした値
 * @property {() => void} [refresh]  パラメータ表示を、調整後の値で更新する
 */

export function mountCompare({ root, nav }) {
  /** @type {{ tag: string | null, override: Map<string, unknown>, cards: Card[] }} */
  const state = { tag: null, override: new Map(), cards: [] };
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let forcePlay = false;
  const suppressed = () => mq.matches && !forcePlay;

  const tagButtons = ['すべて', ...ALL_TAGS].map(t =>
    `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="${t === 'すべて'}">${esc(t)}</button>`).join('');

  const groupHtml = g => `
    <section class="cmp-group" id="cmp-${g.id}" data-group="${g.id}">
      <div class="cmp-head-row">
        <h3>${esc(g.title)}</h3>
        <button type="button" class="cmp-btn-sub" data-all="${g.id}">全て同時再生</button>
      </div>
      <p class="cmp-axis">${esc(g.axis)}</p>
      ${isPair(g) ? `
      <fieldset class="cmp-pick"><legend>どれを指している？</legend>
        ${g.variants.map((v, i) => `<label><input type="radio" name="pick-${g.id}" data-group="${g.id}" value="${i}"> ${LETTERS[i]}</label>`).join('')}
        <p class="cmp-picked" data-picked="${g.id}" aria-live="polite">未選択</p>
      </fieldset>` : ''}
      <div class="cmp-grid">${g.variants.map((v, i) => cardHtml(g, v, i)).join('')}</div>
    </section>`;

  const cardHtml = (g, v, i) => `
    <article class="cmp-card${v.base ? ' is-base' : ''}" data-v="${v.id}">
      <div class="cmp-phone"><div class="cmp-stage" data-stage>${STAGE_HTML[g.stage](v)}</div></div>
      <div class="cmp-idrow">
        ${isPair(g) ? `<span class="cmp-letter">${LETTERS[i]}</span>` : ''}
        <code class="cmp-id">${v.id}</code>
        ${v.base ? '<span class="cmp-badge base">基準</span>' : ''}
        ${v.subtle ? `<span class="cmp-badge subtle">微差</span>` : ''}
      </div>
      <h4>${esc(v.name)}</h4>
      <div class="cmp-tags">${v.tags.map(t => `<span class="cmp-tag">${esc(t)}</span>`).join('')}</div>
      <p class="cmp-diff">${v.base ? '基準' : esc(v.diff)}${v.subtle ? `（${esc(v.subtle)}）` : ''}</p>
      <p class="cmp-use">使いどころ: ${esc(v.use)}</p>
      <dl class="cmp-params" data-params></dl>
      <p class="cmp-note" data-note hidden></p>
      <div class="cmp-actions">
        <button type="button" class="play" data-play>▶ 再生</button>
        <button type="button" class="copy" data-copy>パラメータをコピー</button>
      </div>
      <details class="cmp-tune"${v.mode === 'none' ? ' hidden' : ''}><summary>調整（duration / easing）</summary>
        <div class="cmp-tune-body">
          <label>duration: <output data-dur-out></output>
            <input type="range" min="50" max="1200" step="10" data-dur aria-label="duration"></label>
          <label>easing
            <select data-ease aria-label="easing"></select></label>
          <button type="button" class="cmp-btn-sub" data-reset>元に戻す</button>
        </div>
      </details>
    </article>`;

  root.innerHTML = `
    <div class="cmp-top">
      <header>
        <h1>差分比較</h1>
        <p class="desc">口頭で伝わりにくい違いを、実物で並べて確認する。基準から1つの軸だけを変えている。</p>
      </header>
      <div class="cmp-notice" data-notice hidden role="status">
        この端末は「動きを減らす」設定（prefers-reduced-motion）が有効なため、再生を止めています。
        <label><input type="checkbox" data-force> このページだけ再生する</label>
      </div>
      <div class="cmp-tags-bar"><span class="label">印象ワード:</span>${tagButtons}</div>
    </div>
    ${SECTIONS.map(s => `
      <div class="cmp-section" data-section="${s.id}">
        <header>
          <div class="cmp-head-row"><h2>${esc(s.title)}</h2>
            <button type="button" class="cmp-btn-sub" data-all-section="${s.id}">このセクションを全て同時再生</button></div>
          <p class="cmp-lead">${esc(s.lead)}</p>
        </header>
        ${COMPARE_GROUPS.filter(g => g.section === s.id).map(groupHtml).join('')}
      </div>`).join('')}`;

  nav.innerHTML = SECTIONS.map(s =>
    `<li><button type="button" data-jump-section="${s.id}"><strong>${esc(s.title)}</strong></button></li>`
    + COMPARE_GROUPS.filter(g => g.section === s.id).map(g =>
      `<li><button type="button" data-jump="${g.id}">${esc(g.title)}</button></li>`).join('')).join('');

  /* ---- カードの状態 ---- */
  for (const group of COMPARE_GROUPS) {
    for (const variant of group.variants) {
      const el = root.querySelector(`[data-v="${variant.id}"]`);
      const card = { group, variant, el, stage: el.querySelector('[data-stage]'), over: {} };
      state.cards.push(card);
      const dur = el.querySelector('[data-dur]');
      const ease = el.querySelector('[data-ease]');
      const original = variant.params.easing;
      const presets = EASING_PRESETS.some(([, v]) => v === original) ? EASING_PRESETS : [[`元の値（${original}）`, original], ...EASING_PRESETS];
      ease.innerHTML = presets.map(([label, value]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');
      ease.value = original;
      dur.value = variant.params.duration;
      const refresh = () => {
        const { params } = buildTracks(group, variant, card.over);
        el.querySelector('[data-params]').innerHTML = formatParams(params).map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join('');
        el.querySelector('[data-dur-out]').textContent = `${params.duration}ms`;
      };
      card.refresh = refresh;
      dur.oninput = () => { card.over.duration = Number(dur.value); refresh(); };
      ease.onchange = () => { card.over.easing = ease.value; refresh(); };
      el.querySelector('[data-reset]').onclick = () => {
        card.over = {}; dur.value = variant.params.duration; ease.value = original; refresh();
      };
      el.querySelector('[data-play]').onclick = () => play(card);
      el.querySelector('[data-copy]').onclick = async e => {
        const btn = e.currentTarget;
        const { tracks } = buildTracks(group, variant, card.over);
        try { await navigator.clipboard.writeText(toWaapiJson(variant, tracks)); btn.textContent = 'コピーしました'; }
        catch { btn.textContent = '失敗'; }
        setTimeout(() => { btn.textContent = 'パラメータをコピー'; }, 1200);
      };
      if (group.needs === 'clip-path' && !clipSupported()) {
        const note = el.querySelector('[data-note]');
        note.hidden = false;
        note.textContent = 'このブラウザは clip-path のアニメーションに未対応の可能性があります。';
      }
      refresh();
    }
  }

  /* ---- 再生 ---- */
  function reset(stage) {
    [stage, ...stage.querySelectorAll('*')].forEach(el => el.getAnimations().forEach(a => a.cancel()));
  }

  function play(card) {
    if (suppressed()) { flashNotice(); return Promise.resolve(); }
    const { stage, group, variant } = card;
    reset(stage);
    stage.querySelectorAll('.is-idle').forEach(el => el.classList.remove('is-idle'));
    const { tracks } = buildTracks(group, variant, card.over);
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

  const visibleCards = scope => state.cards.filter(c => !c.el.hidden && scope(c));
  const playAll = scope => visibleCards(scope).forEach(c => play(c));

  /* ---- 動きを減らす設定 ---- */
  const notice = root.querySelector('[data-notice]');
  const flashNotice = () => { notice.hidden = false; notice.scrollIntoView({ block: 'nearest' }); };
  root.querySelector('[data-force]').onchange = e => { forcePlay = e.target.checked; };
  mq.addEventListener?.('change', () => { notice.hidden = !mq.matches; });
  notice.hidden = !mq.matches;

  /* ---- 絞り込み・ジャンプ・選択 ---- */
  function applyFilter() {
    for (const c of state.cards) c.el.hidden = !!state.tag && !c.variant.tags.includes(state.tag);
    root.querySelectorAll('.cmp-group').forEach(g => { g.hidden = !g.querySelector('.cmp-card:not([hidden])'); });
    root.querySelectorAll('.cmp-section').forEach(s => { s.hidden = !s.querySelector('.cmp-group:not([hidden])'); });
  }
  root.querySelectorAll('[data-tag]').forEach(b => {
    b.onclick = () => {
      state.tag = b.dataset.tag === 'すべて' ? null : b.dataset.tag;
      root.querySelectorAll('[data-tag]').forEach(x => x.setAttribute('aria-pressed', (x.dataset.tag === 'すべて' ? !state.tag : x.dataset.tag === state.tag)));
      applyFilter();
    };
  });
  root.querySelectorAll('[data-all]').forEach(b => { b.onclick = () => playAll(c => c.group.id === b.dataset.all); });
  root.querySelectorAll('[data-all-section]').forEach(b => { b.onclick = () => playAll(c => c.group.section === b.dataset.allSection); });
  root.querySelectorAll('input[type="radio"]').forEach(r => {
    r.onchange = () => {
      const gid = r.dataset.group;
      const g = COMPARE_GROUPS.find(x => x.id === gid);
      if (!g) return;
      const v = g.variants[Number(r.value)];
      root.querySelector(`[data-picked="${gid}"]`).textContent = `選択: ${LETTERS[Number(r.value)]}「${v.name}」`;
    };
  });
  nav.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.dataset.jump ? `cmp-${b.dataset.jump}` : null;
    const target = id ? root.querySelector(`#${id}`) : root.querySelector(`[data-section="${b.dataset.jumpSection}"]`);
    target?.scrollIntoView({ behavior: mq.matches ? 'auto' : 'smooth', block: 'start' });
  };
}
