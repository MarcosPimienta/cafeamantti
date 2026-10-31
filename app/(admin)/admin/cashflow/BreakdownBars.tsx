"use client";

import React, { useState } from "react";
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

/**
 * Horizontal bars, biggest first: short name, a thin bar, value and share at
 * the tip, and the change against the previous period. Hovering a bar shows
 * its full name and both periods.
 */
export default function BreakdownBars({ bars, formatCurrency, onSelect, selected }: {
  bars: Bar[];
  formatCurrency: (v: number) => string;
  /** Clicking a bar (e.g. to filter the expense table). */
  onSelect?: (bar: Bar) => void;
  selected?: string | null;
}) {
  const tr = useTr();
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...bars.map((b) => b.value), 1);
  if (!bars.length) return <p className="py-10 text-center text-sm text-foreground/40">{tr("Sin movimientos en este periodo.")}</p>;
  return (
    <ul className="space-y-1" role="list">
      {bars.map((b) => {
        const change = b.previous ? (b.value - b.previous) / b.previous : null;
        const active = hover === b.name;
        return (
          <li key={b.name} className="relative">
            <button
              type="button"
              onClick={onSelect ? () => onSelect(b) : undefined}
              onMouseEnter={() => setHover(b.name)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(b.name)}
              onBlur={() => setHover(null)}
              aria-label={`${b.name}: ${formatCurrency(b.value)}, ${pct(b.share)}`}
              className={`grid w-full grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${onSelect ? "cursor-pointer" : "cursor-default"} ${selected === b.name ? "bg-foreground/[0.06]" : active ? "bg-foreground/[0.03]" : ""}`}
            >
              <span className="truncate text-xs text-foreground/70">{tr.msg(b.label)}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-4 rounded-r" style={{ width: `${Math.max(2, (b.value / max) * 62)}%`, background: KIND_COLOR[b.kind] }} />
                <span className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-foreground">{formatCurrency(b.value)}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-foreground/45">{pct(b.share)}</span>
                {change !== null && Math.abs(change) >= 0.01 && (
                  <span className={`shrink-0 text-[10px] font-bold tabular-nums ${change > 0 ? "text-foreground/60" : "text-foreground/40"}`}>
                    {change > 0 ? "▲" : "▼"} {pct(Math.abs(change))}
                  </span>
                )}
              </span>
            </button>
            {active && (
              <div className="pointer-events-none absolute left-2 top-full z-10 mt-1 w-max max-w-xs rounded-xl border border-foreground/10 bg-white px-3 py-2 text-xs shadow-lg">
                <p className="font-bold text-foreground">{tr.msg(b.name)}</p>
                <p className="mt-0.5 tabular-nums text-foreground/70">{formatCurrency(b.value)} · {pct(b.share)}</p>
                {b.previous !== null && <p className="tabular-nums text-foreground/50">{tr("Periodo anterior: {v}", { v: formatCurrency(b.previous) })}</p>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
