import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ABG Pricing Explorer · Underwriting Workbench",
  description: "Review risk classification, coverage indications, proposed pricing profitability, and scenario variances using the ABG actuarial model.",
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
