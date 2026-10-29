# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Amateur and semi-professional astro/aviation photographers who shoot aircraft crossing the Moon's disc. Two scenes of equal weight: in the field at night with a camera on a tripod (phone, dark surroundings, one hand free, a few seconds to decide), and planning at a desk on a desktop (choosing day, location, comparing transit windows, working with the map and many panels). One responsive product, not a separate mobile app.

## Product Purpose

LunaPic predicts when and where a real aircraft will pass in front of the Moon from the observer's fixed position, using live ADS-B feeds (OpenSky, adsb.lol, own Raspberry Pi and Avionix receivers), astronomy-engine for the Moon and the camera/lens model for framing. Success: the photographer knows the next transit, which aircraft, how much time is left, and whether they stand in the right place, without opening a single panel. It also plans ahead (Moon shadow spots, a runway planner for LDZA, a transit calendar) and pushes Web Push alerts when the screen is off.

## Positioning

Not a generic flight tracker: everything is observer-centric (the fixed observer position, not the map centre). Predictions are numerically confirmed and gated by camera field of view, and the inverse problem ("where should I stand") is solved, not only "will it transit".

## Operating Context

Full-bleed Mapbox map with the observer marker, the Moon azimuth ray, the 80 km visibility ring and live aircraft. A floating rail of 12 tool panels, a time slider (24 h window with a sync-to-now), an altitude legend and layer control, a search/command bar, and a weather chip. UI copy is English. Time can be simulated, so the screen has a "now" state and a "scrubbed" state.

## Capabilities and Constraints

- 12 panels must stay: active transits, transit candidates, photographer tools, flight filters, Moon ephemeris, observer location, street view, field overlays/compass, flight source, AR sky camera, flight log, planning.
- Moon below 5 degrees: no candidates and no alerts. 5-12 degrees: caution. 12 degrees and above: optimal.
- A transit candidate becomes an alert only after two fresh confirming fixes; "disc transit" versus "in frame" are different classes.
- Visual rules live in documentation/ui-generator-technical-spec.md (type tokens --fs-*, text colour tokens --t-*, combobox and checkbox patterns). New style decisions go into the spec before components.

## Brand Commitments

Name "LunaPic" and the existing logo stay. The full-bleed Mapbox map stays as the base. The existing panel set and functions stay; only their access, hierarchy and look change.

## Evidence on Hand

Real runtime data exists (Moon altitude/azimuth, illumination, rise/set, cloud cover, live flights, countdowns). There are no testimonials, customers or usage numbers and none may be invented. Mockup data must be labelled as sample.

## Product Principles

1. The answer before the tool: next transit, aircraft, time left and position correctness are visible without opening anything.
2. Observer first: everything is relative to where the photographer stands.
3. Honest uncertainty: caution and critical states are explicit, never hidden behind optimistic UI.
4. Fast in the dark: legible at arm's length, minimal glare, large targets, little reading.
5. One system from phone to desktop.

## Accessibility & Inclusion

Contrast at least 4.5:1 for text, visible keyboard focus, reduced-motion respected. Night use means a dim-friendly palette, not pure white surfaces.
