import { renderRelativeScore as renderCore } from "./render.js";

const CONTINUITY_STEP = 0.0001;
const CHORD_LINE_WIDTH = 1.15;
const CHORD_LINE_SPACING = 2.7;
const NOTEHEAD_WIDTH = 11.8;

function clefOrder(clef) {
  if (clef?.sign === "G") return 0;
  if (clef?.sign === "C") return 1;
  if (clef?.sign === "F") return 2;
  return 3;
}

function syntheticMeasure(score, index) {
  const candidates = score.parts
    .map((part) => part.measures[index])
    .filter(Boolean);

  if (!candidates.length) {
    return {
      index,
      number: String(index + 1),
      start: index * 4,
      duration: 4,
      beats: 4,
      beatType: 4,
    };
  }

  const base = candidates[0];
  return {
    ...base,
    index,
    duration: Math.max(...candidates.map((measure) => measure.duration || 0.25)),
  };
}

function namespaceClef(clef, partIndex) {
  const source = clef || { sign: "G", line: 2, octaveChange: 0, key: "G:2:0", label: "treble" };
  const order = String(partIndex).padStart(4, "0");
  const rank = clefOrder(source);

  // render.js only uses clef identity for lane grouping/sorting. Namespacing
  // prevents two independent MusicXML parts from collapsing into one lane,
  // while keeping voices inside one original part grouped as before.
  return {
    ...source,
    sign: "X",
    key: `${order}:${rank}:${source.key || `${source.sign}:${source.line}:${source.octaveChange || 0}`}`,
  };
}

function continuityEvents(events, mapEvent = (event) => event) {
  let previousOriginalOnset = null;
  let continuityOnset = 0;

  return events.map((event) => {
    if (previousOriginalOnset !== null && Math.abs(event.onset - previousOriginalOnset) > 1e-7) {
      continuityOnset += CONTINUITY_STEP;
    }
    previousOriginalOnset = event.onset;

    return {
      ...mapEvent(event),
      // Horizontal engraving uses onsetInMeasure. The core renderer currently
      // also reuses the absolute onset for event ordering/chord grouping and a
      // provisional silence-based phrase heuristic. A tiny monotonic auxiliary
      // timeline keeps ordering/chords distinct without interpreting ordinary
      // rests as phrase boundaries.
      onset: continuityOnset,
    };
  });
}

function normalizeSinglePart(score) {
  const part = score.parts[0];
  return {
    ...score,
    parts: [{
      ...part,
      tracks: part.tracks.map((track) => ({
        ...track,
        events: continuityEvents(track.events),
      })),
    }],
  };
}

function noteheadPoint(notehead) {
  const glyph = Array.from(notehead.children || []).find((child) => child.localName === "text");
  if (!glyph) return null;

  const x = Number.parseFloat(glyph.getAttribute("x") || "");
  const y = Number.parseFloat(glyph.getAttribute("y") || "");
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function makeSvgPath(svg, d) {
  const path = svg.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#727a84");
  path.setAttribute("stroke-width", String(CHORD_LINE_WIDTH));
  path.dataset.relativeChordSpine = "true";
  return path;
}

function redrawChordIntervals(svg, requestedSemitoneSpacing) {
  const semitoneSpacing = Math.max(5, Math.min(14, Number(requestedSemitoneSpacing) || 8));

  // Core chord spines are uniquely emitted at this width. Remove them so all
  // chord gaps, including seconds with almost no vertical room, use one adaptive
  // rule and never disappear because of a fixed 5 px gap at each end.
  for (const path of svg.querySelectorAll('path[stroke="#727a84"][stroke-width="1.15"]')) {
    path.remove();
  }

  let chordCount = 0;
  let intervalCount = 0;
  let lineCount = 0;

  for (const noteGroup of svg.querySelectorAll("g.vf-stavenote")) {
    const heads = Array.from(noteGroup.children || [])
      .filter((child) => child.classList?.contains("vf-notehead"))
      .map(noteheadPoint)
      .filter(Boolean)
      .sort((a, b) => a.y - b.y);

    if (heads.length < 2) continue;
    chordCount += 1;

    const minX = Math.min(...heads.map((head) => head.x));
    const maxX = Math.max(...heads.map((head) => head.x));
    const centerX = (minX + maxX + NOTEHEAD_WIDTH) / 2;

    for (let index = 1; index < heads.length; index += 1) {
      const upper = heads[index - 1];
      const lower = heads[index];
      const distance = lower.y - upper.y;
      if (!(distance > 0)) continue;

      const semitones = Math.max(1, Math.round(distance / semitoneSpacing));
      const edgeGap = Math.min(4, Math.max(0.65, distance * 0.18));
      const startY = upper.y + edgeGap;
      const endY = lower.y - edgeGap;
      if (endY <= startY) continue;

      intervalCount += 1;
      const firstOffset = -((semitones - 1) * CHORD_LINE_SPACING) / 2;
      for (let lineIndex = 0; lineIndex < semitones; lineIndex += 1) {
        const x = centerX + firstOffset + lineIndex * CHORD_LINE_SPACING;
        const path = makeSvgPath(svg, `M${x} ${startY}L${x} ${endY}`);
        noteGroup.parentNode?.insertBefore(path, noteGroup);
        lineCount += 1;
      }
    }
  }

  svg.dataset.chordSpineLayout = "adaptive-tight-gap";
  svg.dataset.chordSpineChords = String(chordCount);
  svg.dataset.chordSpineIntervals = String(intervalCount);
  svg.dataset.chordSpineLines = String(lineCount);
}

export function groupScorePartsSimultaneously(score) {
  if (!score?.parts?.length) return score;
  if (score.parts.length === 1) return normalizeSinglePart(score);

  const tracks = [];
  const names = [];

  score.parts.forEach((part, partIndex) => {
    if (part.name && !names.includes(part.name)) names.push(part.name);

    part.tracks.forEach((track, trackIndex) => {
      const clefCache = new Map();
      const mapClef = (clef) => {
        const key = clef?.key || `${clef?.sign || "G"}:${clef?.line || 2}:${clef?.octaveChange || 0}`;
        if (!clefCache.has(key)) clefCache.set(key, namespaceClef(clef, partIndex));
        return clefCache.get(key);
      };

      tracks.push({
        ...track,
        key: `part:${partIndex}/track:${trackIndex}/${track.key}`,
        clef: mapClef(track.clef),
        events: continuityEvents(track.events, (event) => ({
          ...event,
          clef: mapClef(event.clef),
        })),
      });
    });
  });

  const measureCount = Math.max(0, score.measureCount || 0, ...score.parts.map((part) => part.measures.length));
  const measures = Array.from({ length: measureCount }, (_, index) => syntheticMeasure(score, index));

  return {
    ...score,
    parts: [{
      id: "simultaneous-score",
      name: names.length === 1 ? names[0] : "Score",
      measures,
      tracks,
      duration: Math.max(...score.parts.map((part) => part.duration || 0), 0),
    }],
  };
}

export function renderRelativeScore(score, options = {}) {
  const renderScore = groupScorePartsSimultaneously(score);
  const svg = renderCore(renderScore, options);
  redrawChordIntervals(svg, options.semitoneSpacing);
  svg.dataset.sourceParts = String(score?.parts?.length || 0);
  svg.dataset.partGrouping = score?.parts?.length > 1 ? "simultaneous" : "native";
  svg.dataset.phraseGrouping = "first-entry-only";
  return svg;
}
