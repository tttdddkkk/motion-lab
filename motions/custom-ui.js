/* カスタマイズビューの描画。データとロジックは custom.js、再生は player.js */
import { EASING_PRESETS } from './compare.js';
import {
  PRESETS, SUBJECTS, EFFECTS, DEFAULT_SUBJECT, DURATION_RANGE, DELAY_RANGE, effectOf, makeLayer, addableEffects, moveLayer,
  totalMs, timeline, buildCustomTracks, encodeLayers, decodeLayers, toCustomWaapi, toCustomJson
} from './custom.js';
import { q } from './dom.js';
import { esc, REDUCED_NOTICE_HTML, bindReducedGate, playTracks } from './player.js';

/* params は入れ子なので、出発点を編集しても元の PRESETS が変わらないよう、コピーして使う */
const cloneLayers = layers => layers.map(l => ({ ...l, params: { ...l.params } }));

/** @type {['waapi' | 'json', string][]} */
const TABS = [['waapi', 'WAAPI'], ['json', 'JSON']];

/* 動かす対象。どれも動かす要素に data-t="subject" を付ける（再生は player.js の playTracks） */
const STAGE_HTML = {
  card: `<div class="cus-card" data-t="subject">
    <div class="cus-card-img"></div><h4>保存しました</h4><div class="cus-card-row"></div><div class="cus-card-row short"></div></div>`,
  sparkle: '<div class="cus-sparkle" data-t="subject"></div>',
  button: '<button type="button" tabindex="-1" class="demo-btn" data-t="subject">購入する</button>'
};
const stageHtml = subject => `<div class="cmp-center">${STAGE_HTML[subject] ?? STAGE_HTML[DEFAULT_SUBJECT]}</div>`;

const rangeHtml = (field, label, value, range, unit) => `
  <label>${esc(label)}: <output data-out="${field}">${value}${unit}</output>
    <input type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}" data-f="${field}" data-unit="${esc(unit)}" aria-label="${esc(label)}"></label>`;

const selectHtml = (field, label, options, value) => `
  <label>${esc(label)}
    <select data-f="${field}" aria-label="${esc(label)}">${options.map(([text, v]) =>
      `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;

/* 設定項目1つの入力欄（数値はスライダー、選択肢はセレクト） */
const paramHtml = (spec, value) => (spec.options
  ? selectHtml(`p:${spec.key}`, spec.label, spec.options.map((text, i) => [text, i]), value)
  : rangeHtml(`p:${spec.key}`, spec.label, value, spec, spec.unit ?? ''));

/**
 * @param {{ root: HTMLElement }} options
 * @returns {{ syncFromHash: () => void }}
 */
export function mountCustom({ root }) {
  /** @type {{ subject: string, layers: import('./types.js').CustomLayer[], tab: 'waapi' | 'json' }} */
  const state = { subject: PRESETS[0].subject, layers: cloneLayers(PRESETS[0].layers), tab: 'waapi' };

  root.innerHTML = `
    <div class="cus-top">
      <header>
        <h1>カスタマイズ</h1>
        <p class="desc">動かす対象に、動きの部品を重ねて自分の動きを作る。部品ごとの細かい設定ができ、コードと共有 URL が出る。</p>
      </header>
      ${REDUCED_NOTICE_HTML}
    </div>
    <div class="cus-layout">
      <section class="cus-preview" aria-label="プレビュー">
        <div class="cmp-phone cus-phone"><div class="cmp-stage" data-stage></div></div>
        <div class="cus-play">
          <button type="button" class="play" data-play>▶ 再生</button>
          <span class="cus-total" data-total></span>
        </div>
      </section>
      <section class="cus-editor">
        <div class="cus-row"><span class="label">対象:</span><span class="cus-chips" data-subjects></span></div>
        <div class="cus-row"><span class="label">出発点:</span><span class="cus-chips" data-presets></span></div>
        <ol class="cus-layers" data-layers></ol>
        <div class="cus-row"><span class="label">部品を追加:</span><span class="cus-chips" data-add></span></div>
        <p class="cus-note" data-conflict hidden></p>
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
  const outputText = () => {
    const tracks = buildCustomTracks(state.layers);
    return state.tab === 'json' ? toCustomJson(state.layers, tracks, state.subject) : toCustomWaapi(tracks);
  };

  /** 構造が変わらない更新（スライダーの操作中）。入力欄は作り直さない */
  function refreshSummary() {
    q(root, '[data-total]').textContent = state.layers.length ? `全体 ${totalMs(state.layers)}ms` : '';
    q(root, '[data-code]').textContent = outputText();
    q(root, '[data-timeline]').innerHTML = timeline(state.layers).map(bar =>
      `<div class="cus-bar-row"><span>${esc(effectOf(bar.effect)?.name ?? bar.effect)}</span>`
      + `<span class="cus-track"><i style="left:${bar.left}%;width:${bar.width}%"></i></span></div>`).join('');
    history.replaceState(null, '', encodeLayers(state.layers, state.subject));
  }

  const layerHtml = (layer, i) => {
    const e = /** @type {import('./types.js').CustomEffect} */ (effectOf(layer.effect));
    const btn = (act, text, label, disabled = false) =>
      `<button type="button" class="cmp-btn-sub" data-act="${act}" aria-label="${esc(e.name)}を${label}"${disabled ? ' disabled' : ''}>${text}</button>`;
    const easing = e.ownEasing
      ? '<p class="cus-note">弾み・揺れ方は、この効果の中で決めています（easing は選べません）</p>'
      : selectHtml('easing', 'easing', EASING_PRESETS, layer.easing);
    return `<li class="cus-layer" data-idx="${i}">
      <div class="cus-layer-head">
        <strong>${esc(e.name)}</strong><span class="cus-feel">${esc(e.feel)}</span>
        <span class="cus-layer-btns">
          ${btn('up', '↑', '上へ', i === 0)}${btn('down', '↓', '下へ', i === state.layers.length - 1)}${btn('remove', '削除', '削除')}
        </span>
      </div>
      <div class="cus-fields">
        ${rangeHtml('duration', 'duration', layer.duration, DURATION_RANGE, 'ms')}
        ${rangeHtml('delay', 'delay', layer.delay, DELAY_RANGE, 'ms')}
        ${e.params.map(spec => paramHtml(spec, layer.params[spec.key])).join('')}
        ${easing}
      </div>
    </li>`;
  };

  /** 構造が変わる更新（対象・追加・削除・並べ替え・出発点）。一覧を作り直す */
  function render() {
    q(root, '[data-layers]').innerHTML = state.layers.length
      ? state.layers.map(layerHtml).join('')
      : '<li class="cus-empty">部品がありません。下から追加するか、出発点を選んでください。</li>';
    const addable = addableEffects(state.layers);
    q(root, '[data-add]').innerHTML = addable.map(e =>
      `<button type="button" class="chip" data-add-effect="${e.id}">＋ ${esc(e.name)}</button>`).join('')
      || '<span class="cus-note">すべての部品を使っています</span>';
    /* 使っていないのに追加できない部品がある = opacity の競合 */
    const blocked = EFFECTS.filter(e => !addable.includes(e) && !state.layers.some(l => l.effect === e.id));
    const conflict = q(root, '[data-conflict]');
    conflict.hidden = !blocked.length;
    conflict.textContent = blocked.length ? `${blocked.map(e => e.name).join('・')}は、使用中の部品と同じ opacity を動かすため、同時には使えません。` : '';
    q(root, '[data-subjects]').innerHTML = SUBJECTS.map(x =>
      `<button type="button" class="chip" data-subject="${x.id}" aria-pressed="${state.subject === x.id}">${esc(x.name)}</button>`).join('');
    q(root, '[data-presets]').innerHTML = PRESETS.map(p =>
      `<button type="button" class="chip" data-preset="${p.id}" title="${esc(p.use)}">${esc(p.name)}</button>`).join('');
    q(root, '[data-tabs]').innerHTML = TABS.map(([key, label]) =>
      `<button type="button" role="tab" data-tab="${key}" aria-pressed="${state.tab === key}">${label}</button>`).join('');
    stage.innerHTML = stageHtml(state.subject);
    refreshSummary();
  }

  const restructure = () => { render(); autoPlay(); };

  /* ---- 操作 ---- */
  const layerOf = el => {
    const li = el.closest('[data-idx]');
    return li ? state.layers[Number(/** @type {HTMLElement} */ (li).dataset.idx)] : undefined;
  };

  /** 入力欄 field（duration / delay / easing / p:<設定名>）の値を layer に反映する。範囲外は収められる */
  function setField(layer, field, value) {
    const next = field.startsWith('p:')
      ? makeLayer({ ...layer, params: { ...layer.params, [field.slice(2)]: Number(value) } })
      : makeLayer({ ...layer, [field]: field === 'easing' ? value : Number(value) });
    if (next) Object.assign(layer, next);
  }

  root.addEventListener('input', e => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const layer = layerOf(el);
    const field = el.dataset.f;
    if (!layer || !field || el.type !== 'range') return;
    setField(layer, field, el.value);
    const out = el.closest('label')?.querySelector('[data-out]');
    const shown = field.startsWith('p:') ? layer.params[field.slice(2)] : layer[field];
    if (out) out.textContent = `${shown}${el.dataset.unit ?? ''}`;
    refreshSummary();
  });

  root.addEventListener('change', e => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const layer = layerOf(el);
    const field = el.dataset.f;
    if (!layer || !field) return;
    if (el.tagName === 'SELECT') { setField(layer, field, el.value); refreshSummary(); }
    autoPlay();   // スライダーは離したとき、セレクトは選んだときに再生し直す
  });

  root.addEventListener('click', async e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b || !root.contains(b)) return;
    const { act, addEffect, preset, tab, subject } = b.dataset;
    const layer = layerOf(b);
    const index = state.layers.indexOf(/** @type {any} */ (layer));
    if (act === 'remove') { state.layers = state.layers.filter(l => l !== layer); restructure(); }
    else if (act === 'up' || act === 'down') { state.layers = moveLayer(state.layers, index, act === 'up' ? -1 : 1); restructure(); }
    else if (addEffect) {
      const next = makeLayer({ effect: addEffect });
      if (next) { state.layers = [...state.layers, next]; restructure(); }
    } else if (preset) {
      const p = PRESETS.find(x => x.id === preset);
      if (p) { state.subject = p.subject; state.layers = cloneLayers(p.layers); restructure(); }
    } else if (subject) { state.subject = subject; restructure(); }
    else if (tab === 'waapi' || tab === 'json') { state.tab = tab; render(); }
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
    const decoded = decodeLayers(location.hash);
    state.subject = decoded?.subject ?? PRESETS[0].subject;
    state.layers = decoded?.layers ?? cloneLayers(PRESETS[0].layers);
    render();
    autoPlay();
  }
  syncFromHash();
  return { syncFromHash };
}
