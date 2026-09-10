# Relative Musical Notation

Proof of concept for a notation where **pitch is relative and chromatic** while **rhythm keeps conventional music symbols**.

The renderer takes a MusicXML file and produces an SVG score with these rules:

- no horizontal staff lines;
- one vertical step represents one semitone;
- each independent voice starts from a local absolute pitch anchor (`C4`, `F#4`, ...) shown below its note;
- successive musical events in a voice are connected by segments with a small visual gap around the glyphs;
- a 1-semitone interval uses one connecting line;
- a 2-semitone interval uses two parallel connecting lines;
- intervals of 3 semitones and above use one connecting line plus an unsigned numeric magnitude (`3`, `4`, `5`, `6`, ...);
- simultaneous chord pitches are joined by separated vertical spine segments;
- rests stay at the vertical level of the last sounded note, and the next interval is still measured from that last pitch;
- MusicXML clef assignments are preserved as **display lanes**: voices on the same clef are rendered together, while treble/bass remain separate;
- noteheads, stems, dots, flags, beams and rests keep their conventional rhythmic role;
- barlines remain vertical measure separators;
- transposition changes absolute anchors but leaves the melodic geometry unchanged.

## Engraving engine

The current implementation uses **VexFlow 5** for rhythmic engraving, horizontal rhythmic spacing and multi-voice formatting. Relative Musical Notation overrides only the pitch geometry.

Each VexFlow note is placed on a hidden virtual stave whose vertical unit is remapped so that one semitone always has the same height. The virtual stave itself and ledger lines are never drawn.

## Clef / voice grouping

The parser retains `<clef number="…">` information from MusicXML and attaches the active clef to each musical event.

For each rendered system, tracks sharing the same clef are combined into one visible lane and formatted together by VexFlow. Equal pitches across those voices therefore align vertically. Different clefs remain separate lanes.

The bundled piano sample contains one treble-clef voice and one bass-clef voice, so it renders as two lanes. A regression test changes the second staff to treble clef and verifies that both voices then render together in one lane.

Each merged voice keeps its own melodic connector chain, rests and local starting-pitch anchor. If MusicXML does not specify stem directions, simultaneous voices alternate up/down stems to make them easier to separate visually.

Clef changes occurring inside a rendered system are not yet split automatically; grouping currently uses the clef active at the start of that system.

## Run the prototype

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` and either load a MusicXML file or click **Load sample**.

An internet connection is currently required when opening the page because VexFlow is loaded from jsDelivr.

## Current controls

- MusicXML file picker;
- measures per rendered line;
- semitone vertical spacing;
- chromatic transposition in semitones;
- SVG download.

## MusicXML coverage in this POC

Supported well enough for experiments:

- `score-partwise` MusicXML;
- parts, measures, staves, voices and clef assignments;
- pitched notes and rests;
- accidentals through `<alter>`;
- durations, note types and augmentation dots;
- `backup` / `forward` timing;
- chords through `<chord/>`;
- first-level MusicXML beam grouping;
- changing divisions and time signatures.

Not yet handled completely:

- clef changes inside one rendered system;
- tuplets and grace-note spacing;
- ties, slurs and articulations;
- dynamics, lyrics and ornaments;
- repeats / volta logic;
- percussion and unpitched notes;
- enharmonic spelling after transposition;
- automatic musical phrase detection;
- sophisticated multi-voice collision avoidance.

## Files

- `src/musicxml.js`: MusicXML parser into the internal score model, including clef assignments;
- `src/render.js`: VexFlow adapter and relative chromatic renderer;
- `src/app.js`: browser UI;
- `samples/example.musicxml`: two-clef piano sample;
- `docs/NOTATION.md`: current notation rules and open design questions.
