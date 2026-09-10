import { extractMusicXMLFromMXL } from "./mxl.js";
import { parseMusicXML } from "./musicxml.js";
import { renderRelativeScore } from "./render.js";

const fileInput = document.querySelector("#fileInput");
const loadSampleButton = document.querySelector("#loadSample");
const downloadSvgButton = document.querySelector("#downloadSvg");
const measuresPerSystemInput = document.querySelector("#measuresPerSystem");
const semitoneSpacingInput = document.querySelector("#semitoneSpacing");
const semitoneSpacingValue = document.querySelector("#semitoneSpacingValue");
const transposeInput = document.querySelector("#transpose");
const status = document.querySelector("#status");
const scoreMeta = document.querySelector("#scoreMeta");
const renderHost = document.querySelector("#renderHost");

let score = null;
let sourceName = "score";
let currentSvg = null;

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function settings() {
  return {
    measuresPerSystem: Number(measuresPerSystemInput.value),
    semitoneSpacing: Number(semitoneSpacingInput.value),
    transpose: Number(transposeInput.value),
  };
}

function updateControlLabels() {
  semitoneSpacingValue.value = `${semitoneSpacingInput.value} px`;
}

function updateMetadata() {
  if (!score) {
    scoreMeta.hidden = true;
    return;
  }

  const trackCount = score.parts.reduce((total, part) => total + part.tracks.length, 0);
  const clefCount = new Set(
    score.parts.flatMap((part) => part.tracks.map((track) => track.clef?.key).filter(Boolean)),
  ).size;
  const items = [
    score.metadata.title,
    score.metadata.composer || null,
    `${score.parts.length} part${score.parts.length === 1 ? "" : "s"}`,
    `${trackCount} voice track${trackCount === 1 ? "" : "s"}`,
    `${clefCount || 1} clef lane${clefCount === 1 ? "" : "s"}`,
    `${score.measureCount} measure${score.measureCount === 1 ? "" : "s"}`,
    "VexFlow 5 engraving",
  ].filter(Boolean);

  scoreMeta.replaceChildren(...items.map((item) => {
    const span = document.createElement("span");
    span.textContent = item;
    return span;
  }));
  scoreMeta.hidden = false;
}

function render() {
  updateControlLabels();
  if (!score) return;

  try {
    currentSvg = renderRelativeScore(score, settings());
    renderHost.replaceChildren(currentSvg);
    downloadSvgButton.disabled = false;
    setStatus(`Rendered ${sourceName}. Voices sharing a MusicXML clef are displayed together; treble/bass remain separate.`);
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function loadXml(xmlText, name) {
  try {
    score = parseMusicXML(xmlText);
    sourceName = name;
    updateMetadata();
    render();
  } catch (error) {
    console.error(error);
    score = null;
    currentSvg = null;
    downloadSvgButton.disabled = true;
    updateMetadata();
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function clearFailedLoad(error) {
  console.error(error);
  score = null;
  currentSvg = null;
  downloadSvgButton.disabled = true;
  updateMetadata();
  setStatus(error instanceof Error ? error.message : String(error), true);
}

function isCompressedMusicXML(file) {
  return /\.mxl$/i.test(file.name) || file.type === "application/vnd.recordare.musicxml";
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    if (isCompressedMusicXML(file)) {
      setStatus(`Unpacking ${file.name}…`);
      const { xmlText } = await extractMusicXMLFromMXL(await file.arrayBuffer());
      loadXml(xmlText, file.name);
    } else {
      loadXml(await file.text(), file.name);
    }
  } catch (error) {
    clearFailedLoad(error);
  }
});

loadSampleButton.addEventListener("click", async () => {
  try {
    setStatus("Loading bundled sample…");
    const response = await fetch("./samples/example.musicxml");
    if (!response.ok) throw new Error(`Unable to load sample (${response.status}).`);
    loadXml(await response.text(), "samples/example.musicxml");
  } catch (error) {
    console.error(error);
    setStatus(`${error instanceof Error ? error.message : String(error)} Run the POC through a local HTTP server, as described in README.md.`, true);
  }
});

for (const control of [measuresPerSystemInput, semitoneSpacingInput, transposeInput]) {
  control.addEventListener("input", render);
  control.addEventListener("change", render);
}

downloadSvgButton.addEventListener("click", () => {
  if (!currentSvg) return;

  const serializer = new XMLSerializer();
  const source = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(currentSvg)}`;
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const baseName = sourceName.replace(/\.(musicxml|mxl|xml)$/i, "").replace(/[^a-z0-9_-]+/gi, "-") || "score";

  link.href = url;
  link.download = `${baseName}-relative.svg`;
  link.click();
  URL.revokeObjectURL(url);
});

updateControlLabels();
