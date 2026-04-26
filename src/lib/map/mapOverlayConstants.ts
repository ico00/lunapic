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

/** Javni URL SVG ikone zrakoplova na karti (`public/plane_5367346.svg`). */
export const FLIGHT_PLANE_ICON_URL = "/plane_5367346.svg";

/** ID teksture u Mapbox `addImage` (symbol `icon-image`). */
export const FLIGHT_PLANE_ICON_IMAGE_ID = "flight-plane-icon";

/** Relativna veličina ikone (izvorna slika je velika; ~0.06–0.12 je čitko). */
export const FLIGHT_PLANE_ICON_SIZE = 0.09;
