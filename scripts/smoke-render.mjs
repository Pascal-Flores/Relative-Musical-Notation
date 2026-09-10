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

const noteGlyphs = svg.querySelectorAll("path").length;
if (noteGlyphs === 0) {
  throw new Error("The SVG contains no path glyphs; rhythmic engraving did not render.");
}

const serializer = new dom.window.XMLSerializer();
const output = serializer.serializeToString(svg);
if (!output.includes("C4")) {
  throw new Error("The rendered sample does not contain its expected absolute C4 anchor.");
}

console.log(`VexFlow smoke render OK: ${output.length} SVG characters, ${noteGlyphs} path elements.`);
