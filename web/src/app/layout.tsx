import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Spread It · $SPREAD, strain tracker',
  description:
    'Carriers spread the strain. Pool distributes live, weighted by R-share. Drain your bag and you are quarantined.',
  openGraph: {
    title: 'Spread It · $SPREAD',
    description:
      'Hold to qualify. Spread to earn. Drain to quarantine. Live R-score reporting on Solana.',
    type: 'website',
    siteName: 'Spread It',
  },
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg-base text-text-primary">{children}</body>
    </html>
  );
}
