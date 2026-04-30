# Using LunaPic (product walkthrough)

**Audience:** photographers and planners (not the codebase). **UI** is in English; this document matches the app’s terminology.

## What the app is for

LunaPic helps you **line up a real (or static) aircraft** with the **Moon** in the sky from a **fixed place on the ground** (the **observer**). The map, time control, and side panels work together to show **when and where** the moon is, **where flights are**, and how close you are to a good **lunar transit** frame.

## What you do (typical flow)

1. **Set the observer** (your shooting location)
  - Default is a point in Zagreb; you can use GPS, place the **camera marker** on the map, or type coordinates.  
  - *Rule in the app:* all moon and alignment math uses this point — **not** “whatever the map is centered on” unless you explicitly set the observer from the map.
2. **Sync time (optional)**
  - On load, the app syncs to **now**; use **Sync** in the shell when you want the simulated time to jump back to the real time window.
3. **Move the time slider**
  - The slider spans the **full UTC calendar day** (from 00:00 to 24:00 for the day you are simulating). **Moonrise and moonset** still appear in the Moon panel and still define the **highlighted** part of the moon path on the map, but you can scrub the whole day to plan outside that arc.  
  - The **time in the header** is the **simulated** instant: ephemeris, flight positions (extrapolation), and map overlays follow that instant. A **dot + time label** on the moon path marks that same instant so it is not confused with the fixed clock labels along the arc.  
  - **Tip:** the Moon returns to about the same compass direction after roughly **24h 50m** (a lunar day), not after exactly 24h — so the left and right ends of the slider are **not** the same point on the path.
4. **Choose a flight data source (Provider)** — the app **defaults to OpenSky** on a fresh load.
  - **OpenSky (ADS-B)** — live traffic for a **bounded region** around your **observer** and the **map view** (via the app’s server route; no OpenSky key in the browser). The map may **briefly retain** symbols between refreshes so tracking feels steadier on phones.  
  - **Routes (static)** — demo routes; good offline.  
  - **Mock** — small test set.
5. **Pan / zoom the map**
  - Flights re-load for the current bounds (and for OpenSky also when the **observer** moves). The observer stays where you set it unless you change it.
6. **Pick a flight (optional)**
  - Click an aircraft to select it. You get a **stand corridor** (cyan ground band) and a **pale center line** showing where to be on the ground, for the **current simulated time**, using the aircraft’s **altitude** in the line-of-sight model.
7. **Read the “photographer” side** (wide layout: right column)
  - Countdown, angular rates, suggested shutter, compass aim, and optional beeps when a transit is very tight (“golden” alignment).

**What you do *not* need for basic use:** reading `architecture.md` or the changelog — those are for developers.

## What you see on the map (short)


| Element                                                      | Meaning                                                                                                                                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Camera marker**                                            | Your **observer** on the ground.                                                                                                                                              |
| **Long yellow / white line** from the camera                 | **Moon azimuth** at the simulated time: direction to look in the sky (horizontal).                                                                                            |
| **Dashed white arc (with time labels)**                      | **Moon path** — brighter segment for the **visible** window (rise→set when known); fainter dashed loop for the **whole UTC day**; **dot + label** = exact simulated time on the path.                                                                                                     |
| **Cyan dashed line + `NOW`**                                   | **Wall-clock** moon direction (updates every second), independent of the slider.                                                                                               |
| **Amber dashed line + `+90s`** (when a flight is selected)    | Short **ground-track** prediction from speed and heading, not the moon.                                                                                                        |
| **Purple route lines**                                       | Static route geometry (source depends on provider).                                                                                                                           |
| **Yellow dots**                                              | Intersections of route geometry with the moon-azimuth idea (for static route analysis).                                                                                       |
| **Aircraft symbol**                                          | Extrapolated position for the **simulated** time (and OpenSky display skew if you use it in the field tools).                                                                 |
| **Cyan band + pale center line** (when a flight is selected) | **Stand corridor** for framing: a ground strip derived from 3D line of sight to the plane at the selected time; the **pale line** is the “zero offset” axis along that strip. |
| **Green corridor + nested green volumes**                    | **Transit opportunity corridor** for your fixed observer position and current camera setup. LOW/MEDIUM/HIGH shades are confidence bands; shown only when moon visibility is **Optimal**. |
| **Weather overlay** (if enabled)                             | Cloud layer from forecast — for context only.                                                                                                                                 |


**Golden / flash:** when alignment is very tight, the app can flash a gold cue (tolerance in the code is on the order of a tenth of a degree in separation between moon and aircraft azimuth).

## How things are “calculated” (plain language, no code)

- **Observer-centric:** the Moon’s position, rise/set, and the comparison with an aircraft are always from **your observer point** and the **simulated** `reference` time, not from an arbitrary map center.  
- **Aircraft in 3D:** the app uses the aircraft’s **height** and your position to get a realistic **line of sight** (azimuth, elevation, slant range) for tools and the stand band — not a flat “shadow on the map only” for those parts.  
- **Opportunity corridor:** the green confidence corridor is **observer-centric** (your fixed camera point), derived from moon geometry + camera setup. It helps rank where transit timing is strongest, but it is not a hard guarantee for a specific live aircraft.
- **Flights in OpenSky mode:** the server returns a **snapshot** for a bounded area; the app **extrapolates** along track for display and applies a **light retention** between refreshes so symbols do not constantly vanish on patchy mobile networks — still not a full 4D radar simulation.  
- **Moon ephemeris:** rise/set and path use standard astronomical models (suncalc family) for the observer location. The **slider** uses a full UTC day; rise/set still drive the **primary** path highlight and ephemeris text. **Suncalc** refresh is tied to **Sync** and observer moves, not every slider tick, so metadata stays stable when you scrub (see [changelog.md](./changelog.md) if you care why).

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
