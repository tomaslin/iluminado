# Iluminado — Storefront Media & Showcase Guide

Alongside the full gameplay trailer (**https://youtu.be/BUGGmayKcXU**), `itch/media/` provides the recommended storefront images and lightweight looping GIF clips to make the itch.io page pop cleanly at every touchpoint.

---

## 1. Main Gameplay Trailer (`https://youtu.be/BUGGmayKcXU`)

* **Where it goes**: Paste `https://youtu.be/BUGGmayKcXU` into **Edit Game -> Media -> Video URL**.
* **Why**: Itch.io automatically docks the video first in the top media carousel, right beside your playable HTML5 canvas and ahead of your screenshots.
* **Tip**: You can also embed `https://youtu.be/BUGGmayKcXU` directly in the description body using itch's toolbar **Insert Video** button for a second watch prompt halfway down the page.

---

## 2. Storefront Artwork (`itch/media/`)

### Cover Image (`itch/media/cover.png`)
* **Dimensions**: `1260 × 1000 px` (exact `1.26:1` itch browse ratio at 2× retina density).
* **Design**: Warm alabaster grid backdrop, bold **Fraunces** wordmark legible down to `150×120` mobile browse thumbnails, tilted 2×2 + Tetromino board bisected by a live `+640` sweep beam, and clean bottom badges clear of the safe margin.

### Page Header Banner (`itch/media/header-banner.png`)
* **Dimensions**: `1200 × 360 px` panoramic banner.
* **Design**: Matches `page-theme.css` so the banner melts naturally into the ivory gallery column, pairing the 2×2 emblem icon with the tagline and a sweeping purple timeline accent.

---

## 3. Recommended Screenshot Gallery (`itch/media/screenshots/`)

Five `1280 × 720 px` lossless PNGs captured directly from live game builds—ideal for itch's 4–5 shot gallery sweet spot:

| Order | File | Highlights |
| :---: | :--- | :--- |
| **1** | `01-core-rhythm-flow.png` | *Alabaster Courtyard* — Core 2×2 beat-sweep clear (`+400 / 2 SQ`) & HUD queue |
| **2** | `02-tetromino-shift.png` | *Gouache Meadow* — `Tetrominoes` Shift active (`I/T/L` shapes mid-sweep) |
| **3** | `03-split-canyon-shift.png` | *Aquarelle Choir* — `Split Canyon` impassable stone chasm dividing the courtyard |
| **4** | `04-splitscreen-versus.png` | *Webline Rooftops* — Competitive split-screen *VS CPU* / *2P Battle* duel |
| **5** | `05-72-shifts-codex.png` | *Mesa Twilight* — *Board Shift Rules* codex showing all 72 Shifts |

---

## 4. Recommended Description GIF Clips (`itch/media/clips/`)

Three looping `600 × 338 px` palette-quantized GIFs (`18 fps`, `1.7–2.2 MB` each, safely below itch.io's `3 MB` image/GIF CDN cap). Embed them directly inside the long description using itch's **Insert Image** button so readers see instant motion while scrolling:

| Clip | Size | Feature Demonstrated |
| :--- | :--- | :--- |
| `clip-01-beat-sweep-combo.gif` | `2.2 MB` | Classic 2×2 blocks aligning and clearing across the beat timeline |
| `clip-02-tetromino-shift.gif` | `1.7 MB` | `Tetrominoes` brick mutation rotating and locking into place |
| `clip-03-slab-bricks-shift.gif` | `1.7 MB` | `3×2 / 2×3` architectural slab rotation and combo sweep |
