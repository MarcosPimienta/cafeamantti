import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";
import type { MaquilaProposalInput } from "../actions";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { saveMaquilaProposal, getMaquilaProposals, getMaquilaProposal, deleteMaquilaProposal } from "../actions";

let db: FakeDB;
beforeEach(() => {
  db = seedDB({ clients: [{ id: "okus", name: "Okus" }] });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const input = (over: Partial<MaquilaProposalInput> = {}): MaquilaProposalInput => ({
  client_id: "okus",
  custom_client_name: null,
  title: "Propuesta de maquila de empaque",
  proposal_date: "2026-10-12",
  valid_until: "2026-11-12",
  status: "borrador",
  intro: "Hola",
  conditions: "Pago 50/50",
  minimum_units: 200,
  settings: { merma_pct: 1, apply_iva: true, iva_pct: 19, design_fee: 1500000, design_cost: 600000, background_path: null, background_opacity: 0.5, ally_logo_path: null },
  lines: [
    {
      id: "l1",
      presentation: "Bolsa 250 g",
      profile: "premium",
      coffee_cost_per_kg: 40000,
      grams: 250,
      monthly_units: 400,
      materials: [{ code: null, name: "Bolsa kraft", unit_cost: 1200, qty: 1, supplied_by: "amantti" }],
      labor_per_unit: 400,
      target_margin_pct: 35,
      price_per_unit: null,
    },
  ],
  internal_notes: "Cliente sensible a precio",
  ...over,
});

describe("maquila proposals", () => {
  it("creates, lists with the client name, updates and deletes", async () => {
    const { id } = await saveMaquilaProposal(input());
    expect(db.byId("maquila_proposals", id)).toMatchObject({ client_id: "okus", custom_client_name: null, created_by: ADMIN_ID, minimum_units: 200 });

    const list = await getMaquilaProposals();
    expect(list[0]).toMatchObject({ id, clients: { name: "Okus" } });

    await saveMaquilaProposal(input({ status: "enviada" }), id);
    expect((await getMaquilaProposal(id))!.status).toBe("enviada");

    await deleteMaquilaProposal(id);
    expect(db.rows("maquila_proposals")).toHaveLength(0);
  });

  it("keeps background and logo as storage paths and rejects anything else", async () => {
    const settings = { ...input().settings, background_path: "proposals/123_bg.jpg", ally_logo_path: "proposals/123_logo.png", background_opacity: 0.3 };
    const { id } = await saveMaquilaProposal(input({ settings }));
    expect(db.byId("maquila_proposals", id)!.settings).toMatchObject({ background_path: "proposals/123_bg.jpg", ally_logo_path: "proposals/123_logo.png" });

    await expect(saveMaquilaProposal(input({ settings: { ...settings, background_path: "https://evil.example/x.jpg" } }))).rejects.toThrow(/Imagen inválida/);
    await expect(saveMaquilaProposal(input({ settings: { ...settings, ally_logo_path: "../secret" } }))).rejects.toThrow(/Imagen inválida/);
    await expect(saveMaquilaProposal(input({ settings: { ...settings, background_opacity: 1.5 } }))).rejects.toThrow(/opacidad/);
    // "" = no background, null = Amantti's default: both valid
    await saveMaquilaProposal(input({ settings: { ...settings, background_path: "" } }));
    await saveMaquilaProposal(input({ settings: { ...settings, background_path: null } }));
  });

  it("without a minimum, the 200-unit rule is stored", async () => {
    const { id } = await saveMaquilaProposal(input({ minimum_units: null }));
    expect(db.byId("maquila_proposals", id)!.minimum_units).toBe(200);
  });

  it("a new client can be typed instead of picked", async () => {
    const { id } = await saveMaquilaProposal(input({ client_id: null, custom_client_name: "  Tostadora La Loma " }));
    expect(db.byId("maquila_proposals", id)).toMatchObject({ client_id: null, custom_client_name: "Tostadora La Loma" });
  });

  it.each([
    ["no client", { client_id: null, custom_client_name: " " }, /cliente/],
    ["no presentations", { lines: [] }, /al menos una presentación/],
    ["validity before date", { valid_until: "2026-10-01" }, /vigencia/],
    ["bad status", { status: "ganada" }, /Estado/],
    ["merma too high", { settings: { merma_pct: 80, apply_iva: true, iva_pct: 19, design_fee: 0, design_cost: 0, background_path: null, background_opacity: 0.5, ally_logo_path: null } }, /merma/],
    ["a minimum under 200", { minimum_units: 150 }, /200 unidades por presentación/],
    ["a negative design fee", { settings: { merma_pct: 1, apply_iva: true, iva_pct: 19, design_fee: -1, design_cost: 0, background_path: null, background_opacity: 0.5, ally_logo_path: null } }, /diseño/],
  ])("rejects %s", async (_label, over, msg) => {
    await expect(saveMaquilaProposal(input(over as Partial<MaquilaProposalInput>))).rejects.toThrow(msg);
    expect(db.rows("maquila_proposals")).toHaveLength(0);
  });

  it("validates each presentation and material", async () => {
    const line = input().lines[0];
    await expect(saveMaquilaProposal(input({ lines: [{ ...line, presentation: "" }] }))).rejects.toThrow(/nombre/);
    await expect(saveMaquilaProposal(input({ lines: [{ ...line, grams: 0 }] }))).rejects.toThrow(/gramos/);
    await expect(saveMaquilaProposal(input({ lines: [{ ...line, target_margin_pct: 100 }] }))).rejects.toThrow(/margen/);
    await expect(saveMaquilaProposal(input({ lines: [{ ...line, price_per_unit: -5 }] }))).rejects.toThrow(/Precio/);
    await expect(saveMaquilaProposal(input({ lines: [{ ...line, profile: "robusta" as never }] }))).rejects.toThrow(/perfil/);
    await expect(saveMaquilaProposal(input({ lines: [{ ...line, coffee_cost_per_kg: -1 }] }))).rejects.toThrow(/Costo del café/);
    await expect(
      saveMaquilaProposal(input({ lines: [{ ...line, materials: [{ ...line.materials[0], unit_cost: -1 }] }] }))
    ).rejects.toThrow(/Costo o cantidad/);
  });

  it("explains a missing migration", async () => {
    db.failOn("maquila_proposals", "insert", 'relation "public.maquila_proposals" does not exist');
    await expect(saveMaquilaProposal(input())).rejects.toThrow(/20261012000000_maquila_proposals/);
  });

  it("is admin-only", async () => {
    h.client = createFakeClient(db, null);
    await expect(saveMaquilaProposal(input())).rejects.toThrow("Unauthorized");
    await expect(getMaquilaProposals()).rejects.toThrow("Unauthorized");
  });
});
