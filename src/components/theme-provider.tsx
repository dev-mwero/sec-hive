"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Dark by default.
 *
 * SecHive is a 24/7 operational tool used at 02:00 in a dim control room as often as it is in
 * a daylight office, so the console is dark-first. Light mode is a re-tuned theme rather than an
 * inversion — see the `.light` block in globals.css.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
