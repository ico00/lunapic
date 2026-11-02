export type AboutLang = "hr" | "en";

export const ABOUT_LANG_COOKIE = "about-lang";

export const ABOUT_TITLE: Record<AboutLang, string> = {
  hr: "Od aviona do LunaPica",
  en: "From Aircraft to LunaPic",
};

function isAboutLang(value: string | null | undefined): value is AboutLang {
  return value === "hr" || value === "en";
}

/** Spremljeni izbor ima prednost, zatim jezik preglednika; bez ikoga engleski, kao ostatak UI-ja. */
export function resolveAboutLang(
  saved: string | null | undefined,
  acceptLanguage: string | null | undefined
): AboutLang {
  if (isAboutLang(saved)) return saved;
  return /^\s*(hr|bs|sr|sh)\b/i.test(acceptLanguage ?? "") ? "hr" : "en";
}

export function readAboutLangCookie(cookie: string): AboutLang | null {
  const value = cookie.match(new RegExp(`(?:^|;\\s*)${ABOUT_LANG_COOKIE}=([^;]*)`))?.[1];
  return isAboutLang(value) ? value : null;
}
