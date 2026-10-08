import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeDB, createFakeClient } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDB }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => createFakeClient(h.db, null) }));

import { GET } from "../cron/pending-orders/route";

const req = (auth?: string, query = "") =>
  new Request(`https://x/api/cron/pending-orders${query}`, { headers: auth ? { authorization: auth } : {} });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  process.env.WHATSAPP_PROVIDER = "callmebot";
  process.env.WHATSAPP_TO = "+573001112233:111";
  h.db = new FakeDB({
    orders: [
      { id: "a1b2c3d4-x", status: "paid", total_amount: 90000, created_at: "2026-10-01T15:00:00Z", shipping_info: { city: "Medellín" } },
      { id: "done-x", status: "delivered", total_amount: 1, created_at: "2026-10-01T15:00:00Z" },
    ],
  });
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "queued" });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ["CRON_SECRET", "WHATSAPP_PROVIDER", "WHATSAPP_TO"]) delete process.env[k];
});

describe("GET /api/cron/pending-orders", () => {
  it("is protected by CRON_SECRET", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is closed when no secret is configured (no empty-secret bypass)", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect((await GET(req("Bearer undefined"))).status).toBe(401);
  });

  it("sends the summary of undelivered orders and logs it", async () => {
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: true, pending: 1, recipients: ["+573001112233"] });
    const text = new URL(fetchMock.mock.calls[0][0]).searchParams.get("text")!;
    expect(text).toContain("#a1b2c3d4");
    expect(text).not.toContain("#done");
    expect(h.db.rows("notification_logs")[0]).toMatchObject({ trigger: "cron", kind: "pending_deliveries", success: true });
  });

  it("stays quiet when nothing is pending, unless forced", async () => {
    h.db.tables.orders = [];
    expect(await (await GET(req("Bearer s3cret"))).json()).toMatchObject({ sent: false, pending: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    await GET(req("Bearer s3cret", "?force=1"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a WhatsApp failure is a 502 and is still logged", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "down" });
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(502);
    expect(h.db.rows("notification_logs")[0]).toMatchObject({ success: false, error: expect.stringContaining("down") });
  });
});
