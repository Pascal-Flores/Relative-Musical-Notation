# Relative Musical Notation — POC rules

This document describes the visual rules currently implemented by the prototype. They are deliberately provisional.

## 1. Pitch axis

There is no five-line staff.

Pitch is represented vertically on a uniform chromatic axis:

- one vertical step = one semitone;
- 12 semitones always have twelve times the vertical distance of 1 semitone;
- the same interval always produces the same slope when horizontal spacing is equal.

No horizontal pitch-reference lines are required.

## 2. Absolute pitch anchors

An absolute pitch label such as `C4`, `F#4` or `Bb3` is attached directly below the note it identifies.

In the current POC, the first pitched note of every rendered voice receives such an anchor. The label is deliberately local rather than placed in the left margin, so the same mechanism can later be used to re-anchor a phrase or section under any note in the score.

Everything after an anchor can be interpreted relatively from the contour and interval segments.

Later versions can add re-anchors at explicit phrase boundaries, rehearsal marks, sections, user-selected points or other useful resynchronisation points.

## 3. Melodic connections

Successive musical events in one voice are linked with straight segments based on the actual notehead/rest positions produced by VexFlow.

The connector deliberately stops before each glyph. It therefore indicates the relationship between two events without visually touching or merging with the notehead or rest symbol.

The connector itself encodes direction through its slope. Direction is never repeated as a `+` or `-` sign.

### Interval notation

Small intervals are encoded by the number of complete connector lines between the two notes:

- 1 semitone: one connecting line;
- 2 semitones: two parallel connecting lines;
- 3 semitones and above: one connecting line plus an unsigned numeric magnitude (`3`, `4`, `5`, `6`, `7`, `12`, ...).

A repeated pitch has one horizontal connector and no interval annotation.

### Rests

A rest does not reset the melodic reference. Its conventional rhythmic glyph is drawn at the same vertical pitch level as the last sounded note. The next pitched note is still measured from that last sounded pitch.

If a voice begins with rests before its first pitched event, those rests temporarily use that voice's first pitch as their vertical reference.

### Chords

Simultaneous notes are stacked at the same horizontal time position. Adjacent pitches in the chord are connected by vertical spine segments that stop short of the noteheads.

For the current POC, melodic connections entering or leaving a chord follow its highest pitch as the representative melodic note.

## 4. Rhythm

The prototype intentionally does **not** replace conventional rhythmic notation. It keeps filled / hollow noteheads, stems, flags, beams, augmentation dots and conventional rest families.

VexFlow 5 engraves these rhythmic primitives. Relative Musical Notation changes their vertical pitch placement but does not reinvent their rhythmic meaning.

## 5. Measures

Vertical barlines remain. Horizontal staff lines disappear. Measure numbers are shown lightly at the top of each clef lane.

## 6. Clefs, staves and voices

MusicXML clef assignments are preserved even though the five-line staff itself is not drawn.

The renderer groups simultaneous voices by their active clef:

- voices assigned to the same treble clef share one visible relative-notation lane;
- voices assigned to the same bass clef share one lane;
- treble and bass remain separate lanes, as on a normal grand staff;
- this also applies when the voices originate from different MusicXML staff numbers.

For example, the bundled piano sample has one treble-clef voice and one bass-clef voice, so it renders as two lanes. If both staves are changed to treble clef, both voices render together in a single lane.

When several voices share a lane, they use the same absolute vertical pitch geometry, so equal pitches align vertically. Their melodic connectors remain independent, and VexFlow formats the voices together horizontally. Default stem directions alternate up/down when MusicXML does not specify them.

The current POC groups a voice according to the clef active at the start of a rendered system. Clef changes inside one system are not yet split into separate lanes automatically.

## 7. Transposition

Global chromatic transposition adds the same number of semitones to every absolute pitch.

Because the notation is relative inside each line, interval magnitudes, melodic slopes, connector multiplicity, vertical shape and rhythmic notation do not change; only absolute anchor labels change.

## 8. Rendering model

The current renderer uses hidden virtual VexFlow staves. The stave spacing is chosen so that half of one virtual VexFlow line-step equals exactly one chromatic semitone step in the visible notation.

The hidden staves and ledger lines are not drawn. VexFlow remains responsible for note glyphs, stems, beams, dots, rests, rhythmic spacing and multi-voice horizontal formatting; the POC supplies relative chromatic vertical positions, local absolute anchors, chord spines and melodic connectors.

Connectors use VexFlow's own notehead coordinates (`getYs()`, `getNoteHeadBeginX()`, `getNoteHeadEndX()`) rather than recomputing approximate positions independently. A fixed geometric gap is removed from both ends of each connector so it never touches the glyphs.

## 9. Open design questions

1. How often should an absolute anchor be repeated?
2. Is the one-line / two-line distinction for semitone and whole-tone motion clear enough at different print sizes?
3. Which note of a polyphonic chord should carry the melodic continuation when MusicXML does not make that voice-leading explicit?
4. How should more than two simultaneous voices sharing one clef be distinguished without relying on colour?
5. Should clef changes inside a system force an automatic lane split or a new system?
6. Should very large leaps be compressed visually or always remain metrically exact?
7. How should enharmonic spelling (`D#` versus `Eb`) be represented when pitch itself is chromatic?
8. How should ties, slurs, glissandi and phrase connections differ visually from the relative-pitch connector?
9. Should line breaks follow measures, phrases, or an engraving algorithm that considers both?
