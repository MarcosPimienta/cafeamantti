"use client";

import React, { useState } from "react";
import { Edit, Trash2, X, Plus, UserRound, MapPin, CalendarClock, Package } from "lucide-react";
import { deleteManualAdminOrder, updateManualAdminOrder } from "../../actions";

interface InventoryItem {
  id: string;
  product_code: string;
  product_name: string;
  current_stock: number;
}

type ItemRow = {
  inventory_id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  price: number;
  weight: string;
  grind: string;
};

const STATUS_OPTIONS = [
  { id: "pending", label: "Pendiente de pago" },
  { id: "paid", label: "Pagado" },
  { id: "processing", label: "Preparando" },
  { id: "shipped", label: "Enviado" },
  { id: "delivered", label: "Entregado" },
  { id: "cancelled", label: "Cancelado" },
];

const DOCUMENT_TYPES = ["CC", "NIT", "CE", "PP", "TI"];

const inputCls =
  "w-full px-4 py-2.5 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 disabled:opacity-50 disabled:bg-foreground/5";
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

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function OrderActions({ order, inventory, crmClients = [] }: { order: any, inventory: InventoryItem[], crmClients?: any[] }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const linkedClient = crmClients.find((c) => c.id === order.client_id);
  const orderClientName = (Array.isArray(order.client) ? order.client[0] : order.client)?.name;

  // ── Cliente ──
  const [selectedClientId, setSelectedClientId] = useState<string>(order.client_id || "");
  const [customerName, setCustomerName] = useState<string>(
    orderClientName || order.shipping_info?.recipient_name || linkedClient?.name || ""
  );
  const [documentType, setDocumentType] = useState<string>(linkedClient?.document_type || "CC");
  const [documentNumber, setDocumentNumber] = useState<string>(linkedClient?.document_number || "");
  const [contactEmail, setContactEmail] = useState(order.contact_email || "");
  const [contactPhone, setContactPhone] = useState(order.contact_phone || "");
  // On by default when a CRM client is linked: editing the customer here is
  // usually fixing the customer, not just this one order.
  const [syncClient, setSyncClient] = useState<boolean>(!!order.client_id);

  // ── Envío ──
  const [address, setAddress] = useState(order.shipping_info?.address || "");
  const [details, setDetails] = useState(order.shipping_info?.details || "");
  const [city, setCity] = useState(order.shipping_info?.city || "");
  const [state, setState] = useState(order.shipping_info?.state || order.shipping_info?.department || "");

  // ── Seguimiento ──
  const [status, setStatus] = useState(order.status || "pending");
  const [dueDate, setDueDate] = useState<string>(order.delivery_due_date || "");
  const [notes, setNotes] = useState<string>(order.notes || "");

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = crmClients.find((c) => c.id === clientId);
    if (client) {
      setCustomerName(client.name || "");
      setDocumentType(client.document_type || "CC");
      setDocumentNumber(client.document_number || "");
      setContactEmail(client.email || "");
      setContactPhone(client.phone || "");
      setAddress(client.address || "Recogida en tienda");
      setCity(client.city || "Bogotá");
      setState(client.department || "Cundinamarca");
      setSyncClient(true);
    } else {
      setSyncClient(false);
    }
  };

  // ── Productos ──
  const [items, setItems] = useState<ItemRow[]>(
    (order.order_items || []).map((oi: any) => {
      const inv =
        inventory.find(i => i.id === oi.inventory_id) ??
        inventory.find(i => i.product_name === oi.product_id);
      return {
        inventory_id: inv ? inv.id : "",
        product_code: inv ? inv.product_code : "",
        product_name: oi.product_id,
        quantity: oi.quantity,
        price: Number(oi.price_at_time),
        weight: oi.weight || "",
        grind: oi.grind || ""
      };
    })
  );
  // Products and stock are only rewritten when the products actually change.
  const [itemsDirty, setItemsDirty] = useState(false);
  const changeItems = (next: ItemRow[]) => {
    setItems(next);
    setItemsDirty(true);
  };

  const handleDelete = async () => {
    if (!confirm("¿Estás seguro de que quieres eliminar esta orden? Se revertirá el stock descontado de los productos vendidos.")) return;
    setIsDeleting(true);
    try {
      await deleteManualAdminOrder(order.id);
      // Let the server component re-render via revalidatePath
    } catch (err: any) {
      alert("Error eliminando la orden: " + err.message);
      setIsDeleting(false);
    }
  };

  const handleAddItem = () => {
    changeItems([...items, { inventory_id: "", product_code: "", product_name: "", quantity: 1, price: 0, weight: "", grind: "" }]);
  };

  const handleRemoveItem = (index: number) => {
    changeItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemRow, value: any) => {
    const newItems = [...items];
    if (field === "inventory_id") {
      const invItem = inventory.find(i => i.id === value);
      if (invItem) {
        newItems[index] = {
          ...newItems[index],
          inventory_id: value,
          product_code: invItem.product_code,
          product_name: invItem.product_name,
        };
        // Auto-assign weight
        if (invItem.product_name.includes("250g")) newItems[index].weight = "250g";
        else if (invItem.product_name.includes("500g")) newItems[index].weight = "500g";
        else if (invItem.product_name.includes("2.5kg")) newItems[index].weight = "2.5kg";
      }
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    changeItems(newItems);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itemsDirty) {
      if (items.length === 0) {
        setError("Debes agregar al menos un producto.");
        return;
      }
      if (items.some(i => !i.inventory_id)) {
        setError("Todos los items deben tener un producto de inventario seleccionado (es necesario para descontar stock correctamente).");
        return;
      }
    }
    if (syncClient && selectedClientId && !customerName.trim()) {
      setError("El nombre del cliente es obligatorio.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const res = await updateManualAdminOrder(order.id, {
        client_id: selectedClientId || null,
        customer_name: customerName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        shipping_info: { address, details, city, state },
        status,
        delivery_due_date: dueDate || null,
        notes,
        items: itemsDirty ? items : undefined,
        client_update:
          syncClient && selectedClientId
            ? {
                name: customerName,
                document_type: documentType,
                document_number: documentNumber,
                email: contactEmail,
                phone: contactPhone,
                address,
                city,
                department: state,
              }
            : null,
      });
      if (res.warning) alert(res.warning);
      setItemsDirty(false);
      setIsEditOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const totalAmount = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  // Products of online (paid through the store) orders stay locked so they
  // keep matching what the customer paid. Everything else is editable.
  const isManual = order.user_id === null;

  return (
    <>
      <div className="flex gap-2">
        <button
          onClick={() => setIsEditOpen(true)}
          className="p-2 text-foreground/40 hover:text-[#C59F59] hover:bg-foreground/5 rounded-lg transition-colors"
          title="Editar Orden"
        >
          <Edit className="w-4 h-4" />
        </button>
        {isManual && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 text-foreground/40 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            title="Eliminar Orden"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {isEditOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-foreground/20 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto border border-foreground/10 flex flex-col">
            <div className="px-5 sm:px-6 py-4 sm:py-6 border-b border-foreground/5 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl sm:text-2xl font-serif text-foreground">Editar Orden #{order.id.split('-')[0]}</h2>
              <button onClick={() => setIsEditOpen(false)} className="p-2 hover:bg-foreground/5 rounded-full transition-colors" aria-label="Cerrar">
                <X className="w-5 h-5 text-foreground/40" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="p-5 sm:p-6 space-y-8 text-left">
              {error && (
                <div className="p-4 bg-red-50 text-red-800 rounded-xl text-sm border border-red-100">
                  {error}
                </div>
              )}

              {/* Cliente */}
              <Section icon={<UserRound className="w-3.5 h-3.5" />} title="Cliente">
                {crmClients.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-[#C59F59] mb-1">Cliente del CRM</label>
                    <select
                      value={selectedClientId}
                      onChange={e => handleClientSelect(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#f9f7f0] border border-[#C59F59]/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/40"
                    >
                      <option value="">-- Sin Cliente CRM --</option>
                      {crmClients.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name} {c.document_number ? `(${c.document_number})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Nombre / Razón social</label>
                    <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className={inputCls} placeholder="Nombre del cliente" />
                  </div>
                  {selectedClientId && (
                    <div className="grid grid-cols-[100px_1fr] gap-3 sm:col-span-2">
                      <div>
                        <label className={labelCls}>Tipo doc.</label>
                        <select value={documentType} onChange={e => setDocumentType(e.target.value)} className={inputCls}>
                          {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Número de documento</label>
                        <input type="text" inputMode="numeric" value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className={labelCls}>Email</label>
                    <input type="email" inputMode="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Teléfono</label>
                    <input type="tel" inputMode="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={inputCls} />
                  </div>
                </div>

                {selectedClientId && (
                  <label className="flex items-start gap-3 p-3 rounded-xl bg-[#f9f7f0] border border-foreground/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncClient}
                      onChange={e => setSyncClient(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-[#C59F59]"
                    />
                    <span className="text-sm">
                      <span className="font-bold">Actualizar también la ficha del cliente</span>
                      <span className="block text-xs text-foreground/50">
                        Guarda nombre, documento, contacto y dirección en el CRM. Desmárcalo si el cambio es solo para esta orden.
                      </span>
                    </span>
                  </label>
                )}
              </Section>

              {/* Envío */}
              <Section icon={<MapPin className="w-3.5 h-3.5" />} title="Envío">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Dirección</label>
                    <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Detalles (apto, oficina, indicaciones)</label>
                    <input type="text" value={details} onChange={e => setDetails(e.target.value)} className={inputCls} placeholder="Apto 302, torre B..." />
                  </div>
                  <div>
                    <label className={labelCls}>Ciudad</label>
                    <input type="text" value={city} onChange={e => setCity(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Departamento</label>
                    <input type="text" value={state} onChange={e => setState(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </Section>

              {/* Seguimiento */}
              <Section icon={<CalendarClock className="w-3.5 h-3.5" />} title="Seguimiento">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Estado de la orden</label>
                    <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                      {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Entrega prometida</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Notas</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-y`} placeholder="Medio de pago, instrucciones de entrega..." />
                  </div>
                </div>
              </Section>

              {/* Productos */}
              <Section icon={<Package className="w-3.5 h-3.5" />} title="Productos">
                {!isManual && (
                  <p className="text-xs text-foreground/50 italic -mt-2">
                    Orden en línea: los productos no se pueden modificar para que coincidan con lo que pagó el cliente. El resto de datos sí.
                  </p>
                )}

                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="grid grid-cols-2 sm:grid-cols-[1fr_80px_120px_90px_110px_auto] gap-3 items-end p-4 bg-[#f9f7f0] rounded-xl border border-foreground/5">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">Inventario</label>
                        <select
                          value={item.inventory_id}
                          onChange={e => updateItem(index, 'inventory_id', e.target.value)}
                          disabled={!isManual}
                          className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#C59F59]/20 disabled:opacity-50 disabled:bg-foreground/5"
                        >
                          <option value="">Seleccione producto...</option>
                          {inventory.map(inv => (
                            <option key={inv.id} value={inv.id}>
                              {inv.product_name} (Stock: {Number(inv.current_stock)})
                            </option>
                          ))}
                        </select>
                        {!item.inventory_id && <p className="text-[10px] text-red-500 mt-1">Este producto no está mapeado a un item de inventario actual.</p>}
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">Cant.</label>
                        <input type="number" inputMode="numeric" min="1" value={item.quantity} onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} disabled={!isManual} className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm disabled:opacity-50" />
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">Precio unitario</label>
                        <input type="number" inputMode="numeric" min="0" step="100" value={item.price} onChange={e => updateItem(index, 'price', parseInt(e.target.value) || 0)} disabled={!isManual} className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm disabled:opacity-50" />
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">Peso (opc)</label>
                        <input type="text" placeholder="250g" value={item.weight} onChange={e => updateItem(index, 'weight', e.target.value)} disabled={!isManual} className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm disabled:opacity-50" />
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">Molienda (opc)</label>
                        <select value={item.grind} onChange={e => updateItem(index, 'grind', e.target.value)} disabled={!isManual} className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm disabled:opacity-50">
                          <option value="">N/A</option>
                          <option value="whole">Grano</option>
                          <option value="ground">Molido</option>
                        </select>
                      </div>

                      {isManual && (
                        <button type="button" onClick={() => handleRemoveItem(index)} className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors text-xs font-bold" aria-label={`Quitar producto ${index + 1}`}>
                          <Trash2 className="w-4 h-4" />
                          <span className="sm:hidden">Quitar</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {isManual && (
                  <button type="button" onClick={handleAddItem} className="text-xs font-bold text-[#C59F59] hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Agregar producto
                  </button>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-foreground/5">
                  <span className="font-medium text-sm">Total Orden</span>
                  <span className="font-serif text-xl text-[#C59F59]">
                    {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(totalAmount)}
                  </span>
                </div>
                {itemsDirty && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                    Cambiaste los productos: al guardar se recalcula el total y, si la orden está pagada, se ajusta el inventario.
                  </p>
                )}
              </Section>

              <div className="pt-4 pb-[env(safe-area-inset-bottom)] sticky bottom-0 bg-white">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-4 bg-foreground text-background text-sm font-bold uppercase tracking-widest rounded-xl hover:bg-[#C59F59] hover:text-white transition-all shadow-lg disabled:opacity-50"
                >
                  {isSaving ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
