"use client";

// Header and section navigation shared by every page of /admin/inventory.
// Each section is its own URL, so reloading or sharing a link keeps it.

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTr } from "@/app/(admin)/AdminI18n";

export const INVENTORY_SECTIONS = [
  { href: "/admin/inventory", label: "Existencias", desc: "Qué tienes, cuánto vale y qué necesita atención." },
  { href: "/admin/inventory/movimientos", label: "Movimientos", desc: "Un solo lugar para registrar y consultar lo que entra y sale." },
  { href: "/admin/inventory/produccion", label: "Producción", desc: "Del pergamino a la bolsa: trilla, tostión, empaque, reempaque y cold brew." },
  { href: "/admin/inventory/bodegas", label: "Bodegas", desc: "Qué hay en cada bodega y las transferencias entre ellas." },
  { href: "/admin/inventory/kardex", label: "Kardex", desc: "Cada movimiento con su saldo, por producto o en resumen." },
  { href: "/admin/inventory/analisis", label: "Análisis", desc: "Costos por referencia y reportes del inventario." },
] as const;

/** The section a path belongs to: the longest href that matches. */
export function sectionFor(pathname: string) {
  let best: (typeof INVENTORY_SECTIONS)[number] = INVENTORY_SECTIONS[0];
  for (const s of INVENTORY_SECTIONS) {
    if ((pathname === s.href || pathname.startsWith(`${s.href}/`)) && s.href.length > best.href.length) best = s;
  }
  return best;
}

export default function InventoryShell({ children }: { children: React.ReactNode }) {
  const tr = useTr();
  const pathname = usePathname() ?? "/admin/inventory";
  const current = sectionFor(pathname);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif text-foreground mb-1">{tr("Inventario")}</h1>
        <p className="text-foreground/70">{tr(current.desc)}</p>
      </div>

      <nav aria-label={tr("Secciones de inventario")} className="flex overflow-x-auto gap-1 border-b border-foreground/10">
        {INVENTORY_SECTIONS.map((s) => {
          const active = s.href === current.href;
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px whitespace-nowrap px-4 py-3 text-sm border-b-[3px] transition-colors ${
                active
                  ? "border-[#7A5B22] text-foreground font-semibold"
                  : "border-transparent text-foreground/70 font-medium hover:text-foreground"
              }`}
            >
              {tr(s.label)}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
