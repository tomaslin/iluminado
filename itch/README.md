# Iluminado — itch.io Publishing & Showcase Kit

Everything in this folder is dedicated to packaging, styling, and presenting **Iluminado** on [itch.io](https://itch.io) without altering the game itself.

---

## 1. Quick Setup & Dashboard Settings

In **Dashboard -> Edit Game**:

| Setting | Recommended Value | Why |
| :--- | :--- | :--- |
| **Title** | `Iluminado` | Clean primary title |
| **Short description / Tagline** | `Drop on the beat. Align 2×2 squares. Outlast 52 rule-bending shifts across 50 genre-fusion worlds.` | Concise hook under 140 chars |
| **Classification** | `Games` | Standard game listing |
| **Kind of project** | `HTML` (Play in browser) | Enables in-browser iframe player |
| **Primary Genre** | `Puzzle` | Core discoverability |
| **Pricing** | `$0 or donate` | Maximizes reach & optional tips |

---

## 2. Embed & Viewport Configuration

Iluminado scales responsively across both **Landscape (`16×10`)** and **Portrait (`10×14`)** layouts:

* **Viewport Dimensions**: **1280 × 720** (16:9 standard)
* **Orientation**: Both / Unconstrained
* **Embed Options**:
  * **Click to play** — Enable this (keeps "Automatically start" off) so the player's opening click unlocks browser Web Audio cleanly.
  * **Fullscreen button** — Enable for one-click expansion.
  * **Mobile friendly** — Enable so touch gestures and portrait sizing work cleanly on phones/tablets.

---

## 3. Gameplay Video, Cover, Screenshots & Looping Clips

Alongside the full gameplay video (**https://youtu.be/BUGGmayKcXU**), the `itch/media/` folder supplies the complete recommended set of static art, gallery screenshots, and lightweight looping GIFs:

1. **Main Gameplay Trailer (`https://youtu.be/BUGGmayKcXU`)**:
   * Paste `https://youtu.be/BUGGmayKcXU` into itch's **Video URL / Trailer** field. It automatically docks first in the media showcase above the screenshots.
2. **Storefront Artwork**:
   * `itch/media/cover.png` (`1260 × 1000 px`) -> Upload as **Cover Image**.
   * `itch/media/header-banner.png` (`1200 × 360 px`) -> Upload in **Edit Theme -> Header Banner**.
3. **5 Hero Screenshots (`itch/media/screenshots/`, `1280 × 720 px`)**:
   * `01-core-rhythm-flow.png` — Classic 2×2 beat sweep combo in *Alabaster Courtyard*
   * `02-tetromino-shift.png` — *Tetrominoes* brick mutation in *Gouache Meadow*
   * `03-split-canyon-shift.png` — *Split Canyon* chasm divider in *Aquarelle Choir*
   * `04-splitscreen-versus.png` — Head-to-head *VS CPU* split-screen duel in *Webline Rooftops*
   * `05-52-shifts-codex.png` — *Board Shift Rules* codex showcasing all 52 Shifts
4. **3 Description GIF Clips (`itch/media/clips/`, `600 × 338 px`, 1.7–2.2 MB each)**:
   * `clip-01-beat-sweep-combo.gif` — Beat-locked 2×2 sweep clear
   * `clip-02-tetromino-shift.gif` — Tetromino pieces rotating into place
   * `clip-03-slab-bricks-shift.gif` — 3×2 / 2×3 architectural slab rotation & combo clear

---

## 4. Theme & Copy Files

* [page-theme.css](./page-theme.css) — Warm editorial theme palette hex codes + itch.io Custom CSS (`Fraunces` serif headers, tactile `<kbd>` keycaps, 4-color top accent rule, callout cards).
* [storefront-copy.md](./storefront-copy.md) — Ready-to-paste HTML/Markdown page description, accurate 7-mode overview, and controls table.
* [media-and-trailer-guide.md](./media-and-trailer-guide.md) — Specs and usage guide for the gameplay trailer (`https://youtu.be/BUGGmayKcXU`), cover, screenshots, and GIF embeds.
* [preview.html](./preview.html) — Local visual preview of the complete styled itch page.
* [package-itch.sh](./package-itch.sh) — Builds `dist/` and packages `itch/iluminado-html5.zip` for upload.
* [deploy-butler.sh](./deploy-butler.sh) & [butler.md](./butler.md) — Delta deploys via itch.io Butler CLI.
