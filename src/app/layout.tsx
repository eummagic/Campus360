import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campus360",
  description: "Campus operations and student self-service",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}