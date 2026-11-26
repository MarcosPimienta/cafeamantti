import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTr } from "@/utils/i18n/server";
import { MOLIENDA_LABELS, isMolienda } from "@/app/(admin)/coffeeProfiles";
import { ADJUSTMENT_REASON_LABELS, adjustmentLabel, adjustmentValue } from "@/utils/inventory/adjustments";
import { getAdjustment, type AdjustmentLine } from "../actions";
import AdjustmentActions from "./AdjustmentActions";
import AdjustmentSignatures from "./AdjustmentSignatures";

export const metadata = { title: "Comprobante de ajuste — Inventario — Amantti Admin" };

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const qty = (n: number) => `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString("es-CO", { maximumFractionDigits: 3 })}`;

export default async function AdjustmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tr = await getTr();
  const locale = (await getLocale()) === "en" ? "en-US" : "es-CO";
  const adj = await getAdjustment(id);
  if (!adj) notFound();

  const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const originals = adj.lines.filter((l) => !l.reversal);
  const reversals = adj.lines.filter((l) => l.reversal);
  const value = adjustmentValue(originals);
  const label = adjustmentLabel(adj.number);

  const table = (lines: AdjustmentLine[]) => (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-y border-foreground/15 text-left text-[10px] font-bold uppercase tracking-wider text-foreground/60">
          <th className="py-2 pr-3">{tr("Código")}</th>
          <th className="py-2 pr-3">{tr("Producto")}</th>
          <th className="py-2 pr-3">{tr("Molienda")}</th>
          <th className="py-2 pr-3 text-right">{tr("Cantidad")}</th>
          <th className="py-2 pr-3">{tr("Unidad")}</th>
          <th className="py-2 pr-3 text-right">{tr("Costo unitario")}</th>
          <th className="py-2 text-right">{tr("Valor")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-foreground/10">
        {lines.map((l) => (
          <tr key={l.id}>
            <td className="py-2 pr-3 font-mono text-xs">{l.product_code}</td>
            <td className="py-2 pr-3">{l.product_name}</td>
            <td className="py-2 pr-3">{isMolienda(l.molienda) ? tr(MOLIENDA_LABELS[l.molienda]) : "—"}</td>
            <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${l.quantity < 0 ? "text-red-700" : "text-emerald-800"}`}>{qty(l.quantity)}</td>
            <td className="py-2 pr-3 text-foreground/70">{l.unit ?? ""}</td>
            <td className="py-2 pr-3 text-right tabular-nums">{l.unit_cost !== null ? cop(l.unit_cost) : tr("Sin costo")}</td>
            <td className="py-2 text-right tabular-nums">{l.unit_cost !== null ? cop(l.quantity * l.unit_cost) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/admin/inventory/movimientos?tipo=ajuste" className="text-sm font-semibold text-[#7A5B22] hover:underline">
          {tr("← Comprobantes de ajuste")}
        </Link>
        <AdjustmentActions id={adj.id} label={label} annulled={adj.status === "anulado"} />
      </div>

      <article className="relative bg-white rounded-3xl border border-foreground/5 shadow-sm p-8 sm:p-10 space-y-8 print:shadow-none print:border-0 print:rounded-none print:p-0">
        {adj.status === "anulado" && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            <span className="rotate-[-18deg] text-[110px] font-black tracking-widest text-red-600/10">{tr("ANULADO")}</span>
          </div>
        )}

        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-foreground/10 pb-6">
          <div>
            <p className="font-serif text-2xl">Café Amantti</p>
            <h1 className="mt-1 text-sm font-bold uppercase tracking-[0.18em] text-foreground/60">{tr("Comprobante de ajuste de inventario")}</h1>
          </div>
          <div className="text-right">
            <p className="font-mono text-3xl font-semibold">{label}</p>
            <p className={`mt-1 inline-block rounded-full px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider ${adj.status === "anulado" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
              {adj.status === "anulado" ? tr("Anulado") : tr("Vigente")}
            </p>
          </div>
        </header>

        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <div><dt className="text-foreground/50">{tr("Fecha del ajuste")}</dt><dd className="font-semibold">{date(adj.adjustment_date)}</dd></div>
          <div><dt className="text-foreground/50">{tr("Bodega")}</dt><dd className="font-semibold">{adj.warehouse?.name ?? "—"}</dd></div>
          <div><dt className="text-foreground/50">{tr("Motivo")}</dt><dd className="font-semibold">{tr(ADJUSTMENT_REASON_LABELS[adj.reason_kind])}</dd></div>
          <div><dt className="text-foreground/50">{tr("Responsable")}</dt><dd className="font-semibold">{adj.responsable ?? "—"}</dd></div>
          <div><dt className="text-foreground/50">{tr("Registrado por")}</dt><dd className="font-semibold">{adj.created_by_name || "—"}</dd></div>
          <div><dt className="text-foreground/50">{tr("Registrado el")}</dt><dd className="font-semibold">{new Date(adj.created_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" })}</dd></div>
        </dl>

        <section>{table(originals)}</section>

        <section className="ml-auto max-w-xs space-y-1 text-sm">
          <p className="flex justify-between"><span className="text-foreground/60">{tr("Aumentos")}</span><span className="tabular-nums">{cop(value.gained)}</span></p>
          <p className="flex justify-between"><span className="text-foreground/60">{tr("Disminuciones")}</span><span className="tabular-nums">−{cop(value.lost)}</span></p>
          <p className="flex justify-between border-t border-foreground/15 pt-1 font-bold"><span>{tr("Efecto neto en inventario")}</span><span className={`tabular-nums ${value.net < 0 ? "text-red-700" : ""}`}>{cop(value.net)}</span></p>
          {value.withoutCost > 0 && <p className="text-xs text-amber-700">{tr("{n} productos sin costo no están en el valor.", { n: value.withoutCost })}</p>}
        </section>

        {adj.notes && (
          <section className="text-sm">
            <h2 className="font-semibold mb-1">{tr("Observaciones")}</h2>
            <p className="whitespace-pre-wrap text-foreground/80">{adj.notes}</p>
          </section>
        )}

        {adj.status === "anulado" && (
          <section className="rounded-2xl border border-red-200 bg-red-50/50 p-5 text-sm space-y-3">
            <h2 className="font-semibold text-red-800">{tr("Anulado el {date}", { date: adj.annulled_date ? date(adj.annulled_date) : "—" })}</h2>
            {adj.annul_reason && <p>{tr("Motivo de la anulación: {reason}", { reason: adj.annul_reason })}</p>}
            {reversals.length > 0 && (
              <>
                <p className="text-foreground/70">{tr("Movimientos que devolvieron el inventario a como estaba:")}</p>
                {table(reversals)}
              </>
            )}
          </section>
        )}

        <AdjustmentSignatures id={adj.id} label={label} signatures={adj.signatures} annulled={adj.status === "anulado"} />
      </article>
    </div>
  );
}
