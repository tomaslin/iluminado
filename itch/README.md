# Iluminado — itch.io Publishing & Setup Guide

This guide details the systems, configurations, and best practices for publishing **Iluminado** to [itch.io](https://itch.io) as a high-performance, browser-playable HTML5 game.

---

## 1. Quick Setup & Project Settings

When creating or editing the game page on itch.io (`Dashboard -> Create new project` or `Edit game`):

| Setting | Recommended Value | Why |
| :--- | :--- | :--- |
| **Title** | `Iluminado` | Clean, memorable primary title |
| **Short description / Tagline** | `A rhythm-locked falling block puzzle inspired by Lumines, where the rules, board, and shapes shift dynamically as you play.` | Immediate hook under 140 chars |
| **Classification** | `Games` | Standard game listing |
| **Kind of project** | `HTML` (You have a ZIP or HTML file that will be played in the browser) | Enables in-browser iframe player |
| **Release status** | `Released` or `In development` | Set according to your distribution phase |
| **Pricing** | `$0 or donate` (Free / Pay what you want) | Maximizes player reach and community tips |

---

## 2. Embed & Viewport Configuration

Iluminado is built with responsive HTML5 Canvas and CSS flex/grid scaling that dynamically handles both **Landscape (16×10)** and **Portrait (10×14)** orientations:

### Recommended Viewport Settings
* **Viewport Dimensions**: Set **Width: 1280** × **Height: 720** (16:9 standard).
  * *Alternative for smaller screens*: **960 × 540** or **960 × 600**.
* **Orientation**: **Both** (or leave unconstrained) — Iluminado includes built-in orientation transform logic that preserves blocks when flipping between landscape and portrait.
* **Embed Options**:
  * ✅ **Enable "Click to launch in fullscreen"** or **"Click to play"**:
    > **Critical for Web Audio**: Browsers strictly require user interaction before resuming the `AudioContext`. Enabling "Click to play" ensures the player's initial click unlocks audio smoothly without browser warning messages.
  * ✅ **Enable "Fullscreen button"**: Allows one-click browser fullscreen expansion (`F` key or itch frame button).
  * ✅ **Enable "Mobile friendly"**: Tells mobile browsers to scale touch controls and avoid unwanted default zoom gestures.
  * ✅ **Automatically start on page load**: Disable (keep "Click to play" on for audio unlock & iframe performance).

---

## 3. Gameplay Video / Trailer Integration

Itch.io highlights gameplay videos above screenshots in the media showcase.

### Video Placement & Strategy
1. **Primary Video / Trailer Field**:
   * Itch supports direct **YouTube** and **Vimeo** embeds.
   * Paste your gameplay trailer URL in the **Video URL / Trailer** input field under the **Media** section.
   * On the public page, the video automatically docks at the top of the media carousel above the screenshot thumbnails.
2. **Body Embed (In Description)**:
   * You can also embed the gameplay video or gameplay feature clips directly inside the long description using the formatting toolbar's video icon (`https://www.youtube.com/watch?v=...`).
3. **Animated GIFs in Description**:
   * Supplement the main video with 2–3 short, high-energy GIFs (under 3MB each) embedded directly in the text to instantly showcase signature shifts (e.g., Tetromino bricks, 90° board rotation, 3-color mode).
   * See [media-and-trailer-guide.md](file:///Users/tomaslin/dev/iluminado/itch/media-and-trailer-guide.md) for trailer scripting, timing, and recording guidelines.

---

## 4. Theme & Page Styling

Itch.io allows custom theming to match your game's identity. Use the **Edit Theme** panel:

| Property | Suggested Color / Value | Note |
| :--- | :--- | :--- |
| **Background (BG)** | `#0a0d14` | Deep navy-black matching Iluminado's night sky |
| **Box Background (BG2)** | `#121724` | Elevated architectural container |
| **Text** | `#e2e8f0` | Crisp slate white for readability |
| **Links / Accent** | `#38bdf8` or `#818cf8` | Sky cyan / lavender HUD accent |
| **Font Family** | Sans-Serif or Custom (`Plus Jakarta Sans` / `Fraunces`) | Clean modernist typography |
| **Header Banner** | Optional (960×400 px) | Panoramic illustrated skyline banner |

A complete ready-to-use CSS template is provided in [page-theme.css](file:///Users/tomaslin/dev/iluminado/itch/page-theme.css).

---

## 5. Metadata & Search Tags

Tags drive organic discoverability on itch.io browse pages:

```text
lumines, falling-blocks, puzzle, rhythm, music, arcade, browser, html5, retro, synthwave, soundtrack, score-attack, daily-challenge, local-multiplayer, two-player, pwa, 2d, singleplayer
```

* **Primary Genre**: `Puzzle`
* **Secondary Genre**: `Rhythm` / `Arcade`
* **Custom Noun**: `World` or `Shift`

---

## 6. Packaging & Deployment

To upload Iluminado to itch.io:

### Method A: One-Click Zip Script
Run the automated packaging script from your terminal:
```bash
bash itch/package-itch.sh
```
This script runs a production build, verifies relative asset paths and audio files, and packages `itch/iluminado-html5.zip`. You can directly upload this file to itch.io under **Upload files** and mark it with **"This file will be played in the browser"**.

### Method B: Automated Deployment via Butler CLI
Itch.io's official tool, `butler`, pushes updates with fast delta patching:
```bash
# One-time login
butler login

# Push production build to itch
bash itch/deploy-butler.sh <your-itch-username>
```
See [butler.md](file:///Users/tomaslin/dev/iluminado/itch/butler.md) for full setup instructions and GitHub Actions automation.

---

## 7. Folder Contents Summary

* [storefront-copy.md](file:///Users/tomaslin/dev/iluminado/itch/storefront-copy.md): Complete, pre-formatted description text, controls table, and feature highlights ready to paste into the itch.io dashboard.
* [media-and-trailer-guide.md](file:///Users/tomaslin/dev/iluminado/itch/media-and-trailer-guide.md): Specifications and a 60-second storyboard for the gameplay video, cover image, and screenshot reel.
* [page-theme.css](file:///Users/tomaslin/dev/iluminado/itch/page-theme.css): Itch.io Theme Editor custom CSS stylesheet.
* [package-itch.sh](file:///Users/tomaslin/dev/iluminado/itch/package-itch.sh): Automated zip packaging script for HTML5 distribution.
* [butler.md](file:///Users/tomaslin/dev/iluminado/itch/butler.md): Guide for itch.io's Butler CLI and continuous deployment.
* [deploy-butler.sh](file:///Users/tomaslin/dev/iluminado/itch/deploy-butler.sh): Terminal deployment script for Butler.
