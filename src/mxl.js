function requireJSZip(explicitImpl = null) {
  const JSZipImpl = explicitImpl || globalThis.JSZip;
  if (!JSZipImpl) {
    throw new Error("JSZip failed to load. Check the network connection and reload the page.");
  }
  return JSZipImpl;
}

function parserError(document) {
  return Array.from(document.getElementsByTagName("*")).find((node) => node.localName === "parsererror") ?? null;
}

function rootfilePath(containerXml) {
  const parser = new DOMParser();
  const document = parser.parseFromString(containerXml, "application/xml");
  const error = parserError(document);
  if (error) {
    throw new Error(`Invalid META-INF/container.xml: ${error.textContent.trim().slice(0, 180)}`);
  }

  const rootfiles = Array.from(document.getElementsByTagName("*")).filter((node) => node.localName === "rootfile");
  if (!rootfiles.length) return null;

  const preferred = rootfiles.find((node) =>
    node.getAttribute("media-type") === "application/vnd.recordare.musicxml+xml",
  ) || rootfiles.find((node) => /\.(musicxml|xml)$/i.test(node.getAttribute("full-path") || "")) || rootfiles[0];

  return preferred.getAttribute("full-path") || null;
}

function fallbackScorePath(zip) {
  return Object.keys(zip.files).find((name) =>
    !zip.files[name].dir
    && !/^META-INF\//i.test(name)
    && /\.(musicxml|xml)$/i.test(name),
  ) || null;
}

export async function extractMusicXMLFromMXL(data, explicitJSZip = null) {
  const JSZipImpl = requireJSZip(explicitJSZip);
  const zip = await JSZipImpl.loadAsync(data);

  const containerEntry = zip.file("META-INF/container.xml") || zip.file("meta-inf/container.xml");
  let scorePath = null;

  if (containerEntry) {
    const containerXml = await containerEntry.async("string");
    scorePath = rootfilePath(containerXml);
  }

  if (!scorePath) scorePath = fallbackScorePath(zip);
  if (!scorePath) {
    throw new Error("This MXL archive does not contain a MusicXML score.");
  }

  const scoreEntry = zip.file(scorePath);
  if (!scoreEntry) {
    throw new Error(`The MXL root score '${scorePath}' is missing from the archive.`);
  }

  return {
    xmlText: await scoreEntry.async("string"),
    scorePath,
  };
}
