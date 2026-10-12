/** @type {import('next').NextConfig} */

// Image host whitelist — every <Image> src must be on this list.
// Drive files are served through our own /api/image/[imageId] proxy
// (which lives on the same origin), so we only need the proxy host
// to be allowed. We still allow the Drive thumbnail and the lh3 host
// in case we ever embed them directly.
const REMOTE_IMAGE_HOSTS = [
  'drive.google.com',
  'lh3.googleusercontent.com',
  'drive.usercontent.google.com',
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: REMOTE_IMAGE_HOSTS.map((hostname) => ({
      protocol: 'https',
      hostname,
    })),
  },
  poweredByHeader: false,
  // Apply security headers to every response. The CSP is tight by
  // default: scripts/styles only from 'self' (Next inlines styles
  // with a hash in production), images from our own origin and
  // Drive's CDN, frames denied, no third-party connections.
  async headers() {
    // Next.js 14 dev mode uses eval() in its HMR / Fast Refresh
    // runtime; in production it does not. We only relax `script-src`
    // to allow `unsafe-eval` in dev — production keeps the strict
    // policy.
    const isDev = process.env.NODE_ENV !== 'production';
    const csp = [
      `default-src 'self'`,
      // Next.js inlines a tiny theme-init script in <head>; allow it.
      // 'unsafe-eval' is only added in dev (see above).
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      // Next 14 inlines some styles during dev; in prod they're linked.
      // 'unsafe-inline' is required for the framer-motion runtime that
      // sets style.transform on elements.
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: blob: ${REMOTE_IMAGE_HOSTS.join(' ')}`,
      `font-src 'self' data:`,
      // API calls go to /api/* on the same origin. In dev we also
      // need to allow webpack's HMR websocket.
      `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
      // Embedding is explicitly denied.
      `frame-ancestors 'none'`,
      `frame-src 'self'`,
      `object-src 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;