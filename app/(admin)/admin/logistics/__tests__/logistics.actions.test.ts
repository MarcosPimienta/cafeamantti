import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createShipment, deleteShipment, getLogisticsData, getShipmentEvents, updateShipment, updateShipmentStatus } from "../actions";

let db: FakeDB;
const recent = new Date(Date.now() - 3 * 86400000).toISOString();

beforeEach(() => {
  db = seedDB({
    clients: [
      { id: "okus", name: "Okus", city: "Bogotá" },
      { id: "niku", name: "Niku", city: "Medellín" },
    ],
    orders: [{ id: "o1", client_id: "okus", status: "delivered", created_at: recent, total_amount: 300000, siigo_invoice: "FV-2-800" }],
    shipments: [],
    shipment_events: [],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

describe("creating shipments", () => {
  it("cleans the guía, takes the client from the order and starts in transit when it has a ship date", async () => {
    const { shipment } = await createShipment({ carrier: "servientrega", trackingNumber: " 2093 4455-01 ", orderId: "o1", shipDate: "2026-11-20", cost: 18000 });
    expect(shipment).toMatchObject({ tracking_number: "2093445501", client_id: "okus", scope: "nacional", status: "en_transito", ship_date: "2026-11-20" });
    expect(db.rows("shipment_events")).toHaveLength(1);
  });

  it("DHL is international by default; without ship date it is being prepared", async () => {
    const { shipment } = await createShipment({ carrier: "dhl", destinationCountry: "Estados Unidos", currency: "USD", cost: 85 });
    expect(shipment).toMatchObject({ scope: "internacional", status: "preparando", currency: "USD", destination_country: "Estados Unidos" });
  });

  it("rejects an order of another client and an ETA before the ship date", async () => {
    await expect(createShipment({ carrier: "coordinadora", clientId: "niku", orderId: "o1" })).rejects.toThrow("otro cliente");
    await expect(createShipment({ carrier: "coordinadora", shipDate: "2026-11-20", estimatedDate: "2026-11-19" })).rejects.toThrow("estimada");
  });

  it("links the shipment to client and order in the data", async () => {
    await createShipment({ carrier: "fedex", orderId: "o1" });
    const data = await getLogisticsData();
    expect(data.migrated).toBe(true);
    expect(data.shipments[0]).toMatchObject({ client: { name: "Okus" }, order: { siigo_invoice: "FV-2-800" } });
    expect(data.orders.map((o) => o.id)).toEqual(["o1"]);
  });
});

describe("following up", () => {
  it("delivering sets the date and keeps the history", async () => {
    const { shipment } = await createShipment({ carrier: "servientrega", shipDate: "2026-11-18" });
    await updateShipmentStatus({ id: shipment.id, status: "novedad", date: "2026-11-19", description: "Dirección errada" });
    await updateShipmentStatus({ id: shipment.id, status: "entregado", date: "2026-11-20" });
    expect(db.byId("shipments", shipment.id)).toMatchObject({ status: "entregado", delivered_date: "2026-11-20" });
    const events = await getShipmentEvents(shipment.id);
    expect(events.map((e: { status: string }) => e.status)).toEqual(["entregado", "novedad", "en_transito"]);
  });

  it("a note alone needs text; a date before shipping is rejected", async () => {
    const { shipment } = await createShipment({ carrier: "servientrega", shipDate: "2026-11-18" });
    await expect(updateShipmentStatus({ id: shipment.id, status: null, date: "2026-11-19" })).rejects.toThrow("nota");
    await expect(updateShipmentStatus({ id: shipment.id, status: "entregado", date: "2026-11-17" })).rejects.toThrow("antes del envío");
    await updateShipmentStatus({ id: shipment.id, date: "2026-11-19", description: "Llamé al cliente" });
    expect(db.byId("shipments", shipment.id)!.status).toBe("en_transito");
    expect(db.rows("shipment_events")).toHaveLength(2);
  });

  it("edits details and deletes", async () => {
    const { shipment } = await createShipment({ carrier: "servientrega" });
    await updateShipment(shipment.id, { carrier: "coordinadora", trackingNumber: "555", destinationCity: "Cali" });
    expect(db.byId("shipments", shipment.id)).toMatchObject({ carrier: "coordinadora", tracking_number: "555", destination_city: "Cali" });
    await deleteShipment(shipment.id);
    expect(db.rows("shipments")).toHaveLength(0);
  });
});
