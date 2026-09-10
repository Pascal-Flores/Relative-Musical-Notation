# Relative Musical Notation

Proof of concept for a notation where **pitch is relative and chromatic** while **rhythm keeps conventional music symbols**.

The renderer takes a MusicXML file and produces an SVG score with these rules:

- no horizontal staff lines;
- one vertical step represents one semitone;
- each rendered melodic line starts from an absolute pitch anchor (`C4`, `F#4`, ...);
- successive notes in a voice are connected by segments;
- interval labels (`+2`, `-1`, ...) can be shown on those segments;
- noteheads, stems, dots, flags and beams retain the usual rhythmic role;
- barlines remain vertical measure separators;
- transposition changes absolute anchors but leaves the melodic geometry unchanged.

## Run the prototype

There is no build step and no dependency.

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` and either load a MusicXML file or click **Load sample**.

## Current controls

- MusicXML file picker;
- measures per rendered line;
- semitone vertical spacing;
- interval-label toggle;
- chromatic transposition in semitones;
- SVG download.

The transposition control is deliberately included as a design test: because every line is relative to its first note, transposing the entire score should keep the exact same contour and only change the absolute starting-note labels.

## MusicXML coverage in this POC

Supported well enough for experiments:

- `score-partwise` MusicXML;
- parts, measures, staves and voices;
- pitched notes and rests;
- accidentals through `<alter>`;
- durations, note types and augmentation dots;
- `backup` / `forward` timing;
- chords through `<chord/>`;
- first-level and additional MusicXML beams;
- changing divisions and time signatures.

Not yet handled completely:

- tuplets and grace-note spacing;
- ties, slurs and articulations;
- dynamics, lyrics and ornaments;
- repeats / volta logic;
- percussion and unpitched notes;
- enharmonic spelling after transposition;
- automatic musical phrase detection.

For now a **rendered system is also a re-anchoring point**. A later version can re-anchor from explicit phrase/section markers instead of, or in addition to, line breaks.

## Files

- `src/musicxml.js`: small MusicXML parser into an internal score model;
- `src/render.js`: relative-notation SVG renderer;
- `src/app.js`: browser UI;
- `samples/example.musicxml`: two-voice sample used by the demo;
- `docs/NOTATION.md`: current notation rules and open design questions.

## Status

This is intentionally a visual and technical POC, not a complete engraving engine. Its purpose is to determine whether relative chromatic contours remain readable on real MusicXML before formalising the notation further.
