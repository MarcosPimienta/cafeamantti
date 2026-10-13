// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), usePathname: () => "/admin/cashflow" }));
vi.mock("@/app/(admin)/admin/cashflow/actions", () => ({
  getFixedAssets: async () => [
    { id: "m1", concept: "Compra máquina", category: "Maquinaria y Equipo (PUC 1520)", net_amount: 1340000, depreciation_months: 60, residual_value: 0, asset_kind: "Máquina de espresso", asset_use: "comodato", in_service_date: "2026-09-30", purchase_date: "2026-09-30", created_at: "2026-10-10T00:00:00Z" },
  ],
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));

import { AdminI18nProvider, LanguageSwitch } from "../AdminI18n";
import AdminNav from "../AdminNav";
import { FixedAssetsView } from "../admin/cashflow/CashflowClient";

const cop = (v: number) => `$${Math.round(v)}`;

describe("admin in English", () => {
  it("navigation, a screen and its data labels follow the language", async () => {
    render(
      <AdminI18nProvider locale="en">
        <LanguageSwitch />
        <AdminNav />
        <FixedAssetsView formatCurrency={cop} />
      </AdminI18nProvider>
    );
    expect(screen.getByText("Orders")).toBeTruthy();
    expect(screen.getByText("Cash flow")).toBeTruthy();
    expect(await screen.findByText("Espresso machine")).toBeTruthy();
    expect(screen.getByText("Machinery and equipment (PUC 1520)")).toBeTruthy();
    expect(screen.getByText("Equipment loan")).toBeTruthy();
    expect(screen.getAllByText("Book value").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "en" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Spanish stays as written", async () => {
    render(
      <AdminI18nProvider locale="es">
        <AdminNav />
      </AdminI18nProvider>
    );
    expect(screen.getByText("Órdenes")).toBeTruthy();
  });
});
