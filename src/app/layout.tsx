import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vist — your launch ad, made by an agent",
  description: "Paste your product URL. Vist uses your product, finds what's great, and cuts a motion-graphics ad with an original soundtrack.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[13px] font-bold text-background">V</span>
            Vist
          </Link>
          <div className="flex items-center gap-6 text-sm text-muted">
            <Link href="/#how" className="hover:text-ink">How it works</Link>
            <span className="rounded-full border border-line px-3 py-1 text-xs">Invite only · Built with Meta Muse</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
