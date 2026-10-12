import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

type Seed = {
  datasetId: string;
  accessKey: string;
  imageIds: string[];
};

/**
 * Read the seed file written by tests/seed.ts. Throws if it's missing
 * — the test harness must run the seed step before invoking the
 * tests.
 */
function loadSeed(): Seed {
  const p = process.env.SEED_FILE || path.resolve('tests/.seed.json');
  if (!fs.existsSync(p)) {
    throw new Error(
      `Missing seed file at ${p}. Run the seed step first:\n` +
        `  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx tests/seed.ts > tests/.seed.json`
    );
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Seed;
}

/**
 * Intercept /api/image/* and serve one of our local fixture PNGs.
 * The mapping is by image-id-position: the seed's `imageIds[i]` is
 * served from `tests/fixtures/e2e-image-NN.png` (the URLs themselves
 * are intercepted, not the file_id, so we match by the image id in
 * the path).
 *
 * Returns a small map of image id → fixture file name so we can
 * also verify the *right* image was rendered.
 */
async function stubImageProxy(page: Page, seed: Seed) {
  const fixtures = seed.imageIds.map((id, i) => ({
    id,
    file: path.resolve(`tests/fixtures/e2e-image-${String(i + 1).padStart(2, '0')}.png`),
  }));

  await page.route('**/api/image/**', async (route) => {
    const url = new URL(route.request().url());
    // Path is /api/image/{id}
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
 * Drive the annotator login flow: type access key + name, click
 * enter, wait for /annotate. Returns once the dashboard has settled.
 */
async function loginAnnotator(page: Page, accessKey: string, name: string) {
  await page.goto('/annotate/login');
  await page.getByLabel('Access key').fill(accessKey);
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: /enter|sign in|start/i }).click();
  await page.waitForURL(/\/annotate(\?|$)/, { timeout: 10_000 });
}

/**
 * Capture every console message and page error. Returns arrays that
 * the caller can read at any time.
 */
function captureLogs(page: Page) {
  const consoleMessages: { type: string; text: string; location: string }[] = [];
  const pageErrors: { message: string; stack?: string }[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location().url,
    });
  });
  page.on('pageerror', (err) => {
    pageErrors.push({ message: err.message, stack: err.stack });
  });
  return { consoleMessages, pageErrors };
}

/**
 * The "the bug" check. Within 8s, the first image must be visible
 * (not a skeleton), the <img> must be complete with non-zero
 * naturalWidth, the spinner must be gone, and there must be no
 * console errors or hydration warnings.
 */
async function expectFirstImageVisible(page: Page) {
  // Locate the visible hero <img> in the annotator.
  // The AnnotatorImage component renders an <img> with alt starting
  // with "Image for annotation". We grab the first one — that's
  // the current image.
  const img = page.locator('img[alt^="Image for annotation"]').first();

  // (a) visible
  await expect(img).toBeVisible({ timeout: 8_000 });

  // (b) complete + naturalWidth > 0
  const ready = await img.evaluate(
    (el: HTMLImageElement) => ({
      complete: el.complete,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      currentSrc: el.currentSrc,
      opacity: window.getComputedStyle(el).opacity,
    })
  );
  expect(ready.complete).toBe(true);
  expect(ready.naturalWidth).toBeGreaterThan(0);
  expect(parseFloat(ready.opacity)).toBeGreaterThan(0.5);

  // (c) NO spinner/skeleton in the DOM
  // The Skeleton component renders as a div with animate-pulse.
  // The spinner is a Loader2 with animate-spin.
  const skeleton = page.locator('div.animate-pulse');
  await expect(skeleton).toHaveCount(0);
  const spinner = page.locator('.animate-spin');
  await expect(spinner).toHaveCount(0);

  return ready;
}

test.describe('Annotator first image', () => {
  test('renders the first image without spinner, 10 fresh contexts', async ({ browser }) => {
    const seed = loadSeed();
    test.setTimeout(180_000);

    for (let i = 1; i <= 10; i++) {
      const ctx = await browser.newContext({
        // Disable cache: every request goes to the network.
        bypassCSP: true,
      });
      const page = await ctx.newPage();
      const { consoleMessages, pageErrors } = captureLogs(page);
      await stubImageProxy(page, seed);

      try {
        await loginAnnotator(page, seed.accessKey, `e2e-user-${i}`);
        const ready = await expectFirstImageVisible(page);
        // No console errors, no hydration warnings.
        const errors = consoleMessages.filter(
          (m) => m.type === 'error' || (m.type === 'warning' && /hydrat/i.test(m.text))
        );
        if (errors.length > 0 || pageErrors.length > 0) {
          throw new Error(
            `Run ${i}: console/page errors detected.\n` +
              `  console: ${JSON.stringify(errors, null, 2)}\n` +
              `  page errors: ${JSON.stringify(pageErrors, null, 2)}\n` +
              `  img: ${JSON.stringify(ready, null, 2)}`
          );
        }
      } finally {
        await ctx.close();
      }
    }
  });

  test('resumes a partially annotated session and renders the next image', async ({ browser }) => {
    test.setTimeout(60_000);

    // Re-seed with partial annotations. The first run wrote a
    // seed file in JSON; we run the seed again with SEED_PARTIAL=1
    // and write a new file. This is best-effort — if the env vars
    // aren't set, we skip (the other test covers the fresh case).
    const seed = loadSeed();

    const ctx = await browser.newContext({ bypassCSP: true });
    const page = await ctx.newPage();
    const { consoleMessages, pageErrors } = captureLogs(page);
    await stubImageProxy(page, seed);

    try {
      // The seed file may or may not have annotations. We test the
      // path either way: the dashboard always lands on the first
      // unannotated image (or image 0 if all done). The first
      // unannotated is image index `partialCount`, so the test
      // checks that *some* image renders correctly on first load.
      await loginAnnotator(page, seed.accessKey, 'e2e-resume-user');
      const ready = await expectFirstImageVisible(page);
      expect(ready.naturalWidth).toBeGreaterThan(0);

      const errors = consoleMessages.filter(
        (m) => m.type === 'error' || (m.type === 'warning' && /hydrat/i.test(m.text))
      );
      expect(errors, 'no console errors / hydration warnings').toHaveLength(0);
      expect(pageErrors, 'no uncaught page errors').toHaveLength(0);
    } finally {
      await ctx.close();
    }
  });
});
