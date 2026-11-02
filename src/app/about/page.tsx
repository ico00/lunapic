import { Bricolage_Grotesque, JetBrains_Mono, Manrope } from "next/font/google";
import { cookies, headers } from "next/headers";
import { PageTopBar } from "@/components/shell/PageTopBar";
import { AboutStory } from "./AboutStory";
import { ABOUT_LANG_COOKIE, resolveAboutLang } from "./aboutLang";
import { ABOUT_FAQ } from "./aboutStoryContent";

const displayFont = Bricolage_Grotesque({
  variable: "--font-about-display",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
});
const bodyFont = Manrope({
  variable: "--font-about-body",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});
const monoFont = JetBrains_Mono({
  variable: "--font-about-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600"],
});

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: ABOUT_FAQ.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

export default async function AboutPage() {
  // Server bira jezik da prvi prikaz ne zatreperi s drugog jezika (spec §2b.9).
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const lang = resolveAboutLang(
    cookieStore.get(ABOUT_LANG_COOKIE)?.value,
    headerList.get("accept-language")
  );

  return (
    <div className="flex min-h-dvh shrink-0 flex-col">
      <script
        type="application/ld+json"
        // Safe here: source is local static content, not user-generated.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <PageTopBar current="about" />
      <AboutStory
        lang={lang}
        fontClassName={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
      />
    </div>
  );
}
