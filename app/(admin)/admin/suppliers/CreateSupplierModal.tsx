'use client';

import React, { useState } from 'react';
import { Plus, X, Building2, Edit2 } from 'lucide-react';
import { createSupplier, updateSupplier } from './actions';

interface SupplierModalProps {
  supplierToEdit?: any;
  onSuccess?: () => void;
  triggerButton?: React.ReactNode;
}

export default function CreateSupplierModal({ supplierToEdit, onSuccess, triggerButton }: SupplierModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(supplierToEdit?.name || '');
  const [documentType, setDocumentType] = useState(supplierToEdit?.document_type || 'NIT');
  const [documentNumber, setDocumentNumber] = useState(supplierToEdit?.document_number || '');
  const [email, setEmail] = useState(supplierToEdit?.email || '');
  const [phone, setPhone] = useState(supplierToEdit?.phone || '');
  const [address, setAddress] = useState(supplierToEdit?.address || '');
  const [city, setCity] = useState(supplierToEdit?.city || '');
  const [bankName, setBankName] = useState(supplierToEdit?.bank_name || '');
  const [bankAccountType, setBankAccountType] = useState(supplierToEdit?.bank_account_type || 'Ahorros');
  const [bankAccountNumber, setBankAccountNumber] = useState(supplierToEdit?.bank_account_number || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openModal = () => {
    if (supplierToEdit) {
      setName(supplierToEdit.name || '');
      setDocumentType(supplierToEdit.document_type || 'NIT');
      setDocumentNumber(supplierToEdit.document_number || '');
      setEmail(supplierToEdit.email || '');
      setPhone(supplierToEdit.phone || '');
      setAddress(supplierToEdit.address || '');
      setCity(supplierToEdit.city || '');
      setBankName(supplierToEdit.bank_name || '');
      setBankAccountType(supplierToEdit.bank_account_type || 'Ahorros');
      setBankAccountNumber(supplierToEdit.bank_account_number || '');
    } else {
      setName('');
      setDocumentType('NIT');
      setDocumentNumber('');
      setEmail('');
      setPhone('');
      setAddress('');
      setCity('');
      setBankName('');
      setBankAccountType('Ahorros');
      setBankAccountNumber('');
    }
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Por favor ingresa el nombre o razón social del proveedor.');
      return;
    }

    setIsSubmitting(true);
    const payload = {
      name,
      document_type: documentType,
      document_number: documentNumber,
      email,
      phone,
      address,
      city,
      bank_name: bankName,
      bank_account_type: bankAccountType,
      bank_account_number: bankAccountNumber,
    };

    let res;
    if (supplierToEdit?.id) {
      res = await updateSupplier(supplierToEdit.id, payload);
    } else {
      res = await createSupplier(payload);
    }

    if (res.success) {
      setIsOpen(false);
      if (onSuccess) onSuccess();
    } else {
      alert(res.error || 'Ocurrió un error al guardar el proveedor.');
    }
    setIsSubmitting(false);
  };

  return (
    <>
      {triggerButton ? (
        <div onClick={openModal} className="cursor-pointer">
          {triggerButton}
        </div>
      ) : supplierToEdit ? (
        <button
          onClick={openModal}
          className="p-2 hover:bg-stone-100 text-foreground/60 hover:text-[#C59F59] rounded-lg transition-colors border border-transparent hover:border-foreground/5 inline-flex"
          title="Editar proveedor"
        >
          <Edit2 className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={openModal}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#C59F59] text-white rounded-xl font-bold hover:bg-[#B38E4D] transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Nuevo Proveedor
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-foreground/5 shadow-2xl flex flex-col">
            <div className="p-6 border-b border-foreground/5 flex justify-between items-center bg-[#f9f7f0]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#C59F59]/10 text-[#C59F59] flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-serif font-bold text-foreground">
                    {supplierToEdit ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                  </h2>
                  <p className="text-xs text-foreground/50">
                    {supplierToEdit ? 'Modifica los datos del proveedor registrado.' : 'Ingresa la información básica y bancaria del proveedor.'}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-stone-200/50 rounded-full transition-colors">
                <X className="w-5 h-5 text-foreground/50" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Información Básica */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59F59]">Información Básica</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Nombre o Razón Social *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej. Distribuidora de Café S.A.S. o Juan Pérez"
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Tipo de Documento</label>
                    <select
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    >
                      <option value="NIT">NIT</option>
                      <option value="CC">Cédula de Ciudadanía (CC)</option>
                      <option value="CE">Cédula de Extranjería (CE)</option>
                      <option value="PASAPORTE">Pasaporte</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Número de Documento / NIT</label>
                    <input
                      type="text"
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      placeholder="Ej. 901234567-8"
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Contacto & Ubicación */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59F59]">Contacto & Ubicación</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Correo Electrónico</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="proveedor@ejemplo.com"
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Teléfono</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ej. 3001234567"
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Dirección</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Ej. Calle 10 # 40-20"
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Ciudad</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ej. Medellín"
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Información Bancaria */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59F59]">Datos Bancarios para Pagos (Opcional)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Banco</label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="Ej. Bancolombia"
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Tipo de Cuenta</label>
                    <select
                      value={bankAccountType}
                      onChange={(e) => setBankAccountType(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    >
                      <option value="Ahorros">Ahorros</option>
                      <option value="Corriente">Corriente</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Número de Cuenta</label>
                    <input
                      type="text"
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      placeholder="Ej. 123456789"
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-foreground/5 bg-stone-50 -mx-6 -mb-6 flex justify-end gap-3 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-5 py-3 border border-foreground/10 rounded-xl text-sm font-bold text-foreground/70 hover:bg-stone-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-3 bg-[#C59F59] hover:bg-[#B38E4D] text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? 'Guardando...' : supplierToEdit ? 'Guardar Cambios' : 'Crear Proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
