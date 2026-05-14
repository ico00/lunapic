# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Gdje pisati kod

Sesija može biti otvorena u worktreeu (`/.claude/worktrees/…`), ali dev server uvijek radi iz glavnog direktorija (`/Users/icom4/Documents/VibeCode/MoonTransit/`). **Uvijek piši promjene u oba direktorija istovremeno**, ili — bolje — pitaj korisnika koji direktorij je relevantan prije nego počneš. Nikad ne pretpostavljaj da je worktree jedino mjesto.

# Prije pisanja nove komponente ili UI elementa

1. **Pronađi konkretan primjer** sličnog elementa u istom direktoriju (`grep`, `Read`). Ne oslanjaj se na opis iz Explore agenta — pročitaj stvarni kod.
2. **Provjeri kako shell okružuje sadržaj** — u ovom projektu rail/sheet panel već daje naslov i vizualni okvir. Komponente koje se renderiraju unutar `renderPanel()` vraćaju **goli sadržaj bez omotača** (`ShellSectionCard` ili sličnog). Dodavanje vlastitog omotača rezultira duplikacijom naslova i okvira.
3. **Primjer ispravnog uzorka** (iz `HomePageClient.tsx`): `CompassAimPanel` i `FieldOverlaysSection` vraćaju plain `<div>` — shell renderira naslov iz `MOBILE_PANEL_TITLES` / `RAIL_ITEMS` automatski.