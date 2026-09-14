import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Instagram",
  description: "Share your moments with the world",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  applicationName: "Instagram",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
