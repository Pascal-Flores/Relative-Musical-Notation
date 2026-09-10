import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import * as VexFlow from "vexflow";

const dom = new JSDOM("<!doctype html><html><body></body></html>");

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
globalThis.VexFlow = VexFlow;

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

const noteGlyphs = svg.querySelectorAll("path").length;
if (noteGlyphs === 0) {
  throw new Error("The SVG contains no path glyphs; rhythmic engraving did not render.");
}

const serializer = new dom.window.XMLSerializer();
const output = serializer.serializeToString(svg);
if (!output.includes("C4")) {
  throw new Error("The rendered sample does not contain its expected absolute C4 anchor.");
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

console.log(
  `VexFlow smoke render OK: ${output.length} SVG characters, ${noteGlyphs} path elements; clef grouping 2→1 verified.`,
);
