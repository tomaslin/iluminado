# Iluminado — Media, Trailer & Asset Production Guide for itch.io

This guide details the creative and technical pipeline for producing visual assets, screenshots, promotional GIFs, and most importantly, the **gameplay trailer video** required to maximize engagement and conversion on itch.io.

---

## Table of Contents
1. [The Gameplay Video Strategy](#1-the-gameplay-video-strategy)
2. [60-Second Gameplay Trailer Storyboard](#2-60-second-gameplay-trailer-storyboard)
3. [Audio Capture & Stem Mixing Guidelines](#3-audio-capture--stem-mixing-guidelines)
4. [Cover Image Specifications & Templates](#4-cover-image-specifications--templates)
5. [Screenshot Gallery (5 Hero Shots)](#5-screenshot-gallery-5-hero-shots)
6. [Animated GIFs for Storefront Body](#6-animated-gifs-for-storefront-body)
7. [itch.io Video Integration Setup](#7-itchio-video-integration-setup)

---

## 1. The Gameplay Video Strategy

On itch.io, **a gameplay-first video is the single highest-converting asset on your page**. Unlike storefronts where trailers can afford 30-second cinematic build-ups, itch.io players browse quickly and decide whether to click **"Run game"** within the first **3 to 5 seconds**.

### Core Video Rules for Iluminado:
1. **No Cold Intros / Studio Logos in the First 10 Seconds**: Start directly on active gameplay. Drop the viewer immediately into a massive timeline sweep and clearing combo.
2. **Synchronize Edits to the Music**: *Iluminado* is an architectural rhythm puzzle. Every cut, camera shake, text overlay, and mechanic reveal MUST land on the musical downbeat of the track.
3. **Showcase the "Shifts" Quickly**: *Lumines* fans will recognize the core 2×2 matching immediately; what makes *Iluminado* distinct are its **52 Dynamic Shifts** (Tetrominoes, 90° gravity rotations, 3-color mode, reverse sweeps). Feature these prominently.
4. **Length**: Target **45 to 60 seconds**. Anything longer suffers severe viewer drop-off on itch.io.
5. **Native Docking**: Itch.io automatically docks YouTube or Vimeo videos at the very top of the media carousel above the screenshots.

---

## 2. 60-Second Gameplay Trailer Storyboard

| Timestamp | Visual Content | Audio / Track | On-Screen Text / Overlay |
| :--- | :--- | :--- | :--- |
| **0:00 – 0:04** | **THE HOOK**: Close crop on a huge 6×4 block cluster in World 01 ("Metropolis"). The timeline beam sweeps across, dissolving 24 blocks in a cascade of neon light. Score ticks up rapidly. | Heavy 128 BPM electronic kick hits right as the beam sweeps. Cleared stem chime triggers. | None (Let pure gameplay speak) |
| **0:04 – 0:14** | **THE CORE FLOW**: Pull back to full board view. Show 2×2 blocks falling, rotating, and slotting seamlessly into place. Two quick 2×2 color square completions. Sweep line rhythmically clears them. | Dynamic stem activation: Baseline and lead melody kick in as combos grow. | *"FLOW TO THE BEAT"* |
| **0:14 – 0:22** | **DYNAMIC SHIFT 1: TETROMINO MUTATION**: A warning flash appears: `SHIFT: TETROMINO GRID`. The falling block changes from a standard 2×2 into an `L-tromino`, then a `T-tromino`. The player rotates and slots it into the matrix. | Audio pitch shift / riser sound effect into World 07 track ("Vapor District"). | *"52 DYNAMIC REALITY SHIFTS"* |
| **0:22 – 0:30** | **DYNAMIC SHIFT 2: AXIS ROTATION & GRAVITY**: The entire board rotates 90° clockwise. Blocks fall horizontally against the right wall, and the sweep beam travels vertically from top to bottom. | Fast cut to World 16 ("Orbital Gravity"). Glitch drum beat. | *"GRAVITY IS FLUID"* |
| **0:30 – 0:38** | **DYNAMIC SHIFT 3: 3-COLOR PRISM & REVERSE SWEEP**: Board enters Prism mode: Magenta, Cyan, and Amber blocks fall simultaneously. Sweep line suddenly reverses direction (right-to-left). Intense high-speed play. | Track ramps up in intensity (World 29: "Prism Core"). | *"ADAPT OR CRASH"* |
| **0:38 – 0:46** | **2-PLAYER BATTLE MODE**: Split screen showing two boards battling. Player 1 triggers a massive 5-square sweep, sending a wave of garbage blocks across the central dividing beam onto Player 2's board. | World 42 ("Neon Coliseum") competitive battle theme. | *"SHARED-SCREEN 2-PLAYER VERSUS"* |
| **0:46 – 0:54** | **WORLD MONTAGE & MODES**: Fast rapid-fire cuts (1.0s each) showing distinct worlds and modes: <br>• Brutalist Concrete (Puzzle Mode)<br>• Bioluminescent Trench (Mission Mode)<br>• Daily Architectural Challenge calendar<br>• Solarpunk Botanical (Endless Flow) | Rapid montage of 4 different genre tracks matching each world. | *"50 WORLDS • 50 SOUNDTRACKS"* |
| **0:54 – 1:00** | **CALL TO ACTION / END CARD**: Iluminado logo illuminates against an architectural skyline. Clear indicators: "PLAY IN BROWSER • CONTROLLER & TOUCH SUPPORTED". | Final synth chord sustain with resonant sweep. | **ILUMINADO**<br>*Play Free Now on itch.io* |

---

## 3. Audio Capture & Stem Mixing Guidelines

*Iluminado* features dynamic Web Audio stems (Kick, Bass, Melody, FX) and procedural sound effects tied to block placement and line clears. Bad audio capture will ruin an otherwise great trailer.

### Recording Recommendations:
1. **Capture Lossless Audio**:
   - Use **OBS Studio** (Open Broadcaster Software) on macOS with **Application Audio Capture** targeted directly at Chrome/Edge/Arc.
   - Sample Rate: **48 kHz**, Bitrate: **320 kbps AAC** or uncompressed PCM.
   - Disable all operating system notification sounds and microphone inputs during capture.
2. **Gameplay Audio Balance**:
   - Keep internal SFX volume and Music volume at default (100% / 100%) in `App.tsx` / `audio.ts`.
   - The built-in audio engine has a master dynamic compressor at -10 dB with a 4:1 ratio; do not apply external hard limiters that cause pumping.
3. **Showcase the Reactive Music**:
   - In the trailer, let the viewer *hear* how placing blocks triggers melodic notes in key with the world's soundtrack.
   - When a combo triggers, ensure the clear chime is clearly audible over the background rhythm.

---

## 4. Cover Image Specifications & Templates

The cover image is your game's store billboard on browse pages, search results, and tag listings across itch.io.

### Technical Requirements:
| Attribute | Itch.io Minimum | Recommended Production Spec |
| :--- | :--- | :--- |
| **Dimensions** | 315 × 250 px | **1260 × 1000 px** (Exact 1.26:1 ratio, 2× retina density) |
| **Aspect Ratio** | 1.26 : 1 (or 630 × 500) | 1.26 : 1 |
| **File Format** | PNG or JPG | PNG-24 (lossless, crisp text) or high-quality JPG (<90% compression) |
| **Max File Size** | 3 MB | Keep under 1.5 MB for instant CDN delivery |
| **Animated Cover** | Supported (.gif) | Optional: 630×500 px, <3 MB, 24 fps looping ambient glow |

### Composition & Layout Guide:
```
+-------------------------------------------------------------+
| [MARGIN 50px - SAFE FROM BROWSE BADGES & LABELS]           |
|                                                             |
|                      I L U M I N A D O                      |
|                   [BOLD LUMINESCENT LOGO]                   |
|                                                             |
|                   [CENTRAL HERO ARTWORK:                    |
|             Dual-colored glowing 2x2 blocks                 |
|             bisected by radiant sweep beam]                 |
|                                                             |
|  [SUBTITLE: ARCHITECTURAL RHYTHM PUZZLE]                    |
|  [SUB-BADGES: "50 WORLDS" • "HTML5 BROWSER PLAY"]           |
| [SAFE ZONE - NO CRITICAL TEXT IN BOTTOM 40px]               |
+-------------------------------------------------------------+
```

### Visual Style Rules:
- **Palette**: Void navy background (`#07090e`), luminous cyan (`#38bdf8`), vibrant amber (`#f59e0b`), and clean white headers (`#f8fafc`).
- **Readability**: Ensure the word **"ILUMINADO"** is legible down at `150 × 120 px` (the smallest mobile browse card).
- **Avoid Clutter**: Do not paste system requirement icons, social media handles, or URLs onto the cover image.

---

## 5. Screenshot Gallery (5 Hero Shots)

Itch.io showcases screenshots directly beneath the gameplay trailer. Each screenshot should demonstrate a unique gameplay feature or emotional state:

### 1. `screenshot-01-classic-flow.png` (Core Experience)
- **Scene**: World 01 ("Metropolis") mid-gameplay.
- **Action**: Glowing 2×2 blocks forming clean clusters while the vertical timeline beam sweeps across at 120 BPM.
- **Purpose**: Instantly communicates to *Lumines* and falling-block puzzle fans how the game plays.

### 2. `screenshot-02-tetromino-shift.png` (Dynamic Shifts)
- **Scene**: World 14 ("Orbital Grid").
- **Action**: Active `SHIFT: TETROMINOES` HUD banner. An orange and cyan `T-tromino` dropping into a dense board matrix.
- **Purpose**: Proves to viewers this is an evolution of the genre with dynamic, unexpected rule shifts.

### 3. `screenshot-03-twoplayer-versus.png` (Multiplayer Showdown)
- **Scene**: 2-Player Shared Screen Battle Mode.
- **Action**: Split-screen view with tension bar at 60/40. Player 1 triggering a line clear, throwing glowing attack blocks across the boundary into Player 2's field.
- **Purpose**: Attracts local multiplayer and couch-gaming enthusiasts.

### 4. `screenshot-04-prism-mode.png` (High-Tier Challenge)
- **Scene**: World 29 ("Prism Core") in 3-Color Mode.
- **Action**: Intricate mosaic of three distinct block colors (magenta, cyan, gold) with a 6x multiplier active.
- **Purpose**: Showcases depth, visual complexity, and endgame mastery for veteran puzzle gamers.

### 5. `screenshot-05-world-codex.png` (Content & Variety)
- **Scene**: World Selection / Architectural Codex Menu.
- **Action**: Grid of unlocked worlds showing architectural themes, bespoke soundtrack BPMs, and shift modifiers.
- **Purpose**: Highlights that this is a full-featured, massive game with 50 worlds—not a 5-minute tech demo.

### Screenshot Capture Specs:
- Resolution: **1920 × 1080** or **2560 × 1440** (16:9).
- Format: **PNG** (lossless) or WebP.
- Clean HUD: Ensure no debugging overlays or console errors are visible.

---

## 6. Animated GIFs for Storefront Body

Embedding small, high-impact looping GIFs in your itch.io description breaks up text and demonstrates motion for players who don't watch the full video.

| GIF Name | Content | Optimal Duration | Max Size |
| :--- | :--- | :--- | :--- |
| `demo-sweep-clear.gif` | 2×2 block fusion and sweep beam dissolution with score counter pop. | 3.2 seconds (1 sweep cycle) | < 2.5 MB |
| `demo-shift-transform.gif` | Block transforming from 2×2 square into a Tetromino piece upon spawning. | 2.5 seconds | < 2.0 MB |
| `demo-2p-battle.gif` | P1 clearing combo pushing the center divider into P2's court. | 4.0 seconds | < 3.0 MB |

### GIF Production Instructions:
1. Record a 60 FPS video clip of the exact sequence.
2. Trim tightly to start and end on the musical measure for a seamless visual loop.
3. Use `ffmpeg` to generate high-quality, palette-quantized GIFs:
```bash
ffmpeg -ss 00:00:02 -t 3.2 -i gameplay_clip.mp4 -vf "fps=24,scale=560:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 demo-sweep-clear.gif
```

---

## 7. itch.io Video Integration Setup

### How to Hook Up the Gameplay Trailer on Your Profile:
1. Upload your 1080p60 trailer to **YouTube** or **Vimeo** (set to Public or Unlisted).
2. Go to your itch.io dashboard: **Edit Game** → **Media** section.
3. Locate the **"YouTube or Vimeo video"** field.
4. Paste the full video URL (e.g. `https://www.youtube.com/watch?v=YOUR_VIDEO_ID`).
5. Check the preview:
   - When set, itch.io displays your video as the **first interactive item in the carousel**, ahead of all screenshots.
   - Visitors clicking the play icon can watch the trailer in full high-definition without leaving the page.
6. **Optional Description Embed**:
   You can also embed the trailer directly inside the page body markdown using an iframe or standard YouTube embed in the rich-text editor if you want it visible above the fold even when browsing on mobile.
