import { HomePageClient } from "@/components/shell/HomePageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LunaPic | Live Aircraft Moon Transit Predictor & Planner",
  description:
    "Plan and capture the perfect aircraft moon transit. Featuring real-time ADS-B flight feeds, precise sensor and lens simulation, and dynamic transit corridors. Don't just wait—intercept. Optimized for enthusiast aviation photography.",
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return <HomePageClient />;
}
