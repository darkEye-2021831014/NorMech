'use client';

// global-error.tsx is rendered for catastrophic failures that escape
// the root layout. It must render its own <html> and <body> and is
// the only Next.js error boundary that does so.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          color: '#1a1a1a',
          background: '#f5f1e8',
        }}
      >
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <p
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              letterSpacing: 1.2,
              color: '#a33b1f',
              textTransform: 'uppercase',
            }}
          >
            A catastrophic error
          </p>
          <h1
            style={{
              fontSize: 64,
              lineHeight: 0.9,
              margin: '12px 0 0',
              fontWeight: 600,
            }}
          >
            Ink has spilled
          </h1>
          <p style={{ marginTop: 16, lineHeight: 1.55 }}>
            The application could not finish rendering. Reload the page, or
            return to the entrance.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: 11,
                color: '#666',
                marginTop: 12,
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'center',
              marginTop: 24,
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                height: 44,
                padding: '0 20px',
                border: '1px solid #1a1a1a',
                background: '#1a1a1a',
                color: '#f5f1e8',
                cursor: 'pointer',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 13,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                height: 44,
                padding: '0 20px',
                display: 'inline-flex',
                alignItems: 'center',
                border: '1px solid #1a1a1a',
                color: '#1a1a1a',
                textDecoration: 'none',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 13,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Entrance
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
