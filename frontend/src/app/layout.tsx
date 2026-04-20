import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clode",
  description: "Operacyjny frontend Clode w Next.js."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
