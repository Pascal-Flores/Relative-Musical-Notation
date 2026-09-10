# Relative Musical Notation — POC rules

This document describes the visual rules currently implemented by the prototype. They are deliberately provisional.

## 1. Pitch axis

There is no five-line staff.

Pitch is represented vertically on a uniform chromatic axis:

- one vertical step = one semitone;
- +12 semitones always has twelve times the vertical distance of +1;
- the same interval always produces the same slope when horizontal spacing is equal.

No horizontal pitch-reference lines are required.

## 2. Absolute pitch anchors

Each rendered melodic line starts with an absolute pitch label such as `C4`, `F#4` or `Bb3`.

Everything after that anchor can be interpreted relatively from the contour and interval segments.

In the current POC, every rendered system is automatically re-anchored on its first pitched note. Later versions could also re-anchor on:

- explicit phrase boundaries;
- rehearsal marks;
- sections;
- user-selected points;
- long rests.

The re-anchor also acts as a resynchronisation point for the reader.

## 3. Melodic connections

Successive pitched events in one voice are linked with straight segments.

The segment encodes interval direction and magnitude geometrically. An optional signed semitone label is rendered at the midpoint:

- `+2`: up one whole tone;
- `-1`: down one semitone;
- `0`: repeated pitch;
- `+12`: up one octave.

A rest breaks the melodic connection in the POC.

When an event is a chord, all simultaneous pitches are stacked at the same horizontal position. For the first experiment, the melodic connector entering/leaving a chord follows its highest note. This is only a provisional voice-leading rule.

## 4. Rhythm

The prototype intentionally does **not** replace conventional rhythmic notation.

It keeps the compact visual grammar of:

- filled / hollow noteheads;
- stems;
- flags;
- beams;
- augmentation dots;
- conventional rest families.

Horizontal note position represents musical onset inside the measure, but duration is primarily read from the rhythmic symbol rather than from note length.

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

- interval labels do not change;
- melodic slopes do not change;
- vertical shape does not change;
- only the absolute anchor labels change.

This invariance is one of the main properties the POC is intended to test.

## 8. Open design questions

The next useful experiments are:

1. How often should an absolute anchor be repeated?
2. Should interval numbers remain visible in normal reading, or only in a learning mode?
3. How should chords expose their internal intervals?
4. How should independent simultaneous voices be distinguished without relying on colour?
5. Should very large leaps be compressed visually or always remain metrically exact?
6. How should enharmonic spelling (`D#` versus `Eb`) be represented when pitch itself is chromatic?
7. How should ties, slurs, glissandi and phrase connections differ visually from the relative-pitch connector?
8. Should line breaks follow measures, phrases, or an engraving algorithm that considers both?
