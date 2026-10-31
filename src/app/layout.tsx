import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brandVars } from "@/modules/tenancy/brand";
import { getThemeForSession } from "@/modules/tenancy/theme-service";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Antrian | Operasional bisnis lebih tertata",
  description:
    "Kelola antrean, booking, cabang, dan pengalaman pelanggan dari satu platform.",
  /** Favicon bawaan; workspace dashboard menggantinya dengan logo bisnis. */
  icons: { icon: "/icon.svg" },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Layar 404/500 dirender di dalam root layout; tanpa warna di sini, halaman
  // galat memakai palet bawaan walau pengguna sedang masuk ke workspace.
  const theme = await getThemeForSession();
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" style={brandVars(theme)}>
        {children}
      </body>
    </html>
  );
}
