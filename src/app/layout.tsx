import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#161513" },
  ],
};

export const metadata: Metadata = {
  applicationName: "Mealtill",
  appleWebApp: { capable: true, title: "Mealtill", statusBarStyle: "black-translucent" },
  title: "Mealtill | Smart mess management",
  description:
    "Meal tracking, shared grocery costs and a fair monthly settlement for messes, hostels and shared homes, wherever you live.",
  keywords: [
    "mess management",
    "meal tracking",
    "shared living",
    "hostel",
    "shared home",
    "expense splitting",
    "meal rate calculator",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
