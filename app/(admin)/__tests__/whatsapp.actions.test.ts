import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { sendPendingOrdersWhatsApp } from "../actions";

let db: FakeDB;
beforeEach(() => {
  db = seedDB({ orders: [{ id: "o1-x", status: "processing", total_amount: 50000, created_at: "2026-10-05T00:00:00Z" }] });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WHATSAPP_PROVIDER;
  delete process.env.WHATSAPP_TO;
});

describe("sendPendingOrdersWhatsApp", () => {
  it("sends now and logs who triggered it", async () => {
    process.env.WHATSAPP_PROVIDER = "callmebot";
    process.env.WHATSAPP_TO = "+573001112233:111";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "ok" }));
    const res = await sendPendingOrdersWhatsApp();
    expect(res).toMatchObject({ success: true, pendingCount: 1 });
    expect(db.rows("notification_logs")[0]).toMatchObject({ trigger: "manual", created_by: ADMIN_ID, success: true });
  });

  it("without configuration it reports why and logs the failed attempt", async () => {
    const res = await sendPendingOrdersWhatsApp();
    expect(res.success).toBe(false);
    expect(db.rows("notification_logs")[0]).toMatchObject({ success: false, error: expect.stringMatching(/no está configurado/) });
  });

  it("is admin-only", async () => {
    h.client = createFakeClient(db, null);
    await expect(sendPendingOrdersWhatsApp()).rejects.toThrow("Unauthorized");
  });
});
