import type { Metadata, Viewport } from "next";
import { Archivo, Archivo_Narrow, IBM_Plex_Mono } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

/**
 * Three faces, each with a job.
 *
 * Archivo carries the UI and the display type. Archivo Narrow does the block lettering — the
 * uppercase, tracked labels on table headers and metric captions, like the printed headings on a
 * duty roster. IBM Plex Mono does every operational figure: times, counts, employee numbers and
 * ids, because a duty roster is a columnar document and columns must align.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const archivoNarrow = Archivo_Narrow({
  variable: "--font-archivo-narrow",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SecHive — Know Who's on Guard",
    template: "%s · SecHive",
  },
  description:
    "SecHive gives security companies, supervisors and clients visibility into guard deployment, duty assignments and site coverage.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0e1419" },
    { media: "(prefers-color-scheme: light)", color: "#f7f9fa" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${archivo.variable} ${archivoNarrow.variable} ${plexMono.variable}`}
    >
      <body className="min-h-svh bg-background text-foreground">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
