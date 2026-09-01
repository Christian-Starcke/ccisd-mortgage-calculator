import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fort Bend ISD Mortgage & Affordability Calculator",
  description:
    "Model a home purchase in Fort Bend ISD with real local tax rates, MUD districts, and every first-time buyer assistance program that lowers your cost.",
  appleWebApp: {
    capable: true,
    title: "FBISD Mortgage Calc",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f7f6",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
