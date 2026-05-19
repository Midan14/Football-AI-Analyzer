import type { Metadata } from "next";
import { LayoutProviders } from "./layout-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Football AI Analyzer",
  description: "Análisis avanzado de fútbol por país, liga y partido.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Football AI",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head />
      <body suppressHydrationWarning>
        <LayoutProviders>
          {children}
        </LayoutProviders>
      </body>
    </html>
  );
}
