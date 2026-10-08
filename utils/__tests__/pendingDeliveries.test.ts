import { describe, it, expect } from "vitest";
import {
  bogotaToday,
  orderCustomer,
  getPendingDeliveries,
  buildPendingDeliveriesMessage,
  UNDELIVERED_STATUSES,
  type PendingOrder,
} from "../orders/pendingDeliveries";

const NOW = new Date("2026-10-08T15:00:00Z"); // 10:00 a. m. in Bogotá

describe("bogotaToday", () => {
  it("uses Colombia's calendar day, not UTC's", () => {
    // 02:00 UTC on the 9th is still the evening of the 8th in Bogotá.
    expect(bogotaToday(new Date("2026-10-09T02:00:00Z"))).toBe("2026-10-08");
    expect(bogotaToday(new Date("2026-10-09T05:00:00Z"))).toBe("2026-10-09");
  });
});

describe("orderCustomer", () => {
  it("prefers the CRM client, then the recipient, then the email", () => {
    expect(orderCustomer({ client: { name: "Okus" }, shipping_info: { recipient_name: "Ana" } })).toBe("Okus");
    expect(orderCustomer({ client: [{ name: "Niku" }] })).toBe("Niku");
    expect(orderCustomer({ client: null, shipping_info: { recipient_name: "Ana" }, contact_email: "a@b.co" })).toBe("Ana");
    expect(orderCustomer({ contact_email: "a@b.co" })).toBe("a@b.co");
    expect(orderCustomer({})).toBe("Sin cliente");
  });
});

describe("getPendingDeliveries", () => {
  function fakeSupabase(rows: unknown[], error: { message: string } | null = null) {
    const calls: Record<string, unknown[]> = {};
    const builder = {
      select: (...a: unknown[]) => ((calls.select = a), builder),
      in: (...a: unknown[]) => ((calls.in = a), builder),
      order: (...a: unknown[]) => {
        calls.order = a;
        return Promise.resolve({ data: rows, error });
      },
    };
    return { client: { from: (t: string) => ((calls.from = [t]), builder) }, calls };
  }

  it("only asks for orders that still have to reach the customer", async () => {
    const { client, calls } = fakeSupabase([]);
    await getPendingDeliveries(client, NOW);
    expect(calls.from).toEqual(["orders"]);
    expect(calls.in).toEqual(["status", [...UNDELIVERED_STATUSES]]);
    expect(UNDELIVERED_STATUSES).not.toContain("delivered");
    expect(UNDELIVERED_STATUSES).not.toContain("cancelled");
  });

  it("computes days open and flags overdue promises (due before today)", async () => {
    const { client } = fakeSupabase([
      { id: "a", status: "paid", total_amount: "140500", created_at: "2026-10-06T15:00:00Z", delivery_due_date: "2026-10-07", shipping_info: { city: "Medellín" }, client: { name: "Okus" } },
      { id: "b", status: "processing", total_amount: 50000, created_at: "2026-10-08T14:00:00Z", delivery_due_date: "2026-10-08" },
      { id: "c", status: "shipped", total_amount: null, created_at: "2026-10-01T15:00:00Z", delivery_due_date: null },
    ]);
    const res = await getPendingDeliveries(client, NOW);
    expect(res.map((o) => [o.id, o.daysOpen, o.overdue])).toEqual([
      ["a", 2, true],
      ["b", 0, false], // due today is not late yet
      ["c", 7, false], // no promise, never overdue
    ]);
    expect(res[0]).toMatchObject({ total_amount: 140500, customer: "Okus", city: "Medellín" });
    expect(res[2].total_amount).toBe(0);
  });

  it("surfaces database errors instead of reporting zero pending", async () => {
    const { client } = fakeSupabase([], { message: "boom" });
    await expect(getPendingDeliveries(client, NOW)).rejects.toThrow("boom");
  });
});

describe("buildPendingDeliveriesMessage", () => {
  const o = (id: string, status: string, extra: Partial<PendingOrder> = {}): PendingOrder => ({
    id: `${id}-0000-0000`,
    status,
    total_amount: 100000,
    created_at: "2026-10-01T00:00:00Z",
    delivery_due_date: null,
    customer: `Cliente ${id}`,
    city: null,
    daysOpen: 1,
    overdue: false,
    ...extra,
  });

  it("says everything is up to date when nothing is pending", () => {
    expect(buildPendingDeliveriesMessage([])).toMatch(/No hay órdenes pendientes/);
  });

  it("puts overdue orders first, then groups the rest by status in pipeline order", () => {
    const msg = buildPendingDeliveriesMessage([
      o("ship1", "shipped"),
      o("paid1", "paid", { delivery_due_date: "2026-10-09" }),
      o("late1", "processing", { overdue: true, delivery_due_date: "2026-10-04", city: "Medellín" }),
      o("pend1", "pending"),
    ]);
    expect(msg.split("\n")[0]).toBe("☕ Café Amantti — 4 órdenes pendientes por entregar (1 atrasada)");
    const order = ["*Atrasadas*", "#late1", "*Pendiente de pago*", "#pend1", "*Pagado*", "#paid1", "*Enviado*", "#ship1"].map((s) =>
      msg.indexOf(s)
    );
    expect(order.every((pos) => pos >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(msg).toContain("#late1 Cliente late1 (Medellín)");
    expect(msg).toMatch(/⚠️ vencida 4 de oct/);
    expect(msg).toMatch(/entrega 9 de oct/);
    expect(msg).not.toContain("*Preparando*"); // the only processing order is listed as overdue
  });

  it("uses the singular for one order", () => {
    expect(buildPendingDeliveriesMessage([o("x", "paid")])).toMatch(/— 1 orden pendiente por entregar$/m);
  });

  it("caps the list and says how many more are on the board", () => {
    const many = Array.from({ length: 30 }, (_, i) => o(`o${i}`, "paid"));
    const msg = buildPendingDeliveriesMessage(many, 25);
    expect(msg.match(/^• /gm)).toHaveLength(25);
    expect(msg).toMatch(/…y 5 más en el tablero\./);
  });
});
