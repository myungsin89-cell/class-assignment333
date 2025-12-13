import type { Metadata } from "next";
import "./globals.css";

import GlobalAlert from "@/components/GlobalAlert";

export const metadata: Metadata = {
  title: "반배정 프로그램",
  description: "공정하고 편안한 반배정 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <GlobalAlert />
        {children}
      </body>
    </html>
  );
}
