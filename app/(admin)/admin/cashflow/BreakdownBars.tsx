"use client";

import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Bar } from "./reportBreakdown";
import { useTr } from "@/app/(admin)/AdminI18n";

// Validated categorical slots (light surface): blue, orange, aqua. Aqua sits
// under 3:1 on the surface, so every bar carries its value as text.
export const KIND_COLOR: Record<Bar["kind"], string> = {
  OPEX: "#2a78d6",
  COGS: "#eb6834",
  OTROS: "#a8a69e",
  INGRESO: "#1baf7a",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
/** Bars take at most this share of their track: the value and share sit after them. */
const TRACK = 62;

/**
 * Horizontal bars, biggest first: short name, a thin bar, value and share at
 * the tip, and the change against the previous period. A bar opens like a
 * dropdown into the bars that add up to it (supplier, client or concept),
 * drawn on the same scale so together they are as long as their parent.
 */
export default function BreakdownBars({ bars, formatCurrency, defaultOpen = [] }: {
  bars: Bar[];
  formatCurrency: (v: number) => string;
  /** Bars that start open. */
  defaultOpen?: string[];
}) {
  const tr = useTr();
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen));
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...bars.map((b) => b.value), 1);
  if (!bars.length) return <p className="py-10 text-center text-sm text-foreground/40">{tr("Sin movimientos en este periodo.")}</p>;

  const toggle = (name: string) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });

  const row = (b: Bar, key: string, child: boolean, parent?: Bar) => {
    const change = b.previous ? (b.value - b.previous) / b.previous : null;
    const expandable = !child && !!b.children?.length;
    const isOpen = open.has(b.name);
    return (
      <li key={key} className="relative">
        <button
          type="button"
          onClick={expandable ? () => toggle(b.name) : undefined}
          onMouseEnter={() => setHover(key)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(key)}
          onBlur={() => setHover(null)}
          aria-expanded={expandable ? isOpen : undefined}
          aria-label={`${b.name}: ${formatCurrency(b.value)}, ${pct(b.share)}`}
          className={`grid w-full grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] items-center gap-3 rounded-lg px-2 text-left transition-colors ${child ? "py-1" : "py-1.5"} ${expandable ? "cursor-pointer" : "cursor-default"} ${hover === key ? "bg-foreground/[0.03]" : ""}`}
        >
          <span className={`flex min-w-0 items-center gap-1 text-xs ${child ? "pl-5 text-foreground/55" : "text-foreground/70"}`}>
            {!child && <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${expandable ? "text-foreground/40" : "invisible"} ${isOpen ? "rotate-90" : ""}`} />}
            <span className="truncate">{tr.msg(b.label)}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className={`${child ? "h-2.5" : "h-4"} rounded-r`} style={{ width: `${Math.max(1, (b.value / max) * TRACK)}%`, background: KIND_COLOR[b.kind], opacity: child ? 0.55 : 1 }} />
            <span className={`shrink-0 whitespace-nowrap tabular-nums text-foreground ${child ? "text-[11px]" : "text-xs font-bold"}`}>{formatCurrency(b.value)}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-foreground/45">{pct(b.share)}</span>
            {change !== null && Math.abs(change) >= 0.01 && (
              <span className={`shrink-0 text-[10px] font-bold tabular-nums ${change > 0 ? "text-foreground/60" : "text-foreground/40"}`}>
                {change > 0 ? "▲" : "▼"} {pct(Math.abs(change))}
              </span>
            )}
          </span>
        </button>
        {hover === key && (
          <div className="pointer-events-none absolute left-2 top-full z-10 mt-1 w-max max-w-xs rounded-xl border border-foreground/10 bg-white px-3 py-2 text-xs shadow-lg">
            <p className="font-bold text-foreground">{tr.msg(b.name)}</p>
            <p className="mt-0.5 tabular-nums text-foreground/70">
              {formatCurrency(b.value)} · {child && parent ? tr("{p} de «{name}»", { p: pct(b.share), name: tr.msg(parent.label) }) : pct(b.share)}
            </p>
            {b.previous !== null && <p className="tabular-nums text-foreground/50">{tr("Periodo anterior: {v}", { v: formatCurrency(b.previous) })}</p>}
            {expandable && <p className="mt-1 text-foreground/40">{isOpen ? tr("Toca para cerrar") : tr("Toca para ver qué la compone ({n})", { n: String(b.children!.length) })}</p>}
          </div>
        )}
      </li>
    );
  };

  return (
    <ul className="space-y-0.5" role="list">
      {bars.map((b) => (
        <React.Fragment key={b.name}>
          {row(b, b.name, false)}
          {open.has(b.name) && b.children && (
            <li>
              {/* Not indented: children start where their parent starts, on the same scale. */}
              <ul className="mb-1 rounded-lg bg-foreground/[0.02]" role="list">
                {b.children.map((c) => row(c, `${b.name}›${c.name}`, true, b))}
              </ul>
            </li>
          )}
        </React.Fragment>
      ))}
    </ul>
  );
}
