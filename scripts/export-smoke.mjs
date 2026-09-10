import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.XMLSerializer = dom.window.XMLSerializer;
globalThis.btoa = globalThis.btoa || dom.window.btoa.bind(dom.window);

const {
  computePdfPageBands,
  createPagedPreview,
  createStandaloneSvg,
} = await import("../src/pdf-export.js");

const NS = "http://www.w3.org/2000/svg";
const svg = document.createElementNS(NS, "svg");
svg.setAttribute("width", "846");
svg.setAttribute("height", "2778");
svg.setAttribute("viewBox", "0 0 846 2778");
svg.setAttribute("style", "width: 846px; height: 2778px;");
svg.setAttribute("font-family", "Bravura,Academico");

for (const y of [384, 702, 996, 1370, 1736, 2070, 2380]) {
  const separator = document.createElementNS(NS, "path");
  separator.setAttribute("fill", "none");
  separator.setAttribute("stroke", "#bfc5cb");
  separator.setAttribute("d", `M18 ${y}L828 ${y}`);
  svg.append(separator);
}

const note = document.createElementNS(NS, "text");
note.setAttribute("x", "81");
note.setAttribute("y", "181");
note.textContent = "\uE0A4";
svg.append(note);

const layout = computePdfPageBands(svg);
if (layout.bands.length !== 3) {
  throw new Error(`Expected 3 A4 bands for the regression fixture, got ${layout.bands.length}.`);
}
if (layout.bands[0].end !== 1008 || layout.bands[1].start !== 1008) {
  throw new Error(`Expected the first break 12 units after separator 996, got ${layout.bands[0].end}.`);
}
if (layout.bands[1].end !== 2082 || layout.bands[2].start !== 2082) {
  throw new Error(`Expected the second break 12 units after separator 2070, got ${layout.bands[1].end}.`);
}

const preview = createPagedPreview(svg);
if (preview.pageCount !== 3) {
  throw new Error(`Expected 3 preview pages, got ${preview.pageCount}.`);
}
const firstPageSvg = preview.element.querySelector(".pdf-page-svg");
if (!firstPageSvg) throw new Error("Paged preview did not contain an SVG page.");
if (firstPageSvg.style.width || firstPageSvg.style.height) {
  throw new Error(`Paged SVG clone kept stale full-score inline dimensions: ${firstPageSvg.getAttribute("style")}.`);
}
if (firstPageSvg.getAttribute("height") !== "1008") {
  throw new Error(`Expected first page SVG height 1008, got ${firstPageSvg.getAttribute("height")}.`);
}
if (firstPageSvg.getAttribute("viewBox") !== "0 0 846 1008") {
  throw new Error(`Unexpected first page viewBox: ${firstPageSvg.getAttribute("viewBox")}.`);
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new Uint8Array([0, 1, 2, 3, 4, 5]).buffer,
});

try {
  const standalone = await createStandaloneSvg(svg);
  const embeddedStyle = standalone.querySelector('style[data-export-fonts="embedded"]');
  if (!embeddedStyle) throw new Error("Standalone SVG did not embed export fonts.");
  const css = embeddedStyle.textContent || "";
  if (!css.includes("font-family:'Bravura'") || !css.includes("font-family:'Academico'")) {
    throw new Error("Standalone SVG is missing Bravura or Academico @font-face rules.");
  }
  if ((css.match(/data:font\/woff2;base64,/g) || []).length !== 2) {
    throw new Error("Standalone SVG should contain two embedded WOFF2 data URLs.");
  }
  if (standalone.style.width || standalone.style.height) {
    throw new Error("Standalone SVG kept stale inline width/height styles.");
  }
  if (standalone.dataset.exportFormat !== "standalone-svg") {
    throw new Error(`Unexpected standalone export marker: ${standalone.dataset.exportFormat || "missing"}.`);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Export smoke OK: A4 page breaks keep separator clearance, page clones have consistent geometry, and standalone SVG embeds both notation fonts.");
