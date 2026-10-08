import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { FakeDB, createFakeClient } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDB }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => createFakeClient(h.db, null) }));

import { POST } from "../webhooks/epayco/route";

const CUST = "cust-1";
const KEY = "secret-key";

function sign(p: Record<string, string>) {
  return crypto
    .createHash("sha256")
    .update(`${CUST}^${KEY}^${p.x_ref_payco}^${p.x_transaction_id}^${p.x_amount}^${p.x_currency_code}`)
    .digest("hex");
}

function payload(over: Record<string, string> = {}) {
  const p: Record<string, string> = {
    x_ref_payco: "REF1",
    x_transaction_id: "TX1",
    x_amount: "90000.00",
    x_currency_code: "COP",
    x_id_invoice: "order-1",
    x_cod_transaction_state: "1",
    ...over,
  };
  if (!("x_signature" in over)) p.x_signature = sign(p);
  return p;
}

const asForm = (p: Record<string, string>) =>
  new Request("https://x/api/webhooks/epayco", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(p).toString(),
  });

const asJson = (p: Record<string, string>) =>
  new Request("https://x/api/webhooks/epayco", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });

beforeEach(() => {
  process.env.P_CUST_ID_CLIENTE = CUST;
  process.env.P_KEY = KEY;
  h.db = new FakeDB({
    orders: [{ id: "order-1", status: "pending", total_amount: 90000 }],
    subscriptions: [
      { id: "sub-1", user_id: "u1", plan_id: "premium", frequency: "bi-weekly", status: "pending", payment_status: "pending", weight: "500g", grind: "whole", shipping_address: "Cra 1", shipping_city: "Medellín", shipping_state: "Antioquia" },
    ],
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.P_CUST_ID_CLIENTE;
  delete process.env.P_KEY;
});

const order = () => h.db.byId("orders", "order-1")!;

describe("ePayco webhook — authenticity", () => {
  it("accepts a correctly signed confirmation (form-encoded, as ePayco sends it)", async () => {
    const res = await POST(asForm(payload()));
    expect(res.status).toBe(200);
    expect(order()).toMatchObject({ status: "paid", epayco_ref_payco: "REF1", epayco_transaction_id: "TX1" });
  });

  it("also accepts JSON", async () => {
    expect((await POST(asJson(payload()))).status).toBe(200);
    expect(order().status).toBe("paid");
  });

  it("rejects a wrong signature", async () => {
    const res = await POST(asForm(payload({ x_signature: "deadbeef" })));
    expect(res.status).toBe(400);
    expect(order().status).toBe("pending");
  });

  it("rejects an unsigned request (anyone could otherwise mark orders paid)", async () => {
    const p = payload();
    delete p.x_signature;
    const res = await POST(asForm(p));
    expect(res.status).toBe(400);
    expect(order().status).toBe("pending");
  });

  it("rejects everything when the keys are not configured (fail closed)", async () => {
    delete process.env.P_KEY;
    const res = await POST(asForm(payload()));
    expect(res.status).toBe(500);
    expect(order().status).toBe("pending");
  });

  it("a signature for another amount does not validate a tampered amount", async () => {
    const p = payload();
    p.x_amount = "1000.00"; // signature was computed for 90000.00
    expect((await POST(asForm(p))).status).toBe(400);
  });
});

describe("ePayco webhook — one-time orders", () => {
  it("does not mark paid when the amount paid differs from the order total", async () => {
    const res = await POST(asForm(payload({ x_amount: "1000.00" })));
    expect(res.status).toBe(400);
    expect(order().status).toBe("pending");
  });

  it("tolerates cents formatting (\"90000.00\" vs 90000)", async () => {
    expect((await POST(asForm(payload({ x_amount: "90000.4" })))).status).toBe(200);
  });

  it.each(["2", "4", "6"])("state %s (rejected / failed) cancels the order", async (state) => {
    await POST(asForm(payload({ x_cod_transaction_state: state })));
    expect(order().status).toBe("cancelled");
  });

  it("state 3 (pending) leaves the order untouched", async () => {
    await POST(asForm(payload({ x_cod_transaction_state: "3" })));
    expect(order().status).toBe("pending");
  });

  it("an unknown order is a 404, not a silent success", async () => {
    expect((await POST(asForm(payload({ x_id_invoice: "nope" })))).status).toBe(404);
  });
});

describe("ePayco webhook — subscriptions", () => {
  it("a paid renewal activates the subscription and creates the fulfillment order", async () => {
    const res = await POST(asForm(payload({ x_id_invoice: "SUB-sub-1", x_amount: "52000.00" })));
    expect(res.status).toBe(200);
    const sub = h.db.byId("subscriptions", "sub-1")!;
    expect(sub).toMatchObject({ status: "active", payment_status: "active", epayco_ref_payco: "REF1" });
    const daysAhead = (Date.parse(sub.next_delivery_date) - Date.now()) / 86400000;
    expect(Math.round(daysAhead)).toBe(14); // bi-weekly

    const renewal = h.db.rows("orders").find((o) => o.subscription_id === "sub-1")!;
    expect(renewal).toMatchObject({ status: "paid", total_amount: 52000, is_subscription_renewal: true, user_id: "u1" });
    expect(h.db.rows("order_items")[0]).toMatchObject({ order_id: renewal.id, product_id: "premium", quantity: 1, price_at_time: 52000 });
  });

  it("a failed renewal marks the payment as failed without creating orders", async () => {
    await POST(asForm(payload({ x_id_invoice: "SUB-sub-1", x_cod_transaction_state: "4" })));
    expect(h.db.byId("subscriptions", "sub-1")!.payment_status).toBe("failed");
    expect(h.db.rows("orders")).toHaveLength(1);
  });
});
