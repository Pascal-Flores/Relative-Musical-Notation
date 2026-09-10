import { midiToPitchLabel } from "./musicxml.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement(name, attributes = {}, text = null) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue;
    element.setAttribute(key, String(value));
  }
  if (text !== null) element.textContent = text;
  return element;
}

function append(parent, name, attributes = {}, text = null) {
  const node = svgElement(name, attributes, text);
  parent.append(node);
  return node;
}

function groupByOnset(events) {
  const sorted = [...events].sort((a, b) => a.onset - b.onset || Number(a.chord) - Number(b.chord));
  const clusters = [];

  for (const event of sorted) {
    const last = clusters.at(-1);
    if (!last || Math.abs(last.onset - event.onset) > 1e-7) {
      clusters.push({ onset: event.onset, events: [event] });
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

function noteType(cluster) {
  return cluster.notes[0]?.type || cluster.rests[0]?.type || "quarter";
}

function noteDots(cluster) {
  return cluster.notes[0]?.dots || cluster.rests[0]?.dots || 0;
}

function flagCount(type) {
  return {
    eighth: 1,
    "16th": 2,
    "32nd": 3,
    "64th": 4,
  }[type] || 0;
}

function isHollow(type) {
  return type === "whole" || type === "half" || type === "breve";
}

function hasStem(type) {
  return type !== "whole" && type !== "breve";
}

function clusterBeamStatus(cluster, level) {
  return cluster.notes[0]?.beams?.[level] || "";
}

function clusterMaxBeamLevel(cluster) {
  const keys = Object.keys(cluster.notes[0]?.beams || {}).map(Number).filter(Number.isFinite);
  return keys.length ? Math.max(...keys) : 0;
}

function makeText(parent, x, y, value, extra = {}) {
  return append(parent, "text", {
    x,
    y,
    "font-family": "Inter, ui-sans-serif, system-ui, sans-serif",
    "font-size": 12,
    fill: "#252a31",
    ...extra,
  }, value);
}

function drawIntervalLabel(parent, x, y, interval) {
  const label = interval > 0 ? `+${interval}` : String(interval);
  const width = Math.max(22, 9 + label.length * 7);

  append(parent, "rect", {
    x: x - width / 2,
    y: y - 10,
    width,
    height: 16,
    rx: 5,
    fill: "#ffffff",
    "fill-opacity": 0.94,
  });

  makeText(parent, x, y + 2, label, {
    "text-anchor": "middle",
    "font-size": 10,
    "font-weight": 650,
    fill: "#555e68",
  });
}

function drawRest(parent, x, y, type, dots = 0) {
  const group = append(parent, "g", { "aria-label": `${type} rest` });

  if (type === "whole" || type === "breve") {
    append(group, "rect", { x: x - 7, y: y - 2, width: 14, height: 5, rx: 0.6, fill: "#17191d" });
  } else if (type === "half") {
    append(group, "rect", { x: x - 7, y: y - 5, width: 14, height: 5, rx: 0.6, fill: "#17191d" });
  } else if (type === "quarter") {
    append(group, "path", {
      d: `M ${x - 2} ${y - 16} L ${x + 5} ${y - 8} L ${x - 2} ${y} L ${x + 5} ${y + 7} L ${x} ${y + 16}`,
      fill: "none",
      stroke: "#17191d",
      "stroke-width": 3.2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
  } else {
    const flags = Math.max(1, flagCount(type));
    append(group, "line", {
      x1: x + 3,
      y1: y - 16,
      x2: x - 1,
      y2: y + 15,
      stroke: "#17191d",
      "stroke-width": 2,
    });
    for (let i = 0; i < flags; i += 1) {
      const hookY = y - 10 + i * 8;
      append(group, "circle", { cx: x + 4, cy: hookY, r: 3.5, fill: "#17191d" });
      append(group, "path", {
        d: `M ${x + 4} ${hookY} Q ${x + 12} ${hookY + 3}, ${x + 8} ${hookY + 10}`,
        fill: "none",
        stroke: "#17191d",
        "stroke-width": 2,
        "stroke-linecap": "round",
      });
    }
  }

  for (let i = 0; i < dots; i += 1) {
    append(group, "circle", { cx: x + 11 + i * 6, cy: y - 1, r: 1.8, fill: "#17191d" });
  }
}

function drawFlag(parent, x, stemEndY, direction, index) {
  const offset = index * 7 * (direction === "up" ? 1 : -1);
  if (direction === "up") {
    append(parent, "path", {
      d: `M ${x} ${stemEndY + offset} Q ${x + 13} ${stemEndY + 4 + offset}, ${x + 9} ${stemEndY + 16 + offset}`,
      fill: "none",
      stroke: "#17191d",
      "stroke-width": 3,
      "stroke-linecap": "round",
    });
  } else {
    append(parent, "path", {
      d: `M ${x} ${stemEndY + offset} Q ${x - 13} ${stemEndY - 4 + offset}, ${x - 9} ${stemEndY - 16 + offset}`,
      fill: "none",
      stroke: "#17191d",
      "stroke-width": 3,
      "stroke-linecap": "round",
    });
  }
}

function drawNoteCluster(parent, cluster, x, yForMidi, transpose) {
  if (!cluster.notes.length) return;

  const type = noteType(cluster);
  const dots = noteDots(cluster);
  const noteYs = cluster.notes.map((note) => yForMidi(note.pitch.midi + transpose));
  const direction = cluster.beam?.direction || (cluster.notes[0]?.stem === "down" ? "down" : "up");
  const stemX = direction === "up" ? x + 5 : x - 5;

  if (noteYs.length > 1) {
    append(parent, "line", {
      x1: x,
      y1: Math.min(...noteYs),
      x2: x,
      y2: Math.max(...noteYs),
      stroke: "#90969e",
      "stroke-width": 1,
    });
  }

  for (const y of noteYs) {
    append(parent, "ellipse", {
      cx: x,
      cy: y,
      rx: 6,
      ry: 4.2,
      transform: `rotate(-18 ${x} ${y})`,
      fill: isHollow(type) ? "#ffffff" : "#17191d",
      stroke: "#17191d",
      "stroke-width": isHollow(type) ? 1.8 : 1,
    });

    for (let i = 0; i < dots; i += 1) {
      append(parent, "circle", { cx: x + 10 + i * 6, cy: y - 1, r: 1.8, fill: "#17191d" });
    }
  }

  if (!hasStem(type)) return;

  const stemStartY = direction === "up" ? Math.max(...noteYs) : Math.min(...noteYs);
  const defaultEndY = direction === "up" ? Math.min(...noteYs) - 28 : Math.max(...noteYs) + 28;
  const stemEndY = cluster.beam?.y ?? defaultEndY;

  append(parent, "line", {
    x1: stemX,
    y1: stemStartY,
    x2: stemX,
    y2: stemEndY,
    stroke: "#17191d",
    "stroke-width": 1.7,
  });

  if (!cluster.beam) {
    const count = flagCount(type);
    for (let i = 0; i < count; i += 1) drawFlag(parent, stemX, stemEndY, direction, i);
  }
}

function prepareAndDrawBeams(parent, pitchedClusters, yForMidi, transpose) {
  let active = [];
  const groups = [];

  const finish = () => {
    if (active.length >= 2) groups.push(active);
    active = [];
  };

  for (const cluster of pitchedClusters) {
    const status = clusterBeamStatus(cluster, 1);
    if (status === "begin") {
      finish();
      active = [cluster];
    } else if (status === "continue") {
      if (!active.length) active = [cluster];
      else active.push(cluster);
    } else if (status === "end") {
      if (!active.length) active = [cluster];
      else active.push(cluster);
      finish();
    } else if (active.length) {
      finish();
    }
  }
  finish();

  for (const group of groups) {
    const allYs = group.flatMap((cluster) => cluster.notes.map((note) => yForMidi(note.pitch.midi + transpose)));
    const beamY = Math.min(...allYs) - 31;

    for (const cluster of group) {
      cluster.beam = { y: beamY, direction: "up" };
    }

    const firstX = group[0].x + 5;
    const lastX = group.at(-1).x + 5;
    append(parent, "line", {
      x1: firstX,
      y1: beamY,
      x2: lastX,
      y2: beamY,
      stroke: "#17191d",
      "stroke-width": 5,
      "stroke-linecap": "butt",
    });

    const maxLevel = Math.max(...group.map(clusterMaxBeamLevel));
    for (let level = 2; level <= maxLevel; level += 1) {
      let levelStart = null;
      const levelY = beamY + (level - 1) * 7;

      const drawSegment = (startCluster, endCluster) => {
        append(parent, "line", {
          x1: startCluster.x + 5,
          y1: levelY,
          x2: endCluster.x + 5,
          y2: levelY,
          stroke: "#17191d",
          "stroke-width": 4.2,
          "stroke-linecap": "butt",
        });
      };

      for (const cluster of group) {
        const status = clusterBeamStatus(cluster, level);

        if (status === "begin") {
          levelStart = cluster;
        } else if (status === "continue") {
          if (!levelStart) levelStart = cluster;
        } else if (status === "end") {
          if (levelStart) drawSegment(levelStart, cluster);
          else drawSegment({ x: cluster.x - 13 }, cluster);
          levelStart = null;
        } else if (status === "forward hook") {
          drawSegment(cluster, { x: cluster.x + 13 });
        } else if (status === "backward hook") {
          drawSegment({ x: cluster.x - 13 }, cluster);
        } else if (levelStart) {
          drawSegment(levelStart, cluster);
          levelStart = null;
        }
      }

      if (levelStart) drawSegment(levelStart, { x: levelStart.x + 13 });
    }
  }
}

function renderTrackSystem(parent, part, track, systemStart, systemEnd, top, options) {
  const {
    measuresPerSystem,
    semitoneSpacing,
    transpose,
    showIntervals,
    leftMargin,
    measureWidth,
  } = options;

  const systemEvents = track.events.filter((event) => event.measureIndex >= systemStart && event.measureIndex < systemEnd);
  const clusters = groupByOnset(systemEvents);
  const allNotes = clusters.flatMap((cluster) => cluster.notes);
  const anchorNote = allNotes[0] ?? null;
  const anchorMidi = anchorNote ? anchorNote.pitch.midi + transpose : 60 + transpose;
  const deltas = allNotes.map((note) => note.pitch.midi + transpose - anchorMidi);
  const minDelta = deltas.length ? Math.min(...deltas) : 0;
  const maxDelta = deltas.length ? Math.max(...deltas) : 0;
  const span = maxDelta - minDelta;
  const rowHeight = Math.max(96, 80 + span * semitoneSpacing);
  const pitchTop = top + 39;
  const yForMidi = (midi) => pitchTop + (maxDelta - (midi - anchorMidi)) * semitoneSpacing;
  const anchorY = yForMidi(anchorMidi);
  const rowBottom = top + rowHeight;

  makeText(parent, 16, top + 18, `staff ${track.staff} · voice ${track.voice}`, {
    "font-size": 11,
    "font-weight": 650,
    fill: "#646c76",
  });

  if (anchorNote) {
    const anchorLabel = transpose === 0 ? anchorNote.pitch.label : midiToPitchLabel(anchorMidi);
    makeText(parent, leftMargin - 12, anchorY + 4, anchorLabel, {
      "text-anchor": "end",
      "font-size": 13,
      "font-weight": 750,
      fill: "#17191d",
    });
    makeText(parent, leftMargin - 12, anchorY - 11, "start", {
      "text-anchor": "end",
      "font-size": 9,
      fill: "#90969e",
    });
  }

  for (let measureIndex = systemStart; measureIndex < systemEnd; measureIndex += 1) {
    const localIndex = measureIndex - systemStart;
    const measure = part.measures[measureIndex];
    if (!measure) continue;
    const x = leftMargin + localIndex * measureWidth;

    append(parent, "line", {
      x1: x,
      y1: top + 27,
      x2: x,
      y2: rowBottom - 18,
      stroke: "#d7dade",
      "stroke-width": 1,
    });

    makeText(parent, x + 7, top + 17, measure.number, {
      "font-size": 9,
      fill: "#9aa0a8",
    });
  }

  const endingX = leftMargin + (systemEnd - systemStart) * measureWidth;
  append(parent, "line", {
    x1: endingX,
    y1: top + 27,
    x2: endingX,
    y2: rowBottom - 18,
    stroke: "#d7dade",
    "stroke-width": 1,
  });

  function xForCluster(cluster) {
    const event = cluster.events[0];
    const measure = part.measures[event.measureIndex];
    const localMeasure = event.measureIndex - systemStart;
    const innerPadding = 22;
    const usable = measureWidth - innerPadding * 2;
    const localQuarter = Math.max(0, event.onset - measure.start);
    const ratio = measure.duration > 0 ? Math.min(1, localQuarter / measure.duration) : 0;
    return leftMargin + localMeasure * measureWidth + innerPadding + usable * ratio;
  }

  for (const cluster of clusters) cluster.x = xForCluster(cluster);

  let previous = null;
  for (const cluster of clusters) {
    if (!cluster.notes.length) {
      if (cluster.rests.length) previous = null;
      continue;
    }

    const currentRepresentative = representativeNote(cluster);
    if (previous && currentRepresentative) {
      const previousRepresentative = representativeNote(previous);
      const x1 = previous.x;
      const y1 = yForMidi(previousRepresentative.pitch.midi + transpose);
      const x2 = cluster.x;
      const y2 = yForMidi(currentRepresentative.pitch.midi + transpose);

      append(parent, "line", {
        x1,
        y1,
        x2,
        y2,
        stroke: "#7d858f",
        "stroke-width": 1.45,
        "stroke-linecap": "round",
      });

      if (showIntervals) {
        const interval = Math.round(currentRepresentative.pitch.midi - previousRepresentative.pitch.midi);
        drawIntervalLabel(parent, (x1 + x2) / 2, (y1 + y2) / 2, interval);
      }
    }
    previous = cluster;
  }

  const pitchedClusters = clusters.filter((cluster) => cluster.notes.length);
  prepareAndDrawBeams(parent, pitchedClusters, yForMidi, transpose);

  for (const cluster of clusters) {
    if (cluster.notes.length) {
      drawNoteCluster(parent, cluster, cluster.x, yForMidi, transpose);
    } else if (cluster.rests.length) {
      drawRest(parent, cluster.x, anchorY, noteType(cluster), noteDots(cluster));
    }
  }

  return rowHeight;
}

export function renderRelativeScore(score, settings = {}) {
  const options = {
    measuresPerSystem: Math.max(1, Number(settings.measuresPerSystem) || 4),
    semitoneSpacing: Math.max(4, Number(settings.semitoneSpacing) || 8),
    transpose: Number(settings.transpose) || 0,
    showIntervals: settings.showIntervals !== false,
    leftMargin: 118,
    measureWidth: 205,
  };

  const maxColumns = Math.max(1, Math.min(options.measuresPerSystem, score.measureCount));
  const width = options.leftMargin + maxColumns * options.measureWidth + 30;
  const svg = svgElement("svg", {
    xmlns: SVG_NS,
    viewBox: `0 0 ${width} 100`,
    width,
    role: "img",
    "aria-label": `Relative notation for ${score.metadata.title}`,
  });

  append(svg, "rect", { x: 0, y: 0, width: "100%", height: "100%", fill: "#ffffff" });
  makeText(svg, 18, 28, score.metadata.title, { "font-size": 19, "font-weight": 760, fill: "#17191d" });
  if (score.metadata.composer) {
    makeText(svg, 18, 48, score.metadata.composer, { "font-size": 11, fill: "#737b85" });
  }

  let cursorY = score.metadata.composer ? 70 : 56;

  for (const part of score.parts) {
    makeText(svg, 18, cursorY + 18, part.name, { "font-size": 14, "font-weight": 760, fill: "#30353b" });
    cursorY += 31;

    const systemCount = Math.max(1, Math.ceil(part.measures.length / options.measuresPerSystem));

    for (let system = 0; system < systemCount; system += 1) {
      const systemStart = system * options.measuresPerSystem;
      const systemEnd = Math.min(part.measures.length, systemStart + options.measuresPerSystem);

      for (const track of part.tracks) {
        const rowHeight = renderTrackSystem(svg, part, track, systemStart, systemEnd, cursorY, options);
        cursorY += rowHeight + 12;
      }

      cursorY += 13;
    }

    cursorY += 14;
  }

  const height = Math.max(220, cursorY + 18);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("height", String(height));
  return svg;
}
