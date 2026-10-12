import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { siteName, tagline, shortTagline } from '@/config/brand';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-fraunces',
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

const siteUrl = (() => {
  // Build-time only; falls back to a static URL.
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
})();

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4efe6' },
    { media: '(prefers-color-scheme: dark)', color: '#14120f' },
  ],
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s · ${siteName}`,
  },
  description: `${siteName} — ${tagline.toLowerCase()}. ${shortTagline}.`,
  applicationName: siteName,
  keywords: [
    'image annotation',
    'meme annotation',
    'research instrument',
    'content classification',
    'human labeling',
  ],
  authors: [{ name: siteName }],
  creator: siteName,
  // `?v=3` busts any browser-cached favicon.ico from previous
  // marks (Meme Annotator, Marginalia, etc.).
  icons: {
    icon: [
      { url: '/favicon.ico?v=3', type: 'image/x-icon' },
      { url: '/icon.svg?v=3', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png?v=3',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName,
    title: siteName,
    description: `${tagline}. ${shortTagline}.`,
    images: [
      {
        url: '/opengraph-image.svg',
        width: 1200,
        height: 630,
        alt: `${siteName} — ${tagline}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteName,
    description: `${tagline}. ${shortTagline}.`,
    images: ['/opengraph-image.svg'],
  },
  robots: {
    index: false,
    follow: false,
    // This is a private research instrument; never indexed.
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Inline theme script to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('theme');
                  if (t === 'dark') document.documentElement.classList.add('dark');
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans text-ink antialiased">
        <Providers>
          <div className="relative z-10">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
