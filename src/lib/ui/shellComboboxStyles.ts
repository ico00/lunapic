/**
 * Zajedničke Tailwind klase za shell comboboxe (`CameraSensorSelect`, `FlightProviderSelect`)
 * i usklađene kontrole na karti (npr. legenda) — jedan izvor istine za ravnu plohu i akcent.
 */

/** Gumb okidač comboboxa (spec §2b.5: 42px, --ground ispuna, --hair obrub, fokus --observer). */
export const shellComboboxTriggerClass =
  "inline-flex h-[42px] w-full min-w-0 shrink-0 items-center justify-between gap-2 rounded-[var(--r-ctl)] border border-[color:var(--hair)] bg-[color:var(--ground)] px-3 pr-2 text-left text-[length:var(--fs-body)] leading-none text-[color:var(--ink)] outline-none transition-colors duration-150 hover:border-[color:var(--ink-3)] focus-visible:border-[color:var(--observer)]";

/**
 * Redak opcije u listboxu — zajednička baza. Selekcija je **observer** (spec §4 / §4a.2).
 */
export const shellComboboxOptionBaseClass =
  "cursor-pointer select-none rounded-[var(--r-ctl)] px-2.5 py-2 text-left text-[length:var(--fs-body)] outline-none";

/** Odabrana opcija (`aria-selected` / checked). */
export const shellComboboxOptionSelectedClass =
  "bg-[color:var(--panel-2)] font-semibold text-[color:var(--observer-text)]";

/** Neodabrana opcija — hover/fokus na --panel-2. */
export const shellComboboxOptionIdleClass =
  "text-[color:var(--ink)] hover:bg-[color:var(--panel-2)] focus:bg-[color:var(--panel-2)]";

/** Spoji bazu + stanje: `shellComboboxOptionClass(isSelected)`. */
export function shellComboboxOptionClass(selected: boolean): string {
  return `${shellComboboxOptionBaseClass} ${
    selected ? shellComboboxOptionSelectedClass : shellComboboxOptionIdleClass
  }`;
}

/**
 * Portal listbox (`fixed` + `z-[280]`). Dodati inline `style` za `top` / `left` / širinu.
 */
export const shellComboboxListboxPortalClass =
  "fixed z-[280] m-0 max-h-60 list-none overflow-y-auto rounded-[var(--r-ctl)] border border-[color:var(--hair)] bg-[color:var(--panel)] p-1";

/**
 * Portal „Aircraft display” (Layers na karti) — ista ploha kao `mt-glass-elevated`.
 * Dodaj inline `style` za `top` / `left` / `width` / `maxHeight`.
 */
export const shellMapAircraftDisplayPopoverClass =
  "fixed z-[280] m-0 flex flex-col overflow-hidden rounded-[var(--r-panel)] border border-[color:var(--hair)] bg-[color:var(--panel)]";

/**
 * Ravni panel kao izbornik (legenda na karti) — isti materijal, bez `fixed` / z-index portala.
 */
export const shellGlassPanelClass =
  "rounded-[var(--r-ctl)] border border-[color:var(--hair)] bg-[color:var(--panel)]";

/** Checkbox: appearance-none, live ispuna, tamna kvačica (var(--mt-checkbox-mark)), fokus po spec §2b.5. */
export const shellAccentCheckboxClass =
  "h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-[3px] border border-[color:var(--ink-3)] bg-[color:var(--ground)] bg-center bg-no-repeat transition-colors duration-150 checked:border-transparent checked:bg-[color:var(--live)] checked:[background-image:var(--mt-checkbox-mark)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ink)]";

/**
 * Isti checkbox za legendu visine i Layers popover. Ne uključuje margin utilities —
 * dodaj `mt-0.5 sm:mt-0` prema potrebi.
 */
export const shellGlassCheckboxClass = shellAccentCheckboxClass;
