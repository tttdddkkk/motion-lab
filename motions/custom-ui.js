/* カスタマイズビューの描画。データとロジックは custom.js、再生は player.js */
import { EASING_PRESETS } from './compare.js';
import {
  PRESETS, DURATION_RANGE, DELAY_RANGE, effectOf, makeLayer, addableEffects, moveLayer,
  totalMs, timeline, buildCustomTracks, encodeLayers, decodeLayers, toCustomWaapi, toCustomJson
} from './custom.js';
import { q } from './dom.js';
import { esc, REDUCED_NOTICE_HTML, bindReducedGate, playTracks } from './player.js';

/** @type {['waapi' | 'json', string][]} */
const TABS = [['waapi', 'WAAPI'], ['json', 'JSON']];

const STAGE_HTML = `<div class="cmp-center"><div class="cus-card" data-t="card">
  <div class="cus-card-img"></div><h4>保存しました</h4><div class="cus-card-row"></div><div class="cus-card-row short"></div>
</div></div>`;

const rangeHtml = (field, label, value, range, unit) => `
  <label>${esc(label)}: <output data-out="${field}">${value}${unit}</output>
    <input type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}" data-f="${field}" aria-label="${esc(label)}"></label>`;

/**
 * @param {{ root: HTMLElement }} options
 * @returns {{ syncFromHash: () => void }}
 */
export function mountCustom({ root }) {
  /** @type {{ layers: import('./types.js').CustomLayer[], tab: 'waapi' | 'json' }} */
  const state = { layers: PRESETS[0].layers, tab: 'waapi' };

  root.innerHTML = `
    <div class="cus-top">
      <header>
        <h1>カスタマイズ</h1>
        <p class="desc">効果を重ねて、自分の動きを作る。時間・遅れ・イージング・量を決めると、コードと共有 URL ができる。</p>
      </header>
      ${REDUCED_NOTICE_HTML}
    </div>
    <div class="cus-layout">
      <section class="cus-preview" aria-label="プレビュー">
        <div class="cmp-phone cus-phone"><div class="cmp-stage" data-stage>${STAGE_HTML}</div></div>
        <div class="cus-play">
          <button type="button" class="play" data-play>▶ 再生</button>
          <span class="cus-total" data-total></span>
        </div>
      </section>
      <section class="cus-editor">
        <div class="cus-row"><span class="label">出発点:</span><span class="cus-chips" data-presets></span></div>
        <ol class="cus-layers" data-layers></ol>
        <div class="cus-row"><span class="label">効果を追加:</span><span class="cus-chips" data-add></span></div>
        <div class="cus-timeline" data-timeline role="img" aria-label="各効果の開始と長さ"></div>
        <section class="codebox">
          <div class="codehead">
            <div class="seg" data-tabs role="tablist"></div>
            <span class="cus-copies">
              <button type="button" class="copy" data-share>共有URLをコピー</button>
              <button type="button" class="copy" data-copy>コピー</button>
            </span>
          </div>
          <pre><code data-code></code></pre>
        </section>
      </section>
    </div>`;

  const stage = q(root, '[data-stage]');
  const gate = bindReducedGate(root);

  /* ---- 再生 ---- */
  const play = () => playTracks(stage, buildCustomTracks(state.layers));
  /** 操作に合わせた再生。「動きを減らす」で止めているときは黙って何もしない */
  const autoPlay = () => { if (!gate.suppressed()) play(); };
  q(root, '[data-play]').onclick = () => { if (gate.suppressed()) gate.flash(); else play(); };

  /* ---- 表示の更新 ---- */
  const outputText = () => (state.tab === 'json'
    ? toCustomJson(state.layers, buildCustomTracks(state.layers))
    : toCustomWaapi(buildCustomTracks(state.layers)));

  /** 構造が変わらない更新（スライダーの操作中）。入力欄は作り直さない */
  function refreshSummary() {
    q(root, '[data-total]').textContent = state.layers.length ? `全体 ${totalMs(state.layers)}ms` : '';
    q(root, '[data-code]').textContent = outputText();
    q(root, '[data-timeline]').innerHTML = timeline(state.layers).map(bar =>
      `<div class="cus-bar-row"><span>${esc(effectOf(bar.effect)?.name ?? bar.effect)}</span>`
      + `<span class="cus-track"><i style="left:${bar.left}%;width:${bar.width}%"></i></span></div>`).join('');
    history.replaceState(null, '', encodeLayers(state.layers));
  }

  const layerHtml = (layer, i) => {
    const e = /** @type {import('./types.js').CustomEffect} */ (effectOf(layer.effect));
    const easings = EASING_PRESETS.map(([label, value]) =>
      `<option value="${esc(value)}"${value === layer.easing ? ' selected' : ''}>${esc(label)}</option>`).join('');
    return `<li class="cus-layer" data-idx="${i}">
      <div class="cus-layer-head">
        <strong>${esc(e.name)}</strong><span class="cus-feel">${esc(e.feel)}</span>
        <span class="cus-layer-btns">
          <button type="button" class="cmp-btn-sub" data-act="up" aria-label="${esc(e.name)}を上へ"${i === 0 ? ' disabled' : ''}>↑</button>
          <button type="button" class="cmp-btn-sub" data-act="down" aria-label="${esc(e.name)}を下へ"${i === state.layers.length - 1 ? ' disabled' : ''}>↓</button>
          <button type="button" class="cmp-btn-sub" data-act="remove" aria-label="${esc(e.name)}を削除">削除</button>
        </span>
      </div>
      <div class="cus-fields">
        ${rangeHtml('duration', 'duration', layer.duration, DURATION_RANGE, 'ms')}
        ${rangeHtml('delay', 'delay', layer.delay, DELAY_RANGE, 'ms')}
        ${e.param ? rangeHtml('amount', e.param.label, layer.amount ?? e.param.value, e.param, e.param.unit) : ''}
        <label>easing <select data-f="easing" aria-label="easing">${easings}</select></label>
      </div>
    </li>`;
  };

  /** 構造が変わる更新（追加・削除・並べ替え・出発点）。一覧を作り直す */
  function render() {
    const list = q(root, '[data-layers]');
    list.innerHTML = state.layers.length
      ? state.layers.map(layerHtml).join('')
      : '<li class="cus-empty">効果がありません。下から追加するか、出発点を選んでください。</li>';
    q(root, '[data-add]').innerHTML = addableEffects(state.layers).map(e =>
      `<button type="button" class="chip" data-add-effect="${e.id}">＋ ${esc(e.name)}</button>`).join('')
      || '<span class="cus-note">すべての効果を使っています</span>';
    q(root, '[data-presets]').innerHTML = PRESETS.map(p =>
      `<button type="button" class="chip" data-preset="${p.id}" title="${esc(p.use)}">${esc(p.name)}</button>`).join('');
    q(root, '[data-tabs]').innerHTML = TABS.map(([key, label]) =>
      `<button type="button" role="tab" data-tab="${key}" aria-pressed="${state.tab === key}">${label}</button>`).join('');
    refreshSummary();
  }

  const restructure = () => { render(); autoPlay(); };

  /* ---- 操作 ---- */
  const layerOf = el => {
    const li = el.closest('[data-idx]');
    return li ? state.layers[Number(/** @type {HTMLElement} */ (li).dataset.idx)] : undefined;
  };

  root.addEventListener('input', e => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const layer = layerOf(el);
    const field = el.dataset.f;
    if (!layer || !field || field === 'easing') return;
    const next = makeLayer({ ...layer, [field]: Number(el.value) });
    if (!next) return;
    Object.assign(layer, next);
    const out = el.closest('label')?.querySelector('[data-out]');
    if (out) out.textContent = `${layer[field]}${field === 'amount' ? effectOf(layer.effect)?.param?.unit ?? '' : 'ms'}`;
    refreshSummary();
  });

  root.addEventListener('change', e => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const layer = layerOf(el);
    if (!layer || !el.dataset.f) return;
    if (el.dataset.f === 'easing') {
      const next = makeLayer({ ...layer, easing: el.value });
      if (next) Object.assign(layer, next);
      refreshSummary();
    }
    autoPlay();   // スライダーは離したとき、easing は選んだときに再生し直す
  });

  root.addEventListener('click', async e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b || !root.contains(b)) return;
    const { act, addEffect, preset, tab } = b.dataset;
    const layer = layerOf(b);
    const index = state.layers.indexOf(/** @type {any} */ (layer));
    if (act === 'remove') { state.layers = state.layers.filter(l => l !== layer); restructure(); }
    else if (act === 'up' || act === 'down') { state.layers = moveLayer(state.layers, index, act === 'up' ? -1 : 1); restructure(); }
    else if (addEffect) {
      const next = makeLayer({ effect: addEffect });
      if (next) { state.layers = [...state.layers, next]; restructure(); }
    } else if (preset) {
      const p = PRESETS.find(x => x.id === preset);
      if (p) { state.layers = p.layers.map(l => ({ ...l })); restructure(); }
    } else if (tab === 'waapi' || tab === 'json') { state.tab = tab; render(); }
    else if (b.dataset.copy !== undefined || b.dataset.share !== undefined) {
      const text = b.dataset.share !== undefined ? location.href : outputText();
      const label = b.dataset.label ??= b.textContent ?? '';
      try { await navigator.clipboard.writeText(text); b.textContent = 'コピーしました'; }
      catch { b.textContent = '失敗'; }
      setTimeout(() => { b.textContent = label; }, 1200);
    }
  });

  /* ---- URL ---- */
  function syncFromHash() {
    state.layers = decodeLayers(location.hash) ?? PRESETS[0].layers.map(l => ({ ...l }));
    render();
    autoPlay();
  }
  syncFromHash();
  return { syncFromHash };
}
