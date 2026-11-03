import type { TextItem } from "./davivienda";

/** The text pieces of a PDF with their position (PDF units, y up). Server only. */
export async function pdfTextItems(data: Uint8Array): Promise<TextItem[]> {
  // pdf.js loads its worker by a computed path that Vercel doesn't bundle;
  // imported here by name it ships with the function and runs in-process.
  const g = globalThis as { pdfjsWorker?: unknown };
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data, useSystemFonts: false, verbosity: 0 });
  const out: TextItem[] = [];
  try {
    const doc = await task.promise;
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      for (const it of content.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        out.push({ page, x: it.transform[4], y: it.transform[5], str: it.str });
      }
    }
  } finally {
    await task.destroy();
  }
  return out;
}
