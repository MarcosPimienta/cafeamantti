import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import {
  getComodatosData,
  getUnitHistory,
  registerEquipmentUnit,
  assignComodato,
  returnComodato,
  updateEquipmentStatus,
} from "../actions";

let db: FakeDB;
const stock = () => db.byId("inventory", "espresso")!.current_stock;
const unit = (id: string) => db.byId("equipment_units", id)!;
const recent = new Date(Date.now() - 3 * 86400000).toISOString();

beforeEach(() => {
  db = seedDB({
    inventory: [
      { id: "espresso", product_code: "EQP-ESP-001", product_name: "Máquina espresso 2 grupos", category: "equipo", current_stock: 1 },
      { id: "cafe2k5", product_code: "CAFT-2K5", product_name: "Café 2.5kg", category: "cafe", current_stock: 10 },
    ],
    clients: [
      { id: "okus", name: "Okus" },
      { id: "niku", name: "Niku" },
    ],
    orders: [{ id: "o1", client_id: "okus", status: "paid", created_at: recent }],
    order_items: [{ id: "oi1", order_id: "o1", inventory_id: "cafe2k5", quantity: 2 }],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

async function registerTwo() {
  const a = await registerEquipmentUnit({ inventoryId: "espresso", serial: "LM-001", date: "2026-10-01" });
  const b = await registerEquipmentUnit({ inventoryId: "espresso", serial: "LM-002", date: "2026-10-01" });
  return [a.unit.id as string, b.unit.id as string];
}

describe("registering machines", () => {
  it("the first unit claims the model's existing stock; extra units become entradas", async () => {
    await registerTwo();
    expect(stock()).toBe(2); // was 1: only the second unit adds stock
    const moves = db.rows("inventory_movements");
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ inventory_id: "espresso", quantity: 1, type: "entrada", reason: "Alta de equipo serial LM-002" });
    expect(db.rows("equipment_events").map((e) => e.kind)).toEqual(["alta", "alta"]);
  });

  it("only equipment models can have units", async () => {
    await expect(registerEquipmentUnit({ inventoryId: "cafe2k5", serial: "x" })).rejects.toThrow(/categoría Equipo/);
  });
});

describe("lending lifecycle", () => {
  it("assign → shows who has it and the coffee they bought → return to maintenance → back in service", async () => {
    const [u1] = await registerTwo();
    const stockBefore = stock();

    await assignComodato({ unitId: u1, clientId: "okus", startDate: "2026-10-02", monthlyCommitmentKg: 8, notes: "Contrato firmado" });
    expect(unit(u1).status).toBe("en_comodato");
    expect(stock()).toBe(stockBefore); // lending never moves stock

    const data = await getComodatosData();
    const lent = data.units.find((u) => u.id === u1)!;
    expect(lent.client).toMatchObject({ name: "Okus" });
    expect(lent.assignment).toMatchObject({ start_date: "2026-10-02", monthly_commitment_kg: 8 });
    expect(data.kgLast30ByClient).toEqual({ okus: 5 }); // 2 × 2.5 kg

    await returnComodato({ unitId: u1, endDate: "2026-10-20", returnTo: "mantenimiento", notes: "Falla la bomba" });
    expect(unit(u1).status).toBe("mantenimiento");
    expect(db.rows("comodato_assignments")[0]).toMatchObject({ end_date: "2026-10-20", return_notes: "Falla la bomba" });

    await updateEquipmentStatus({ unitId: u1, action: "disponible", date: "2026-10-25", description: "Bomba cambiada", cost: 250000 });
    expect(unit(u1).status).toBe("disponible");

    const history = await getUnitHistory(u1);
    expect(history.assignments).toHaveLength(1);
    expect(history.events.map((e: { kind: string }) => e.kind).sort()).toEqual(["alta", "devolucion", "entrega", "reparacion"]);
  });

  it("a machine cannot be lent twice or retired while a client has it", async () => {
    const [u1] = await registerTwo();
    await assignComodato({ unitId: u1, clientId: "okus", startDate: "2026-10-02" });
    await expect(assignComodato({ unitId: u1, clientId: "niku", startDate: "2026-10-03" })).rejects.toThrow(/disponible/);
    await expect(updateEquipmentStatus({ unitId: u1, action: "baja", date: "2026-10-03" })).rejects.toThrow(/devuelta/);
    expect(db.rows("comodato_assignments")).toHaveLength(1);
  });

  it("validates the client, dates and commitment", async () => {
    const [u1] = await registerTwo();
    await expect(assignComodato({ unitId: u1, clientId: "ghost", startDate: "2026-10-02" })).rejects.toThrow(/cliente/);
    await expect(assignComodato({ unitId: u1, clientId: "okus", startDate: "02/10/2026" })).rejects.toThrow(/Fecha/);
    await expect(assignComodato({ unitId: u1, clientId: "okus", startDate: "2026-10-02", monthlyCommitmentKg: -3 })).rejects.toThrow(/compromiso/);
    await assignComodato({ unitId: u1, clientId: "okus", startDate: "2026-10-10" });
    await expect(returnComodato({ unitId: u1, endDate: "2026-10-01" })).rejects.toThrow(/antes de la entrega/);
  });

  it("retiring takes the machine out of stock and keeps it in history", async () => {
    const [, u2] = await registerTwo();
    await updateEquipmentStatus({ unitId: u2, action: "baja", date: "2026-11-01", description: "Daño irreparable" });
    expect(unit(u2).status).toBe("baja");
    expect(stock()).toBe(1);
    expect(db.rows("inventory_movements").at(-1)).toMatchObject({ quantity: -1, type: "salida", reason: "Baja de equipo serial LM-002" });
  });

  it("notes need text and do not change status", async () => {
    const [u1] = await registerTwo();
    await expect(updateEquipmentStatus({ unitId: u1, action: "nota", date: "2026-10-05" })).rejects.toThrow(/nota/);
    await updateEquipmentStatus({ unitId: u1, action: "nota", date: "2026-10-05", description: "Limpieza mensual" });
    expect(unit(u1).status).toBe("disponible");
  });
});

describe("before the migration / permissions", () => {
  it("reports a missing migration instead of crashing", async () => {
    db.failOn("equipment_units", "select", 'relation "public.equipment_units" does not exist');
    const data = await getComodatosData();
    expect(data.migrated).toBe(false);
  });

  it("is admin-only", async () => {
    h.client = createFakeClient(db, null);
    await expect(getComodatosData()).rejects.toThrow("Unauthorized");
    await expect(registerEquipmentUnit({ inventoryId: "espresso" })).rejects.toThrow("Unauthorized");
  });
});
