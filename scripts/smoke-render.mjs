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
const { renderRelativeScore } = await import("../src/render.js");

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

if (svg.dataset.anchorPolicy !== "phrase-aware-continuation") {
  throw new Error(`Unexpected anchor policy: ${svg.dataset.anchorPolicy || "missing"}.`);
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
  `VexFlow smoke render OK: ${output.length} SVG characters, ${noteGlyphs} path elements; simultaneous grouping, phrase continuity, clef grouping 2→1 and MXL extraction verified.`,
);
