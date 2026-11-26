import React, { Suspense } from "react";
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

export default async function AdminDashboardPage() {
  const tr = await getTr();
  const locale = (await getLocale()) === "en" ? "en-US" : "es-CO";
  const [y, m, d] = bogotaToday().split("-").map(Number);
  const todayLabel = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif text-foreground mb-1">{tr("Resumen General")}</h1>
        <p className="text-foreground/60 first-letter:uppercase">{tr("{date} · el mes en curso comparado con el anterior", { date: todayLabel })}</p>
      </div>

      <Suspense fallback={<Skeleton className="h-16" />}>
        <AlertsStrip />
      </Suspense>

      <SectionTitle>{tr("Finanzas")}</SectionTitle>
      <Suspense fallback={<div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[118px]" />)}</div>}>
        <FinanceKpis />
      </Suspense>
      <div className="grid gap-4 lg:grid-cols-3">
        <Suspense fallback={<Skeleton className="h-[340px] lg:col-span-2" />}>
          <SalesChartCard />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[340px]" />}>
          <AgingCard />
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
