"use client";

import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { createClientCRM } from "../../actions";

export default function CreateCRMClientModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    document_type: "NIT",
    document_number: "",
    email: "",
    phone: "",
    address: "",
    city: "Bogotá",
    department: "Cundinamarca"
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      setError("El nombre o razón social es obligatorio.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await createClientCRM(formData);
      if (res.success) {
        setSuccess("Cliente registrado exitosamente.");
        setTimeout(() => {
          setIsOpen(false);
          setSuccess("");
          setFormData({
            name: "", document_type: "NIT", document_number: "",
            email: "", phone: "", address: "", city: "Bogotá", department: "Cundinamarca"
          });
        }, 1500);
      }
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
        className="flex items-center gap-2 px-6 py-3 bg-foreground text-background rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#C59F59] hover:text-white transition-all shadow-md shrink-0"
      >
        <Plus className="w-4 h-4" />
        Nuevo Cliente
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden border border-foreground/10 flex flex-col">
            <div className="p-6 border-b border-foreground/5 flex justify-between items-center bg-[#fdfbf7]">
              <h2 className="text-xl font-serif text-foreground">Registrar Cliente Manual</h2>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-foreground/5 rounded-full transition-colors">
                <X className="w-5 h-5 text-foreground/40" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {error && (
                <div className="p-4 bg-red-50 text-red-800 rounded-xl text-sm border border-red-100">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-4 bg-green-50 text-green-800 rounded-xl text-sm border border-green-100">
                  {success}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-foreground/60 mb-1">Nombre / Razón Social <span className="text-red-500">*</span></label>
                <input required name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-foreground/60 mb-1">Tipo Doc.</label>
                  <select name="document_type" value={formData.document_type} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20">
                    <option value="NIT">NIT</option>
                    <option value="CC">CC</option>
                    <option value="CE">CE</option>
                    <option value="PAS">PAS</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-foreground/60 mb-1">Número de Documento</label>
                  <input name="document_number" value={formData.document_number} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground/60 mb-1">Correo Electrónico</label>
                  <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/60 mb-1">Teléfono</label>
                  <input name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                </div>
              </div>

              <div className="pt-4 border-t border-foreground/5">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59] mb-4">Ubicación (Opcional)</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground/60 mb-1">Dirección Completa</label>
                    <input name="address" value={formData.address} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-foreground/60 mb-1">Ciudad</label>
                      <input name="city" value={formData.city} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground/60 mb-1">Departamento</label>
                      <input name="department" value={formData.department} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full py-4 bg-foreground text-background text-sm font-bold uppercase tracking-widest rounded-xl hover:bg-[#C59F59] hover:text-white transition-all shadow-lg disabled:opacity-50"
                >
                  {loading ? "Registrando..." : "Guardar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
