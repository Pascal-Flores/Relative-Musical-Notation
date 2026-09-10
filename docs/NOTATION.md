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

In the current POC, the first pitched note of every rendered system receives such an anchor. The label is deliberately local rather than placed in the left margin, so the same mechanism can later be used to re-anchor a phrase or section under any note in the score.

Everything after an anchor can be interpreted relatively from the contour and interval segments.

Later versions can add re-anchors at:

- explicit phrase boundaries;
- rehearsal marks;
- sections;
- user-selected points;
- other musically useful resynchronisation points.

## 3. Melodic connections

Successive musical events in one voice are linked with straight segments based on the actual notehead/rest positions produced by VexFlow.

The connector deliberately stops before each glyph. It therefore indicates the relationship between two events without visually touching or merging with the notehead or rest symbol.

The connector itself encodes direction through its slope. Direction is never repeated as a `+` or `-` sign.

### Interval notation

Small intervals are encoded by the number of complete connector lines between the two notes:

- 1 semitone: one connecting line;
- 2 semitones: two parallel connecting lines;
- 3 semitones and above: one connecting line plus an unsigned numeric magnitude (`3`, `4`, `5`, `6`, `7`, `12`, ...).

The two lines used for a whole tone run in parallel from the first event toward the second and retain the same visual gap around both glyphs.

A repeated pitch has one horizontal connector and no interval annotation.

### Rests

A rest does not reset the melodic reference.

Its conventional rhythmic glyph is drawn at the same vertical pitch level as the last sounded note. The contour therefore stays horizontal through the silence. The next pitched note is still measured from the last sounded pitch, so the reader never loses the relative reference merely because a rest occurred.

If a system begins with rests before its first pitched event, those rests use the system anchor pitch as their temporary vertical reference.

### Chords

Simultaneous notes are stacked at the same horizontal time position.

Adjacent pitches in the chord are connected by vertical spine segments. Each spine segment stops short of both noteheads, so the chord remains visually connected without the line touching or running through the noteheads.

For the current POC, melodic connections entering or leaving a chord follow its highest pitch as the representative melodic note. This is still a provisional voice-leading rule; later versions may use an explicit voice note instead.

## 4. Rhythm

The prototype intentionally does **not** replace conventional rhythmic notation.

It keeps the compact visual grammar of:

- filled / hollow noteheads;
- stems;
- flags;
- beams;
- augmentation dots;
- conventional rest families.

VexFlow 5 engraves these rhythmic primitives. Relative Musical Notation changes their vertical pitch placement but does not reinvent their rhythmic meaning.

Horizontal note position represents musical onset inside the measure, while duration is primarily read from the rhythmic symbol rather than from note length.

## 5. Measures

Vertical barlines remain. Horizontal staff lines disappear.

Measure numbers are shown lightly at the top of each track.

## 6. Voices and staves

MusicXML voices and staves are converted to independent melodic tracks. Each track receives its own anchor on each rendered line.

This avoids having one relative chain become ambiguous when multiple independent melodies are present at once.

A future version should explore whether several voices can share one visual field without becoming difficult to follow.

## 7. Transposition

Global chromatic transposition adds the same number of semitones to every absolute pitch.

Because the notation is relative inside each line:

- interval magnitudes do not change;
- melodic slopes do not change;
- connector multiplicity for 1- and 2-semitone intervals does not change;
- vertical shape does not change;
- rhythmic notation does not change;
- only the absolute anchor labels change.

This invariance is one of the main properties the POC is intended to test.

## 8. Rendering model

The current renderer uses a hidden virtual VexFlow stave. The stave spacing is chosen so that half of one virtual VexFlow line-step equals exactly one chromatic semitone step in the visible notation.

The hidden stave and its ledger lines are not drawn. VexFlow remains responsible for note glyphs, stems, beams, dots, rests and rhythmic horizontal formatting; the POC supplies the relative chromatic vertical positions, local absolute anchors, chord spines and melodic connectors.

Connectors use VexFlow's own notehead coordinates (`getYs()`, `getNoteHeadBeginX()`, `getNoteHeadEndX()`) rather than recomputing approximate positions independently. A fixed geometric gap is then removed from both ends of each connector so it never touches the glyphs.

## 9. Open design questions

The next useful experiments are:

1. How often should an absolute anchor be repeated?
2. Is the one-line / two-line distinction for semitone and whole-tone motion clear enough at different print sizes?
3. Which note of a polyphonic chord should carry the melodic continuation when MusicXML does not make that voice-leading explicit?
4. How should independent simultaneous voices be distinguished without relying on colour?
5. Should very large leaps be compressed visually or always remain metrically exact?
6. How should enharmonic spelling (`D#` versus `Eb`) be represented when pitch itself is chromatic?
7. How should ties, slurs, glissandi and phrase connections differ visually from the relative-pitch connector?
8. Should line breaks follow measures, phrases, or an engraving algorithm that considers both?
