import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Wealth and Life Management by havenoinsta",
  description: "Private personal finance telemetry",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-dark-tremor-background-muted text-dark-tremor-content antialiased">
        {children}
      </body>
    </html>
  );
}
