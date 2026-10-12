/**
 * Smoke test for the landing and annotator visual fixes.
 *
 * Captures four screenshots:
 *   / + landing-1280x720.png
 *   / + landing-390x844.png
 *   /annotate + annotator-1280x720.png
 *   /annotate + annotator-390x844.png
 *
 * Assertions on /:
 *   - Both entrance cards are visible inside the viewport.
 *
 * Assertions on /annotate:
 *   - All four choice cards are visible inside the viewport.
 *   - Within each choice card, the label element's bounding box
 *     does NOT intersect the description element's bounding box.
 *
 * Run with: docker compose run --rm e2e -- tests/e2e/smoke.spec.ts
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

/**
 * Two boxes intersect iff neither is fully to one side of the other.
 * `a` and `b` are DOMRect-like { x, y, width, height }.
 */
function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

test.describe('Visual smoke (renamed cards + choice-card overflow)', () => {
  test('landing entrance cards visible, both viewports', async ({ browser }) => {
    test.setTimeout(60_000);
    for (const vp of [
      { name: '1280x720', width: 1280, height: 720 },
      { name: '390x844', width: 390, height: 844 },
    ]) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(400);

        // Locate by href + accessible name (the new labels).
        const annotatorLink = page.getByRole('link', { name: /^Annotator$/i });
        const adminLink = page.getByRole('link', { name: /^Admin$/i });
        await expect(annotatorLink).toBeVisible({ timeout: 5_000 });
        await expect(adminLink).toBeVisible({ timeout: 5_000 });

        // Both inside the viewport bounds.
        const inView = await page.evaluate(
          ({ aHref, bHref }) => {
            const a = document.querySelector(`a[href="${aHref}"]`);
            const b = document.querySelector(`a[href="${bHref}"]`);
            const rect = (el: Element | null) => {
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: r.x, y: r.y, width: r.width, height: r.height };
            };
            const va = window.innerHeight;
            return {
              annotator: rect(a),
              admin: rect(b),
              annotatorInside: !!a && a.getBoundingClientRect().bottom <= va && a.getBoundingClientRect().top >= 0,
              adminInside: !!b && b.getBoundingClientRect().bottom <= va && b.getBoundingClientRect().top >= 0,
            };
          },
          { aHref: '/annotate', bHref: '/admin' }
        );

        // The test assertions print clear failures if either is off-screen.
        expect(
          inView.annotatorInside,
          `[${vp.name}] Annotator link not fully inside viewport (rect=${JSON.stringify(inView.annotator)})`
        ).toBe(true);
        expect(
          inView.adminInside,
          `[${vp.name}] Admin link not fully inside viewport (rect=${JSON.stringify(inView.admin)})`
        ).toBe(true);

        // Screenshot artifact.
        const out = path.resolve('test-results', 'viewport', `landing-${vp.name}.png`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await page.screenshot({ path: out, fullPage: false });
        // eslint-disable-next-line no-console
        console.log(`[${vp.name}] landing -> ${out}`);
      } finally {
        await ctx.close();
      }
    }
  });

  test('annotator: choice cards visible + label/description do not overlap', async ({ browser }) => {
    test.setTimeout(60_000);
    const seed = loadSeed();
    for (const vp of [
      { name: '1280x720', width: 1280, height: 720 },
      { name: '390x844', width: 390, height: 844 },
    ]) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await stubImageProxy(page, seed);
      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await loginAnnotator(page, seed.accessKey, `e2e-smoke-${vp.name}-${RUN_SUFFIX}`);
        await dismissGuidelinesIfPresent(page);
        await waitForFirstImage(page);

        // All four choice radios visible, inside viewport.
        const radios = page.getByRole('radio', { name: /text|image|both|none/i });
        await expect(radios).toHaveCount(4);
        for (let i = 0; i < 4; i++) {
          await expect(radios.nth(i)).toBeVisible({ timeout: 5_000 });
        }

        const cardsInfo = await page.evaluate(() => {
          const radios = Array.from(
            document.querySelectorAll('[role="radio"]')
          ) as HTMLElement[];
          const va = window.innerHeight;
          const data = radios.map((radio) => {
            const r = radio.getBoundingClientRect();
            const insideViewport = r.bottom <= va && r.top >= 0;

            // Within this card: label is the .font-sans span with the
            // label text; description is the <p> with class containing
            // 'leading-snug'. We resolve them by stable structure
            // (label is the ONLY inline-flex with the icon; description
            // is the leading-snug <p>). At 390 the description is
            // hidden (lg:block), so we report `null` and skip the
            // intersection check for that case.
            const labelSpan = radio.querySelector(
              'span.font-sans'
            ) as HTMLElement | null;
            const desc = radio.querySelector('p.leading-snug') as HTMLElement | null;
            const getRect = (el: HTMLElement | null) => {
              if (!el) return null;
              const rr = el.getBoundingClientRect();
              // Zero-size means hidden by CSS (display: none) — skip.
              if (rr.width === 0 && rr.height === 0) return null;
              return { x: rr.x, y: rr.y, width: rr.width, height: rr.height };
            };
            return {
              card: { x: r.x, y: r.y, width: r.width, height: r.height },
              insideViewport,
              label: getRect(labelSpan),
              desc: getRect(desc),
            };
          });
          return data;
        });

        // All cards inside viewport.
        for (let i = 0; i < cardsInfo.length; i++) {
          const ci = cardsInfo[i];
          expect(
            ci.insideViewport,
            `[${vp.name}] choice card ${i + 1} not inside viewport (rect=${JSON.stringify(ci.card)})`
          ).toBe(true);
        }

        // Label vs description rectangles must not intersect for any
        // card where both have a rect (i.e. on lg+ where description
        // is visible). On mobile the description is hidden, so
        // desc === null and we skip.
        for (let i = 0; i < cardsInfo.length; i++) {
          const ci = cardsInfo[i];
          if (ci.label && ci.desc) {
            const bad = intersects(ci.label, ci.desc);
            expect(
              bad,
              `[${vp.name}] card ${i + 1} label/desc intersect: label=${JSON.stringify(ci.label)} desc=${JSON.stringify(ci.desc)}`
            ).toBe(false);
          }
        }

        // Screenshot artifact.
        const out = path.resolve('test-results', 'viewport', `annotator-${vp.name}.png`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await page.screenshot({ path: out, fullPage: false });
        // eslint-disable-next-line no-console
        console.log(`[${vp.name}] annotator -> ${out}`);
      } finally {
        await ctx.close();
      }
    }
  });
});
