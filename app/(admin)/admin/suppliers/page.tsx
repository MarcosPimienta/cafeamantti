'use client';

import React, { useState, useEffect } from 'react';
import { Search, Building2, Mail, Phone, MapPin, CreditCard, Trash2, Calendar, Edit2 } from 'lucide-react';
import { getSuppliers, deleteSupplier } from './actions';
import CreateSupplierModal from './CreateSupplierModal';

export default function AdminSuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  async function loadData() {
    setIsLoading(true);
    const data = await getSuppliers();
    setSuppliers(data);
    setIsLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar al proveedor "${name}"?`)) return;
    const res = await deleteSupplier(id);
    if (res.success) {
      await loadData();
    } else {
      alert(res.error || 'No se pudo eliminar el proveedor.');
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const query = search.toLowerCase();
    return (
      (s.name && s.name.toLowerCase().includes(query)) ||
      (s.document_number && s.document_number.includes(query)) ||
      (s.email && s.email.toLowerCase().includes(query)) ||
      (s.phone && s.phone.includes(query)) ||
      (s.city && s.city.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Directorio de Proveedores</h1>
          <p className="text-foreground/60">Gestión de proveedores para compras, servicios y cuentas de cobro de egreso.</p>
        </div>
        <div className="self-start md:self-auto">
          <CreateSupplierModal onSuccess={loadData} />
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden min-h-[500px]">
        {/* Toolbar */}
        <div className="p-6 border-b border-foreground/5 flex flex-col md:flex-row gap-4 justify-between items-center bg-[#f9f7f0]">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input
              type="text"
              placeholder="Buscar por nombre, NIT, email o ciudad..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
            />
          </div>
          <div className="text-xs font-bold text-foreground/50">
            Total Proveedores: <span className="text-[#C59F59] text-sm font-extrabold">{suppliers.length}</span>
          </div>
        </div>

        {/* Suppliers List */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-20 text-center text-foreground/40 font-medium">Cargando directorio de proveedores...</div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="p-20 text-center">
              <Building2 className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
              <p className="text-lg font-serif text-foreground">No se encontraron proveedores</p>
              <p className="text-sm text-foreground/50">Crea tu primer proveedor manual o genera una cuenta de cobro de gasto para registrarlo automáticamente.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm text-foreground/80 border-collapse">
              <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
                <tr>
                  <th className="px-6 py-4 font-medium">Proveedor / Razón Social</th>
                  <th className="px-6 py-4 font-medium">Documento</th>
                  <th className="px-6 py-4 font-medium">Contacto</th>
                  <th className="px-6 py-4 font-medium">Ubicación</th>
                  <th className="px-6 py-4 font-medium">Datos Bancarios</th>
                  <th className="px-6 py-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-stone-50/40 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center font-serif text-lg bg-[#C59F59]/10 text-[#C59F59] shrink-0">
                          {(supplier.name?.[0] || '?').toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{supplier.name}</p>
                          <span className="text-[11px] text-foreground/40">ID: {supplier.id.slice(0, 8)}...</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {supplier.document_number ? (
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-widest bg-foreground/5 text-foreground/50 px-2 py-0.5 rounded-md mr-2">
                            {supplier.document_type || 'NIT'}
                          </span>
                          <span className="font-mono text-xs">{supplier.document_number}</span>
                        </div>
                      ) : (
                        <span className="text-foreground/40 italic text-xs">Sin documento</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-xs">
                        {supplier.email && (
                          <span className="flex items-center gap-1.5 text-foreground/80">
                            <Mail className="w-3.5 h-3.5 text-foreground/40" /> {supplier.email}
                          </span>
                        )}
                        {supplier.phone && (
                          <span className="flex items-center gap-1.5 text-foreground/80">
                            <Phone className="w-3.5 h-3.5 text-foreground/40" /> {supplier.phone}
                          </span>
                        )}
                        {!supplier.email && !supplier.phone && <span className="text-foreground/40 italic">Sin contacto</span>}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-xs">
                      {supplier.address || supplier.city ? (
                        <div className="flex items-start gap-1.5 text-foreground/80">
                          <MapPin className="w-3.5 h-3.5 text-foreground/40 shrink-0 mt-0.5" />
                          <span>
                            {supplier.address ? `${supplier.address}` : ''}
                            {supplier.address && supplier.city ? `, ` : ''}
                            {supplier.city ? `${supplier.city}` : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-foreground/40 italic">No registrada</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-xs">
                      {supplier.bank_name ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-foreground">{supplier.bank_name}</span>
                          <span className="text-foreground/60">{supplier.bank_account_type} No. {supplier.bank_account_number}</span>
                        </div>
                      ) : (
                        <span className="text-foreground/40 italic">Sin datos bancarios</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right space-x-1 whitespace-nowrap">
                      <CreateSupplierModal supplierToEdit={supplier} onSuccess={loadData} />
                      <button
                        onClick={() => handleDelete(supplier.id, supplier.name)}
                        className="p-2 hover:bg-red-50 text-foreground/40 hover:text-red-500 rounded-lg transition-colors border border-transparent hover:border-red-100 inline-flex"
                        title="Eliminar proveedor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
