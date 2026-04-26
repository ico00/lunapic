import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Moon Transit",
  description:
    "Track aircraft transits in front of the Moon — map, ephemeris, ADS-B strategies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
            Moon Transit
          </h1>
          <p className="text-sm text-zinc-500">
            Moon, aircraft, and crossing angle
          </p>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
