import type { Metadata } from "next";
import { CollectorAccountProvider } from "@/components/collector-account";
import "./globals.css";
import "./armory-design.css";
import "./digital-camo.css";
import "./discussions.css";

export const metadata: Metadata = {
  title: "G.I. Jeff",
  description: "Explore the G.I. Joe catalog and record your collection, conditions, parts and photos.",
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
      <body className="antialiased digital-camo"><CollectorAccountProvider>{children}</CollectorAccountProvider></body>
    </html>
  );
}
