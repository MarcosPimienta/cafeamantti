import React from "react";
import Link from "next/link";
import { Coffee, LogOut, Settings } from "lucide-react";
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import AdminNav from "./AdminNav";
import AdminMobileNav from "./AdminMobileNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-[#f9f7f0] flex font-sans">
      {/* Sidebar */}
      {/* Sticky so the menu stays in reach while long pages scroll. */}
      <aside className="w-56 lg:w-64 shrink-0 bg-white border-r border-foreground/5 hidden md:flex flex-col sticky top-0 h-screen overflow-y-auto">
        <div className="p-6 lg:p-8 border-b border-foreground/5 flex items-center justify-center">
          <Link href="/">
            <Coffee className="w-10 h-10 text-[#C59F59]" />
          </Link>
        </div>

        <AdminNav />

        <div className="p-4 lg:p-6 border-t border-foreground/5">
          <Link href="/admin/settings" className="flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-widest rounded-xl text-foreground/60 hover:bg-foreground/5 transition-all mb-2">
            <Settings className="w-4 h-4 text-foreground/40" />
            Ajustes
          </Link>
          <form action="/auth/signout" method="post">
            <button suppressHydrationWarning className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold uppercase tracking-widest rounded-xl text-red-500 hover:bg-red-50 transition-all">
              <LogOut className="w-4 h-4 text-red-400" />
              Salir
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      {/* min-w-0 lets this flex child shrink to the viewport: wide tables and
          the orders board scroll inside their own box instead of pushing the
          whole page sideways. */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen">
        <AdminMobileNav />

        <div className="flex-1 min-w-0 px-4 py-5 sm:p-6 lg:p-10 xl:p-12">
          {children}
        </div>
      </main>
    </div>
  );
}
