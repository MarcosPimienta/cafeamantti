"use client";

// Ventas netas (bars) against everything the month cost (line), one axis in
// pesos: where the line rides above the bar, the month lost money.

import React, { useState } from "react";
import { useTr } from "@/app/(admin)/AdminI18n";
import { copShort } from "@/utils/dashboard/summary";

export type ChartMonth = { ym: string; label: string; sales: number; costs: number; result: number; partial: boolean };

// Validated pair (light surface): amber for sales, indigo for costs.
const SALES = "#B07A1F";
const COSTS = "#5B4FB0";

const W = 640;
const H = 230;
const PAD = { l: 48, r: 12, t: 12, b: 28 };

function niceMax(v: number): number {
  if (v <= 0) return 1_000_000;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
}

export default function SalesCostChart({ months }: { months: ChartMonth[] }) {
  const tr = useTr();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = niceMax(Math.max(...months.flatMap((m) => [m.sales, m.costs])));
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - Math.max(0, v) / max);
  const step = (W - PAD.l - PAD.r) / months.length;
  const cx = (i: number) => PAD.l + step * i + step / 2;
  const barW = Math.min(44, step * 0.5);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const linePts = months.map((m, i) => `${cx(i)},${y(m.costs)}`).join(" ");
  const h = hover === null ? null : months[hover];

  return (
    <div>
      <div className="flex items-center gap-5 text-xs text-foreground/70 mb-2">
        <span className="flex items-center gap-1.5">
          <i className="inline-block w-3 h-3 rounded-sm" style={{ background: SALES }} />
          {tr("Ventas netas")}
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="10" aria-hidden><line x1="0" y1="5" x2="18" y2="5" stroke={COSTS} strokeWidth="2" /><circle cx="9" cy="5" r="3.5" fill="#fff" stroke={COSTS} strokeWidth="2" /></svg>
          {tr("Costos y gastos")}
        </span>
        <button type="button" onClick={() => setTable((v) => !v)} className="ml-auto text-[11px] font-bold uppercase tracking-widest text-[#A98C5D] hover:text-foreground">
          {table ? tr("Ver gráfica") : tr("Ver tabla")}
        </button>
      </div>

      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-foreground/40">
              <th className="text-left py-2 font-bold">{tr("Mes")}</th>
              <th className="text-right py-2 font-bold">{tr("Ventas netas")}</th>
              <th className="text-right py-2 font-bold">{tr("Costos y gastos")}</th>
              <th className="text-right py-2 font-bold">{tr("Resultado")}</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.ym} className="border-t border-foreground/5">
                <td className="py-2">{m.label}{m.partial ? ` (${tr("en curso")})` : ""}</td>
                <td className="py-2 text-right tabular-nums">{copShort(m.sales)}</td>
                <td className="py-2 text-right tabular-nums">{copShort(m.costs)}</td>
                <td className={`py-2 text-right tabular-nums font-bold ${m.result < 0 ? "text-red-700" : "text-green-700"}`}>{copShort(m.result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={tr("Ventas netas y costos de los últimos 6 meses")} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#2c2a29" strokeOpacity={t === 0 ? 0.25 : 0.07} />
                <text x={PAD.l - 8} y={y(t) + 4} fontSize="10" fill="#2c2a29" fillOpacity="0.5" textAnchor="end">{copShort(t).replace(",0 M", " M")}</text>
              </g>
            ))}
            {months.map((m, i) => {
              const top = y(m.sales);
              const hgt = Math.max(0, y(0) - top);
              return (
                <g key={m.ym}>
                  {hover === i && <rect x={cx(i) - step / 2 + 2} y={PAD.t} width={step - 4} height={H - PAD.t - PAD.b} fill="#2c2a29" fillOpacity="0.04" rx="6" />}
                  {/* Rounded top, square base on the axis. */}
                  {hgt > 0 && (
                    <path
                      d={`M${cx(i) - barW / 2},${y(0)} V${top + Math.min(4, hgt)} Q${cx(i) - barW / 2},${top} ${cx(i) - barW / 2 + 4},${top} H${cx(i) + barW / 2 - 4} Q${cx(i) + barW / 2},${top} ${cx(i) + barW / 2},${top + Math.min(4, hgt)} V${y(0)} Z`}
                      fill={SALES}
                      fillOpacity={m.partial ? 0.55 : 1}
                    />
                  )}
                  <text x={cx(i)} y={H - 8} fontSize="11" fill="#2c2a29" fillOpacity="0.6" textAnchor="middle">{m.label}</text>
                </g>
              );
            })}
            <polyline points={linePts} fill="none" stroke={COSTS} strokeWidth="2" strokeLinejoin="round" />
            {months.map((m, i) => (
              <circle key={m.ym} cx={cx(i)} cy={y(m.costs)} r={hover === i ? 5.5 : 4} fill="#fff" stroke={COSTS} strokeWidth="2" />
            ))}
            {/* Hit areas wider than the marks. */}
            {months.map((m, i) => (
              <rect key={m.ym} x={cx(i) - step / 2} y={0} width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
            ))}
          </svg>
          {h && hover !== null && (
            <div
              className="pointer-events-none absolute top-2 z-10 bg-white border border-foreground/10 shadow-lg rounded-xl px-3 py-2 text-xs min-w-[170px]"
              style={{ left: `${(cx(hover) / W) * 100}%`, transform: `translateX(${hover > months.length / 2 ? "-105%" : "5%"})` }}
            >
              <p className="font-bold mb-1">{h.label}{h.partial ? ` · ${tr("en curso")}` : ""}</p>
              <p className="flex justify-between gap-4"><span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm inline-block" style={{ background: SALES }} />{tr("Ventas netas")}</span><b className="tabular-nums">{copShort(h.sales)}</b></p>
              <p className="flex justify-between gap-4"><span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full inline-block" style={{ background: COSTS }} />{tr("Costos y gastos")}</span><b className="tabular-nums">{copShort(h.costs)}</b></p>
              <p className="flex justify-between gap-4 border-t border-foreground/10 mt-1 pt-1"><span>{tr("Resultado")}</span><b className={`tabular-nums ${h.result < 0 ? "text-red-700" : "text-green-700"}`}>{copShort(h.result)}</b></p>
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-foreground/50 mt-2">{tr("Cuando la línea queda por encima de la barra, el mes dio pérdida.")}</p>
    </div>
  );
}
