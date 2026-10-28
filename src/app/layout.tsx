import { JetBrains_Mono, Overpass } from "next/font/google";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/seo/site";
import "./globals.css";

const overpass = Overpass({
  variable: "--font-overpass",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LunaPic | Live Aircraft Moon Transit Predictor & Planner",
    template: "%s | LunaPic",
  },
  description:
    "Plan and capture the perfect aircraft moon transit. Featuring real-time ADS-B flight feeds, precise sensor and lens simulation, and dynamic transit corridors. Don't just wait—intercept. Optimized for enthusiast aviation photography.",
  applicationName: "LunaPic",
  keywords: [
    "moon transit planner",
    "aircraft moon transit",
    "astrophotography planner",
    "moon photography",
    "OpenSky flight tracking",
    "transit timing",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "LunaPic",
    title: "LunaPic | Live Aircraft Moon Transit Predictor & Planner",
    description:
      "Plan and capture the perfect aircraft moon transit. Featuring real-time ADS-B flight feeds, precise sensor and lens simulation, and dynamic transit corridors. Don't just wait—intercept. Optimized for enthusiast aviation photography..",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "LunaPic | Live Aircraft Moon Transit Predictor & Planner",
    description:
      "Plan and capture the perfect aircraft moon transit. Featuring real-time ADS-B flight feeds, precise sensor and lens simulation, and dynamic transit corridors. Don't just wait—intercept. Optimized for enthusiast aviation photography..",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "photography",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${overpass.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="mt-app-bg flex min-h-0 min-h-full flex-col text-[color:var(--ink)]">
        <main className="mt-app-bg-main flex min-h-0 min-h-dvh flex-1 flex-col bg-transparent">
          {children}
        </main>
      </body>
    </html>
  );
}
