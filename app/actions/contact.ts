"use server";

import { Resend } from "resend";

export async function sendContactEmail(formData: FormData) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY environment variable");
      return { error: "Error de configuración del servidor de correo." };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const nombre = formData.get("nombre") as string;
    const email = formData.get("email") as string;
    const negocio = formData.get("negocio") as string;
    const servicio = formData.get("servicio") as string;
    const mensaje = formData.get("mensaje") as string;

    if (!nombre || !email || !mensaje) {
      return { error: "Por favor completa todos los campos requeridos." };
    }

    const { data, error } = await resend.emails.send({
      from: "Café Amantti <hola@cafeamantti.com>",
      to: ["cafeamantti@gmail.com", "lauraospina@cafeamantti.com"],
      subject: `Nuevo Mensaje de Contacto: ${nombre}`,
      text: `
Has recibido un nuevo mensaje de contacto desde la página web de Café Amantti.

Nombre: ${nombre}
Email: ${email}
Negocio: ${negocio || "N/A"}
Servicio Requerido: ${servicio || "N/A"}

Mensaje:
${mensaje}
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return { error: "Hubo un error al enviar tu mensaje. Por favor intenta de nuevo." };
    }

    return { success: true };
  } catch (err) {
    console.error("Failed to send contact email:", err);
    return { error: "Hubo un error inesperado. Por favor intenta de nuevo." };
  }
}
