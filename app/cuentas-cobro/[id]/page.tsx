'use client';

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Check, Clipboard, Download, ShieldAlert, SquarePen, Type, RotateCcw } from "lucide-react";
import { getCuentaCobroById, signCuentaCobro } from "@/app/(admin)/admin/cuentas-cobro/actions";
import { formatCOP, numeroALetras } from "@/utils/pdf/cuentasCobroHelpers";

export default function PublicCuentaCobroSignPage() {
  const { id } = useParams() as { id: string };
  const [doc, setDoc] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [issuerName, setIssuerName] = useState("");
  const [issuerDocument, setIssuerDocument] = useState("");
  const [issuerEmail, setIssuerEmail] = useState("");
  const [issuerPhone, setIssuerPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountType, setBankAccountType] = useState("Ahorros");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [signatureType, setSignatureType] = useState<'scribble' | 'typed'>('scribble');
  const [typedSignature, setTypedSignature] = useState("");

  // Canvas drawing ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadDocument() {
      if (!id) return;
      setIsLoading(true);
      const data = await getCuentaCobroById(id);
      if (!data) {
        setError("El enlace no es válido o el documento ya no existe.");
      } else {
        setDoc(data);
        // Pre-fill form from draft if available
        setIssuerName(data.issuer_name || "");
        setIssuerDocument(data.issuer_document || "");
        setIssuerEmail(data.issuer_email || "");
        setIssuerPhone(data.issuer_phone || "");
        setBankName(data.bank_name || "");
        setBankAccountType(data.bank_account_type || "Ahorros");
        setBankAccountNumber(data.bank_account_number || "");
        if (data.status === 'firmada') {
          setSuccess(true);
        }
      }
      setIsLoading(false);
    }
    loadDocument();
  }, [id]);

  // Setup canvas event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || signatureType !== 'scribble' || success) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas & set line style
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Touch events for mobile
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      ctx.beginPath();
      ctx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
      setIsDrawing(true);
      setHasDrawn(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      ctx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
      ctx.stroke();
    };

    const handleTouchEnd = () => {
      setIsDrawing(false);
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [signatureType, isDrawing, success]);

  // Mouse canvas actions
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // Submit flow
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issuerName || !issuerDocument || !issuerEmail || !issuerPhone || !bankName || !bankAccountNumber) {
      alert("Por favor completa todos los datos obligatorios.");
      return;
    }

    if (!declarationAccepted) {
      alert("Debes aceptar la declaración juramentada para continuar.");
      return;
    }

    let finalSignatureData = "";
    if (signatureType === 'scribble') {
      if (!hasDrawn) {
        alert("Por favor dibuja tu firma en el recuadro.");
        return;
      }
      const canvas = canvasRef.current;
      if (canvas) {
        finalSignatureData = canvas.toDataURL('image/png');
      }
    } else {
      if (!typedSignature.trim()) {
        alert("Por favor digita tu nombre para generar la firma.");
        return;
      }
      finalSignatureData = typedSignature;
    }

    setIsSubmitting(true);
    const res = await signCuentaCobro(
      id,
      finalSignatureData,
      signatureType,
      {
        bank_name: bankName,
        bank_account_type: bankAccountType,
        bank_account_number: bankAccountNumber
      },
      {
        issuer_name: issuerName,
        issuer_document: issuerDocument,
        issuer_email: issuerEmail,
        issuer_phone: issuerPhone
      }
    );

    if (res.success) {
      setSuccess(true);
      // Reload page state
      const updated = await getCuentaCobroById(id);
      if (updated) setDoc(updated);
    } else {
      alert(res.error || "Ocurrió un error al firmar el documento.");
    }
    setIsSubmitting(false);
  };

  // Render PDF function
  const handleDownloadPDF = async () => {
    if (!doc) return;
    const html2pdf = (await import('html2pdf.js')).default;

    const opt = {
      margin: 15,
      filename: `Cuenta_de_Cobro_${doc.number}_${doc.issuer_name.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm' as const, format: 'letter' as const, orientation: 'portrait' as const }
    };

    // Construct a beautiful HTML template specifically optimized for PDF generation
    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1c1917; line-height: 1.5; font-size: 13px; max-width: 800px; margin: auto;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e7e5e4; padding-bottom: 20px; margin-bottom: 30px;">
          <div>
            <h1 style="font-size: 24px; font-weight: bold; margin: 0; color: #292524; font-family: Georgia, serif;">CUENTA DE COBRO</h1>
            <p style="font-size: 14px; color: #78716c; margin: 5px 0 0 0;">Número: CC-${String(doc.number).padStart(5, '0')}</p>
            <p style="font-size: 13px; color: #78716c; margin: 2px 0 0 0;">Fecha de Emisión: ${new Date(doc.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            ${doc.signed_at ? `<p style="font-size: 13px; color: #78716c; margin: 2px 0 0 0;">Fecha de Firma: ${new Date(doc.signed_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
          </div>
          <div style="text-align: right;">
            <p style="font-weight: bold; margin: 0; font-size: 16px;">CAFÉ AMANTTI</p>
            <p style="margin: 3px 0 0 0; color: #57534e;">Alma Trading Group SAS</p>
            <p style="margin: 2px 0 0 0; color: #57534e;">NIT: 901752308-8</p>
            <p style="margin: 2px 0 0 0; color: #57534e;">Contacto: cafeamantti@gmail.com</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
          <div style="background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 15px;">
            <h3 style="font-size: 13px; font-weight: bold; margin: 0 0 10px 0; border-bottom: 1px solid #e7e5e4; padding-bottom: 5px; text-transform: uppercase; color: #78716c;">DEUDOR (PAGADOR)</h3>
            <p style="margin: 0; font-weight: bold;">Alma Trading Group SAS</p>
            <p style="margin: 3px 0 0 0;">NIT: 901752308-8</p>
            <p style="margin: 3px 0 0 0;">Medellín, Colombia</p>
          </div>
          <div style="background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 15px;">
            <h3 style="font-size: 13px; font-weight: bold; margin: 0 0 10px 0; border-bottom: 1px solid #e7e5e4; padding-bottom: 5px; text-transform: uppercase; color: #78716c;">ACREEDOR (EMISOR)</h3>
            <p style="margin: 0; font-weight: bold;">${doc.issuer_name}</p>
            <p style="margin: 3px 0 0 0;">C.C. / Documento: ${doc.issuer_document}</p>
            <p style="margin: 3px 0 0 0;">Email: ${doc.issuer_email}</p>
            <p style="margin: 3px 0 0 0;">Teléfono: ${doc.issuer_phone}</p>
          </div>
        </div>

        <div style="margin-bottom: 30px;">
          <p style="font-size: 14px; text-align: justify; margin: 0 0 20px 0;">
            DEBE A: <strong>Alma Trading Group SAS</strong> con NIT <strong>901752308-8</strong> la suma de <strong>${formatCOP(doc.total_amount)} COP</strong> (${numeroALetras(doc.total_amount)}).
          </p>
          <p style="font-size: 14px; text-align: justify; margin: 0 0 20px 0;">
            Por concepto de: <strong>${doc.concept || 'Servicios Prestados'}</strong>
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px;">
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
            <tr style="background-color: #fafaf9; font-weight: bold; font-size: 14px; border-top: 2px solid #e7e5e4;">
              <td colspan="3" style="padding: 12px 10px; text-align: right;">TOTAL A PAGAR:</td>
              <td style="padding: 12px 10px; text-align: right; color: #1c1917;">${formatCOP(doc.total_amount)} COP</td>
            </tr>
          </tbody>
        </table>

        <div style="background-color: #fafaf9; border-left: 4px solid #C59F59; padding: 15px; margin-bottom: 40px; border-radius: 0 8px 8px 0; text-align: justify; font-size: 12px; color: #44403c;">
          <p style="margin: 0; font-weight: bold; color: #292524; font-size: 13px; margin-bottom: 5px;">DECLARACIÓN JURAMENTADA Y DATOS DE PAGO</p>
          <p style="margin: 0 0 10px 0;">
            Manifiesto bajo la gravedad del juramento que los datos personales y bancarios aquí consignados son correctos. De igual forma, declaro que pertenezco al régimen de no responsables de IVA (Artículo 437 del Estatuto Tributario).
          </p>
          <p style="margin: 0; font-weight: bold; color: #292524;">
            Instrucción de Pago: Consignar a ${doc.bank_name || bankName} - Cuenta de ${doc.bank_account_type || bankAccountType} No. ${doc.bank_account_number || bankAccountNumber}.
          </p>
        </div>

        <div style="margin-top: 50px; display: flex; flex-direction: column; align-items: flex-start; max-width: 320px;">
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
    `;

    document.body.appendChild(element);
    try {
      await html2pdf().set(opt).from(element).save();
    } finally {
      document.body.removeChild(element);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#C59F59] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-foreground/60 font-medium">Cargando documento...</p>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-foreground/5 shadow-sm text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-serif text-foreground mb-3">Enlace No Válido</h2>
          <p className="text-foreground/60 mb-6">{error || "No se ha encontrado el documento solicitado."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Branding Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-serif italic text-foreground">Café Amantti</h1>
          <p className="text-[#C59F59] uppercase tracking-widest font-bold text-xs">Módulo de Cuentas de Cobro</p>
        </div>

        {/* Success View */}
        {success ? (
          <div className="bg-white rounded-3xl border border-[#C59F59]/20 shadow-sm p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-serif text-foreground">¡Documento Firmado!</h2>
              <p className="text-foreground/60 max-w-md mx-auto">
                La cuenta de cobro No. <strong>CC-{String(doc.number).padStart(5, '0')}</strong> ha sido firmada digitalmente con éxito y se ha enviado al equipo de Café Amantti.
              </p>
            </div>
            <div className="border border-foreground/5 rounded-2xl p-6 bg-[#fafaf9] max-w-md mx-auto text-left space-y-3">
              <div className="flex justify-between border-b border-foreground/5 pb-2 text-sm">
                <span className="text-foreground/50">Emisor:</span>
                <span className="font-bold text-foreground">{doc.issuer_name}</span>
              </div>
              <div className="flex justify-between border-b border-foreground/5 pb-2 text-sm">
                <span className="text-foreground/50">Cédula:</span>
                <span className="font-bold text-foreground">{doc.issuer_document}</span>
              </div>
              <div className="flex justify-between border-b border-foreground/5 pb-2 text-sm">
                <span className="text-foreground/50">Total a pagar:</span>
                <span className="font-bold text-[#C59F59]">{formatCOP(doc.total_amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-foreground/50">Instrucción:</span>
                <span className="font-semibold text-foreground text-right">{doc.bank_name} - No. {doc.bank_account_number}</span>
              </div>
            </div>
            <button
              onClick={handleDownloadPDF}
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#C59F59] text-white font-bold rounded-xl shadow-md hover:bg-[#B38E4D] transition-colors"
            >
              <Download className="w-5 h-5" />
              Descargar PDF de Soporte
            </button>
          </div>
        ) : (
          /* Signature Flow Form */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Form Info and Input */}
            <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-3xl border border-foreground/5 shadow-sm p-8 space-y-8">
              
              <div className="border-b border-foreground/5 pb-4">
                <h2 className="text-2xl font-serif text-foreground mb-2">Completar Datos del Emisor</h2>
                <p className="text-foreground/60 text-sm">Ingresa tus datos personales y bancarios para que podamos emitir tu pago.</p>
              </div>

              {/* Personal Info Grid */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#C59F59]">1. Información Personal</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/75">Nombre Completo *</label>
                    <input
                      type="text"
                      required
                      value={issuerName}
                      onChange={(e) => setIssuerName(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      className="w-full px-4 py-3 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/75">Número de Cédula *</label>
                    <input
                      type="text"
                      required
                      value={issuerDocument}
                      onChange={(e) => setIssuerDocument(e.target.value)}
                      placeholder="Ej. 102345678"
                      className="w-full px-4 py-3 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/75">Correo Electrónico *</label>
                    <input
                      type="email"
                      required
                      value={issuerEmail}
                      onChange={(e) => setIssuerEmail(e.target.value)}
                      placeholder="juan@ejemplo.com"
                      className="w-full px-4 py-3 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/75">Teléfono de Contacto *</label>
                    <input
                      type="tel"
                      required
                      value={issuerPhone}
                      onChange={(e) => setIssuerPhone(e.target.value)}
                      placeholder="Ej. 3001234567"
                      className="w-full px-4 py-3 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#C59F59]">2. Datos para Consignación</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/75">Banco *</label>
                    <input
                      type="text"
                      required
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="Ej. Bancolombia"
                      className="w-full px-4 py-3 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/75">Tipo de Cuenta *</label>
                    <select
                      value={bankAccountType}
                      onChange={(e) => setBankAccountType(e.target.value)}
                      className="w-full px-4 py-3 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    >
                      <option value="Ahorros">Ahorros</option>
                      <option value="Corriente">Corriente</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground/75">Número de Cuenta *</label>
                    <input
                      type="text"
                      required
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      placeholder="Ej. 123456789"
                      className="w-full px-4 py-3 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Interactive Signature Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-foreground/5 pb-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#C59F59]">3. Firma Digital</h3>
                  <div className="flex bg-[#fafaf9] border border-foreground/10 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setSignatureType('scribble')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${signatureType === 'scribble' ? 'bg-white text-foreground shadow-sm' : 'text-foreground/40 hover:text-foreground/60'}`}
                    >
                      <SquarePen className="w-3.5 h-3.5" />
                      Dibujar
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignatureType('typed')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${signatureType === 'typed' ? 'bg-white text-foreground shadow-sm' : 'text-foreground/40 hover:text-foreground/60'}`}
                    >
                      <Type className="w-3.5 h-3.5" />
                      Digitar
                    </button>
                  </div>
                </div>

                {signatureType === 'scribble' ? (
                  <div className="space-y-3">
                    <div className="relative border border-dashed border-foreground/20 rounded-2xl overflow-hidden bg-[#fafaf9] hover:bg-[#f6f5f0] transition-colors cursor-crosshair">
                      <canvas
                        ref={canvasRef}
                        width={500}
                        height={160}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        className="w-full max-w-full block"
                      />
                      <button
                        type="button"
                        onClick={clearCanvas}
                        className="absolute right-4 bottom-4 flex items-center gap-1 px-3 py-1.5 bg-white border border-foreground/10 hover:bg-red-50 hover:text-red-500 hover:border-red-200 text-foreground/60 text-xs font-bold rounded-lg transition-colors shadow-sm"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Limpiar
                      </button>
                    </div>
                    <p className="text-[11px] text-foreground/40 italic">Usa tu mouse o tu dedo en dispositivos táctiles para trazar tu firma dentro del recuadro.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-foreground/75">Escribe tu nombre para firmar</label>
                      <input
                        type="text"
                        value={typedSignature}
                        onChange={(e) => setTypedSignature(e.target.value)}
                        placeholder="Ej. Juan Pérez"
                        className="w-full px-4 py-3 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                      />
                    </div>
                    <div className="flex items-center justify-center bg-stone-50 border border-foreground/10 rounded-2xl p-4 min-h-[90px]">
                      {typedSignature ? (
                        <span className="font-family-cursive text-3xl font-medium text-stone-800 italic" style={{ fontFamily: "'Brush Script MT', 'Dancing Script', 'Caveat', cursive" }}>
                          {typedSignature}
                        </span>
                      ) : (
                        <span className="text-xs text-foreground/30 italic">Previsualización de firma manuscrita</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Declaration Checkbox */}
              <div className="bg-[#fcfbf9] border border-[#C59F59]/10 rounded-2xl p-4 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="declaration"
                  checked={declarationAccepted}
                  onChange={(e) => setDeclarationAccepted(e.target.checked)}
                  className="mt-1 accent-[#C59F59] rounded"
                />
                <label htmlFor="declaration" className="text-xs text-foreground/60 text-justify leading-relaxed cursor-pointer select-none">
                  Declaro bajo la gravedad de juramento que pertenezco al régimen de no responsables de IVA (Artículo 437 del E.T.) y que la información suministrada en este documento es verídica y correcta. Acepto estampar mi firma digital para validar esta cuenta de cobro.
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-[#C59F59] text-white font-bold rounded-xl hover:bg-[#B38E4D] transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Procesando firma...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Firmar y Enviar Cuenta de Cobro
                  </>
                )}
              </button>
            </form>

            {/* Right Column: Sticky Summary Document View */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-6 sticky top-6">
                <div>
                  <h3 className="text-sm font-bold text-foreground/40 uppercase tracking-widest mb-1">Detalle de Cobro</h3>
                  <h4 className="text-lg font-serif font-bold text-foreground border-b border-foreground/5 pb-2">CC-{String(doc.number).padStart(5, '0')}</h4>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-foreground/75 uppercase tracking-wider text-[#C59F59]">Concepto:</p>
                  <p className="text-sm text-foreground/80 bg-[#fafaf9] p-3 rounded-xl border border-foreground/5">{doc.concept || 'Servicios Prestados'}</p>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-bold text-foreground/75 uppercase tracking-wider text-[#C59F59]">Desglose de Servicios:</p>
                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                    {(doc.items || []).map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-start text-xs border-b border-stone-100 pb-2">
                        <div>
                          <p className="font-semibold text-foreground">{item.description}</p>
                          <p className="text-foreground/40">{item.quantity} x {formatCOP(item.unit_price)}</p>
                        </div>
                        <span className="font-bold text-foreground">{formatCOP(item.total_price)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-foreground/5 pt-4 flex justify-between items-center bg-stone-50 -mx-6 -mb-6 p-6 rounded-b-3xl">
                  <span className="text-sm font-bold text-foreground/50">TOTAL NETO:</span>
                  <span className="text-xl font-serif font-bold text-stone-800">{formatCOP(doc.total_amount)}</span>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
