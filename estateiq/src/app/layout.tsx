import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { DemoRibbon } from "@/components/demo-ribbon";
import { MotionProvider } from "@/components/ui/motion";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });

export const metadata: Metadata = {
  title: { default: "EstateIQ — Better homes. Better terms. Together.", template: "%s · EstateIQ" },
  description:
    "Discover Mumbai's upcoming residential projects, connect with like-minded homebuyers, and help unlock preferential buying opportunities through collective demand.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = { themeColor: "#0a1322", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`}>
      <body>
        <DemoRibbon />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
