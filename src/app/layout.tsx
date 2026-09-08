import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loop — Your world, a little closer",
  description: "Your people. Your moments. Share a little inspiration, discover something new, and stay connected with real-time conversations on Loop.",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  applicationName: "Loop",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
