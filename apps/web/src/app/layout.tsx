import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import "@/globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ApiReactProvider } from "@/lib/api/client";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const metadataBase = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;

export const metadata: Metadata = {
  ...(metadataBase ? { metadataBase: new URL(metadataBase) } : {}),
  title: {
    default: "GradientPeak",
    template: "%s | GradientPeak",
  },
  description:
    "GradientPeak helps athletes train, coach, and stay on top of endurance performance.",
  applicationName: "GradientPeak",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-background text-foreground font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ApiReactProvider>
            <AuthProvider>{children}</AuthProvider>
          </ApiReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
