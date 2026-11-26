import { describe, it, expect } from "vitest";
import {
  agingKey,
  comodatoClients,
  copShort,
  customerOfSale,
  daysBetween,
  greenCoffee,
  netSalesThrough,
  pctChange,
  productionSummary,
  receivablesAging,
  sameDayPrevMonth,
  topCustomers,
} from "../dashboard/summary";

const item = (date: string, concept: string, amount: number) => ({ date, concept, category: "Factura", amount });

describe("dates", () => {
  it("counts days and steps back a month", () => {
    expect(daysBetween("2026-11-01", "2026-11-26")).toBe(25);
    expect(daysBetween("2026-11-26", "2026-11-01")).toBe(-25);
    expect(sameDayPrevMonth("2026-11-26")).toBe("2026-10-26");
    expect(sameDayPrevMonth("2026-03-31")).toBe("2026-02-28");
    expect(sameDayPrevMonth("2026-01-15")).toBe("2025-12-15");
  });

  it("gives no change against zero", () => {
    expect(pctChange(110, 100)).toBe(10);
    expect(pctChange(-50, -100)).toBe(50);
    expect(pctChange(10, 0)).toBeNull();
  });
});

describe("sales", () => {
  it("adds the sales up to a day, less credit notes", () => {
    const sales = [item("2026-10-05", "FV-1 · A", 100), item("2026-10-20", "FV-2 · B", 50), item("2026-10-28", "FV-3 · A", 70)];
    const notes = [item("2026-10-10", "NC-1 · A", 20)];
    expect(netSalesThrough(sales, notes, "2026-10-26")).toBe(130);
  });

  it("reads the customer of every kind of sale", () => {
    expect(customerOfSale("FV-12 · Hotel Andino")).toBe("Hotel Andino");
    expect(customerOfSale("Pedido #ab12cd34 · Rosalba (sin factura)")).toBe("Rosalba");
    expect(customerOfSale("Venta web #ab12 · ana@x.co")).toBe("ana@x.co");
    expect(customerOfSale("FV-9 · ")).toBe("Sin cliente");
  });

  it("ranks customers net of their credit notes", () => {
    const sales = [item("d", "FV-1 · A", 100), item("d", "FV-2 · B", 80), item("d", "FV-3 · A", 50), item("d", "FV-4 · C", 10)];
    const notes = [item("d", "NC-1 · A", 90)];
    const top = topCustomers(sales, notes, 2);
    expect(top.rows).toEqual([{ name: "B", amount: 80 }, { name: "A", amount: 60 }]);
    expect(top.total).toBe(150);
    expect(top.topShare).toBeCloseTo(93.33, 2);
  });
});

describe("receivables aging", () => {
  it("buckets by days past due", () => {
    expect(agingKey(0)).toBe("por_vencer");
    expect(agingKey(1)).toBe("d1_30");
    expect(agingKey(45)).toBe("d31_60");
    expect(agingKey(90)).toBe("d61_90");
    expect(agingKey(91)).toBe("d90");
  });

  it("sums overdue money and finds the oldest and the top debtor", () => {
    const a = receivablesAging(
      [
        { balance: 100, due_date: "2026-12-01", customer_name: "A" },
        { balance: 200, due_date: "2026-11-01", customer_name: "B" },
        { balance: 50, due_date: "2026-08-01", customer_name: "C" },
        { balance: 30, due_date: "2026-10-20", customer_name: "C" },
      ],
      "2026-11-26"
    );
    expect(a.total).toBe(380);
    expect(a.overdue).toBe(280);
    expect(a.overdueCount).toBe(3);
    expect(a.oldestOverdueDays).toBe(117);
    expect(a.topDebtor).toEqual({ name: "B", amount: 200 });
    expect(a.buckets.find((b) => b.key === "d90")).toEqual({ key: "d90", amount: 50, count: 1 });
  });
});

describe("production", () => {
  const batches = [
    { process_type: "tostion", input_quantity_kg: 60, output_quantity_kg: 50, movement_date: "2026-11-10" },
    { process_type: "tostion", input_quantity_kg: 40, output_quantity_kg: 34, movement_date: "2026-11-20" },
    { process_type: "tostion", input_quantity_kg: 30, output_quantity_kg: 25, movement_date: "2026-10-12" },
    { process_type: "tostion", input_quantity_kg: 30, output_quantity_kg: 25, movement_date: "2026-10-29" },
    { process_type: "trilla", input_quantity_kg: 100, output_quantity_kg: 80, movement_date: "2026-11-05" },
  ];

  it("sums the month's roast and its loss, against the same days of last month", () => {
    const p = productionSummary(batches, "2026-11-26");
    expect(p.roastedKg).toBe(84);
    expect(p.roastedPrevKg).toBe(25);
    expect(p.tostionLossPct).toBe(16);
    expect(p.trillaLossPct).toBe(20);
  });

  it("says how many weeks the green coffee lasts at the recent pace", () => {
    const g = greenCoffee({ verdeKg: 100, pergaminoKg: 50 }, batches, "2026-11-26", 56);
    expect(g.usableKg).toBe(140);
    expect(g.weeklyUseKg).toBe(20);
    expect(g.weeksLeft).toBe(7);
    expect(greenCoffee({ verdeKg: 10, pergaminoKg: 0 }, [], "2026-11-26").weeksLeft).toBeNull();
  });
});

describe("comodatos", () => {
  it("adds each client's machines and commitments, lowest progress first", () => {
    const unit = (clientId: string, name: string, kg: number | null) => ({ assignment: { client_id: clientId, monthly_commitment_kg: kg }, client: { id: clientId, name } });
    const rows = comodatoClients(
      [unit("a", "Gym A", 2), unit("a", "Gym A", 2), unit("b", "Gym B", 3), unit("c", "Gym C", null), { assignment: null, client: null }],
      { a: 4.5, b: 1 }
    );
    expect(rows.map((r) => [r.name, r.machines, r.commitmentKg, r.status])).toEqual([
      ["Gym B", 1, 3, "bajo"],
      ["Gym A", 2, 4, "ok"],
      ["Gym C", 1, null, "sin_compromiso"],
    ]);
  });
});

describe("copShort", () => {
  it("writes millions short and smaller amounts whole", () => {
    expect(copShort(18_400_000)).toBe("$18,4 M");
    expect(copShort(-420_000)).toBe("−$420.000");
    expect(copShort(1_000_000)).toBe("$1,0 M");
  });
});
