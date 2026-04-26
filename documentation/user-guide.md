# Using Moon Transit (product walkthrough)

**Audience:** photographers and planners (not the codebase). **UI** is in English; this document matches the app’s terminology.

## What the app is for

Moon Transit helps you **line up a real (or static) aircraft** with the **Moon** in the sky from a **fixed place on the ground** (the **observer**). The map, time control, and side panels work together to show **when and where** the moon is, **where flights are**, and how close you are to a good **lunar transit** frame.

## What you do (typical flow)

1. **Set the observer** (your shooting location)  
   - Default is a point in Zagreb; you can use GPS, place the **camera marker** on the map, or type coordinates.  
   - *Rule in the app:* all moon and alignment math uses this point — **not** “whatever the map is centered on” unless you explicitly set the observer from the map.

2. **Sync time (optional)**  
   - On load, the app syncs to **now**; use **Sync** in the shell when you want the simulated time to jump back to the real time window.

3. **Move the time slider**  
   - The slider range is the **visible moon window** (roughly from moonrise to moonset) when that data is available, or a fallback window.  
   - `reference time` in the header is the **simulated** instant: ephemeris, flight positions (extrapolation), and map overlays all follow that instant.

4. **Choose a flight data source (Provider)**  
   - **static** — demo routes; good offline.  
   - **openSky** — live aircraft in the current map view (via the app’s server route; no key in the browser).  
   - **mock** — small test set.

5. **Pan / zoom the map**  
   - Flights re-load for the current bounds (OpenSky / static). The observer stays where you set it.

6. **Pick a flight (optional)**  
   - Click an aircraft to select it. You get a **stand corridor** (cyan ground band) and a **pale center line** showing where to be on the ground, for the **current simulated time**, using the aircraft’s **altitude** in the line-of-sight model.

7. **Read the “photographer” side** (wide layout: right column)  
   - Countdown, angular rates, suggested shutter, compass aim, and optional beeps when a transit is very tight (“golden” alignment).

**What you do *not* need for basic use:** reading `architecture.md` or the changelog — those are for developers.

## What you see on the map (short)

| Element | Meaning |
| -------- | -------- |
| **Camera marker** | Your **observer** on the ground. |
| **Long yellow / white line** from the camera | **Moon azimuth** at the simulated time: direction to look in the sky (horizontal). |
| **Dashed white arc (with time labels)** | **Moon path** in the **visible** time window (rise/set–based when known). |
| **Purple route lines** | Static route geometry (source depends on provider). |
| **Yellow dots** | Intersections of route geometry with the moon-azimuth idea (for static route analysis). |
| **Aircraft symbol** | Extrapolated position for the **simulated** time (and OpenSky display skew if you use it in the field tools). |
| **Cyan band + pale center line** (when a flight is selected) | **Stand corridor** for framing: a ground strip derived from 3D line of sight to the plane at the selected time; the **pale line** is the “zero offset” axis along that strip. |
| **Weather overlay** (if enabled) | Cloud layer from forecast — for context only. |

**Golden / flash:** when alignment is very tight, the app can flash a gold cue (tolerance in the code is on the order of a tenth of a degree in separation between moon and aircraft azimuth).

## How things are “calculated” (plain language, no code)

- **Observer-centric:** the Moon’s position, rise/set, and the comparison with an aircraft are always from **your observer point** and the **simulated** `reference` time, not from an arbitrary map center.  
- **Aircraft in 3D:** the app uses the aircraft’s **height** and your position to get a realistic **line of sight** (azimuth, elevation, slant range) for tools and the stand band — not a flat “shadow on the map only” for those parts.  
- **Flights in OpenSky mode:** the server returns a **snapshot** for the map area; the app **extrapolates** slightly for smooth display and to match the time slider, not a full 4D radar simulation.  
- **Moon ephemeris:** rise/set and path use standard astronomical models (suncalc family) for the observer location; the **slider window** and **map path** are kept consistent with a deliberate refresh policy so scrubbing time near moonset does not desync the path (see [changelog.md](./changelog.md) if you care why).

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
