import type { Metadata } from 'next';
import { Fraunces, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Hifzoon — Purpose-Built Online Quran Academy Platform',
  description: 'Live 1-on-1 and circle Quran classes with vetted scholars, synchronized Mushaf, daily recitation coach, and transparent monthly report cards. Book a free trial in under 2 minutes.',
  keywords: [
    'Quran Academy',
    'Online Quran Classes',
    'Learn Quran with Tajweed',
    'Hifz Quran Online',
    'Noorani Qaida for Kids',
    'Synchronized Mushaf',
    'Female Quran Teacher',
    'Ijazah Sanad Program'
  ],
  authors: [{ name: 'Hifzoon Academy' }],
  openGraph: {
    title: 'Hifzoon — Purpose-Built Online Quran Academy Platform',
    description: 'Live 1-on-1 Quran classes with vetted scholars, synchronized Mushaf, and transparent parent report cards.',
    url: 'https://hifzoon.com',
    siteName: 'Hifzoon Academy',
    locale: 'en_US',
    type: 'website',
  },
};

import { ScrollToTop } from '@/components/layout/ScrollToTop';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full antialiased scroll-smooth ${fraunces.variable} ${plusJakartaSans.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col bg-[#faf7f1] text-[#10201b] font-sans selection:bg-[#c49a55]/25 selection:text-[#0a1f19]">
        {children}
        <ScrollToTop />
      </body>
    </html>
  );
}
