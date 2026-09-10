# Relative Musical Notation

Proof of concept for a notation where **pitch is relative and chromatic** while **rhythm keeps conventional music symbols**.

The renderer takes a MusicXML file and produces an SVG score with these rules:

- no horizontal staff lines;
- one vertical step represents one semitone;
- each rendered melodic line starts from an absolute pitch anchor (`C4`, `F#4`, ...) shown locally below its note;
- successive musical events in a voice are connected by segments with a small visual gap around the note/rest glyphs;
- the slope of a segment gives interval direction;
- a 1-semitone interval is marked by one small perpendicular tick;
- a 2-semitone interval is marked by two small perpendicular ticks;
- intervals of 3 semitones and above use an unsigned numeric magnitude (`3`, `4`, `5`, `6`, ...);
- simultaneous chord pitches are joined by separated vertical spine segments that do not touch the noteheads;
- rests stay at the vertical level of the last sounded note, and the next interval is still measured from that last pitch;
- noteheads, stems, dots, flags, beams and rests keep their conventional rhythmic role;
- barlines remain vertical measure separators;
- transposition changes absolute anchors but leaves the melodic geometry unchanged.

## Engraving engine

The first POC drew rhythmic notation directly in custom SVG. The current implementation instead uses **VexFlow 5** for rhythmic engraving and horizontal rhythmic spacing.

Relative Musical Notation only overrides the part that is intentionally different: **pitch geometry**. Each VexFlow note is placed on a hidden virtual stave whose vertical unit is remapped so that one semitone always has the same height. The virtual stave itself and ledger lines are never drawn.

This keeps the experiment focused on the new notation instead of reimplementing a mature engraving engine's noteheads, stems, beams, dots and rests.

OpenSheetMusicDisplay was considered as well, but it sits one level higher and is primarily a MusicXML-to-standard-score renderer built on VexFlow. Using VexFlow directly gives the POC access to individual note positions while preserving the engraving primitives we want to keep.

VexFlow is loaded from jsDelivr by `index.html`; no local build step is required for the POC.

## Run the prototype

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` and either load a MusicXML file or click **Load sample**.

An internet connection is currently required when opening the page because VexFlow is loaded from the CDN.

## Current controls

- MusicXML file picker;
- measures per rendered line;
- semitone vertical spacing;
- chromatic transposition in semitones;
- SVG download.

The transposition control is a design test: because every line is relative to its first note, transposing the entire score should keep the exact same contour and only change the absolute starting-note labels.

## MusicXML coverage in this POC

Supported well enough for experiments:

- `score-partwise` MusicXML;
- parts, measures, staves and voices;
- pitched notes and rests;
- accidentals through `<alter>`;
- durations, note types and augmentation dots;
- `backup` / `forward` timing;
- chords through `<chord/>`;
- first-level MusicXML beam grouping;
- changing divisions and time signatures.

Not yet handled completely:

- tuplets and grace-note spacing;
- ties, slurs and articulations;
- dynamics, lyrics and ornaments;
- repeats / volta logic;
- percussion and unpitched notes;
- enharmonic spelling after transposition;
- automatic musical phrase detection;
- sophisticated multi-voice collision avoidance.

For now a **rendered system is also a re-anchoring point**. A later version can re-anchor from explicit phrase/section markers instead of, or in addition to, line breaks.

## Files

- `src/musicxml.js`: small MusicXML parser into an internal score model;
- `src/render.js`: adapter between the internal model, VexFlow rhythmic engraving and relative chromatic pitch placement;
- `src/app.js`: browser UI;
- `samples/example.musicxml`: two-voice sample used by the demo;
- `docs/NOTATION.md`: current notation rules and open design questions.

## Status

This is intentionally a visual and technical POC, not a complete MusicXML engraving engine. Its purpose is to determine whether relative chromatic contours remain readable on real music before formalising the notation further.
