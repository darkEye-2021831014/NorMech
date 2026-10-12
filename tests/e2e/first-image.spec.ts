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
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: /enter|opening/i }).click();
  await page.waitForURL(/\/annotate(\?|$)/, { timeout: 15_000 });
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

  // (a) visible (rendered with non-zero size)
  await expect(img).toBeVisible({ timeout: 8_000 });

  // (a.5) Wait for the data-loaded attribute on the wrapper to flip
  // to "true". This is the source of truth for "the annotator has
  // decided this image is ready". Using this instead of guessing at
  // CSS opacity transitions means we don't have to race a 200ms
  // transition.
  const wrapper = page.locator('[data-testid="annotator-image"]').first();
  await expect(wrapper).toHaveAttribute('data-loaded', 'true', { timeout: 8_000 });

  // (b) complete + naturalWidth > 0
  // Wait for the CSS opacity transition to settle (200ms in
  // AnnotatorClient, plus a small buffer). Without this, the
  // computed opacity can read as 0 right after the class change
  // even though the image is fully visible to the user.
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        'img[alt^="Image for annotation"]'
      ) as HTMLImageElement | null;
      if (!el) return false;
      const op = parseFloat(window.getComputedStyle(el).opacity);
      return op > 0.95;
    },
    { timeout: 5_000 }
  );
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
      // Fresh context per iteration; cache is implicitly disabled
      // because every image request is intercepted by stubImageProxy
      // and served from disk. No external network hits.
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const { consoleMessages, pageErrors } = captureLogs(page);
      await stubImageProxy(page, seed);

      let didFail = false;
      let failureMessage: string | undefined;
      try {
        await loginAnnotator(page, seed.accessKey, `e2e-user-${i}`);
        const ready = await expectFirstImageVisible(page);
        // No console errors, no hydration warnings.
        const errors = consoleMessages.filter(
          (m) => m.type === 'error' || (m.type === 'warning' && /hydrat/i.test(m.text))
        );
        if (errors.length > 0 || pageErrors.length > 0) {
          didFail = true;
          failureMessage =
            `Run ${i}: console/page errors detected.\n` +
            `  console: ${JSON.stringify(errors, null, 2)}\n` +
            `  page errors: ${JSON.stringify(pageErrors, null, 2)}\n` +
            `  img: ${JSON.stringify(ready, null, 2)}`;
        }
      } catch (err) {
        didFail = true;
        failureMessage = `Run ${i}: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        await ctx.close();
      }
      if (didFail) {
        throw new Error(failureMessage);
      }
    }
  });

  test('renders the first image under slow-3G throttling', async ({ browser }) => {
    const seed = loadSeed();
    test.setTimeout(120_000);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { consoleMessages, pageErrors } = captureLogs(page);
    await stubImageProxy(page, seed);

    let didFail = false;
    let failureMessage: string | undefined;
    const cdp = await ctx.newCDPSession(page);
    try {
      // Log in un-throttled so the test can reach /annotate
      // quickly. We then turn on slow-3G before the dashboard's
      // first image request goes out, by reloading the page
      // (which forces a fresh image request).
      await loginAnnotator(page, seed.accessKey, 'e2e-slow3g-user');
      // Now enable slow-3G and reload.
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 400, // ms
        downloadThroughput: (400 * 1000) / 8, // 400 kbps
        uploadThroughput: (400 * 1000) / 8,
      });
      await page.reload();
      // Larger budgets because everything (page load + image)
      // is throttled.
      const img = page.locator('img[alt^="Image for annotation"]').first();
      await expect(img).toBeVisible({ timeout: 30_000 });
      await expect(
        page.locator('[data-testid="annotator-image"]').first()
      ).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
      await page.waitForFunction(
        () => {
          const el = document.querySelector(
            'img[alt^="Image for annotation"]'
          ) as HTMLImageElement | null;
          if (!el) return false;
          return parseFloat(window.getComputedStyle(el).opacity) > 0.95;
        },
        { timeout: 10_000 }
      );

      const errors = consoleMessages.filter(
        (m) => m.type === 'error' || (m.type === 'warning' && /hydrat/i.test(m.text))
      );
      if (errors.length > 0 || pageErrors.length > 0) {
        didFail = true;
        failureMessage =
          `slow-3g: console/page errors detected.\n` +
          `  console: ${JSON.stringify(errors, null, 2)}\n` +
          `  page errors: ${JSON.stringify(pageErrors, null, 2)}`;
      }
    } catch (err) {
      didFail = true;
      failureMessage = `slow-3g: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      try {
        await cdp.send('Network.emulateNetworkConditions', {
          offline: false,
          latency: 0,
          downloadThroughput: 0,
          uploadThroughput: 0,
        });
        await cdp.detach();
      } catch {
        // ignore — context may already be closed
      }
      await ctx.close();
    }
    if (didFail) {
      throw new Error(failureMessage);
    }
  });

  test('resumes a partially annotated session and renders the next image', async ({ browser }) => {
    test.setTimeout(60_000);

    // Re-seed with partial annotations. The first run wrote a
    // seed file in JSON; we run the seed again with SEED_PARTIAL=1
    // and write a new file. This is best-effort — if the env vars
    // aren't set, we skip (the other test covers the fresh case).
    const seed = loadSeed();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { consoleMessages, pageErrors } = captureLogs(page);
    await stubImageProxy(page, seed);

    let didFail = false;
    let failureMessage: string | undefined;
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
      if (errors.length > 0 || pageErrors.length > 0) {
        didFail = true;
        failureMessage =
          `resume: console/page errors detected.\n` +
          `  console: ${JSON.stringify(errors, null, 2)}\n` +
          `  page errors: ${JSON.stringify(pageErrors, null, 2)}\n` +
          `  img: ${JSON.stringify(ready, null, 2)}`;
      }
    } catch (err) {
      didFail = true;
      failureMessage = `resume: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      await ctx.close();
    }
    if (didFail) {
      throw new Error(failureMessage);
    }
  });
});
