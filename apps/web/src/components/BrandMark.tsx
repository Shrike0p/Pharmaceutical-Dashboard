/**
 * A flat, small-size-legible trace of brand.png's hexagon + verification
 * check, for contexts (sidebar header, favicon-adjacent UI) where the full
 * photorealistic mark reads as a soft gray blob at 24-32px. The original PNG
 * remains the mark of record for the landing page and any large placement.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path
        d="M16 2.5 27 9v14l-11 6.5L5 23V9z"
        stroke="var(--color-brand-700)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M11 16.5l3.2 3.2L21.5 12"
        stroke="var(--color-verify-600)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
