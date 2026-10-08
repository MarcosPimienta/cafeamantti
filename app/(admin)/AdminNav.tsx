"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Coffee,
  Users,
  Package,
  FileText,
  Wallet,
  Building2,
  UploadCloud
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Órdenes", Icon: ShoppingBag },
  { href: "/admin/orders/import", label: "Cargar Siigo", Icon: UploadCloud },
  { href: "/admin/inventory", label: "Inventario", Icon: Package },
  { href: "/admin/subscriptions", label: "Suscripciones", Icon: Coffee },
  { href: "/admin/users", label: "Usuarios", Icon: Users },
  { href: "/admin/customers", label: "Clientes (B2B)", Icon: Users },
  { href: "/admin/suppliers", label: "Proveedores", Icon: Building2 },
  { href: "/admin/quotes", label: "Cotizaciones", Icon: FileText },
  { href: "/admin/cuentas-cobro", label: "Cuentas de Cobro", Icon: FileText },
  { href: "/admin/cashflow", label: "Flujo de Caja", Icon: Wallet },
];

/** The single nav item for this path: the longest href that matches. */
function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const { href, exact } of NAV_ITEMS) {
    const matches = exact
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (!best || href.length > best.length)) best = href;
  }
  return best;
}

export default function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeHref(pathname);

  return (
    <nav className="flex-1 p-4 lg:p-6 space-y-1.5">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = href === current;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-widest rounded-xl transition-all group ${
              active
                ? "bg-[#C59F59] text-white shadow-sm"
                : "text-foreground/60 hover:bg-[#C59F59] hover:text-white"
            }`}
          >
            <Icon
              className={`w-4 h-4 shrink-0 transition-colors ${
                active ? "text-white/80" : "text-foreground/40 group-hover:text-white/80"
              }`}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
