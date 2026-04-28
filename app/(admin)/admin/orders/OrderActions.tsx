"use client";

import React, { useState } from "react";
import { Edit, Trash2, X, Plus } from "lucide-react";
import { deleteManualAdminOrder, updateManualAdminOrder } from "../../actions";

interface InventoryItem {
  id: string;
  product_code: string;
  product_name: string;
  current_stock: number;
}

export default function OrderActions({ order, inventory, crmClients = [] }: { order: any, inventory: InventoryItem[], crmClients?: any[] }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  // Edit Form State
  const [contactEmail, setContactEmail] = useState(order.contact_email || "");
  const [contactPhone, setContactPhone] = useState(order.contact_phone || "");
  const [address, setAddress] = useState(order.shipping_info?.address || "");
  const [details, setDetails] = useState(order.shipping_info?.details || "");
  const [city, setCity] = useState(order.shipping_info?.city || "");
  const [state, setState] = useState(order.shipping_info?.state || "");
  const [status, setStatus] = useState(order.status || "pending");
  const [selectedClientId, setSelectedClientId] = useState(order.client_id || "");

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = crmClients.find(c => c.id === clientId);
    if (client) {
      setContactEmail(client.email || "");
      setContactPhone(client.phone || "");
      setAddress(client.address || "Recogida en tienda");
      setCity(client.city || "Bogotá");
      setState(client.department || "Cundinamarca");
    }
  };

  const [items, setItems] = useState<{
    inventory_id: string;
    product_code: string;
    product_name: string;
    quantity: number;
    price: number;
    weight: string;
    grind: string;
  }[]>(
    (order.order_items || []).map((oi: any) => {
      const inv = inventory.find(i => i.product_name === oi.product_id);
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
    setItems([...items, {
      inventory_id: "",
      product_code: "",
      product_name: "",
      quantity: 1,
      price: 0,
      weight: "",
      grind: ""
    }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
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
      (newItems[index] as any)[field] = value;
    }
    setItems(newItems);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      setError("Debes agregar al menos un producto.");
      return;
    }
    if (items.some(i => !i.inventory_id)) {
      setError("Todos los items deben tener un producto de inventario seleccionado (es necesario para descontar stock correctamente).");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await updateManualAdminOrder(order.id, {
        client_id: selectedClientId || undefined,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        shipping_info: { address, details, city, state },
        status,
        items
      });
      setIsEditOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const totalAmount = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  // If this order is NOT a manual order (i.e. user_id is NOT null), we might want to disable deleting/editing items.
  // Actually, we can hide the delete button if it's an online order or just let admin delete anyway.
  // We'll assume the admin can manage all. BUT we should be careful with online orders' payments.
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-foreground/10 flex flex-col">
            <div className="p-6 border-b border-foreground/5 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-serif text-foreground">Editar Orden #{order.id.split('-')[0]}</h2>
              <button onClick={() => setIsEditOpen(false)} className="p-2 hover:bg-foreground/5 rounded-full transition-colors">
                <X className="w-5 h-5 text-foreground/40" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="p-6 space-y-8">
              {error && (
                <div className="p-4 bg-red-50 text-red-800 rounded-xl text-sm border border-red-100">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">Contacto</h3>
                  
                  {isManual && crmClients && crmClients.length > 0 && (
                    <div className="mb-4">
                      <label className="block text-xs font-bold text-[#C59F59] mb-1">Cambiar Cliente Asignado</label>
                      <select 
                        value={selectedClientId} 
                        onChange={e => handleClientSelect(e.target.value)}
                        className="w-full px-4 py-2 bg-[#f9f7f0] border border-[#C59F59]/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/40"
                      >
                        <option value="">-- Sin Cliente CRM --</option>
                        {crmClients.map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name} {c.document_number ? `(${c.document_number})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-foreground/60 mb-1">Email</label>
                    <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="w-full px-4 py-2 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground/60 mb-1">Teléfono</label>
                    <input type="text" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className="w-full px-4 py-2 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground/60 mb-1">Estado de la Orden</label>
                    <select value={status} onChange={e => setStatus(e.target.value)} className="w-full px-4 py-2 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20">
                      <option value="paid">Pagado</option>
                      <option value="delivered">Entregado</option>
                      <option value="pending">Pendiente</option>
                      <option value="processing">Preparando</option>
                      <option value="shipped">Enviado</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">Envío</h3>
                  <div>
                    <label className="block text-xs font-medium text-foreground/60 mb-1">Dirección</label>
                    <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full px-4 py-2 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground/60 mb-1">Ciudad</label>
                      <input type="text" value={city} onChange={e => setCity(e.target.value)} className="w-full px-4 py-2 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground/60 mb-1">Departamento</label>
                      <input type="text" value={state} onChange={e => setState(e.target.value)} className="w-full px-4 py-2 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 text-left">
                <div className="flex justify-between items-center">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">Productos</h3>
                  {isManual && (
                    <button type="button" onClick={handleAddItem} className="text-xs font-medium text-[#C59F59] hover:underline flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Agregar Item
                    </button>
                  )}
                </div>
                
                {!isManual && (
                  <p className="text-xs text-foreground/50 italic">Esta es una orden en línea. La modificación de ítems está desactivada para prevenir inconsistencias de pago. (Solo aplica a órdenes manuales).</p>
                )}

                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="flex flex-wrap md:flex-nowrap gap-3 items-end p-4 bg-[#f9f7f0] rounded-xl border border-foreground/5">
                      <div className="flex-1 min-w-[200px]">
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
                      
                      <div className="w-24">
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">Cant.</label>
                        <input type="number" min="1" value={item.quantity} onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} disabled={!isManual} className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm disabled:opacity-50" />
                      </div>

                      <div className="w-32">
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">Precio Unitario</label>
                        <input type="number" min="0" step="100" value={item.price} onChange={e => updateItem(index, 'price', parseInt(e.target.value) || 0)} disabled={!isManual} className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm disabled:opacity-50" />
                      </div>

                      <div className="w-24">
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">Peso (opc)</label>
                        <input type="text" placeholder="250g" value={item.weight} onChange={e => updateItem(index, 'weight', e.target.value)} disabled={!isManual} className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm disabled:opacity-50" />
                      </div>

                      <div className="w-28">
                        <label className="block text-[10px] font-medium text-foreground/50 mb-1">Molienda (opc)</label>
                        <select value={item.grind} onChange={e => updateItem(index, 'grind', e.target.value)} disabled={!isManual} className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm disabled:opacity-50">
                          <option value="">N/A</option>
                          <option value="whole">Grano</option>
                          <option value="ground">Molido</option>
                        </select>
                      </div>

                      {isManual && (
                        <button type="button" onClick={() => handleRemoveItem(index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors mb-0.5">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-foreground/5">
                  <span className="font-medium text-sm">Total Orden</span>
                  <span className="font-serif text-xl text-[#C59F59]">
                    {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(totalAmount)}
                  </span>
                </div>
              </div>

              <div className="pt-4 sticky bottom-0 bg-white">
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
