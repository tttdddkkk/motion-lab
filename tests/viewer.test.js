/* ビューア（index.html と motions/viewer.js）の基本操作の検証。
   ビューアは ES Modules でビルド工程がないため、ローカルの静的サーバーで配信し、
   Chromium で実際に開いて操作する。Storybook のストーリーは、モーション単体の動きを検証するもので、
   一覧・フィルタ・速度・タブ・モード切り替えなどのビューアの画面操作は、このテストが担う。

   ブラウザの場所を変えるとき（例: 標準の場所にダウンロードできない環境）は、
   環境変数 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH に実行ファイルのパスを指定する */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { chromium } from 'playwright';
import { MOTIONS } from '../motions/motions.js';
import { COMPARE_GROUPS } from '../motions/compare.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain' };

/** @type {import('node:http').Server} */
let server;
/** @type {import('playwright').Browser} */
let browser;
let base = '';

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0]);
    const file = join(ROOT, normalize(path === '/' ? '/index.html' : path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  base = `http://127.0.0.1:${address.port}`;

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  browser = await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : {});
}, 30000);

/** @type {import('playwright').BrowserContext[]} */
let contexts = [];

/* テストが途中の expect で失敗しても、開いたコンテキストを確実に閉じる */
afterEach(async () => {
  await Promise.all(contexts.map(context => context.close()));
  contexts = [];
});

afterAll(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(() => resolve(undefined)));
});

/* ページを開いて、コンソールのエラーを集める。errors が空であることも、各テストの検証に含める */
const DESKTOP = { width: 1100, height: 900 };
const PHONE = { width: 390, height: 760 };

async function openViewer(hash = '', viewport = DESKTOP) {
  const context = await browser.newContext({ viewport });
  contexts.push(context);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`${base}/index.html${hash}`);
  // #compare を直接開いたときは #list が隠れるので、見えるかでなく DOM にあるかで待つ
  await page.waitForSelector('#list button', { state: 'attached' });
  return { page, errors };
}

/* 詳細の見出しがそのモーションで、一覧で選ばれているのがちょうど1つであること */
async function expectSelected(page, motion) {
  await expect(page.locator('#title').textContent()).resolves.toBe(motion.name);
  await expect(page.locator('#list button[aria-current="true"]').count()).resolves.toBe(1);
}

const first = MOTIONS[0];
const second = MOTIONS[1];

describe('ビューア', { timeout: 30000 }, () => {
  test('一覧にすべてのモーションが出て、先頭が選ばれている', async () => {
    const { page, errors } = await openViewer();
    await expect(page.locator('#list button').count()).resolves.toBe(MOTIONS.length);
    await expectSelected(page, first);
    expect(errors).toEqual([]);
  });

  test('URL の #<id> で、そのモーションが最初に開く。存在しない id は先頭を開く', async () => {
    const target = MOTIONS[MOTIONS.length - 1];
    const a = await openViewer(`#${target.id}`);
    await expect(a.page.locator('#title').textContent()).resolves.toBe(target.name);
    expect(a.errors).toEqual([]);

    const b = await openViewer('#no-such-motion');
    await expect(b.page.locator('#title').textContent()).resolves.toBe(first.name);
  });

  test('詳細に、感触・用途・時間・何の時間・イージングが出る', async () => {
    const { page } = await openViewer(`#${second.id}`);
    const facts = (await page.locator('#facts').textContent()) ?? '';
    for (const text of [second.feel, second.use, `${second.ms}ms`, second.msLabel, second.easing]) {
      expect(facts, text).toContain(text);
    }
  });

  test('カテゴリで絞り込める。「すべて」で戻る', async () => {
    const { page, errors } = await openViewer();
    for (const [label, cat] of [['ボタン', 'button'], ['通知', 'notice'], ['テキスト', 'text']]) {
      await page.locator('#filters button', { hasText: label }).click();
      await expect(page.locator('#list button').count(), label).resolves.toBe(MOTIONS.filter(m => m.cat === cat).length);
      await expect(page.locator('#filters [aria-pressed="true"]').textContent(), label).resolves.toBe(label);
    }
    await page.locator('#filters button', { hasText: 'すべて' }).click();
    await expect(page.locator('#list button').count()).resolves.toBe(MOTIONS.length);
    expect(errors).toEqual([]);
  });

  test('再生速度を変えると、時間に実際の時間と元の時間が出る', async () => {
    const { page } = await openViewer(`#${second.id}`);
    await page.locator('#speed button', { hasText: '2×' }).click();
    await expect(page.locator('#speed [aria-pressed="true"]').textContent()).resolves.toBe('2×');
    const facts = (await page.locator('#facts').textContent()) ?? '';
    expect(facts).toContain(`${Math.round(second.ms / 2)}ms（2×・元は ${second.ms}ms）`);
    await page.locator('#speed button', { hasText: '1×' }).click();
    await expect(page.locator('#facts').textContent()).resolves.not.toContain('元は');
  });

  test('コードのタブで、CSS・WAAPI・動きを減らす場合が切り替わる。コピーできる', async () => {
    const { page, errors } = await openViewer(`#${second.id}`);
    for (const [label, key] of [['WAAPI', 'waapi'], ['動きを減らす場合', 'reduced'], ['CSS', 'css']]) {
      await page.locator('#tabs button', { hasText: label }).click();
      await expect(page.locator('#code').textContent(), label).resolves.toBe(second.code[key]);
    }
    await page.locator('#copy').click();
    // コピーは非同期（clipboard.writeText の完了後にボタンの表示が変わる）
    await expect.poll(() => page.locator('#copy').textContent()).toBe('コピーしました');
    await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toBe(second.code.css);
    expect(errors).toEqual([]);
  });

  test('一覧のクリックと矢印キーでモーションを切り替え、URL の # も変わる', async () => {
    const { page, errors } = await openViewer();
    await page.locator('#list button').nth(2).click();
    await expect(page.locator('#title').textContent()).resolves.toBe(MOTIONS[2].name);
    await expect(page.evaluate(() => location.hash)).resolves.toBe(`#${MOTIONS[2].id}`);

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#title').textContent()).resolves.toBe(MOTIONS[3].name);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#title').textContent()).resolves.toBe(MOTIONS[1].name);
    expect(errors).toEqual([]);
  });

  test('ページを開いたまま # を変えると追従する。存在しない id は無視する', async () => {
    const { page, errors } = await openViewer();
    const target = MOTIONS[4];
    await page.evaluate(id => { location.hash = `#${id}`; }, target.id);
    await expect(page.locator('#title').textContent()).resolves.toBe(target.name);

    // hashchange は非同期。ビューアより後に登録したリスナーは、ビューアのハンドラが走り終えてから呼ばれるので、
    // それを待ってから判定する（待たずに「変わっていない」を見ると、ハンドラが走る前に通ってしまう）
    await page.evaluate(() => new Promise(resolve => {
      addEventListener('hashchange', () => setTimeout(resolve, 0), { once: true });
      location.hash = '#no-such-motion';
    }));
    await expectSelected(page, target);
    expect(errors).toEqual([]);   // 無効な id を処理しようとして例外になっていない
  });

  test('差分比較に切り替えると、比較が出てモーションが隠れる。戻るとモーションが作り直される', async () => {
    const { page, errors } = await openViewer(`#${second.id}`);
    await page.locator('#mode button', { hasText: '差分比較' }).click();
    await page.waitForSelector('.cmp-card');
    const variants = COMPARE_GROUPS.reduce((n, g) => n + g.variants.length, 0);
    await expect(page.locator('.cmp-card').count()).resolves.toBe(variants);
    await expect(page.locator('#viewer').isHidden()).resolves.toBe(true);
    await expect(page.locator('#compare').isVisible()).resolves.toBe(true);
    await expect(page.evaluate(() => location.hash)).resolves.toBe('#compare');
    await expect(page.locator('#stage > *').count()).resolves.toBe(0);   // 隠れたモーションを動かし続けない

    await page.locator('#mode button', { hasText: 'モーション' }).click();
    await expect(page.locator('#viewer').isVisible()).resolves.toBe(true);
    await expect(page.locator('#title').textContent()).resolves.toBe(second.name);
    await expect(page.locator('#stage > *').count()).resolves.toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('#compare を直接開くと、差分比較が出る', async () => {
    const { page, errors } = await openViewer('#compare');
    await page.waitForSelector('.cmp-card');
    await expect(page.locator('#viewer').isHidden()).resolves.toBe(true);
    expect(errors).toEqual([]);
  });

  test('再生中に再生し直しても、コンソールにエラーが出ない（中断は正常な動きとして扱う）', async () => {
    // シーク付きのモーションは、再生のたびに前のアニメーションを cancel する。その中断が、エラーとして出てはいけない
    const { page, errors } = await openViewer('#flow-seek');
    for (let i = 0; i < 3; i++) {
      await page.locator('#play').click();
      await page.waitForTimeout(100);
    }
    await page.locator('#speed button', { hasText: '2×' }).click();   // 速度を変えると、再生し直される
    await page.waitForTimeout(100);
    expect(errors).toEqual([]);
  });

  test('すべてのモーションを素早く切り替えても、コンソールにエラーが出ない（再生し直しの中断を除く）', async () => {
    const { page, errors } = await openViewer();
    for (let i = 0; i < MOTIONS.length; i++) {
      await page.locator('#list button').nth(i).click();
      await page.waitForTimeout(80);
    }
    await expect(page.locator('#title').textContent()).resolves.toBe(MOTIONS[MOTIONS.length - 1].name);
    expect(errors).toEqual([]);
  });

  test('広い画面: サイドバーは画面の高さに収まり、中だけをスクロールできる。ページを送っても残る', async () => {
    const { page, errors } = await openViewer();
    const aside = page.locator('aside');
    const size = await aside.evaluate(el => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(size.client).toBeLessThanOrEqual(DESKTOP.height);
    expect(size.scroll).toBeGreaterThan(size.client);   // 一覧が画面より長い（デモの前提）
    // サイドバーの中を一番下まで送る。ページ自体は動かず、プレビューは元の位置のまま
    const stageBefore = await page.locator('#stage').boundingBox();
    await aside.hover();
    await page.mouse.wheel(0, 5000);
    await expect.poll(() => aside.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect(page.evaluate(() => scrollY)).resolves.toBe(0);
    expect(await page.locator('#stage').boundingBox()).toEqual(stageBefore);
    // 最後のモーションが画面内に見えて、選べる
    const lastBox = await page.locator('#list button').last().boundingBox();
    expect(lastBox && lastBox.y + lastBox.height).toBeLessThanOrEqual(DESKTOP.height);
    await page.locator('#list button').last().click();
    await expectSelected(page, MOTIONS[MOTIONS.length - 1]);
    // ページを下へ送っても、サイドバーは画面の上端に残る
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const asideBox = await aside.boundingBox();
    expect(Math.abs(asideBox?.y ?? 99)).toBeLessThan(1);
    expect(errors).toEqual([]);
  });

  test('スマホ幅: 一覧を下までスクロールしても、プレビューが画面内に残り、選ぶとすぐ切り替わる', async () => {
    const { page, errors } = await openViewer('', PHONE);
    const last = MOTIONS[MOTIONS.length - 1];
    await page.locator('#list button').last().scrollIntoViewIfNeeded();
    const box = await page.locator('#preview').boundingBox();
    expect(box && box.y).toBeGreaterThanOrEqual(0);
    expect(box && box.y + box.height).toBeLessThanOrEqual(PHONE.height / 2 + 100);   // 画面の半分強まで。一覧の見える範囲を残す
    await page.locator('#list button').last().click();
    await expectSelected(page, last);
    const after = await page.locator('#stage').boundingBox();
    expect(after && after.y).toBeGreaterThanOrEqual(0);   // 選んだあとも、スクロールせずにプレビューが見えている
    expect(errors).toEqual([]);
  });

  test('スマホ幅: 一覧を折りたためる。広い画面では見出しも「原寸」も出ない', async () => {
    const { page } = await openViewer('', PHONE);
    await expect(page.locator('#list').isVisible()).resolves.toBe(true);
    await page.locator('#nav > summary').click();
    await expect(page.locator('#list').isVisible()).resolves.toBe(false);
    await page.locator('#nav > summary').click();
    await expect(page.locator('#list').isVisible()).resolves.toBe(true);

    const desktop = await openViewer();
    await expect(desktop.page.locator('#nav > summary').isVisible()).resolves.toBe(false);
    await expect(desktop.page.locator('#full').isVisible()).resolves.toBe(false);
  });

  test('スマホ幅: 「原寸」で実寸に拡大し、閉じる・Esc・URL での画面切り替えで戻る', async () => {
    const { page, errors } = await openViewer('', PHONE);
    const phoneWidth = async () => Math.round((await page.locator('.phone').boundingBox())?.width ?? 0);
    const small = await phoneWidth();
    expect(small).toBeLessThan(200);

    await page.locator('#full').click();
    await expect(phoneWidth()).resolves.toBe(260);
    await page.locator('#full-close').click();
    await expect(phoneWidth()).resolves.toBe(small);

    await page.locator('#full').click();
    await page.keyboard.press('Escape');
    await expect(phoneWidth()).resolves.toBe(small);

    await page.locator('#full').click();
    await page.evaluate(() => { location.hash = '#compare'; });   // 原寸表示中はボタンが覆われるので、URL の変更で画面を切り替える
    await page.locator('#compare').waitFor({ state: 'visible' });
    await expect(page.locator('html').evaluate(el => getComputedStyle(el).overflow)).resolves.not.toBe('hidden');   // スクロールが固定されたままにならない
    expect(errors).toEqual([]);
  });

  test('スマホ幅（縮小表示）でも、リップルはタップした位置から広がる', async () => {
    const { page } = await openViewer('#ripple', PHONE);
    await page.locator('#loop').uncheck();
    const btn = page.locator('#stage .demo-btn');
    const box = await btn.boundingBox();
    if (!box) throw new Error('ボタンが見つからない');
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5);
    const center = await page.evaluate(() => {
      const dot = [...document.querySelectorAll('#stage .ripple')].pop();
      if (!(dot instanceof HTMLElement)) return null;
      return parseFloat(dot.style.left) + parseFloat(dot.style.width) / 2;
    });
    const width = await btn.evaluate(el => /** @type {HTMLElement} */ (el).offsetWidth);
    expect(center).not.toBeNull();
    expect(Math.abs(/** @type {number} */ (center) - width * 0.9)).toBeLessThan(3);   // ボタン本来の座標（縮小前）で 90% の位置
  });

  test('スマホ幅: 差分比較に切り替えると、モーションのプレビュー・詳細・コード・一覧が隠れる', async () => {
    // スマホ幅では #viewer などを display: contents にしている。hidden 属性が効かなくなっていないことを確かめる
    const { page, errors } = await openViewer('#compare', PHONE);
    await page.locator('#compare').waitFor({ state: 'visible' });
    for (const selector of ['#viewer', '#preview', '#viewer > header', '#facts', '.codebox', '#nav']) {
      await expect(page.locator(selector).isVisible(), selector).resolves.toBe(false);
    }
    await page.locator('#mode button', { hasText: 'モーション' }).click();
    for (const selector of ['#preview', '#facts', '.codebox', '#nav']) {
      await expect(page.locator(selector).isVisible(), selector).resolves.toBe(true);
    }
    await expect(page.locator('#compare').isVisible()).resolves.toBe(false);
    expect(errors).toEqual([]);
  });

  describe('カスタマイズ', () => {
    const layerNames = page => page.locator('.cus-layer strong').allTextContents();

    test('切り替えると編集画面が出て、モーションが隠れる。#custom を直接開いても出る', async () => {
      const { page, errors } = await openViewer();
      await page.locator('#mode button', { hasText: 'カスタマイズ' }).click();
      await page.waitForSelector('.cus-layer');
      await expect(page.locator('#custom').isVisible()).resolves.toBe(true);
      await expect(page.locator('#viewer, #compare').evaluateAll(els => els.every(el => /** @type {HTMLElement} */ (el).hidden))).resolves.toBe(true);
      await expect(page.evaluate(() => location.hash.startsWith('#custom'))).resolves.toBe(true);
      await page.locator('#mode button', { hasText: 'モーション' }).click();
      await expect(page.locator('#custom').isHidden()).resolves.toBe(true);
      expect(errors).toEqual([]);

      const direct = await openViewer('#custom');
      await direct.page.waitForSelector('.cus-layer');
      await expect(direct.page.locator('#viewer').isHidden()).resolves.toBe(true);
      expect(direct.errors).toEqual([]);
    });

    test('効果の追加・削除・並べ替え・出発点で、一覧とコードと URL が変わる', async () => {
      const { page, errors } = await openViewer('#custom');
      await page.waitForSelector('.cus-layer');
      const before = await layerNames(page);
      expect(before.length).toBeGreaterThan(0);

      await page.locator('[data-add-effect="rotate"]').click();
      await expect(layerNames(page)).resolves.toEqual([...before, '回転']);
      await expect(page.locator('[data-code]').textContent()).resolves.toContain('rotate(');
      await expect(page.evaluate(() => location.hash)).resolves.toContain('rotate,');
      await expect(page.locator('[data-add-effect="rotate"]').count()).resolves.toBe(0);   // 同じ効果は1回まで

      await page.locator('.cus-layer:last-child [data-act="up"]').click();
      await expect(layerNames(page).then(n => n[n.length - 2])).resolves.toBe('回転');
      await page.locator('.cus-layer:has(strong:text("回転")) [data-act="remove"]').click();
      await expect(layerNames(page)).resolves.toEqual(before);

      await page.locator('[data-preset="pop"]').click();
      await expect(layerNames(page)).resolves.toEqual(['フェード', '拡大縮小']);
      await page.locator('.cus-layer [data-act="remove"]').first().click();
      await page.locator('.cus-layer [data-act="remove"]').first().click();
      await expect(page.locator('.cus-empty').isVisible()).resolves.toBe(true);
      expect(errors).toEqual([]);
    });

    test('スライダーで値を変えると、表示・コード・タイムラインが追従し、再生が実際に動く', async () => {
      const { page, errors } = await openViewer('#custom=fade,400,0,ease-out,');
      await page.waitForSelector('.cus-layer');
      await page.locator('[data-f="duration"]').fill('800');
      await expect(page.locator('[data-out="duration"]').textContent()).resolves.toBe('800ms');
      await expect(page.locator('[data-code]').textContent()).resolves.toContain('duration: 800');
      await expect(page.locator('[data-total]').textContent()).resolves.toContain('800ms');
      await page.locator('[data-tab="json"]').click();
      await expect(page.locator('[data-code]').textContent().then(t => JSON.parse(t ?? '').layers[0].duration)).resolves.toBe(800);

      await page.locator('[data-play]').click();
      await expect(page.evaluate(() => document.querySelector('[data-t="subject"]')?.getAnimations().length)).resolves.toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });

    test('URL の # から組み合わせを復元する。壊れた値でも落ちず、既定の組み合わせになる', async () => {
      const ok = await openViewer('#custom=@sparkle;blur,300,40,linear,radius:12;scale,450,0,spring,from:0.8');
      await ok.page.waitForSelector('.cus-layer');
      await expect(layerNames(ok.page)).resolves.toEqual(['ぼかし', '拡大縮小']);
      await expect(ok.page.locator('.cus-layer [data-f="p:radius"]').first().inputValue()).resolves.toBe('12');
      await expect(ok.page.locator('.cus-sparkle').count()).resolves.toBe(1);   // @sparkle で対象も復元される
      expect(ok.errors).toEqual([]);

      const broken = await openViewer('#custom=%E0%A4%A');
      await broken.page.waitForSelector('.cus-layer');
      await expect(layerNames(broken.page).then(n => n.length)).resolves.toBeGreaterThan(0);
      expect(broken.errors).toEqual([]);

      // 開いたまま # だけが変わったときも追従する
      await ok.page.evaluate(() => { location.hash = '#custom=fade,200,0,linear,'; });
      await expect.poll(() => layerNames(ok.page)).toEqual(['フェード']);
    });

    test('対象を切り替えると、動かす要素が替わり、URL にも残る', async () => {
      const { page, errors } = await openViewer('#custom');
      await page.waitForSelector('.cus-layer');
      for (const [id, selector] of [['sparkle', '.cus-sparkle'], ['button', '.demo-btn'], ['card', '.cus-card']]) {
        await page.locator(`[data-subject="${id}"]`).click();
        await expect(page.locator(`[data-stage] ${selector}[data-t="subject"]`).count(), id).resolves.toBe(1);
        await expect(page.evaluate(() => location.hash), id).resolves.toContain(`@${id}`);
      }
      expect(errors).toEqual([]);
    });

    test('並べ替え・削除・追加・切り替えのあとも、フォーカスが操作した場所に残る', async () => {
      const { page, errors } = await openViewer('#custom=@card;fade,400,0,ease-out,;slide-y,500,0,ease-out,distance:24;blur,400,0,ease-out,radius:8');
      await page.waitForSelector('.cus-layer');
      // どのボタンにいるかを、見出し（部品名）と data-act で表す
      const focused = () => page.evaluate(() => {
        const el = /** @type {HTMLElement} */ (document.activeElement);
        const li = el.closest('[data-idx]');
        return { act: el.dataset.act ?? el.dataset.f ?? el.dataset.subject ?? el.dataset.preset ?? el.dataset.tab ?? el.tagName, layer: li?.querySelector('strong')?.textContent ?? null };
      });
      const layer = name => page.locator('.cus-layer', { has: page.locator('strong', { hasText: name }) });

      await layer('縦スライド').locator('[data-act="down"]').focus();
      await page.keyboard.press('Enter');
      // 末尾に着いて ↓ は押せなくなる。フォーカスは body に落ちず、同じ部品の ↑ に移る
      await expect(layer('縦スライド').locator('[data-act="down"]').isDisabled()).resolves.toBe(true);
      await expect(focused()).resolves.toEqual({ act: 'up', layer: '縦スライド' });
      await page.keyboard.press('Enter');
      await expect(focused()).resolves.toEqual({ act: 'up', layer: '縦スライド' });   // 動かした部品に付いていく（押し続けられる）
      await expect(page.locator('.cus-layer strong').allTextContents()).resolves.toEqual(['フェード', '縦スライド', 'ぼかし']);

      await layer('ぼかし').locator('[data-act="remove"]').focus();
      await page.keyboard.press('Enter');
      expect((await focused()).act).toBe('remove');   // 消した部品の隣の「削除」へ

      await page.locator('[data-add-effect="rotate"]').focus();
      await page.keyboard.press('Enter');
      await expect(focused()).resolves.toEqual({ act: 'duration', layer: '回転' });   // 追加した部品の最初の入力欄

      await page.locator('[data-subject="sparkle"]').focus();
      await page.keyboard.press('Enter');
      await expect(focused()).resolves.toMatchObject({ act: 'sparkle' });
      await page.locator('[data-preset="pop"]').focus();
      await page.keyboard.press('Enter');
      await expect(focused()).resolves.toMatchObject({ act: 'pop' });
      await page.locator('[data-tab="json"]').focus();
      await page.keyboard.press('Enter');
      await expect(focused()).resolves.toMatchObject({ act: 'json' });
      expect(errors).toEqual([]);
    });

    test('出力の切り替えはトグルボタンで（role=tab にしない）、タイムラインは文字でも読める', async () => {
      const { page, errors } = await openViewer('#custom=@card;fade,400,50,ease-out,');
      await page.waitForSelector('.cus-layer');
      await expect(page.locator('[data-tabs] [role="tab"]').count()).resolves.toBe(0);
      await expect(page.locator('[data-tab="waapi"]').getAttribute('aria-pressed')).resolves.toBe('true');
      await page.locator('[data-tab="json"]').click();
      await expect(page.locator('[data-tab="json"]').getAttribute('aria-pressed')).resolves.toBe('true');
      await expect(page.locator('[data-timeline]').textContent()).resolves.toContain('50ms から 450ms まで');
      await expect(page.locator('[data-timeline] .cus-track').getAttribute('aria-hidden')).resolves.toBe('true');
      expect(errors).toEqual([]);
    });

    test('出発点は、どの対象でも選べる。選んでも対象は変わらず、対象を替えても部品は引き継がれる', async () => {
      const { page, errors } = await openViewer('#custom');
      await page.waitForSelector('.cus-layer');
      const presets = () => page.locator('[data-preset]').count();
      const all = await presets();
      await page.locator('[data-subject="sparkle"]').click();
      await expect(presets()).resolves.toBe(all);   // 対象で絞り込まない
      await page.locator('[data-preset="rise"]').click();
      await expect(page.locator('.cus-sparkle').count()).resolves.toBe(1);   // 対象は切り替わらない
      await expect(page.evaluate(() => location.hash)).resolves.toContain('@sparkle');

      await page.locator('[data-preset="rainbow"]').click();
      const names = await layerNames(page);
      await page.locator('[data-subject="card"]').click();
      await expect(layerNames(page)).resolves.toEqual(names);   // 対象を替えても、重ねた部品はそのまま
      await expect(page.locator('.cus-card').count()).resolves.toBe(1);
      expect(errors).toEqual([]);
    });

    test('揺れの細かい設定（方向・回数・減衰・質感）が、コードと動きに反映される', async () => {
      const { page, errors } = await openViewer('#custom');
      await page.waitForSelector('.cus-layer');
      await page.locator('[data-preset="wobble"]').click();
      await expect(layerNames(page)).resolves.toEqual(['揺れ']);
      await expect(page.locator('.cus-layer [data-f="easing"]').count()).resolves.toBe(0);   // 揺れはイージングを選ばせない
      await page.locator('[data-f="p:axis"]').selectOption({ label: '縦' });
      await page.locator('[data-f="p:count"]').fill('4');
      await page.locator('[data-f="p:feel"]').selectOption({ label: 'カクカク' });
      const code = await page.locator('[data-code]').textContent();
      expect(code).toContain('translateY(');
      expect(code).not.toContain('translateX(');
      expect(code?.match(/easing: 'linear'/g)?.length).toBeGreaterThanOrEqual(5);   // キーフレームごとの質感
      await expect(page.evaluate(() => location.hash)).resolves.toMatch(/axis:1\|amplitude:\d+\|count:4\|decay:40\|feel:1/);
      await page.locator('[data-play]').click();
      const frames = await page.evaluate(() => /** @type {KeyframeEffect} */ (document.querySelector('[data-t="subject"]')?.getAnimations()[0].effect).getKeyframes().length);
      expect(frames).toBe(4 + 2);
      expect(errors).toEqual([]);
    });

    test('opacity を動かす部品（フェードとブリンク）は同時に追加できず、理由が出る', async () => {
      const { page, errors } = await openViewer('#custom=@card;blink,600,0,linear,count:3');
      await page.waitForSelector('.cus-layer');
      await expect(page.locator('[data-add-effect="fade"]').count()).resolves.toBe(0);
      await expect(page.locator('[data-conflict]').textContent()).resolves.toContain('フェード');
      await page.locator('.cus-layer [data-act="remove"]').click();
      await expect(page.locator('[data-add-effect="fade"]').count()).resolves.toBe(1);
      await expect(page.locator('[data-conflict]').isHidden()).resolves.toBe(true);
      expect(errors).toEqual([]);
    });

    test('ぼかしと色変化は filter を重ねて両方かかる（composite: add）。バウンスと拡大縮小の transform も打ち消し合わない', async () => {
      const { page, errors } = await openViewer('#custom=@sparkle;blur,1000,0,linear,radius:20;hue,1000,0,linear,angle:180;bounce,1000,0,linear,height:40|count:1|decay:0|squash:0;scale,1000,0,linear,from:2');
      await page.waitForSelector('.cus-layer');
      await page.locator('[data-play]').click();
      await page.waitForTimeout(250);
      const style = await page.evaluate(() => {
        const el = /** @type {HTMLElement} */ (document.querySelector('[data-t="subject"]'));
        for (const a of el.getAnimations()) a.pause();   // 途中の見た目で止めて、合成された値を読む
        const cs = getComputedStyle(el);
        const m = new DOMMatrix(cs.transform);
        return { filter: cs.filter, ty: m.m42, sx: m.a };
      });
      expect(style.filter).toMatch(/blur/);
      expect(style.filter).toMatch(/hue-rotate/);
      expect(style.ty).toBeLessThan(-1);   // バウンスで上がっている
      expect(style.sx).toBeGreaterThan(1.05);   // 拡大縮小も効いている（2倍から戻る途中）
      expect(errors).toEqual([]);
    });

    test('スマホ幅: 切り替えるとモーションの UI が隠れ、編集画面が見える', async () => {
      const { page, errors } = await openViewer('#custom', PHONE);
      await page.locator('#custom').waitFor({ state: 'visible' });
      for (const selector of ['#viewer', '#preview', '.codebox:not(#custom .codebox)', '#nav']) {
        await expect(page.locator(selector).first().isVisible(), selector).resolves.toBe(false);
      }
      await expect(page.locator('.cus-preview').isVisible()).resolves.toBe(true);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);   // 横にはみ出さない
      expect(errors).toEqual([]);
    });
  });
});
