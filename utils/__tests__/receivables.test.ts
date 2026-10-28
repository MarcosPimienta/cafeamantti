import { describe, it, expect } from "vitest";
import { groupReceivables, receivableLines, siteFromObservations, type ReceivableInvoice } from "../invoices/receivables";
import { receivablesSheets } from "../invoices/receivablesExcel";
import { nextBranchOffice, siteLabel } from "../clients/sites";

const inv = (o: Partial<ReceivableInvoice>): ReceivableInvoice => ({
  id: "x", name: "FV-2-1", client_id: "pf", customer_name: "GRUPO PROFITNESS SAS", customer_identification: "901656887", site_id: null,
  issue_date: "2026-10-01", due_date: "2026-10-21", total: 157500, balance: 157500, ...o,
});

describe("receivables at a cutoff (balances from Siigo)", () => {
  const invoices = [
    inv({ id: "a", name: "FV-2-731", site_id: "fab", due_date: "2026-10-20" }), // overdue
    inv({ id: "b", name: "FV-2-748", site_id: "fab", due_date: "2026-10-21" }), // due today
    inv({ id: "c", name: "FV-2-732", site_id: "may", due_date: "2026-11-05", balance: 107500 }), // partly paid
    inv({ id: "d", name: "FV-2-687", site_id: null, due_date: "2026-11-30", total: 624750, balance: 624750 }),
    inv({ id: "e", balance: 0 }), // paid
    inv({ id: "g", issue_date: "2026-10-30" }), // after the cutoff
  ];

  it("keeps what is owed, by how due it is at the cutoff", () => {
    expect(receivableLines(invoices, "2026-10-21").map((l) => [l.invoice.id, l.bucket, l.paid, l.balance, l.daysOverdue])).toEqual([
      ["a", "vencido", 0, 157500, 1],
      ["b", "hoy", 0, 157500, 0],
      ["c", "por_vencer", 50000, 107500, 0],
      ["d", "por_vencer", 0, 624750, 0],
    ]);
  });

  it("groups by client and sede (sedes in their order, «sin sede» last) with totals", () => {
    const { clients, totals } = groupReceivables(receivableLines(invoices, "2026-10-21"), ["may", "fab"]);
    expect(clients[0].sites.map((s) => [s.siteId, s.totals.count, s.totals.balance])).toEqual([["may", 1, 107500], ["fab", 2, 315000], [null, 1, 624750]]);
    expect(totals).toMatchObject({ count: 4, billed: 1097250, paid: 50000, balance: 1047250, vencido: 157500, hoy: 157500, por_vencer: 732250 });
  });

  it("the Excel has the summary and a sheet per sede for one client", () => {
    const { clients, totals } = groupReceivables(receivableLines(invoices, "2026-10-21"), ["fab", "may"]);
    const sites = new Map([["fab", { name: "SMART FIT FABRICATO", address: "Carrera 50 # 38 A-185", city: "Bello" }], ["may", { name: "SMART FIT MAYORCA" }]]);
    const sheets = receivablesSheets({ clients, totals, sites, cutoff: "2026-10-21", scope: "GRUPO PROFITNESS SAS" });
    expect(sheets.map((s) => s.name)).toEqual(["Resumen General", "SMART FIT FABRICATO", "SMART FIT MAYORCA", "Sin sede identificada"]);
    expect(sheets[0].rows[0]).toEqual([1, "GRUPO PROFITNESS SAS", "901656887", "SMART FIT FABRICATO", "Carrera 50 # 38 A-185, Bello", 2, 315000, 0, 315000, 157500, 157500, 0]);
    expect(sheets[0].rows.at(-1)?.[1]).toBe("SUBTOTAL GRUPO PROFITNESS SAS");
    expect(sheets[0].totals).toEqual(["", "TOTAL GENERAL", "", "", "", 4, 1097250, 50000, 1047250, 157500, 157500, 732250]);
    expect(sheets[1].rows.map((r) => [r[0], r[5], r[8]])).toEqual([["FV-2-731", "Vencida", 157500], ["FV-2-748", "Vence hoy", 157500]]);
  });
});

describe("sede from an invoice's observations", () => {
  const sites = [
    { id: "10", name: "SMART FIT 10" }, { id: "sd", name: "SMART FIT SAN DIEGO" }, { id: "fab", name: "SMART FIT FABRICATO" },
    { id: "mil", name: "DISTRITO MILLA DE ORO" }, { id: "jum", name: "JUMBO DE LAS VEGAS" }, { id: "sf", name: "C.C. SANTA FE" },
  ];
  it.each([
    ["Pedido Café Amantti #bbe3a454 · FABRICATO", "fab"],
    ["Pedido Café Amantti #9283a8ac · SANDIEGO", "sd"],
    ["Pedido Café Amantti #949e480c · MILLA DE ORO", "mil"],
    ["Pedido Café Amantti #554f9f32 · JUMBO", "jum"],
    ["Pedido Café Amantti #7ba14ac2 · SANTA FE", "sf"],
  ])("%s → %s", (obs, id) => expect(siteFromObservations(obs, sites)?.id).toBe(id));
  it("none when nothing (or too little) matches", () => {
    expect(siteFromObservations("Favor Consignar en la cuenta 108900463473 ahorros Davivienda", sites)).toBeNull();
    expect(siteFromObservations("Pedido Café Amantti #ded7b7ce · SMARTCOFFE LA 10", sites)).toBeNull();
    expect(siteFromObservations("Pedido Café Amantti #1 · SMART FIT", sites)).toBeNull(); // several
  });
});

describe("sedes", () => {
  it("label and next Siigo branch", () => {
    expect(siteLabel({ name: "Smart Fit 10", address: "Calle 10 # 43 E 60", city: "Medellín" })).toBe("Smart Fit 10 — Calle 10 # 43 E 60, Medellín");
    expect(siteLabel({ name: "Bodega" })).toBe("Bodega");
    expect(nextBranchOffice([0, 2, null, undefined])).toBe(3);
    expect(nextBranchOffice([])).toBe(1);
  });
});
