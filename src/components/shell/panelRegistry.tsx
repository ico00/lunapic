"use client";

/**
 * Centralna registracija svih panela u LunaPic shellu.
 *
 * Ovo je jedino mjesto koje treba promijeniti kad dodaješ novi panel:
 *  1. Dodaj novi id u `PanelId` union
 *  2. Dodaj `PanelDef` objekt u `PANEL_REGISTRY`
 *  3. U `HomePageClient.renderPanel()` dodaj render case za novi id
 *
 * Sve ostalo (izbornik, mobilna traka, popis "More", naslovi ploča) se derivira
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
  SectionIconStreetView,
  SectionIconTime,
} from "@/components/shell/sectionCategoryIcons";

/* -------------------------------------------------------------------------- */
/*  Types                                                                       */
/* -------------------------------------------------------------------------- */

/** ID svakog panela, isti na desktopu i telefonu. */
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
  | "forecast"
  | "planning";

export type PanelDef = {
  /** Stabilni string ID. */
  readonly id: PanelId;
  /** Puni naziv: naslov ploče, tooltip, ARIA label. */
  readonly label: string;
  /** Ikona komponenta. */
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Kad je true, ploča se širi na ~50 vw umjesto standardnih 408 px. */
  readonly wide?: boolean;
  /** Grupa u lijevom izborniku (spec §2b.5). */
  readonly group: PanelGroupId;
  /** Kratki naziv u izborniku (ikona + tekst). */
  readonly railLabel: string;
};

export type PanelGroupId = "now" | "shoot" | "sky" | "feeds" | "plan";

/** Redoslijed grupa; `ink` je token iz globals.css za oznaku grupe. */
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
    icon: SectionIconPaperAirplane,
  },
  {
    id: "candidates",
    group: "now",
    railLabel: "Candidates",
    label: "Transit candidates",
    icon: SectionIconArrowsRightLeft,
  },
  {
    id: "photo",
    group: "shoot",
    railLabel: "Photographer",
    label: "Photographer",
    icon: SectionIconCamera,
  },
  {
    id: "filters",
    group: "feeds",
    railLabel: "Filters",
    label: "Flight filters",
    icon: SectionIconFunnel,
  },
  {
    id: "moon",
    group: "sky",
    railLabel: "Moon",
    label: "Moon (nowcast)",
    icon: SectionIconMoon,
  },
  {
    id: "observer",
    group: "sky",
    railLabel: "Observer",
    label: "Observer",
    icon: SectionIconObserver,
  },
  {
    id: "compass",
    group: "shoot",
    railLabel: "Compass to Moon",
    label: "Compass → Moon",
    icon: SectionIconArrowUpCircle,
  },
  {
    id: "flight",
    group: "feeds",
    railLabel: "Flight source",
    label: "Flight source",
    icon: SectionIconFlightSource,
  },
  {
    id: "field",
    group: "shoot",
    railLabel: "Field overlays",
    label: "Field overlays",
    icon: SectionIconField,
  },
  {
    id: "flightlog",
    group: "feeds",
    railLabel: "Flight log",
    label: "Flight log",
    icon: SectionIconFlightLog,
    wide: true,
  },
  {
    id: "forecast",
    group: "plan",
    railLabel: "Transit forecast",
    label: "Transit forecast",
    icon: SectionIconStreetView,
  },
  {
    id: "planning",
    group: "plan",
    railLabel: "Runway planning",
    label: "Runway planning",
    icon: SectionIconTime,
  },
] as const;

/* -------------------------------------------------------------------------- */
/*  Derived lookups (O(1) access)                                              */
/* -------------------------------------------------------------------------- */

/** Brzi lookup po ID-u. */
export const PANEL_BY_ID = Object.fromEntries(
  PANEL_REGISTRY.map((p) => [p.id, p])
) as Record<PanelId, PanelDef>;

/** Paneli po grupama, redoslijedom izbornika. */
export const PANELS_BY_GROUP = PANEL_GROUPS.map((g) => ({
  ...g,
  panels: PANEL_REGISTRY.filter((p) => p.group === g.id),
}));

/** Telefon: paneli na jedan dodir; sve ostalo je u popisu "More". */
export const MOBILE_TAB_PANELS: readonly { readonly id: PanelId; readonly tabLabel: string }[] = [
  { id: "active", tabLabel: "Active" },
  { id: "candidates", tabLabel: "Candidates" },
  { id: "photo", tabLabel: "Photo" },
  { id: "moon", tabLabel: "Moon" },
] as const;

export function isMobileTabPanel(id: PanelId): boolean {
  return MOBILE_TAB_PANELS.some((tab) => tab.id === id);
}

/** Popis "More": grupe bez panela koji su već na donjoj traci. */
export const MOBILE_MORE_GROUPS = PANELS_BY_GROUP.map((group) => ({
  ...group,
  panels: group.panels.filter((panel) => !isMobileTabPanel(panel.id)),
})).filter((group) => group.panels.length > 0);
