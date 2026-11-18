import { MOTIONS, makeCtx } from './motions.js';
import { q } from './dom.js';

/* ============================================================
   ビューア本体
   ============================================================ */
const $ = id => q(document, `#${id}`);
const reducedBox = /** @type {HTMLInputElement} */ ($('reduced'));
const loopBox = /** @type {HTMLInputElement} */ ($('loop'));

/** @type {[string, string][]} */
const CATS = [['all', 'すべて'], ['button', 'ボタン'], ['transition', '画面遷移'], ['comment', 'コメント'], ['notice', '通知'], ['expand', '展開'], ['text', 'テキスト']];
const SPEEDS = [0.5, 1, 2];
/** @type {['css' | 'waapi' | 'reduced', string][]} */
const TABS = [['css', 'CSS'], ['waapi', 'WAAPI'], ['reduced', '動きを減らす場合']];
/** @type {['viewer' | 'compare', string][]} */
const MODES = [['viewer', 'モーション'], ['compare', '差分比較']];

/* URL の #<id> を取り出す（PR のプレビュー確認用に、最初に開くモーションを指定できる）。壊れた % エスケープなら空文字 */
function idFromHash() {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
}

const hashId = idFromHash();
const initialId = MOTIONS.some(m => m.id === hashId) ? hashId : MOTIONS[0].id;

/** @type {'viewer' | 'compare'} */
let mode = location.hash === '#compare' ? 'compare' : 'viewer';
/** @type {{ cat: string, id: string, rate: number, tab: 'css' | 'waapi' | 'reduced', runId: number, instance: import('./types.js').MotionInstance | null }} */
const state = { cat: 'all', id: initialId, rate: 1, tab: 'css', runId: 0, instance: null };

const ctx = makeCtx({
  rate: () => state.rate,
  reduced: () => reducedBox.checked
});

const current = () => {
  const motion = MOTIONS.find(m => m.id === state.id);
  if (!motion) throw new Error(`MOTIONS に id "${state.id}" がない`);
  return motion;
};
const visible = () => MOTIONS.filter(m => state.cat === 'all' || m.cat === state.cat);

/**
 * 押されている1つが aria-pressed になるボタン群を、container に作り直す。
 * @template K
 * @param {HTMLElement} container
 * @param {[K, string][]} items  [キー, 表示名]
 * @param {(key: K) => boolean} isPressed
 * @param {(key: K) => unknown} onPick
 * @param {string} [className]
 */
function renderButtons(container, items, isPressed, onPick, className = '') {
  container.innerHTML = '';
  items.forEach(([key, label]) => {
    const b = document.createElement('button');
    if (className) b.className = className;
    b.textContent = label;
    b.setAttribute('aria-pressed', String(isPressed(key)));
    b.onclick = () => onPick(key);
    container.appendChild(b);
  });
}

function renderFilters() {
  renderButtons($('filters'), CATS, key => state.cat === key, key => { state.cat = key; renderFilters(); renderList(); }, 'chip');
}

function renderList() {
  $('list').innerHTML = '';
  $('nav-count').textContent = `${visible().length}件`;
  visible().forEach(m => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.innerHTML = `${m.name}<span class="meta">${m.feel} ・ ${m.ms}ms</span>`;
    if (m.id === state.id) b.setAttribute('aria-current', 'true');
    b.onclick = () => select(m.id);
    li.appendChild(b); $('list').appendChild(li);
  });
}

function renderSpeed() {
  renderButtons($('speed'), SPEEDS.map(s => [s, s + '×']), rate => state.rate === rate, rate => {
    state.rate = rate; renderSpeed(); renderInfo(); play();
  });
}

function renderTabs() {
  renderButtons($('tabs'), TABS, key => state.tab === key, key => { state.tab = key; renderTabs(); renderCode(); });
}

function renderMode() {
  renderButtons($('mode'), MODES, key => mode === key, setMode);
}

function renderCode() {
  $('code').textContent = current().code[state.tab];
}

/* 再生速度を反映した実際の時間。1× のときは元の値だけを出す */
function durationText(ms) {
  if (state.rate === 1) return `${ms}ms`;
  return `${Math.round(ms / state.rate)}ms（${state.rate}×・元は ${ms}ms）`;
}

function renderInfo() {
  const m = current();
  $('title').textContent = m.name;
  $('now').textContent = m.name;
  $('desc').textContent = m.desc;
  $('facts').innerHTML = `
    <dt>感触</dt><dd>${m.feel}</dd>
    <dt>用途</dt><dd>${m.use}</dd>
    <dt>時間</dt><dd>${durationText(m.ms)}</dd>
    <dt>何の時間</dt><dd>${m.msLabel}</dd>
    <dt>イージング</dt><dd><code>${m.easing}</code></dd>`;
}

/** @param {string} id */
function select(id) {
  state.id = id;
  if (mode === 'viewer') history.replaceState(null, '', '#' + encodeURIComponent(id));
  state.runId++;
  state.instance = current().setup($('stage'), ctx);
  renderList(); renderInfo(); renderCode();
  play();
}

async function play() {
  const my = ++state.runId;
  if (!state.instance) return;
  try {
    await state.instance.run();
  } catch (e) {
    // 再生し直しでアニメーションが cancel されたときの AbortError は、正常な中断。それ以外は握りつぶさない
    if (!(e instanceof DOMException && e.name === 'AbortError')) console.error(e);
    return;
  }
  if (my !== state.runId) return;
  if (loopBox.checked) {
    await new Promise(r => setTimeout(r, 500));
    if (my === state.runId && loopBox.checked) play();
  }
}

$('play').onclick = play;

/* スマホ幅の「原寸」表示。プレビューを画面全体に重ねる（見た目は viewer.css の .is-full） */
const preview = $('preview');
const phoneFit = $('phone-fit');
/** @param {boolean} on */
function setFull(on) {
  if (preview.classList.contains('is-full') === on) return;
  preview.classList.toggle('is-full', on);
  if (on) {
    phoneFit.setAttribute('role', 'dialog');
    phoneFit.setAttribute('aria-modal', 'true');
    phoneFit.setAttribute('aria-label', '原寸プレビュー');
  } else {
    phoneFit.removeAttribute('role');
    phoneFit.removeAttribute('aria-modal');
    phoneFit.removeAttribute('aria-label');
  }
  if (mode === 'viewer') $(on ? 'full-close' : 'full').focus();
}
$('full').onclick = () => setFull(true);
$('full-close').onclick = () => setFull(false);
$('full-play').onclick = play;
phoneFit.onclick = e => { if (e.target === phoneFit) setFull(false); }; /* 暗い背景をタップで閉じる */

/* 一覧は、スマホ幅では折りたためる。広い画面では見出しを出さないので、常に開いておく */
const narrow = matchMedia('(max-width: 820px)');
const syncNarrow = () => {
  if (!narrow.matches) { /** @type {HTMLDetailsElement} */ ($('nav')).open = true; setFull(false); }
};
narrow.addEventListener('change', syncNarrow);
loopBox.onchange = () => { if (loopBox.checked) play(); else state.runId++; };
reducedBox.onchange = play;
$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('code').textContent ?? '');
    $('copy').textContent = 'コピーしました';
  } catch { $('copy').textContent = '失敗'; }
  setTimeout(() => $('copy').textContent = 'コピー', 1200);
};
document.addEventListener('keydown', e => {
  const target = /** @type {HTMLElement} */ (e.target);
  if (e.key === 'Escape') setFull(false);
  if (mode !== 'viewer' || target.matches('input, textarea')) return;
  const list = visible(); const i = list.findIndex(m => m.id === state.id);
  /* ボタンの上では Space を横取りしない（モーション内の一時停止ボタンなどを押せるように） */
  if (e.code === 'Space' && !target.closest('button')) { e.preventDefault(); play(); }
  if (e.key === 'ArrowRight' && list[i + 1]) select(list[i + 1].id);
  if (e.key === 'ArrowLeft' && list[i - 1]) select(list[i - 1].id);
});

/* 表示の切り替え（モーション / 差分比較） */
let compareLoaded = false;

/** @param {'viewer' | 'compare'} next */
async function setMode(next) {
  state.runId++; /* モーションのループ再生を止める */
  setFull(false);
  mode = next;
  $('nav').hidden = mode !== 'viewer';
  $('viewer').hidden = mode !== 'viewer';
  $('compare').hidden = mode !== 'compare';
  $('filters').hidden = $('list').hidden = mode !== 'viewer';
  $('cmp-nav').hidden = mode !== 'compare';
  renderMode();
  if (mode === 'compare') {
    $('stage').replaceChildren(); /* 非表示のモーションを動かし続けない（戻ったときに作り直す） */
    state.instance = null;
    history.replaceState(null, '', '#compare');
    if (!compareLoaded) {
      compareLoaded = true;
      try {
        const { mountCompare } = await import('./compare-ui.js');
        mountCompare({ root: $('compare'), nav: $('cmp-nav') });
      } catch (e) {
        console.error(e);
        compareLoaded = false;
        $('compare').textContent = '差分比較を読み込めませんでした。';
      }
    }
  } else {
    select(state.id);
  }
}

/* ページを開いたまま # だけが変わった場合（再読み込みされない）にも追従する */
window.addEventListener('hashchange', () => {
  if (location.hash === '#compare') { if (mode !== 'compare') setMode('compare'); return; }
  const id = idFromHash();
  if (!MOTIONS.some(m => m.id === id)) return;
  if (mode !== 'viewer') setMode('viewer');
  if (id !== state.id) select(id);
});

renderFilters(); renderSpeed(); renderTabs(); renderMode();
select(state.id);
if (mode === 'compare') setMode('compare');
