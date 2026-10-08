import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

import { upsertSubscription, getSubscription, updateSubscriptionStatus, deleteSubscription, getSubscriptionStock } from "../builder/actions";

let db: FakeDB;
const as = (id: string | null) => (h.client = createFakeClient(db, id ? { id } : null));

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const plan = {
  plan_id: "premium",
  frequency: "monthly",
  weight: "500g",
  grind: "ground",
  grind_level: "medio",
  shipping_state: "Antioquia",
  shipping_city: "Medellín",
  shipping_address: "Cra 1",
};

beforeEach(() => {
  db = new FakeDB({
    subscriptions: [{ id: "sub-ana", user_id: "ana", plan_id: "premium", status: "active" }],
    inventory: [
      { id: "i1", product_code: "CAFT-250G", category: "cafe", current_stock: "7" },
      { id: "i2", product_code: "EMP-BOLSA", category: "empaque", current_stock: 99 },
    ],
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("subscriptions", () => {
  it("requires a signed-in customer", async () => {
    as(null);
    expect(await upsertSubscription(form(plan))).toEqual({ error: "User not authenticated" });
    expect(await getSubscription("sub-ana")).toBeNull();
  });

  it("a new subscription waits for payment and keeps the grind level only for ground coffee", async () => {
    as("ana");
    const res = await upsertSubscription(form({ ...plan, custom_items: '[{"id":"x"}]' }));
    expect(res.success).toBe(true);
    const sub = db.byId("subscriptions", res.subscriptionId!)!;
    expect(sub).toMatchObject({ user_id: "ana", payment_status: "pending", grind_level: "medio", custom_items: [{ id: "x" }] });

    const whole = await upsertSubscription(form({ ...plan, grind: "whole" }));
    expect(db.byId("subscriptions", whole.subscriptionId!)!.grind_level).toBeNull();
  });

  it("ignores malformed custom items instead of failing", async () => {
    as("ana");
    const res = await upsertSubscription(form({ ...plan, custom_items: "{nope" }));
    expect(db.byId("subscriptions", res.subscriptionId!)!.custom_items).toEqual([]);
  });

  it("a customer cannot read, edit, pause or delete someone else's subscription", async () => {
    as("mallory");
    expect(await getSubscription("sub-ana")).toBeNull();
    const res = await upsertSubscription(form({ ...plan, plan_id: "hacked" }), "sub-ana");
    expect(res.error).toBeDefined();
    await updateSubscriptionStatus("sub-ana", "cancelled");
    await deleteSubscription("sub-ana");
    expect(db.byId("subscriptions", "sub-ana")).toMatchObject({ plan_id: "premium", status: "active" });
  });

  it("the owner can pause and delete", async () => {
    as("ana");
    await updateSubscriptionStatus("sub-ana", "paused");
    expect(db.byId("subscriptions", "sub-ana")!.status).toBe("paused");
    await deleteSubscription("sub-ana");
    expect(db.byId("subscriptions", "sub-ana")).toBeUndefined();
  });

  it("stock map is keyed by code and id, numbers only (coffee only)", async () => {
    as("ana");
    expect(await getSubscriptionStock()).toEqual({ "CAFT-250G": 7, i1: 7 });
  });
});
