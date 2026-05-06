/** Dužina “zraka” azimuta Mjeseca na karti (m) — dovoljno za presjek s koreidorima. */
export const MOON_AZ_LENGTH_M = 1_200_000;

/**
 * Kraći zrak za 12h moon path: vrhovi su na ~ovoj udaljenosti od promatrača
 * (regionalna skala na karti).
 */
export const MOON_PATH_RAY_LENGTH_M = 200_000;

/** Tipična visina krstarenja za presjeke zraka s rutama (m). */
export const CRUISE_FL_M = 10_000;

/** Polovica „tlocrtne staze” isprekidane trake (optimal ground path). */
export const OPTIMAL_GROUND_HALF_M = 4_000;

/** Polovina širine trake „gdje stati” uz odabrani zrakoplov (m). */
export const SELECTED_STAND_HALF_WIDTH_M = 3_000;
/** Tlocrt: bližnji kraj trake (m) od projekcije zrakoplova, duž 3D LoS back-azimuta. */
export const SELECTED_STAND_NEAR_M = 500;
export const SELECTED_STAND_FAR_M = 40_000;

/**
 * Prikaz trake stajanja na Mapboxu (dijeli se s `useMapMoonHorizonDeemphasis` bright/dim).
 */
export const SELECTED_STAND_MAP_FILL_OPACITY = 0.24;
export const SELECTED_STAND_MAP_LINE_OPACITY = 0.55;
export const SELECTED_STAND_MAP_FILL_OPACITY_DIM = 0.08;
export const SELECTED_STAND_MAP_LINE_OPACITY_DIM = 0.12;
export const SELECTED_STAND_SPINE_LINE_WIDTH = 3.4;
export const SELECTED_STAND_SPINE_LINE_OPACITY = 0.95;
export const SELECTED_STAND_SPINE_LINE_OPACITY_DIM = 0.22;

/**
 * Placeholder 3D model zrakoplova (Mapbox GL JS primjer).
 * @see https://docs.mapbox.com/mapbox-gl-js/example/add-3d-model-and-animate-along-route/
 */
export const FLIGHT_3D_MODEL_URL =
  "https://docs.mapbox.com/mapbox-gl-js/assets/airplane.glb";

/**
 * Statična minijatura istog 3D modela za UI (npr. Layers kontrola). Zamijeni PNG kad promijeniš `FLIGHT_3D_MODEL_URL`.
 */
export const FLIGHT_3D_MODEL_UI_PREVIEW_PATH = "/images/flight-3d-model-thumb.png";

/** ID modela u stilu (`map.addModel` / layout `model-id`). */
export const FLIGHT_3D_MODEL_ID = "lunapic-aircraft-3d";
