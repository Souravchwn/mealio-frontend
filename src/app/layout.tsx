import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mealio — Smart Mess Management",
  description:
    "Automate meal tracking, expense splitting, and monthly settlements for shared living. Built for the mess culture of Bangladesh & India.",
  keywords: [
    "mess management",
    "meal tracking",
    "shared living",
    "Bangladesh",
    "India",
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
