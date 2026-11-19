import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { duplicateProposal } from "../actions";

const CONTENT = [{ id: "b1", type: "price-table", title: "Café", items: [{ item: "Premium 2,5 kg", cost: 160000, pvp: 0, imageUrl: "proposals/foto.jpg" }] }];

let db: FakeDB;
beforeEach(() => {
  db = seedDB({
    proposals: [{
      id: "p1", title: "Café y kits", subtitle: "Café Amantti × Sunteca", content: CONTENT, status: "Enviada",
      client_id: null, custom_client_name: "Sunteca", ally_logo_url: "proposals/logo.png", background_image_url: "/images/Main_Background.jpg", background_opacity: 0.5,
    }],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

describe("duplicating a proposal", () => {
  it("makes a new draft with the same client, texts, prices and photos", async () => {
    const res = await duplicateProposal("p1");
    expect(res.success).toBe(true);
    const copy = db.rows("proposals").find((p) => p.id === res.id)!;
    expect(copy).toMatchObject({
      title: "Café y kits (copia)", subtitle: "Café Amantti × Sunteca", status: "Borrador", custom_client_name: "Sunteca",
      ally_logo_url: "proposals/logo.png", background_opacity: 0.5, content: CONTENT,
    });
    expect(db.rows("proposals")).toHaveLength(2);
  });

  it("fails cleanly when the proposal does not exist", async () => {
    const res = await duplicateProposal("nope");
    expect(res.success).toBe(false);
    expect(db.rows("proposals")).toHaveLength(1);
  });
});
