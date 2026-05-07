import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "About / FAQ",
  description:
    "Plan and capture the perfect aircraft moon transit. Featuring real-time ADS-B flight feeds, precise sensor and lens simulation, and dynamic transit corridors. Don't just wait—intercept. Optimized for enthusiast aviation photography.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    url: "/about",
    title: "LunaPic About / FAQ",
    description:
      "Plan and capture the perfect aircraft moon transit. Featuring real-time ADS-B flight feeds, precise sensor and lens simulation, and dynamic transit corridors. Don't just wait—intercept. Optimized for enthusiast aviation photography.",
  },
  twitter: {
    title: "LunaPic About / FAQ",
    description:
      "Plan and capture the perfect aircraft moon transit. Featuring real-time ADS-B flight feeds, precise sensor and lens simulation, and dynamic transit corridors. Don't just wait—intercept. Optimized for enthusiast aviation photography.",
  },
};

export default function AboutLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
