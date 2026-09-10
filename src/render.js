import { midiToPitchLabel } from "./musicxml.js";

const ANCHOR_LINE = 2.5;

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

function makeVexNote(vf, cluster, stave, anchorMidi, transpose, referenceMidi) {
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

function drawIntervalLabel(context, x, y, interval) {
  const text = String(Math.abs(interval));
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

function measureClusters(track, measureIndex) {
  return groupByOnset(track.events.filter((event) => event.measureIndex === measureIndex));
}

function measurePlan(part, track, measureIndex, stave, context, anchorMidi, options, pitchState) {
  const vf = requireVexFlow();
  const measure = part.measures[measureIndex];
  const clusters = measureClusters(track, measureIndex);
  const tickables = [];
  const noteItems = [];
  let cursor = 0;

  for (const cluster of clusters) {
    const gap = Math.max(0, cluster.onsetInMeasure - cursor);
    tickables.push(...makeGhosts(vf, gap));

    // A rest has no pitch of its own. Place it at the last sounded pitch so the
    // relative contour remains readable through silence. Before the first note,
    // fall back to this system's anchor pitch.
    const referenceMidi = pitchState.lastMidi ?? anchorMidi;
    const { note, orderedNotes } = makeVexNote(
      vf,
      cluster,
      stave,
      anchorMidi,
      options.transpose,
      referenceMidi,
    );
    note.setContext(context);
    tickables.push(note);
    noteItems.push({ cluster, note, orderedNotes, referenceMidi });

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
  new vf.Formatter().joinVoices([voice]).formatToStave([voice], stave, { context });

  const beams = beamGroups(noteItems).map((group) => new vf.Beam(group.map((item) => item.note), false));
  beams.forEach((beam) => beam.setContext(context));

  return { measure, stave, voice, beams, noteItems };
}

function systemGeometry(part, track, systemStart, systemEnd, top, semitoneSpacing, transpose) {
  const events = track.events.filter((event) => event.measureIndex >= systemStart && event.measureIndex < systemEnd);
  const notes = events.filter((event) => event.kind === "note" && event.pitch);
  const anchor = notes[0] ?? null;
  const anchorMidi = anchor ? anchor.pitch.midi + transpose : 60 + transpose;
  const deltas = notes.map((event) => event.pitch.midi + transpose - anchorMidi);
  const minDelta = deltas.length ? Math.min(...deltas) : 0;
  const maxDelta = deltas.length ? Math.max(...deltas) : 0;
  const span = maxDelta - minDelta;
  const pitchTop = top + 54;
  const rowHeight = Math.max(118, 96 + span * semitoneSpacing);
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

function renderTrackSystem(context, part, track, systemStart, systemEnd, top, options) {
  const vf = requireVexFlow();
  const geometry = systemGeometry(part, track, systemStart, systemEnd, top, options.semitoneSpacing, options.transpose);
  const { anchor, anchorMidi, anchorY, rowHeight } = geometry;
  const rowBottom = top + rowHeight;
  const plans = [];
  const pitchState = { lastMidi: null };

  drawText(context, `staff ${track.staff} · voice ${track.voice}`, 18, top + 17, {
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

    plans.push(measurePlan(part, track, measureIndex, stave, context, anchorMidi, options, pitchState));
  }

  const endX = options.leftMargin + (systemEnd - systemStart) * options.measureWidth;
  drawLine(context, endX, top + 28, endX, rowBottom - 18, { stroke: "#d6dade", width: 1 });

  const plotted = plans.flatMap((plan) => plan.noteItems.map((item) => plottedGeometry(item, options.transpose)));

  // Chords are simultaneous vertical pitch structures. Draw their interval spine
  // behind the noteheads rather than treating them as a single floating point.
  for (const item of plotted) {
    if (item.isRest || item.ys.length < 2) continue;
    drawLine(context, item.centerX, Math.min(...item.ys), item.centerX, Math.max(...item.ys), {
      stroke: "#727a84",
      width: 1.4,
    });
  }

  // Connect the actual VexFlow notehead / rest glyph edges. Rests retain the
  // previous sounded pitch, so the contour stays horizontal through silence and
  // the next leap is still measured from the last played note.
  for (let index = 1; index < plotted.length; index += 1) {
    const previous = plotted[index - 1];
    const current = plotted[index];
    drawLine(context, previous.endX, previous.y, current.beginX, current.y, {
      stroke: "#727a84",
      width: 1.4,
    });

    if (!current.isRest) {
      const interval = current.pitchMidi - previous.pitchMidi;
      if (Math.abs(interval) >= options.minIntervalLabel) {
        drawIntervalLabel(
          context,
          (previous.endX + current.beginX) / 2,
          (previous.y + current.y) / 2,
          interval,
        );
      }
    }
  }

  for (const plan of plans) {
    plan.voice.draw(context, plan.stave);
    plan.beams.forEach((beam) => beam.draw());
  }

  // Absolute pitch is a local anchor, not a margin label. Put it directly under
  // the note it refers to so the same convention can later be used for phrase or
  // section re-anchors anywhere in a line.
  if (anchor) {
    const anchorItem = plotted.find((item) => !item.isRest && item.cluster.notes.includes(anchor));
    if (anchorItem) {
      const anchorIndex = Math.max(0, anchorItem.orderedNotes.indexOf(anchor));
      const anchorNoteY = anchorItem.ys[anchorIndex] ?? anchorItem.y;
      const anchorLabel = options.transpose === 0 ? anchor.pitch.label : midiToPitchLabel(anchorMidi);
      drawText(context, anchorLabel, anchorItem.centerX, anchorNoteY + 17, {
        size: 9,
        weight: "bold",
        align: "center",
        fill: "#59616a",
      });
    }
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
      let systemHeight = 0;
      for (const track of part.tracks) {
        const geometry = systemGeometry(part, track, systemStart, systemEnd, top + systemHeight, options.semitoneSpacing, options.transpose);
        rows.push({ part, track, systemStart, systemEnd, top: top + systemHeight, rowHeight: geometry.rowHeight });
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
    minIntervalLabel: Math.max(1, Math.min(12, Number(userOptions.minIntervalLabel) || 3)),
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
    renderTrackSystem(context, row.part, row.track, row.systemStart, row.systemEnd, row.top, options);
  }

  const svg = host.querySelector("svg");
  if (!svg) throw new Error("VexFlow did not produce an SVG document.");
  svg.setAttribute("viewBox", `0 0 ${width} ${layout.height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${score.metadata.title || "Score"} in relative chromatic notation`);
  svg.dataset.renderer = "VexFlow 5";
  return svg;
}
