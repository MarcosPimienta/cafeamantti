"use client";

import React, { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { createClientCRM, updateClientCRM } from "../../actions";
import { daneCodeFor } from "@/utils/siigo/daneCities";
import { useTr } from "@/app/(admin)/AdminI18n";

type ClientForm = {
  name: string;
  document_type: string;
  document_number: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  department: string;
  city_code: string;
};

const EMPTY: ClientForm = {
  name: "", document_type: "NIT", document_number: "",
  email: "", phone: "", address: "", city: "Bogotá", department: "Cundinamarca", city_code: "11001",
};

/** New client, or editing `client` when given (shows a pencil button). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CreateCRMClientModal({ client }: { client?: any } = {}) {
  const tr = useTr();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const initial = (): ClientForm =>
    client
      ? {
          name: client.name ?? "",
          document_type: client.document_type ?? "NIT",
          document_number: client.document_number ?? "",
          email: client.email ?? "",
          phone: client.phone ?? "",
          address: client.address ?? "",
          city: client.city ?? "",
          department: client.department ?? "",
          city_code: client.city_code ?? daneCodeFor(client.city) ?? "",
        }
      : EMPTY;
  const [formData, setFormData] = useState<ClientForm>(initial);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((f) => {
      const next = { ...f, [name]: name === "city_code" ? value.replace(/\D/g, "").slice(0, 5) : value };
      // Known city → its DANE code (Siigo needs it to create the customer).
      if (name === "city") next.city_code = daneCodeFor(value) ?? (daneCodeFor(f.city) === f.city_code ? "" : f.city_code);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      setError(tr("El nombre o razón social es obligatorio."));
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      if (formData.city_code && !/^\d{5}$/.test(formData.city_code)) {
        setError(tr("El código DANE de la ciudad tiene 5 dígitos (ej. 05001 Medellín)."));
        return;
      }
      // city_code only when filled, so saving works before the Siigo migration.
      const { city_code, ...rest } = formData;
      const data = city_code ? { ...rest, city_code } : rest;
      const res = client ? await updateClientCRM(client.id, data) : await createClientCRM(data);
      if (res.success) {
        setSuccess(client ? tr("Cliente actualizado.") : tr("Cliente registrado exitosamente."));
        setTimeout(() => {
          setIsOpen(false);
          setSuccess("");
          if (!client) setFormData(EMPTY);
        }, 1200);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {client ? (
        <button onClick={() => { setFormData(initial()); setIsOpen(true); }} className="p-1.5 rounded-lg text-foreground/40 hover:text-[#C59F59] hover:bg-foreground/5" aria-label={tr("Editar {name}", { name: client.name })}>
          <Pencil className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-foreground text-background rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#C59F59] hover:text-white transition-all shadow-md shrink-0"
        >
          <Plus className="w-4 h-4" />
          {tr("Nuevo Cliente")}
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden border border-foreground/10 flex flex-col">
            <div className="p-6 border-b border-foreground/5 flex justify-between items-center bg-[#fdfbf7]">
              <h2 className="text-xl font-serif text-foreground">{client ? tr("Editar Cliente") : tr("Registrar Cliente Manual")}</h2>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-foreground/5 rounded-full transition-colors">
                <X className="w-5 h-5 text-foreground/40" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {error && (
                <div className="p-4 bg-red-50 text-red-800 rounded-xl text-sm border border-red-100">
                  {tr.msg(error)}
                </div>
              )}
              {success && (
                <div className="p-4 bg-green-50 text-green-800 rounded-xl text-sm border border-green-100">
                  {tr.msg(success)}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground/60 mb-1">{tr("Nombre / Razón Social")}{" "}<span className="text-red-500">*</span></label>
                <input required name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-foreground/60 mb-1">{tr("Tipo Doc.")}</label>
                  <select name="document_type" value={formData.document_type} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20">
                    <option value="NIT">{tr("NIT")}</option>
                    <option value="CC">{tr("CC")}</option>
                    <option value="CE">{tr("CE")}</option>
                    <option value="PAS">{tr("PAS")}</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-foreground/60 mb-1">{tr("Número de Documento")}</label>
                  <input name="document_number" value={formData.document_number} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground/60 mb-1">{tr("Correo Electrónico")}</label>
                  <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/60 mb-1">{tr("Teléfono")}</label>
                  <input name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                </div>
              </div>

              <div className="pt-4 border-t border-foreground/5">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59] mb-4">{tr("Ubicación (Opcional)")}</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground/60 mb-1">{tr("Dirección Completa")}</label>
                    <input name="address" value={formData.address} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground/60 mb-1">{tr("Ciudad")}</label>
                      <input name="city" value={formData.city} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground/60 mb-1">{tr("Departamento")}</label>
                      <input name="department" value={formData.department} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`city-code-${client?.id ?? "new"}`} className="block text-xs font-medium text-foreground/60 mb-1">{tr("Código DANE de la ciudad")}</label>
                    <input id={`city-code-${client?.id ?? "new"}`} name="city_code" inputMode="numeric" value={formData.city_code} onChange={handleChange} placeholder={tr("Ej. 05001")}
                      className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                    <p className="text-[11px] text-foreground/40 mt-1">{tr("Lo necesita Siigo para facturarle. Se llena solo con las ciudades principales.")}</p>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full py-4 bg-foreground text-background text-sm font-bold uppercase tracking-widest rounded-xl hover:bg-[#C59F59] hover:text-white transition-all shadow-lg disabled:opacity-50"
                >
                  {loading ? tr("Guardando...") : client ? tr("Guardar cambios") : tr("Guardar Cliente")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
