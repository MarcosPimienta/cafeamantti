"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Coffee, LogOut, Menu, Settings, X } from "lucide-react";
import AdminNav from "./AdminNav";

/** Phone/tablet header with a slide-in menu; the sidebar is hidden below md. */
export default function AdminMobileNav() {
  const [open, setOpen] = useState(false);

  // Lock page scroll behind the open menu.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <header className="md:hidden bg-white px-4 py-3 flex items-center justify-between border-b border-foreground/5 sticky top-0 z-40">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="p-2 -ml-2 rounded-xl hover:bg-foreground/5"
          aria-label="Abrir menú"
          aria-expanded={open}
        >
          <Menu className="w-6 h-6 text-foreground/70" />
        </button>
        <h1 className="font-serif text-lg">Amantti Admin</h1>
        <Link href="/" aria-label="Ir a la tienda">
          <Coffee className="w-7 h-7 text-[#C59F59]" />
        </Link>
      </header>

      {open && (
        <div className="md:hidden fixed inset-0 z-[70] flex" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="relative w-[82%] max-w-xs h-full bg-white shadow-2xl flex flex-col overflow-y-auto">
            <div className="px-5 py-4 border-b border-foreground/5 flex items-center justify-between">
              <Coffee className="w-8 h-8 text-[#C59F59]" />
              <button type="button" onClick={() => setOpen(false)} className="p-2 rounded-xl hover:bg-foreground/5" aria-label="Cerrar menú">
                <X className="w-5 h-5 text-foreground/50" />
              </button>
            </div>

            <AdminNav onNavigate={() => setOpen(false)} />

            <div className="p-4 border-t border-foreground/5 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Link
                href="/admin/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-widest rounded-xl text-foreground/60 hover:bg-foreground/5 transition-all mb-1"
              >
                <Settings className="w-4 h-4 text-foreground/40" />
                Ajustes
              </Link>
              <form action="/auth/signout" method="post">
                <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-widest rounded-xl text-red-500 hover:bg-red-50 transition-all">
                  <LogOut className="w-4 h-4 text-red-400" />
                  Salir
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
