import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

const display = localFont({
  src: [
    { path: "../fonts/barlow-condensed-600.woff2", weight: "600" },
    { path: "../fonts/barlow-condensed-700.woff2", weight: "700" },
    { path: "../fonts/barlow-condensed-800.woff2", weight: "800" },
  ],
  variable: "--font-display",
  display: "swap",
});

const body = localFont({
  src: [{ path: "../fonts/manrope-var.woff2", weight: "200 800" }],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Crushers Blue",
  description: "Team manager for Crushers Blue travel baseball",
};

export const viewport: Viewport = {
  themeColor: "#9BCBEB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${display.variable} ${body.variable}`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-line px-4 py-4 text-center text-xs font-semibold text-muted">
          Crushers Blue ⚾ built for the dugout
        </footer>
      </body>
    </html>
  );
}
