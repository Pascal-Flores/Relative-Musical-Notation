const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 12;
const PAGE_FOOTER_RESERVE_MM = 6;
const SEPARATOR_STROKE = "#bfc5cb";

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
  const separators = systemSeparatorYs(svg, metrics.width)
    .filter((y) => y > metrics.y + 1 && y < metrics.y + metrics.height - 1);
  const bottom = metrics.y + metrics.height;
  const bands = [];
  let start = metrics.y;

  while (bottom - start > maxBandHeight + 0.5) {
    const limit = start + maxBandHeight;
    const candidates = separators.filter((y) => y > start + 1 && y <= limit + 0.5);
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
  };
}

function cloneSvgBand(svg, band, metrics) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("viewBox", `${metrics.x} ${band.start} ${metrics.width} ${band.height}`);
  clone.setAttribute("width", String(metrics.width));
  clone.setAttribute("height", String(band.height));
  clone.setAttribute("preserveAspectRatio", "xMinYMin meet");
  clone.removeAttribute("aria-label");
  clone.dataset.pdfBandStart = String(band.start);
  clone.dataset.pdfBandEnd = String(band.end);
  return clone;
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
  if (typeof jsPDF.API?.svg !== "function") {
    throw new Error("svg2pdf.js failed to load. Check the network connection and reload the page.");
  }
  return jsPDF;
}

export async function downloadRelativeScorePdf(svg, filename = "score-relative.pdf") {
  const jsPDF = requirePdfRenderer();
  const layout = computePdfPageBands(svg);
  const printableWidthMm = PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2;
  const scale = printableWidthMm / layout.metrics.width;
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
    const pageSvg = cloneSvgBand(svg, band, layout.metrics);
    const renderedHeightMm = band.height * scale;

    await document.svg(pageSvg, {
      x: PAGE_MARGIN_MM,
      y: PAGE_MARGIN_MM,
      width: printableWidthMm,
      height: renderedHeightMm,
    });

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
