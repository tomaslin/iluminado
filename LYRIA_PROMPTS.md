# Lyria Prompts & Dynamic Stem Production Bible — Iluminado

This document contains studio-grade **Google Lyria (`lyria-3-pro-preview`)** generation prompts, **4-stem separation specs**, **BPM / Key / Timeline locks**, and **live instrumentation SFX shot lists** for all **20 audiovisual worlds** in *Iluminado*.

Every track spans genres tailored to rhythmic puzzle flow—including **Dark Zouk, Kizomba, Salsa, Bachata, Reggaeton, Trap, Country Music, Swing, Ambient, Jazz Fusion, Electric Fusion, Heavy Metal, Alt Rock, Country Blues Rock, Bossa Nova, Downtempo, Dark Ambient, Synthwave, Chiptune Funk, and Liquid DnB**—designed so the horizontal **16-column Time Line (`2` musical bars / `8` beats per sweep)** locks tightly into every groove.

---

## Global Production & Stem Architecture

### 1. Timeline & Grid Synchronization
- **Grid Clock**: `16` columns = `2` bars of `4/4` time in eighth-note steps (`1` sweep = `8` beats; `stepMs = 30_000 / BPM`).
- **Loopable Seam**: Every Lyria generation must be rendered cleanly on downbeat `1.1.1` for an exact `8-bar` or `16-bar` loop (no fade-in/fade-out tails that drift off-grid).
- **Dynamic Stem Mixing (`computeStemLevels` in `src/game/audio.ts`)**:
  1. **Stem 1 — Percussion (`0.75 → 1.00`)**: Always present as the rhythmic backbone so the player feels the Time Line tempo even on an empty board.
  2. **Stem 2 — Bass (`0.36 → 1.00`)**: Swells in as blocks accumulate and the first squares form.
  3. **Stem 3 — Lead / Harmony (`0.14 → 1.00`)**: Blooms brightly when `2×2` squares are formed and as stage progress approaches transition.
  4. **Stem 4 — Vocal / Atmosphere (`0.06 → 1.00`)**: Enters on active `4×–16×` combos, multi-square sweeps, and climax phases.

### 2. Lyria Model Generation Workflow (`lyria-3-pro-preview`)
When exporting pre-rendered studio stems via `@google/genai` (`lyria-3-pro-preview`), render each world in **5 passes** using the exact BPM/key anchor so stems stay phase-aligned:
- **Pass A (Full Reference Mix)**: Full prompt below (`outputFormat: audio/mp3` or `audio/wav`).
- **Pass B (`[Percussion Stem Only]`)**: Append `"STRICT ISOLATION: drums, percussion, and transients only; no bass, no melodic instruments, no pads, no vocals."`
- **Pass C (`[Bass Stem Only]`)**: Append `"STRICT ISOLATION: bass guitar, synth bass, or 808 sub only; no drums, no chords, no lead, no vocals."`
- **Pass D (`[Lead & Harmony Stem Only]`)**: Append `"STRICT ISOLATION: melodic lead, guitar/piano/brass riff, and harmonic arpeggios only; no drums, no sub bass, no vocals."`
- **Pass E (`[Vocal & Atmosphere Stem Only]`)**: Append `"STRICT ISOLATION: ethereal vocal harmonies, formant chops, choir swells, and atmospheric pads only; no drums, no bass."`

---

## World 01 — Ambient (`78 BPM` · `D Lydian`)
- **Visual Mood**: Pastel sandstone arches, rosewater pools, serene sunlit geometry.
- **Groove & Meter**: `4/4` floating pulse, straight `0.00` swing, zero distortion, gentle sub warmth (`0.45`).
- **Arrangement Arc**:
  - *Bars 1–4*: Felt marimba ostinato and soft brushed shaker pulse.
  - *Bars 5–8*: Warm upright sub drone enters under suspended `Dmaj7#11` glass pads.
  - *Bars 9–16*: Shimmering harmonic harp arpeggios and wordless soprano breath swells bloom on combos.
- **Full Lyria Master Prompt**:
  > `78 BPM, D Lydian, serene pastoral ambient electronic puzzle music inspired by warm architectural minimalism. Soft felt piano, muted marimba eighth-note pulse, warm analog sine sub-bass drone, delicate brushed tactile percussion, shimmering glass bell harmonics, and breathy wordless female vocal pad swells. Spacious hall reverb, delicate pastel warmth, zero harsh highs, seamless loopable bar boundaries.`
- **4-Stem Prompts**:
  - **Percussion**: `78 BPM, D Lydian, sparse tactile woodblock ticks, soft felt-mallet kick on beats 1 and 3, delicate sand-shaker offbeats, dry-room intimacy.`
  - **Bass**: `78 BPM, D Lydian, deep round sine sub-bass pedal tones sustaining D2, A2, F#2, and E2 with slow velvet attack.`
  - **Lead / Harmony**: `78 BPM, D Lydian, crystalline felt marimba and celesta arpeggio weaving 9th and #11 extensions (D-E-F#-G#-A-B-C#).`
  - **Vocal / Atmosphere**: `78 BPM, D Lydian, airy wordless soprano choir pad and granular tape shimmer blooming slowly across 2-bar phrases.`
- **Live Instrumentation SFX (Locked to D Lydian)**:
  - *Move*: Whisper-quiet brushed hi-hat tick (`5.8 kHz`).
  - *Rotate*: Soft marimba chord pluck cycling `[D5, F#5, A5, C#6]`.
  - *Land*: Warm muted floor-tom thud pitched to `D3 → D2`.
  - *Square Formed / Clear*: Ascending D Lydian glass-harp glissando + airy vocal bloom.

---

## World 02 — Jazz Fusion (`120 BPM` · `E Dorian`)
- **Visual Mood**: Hand-inked gilded parchment, botanical woodcut frames, warm sepia-gold ink.
- **Groove & Meter**: `4/4` crisp pocket fusion, `0.14` subtle pocket swing, warm tube grit (`0.05`).
- **Arrangement Arc**:
  - *Bars 1–4*: Tight ghost-note snare pocket & fingerstyle jazz bass.
  - *Bars 5–8*: Rhodes Mk1 electric piano 9th/11th voicings & intricate flute/synth phrasing.
  - *Bars 9–16*: Counterpoint horn-synth stabs and harmonized scat/vocal-pad doubles.
- **Full Lyria Master Prompt**:
  > `120 BPM, E Dorian, sophisticated modern jazz fusion instrumental. Crisp pocket drums with ghost-note snare and sizzle ride cymbal, agile fretless electric bass syncopation, warm Fender Rhodes suitcase chords with stereo tremolo, lyrical flute-lead melody, and lush jazz choir ooh pads. Tight studio room acoustics, warm analog tape saturation, loop-ready.`
- **4-Stem Prompts**:
  - **Percussion**: `120 BPM, E Dorian, crisp jazz-fusion drum kit with tight ghost-note snare, articulate ride bell patterns, and punchy dry kick.`
  - **Bass**: `120 BPM, E Dorian, expressive fretless electric bass playing melodic Dorian runs across E-B-D-A-F#.`
  - **Lead / Harmony**: `120 BPM, E Dorian, vintage Rhodes electric piano comping extended Em11 and A13 voicings paired with agile unison synth-flute runs.`
  - **Vocal / Atmosphere**: `120 BPM, E Dorian, warm jazz vocal ensemble "ooh/aah" harmonic pads doubling the upper chord extensions.`
- **Live Instrumentation SFX (Locked to E Dorian)**:
  - *Move*: Crisp ride-stick click.
  - *Rotate*: Rhodes electric piano staccato chime across `Em9` extensions.
  - *Land*: Tuned jazz tom thump (`E3 → E2`).
  - *Square Formed / Clear*: Rapid Dorian turnaround flourish + warm vocal pad swell.

---

## World 03 — Downtempo / Trip-Hop (`88 BPM` · `F# Minor`)
- **Visual Mood**: Translucent rose-and-slate watercolor washes, sweeping architectural silence.
- **Groove & Meter**: `4/4` laid-back `0.12` vinyl swing, deep sub-weight (`0.72`).
- **Arrangement Arc**:
  - *Bars 1–4*: Dusty vinyl kick/rim breakbeat & cello harmonics.
  - *Bars 5–8*: Deep sine sub-bass pulse & Rhodes/harp droplets.
  - *Bars 9–16*: Soaring operatic wordless vocal refrain & lush orchestral strings.
- **Full Lyria Master Prompt**:
  > `88 BPM, F# Minor, lush cinematic downtempo trip-hop. Dusty vinyl breakbeat drums with deep punchy kick and brushed snare, sub-heavy sine bassline, melancholic watercolor piano chords, bowed cello harmonics, and soaring wordless soprano vocal choir. Emotional, atmospheric, warm analog vinyl grain, clean loop boundaries.`
- **4-Stem Prompts**:
  - **Percussion**: `88 BPM, F# Minor, dusty laid-back trip-hop drum break, warm thudding kick, rimshot snare with plate reverb tail, subtle shaker swing.`
  - **Bass**: `88 BPM, F# Minor, deep warm analog sub-bass locking with kick syncopations on F#, A, C#, and D.`
  - **Lead / Harmony**: `88 BPM, F# Minor, delicate upright felt piano and muted harp counter-melody draped in tape echo.`
  - **Vocal / Atmosphere**: `88 BPM, F# Minor, emotional haunting wordless female vocal choir swelling over F#m7 and Dmaj7.`
- **Live Instrumentation SFX (Locked to F# Minor)**:
  - *Move*: Soft vinyl hat brush.
  - *Rotate*: Felt piano droplet in `F#m7`.
  - *Land*: Deep muted sub-tom (`F#2`).
  - *Square Formed / Clear*: Ethereal soprano harmonic swell + harp cascade.

---

## World 04 — Dark Zouk (`96 BPM` · `C Minor`)
- **Visual Mood**: Sunbaked ochre ziggurat glyphs & deep lapis lazuli water.
- **Groove & Meter**: `4/4` sensual slow-burn zouk, `0.08` micro-pocket swing, heavy sub (`0.85`).
- **Arrangement Arc**:
  - *Bars 1–4*: Iconic Dark Zouk heartbeat double-kick (`1` & `"ah-of-1"`) with rim clicks and dark pad.
  - *Bars 5–8*: Thick velvety sub-bass rolling under moody Rhodes/plucked synth arps.
  - *Bars 9–16*: Moody pitched vocal chops & lush nocturnal minor-9th synth swells.
- **Full Lyria Master Prompt**:
  > `96 BPM, C Minor, modern nocturnal Dark Zouk instrumental. Signature sensual zouk heartbeat kick pattern with crisp syncopated rimshot and subtle shaker, massive warm analog sub-bass glide, moody minor-9th Rhodes chords, hypnotic plucked guitar/synth ostinato, and atmospheric pitched R&B vocal chops in dark reverb. Hypnotic, silky, heavy low-end, club-grade polish.`
- **4-Stem Prompts**:
  - **Percussion**: `96 BPM, C Minor, authentic Dark Zouk drum groove: deep heartbeat double-kick (1, 1-a, 2, 3, 3-a, 4), crisp rim-clap on 2 and 4, silky 8th-note hi-hat.`
  - **Bass**: `96 BPM, C Minor, thick gliding sine-triangle sub-bass locking tightly into the zouk kick pocket on C, Ab, F, and G.`
  - **Lead / Harmony**: `96 BPM, C Minor, sultry muted synth pluck and Rhodes minor-9th comping with subtle chorus and stereo delay.`
  - **Vocal / Atmosphere**: `96 BPM, C Minor, moody dark-R&B pitched vocal chops on offbeat 6 and 14 over brooding Cm9 formant pads.`
- **Live Instrumentation SFX (Locked to C Minor)**:
  - *Move*: Silky high-hat tick.
  - *Rotate*: Dark muted Rhodes/pluck chord tone (`Cm9`).
  - *Land*: Warm tuned 808-style heartbeat thump (`C3 → C2`).
  - *Square Formed / Clear*: Moody C Minor vocal chop swell + silky synth cascade.

---

## World 05 — Bossa Nova (`112 BPM` · `F Major 9`)
- **Visual Mood**: Backlit papercut origami lanterns & warm amber parchment shadows.
- **Groove & Meter**: `4/4` swaying Rio nylon groove (`0.05` micro-lilt), zero distortion (`0.00`).
- **Arrangement Arc**:
  - *Bars 1–4*: Cross-stick rim clave, soft cabasa, and nylon-string fingerstyle chords.
  - *Bars 5–8*: Warm acoustic upright bass root-fifth bounce (`F – C – G – D`).
  - *Bars 9–16*: Breezy flute melody & soft wordless Brazilian jazz scat/pad harmony.
- **Full Lyria Master Prompt**:
  > `112 BPM, F Major, intimate sunlit acoustic Bossa Nova. Nylon-string classical guitar playing syncopated Rio chord voicings (Fmaj9, Gm7, C13), gentle wooden cross-stick rimshot clave, soft brushed shaker, warm acoustic upright bass root-fifth groove, lyrical wooden flute lead, and airy wordless "ba-da" vocal harmonies. Intimate acoustic wood warmth, zero harsh compression.`
- **4-Stem Prompts**:
  - **Percussion**: `112 BPM, F Major, authentic Bossa Nova drum pattern with crisp wooden rim-click clave, soft cabasa 8th notes, and warm muffled kick.`
  - **Bass**: `112 BPM, F Major, warm acoustic double bass playing classic root-fifth bossa pulse (F2–C3–G2–D3).`
  - **Lead / Harmony**: `112 BPM, F Major, fingerpicked nylon classical guitar jazz voicings paired with a warm breathy concert flute.`
  - **Vocal / Atmosphere**: `112 BPM, F Major, soft sunlit Brazilian jazz vocal choir singing velvety "ooh" major-9th harmonies.`
- **Live Instrumentation SFX (Locked to F Major)**:
  - *Move*: Soft wooden cabasa/shaker brush.
  - *Rotate*: Nylon guitar harmonic pluck (`Fmaj9`).
  - *Land*: Warm upright bass body tap (`F2`).
  - *Square Formed / Clear*: Breezy F Major flute arpeggio + vocal warmth.

---

## World 06 — Country Music (`114 BPM` · `G Major`)
- **Visual Mood**: Hand-painted Mediterranean gouache cliffs, sunlit olive groves, coastal sky.
- **Groove & Meter**: `4/4` classic train-beat acoustic stride (`0.06` pocket lilt), warm tube twang (`0.04`).
- **Arrangement Arc**:
  - *Bars 1–4*: Brushed train-beat snare & bright dreadnought acoustic guitar strumming (`G – C – D`).
  - *Bars 5–8*: Alternating root-fifth upright/P-bass & crisp chicken-pickin' Telecaster riffs.
  - *Bars 9–16*: Soaring pedal-steel guitar bends & warm golden vocal harmony pads.
- **Full Lyria Master Prompt**:
  > `114 BPM, G Major, uplifting modern acoustic Country instrumental. Bright dreadnought acoustic guitar strums, crisp Telecaster clean chicken-pickin' arpeggio hooks, expressive weeping pedal steel guitar swells, steady brushed train-beat snare drum, alternating root-fifth warm bassline, and sunlit country vocal ooh harmonies. Crisp Nashville studio clarity, warm analog tape polish.`
- **4-Stem Prompts**:
  - **Percussion**: `114 BPM, G Major, classic country train-beat with brushed snare 8th notes, punchy accent on 2 and 4, and solid organic kick.`
  - **Bass**: `114 BPM, G Major, warm round electric/upright bass alternating roots and fifths across G, C, and D.`
  - **Lead / Harmony**: `114 BPM, G Major, clean twangy Telecaster arpeggios and acoustic mandolin/guitar picking on bright G Major pentatonic hooks.`
  - **Vocal / Atmosphere**: `114 BPM, G Major, singing pedal steel glide layered with warm sunlit country choir harmonies.`
- **Live Instrumentation SFX (Locked to G Major)**:
  - *Move*: Crisp acoustic pick-tick.
  - *Rotate*: Clean Telecaster twang chord note (`G – B – D – A`).
  - *Land*: Brushed floor tom thump (`G2`).
  - *Square Formed / Clear*: Bright G Major pentatonic banjo/Tele cascade + steel swell.

---

## World 07 — Salsa (`172 BPM` · `D Minor`)
- **Visual Mood**: Vermilion desert swells, luminous sunset sandstone, kinetic silk ribbons.
- **Groove & Meter**: `4/4` driving `3-2` Son Clave & Tumbao syncopation (`0.00` crisp lock).
- **Arrangement Arc**:
  - *Bars 1–4*: Piercing hardwood `3-2` clave, crisp timbale cascara shell, and conga slap.
  - *Bars 5–8*: Syncopated baby-bass tumbao anticipating beats `2-and` and `4-and` + bright montuno piano.
  - *Bars 9–16*: Fiery horn-section punches (trumpets & trombones) & festive coro-style vocal harmonies.
- **Full Lyria Master Prompt**:
  > `172 BPM, D Minor, energetic classic New York Salsa Dura instrumental. Crisp 3-2 hardwood Son Clave, driving timbale cascara and cowbell, resonant conga tumbao slaps, syncopated upright baby-bass anticipating the "and" of 2 and 4, sparkling octave-doubled salsa piano montuno riff, and punchy brass section (trumpets and trombones) with celebratory coro vocal harmonies. Crisp live studio room, fiery rhythmic precision.`
- **4-Stem Prompts**:
  - **Percussion**: `172 BPM, D Minor, fiery Salsa percussion ensemble: crisp 3-2 Son Clave, timbale cascara & bongo bell, open/slap conga tumbao.`
  - **Bass**: `172 BPM, D Minor, authentic syncopated Salsa upright bass tumbao anticipating the "and" of beats 2 and 4 across Dm7, Gm7, and A7.`
  - **Lead / Harmony**: `172 BPM, D Minor, sparkling bright acoustic grand piano octave montuno comping paired with tight brass stabs.`
  - **Vocal / Atmosphere**: `172 BPM, D Minor, bright Latin brass swells and energetic call-and-response coro vocal harmonies.`
- **Live Instrumentation SFX (Locked to D Minor)**:
  - *Move*: Crisp woodblock / cascara tick.
  - *Rotate*: Piano montuno octave chord stab (`Dm7` / `A7`).
  - *Land*: Resonant open conga thump (`D3 → D2`).
  - *Square Formed / Clear*: Brass-and-piano montuno flourish up D Harmonic Minor.

---

## World 08 — Synthwave (`118 BPM` · `A Minor`)
- **Visual Mood**: Dusk violet-to-peach mesa silhouettes, floating twilight lanterns.
- **Groove & Meter**: `4/4` driving straight eighth-note pulse, warm analog chorus & drive (`0.14`).
- **Arrangement Arc**:
  - *Bars 1–4*: Gated 80s snare reverb & pulsing 8th-note Juno saw bass (`A – F – D – E`).
  - *Bars 5–8*: Sparkling analog arpeggiator & warm retro-brass poly-synth chords.
  - *Bars 9–16*: Nostalgic soaring synth lead & lush vocoder-pad chorus harmonies.
- **Full Lyria Master Prompt**:
  > `118 BPM, A Minor, pastel sunset Synthwave / Outrun instrumental. Punchy analog LinnDrum kick and wide gated-reverb snare, driving eighth-note Juno-106 sawtooth bassline, sparkling arpeggiated analog synth leads, warm chorus-drenched poly-synth chords (Am, F, Dm, Em), and dreamy vocoder choir pads. Nostalgic warm tape glow, lush stereo width, crisp modern punch.`
- **4-Stem Prompts**:
  - **Percussion**: `118 BPM, A Minor, retro 80s drum machine with punchy electronic kick, wide gated-reverb snare on 2 and 4, and crisp 8th-note closed hats.`
  - **Bass**: `118 BPM, A Minor, driving analog Juno sawtooth eighth-note rolling bassline following A–F–D–E.`
  - **Lead / Harmony**: `118 BPM, A Minor, shimmering retro synth arpeggio and bright chorus-laden saw lead melody.`
  - **Vocal / Atmosphere**: `118 BPM, A Minor, warm pastel vocoder choir pad and analog ribbon brass swells across Am7 and Fmaj7.`
- **Live Instrumentation SFX (Locked to A Minor)**:
  - *Move*: Analog closed hat tick.
  - *Rotate*: Bright Juno-60 arpeggio pluck (`Am7`).
  - *Land*: Electronic tom punch (`A2`).
  - *Square Formed / Clear*: Ascending retro-synth arpeggio burst + gated shimmer.

---

## World 09 — Swing (`144 BPM` · `Bb Major`)
- **Visual Mood**: Mid-century candy pastel meadow, curving kite ribbons, buoyant geometry.
- **Groove & Meter**: `4/4` authentic triplet Swing (`0.33` swing ratio), brisk big-band bounce (`0.04`).
- **Arrangement Arc**:
  - *Bars 1–4*: Sizzling ride cymbal `"spang-a-lang"` (`1, 2-and, 3, 4-and`) & walking upright bass.
  - *Bars 5–8*: Crisp gypsy/archtop guitar Freddie Green `"four-on-the-floor"` chunk & vibraphone comping.
  - *Bars 9–16*: Jubilant swung clarinet/brass horn riffs & close-harmony jazz vocal pads.
- **Full Lyria Master Prompt**:
  > `144 BPM, Bb Major, joyful mid-century Big Band Swing instrumental with hard triplet swing feel. Sizzling brass ride cymbal "spang-a-lang" pattern, brushed snare backbeat, energetic walking upright double bass quarter notes, crisp acoustic archtop rhythm guitar, sparkling vibraphone chords, and playful muted trumpet & clarinet swing horn riffs with tight vocal ensemble harmonies. Lively vintage hi-fi room warmth.`
- **4-Stem Prompts**:
  - **Percussion**: `144 BPM, Bb Major, lively jazz swing kit with unmistakable triplet "spang-a-lang" ride cymbal, feather-kick, and hi-hat chick on beats 2 and 4.`
  - **Bass**: `144 BPM, Bb Major, energetic acoustic upright double bass walking steady quarter notes through Bb6, Cm7, F7, Bbmaj7.`
  - **Lead / Harmony**: `144 BPM, Bb Major, sparkling vibraphone melodies, archtop jazz guitar chords, and snappy swung brass horn hits.`
  - **Vocal / Atmosphere**: `144 BPM, Bb Major, buoyant close-harmony 1950s jazz vocal choir pads swelling on turnaround cadences.`
- **Live Instrumentation SFX (Locked to Bb Major)**:
  - *Move*: Crisp hi-hat chick / wood rim.
  - *Rotate*: Vibraphone bell hit cycling `Bb6` / `F9`.
  - *Land*: Warm acoustic bass/floor-tom thump (`Bb2`).
  - *Square Formed / Clear*: Rapid swung jazz turnaround lick + brass chord punch.

---

## World 10 — Country Blues Rock (`104 BPM` · `E Blues`)
- **Visual Mood**: Midnight theater fog, glowing amber sodium lamps, nocturnal highway silhouettes.
- **Groove & Meter**: `4/4` swampy shuffle (`0.24` swing ratio), warm tube overdrive (`0.22`).
- **Arrangement Arc**:
  - *Bars 1–4*: Heavy room-mic snare backbeat & gritty flatwound bass walking blues turnarounds.
  - *Bars 5–8*: Overdriven hollow-body electric guitar bending `b3 → 3` & `b5` blue notes.
  - *Bars 9–16*: Wurlitzer/Hammond B3 organ swell & dusty soulful gospel choir humming.
- **Full Lyria Master Prompt**:
  > `104 BPM, E Minor Blues, moody nocturnal Country Blues Rock instrumental with lazy 12/8 shuffle feel. Deep room-mic drum kit with heavy snare crack, dusty tube-amped hollow-body electric guitar playing lyrical blues bends and tremolo chords, gritty walking electric bass, warm Hammond B3 organ swells, and haunting soulful gospel humming choir. Cinematic midnight highway atmosphere, warm vintage analog grit.`
- **4-Stem Prompts**:
  - **Percussion**: `104 BPM, E Blues, heavy room-mic blues-rock shuffle with deep kick, fat wood snare on 2 and 4, and swung ride shimmer.`
  - **Bass**: `104 BPM, E Blues, warm P-bass playing classic blues shuffle riffs on E, G, A, Bb, B, and D.`
  - **Lead / Harmony**: `104 BPM, E Blues, expressive tube-driven hollow-body electric guitar riffs and tremolo chords with spring reverb.`
  - **Vocal / Atmosphere**: `104 BPM, E Blues, soulful midnight gospel choir hums and warm swirling Hammond organ pads.`
- **Live Instrumentation SFX (Locked to E Blues)**:
  - *Move*: Brushed tambourine/hat shuffle tick.
  - *Rotate*: Clean-to-crunch guitar double-stop (`E7`).
  - *Land*: Deep concert floor-tom thud (`E2`).
  - *Square Formed / Clear*: Expressive E Blues pentatonic guitar lick + organ swell.

---

## World 11 — Dark Ambient (`82 BPM` · `C# Minor`)
- **Visual Mood**: Monochrome silver mist, stark spotlight shafts, charcoal timber silhouettes.
- **Groove & Meter**: `4/4` stark minimalist pulse (`0.00` swing), deep sub pressure (`0.78`), tape grit (`0.08`).
- **Arrangement Arc**:
  - *Bars 1–4*: Distant subterranean metallic thud & sub-octave bow drone.
  - *Bars 5–8*: Detuned tape-loop glass piano echoes & bowed metallic chimes.
  - *Bars 9–16*: Vast haunting dark choir cluster swells & sub-bass resonance.
- **Full Lyria Master Prompt**:
  > `82 BPM, C# Minor, atmospheric cinematic Dark Ambient instrumental. Deep sub-bass rumble, sparse muffled industrial heartbeat pulse, ghostly detuned upright piano echoes in vast cavernous reverb, bowed metallic resonance, and haunting dark minor choir swells. Cold silver mist atmosphere, hypnotic minimal tension, clean bar boundaries.`
- **4-Stem Prompts**:
  - **Percussion**: `82 BPM, C# Minor, sparse muted sub-kick pulse on beats 1 and 3 with distant metallic brushed echoes.`
  - **Bass**: `82 BPM, C# Minor, cavernous sub-bass drone holding C#1, A1, F#1, and G#1 with subtle analog tape saturation.`
  - **Lead / Harmony**: `82 BPM, C# Minor, fragile detuned felt piano notes and bowed glass harmonics drifting slowly.`
  - **Vocal / Atmosphere**: `82 BPM, C# Minor, haunting gothic wordless choir pads fading through dark cathedral reverb.`
- **Live Instrumentation SFX (Locked to C# Minor)**:
  - *Move*: Subtle muted click.
  - *Rotate*: Ghostly detuned piano note (`C#m7`).
  - *Land*: Muffled cavern thud (`C#2`).
  - *Square Formed / Clear*: Dark choir swell + bowed metallic shimmer.

---

## World 12 — Electric Fusion (`128 BPM` · `G Dorian / Mixolydian`)
- **Visual Mood**: Art Deco champagne brass geometry & luminous jade circuit traces.
- **Groove & Meter**: `4/4` tight syncopated pocket (`0.10` swing), crisp analog drive (`0.16`).
- **Arrangement Arc**:
  - *Bars 1–4*: Tight electro-acoustic break & slapped funk-fusion bassline.
  - *Bars 5–8*: Clavinet/synth chord stabs & intricate unison synth-guitar arpeggio lines.
  - *Bars 9–16*: Soaring legato synth solo & lush jazz-tronics vocal-harmony swells.
- **Full Lyria Master Prompt**:
  > `128 BPM, G Dorian, high-tech Art Deco Electric Funk Fusion instrumental. Tight electro-acoustic punchy drum groove, aggressive syncopated slap-synth bassline, funky clavinet and Rhodes electric piano stabs, soaring legato analog synth-guitar lead unison runs, and sleek vocoded choir pads. Glossy studio hi-fi precision, dynamic modern jazz-tronica energy.`
- **4-Stem Prompts**:
  - **Percussion**: `128 BPM, G Dorian, razor-sharp hybrid acoustic-electronic funk fusion drums with snappy ghost snares and tight closed hats.`
  - **Bass**: `128 BPM, G Dorian, punchy slapped electric bass doubled with an analog saw sub playing syncopated 16th-note fusion grooves.`
  - **Lead / Harmony**: `128 BPM, G Dorian, funky clavinet stabs, Rhodes 11th chords, and agile legato synth lead riffs.`
  - **Vocal / Atmosphere**: `128 BPM, G Dorian, sleek harmonized Art Deco vocal pads and shimmering brass-synth swells.`
- **Live Instrumentation SFX (Locked to G Dorian)**:
  - *Move*: Tight electronic shaker tick.
  - *Rotate*: Funky Rhodes/clavinet chord stab (`Gm11`).
  - *Land*: Tight synth-tom punch (`G2`).
  - *Square Formed / Clear*: Legato G Dorian fusion shred run + chord hit.

---

## World 13 — Trap (`140 BPM` · `F Minor`)
- **Visual Mood**: Pastel glacier cyan & rose-magenta crystalline prism shards.
- **Groove & Meter**: `4/4` half-time `140 BPM` Trap bounce (`0.00` rigid grid), massive 808 sub (`0.98`), harmonic saturation (`0.28`).
- **Arrangement Arc**:
  - *Bars 1–4*: Skittering 32nd-note hi-hat rolls, snappy trap clap on beat 3, and trembling crystalline bell arp.
  - *Bars 5–8*: Booming distorted 808 bass glides (`F1 → Db1 → C1`) punching beneath dark minor plucks.
  - *Bars 9–16*: Hypnotic pitched-up/down atmospheric vocal chops & wide brass-pad swells.
- **Full Lyria Master Prompt**:
  > `140 BPM, F Phrygian Minor, melodic pastel Trap instrumental in half-time feel. Massive saturated 808 sub-bass slides, razor-sharp trap clap on beat 3, intricate triplet and 32nd-note skittering hi-hat rolls, shimmering crystalline bell arpeggios, moody minor synth plucks, and ethereal atmospheric vocal chops in lush hall reverb. Clean punchy modern trap mix, crisp low-end authority.`
- **4-Stem Prompts**:
  - **Percussion**: `140 BPM, F Minor, modern half-time Trap drums: punchy transient kick, sharp layered trap clap on beat 3, intricate fast 32nd-note hi-hat rolls and triplets.`
  - **Bass**: `140 BPM, F Minor, thunderous saturated 808 sub-bass with smooth pitch slides anchored on F1, Gb1, Db1, and C1.`
  - **Lead / Harmony**: `140 BPM, F Minor, hypnotic icy crystal bell arpeggio and dark minor analog synth plucks.`
  - **Vocal / Atmosphere**: `140 BPM, F Minor, lush ethereal pitched vocal chops on offbeats layered over wide dreamy minor pads.`
- **Live Instrumentation SFX (Locked to F Minor)**:
  - *Move*: Crisp trap hi-hat roll tick.
  - *Rotate*: Icy crystal bell chime (`Fm7`).
  - *Land*: Deep 808 sub-thump (`F2 → F1`).
  - *Square Formed / Clear*: Pitch-shifted vocal chop + crystalline bell cascade.

---

## World 14 — Chiptune Funk (`126 BPM` · `C Mixolydian`)
- **Visual Mood**: Mossy floating pixel terraces, golden rotating cube chimes, crisp sky.
- **Groove & Meter**: `4/4` playful retro groove (`0.06` pocket lilt), gentle 8-bit bit-edge (`0.08`).
- **Arrangement Arc**:
  - *Bars 1–4*: Crisp FM-noise drum groove & bouncy square-wave funk bassline.
  - *Bars 5–8*: Rapid pulse-width chiptune arpeggios & brassy 16-bit synth chords.
  - *Bars 9–16*: Gleaming dual-oscillator chip harmonies & warm vocoder-like pad shimmer.
- **Full Lyria Master Prompt**:
  > `126 BPM, C Mixolydian, joyful warm Chiptune Funk instrumental blending 8-bit NES/GameBoy pulse waves with modern studio warmth. Bouncy square-wave funk bassline, crisp synthesized noise snare and hats, sparkling fast pulse-width chiptune arpeggios, upbeat C Mixolydian video-game horn-synth melodies, and warm lush pad harmonies. Crisp, playful, zero ear fatigue.`
- **4-Stem Prompts**:
  - **Percussion**: `126 BPM, C Mixolydian, crisp 16-bit electronic funk drums with punchy triangle kick, tight noise snare, and energetic 16th-note hats.`
  - **Bass**: `126 BPM, C Mixolydian, bouncy syncopated square-wave synth funk bass popping octaves on C, Bb, F, and G.`
  - **Lead / Harmony**: `126 BPM, C Mixolydian, dazzling warm chiptune pulse-wave arpeggios and playful melodic synth hooks.`
  - **Vocal / Atmosphere**: `126 BPM, C Mixolydian, glowing warm synth-choir pads supporting the retro chiptune harmony.`
- **Live Instrumentation SFX (Locked to C Mixolydian)**:
  - *Move*: Crisp 8-bit hat tick.
  - *Rotate*: Sparkling square-wave chord blip (`C9` / `Bb`).
  - *Land*: Punchy triangle drum thump (`C3 → C2`).
  - *Square Formed / Clear*: Classic ascending chiptune coin/powerup arpeggio.

---

## World 15 — Alt Rock (`134 BPM` · `D Drop-D Minor`)
- **Visual Mood**: Sun-bleached *ligne-claire* ink horizons, sweeping desert gliders, terracotta stone.
- **Groove & Meter**: `4/4` driving straight pulse (`0.00` swing), rich crunch guitar overdrive (`0.58`).
- **Arrangement Arc**:
  - *Bars 1–4*: Driving acoustic rock drums & chugging Drop-D fuzz bassline.
  - *Bars 5–8*: Layered crunched power-chord guitars (`D5 – Bb5 – G5 – A5`) & melodic clean delay lead.
  - *Bars 9–16*: Anthemic wall-of-sound post-rock chorus chords & soaring wordless backing vocals.
- **Full Lyria Master Prompt**:
  > `134 BPM, D Minor (Drop-D), driving melodic desert Alt Rock / Post-Rock instrumental. Punchy live acoustic rock drums with crisp crash cymbals and driving kick, growling distorted rock bass guitar, layered crunchy power-chord rhythm guitars (D5, Bb5, G5, A5), shimmering delay-drenched lead guitar riff, and soaring anthemic wordless backing vocals. Wide desert-sky dynamics, warm analog amp saturation.`
- **4-Stem Prompts**:
  - **Percussion**: `134 BPM, D Minor, driving live rock drum kit with energetic kick on 1 and 3-and, cracking snare on 2 and 4, and sizzling open hi-hats.`
  - **Bass**: `134 BPM, D Minor, picked distorted Drop-D electric bass driving steady eighth notes along D, Bb, G, and A.`
  - **Lead / Harmony**: `134 BPM, D Minor, thick overdriven tube-amp power chords layered with bright delay-soaked alt-rock lead melodies.`
  - **Vocal / Atmosphere**: `134 BPM, D Minor, anthemic wordless "oh-oh" backing vocal harmonies and shimmering post-rock string pads.`
- **Live Instrumentation SFX (Locked to D Minor)**:
  - *Move*: Palm-muted electric guitar pick scratch (`2.2 kHz`).
  - *Rotate*: Crunch guitar power-chord accent (`D5` / `Bb5`).
  - *Land*: Punchy rock floor-tom hit (`D2`).
  - *Square Formed / Clear*: Soaring alt-rock delay riff + power-chord swell.

---

## World 16 — Bachata (`128 BPM` · `A Minor`)
- **Visual Mood**: Plum-and-apricot twilight harbor, sea-glass water, glowing paper lanterns.
- **Groove & Meter**: `4/4` authentic Dominican Bachata (`0.00` crisp grid) with iconic **beat-4 pop accent**.
- **Arrangement Arc**:
  - *Bars 1–4*: Crisp metallic güira 8th/16th scrape, bongo martillo pulse, and melodic clean requinto arpeggios.
  - *Bars 5–8*: Warm round Bachata bass locking beats `1, 2-and, 3` with the signature beat-4 bongo pop.
  - *Bars 9–16*: Romantic chorus guitar counter-melody (`Am – Dm – C – E7`) & velvet vocal harmonies.
- **Full Lyria Master Prompt**:
  > `128 BPM, A Minor, warm romantic modern Bachata instrumental. Crisp metallic Dominican güira scrape, expressive bongo martillo drums with signature pop accent on beat 4, warm round electric bassline hitting 1, 2-and, 3, sparkling chorused clean electric requinto lead guitar playing lyrical arpeggios and hammer-ons (Am, Dm, C, E7), soft nylon rhythm guitar, and tender romantic vocal ooh harmonies. Clear intimate acoustic balance.`
- **4-Stem Prompts**:
  - **Percussion**: `128 BPM, A Minor, authentic Bachata rhythm section: bright rhythmic güira shaker, warm bongo martillo groove, unmistakable high bongo pop accent on beat 4.`
  - **Bass**: `128 BPM, A Minor, warm round electric bass playing classic Bachata pattern (1, 2-and, 3, 4-and) across A, D, C, and E.`
  - **Lead / Harmony**: `128 BPM, A Minor, crystal-clear chorused Bachata requinto lead guitar arpeggios paired with rhythmic nylon chord strums.`
  - **Vocal / Atmosphere**: `128 BPM, A Minor, warm romantic Latin pop choir pads swelling delicately over the turnaround E7 cadence.`
- **Live Instrumentation SFX (Locked to A Minor)**:
  - *Move*: Crisp güira / bongo rim tick.
  - *Rotate*: Sparkling chorused requinto guitar harmonic (`Am7` / `E7`).
  - *Land*: Warm low bongo thump (`A2`).
  - *Square Formed / Clear*: Romantic cascading requinto hammer-on flourish.

---

## World 17 — Kizomba (`92 BPM` · `Eb Minor`)
- **Visual Mood**: Deep aquamarine coral arches, sunlit ocean shafts, mother-of-pearl shells.
- **Groove & Meter**: `4/4` hypnotic slow Angolan pulse (`0.06` pocket), ultra-deep sub (`0.90`).
- **Arrangement Arc**:
  - *Bars 1–4*: Iconic Kizomba soft double-thump kick & delicate rimshot tick.
  - *Bars 5–8*: Deep enveloping sine sub-bass pulse & gentle acoustic/electric Tarraxinha synth plucks.
  - *Bars 9–16*: Silky nostalgic vocal harmony pads & shimmering underwater Rhodes chords.
- **Full Lyria Master Prompt**:
  > `92 BPM, Eb Minor, silky hypnotic Kizomba / Tarraxinha instrumental. Deep sensual Kizomba double-heartbeat kick drum, crisp minimal rimshot and soft wood shaker, enveloping warm analog sub-bass pulse, delicate plucked acoustic guitar and warm Rhodes chords (Ebm7, Bmaj7, Abm7, Bb7), and silky atmospheric Portuguese-style wordless vocal harmonies. Smooth, hypnotic, deep warm low-end.`
- **4-Stem Prompts**:
  - **Percussion**: `92 BPM, Eb Minor, authentic Kizomba heartbeat drum groove with warm double-thump kick syncopation, crisp rimshot on 2 and 4, and silky 8th-note shaker.`
  - **Bass**: `92 BPM, Eb Minor, deep velvety analog sub-bass breathing in lockstep with the heartbeat kick across Eb, B, Ab, and Bb.`
  - **Lead / Harmony**: `92 BPM, Eb Minor, intimate plucked electric guitar melody and glassy Rhodes minor-7th chord washes.`
  - **Vocal / Atmosphere**: `92 BPM, Eb Minor, warm breathy romantic vocal choir pads floating over deep aquatic reverb.`
- **Live Instrumentation SFX (Locked to Eb Minor)**:
  - *Move*: Soft shaker / water-drop tick.
  - *Rotate*: Glassy Rhodes minor-9th chord chime (`Ebm9`).
  - *Land*: Velvety Kizomba sub-kick thump (`Eb2`).
  - *Square Formed / Clear*: Warm vocal swell + liquid guitar harmonic cascade.

---

## World 18 — Reggaeton (`95 BPM` · `G Minor`)
- **Visual Mood**: Rose-violet twilight tarot sky, metallic foil arches, vibrant dusk velocity.
- **Groove & Meter**: `4/4` unmistakable **Dembow** boom-ch-boom-chick rhythm (`0.00` tight grid), massive sub (`0.92`).
- **Arrangement Arc**:
  - *Bars 1–4*: Punchy 4-on-the-floor Dembow kick & syncopated snare (`1-and-ah` & `2-and`, `3-and-ah` & `4-and`).
  - *Bars 5–8*: Heavy sub-bass bounce & dark minor plucked marimba/synth lead hooks.
  - *Bars 9–16*: Rhythmic chopped vocal melodies & modern neon-synth stadium pads.
- **Full Lyria Master Prompt**:
  > `95 BPM, G Minor, polished modern melodic Reggaeton instrumental. Unmistakable punchy Dembow drum pattern (4-on-the-floor kick with classic syncopated offbeat dembow snare), deep sub-heavy 808/sine bassline, infectious minor-key plucked marimba and brassy synth lead hooks (Gm, Eb, Cm, Ab), and rhythmic chopped vocal accents in bright stereo delay. Club-ready low-end punch, crisp modern Latin urban production.`
- **4-Stem Prompts**:
  - **Percussion**: `95 BPM, G Minor, classic punchy Reggaeton Dembow beat: tight four-on-the-floor kick, crisp syncopated dembow snare pattern, energetic shaker top.`
  - **Bass**: `95 BPM, G Minor, deep heavy sine/808 Reggaeton bass bouncing cleanly between G1, Eb1, and C1.`
  - **Lead / Harmony**: `95 BPM, G Minor, catchy dark minor Latin synth-marimba pluck hook and punchy saw-brass stabs.`
  - **Vocal / Atmosphere**: `95 BPM, G Minor, rhythmic chopped R&B/urban vocal hooks on syncopated offbeats over wide minor synth pads.`
- **Live Instrumentation SFX (Locked to G Minor)**:
  - *Move*: Crisp dembow hi-hat tick.
  - *Rotate*: Latin synth-pluck chord stab (`Gm7`).
  - *Land*: Punchy dembow sub-kick thump (`G2 → G1`).
  - *Square Formed / Clear*: Syncopated vocal chop + Phrygian synth riser.

---

## World 19 — Heavy Metal (`162 BPM` · `E Phrygian Dominant`)
- **Visual Mood**: Hand-drawn rust copper steamworks, riveted brass gears, verdigris haze.
- **Groove & Meter**: `4/4` relentless double-kick gallop (`0.00` razor lock), maximum saturation (`0.92`).
- **Arrangement Arc**:
  - *Bars 1–4*: Machine-gun double-kick 16th pedals & palm-muted `0-0-0-0-1-0` low-E chug riffs.
  - *Bars 5–8*: Dual-tracked high-gain distorted rhythm guitars hitting E5 / F5 / Bb5 Phrygian intervals.
  - *Bars 9–16*: Harmonized neoclassical twin-guitar shred melody & dramatic symphonic choir swells.
- **Full Lyria Master Prompt**:
  > `162 BPM, E Phrygian Dominant, aggressive modern melodic Heavy Metal instrumental. Tight machine-gun double-kick bass drums, thunderous cracking snare backbeat, aggressive picked distorted bass guitar, dual-tracked high-gain palm-muted chugging electric guitars (E5, F5, Am, Bm), harmonized neoclassical twin-guitar shred melodies, and dramatic dark symphonic choir swells. Tight modern metal studio production, punchy low-mid clarity.`
- **4-Stem Prompts**:
  - **Percussion**: `162 BPM, E Phrygian Dominant, relentless double-kick metal drum kit with triggered beater click, ferocious snare crack, and bright china/crash accents.`
  - **Bass**: `162 BPM, E Phrygian Dominant, aggressive picked overdriven metal bass locking tightly with the double-kick gallop on low E and F.`
  - **Lead / Harmony**: `162 BPM, E Phrygian Dominant, dual-tracked high-gain palm-muted power-chord riffs and harmonized twin-guitar shred arpeggios.`
  - **Vocal / Atmosphere**: `162 BPM, E Phrygian Dominant, epic dark symphonic choir pads soaring above the heavy guitar wall.`
- **Live Instrumentation SFX (Locked to E Phrygian Dominant)**:
  - *Move*: Palm-muted distorted pick chug scratch.
  - *Rotate*: High-gain distorted fifth power-chord stab (`E5` / `F5`).
  - *Land*: Heavy triggered double-kick beater thump (`E2 → E1`).
  - *Square Formed / Clear*: Blistering Phrygian Dominant shred sweep + choir roar.

---

## World 20 — Liquid DnB (`174 BPM` · `F# Minor`)
- **Visual Mood**: Bioluminescent forest canopy, glowing pale mint willows, pastel blossom light.
- **Groove & Meter**: `4/4` rapid breakbeat (`0.00` locked grid), deep rolling Reese/sub (`0.85`), gentle warm drive (`0.18`).
- **Arrangement Arc**:
  - *Bars 1–4*: Crisp two-step Amen/Think breakbeat (`174 BPM`) & fast 16th shaker rolls.
  - *Bars 5–8*: Rolling warm analog sub-bassline & shimmering jazzy piano/Rhodes chords (`F#m9 – Bm9 – Dmaj9`).
  - *Bars 9–16*: Soaring euphoric female vocal chop melody & luminous liquid synth pads.
- **Full Lyria Master Prompt**:
  > `174 BPM, F# Minor, euphoric luminous Liquid Drum and Bass instrumental. Crisp fast two-step breakbeat drums with rolling 16th-note tambourine shakers and snappy snare, deep rolling warm analog sub-bass, shimmering emotional grand piano and Rhodes 9th chords, ethereal soaring female vocal chops in lush stereo delay, and luminous atmospheric synth pads. Sparkling hi-fi clarity, uplifting kinetic momentum.`
- **4-Stem Prompts**:
  - **Percussion**: `174 BPM, F# Minor, fast rolling Liquid DnB two-step breakbeat (kick on 1 and 3-and, snappy snare on 2 and 4) with sparkling 16th-note shakers.`
  - **Bass**: `174 BPM, F# Minor, deep warm rolling Reese-filtered sine sub-bass gliding smoothly across F#1, B1, D2, and C#2.`
  - **Lead / Harmony**: `174 BPM, F# Minor, sparkling emotional acoustic piano arpeggios and warm Rhodes minor-9th chord washes.`
  - **Vocal / Atmosphere**: `174 BPM, F# Minor, euphoric luminous female vocal chops and sweeping atmospheric pads drenched in sunlit reverb.`
- **Live Instrumentation SFX (Locked to F# Minor)**:
  - *Move*: Crisp 16th-note breakbeat hi-hat tick.
  - *Rotate*: Luminous piano/Rhodes minor-9th stab (`F#m9`).
  - *Land*: Punchy DnB sub-kick thud (`F#2 → F#1`).
  - *Square Formed / Clear*: Euphoric Liquid DnB vocal chop + cascading piano arpeggio.
