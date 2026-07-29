'use client';

import React, { useState, useEffect } from "react";
import { 
  Plus, Search, Copy, Download, Trash2, Link2, 
  ExternalLink, FileText, CheckCircle2, Clock, Wallet, X, Check 
} from "lucide-react";
import { 
  getCuentasCobro, getClients, getSuppliers, createCuentaCobro, 
  deleteCuentaCobro, registerCuentaCobroExpense, registerCuentaCobroIncome
} from "./actions";
import { formatCOP, numeroALetras, imageUrlToBase64, formatDateSpanish } from "@/utils/pdf/cuentasCobroHelpers";
import { downloadCuentaCobroPDF } from "@/utils/pdf/cuentasCobroPdf";

export default function CuentasCobroPage() {
  const [list, setList] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'all' | 'pendiente' | 'firmada'>('all');
  const [filterType, setFilterType] = useState<'all' | 'gasto' | 'ingreso'>('all');

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [selectedCC, setSelectedCC] = useState<any>(null);

  // Form: Create CC
  const [formType, setFormType] = useState<'gasto' | 'ingreso'>('gasto');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [issuerName, setIssuerName] = useState("");
  const [issuerDocument, setIssuerDocument] = useState("");
  const [issuerEmail, setIssuerEmail] = useState("");
  const [issuerPhone, setIssuerPhone] = useState("");
  const [debtorName, setDebtorName] = useState("");
  const [debtorDocument, setDebtorDocument] = useState("");
  const [debtorEmail, setDebtorEmail] = useState("");
  const [debtorPhone, setDebtorPhone] = useState("");
  const [concept, setConcept] = useState("");
  const [items, setItems] = useState<any[]>([{ description: "", quantity: 1, unit_price: 0, total_price: 0 }]);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Form: Register Expense/Income
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseCategory, setExpenseCategory] = useState("Honorarios (Servicios profesionales)");
  const [expenseType, setExpenseType] = useState<'OPEX' | 'COGS' | 'CAPEX'>("OPEX");
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  // Sync Form Type changes
  useEffect(() => {
    if (formType === 'ingreso') {
      setIssuerName("Alma Trading Group SAS");
      setIssuerDocument("901752308-8");
      setIssuerEmail("cafeamantti@gmail.com");
      setIssuerPhone("3001234567");
      setDebtorName("");
      setDebtorDocument("");
      setDebtorEmail("");
      setDebtorPhone("");
    } else {
      setIssuerName("");
      setIssuerDocument("");
      setIssuerEmail("");
      setIssuerPhone("");
      setDebtorName("");
      setDebtorDocument("");
      setDebtorEmail("");
      setDebtorPhone("");
    }
    setSelectedClientId("");
    setSelectedSupplierId("");
  }, [formType]);

  // Load list, CRM clients, and Suppliers
  async function loadData() {
    setIsLoading(true);
    const [cList, clientsList, suppliersList] = await Promise.all([
      getCuentasCobro(), 
      getClients(), 
      getSuppliers()
    ]);
    setList(cList);
    setClients(clientsList);
    setSuppliers(suppliersList);
    setIsLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // CRM client selection autofill
  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    if (!clientId) return;
    const client = clients.find(c => c.id === clientId);
    if (client) {
      setDebtorName(client.name);
      setDebtorDocument(client.document_number || "");
      setDebtorEmail(client.email || "");
      setDebtorPhone(client.phone || "");
    }
  };

  // Supplier selection autofill
  const handleSupplierSelect = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    if (!supplierId) return;
    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier) {
      setIssuerName(supplier.name);
      setIssuerDocument(supplier.document_number || "");
      setIssuerEmail(supplier.email || "");
      setIssuerPhone(supplier.phone || "");
    }
  };

  // Add / edit items in builder
  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...items];
    updated[index][field] = value;
    
    if (field === 'quantity' || field === 'unit_price') {
      const q = Number(updated[index].quantity || 0);
      const p = Number(updated[index].unit_price || 0);
      updated[index].total_price = q * p;
    }
    setItems(updated);
  };

  const addItemRow = () => {
    setItems([...items, { description: "", quantity: 1, unit_price: 0, total_price: 0 }]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    const updated = items.filter((_, idx) => idx !== index);
    setItems(updated);
  };

  // Submit new CC
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formType === 'gasto' && (!issuerName || !issuerDocument || !issuerEmail || !issuerPhone)) {
      alert("Por favor completa los datos obligatorios del emisor.");
      return;
    }
    if (formType === 'ingreso' && (!debtorName || !debtorDocument || !debtorEmail || !debtorPhone)) {
      alert("Por favor completa los datos obligatorios del deudor (cliente).");
      return;
    }

    const validItems = items.filter(i => i.description.trim() && Number(i.total_price) > 0);
    if (validItems.length === 0) {
      alert("Debes agregar al menos un ítem con descripción y valor.");
      return;
    }

    setIsSubmittingCreate(true);
    const res = await createCuentaCobro(
      formType,
      {
        issuer_name: issuerName,
        issuer_document: issuerDocument,
        issuer_email: issuerEmail,
        issuer_phone: issuerPhone,
        concept: concept || 'Servicios Prestados'
      },
      validItems,
      formType === 'ingreso' ? {
        debtor_name: debtorName,
        debtor_document: debtorDocument,
        debtor_email: debtorEmail,
        debtor_phone: debtorPhone
      } : undefined,
      issueDate
    );

    if (res.success) {
      setIsCreateOpen(false);
      // reset form
      setSelectedClientId("");
      setFormType("gasto");
      setIssueDate(new Date().toISOString().split('T')[0]);
      setIssuerName("");
      setIssuerDocument("");
      setIssuerEmail("");
      setIssuerPhone("");
      setDebtorName("");
      setDebtorDocument("");
      setDebtorEmail("");
      setDebtorPhone("");
      setConcept("");
      setItems([{ description: "", quantity: 1, unit_price: 0, total_price: 0 }]);
      await loadData();
    } else {
      alert(res.error || "Error al crear la cuenta de cobro.");
    }
    setIsSubmittingCreate(false);
  };

  // Delete CC
  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar esta solicitud de cuenta de cobro?")) return;
    const res = await deleteCuentaCobro(id);
    if (res.success) {
      await loadData();
    } else {
      alert(res.error || "No se pudo eliminar.");
    }
  };

  // Copy shareable link
  const copyLink = (id: string, type: 'gasto' | 'ingreso') => {
    const link = `${window.location.origin}/cuentas-cobro/${id}`;
    navigator.clipboard.writeText(link);
    alert(`Enlace copiado al portapapeles. Envíaselo al ${type === 'ingreso' ? 'cliente' : 'proveedor'}.`);
  };

  // Open Expense modal
  const openRegisterModal = (cc: any) => {
    setSelectedCC(cc);
    if (cc.type === 'ingreso') {
      setExpenseCategory("Servicios");
    } else {
      setExpenseCategory("Honorarios (Servicios profesionales)");
      setExpenseType("OPEX");
    }
    setIsExpenseOpen(true);
  };

  // Submit expense mapping
  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCC) return;

    setIsSubmittingExpense(true);
    if (selectedCC.type === 'ingreso') {
      const res = await registerCuentaCobroIncome(selectedCC.id, {
        date: expenseDate,
        category: expenseCategory,
      });

      if (res.success) {
        setIsExpenseOpen(false);
        setSelectedCC(null);
        await loadData();
        alert("¡Ingreso registrado exitosamente en el Flujo de Caja!");
      } else {
        alert(res.error || "Ocurrió un error al registrar el ingreso.");
      }
    } else {
      const res = await registerCuentaCobroExpense(selectedCC.id, {
        date: expenseDate,
        category: expenseCategory,
        expenseType
      });

      if (res.success) {
        setIsExpenseOpen(false);
        setSelectedCC(null);
        await loadData();
        alert("¡Gasto registrado exitosamente en el Flujo de Caja!");
      } else {
        alert(res.error || "Ocurrió un error al registrar el gasto.");
      }
    }
    setIsSubmittingExpense(false);
  };

  // Render/Print PDF in admin dashboard
  const handleDownloadPDF = async (doc: any) => {
    await downloadCuentaCobroPDF(doc);
  };

  const filteredList = list.filter(cc => {
    const matchesSearch = 
      cc.issuer_name.toLowerCase().includes(search.toLowerCase()) ||
      cc.issuer_document.includes(search) ||
      (cc.concept && cc.concept.toLowerCase().includes(search.toLowerCase())) ||
      (cc.debtor_name && cc.debtor_name.toLowerCase().includes(search.toLowerCase())) ||
      (cc.debtor_document && cc.debtor_document.includes(search)) ||
      String(cc.number).includes(search);
      
    const matchesTab = activeTab === 'all' ? true : cc.status === activeTab;
    const matchesType = filterType === 'all' ? true : cc.type === filterType;
    
    return matchesSearch && matchesTab && matchesType;
  });

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Cuentas de Cobro</h1>
          <p className="text-foreground/60">Genera solicitudes de cobro para personas naturales, gestiona sus firmas y regístralas en contabilidad.</p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#C59F59] text-white rounded-xl font-bold hover:bg-[#B38E4D] transition-colors self-start md:self-auto shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Nueva Solicitud
        </button>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden min-h-[500px]">
        {/* Toolbar & Tabs */}
        <div className="bg-[#f9f7f0] border-b border-foreground/5">
          <div className="flex border-b border-foreground/5">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-8 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'all' ? 'border-[#C59F59] text-[#C59F59] bg-white' : 'border-transparent text-foreground/40 hover:text-foreground/60'}`}
            >
              Todas
            </button>
            <button
              onClick={() => setActiveTab('pendiente')}
              className={`px-8 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'pendiente' ? 'border-[#C59F59] text-[#C59F59] bg-white' : 'border-transparent text-foreground/40 hover:text-foreground/60'}`}
            >
              Pendientes de Firma
            </button>
            <button
              onClick={() => setActiveTab('firmada')}
              className={`px-8 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'firmada' ? 'border-[#C59F59] text-[#C59F59] bg-white' : 'border-transparent text-foreground/40 hover:text-foreground/60'}`}
            >
              Firmadas
            </button>
          </div>

          <div className="p-6 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
              <input
                type="text"
                placeholder="Buscar por emisor, deudor o concepto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <span className="text-xs font-bold text-foreground/50 whitespace-nowrap">Tipo:</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="px-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all w-full md:w-56"
              >
                <option value="all">Todos los movimientos</option>
                <option value="gasto">A Proveedores (Gasto)</option>
                <option value="ingreso">A Clientes (Ingreso)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Content Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-20 text-center text-foreground/40 font-medium">Cargando cuentas de cobro...</div>
          ) : filteredList.length === 0 ? (
            <div className="p-20 text-center text-foreground/40">No se encontraron cuentas de cobro.</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-foreground/5 bg-stone-50/50 text-left text-xs font-bold uppercase tracking-wider text-foreground/50">
                  <th className="p-4 w-16">No.</th>
                  <th className="p-4">Tipo</th>
                  <th className="p-4">Fecha Emisión</th>
                  <th className="p-4">Tercero (Cliente/Prov)</th>
                  <th className="p-4">Identificación</th>
                  <th className="p-4">Concepto</th>
                  <th className="p-4">Monto</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Integración Contable</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5 text-sm">
                {filteredList.map((cc) => (
                  <tr key={cc.id} className="hover:bg-stone-50/40 transition-colors">
                    <td className="p-4 font-bold text-foreground/45">CC-{String(cc.number).padStart(5, '0')}</td>
                    <td className="p-4">
                      {cc.type === 'ingreso' ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-[#C59F59] rounded-md border border-amber-100 uppercase tracking-wide">
                          Ingreso
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-stone-50 text-stone-600 rounded-md border border-stone-100 uppercase tracking-wide">
                          Gasto
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-xs font-medium text-foreground/75 whitespace-nowrap">
                      {formatDateSpanish(cc.issue_date || cc.created_at)}
                    </td>
                    <td className="p-4 font-semibold text-foreground">
                      {cc.type === 'ingreso' ? cc.debtor_name : cc.issuer_name}
                    </td>
                    <td className="p-4 text-foreground/75 text-xs font-mono">
                      {cc.type === 'ingreso' ? cc.debtor_document : cc.issuer_document}
                    </td>
                    <td className="p-4 text-foreground/70 max-w-xs truncate">{cc.concept || 'Servicios Prestados'}</td>
                    <td className="p-4 font-bold text-[#C59F59]">{formatCOP(cc.total_amount)}</td>
                    <td className="p-4">
                      {cc.status === 'firmada' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-green-50 text-green-600 rounded-full border border-green-100">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Firmada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-amber-50 text-amber-600 rounded-full border border-amber-100">
                          <Clock className="w-3.5 h-3.5" />
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {cc.type === 'ingreso' ? (
                        cc.income_id ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-600 rounded-md border border-blue-100">
                            Registrado
                          </span>
                        ) : cc.status === 'firmada' ? (
                          <button
                            onClick={() => openRegisterModal(cc)}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-stone-50 hover:bg-stone-100 border border-foreground/10 hover:border-foreground/20 text-[#C59F59] text-xs font-bold rounded-lg transition-colors shadow-sm"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            Registrar Ingreso
                          </button>
                        ) : (
                          <span className="text-xs text-foreground/30 italic">Requiere firma</span>
                        )
                      ) : (
                        cc.expense_id ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-600 rounded-md border border-blue-100">
                            Registrado
                          </span>
                        ) : cc.status === 'firmada' ? (
                          <button
                            onClick={() => openRegisterModal(cc)}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-stone-50 hover:bg-stone-100 border border-foreground/10 hover:border-foreground/20 text-[#C59F59] text-xs font-bold rounded-lg transition-colors shadow-sm"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            Registrar Gasto
                          </button>
                        ) : (
                          <span className="text-xs text-foreground/30 italic">Requiere firma</span>
                        )
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {cc.status === 'pendiente' ? (
                        <>
                          <button
                            onClick={() => copyLink(cc.id, cc.type)}
                            title="Copiar Enlace de Firma"
                            className="p-2 hover:bg-stone-100 text-foreground/60 hover:text-[#C59F59] rounded-lg transition-colors border border-transparent hover:border-foreground/5 inline-flex"
                          >
                            <Link2 className="w-4 h-4" />
                          </button>
                          <a
                            href={`/cuentas-cobro/${cc.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir enlace de firma"
                            className="p-2 hover:bg-stone-100 text-foreground/60 hover:text-foreground rounded-lg transition-colors border border-transparent hover:border-foreground/5 inline-flex"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </>
                      ) : (
                        <button
                          onClick={() => handleDownloadPDF(cc)}
                          title="Descargar Soporte PDF"
                          className="p-2 hover:bg-stone-100 text-foreground/60 hover:text-green-600 rounded-lg transition-colors border border-transparent hover:border-foreground/5 inline-flex"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(cc.id)}
                        title="Eliminar solicitud"
                        className="p-2 hover:bg-red-50 text-foreground/40 hover:text-red-500 rounded-lg transition-colors border border-transparent hover:border-red-100 inline-flex"
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

      {/* Modal: Create Cuenta de Cobro Request */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden border border-foreground/5 shadow-2xl flex flex-col">
            <div className="p-6 border-b border-foreground/5 flex justify-between items-center bg-[#f9f7f0]">
              <div>
                <h2 className="text-xl font-serif font-bold text-foreground">Crear Solicitud de Cuenta de Cobro</h2>
                <p className="text-xs text-foreground/50">Genera una cuenta de cobro de egreso (a proveedor) o ingreso (a cliente).</p>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="p-2 hover:bg-stone-200/50 rounded-full transition-colors">
                <X className="w-5 h-5 text-foreground/50" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Form Type Selector Toggle & Issue Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground/75">Tipo de Cuenta de Cobro *</label>
                  <div className="flex bg-[#fafaf9] border border-foreground/10 p-1 rounded-xl w-full">
                    <button
                      type="button"
                      onClick={() => setFormType('gasto')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors ${formType === 'gasto' ? 'bg-white text-foreground shadow-sm' : 'text-foreground/40 hover:text-foreground/60'}`}
                    >
                      A Proveedor (Gasto)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormType('ingreso')}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors ${formType === 'ingreso' ? 'bg-white text-foreground shadow-sm' : 'text-foreground/40 hover:text-foreground/60'}`}
                    >
                      A Cliente (Ingreso)
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground/75">Fecha de Emisión *</label>
                  <input
                    type="date"
                    required
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                  />
                </div>
              </div>

              {/* Autofill Selector (Suppliers for gasto, Clients for ingreso) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/75">
                  {formType === 'ingreso' ? 'Autocompletar Cliente desde CRM (Opcional)' : 'Autocompletar Proveedor desde Directorio (Opcional)'}
                </label>
                {formType === 'ingreso' ? (
                  <select
                    value={selectedClientId}
                    onChange={(e) => handleClientSelect(e.target.value)}
                    className="w-full px-4 py-3 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                  >
                    <option value="">-- Rellenar manualmente (o auto-registrar) --</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.document_number || 'Sin documento'})</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => handleSupplierSelect(e.target.value)}
                    className="w-full px-4 py-3 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                  >
                    <option value="">-- Rellenar manualmente (o auto-registrar) --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.document_number || 'Sin documento'})</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Personal Info fields */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59F59]">
                  {formType === 'ingreso' ? 'Información del Emisor (Nosotros)' : 'Información del Emisor (Proveedor)'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Nombre del Emisor *</label>
                    <input
                      type="text"
                      required
                      value={issuerName}
                      onChange={(e) => setIssuerName(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">NIT o Documento *</label>
                    <input
                      type="text"
                      required
                      value={issuerDocument}
                      onChange={(e) => setIssuerDocument(e.target.value)}
                      placeholder="Ej. 102345678"
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Correo Electrónico *</label>
                    <input
                      type="email"
                      required
                      value={issuerEmail}
                      onChange={(e) => setIssuerEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Teléfono *</label>
                    <input
                      type="tel"
                      required
                      value={issuerPhone}
                      onChange={(e) => setIssuerPhone(e.target.value)}
                      placeholder="Ej. 3001234567"
                      className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Debtor Info fields for Client (Only for type === 'ingreso') */}
              {formType === 'ingreso' && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59F59]">Información del Deudor (Cliente)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-foreground/60">Nombre del Cliente *</label>
                      <input
                        type="text"
                        required
                        value={debtorName}
                        onChange={(e) => setDebtorName(e.target.value)}
                        placeholder="Ej. Juan Pérez"
                        className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-foreground/60">Documento / Cédula / NIT *</label>
                      <input
                        type="text"
                        required
                        value={debtorDocument}
                        onChange={(e) => setDebtorDocument(e.target.value)}
                        placeholder="Ej. 102345678"
                        className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-foreground/60">Correo Electrónico *</label>
                      <input
                        type="email"
                        required
                        value={debtorEmail}
                        onChange={(e) => setDebtorEmail(e.target.value)}
                        placeholder="juan@ejemplo.com"
                        className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-foreground/60">Teléfono *</label>
                      <input
                        type="tel"
                        required
                        value={debtorPhone}
                        onChange={(e) => setDebtorPhone(e.target.value)}
                        placeholder="Ej. 3001234567"
                        className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* General details */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/60">Concepto General del Cobro *</label>
                <input
                  type="text"
                  required
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  placeholder="Ej. Honorarios consultoría desarrollo web Junio 2026"
                  className="w-full px-4 py-3 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                />
              </div>

              {/* Line items builder */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-foreground/5 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59F59]">Servicios / Productos detallados</h3>
                  <button
                    type="button"
                    onClick={addItemRow}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 border border-foreground/5 text-foreground text-xs font-bold rounded-lg transition-colors shadow-sm"
                  >
                    Agregar Ítem
                  </button>
                </div>

                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex flex-col md:flex-row gap-3 items-end bg-[#fafaf9] p-3 rounded-2xl border border-foreground/5">
                      <div className="flex-1 w-full space-y-1">
                        <label className="text-[10px] font-bold text-foreground/50">Descripción *</label>
                        <input
                          type="text"
                          required
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                          placeholder="Descripción del servicio prestado..."
                          className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-xs focus:outline-none"
                        />
                      </div>
                      <div className="w-full md:w-20 space-y-1">
                        <label className="text-[10px] font-bold text-foreground/50">Cant. *</label>
                        <input
                          type="number"
                          required
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-xs focus:outline-none"
                        />
                      </div>
                      <div className="w-full md:w-36 space-y-1">
                        <label className="text-[10px] font-bold text-foreground/50">Precio Unitario *</label>
                        <input
                          type="number"
                          required
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => handleItemChange(idx, 'unit_price', Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-xs focus:outline-none"
                        />
                      </div>
                      <div className="w-full md:w-32 text-right space-y-1">
                        <span className="block text-[10px] font-bold text-foreground/40 text-left md:text-right">Total:</span>
                        <span className="block text-xs font-bold text-[#C59F59] py-2 pr-1">{formatCOP(item.total_price)}</span>
                      </div>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors border border-transparent hover:border-red-100 mb-0.5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Total display */}
              <div className="flex justify-between items-center bg-[#fafaf9] p-4 rounded-2xl border border-foreground/5 font-bold">
                <span className="text-sm text-foreground/50">Total Calculado:</span>
                <span className="text-xl text-[#C59F59]">{formatCOP(items.reduce((acc, i) => acc + (i.total_price || 0), 0))} COP</span>
              </div>

              <div className="p-6 border-t border-foreground/5 bg-stone-50 -mx-6 -mb-6 flex justify-end gap-3 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-5 py-3 border border-foreground/10 rounded-xl text-sm font-bold text-foreground/70 hover:bg-stone-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-6 py-3 bg-[#C59F59] hover:bg-[#B38E4D] text-white font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingCreate ? "Creando..." : "Crear Solicitud"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal: Register Gasto/Ingreso en Flujo de Caja */}
      {isExpenseOpen && selectedCC && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full border border-foreground/5 shadow-2xl flex flex-col">
            <div className="p-6 border-b border-foreground/5 flex justify-between items-center bg-[#f9f7f0] rounded-t-3xl">
              <div>
                <h2 className="text-xl font-serif font-bold text-foreground">
                  {selectedCC.type === 'ingreso' ? 'Registrar Ingreso' : 'Registrar Gasto'}
                </h2>
                <p className="text-xs text-foreground/50">
                  {selectedCC.type === 'ingreso' 
                    ? 'Asocia esta cuenta de cobro firmada al flujo de caja contable como un ingreso.' 
                    : 'Asocia esta cuenta de cobro firmada al flujo de caja contable como un gasto.'}
                </p>
              </div>
              <button onClick={() => setIsExpenseOpen(false)} className="p-2 hover:bg-stone-200/50 rounded-full transition-colors">
                <X className="w-5 h-5 text-foreground/50" />
              </button>
            </div>

            <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4">
              <div className="space-y-1 bg-stone-50 p-4 rounded-xl border border-stone-200/50 text-xs text-foreground/75 space-y-1.5">
                <p><span className="font-bold text-foreground/50">Cuenta de Cobro:</span> CC-{String(selectedCC.number).padStart(5, '0')}</p>
                <p><span className="font-bold text-foreground/50">Tercero:</span> {selectedCC.type === 'ingreso' ? selectedCC.debtor_name : selectedCC.issuer_name}</p>
                <p><span className="font-bold text-foreground/50">Concepto:</span> {selectedCC.concept}</p>
                <p>
                  <span className="font-bold text-foreground/50">Monto {selectedCC.type === 'ingreso' ? 'Ingreso' : 'Gasto'}:</span>{' '}
                  <strong className="text-[#C59F59]">{formatCOP(selectedCC.total_amount)}</strong>
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground/60">Fecha del Movimiento Contable *</label>
                <input
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground/60">Categoría Contable *</label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                >
                  {selectedCC.type === 'ingreso' ? (
                    <>
                      <option value="Servicios">Servicios</option>
                      <option value="Ventas Físicas">Ventas Físicas</option>
                      <option value="Ventas Web">Ventas Web</option>
                      <option value="Otros Ingresos">Otros Ingresos</option>
                    </>
                  ) : (
                    <>
                      <option value="Honorarios (Servicios profesionales)">Honorarios (Servicios profesionales)</option>
                      <option value="Costo de Ventas (Materia prima, insumos, empaques)">Costo de Ventas (Materia prima, insumos, empaques)</option>
                      <option value="Costos de Producción (Maquila, Servicio de tostión)">Costos de Producción (Maquila, Servicio de tostión)</option>
                      <option value="Gastos de Personal (Nómina, salud, pensión)">Gastos de Personal (Nómina, salud, pensión)</option>
                      <option value="Impuestos (ICA, predial, etc.)">Impuestos (ICA, predial, etc.)</option>
                      <option value="Arrendamientos (Local, equipos)">Arrendamientos (Local, equipos)</option>
                      <option value="Servicios Públicos (Agua, luz, internet)">Servicios Públicos (Agua, luz, internet)</option>
                      <option value="Software y Suscripciones (Hosting, licencias)">Software y Suscripciones (Hosting, licencias)</option>
                      <option value="Gastos Legales (Cámara de comercio, notarías)">Gastos Legales (Cámara de comercio, notarías)</option>
                      <option value="Mantenimiento y Reparaciones">Mantenimiento y Reparaciones</option>
                      <option value="Adecuación e Instalaciones">Adecuación e Instalaciones</option>
                      <option value="Gastos de Viaje y Transporte">Gastos de Viaje y Transporte</option>
                      <option value="Diversos (Aseo, papelería, caja menor)">Diversos (Aseo, papelería, caja menor)</option>
                      <option value="Gastos Financieros (Comisiones, intereses)">Gastos Financieros (Comisiones, intereses)</option>
                    </>
                  )}
                </select>
              </div>

              {selectedCC.type !== 'ingreso' && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-foreground/60">Tipo Contable (P&L) *</label>
                  <select
                    value={expenseType}
                    onChange={(e) => setExpenseType(e.target.value as any)}
                    className="w-full px-4 py-2.5 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                  >
                    <option value="OPEX">OPEX (Gasto Operacional Corriente)</option>
                    <option value="COGS">COGS (Costo de Venta Directo)</option>
                    <option value="CAPEX">CAPEX (Activo Fijo / Propiedades)</option>
                  </select>
                </div>
              )}

              <div className="pt-4 border-t border-foreground/5 flex justify-end gap-3 -mx-6 -mb-6 p-6 bg-stone-50 rounded-b-3xl">
                <button
                  type="button"
                  onClick={() => setIsExpenseOpen(false)}
                  className="px-4 py-2.5 border border-foreground/10 rounded-xl text-xs font-bold text-foreground/70 hover:bg-stone-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExpense}
                  className="px-5 py-2.5 bg-[#C59F59] hover:bg-[#B38E4D] text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingExpense ? "Registrando..." : (selectedCC.type === 'ingreso' ? "Registrar Ingreso" : "Registrar Gasto")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
