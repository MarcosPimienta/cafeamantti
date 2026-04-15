"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Coffee,
  Users,
  Settings,
  Package,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Órdenes", Icon: ShoppingBag },
  { href: "/admin/inventory", label: "Inventario", Icon: Package },
  { href: "/admin/subscriptions", label: "Suscripciones", Icon: Coffee },
  { href: "/admin/customers", label: "Clientes", Icon: Users },
];

export default function AdminNav() {
  const pathname = usePathname();

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <nav className="flex-1 p-6 space-y-2">
      {NAV_ITEMS.map(({ href, label, Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-widest rounded-xl transition-all group ${
              active
                ? "bg-[#C59F59] text-white shadow-sm"
                : "text-foreground/60 hover:bg-[#C59F59] hover:text-white"
            }`}
          >
            <Icon
              className={`w-4 h-4 transition-colors ${
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
