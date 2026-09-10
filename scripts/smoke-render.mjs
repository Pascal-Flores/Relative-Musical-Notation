import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import JSZip from "jszip";
import * as VexFlow from "vexflow";

const dom = new JSDOM("<!doctype html><html><body></body></html>");

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
globalThis.VexFlow = VexFlow;
globalThis.JSZip = JSZip;

const { extractMusicXMLFromMXL } = await import("../src/mxl.js");
const { parseMusicXML } = await import("../src/musicxml.js");
const { renderRelativeScore } = await import("../src/render-score.js");

const source = await readFile(new URL("../samples/example.musicxml", import.meta.url), "utf8");
const score = parseMusicXML(source);
const svg = renderRelativeScore(score, {
  measuresPerSystem: 4,
  semitoneSpacing: 8,
  transpose: 0,
});

if (svg.localName !== "svg") {
  throw new Error(`Expected an SVG root, got <${svg.localName}>.`);
}

if (svg.dataset.renderer !== "VexFlow 5") {
  throw new Error(`Unexpected renderer marker: ${svg.dataset.renderer || "missing"}`);
}

if (svg.dataset.clefLanes !== "2") {
  throw new Error(`Expected the piano sample to keep treble and bass in 2 clef lanes, got ${svg.dataset.clefLanes}.`);
}

if (svg.dataset.systemGroups !== "1") {
  throw new Error(`Expected the four-measure sample to form 1 simultaneous system group, got ${svg.dataset.systemGroups || "missing"}.`);
}

if (svg.dataset.partGrouping !== "native" || svg.dataset.sourceParts !== "1") {
  throw new Error("A one-part MusicXML score should pass through the simultaneous-score wrapper unchanged.");
}

if (svg.dataset.phraseGrouping !== "first-entry-only") {
  throw new Error(`Unexpected phrase grouping: ${svg.dataset.phraseGrouping || "missing"}.`);
}

if (svg.dataset.chordSpineLayout !== "adaptive-tight-gap") {
  throw new Error(`Unexpected chord-spine layout: ${svg.dataset.chordSpineLayout || "missing"}.`);
}

const chordSpineLines = svg.querySelectorAll('path[data-relative-chord-spine="true"]').length;
if (chordSpineLines < 7) {
  throw new Error(`Expected at least 7 redrawn C-E-G chord interval lines, got ${chordSpineLines}.`);
}

if (svg.dataset.anchorPolicy !== "phrase-aware-continuation") {
  throw new Error(`Unexpected anchor policy: ${svg.dataset.anchorPolicy || "missing"}.`);
}

if (svg.dataset.chordAnchorPolicy !== "representative-highest") {
  throw new Error(`Unexpected chord anchor policy: ${svg.dataset.chordAnchorPolicy || "missing"}.`);
}

if (svg.dataset.continuationPolicy !== "directional-half-interval") {
  throw new Error(`Unexpected continuation policy: ${svg.dataset.continuationPolicy || "missing"}.`);
}

const noteGlyphs = svg.querySelectorAll("path").length;
if (noteGlyphs === 0) {
  throw new Error("The SVG contains no path glyphs; rhythmic engraving did not render.");
}

const serializer = new dom.window.XMLSerializer();
const output = serializer.serializeToString(svg);
if (!output.includes("C4")) {
  throw new Error("The rendered sample does not contain its expected absolute C4 anchor.");
}

// Regression for scores that encode simultaneous lines as separate MusicXML
// parts. They must share the same measure-range system instead of rendering the
// same measure numbers once per part, one block after another.
const splitPartScore = structuredClone(score);
const originalPart = splitPartScore.parts[0];
const upperTracks = originalPart.tracks.filter((track) => track.staff === "1");
const lowerTracks = originalPart.tracks.filter((track) => track.staff === "2");
splitPartScore.parts = [
  { ...originalPart, id: "P1-upper", name: "Piano", tracks: upperTracks },
  { ...originalPart, id: "P1-lower", name: "Piano", tracks: lowerTracks },
];
const splitPartSvg = renderRelativeScore(splitPartScore, {
  measuresPerSystem: 4,
  semitoneSpacing: 8,
  transpose: 0,
});

if (splitPartSvg.dataset.sourceParts !== "2" || splitPartSvg.dataset.partGrouping !== "simultaneous") {
  throw new Error("Expected two source parts to be normalized into simultaneous rendering.");
}
if (splitPartSvg.dataset.systemGroups !== "1") {
  throw new Error(`Separate simultaneous parts must not duplicate the measure range; got ${splitPartSvg.dataset.systemGroups} system groups.`);
}
if (splitPartSvg.dataset.clefLanes !== "2") {
  throw new Error(`Expected the split piano parts to remain two visual lanes, got ${splitPartSvg.dataset.clefLanes}.`);
}

// A system break must not turn a continuous melodic phrase into a new absolute
// anchor. It gets continuation strokes instead, and the treble/bass lanes stay
// grouped as one simultaneous block per measure range.
const multiSystemSvg = renderRelativeScore(score, {
  measuresPerSystem: 2,
  semitoneSpacing: 8,
  transpose: 0,
});
const multiOutput = serializer.serializeToString(multiSystemSvg);

if (multiSystemSvg.dataset.systemGroups !== "2") {
  throw new Error(`Expected 2 simultaneous system groups, got ${multiSystemSvg.dataset.systemGroups || "missing"}.`);
}

if (multiOutput.includes("treble · voice") || multiOutput.includes("bass · voice")) {
  throw new Error("Per-lane clef/voice labels should not consume vertical layout space.");
}

const c4AnchorCount = (multiOutput.match(/>C4<\/text>/g) || []).length;
if (c4AnchorCount !== 1) {
  throw new Error(`Expected one C4 absolute anchor across a continuous two-system phrase, got ${c4AnchorCount}.`);
}

// If a phrase starts on a chord, its absolute anchor must be attached to the
// same representative tone used by the melodic contour: currently the highest
// chord tone, not the root/first MusicXML note by accident.
const chordAnchorScore = parseMusicXML(source);
const trebleTrack = chordAnchorScore.parts[0].tracks.find((track) => track.staff === "1" && track.voice === "1");
const firstTrebleNote = trebleTrack?.events.find((event) => event.kind === "note" && event.pitch);
if (!trebleTrack || !firstTrebleNote) throw new Error("Unable to build chord-anchor regression score.");
const addedChordTone = structuredClone(firstTrebleNote);
addedChordTone.pitch = { step: "G", alter: 0, octave: 4, midi: 67, label: "G4" };
addedChordTone.chord = true;
trebleTrack.events.push(addedChordTone);
trebleTrack.events.sort((a, b) => a.onset - b.onset || Number(a.chord) - Number(b.chord));

const chordAnchorSvg = renderRelativeScore(chordAnchorScore, {
  measuresPerSystem: 4,
  semitoneSpacing: 8,
  transpose: 0,
});
const chordAnchorOutput = serializer.serializeToString(chordAnchorSvg);
if (!chordAnchorOutput.includes(">G4</text>")) {
  throw new Error("A phrase-start chord should anchor its highest representative tone (G4 in this regression score).");
}
if (chordAnchorOutput.includes(">C4</text>")) {
  throw new Error("A phrase-start chord should not anchor the lower root when the melodic contour uses its highest tone.");
}

// Tight chord seconds need a visible interval line even though the two
// noteheads leave less than the old fixed 5 px gap on each side.
const tightChordSource = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Chord test</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
    <note><chord/><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
  </measure></part>
</score-partwise>`;
const tightChordSvg = renderRelativeScore(parseMusicXML(tightChordSource), {
  measuresPerSystem: 1,
  semitoneSpacing: 5,
  transpose: 0,
});
const tightLines = Array.from(tightChordSvg.querySelectorAll('path[data-relative-chord-spine="true"]'));
if (tightLines.length !== 1) {
  throw new Error(`Expected one visible line for a one-semitone chord gap, got ${tightLines.length}.`);
}

// The outgoing segment at a graphical line break must already point toward the
// next pitch. For this C4 -> G4 test, the right-edge continuation must slope up
// (SVG y decreases), rather than remaining horizontal.
const directionalSource = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>1</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
const directionalScore = parseMusicXML(directionalSource);
const directionalSvg = renderRelativeScore(directionalScore, {
  measuresPerSystem: 1,
  semitoneSpacing: 8,
  transpose: 0,
});
const rightEdgeSegments = Array.from(directionalSvg.querySelectorAll("path"))
  .map((path) => path.getAttribute("d") || "")
  .map((d) => ({ d, match: d.match(/^M(-?[0-9.]+) (-?[0-9.]+)L243 (-?[0-9.]+)$/) }))
  .filter(({ match }) => Boolean(match));

if (rightEdgeSegments.length === 0) {
  throw new Error("Expected a continuation segment reaching the first system's right edge.");
}
const [, , continuationStartY, continuationEndY] = rightEdgeSegments[0].match;
if (!(Number(continuationEndY) < Number(continuationStartY) - 1)) {
  throw new Error(`Expected C4 -> G4 line-break continuation to slope upward, got ${rightEdgeSegments[0].d}.`);
}

// Regression test for multi-voice display: if both piano staves use the same
// treble clef, their voices must share one visible relative-notation lane.
const sameClefSource = source.replace(
  '<clef number="2"><sign>F</sign><line>4</line></clef>',
  '<clef number="2"><sign>G</sign><line>2</line></clef>',
);
const sameClefScore = parseMusicXML(sameClefSource);
const sameClefSvg = renderRelativeScore(sameClefScore, {
  measuresPerSystem: 4,
  semitoneSpacing: 8,
  transpose: 0,
});

if (sameClefSvg.dataset.clefLanes !== "1") {
  throw new Error(`Expected same-clef voices to merge into 1 lane, got ${sameClefSvg.dataset.clefLanes}.`);
}

// Build a real compressed MusicXML archive in memory. MXL files are ZIP files
// whose META-INF/container.xml points at the root MusicXML document.
const archive = new JSZip();
archive.file(
  "META-INF/container.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>
  </rootfiles>
</container>`,
);
archive.file("score.musicxml", source);
const mxlBytes = await archive.generateAsync({ type: "uint8array", compression: "DEFLATE" });
const extracted = await extractMusicXMLFromMXL(mxlBytes, JSZip);

if (extracted.scorePath !== "score.musicxml") {
  throw new Error(`Expected MXL root score.musicxml, got ${extracted.scorePath}.`);
}

const mxlScore = parseMusicXML(extracted.xmlText);
if (mxlScore.metadata.title !== score.metadata.title || mxlScore.measureCount !== score.measureCount) {
  throw new Error("Extracted MXL score does not match the original MusicXML sample.");
}

console.log(
  `VexFlow smoke render OK: ${output.length} SVG characters, ${noteGlyphs} path elements; simultaneous multi-part grouping, tight chord intervals, chord anchors, directional continuations, phrase continuity, clef grouping 2→1 and MXL extraction verified.`,
);
