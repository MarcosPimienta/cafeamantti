// Client-facing PDF of a maquila proposal: presentations, price per unit,
// monthly estimate, what the client must deliver, IVA and conditions.
// Never includes costs, margins or internal notes.

import { calculateProposal, type MaquilaLine, type MaquilaSettings } from "@/utils/maquila";
import { formatCOP, formatDateSpanish, imageUrlToBase64 } from "./cuentasCobroHelpers";

export type MaquilaPdfData = {
  title: string;
  clientName: string;
  proposalDate: string;
  validUntil: string | null;
  intro: string | null;
  conditions: string | null;
  minimumUnits: number | null;
  settings: MaquilaSettings;
  lines: MaquilaLine[];
  sellerName?: string;
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const paragraphs = (text: string | null) =>
  (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const kg = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })} kg`;

/** The proposal as an HTML string (A4 width), ready for html2pdf. */
export function buildMaquilaHtml(data: MaquilaPdfData, logoSrc = ""): string {
  const { lines, totals } = calculateProposal(data.lines, data.settings);
  const th = "padding:10px 12px; font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#78716c; text-align:left; border-bottom:2px solid #C59F59;";
  const td = "padding:10px 12px; font-size:12px; color:#292524; border-bottom:1px solid #e7e5e4;";

  const rows = lines
    .map(
      (r) => `<tr>
        <td style="${td}"><strong>${esc(r.presentation)}</strong><br/><span style="color:#78716c; font-size:11px;">${esc(r.grams)} g por unidad</span></td>
        <td style="${td} text-align:right;">${formatCOP(r.price)}</td>
        <td style="${td} text-align:right;">${r.units.toLocaleString("es-CO")}</td>
        <td style="${td} text-align:right;">${formatCOP(r.revenue)}</td>
      </tr>`
    )
    .join("");

  // The same supply used by several presentations is listed once, added up.
  const supplyTotals = new Map<string, number>();
  for (const m of lines.flatMap((r) => r.clientMaterials)) {
    const key = m.name.trim();
    supplyTotals.set(key, (supplyTotals.get(key) ?? 0) + m.qty);
  }
  const clientSupplies = [...supplyTotals].map(([name, qty]) => `${esc(name)} (${qty.toLocaleString("es-CO")} und.)`);

  const deliver = `
    <ul style="margin:8px 0 0; padding-left:18px; font-size:12px; color:#44403c; line-height:1.7;">
      <li>Café tostado: <strong>${kg(totals.coffeeKg)}</strong> al mes${data.settings.merma_pct > 0 ? ` (incluye ${esc(data.settings.merma_pct)} % de merma de empaque)` : ""}.</li>
      ${clientSupplies.map((s) => `<li>${s}</li>`).join("")}
    </ul>`;

  return `
  <div style="width:794px; padding:56px 64px; font-family:Helvetica,Arial,sans-serif; color:#292524; background:#fff; box-sizing:border-box;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:36px;">
      ${logoSrc ? `<img src="${logoSrc}" style="height:56px; object-fit:contain;" />` : `<strong style="font-size:18px;">Café Amantti</strong>`}
      <div style="text-align:right; font-size:11px; color:#78716c;">
        <div>${esc(formatDateSpanish(data.proposalDate))}</div>
        ${data.validUntil ? `<div>Válida hasta: ${esc(formatDateSpanish(data.validUntil))}</div>` : ""}
      </div>
    </div>

    <h1 style="font-size:22px; letter-spacing:2px; text-transform:uppercase; margin:0 0 6px;">${esc(data.title)}</h1>
    <p style="margin:0 0 24px; color:#C59F59; font-weight:700;">Para: ${esc(data.clientName)}</p>

    ${paragraphs(data.intro).map((p) => `<p style="font-size:12px; line-height:1.7; color:#44403c; margin:0 0 10px;">${esc(p)}</p>`).join("")}

    <h2 style="font-size:13px; text-transform:uppercase; letter-spacing:1.5px; color:#C59F59; margin:28px 0 8px;">Servicio de empaque y etiquetado</h2>
    <table style="width:100%; border-collapse:collapse;">
      <thead><tr>
        <th style="${th}">Presentación</th>
        <th style="${th} text-align:right;">Precio por unidad</th>
        <th style="${th} text-align:right;">Unidades / mes</th>
        <th style="${th} text-align:right;">Valor mensual</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <table style="margin:16px 0 0 auto; border-collapse:collapse; min-width:300px;">
      <tr><td style="padding:4px 12px; font-size:12px; color:#78716c;">Subtotal</td><td style="padding:4px 12px; text-align:right; font-size:12px;">${formatCOP(totals.subtotal)}</td></tr>
      ${data.settings.apply_iva ? `<tr><td style="padding:4px 12px; font-size:12px; color:#78716c;">IVA (${esc(data.settings.iva_pct)} %)</td><td style="padding:4px 12px; text-align:right; font-size:12px;">${formatCOP(totals.iva)}</td></tr>` : ""}
      <tr><td style="padding:8px 12px; font-size:14px; font-weight:700; border-top:2px solid #C59F59;">Total mensual estimado</td><td style="padding:8px 12px; text-align:right; font-size:14px; font-weight:700; border-top:2px solid #C59F59;">${formatCOP(totals.total)}</td></tr>
    </table>
    ${data.minimumUnits ? `<p style="font-size:11px; color:#78716c; margin:10px 0 0;">Pedido mínimo: ${data.minimumUnits.toLocaleString("es-CO")} unidades por orden.</p>` : ""}

    <h2 style="font-size:13px; text-transform:uppercase; letter-spacing:1.5px; color:#C59F59; margin:28px 0 4px;">Lo que entrega el cliente</h2>
    ${deliver}

    ${
      paragraphs(data.conditions).length
        ? `<h2 style="font-size:13px; text-transform:uppercase; letter-spacing:1.5px; color:#C59F59; margin:28px 0 4px;">Condiciones</h2>
           <ul style="margin:8px 0 0; padding-left:18px; font-size:12px; color:#44403c; line-height:1.7;">${paragraphs(data.conditions).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`
        : ""
    }

    <div style="margin-top:48px; border-top:1px solid #e7e5e4; padding-top:20px; font-size:11px; color:#57534e;">
      <strong style="color:#292524;">${esc(data.sellerName || "Asesor Amantti")}</strong><br/>
      Alma Trading Group SAS · Nit: 901752308-8 · cafeamantti@gmail.com
    </div>
  </div>`;
}

/** Renders the client PDF in the browser and returns it as a Blob. */
export async function generateMaquilaPDF(data: MaquilaPdfData): Promise<Blob> {
  const html2pdf = (await import("html2pdf.js")).default;
  const logo = await imageUrlToBase64(`${window.location.origin}/images/logo-amantti.png`);
  const element = document.createElement("div");
  element.innerHTML = buildMaquilaHtml(data, logo);
  return await html2pdf()
    .set({
      margin: 0,
      filename: "propuesta-maquila.pdf",
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "px", format: [794, 1123], orientation: "portrait" },
    })
    .from(element)
    .output("blob");
}
