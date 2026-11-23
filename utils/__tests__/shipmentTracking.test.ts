import { describe, it, expect, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";
import { autoTrackedCarriers, mapDhl, mapFedex, planUpdate, syncOpenShipments, ymd } from "../shipmentTracking";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const env = { DHL_API_KEY: "k", FEDEX_CLIENT_ID: "id", FEDEX_CLIENT_SECRET: "secret" };

const dhlBody = {
  shipments: [
    {
      status: { timestamp: "2026-11-20T09:00:00-05:00", statusCode: "transit", description: "Shipment is being processed in customs" },
      estimatedTimeOfDelivery: "2026-11-24T18:00:00Z",
      events: [
        { timestamp: "2026-11-18T14:00:00-05:00", statusCode: "transit", description: "Shipment picked up", location: { address: { addressLocality: "MEDELLIN - COLOMBIA" } } },
        { timestamp: "2026-11-20T09:00:00-05:00", statusCode: "transit", description: "Shipment is being processed in customs", location: { address: { addressLocality: "MIAMI, FL - USA" } } },
      ],
    },
  ],
};

const fedexBody = (code: string, extra: object = {}) => ({
  output: {
    completeTrackResults: [
      {
        trackResults: [
          {
            latestStatusDetail: { derivedCode: code, statusByLocale: code === "DL" ? "Entregado" : "En tránsito" },
            dateAndTimes: [{ type: "ACTUAL_DELIVERY", dateTime: "2026-11-21T10:30:00-05:00" }],
            scanEvents: [{ date: "2026-11-19T08:00:00-05:00", eventType: "PU", derivedStatusCode: "PU", eventDescription: "Recogido", scanLocation: { city: "BOGOTA", countryName: "Colombia" } }],
            ...extra,
          },
        ],
      },
    ],
  },
});

describe("status mapping", () => {
  it("DHL: customs and out for delivery come from the text", () => {
    expect(mapDhl("transit", "Processed in customs")).toBe("en_aduana");
    expect(mapDhl("transit", "With delivery courier")).toBe("en_reparto");
    expect(mapDhl("transit", "Arrived at facility")).toBe("en_transito");
    expect(mapDhl("delivered")).toBe("entregado");
    expect(mapDhl("failure", "Returned to shipper")).toBe("devuelto");
    expect(mapDhl("failure", "Address incorrect")).toBe("novedad");
    expect(mapDhl("unknown")).toBeNull();
  });

  it("FedEx derived codes", () => {
    expect(mapFedex("DL")).toBe("entregado");
    expect(mapFedex("OD")).toBe("en_reparto");
    expect(mapFedex("CD")).toBe("en_aduana");
    expect(mapFedex("DE")).toBe("novedad");
    expect(mapFedex("RS")).toBe("devuelto");
    expect(mapFedex("ZZ")).toBeNull();
  });

  it("dates are the Bogotá day", () => {
    expect(ymd("2026-11-21T02:00:00Z")).toBe("2026-11-20");
    expect(ymd("2026-11-21T10:30:00-05:00")).toBe("2026-11-21");
    expect(ymd("2026-11-21T23:00:00")).toBe("2026-11-21");
  });

  it("only carriers with credentials are tracked", () => {
    expect(autoTrackedCarriers({})).toEqual([]);
    expect(autoTrackedCarriers({ DHL_API_KEY: "x" })).toEqual(["dhl"]);
    expect(autoTrackedCarriers(env)).toEqual(["dhl", "fedex"]);
  });
});

describe("planUpdate", () => {
  const row = { id: "s", carrier: "dhl" as const, tracking_number: "1", status: "en_transito" as const, ship_date: "2026-11-18", estimated_date: null, delivered_date: null, carrier_status: "en_transito" };
  const result = { status: "en_transito" as const, statusText: "x", estimatedDate: null, deliveredDate: null, events: [] };

  it("doesn't undo a manual change while the carrier's status stays the same", () => {
    const { update, changed } = planUpdate({ ...row, status: "novedad" }, result, "2026-11-21T12:00:00Z");
    expect(changed).toBeNull();
    expect(update.status).toBeUndefined();
  });

  it("follows the carrier when its status changes, and sets the delivery date", () => {
    const { update, changed } = planUpdate({ ...row, status: "novedad" }, { ...result, status: "entregado", deliveredDate: "2026-11-21" }, "2026-11-21T12:00:00Z");
    expect(changed).toBe("entregado");
    expect(update).toMatchObject({ status: "entregado", delivered_date: "2026-11-21", carrier_status: "entregado" });
  });
});

describe("syncOpenShipments", () => {
  let db: FakeDB;
  beforeEach(() => {
    db = seedDB({
      shipments: [
        { id: "d1", carrier: "dhl", tracking_number: "1234567890", status: "en_transito", scope: "internacional", ship_date: "2026-11-18", estimated_date: null, delivered_date: null, carrier_status: null },
        { id: "f1", carrier: "fedex", tracking_number: "777", status: "en_transito", scope: "internacional", ship_date: null, estimated_date: null, delivered_date: null, carrier_status: null },
        { id: "s1", carrier: "servientrega", tracking_number: "2093", status: "en_transito", scope: "nacional", ship_date: "2026-11-18", estimated_date: null, delivered_date: null, carrier_status: null },
        { id: "done", carrier: "dhl", tracking_number: "999", status: "entregado", scope: "internacional", ship_date: "2026-11-01", estimated_date: null, delivered_date: "2026-11-03", carrier_status: "entregado" },
      ],
      shipment_events: [],
    });
  });

  it("checks open DHL/FedEx guías, stores scans once and skips the rest", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (url.includes("dhl.com")) return json(dhlBody);
      if (url.includes("/oauth/token")) return json({ access_token: "t", expires_in: 3600 });
      return json(fedexBody("DL"));
    }) as typeof fetch;
    const client = createFakeClient(db, { id: ADMIN_ID });
    const now = new Date("2026-11-21T15:00:00Z");

    const first = await syncOpenShipments(client, { env, fetch: fake, now });
    expect(first).toMatchObject({ checked: 2, skipped: 1, newEvents: 3, errors: [] });
    expect(first.updated.map((u) => [u.id, u.status])).toEqual([["d1", "en_aduana"], ["f1", "entregado"]]);
    expect(db.byId("shipments", "d1")).toMatchObject({ status: "en_aduana", estimated_date: "2026-11-24", last_check_error: null });
    expect(db.byId("shipments", "f1")).toMatchObject({ status: "entregado", delivered_date: "2026-11-21", ship_date: "2026-11-19" });
    expect(calls.some((u) => u.includes("999"))).toBe(false);

    // Next run: same answers, nothing new. f1 is delivered now, so only d1 is asked.
    const second = await syncOpenShipments(client, { env, fetch: fake, now });
    expect(second).toMatchObject({ checked: 1, newEvents: 0, updated: [] });
    expect(db.rows("shipment_events")).toHaveLength(3);
  });

  it("keeps the error on the shipment and goes on with the others", async () => {
    const fake = (async (url: string) => (url.includes("dhl.com") ? json({}, 404) : url.includes("oauth") ? json({ access_token: "t" }) : json(fedexBody("IT")))) as typeof fetch;
    const r = await syncOpenShipments(createFakeClient(db, { id: ADMIN_ID }), { env, fetch: fake });
    expect(r.errors).toEqual([expect.objectContaining({ id: "d1", error: "DHL todavía no reconoce esa guía." })]);
    expect(db.byId("shipments", "d1")!.last_check_error).toBe("DHL todavía no reconoce esa guía.");
    expect(r.checked).toBe(2);
  });

  it("without credentials it checks nothing", async () => {
    const r = await syncOpenShipments(createFakeClient(db, { id: ADMIN_ID }), { env: {}, fetch: (async () => { throw new Error("no"); }) as typeof fetch });
    expect(r).toMatchObject({ checked: 0, skipped: 3 });
  });
});
