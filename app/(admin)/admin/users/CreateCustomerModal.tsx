"use client";

import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { createManualCustomer } from "../../actions";

export default function CreateCustomerModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    cedula: "",
    address: "",
    city: "Bogotá",
    department: "Cundinamarca"
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email) {
      setError("El correo es obligatorio.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await createManualCustomer({
        email: formData.email,
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone_number: formData.phone,
        cedula_number: formData.cedula,
        address: formData.address,
        city: formData.city,
        department: formData.department
      });

      if (res.success) {
        setSuccess("Cliente creado exitosamente con contraseña genérica.");
        setTimeout(() => {
          setIsOpen(false);
          setSuccess("");
          setFormData({
            firstName: "", lastName: "", email: "", phone: "",
            cedula: "", address: "", city: "Bogotá", department: "Cundinamarca"
          });
        }, 2000);
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
        Nuevo Cliente Manual
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden border border-foreground/10 flex flex-col">
            <div className="p-6 border-b border-foreground/5 flex justify-between items-center bg-[#fdfbf7]">
              <h2 className="text-xl font-serif text-foreground">Registrar Nuevo Cliente</h2>
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground/60 mb-1">Nombre</label>
                  <input required name="firstName" value={formData.firstName} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/60 mb-1">Apellidos</label>
                  <input required name="lastName" value={formData.lastName} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground/60 mb-1">Correo Electrónico (Requerido)</label>
                <input required type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground/60 mb-1">Cédula</label>
                  <input name="cedula" value={formData.cedula} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground/60 mb-1">Teléfono</label>
                  <input name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-2 bg-[#f9f7f0] border border-foreground/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20" />
                </div>
              </div>

              <div className="pt-4 border-t border-foreground/5">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59] mb-4">Ubicación</h3>
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
                  {loading ? "Registrando..." : "Registrar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
