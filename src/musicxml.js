const STEP_TO_SEMITONE = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function elements(parent, name) {
  if (!parent) return [];
  return Array.from(parent.children ?? []).filter((node) => node.localName === name);
}

function first(parent, name) {
  return elements(parent, name)[0] ?? null;
}

function text(parent, name, fallback = "") {
  return first(parent, name)?.textContent?.trim() || fallback;
}

function firstDescendant(root, name) {
  if (!root) return null;
  return Array.from(root.getElementsByTagName("*")).find((node) => node.localName === name) ?? null;
}

function integer(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function inferType(durationQuarter) {
  const candidates = [
    [4, "whole"],
    [2, "half"],
    [1, "quarter"],
    [0.5, "eighth"],
    [0.25, "16th"],
    [0.125, "32nd"],
    [0.0625, "64th"],
  ];

  let best = candidates[0];
  for (const candidate of candidates) {
    if (Math.abs(candidate[0] - durationQuarter) < Math.abs(best[0] - durationQuarter)) {
      best = candidate;
    }
  }
  return best[1];
}

function accidentalText(alter) {
  if (alter === 0) return "";
  if (alter === 1) return "#";
  if (alter === -1) return "b";
  if (alter === 2) return "##";
  if (alter === -2) return "bb";
  return alter > 0 ? `+${alter}` : `${alter}`;
}

function parsePitch(noteElement) {
  const pitch = first(noteElement, "pitch");
  if (!pitch) return null;

  const step = text(pitch, "step", "C").toUpperCase();
  const alter = number(text(pitch, "alter", "0"), 0);
  const octave = integer(text(pitch, "octave", "4"), 4);
  const semitone = STEP_TO_SEMITONE[step];

  if (semitone === undefined) return null;

  return {
    step,
    alter,
    octave,
    midi: (octave + 1) * 12 + semitone + alter,
    label: `${step}${accidentalText(alter)}${octave}`,
  };
}

function parseBeams(noteElement) {
  const result = {};
  for (const beam of elements(noteElement, "beam")) {
    const level = integer(beam.getAttribute("number") || "1", 1);
    result[level] = beam.textContent.trim().toLowerCase();
  }
  return result;
}

function parseTies(noteElement) {
  return elements(noteElement, "tie")
    .map((tie) => tie.getAttribute("type"))
    .filter(Boolean);
}

function parseMetadata(root) {
  const workTitle = firstDescendant(root, "work-title")?.textContent?.trim();
  const movementTitle = firstDescendant(root, "movement-title")?.textContent?.trim();
  const creators = Array.from(root.getElementsByTagName("*")).filter((node) => node.localName === "creator");
  const composer = creators.find((node) => node.getAttribute("type") === "composer")?.textContent?.trim() || "";

  return {
    title: workTitle || movementTitle || "Untitled score",
    composer,
  };
}

function parsePartNames(root) {
  const names = new Map();
  const scoreParts = Array.from(root.getElementsByTagName("*")).filter((node) => node.localName === "score-part");

  for (const scorePart of scoreParts) {
    const id = scorePart.getAttribute("id");
    if (!id) continue;
    names.set(id, text(scorePart, "part-name", id));
  }

  return names;
}

function durationFromContainer(container, divisions) {
  const raw = integer(text(container, "duration", "0"), 0);
  return divisions > 0 ? raw / divisions : 0;
}

export function midiToPitchLabel(midi) {
  const rounded = Math.round(midi);
  const pitchClass = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return `${SHARP_NAMES[pitchClass]}${octave}`;
}

export function parseMusicXML(xmlText) {
  const parser = new DOMParser();
  const document = parser.parseFromString(xmlText, "application/xml");
  const parserError = Array.from(document.getElementsByTagName("*")).find((node) => node.localName === "parsererror");

  if (parserError) {
    throw new Error(`Invalid XML: ${parserError.textContent.trim().slice(0, 220)}`);
  }

  const root = document.documentElement;
  if (root.localName !== "score-partwise") {
    throw new Error(`This POC currently supports score-partwise MusicXML, not <${root.localName}>.`);
  }

  const metadata = parseMetadata(root);
  const partNames = parsePartNames(root);
  const partElements = elements(root, "part");
  const parts = [];

  for (const partElement of partElements) {
    const partId = partElement.getAttribute("id") || `part-${parts.length + 1}`;
    let divisions = 1;
    let currentTime = { beats: 4, beatType: 4 };
    let measureStartQuarter = 0;
    const events = [];
    const measures = [];

    const measureElements = elements(partElement, "measure");

    for (let measureIndex = 0; measureIndex < measureElements.length; measureIndex += 1) {
      const measureElement = measureElements[measureIndex];
      const measureNumber = measureElement.getAttribute("number") || String(measureIndex + 1);
      const implicit = measureElement.getAttribute("implicit") === "yes";
      let cursorQuarter = 0;
      let maxQuarter = 0;
      let lastNoteOnsetQuarter = 0;

      for (const child of Array.from(measureElement.children)) {
        if (child.localName === "attributes") {
          const divisionsText = text(child, "divisions");
          if (divisionsText) divisions = Math.max(1, integer(divisionsText, divisions));

          const time = first(child, "time");
          if (time) {
            currentTime = {
              beats: Math.max(1, integer(text(time, "beats", String(currentTime.beats)), currentTime.beats)),
              beatType: Math.max(1, integer(text(time, "beat-type", String(currentTime.beatType)), currentTime.beatType)),
            };
          }
          continue;
        }

        if (child.localName === "backup") {
          cursorQuarter = Math.max(0, cursorQuarter - durationFromContainer(child, divisions));
          continue;
        }

        if (child.localName === "forward") {
          cursorQuarter += durationFromContainer(child, divisions);
          maxQuarter = Math.max(maxQuarter, cursorQuarter);
          continue;
        }

        if (child.localName !== "note") continue;

        const isChord = Boolean(first(child, "chord"));
        const isGrace = Boolean(first(child, "grace"));
        const isRest = Boolean(first(child, "rest"));
        const pitch = parsePitch(child);
        const durationQuarter = durationFromContainer(child, divisions);
        const onsetQuarter = isChord ? lastNoteOnsetQuarter : cursorQuarter;
        const voice = text(child, "voice", "1");
        const staff = text(child, "staff", "1");
        const noteType = text(child, "type", "") || inferType(durationQuarter || 1);
        const dots = elements(child, "dot").length;
        const stem = text(child, "stem", "auto").toLowerCase();

        if (!isChord) lastNoteOnsetQuarter = onsetQuarter;

        if (isRest || pitch) {
          events.push({
            kind: isRest ? "rest" : "note",
            pitch,
            onset: measureStartQuarter + onsetQuarter,
            onsetInMeasure: onsetQuarter,
            duration: durationQuarter,
            type: noteType,
            dots,
            beams: parseBeams(child),
            ties: parseTies(child),
            stem,
            voice,
            staff,
            measureIndex,
            measureNumber,
            chord: isChord,
            grace: isGrace,
          });
        }

        if (!isChord && !isGrace) {
          cursorQuarter += durationQuarter;
        }

        maxQuarter = Math.max(maxQuarter, onsetQuarter + durationQuarter, cursorQuarter);
      }

      const nominalDuration = currentTime.beats * (4 / currentTime.beatType);
      const measureDuration = implicit
        ? Math.max(maxQuarter, 0.25)
        : Math.max(maxQuarter, nominalDuration || 0.25);

      measures.push({
        index: measureIndex,
        number: measureNumber,
        start: measureStartQuarter,
        duration: measureDuration,
        beats: currentTime.beats,
        beatType: currentTime.beatType,
      });

      measureStartQuarter += measureDuration;
    }

    const tracksByKey = new Map();
    for (const event of events) {
      const key = `staff:${event.staff}/voice:${event.voice}`;
      if (!tracksByKey.has(key)) {
        tracksByKey.set(key, {
          key,
          staff: event.staff,
          voice: event.voice,
          events: [],
        });
      }
      tracksByKey.get(key).events.push(event);
    }

    const tracks = Array.from(tracksByKey.values())
      .map((track) => ({
        ...track,
        events: track.events.sort((a, b) => a.onset - b.onset || Number(a.chord) - Number(b.chord)),
      }))
      .sort((a, b) => Number(a.staff) - Number(b.staff) || Number(a.voice) - Number(b.voice));

    parts.push({
      id: partId,
      name: partNames.get(partId) || partId,
      measures,
      tracks,
      duration: measureStartQuarter,
    });
  }

  if (parts.length === 0) {
    throw new Error("The MusicXML file contains no <part> elements.");
  }

  return {
    metadata,
    parts,
    measureCount: Math.max(...parts.map((part) => part.measures.length)),
  };
}
