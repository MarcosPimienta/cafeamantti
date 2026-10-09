import { REFERENCE_OPTIONS } from "@/utils/maquila";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";
import type { MaquilaProposalInput } from "../actions";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { saveMaquilaProposal, getMaquilaProposals, getMaquilaProposal, deleteMaquilaProposal, getMaquilaOptionPrices, saveMaquilaOptionPrices } from "../actions";

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
  settings: { merma_pct: 1, apply_iva: true, iva_pct: 19, design_fee: 1500000, design_cost: 600000, background_path: null, background_opacity: 0.5, ally_logo_path: null, option_prices: null },
  lines: [
    {
      id: "l1",
      presentation: "Bolsa 250 g",
      profile: "premium",
      coffee_cost_per_kg: 40000,
      grams: 250,
      units: 400,
      materials: [{ code: null, name: "Bolsa kraft", unit_cost: 1200, qty: 1, supplied_by: "amantti" }],
      labor_per_unit: 400,
      target_margin_pct: 35,
      price_per_unit: null,
      options: { ...REFERENCE_OPTIONS },
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
    ["merma too high", { settings: { merma_pct: 80, apply_iva: true, iva_pct: 19, design_fee: 0, design_cost: 0, background_path: null, background_opacity: 0.5, ally_logo_path: null, option_prices: null } }, /merma/],
    ["a minimum under 200", { minimum_units: 150 }, /200 unidades por presentación/],
    ["a negative design fee", { settings: { merma_pct: 1, apply_iva: true, iva_pct: 19, design_fee: -1, design_cost: 0, background_path: null, background_opacity: 0.5, ally_logo_path: null, option_prices: null } }, /diseño/],
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
    await expect(saveMaquilaProposal(input({ lines: [{ ...line, units: 150 }] }))).rejects.toThrow(/al menos 200 unidades/);
    await expect(saveMaquilaProposal(input({ minimum_units: 300, lines: [{ ...line, units: 250 }] }))).rejects.toThrow(/al menos 300 unidades/);
    await expect(saveMaquilaProposal(input({ lines: [{ ...line, units: 200.5 }] }))).rejects.toThrow(/entero/);
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

describe("bag option prices", () => {
  const table = (price: number, cost: number) =>
    ["valvula", "peel_stick", "sticker", "cara", "tinta_adicional"].map((key) => ({ key, price, cost }));
  const P = { valvula: { price: 800, cost: 450 }, peel_stick: { price: 600, cost: 250 }, sticker: { price: 400, cost: 150 }, cara: { price: 1000, cost: 350 }, tinta_adicional: { price: 500, cost: 120 } };

  it("reads and replaces the general table", async () => {
    db.tables.maquila_option_prices = table(0, 0);
    expect((await getMaquilaOptionPrices()).valvula).toEqual({ price: 0, cost: 0 });
    await saveMaquilaOptionPrices(P);
    expect(await getMaquilaOptionPrices()).toEqual(P);
    expect(db.rows("maquila_option_prices")).toHaveLength(5);
    await expect(saveMaquilaOptionPrices({ ...P, sticker: { price: -1, cost: 0 } })).rejects.toThrow(/Sticker/);
  });

  it("a proposal keeps a copy of the prices it was quoted with", async () => {
    db.tables.maquila_option_prices = table(100, 50);
    const { id } = await saveMaquilaProposal(input());
    expect(db.byId("maquila_proposals", id)!.settings.option_prices.cara).toEqual({ price: 100, cost: 50 });
    // Later changes to the general table do not touch it…
    await saveMaquilaOptionPrices(P);
    expect(db.byId("maquila_proposals", id)!.settings.option_prices.cara).toEqual({ price: 100, cost: 50 });
    // …and prices edited for this proposal are kept as sent.
    await saveMaquilaProposal(input({ settings: { ...input().settings, option_prices: P } }), id);
    expect(db.byId("maquila_proposals", id)!.settings.option_prices).toEqual(P);
  });

  it("validates the options of each presentation", async () => {
    const line = input().lines[0];
    await expect(saveMaquilaProposal(input({ lines: [{ ...line, options: { ...line.options, tintas: 0 } }] }))).rejects.toThrow(/tintas/);
    await expect(saveMaquilaProposal(input({ lines: [{ ...line, options: { ...line.options, tintas: 9 } }] }))).rejects.toThrow(/tintas/);
    await expect(saveMaquilaProposal(input({ lines: [{ ...line, options: { ...line.options, valvula: "sí" as never } }] }))).rejects.toThrow(/Opciones de empaque/);
  });

  it("works with zeros before the migration is applied", async () => {
    db.failOn("maquila_option_prices", "select", 'relation "public.maquila_option_prices" does not exist');
    expect((await getMaquilaOptionPrices()).cara).toEqual({ price: 0, cost: 0 });
    db.failOn("maquila_option_prices", "insert", 'relation "public.maquila_option_prices" does not exist');
    await expect(saveMaquilaOptionPrices(P)).rejects.toThrow(/20261014000000_maquila_option_prices/);
  });
});
