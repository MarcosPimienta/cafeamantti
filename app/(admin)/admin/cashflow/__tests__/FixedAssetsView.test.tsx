// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const h = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("../actions", () => ({
  getFixedAssets: async () => [
    { id: "m1", concept: "Compra máquina", category: "Maquinaria y Equipo (PUC 1520)", net_amount: 1340000, depreciation_months: 60, residual_value: 0, asset_kind: "Máquina de espresso", asset_use: "comodato", in_service_date: "2026-09-30", purchase_date: "2026-09-30", created_at: "2026-10-10T00:00:00Z" },
  ],
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/utils/excel/workbook", () => ({ downloadWorkbook: h.download }));

import { FixedAssetsView } from "../CashflowClient";

const cop = (v: number) => `$${Math.round(v).toLocaleString("es-CO")}`;

describe("Activos Fijos", () => {
  it("shows each asset with its depreciation at the cut-off date and exports it", async () => {
    render(<FixedAssetsView formatCurrency={cop} />);
    expect(await screen.findByText("Máquina de espresso")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Fecha de corte"), { target: { value: "2026-12-31" } });
    expect(screen.getByText("4 / 60")).toBeTruthy(); // sep–dec
    expect(screen.getByText("Comodato")).toBeTruthy();

    fireEvent.click(screen.getByText("Exportar a Excel"));
    await vi.waitFor(() => expect(h.download).toHaveBeenCalled());
    const [filename, sheets] = h.download.mock.calls[0];
    expect(filename).toBe("Activos_Fijos_2026-12-31.xlsx");
    expect(sheets.map((s: { name: string }) => s.name)).toEqual(["Activos fijos", "Resumen por clase"]);
  });
});
