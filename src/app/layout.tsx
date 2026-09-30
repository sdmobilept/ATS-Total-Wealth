import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Property Wealth Projector",
  description: "Project a property's value and equity from its ZIP code's actual market trend instead of a flat growth rate.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="no-print border-b border-line bg-card">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-white">⌂</span>
              <span className="hidden sm:inline">Property Wealth Projector</span>
              <span className="sm:hidden">Wealth Projector</span>
            </Link>
            <nav className="flex gap-5 text-sm text-ink-2">
              <Link href="/" className="hover:text-ink">Calculator</Link>
              <Link href="/methodology" className="hover:text-ink">Methodology</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line py-6 text-center text-xs text-muted">
          <p className="mx-auto max-w-3xl px-4">
            Home value data: Zillow Home Value Index (ZHVI) and Zillow Home Value Forecast, via Zillow Research.
            Mortgage rates and CPI: Federal Reserve Bank of St. Louis (FRED). Estimates from a market index, not an
            appraisal. Past trends do not guarantee future results.
          </p>
        </footer>
      </body>
    </html>
  );
}
