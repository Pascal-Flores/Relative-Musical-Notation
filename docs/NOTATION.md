# Relative Musical Notation — POC rules

This document describes the visual rules currently implemented by the prototype. They are deliberately provisional.

## 1. Pitch axis

There is no five-line staff.

Pitch is represented vertically on a uniform chromatic axis:

- one vertical step = one semitone;
- 12 semitones always have twelve times the vertical distance of 1 semitone;
- the same interval always produces the same slope when horizontal spacing is equal.

No horizontal pitch-reference lines are required.

## 2. Absolute pitch anchors and melodic phrases

An absolute pitch label such as `C4`, `F#4` or `Bb3` is attached locally to the note it identifies.

The label is placed on the side opposite the stem so it does not crowd the rhythmic notation:

- up stem → absolute pitch below the note;
- down stem → absolute pitch above the note.

If a phrase begins on a chord, the anchor is attached to the same chord tone used as the melodic representative. In the current POC that representative is the highest chord tone. This keeps the absolute anchor consistent with the point from which the incoming/outgoing melodic contour is drawn.

A graphical system break does **not** automatically create a new absolute-pitch anchor. If the same melodic phrase continues on the next line, the contour gets a short outgoing continuation at the end of the previous system and an incoming continuation into the first event of the next system.

The POC currently starts a new anchored phrase when either:

- the voice has no previous pitched event (its first entrance), or
- at least one quarter-note of silence separates the previous sounded note from the next pitched note.

That one-quarter threshold is only a provisional phrase heuristic. Later versions should use explicit phrase/slur/breath/rehearsal information when available and allow author-defined re-anchors.

## 3. Melodic connections

Successive musical events in one voice are linked with straight segments based on the actual notehead/rest positions produced by VexFlow.

The connector deliberately stops before each glyph. It therefore indicates the relationship between two events without visually touching or merging with the notehead or rest symbol.

The connector itself encodes direction through its slope. Direction is never repeated as a `+` or `-` sign.

### Interval notation

Small melodic intervals are encoded by the number of complete connector lines between the two notes:

- 1 semitone: one connecting line;
- 2 semitones: two parallel connecting lines;
- 3 semitones and above: one connecting line plus an unsigned numeric magnitude (`3`, `4`, `5`, `6`, `7`, `12`, ...).

A repeated pitch has one horizontal connector and no interval annotation.

At a system boundary, a continuous phrase is treated as one broken connector rather than as two unrelated horizontal stubs. The outgoing half already slopes in the direction of the next representative pitch, and the incoming half completes that same interval on the next line. The chromatic displacement is split between both sides of the break so the direction is visible immediately without duplicating the full vertical leap twice. A two-semitone continuation keeps its two-line encoding on both sides of the break.

### Rests

A rest does not reset the melodic reference. Its conventional rhythmic glyph is drawn at the same vertical pitch level as the last sounded note. The next pitched note is still measured from that last sounded pitch.

At the beginning of a continued system, the pitch state is initialized from the last sounded representative pitch of the previous system. A leading rest therefore keeps the correct reference instead of being reset to the new line's first note.

### Chords

Simultaneous notes are stacked at the same horizontal time position.

Because there is little vertical room for numeric labels inside a chord, chord intervals use line multiplicity for every interval size. Between each pair of adjacent chord tones, the number of thin parallel vertical lines equals the chromatic distance in semitones:

- 1 semitone: 1 vertical line;
- 2 semitones: 2 parallel vertical lines;
- 3 semitones: 3 parallel vertical lines;
- 4 semitones: 4 parallel vertical lines;
- 5 semitones: 5 parallel vertical lines;
- and so on.

For example, a C–E–G major triad has 4 vertical lines between C and E, then 3 vertical lines between E and G.

The spacing between adjacent chord-interval lines is fixed independently of the number of lines. The spacing is calibrated so that five lines span almost the full width of a notehead. Consequently, one, two, three or four lines remain centered but keep exactly the same inter-line spacing instead of being compressed or expanded to fill the available width.

The vertical lines still stop short of the noteheads so the chord remains visually open.

For the current POC, melodic connections entering or leaving a chord follow its highest pitch as the representative melodic note. Phrase-start anchors on chords now use that same highest representative pitch instead of whichever MusicXML chord member happened to occur first.

## 4. Rhythm

The prototype intentionally does **not** replace conventional rhythmic notation. It keeps filled / hollow noteheads, stems, flags, beams, augmentation dots and conventional rest families.

VexFlow 5 engraves these rhythmic primitives. Relative Musical Notation changes their vertical pitch placement but does not reinvent their rhythmic meaning.

## 5. Measures and simultaneous system groups

Vertical barlines remain, while horizontal staff lines disappear.

A rendered line is organized first by **time range**. All lanes that belong to the same range of measures are grouped together because they must be read and played simultaneously. For example, a piano treble lane and bass lane for measures 1–4 form one visual system group rather than looking like two unrelated lines.

Inside a simultaneous system group:

- clef lanes are packed with only a small vertical gap;
- per-lane labels such as `treble · voice 1` are omitted;
- measure numbers are shown once at the top of the group;
- measure separator lines span the complete group, across all of its lanes.

A horizontal separator is drawn between consecutive system groups. It separates measure ranges, not simultaneous lanes.

The vertical allocation of each lane is based mainly on its actual chromatic pitch span, with a smaller minimum padding than in the earlier POC layout.

## 6. Clefs, staves and voices

MusicXML clef assignments are preserved even though the five-line staff itself is not drawn.

Within each simultaneous system group, the renderer groups voices by their active clef:

- voices assigned to the same treble clef share one visible relative-notation lane;
- voices assigned to the same bass clef share one lane;
- treble and bass remain separate lanes inside the same simultaneous group;
- this also applies when the voices originate from different MusicXML staff numbers.

For example, the bundled piano sample has one treble-clef voice and one bass-clef voice, so each measure range renders as one system group containing two compact lanes. If both staves are changed to treble clef, both voices render together in a single lane inside that group.

When several voices share a lane, they use the same absolute vertical pitch geometry, so equal pitches align vertically. Their melodic connectors remain independent, and VexFlow formats the voices together horizontally. Default stem directions alternate up/down when MusicXML does not specify them.

The current POC groups a voice according to the clef active at the start of a rendered system. Clef changes inside one system are not yet split into separate lanes automatically.

## 7. Transposition

Global chromatic transposition adds the same number of semitones to every absolute pitch.

Because the notation is relative inside each melodic phrase, interval magnitudes, melodic slopes, connector multiplicity, vertical shape and rhythmic notation do not change; only absolute anchor labels change.

## 8. Rendering model

The current renderer uses hidden virtual VexFlow staves. The stave spacing is chosen so that half of one virtual VexFlow line-step equals exactly one chromatic semitone step in the visible notation.

The hidden staves and ledger lines are not drawn. VexFlow remains responsible for note glyphs, stems, beams, dots, rests, rhythmic spacing and multi-voice horizontal formatting; the POC supplies relative chromatic vertical positions, phrase-aware absolute anchors, chord interval lines, melodic connectors and simultaneous-system layout.

Connectors use VexFlow's own notehead coordinates (`getYs()`, `getNoteHeadBeginX()`, `getNoteHeadEndX()`) rather than recomputing approximate positions independently. A fixed geometric gap is removed from both ends of each melodic connector so it never touches the glyphs.

## 9. Open design questions

1. Which MusicXML/notation signals should define a true melodic phrase boundary instead of the current silence heuristic?
2. Is one quarter-note of silence a useful fallback phrase threshold, or should it depend on tempo/meter/context?
3. Is the one-line / two-line distinction for semitone and whole-tone melodic motion clear enough at different print sizes?
4. What should happen for unusually large gaps between adjacent chord tones if their line bundle would exceed a notehead's width?
5. Should the highest chord tone remain the default melodic representative, or should voice-leading metadata choose another tone when available?
6. How should more than two simultaneous voices sharing one clef be distinguished without relying on colour?
7. Should clef changes inside a system force an automatic lane split or a new system?
8. Should very large leaps be compressed visually or always remain metrically exact?
9. How should enharmonic spelling (`D#` versus `Eb`) be represented when pitch itself is chromatic?
10. How should ties, slurs, glissandi and phrase connections differ visually from the relative-pitch connector?
11. Should line breaks follow measures, phrases, or an engraving algorithm that considers both?
