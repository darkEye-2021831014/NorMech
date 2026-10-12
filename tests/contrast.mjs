#!/usr/bin/env node
/**
 * Contrast ratio table for the design tokens used across /, /annotate,
 * and the login pages. Reads the same CSS custom properties declared
 * in src/app/globals.css, then computes the WCAG 2.1 contrast ratio
 * for each text/background pair we use on the landing page and the
 * annotator's right panel.
 *
 *   normal text  -> 4.5:1
 *   large  text  -> 3.0:1   (18pt+, or 14pt+ bold)
 *
 * Run: `node tests/contrast.mjs`
 */

const TOKENS = {
  light: {
    paper:            [244, 239, 230],
    paperStrong:      [255, 248, 238],
    ink:              [20, 18, 15],
    inkMuted:         [88, 78, 66],
    vermilion:        [176, 43, 15],
    vermilionBright:  [230, 107, 71],
    olive:            [90, 96, 56],
    oliveBright:      [174, 184, 95],
    cardBg:           [250, 246, 238],
  },
  dark: {
    paper:            [20, 18, 15],
    paperStrong:      [255, 248, 238],
    ink:              [244, 239, 230],
    inkMuted:         [178, 168, 148],
    vermilion:        [176, 43, 15],
    vermilionBright:  [230, 107, 71],
    olive:            [100, 114, 48],
    oliveBright:      [90, 107, 38],
    cardBg:           [28, 25, 21],
  },
};

/**
 * WCAG relative luminance.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relLum([r, g, b]) {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function ratio(fg, bg) {
  const L1 = relLum(fg);
  const L2 = relLum(bg);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

function hex([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Pairs to verify. Each entry is [label, fg-token, bg-token,
 * "normal" | "large"]. Tokens reference keys of TOKENS.{theme}.
 */
const PAIRS = [
  // Landing page — top-bar catalogue label and headline.
  ['Top-bar catalogue (M.A. — Vol. I)', 'inkMuted', 'paper', 'normal'],

  // Landing page — headline.
  ['Headline "A reading room"',         'ink',       'paper', 'large'],
  ['Headline "for the" italic',         'ink',       'paper', 'large'],
  // "picture" accent: deep vermilion on light, bright vermilion on dark.
  ['Headline "picture" (accent)',       'accent',    'paper', 'large'],
  ['Headline "that travels with care"', 'ink',       'paper', 'large'],

  // Landing page — body paragraph.
  ['Body paragraph',                    'ink',       'paper', 'normal'],

  // Landing page — primary card (filled vermilion).
  ['Primary card: caption',             'paperStrong', 'vermilion', 'normal'],
  ['Primary card: title "Annotator"',   'paperStrong', 'vermilion', 'large'],
  ['Primary card: description',         'paperStrong', 'vermilion', 'normal'],

  // Landing page — secondary card (outlined, hover-filled).
  ['Secondary card: caption',           'ink',       'paper', 'normal'],
  ['Secondary card: title "Admin"',     'ink',       'paper', 'large'],
  ['Secondary card: description',       'ink',       'paper', 'normal'],
  // Hover state inverts: ink bg, paper fg.
  ['Secondary card (hover): title',     'paper',     'ink',    'large'],
  ['Secondary card (hover): caption',   'paper',     'ink',    'normal'],

  // Annotator — file caption row.
  ['File caption (mono)',               'inkMuted',  'paper', 'normal'],

  // Annotator — choice cards, unselected.
  ['Choice card: number badge',         'ink',       'cardBg', 'normal'],
  ['Choice card: label "Text" etc.',    'ink',       'cardBg', 'normal'],
  ['Choice card: description (lg)',     'inkMuted',  'cardBg', 'normal'],

  // Annotator — choice cards, selected (vermilion).
  ['Choice card selected: number',      'paperStrong', 'vermilion', 'normal'],
  ['Choice card selected: label',       'paperStrong', 'vermilion', 'normal'],
  ['Choice card selected: description', 'paperStrong', 'vermilion', 'normal'],

  // Annotator — choice cards, selected (olive / oliveBright).
  ['Choice card selected (olive): label',       'paperStrong', 'oliveA', 'normal'],
  // Bg is the olive-toned fill; pseudo-token "oliveA" resolves per
  // theme (olive on light, oliveBright on dark).
  // fg is paperStrong.
  // (Structure: [label, fg, bg, size]) — so fg=paperStrong, bg=oliveA.
  ['Choice card selected (olive): description', 'paperStrong', 'oliveA', 'normal'],

  // Annotator — auto-advance / jump / hint catalogue row.
  ['Catalogue "AUTO-ADVANCE"',          'inkMuted',  'paper', 'normal'],
  ['Catalogue "JUMP TO FIRST..."',      'inkMuted',  'paper', 'normal'],
  ['Catalogue "1-4 TO MARK..."',        'inkMuted',  'paper', 'normal'],

  // Annotator — still-unmarked prompt.
  ['Still-unmarked prompt body',        'inkMuted',  'cardBg', 'normal'],
  ['Still-unmarked prompt strong "N"',  'ink',       'cardBg', 'normal'],

  // Login pages — kicker uses bright vermilion in dark for AA.
  ['Login kicker (accent)',             'accent',    'paper', 'normal'],
  ['Login h1 italic span',              'ink',       'paper', 'large'],
  ['Login body text',                   'inkMuted',  'paper', 'normal'],
];

function resolve(token, theme, kind) {
  if (token === 'accent') {
    // Light uses the deeper vermilion; dark uses the bright variant.
    return theme === 'dark' ? TOKENS.dark.vermilionBright : TOKENS.light.vermilion;
  }
  if (token === 'oliveA') {
    if (kind === 'fg') {
      return TOKENS[theme].oliveBright;
    }
    return theme === 'dark' ? TOKENS.dark.oliveBright : TOKENS.light.olive;
  }
  return TOKENS[theme][token];
}

function evaluate(theme) {
  const palette = TOKENS[theme];
  const out = [];
  for (const [label, fg, bg, size] of PAIRS) {
    // Theme-aware pseudo-tokens. The 'accent' fg maps to a different
    // token in each theme (vermilion on light, vermilionBright on
    // dark) so the same JSX class works in both. The 'oliveA' bg
    // similarly maps to the deeper light-olive or the brighter
    // dark-olive depending on theme.
    const fgRgb = resolve(fg, theme, 'fg');
    const bgRgb = resolve(bg, theme, 'bg');
    if (!fgRgb || !bgRgb) {
      throw new Error(`Unknown token in pair "${label}": fg=${fg} bg=${bg}`);
    }
    let effectiveFg = fgRgb;
    if (/0\.85 opacity/.test(label)) {
      effectiveFg = composite(fgRgb, bgRgb, 0.85);
    } else if (/0\.80 opacity/.test(label)) {
      effectiveFg = composite(fgRgb, bgRgb, 0.8);
    } else if (/0\.90 opacity/.test(label)) {
      effectiveFg = composite(fgRgb, bgRgb, 0.9);
    }
    const r = ratio(effectiveFg, bgRgb);
    const threshold = size === 'large' ? 3.0 : 4.5;
    out.push({
      label,
      fg: hex(fgRgb) + (effectiveFg !== fgRgb ? ' (alpha)' : ''),
      bg: hex(bgRgb),
      ratio: r,
      size,
      pass: r >= threshold,
    });
  }
  return out;
}

function composite([r1, g1, b1], [r2, g2, b2], a) {
  return [
    Math.round(r1 * a + r2 * (1 - a)),
    Math.round(g1 * a + g2 * (1 - a)),
    Math.round(b1 * a + b2 * (1 - a)),
  ];
}

function printTable(theme, rows) {
  console.log(`\n=== Theme: ${theme.toUpperCase()} ===`);
  console.log('label'.padEnd(45) + 'fg'.padEnd(12) + 'bg'.padEnd(10) + 'ratio'.padStart(8) + '  size  result');
  console.log('-'.repeat(95));
  let failed = 0;
  for (const r of rows) {
    const tag = r.pass ? 'PASS' : 'FAIL';
    if (!r.pass) failed++;
    console.log(
      r.label.padEnd(45) +
        r.fg.padEnd(12) +
        r.bg.padEnd(10) +
        r.ratio.toFixed(2).padStart(7) +
        '  ' +
        r.size.padEnd(6) +
        ' ' +
        tag
    );
  }
  console.log('-'.repeat(95));
  console.log(`${rows.length - failed} passed, ${failed} failed.`);
  return failed;
}

let totalFailed = 0;
for (const theme of ['light', 'dark']) {
  totalFailed += printTable(theme, evaluate(theme));
}
process.exit(totalFailed === 0 ? 0 : 1);
