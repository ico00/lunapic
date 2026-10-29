"use client";

/**
 * Centralna registracija svih panela u LunaPic shellu.
 *
 * Ovo je jedino mjesto koje treba promijeniti kad dodaješ novi panel:
 *  1. Dodaj novi id u `PanelId` union
 *  2. Dodaj `PanelDef` objekt u `PANEL_REGISTRY`
 *  3. U `HomePageClient.renderPanel()` dodaj render case za novi id
 *
 * Sve ostalo (rail, dock, mobile sheet naslovi, accent boje) se derivira
 * automatski iz ovog registrija.
 */

import type { ComponentType, SVGProps } from "react";
import {
  SectionIconCamera,
  SectionIconArrowUpCircle,
  SectionIconField,
  SectionIconFlightSource,
  SectionIconFlightLog,
  SectionIconMoon,
  SectionIconObserver,
  SectionIconArrowsRightLeft,
  SectionIconFunnel,
  SectionIconPaperAirplane,
  SectionIconQuestionMarkCircle,
  SectionIconTime,
} from "@/components/shell/sectionCategoryIcons";

/* -------------------------------------------------------------------------- */
/*  Types                                                                       */
/* -------------------------------------------------------------------------- */

export type PanelAccent = "moon" | "sky" | "mint" | "rose" | "violet";

/** ID svakog pravog panela (bez "more" koji je virtualni grid). */
export type PanelId =
  | "active"
  | "moon"
  | "candidates"
  | "photo"
  | "compass"
  | "field"
  | "observer"
  | "flight"
  | "filters"
  | "flightlog"
  | "planning";

/** ID koji se koristi u sheetu i docku — uključuje i "more" virtualni panel. */
export type SheetId = PanelId | "more";

export type PanelDef = {
  /** Stabilni string ID. */
  readonly id: PanelId;
  /** Puni naziv — rail tooltip, ARIA label. */
  readonly label: string;
  /** Kratki naziv — mobile dock chip. */
  readonly dockLabel: string;
  /** Naslov u mobile sheet headeru. */
  readonly mobileTitle: string;
  /** Ikona komponenta. */
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Accent boja za rail button, sheet header, dock chip. */
  readonly accent: PanelAccent;
  /**
   * Prikazuje se u primary dock redu (max 4).
   * Ostatak je dostupan kroz "More" overlay.
   */
  readonly dockPrimary: boolean;
  /** Kad je true, ploča se širi na ~50 vw umjesto standardnih 408 px. */
  readonly wide?: boolean;
  /** Grupa u lijevom izborniku (spec §2b.5). */
  readonly group: PanelGroupId;
  /** Kratki naziv u izborniku (ikona + tekst). */
  readonly railLabel: string;
};

export type PanelGroupId = "now" | "shoot" | "sky" | "feeds" | "plan";

/** Redoslijed i boja oznake grupa u izborniku (boja = token iz globals.css). */
export const PANEL_GROUPS: readonly {
  readonly id: PanelGroupId;
  readonly label: string;
  readonly ink: string;
}[] = [
  { id: "now", label: "Now", ink: "var(--disc)" },
  { id: "shoot", label: "Shoot", ink: "var(--moon)" },
  { id: "sky", label: "Sky and place", ink: "var(--observer)" },
  { id: "feeds", label: "Feeds", ink: "var(--live)" },
  { id: "plan", label: "Plan", ink: "var(--ink-2)" },
] as const;

/* -------------------------------------------------------------------------- */
/*  Registry                                                                    */
/* -------------------------------------------------------------------------- */

export const PANEL_REGISTRY: readonly PanelDef[] = [
  {
    id: "active",
    group: "now",
    railLabel: "Transits",
    label: "Active transits",
    dockLabel: "Active",
    mobileTitle: "Active transits",
    icon: SectionIconPaperAirplane,
    accent: "moon",
    dockPrimary: true,
  },
  {
    id: "candidates",
    group: "now",
    railLabel: "Candidates",
    label: "Transit candidates",
    dockLabel: "Tracks",
    mobileTitle: "Transit candidates",
    icon: SectionIconArrowsRightLeft,
    accent: "sky",
    dockPrimary: true,
  },
  {
    id: "photo",
    group: "shoot",
    railLabel: "Photographer",
    label: "Photographer",
    dockLabel: "Photo",
    mobileTitle: "Photographer — tools",
    icon: SectionIconCamera,
    accent: "mint",
    dockPrimary: true,
  },
  {
    id: "filters",
    group: "feeds",
    railLabel: "Filters",
    label: "Flight filters",
    dockLabel: "Filters",
    mobileTitle: "Flight filters",
    icon: SectionIconFunnel,
    accent: "violet",
    dockPrimary: false,
  },
  {
    id: "moon",
    group: "sky",
    railLabel: "Moon",
    label: "Moon (nowcast)",
    dockLabel: "Moon",
    mobileTitle: "Moon (nowcast)",
    icon: SectionIconMoon,
    accent: "moon",
    dockPrimary: true,
  },
  {
    id: "observer",
    group: "sky",
    railLabel: "Observer",
    label: "Observer",
    dockLabel: "Observer",
    mobileTitle: "Observer",
    icon: SectionIconObserver,
    accent: "moon",
    dockPrimary: false,
  },
  {
    id: "compass",
    group: "shoot",
    railLabel: "Compass to Moon",
    label: "Compass → Moon",
    dockLabel: "Compass",
    mobileTitle: "Compass → Moon",
    icon: SectionIconArrowUpCircle,
    accent: "rose",
    dockPrimary: false,
  },
  {
    id: "flight",
    group: "feeds",
    railLabel: "Flight source",
    label: "Flight source",
    dockLabel: "Source",
    mobileTitle: "Flight source",
    icon: SectionIconFlightSource,
    accent: "violet",
    dockPrimary: false,
  },
  {
    id: "field",
    group: "shoot",
    railLabel: "Field overlays",
    label: "Field overlays",
    dockLabel: "Field",
    mobileTitle: "Field overlays",
    icon: SectionIconField,
    accent: "mint",
    dockPrimary: false,
  },
  {
    id: "flightlog",
    group: "feeds",
    railLabel: "Flight log",
    label: "Flight log",
    dockLabel: "Log",
    mobileTitle: "Flight log",
    icon: SectionIconFlightLog,
    accent: "violet",
    dockPrimary: false,
    wide: true,
  },
  {
    id: "planning",
    group: "plan",
    railLabel: "Runway planning",
    label: "Runway planning",
    dockLabel: "Plan",
    mobileTitle: "Runway planning",
    icon: SectionIconTime,
    accent: "mint",
    dockPrimary: false,
  },
] as const;

/* -------------------------------------------------------------------------- */
/*  Derived lookups (O(1) access)                                              */
/* -------------------------------------------------------------------------- */

/** Brzi lookup po ID-u. */
export const PANEL_BY_ID = Object.fromEntries(
  PANEL_REGISTRY.map((p) => [p.id, p])
) as Record<PanelId, PanelDef>;

/** Samo paneli koji idu u primary dock red (max 4). */
export const DOCK_PRIMARY_PANELS = PANEL_REGISTRY.filter(
  (p) => p.dockPrimary
);

/** Paneli po grupama, redoslijedom izbornika. */
export const PANELS_BY_GROUP = PANEL_GROUPS.map((g) => ({
  ...g,
  panels: PANEL_REGISTRY.filter((p) => p.group === g.id),
}));

/** Virtualni "more" panel — ne u registriju ali treba metadata za sheet. */
export const MORE_PANEL_META = {
  id: "more" as const,
  label: "All tools",
  dockLabel: "More",
  mobileTitle: "All tools",
  icon: SectionIconQuestionMarkCircle,
  accent: "violet" as PanelAccent,
};
