import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar Local — Prospecção qualificada",
  description: "Encontra e qualifica negócios locais com evidências públicas.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt">
      <body>{children}</body>
    </html>
  );
}
