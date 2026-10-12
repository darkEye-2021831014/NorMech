/**
 * One-off smoke check for the keyboard-navigation refactor and the
 * completion-banner change. NOT part of the regular CI; only run by
 * hand via:
 *
 *   docker compose run --rm e2e sh -c \
 *     './node_modules/.bin/playwright test tests/e2e/smoke-keyboard-banner.spec.ts'
 *
 * Asserts:
 *   (a) ArrowRight does NOT change the selected option AND moves to
 *       the next image.
 *   (b) ArrowDown moves the cursor (data-cursor attribute moves)
 *       without saving anything (no /api/annotate/annotations PUT,
 *       no Saved. indicator).
 *   (c) Mark all images with the 1-4 keys, then change an answer by
 *       clicking a different option, and assert the new answer
 *       persists to the server and the progress map tile updates.
 *
 * Also takes a single screenshot of /annotate to /test-results.
 */
import { test, expect, type Page, type Request } from '@playwright/test';
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
}

async function focusAnnotatorPage(page: Page) {
  // Blur any focused element and put focus on the page wrapper, NOT
  // on a radio button, so the page-level keyboard handler is the one
  // that catches arrow keys.
  await page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (a && 'blur' in a) a.blur();
    const main = document.querySelector('[data-testid="annotator-page"]') as HTMLElement | null;
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus();
    }
  });
}

async function currentImageNumber(page: Page): Promise<number> {
  const txt = await page.locator('[data-testid="current-counter"]').first().textContent();
  // Format: "#001 / 6"
  const m = txt?.match(/#(\d+)\s*\/\s*(\d+)/);
  if (!m) throw new Error(`Couldn't parse counter: ${txt}`);
  return Number(m[1]);
}

async function radioLabel(radio: ReturnType<Page['locator']>): Promise<string> {
  // The radio button's textContent concatenates all child text in
  // document order with no separators (the number badge and the
  // label live in adjacent grid cells). To extract the human label
  // ("Text" / "Image" / "Both" / "None") reliably, we read the
  // truncated <span> that wraps the label icon + text.
  const labelEl = radio.locator('span:has-text("Text"), span:has-text("Image"), span:has-text("Both"), span:has-text("None")').first();
  const t = await labelEl.textContent().catch(() => null);
  if (t) return t.trim().split(/\s+/).pop() ?? t.trim();
  return (await radio.textContent())?.trim() ?? '';
}

async function selectedOptionLabel(page: Page): Promise<string | null> {
  const sel = page.locator('[role="radio"][aria-checked="true"]');
  if ((await sel.count()) === 0) return null;
  return await radioLabel(sel.first());
}

async function cursorOptionLabel(page: Page): Promise<string | null> {
  const c = page.locator('[role="radio"][data-cursor="true"]');
  if ((await c.count()) === 0) return null;
  return await radioLabel(c.first());
}

test('keyboard nav + completion banner smoke (one pass, no loops)', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const seed = loadSeed();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await stubImageProxy(page, seed);

  // Capture every PUT to /api/annotate/annotations so we can prove
  // no save fired for (b).
  const saves: { imageId: string; harm: string; at: number }[] = [];
  await page.route('**/api/annotate/annotations', async (route, req: Request) => {
    if (req.method() === 'PUT') {
      const body = JSON.parse(req.postData() || '{}');
      const url = new URL(req.url());
      const imageId = body.imageId ?? url.searchParams.get('imageId') ?? '?';
      saves.push({ imageId, harm: body.harmSource, at: Date.now() });
    }
    await route.continue();
  });

  const userName = `smoke-keyboard-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await page.setViewportSize({ width: 1280, height: 720 });
  await loginAnnotator(page, seed.accessKey, userName);
  await dismissGuidelinesIfPresent(page);
  await waitForFirstImage(page);
  await focusAnnotatorPage(page);

  // ---- (a) ArrowRight navigates, does not change the selected option.
  const beforeIdx = await currentImageNumber(page);
  const beforeSelected = await selectedOptionLabel(page); // null on first image
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const afterIdx = await currentImageNumber(page);
  const afterSelected = await selectedOptionLabel(page);
  expect(afterIdx, 'ArrowRight should advance currentImage').toBe(beforeIdx + 1);
  expect(
    afterSelected,
    'ArrowRight must NOT change the selected option (was: ' +
      String(beforeSelected) +
      ', now: ' +
      String(afterSelected) +
      ')'
  ).toBe(beforeSelected);
  const a_pass = afterIdx === beforeIdx + 1 && afterSelected === beforeSelected;

  // ---- (b) ArrowDown moves the cursor, does NOT save anything.
  const savesBeforeB = saves.length;
  const cursorBefore = await cursorOptionLabel(page);
  await focusAnnotatorPage(page);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  const cursorAfter = await cursorOptionLabel(page);
  expect(
    cursorAfter,
    'ArrowDown must move the cursor (was: ' +
      String(cursorBefore) +
      ', now: ' +
      String(cursorAfter) +
      ')'
  ).not.toBe(cursorBefore);
  // No new save should have fired.
  await page.waitForTimeout(200);
  const savesAfterB = saves.length;
  expect(
    savesAfterB,
    'ArrowDown must not trigger a save (saves before/after: ' +
      savesBeforeB +
      ' / ' +
      savesAfterB +
      ')'
  ).toBe(savesBeforeB);

  // Also: no "Saved." indicator should be on screen.
  const savedTextVisible = await page
    .getByText(/^Saved\.$/i)
    .first()
    .isVisible()
    .catch(() => false);
  expect(savedTextVisible, 'No Saved. indicator should appear from a cursor move').toBe(false);
  const b_pass = cursorAfter !== cursorBefore && savesAfterB === savesBeforeB && !savedTextVisible;

  // ---- (c) Mark every image, then change the last answer by clicking
  //          a different option; assert the change persists.
  // Start clean: jump back to image 1.
  await focusAnnotatorPage(page);
  // Press Home then ArrowLeft until we're at 1 (in case we're past).
  for (let i = 0; i < 20; i++) {
    const n = await currentImageNumber(page);
    if (n === 1) break;
    if (n > 1) await page.keyboard.press('ArrowLeft');
    else await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(80);
  }
  expect(await currentImageNumber(page)).toBe(1);

  // Walk every image, mark it with key 1 (Text). After all 6 are
  // marked, the completion banner should appear.
  for (let i = 0; i < seed.imageIds.length; i++) {
    const expectedNext = i + 1;
    // Wait until we're on the expected image number (the previous
    // iteration's auto-advance may still be in flight). The dev
    // server in Docker can be slow on the first request, so we
    // give this a generous timeout.
    await expect
      .poll(async () => currentImageNumber(page), { timeout: 15_000, intervals: [200, 400, 800, 1500] })
      .toBe(expectedNext);
    await focusAnnotatorPage(page);
    // Slow dev server in Docker: give the PUT + auto-advance a full
    // second to complete before the next iteration's poll starts
    // looking for the next image.
    await page.keyboard.press('1');
    await page.waitForTimeout(1000);
  }
  // And one more wait so the final save_ok has settled (no auto-
  // advance on the last image, so we just need the last save to
  // round-trip).
  await page.waitForTimeout(1500);
  // After marking the last image, the completion banner should
  // appear. The current image should stay on the last (auto-advance
  // does not advance past the end).
  await expect(page.locator('[data-testid="completion-banner"]')).toBeVisible({
    timeout: 5_000,
  });
  expect(await currentImageNumber(page)).toBe(seed.imageIds.length);

  // Confirm all 6 saves fired.
  const expectedSaves = seed.imageIds.length;
  expect(saves.length, `expected ${expectedSaves} saves, got ${saves.length}`).toBe(
    expectedSaves
  );

  // Now change the answer on the current (last) image by clicking a
  // different option — say "Image" (key 2). The server should record
  // a new PUT for this image.
  const lastImageId = seed.imageIds[seed.imageIds.length - 1];
  const savesBeforeEdit = saves.filter((s) => s.imageId === lastImageId).length;
  await focusAnnotatorPage(page);
  // Click the "Image" radio directly. `name: /^image$/i` matches
  // only the radio whose accessible name starts with "Image" (the
  // icon-prefixed label is "Image"; descriptions like "picture"
  // don't match).
  const imageRadio = page.locator('[role="radio"]', { hasText: /^2\s*Image/ }).first();
  const imageRadioCount = await imageRadio.count();
  console.log(`imageRadioCount=${imageRadioCount}`);
  await imageRadio.click();
  await page.waitForTimeout(500);
  const savesAfterEdit = saves.filter((s) => s.imageId === lastImageId).length;
  console.log(`saves for last image: before=${savesBeforeEdit} after=${savesAfterEdit}`);
  console.log('all saves for last image:', JSON.stringify(saves.filter((s) => s.imageId === lastImageId)));
  expect(
    savesAfterEdit,
    `Clicking a different option should fire a save (was ${savesBeforeEdit}, now ${savesAfterEdit})`
  ).toBe(savesBeforeEdit + 1);
  const lastSave = saves.filter((s) => s.imageId === lastImageId).slice(-1)[0];
  expect(lastSave.harm).toBe('image');

  // The progress map tile for the last image should now show the
  // "I" letter (vermilion mark for "image").
  const tiles = page.locator('[data-testid="progress-map"] [role="listitem"]');
  const lastTileText = (await tiles.nth(seed.imageIds.length - 1).textContent())?.trim();
  expect(lastTileText).toBe('I');

  // Take the one screenshot.
  const out = path.resolve('test-results', 'annotate-smoke.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: false });
  // eslint-disable-next-line no-console
  console.log(`screenshot -> ${out}`);

  // Summary.
  // eslint-disable-next-line no-console
  console.log(
    [
      'SMOKE CHECK RESULTS',
      `  (a) ArrowRight: currentImage ${beforeIdx} -> ${afterIdx}, selected ${String(
        beforeSelected
      )} -> ${String(afterSelected)} (unchanged: ${a_pass})`,
      `  (b) ArrowDown: cursor ${String(cursorBefore)} -> ${String(
        cursorAfter
      )}, saves ${savesBeforeB} -> ${savesAfterB} (no-save: ${b_pass})`,
      `  (c) Marked all 6 with key 1, then changed last to "image".`,
      `      completion banner visible: ${
        await page.locator('[data-testid="completion-banner"]').isVisible()
      }`,
      `      last tile text: ${lastTileText}`,
      `      total saves: ${saves.length}`,
      '  ALL CHECKS PASSED',
    ].join('\n')
  );

  await ctx.close();
});
