"use client";

import React, { useState } from "react";
import { Plus, X, Trash2, UserRound, MapPin, CalendarClock, Package } from "lucide-react";
import { createManualAdminOrder } from "../../actions";
import { isSellable } from "@/utils/inventory/sellable";
import { useTr } from "@/app/(admin)/AdminI18n";
import { OrderTaxTotals, PricesIncludeTaxToggle, TaxSelect, useOrderTaxes } from "./OrderTaxFields";
import { defaultTaxId, rateOf } from "@/utils/orders/tax";

interface InventoryItem {
  id: string;
  product_code: string;
  product_name: string;
  current_stock: number;
  is_sellable?: boolean | null;
  category?: string | null;
  /** The product's IVA in Siigo (0 = none, null = the general one). */
  sales_tax_id?: number | null;
}

interface ManualOrderModalProps {
  inventory: InventoryItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  crmClients?: any[];
}

type ItemRow = {
  inventory_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  price: number;
  weight: string;
  grind: string;
  /** IVA of the line: Siigo tax id (0 = without IVA) and its percentage. */
  tax_id: number | null;
  tax_rate: number;
};

const DOCUMENT_TYPES = ["CC", "NIT", "CE", "PP", "TI"];

const inputCls =
  "w-full px-4 py-2.5 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20";
const labelCls = "block text-xs font-medium text-foreground/60 mb-1";

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

const EMPTY_CUSTOMER = {
  customerName: "",
  contactEmail: "",
  contactPhone: "",
  address: "Recogida en tienda",
  details: "",
  city: "Bogotá",
  state: "Cundinamarca",
};

export default function ManualOrderModal({ inventory, crmClients = [] }: ManualOrderModalProps) {
  const tr = useTr();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Cliente ──
  const [selectedClientId, setSelectedClientId] = useState("");
  const [customerName, setCustomerName] = useState(EMPTY_CUSTOMER.customerName);
  const [contactEmail, setContactEmail] = useState(EMPTY_CUSTOMER.contactEmail);
  const [contactPhone, setContactPhone] = useState(EMPTY_CUSTOMER.contactPhone);
  const [saveToCrm, setSaveToCrm] = useState(true);
  const [documentType, setDocumentType] = useState("CC");
  const [documentNumber, setDocumentNumber] = useState("");

  // ── Envío ──
  const [address, setAddress] = useState(EMPTY_CUSTOMER.address);
  const [details, setDetails] = useState(EMPTY_CUSTOMER.details);
  const [city, setCity] = useState(EMPTY_CUSTOMER.city);
  const [state, setState] = useState(EMPTY_CUSTOMER.state);

  // ── Seguimiento ──
  const [status, setStatus] = useState("processing");
  // Payment is apart from delivery: an order can be delivered and still owed.
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "paid">("pending");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState<ItemRow[]>([]);
  const taxSetup = useOrderTaxes();
  // null = not chosen yet: Ajustes → Siigo's default for manual orders.
  const [pricesIncluded, setPricesIncluded] = useState<boolean | null>(null);
  const included = pricesIncluded ?? taxSetup?.pricesIncludeTax ?? false;
  // A line whose IVA wasn't picked yet shows the product's.
  const lineTax = (item: ItemRow) => {
    if (item.tax_id !== null) return { tax_id: item.tax_id, tax_rate: item.tax_rate };
    if (!taxSetup || !item.inventory_id) return { tax_id: null, tax_rate: 0 };
    const product = inventory.find((i) => i.id === item.inventory_id);
    const id = defaultTaxId(product?.sales_tax_id, taxSetup.generalTaxId);
    return { tax_id: id, tax_rate: rateOf(id, taxSetup.options) };
  };

  const isNewClient = !selectedClientId;
  // Only what we sell — supplies (bolsas, pergamino, stickers…) stay out.
  const sellable = inventory.filter(isSellable);

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = crmClients.find(c => c.id === clientId);
    if (client) {
      setCustomerName(client.name || "");
      setContactEmail(client.email || "");
      setContactPhone(client.phone || "");
      setAddress(client.address || "Recogida en tienda");
      setCity(client.city || "Bogotá");
      setState(client.department || "Cundinamarca");
    } else {
      setCustomerName(EMPTY_CUSTOMER.customerName);
      setContactEmail(EMPTY_CUSTOMER.contactEmail);
      setContactPhone(EMPTY_CUSTOMER.contactPhone);
      setAddress(EMPTY_CUSTOMER.address);
      setCity(EMPTY_CUSTOMER.city);
      setState(EMPTY_CUSTOMER.state);
    }
    setDetails("");
  };

  const resetForm = () => {
    setSelectedClientId("");
    setCustomerName(EMPTY_CUSTOMER.customerName);
    setContactEmail(EMPTY_CUSTOMER.contactEmail);
    setContactPhone(EMPTY_CUSTOMER.contactPhone);
    setSaveToCrm(true);
    setDocumentType("CC");
    setDocumentNumber("");
    setAddress(EMPTY_CUSTOMER.address);
    setDetails(EMPTY_CUSTOMER.details);
    setCity(EMPTY_CUSTOMER.city);
    setState(EMPTY_CUSTOMER.state);
    setStatus("processing");
    setPaymentStatus("pending");
    setDueDate("");
    setNotes("");
    setItems([]);
    setError("");
  };

  const handleAddItem = () => {
    setItems([...items, { inventory_id: "", product_code: "", product_name: "", quantity: 1, price: 0, weight: "", grind: "", tax_id: null, tax_rate: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateItem = (index: number, field: keyof ItemRow, value: any) => {
    const newItems = [...items];
    if (field === "inventory_id") {
      const invItem = inventory.find(i => i.id === value);
      if (invItem) {
        // Starts with the product's IVA (5%, 19%, none…); it can be changed per line.
        newItems[index] = {
          ...newItems[index],
          inventory_id: value,
          product_code: invItem.product_code,
          product_name: invItem.product_name,
          tax_id: null,
          tax_rate: 0,
        };
        // Auto-assign weight based on common names if empty
        if (invItem.product_name.includes("250g")) newItems[index].weight = "250g";
        else if (invItem.product_name.includes("500g")) newItems[index].weight = "500g";
        else if (invItem.product_name.includes("2.5kg")) newItems[index].weight = "2.5kg";
      }
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNewClient && !customerName.trim()) {
      setError(tr("Escribe el nombre del cliente."));
      return;
    }
    if (items.length === 0) {
      setError(tr("Debes agregar al menos un producto."));
      return;
    }
    if (items.some(i => !i.inventory_id)) {
      setError(tr("Todos los items deben tener un producto seleccionado."));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await createManualAdminOrder({
        client_id: selectedClientId || undefined,
        customer_name: customerName,
        new_client:
          isNewClient && saveToCrm
            ? { name: customerName, document_type: documentType, document_number: documentNumber }
            : null,
        contact_email: contactEmail || "manual@tienda.local",
        contact_phone: contactPhone || "0000000000",
        shipping_info: { address, details, city, state },
        status,
        payment_status: paymentStatus,
        prices_include_tax: included,
        delivery_due_date: dueDate || null,
        notes,
        items: items.map((it) => ({ ...it, ...lineTax(it) })),
      });
      if (res.success) {
        if (res.warning) alert(tr.msg(res.warning));
        resetForm();
        setIsOpen(false);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 bg-foreground text-background rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#C59F59] hover:text-white transition-all shadow-md shrink-0"
      >
        <Plus className="w-4 h-4" />
        <span className="sm:hidden">{tr("Nueva orden")}</span>
        <span className="hidden sm:inline">{tr("Nueva Orden Manual")}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-foreground/20 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto border border-foreground/10 flex flex-col">
            <div className="px-5 sm:px-6 py-4 sm:py-6 border-b border-foreground/5 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl sm:text-2xl font-serif text-foreground">{tr("Registrar Orden Manual")}</h2>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-foreground/5 rounded-full transition-colors" aria-label={tr("Cerrar")}>
                <X className="w-5 h-5 text-foreground/40" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-8 text-left">
              {error && (
                <div className="p-4 bg-red-50 text-red-800 rounded-xl text-sm border border-red-100">
                  {tr.msg(error)}
                </div>
              )}

              {/* Cliente */}
              <Section icon={<UserRound className="w-3.5 h-3.5" />} title={tr("Cliente")}>
                {crmClients.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-[#C59F59] mb-1">{tr("Cargar cliente guardado")}</label>
                    <select
                      value={selectedClientId}
                      onChange={e => handleClientSelect(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#f9f7f0] border border-[#C59F59]/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/40"
                    >
                      <option value="">{tr("-- Cliente Manual Nuevo --")}</option>
                      {crmClients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} {c.document_number ? `(${c.document_number})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>
                      {tr("Nombre / Razón social")}{" "}{isNewClient && <span className="text-red-400">*</span>}
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder={tr("Nombre del cliente")}
                      required={isNewClient}
                      autoComplete="off"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{tr("Email")}</label>
                    <input type="email" inputMode="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder={tr("cliente@email.com")} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{tr("Teléfono")}</label>
                    <input type="tel" inputMode="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="3001234567" className={inputCls} />
                  </div>
                </div>

                {isNewClient && (
                  <div className="p-3 rounded-xl bg-[#f9f7f0] border border-foreground/5 space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveToCrm}
                        onChange={e => setSaveToCrm(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-[#C59F59]"
                      />
                      <span className="text-sm">
                        <span className="font-bold">{tr("Guardar como cliente en el CRM")}</span>
                        <span className="block text-xs text-foreground/50">
                          {tr("Queda en Clientes (B2B) con estos datos y podrás cargarlo en la próxima orden.")}
                        </span>
                      </span>
                    </label>
                    {saveToCrm && (
                      <div className="grid grid-cols-[100px_1fr] gap-3">
                        <div>
                          <label className={labelCls}>{tr("Tipo doc.")}</label>
                          <select value={documentType} onChange={e => setDocumentType(e.target.value)} className={inputCls}>
                            {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>{tr("Número de documento (opcional)")}</label>
                          <input type="text" inputMode="numeric" value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} className={inputCls} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Section>

              {/* Envío */}
              <Section icon={<MapPin className="w-3.5 h-3.5" />} title={tr("Envío")}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>{tr("Dirección")}</label>
                    <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>{tr("Detalles (apto, oficina, indicaciones)")}</label>
                    <input type="text" value={details} onChange={e => setDetails(e.target.value)} placeholder={tr("Apto 302, torre B...")} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{tr("Ciudad")}</label>
                    <input type="text" value={city} onChange={e => setCity(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>{tr("Departamento")}</label>
                    <input type="text" value={state} onChange={e => setState(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </Section>

              {/* Seguimiento */}
              <Section icon={<CalendarClock className="w-3.5 h-3.5" />} title={tr("Seguimiento")}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>{tr("Estado de la orden")}</label>
                    <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                      <option value="processing">{tr("Preparando")}</option>
                      <option value="shipped">{tr("Enviado")}</option>
                      <option value="delivered">{tr("Entregado")}</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{tr("Pago")}</label>
                    <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value as "pending" | "paid")} className={inputCls}>
                      <option value="pending">{tr("Pendiente de pago")}</option>
                      <option value="paid">{tr("Pagado")}</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>{tr("Entrega prometida (opcional)")}</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>{tr("Notas (opcional)")}</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder={tr("Medio de pago, instrucciones de entrega...")} className={`${inputCls} resize-y`} />
                  </div>
                </div>
              </Section>

              {/* Productos */}
              <Section icon={<Package className="w-3.5 h-3.5" />} title={tr("Productos")}>
                <div className="space-y-3 @container">
                  {items.map((item, index) => (
                    <div key={index} className="grid grid-cols-2 @2xl:grid-cols-[minmax(0,1fr)_70px_110px_100px_80px_100px_auto] gap-3 items-end p-4 bg-[#f9f7f0] rounded-xl border border-foreground/5 [&>*]:min-w-0">
                      <div className="col-span-2 @2xl:col-span-1">
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">{tr("Inventario")}</label>
                        <select
                          value={item.inventory_id}
                          onChange={e => updateItem(index, 'inventory_id', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#C59F59]/20"
                        >
                          <option value="">{tr("Seleccione producto...")}</option>
                          {sellable.map(inv => (
                            <option key={inv.id} value={inv.id}>
                              {inv.product_name} {inv.category === "servicio" ? tr("(servicio)") : tr("(Stock: {Number})", { Number: Number(inv.current_stock) })}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">{tr("Cant.")}</label>
                        <input type="number" inputMode="numeric" min="1" value={item.quantity} onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm" />
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">{tr("Precio unitario")}</label>
                        <input type="number" inputMode="numeric" min="0" step="1" value={item.price} onChange={e => updateItem(index, 'price', parseInt(e.target.value) || 0)} className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm" />
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">{tr("IVA")}</label>
                        <TaxSelect value={lineTax(item).tax_id} setup={taxSetup} disabled={!item.inventory_id}
                          onChange={(taxId, rate) => { const next = [...items]; next[index] = { ...next[index], tax_id: taxId, tax_rate: rate }; setItems(next); }} />
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">{tr("Peso (opc)")}</label>
                        <input type="text" placeholder="250g" value={item.weight} onChange={e => updateItem(index, 'weight', e.target.value)} className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm" />
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">{tr("Molienda (opc)")}</label>
                        <select value={item.grind} onChange={e => updateItem(index, 'grind', e.target.value)} className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm">
                          <option value="">N/A</option>
                          <option value="whole">{tr("Grano")}</option>
                          <option value="ground">{tr("Molido")}</option>
                        </select>
                      </div>

                      <button type="button" onClick={() => handleRemoveItem(index)} className="col-span-2 @2xl:col-span-1 flex items-center justify-center gap-2 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors text-xs font-bold" aria-label={tr("Quitar producto {v}", { v: index + 1 })}>
                        <Trash2 className="w-4 h-4" />
                        <span className="@2xl:hidden">{tr("Quitar")}</span>
                      </button>
                    </div>
                  ))}

                  {items.length === 0 && (
                    <div className="text-center py-6 text-sm text-foreground/40 border-2 border-dashed border-foreground/10 rounded-xl">
                      {tr("No hay productos agregados")}
                    </div>
                  )}
                </div>

                <button type="button" onClick={handleAddItem} className="text-xs font-bold text-[#C59F59] hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" />{" "}{tr("Agregar producto")}
                </button>

                <PricesIncludeTaxToggle checked={included} onChange={setPricesIncluded} />
                <OrderTaxTotals lines={items.map((it) => ({ ...it, ...lineTax(it) }))} setup={taxSetup} included={included} />
              </Section>

              <div className="pt-4 pb-[env(safe-area-inset-bottom)] sticky bottom-0 bg-white">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-foreground text-background text-sm font-bold uppercase tracking-widest rounded-xl hover:bg-[#C59F59] hover:text-white transition-all shadow-lg disabled:opacity-50"
                >
                  {loading ? tr("Registrando Orden...") : tr("Crear Orden Manual")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
