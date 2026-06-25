'use client';

import React, { useState, useEffect } from "react";
import { 
  Plus, Search, Copy, Download, Trash2, Link2, 
  ExternalLink, FileText, CheckCircle2, Clock, Wallet, X, Check 
} from "lucide-react";
import { 
  getCuentasCobro, getClients, createCuentaCobro, 
  deleteCuentaCobro, registerCuentaCobroExpense 
} from "./actions";
import { formatCOP, numeroALetras, imageUrlToBase64 } from "@/utils/pdf/cuentasCobroHelpers";

export default function CuentasCobroPage() {
  const [list, setList] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'all' | 'pendiente' | 'firmada'>('all');

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [selectedCC, setSelectedCC] = useState<any>(null);

  // Form: Create CC
  const [selectedClientId, setSelectedClientId] = useState("");
  const [issuerName, setIssuerName] = useState("");
  const [issuerDocument, setIssuerDocument] = useState("");
  const [issuerEmail, setIssuerEmail] = useState("");
  const [issuerPhone, setIssuerPhone] = useState("");
  const [concept, setConcept] = useState("");
  const [items, setItems] = useState<any[]>([{ description: "", quantity: 1, unit_price: 0, total_price: 0 }]);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Form: Register Expense
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseCategory, setExpenseCategory] = useState("Honorarios (Servicios profesionales)");
  const [expenseType, setExpenseType] = useState<'OPEX' | 'COGS' | 'CAPEX'>("OPEX");
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  // Load list and CRM clients
  async function loadData() {
    setIsLoading(true);
    const [cList, clientsList] = await Promise.all([getCuentasCobro(), getClients()]);
    setList(cList);
    setClients(clientsList);
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
      setIssuerName(client.name);
      setIssuerDocument(client.document_number || "");
      setIssuerEmail(client.email || "");
      setIssuerPhone(client.phone || "");
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
    if (!issuerName || !issuerDocument || !issuerEmail || !issuerPhone) {
      alert("Por favor completa los datos obligatorios.");
      return;
    }

    const validItems = items.filter(i => i.description.trim() && Number(i.total_price) > 0);
    if (validItems.length === 0) {
      alert("Debes agregar al menos un ítem con descripción y valor.");
      return;
    }

    setIsSubmittingCreate(true);
    const res = await createCuentaCobro(
      {
        issuer_name: issuerName,
        issuer_document: issuerDocument,
        issuer_email: issuerEmail,
        issuer_phone: issuerPhone,
        concept: concept || 'Servicios Prestados'
      },
      validItems
    );

    if (res.success) {
      setIsCreateOpen(false);
      // reset form
      setSelectedClientId("");
      setIssuerName("");
      setIssuerDocument("");
      setIssuerEmail("");
      setIssuerPhone("");
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
  const copyLink = (id: string) => {
    const link = `${window.location.origin}/cuentas-cobro/${id}`;
    navigator.clipboard.writeText(link);
    alert("Enlace copiado al portapapeles. Envíaselo al proveedor.");
  };

  // Open Expense modal
  const openExpenseModal = (cc: any) => {
    setSelectedCC(cc);
    // Suggest expense category from mapped defaults or professionals fees
    setExpenseCategory("Honorarios (Servicios profesionales)");
    setExpenseType("OPEX");
    setIsExpenseOpen(true);
  };

  // Submit expense mapping
  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCC) return;

    setIsSubmittingExpense(true);
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
    setIsSubmittingExpense(false);
  };

  // Render/Print PDF in admin dashboard
  const handleDownloadPDF = async (doc: any) => {
    const html2pdf = (await import('html2pdf.js')).default;

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const bgBase64 = await imageUrlToBase64(`${baseUrl}/images/Main_Background.jpg`);
    const logoBase64 = await imageUrlToBase64(`${baseUrl}/images/logo-amantti.png`);

    const opt = {
      margin: 15,
      filename: `Cuenta_de_Cobro_${doc.number}_${doc.issuer_name.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm' as const, format: 'letter' as const, orientation: 'portrait' as const }
    };

    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: Arial, sans-serif; background-color: #ffffff; color: #1c1917; padding: 25px 30px; box-sizing: border-box; position: relative; overflow: hidden; min-height: 250mm; max-width: 800px; margin: auto; border: 1px solid #e7e5e4; border-radius: 8px;">
        <!-- Background Image with low opacity -->
        <div style="position: absolute; inset: 0; background-image: url(${bgBase64}); background-size: cover; background-position: center; opacity: 0.12; z-index: 0;"></div>

        <div style="position: relative; z-index: 1;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e7e5e4; padding-bottom: 20px; margin-bottom: 30px;">
            <div>
              <img src="${logoBase64}" style="width: 140px; height: auto; object-fit: contain; margin-bottom: 12px;" />
              <h1 style="font-size: 22px; font-weight: bold; margin: 0; color: #292524; font-family: Georgia, serif; letter-spacing: 0.5px;">CUENTA DE COBRO</h1>
              <p style="font-size: 13px; color: #78716c; margin: 4px 0 0 0;">Número: CC-${String(doc.number).padStart(5, '0')}</p>
              <p style="font-size: 12px; color: #78716c; margin: 2px 0 0 0;">Fecha de Emisión: ${new Date(doc.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              ${doc.signed_at ? `<p style="font-size: 12px; color: #78716c; margin: 2px 0 0 0;">Fecha de Firma: ${new Date(doc.signed_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
            </div>
            <div style="text-align: right; padding-top: 10px;">
              <p style="font-weight: bold; margin: 0; font-size: 15px; letter-spacing: 0.5px; color: #292524;">CAFÉ AMANTTI</p>
              <p style="margin: 3px 0 0 0; color: #57534e; font-size: 12px;">Alma Trading Group SAS</p>
              <p style="margin: 2px 0 0 0; color: #57534e; font-size: 12px;">NIT: 901752308-8</p>
              <p style="margin: 2px 0 0 0; color: #57534e; font-size: 12px;">Contacto: cafeamantti@gmail.com</p>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
            <div style="background-color: rgba(250, 250, 249, 0.8); border: 1px solid #e7e5e4; border-radius: 8px; padding: 15px;">
              <h3 style="font-size: 13px; font-weight: bold; margin: 0 0 10px 0; border-bottom: 1px solid #e7e5e4; padding-bottom: 5px; text-transform: uppercase; color: #78716c;">DEUDOR (PAGADOR)</h3>
              <p style="margin: 0; font-weight: bold;">Alma Trading Group SAS</p>
              <p style="margin: 3px 0 0 0;">NIT: 901752308-8</p>
              <p style="margin: 3px 0 0 0;">Medellín, Colombia</p>
            </div>
            <div style="background-color: rgba(250, 250, 249, 0.8); border: 1px solid #e7e5e4; border-radius: 8px; padding: 15px;">
              <h3 style="font-size: 13px; font-weight: bold; margin: 0 0 10px 0; border-bottom: 1px solid #e7e5e4; padding-bottom: 5px; text-transform: uppercase; color: #78716c;">ACREEDOR (EMISOR)</h3>
              <p style="margin: 0; font-weight: bold;">${doc.issuer_name}</p>
              <p style="margin: 3px 0 0 0;">C.C. / Documento: ${doc.issuer_document}</p>
              <p style="margin: 3px 0 0 0;">Email: ${doc.issuer_email}</p>
              <p style="margin: 3px 0 0 0;">Teléfono: ${doc.issuer_phone}</p>
            </div>
          </div>

          <div style="margin-bottom: 30px;">
            <p style="font-size: 14px; text-align: justify; margin: 0 0 20px 0;">
              <strong>Alma Trading Group SAS</strong> con NIT <strong>901752308-8</strong> DEBE A: <strong>${doc.issuer_name}</strong> con C.C. / Documento <strong>${doc.issuer_document}</strong> la suma de <strong>${formatCOP(doc.total_amount)} COP</strong> (${numeroALetras(doc.total_amount)}).
            </p>
            <p style="font-size: 14px; text-align: justify; margin: 0 0 20px 0;">
              Por concepto de: <strong>${doc.concept || 'Servicios Prestados'}</strong>
            </p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; background-color: rgba(255, 255, 255, 0.6);">
            <thead>
              <tr style="background-color: #f5f5f4; border-bottom: 2px solid #e7e5e4;">
                <th style="padding: 10px; text-align: left; font-weight: bold; width: 60%;">Descripción del Servicio / Producto</th>
                <th style="padding: 10px; text-align: center; font-weight: bold; width: 10%;">Cant.</th>
                <th style="padding: 10px; text-align: right; font-weight: bold; width: 15%;">Valor Unitario</th>
                <th style="padding: 10px; text-align: right; font-weight: bold; width: 15%;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${(doc.items || []).map((item: any, idx: number) => `
                <tr style="border-bottom: 1px solid #e7e5e4;">
                  <td style="padding: 10px; text-align: left;">${item.description}</td>
                  <td style="padding: 10px; text-align: center;">${item.quantity}</td>
                  <td style="padding: 10px; text-align: right;">${formatCOP(item.unit_price)}</td>
                  <td style="padding: 10px; text-align: right; font-weight: bold;">${formatCOP(item.total_price)}</td>
                </tr>
              `).join('')}
              <tr style="background-color: rgba(250, 250, 249, 0.8); font-weight: bold; font-size: 14px; border-top: 2px solid #e7e5e4;">
                <td colspan="3" style="padding: 12px 10px; text-align: right;">TOTAL A PAGAR:</td>
                <td style="padding: 12px 10px; text-align: right; color: #1c1917;">${formatCOP(doc.total_amount)} COP</td>
              </tr>
            </tbody>
          </table>

          <div style="page-break-inside: avoid; break-inside: avoid; background-color: rgba(250, 250, 249, 0.85); border-left: 4px solid #C59F59; padding: 15px; margin-bottom: 40px; border-radius: 0 8px 8px 0; text-align: justify; font-size: 12px; color: #44403c;">
            <p style="margin: 0; font-weight: bold; color: #292524; font-size: 13px; margin-bottom: 5px;">DECLARACIÓN JURAMENTADA Y DATOS DE PAGO</p>
            <p style="margin: 0 0 10px 0;">
              Manifiesto bajo la gravedad del juramento que los datos personales y bancarios aquí consignados son correctos. De igual forma, declaro que pertenezco al régimen de no responsables de IVA (Artículo 437 del Estatuto Tributario).
            </p>
            <p style="margin: 0; font-weight: bold; color: #292524;">
              Instrucción de Pago: Consignar a ${doc.bank_name} - Cuenta de ${doc.bank_account_type} No. ${doc.bank_account_number}.
            </p>
          </div>

          <div style="page-break-inside: avoid; break-inside: avoid; margin-top: 50px; display: flex; flex-direction: column; align-items: flex-start; max-width: 320px;">
            <p style="margin: 0 0 10px 0; font-size: 12px; color: #78716c; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Firma Digital del Emisor</p>
            <div style="border-bottom: 1.5px solid #a8a29e; width: 100%; min-height: 80px; display: flex; align-items: center; justify-content: center; padding-bottom: 5px;">
              ${doc.signature_type === 'scribble' 
                ? `<img src="${doc.signature_data}" style="max-height: 80px; max-width: 250px; object-fit: contain;" />`
                : `<span style="font-family: 'Brush Script MT', 'Dancing Script', 'Caveat', cursive, sans-serif; font-size: 32px; font-style: italic; font-weight: 500; color: #0c0a09; text-shadow: 1px 1px 1px rgba(0,0,0,0.05);">${doc.signature_data}</span>`
              }
            </div>
            <p style="margin: 10px 0 0 0; font-weight: bold; font-size: 13px; color: #292524;">${doc.issuer_name}</p>
            <p style="margin: 2px 0 0 0; font-size: 12px; color: #57534e;">C.C. / Documento: ${doc.issuer_document}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #78716c; font-style: italic;">Firmado digitalmente el ${new Date(doc.signed_at).toLocaleString('es-CO')}</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(element);
    try {
      await html2pdf().set(opt).from(element).save();
    } finally {
      document.body.removeChild(element);
    }
  };

  const filteredList = list.filter(cc => {
    const matchesSearch = 
      cc.issuer_name.toLowerCase().includes(search.toLowerCase()) ||
      cc.issuer_document.includes(search) ||
      (cc.concept && cc.concept.toLowerCase().includes(search.toLowerCase())) ||
      String(cc.number).includes(search);
      
    if (activeTab === 'all') return matchesSearch;
    return matchesSearch && cc.status === activeTab;
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

          <div className="p-6">
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
              <input
                type="text"
                placeholder="Buscar por emisor, documento o concepto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
              />
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
                  <th className="p-4">Emisor</th>
                  <th className="p-4">Identificación</th>
                  <th className="p-4">Concepto</th>
                  <th className="p-4">Monto</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Integración Gasto</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5 text-sm">
                {filteredList.map((cc) => (
                  <tr key={cc.id} className="hover:bg-stone-50/40 transition-colors">
                    <td className="p-4 font-bold text-foreground/45">CC-{String(cc.number).padStart(5, '0')}</td>
                    <td className="p-4 font-semibold text-foreground">{cc.issuer_name}</td>
                    <td className="p-4 text-foreground/75">{cc.issuer_document}</td>
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
                      {cc.expense_id ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-600 rounded-md border border-blue-100">
                          Registrado
                        </span>
                      ) : cc.status === 'firmada' ? (
                        <button
                          onClick={() => openExpenseModal(cc)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-stone-50 hover:bg-stone-100 border border-foreground/10 hover:border-foreground/20 text-[#C59F59] text-xs font-bold rounded-lg transition-colors shadow-sm"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          Registrar Gasto
                        </button>
                      ) : (
                        <span className="text-xs text-foreground/30 italic">Requiere firma</span>
                      )}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {cc.status === 'pendiente' ? (
                        <>
                          <button
                            onClick={() => copyLink(cc.id)}
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
                <p className="text-xs text-foreground/50">Genera una solicitud para ser enviada al proveedor para su firma.</p>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="p-2 hover:bg-stone-200/50 rounded-full transition-colors">
                <X className="w-5 h-5 text-foreground/50" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* CRM Autofill Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground/75">Seleccionar Cliente / Proveedor del CRM (Opcional)</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => handleClientSelect(e.target.value)}
                  className="w-full px-4 py-3 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                >
                  <option value="">-- Rellenar manualmente --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.document_number})</option>
                  ))}
                </select>
              </div>

              {/* Personal Info fields */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#C59F59]">Información del Emisor</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-foreground/60">Nombre del Proveedor *</label>
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
                    <label className="text-xs font-bold text-foreground/60">Cédula de Ciudadanía *</label>
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
                      placeholder="juan@ejemplo.com"
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

      {/* Modal: Register Gasto en Flujo de Caja */}
      {isExpenseOpen && selectedCC && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full border border-foreground/5 shadow-2xl flex flex-col">
            <div className="p-6 border-b border-foreground/5 flex justify-between items-center bg-[#f9f7f0] rounded-t-3xl">
              <div>
                <h2 className="text-xl font-serif font-bold text-foreground">Registrar Gasto</h2>
                <p className="text-xs text-foreground/50">Asocia esta cuenta de cobro firmada al flujo de caja contable.</p>
              </div>
              <button onClick={() => setIsExpenseOpen(false)} className="p-2 hover:bg-stone-200/50 rounded-full transition-colors">
                <X className="w-5 h-5 text-foreground/50" />
              </button>
            </div>

            <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4">
              <div className="space-y-1 bg-stone-50 p-4 rounded-xl border border-stone-200/50 text-xs text-foreground/75 space-y-1.5">
                <p><span className="font-bold text-foreground/50">Cuenta de Cobro:</span> CC-{String(selectedCC.number).padStart(5, '0')}</p>
                <p><span className="font-bold text-foreground/50">Emisor:</span> {selectedCC.issuer_name}</p>
                <p><span className="font-bold text-foreground/50">Concepto:</span> {selectedCC.concept}</p>
                <p><span className="font-bold text-foreground/50">Monto Gasto:</span> <strong className="text-[#C59F59]">{formatCOP(selectedCC.total_amount)}</strong></p>
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
                </select>
              </div>

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
                  {isSubmittingExpense ? "Registrando..." : "Registrar Gasto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
