# Using LunaPic (product walkthrough)

**Audience:** photographers and planners (not the codebase). **UI** is in English; this document matches the app’s terminology.

## What the app is for

LunaPic helps you **line up a live ADS-B aircraft** with the **Moon** in the sky from a **fixed place on the ground** (the **observer**). The map, time control, and side panels work together to show **when and where** the moon is, **where flights are**, and how close you are to a good **lunar transit** frame.

## What you do (typical flow)

1. **Set the observer** (your shooting location)
  - Default is a fixed **balcony** point in Zagreb (with ground height); you can use GPS, place the **camera marker** on the map, or type coordinates.  
  - *Rule in the app:* all moon and alignment math uses this point — **not** “whatever the map is centered on” unless you explicitly set the observer from the map.
  - **Ground elevation (Observer panel):** many browsers **do not** return GPS **altitude**. In that case the app fills **ground height** from the **Mapbox terrain model** after the map loads, or whenever you **move the camera marker** (same model when you place the observer from the map). If your device **does** report altitude, that value is kept for the observer height instead.
2. **Sync time (optional)**
  - On load, the app syncs to **now**; use **Sync** in the shell when you want the simulated time to jump back to the real time window.
3. **Move the time slider**
  - **Sync** pins the **left** end of the slider to real **now**; you scrub **forward** up to about **24 hours** (one civil day). **Moonrise and moonset** still appear in the Moon panel and still define the **highlighted** part of the moon path on the map; you can scrub ahead to plan outside that arc.  
  - The **time in the header** is the **simulated** instant: ephemeris, flight positions (extrapolation), and map overlays follow that instant. A **dot + time label** on the moon path marks that same instant so it is not confused with the fixed clock labels along the arc.  
  - **Tip:** the Moon returns to about the same compass direction after roughly **24h 50m** (a lunar day), not after exactly 24h — so the **right** end of the slider (now + 24h) is **not** the same point on the path as **Sync** (now).
4. **Choose a flight data source (Provider)** — on a fresh load the app uses **OpenSky + ADS-B One together** (merged live fetch); narrow to one feed in the combobox menu if you prefer.
  - **OpenSky (ADS-B)** — live traffic for a **bounded region** around your **observer** and the **map view** (via the app’s server route; no OpenSky key in the browser). The map may **briefly retain** symbols between refreshes so tracking feels steadier on phones.  
  - **ADS-B One** — alternate live feed (also proxied); same geometry rules; different upstream coverage and rate limits than OpenSky.  
  - **Other apps (FlightRadar24, …):** they are **different** data products — other receiver networks, MLAT, or partner feeds — so a plane you see there may **not** appear in LunaPic for the feed you picked (and vice versa).  
  - Open the **Provider** menu to **toggle OpenSky and/or ADS-B One** (checkboxes); same aircraft (**ICAO24**) is shown once with merged data when both are on.
5. **Pan / zoom the map**
  - The map starts in a **flat (2D) view** (no tilt). To **tilt or rotate in 3D**, use the **right mouse button** and drag on the map (Mapbox’s default), or the **+ / − pitch** controls on the map’s navigation widget; on touch devices a **two-finger** tilt still works. Flights re-load for the current bounds (and for OpenSky also when the **observer** moves). The observer stays where you set it unless you change it.
6. **Pick a flight (optional)**
  - Click an aircraft to select it. You get a **stand corridor** (cyan ground band) and a **pale center line** showing where to be on the ground, for the **current simulated time**, using the aircraft’s **altitude** in the line-of-sight model.
7. **Read the “photographer” side** (wide layout: right column)
  - Countdown, angular rates, shot feasibility, compass aim.
  - **Viewfinder preview** (when a flight is selected and timing data is available): a **3:2 black frame** with the moon at a fixed on-screen size for **half a degree** of sky, so you can compare **aircraft silhouette scale** to the moon. The moon **phase and libration** image comes from **NASA/GSFC Scientific Visualization Studio** hourly stills for the **simulated** time ([moon phase gallery](https://svs.gsfc.nasa.gov/gallery/moonphase.html)); if that image cannot load, the app uses a **static** moon texture instead. Footnote text under the preview explains scale, distance, and fallback behaviour.
  - **Field sounds** (after you pick a flight): on **iPhone**, disable the **silent** switch and use **ringer** volume; tap **Sounds on** — you should hear a **short unlock ping** (Safari only allows Web Audio after a gesture like this). **Sync time to now** also unlocks audio quietly. Then you get a **chime** when that aircraft enters the **green** map filter, a **soft hold tone** while it stays in the **moon-overlap** disc model, plus **countdown beeps** before and at alignment.

**What you do *not* need for basic use:** reading `architecture.md` or the changelog — those are for developers.

## What you see on the map (short)


| Element                                                      | Meaning                                                                                                                                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Camera marker**                                            | Your **observer** on the ground.                                                                                                                                              |
| **Long yellow / white line** from the camera                 | **Moon azimuth** at the simulated time: direction to look in the sky (horizontal).                                                                                            |
| **Dashed white arc (with time labels)**                      | **Moon path** — brighter segment for the **visible** window (rise→set when known); fainter dashed loop for the **whole UTC day**; **dot + label** = exact simulated time on the path.                                                                                                     |
| **Cyan dashed line + `NOW`**                                   | **Wall-clock** moon direction (updates every second), independent of the slider.                                                                                               |
| **Amber dashed line + `+90s`** (when a flight is selected)    | Short **ground-track** prediction from speed and heading, not the moon.                                                                                                        |
| **Purple route lines**                                       | **Hidden for now** — `routes.json` corridors were demo polylines, not live tracks. Re-enable via `ENABLE_STATIC_ROUTE_MAP_OVERLAY` in `staticRouteUtils.ts` when historic route data is wired in.                                                                                                                           |
| **Yellow dots**                                              | Intersections of route geometry with the moon-azimuth idea (for static route analysis).                                                                                       |
| **Aircraft model**                                           | Extrapolated position for the **simulated** time (and OpenSky display skew if you use it in the field tools). 3D orientation follows heading. **Color** = **altitude** (see the bottom legend: low = light green → high = dark blue) except **green** = shot-feasible in the camera tools. Symbol **size** also increases with cruise height. |
| **Cyan band + pale center line** (when a flight is selected) | **Stand corridor** for framing: a ground strip derived from 3D line of sight to the plane at the selected time; the **pale line** is the “zero offset” axis along that strip. |
| **Green corridor + nested green volumes**                    | **Transit opportunity corridor** for your fixed observer position and current camera setup. LOW/MEDIUM/HIGH shades are confidence bands; shown only when moon visibility is **Optimal**. |
| **Weather overlay** (if enabled)                             | Cloud layer from forecast — for context only.                                                                                                                                 |


**Golden / flash:** when alignment is very tight, the app can flash a gold cue (tolerance in the code is on the order of a tenth of a degree in separation between moon and aircraft azimuth).

## How things are “calculated” (plain language, no code)

- **Observer-centric:** the Moon’s position, rise/set, and the comparison with an aircraft are always from **your observer point** and the **simulated** `reference` time, not from an arbitrary map center.  
- **Aircraft in 3D:** the app uses the aircraft’s **height** and your position to get a realistic **line of sight** (azimuth, elevation, slant range) for tools and the stand band — not a flat “shadow on the map only” for those parts.  
- **Opportunity corridor:** the green confidence corridor is **observer-centric** (your fixed camera point), derived from moon geometry + camera setup. It helps rank where transit timing is strongest, but it is not a hard guarantee for a specific live aircraft.
- **Flights in live modes (OpenSky / ADS-B One):** the server returns a **snapshot** for a bounded area; the app **extrapolates** along track for display and applies a **light retention** between refreshes so symbols do not constantly vanish on patchy mobile networks — still not a full 4D radar simulation.  
- **Moon ephemeris:** rise/set and path use standard astronomical models (suncalc family) for the observer location. The **slider** runs **forward from Sync** for about **24 hours**; rise/set still drive the **primary** path highlight and ephemeris text. **Suncalc** refresh runs on **Sync**, when you **cross midnight UTC** while scrubbing, and when the **observer** moves — not on every small slider step (see [changelog.md](./changelog.md) if you care why).

**If you need formulas and modules:** that’s in [architecture.md](./architecture.md) and `lib/domain/`.

## If you get lost

- **Map missing:** set `NEXT_PUBLIC_MAPBOX_TOKEN` in `.env.local` (see root [README](../README.md)).  
- **“Moon below horizon”** in the UI: the simulated moon is not up at that time from your observer — lists and some tools are intentionally empty.  
- **Contribute / develop:** [technicalconventions.md](./technicalconventions.md) and the root README.

## How this document fits the other docs

- **[README (root)](../README.md)** — install, run, scripts, env, CI.  
- **This file** — **how to use the app** and what you see.  
- **[architecture.md](./architecture.md)** — how the system is built.  
- **[changelog.md](./changelog.md)** — what changed between versions.  
- **[src/stores/README.md](../src/stores/README.md)** — *developer note* (Croatian) on why one Zustand “moon transit” store exists — **not** required for end users.
