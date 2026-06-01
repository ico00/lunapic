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
  SectionIconAR,
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
  | "ar"
  | "flightlog";

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
  /** Kad je true, rail drawer se širi na ~50 vw umjesto standardnih 420 px. */
  readonly wide?: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Registry                                                                    */
/* -------------------------------------------------------------------------- */

export const PANEL_REGISTRY: readonly PanelDef[] = [
  {
    id: "active",
    label: "Active transits",
    dockLabel: "Active",
    mobileTitle: "Active transits",
    icon: SectionIconPaperAirplane,
    accent: "moon",
    dockPrimary: true,
  },
  {
    id: "candidates",
    label: "Transit candidates",
    dockLabel: "Tracks",
    mobileTitle: "Transit candidates",
    icon: SectionIconArrowsRightLeft,
    accent: "sky",
    dockPrimary: true,
  },
  {
    id: "photo",
    label: "Photographer",
    dockLabel: "Photo",
    mobileTitle: "Photographer — tools",
    icon: SectionIconCamera,
    accent: "mint",
    dockPrimary: true,
  },
  {
    id: "filters",
    label: "Flight filters",
    dockLabel: "Filters",
    mobileTitle: "Flight filters",
    icon: SectionIconFunnel,
    accent: "violet",
    dockPrimary: false,
  },
  {
    id: "moon",
    label: "Moon (nowcast)",
    dockLabel: "Moon",
    mobileTitle: "Moon (nowcast)",
    icon: SectionIconMoon,
    accent: "moon",
    dockPrimary: true,
  },
  {
    id: "observer",
    label: "Observer",
    dockLabel: "Observer",
    mobileTitle: "Observer",
    icon: SectionIconObserver,
    accent: "moon",
    dockPrimary: false,
  },
  {
    id: "ar",
    label: "AR sky overlay",
    dockLabel: "AR",
    mobileTitle: "AR sky overlay",
    icon: SectionIconAR,
    accent: "sky",
    dockPrimary: false,
  },
  {
    id: "compass",
    label: "Compass → Moon",
    dockLabel: "Compass",
    mobileTitle: "Compass → Moon",
    icon: SectionIconArrowUpCircle,
    accent: "rose",
    dockPrimary: false,
  },
  {
    id: "flight",
    label: "Flight source",
    dockLabel: "Source",
    mobileTitle: "Flight source",
    icon: SectionIconFlightSource,
    accent: "violet",
    dockPrimary: false,
  },
  {
    id: "field",
    label: "Field overlays",
    dockLabel: "Field",
    mobileTitle: "Field overlays",
    icon: SectionIconField,
    accent: "mint",
    dockPrimary: false,
  },
  {
    id: "flightlog",
    label: "Flight log",
    dockLabel: "Log",
    mobileTitle: "Flight log",
    icon: SectionIconFlightLog,
    accent: "violet",
    dockPrimary: false,
    wide: true,
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

/** Virtualni "more" panel — ne u registriju ali treba metadata za sheet. */
export const MORE_PANEL_META = {
  id: "more" as const,
  label: "All tools",
  dockLabel: "More",
  mobileTitle: "All tools",
  icon: SectionIconQuestionMarkCircle,
  accent: "violet" as PanelAccent,
};
