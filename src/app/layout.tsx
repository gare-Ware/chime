import type { Metadata, Viewport } from "next";
import { Cormorant, Space_Mono } from "next/font/google";
import "./globals.css";

// Content voice: Cormorant, a variable serif (wght 300–700). The wordmark inks
// in along its wght axis (see lib/motion.ts INK_*). Exposed only as the
// semantic --font-display hook: swap the face here and nowhere else.
const displayFont = Cormorant({
  variable: "--font-display",
  subsets: ["latin"],
});

// Control voice: Space Mono. Hints, chips, the drawer. Never the serif on
// pressables.
const controlFont = Space_Mono({
  variable: "--font-control",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "CHIME",
  description:
    "A gateway strung like an instrument. Strum it, pluck it, stand on a step for a drone.",
};

export const viewport: Viewport = {
  themeColor: "#0e0a1c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${displayFont.variable} ${controlFont.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
