const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 12;
const PAGE_FOOTER_RESERVE_MM = 6;
const PAGE_BREAK_AFTER_SEPARATOR = 12;
const PDF_DPI = 300;
const SEPARATOR_STROKE = "#bfc5cb";

const EXPORT_FONTS = [
  {
    family: "Bravura",
    url: "https://cdn.jsdelivr.net/npm/@vexflow-fonts/bravura@1.0.2/bravura.woff2",
  },
  {
    family: "Academico",
    url: "https://cdn.jsdelivr.net/npm/@vexflow-fonts/academico@1.0.1/academico.woff2",
  },
];

let exportFontCssPromise = null;

function parseNumber(value, fallback = 0) {
  const number = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(number) ? number : fallback;
}

function svgMetrics(svg) {
  const viewBox = (svg.getAttribute("viewBox") || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);

  if (viewBox.length === 4 && viewBox.every(Number.isFinite)) {
    return {
      x: viewBox[0],
      y: viewBox[1],
      width: viewBox[2],
      height: viewBox[3],
    };
  }

  return {
    x: 0,
    y: 0,
    width: parseNumber(svg.getAttribute("width"), 846),
    height: parseNumber(svg.getAttribute("height"), 1100),
  };
}

function pathCoordinates(path) {
  const numbers = (path.getAttribute("d") || "").match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (numbers.length < 4) return null;
  const [x1, y1, x2, y2] = numbers;
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return { x1, y1, x2, y2 };
}

function systemSeparatorYs(svg, width) {
  const separators = [];

  for (const path of svg.querySelectorAll(`path[stroke="${SEPARATOR_STROKE}"]`)) {
    const points = pathCoordinates(path);
    if (!points) continue;
    if (Math.abs(points.y1 - points.y2) > 0.5) continue;
    if (Math.abs(points.x2 - points.x1) < width * 0.7) continue;
    separators.push((points.y1 + points.y2) / 2);
  }

  return [...new Set(separators.map((value) => Math.round(value * 100) / 100))]
    .sort((a, b) => a - b);
}

export function computePdfPageBands(svg) {
  const metrics = svgMetrics(svg);
  const printableWidthMm = PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2;
  const printableHeightMm = PAGE_HEIGHT_MM - PAGE_MARGIN_MM * 2 - PAGE_FOOTER_RESERVE_MM;
  const maxBandHeight = metrics.width * (printableHeightMm / printableWidthMm);
  const bottom = metrics.y + metrics.height;
  const pageBreaks = systemSeparatorYs(svg, metrics.width)
    .map((y) => Math.min(y + PAGE_BREAK_AFTER_SEPARATOR, bottom))
    .filter((y) => y > metrics.y + 1 && y < bottom - 1);
  const bands = [];
  let start = metrics.y;

  while (bottom - start > maxBandHeight + 0.5) {
    const limit = start + maxBandHeight;
    const candidates = pageBreaks.filter((y) => y > start + 1 && y <= limit + 0.5);
    const end = candidates.length ? candidates.at(-1) : limit;

    if (!(end > start + 1)) break;
    bands.push({ start, end, height: end - start });
    start = end;
  }

  if (bottom > start + 1) {
    bands.push({ start, end: bottom, height: bottom - start });
  }

  if (!bands.length) {
    bands.push({ start: metrics.y, end: bottom, height: metrics.height });
  }

  return {
    bands,
    metrics,
    pageWidthMm: PAGE_WIDTH_MM,
    pageHeightMm: PAGE_HEIGHT_MM,
    marginMm: PAGE_MARGIN_MM,
    footerReserveMm: PAGE_FOOTER_RESERVE_MM,
    pageBreakAfterSeparator: PAGE_BREAK_AFTER_SEPARATOR,
  };
}

function normalizeSvgDimensions(svg, width, height) {
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.style.removeProperty("width");
  svg.style.removeProperty("height");
  if (!(svg.getAttribute("style") || "").trim()) svg.removeAttribute("style");
}

function cloneSvgBand(svg, band, metrics) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("viewBox", `${metrics.x} ${band.start} ${metrics.width} ${band.height}`);
  normalizeSvgDimensions(clone, metrics.width, band.height);
  clone.setAttribute("preserveAspectRatio", "xMinYMin meet");
  clone.removeAttribute("aria-label");
  clone.dataset.pdfBandStart = String(band.start);
  clone.dataset.pdfBandEnd = String(band.end);
  return clone;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

async function loadExportFontCss() {
  if (!exportFontCssPromise) {
    exportFontCssPromise = Promise.all(EXPORT_FONTS.map(async ({ family, url }) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Unable to load ${family} export font (${response.status}).`);
      }
      const base64 = arrayBufferToBase64(await response.arrayBuffer());
      return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${base64}) format('woff2');font-style:normal;font-weight:normal;font-display:block;}`;
    }))
      .then((rules) => rules.join("\n"))
      .catch((error) => {
        exportFontCssPromise = null;
        throw error;
      });
  }

  return exportFontCssPromise;
}

export async function createStandaloneSvg(svg) {
  const metrics = svgMetrics(svg);
  const clone = svg.cloneNode(true);
  normalizeSvgDimensions(clone, metrics.width, metrics.height);
  clone.setAttribute("viewBox", `${metrics.x} ${metrics.y} ${metrics.width} ${metrics.height}`);
  clone.setAttribute("preserveAspectRatio", "xMinYMin meet");

  for (const previousStyle of clone.querySelectorAll('style[data-export-fonts="embedded"]')) {
    previousStyle.remove();
  }

  const style = clone.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "style");
  style.setAttribute("data-export-fonts", "embedded");
  style.textContent = await loadExportFontCss();
  clone.insertBefore(style, clone.firstChild);
  clone.dataset.exportFormat = "standalone-svg";
  return clone;
}

function serializeSvg(svg) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadRelativeScoreSvg(svg, filename = "score-relative.svg") {
  const standalone = await createStandaloneSvg(svg);
  saveBlob(new Blob([serializeSvg(standalone)], { type: "image/svg+xml;charset=utf-8" }), filename);
  return standalone;
}

export function createPagedPreview(svg) {
  const layout = computePdfPageBands(svg);
  const wrapper = document.createElement("div");
  wrapper.className = "pdf-pages";
  wrapper.dataset.pageCount = String(layout.bands.length);

  layout.bands.forEach((band, index) => {
    const page = document.createElement("section");
    page.className = "pdf-page";
    page.setAttribute("aria-label", `Page ${index + 1} of ${layout.bands.length}`);

    const content = document.createElement("div");
    content.className = "pdf-page-content";
    const pageSvg = cloneSvgBand(svg, band, layout.metrics);
    pageSvg.classList.add("pdf-page-svg");
    content.append(pageSvg);

    const pageNumber = document.createElement("span");
    pageNumber.className = "pdf-page-number";
    pageNumber.textContent = `${index + 1} / ${layout.bands.length}`;

    page.append(content, pageNumber);
    wrapper.append(page);
  });

  return { element: wrapper, pageCount: layout.bands.length, layout };
}

function requirePdfRenderer() {
  const jsPDF = globalThis.jspdf?.jsPDF;
  if (!jsPDF) {
    throw new Error("jsPDF failed to load. Check the network connection and reload the page.");
  }
  return jsPDF;
}

async function rasterizeSvg(svg, targetWidthPx) {
  const metrics = svgMetrics(svg);
  const targetHeightPx = Math.max(1, Math.ceil(targetWidthPx * (metrics.height / metrics.width)));
  const source = serializeSvg(svg);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Unable to rasterize the standalone SVG for PDF export."));
      element.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = targetWidthPx;
    canvas.height = targetHeightPx;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable; PDF export cannot continue.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadRelativeScorePdf(svg, filename = "score-relative.pdf") {
  const jsPDF = requirePdfRenderer();
  const standalone = await createStandaloneSvg(svg);
  const layout = computePdfPageBands(standalone);
  const printableWidthMm = PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2;
  const scale = printableWidthMm / layout.metrics.width;
  const targetWidthPx = Math.round((printableWidthMm / 25.4) * PDF_DPI);
  const document = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  document.setProperties({
    title: filename.replace(/\.pdf$/i, ""),
    subject: "Relative chromatic music notation",
    creator: "Relative Musical Notation POC",
  });

  for (let index = 0; index < layout.bands.length; index += 1) {
    if (index > 0) document.addPage("a4", "portrait");

    const band = layout.bands[index];
    const pageSvg = cloneSvgBand(standalone, band, layout.metrics);
    const renderedHeightMm = band.height * scale;
    const png = await rasterizeSvg(pageSvg, targetWidthPx);

    document.addImage(
      png,
      "PNG",
      PAGE_MARGIN_MM,
      PAGE_MARGIN_MM,
      printableWidthMm,
      renderedHeightMm,
      undefined,
      "FAST",
    );

    document.setFont("helvetica", "normal");
    document.setFontSize(7);
    document.setTextColor(110);
    document.text(
      `${index + 1} / ${layout.bands.length}`,
      PAGE_WIDTH_MM - PAGE_MARGIN_MM,
      PAGE_HEIGHT_MM - 5,
      { align: "right" },
    );
  }

  document.save(filename);
  return layout.bands.length;
}
