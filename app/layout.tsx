import type { Metadata } from "next";
import "./globals.css";
import "./armory-design.css";

export const metadata: Metadata = {
  title: "G.I. Jeff's Files",
  description: "Explore the G.I. Joe catalog and record your collection, conditions, parts and photos.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
