/**
 * Zajedničke Tailwind klase za shell comboboxe (`CameraSensorSelect`, `FlightProviderSelect`)
 * i usklađene kontrole na karti (npr. legenda) — jedan izvor istine za stakleni panel i akcent.
 */

/** Gumb okidač comboboxa (puna širina, zinc + plavi hover/fokus kao sensor picker). */
export const shellComboboxTriggerClass =
  "inline-flex h-9 w-full min-w-0 shrink-0 items-center justify-between gap-2 rounded-md border border-zinc-700 bg-zinc-900/80 px-2.5 pr-2 text-left text-sm leading-none text-zinc-200 shadow-inner outline-none ring-inset backdrop-blur-sm transition hover:border-blue-500/35 hover:bg-zinc-900 focus:ring-2 focus:ring-blue-500/25";

/**
 * Portal listbox (`fixed` + `z-[280]`). Dodati inline `style` za `top` / `left` / širinu.
 */
export const shellComboboxListboxPortalClass =
  "fixed z-[280] m-0 max-h-60 list-none overflow-y-auto rounded-md border border-zinc-700 bg-zinc-950/98 p-1 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-zinc-800 backdrop-blur-md";

/**
 * Stakleni panel kao izbornik (legenda na karti) — isti materijal, bez `fixed` / z-index portala.
 */
export const shellGlassPanelClass =
  "rounded-md border border-zinc-700 bg-zinc-950/98 shadow-[0_12px_40px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-zinc-800 backdrop-blur-md";

/** Checkbox u skladu s combobox akcentom (plavi prsten kao na triggeru). */
export const shellAccentCheckboxClass =
  "h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-900 text-blue-500 accent-blue-500 outline-none focus:ring-2 focus:ring-blue-500/25";
