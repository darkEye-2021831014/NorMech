/**
 * <Logo size /> — the Marginalia mark. Renders the same SVG as
 * `src/app/icon.svg` (which is the favicon), but as a React
 * component for use in top bars and inline headers.
 *
 * The mark is a rounded-square ink tile with a thick serif "M"
 * in the paper color and a small vermilion dot at the top-right
 * corner. It works on both light and dark backgrounds because
 * the tile itself is always solid ink — it never disappears.
 *
 * The `size` prop controls width/height in pixels (default 24).
 * The wrapper accepts a className for color (the inner M uses
 * `currentColor` so callers can flip the paper text via the
 * standard `text-paper` / `text-paperStrong` / `text-ink`
 * utility).
 */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Rounded-square ink tile. The fill is the literal ink hex
          so the component renders correctly even when callers
          don't pass a color class. */}
      <rect x="0" y="0" width="64" height="64" rx="10" fill="#14120F" />
      {/* Serif "M" in the paper color. The text uses fill so it
          stays legible regardless of the parent text color. */}
      <text
        x="32"
        y="46"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="700"
        fontSize="38"
        letterSpacing="-1"
        fill="#F4EFE6"
      >
        M
      </text>
      {/* Vermilion marginalia dot in the top-right corner. */}
      <circle cx="51" cy="13" r="5" fill="#B02B0F" />
    </svg>
  );
}
