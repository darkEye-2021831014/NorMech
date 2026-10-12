/**
 * Google Drive folder helpers.
 *
 * No Google API. No API key. We hit the public `embeddedfolderview` page,
 * which works for any folder set to "Anyone with the link can view".
 *
 * Heuristics for parsing the HTML:
 *  - The page embeds rows as `<a href="https://drive.google.com/file/d/FILE_ID/view?...">FILENAME</a>`,
 *    sometimes wrapped in additional markup. The filename can also appear
 *    inside a nearby `<div class="...flip-entry-title">FILENAME</div>`.
 *  - For a "private / not shared" folder, the page returns either a sign-in
 *    redirect or a body containing "Sign in to view" / "You need access".
 */

export class PrivateFolderError extends Error {
  constructor() {
    super(
      "This folder is private or unreadable. In Google Drive, set sharing to 'Anyone with the link' and try again."
    );
    this.name = 'PrivateFolderError';
  }
}

export class FolderNotFoundError extends Error {
  constructor() {
    super('Could not read this folder. The link may be malformed or the folder no longer exists.');
    this.name = 'FolderNotFoundError';
  }
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i;
const FOLDER_ID_CHARS = /[A-Za-z0-9_-]/;
const MIN_FOLDER_ID_LEN = 25;

/**
 * Accept any of:
 *  - https://drive.google.com/drive/folders/ID
 *  - https://drive.google.com/drive/u/0/folders/ID
 *  - https://drive.google.com/drive/folders/ID?usp=sharing
 *  - https://drive.google.com/open?id=ID
 *  - drive.google.com/embeddedfolderview?id=ID
 *  - ?id=ID
 *  - raw ID (25+ chars, base64url)
 */
export function extractFolderId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Try URL parse first.
  try {
    const url = new URL(trimmed);
    const idParam = url.searchParams.get('id');
    if (idParam && /^[A-Za-z0-9_-]+$/.test(idParam) && idParam.length >= MIN_FOLDER_ID_LEN) {
      return idParam;
    }
    const m = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
    if (m && m[1].length >= MIN_FOLDER_ID_LEN) return m[1];
  } catch {
    // not a URL — fall through to raw ID check
  }

  // Strip surrounding junk and try a direct match.
  const m = trimmed.match(/([A-Za-z0-9_-]{25,})/);
  if (m) return m[1];

  return null;
}

export interface DriveFile {
  id: string;
  name: string;
}

/** Minimal HTML entity decoder for the entities Google tends to emit. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

const SIGN_IN_MARKERS = [
  'Sign in to view',
  'you need access',
  'You need access',
  'accounts.google.com',
  'ServiceLogin',
  'signin/v2/identifier',
];

/**
 * Fetch and parse the public embedded folder view.
 * Returns image files only, sorted by name.
 */
export async function fetchDriveImages(folderId: string): Promise<DriveFile[]> {
  const url = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`;

  const res = await fetch(url, {
    headers: {
      // Without a UA, Google sometimes returns a stripped mobile page.
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
    },
    // Don't follow sign-in redirects.
    redirect: 'manual',
  });

  if (res.status === 401 || res.status === 403) {
    throw new PrivateFolderError();
  }
  if (res.status >= 300 && res.status < 400) {
    // Likely redirected to accounts.google.com — treat as private.
    throw new PrivateFolderError();
  }
  if (!res.ok) {
    throw new FolderNotFoundError();
  }

  const html = await res.text();

  // Cheap private-folder check.
  for (const marker of SIGN_IN_MARKERS) {
    if (html.includes(marker)) {
      throw new PrivateFolderError();
    }
  }
  if (html.length < 500) {
    throw new FolderNotFoundError();
  }

  return parseDriveHtml(html);
}

/** Exposed for unit-testability. */
export function parseDriveHtml(html: string): DriveFile[] {
  const byId = new Map<string, string>();

  // Strategy 1: anchor tags of the form /file/d/ID/view.
  // We capture from the nearest preceding text/aria-label when present.
  const anchorRe =
    /<a\b[^>]*href="https?:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)\/view[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html))) {
    const id = m[1];
    const raw = decodeEntities(stripTags(m[2])).trim();
    if (!id) continue;
    if (!byId.has(id) && raw) byId.set(id, raw);
  }

  // Strategy 2: data-id="FILE_ID" with a nearby flip-entry-title or aria-label.
  const dataIdRe = /data-id="([A-Za-z0-9_-]+)"[\s\S]{0,400}?(?:flip-entry-title[^>]*>([\s\S]*?)<\/|aria-label="([^"]+)")/gi;
  while ((m = dataIdRe.exec(html))) {
    const id = m[1];
    const name = decodeEntities(stripTags(m[2] || m[3] || '')).trim();
    if (!id) continue;
    if (!byId.has(id) && name) byId.set(id, name);
  }

  // Strategy 3: aria-label on a div with role=link, sometimes the only signal.
  const ariaRe = /aria-label="([^"]+?\.(?:jpe?g|png|webp|gif|bmp))"[\s\S]{0,400}?\/file\/d\/([A-Za-z0-9_-]+)\/view/gi;
  while ((m = ariaRe.exec(html))) {
    const name = decodeEntities(m[1]).trim();
    const id = m[2];
    if (id && name && !byId.has(id)) byId.set(id, name);
  }

  // Filter to images and clean names.
  const files: DriveFile[] = [];
  for (const [id, name] of byId) {
    if (!IMAGE_EXT.test(name)) continue;
    files.push({ id, name });
  }

  files.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  );

  return files;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}
