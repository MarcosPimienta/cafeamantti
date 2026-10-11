"use client";

import React, { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PlugZap, RefreshCw, Save, Upload } from "lucide-react";
import { compareSiigoProducts, createSiigoProducts, linkSiigoProducts, saveSiigoSettings, testSiigoConnection } from "../../siigo/actions";
import type { SiigoSettings } from "@/utils/siigo/mapping";

type Option = { id: number; name: string };
type Catalogs = {
  invoiceTypes: Option[];
  purchaseTypes: Option[];
  sellers: Option[];
  salesPayments: Option[];
  purchasePayments: Option[];
  taxes: (Option & { percentage: number | null })[];
  accountGroups: Option[];
};
type Comparison = {
  linked: { id: string; code: string; siigoCode: string; appName: string; siigoName: string }[];
  missingInSiigo: { id: string; code: string; name: string; suggestion: string | null }[];
  missingInApp: { code: string; name: string }[];
  siigoProducts: { code: string; name: string }[];
};
type LogRow = { id: string; entity: string; status: string; siigo_name: string | null; message: string | null; created_at: string };

const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5";
const inputCls = "w-full px-3 py-2.5 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20";
const card = "bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-4";

const ENTITY_LABEL: Record<string, string> = { invoice: "Factura", customer: "Cliente", product: "Producto", purchase: "Compra", connection: "Conexión" };

function IdSelect({ id, label, value, options, onChange, hint }: {
  id: string; label: string; value: number | null | undefined; options: Option[] | null; onChange: (v: number | null) => void; hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {options ? (
        <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
          <option value="">— Sin elegir —</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          {value && !options.some((o) => o.id === value) && <option value={value}>ID {value} (ya no está activo)</option>}
        </select>
      ) : (
        <p className={`${inputCls} text-foreground/50`}>{value ? `ID ${value}` : "Prueba la conexión para elegir"}</p>
      )}
      {hint && <p className="text-[11px] text-foreground/40 mt-1">{hint}</p>}
    </div>
  );
}

export default function SiigoSettingsClient({
  configured, migrationApplied, initialSettings, log, expenseCategories, assetCategories,
}: {
  configured: boolean;
  migrationApplied: boolean;
  initialSettings: SiigoSettings;
  log: LogRow[];
  expenseCategories: string[];
  assetCategories: string[];
}) {
  const [settings, setSettings] = useState<SiigoSettings>(initialSettings);
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  // inventory id → chosen Siigo code ("" = not linked)
  const [links, setLinks] = useState<Record<string, string>>({});
  const currentLink = (id: string) => comparison?.linked.find((l) => l.id === id)?.siigoCode ?? "";
  const changedLinks = comparison
    ? [...comparison.linked.map((l) => l.id), ...comparison.missingInSiigo.map((p) => p.id)].filter((id) => (links[id] ?? "") !== currentLink(id))
    : [];
  const showComparison = (c: Comparison) => {
    setComparison(c);
    setSelected([]);
    setLinks(Object.fromEntries([...c.linked.map((l) => [l.id, l.siigoCode]), ...c.missingInSiigo.map((p) => [p.id, p.suggestion ?? ""])]));
  };
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const set = <K extends keyof SiigoSettings>(k: K, v: SiigoSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  function run(key: string, fn: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(key);
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setBusy(null);
      }
    });
  }

  const test = () => run("test", async () => {
    const res = await testSiigoConnection();
    if (!res.success) return setError(res.error);
    setCatalogs(res.catalogs);
    setNotice("✓ Conexión con Siigo verificada");
  });
  const save = () => run("save", async () => {
    const res = await saveSiigoSettings(settings);
    if (!res.success) return setError(res.error);
    setSettings(res.settings);
    setNotice("✓ Ajustes de Siigo guardados");
  });
  const compare = () => run("compare", async () => {
    const res = await compareSiigoProducts();
    if (!res.success) return setError(res.error);
    showComparison(res);
  });
  const saveLinks = () => run("links", async () => {
    const res = await linkSiigoProducts(changedLinks.map((id) => ({ inventoryId: id, siigoCode: links[id] || null })));
    if (!res.success) return setError(res.error);
    setNotice(`✓ ${res.linked} vínculo(s) guardados`);
    const again = await compareSiigoProducts();
    if (again.success) showComparison(again);
  });
  const createProducts = () => run("create", async () => {
    const res = await createSiigoProducts(selected);
    if (!res.success) return setError(res.error);
    setNotice(`✓ ${res.created.length} producto(s) creados en Siigo`);
    if (res.failed.length) setError(res.failed.join(" · "));
    const again = await compareSiigoProducts();
    if (again.success) showComparison(again);
  });

  const Spinner = ({ k, icon }: { k: string; icon: React.ReactNode }) => (busy === k ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{icon}</>);
  const btn = "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">
      <div className="space-y-6">
        {/* Connection */}
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-serif">Conexión</h2>
              <p className="text-xs text-foreground/50">Las credenciales van en las variables de entorno del servidor, nunca en la base de datos.</p>
            </div>
            <button type="button" onClick={test} disabled={!configured || !!busy} className={`${btn} bg-foreground text-background hover:bg-[#C59F59]`}>
              <Spinner k="test" icon={<PlugZap className="w-4 h-4" />} /> Probar conexión
            </button>
          </div>
          {!configured && (
            <div className="flex gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                Falta configurar <code>SIIGO_USERNAME</code> y <code>SIIGO_ACCESS_KEY</code> (y opcionalmente <code>SIIGO_PARTNER_ID</code>) en
                <code> .env.local</code> y en Vercel → Settings → Environment Variables. Después vuelve a desplegar.
              </div>
            </div>
          )}
          {!migrationApplied && (
            <div className="flex gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> Falta aplicar la migración 20261016000000_siigo_integration.sql.
            </div>
          )}
        </section>

        {/* Sales invoices */}
        <section className={card}>
          <h2 className="text-lg font-serif">Facturas de venta</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IdSelect id="sg-fv" label="Tipo de factura" value={settings.invoice_document_id} options={catalogs?.invoiceTypes ?? null} onChange={(v) => set("invoice_document_id", v)} />
            <IdSelect id="sg-seller" label="Vendedor" value={settings.seller_id} options={catalogs?.sellers ?? null} onChange={(v) => set("seller_id", v)} />
            <IdSelect id="sg-pay-web" label="Forma de pago · ventas web (ePayco)" value={settings.payment_web_id} options={catalogs?.salesPayments ?? null} onChange={(v) => set("payment_web_id", v)} />
            <IdSelect id="sg-pay-cash" label="Forma de pago · efectivo" value={settings.payment_cash_id} options={catalogs?.salesPayments ?? null} onChange={(v) => set("payment_cash_id", v)} />
            <IdSelect id="sg-pay-transfer" label="Forma de pago · transferencia" value={settings.payment_transfer_id} options={catalogs?.salesPayments ?? null} onChange={(v) => set("payment_transfer_id", v)} />
            <IdSelect id="sg-tax" label="IVA de los productos" value={settings.sales_tax_id} options={catalogs?.taxes.map((t) => ({ id: t.id, name: t.name })) ?? null} onChange={(v) => set("sales_tax_id", v)}
              hint="Los precios de la app ya incluyen este IVA. Sin elegir = productos sin IVA (excluidos)." />
            <div>
              <label htmlFor="sg-ship" className={labelCls}>Código del servicio de envío en Siigo</label>
              <input id="sg-ship" value={settings.shipping_product_code ?? ""} onChange={(e) => set("shipping_product_code", e.target.value)} placeholder="Ej. ENVIO" className={inputCls} />
            </div>
            <div>
              <label htmlFor="sg-cf" className={labelCls}>Identificación de consumidor final</label>
              <input id="sg-cf" value={settings.final_consumer_identification ?? ""} onChange={(e) => set("final_consumer_identification", e.target.value)} className={inputCls} />
              <p className="text-[11px] text-foreground/40 mt-1">Para pedidos sin cliente con cédula o NIT. DIAN: 222222222222.</p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={!!settings.stamp_dian} onChange={(e) => set("stamp_dian", e.target.checked)} className="mt-1 w-4 h-4 accent-[#C59F59]" />
              <span className="text-sm">
                <strong>Enviar a la DIAN</strong> (factura electrónica)
                <span className="block text-xs text-foreground/50">Apagado, las facturas quedan creadas en Siigo sin enviarse a la DIAN: úsalo para probar. Encendido, cada factura se emite ante la DIAN y no se puede borrar, solo anular con nota crédito.</span>
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={!!settings.send_mail} onChange={(e) => set("send_mail", e.target.checked)} className="w-4 h-4 accent-[#C59F59]" />
              <span className="text-sm">Enviar la factura por correo al cliente</span>
            </label>
          </div>
        </section>

        {/* Purchases */}
        <section className={card}>
          <div>
            <h2 className="text-lg font-serif">Compras (gastos de Flujo de Caja)</h2>
            <p className="text-xs text-foreground/50">Cada gasto se envía como factura de compra con la cuenta contable de su categoría; los activos fijos, con su código de activo en Siigo.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IdSelect id="sg-fc" label="Tipo de factura de compra" value={settings.purchase_document_id} options={catalogs?.purchaseTypes ?? null} onChange={(v) => set("purchase_document_id", v)} />
            <IdSelect id="sg-pay-fc" label="Forma de pago de compras" value={settings.purchase_payment_id} options={catalogs?.purchasePayments ?? null} onChange={(v) => set("purchase_payment_id", v)} />
          </div>
          <details className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">Cuenta contable (PUC) por categoría</summary>
            <div className="space-y-2 mt-3">
              {expenseCategories.map((c) => (
                <div key={c} className="grid grid-cols-[1fr_140px] gap-2 items-center">
                  <span className="text-sm">{c}</span>
                  <input value={settings.expense_accounts?.[c] ?? ""} onChange={(e) => set("expense_accounts", { ...settings.expense_accounts, [c]: e.target.value.replace(/\D/g, "") })}
                    placeholder="Ej. 51359501" aria-label={`Cuenta de ${c}`} className={inputCls} />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-foreground/40 mt-3">Pídele a tu contadora las cuentas auxiliares que usa en Siigo. Las de inventario, activos fijos o impuestos no se aceptan aquí.</p>
          </details>
          <details className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">Código de activo fijo en Siigo por clase</summary>
            <div className="space-y-2 mt-3">
              {assetCategories.map((c) => (
                <div key={c} className="grid grid-cols-[1fr_140px] gap-2 items-center">
                  <span className="text-sm">{c}</span>
                  <input value={settings.fixed_asset_codes?.[c] ?? ""} onChange={(e) => set("fixed_asset_codes", { ...settings.fixed_asset_codes, [c]: e.target.value })}
                    aria-label={`Código de activo de ${c}`} className={inputCls} />
                </div>
              ))}
            </div>
          </details>
        </section>

        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={!!busy || !migrationApplied} className={`${btn} bg-[#C59F59] text-white hover:bg-[#b08d4f]`}>
            <Spinner k="save" icon={<Save className="w-4 h-4" />} /> Guardar ajustes
          </button>
        </div>

        {/* Products */}
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-serif">Productos</h2>
              <p className="text-xs text-foreground/50">Siigo numera sus productos (0040, 004…): vincula cada producto de la app con el suyo. Facturas y descargas usan ese vínculo.</p>
            </div>
            <button type="button" onClick={compare} disabled={!configured || !!busy} className={`${btn} border border-foreground/15 text-foreground/70 hover:bg-foreground/5`}>
              <Spinner k="compare" icon={<RefreshCw className="w-4 h-4" />} /> Comparar con Siigo
            </button>
          </div>
          <IdSelect id="sg-group" label="Grupo de inventario para productos nuevos" value={settings.product_account_group_id} options={catalogs?.accountGroups ?? null} onChange={(v) => set("product_account_group_id", v)} />
          {comparison && (
            <div className="space-y-4">
              <p className="text-sm"><strong>{comparison.linked.length}</strong> vinculados · <strong>{comparison.missingInSiigo.length}</strong> sin vincular · <strong>{comparison.missingInApp.length}</strong> solo en Siigo</p>
              <div>
                <p className={labelCls}>Producto de la app → producto en Siigo</p>
                <p className="text-[11px] text-foreground/50 mb-2">Las sugerencias salen del perfil y el tamaño; revísalas antes de guardar. Sin producto en Siigo, márcalo para crearlo.</p>
                <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                  {[...comparison.linked.map((l) => ({ id: l.id, code: l.code, name: l.appName, linked: true })), ...comparison.missingInSiigo.map((p) => ({ ...p, linked: false }))].map((row) => {
                    const value = links[row.id] ?? "";
                    const suggested = !row.linked && value && value === comparison.missingInSiigo.find((p) => p.id === row.id)?.suggestion;
                    return (
                      <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr_auto] gap-2 items-center">
                        <div className="text-sm min-w-0">
                          <span className="font-mono text-[11px] text-foreground/50">{row.code}</span> {row.name}
                          {row.linked && value === currentLink(row.id) && <span className="ml-2 text-[10px] font-bold text-emerald-700">vinculado</span>}
                          {suggested && <span className="ml-2 text-[10px] font-bold text-amber-700">sugerido</span>}
                        </div>
                        <select value={value} onChange={(e) => setLinks((m) => ({ ...m, [row.id]: e.target.value }))} aria-label={`Producto en Siigo para ${row.name}`} className={inputCls}>
                          <option value="">— Sin vincular —</option>
                          {comparison.siigoProducts.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
                        </select>
                        <label className={`flex items-center gap-1.5 text-xs ${value || row.linked ? "invisible" : ""}`}>
                          <input type="checkbox" checked={selected.includes(row.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, row.id] : s.filter((x) => x !== row.id)))} className="w-4 h-4 accent-[#C59F59]" />
                          Crear
                        </label>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button type="button" onClick={saveLinks} disabled={changedLinks.length === 0 || !!busy} className={`${btn} bg-[#C59F59] text-white hover:bg-[#b08d4f]`}>
                    <Spinner k="links" icon={<Save className="w-4 h-4" />} /> Guardar {changedLinks.length || ""} vínculo(s)
                  </button>
                  <button type="button" onClick={createProducts} disabled={selected.length === 0 || !!busy} className={`${btn} bg-foreground text-background hover:bg-[#C59F59]`}>
                    <Spinner k="create" icon={<Upload className="w-4 h-4" />} /> Crear {selected.length || ""} en Siigo
                  </button>
                </div>
              </div>
              {comparison.missingInApp.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm text-foreground/60">Productos que solo están en Siigo ({comparison.missingInApp.length})</summary>
                  <ul className="mt-2 space-y-1 text-sm max-h-64 overflow-y-auto">
                    {comparison.missingInApp.map((p) => <li key={p.code}><span className="font-mono text-xs">{p.code}</span> {p.name}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>
      </div>

      <aside className="xl:sticky xl:top-6 space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-2xl break-words">{error}</p>}
        {notice && <p className="text-sm text-emerald-700 bg-emerald-50 px-4 py-3 rounded-2xl">{notice}</p>}
        <section className={card}>
          <h2 className="text-lg font-serif">Últimos envíos</h2>
          {log.length === 0 ? (
            <p className="text-sm text-foreground/50">Aún no hay registros.</p>
          ) : (
            <ul className="space-y-2 text-xs max-h-[60vh] overflow-y-auto">
              {log.map((l) => (
                <li key={l.id} className="flex gap-2">
                  {l.status === "ok" ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-bold">{ENTITY_LABEL[l.entity] ?? l.entity} {l.siigo_name ?? ""}</p>
                    {l.message && <p className="text-foreground/60 break-words">{l.message}</p>}
                    <p className="text-foreground/40">{new Date(l.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
