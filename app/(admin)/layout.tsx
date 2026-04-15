import React from "react";
import Link from "next/link";
import { Coffee, LogOut, Settings } from "lucide-react";
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import AdminNav from "./AdminNav";

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

  return (
    <div className="min-h-screen bg-[#f9f7f0] flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-foreground/5 hidden md:flex flex-col">
        <div className="p-8 border-b border-foreground/5 flex items-center justify-center">
          <Link href="/">
            <Coffee className="w-10 h-10 text-[#C59F59]" />
          </Link>
        </div>

        <AdminNav />

        <div className="p-6 border-t border-foreground/5">
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
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="md:hidden bg-white px-6 py-4 flex items-center justify-between border-b border-foreground/5 sticky top-0 z-10">
          <Link href="/">
            <Coffee className="w-8 h-8 text-[#C59F59]" />
          </Link>
          <h1 className="font-serif text-lg">Amantti Admin</h1>
        </header>
        
        <div className="flex-1 p-6 lg:p-12 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
