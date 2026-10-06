import type { Metadata } from "next";
import "./globals.css";
import "./armory-design.css";

export const metadata: Metadata = {
  title: "The Joe Armory",
  description: "Your G.I. Joe collection, condition records, market references, and missing releases.",
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
