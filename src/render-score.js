import { renderRelativeScore as renderCore } from "./render.js";

const CONTINUITY_STEP = 0.125;

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
      // reuses the absolute onset only for event ordering/chord grouping and a
      // provisional silence-based phrase heuristic. Compressing that auxiliary
      // timeline keeps ordering/chords intact but prevents ordinary rests from
      // being mistaken for a new melodic phrase.
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
  svg.dataset.sourceParts = String(score?.parts?.length || 0);
  svg.dataset.partGrouping = score?.parts?.length > 1 ? "simultaneous" : "native";
  svg.dataset.phraseGrouping = "first-entry-only";
  return svg;
}
