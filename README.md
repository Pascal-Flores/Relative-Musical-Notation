# Relative Musical Notation

Proof of concept for a notation where **pitch is relative and chromatic** while **rhythm keeps conventional music symbols**.

The renderer takes a MusicXML file (`.musicxml`, `.xml` or compressed `.mxl`) and produces an SVG score with these rules:

- no horizontal staff lines;
- one vertical step represents one semitone;
- absolute pitch labels (`C4`, `F#4`, ...) are used at melodic phrase starts rather than repeated mechanically at every rendered line;
- when a phrase starts on a chord, the absolute anchor is attached to the same representative tone used by the melodic contour (currently the highest chord tone);
- when a melodic phrase continues across a line break, the contour continues with incoming/outgoing strokes that already point toward the adjacent pitch instead of ending horizontally;
- an absolute pitch label is placed on the side opposite the stem: below an up-stem note, above a down-stem note;
- successive musical events in a voice are connected by segments with a small visual gap around the glyphs;
- a 1-semitone interval uses one connecting line;
- a 2-semitone interval uses two parallel connecting lines, including at system continuations;
- intervals of 3 semitones and above use one connecting line plus an unsigned numeric magnitude (`3`, `4`, `5`, `6`, ...);
- inside chords, adjacent chord tones are joined by as many thin parallel vertical lines as there are semitones between them (for example C–E = 4 lines, E–G = 3 lines);
- chord-interval lines use fixed horizontal spacing; five lines span almost the full notehead width, while smaller counts remain centered with the same spacing;
- rests stay at the vertical level of the last sounded note, and the next interval is still measured from that last pitch;
- MusicXML clef assignments are preserved as display lanes: voices on the same clef are rendered together, while treble/bass remain separate lanes;
- lanes covering the same measure range are packed into one **simultaneous system group** so, for example, the two piano hands remain visibly associated;
- measure separators span the complete simultaneous group and horizontal rules separate consecutive system groups;
- per-lane `treble · voice …` labels are intentionally omitted to avoid wasting vertical space;
- noteheads, stems, dots, flags, beams and rests keep their conventional rhythmic role;
- transposition changes absolute anchors but leaves the melodic geometry unchanged.

## Engraving engine

The current implementation uses **VexFlow 5** for rhythmic engraving, horizontal rhythmic spacing and multi-voice formatting. Relative Musical Notation overrides only the pitch geometry.

Each VexFlow note is placed on a hidden virtual stave whose vertical unit is remapped so that one semitone always has the same height. The virtual stave itself and ledger lines are never drawn.

Compressed MusicXML (`.mxl`) is unpacked in the browser with **JSZip 3.10.1**. The loader reads `META-INF/container.xml`, follows its `rootfile` entry and feeds the extracted score to the same MusicXML parser. If an archive has no container file, the loader falls back to the first `.musicxml` or `.xml` score file it contains.

## Systems, clefs and voices

The parser retains `<clef number="…">` information from MusicXML and attaches the active clef to each musical event.

For each rendered measure range, tracks sharing the same clef are combined into one lane and formatted together by VexFlow. Equal pitches across those voices therefore align vertically. Different clefs remain separate lanes, but all lanes belonging to that same measure range are laid out as one compact simultaneous group.

The bundled piano sample therefore has one treble lane and one bass lane inside the same system group. A regression test changes the second staff to treble clef and verifies that both voices then render together in one lane.

Each merged voice keeps its own melodic connector chain and rests. If MusicXML does not specify stem directions, simultaneous voices alternate up/down stems to make them easier to separate visually.

A line break by itself does not create a new absolute pitch anchor. The POC currently treats a voice's first entrance, or a silence of at least one quarter-note before the next pitch, as a provisional new-phrase boundary. Otherwise the melodic connector is split across the system boundary: the outgoing half already slopes toward the next representative pitch and the incoming half completes the same interval on the following line. This heuristic is intentionally temporary until explicit phrase semantics are supported.

Clef changes occurring inside a rendered system are not yet split automatically; grouping currently uses the clef active at the start of that system.

## Run the prototype

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` and load a `.musicxml`, `.xml` or `.mxl` score, or click **Load sample**.

An internet connection is currently required when opening the page because VexFlow and JSZip are loaded from jsDelivr.

## Current controls

- MusicXML / MXL file picker;
- measures per rendered line;
- semitone vertical spacing;
- chromatic transposition in semitones;
- SVG download.

## MusicXML coverage in this POC

Supported well enough for experiments:

- uncompressed `.musicxml` / `.xml` and compressed `.mxl` input;
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

- explicit phrase-boundary semantics (current re-anchoring uses a silence heuristic);
- clef changes inside one rendered system;
- tuplets and grace-note spacing;
- ties, slurs and articulations;
- dynamics, lyrics and ornaments;
- repeats / volta logic;
- percussion and unpitched notes;
- enharmonic spelling after transposition;
- sophisticated multi-voice collision avoidance.

## Files

- `src/mxl.js`: `.mxl` ZIP/container extractor;
- `src/musicxml.js`: MusicXML parser into the internal score model, including clef assignments;
- `src/render.js`: VexFlow adapter and relative chromatic renderer;
- `src/app.js`: browser UI and file loading;
- `samples/example.musicxml`: two-clef piano sample;
- `docs/NOTATION.md`: current notation rules and open design questions.
