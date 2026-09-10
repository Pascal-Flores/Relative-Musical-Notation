import { midiToPitchLabel } from "./musicxml.js";

const ANCHOR_LINE = 2.5;
const CONNECTOR_GAP = 6;
const CHORD_GAP = 5;
const PARALLEL_CONNECTOR_OFFSET = 2.4;
const CHORD_PARALLEL_REFERENCE_LINES = 5;
const CHORD_PARALLEL_WIDTH_RATIO = 0.92;
const DEFAULT_CLEF = { sign: "G", line: 2, octaveChange: 0, key: "G:2:0", label: "treble" };

function requireVexFlow() {
  const vf = globalThis.VexFlow;
  if (!vf) throw new Error("VexFlow failed to load. Check the network connection and reload the page.");
  return vf;
}

function groupByOnset(events) {
  const sorted = [...events].sort((a, b) => a.onset - b.onset || Number(a.chord) - Number(b.chord));
  const clusters = [];

  for (const event of sorted) {
    const last = clusters.at(-1);
    if (!last || Math.abs(last.onset - event.onset) > 1e-7) {
      clusters.push({ onset: event.onset, onsetInMeasure: event.onsetInMeasure, events: [event] });
    } else {
      last.events.push(event);
    }
  }

  return clusters.map((cluster) => ({
    ...cluster,
    notes: cluster.events.filter((event) => event.kind === "note" && event.pitch),
    rests: cluster.events.filter((event) => event.kind === "rest"),
  }));
}

function representativeNote(cluster) {
  if (!cluster.notes.length) return null;
  return cluster.notes.reduce((highest, note) => note.pitch.midi > highest.pitch.midi ? note : highest);
}

function clusterDuration(cluster) {
  const event = cluster.notes[0] ?? cluster.rests[0];
  return Math.max(0, event?.duration ?? 0);
}

function clusterType(cluster) {
  return cluster.notes[0]?.type || cluster.rests[0]?.type || "quarter";
}

function clusterDots(cluster) {
  return cluster.notes[0]?.dots || cluster.rests[0]?.dots || 0;
}

function toVexDuration(type, dots = 0, rest = false) {
  const base = {
    breve: "1/2",
    whole: "w",
    half: "h",
    quarter: "q",
    eighth: "8",
    "16th": "16",
    "32nd": "32",
    "64th": "64",
  }[type] || "q";

  return `${base}${"d".repeat(Math.max(0, dots))}${rest ? "r" : ""}`;
}

function decomposeQuarterDuration(value) {
  const durations = [
    [4, "w"],
    [2, "h"],
    [1, "q"],
    [0.5, "8"],
    [0.25, "16"],
    [0.125, "32"],
    [0.0625, "64"],
  ];
  const result = [];
  let remaining = Math.max(0, value);

  for (const [quarters, vex] of durations) {
    while (remaining + 1e-7 >= quarters) {
      result.push(vex);
      remaining -= quarters;
    }
  }
  return result;
}

function makeGhosts(vf, durationQuarter) {
  return decomposeQuarterDuration(durationQuarter).map((duration) => new vf.GhostNote({ duration }));
}

function makeDummyKeys(count) {
  const keys = ["c/4", "d/4", "e/4", "f/4", "g/4", "a/4", "b/4", "c/5", "d/5", "e/5", "f/5", "g/5"];
  return Array.from({ length: Math.max(1, count) }, (_, index) => keys[index % keys.length]);
}

function makeVexNote(vf, cluster, stave, anchorMidi, transpose, referenceMidi, defaultStemDirection = null) {
  const isRest = cluster.notes.length === 0;
  const orderedNotes = isRest ? [] : [...cluster.notes].sort((a, b) => a.pitch.midi - b.pitch.midi);
  const duration = toVexDuration(clusterType(cluster), clusterDots(cluster), isRest);
  const keys = isRest ? ["b/4"] : makeDummyKeys(orderedNotes.length);
  const note = new vf.StaveNote({ keys, duration });

  if (isRest) {
    const delta = referenceMidi - anchorMidi;
    note.setKeyLine(0, ANCHOR_LINE + delta * 0.5);
  } else {
    orderedNotes.forEach((event, index) => {
      const delta = event.pitch.midi + transpose - anchorMidi;
      note.setKeyLine(index, ANCHOR_LINE + delta * 0.5);
    });
  }

  const explicitStem = cluster.notes[0]?.stem;
  if (explicitStem === "up") note.setStemDirection(vf.Stem.UP);
  else if (explicitStem === "down") note.setStemDirection(vf.Stem.DOWN);
  else if (!isRest && defaultStemDirection) note.setStemDirection(defaultStemDirection);

  note.setStave(stave);
  note.drawLedgerLines = () => undefined;

  if (clusterDots(cluster) > 0) {
    vf.Dot.buildAndAttach([note], { all: true });
  }

  return { note, orderedNotes };
}

function beamGroups(items) {
  const groups = [];
  let active = [];

  const flush = () => {
    if (active.length >= 2) groups.push(active);
    active = [];
  };

  for (const item of items) {
    if (!item.cluster.notes.length) {
      flush();
      continue;
    }

    const status = item.cluster.notes[0]?.beams?.[1] || "";
    if (status === "begin") {
      flush();
      active = [item];
    } else if (status === "continue") {
      if (!active.length) active = [item];
      else active.push(item);
    } else if (status === "end") {
      if (!active.length) active = [item];
      else active.push(item);
      flush();
    } else {
      flush();
    }
  }

  flush();
  return groups;
}

function drawText(context, text, x, y, options = {}) {
  const value = String(text);
  context.save();
  context.setFont(options.family || "Arial", options.size || 11, options.weight || "normal");
  context.setFillStyle(options.fill || "#252a31");
  const width = context.measureText(value).width;
  let drawX = x;
  if (options.align === "right") drawX -= width;
  else if (options.align === "center") drawX -= width / 2;
  context.fillText(value, drawX, y);
  context.restore();
}

function drawLine(context, x1, y1, x2, y2, options = {}) {
  context.save();
  context.beginPath();
  context.setStrokeStyle(options.stroke || "#77808a");
  context.setLineWidth(options.width || 1.2);
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.restore();
}

function shortenSegment(x1, y1, x2, y2, startGap = CONNECTOR_GAP, endGap = CONNECTOR_GAP) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const remaining = length - startGap - endGap;

  if (!Number.isFinite(length) || length <= 0 || remaining <= 1) return null;

  const ux = dx / length;
  const uy = dy / length;
  return {
    x1: x1 + ux * startGap,
    y1: y1 + uy * startGap,
    x2: x2 - ux * endGap,
    y2: y2 - uy * endGap,
  };
}

function drawIntervalLabel(context, x, y, magnitude) {
  const text = String(magnitude);
  context.save();
  context.setFont("Arial", 9, "bold");
  const textWidth = context.measureText(text).width;
  const width = Math.max(15, textWidth + 8);
  context.setFillStyle("#ffffff");
  context.fillRect(x - width / 2, y - 10, width, 14);
  context.setFillStyle("#59616a");
  context.fillText(text, x - textWidth / 2, y + 1);
  context.restore();
}

function drawParallelConnector(context, segment, count) {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const length = Math.hypot(dx, dy);
  if (length <= 0) return;

  const nx = -dy / length;
  const ny = dx / length;
  const offsets = count === 2
    ? [-PARALLEL_CONNECTOR_OFFSET, PARALLEL_CONNECTOR_OFFSET]
    : [0];

  for (const offset of offsets) {
    drawLine(
      context,
      segment.x1 + nx * offset,
      segment.y1 + ny * offset,
      segment.x2 + nx * offset,
      segment.y2 + ny * offset,
      { stroke: "#727a84", width: 1.4 },
    );
  }
}

function drawIntervalConnector(context, segment, interval, annotate = true) {
  const magnitude = Math.abs(interval);

  if (magnitude === 2 && annotate) {
    drawParallelConnector(context, segment, 2);
    return;
  }

  drawParallelConnector(context, segment, 1);

  if (annotate && magnitude >= 3) {
    drawIntervalLabel(
      context,
      (segment.x1 + segment.x2) / 2,
      (segment.y1 + segment.y2) / 2,
      magnitude,
    );
  }
}

function measureClusters(track, measureIndex) {
  return groupByOnset(track.events.filter((event) => event.measureIndex === measureIndex));
}

function firstPitchedEvent(track, systemStart, systemEnd) {
  return track.events.find((event) =>
    event.measureIndex >= systemStart
    && event.measureIndex < systemEnd
    && event.kind === "note"
    && event.pitch,
  ) ?? null;
}

function trackClefInSystem(track, systemStart, systemEnd) {
  const event = track.events.find((candidate) =>
    candidate.measureIndex >= systemStart && candidate.measureIndex < systemEnd,
  );
  return event?.clef ?? track.clef ?? DEFAULT_CLEF;
}

function clefRank(clef) {
  if (clef.sign === "G") return 0;
  if (clef.sign === "C") return 1;
  if (clef.sign === "F") return 2;
  return 3;
}

function buildClefLanes(part, systemStart, systemEnd) {
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
    .sort((a, b) => clefRank(a.clef) - clefRank(b.clef) || a.key.localeCompare(b.key));
}

function buildVoiceMeasurePlan(
  vf,
  part,
  track,
  measureIndex,
  stave,
  context,
  laneAnchorMidi,
  options,
  pitchState,
  defaultStemDirection,
) {
  const measure = part.measures[measureIndex];
  const clusters = measureClusters(track, measureIndex);
  const tickables = [];
  const noteItems = [];
  let cursor = 0;

  for (const cluster of clusters) {
    const gap = Math.max(0, cluster.onsetInMeasure - cursor);
    tickables.push(...makeGhosts(vf, gap));

    const referenceMidi = pitchState.lastMidi ?? pitchState.fallbackMidi ?? laneAnchorMidi;
    const { note, orderedNotes } = makeVexNote(
      vf,
      cluster,
      stave,
      laneAnchorMidi,
      options.transpose,
      referenceMidi,
      defaultStemDirection,
    );
    note.setContext(context);
    tickables.push(note);
    noteItems.push({ cluster, note, orderedNotes, referenceMidi, track });

    const representative = representativeNote(cluster);
    if (representative) {
      pitchState.lastMidi = representative.pitch.midi + options.transpose;
    }

    cursor = Math.max(cursor, cluster.onsetInMeasure + clusterDuration(cluster));
  }

  tickables.push(...makeGhosts(vf, Math.max(0, measure.duration - cursor)));
  if (!tickables.length) tickables.push(...makeGhosts(vf, measure.duration || 1));
  tickables.forEach((tickable) => tickable.setContext?.(context));

  const voice = new vf.Voice(`${measure.beats}/${measure.beatType}`);
  voice.setMode(vf.VoiceMode.SOFT);
  voice.addTickables(tickables);

  return { track, measure, stave, voice, noteItems, beams: [] };
}

function systemGeometry(lane, systemStart, systemEnd, top, semitoneSpacing, transpose) {
  const events = lane.tracks.flatMap((track) => track.events.filter((event) =>
    event.measureIndex >= systemStart && event.measureIndex < systemEnd,
  ));
  const notes = events
    .filter((event) => event.kind === "note" && event.pitch)
    .sort((a, b) => a.onset - b.onset || a.pitch.midi - b.pitch.midi);
  const anchor = notes[0] ?? null;
  const anchorMidi = anchor ? anchor.pitch.midi + transpose : 60 + transpose;
  const deltas = notes.map((event) => event.pitch.midi + transpose - anchorMidi);
  const minDelta = deltas.length ? Math.min(...deltas) : 0;
  const maxDelta = deltas.length ? Math.max(...deltas) : 0;
  const span = maxDelta - minDelta;
  const pitchTop = top + 54;
  const rowHeight = Math.max(124, 102 + span * semitoneSpacing);
  const anchorY = pitchTop + maxDelta * semitoneSpacing;

  return { anchor, anchorMidi, minDelta, maxDelta, span, pitchTop, anchorY, rowHeight };
}

function plottedGeometry(item, transpose) {
  const ys = item.note.getYs();
  const beginX = item.note.getNoteHeadBeginX();
  const endX = item.note.getNoteHeadEndX();
  const centerX = (beginX + endX) / 2;

  if (!item.cluster.notes.length) {
    return {
      ...item,
      isRest: true,
      pitchMidi: item.referenceMidi,
      y: ys[0],
      ys,
      beginX,
      endX,
      centerX,
    };
  }

  const representative = representativeNote(item.cluster);
  const representativeIndex = Math.max(0, item.orderedNotes.indexOf(representative));
  return {
    ...item,
    representative,
    isRest: false,
    pitchMidi: representative.pitch.midi + transpose,
    y: ys[representativeIndex] ?? ys.at(-1),
    ys,
    beginX,
    endX,
    centerX,
  };
}

function drawChordParallelLines(context, centerX, startY, endY, count, noteWidth) {
  if (!Number.isFinite(count) || count <= 0 || endY <= startY) return;

  const usableWidth = Math.max(2, noteWidth * CHORD_PARALLEL_WIDTH_RATIO);
  const gap = usableWidth / Math.max(1, CHORD_PARALLEL_REFERENCE_LINES - 1);
  const offsets = Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * gap);

  for (const offset of offsets) {
    drawLine(context, centerX + offset, startY, centerX + offset, endY, {
      stroke: "#727a84",
      width: 1.15,
    });
  }
}

function drawChordSpine(context, item) {
  if (item.isRest || item.ys.length < 2 || item.orderedNotes.length < 2) return;

  const noteWidth = Math.max(4, item.endX - item.beginX);

  for (let index = 1; index < item.orderedNotes.length; index += 1) {
    const previousY = item.ys[index - 1];
    const currentY = item.ys[index];
    const startY = Math.min(previousY, currentY) + CHORD_GAP;
    const endY = Math.max(previousY, currentY) - CHORD_GAP;
    if (endY <= startY) continue;

    const previousPitch = item.orderedNotes[index - 1]?.pitch?.midi;
    const currentPitch = item.orderedNotes[index]?.pitch?.midi;
    const semitoneGap = Math.max(0, Math.round(Math.abs((currentPitch ?? 0) - (previousPitch ?? 0))));

    drawChordParallelLines(context, item.centerX, startY, endY, semitoneGap, noteWidth);
  }
}

function renderClefLaneSystem(context, part, lane, systemStart, systemEnd, top, options) {
  const vf = requireVexFlow();
  const geometry = systemGeometry(lane, systemStart, systemEnd, top, options.semitoneSpacing, options.transpose);
  const { anchorMidi, anchorY, rowHeight } = geometry;
  const rowBottom = top + rowHeight;
  const measureBundles = [];
  const pitchStates = new Map();

  for (const track of lane.tracks) {
    const trackAnchor = firstPitchedEvent(track, systemStart, systemEnd);
    pitchStates.set(track.key, {
      lastMidi: null,
      fallbackMidi: trackAnchor ? trackAnchor.pitch.midi + options.transpose : anchorMidi,
    });
  }

  const voiceLabel = lane.tracks.map((track) => track.voice).join(", ");
  drawText(context, `${lane.clef.label || lane.clef.sign} · voice${lane.tracks.length > 1 ? "s" : ""} ${voiceLabel}`, 18, top + 17, {
    size: 10,
    weight: "bold",
    fill: "#68717b",
  });

  for (let measureIndex = systemStart; measureIndex < systemEnd; measureIndex += 1) {
    const localIndex = measureIndex - systemStart;
    const x = options.leftMargin + localIndex * options.measureWidth;
    const measure = part.measures[measureIndex];
    if (!measure) continue;

    drawLine(context, x, top + 28, x, rowBottom - 18, { stroke: "#d6dade", width: 1 });
    drawText(context, measure.number, x + 7, top + 18, { size: 9, fill: "#969da5" });

    const spacing = options.semitoneSpacing * 2;
    const virtualStaveY = anchorY - (5 - ANCHOR_LINE) * spacing;
    const stave = new vf.Stave(x + 4, virtualStaveY, options.measureWidth - 8, {
      spacing_between_lines_px: spacing,
      space_above_staff_ln: 0,
      space_below_staff_ln: 0,
      left_bar: false,
      right_bar: false,
    });
    stave.setContext(context);
    stave.setNoteStartX(x + 11);

    const plans = lane.tracks.map((track, trackIndex) => {
      const defaultStemDirection = lane.tracks.length > 1
        ? (trackIndex % 2 === 0 ? vf.Stem.UP : vf.Stem.DOWN)
        : null;
      return buildVoiceMeasurePlan(
        vf,
        part,
        track,
        measureIndex,
        stave,
        context,
        anchorMidi,
        options,
        pitchStates.get(track.key),
        defaultStemDirection,
      );
    });

    const voices = plans.map((plan) => plan.voice);
    const formatter = new vf.Formatter();
    if (voices.length > 1) formatter.joinVoices(voices);
    formatter.formatToStave(voices, stave, { context });

    for (const plan of plans) {
      plan.beams = beamGroups(plan.noteItems).map((group) => new vf.Beam(group.map((item) => item.note), false));
      plan.beams.forEach((beam) => beam.setContext(context));
    }

    measureBundles.push({ stave, plans });
  }

  const endX = options.leftMargin + (systemEnd - systemStart) * options.measureWidth;
  drawLine(context, endX, top + 28, endX, rowBottom - 18, { stroke: "#d6dade", width: 1 });

  const plottedByTrack = new Map(lane.tracks.map((track) => [track.key, []]));
  for (const bundle of measureBundles) {
    for (const plan of bundle.plans) {
      const plotted = plan.noteItems.map((item) => plottedGeometry(item, options.transpose));
      plottedByTrack.get(plan.track.key).push(...plotted);
    }
  }

  for (const plotted of plottedByTrack.values()) {
    for (const item of plotted) drawChordSpine(context, item);

    for (let index = 1; index < plotted.length; index += 1) {
      const previous = plotted[index - 1];
      const current = plotted[index];
      const segment = shortenSegment(previous.endX, previous.y, current.beginX, current.y);
      if (!segment) continue;

      if (current.isRest) {
        drawIntervalConnector(context, segment, 0, false);
      } else {
        const interval = current.pitchMidi - previous.pitchMidi;
        drawIntervalConnector(context, segment, interval, true);
      }
    }
  }

  for (const bundle of measureBundles) {
    for (const plan of bundle.plans) {
      plan.voice.draw(context, bundle.stave);
      plan.beams.forEach((beam) => beam.draw());
    }
  }

  const drawnAnchors = new Set();
  for (const track of lane.tracks) {
    const anchor = firstPitchedEvent(track, systemStart, systemEnd);
    if (!anchor) continue;
    const plotted = plottedByTrack.get(track.key) || [];
    const anchorItem = plotted.find((item) => !item.isRest && item.cluster.notes.includes(anchor));
    if (!anchorItem) continue;

    const anchorIndex = Math.max(0, anchorItem.orderedNotes.indexOf(anchor));
    const anchorNoteY = anchorItem.ys[anchorIndex] ?? anchorItem.y;
    const anchorMidiForTrack = anchor.pitch.midi + options.transpose;
    const anchorLabel = options.transpose === 0 ? anchor.pitch.label : midiToPitchLabel(anchorMidiForTrack);
    const dedupeKey = `${Math.round(anchorItem.centerX)}:${Math.round(anchorNoteY)}:${anchorLabel}`;
    if (drawnAnchors.has(dedupeKey)) continue;
    drawnAnchors.add(dedupeKey);

    drawText(context, anchorLabel, anchorItem.centerX, anchorNoteY + 17, {
      size: 9,
      weight: "bold",
      align: "center",
      fill: "#59616a",
    });
  }

  return rowHeight;
}

function calculateLayout(score, options) {
  let top = 58;
  const rows = [];

  for (const part of score.parts) {
    top += 32;
    for (let systemStart = 0; systemStart < part.measures.length; systemStart += options.measuresPerSystem) {
      const systemEnd = Math.min(part.measures.length, systemStart + options.measuresPerSystem);
      const lanes = buildClefLanes(part, systemStart, systemEnd);
      let systemHeight = 0;

      for (const lane of lanes) {
        const geometry = systemGeometry(
          lane,
          systemStart,
          systemEnd,
          top + systemHeight,
          options.semitoneSpacing,
          options.transpose,
        );
        rows.push({ part, lane, systemStart, systemEnd, top: top + systemHeight, rowHeight: geometry.rowHeight });
        systemHeight += geometry.rowHeight + 12;
      }

      top += systemHeight + 24;
    }
    top += 12;
  }

  return { rows, height: Math.max(220, top + 20) };
}

export function renderRelativeScore(score, userOptions = {}) {
  const vf = requireVexFlow();
  const options = {
    measuresPerSystem: Math.max(1, Math.min(8, Number(userOptions.measuresPerSystem) || 4)),
    semitoneSpacing: Math.max(5, Math.min(14, Number(userOptions.semitoneSpacing) || 8)),
    transpose: Math.max(-48, Math.min(48, Number(userOptions.transpose) || 0)),
    leftMargin: 58,
    measureWidth: 190,
  };

  const width = options.leftMargin + options.measuresPerSystem * options.measureWidth + 28;
  const layout = calculateLayout(score, options);
  const host = document.createElement("div");
  const renderer = new vf.Renderer(host, vf.Renderer.Backends.SVG);
  renderer.resize(width, layout.height);
  const context = renderer.getContext();

  drawText(context, score.metadata.title || "Untitled score", 18, 27, { size: 18, weight: "bold", fill: "#17191d" });
  if (score.metadata.composer) {
    drawText(context, score.metadata.composer, 18, 45, { size: 10, fill: "#737b84" });
  }

  let previousPart = null;
  for (const row of layout.rows) {
    if (row.part !== previousPart) {
      drawText(context, row.part.name, 18, row.top - 12, { size: 12, weight: "bold", fill: "#3f464e" });
      previousPart = row.part;
    }
    renderClefLaneSystem(context, row.part, row.lane, row.systemStart, row.systemEnd, row.top, options);
  }

  const svg = host.querySelector("svg");
  if (!svg) throw new Error("VexFlow did not produce an SVG document.");
  svg.setAttribute("viewBox", `0 0 ${width} ${layout.height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${score.metadata.title || "Score"} in relative chromatic notation`);
  svg.dataset.renderer = "VexFlow 5";
  svg.dataset.clefLanes = String(layout.rows.length);
  return svg;
}
