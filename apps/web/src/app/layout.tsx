import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// IBM Plex for reading: highly legible, with a mono for hashes, IDs and labels.
// IBM Plex (SIL OFL 1.1, see ./fonts/OFL-*.txt), vendored so builds never depend on reaching Google Fonts.
const plexSans = localFont({
  variable: "--font-plex-sans",
  display: "swap",
  src: [
    { path: "./fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/ibm-plex-sans-latin-700-normal.woff2", weight: "700" },
  ],
});
// Outfit (SIL OFL 1.1, see ./fonts/OFL-Outfit.txt): the display face for headings, one variable file.
const outfit = localFont({
  variable: "--font-outfit",
  display: "swap",
  src: [{ path: "./fonts/outfit-latin-wght-normal.woff2", weight: "100 900" }],
});
const plexMono = localFont({
  variable: "--font-plex-mono",
  display: "swap",
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
  ],
});

export const metadata: Metadata = {
  title: "Proofshot",
  description: "Claim photos that prove themselves: sealed at capture, verifiable by anyone.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0a1f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} ${outfit.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
