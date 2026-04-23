import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DEFAULT_THEME, getThemeInitScript } from "@/lib/theme/theme";
import {
  DEFAULT_SIDEBAR_COLLAPSED,
  getSidebarInitScript
} from "@/lib/ui/app-shell-preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clode",
  description: "Operacyjny frontend Clode w Next.js."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="pl"
      data-theme={DEFAULT_THEME}
      data-sidebar-collapsed={DEFAULT_SIDEBAR_COLLAPSED ? "true" : "false"}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: getThemeInitScript() }} />
        <script dangerouslySetInnerHTML={{ __html: getSidebarInitScript() }} />
        {children}
      </body>
    </html>
  );
}
