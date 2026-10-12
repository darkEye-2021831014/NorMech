/**
 * Lightweight smoke check for the brand + progress map work.
 *
 * Loads `/` and `/annotate` at 1280x720, asserts the visible
 * elements render, and writes two screenshots to
 * `test-results/smoke/`. Run only as a single pass — no loops,
 * no exhaustive viewport matrix.
 *
 * Run with:
 *   docker compose run --rm e2e sh -c \
 *     './node_modules/.bin/playwright test tests/e2e/smoke-icons.spec.ts'
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

type Seed = {
  datasetId: string;
  accessKey: string;
  imageIds: string[];
};

function loadSeed(): Seed {
  const p = process.env.SEED_FILE || path.resolve('tests/.seed.json');
  if (!fs.existsSync(p)) {
    throw new Error(`Missing seed file at ${p}.`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Seed;
}

async function stubImageProxy(page: Page, seed: Seed) {
  const fixtures = seed.imageIds.map((id, i) => ({
    id,
    file: path.resolve(`tests/fixtures/e2e-image-${String(i + 1).padStart(2, '0')}.png`),
  }));
  await page.route('**/api/image/**', async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/').filter(Boolean);
    const imageId = parts[parts.length - 1];
    const match = fixtures.find((f) => f.id === imageId);
    if (!match) {
      await route.fulfill({ status: 502, body: 'no fixture' });
      return;
    }
    const body = await fs.promises.readFile(match.file);
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'Content-Length': String(body.byteLength) },
      body,
    });
  });
}

async function loginAnnotator(page: Page, accessKey: string, name: string) {
  await page.goto('/annotate/login');
  await page.getByLabel('Access key').fill(accessKey);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: /enter|opening/i }).click();
  await page.waitForURL(/\/annotate(\?|$)/, { timeout: 15_000 });
}

async function dismissGuidelinesIfPresent(page: Page) {
  const beginBtn = page.getByRole('button', { name: /begin annotating|^close$/i });
  if (await beginBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await beginBtn.click();
  }
}

async function waitForFirstImage(page: Page) {
  const wrapper = page.locator('[data-testid="annotator-image"]').first();
  await expect(wrapper).toHaveAttribute('data-loaded', 'true', { timeout: 8_000 });
  await expect(page.locator('img[alt^="Image for annotation"]').first()).toBeVisible({
    timeout: 8_000,
  });
}

const RUN_SUFFIX = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe('Brand + progress map smoke (1280x720)', () => {
  test('landing: brand visible, both entrance cards inside viewport', async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      // 1) The new <Logo> SVG must be present and visible.
      const logos = page.locator('header svg[aria-hidden="true"]');
      await expect(logos.first()).toBeVisible({ timeout: 5_000 });

      // 2) The "Marginalia" wordmark must be visible in the top bar.
      await expect(
        page.getByRole('link', { name: /Marginalia home/i })
      ).toBeVisible({ timeout: 5_000 });

      // 3) The favicon link must point at the new icon.
      const faviconHref = await page.evaluate(() => {
        const link = document.querySelector(
          'link[rel="icon"][type="image/svg+xml"]'
        ) as HTMLLinkElement | null;
        return link ? link.href : null;
      });
      expect(faviconHref, 'favicon <link rel="icon"> href').toContain('/icon.svg');
      expect(faviconHref, 'favicon ?v=2 cache-bust').toContain('v=2');

      // 4) Both entrance cards inside the viewport.
      const annotatorLink = page.getByRole('link', { name: /^Annotator$/i });
      const adminLink = page.getByRole('link', { name: /^Admin$/i });
      await expect(annotatorLink).toBeVisible({ timeout: 5_000 });
      await expect(adminLink).toBeVisible({ timeout: 5_000 });
      const inside = await page.evaluate(() => {
        const va = window.innerHeight;
        const get = (sel: string) => {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return {
          annotator: get('a[href="/annotate"]'),
          admin: get('a[href="/admin"]'),
          annotatorInside: (() => {
            const a = document.querySelector('a[href="/annotate"]') as HTMLElement | null;
            return !!a && a.getBoundingClientRect().bottom <= va && a.getBoundingClientRect().top >= 0;
          })(),
          adminInside: (() => {
            const a = document.querySelector('a[href="/admin"]') as HTMLElement | null;
            return !!a && a.getBoundingClientRect().bottom <= va && a.getBoundingClientRect().top >= 0;
          })(),
        };
      });
      expect(inside.annotatorInside, `Annotator not inside viewport (${JSON.stringify(inside.annotator)})`).toBe(true);
      expect(inside.adminInside, `Admin not inside viewport (${JSON.stringify(inside.admin)})`).toBe(true);

      // Screenshot.
      const out = path.resolve('test-results/smoke', 'landing-1280x720.png');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out, fullPage: false });
      // eslint-disable-next-line no-console
      console.log(`landing -> ${out}`);
    } finally {
      await ctx.close();
    }
  });

  test('annotator: brand, choices, progress map visible at 1280x720', async ({ browser }) => {
    test.setTimeout(60_000);
    const seed = loadSeed();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stubImageProxy(page, seed);
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await loginAnnotator(page, seed.accessKey, `e2e-smoke-icons-${RUN_SUFFIX}`);
      await dismissGuidelinesIfPresent(page);
      await waitForFirstImage(page);

      // 1) The <Logo> + "Marginalia — Annotator" wordmark in the
      //    annotator chrome.
      const logos = page.locator('header svg[aria-hidden="true"]');
      await expect(logos.first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText('— Annotator', { exact: false })).toBeVisible();

      // 2) All four choice cards inside the viewport.
      const radios = page.getByRole('radio', { name: /text|image|both|none/i });
      await expect(radios).toHaveCount(4);
      for (let i = 0; i < 4; i++) {
        await expect(radios.nth(i)).toBeVisible({ timeout: 5_000 });
      }

      // 3) The progress map renders at least one tile.
      const map = page.locator('[data-testid="progress-map"]');
      await expect(map).toBeVisible({ timeout: 5_000 });
      const tileCount = await page.evaluate(() => {
        return document.querySelectorAll('[data-testid="progress-map"] [role="listitem"]').length;
      });
      expect(tileCount).toBeGreaterThan(0);
      // eslint-disable-next-line no-console
      console.log(`progress map tiles: ${tileCount}`);

      // 4) Map inside the viewport (and its bounding box intersects
      //    the viewport).
      const mapInfo = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="progress-map"]') as HTMLElement | null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      expect(mapInfo).not.toBeNull();
      const va = 720;
      expect(
        mapInfo!.y + mapInfo!.height <= va && mapInfo!.y >= 0,
        `progress map not fully inside viewport (rect=${JSON.stringify(mapInfo)})`
      ).toBe(true);

      // Screenshot.
      const out = path.resolve('test-results/smoke', 'annotator-1280x720.png');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out, fullPage: false });
      // eslint-disable-next-line no-console
      console.log(`annotator -> ${out}`);
    } finally {
      await ctx.close();
    }
  });
});
