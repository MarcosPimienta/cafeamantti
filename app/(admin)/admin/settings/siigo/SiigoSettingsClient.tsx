"use client";

import React, { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PlugZap, RefreshCw, Save, Upload } from "lucide-react";
import {
  compareSiigoProducts,
  createSiigoProducts,
  importSiigoItems,
  linkSiigoProducts,
  markSiigoItemsAsService,
  refreshSiigoAccounts,
  saveProductTaxes,
  saveSiigoSettings,
  testSiigoConnection,
} from "../../siigo/actions";
import type { SiigoSettings } from "@/utils/siigo/mapping";
import { useTr } from "@/app/(admin)/AdminI18n";

type Option = { id: number; name: string };
type Catalogs = {
  invoiceTypes: Option[];
  purchaseTypes: Option[];
  sellers: Option[];
  salesPayments: Option[];
  purchasePayments: Option[];
  taxes: (Option & { percentage: number | null })[];
  accountGroups: Option[];
  voucherTypes: Option[];
  voucherPayments: Option[];
  supportTypes: Option[];
  creditNoteTypes: Option[];
  receiptTypes: Option[];
  journalTypes?: Option[];
  retentions: (Option & { percentage: number | null })[];
};
type Kind = "servicio" | "repuesto";
type Comparison = {
  linked: { id: string; code: string; siigoCode: string; appName: string; siigoName: string; category: string | null; taxId: number | null }[];
  missingInSiigo: { id: string; code: string; name: string; suggestion: string | null; category: string | null; taxId: number | null }[];
  missingInApp: { code: string; name: string; type: string | null; kind: Kind }[];
  siigoProducts: { code: string; name: string }[];
};
const taxValue = (id: number | null) => (id === null ? "" : String(id));
type LogRow = { id: string; entity: string; status: string; siigo_name: string | null; message: string | null; created_at: string };

const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5";
const inputCls = "w-full px-3 py-2.5 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20";
const card = "bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-4";

const ENTITY_LABEL: Record<string, string> = { invoice: "Factura", customer: "Cliente", product: "Producto", purchase: "Compra", connection: "Conexión", voucher: "Recibo de caja", support_document: "Documento soporte", credit_note: "Nota crédito", payment_receipt: "Egreso", supplier_advance: "Anticipo" };

function IdSelect({ id, label, value, options, onChange, hint }: {
  id: string; label: string; value: number | null | undefined; options: Option[] | null; onChange: (v: number | null) => void; hint?: string;
}) {
  const tr = useTr();
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{tr(label)}</label>
      {options ? (
        <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
          <option value="">{tr("— Sin elegir —")}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          {value && !options.some((o) => o.id === value) && <option value={value}>{tr("ID {value} (ya no está activo)", { value: value })}</option>}
        </select>
      ) : (
        <p className={`${inputCls} text-foreground/50`}>{value ? tr("ID {value}", { value: value }) : tr("Prueba la conexión para elegir")}</p>
      )}
      {hint && <p className="text-[11px] text-foreground/40 mt-1">{tr(hint)}</p>}
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
  const tr = useTr();
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
  // inventory id → IVA ("" = general, "0" = without IVA, else tax id)
  const [taxes, setTaxes] = useState<Record<string, string>>({});
  const currentTax = (id: string) => taxValue([...(comparison?.linked ?? []), ...(comparison?.missingInSiigo ?? [])].find((r) => r.id === id)?.taxId ?? null);
  const changedTaxes = Object.keys(taxes).filter((id) => taxes[id] !== currentTax(id));
  // Siigo-only items: what each one is, its IVA, and which are picked
  const [kinds, setKinds] = useState<Record<string, Kind>>({});
  const [itemTaxes, setItemTaxes] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const showComparison = (c: Comparison) => {
    setComparison(c);
    setSelected([]);
    setPicked([]);
    setLinks(Object.fromEntries([...c.linked.map((l) => [l.id, l.siigoCode]), ...c.missingInSiigo.map((p) => [p.id, p.suggestion ?? ""])]));
    setTaxes(Object.fromEntries([...c.linked, ...c.missingInSiigo].map((r) => [r.id, taxValue(r.taxId)])));
    setKinds(Object.fromEntries(c.missingInApp.map((p) => [p.code, p.kind])));
    setItemTaxes({});
  };
  const parseTax = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));
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
    setNotice(tr("✓ Conexión con Siigo verificada"));
  });
  const loadAccounts = () => run("accounts", async () => {
    const res = await refreshSiigoAccounts();
    if (!res.success) return setError(res.error);
    set("siigo_accounts", res.accounts);
    setNotice(tr("✓ {n} cuentas traídas de Siigo", { n: String(res.accounts.length) }));
  });
  const accounts = settings.siigo_accounts ?? [];
  const save = () => run("save", async () => {
    const res = await saveSiigoSettings(settings);
    if (!res.success) return setError(res.error);
    setSettings(res.settings);
    setNotice(tr("✓ Ajustes de Siigo guardados"));
  });
  const compare = () => run("compare", async () => {
    const res = await compareSiigoProducts();
    if (!res.success) return setError(res.error);
    showComparison(res);
  });
  const saveLinks = () => run("links", async () => {
    if (changedLinks.length) {
      const res = await linkSiigoProducts(changedLinks.map((id) => ({ inventoryId: id, siigoCode: links[id] || null })));
      if (!res.success) return setError(res.error);
    }
    if (changedTaxes.length) {
      const res = await saveProductTaxes(changedTaxes.map((id) => ({ inventoryId: id, taxId: parseTax(taxes[id]) })));
      if (!res.success) return setError(res.error);
    }
    setNotice(tr("✓ {v} cambio(s) guardados", { v: changedLinks.length + changedTaxes.length }));
    const again = await compareSiigoProducts();
    if (again.success) showComparison(again);
  });
  const bringItems = () => run("bring", async () => {
    const res = await importSiigoItems(picked.map((code) => ({ siigoCode: code, kind: kinds[code] ?? "repuesto", taxId: parseTax(itemTaxes[code]) })));
    if (!res.success) return setError(res.error);
    setNotice(tr("✓ {length} traído(s) a la app", { length: res.imported.length }));
    if (res.skipped.length) setError(res.skipped.join(" · "));
    const again = await compareSiigoProducts();
    if (again.success) showComparison(again);
  });
  const toServiceCodes = comparison ? picked.filter((code) => kinds[code] === "servicio" && comparison.missingInApp.find((p) => p.code === code)?.type !== "Service") : [];
  const markAsService = () => run("service", async () => {
    if (!window.confirm(tr("Se cambiará a tipo \"Servicio\" en Siigo: {toServiceCodes}. ¿Continuar?", { toServiceCodes: toServiceCodes.join(", ") }))) return;
    const res = await markSiigoItemsAsService(toServiceCodes);
    if (!res.success) return setError(res.error);
    setNotice(tr("✓ {length} marcado(s) como Servicio en Siigo", { length: res.updated.length }));
    if (res.failed.length) setError(res.failed.join(" · "));
    const again = await compareSiigoProducts();
    if (again.success) showComparison(again);
  });
  const taxOptions = catalogs?.taxes ?? null;
  const taxSelect = (value: string, onChange: (v: string) => void, label: string) =>
    taxOptions ? (
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={inputCls}>
        <option value="">{tr("IVA general")}</option>
        <option value="0">{tr("Sin IVA")}</option>
        {taxOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        {value && value !== "0" && !taxOptions.some((t) => String(t.id) === value) && <option value={value}>{tr("IVA ID {value}", { value: value })}</option>}
      </select>
    ) : (
      <p className={`${inputCls} text-foreground/40 text-xs`}>{value === "" ? tr("IVA general") : value === "0" ? tr("Sin IVA") : tr("IVA ID {value}", { value: value })}</p>
    );
  const createProducts = () => run("create", async () => {
    const res = await createSiigoProducts(selected, settings.product_account_group_id ?? null);
    if (!res.success) return setError(res.error);
    setNotice(tr("✓ {length} producto(s) creados en Siigo", { length: res.created.length }));
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
              <h2 className="text-lg font-serif">{tr("Conexión")}</h2>
              <p className="text-xs text-foreground/50">{tr("Las credenciales van en las variables de entorno del servidor, nunca en la base de datos.")}</p>
            </div>
            <button type="button" onClick={test} disabled={!configured || !!busy} className={`${btn} bg-foreground text-background hover:bg-[#C59F59]`}>
              <Spinner k="test" icon={<PlugZap className="w-4 h-4" />} />{" "}{tr("Probar conexión")}
            </button>
          </div>
          {!configured && (
            <div className="flex gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                {tr("Falta configurar")}{" "}<code>SIIGO_USERNAME</code> y <code>SIIGO_ACCESS_KEY</code>{" "}{tr("(y opcionalmente")}{" "}<code>SIIGO_PARTNER_ID</code>{tr(") en")}
                <code> .env.local</code>{" "}{tr("y en Vercel → Settings → Environment Variables. Después vuelve a desplegar.")}
              </div>
            </div>
          )}
          {!migrationApplied && (
            <div className="flex gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{" "}{tr("Falta aplicar la migración 20261016000000_siigo_integration.sql.")}
            </div>
          )}
        </section>

        {/* Sales invoices */}
        <section className={card}>
          <h2 className="text-lg font-serif">{tr("Facturas de venta")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IdSelect id="sg-fv" label={tr("Tipo de factura")} value={settings.invoice_document_id} options={catalogs?.invoiceTypes ?? null} onChange={(v) => set("invoice_document_id", v)} />
            <IdSelect id="sg-seller" label={tr("Vendedor")} value={settings.seller_id} options={catalogs?.sellers ?? null} onChange={(v) => set("seller_id", v)} />
            <IdSelect id="sg-pay-web" label={tr("Forma de pago · ventas web (ePayco)")} value={settings.payment_web_id} options={catalogs?.salesPayments ?? null} onChange={(v) => set("payment_web_id", v)} />
            <IdSelect id="sg-pay-cash" label={tr("Forma de pago · efectivo")} value={settings.payment_cash_id} options={catalogs?.salesPayments ?? null} onChange={(v) => set("payment_cash_id", v)} />
            <IdSelect id="sg-pay-transfer" label={tr("Forma de pago · transferencia")} value={settings.payment_transfer_id} options={catalogs?.salesPayments ?? null} onChange={(v) => set("payment_transfer_id", v)} />
            <IdSelect id="sg-pay-credit" label={tr("Forma de pago · a crédito")} value={settings.payment_credit_id} options={catalogs?.salesPayments ?? null} onChange={(v) => set("payment_credit_id", v)}
              hint={tr("La que maneja vencimiento (por ejemplo «Pago a crédito»). Se usa en las facturas que el cliente paga después.")} />
            <div>
              <label htmlFor="sg-term" className={labelCls}>{tr("Plazo de crédito por defecto (días)")}</label>
              <input id="sg-term" inputMode="numeric" value={settings.credit_term_days ?? ""} onChange={(e) => set("credit_term_days", e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")))} placeholder="30" className={inputCls} />
            </div>
            <IdSelect id="sg-tax" label={tr("IVA de los productos")} value={settings.sales_tax_id} options={catalogs?.taxes.map((t) => ({ id: t.id, name: t.name })) ?? null} onChange={(v) => set("sales_tax_id", v)}
              hint="Sin elegir = productos sin IVA (excluidos)." />
            <div>
              <label htmlFor="sg-ship" className={labelCls}>{tr("Código del servicio de envío en Siigo")}</label>
              <input id="sg-ship" value={settings.shipping_product_code ?? ""} onChange={(e) => set("shipping_product_code", e.target.value)} placeholder={tr("Ej. ENVIO")} className={inputCls} />
            </div>
            <div>
              <label htmlFor="sg-cf" className={labelCls}>{tr("Identificación de consumidor final")}</label>
              <input id="sg-cf" value={settings.final_consumer_identification ?? ""} onChange={(e) => set("final_consumer_identification", e.target.value)} className={inputCls} />
              <p className="text-[11px] text-foreground/40 mt-1">{tr("Para pedidos sin cliente con cédula o NIT. DIAN: 222222222222.")}</p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={!!settings.stamp_dian} onChange={(e) => set("stamp_dian", e.target.checked)} className="mt-1 w-4 h-4 accent-[#C59F59]" />
              <span className="text-sm">
                <strong>{tr("Enviar a la DIAN")}</strong>{" "}{tr("(factura electrónica)")}
                <span className="block text-xs text-foreground/50">{tr("Apagado, las facturas quedan creadas en Siigo sin enviarse a la DIAN: úsalo para probar. Encendido, cada factura se emite ante la DIAN y no se puede borrar, solo anular con nota crédito.")}</span>
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={!!settings.send_mail} onChange={(e) => set("send_mail", e.target.checked)} className="w-4 h-4 accent-[#C59F59]" />
              <span className="text-sm">{tr("Enviar la factura por correo al cliente")}</span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={settings.manual_prices_include_tax !== false} onChange={(e) => set("manual_prices_include_tax", e.target.checked)} className="mt-1 w-4 h-4 accent-[#C59F59]" />
              <span>
                <span className="text-sm">{tr("Los precios de los pedidos manuales ya incluyen IVA")}</span>
                <span className="block text-xs text-foreground/50">{tr("Desmarcado, el precio que escribes en el pedido es sin IVA y la factura le suma el IVA encima. Los pedidos de la tienda web siempre lo incluyen (el cliente pagó ese precio final).")}</span>
              </span>
            </label>
          </div>
        </section>

        {/* Credit notes */}
        <section className={card}>
          <div>
            <h2 className="text-lg font-serif">{tr("Notas crédito")}</h2>
            <p className="text-xs text-foreground/50">{tr("Se hacen desde Facturas: anulación, devolución parcial o rebaja. Usa la electrónica para facturas enviadas a la DIAN.")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IdSelect id="sg-nc" label={tr("Tipo de nota crédito")} value={settings.credit_note_document_id} options={catalogs?.creditNoteTypes ?? null} onChange={(v) => set("credit_note_document_id", v)} />
          </div>
        </section>

        {/* Customer payments → cash receipts */}
        <section className={card}>
          <div>
            <h2 className="text-lg font-serif">{tr("Pagos de clientes (recibos de caja)")}</h2>
            <p className="text-xs text-foreground/50">{tr("Cada pago que registras en una factura se envía a Siigo como recibo de caja que abona a esa factura.")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IdSelect id="sg-rc" label={tr("Tipo de recibo de caja")} value={settings.voucher_document_id} options={catalogs?.voucherTypes ?? null} onChange={(v) => set("voucher_document_id", v)} />
            <IdSelect id="sg-rc-transfer" label={tr("Forma de pago · transferencia")} value={settings.voucher_transfer_id} options={catalogs?.voucherPayments ?? null} onChange={(v) => set("voucher_transfer_id", v)} />
            <IdSelect id="sg-rc-cash" label={tr("Forma de pago · efectivo")} value={settings.voucher_cash_id} options={catalogs?.voucherPayments ?? null} onChange={(v) => set("voucher_cash_id", v)} />
            <IdSelect id="sg-rc-web" label={tr("Forma de pago · ventas web (ePayco)")} value={settings.voucher_web_id} options={catalogs?.voucherPayments ?? null} onChange={(v) => set("voucher_web_id", v)} />
          </div>
        </section>

        {/* Purchases */}
        <section className={card}>
          <div>
            <h2 className="text-lg font-serif">{tr("Compras (gastos de Flujo de Caja)")}</h2>
            <p className="text-xs text-foreground/50">{tr("Cada gasto se envía como factura de compra con la cuenta contable de su categoría; los activos fijos, con su código de activo en Siigo.")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IdSelect id="sg-fc" label={tr("Tipo de factura de compra")} value={settings.purchase_document_id} options={catalogs?.purchaseTypes ?? null} onChange={(v) => set("purchase_document_id", v)} />
            <IdSelect id="sg-pay-fc" label={tr("Forma de pago · por pagar al proveedor")} value={settings.purchase_payment_id} options={catalogs?.purchasePayments ?? null} onChange={(v) => set("purchase_payment_id", v)}
              hint="La que maneja vencimiento (por ejemplo «Crédito proveedores»): la factura queda por pagar hasta que registras el pago." />
            <IdSelect id="sg-rp" label={tr("Tipo de recibo de pago/egreso")} value={settings.payment_receipt_document_id} options={catalogs?.receiptTypes ?? null} onChange={(v) => set("payment_receipt_document_id", v)} />
            <IdSelect id="sg-rp-bank" label={tr("Egresos · pagos por banco")} value={settings.payout_bank_id} options={catalogs?.purchasePayments ?? null} onChange={(v) => set("payout_bank_id", v)}
              hint="Por ejemplo «Pagos por cuenta bancaria»." />
            <IdSelect id="sg-rp-cash" label={tr("Egresos · pagos en efectivo")} value={settings.payout_cash_id} options={catalogs?.purchasePayments ?? null} onChange={(v) => set("payout_cash_id", v)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={loadAccounts} disabled={!configured || !!busy} className={`${btn} border border-foreground/15 text-foreground/70 hover:bg-foreground/5`}>
              <Spinner k="accounts" icon={<RefreshCw className="w-4 h-4" />} />{" "}{tr("Traer cuentas del PUC de Siigo")}
            </button>
            <span className="text-xs text-foreground/50">
              {accounts.length ? tr("{n} cuentas disponibles para elegir.", { n: String(accounts.length) }) : tr("Trae las cuentas para elegirlas por nombre en vez de escribir el código.")}
            </span>
          </div>
          <details className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">{tr("Cuenta contable (PUC) por categoría")}</summary>
            <div className="space-y-2 mt-3">
              {expenseCategories.map((c) => (
                <div key={c} className={`grid ${accounts.length ? "grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-[minmax(0,1fr)_140px]"} gap-2 items-center [&>*]:min-w-0`}>
                  <span className="text-sm">{c}</span>
                  {accounts.length ? (
                    <select value={settings.expense_accounts?.[c] ?? ""} onChange={(e) => set("expense_accounts", { ...settings.expense_accounts, [c]: e.target.value })}
                      aria-label={tr("Cuenta de {c}", { c: c })} className={inputCls}>
                      <option value="">{tr("— Sin elegir —")}</option>
                      {accounts.filter((a) => /^[56]/.test(a.code) || a.code === settings.expense_accounts?.[c]).map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                      {settings.expense_accounts?.[c] && !accounts.some((a) => a.code === settings.expense_accounts?.[c]) && (
                        <option value={settings.expense_accounts[c]}>{tr("{code} · inactiva o no está en el PUC traído", { code: settings.expense_accounts[c] })}</option>
                      )}
                    </select>
                  ) : (
                    <input value={settings.expense_accounts?.[c] ?? ""} onChange={(e) => set("expense_accounts", { ...settings.expense_accounts, [c]: e.target.value.replace(/\D/g, "") })}
                      placeholder={tr("Ej. 51359501")} aria-label={tr("Cuenta de {c}", { c: c })} className={inputCls} />
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-foreground/40 mt-3">{tr("Pídele a tu contadora las cuentas auxiliares que usa en Siigo. Las de inventario, activos fijos o impuestos no se aceptan aquí.")}</p>
          </details>
          <details className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">{tr("Código de activo fijo en Siigo por clase")}</summary>
            <div className="space-y-2 mt-3">
              {assetCategories.map((c) => (
                <div key={c} className="grid grid-cols-[minmax(0,1fr)_140px] gap-2 items-center [&>*]:min-w-0">
                  <span className="text-sm">{c}</span>
                  <input value={settings.fixed_asset_codes?.[c] ?? ""} onChange={(e) => set("fixed_asset_codes", { ...settings.fixed_asset_codes, [c]: e.target.value })}
                    aria-label={tr("Código de activo de {c}", { c: c })} className={inputCls} />
                </div>
              ))}
            </div>
          </details>
        </section>

        {/* Signed cuentas de cobro → support documents */}
        <section className={card}>
          <div>
            <h2 className="text-lg font-serif">{tr("Documento soporte (cuentas de cobro firmadas)")}</h2>
            <p className="text-xs text-foreground/50">{tr("Cada cuenta de cobro de gasto firmada se envía desde Cuentas de Cobro como documento soporte, con la cuenta contable de su categoría (la misma de Compras) y queda por pagar al proveedor.")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IdSelect id="sg-ds" label={tr("Tipo de documento soporte")} value={settings.support_document_id} options={catalogs?.supportTypes ?? null} onChange={(v) => set("support_document_id", v)} />
            <IdSelect id="sg-ds-pay" label={tr("Forma de pago · por pagar al proveedor")} value={settings.support_payment_id} options={catalogs?.purchasePayments ?? null} onChange={(v) => set("support_payment_id", v)}
              hint="La que maneja vencimiento (por ejemplo «Crédito proveedores»)." />
            <div>
              <label htmlFor="sg-ds-assumed" className={labelCls}>{tr("Cuenta de la retención asumida")}</label>
              <input id="sg-ds-assumed" value={settings.support_assumed_account ?? ""} onChange={(e) => set("support_assumed_account", e.target.value.replace(/\D/g, ""))}
                placeholder={tr("Ej. 53152002")} className={inputCls} />
              <p className="text-[11px] text-foreground/40 mt-1">{tr("Cuando Café Amantti paga la retención y el proveedor recibe el valor completo.")}</p>
            </div>
          </div>
          <details className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">{tr("Retención en la fuente por categoría")}</summary>
            <div className="space-y-2 mt-3">
              {expenseCategories.map((c) => (
                <div key={c} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px] gap-2 items-center [&>*]:min-w-0">
                  <span className="text-sm">{c}</span>
                  {catalogs ? (
                    <select value={settings.support_retentions?.[c] ?? ""} aria-label={tr("Retención de {c}", { c: c })} className={inputCls}
                      onChange={(e) => {
                        const next = { ...(settings.support_retentions ?? {}) };
                        if (e.target.value) next[c] = Number(e.target.value);
                        else delete next[c];
                        set("support_retentions", next);
                      }}>
                      <option value="">{tr("Sin retención")}</option>
                      {catalogs.retentions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  ) : (
                    <p className={`${inputCls} text-foreground/50`}>{settings.support_retentions?.[c] ? tr("ID {value}", { value: settings.support_retentions[c] }) : tr("Sin retención")}</p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-foreground/40 mt-3">{tr("Tu contadora define la tarifa de cada categoría. Al enviar cada cuenta de cobro puedes cambiarla.")}</p>
          </details>
        </section>

        {/* Supplier advances → journals */}
        <section className={card}>
          <div>
            <h2 className="text-lg font-serif">{tr("Saldos a favor con proveedores (anticipos)")}</h2>
            <p className="text-xs text-foreground/50">{tr("El anticipo va como egreso de anticipo (tipo de recibo de pago de arriba). Al usarlo en un pago o cuando el proveedor lo devuelve, va un comprobante contable que cruza la cuenta de anticipos contra el egreso del anticipo (RP).")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IdSelect id="sg-adv-cc" label={tr("Comprobante contable de cruces y devoluciones")} value={settings.advance_journal_document_id} options={catalogs?.journalTypes ?? null} onChange={(v) => set("advance_journal_document_id", v)}
              hint="Tu contadora usa «Egreso» (CC-3) para los cruces." />
            {([
              ["advance_account", "Cuenta de anticipos a proveedores", "13300501"],
              ["payable_account", "Cuenta de proveedores por pagar", "22050501"],
              ["refund_bank_account", "Devoluciones · cuenta de banco", "11200501"],
              ["refund_cash_account", "Devoluciones · cuenta de caja", "11050501"],
            ] as const).map(([key, label, example]) => (
              <div key={key}>
                <label htmlFor={`sg-${key}`} className={labelCls}>{tr(label)}</label>
                <input id={`sg-${key}`} list="sg-accounts" value={settings[key] ?? ""} onChange={(e) => set(key, e.target.value.replace(/\D/g, ""))} placeholder={example} className={inputCls} />
                {settings[key] && accounts.find((a) => a.code === settings[key]) && <p className="text-[11px] text-foreground/40 mt-1">{accounts.find((a) => a.code === settings[key])!.name}</p>}
              </div>
            ))}
          </div>
          <datalist id="sg-accounts">{accounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</datalist>
        </section>

        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={!!busy || !migrationApplied} className={`${btn} bg-[#C59F59] text-white hover:bg-[#b08d4f]`}>
            <Spinner k="save" icon={<Save className="w-4 h-4" />} />{" "}{tr("Guardar ajustes")}
          </button>
        </div>

        {/* Products */}
        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-serif">{tr("Productos")}</h2>
              <p className="text-xs text-foreground/50">{tr("Siigo numera sus productos (0040, 004…): vincula cada producto de la app con el suyo. Facturas y descargas usan ese vínculo.")}</p>
            </div>
            <button type="button" onClick={compare} disabled={!configured || !!busy} className={`${btn} border border-foreground/15 text-foreground/70 hover:bg-foreground/5`}>
              <Spinner k="compare" icon={<RefreshCw className="w-4 h-4" />} />{" "}{tr("Comparar con Siigo")}
            </button>
          </div>
          <IdSelect id="sg-group" label={tr("Grupo de inventario para productos nuevos")} value={settings.product_account_group_id} options={catalogs?.accountGroups ?? null} onChange={(v) => set("product_account_group_id", v)} />
          {comparison && (
            <div className="space-y-4">
              <p className="text-sm"><strong>{comparison.linked.length}</strong>{" "}{tr("vinculados ·")}{" "}<strong>{comparison.missingInSiigo.length}</strong>{" "}{tr("sin vincular ·")}{" "}<strong>{comparison.missingInApp.length}</strong>{" "}{tr("solo en Siigo")}</p>
              <div>
                <p className={labelCls}>{tr("Producto de la app → producto en Siigo")}</p>
                <p className="text-[11px] text-foreground/50 mb-2">{tr("Las sugerencias salen del perfil y el tamaño; revísalas antes de guardar. Sin producto en Siigo, márcalo para crearlo. El IVA de cada producto reemplaza al general (por ejemplo café 5 %, servicios y repuestos 19 %)")}{taxOptions ? "" : tr(" · prueba la conexión para elegirlo")}.</p>
                <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                  {[...comparison.linked.map((l) => ({ id: l.id, code: l.code, name: l.appName, category: l.category, linked: true })), ...comparison.missingInSiigo.map((p) => ({ ...p, linked: false }))].map((row) => {
                    const value = links[row.id] ?? "";
                    const suggested = !row.linked && value && value === comparison.missingInSiigo.find((p) => p.id === row.id)?.suggestion;
                    return (
                      <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr_130px_auto] gap-2 items-center [&>*]:min-w-0">
                        <div className="text-sm min-w-0">
                          <span className="font-mono text-[11px] text-foreground/50">{row.code}</span> {row.name}
                          {row.category === "servicio" && <span className="ml-2 text-[10px] font-bold text-emerald-700">{tr("servicio")}</span>}
                          {row.category === "repuesto" && <span className="ml-2 text-[10px] font-bold text-orange-700">{tr("repuesto")}</span>}
                          {row.linked && value === currentLink(row.id) && <span className="ml-2 text-[10px] font-bold text-emerald-700">{tr("vinculado")}</span>}
                          {suggested && <span className="ml-2 text-[10px] font-bold text-amber-700">{tr("sugerido")}</span>}
                        </div>
                        <select value={value} onChange={(e) => setLinks((m) => ({ ...m, [row.id]: e.target.value }))} aria-label={tr("Producto en Siigo para {name}", { name: row.name })} className={inputCls}>
                          <option value="">{tr("— Sin vincular —")}</option>
                          {comparison.siigoProducts.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
                        </select>
                        {taxSelect(taxes[row.id] ?? "", (v) => setTaxes((m) => ({ ...m, [row.id]: v })), `IVA de ${row.name}`)}
                        <label className={`flex items-center gap-1.5 text-xs ${value || row.linked ? "invisible" : ""}`}>
                          <input type="checkbox" checked={selected.includes(row.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, row.id] : s.filter((x) => x !== row.id)))} className="w-4 h-4 accent-[#C59F59]" />
                          {tr("Crear")}
                        </label>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button type="button" onClick={saveLinks} disabled={changedLinks.length + changedTaxes.length === 0 || !!busy} className={`${btn} bg-[#C59F59] text-white hover:bg-[#b08d4f]`}>
                    <Spinner k="links" icon={<Save className="w-4 h-4" />} />{" "}{tr("Guardar")}{" "}{changedLinks.length + changedTaxes.length || ""}{" "}{tr("cambio(s)")}
                  </button>
                  <button type="button" onClick={createProducts} disabled={selected.length === 0 || !settings.product_account_group_id || !!busy} className={`${btn} bg-foreground text-background hover:bg-[#C59F59]`}>
                    <Spinner k="create" icon={<Upload className="w-4 h-4" />} />{" "}{tr("Crear")}{" "}{selected.length || ""}{" "}{tr("en Siigo")}
                  </button>
                </div>
                {selected.length > 0 && !settings.product_account_group_id && (
                  <p className="text-[11px] text-amber-700 mt-2">{tr("Elige arriba el grupo de inventario para crear productos en Siigo.")}</p>
                )}
                {changedLinks.length + changedTaxes.length > 0 && (
                  <p className="text-[11px] text-amber-700 mt-2">{tr("Tienes {v} cambio(s) sin guardar.", { v: changedLinks.length + changedTaxes.length })}</p>
                )}
              </div>
              {comparison.missingInApp.length > 0 && (
                <div className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4 space-y-3">
                  <div>
                    <p className={labelCls}>{tr("Solo en Siigo ({length}): servicios y repuestos", { length: comparison.missingInApp.length })}</p>
                    <p className="text-[11px] text-foreground/50">
                      {tr("Tráelos a la app para venderlos y facturarlos.")}{" "}<strong>{tr("Servicio")}</strong>{" "}{tr("= mano de obra, sin stock (mantenimientos, reparaciones, domicilio, alquiler).")}
                      <strong>{" "}{tr("Repuesto")}</strong>{" "}{tr("= pieza o insumo, con stock (empaques, filtros, mangueras…). La sugerencia sale del nombre; revísala.")}
                    </p>
                  </div>
                  <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                    {comparison.missingInApp.map((p) => (
                      <div key={p.code} className="grid grid-cols-1 md:grid-cols-[auto_1fr_130px_130px] gap-2 items-center [&>*]:min-w-0">
                        <input type="checkbox" checked={picked.includes(p.code)} onChange={(e) => setPicked((s) => (e.target.checked ? [...s, p.code] : s.filter((x) => x !== p.code)))} aria-label={tr("Elegir {name}", { name: p.name })} className="w-4 h-4 accent-[#C59F59]" />
                        <div className="text-sm min-w-0">
                          <span className="font-mono text-[11px] text-foreground/50">{p.code}</span> {p.name}
                          <span className="ml-2 text-[10px] text-foreground/40">{tr("en Siigo:")}{" "}{p.type === "Service" ? tr("Servicio") : tr("Producto")}</span>
                        </div>
                        <select value={kinds[p.code] ?? p.kind} onChange={(e) => setKinds((m) => ({ ...m, [p.code]: e.target.value as Kind }))} aria-label={tr("Tipo de {name}", { name: p.name })} className={inputCls}>
                          <option value="servicio">{tr("Servicio")}</option>
                          <option value="repuesto">{tr("Repuesto")}</option>
                        </select>
                        {taxSelect(itemTaxes[p.code] ?? "", (v) => setItemTaxes((m) => ({ ...m, [p.code]: v })), `IVA de ${p.name}`)}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={bringItems} disabled={picked.length === 0 || !!busy} className={`${btn} bg-foreground text-background hover:bg-[#C59F59]`}>
                      <Spinner k="bring" icon={<Upload className="w-4 h-4 rotate-180" />} />{" "}{tr("Traer")}{" "}{picked.length || ""}{" "}{tr("a la app")}
                    </button>
                    <button type="button" onClick={markAsService} disabled={toServiceCodes.length === 0 || !!busy} className={`${btn} border border-foreground/15 text-foreground/70 hover:bg-foreground/5`}>
                      <Spinner k="service" icon={<RefreshCw className="w-4 h-4" />} />{" "}{tr("Marcar")}{" "}{toServiceCodes.length || ""}{" "}{tr("como Servicio en Siigo")}
                    </button>
                  </div>
                  <p className="text-[11px] text-foreground/40">{tr("«Marcar como Servicio» cambia el tipo en Siigo de los elegidos como servicio que allá están como Producto; el resto de sus datos se conserva.")}</p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <aside className="xl:sticky xl:top-6 space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-2xl break-words">{tr.msg(error)}</p>}
        {notice && <p className="text-sm text-emerald-700 bg-emerald-50 px-4 py-3 rounded-2xl">{tr.msg(notice)}</p>}
        <section className={card}>
          <h2 className="text-lg font-serif">{tr("Últimos envíos")}</h2>
          {log.length === 0 ? (
            <p className="text-sm text-foreground/50">{tr("Aún no hay registros.")}</p>
          ) : (
            <ul className="space-y-2 text-xs max-h-[60vh] overflow-y-auto">
              {log.map((l) => (
                <li key={l.id} className="flex gap-2">
                  {l.status === "ok" ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-bold">{tr.msg(ENTITY_LABEL[l.entity] ?? l.entity)} {l.siigo_name ?? ""}</p>
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
