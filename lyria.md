# Iluminado — 50 Copy-Paste Lyria Level Prompts (v3: upbeat, serene, organic)

Every prompt below is **100% self-contained** and ready to paste directly into Lyria for generating `music/world1.ogg` through `music/world50.ogg`.

## Direction

The target is **upbeat but serene**: the groove is what makes it bounce, and the space, the harmony, and the melody are what make it calm. The v2 prompts leaned on chiptune squares, glitch clicks, hyperpop leads, and “razor-sharp / slam in” language, which is what made the tracks blippy and video-gamey. The older tracks had the elegance and theme-matching but were too song-shaped, with long starts. v3 brings back world-matched palettes (anchored to each skin’s inspiration and mood), keeps v2’s immediate loop-ready groove, and replaces the blips with real instruments played in unexpected company.

## Design rules baked into every prompt

* **Already grooving on beat 1, but gently.** The first sound is a downbeat with the full groove in motion (no pad fade-in, no silence, no riser, no ambient build), and the entry is soft-edged rather than slammed.
* **One continuous groove, no song form.** No verse, chorus, drop, or breakdown. Interest comes from instruments trading two-bar phrases, and the last bar turns around straight into beat 1 so the loop never announces itself.
* **Dead-steady 4/4 locked to the sweep.** One timeline sweep is 8 beats (`480 ÷ BPM` seconds), so every prompt demands no rubato and no tempo changes, and compound-feel worlds say “four beats per bar, never 3/4”.
* **Two lead genres, not five.** Each prompt leads with a primary fusion and lets the rest of the Style line appear only as supporting colors, because Lyria blends a short, ordered list far better than a long equal-weight one. Every world also has one **cross-idiom twist**, an instrument from one tradition playing in the idiom of another (a lute through dub echo, a koto played like a funk bass, a talking drum answering a Mellotron).
* **Organic first, electronics as warmth.** Leads are acoustic or vintage voices (lute, oud, nyckelharpa, shakuhachi, vibraphone, clarinet, pedal steel). Synths only provide sub weight, soft pads, and texture, never bleeps, arpeggio leads, or square waves.
* **Fast worlds breathe in half-time.** The 140–174 BPM worlds keep their BPM (the sweep grid depends on it) but phrase the backbeat in half-time, so they feel flowing instead of frantic.
* **Written for the game mix.** The engine low-passes music around 8 kHz in calm play and only opens it up under tension, so nothing essential lives above ~7 kHz. Melodies sit in the warm mid register and the 2–5 kHz band is left open, so the quantized SFX chimes stay clear. Bell-like timbres (glockenspiel, celesta, music box, kalimba) are used low, quiet, and rarely.
* **Keys match `skins.ts`.** BPM, root, and mode all match each skin’s `rootMidi` and `scale`, so the SFX chimes land in tune. Five worlds had a key label in v2 that didn't match the skin's actual scale, and are corrected here: world 7 (D harmonic minor), world 19 (E Phrygian dominant), world 26 (D double-harmonic), world 31 (D yo-scale pentatonic), and world 45 (C# miyako-bushi, which v2 listed as C# major even though the skin's scale contains D and A naturals).

## How to run

1. Paste the code block as the prompt. Lyria 3.5 generates vocals by default, which is why every prompt says "Instrumental only" and why the shared negative prompt below exists. If your interface has a negative-prompt field, paste it there.
2. Generate 3–4 takes per world. Keep the one whose first downbeat already has the full groove playing, because Lyria sometimes sneaks in a short intro even when told not to.
3. Trim to a whole number of sweeps. The **loop trim reference** at the bottom gives the sweep length per world, plus the count that fits in a 30-second clip. Because every track now starts on the downbeat, set `firstBeatSec: 0` and recompute `loopEndSec = sweeps × 480 ÷ BPM` in `skins.ts`.
4. If your interface caps prompt length, keep the first three sentences of the body and the full Arrangement and Mix lines.

### Shared negative prompt

```text
vocals, singing, choir, lyrics, spoken word, vocal chops, intro, fade in, fade out, silence at the start, riser, build-up, drop, breakdown, chiptune, 8-bit, bleeps, bloops, blips, square-wave leads, arpeggiator runs, bitcrushed sound, glitch clicks, dubstep wobble, siren, cymbal crash, harsh distortion, piercing highs, loud dynamics, sudden changes, tempo change, rubato
```

### Tuning knobs

* **Too sleepy:** add "bouncy, syncopated, sunlit, bass moving every bar, forward-leaning".
* **Too busy or blippy:** add "fewer notes, space between phrases, one melody at a time, soft felt-mallet and brush attacks".
* **Drifting into song form:** add "one continuous groove, no build, no drop" and put "build-up, drop, breakdown" in the negative prompt.
* **Melody buried:** add "the melody sits clearly in front, played simply and legato".

---

## 1. Alabaster Courtyard — `music/world1.ogg` (`80 BPM · G major`)
*Style: Zouk × Dub × Baroque Lute × Bowed Glass × Rhodes*

```text
Upbeat yet serene instrumental loop: silky Brazilian zouk fused with spacious dub and Baroque lute counterpoint. 80 BPM in G major, strict 4/4 time. Arches opening onto still rosewater pools, poised and quietly delighted. A soft zouk double-pulse kick and brushed rim click carry the sway under airy shaker sixteenths, with a round upright-style sub bass moving in long, lyrical notes. A theorbo and Baroque lute trade a slow, memorable ground-bass melody, each note thrown into tape-echo dub repeats, while warm bowed glass tones hold sustained chords in the mid register and a Rhodes plays sparse spring-reverb stabs. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 2. Vellum & Verdigris — `music/world2.ogg` (`140 BPM · Bb major`)
*Style: Electro-Swing × Javanese Gamelan × Ragtime × Clarinet × Brush Shuffle*

```text
Upbeat yet serene instrumental loop: lazy electro-swing fused with Javanese gamelan and ragtime. 140 BPM in Bb major, strict 4/4 time. A clockmaker's lamplit study, amused and unhurried. A loose brushed swing shuffle with a finger-snap backbeat rides over a walking upright bass. Soft-mallet gamelan metallophones in the low-mid register play interlocking, clock-like kotekan figures as the ticking mechanism, while a warm clarinet carries a wry ragtime melody and a felt-hammer upright piano answers with light stride comping. Tiny pizzicato strings add punctuation. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 3. Aquarelle Choir — `music/world3.ogg` (`90 BPM · E minor`)
*Style: Bachata × Vaporwave Tape Washes × Chamber Cello × Requinto Guitar × Brush Percussion*

```text
Upbeat yet serene instrumental loop: liquid bachata fused with dreamy tape-warped washes and chamber cello. 90 BPM in E minor, strict 4/4 time. Watercolor washes bleeding into one another, tender and forward-leaning. A relaxed bachata groove of soft bongo, guira, and a rounded kick, with gently skipping brushed hats. A requinto-style nylon guitar arpeggiates in long reverberant strokes, a legato solo cello carries a yearning, lyrical melody, and a small cello section layers warm sustained harmonies. Tape-warbled Rhodes chords bloom underneath like wet pigment over a round fretless bass. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 4. Ziggurat Lexicon — `music/world4.ogg` (`85 BPM · Eb minor`)
*Style: Dark Zouk × Microtonal Oud × Krautrock Motorik × Frame Drums × Analog Sequencer*

```text
Upbeat yet serene instrumental loop: dark zouk fused with microtonal oud and soft Krautrock motorik. 85 BPM in Eb minor, strict 4/4 time. Sunbaked scribes deciphering lapis glyphs, calm, curious, and regal. A deep zouk double-thump kick and a steady, soft motorik eighth-note shaker drive forward, with hand-struck frame drum and riq adding dry warmth. A microtonal oud with expressive quarter-tone bends repeats short glyph-like motifs that rewrite themselves every two bars, a round analog modular sequencer pulses quietly in the background, and a bowed double bass holds low drones. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 5. Papercut Atrium — `music/world5.ogg` (`110 BPM · A major`)
*Style: Bossa Nova × Footwork Rhythms × Alto Flute × Vibraphone × Cajon*

```text
Upbeat yet serene instrumental loop: sunlit bossa nova fused with rolling footwork rhythms and breathy flute. 110 BPM in A major, strict 4/4 time. Backlit paper folding itself into cranes, neat, warm, and softly witty. Nylon-string bossa guitar chords lock to a gentle kick-and-rim pattern, while footwork's rolling triplet figures are played as soft cajon and wooden woodblock taps, skittering but never sharp. An upright bass walks in two, an alto flute carries a light, rhythmic melody, and a soft-mallet vibraphone adds warm chord tones with crumpled-paper shakers as the sparkle. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 6. Mediterranean Olive — `music/world6.ogg` (`115 BPM · A major`)
*Style: Kizomba × Pedal-Steel Guitar × Tape-Echo Dub × Bouzouki × Mandolin*

```text
Upbeat yet serene instrumental loop: slow-burning kizomba fused with pedal-steel guitar and tape-echo dub. 115 BPM in A major, strict 4/4 time. Terraced olive groves at fig-colored twilight, easy and sun-drunk. A sensual kizomba double-thump kick and soft rim click carry a gentle dance sway over a springy dub bass in round, long notes. A pedal-steel guitar slides through a lyrical, lyrical melody, answered by mandolin tremolo and fingerpicked bouzouki figures, while warm Rhodes offbeats sit inside tape-echo repeats and a soft marimba doubles the melody low in its register. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 7. Saffron Caravan — `music/world7.ogg` (`174 BPM · D harmonic minor`)
*Style: Salsa Montuno × Half-Time Liquid DnB × Electric Guzheng × Muted Trumpets × Timbales*

```text
Upbeat yet serene instrumental loop: Cuban salsa montuno fused with half-time liquid drum and bass and guzheng. 174 BPM in D harmonic minor, strict 4/4 time. Ochre canyon silk and marigold dust drifting across salt flats, flowing and radiant. At 174 BPM the drums settle into a relaxed half-time feel with the backbeat on beat three, so the energy glides rather than rushes, while congas, cascara timbales, and a dusty brushed break roll at double-time underneath. A deep round sub bass plays a salsa tumbao, a nylon-soft piano plays the montuno, and a guzheng carries a long, gliding melody with sweeping slides, doubled by muted trumpets in warm unison. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 8. Mesa Twilight — `music/world8.ogg` (`92 BPM · Bb minor`)
*Style: Velvet Zouk × Analog Synth Pads × Kalangu Talking Drum × Mellotron Flute × Boogie Bass*

```text
Upbeat yet serene instrumental loop: velvet zouk fused with dusk-toned analog pads and West African talking drum. 92 BPM in Bb minor, strict 4/4 time. Balloons drifting through a crescent-lit dusk, smooth and glowing. A soft zouk kick and clap pattern sits over a gliding fretless bass. A kalangu talking drum bends pitches in call-and-response with a warm Mellotron flute melody, a Juno-style analog pad breathes slow chord changes, and a clean chorused guitar adds sparse volume-swell notes. A tasteful boogie slap-bass fill appears once every four bars. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 9. Gouache Meadow — `music/world9.ogg` (`147 BPM · Bb major`)
*Style: Jazz Swing × Ska Offbeats × Marimba × Clarinet × Ukulele*

```text
Upbeat yet serene instrumental loop: buoyant jazz swing fused with ska offbeats and marimba. 147 BPM in Bb major, strict 4/4 time. Sage hillsides and apricot poppies swaying in a breeze, springy and cheerful. At 147 BPM a light brushed swing ride and snare rim shots keep a lively pulse, with ska upstroke chops on nylon guitar and ukulele giving the sunny offbeats. A warm wooden marimba in the low-mid register and a clarinet trade a playful, hummable melody over a walking upright bass, with soft vibraphone chord tones and a muted trombone for punctuation. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 10. Zero Highway — `music/world10.ogg` (`105 BPM · C major`)
*Style: Noir Slide Guitar × Gentle Cumbia × Hammond Organ × Vibraphone × Tape Echo*

```text
Upbeat yet serene instrumental loop: noir slide guitar fused with gentle cumbia and drawbar Hammond organ. 105 BPM in C major, strict 4/4 time. A midnight theater in fog under sodium lamps, hopeful and softly mysterious. A swaying cumbia groove of guira, tumbadora, and a soft kick rolls patiently. A lap-steel slide guitar with slow tremolo plays a plaintive but warm melody, a drawbar Hammond organ sustains chords like stage haze, and a vibraphone adds soft counter-notes. An upright bass walks long cumbia lines, and tape-echo trails drift behind each phrase. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 11. Silver Clearing — `music/world11.ogg` (`80 BPM · C major`)
*Style: Argentine Tango × Dub Techno × Kalimba × Bandoneon × Bowed Harmonics*

```text
Upbeat yet serene instrumental loop: Argentine tango fused with dub techno and kalimba minimalism. 80 BPM in C major, strict 4/4 time. Silver fog, a single spotlight beam, and a quietly hopeful stillness. A soft tango marcato pulse in four on a muted kick and bowed double bass, with light syncopated shaker sixteenths for lift. A breathing bandoneon plays long, legato phrases while a warm kalimba ostinato in the low-mid register turns like a music box. Dub-techno chord echoes bloom and dissolve into the fog on the upbeats, with slow bowed harmonics shimmering above. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 12. Cloudbank Circuit — `music/world12.ogg` (`126 BPM · Ab minor`)
*Style: Art Deco Nu-Jazz × 2-Step Garage × Electric Sitar × Rhodes × Flugelhorn*

```text
Upbeat yet serene instrumental loop: Art Deco nu-jazz fused with 2-step garage and electric sitar. 126 BPM in Ab minor, strict 4/4 time. Champagne brass and jade stained glass in an after-hours penthouse, suave and unbothered. A 2-step skip of soft rim shots and brushed shuffle hats rides a warm Moog bass and a rounded kick. A velvet Rhodes plays rich extended jazz chords, an electric sitar traces harp-like filigree lines, and a muted flugelhorn carries the melody, with a restrained clavinet adding occasional funk accents. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 13. Crystal Monolith — `music/world13.ogg` (`146 BPM · Ab minor`)
*Style: Half-Time Pastel Trap × Baroque Harpsichord × Soft Footwork Toms × Bowed Vibraphone × Sub Bass*

```text
Upbeat yet serene instrumental loop: half-time pastel trap fused with Baroque harpsichord and soft footwork toms. 146 BPM in Ab minor, strict 4/4 time. A lone drifter crossing a pastel glacier at dawn, prism shards glinting, the whole mood unhurried. At 146 BPM the drums sit in a spacious half-time feel with a soft kick, a rim-click backbeat on beat three, and brushed shaker sixteenths, while footwork-style triplet tom flurries appear as soft felt-mallet rolls once every four bars. A long, round 808-style sub bass slides between notes. A harpsichord in the low-mid register plays a slow, graceful broken-chord melody, supported by bowed vibraphone and low string harmonics. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 14. Sunken Basalt — `music/world14.ogg` (`126 BPM · Eb major`)
*Style: Cumbia × Mbira Cycles × 70s Slap Funk × Gaita Flute × Rhodes*

```text
Upbeat yet serene instrumental loop: rolling cumbia fused with interlocking mbira cycles and 70s funk. 126 BPM in Eb major, strict 4/4 time. Mossy megaliths warming in the afternoon sun, cheerful and grounded. A rolling cumbia guira and caja groove with a soft kick sits under a warm slap-bass line in classic 70s funk style. Two interlocking mbira patterns weave a hypnotic cycle in the mid register, a gaita flute carries a sunny, lyrical melody, and a clean funk guitar adds soft chicken-scratch chops over mellow Rhodes chords. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 15. Midden Horizon — `music/world15.ogg` (`130 BPM · B major`)
*Style: Math-Rock Guitars × Space Dub × Theremin × Motorik Brushes × Surf Reverb*

```text
Upbeat yet serene instrumental loop: interlocking math-rock guitars fused with space dub and desert theremin. 130 BPM in B major, strict 4/4 time. Sun-bleached ink lines under a pastel desert sky, wide-open and windswept. A soft motorik pulse of brushed snare and closed hi-hat sits over a deep, slow dub bass. Two clean, softly picked guitars play intricate interlocking patterns like a quiet geometry puzzle with e-bow swells floating above, a lone theremin plays a gliding melody in a low register, and spring-reverb surf chords strum on every other bar. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 16. Lantern Harbor — `music/world16.ogg` (`127 BPM · C minor`)
*Style: Romantic Bachata × French Musette Accordion × Harmonium × Warm Synth Bass × Clarinet*

```text
Upbeat yet serene instrumental loop: romantic bachata fused with French musette accordion and warm tidal synth bass. 127 BPM in C minor, strict 4/4 time, with a gentle triplet-swung lilt of four beats per bar (never 3/4). A harbor at plum twilight with glowing paper lanterns, bittersweet, warm, and a gentle send-off. A tender bachata guitar arpeggio with soft bongo and guira holds the groove, lightly swung, while a rounded synth bass pulses warmly under a soft kick and brushed snare. A musette accordion carries a wistful, lilting melody, a clarinet answers, and a harmonium holds slow chords like lantern glow. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 17. Kelp Cathedral — `music/world17.ogg` (`90 BPM · F major`)
*Style: Deep Kizomba × Hydro-Dub × Harp × Cello and Horn Sections × Clavinet*

```text
Upbeat yet serene instrumental loop: deep kizomba fused with bubbling hydro-dub and swelling cello and horn sections. 90 BPM in F major, strict 4/4 time. Sunlit aquamarine shafts falling through a kelp cathedral, vast, calm, and flowing. A slow kizomba double-thump kick and a soft frame-drum heartbeat sit under shimmering shaker sixteenths like rising bubbles, with a rubbery hydro-dub bass in round notes. A harp plays flowing arpeggios like fish gliding past, a cello section and French horns swell warm, breathing chords, and a soft clavinet adds electro-funk ripples in long, deep reverb. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 18. Velvet Arcana — `music/world18.ogg` (`97 BPM · Eb minor`)
*Style: Smooth Dembow × Dream-Pop Guitar × Clavinet × Mellotron Strings × Flamenco Palmas*

```text
Upbeat yet serene instrumental loop: smooth tarot dembow fused with dream-pop guitar shimmer and clavinet funk. 97 BPM in Eb minor, strict 4/4 time. Rose-violet tarot cards turning in slow motion, confident and dreamy. A soft dembow kick-and-rim pattern with gentle flamenco palmas keeps a sway over a warm Precision bass playing a post-punk-flavored melodic line. A chorus-washed dream-pop guitar plays slow, shimmering chords, a Mellotron string melody floats above, and a sparse clavinet adds funky punctuation. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 19. Copper Clockwork — `music/world19.ogg` (`160 BPM · E Phrygian dominant (E F G# A B C D)`)
*Style: Klezmer-Tinged Gypsy Swing × West African Balafon × Palm-Muted Baritone Guitar × Clarinet × Accordion*

```text
Upbeat yet serene instrumental loop: klezmer-tinged gypsy swing fused with West African balafon and soft palm-muted baritone guitar. 160 BPM in E Phrygian dominant (E F G# A B C D), strict 4/4 time. A quiet steamworks where a small rusty robot hums while it works, cheerful and a little wistful. At 160 BPM the drums settle into a relaxed half-time swing feel of brushes and a soft ride, so it bounces without rushing. A clean palm-muted baritone guitar plays a syncopated ostinato like pistons softly clanking, a wooden balafon in the low-mid register plays interlocking gear-like patterns, and an upright bass walks. A clarinet carries a sweet melody over warm accordion chords, with a muted trombone adding color. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 20. Spirit Canopy — `music/world20.ogg` (`150 BPM · D minor`)
*Style: Samba × Liquid Drum & Bass Shuffle × Bansuri Flute × Harp × Solo Piano*

```text
Upbeat yet serene instrumental loop: samba-rolling liquid drum and bass fused with bansuri flute and harp. 150 BPM in D minor, strict 4/4 time. Bioluminescent willow mist and blossom light in a forest that glows from within, tender, hopeful, and flowing. At 150 BPM, ganza and pandeiro samba rolls and a soft surdo heartbeat flow over a liquid-DnB-style shuffle in a relaxed half-time feel, with a fretless bass gliding through smooth rolling lines. A bansuri flute carries a soaring but gentle melody, a warm solo piano and a harp answer in cascading arpeggios, and cello swells and soft agogo accents add depth in an open, spacious mix. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 21. Webline Rooftops — `music/world21.ogg` (`146 BPM · G minor`)
*Style: Afrobeat × Bebop Horns × Sparse Grime Bass × Shekere × Rhodes*

```text
Upbeat yet serene instrumental loop: laid-back Afrobeat fused with bebop horn lines and sparse half-time grime bass. 146 BPM in G minor, strict 4/4 time. A rooftop at blue hour above a skyline of ink and web lines, loose and confident. At 146 BPM the Afrobeat groove stays relaxed, with interlocking shekere and congas over a soft kick, a cool chicken-scratch rhythm guitar, and a sparse, slow grime-style sub bass in half-time. A tenor sax and a muted trumpet play tight, bebop-flavored unison lines with warm harmonies, and a Rhodes adds soft chords like a cool night breeze. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 22. Madder & Chalk — `music/world22.ogg` (`82 BPM · A major`)
*Style: Boom-Bap Neo-Soul × Dark Zouk Sub × Bossa Guitar × Tape Loops × Flugelhorn*

```text
Upbeat yet serene instrumental loop: dusty boom-bap neo-soul fused with deep zouk sub and tape-loop warmth. 82 BPM in A major, strict 4/4 time. Raw linen and mulberry stains in a quiet gallery, relaxed, cool, and tactile. A dusty boom-bap kick and snare with soft brushed hats sits over a deep zouk sub, while a looping Rhodes drifts gently in pitch like a worn tape. A muted flugelhorn carries a laid-back melody, a bossa nylon guitar adds soft chords, and an upright bass plays round, unhurried notes in vinyl-soft warmth. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 23. Sashiko Loom — `music/world23.ogg` (`90 BPM · Eb major`)
*Style: Cumbia × Koto and Shamisen Weaving × Shakuhachi × Dub Chord Echoes × Fretless Bass*

```text
Upbeat yet serene instrumental loop: loom-like cumbia fused with koto and shamisen weaving and micro-dub space. 90 BPM in Eb major, strict 4/4 time. Hand-stitched indigo cotton with persimmon thread, patient and precise with quiet warmth. A rolling cumbia groove of soft guira, caja, and kick sits over a fretless bass. Koto and shamisen play interlocking stitch-like patterns, passing one melody between them every two bars, while a shakuhachi adds breathy long notes and dub chord echoes from a mellow Rhodes pop in the gaps. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 24. Verdigris Aqueduct — `music/world24.ogg` (`114 BPM · D major`)
*Style: Flamenco Guitar × 2-Step Garage Skip × Neo-Soul Rhodes × Jazz Guitar × Harp*

```text
Upbeat yet serene instrumental loop: flamenco guitar fused with a 2-step garage skip and neo-soul Rhodes. 114 BPM in D major, strict 4/4 time. Oxidized jade colonnades and sunlit canals, warm, graceful, and breezy. Soft flamenco palmas and cajon play a 2-step garage skip with shuffled brushed hats over a warm round bass. A nylon guitar plays graceful falsetas and rasgueado flicks, a jazz guitar and a Rhodes comp velvet chords, a flute doubles the melody, and light harp arpeggios trickle like water through an aqueduct. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 25. Santorini Pumice — `music/world25.ogg` (`135 BPM · C# minor`)
*Style: Aegean City-Pop × Bachata Guitar × Disco Funk × Bouzouki × Soprano Sax*

```text
Upbeat yet serene instrumental loop: Aegean city-pop fused with bachata guitar and disco funk. 135 BPM in C# minor, strict 4/4 time. Cycladic whitewash, sea-glass coves, and a warm sea breeze, sparkling and sun-soaked. A soft four-on-the-floor kick and gentle disco clap with shuffled hats sit under a glossy city-pop slap bass. A bouzouki and a bachata lead guitar trade bright, lyrical arpeggios while a soprano sax plays a smooth melody, a Rhodes and a softly stabbing Hammond fill the chords, and a warm string section sighs on long notes. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 26. Riso Herbarium — `music/world26.ogg` (`100 BPM · D double-harmonic (D Eb F# G A Bb C#)`)
*Style: Ethio-Jazz × Kora × Krautrock Motorik × Vibraphone × Muted Horns*

```text
Upbeat yet serene instrumental loop: Ethio-jazz fused with kora and Krautrock motorik. 100 BPM in D double-harmonic (D Eb F# G A Bb C#), strict 4/4 time. Overprinted coral and teal plates with layers slightly out of register, eccentric, lyrical, and head-nodding. A soft motorik pulse of brushed snare and hi-hat sits over a rounded, deep bass. A vibraphone and muted horns play a haunting Ethio-jazz melody, while a kora ripples hypnotic patterns, each layer entering a hair offset from the next like misregistered ink, with a Rhodes and soft organ filling the harmony. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 27. Encaustic Canyon — `music/world27.ogg` (`108 BPM · E minor`)
*Style: Dub Techno × Argentine Tango Violin × Hang Drum × Afrobeat Shakers × Warm Bass*

```text
Upbeat yet serene instrumental loop: dub techno fused with Argentine tango violin and hang drum. 108 BPM in E minor, strict 4/4 time. Beeswax-gold mesas melting into mulberry canyon twilight, honeyed, warm, and slow-burning. A soft dub-techno kick and echoing chord stabs made from bowed violin harmonics sit over a gentle Afrobeat shaker. A violin plays sweeping tango phrases with pizzicato accents, a hang drum in the mid register carries a rolling melody, and a warm, round bass line moves underneath. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 28. Celadon Vault — `music/world28.ogg` (`82 BPM · D minor`)
*Style: Tango Nuevo String Quartet × Zouk Sub × Porcelain Percussion × Harpsichord × Bandoneon*

```text
Upbeat yet serene instrumental loop: tango nuevo string quartet fused with zouk sub and porcelain percussion. 82 BPM in D minor, strict 4/4 time. Jade-glazed vaults and rosewood tea mist, aristocratic and serene with cool poise. A soft but weighty zouk heartbeat kick sits under delicate struck-porcelain-bowl percussion and soft ceramic taps, and a harpsichord plays sparse ornamented figures. A string quartet plays tango nuevo in Piazzolla style with Baroque trills, a bandoneon sustains warm chords, and a bowed bass holds the low end. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 29. Ochre Pier — `music/world29.ogg` (`105 BPM · Bb major`)
*Style: UK Garage Skip × Bossa Nova × Brass Band × Pizzicato Strings × Rhodes*

```text
Upbeat yet serene instrumental loop: garage-skip bossa fused with warm brass-band swells and pizzicato strings. 105 BPM in Bb major, strict 4/4 time. Amber harbor towers and peacock canals along a bright boardwalk, confident, buoyant, and relaxed. Shuffling UK-garage skip hats on brushed snare and a soft kick lock with a sunny bossa bass line. A street brass band of flugelhorn, trombone, and tuba plays warm swelling lines, pizzicato strings answer in neo-classical figures, and a bright Rhodes adds chords. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 30. Glacier Lichen — `music/world30.ogg` (`120 BPM · F# major`)
*Style: Glacial Post-Rock × Zouk × Indie Dance × Modular Plucks × String Ensemble*

```text
Upbeat yet serene instrumental loop: glacial post-rock fused with zouk and rounded modular plucks. 120 BPM in F# major, strict 4/4 time. Soapstone peaks and glacial fjord water under alpine rose-quartz light, a slow sunrise on ice, clear, hopeful, and open. A chiming, clean post-rock guitar ostinato with long delay rides a soft indie-dance kick and snare with a zouk double-thump, a steady motorik shaker, and a round bass. Rounded Buchla modular plucks answer in the gaps, and a string ensemble swells slow sustained chords like light spreading. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 31. Sumi-e Brush — `music/world31.ogg` (`102 BPM · D yo-scale pentatonic (D E G A B)`)
*Style: Shakuhachi × Shamisen × Brushed Breakbeat × Kizomba Sub × Dub*

```text
Upbeat yet serene instrumental loop: shakuhachi and shamisen fused with brushed breakbeat, kizomba sub, and dub. 102 BPM in D yo-scale pentatonic (D E G A B), strict 4/4 time. Sumi ink mountain strokes and bamboo mist beside a cinnabar seal, graceful, calm, and precise. A soft brushed breakbeat with kizomba sub syncopation and dub-space rim shots sits under a breathy shakuhachi carrying a spacious melody in the yo scale (D E G A B, no semitones). Shamisen strokes punctuate like brush marks, a koto adds flowing arpeggios, and a round upright bass anchors the groove. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 32. Braque Studio — `music/world32.ogg` (`126 BPM · E major`)
*Style: Ragtime × Salsa Montuno × Electro-Swing × Clarinet × Bongos*

```text
Upbeat yet serene instrumental loop: ragtime piano fused with salsa montuno and an electro-swing pulse. 126 BPM in E major, strict 4/4 time. Fractured ultramarine planes and guitar silhouettes in a cubist portrait, witty and warm. A soft electro-swing kick and brushed snare with bongo and timbale accents carry the pulse. An upright piano plays a salsa montuno in ragtime stride, a clarinet plays a sly melody and then repeats it a beat later from a displaced angle like another view of the same object, and an upright bass plays a tumbao. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 33. Delta Visor — `music/world33.ogg` (`118 BPM · B minor`)
*Style: Detroit Electro × Bachata Guitar × P-Funk Moog Bass × Juno Strings × Vibraphone*

```text
Upbeat yet serene instrumental loop: Detroit electro fused with bachata guitar and P-funk Moog bass. 118 BPM in B minor, strict 4/4 time. A chrome visor scanning a rainy neon street, cool, sleek, and unhurried. A soft 808 clap and kick with a smooth hat pattern sits over a round Moog bass bouncing in P-funk style. A warm Juno string pad breathes slow chords, a clean bachata guitar plays syncopated arpeggios, a vibraphone and an electric piano carry the melody, and a slow Italo-disco arpeggio of warm sine tones sits low in the mix. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 34. Flamingo Lagoon — `music/world34.ogg` (`97 BPM · Eb major`)
*Style: 80s Roller Boogie × Zouk × Smooth Sax × Synth-Funk × City-Pop Chords*

```text
Upbeat yet serene instrumental loop: 80s roller-boogie fused with zouk and smooth saxophone. 97 BPM in Eb major, strict 4/4 time. Twilight stucco-pink and lagoon teal at a pool party at dusk, glowing, relaxed, and flirty. A soft roller-boogie hat pattern and a deep zouk kick sit under a juicy but round synth-funk slap bass. A soprano saxophone plays a smooth, lyrical melody, a mellow electric piano and a lush city-pop chord pad comp softly, and a muted guitar adds funk chops. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 35. Altiplano Loom — `music/world35.ogg` (`120 BPM · G minor`)
*Style: Andean Cumbia × Chicha Surf Guitar × Soft Techno Pulse × Pan Flute × Charango*

```text
Upbeat yet serene instrumental loop: Andean cumbia fused with chicha surf guitar and a rounded techno pulse. 120 BPM in G minor, strict 4/4 time. Cochineal-dyed wool terraces and salt-flat amethyst at sunrise, open, bright, and processional. A soft four-on-the-floor kick under bombo legüero and cumbia shakers sits over a rubbery, filtered bass line with round edges. A quena and a pan flute carry a sweeping melody, a charango strums in rhythm, and a clean chicha guitar with vibrato adds twangy hooks. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 36. Neko Sketchbook — `music/world36.ogg` (`164 BPM · F# major`)
*Style: Shibuya-kei Bossa Swing × Pizzicato Strings × Flute and Clarinet × Vibraphone × Upright Bass*

```text
Upbeat yet serene instrumental loop: Shibuya-kei bossa swing fused with playful pizzicato jazz. 164 BPM in F# major, strict 4/4 time. A paper cat blinking on a windowsill with swishing ink tails, light-footed and playful. At 164 BPM the brushed swing drums relax into a half-time bounce under a walking upright bass. A Rhodes plays Shibuya-kei bossa chords, pizzicato strings tiptoe like paw prints, a flute and a clarinet trade a cheeky, hummable melody, and a soft vibraphone and a muted trumpet add warm color and punctuation. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 37. Chartres Garnet — `music/world37.ogg` (`122 BPM · A minor`)
*Style: Cathedral Organ Counterpoint × Brushed Breakbeat × Tango Violin × Solo Cello × Warm Drone*

```text
Upbeat yet serene instrumental loop: cathedral organ counterpoint fused with brushed breakbeat and tango violin. 122 BPM in A minor, strict 4/4 time. Pomegranate and peacock light streaming through stained glass, luminous, stately, and moving. A soft brushed breakbeat sits over a round, slow bass. A flue-stop pipe organ at gentle volume plays Bach-style counterpoint with a solo cello in canon, a tango violin adds expressive slides, and a warm synth drone rests underneath. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 38. Terracotta Press — `music/world38.ogg` (`120 BPM · G minor`)
*Style: Krautrock Motorik March × Electro-Swing Brass × Dub × Post-Punk Bass × Clarinet*

```text
Upbeat yet serene instrumental loop: motorik march fused with electro-swing brass and dub. 120 BPM in G minor, strict 4/4 time. A 1924 lithograph studio with presses rolling in rhythm, bold and cheerful. A steady motorik drum pulse of soft kick and brushed snare, with muted typewriter-key patterns tapped softly in the background, sits over a gritty but round post-punk bass line. A tuba and a trombone play a friendly march-like swing, a clarinet adds a sly counter-melody, and dub-style spring-reverb chord hits answer. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 39. Kew Herbarium — `music/world39.ogg` (`135 BPM · Ab minor`)
*Style: Brushed Breakbeat × Bachata Bongos × Harpsichord × Clarinet × Pizzicato Strings*

```text
Upbeat yet serene instrumental loop: brushed breakbeat fused with bachata bongos and harpsichord. 135 BPM in Ab minor, strict 4/4 time, with a gentle triplet-swung lilt of four beats per bar (never 3/4). Pressed ferns, plum blossoms, and rain on a glass conservatory, delicate, curious, and bright. A brisk brushed breakbeat and soft bachata bongos carry a gentle compound triplet bounce over a hopping polka-style bass. A harpsichord and a clarinet play a quick, charming melody, a pizzicato string section adds sparkle, and an occasional soft celesta doubling brightens the phrase ends. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 40. Harlequin Carnival — `music/world40.ogg` (`110 BPM · Bb major`)
*Style: Elegant Circus Swing × Ska Offbeats × Tuba × Clarinet and Muted Trumpet × Soft Pipe Organ*

```text
Upbeat yet serene instrumental loop: elegant circus swing fused with ska offbeats and playful pop. 110 BPM in Bb major, strict 4/4 time. A clown prince in plum velvet at a gilded wild-card carnival, mischievous but charming. A bouncy swing-ska drum groove of soft kick and brushed snare carries ska guitar offbeats. A tuba oom-pahs, a clarinet and a muted trumpet play a theatrical hummable melody, a soft pipe-organ calliope adds sparse harmonies, and a mellow analog bass adds sweet bounce. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 41. Birch & Fjord Atelier — `music/world41.ogg` (`134 BPM · Bb minor`)
*Style: Nordic Folk × UK Garage Skip × Zouk Sub × Nyckelharpa × Kantele*

```text
Upbeat yet serene instrumental loop: Nordic folk fused with a UK garage skip and warm zouk sub. 134 BPM in Bb minor, strict 4/4 time. Baltic birch veneer and pressed lingonberry in a bright workshop, airy, cheerful, and neat. A soft 2-step skip of rim shots and brushed hats sits over a warm zouk sub. A nyckelharpa plays a bright folk melody with its sympathetic strings ringing, an accordion and a kantele add playful hops and shimmer, and a mellow Moog bass keeps it warm. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 42. Grand Alpine Lobby — `music/world42.ogg` (`105 BPM · F major`)
*Style: Colombian Cumbia × Baroque Pizzicato Strings × Zither and Cimbalom × Balkan Brass × Moog Bass*

```text
Upbeat yet serene instrumental loop: Colombian cumbia fused with Baroque strings, zither, and Balkan brass. 105 BPM in F major, strict 4/4 time. A symmetrical pastel hotel lobby with a very serious concierge, precise, droll, and polished. A soft cumbia guira and tumbadora groove sits under a bouncing vintage Moog bass. Pizzicato Baroque strings play a witty counter-line, a zither and a cimbalom play a sparkling hook, and Balkan brass of clarinet, trumpet, and tuba answer in polite, playful stabs. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 43. Tidepool & Reed — `music/world43.ogg` (`130 BPM · E major`)
*Style: Railroad Swing × Bossa Nova × Harmonica and Clarinet × Studio Strings × Surf Guitar*

```text
Upbeat yet serene instrumental loop: railroad swing fused with bossa nova and warm studio-orchestral strings. 130 BPM in E major, strict 4/4 time. A seaside tram clattering through estuary reeds in salt-spray light, open-hearted and adventurous. A brushed train-beat shuffle on snare and soft kick keeps it rolling, with an upright bass and airy bossa guitar chords. A harmonica and a clarinet carry a hopeful, memorable melody, a string section swells gently on downbeats, a twangy surf guitar adds a few licks, and a soft piano ripples throughout. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 44. Earth Study No. 4 — `music/world44.ogg` (`90 BPM · F major`)
*Style: Minimalist Marimba × Kizomba × Afrobeat Guitar × Buchla Plucks × Dub*

```text
Upbeat yet serene instrumental loop: minimalist marimba fused with kizomba, Afrobeat guitar, and soft Buchla plucks. 90 BPM in F major, strict 4/4 time. Ashlar travertine, raw Sienna, and slate in a grid of balanced rectangles, calm, exact, and joyful. A soft kizomba kick with shaker sixteenths and a dry dub snare carry the groove. Two or three marimbas in the low-mid register play interlocking Reich-style cells that slowly phase, a muted Afrobeat rhythm guitar adds chicken-scratch, and soft rounded Buchla plucks double the cells in a clean, sculpted mix. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 45. Edo Woodblock — `music/world45.ogg` (`129 BPM · C# miyako-bushi (C# D F# G# A)`)
*Style: Soft-Mallet Taiko × 2-Step Garage × Koto-Funk × Shakuhachi × Rhodes*

```text
Upbeat yet serene instrumental loop: soft-mallet taiko fused with 2-step garage, koto funk, and shakuhachi. 129 BPM in C# miyako-bushi (C# D F# G# A), strict 4/4 time. A great wave of Prussian indigo curling over malachite foam, calm, stately, and swelling. A heartbeat odaiko played with felt mallets, softly, and a 2-step garage skip of rim shots and soft hats carry the pulse. A koto is plucked and slapped like a funk bass in the miyako-bushi scale (C# D F# G# A), a shakuhachi carries a long melody, and a mellow Rhodes and warm synth chords add depth. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 46. Canyon Slide 74 — `music/world46.ogg` (`114 BPM · F major`)
*Style: 70s Clavinet Funk × Cumbia × Acid-Jazz Rhodes × Wah Guitar × Pedal Steel*

```text
Upbeat yet serene instrumental loop: 70s clavinet funk fused with cumbia and acid-jazz Rhodes. 114 BPM in F major, strict 4/4 time. A Kodachrome sunset over mesa Sienna and sagebrush from a 1974 muscle car, sun-warmed and loose. A soft funk drum groove with cumbia tambourines and guira sits over a rolling bass. A wah guitar plays gentle chicken-scratch, a clavinet and a Rhodes trade hooks, a pedal steel adds warm slides, and tape saturation gives a subtle film warmth. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 47. Weimar Plaster Mobile — `music/world47.ogg` (`90 BPM · F major`)
*Style: Krautrock Motorik × Cool-Jazz Vibraphone × Zouk Sub × Electro-Funk Bass × Clarinet*

```text
Upbeat yet serene instrumental loop: soft Krautrock motorik fused with cool-jazz vibraphone and zouk sub. 90 BPM in F major, strict 4/4 time. Kiln-terracotta and patinated teal shapes hanging in balance like a mobile, poised and drifting. A soft motorik beat of kick and brushed hi-hat with a zouk double-thump sits over a bowed double bass and a bouncy electro-funk bass. A vibraphone plays cool-jazz chords and a slow, pendulum-swinging melody, with brushed ticks and a clarinet adding gentle harmonies. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 48. Geodesic Solarium — `music/world48.ogg` (`127 BPM · E major`)
*Style: Brazilian Samba × Kuduro Drive × Funky House Bass × Steel Pan × Cavaquinho*

```text
Upbeat yet serene instrumental loop: Brazilian samba fused with soft kuduro drive and funky-house bass. 127 BPM in E major, strict 4/4 time. Misted glass domes, jade moss terraces, and orchid blooms in a sunlit solarpunk greenhouse, joyful, vivid, and breathing. A soft kuduro kick with pandeiro, surdo, and tamborim samba percussion sits over a round funky-house bass. A cavaquinho strums, a steel pan plays a sunny mid-register melody, a harp and a flute add leafy ripples, and a warm electric piano comps. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 49. Walnut Kissa — `music/world49.ogg` (`107 BPM · Eb major`)
*Style: Tokyo Hi-Fi Jazz × Dub Echo × Bachata Guitar × Boom-Bap × Nu-Disco Rhodes*

```text
Upbeat yet serene instrumental loop: Tokyo hi-fi jazz fused with dub echo, bachata guitar, and boom-bap. 107 BPM in Eb major, strict 4/4 time. A smoked-cedar listening lounge with vacuum-tube glow, smirking, relaxed, and cool. A dry boom-bap snare and brushed jazz ride sit over an upright bass with dub-style tape-echo pops. A warm tenor sax plays a smoky hook, a bachata guitar chops syncopated chords, a Rhodes adds nu-disco stabs, and a muted vibraphone fills the gaps. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

## 50. Lunar Ceramic 1968 — `music/world50.ogg` (`92 BPM · Bb minor`)
*Style: Space-Age Lounge Bossa × Zouk × Theremin × French Horn × Vibraphone*

```text
Upbeat yet serene instrumental loop: space-age lounge bossa fused with deep zouk and theremin. 92 BPM in Bb minor, strict 4/4 time. A mid-century observatory with moonstone vaults, capsule-persimmon light, and a nebula overhead, triumphant but serene. A funky brushed breakbeat with a deep zouk kick carries the pulse under a nylon bossa guitar and a Hammond lounge organ. A theremin plays a soaring but gentle lead in the low-mid register, a vibraphone adds starlight, a French horn section swells heroically but softly, and a synthwave bass pulses warmly. Arrangement: already in full motion on the very first downbeat, with no intro, fade-in, riser, or silence. One continuous groove with no verse, chorus, drop, or breakdown; instruments trade two-bar phrases, and the last bar turns straight back into beat 1 with no outro, final chord, or fade-out. Rock-steady tempo with no rubato or tempo changes. Mix: warm, soft-edged, gently dynamic, mid-register melodies, silky sparse highs, 2–5 kHz left open for game sound effects. Instrumental only, no vocals, choir, or vocal chops.
```

---

## Loop trim reference

Sweep = 8 beats = `480 ÷ BPM` seconds. “Sweeps in 30 s” is the whole number of sweeps that fits a 30-second clip; for a longer generation, pick any whole sweep count and set `loopEndSec` to `sweeps × sweep length` with `firstBeatSec: 0`.

| # | World | BPM | Sweep (s) | Sweeps in 30 s | `loopEndSec` |
|---:|---|---:|---:|---:|---:|
| 1 | Alabaster Courtyard | 80 | 6.000 | 5 | 30.000 |
| 2 | Vellum & Verdigris | 140 | 3.429 | 8 | 27.429 |
| 3 | Aquarelle Choir | 90 | 5.333 | 5 | 26.667 |
| 4 | Ziggurat Lexicon | 85 | 5.647 | 5 | 28.235 |
| 5 | Papercut Atrium | 110 | 4.364 | 6 | 26.182 |
| 6 | Mediterranean Olive | 115 | 4.174 | 7 | 29.217 |
| 7 | Saffron Caravan | 174 | 2.759 | 10 | 27.586 |
| 8 | Mesa Twilight | 92 | 5.217 | 5 | 26.087 |
| 9 | Gouache Meadow | 147 | 3.265 | 9 | 29.388 |
| 10 | Zero Highway | 105 | 4.571 | 6 | 27.429 |
| 11 | Silver Clearing | 80 | 6.000 | 5 | 30.000 |
| 12 | Cloudbank Circuit | 126 | 3.810 | 7 | 26.667 |
| 13 | Crystal Monolith | 146 | 3.288 | 9 | 29.589 |
| 14 | Sunken Basalt | 126 | 3.810 | 7 | 26.667 |
| 15 | Midden Horizon | 130 | 3.692 | 8 | 29.538 |
| 16 | Lantern Harbor | 127 | 3.780 | 7 | 26.457 |
| 17 | Kelp Cathedral | 90 | 5.333 | 5 | 26.667 |
| 18 | Velvet Arcana | 97 | 4.948 | 6 | 29.691 |
| 19 | Copper Clockwork | 160 | 3.000 | 10 | 30.000 |
| 20 | Spirit Canopy | 150 | 3.200 | 9 | 28.800 |
| 21 | Webline Rooftops | 146 | 3.288 | 9 | 29.589 |
| 22 | Madder & Chalk | 82 | 5.854 | 5 | 29.268 |
| 23 | Sashiko Loom | 90 | 5.333 | 5 | 26.667 |
| 24 | Verdigris Aqueduct | 114 | 4.211 | 7 | 29.474 |
| 25 | Santorini Pumice | 135 | 3.556 | 8 | 28.444 |
| 26 | Riso Herbarium | 100 | 4.800 | 6 | 28.800 |
| 27 | Encaustic Canyon | 108 | 4.444 | 6 | 26.667 |
| 28 | Celadon Vault | 82 | 5.854 | 5 | 29.268 |
| 29 | Ochre Pier | 105 | 4.571 | 6 | 27.429 |
| 30 | Glacier Lichen | 120 | 4.000 | 7 | 28.000 |
| 31 | Sumi-e Brush | 102 | 4.706 | 6 | 28.235 |
| 32 | Braque Studio | 126 | 3.810 | 7 | 26.667 |
| 33 | Delta Visor | 118 | 4.068 | 7 | 28.475 |
| 34 | Flamingo Lagoon | 97 | 4.948 | 6 | 29.691 |
| 35 | Altiplano Loom | 120 | 4.000 | 7 | 28.000 |
| 36 | Neko Sketchbook | 164 | 2.927 | 10 | 29.268 |
| 37 | Chartres Garnet | 122 | 3.934 | 7 | 27.541 |
| 38 | Terracotta Press | 120 | 4.000 | 7 | 28.000 |
| 39 | Kew Herbarium | 135 | 3.556 | 8 | 28.444 |
| 40 | Harlequin Carnival | 110 | 4.364 | 6 | 26.182 |
| 41 | Birch & Fjord Atelier | 134 | 3.582 | 8 | 28.657 |
| 42 | Grand Alpine Lobby | 105 | 4.571 | 6 | 27.429 |
| 43 | Tidepool & Reed | 130 | 3.692 | 8 | 29.538 |
| 44 | Earth Study No. 4 | 90 | 5.333 | 5 | 26.667 |
| 45 | Edo Woodblock | 129 | 3.721 | 8 | 29.767 |
| 46 | Canyon Slide 74 | 114 | 4.211 | 7 | 29.474 |
| 47 | Weimar Plaster Mobile | 90 | 5.333 | 5 | 26.667 |
| 48 | Geodesic Solarium | 127 | 3.780 | 7 | 26.457 |
| 49 | Walnut Kissa | 107 | 4.486 | 6 | 26.916 |
| 50 | Lunar Ceramic 1968 | 92 | 5.217 | 5 | 26.087 |