import { renderRelativeScore as renderCore } from "./render.js";

const CONTINUITY_STEP = 0.0001;
const CHORD_LINE_WIDTH = 1.15;
const CHORD_LINE_SPACING = 2.7;
const NOTEHEAD_WIDTH = 11.8;

const CORE_TOP = 54;
const CORE_PART_TOP_GAP = 26;
const CORE_LANE_PADDING = 36;
const CORE_LANE_BASE_HEIGHT = 72;
const CORE_LANE_GAP = 0;
const CORE_SYSTEM_GAP = 14;
const CORE_PART_BOTTOM_GAP = 6;

const PRINT_FIRST_SYSTEM_TOP = 72;
const PRINT_LANE_PADDING = 12;
const PRINT_LANE_MIN_HEIGHT = 36;
const PRINT_LANE_GAP = 2;
const PRINT_SYSTEM_GAP = 30;
const PRINT_SEPARATOR_OFFSET = PRINT_SYSTEM_GAP / 2;
const PRINT_BOTTOM_MARGIN = 18;
const PRINT_MEASURE_LABEL_Y = -6;
const PRINT_LEFT_MARGIN = 58;
const PRINT_MEASURE_WIDTH = 190;
const PRINT_SYSTEM_BRACKET_OFFSET = 10;

const CORE_FRAME_STROKE = "#d6dade";
const SYSTEM_SEPARATOR_STROKE = "#bfc5cb";
const MUSIC_STROKE = "#727a84";
const SVG_NS = "http://www.w3.org/2000/svg";

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
  const path = svg.ownerDocument.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", MUSIC_STROKE);
  path.setAttribute("stroke-width", String(CHORD_LINE_WIDTH));
  path.dataset.relativeChordSpine = "true";
  return path;
}

function redrawChordIntervals(svg, requestedSemitoneSpacing) {
  const semitoneSpacing = Math.max(5, Math.min(14, Number(requestedSemitoneSpacing) || 8));
  const coreLines = Array.from(
    svg.querySelectorAll(`path[stroke="${MUSIC_STROKE}"][stroke-width="${CHORD_LINE_WIDTH}"]`),
  );

  // The core renderer already knows the exact pitch intervals and therefore
  // draws the right number of lines for ordinary chords. Keep those lines and
  // only repair intervals whose noteheads are too close for the core's fixed
  // vertical glyph gap.
  for (const path of coreLines) path.dataset.relativeChordSpine = "true";

  let chordCount = 0;
  let intervalCount = 0;
  let lineCount = coreLines.length;

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
      intervalCount += 1;

      // With CHORD_GAP=5 in the core renderer, an interval of 10 px or less
      // cannot leave a visible vertical segment. Those are the only intervals
      // reconstructed from the notehead geometry here.
      if (distance > 10.01) continue;

      const semitones = Math.max(1, Math.round(distance / semitoneSpacing));
      const edgeGap = Math.min(4, Math.max(0.65, distance * 0.18));
      const startY = upper.y + edgeGap;
      const endY = lower.y - edgeGap;
      if (endY <= startY) continue;

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

function trackClefInSystem(track, systemStart, systemEnd) {
  const event = track.events.find((candidate) =>
    candidate.measureIndex >= systemStart && candidate.measureIndex < systemEnd,
  );
  return event?.clef ?? track.clef ?? { sign: "G", line: 2, octaveChange: 0, key: "G:2:0", label: "treble" };
}

function buildClefLanesForLayout(part, systemStart, systemEnd) {
  const lanes = new Map();

  for (const track of part.tracks) {
    const active = track.events.some((event) =>
      event.measureIndex >= systemStart && event.measureIndex < systemEnd,
    );
    if (!active) continue;

    const clef = trackClefInSystem(track, systemStart, systemEnd);
    const key = clef.key || `${clef.sign}:${clef.line}:${clef.octaveChange || 0}`;
    if (!lanes.has(key)) lanes.set(key, { key, clef, tracks: [] });
    lanes.get(key).tracks.push(track);
  }

  return Array.from(lanes.values())
    .map((lane) => ({
      ...lane,
      tracks: lane.tracks.sort((a, b) => Number(a.staff) - Number(b.staff) || Number(a.voice) - Number(b.voice)),
    }))
    .sort((a, b) => clefOrder(a.clef) - clefOrder(b.clef) || a.key.localeCompare(b.key));
}

function lanePitchSpan(lane, systemStart, systemEnd, transpose = 0) {
  const notes = lane.tracks.flatMap((track) => track.events.filter((event) =>
    event.measureIndex >= systemStart
    && event.measureIndex < systemEnd
    && event.kind === "note"
    && event.pitch,
  ));

  if (!notes.length) return 0;
  const midis = notes.map((event) => event.pitch.midi + transpose);
  return Math.max(...midis) - Math.min(...midis);
}

function clampRenderOptions(options = {}) {
  return {
    measuresPerSystem: Math.max(1, Math.min(8, Number(options.measuresPerSystem) || 4)),
    semitoneSpacing: Math.max(5, Math.min(14, Number(options.semitoneSpacing) || 8)),
    transpose: Math.max(-48, Math.min(48, Number(options.transpose) || 0)),
    leftMargin: PRINT_LEFT_MARGIN,
    measureWidth: PRINT_MEASURE_WIDTH,
  };
}

function buildCoreAndPrintLayout(score, options) {
  const rows = [];
  const groups = [];
  let oldTop = CORE_TOP;

  for (const part of score.parts) {
    oldTop += CORE_PART_TOP_GAP;
    let firstGroupForPart = true;

    for (let systemStart = 0; systemStart < part.measures.length; systemStart += options.measuresPerSystem) {
      const systemEnd = Math.min(part.measures.length, systemStart + options.measuresPerSystem);
      const lanes = buildClefLanesForLayout(part, systemStart, systemEnd);
      const oldGroupTop = oldTop;
      let oldSystemHeight = 0;
      const groupRows = [];

      lanes.forEach((lane, laneIndex) => {
        const span = lanePitchSpan(lane, systemStart, systemEnd, options.transpose);
        const oldRowTop = oldGroupTop + oldSystemHeight;
        const oldRowHeight = CORE_LANE_BASE_HEIGHT + span * options.semitoneSpacing;
        const row = {
          part,
          lane,
          laneIndex,
          laneCount: lanes.length,
          systemStart,
          systemEnd,
          span,
          oldTop: oldRowTop,
          oldHeight: oldRowHeight,
          oldBottom: oldRowTop + oldRowHeight,
          oldPitchTop: oldRowTop + CORE_LANE_PADDING,
          oldPitchBottom: oldRowTop + CORE_LANE_PADDING + span * options.semitoneSpacing,
          firstGroupForPart,
        };
        rows.push(row);
        groupRows.push(row);
        oldSystemHeight += oldRowHeight;
        if (laneIndex < lanes.length - 1) oldSystemHeight += CORE_LANE_GAP;
      });

      const oldGroupBottom = oldGroupTop + oldSystemHeight;
      groups.push({
        part,
        systemStart,
        systemEnd,
        rows: groupRows,
        oldTop: oldGroupTop,
        oldBottom: oldGroupBottom,
        firstGroupForPart,
      });
      oldTop = oldGroupBottom + CORE_SYSTEM_GAP;
      firstGroupForPart = false;
    }

    oldTop += CORE_PART_BOTTOM_GAP;
  }

  let newCursor = PRINT_FIRST_SYSTEM_TOP;
  let previousPart = null;

  for (const group of groups) {
    if (previousPart && previousPart !== group.part) newCursor += PRINT_SYSTEM_GAP;
    group.newTop = newCursor;

    group.rows.forEach((row, laneIndex) => {
      row.newTop = newCursor;
      row.newHeight = Math.max(
        PRINT_LANE_MIN_HEIGHT,
        PRINT_LANE_PADDING * 2 + row.span * options.semitoneSpacing,
      );
      row.newBottom = row.newTop + row.newHeight;
      row.visualShift = (row.newTop + PRINT_LANE_PADDING) - row.oldPitchTop;
      newCursor = row.newBottom;
      if (laneIndex < group.rows.length - 1) newCursor += PRINT_LANE_GAP;
    });

    group.newBottom = newCursor;
    newCursor += PRINT_SYSTEM_GAP;
    previousPart = group.part;
  }

  const height = Math.max(220, (groups.at(-1)?.newBottom ?? PRINT_FIRST_SYSTEM_TOP) + PRINT_BOTTOM_MARGIN);
  return { rows, groups, height };
}

function pathNumbers(path) {
  return (path.getAttribute("d") || "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
}

function representativeY(element) {
  const samples = [];

  const collectText = (node) => {
    const y = Number.parseFloat(node.getAttribute("y") || "");
    if (Number.isFinite(y)) samples.push(y);
  };
  const collectRect = (node) => {
    const y = Number.parseFloat(node.getAttribute("y") || "");
    const height = Number.parseFloat(node.getAttribute("height") || "");
    if (Number.isFinite(y)) samples.push(y + (Number.isFinite(height) ? height / 2 : 0));
  };
  const collectPath = (node) => {
    const numbers = pathNumbers(node);
    for (let index = 1; index < numbers.length; index += 2) {
      if (Number.isFinite(numbers[index])) samples.push(numbers[index]);
    }
  };

  if (element.localName === "text") collectText(element);
  if (element.localName === "rect") collectRect(element);
  if (element.localName === "path") collectPath(element);

  for (const node of element.querySelectorAll?.("text[y]") || []) collectText(node);
  for (const node of element.querySelectorAll?.("rect[y]") || []) collectRect(node);
  for (const node of element.querySelectorAll?.("path[d]") || []) collectPath(node);

  if (!samples.length) return null;
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

function rowForY(layout, y) {
  if (!Number.isFinite(y)) return null;

  const candidates = layout.rows
    .map((row) => {
      const center = (row.oldPitchTop + row.oldPitchBottom) / 2;
      const distance = Math.abs(y - center);
      const within = y >= row.oldTop - 28 && y <= row.oldBottom + 28;
      return { row, distance, within };
    })
    .filter((candidate) => candidate.within)
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.row ?? null;
}

function applyVerticalTranslation(element, delta) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) return;
  const existing = (element.getAttribute("transform") || "").trim();
  element.setAttribute("transform", `translate(0 ${delta})${existing ? ` ${existing}` : ""}`);
}

function strokeOf(element) {
  return (element.getAttribute("stroke") || "").trim().toLowerCase();
}

function rootTextY(text) {
  const y = Number.parseFloat(text.getAttribute("y") || "");
  return Number.isFinite(y) ? y : null;
}

function isMeasureNumberText(text, layout, options) {
  const x = Number.parseFloat(text.getAttribute("x") || "");
  const y = rootTextY(text);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  for (const group of layout.groups) {
    if (Math.abs(y - (group.oldTop + 5)) > 2) continue;

    for (let measureIndex = group.systemStart; measureIndex < group.systemEnd; measureIndex += 1) {
      const localIndex = measureIndex - group.systemStart;
      const expectedX = options.leftMargin + localIndex * options.measureWidth + 7;
      const measure = group.part.measures[measureIndex];
      if (!measure) continue;
      if (Math.abs(x - expectedX) <= 2 && text.textContent === String(measure.number)) return true;
    }
  }

  return false;
}

function isPartLabelText(text, layout) {
  const y = rootTextY(text);
  if (!Number.isFinite(y)) return false;

  return layout.groups.some((group) =>
    group.firstGroupForPart
    && text.textContent === String(group.part.name || "")
    && Math.abs(y - (group.oldTop - 12)) <= 2,
  );
}

function makeFramePath(svg, d, stroke, width = 1) {
  const path = svg.ownerDocument.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", stroke);
  path.setAttribute("stroke-width", String(width));
  return path;
}

function makeFrameText(svg, text, x, y, options = {}) {
  const node = svg.ownerDocument.createElementNS(SVG_NS, "text");
  node.setAttribute("x", String(x));
  node.setAttribute("y", String(y));
  node.setAttribute("fill", options.fill || "#969da5");
  node.setAttribute("font-family", options.family || "Arial");
  node.setAttribute("font-size", String(options.size || 9));
  if (options.weight) node.setAttribute("font-weight", options.weight);
  if (options.anchor) node.setAttribute("text-anchor", options.anchor);
  node.textContent = String(text);
  return node;
}

function reframeSystems(svg, layout, options) {
  const frame = svg.ownerDocument.createElementNS(SVG_NS, "g");
  frame.dataset.scoreSystemFrame = "true";

  layout.groups.forEach((group, groupIndex) => {
    const top = group.newTop + 4;
    const bottom = group.newBottom - 4;
    const firstMeasure = group.part.measures[group.systemStart];

    if (firstMeasure) {
      frame.append(makeFrameText(
        svg,
        firstMeasure.number,
        options.leftMargin + 2,
        group.newTop + PRINT_MEASURE_LABEL_Y,
        { size: 8.5, fill: "#8a9199" },
      ));
    }

    for (let measureIndex = group.systemStart; measureIndex < group.systemEnd; measureIndex += 1) {
      const localIndex = measureIndex - group.systemStart;
      const x = options.leftMargin + localIndex * options.measureWidth;
      frame.append(makeFramePath(svg, `M${x} ${top}L${x} ${bottom}`, CORE_FRAME_STROKE, 1));
    }

    const endX = options.leftMargin + (group.systemEnd - group.systemStart) * options.measureWidth;
    frame.append(makeFramePath(svg, `M${endX} ${top}L${endX} ${bottom}`, CORE_FRAME_STROKE, 1));

    if (group.rows.length > 1) {
      const bracketX = options.leftMargin - PRINT_SYSTEM_BRACKET_OFFSET;
      frame.append(makeFramePath(svg, `M${bracketX} ${top}L${bracketX} ${bottom}`, "#9299a1", 1.25));
      frame.append(makeFramePath(svg, `M${bracketX} ${top}L${bracketX + 7} ${top}`, "#9299a1", 1.25));
      frame.append(makeFramePath(svg, `M${bracketX} ${bottom}L${bracketX + 7} ${bottom}`, "#9299a1", 1.25));
    }

    if (group.firstGroupForPart && group.part.name) {
      frame.append(makeFrameText(
        svg,
        group.part.name,
        options.leftMargin - 15,
        (group.newTop + group.newBottom) / 2 + 4,
        { size: 10, fill: "#4d545c", weight: "bold", anchor: "end" },
      ));
    }

    const next = layout.groups[groupIndex + 1];
    if (next && next.part === group.part) {
      const separatorY = group.newBottom + PRINT_SEPARATOR_OFFSET;
      const svgWidth = Number.parseFloat(svg.getAttribute("width") || "846");
      const separator = makeFramePath(
        svg,
        `M18 ${separatorY}L${Math.max(18, svgWidth - 18)} ${separatorY}`,
        SYSTEM_SEPARATOR_STROKE,
        0.8,
      );
      separator.dataset.systemSeparator = "true";
      frame.append(separator);
    }
  });

  svg.insertBefore(frame, svg.firstChild);
}

function restyleHeader(svg, score, width) {
  const rootTexts = Array.from(svg.children).filter((child) => child.localName === "text");
  const title = score.metadata?.title || "Untitled score";
  const titleNode = rootTexts.find((node) => node.textContent === title && (rootTextY(node) ?? 999) < 40);

  if (titleNode) {
    titleNode.setAttribute("x", String(width / 2));
    titleNode.setAttribute("y", "28");
    titleNode.setAttribute("text-anchor", "middle");
  }

  const composer = score.metadata?.composer;
  if (composer) {
    const composerNode = rootTexts.find((node) => node.textContent === composer && (rootTextY(node) ?? 999) < 60);
    if (composerNode) {
      composerNode.setAttribute("x", String(width - 22));
      composerNode.setAttribute("y", "48");
      composerNode.setAttribute("text-anchor", "end");
    }
  }
}

function compactToScoreLayout(svg, score, options) {
  const layout = buildCoreAndPrintLayout(score, options);
  const rootChildren = Array.from(svg.children);

  for (const child of rootChildren) {
    if (child.localName === "path") {
      const stroke = strokeOf(child);
      if (stroke === CORE_FRAME_STROKE || stroke === SYSTEM_SEPARATOR_STROKE) {
        child.remove();
        continue;
      }
    }

    if (child.localName === "text") {
      if (isMeasureNumberText(child, layout, options) || isPartLabelText(child, layout)) {
        child.remove();
        continue;
      }

      const y = rootTextY(child);
      if (Number.isFinite(y) && y < 60) continue;
    }

    const y = representativeY(child);
    const row = rowForY(layout, y);
    if (row) applyVerticalTranslation(child, row.visualShift);
  }

  const width = Number.parseFloat(svg.getAttribute("width") || "")
    || Number.parseFloat((svg.getAttribute("viewBox") || "").split(/\s+/)[2] || "")
    || 846;

  restyleHeader(svg, score, width);
  svg.setAttribute("viewBox", `0 0 ${width} ${layout.height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(layout.height));
  svg.style.removeProperty("width");
  svg.style.removeProperty("height");

  reframeSystems(svg, layout, options);

  svg.dataset.layoutStyle = "score-systems-compact";
  svg.dataset.layoutLanePadding = String(PRINT_LANE_PADDING);
  svg.dataset.layoutLaneGap = String(PRINT_LANE_GAP);
  svg.dataset.layoutSystemGap = String(PRINT_SYSTEM_GAP);
  return layout;
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
  const normalizedOptions = clampRenderOptions(options);
  const svg = renderCore(renderScore, normalizedOptions);

  redrawChordIntervals(svg, normalizedOptions.semitoneSpacing);
  compactToScoreLayout(svg, renderScore, normalizedOptions);

  svg.dataset.sourceParts = String(score?.parts?.length || 0);
  svg.dataset.partGrouping = score?.parts?.length > 1 ? "simultaneous" : "native";
  svg.dataset.phraseGrouping = "first-entry-only";
  return svg;
}
