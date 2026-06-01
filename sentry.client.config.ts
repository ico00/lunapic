import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Hvata greške u produkciji; u developmentu dovoljno je konzolno logiranje
  enabled: process.env.NODE_ENV === "production",

  // Postotak performansnih transakcija koje se šalju Sentryju (0.0–1.0)
  // Za mali projekt s malo prometa 10% je sasvim dovoljno
  tracesSampleRate: 0.1,

  // Postotak session replaya (hvata klikove/scroll kad dođe do greške)
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.0, // Ne snimaj normalne sesije, samo one s greškom

  integrations: [
    Sentry.replayIntegration({
      // Maskira sve inpute i tekst radi privatnosti korisnika
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
});
