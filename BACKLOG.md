# MoonTransit — Backlog

Zadaci se bilježe ovdje i rješavaju u chatu s Claudeom.
Format: `- [ ]` pending · `- [x]` done · oznaka `[P1]`/`[P2]`/`[P3]` za prioritet.

---

## U tijeku

*(ništa)*

---

## Pending

- [ ] **[P2] Vektorizirati VFR prikaz**
  Trenutno koristimo OpenAIP rasterske PNG tile-ove. Prebaciti na vektorske tile-ove (MVT/PBF)
  kako bi se airspace zone mogle stilizirati (boja, opacity, hover) i integrirati s tamnom temom.
  - Istražiti OpenAIP vector tile shemu (`/api/data/openaip/{z}/{x}/{y}.pbf`)
  - Definirati Mapbox layer stilove za: CTR, TMA, FIR, zabranjena područja, aerodrome
  - Ukloniti rasterski source/layer, zadržati mask logiku

---

## Završeno

*(ništa)*
