import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "UBEC Grant Portal",
  description: "Annual grant planning and submission for State Universal Basic Education Boards.",
  icons: {
    icon: { url: "/ubec-logo.png", type: "image/png" },
    shortcut: "/ubec-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Toaster theme="light" position="top-right" />
      </body>
    </html>
  );
}
