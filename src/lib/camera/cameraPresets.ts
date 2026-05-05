import type { CameraSensorType } from "@/lib/domain/geometry/shotFeasibility";

export type CameraPresetFixed = {
  readonly kind: "fixed";
  readonly id: string;
  readonly label: string;
  readonly sensorType: CameraSensorType;
  readonly frameWidthPx: number;
  readonly frameHeightPx: number;
};

export type CameraPresetManual = {
  readonly kind: "manual";
  readonly id: string;
  readonly label: string;
};

export type CameraPreset = CameraPresetFixed | CameraPresetManual;

export const OTHER_CAMERA_PRESET_ID = "other" as const;

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  {
    kind: "fixed",
    id: "canon-r6-mark-ii",
    label: "Canon R6 Mk II",
    sensorType: "fullFrame",
    frameWidthPx: 6000,
    frameHeightPx: 4000,
  },  
  {
    kind: "fixed",
    id: "canon-1dx-mark-ii",
    label: "Canon 1DX Mk II",
    sensorType: "fullFrame",
    frameWidthPx: 5472,
    frameHeightPx: 3648,
  },
  {
    kind: "fixed",
    id: "canon-7d-mark-ii",
    label: "Canon 7D Mk II",
    sensorType: "apsC16",
    frameWidthPx: 5472,
    frameHeightPx: 3648,
  },
  {
    kind: "manual",
    id: OTHER_CAMERA_PRESET_ID,
    label: "Other",
  },
  
];

/** Default preset for new sessions (Canon R6 Mk II). */
export const DEFAULT_CAMERA_PRESET_ID =
  CAMERA_PRESETS.find((p) => p.kind === "fixed")?.id ??
  CAMERA_PRESETS[0]!.id;

function firstFixedPreset(): CameraPresetFixed {
  const p = CAMERA_PRESETS.find(
    (x): x is CameraPresetFixed => x.kind === "fixed"
  );
  if (!p) {
    throw new Error("CAMERA_PRESETS must define at least one fixed preset.");
  }
  return p;
}

export function getCameraPresetById(id: string): CameraPreset {
  return CAMERA_PRESETS.find((preset) => preset.id === id) ?? firstFixedPreset();
}
