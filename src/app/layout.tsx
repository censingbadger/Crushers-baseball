import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
        <footer className="border-t-2 border-ink bg-team-blue-light px-4 py-3 text-center text-xs">
          Crushers Blue ⚾ built for the dugout
        </footer>
      </body>
    </html>
  );
}
