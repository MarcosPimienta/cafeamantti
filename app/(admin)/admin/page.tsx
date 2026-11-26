import React, { Suspense } from "react";
import Link from "next/link";
import { Archive } from "lucide-react";
import { getLocale, getTr } from "@/utils/i18n/server";
import { bogotaToday } from "@/utils/orders/pendingDeliveries";
import {
  AgingCard,
  AlertsStrip,
  ComodatosCard,
  FinanceKpis,
  OperationKpis,
  RecentOrdersCard,
  SalesChartCard,
  SectionTitle,
  Skeleton,
  TopCustomersCard,
} from "./_dashboard/Sections";

// Live figures: never a cached build of this page.
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ datos?: string }> }) {
  // «Ver datos anteriores»: the receivables (alert, card and aging) of invoices issued before Sep 2026.
  const legacy = (await searchParams).datos === "anteriores";
  const tr = await getTr();
  const locale = (await getLocale()) === "en" ? "en-US" : "es-CO";
  const [y, m, d] = bogotaToday().split("-").map(Number);
  const todayLabel = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-1">{tr("Resumen General")}</h1>
          <p className="text-foreground/60 first-letter:uppercase">{tr("{date} · el mes en curso comparado con el anterior", { date: todayLabel })}</p>
        </div>
        <Link
          href={legacy ? "/admin" : "/admin?datos=anteriores"}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
            legacy ? "bg-amber-100 text-amber-800 border-amber-300 shadow-sm" : "bg-white text-foreground/50 border-foreground/10 hover:bg-foreground/5"
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          {legacy ? tr("Viendo: Archivo (pre-Sept 2026)") : tr("Ver datos anteriores")}
        </Link>
      </div>

      {legacy && (
        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <Archive className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-0">{tr("Cartera de facturas emitidas antes de sep 2026: la alerta de vencidas, Por cobrar y Cartera por antigüedad. Lo demás del resumen es del mes en curso.")}</span>
          <Link href="/admin" className="font-bold underline">{tr("Volver a los datos actuales")}</Link>
        </div>
      )}

      <Suspense fallback={<Skeleton className="h-16" />}>
        <AlertsStrip legacy={legacy} />
      </Suspense>

      <SectionTitle>{tr("Finanzas")}</SectionTitle>
      <Suspense fallback={<div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[118px]" />)}</div>}>
        <FinanceKpis legacy={legacy} />
      </Suspense>
      <div className="grid gap-4 lg:grid-cols-3">
        <Suspense fallback={<Skeleton className="h-[340px] lg:col-span-2" />}>
          <SalesChartCard />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[340px]" />}>
          <AgingCard legacy={legacy} />
        </Suspense>
      </div>

      <SectionTitle>{tr("Operación")}</SectionTitle>
      <Suspense fallback={<div className="grid gap-4 grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[118px]" />)}</div>}>
        <OperationKpis />
      </Suspense>

      <SectionTitle>{tr("Clientes")}</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <Suspense fallback={<Skeleton className="h-[320px]" />}>
          <TopCustomersCard />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[320px]" />}>
          <ComodatosCard />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[320px]" />}>
          <RecentOrdersCard />
        </Suspense>
      </div>
    </div>
  );
}
