import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

type Seed = {
  datasetId: string;
  accessKey: string;
  imageIds: string[];
};

/**
 * The five viewports the spec covers. The user explicitly listed
 * 1280x720, 1440x900, 1024x768, 768x1024, and 390x844 — we keep
 * them in the same order and the same numbers so the screenshot
 * filenames are stable.
 */
const VIEWPORTS: { name: string; width: number; height: number }[] = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
];

/**
 * Read the seed file written by tests/seed.mjs via the e2e-run.sh
 * entrypoint. The same file is used by the other specs, so this
 * spec piggybacks on the seed step that already runs.
 */
function loadSeed(): Seed {
  const p = process.env.SEED_FILE || path.resolve('tests/.seed.json');
  if (!fs.existsSync(p)) {
    throw new Error(
      `Missing seed file at ${p}. The e2e-run.sh entrypoint should write it before Playwright runs.`
    );
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Seed;
}

/**
 * Stub the /api/image/* proxy with one of our local fixture PNGs.
 * The mapping is image-id-position → fixture file, the same
 * convention the other specs use.
 */
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
      headers: {
        'Content-Length': String(body.byteLength),
        'Cache-Control': 'private, max-age=86400, must-revalidate',
        ETag: `"e2e-${imageId}"`,
      },
      body,
    });
  });
}

/**
 * Log in to the annotator. Returns once the dashboard is mounted.
 * Uses a per-run suffix so the same seed file can be reused across
 * multiple iterations without colliding with prior users.
 */
async function loginAnnotator(page: Page, accessKey: string, name: string) {
  await page.goto('/annotate/login');
  await page.getByLabel('Access key').fill(accessKey);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: /enter|opening/i }).click();
  await page.waitForURL(/\/annotate(\?|$)/, { timeout: 15_000 });
}

/**
 * Dismiss the first-visit "How to annotate" modal if it's open.
 * On a fresh context (no localStorage), it always shows. The
 * modal's focus trap would otherwise intercept the page-level
 * keyboard events other specs send, but this spec doesn't use
 * keyboard — we still dismiss it so the body of the page is
 * free for our visibility assertions.
 */
async function dismissGuidelinesIfPresent(page: Page) {
  const beginBtn = page.getByRole('button', { name: /begin annotating|^close$/i });
  if (await beginBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await beginBtn.click();
  }
}

/**
 * Wait for the first image to be visible inside the annotator.
 * We want the panel selectors to be on a settled page, not on a
 * half-loaded state.
 */
async function waitForFirstImage(page: Page) {
  const wrapper = page.locator('[data-testid="annotator-image"]').first();
  await expect(wrapper).toHaveAttribute('data-loaded', 'true', { timeout: 8_000 });
  await expect(page.locator('img[alt^="Image for annotation"]').first()).toBeVisible({
    timeout: 8_000,
  });
}

/**
 * Per-run suffix so each test that logs in gets a unique user
 * name. The annotator's "register on first use" behavior would
 * otherwise resume a user from a prior run.
 */
const RUN_SUFFIX = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test.describe('Viewport / no-scroll layout', () => {
  test('landing page (/) fits in viewport at 5 sizes with no vertical overflow', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/');
        // Give fonts and entrance animations a moment to settle.
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);

        // The single hard assertion: no vertical overflow.
        const noOverflow = await page.evaluate(() => {
          return {
            scrollHeight: document.documentElement.scrollHeight,
            innerHeight: window.innerHeight,
          };
        });
        expect(
          noOverflow.scrollHeight,
          `[${vp.name}] scrollHeight=${noOverflow.scrollHeight} > innerHeight=${noOverflow.innerHeight}`
        ).toBeLessThanOrEqual(noOverflow.innerHeight);

        // Both entrance buttons must be visible (in the viewport, not
        // scrolled off). We locate by the link's href + accessible
        // name to be robust to copy tweaks.
        await expect(
          page.getByRole('link', { name: /reader.s seat/i })
        ).toBeVisible({ timeout: 5_000 });
        await expect(
          page.getByRole('link', { name: /curator.s desk/i })
        ).toBeVisible({ timeout: 5_000 });

        // Screenshot artifact under test-results/viewport/.
        const out = path.resolve(
          'test-results',
          'viewport',
          `landing-${vp.name}.png`
        );
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await page.screenshot({ path: out, fullPage: false });
      }
    } finally {
      await ctx.close();
    }
  });

  test('annotator (/annotate) fits in viewport at 5 sizes with no vertical overflow', async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const seed = loadSeed();
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stubImageProxy(page, seed);

    try {
      // Log in once, then resize for each viewport check.
      await page.setViewportSize({ width: 1280, height: 720 });
      await loginAnnotator(page, seed.accessKey, `e2e-viewport-${RUN_SUFFIX}`);
      await dismissGuidelinesIfPresent(page);
      await waitForFirstImage(page);

      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        // Let the layout reflow before measuring.
        await page.waitForTimeout(300);

        // (a) The annotator page is mounted and the body fits.
        const noOverflow = await page.evaluate(() => {
          return {
            scrollHeight: document.documentElement.scrollHeight,
            innerHeight: window.innerHeight,
          };
        });
        expect(
          noOverflow.scrollHeight,
          `[${vp.name}] scrollHeight=${noOverflow.scrollHeight} > innerHeight=${noOverflow.innerHeight}`
        ).toBeLessThanOrEqual(noOverflow.innerHeight);

        // (b) The four choice buttons are all visible (inside the
        // viewport, not scrolled off). They're radiogroup radios.
        const radios = page.getByRole('radio', { name: /text|image|both|none/i });
        await expect(radios).toHaveCount(4);
        for (let i = 0; i < 4; i++) {
          await expect(radios.nth(i)).toBeVisible({ timeout: 5_000 });
        }

        // (c) Prev and Next are visible. They live inside <button>
        // with aria-label="Previous image" / "Next image".
        await expect(
          page.getByRole('button', { name: /previous image/i })
        ).toBeVisible({ timeout: 5_000 });
        await expect(
          page.getByRole('button', { name: /next image/i })
        ).toBeVisible({ timeout: 5_000 });

        // Screenshot artifact.
        const out = path.resolve(
          'test-results',
          'viewport',
          `annotator-${vp.name}.png`
        );
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await page.screenshot({ path: out, fullPage: false });
      }
    } finally {
      await ctx.close();
    }
  });
});
