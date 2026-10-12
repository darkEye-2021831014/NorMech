import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

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
    { media: '(prefers-color-scheme: light)', color: '#f5f1e8' },
    { media: '(prefers-color-scheme: dark)', color: '#15130f' },
  ],
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Meme Annotator — Archivist's Notebook",
    template: '%s · Meme Annotator',
  },
  description:
    'A scholarly instrument for the slow, attentive annotation of meme imagery. Mark each leaf with a single question: where does the harm live?',
  applicationName: 'Meme Annotator',
  keywords: [
    'meme annotation',
    'image labeling',
    'content moderation',
    'harm classification',
    'research instrument',
  ],
  authors: [{ name: 'The Archivist' }],
  creator: 'The Archivist',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Meme Annotator',
    title: "Meme Annotator — Archivist's Notebook",
    description:
      'A reading room for the picture that travels. Slow, attentive annotation of meme imagery.',
    images: [
      {
        url: '/opengraph-image.svg',
        width: 1200,
        height: 630,
        alt: "Meme Annotator — A reading room for the picture that travels",
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Meme Annotator — Archivist's Notebook",
    description:
      'A reading room for the picture that travels. Slow, attentive annotation of meme imagery.',
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
