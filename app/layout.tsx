import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { SessionKeepalive } from '@/components/session-keepalive';
import "./globals.css";

export const metadata: Metadata = {
  title: "BEAPMS Portal",
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
        <TooltipProvider delayDuration={350} skipDelayDuration={100}>
          <ImpersonationBanner />
          <SessionKeepalive />
          {children}
          <Toaster theme="light" position="top-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
