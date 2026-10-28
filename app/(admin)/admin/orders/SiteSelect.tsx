"use client";

import React from "react";
import type { ClientSite } from "@/utils/clients/sites";
import { useTr } from "@/app/(admin)/AdminI18n";

/** The sede an order is for, among the client's active ones (the one already chosen stays listed). */
export function SiteSelect({ sites, value, onChange, className }: { sites: ClientSite[]; value: string; onChange: (site: ClientSite | null) => void; className?: string }) {
  const tr = useTr();
  const shown = sites.filter((s) => s.active !== false || s.id === value);
  if (!shown.length) return null;
  return (
    <div>
      <label className="block text-xs font-bold text-[#C59F59] mb-1">{tr("Sede")}{" "}<span className="text-red-400">*</span></label>
      <select value={value} onChange={(e) => onChange(shown.find((s) => s.id === e.target.value) ?? null)} className={className}>
        <option value="">{tr("— Elige la sede —")}</option>
        {shown.map((s) => (
          <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ""}</option>
        ))}
      </select>
    </div>
  );
}

/** The client's sedes still to choose from. */
export const activeSites = (client: { sites?: ClientSite[] } | null | undefined): ClientSite[] => (client?.sites ?? []).filter((s) => s.active !== false);
