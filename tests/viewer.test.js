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
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
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

afterAll(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(() => resolve(undefined)));
});

/* ページを開いて、コンソールのエラーを集める。errors が空であることも、各テストの検証に含める */
async function openViewer(hash = '') {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`${base}/index.html${hash}`);
  // #compare を直接開いたときは #list が隠れるので、見えるかでなく DOM にあるかで待つ
  await page.waitForSelector('#list button', { state: 'attached' });
  return { page, errors, close: () => context.close() };
}

const first = MOTIONS[0];
const second = MOTIONS[1];

describe('ビューア', { timeout: 30000 }, () => {
  test('一覧にすべてのモーションが出て、先頭が選ばれている', async () => {
    const { page, errors, close } = await openViewer();
    await expect(page.locator('#list button').count()).resolves.toBe(MOTIONS.length);
    await expect(page.locator('#title').textContent()).resolves.toBe(first.name);
    await expect(page.locator('#list button[aria-current="true"]').count()).resolves.toBe(1);
    expect(errors).toEqual([]);
    await close();
  });

  test('URL の #<id> で、そのモーションが最初に開く。存在しない id は先頭を開く', async () => {
    const target = MOTIONS[MOTIONS.length - 1];
    const a = await openViewer(`#${target.id}`);
    await expect(a.page.locator('#title').textContent()).resolves.toBe(target.name);
    expect(a.errors).toEqual([]);
    await a.close();

    const b = await openViewer('#no-such-motion');
    await expect(b.page.locator('#title').textContent()).resolves.toBe(first.name);
    await b.close();
  });

  test('詳細に、感触・用途・時間・何の時間・イージングが出る', async () => {
    const { page, close } = await openViewer(`#${second.id}`);
    const facts = (await page.locator('#facts').textContent()) ?? '';
    for (const text of [second.feel, second.use, `${second.ms}ms`, second.msLabel, second.easing]) {
      expect(facts, text).toContain(text);
    }
    await close();
  });

  test('カテゴリで絞り込める。「すべて」で戻る', async () => {
    const { page, errors, close } = await openViewer();
    for (const [label, cat] of [['ボタン', 'button'], ['通知', 'notice'], ['テキスト', 'text']]) {
      await page.locator('#filters button', { hasText: label }).click();
      await expect(page.locator('#list button').count(), label).resolves.toBe(MOTIONS.filter(m => m.cat === cat).length);
      await expect(page.locator('#filters [aria-pressed="true"]').textContent(), label).resolves.toBe(label);
    }
    await page.locator('#filters button', { hasText: 'すべて' }).click();
    await expect(page.locator('#list button').count()).resolves.toBe(MOTIONS.length);
    expect(errors).toEqual([]);
    await close();
  });

  test('再生速度を変えると、時間に実際の時間と元の時間が出る', async () => {
    const { page, close } = await openViewer(`#${second.id}`);
    await page.locator('#speed button', { hasText: '2×' }).click();
    await expect(page.locator('#speed [aria-pressed="true"]').textContent()).resolves.toBe('2×');
    const facts = (await page.locator('#facts').textContent()) ?? '';
    expect(facts).toContain(`${Math.round(second.ms / 2)}ms（2×・元は ${second.ms}ms）`);
    await page.locator('#speed button', { hasText: '1×' }).click();
    await expect(page.locator('#facts').textContent()).resolves.not.toContain('元は');
    await close();
  });

  test('コードのタブで、CSS・WAAPI・動きを減らす場合が切り替わる。コピーできる', async () => {
    const { page, errors, close } = await openViewer(`#${second.id}`);
    for (const [label, key] of [['WAAPI', 'waapi'], ['動きを減らす場合', 'reduced'], ['CSS', 'css']]) {
      await page.locator('#tabs button', { hasText: label }).click();
      await expect(page.locator('#code').textContent(), label).resolves.toBe(second.code[key]);
    }
    await page.locator('#copy').click();
    // コピーは非同期（clipboard.writeText の完了後にボタンの表示が変わる）
    await expect.poll(() => page.locator('#copy').textContent()).toBe('コピーしました');
    await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toBe(second.code.css);
    expect(errors).toEqual([]);
    await close();
  });

  test('一覧のクリックと矢印キーでモーションを切り替え、URL の # も変わる', async () => {
    const { page, errors, close } = await openViewer();
    await page.locator('#list button').nth(2).click();
    await expect(page.locator('#title').textContent()).resolves.toBe(MOTIONS[2].name);
    await expect(page.evaluate(() => location.hash)).resolves.toBe(`#${MOTIONS[2].id}`);

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#title').textContent()).resolves.toBe(MOTIONS[3].name);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#title').textContent()).resolves.toBe(MOTIONS[1].name);
    expect(errors).toEqual([]);
    await close();
  });

  test('ページを開いたまま # を変えると追従する。存在しない id は無視する', async () => {
    const { page, close } = await openViewer();
    const target = MOTIONS[4];
    await page.evaluate(id => { location.hash = `#${id}`; }, target.id);
    await expect(page.locator('#title').textContent()).resolves.toBe(target.name);
    await page.evaluate(() => { location.hash = '#no-such-motion'; });
    await expect(page.locator('#title').textContent()).resolves.toBe(target.name);
    await close();
  });

  test('差分比較に切り替えると、比較が出てモーションが隠れる。戻るとモーションが作り直される', async () => {
    const { page, errors, close } = await openViewer(`#${second.id}`);
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
    await close();
  });

  test('#compare を直接開くと、差分比較が出る', async () => {
    const { page, errors, close } = await openViewer('#compare');
    await page.waitForSelector('.cmp-card');
    await expect(page.locator('#viewer').isHidden()).resolves.toBe(true);
    expect(errors).toEqual([]);
    await close();
  });

  test('再生中に再生し直しても、コンソールにエラーが出ない（中断は正常な動きとして扱う）', async () => {
    // シーク付きのモーションは、再生のたびに前のアニメーションを cancel する。その中断が、エラーとして出てはいけない
    const { page, errors, close } = await openViewer('#flow-seek');
    for (let i = 0; i < 3; i++) {
      await page.locator('#play').click();
      await page.waitForTimeout(100);
    }
    await page.locator('#speed button', { hasText: '2×' }).click();   // 速度を変えると、再生し直される
    await page.waitForTimeout(100);
    expect(errors).toEqual([]);
    await close();
  });

  test('すべてのモーションを素早く切り替えても、コンソールにエラーが出ない（再生し直しの中断を除く）', async () => {
    const { page, errors, close } = await openViewer();
    for (let i = 0; i < MOTIONS.length; i++) {
      await page.locator('#list button').nth(i).click();
      await page.waitForTimeout(80);
    }
    await expect(page.locator('#title').textContent()).resolves.toBe(MOTIONS[MOTIONS.length - 1].name);
    expect(errors).toEqual([]);
    await close();
  });
});
