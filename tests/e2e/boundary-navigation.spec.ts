import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

type Seed = {
  datasetId: string;
  accessKey: string;
  imageIds: string[];
};

// Name + key used ONLY for this spec. Distinct from the
// first-image.spec.ts dataset so we can re-seed without interfering.
const SEED_DATASET_NAME = 'E2E boundary dataset';
const SEED_ACCESS_KEY = 'E2EBNDR';
const SEED_IMAGE_COUNT = 5;
const SEED_FILE = path.resolve('tests/.seed-boundary.json');

// A per-run suffix so the user names are unique across test runs.
// The annotator's "register on first use" behavior would otherwise
// resume a user from a prior run (with their old annotations), and
// the test would land on the wrong image.
const RUN_SUFFIX = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/**
 * Run the seed script with this spec's overrides. Writes the result
 * to a separate seed file so we don't clobber the default one.
 */
function reseed(): Seed {
  const env = {
    ...process.env,
    SEED_DATASET_NAME,
    SEED_ACCESS_KEY,
    SEED_IMAGE_COUNT: String(SEED_IMAGE_COUNT),
  };
  const out = execFileSync('node', ['tests/seed.mjs'], { env }).toString();
  const seed = JSON.parse(out) as Seed;
  fs.writeFileSync(SEED_FILE, JSON.stringify(seed));
  return seed;
}

function loadSeed(): Seed {
  if (!fs.existsSync(SEED_FILE)) {
    return reseed();
  }
  return JSON.parse(fs.readFileSync(SEED_FILE, 'utf8')) as Seed;
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
      // 502 is what the server returns for a missing image id, but
      // importantly we don't want any such request to happen at all
      // — the test asserts on this in real time.
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

async function loginAnnotator(page: Page, accessKey: string, name: string) {
  await page.goto('/annotate/login');
  await page.getByLabel('Access key').fill(accessKey);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: /enter|opening/i }).click();
  await page.waitForURL(/\/annotate(\?|$)/, { timeout: 15_000 });
}

/**
 * Dismiss the "How to annotate" modal if it's open on first visit.
 * Each new context has a fresh localStorage, so first load always
 * shows it. The modal traps focus on its close button, so the
 * ArrowRight keypress the test wants to send would otherwise be
 * consumed by the modal's focus trap. We click the "Begin annotating"
 * (initial) / "Close" (subsequent) button in the footer.
 *
 * After the modal closes, the test wants the focus to be on the page
 * (not on a radio), so the global keyboard handler can move the
 * image index. We click on a neutral element — the file-name caption
 * or the page section — to put focus there.
 */
async function dismissGuidelinesIfPresent(page: Page) {
  const beginBtn = page.getByRole('button', { name: /begin annotating|^close$/i });
  if (await beginBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await beginBtn.click();
  }
}

/**
 * Put focus on the annotator page (not on a radio button) so the
 * ArrowRight/ArrowLeft keypress the tests are about to send reaches
 * the page-level keyboard handler. We explicitly blur any focused
 * element, then focus the page's <body>. If the body isn't focusable
 * (it's not, by default), we move focus to the data-testid section
 * which IS focusable in modern browsers, or we just clear focus
 * entirely.
 */
async function focusAnnotatorPage(page: Page) {
  await page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (a && 'blur' in a) a.blur();
    document.body.focus?.();
    const main = document.querySelector('[data-testid="annotator-page"]') as HTMLElement | null;
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus();
    }
  });
}

function captureLogs(page: Page) {
  const consoleMessages: { type: string; text: string }[] = [];
  const pageErrors: { message: string }[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    pageErrors.push({ message: err.message });
  });
  return { consoleMessages, pageErrors };
}

async function waitForFirstImage(page: Page) {
  const wrapper = page.locator('[data-testid="annotator-image"]').first();
  await expect(wrapper).toHaveAttribute('data-loaded', 'true', { timeout: 8_000 });
  await expect(page.locator('img[alt^="Image for annotation"]').first()).toBeVisible({
    timeout: 8_000,
  });
}

/**
 * Read the "N / total" counter (e.g. "005 / 5") from the file caption
 * row. We extract just the first occurrence — there's only one in the
 * annotator DOM.
 */
async function readCounter(page: Page): Promise<string> {
  return await page.getByTestId('current-counter').innerText();
}

test.describe('Annotator boundary navigation (5 images)', () => {
  test.beforeAll(() => {
    // Always re-seed to a known state. We don't share the file with
    // the other spec so we don't step on its dataset.
    reseed();
  });

  test('ArrowRight/K at last image clamps to last, never shows error UI', async ({ browser }) => {
    test.setTimeout(60_000);
    const seed = loadSeed();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { consoleMessages, pageErrors } = captureLogs(page);
    await stubImageProxy(page, seed);

    // Track every /api/image request URL so we can assert none of
    // them are for an unknown id.
    const imageRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/image/')) {
        imageRequests.push(req.url());
      }
    });

    try {
      await loginAnnotator(page, seed.accessKey, `e2e-boundary-right-${RUN_SUFFIX}`);
      await dismissGuidelinesIfPresent(page);
      await waitForFirstImage(page);
      await focusAnnotatorPage(page);

      // Start on image 1/5.
      await expect.poll(() => readCounter(page)).toMatch(/001\s*\/\s*5/);

      // Press ArrowRight 10 times — the dataset only has 5 images,
      // so the index must clamp at 4 (counter "005 / 5").
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
      }
      // Then K 10 times — same expectation. (Press lowercase k,
      // since the handler matches against e.key.toLowerCase().)
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('k');
      }

      // Counter must read "005 / 5" — never "006 / 5" or higher.
      await expect.poll(() => readCounter(page)).toMatch(/005\s*\/\s*5/);

      // No error UI.
      await expect(page.locator('[data-testid="annotator-error"]')).toHaveCount(0);

      // No /api/image request for an unknown id. Every request URL
      // must end with one of the seed's image ids.
      const knownIds = new Set(seed.imageIds);
      const unknown = imageRequests.filter((u) => {
        const id = decodeURIComponent(u.split('/api/image/').pop() || '');
        return !knownIds.has(id);
      });
      expect(unknown, `unknown image ids requested: ${unknown.join(', ')}`).toEqual([]);

      const errors = consoleMessages.filter(
        (m) => m.type === 'error' || (m.type === 'warning' && /hydrat/i.test(m.text))
      );
      expect(errors, `console errors: ${JSON.stringify(errors)}`).toEqual([]);
      expect(pageErrors, `page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test('ArrowLeft/J at first image clamps to first, never shows error UI', async ({ browser }) => {
    test.setTimeout(60_000);
    const seed = loadSeed();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { consoleMessages, pageErrors } = captureLogs(page);
    await stubImageProxy(page, seed);

    const imageRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/image/')) {
        imageRequests.push(req.url());
      }
    });

    try {
      await loginAnnotator(page, seed.accessKey, `e2e-boundary-left-${RUN_SUFFIX}`);
      await dismissGuidelinesIfPresent(page);
      await waitForFirstImage(page);
      await focusAnnotatorPage(page);
      await expect.poll(() => readCounter(page)).toMatch(/001\s*\/\s*5/);

      // Try to go before the start.
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowLeft');
      }
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('j');
      }

      await expect.poll(() => readCounter(page)).toMatch(/001\s*\/\s*5/);
      await expect(page.locator('[data-testid="annotator-error"]')).toHaveCount(0);

      const knownIds = new Set(seed.imageIds);
      const unknown = imageRequests.filter((u) => {
        const id = decodeURIComponent(u.split('/api/image/').pop() || '');
        return !knownIds.has(id);
      });
      expect(unknown, `unknown image ids requested: ${unknown.join(', ')}`).toEqual([]);

      const errors = consoleMessages.filter(
        (m) => m.type === 'error' || (m.type === 'warning' && /hydrat/i.test(m.text))
      );
      expect(errors, `console errors: ${JSON.stringify(errors)}`).toEqual([]);
      expect(pageErrors, `page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    } finally {
      await ctx.close();
    }
  });

  test('marking the last image with some earlier unmarked shows the "still unmarked" prompt', async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const seed = loadSeed();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stubImageProxy(page, seed);

    try {
      await loginAnnotator(page, seed.accessKey, `e2e-boundary-stay-${RUN_SUFFIX}`);
      await dismissGuidelinesIfPresent(page);
      await waitForFirstImage(page);

      // Mark only image 1, jump to image 5, mark it. Images 2-4
      // remain unannotated, so the user should stay on the last
      // image with the "N still unmarked" prompt.
      const textRadio = page.getByRole('radio', { name: /text/i });
      await textRadio.click();
      // Optimistic selection lands immediately. Wait for the PUT
      // response so we know the row is on the server.
      await expect(textRadio).toBeChecked({ timeout: 5_000 });
      await page.waitForResponse(
        (r) =>
          r.url().includes('/api/annotate/annotations') &&
          r.request().method() === 'PUT',
        { timeout: 5_000 }
      );
      // Auto-advance moved us to image 2 (after ~350ms once the
      // server confirms the save). Wait for the counter to read
      // "002 / 5" so we know the advance fired BEFORE we disable
      // it — otherwise a race between the advance timer and the
      // disable click would leave us on image 1.
      await expect.poll(() => readCounter(page)).toMatch(/002\s*\/\s*5/);
      // Disable auto-advance so the next selection doesn't auto-
      // advance past image 5.
      await page.getByRole('button', { name: /auto-advance/i }).click();
      // Advance to image 5 using the Next button. The progress
      // rail was removed in the layout refactor (it duplicated the
      // header counter and the thin progress line in the side
      // panel); the Next button + ArrowRight/K keyboard shortcut
      // remain as the canonical forward controls.
      const nextBtn = page.getByRole('button', { name: /next image/i });
      for (let i = 0; i < 3; i++) {
        await nextBtn.click();
        await waitForFirstImage(page);
      }
      await expect.poll(() => readCounter(page)).toMatch(/005\s*\/\s*5/);

      // Mark image 5.
      await textRadio.click();
      await expect(textRadio).toBeChecked({ timeout: 5_000 });
      await page.waitForResponse(
        (r) =>
          r.url().includes('/api/annotate/annotations') &&
          r.request().method() === 'PUT',
        { timeout: 5_000 }
      );

      // The counter must still be on image 5.
      await expect.poll(() => readCounter(page)).toMatch(/005\s*\/\s*5/);

      // The "still unmarked" prompt must be visible, saying 3
      // images are still unmarked (2, 3, 4).
      const prompt = page.locator('[data-testid="still-unmarked-prompt"]');
      await expect(prompt).toBeVisible();
      await expect(prompt).toContainText(/3\s+images?\s+(are|is)\s+still\s+unmarked/i);
    } finally {
      await ctx.close();
    }
  });

  test('marking the last image with all others annotated shows the completion state', async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const seed = loadSeed();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stubImageProxy(page, seed);

    try {
      await loginAnnotator(page, seed.accessKey, `e2e-boundary-done-${RUN_SUFFIX}`);
      await dismissGuidelinesIfPresent(page);
      await waitForFirstImage(page);

      // Disable auto-advance so the test is deterministic.
      await page.getByRole('button', { name: /auto-advance/i }).click();

      // Mark images 1, 2, 3, 4 by marking image 1, then using
      // the Next button to advance. The progress rail was removed
      // in the layout refactor; Next + ArrowRight/K remain as the
      // canonical forward controls.
      const textRadio = page.getByRole('radio', { name: /text/i });
      const nextBtn = page.getByRole('button', { name: /next image/i });
      // Image 1
      await textRadio.click();
      await expect(textRadio).toBeChecked({ timeout: 5_000 });
      await page.waitForResponse(
        (r) =>
          r.url().includes('/api/annotate/annotations') &&
          r.request().method() === 'PUT',
        { timeout: 5_000 }
      );
      // Images 2, 3, 4
      for (let i = 0; i < 3; i++) {
        await nextBtn.click();
        await waitForFirstImage(page);
        await textRadio.click();
        await expect(textRadio).toBeChecked({ timeout: 5_000 });
        await page.waitForResponse(
          (r) =>
            r.url().includes('/api/annotate/annotations') &&
            r.request().method() === 'PUT',
          { timeout: 5_000 }
        );
      }

      // Jump to image 5 and mark it. After the click, the
      // optimistic state has all 5 marked, so the page renders the
      // completion screen and the radio is no longer in the DOM.
      // We race the two possible outcomes: the radio becoming
      // checked (in case the page hasn't yet switched to the
      // completion view), or the completion headline appearing.
      await nextBtn.click();
      await waitForFirstImage(page);
      await expect.poll(() => readCounter(page)).toMatch(/005\s*\/\s*5/);
      const putResponse = page.waitForResponse(
        (r) =>
          r.url().includes('/api/annotate/annotations') &&
          r.request().method() === 'PUT',
        { timeout: 5_000 }
      );
      await textRadio.click();
      await putResponse;

      // Completion screen should be visible — counter "005 / 5"
      // disappears, the headline "Every leaf" appears.
      await expect(page.getByText(/Every leaf in/i)).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('link', { name: /download my csv/i })).toBeVisible();
      // The "still unmarked" prompt must NOT be visible (we're
      // complete, not partial).
      await expect(page.locator('[data-testid="still-unmarked-prompt"]')).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});
