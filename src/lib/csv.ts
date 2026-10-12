// CSV helpers shared between the annotator's download endpoint and the
// admin's per-user / per-dataset exports. RFC 4180 escaping + UTF-8 BOM
// for Excel compatibility, plus formula-injection protection.

/**
 * Characters that spreadsheet apps treat as the start of a formula.
 * Cells starting with one of these get prefixed with a single quote
 * so they render as text, not as a live formula. OWASP CSV-injection
 * reference: https://owasp.org/www-community/attacks/CSV_Injection
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** RFC 4180 field escaping + formula-injection guard. */
export function csvField(v: string): string {
  let s = v;
  // Formula injection: prefix a single quote. The quote makes the
  // cell text-only in Excel/Sheets; most tools strip it on display.
  if (s.length > 0 && FORMULA_LEAD.test(s)) {
    s = "'" + s;
  }
  // Standard RFC 4180 escaping.
  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(values: string[]): string {
  return values.map(csvField).join(',');
}

/** Build a CSV body with header + body rows, BOM + CRLF. */
export function buildCsv(header: string[], rows: string[][]): string {
  const BOM = '\uFEFF';
  const lines: string[] = [csvRow(header)];
  for (const r of rows) {
    lines.push(csvRow(r));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}

/**
 * Sanitize for a filesystem filename. Keeps Unicode letters (Bengali, etc.),
 * collapses runs of forbidden characters to a single underscore, and caps
 * the length so we don't overflow Content-Disposition limits.
 */
export function sanitizeForFilename(name: string): string {
  const cleaned = name
    .normalize('NFKC')
    .replace(/[\s/\\:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();
  return cleaned.slice(0, 80) || 'annotator';
}

/**
 * RFC 5987 Content-Disposition. The ascii name is a safe fallback
 * (the only characters that get replaced are non-printable / non-ASCII),
 * the utf8 name preserves the original.
 */
export function contentDisposition(asciiName: string, utf8Name: string): string {
  const safeAscii = asciiName.replace(/[^\x20-\x7e]/g, '_');
  return (
    `attachment; filename="${safeAscii}"; ` +
    `filename*=UTF-8''${encodeURIComponent(utf8Name)}`
  );
}