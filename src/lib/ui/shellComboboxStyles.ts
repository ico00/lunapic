/**
 * Zajedničke Tailwind klase za shell comboboxe (`CameraSensorSelect`, `FlightProviderSelect`)
 * i usklađene kontrole na karti (npr. legenda) — jedan izvor istine za stakleni panel i akcent.
 */

/** Gumb okidač comboboxa (puna širina, zinc + sky hover, emerald fokus ring per design system). */
export const shellComboboxTriggerClass =
  "inline-flex h-9 w-full min-w-0 shrink-0 items-center justify-between gap-2 rounded-md border border-zinc-700 bg-zinc-900/80 px-2.5 pr-2 text-left text-sm leading-none text-zinc-200 shadow-inner outline-none ring-inset backdrop-blur-sm transition hover:border-sky-500/35 hover:bg-zinc-900 focus:ring-2 focus:ring-emerald-500/50";

/**
 * Portal listbox (`fixed` + `z-[280]`). Dodati inline `style` za `top` / `left` / širinu.
 */
export const shellComboboxListboxPortalClass =
  "fixed z-[280] m-0 max-h-60 list-none overflow-y-auto rounded-md border border-zinc-700 bg-zinc-950/98 p-1 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-zinc-800 backdrop-blur-md";

/**
 * Portal „Aircraft display” (Layers na karti) — `glass-*` tokeni kao kod `mt-glass-elevated`, ne zinc combobox lista.
 * Dodaj inline `style` za `top` / `left` / `width` / `maxHeight`.
 */
export const shellMapAircraftDisplayPopoverClass =
  "fixed z-[280] m-0 flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--glass-stroke)] bg-[color:var(--glass-3)] shadow-[var(--shadow-2)] ring-1 ring-inset ring-[color:var(--glass-highlight)] backdrop-blur-xl backdrop-saturate-150";

/**
 * Stakleni panel kao izbornik (legenda na karti) — isti materijal, bez `fixed` / z-index portala.
 */
export const shellGlassPanelClass =
  "rounded-md border border-zinc-700 bg-zinc-950/98 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-zinc-800 backdrop-blur-md";

/** Checkbox: appearance-none, emerald fill, tamna kvačica (var(--mt-checkbox-mark)), emerald fokus ring. */
export const shellAccentCheckboxClass =
  "h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-zinc-600 bg-zinc-900 bg-center bg-no-repeat outline-none transition-colors checked:border-transparent checked:bg-emerald-500 checked:[background-image:var(--mt-checkbox-mark)] focus:ring-2 focus:ring-emerald-500/50";

/**
 * Checkbox na staklenom panelu — glass-1 pozadina, emerald fill, isti vizualni jezik kao
 * legenda visine i svi on/off prekidači unutar mt-glass-elevated ili glass popovera.
 * Ne uključuje margin utilities — dodaj `mt-0.5 sm:mt-0` prema potrebi.
 */
export const shellGlassCheckboxClass =
  "h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-white/15 bg-[color:var(--glass-1)] bg-center bg-no-repeat outline-none transition-colors checked:border-transparent checked:bg-emerald-500 checked:[background-image:var(--mt-checkbox-mark)] focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-0";
