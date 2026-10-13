// Turns an HTML document (a 794 px wide root element) into an A4 PDF with
// exactly as many pages as its content needs.
//
// html2pdf decides the page breaks itself, and its page height in CSS px
// depends on unit conversions and rounding: a document one page tall could
// come out with an extra, nearly empty page. Here the page count is
// decided first, the root is sized to that many whole pages, and the
// canvas is cut into equal slices, one per A4 page.

/** A4 at 96 dpi, in CSS px. */
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;

/**
 * Pages a document of `contentHeight` px needs. A few px over a page are
 * ignored (they are the bottom margin), so rounding never adds a page.
 */
export function pageCount(contentHeight: number, pageHeight = PAGE_HEIGHT, tolerance = 8): number {
  return Math.max(1, Math.ceil((contentHeight - tolerance) / pageHeight));
}

async function imagesReady(el: HTMLElement) {
  await Promise.all(
    Array.from(el.querySelectorAll("img")).map((img) =>
      img.complete && img.naturalWidth ? Promise.resolve() : img.decode().catch(() => undefined)
    )
  );
}

/** Renders `html` (whose first element is the page root) to an A4 PDF Blob. */
export async function renderHtmlToPdf(html: string, opts: { scale?: number; quality?: number } = {}): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const scale = opts.scale ?? 2;

  // Mount off-screen to measure and capture it at its real size.
  const host = document.createElement("div");
  host.style.cssText = `position:fixed; left:-10000px; top:0; width:${PAGE_WIDTH}px;`;
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    const root = host.firstElementChild as HTMLElement;
    await imagesReady(root);
    root.style.minHeight = "0";
    const pages = pageCount(root.scrollHeight);
    const height = pages * PAGE_HEIGHT;
    root.style.height = `${height}px`;
    root.style.overflow = "hidden";

    const canvas = await html2canvas(root, {
      scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: PAGE_WIDTH,
      height,
      windowWidth: PAGE_WIDTH,
    });

    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = Math.round(canvas.height / pages);
    const ctx = slice.getContext("2d")!;
    for (let i = 0; i < pages; i++) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, i * slice.height, slice.width, slice.height, 0, 0, slice.width, slice.height);
      if (i > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", opts.quality ?? 0.95), "JPEG", 0, 0, pageW, pageH);
    }
    return pdf.output("blob");
  } finally {
    document.body.removeChild(host);
  }
}
