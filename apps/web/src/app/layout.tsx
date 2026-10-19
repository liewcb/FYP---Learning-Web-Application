import type { Metadata } from "next";
import { Sora } from "next/font/google";
import { cookies } from "next/headers";

import { parseTheme, themeCookieName } from "@/models/preferences/theme.model";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Athenix",
    template: "%s | Athenix",
  },
  description:
    "Upload your notes, let AI surface the key ideas, then study them with your peers.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // A saved choice wins; without one, CSS follows the system setting.
  const theme = parseTheme((await cookies()).get(themeCookieName)?.value);

  return (
    <html
      lang="en"
      className={`${sora.variable} h-full antialiased`}
      data-theme={theme ?? undefined}
      // The theme toggle updates data-theme in the browser.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
