import { formatCOP, numeroALetras, imageUrlToBase64, formatDateSpanish } from "./cuentasCobroHelpers";

/**
 * Robust, client-side PDF generator for Cuentas de Cobro.
 * Compatible with html2pdf.js and html2canvas.
 */
export async function downloadCuentaCobroPDF(doc: any): Promise<boolean> {
  if (!doc) return false;

  try {
    const html2pdf = (await import("html2pdf.js")).default;

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const bgBase64 = await imageUrlToBase64(`${baseUrl}/images/Main_Background.jpg`);
    const logoBase64 = await imageUrlToBase64(`${baseUrl}/images/logo-amantti.png`);

    const issuerNameClean = (doc.issuer_name || "Documento").replace(/\s+/g, "_");
    const filename = `Cuenta_de_Cobro_${doc.number || "000"}_${issuerNameClean}.pdf`;

    const opt = {
      margin: 10,
      filename: filename,
      image: { type: "jpeg" as const, quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true,
        logging: false,
        allowTaint: true
      },
      jsPDF: { unit: "mm" as const, format: "letter" as const, orientation: "portrait" as const }
    };

    // Construct a table-based, bulletproof HTML template optimized for html2canvas
    const element = document.createElement("div");
    element.style.width = "750px";
    element.style.padding = "20px";
    element.style.backgroundColor = "#ffffff";
    element.style.fontFamily = "Arial, Helvetica, sans-serif";
    element.style.color = "#1c1917";
    element.style.boxSizing = "border-box";
    element.style.position = "relative";

    const issueDateStr = formatDateSpanish(doc.issue_date || doc.created_at);
    const signedDateStr = doc.signed_at 
      ? new Date(doc.signed_at).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })
      : null;

    element.innerHTML = `
      <div style="position: relative; border: 1px solid #e7e5e4; border-radius: 8px; padding: 25px; background-color: #ffffff; overflow: hidden;">
        
        <!-- Watermark Background Image -->
        ${bgBase64 ? `
          <img 
            src="${bgBase64}" 
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.08; pointer-events: none; z-index: 0;"
          />
        ` : ""}

        <div style="position: relative; z-index: 1;">
          
          <!-- Header Table -->
          <table style="width: 100%; border-collapse: collapse; border-bottom: 2px solid #e7e5e4; padding-bottom: 15px; margin-bottom: 25px;">
            <tr>
              <td style="vertical-align: top; width: 60%;">
                <img src="${logoBase64}" style="width: 140px; height: auto; object-fit: contain; margin-bottom: 10px; display: block;" />
                <h1 style="font-size: 20px; font-weight: bold; margin: 0; color: #292524; font-family: Georgia, serif; letter-spacing: 0.5px;">CUENTA DE COBRO</h1>
                <p style="font-size: 13px; color: #78716c; margin: 4px 0 0 0; font-weight: bold;">Número: CC-${String(doc.number || 0).padStart(5, "0")}</p>
                <p style="font-size: 12px; color: #78716c; margin: 2px 0 0 0;">Fecha de Emisión: ${issueDateStr}</p>
                ${signedDateStr ? `<p style="font-size: 12px; color: #166534; font-weight: bold; margin: 2px 0 0 0;">Fecha de Firma: ${signedDateStr}</p>` : ""}
              </td>
              <td style="vertical-align: top; width: 40%; text-align: right;">
                ${doc.type === "ingreso" ? `
                  <p style="font-weight: bold; margin: 0; font-size: 15px; letter-spacing: 0.5px; color: #292524;">CAFÉ AMANTTI</p>
                  <p style="margin: 3px 0 0 0; color: #57534e; font-size: 12px;">Alma Trading Group SAS</p>
                  <p style="margin: 2px 0 0 0; color: #57534e; font-size: 12px;">NIT: 901752308-8</p>
                  <p style="margin: 2px 0 0 0; color: #57534e; font-size: 12px;">Contacto: cafeamantti@gmail.com</p>
                ` : `
                  <span style="display: inline-block; padding: 6px 12px; background-color: #f5f5f4; border: 1px solid #e7e5e4; border-radius: 6px; font-size: 11px; font-weight: bold; color: #57534e;">
                    STATUS: ${(doc.status || "PENDIENTE").toUpperCase()}
                  </span>
                `}
              </td>
            </tr>
          </table>

          <!-- Deudor / Acreedor Details Table -->
          <table style="width: 100%; border-collapse: separate; border-spacing: 15px; margin-bottom: 20px;">
            <tr>
              <td style="width: 50%; vertical-align: top; background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 12px;">
                <h3 style="font-size: 12px; font-weight: bold; margin: 0 0 8px 0; border-bottom: 1px solid #e7e5e4; padding-bottom: 4px; text-transform: uppercase; color: #78716c;">DEUDOR (PAGADOR)</h3>
                ${doc.type === "ingreso" ? `
                  <p style="margin: 0; font-weight: bold; font-size: 13px;">${doc.debtor_name || "N/A"}</p>
                  <p style="margin: 3px 0 0 0; font-size: 12px;">Documento: ${doc.debtor_document || "N/A"}</p>
                  ${doc.debtor_email ? `<p style="margin: 2px 0 0 0; font-size: 11px; color: #57534e;">Email: ${doc.debtor_email}</p>` : ""}
                  ${doc.debtor_phone ? `<p style="margin: 2px 0 0 0; font-size: 11px; color: #57534e;">Teléfono: ${doc.debtor_phone}</p>` : ""}
                ` : `
                  <p style="margin: 0; font-weight: bold; font-size: 13px;">Alma Trading Group SAS</p>
                  <p style="margin: 3px 0 0 0; font-size: 12px;">NIT: 901752308-8</p>
                  <p style="margin: 2px 0 0 0; font-size: 11px; color: #57534e;">Medellín, Colombia</p>
                `}
              </td>
              <td style="width: 50%; vertical-align: top; background-color: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 12px;">
                <h3 style="font-size: 12px; font-weight: bold; margin: 0 0 8px 0; border-bottom: 1px solid #e7e5e4; padding-bottom: 4px; text-transform: uppercase; color: #78716c;">ACREEDOR (EMISOR)</h3>
                <p style="margin: 0; font-weight: bold; font-size: 13px;">${doc.issuer_name || "N/A"}</p>
                <p style="margin: 3px 0 0 0; font-size: 12px;">NIT / Documento: ${doc.issuer_document || "N/A"}</p>
                ${doc.issuer_email ? `<p style="margin: 2px 0 0 0; font-size: 11px; color: #57534e;">Email: ${doc.issuer_email}</p>` : ""}
                ${doc.issuer_phone ? `<p style="margin: 2px 0 0 0; font-size: 11px; color: #57534e;">Teléfono: ${doc.issuer_phone}</p>` : ""}
              </td>
            </tr>
          </table>

          <!-- Legal Text Block -->
          <div style="margin-bottom: 20px; font-size: 13px; line-height: 1.5; text-align: justify; color: #292524;">
            <p style="margin: 0 0 10px 0;">
              ${doc.type === "ingreso" ? `
                <strong>${doc.debtor_name || "El cliente"}</strong> con Documento <strong>${doc.debtor_document || ""}</strong> DEBE A: <strong>${doc.issuer_name || "Café Amantti"}</strong> con NIT/Documento <strong>${doc.issuer_document || ""}</strong> la suma de <strong>${formatCOP(doc.total_amount || 0)} COP</strong> (${numeroALetras(doc.total_amount || 0)}).
              ` : `
                <strong>Alma Trading Group SAS</strong> con NIT <strong>901752308-8</strong> DEBE A: <strong>${doc.issuer_name || "El proveedor"}</strong> con C.C. / Documento <strong>${doc.issuer_document || ""}</strong> la suma de <strong>${formatCOP(doc.total_amount || 0)} COP</strong> (${numeroALetras(doc.total_amount || 0)}).
              `}
            </p>
            <p style="margin: 0 0 15px 0;">
              Por concepto de: <strong>${doc.concept || "Servicios Prestados"}</strong>
            </p>
          </div>

          <!-- Items Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 12px;">
            <thead>
              <tr style="background-color: #f5f5f4; border-bottom: 2px solid #e7e5e4;">
                <th style="padding: 10px; text-align: left; font-weight: bold; width: 55%;">Descripción del Servicio / Producto</th>
                <th style="padding: 10px; text-align: center; font-weight: bold; width: 10%;">Cant.</th>
                <th style="padding: 10px; text-align: right; font-weight: bold; width: 17%;">Valor Unitario</th>
                <th style="padding: 10px; text-align: right; font-weight: bold; width: 18%;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${(doc.items || []).map((item: any) => `
                <tr style="border-bottom: 1px solid #e7e5e4;">
                  <td style="padding: 8px 10px; text-align: left;">${item.description || ""}</td>
                  <td style="padding: 8px 10px; text-align: center;">${item.quantity || 1}</td>
                  <td style="padding: 8px 10px; text-align: right;">${formatCOP(item.unit_price || 0)}</td>
                  <td style="padding: 8px 10px; text-align: right; font-weight: bold;">${formatCOP(item.total_price || 0)}</td>
                </tr>
              `).join("")}
              <tr style="background-color: #fafaf9; font-weight: bold; font-size: 13px; border-top: 2px solid #e7e5e4;">
                <td colspan="3" style="padding: 10px; text-align: right;">TOTAL A PAGAR:</td>
                <td style="padding: 10px; text-align: right; color: #1c1917;">${formatCOP(doc.total_amount || 0)} COP</td>
              </tr>
            </tbody>
          </table>

          <!-- Legal Affidavit & Bank Details -->
          <div style="background-color: #fafaf9; border-left: 4px solid #C59F59; padding: 12px 15px; margin-bottom: 30px; border-radius: 0 6px 6px 0; font-size: 11px; color: #44403c;">
            <p style="margin: 0; font-weight: bold; color: #292524; font-size: 12px; margin-bottom: 4px;">DECLARACIÓN JURAMENTADA Y DATOS DE PAGO</p>
            <p style="margin: 0 0 8px 0; line-height: 1.4;">
              Manifiesto bajo la gravedad del juramento que los datos personales y bancarios aquí consignados son correctos. De igual forma, declaro que pertenezco al régimen de no responsables de IVA (Artículo 437 del Estatuto Tributario).
            </p>
            <p style="margin: 0; font-weight: bold; color: #292524;">
              Instrucción de Pago: Consignar a ${doc.bank_name || "Banco"} - Cuenta de ${doc.bank_account_type || "Ahorros"} No. ${doc.bank_account_number || "XXXXXXXX"}.
            </p>
          </div>

          <!-- Digital Signature Block -->
          <div style="margin-top: 30px; max-width: 320px;">
            <p style="margin: 0 0 8px 0; font-size: 11px; color: #78716c; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Firma Digital del Emisor</p>
            <div style="border-bottom: 1.5px solid #a8a29e; width: 100%; min-height: 70px; display: flex; align-items: center; justify-content: center; padding-bottom: 5px;">
              ${doc.signature_data ? (
                doc.signature_type === "scribble"
                  ? `<img src="${doc.signature_data}" style="max-height: 70px; max-width: 250px; object-fit: contain;" />`
                  : `<span style="font-family: 'Brush Script MT', 'Dancing Script', 'Caveat', cursive, sans-serif; font-size: 28px; font-style: italic; font-weight: 500; color: #0c0a09;">${doc.signature_data}</span>`
              ) : `
                <span style="font-size: 11px; color: #a8a29e; font-style: italic;">[ Pendiente de Firma ]</span>
              `}
            </div>
            <p style="margin: 8px 0 0 0; font-weight: bold; font-size: 12px; color: #292524;">${doc.issuer_name || ""}</p>
            <p style="margin: 2px 0 0 0; font-size: 11px; color: #57534e;">C.C. / Documento: ${doc.issuer_document || ""}</p>
            ${doc.signed_at ? (
              `<p style="margin: 2px 0 0 0; font-size: 10px; color: #166534; font-style: italic;">Firmado digitalmente el ${new Date(doc.signed_at).toLocaleString("es-CO")}</p>`
            ) : ""}
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(element);

    // Ensure all images inside the rendered element are loaded before html2canvas runs
    const images = Array.from(element.getElementsByTagName("img"));
    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
            } else {
              img.onload = () => resolve();
              img.onerror = () => resolve(); // continue even if an image fails
            }
          })
      )
    );

    // Short timeout to guarantee layout stabilization
    await new Promise((resolve) => setTimeout(resolve, 200));

    await html2pdf().set(opt).from(element).save();

    document.body.removeChild(element);
    return true;
  } catch (err: any) {
    console.error("Error generating Cuenta de Cobro PDF:", err);
    alert("Ocurrió un error al generar el archivo PDF: " + (err?.message || "Error desconocido"));
    return false;
  }
}
