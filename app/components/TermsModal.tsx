"use client";

import { X, Scale } from "lucide-react";
import { useLanguage } from "@/app/context/LanguageContext";

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TermsModal({ isOpen, onClose }: TermsModalProps) {
  const { locale } = useLanguage();

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300"
        onClick={onClose}
      />
      
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-3xl max-h-[85vh] bg-white rounded-3xl shadow-2xl z-[110] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-6 border-b border-foreground/5 flex items-center justify-between shrink-0 bg-white shadow-sm z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#f9f7f0] rounded-full flex items-center justify-center border border-foreground/5">
              <Scale className="w-6 h-6 text-[#C59F59]" />
            </div>
            <div>
              <h2 className="text-xl font-serif text-foreground leading-tight">
                {locale === "en" ? "Terms and Conditions" : "Términos y Condiciones"}
              </h2>
              <p className="text-[#C59F59] text-[10px] font-bold uppercase tracking-widest mt-1">
                {locale === "en" ? "Updated: March 25, 2026" : "Actualizado: 25 Mar 2026"}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 bg-foreground/5 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors text-foreground/40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 md:px-12 overflow-y-auto flex-1 prose prose-sm md:prose-base prose-headings:font-serif prose-headings:font-normal prose-h2:text-xl prose-h2:text-foreground prose-h2:mt-8 prose-h2:mb-4 prose-p:text-foreground/70 prose-li:text-foreground/70 max-w-none bg-[#fdfbf7]">
          {locale === "en" ? (
            <>
              <p>This document establishes the general Terms and Conditions (hereinafter, the "Terms") governing the use of the Café Amantti website and the purchase of our products and subscriptions. By accessing, browsing, and using our website, you agree to be bound by these Terms.</p>
              <p>Please read this document carefully before making any purchase. If you do not agree with these Terms, we kindly ask you not to use our services.</p>
              
              <h2>1. General Information</h2>
              <p>This website is operated by <strong>Café Amantti</strong>, a brand dedicated to the sale and distribution of Colombian specialty coffee. These Terms are governed by the laws of the Republic of Colombia, specifically Law 1480 of 2011 (Consumer Statute) and Law 1581 of 2012 (Personal Data Protection Law).</p>

              <h2>2. Products and Subscriptions</h2>
              <p>Café Amantti offers specialty coffee through individual purchases and subscription plans (Devoción Esencial, Alquimia & Contraste, and Curaduría Privada).</p>
              <ul>
                <li><strong>Availability:</strong> All our products are subject to harvest and microlot availability. In the event that a product in your subscription is unavailable, we will contact you to offer a product of equal or greater quality (such as an alternative microlot).</li>
                <li><strong>Subscriptions:</strong> By checking out a subscription, you agree to recurring charges (bi-weekly or monthly, depending on your choice) to the registered payment method. You may pause or cancel your subscription at any time through "My Portal" on the website, up to 48 hours before the next billing and shipping cycle.</li>
              </ul>

              <h2>3. Pricing and Payments</h2>
              <p>All prices published on our website are in Colombian Pesos (COP) or US Dollars (USD), depending on your locale configuration, and include applicable legal taxes (VAT, when applicable).</p>
              <ul>
                <li>Shipping costs (<strong>Standard Shipping Cost:</strong> $15,000 COP) will be added to the total value at checkout. We offer free shipping for purchases that exceed the established threshold (currently $150,000 COP).</li>
                <li>Payments made through payment gateways (such as ePayco, via our Davivienda alliance) are processed using secure connections. Café Amantti does not store credit or debit card information.</li>
              </ul>

              <h2>4. Shipping and Delivery Times</h2>
              <p>We strive to ensure our coffee reaches you as fresh as possible.</p>
              <ul>
                <li><strong>Preparation times:</strong> Single purchase orders are usually dispatched within 1 to 3 business days.</li>
                <li><strong>Subscriptions:</strong> Subscription coffee is roasted and packaged according to your selected cycle to guarantee maximum freshness.</li>
              </ul>
              <p>Café Amantti is not liable for logistical delays attributable to the shipping carrier, although we will always provide the necessary support to track your order.</p>

              <h2>5. Right of Withdrawal and Returns</h2>
              <p>Given that coffee is a perishable food product, <strong>returns of roasted, whole bean, or ground coffee are not accepted</strong>, unless the received product presents obvious quality defects (e.g., broken packaging, incorrect product).</p>
              <ul>
                <li><strong>Right of withdrawal:</strong> For non-perishable products (e.g., accessories, subscriptions prior to the first shipment), you have the right to exercise the right of withdrawal established in Article 47 of Law 1480 of 2011, requesting a return within five (5) business days following the purchase. The return shipping cost will be borne by the consumer.</li>
                <li><strong>Warranties:</strong> If you receive a product in poor condition, contact us through our web form or WhatsApp within 48 hours of receipt, attaching photographs, and we will issue a replacement at no additional cost.</li>
              </ul>

              <h2>6. Privacy and Personal Data</h2>
              <p>In compliance with Law 1581 of 2012 (Data Protection Law in Colombia), we inform you that upon registering and making a purchase, your data (name, ID number/Cédula, address, phone, email) will be collected and treated under our <strong>Personal Data Treatment Policy</strong>.</p>
              <p>Such data will be used exclusively to process payments, ship your products, and send relevant notifications about your account. You have the right to know, update, rectify, and request the deletion of your data at any time by writing to the administrative email.</p>

              <h2>7. Intellectual Property</h2>
              <p>All visual, written, and photographic content on the Café Amantti website, as well as trademarks and logos, is the exclusive intellectual property of the brand and is protected by Colombian and international copyright laws. Unauthorized reproduction or use is prohibited.</p>

              <h2>8. Modification of Terms</h2>
              <p>Café Amantti reserves the right to modify or update these Terms and Conditions at any time. Changes will take effect immediately upon their publication on the website. Continued use of the site after any modification constitutes your implicit acceptance of the new terms.</p>
            </>
          ) : (
            <>
              <p>Este documento establece los Términos y Condiciones generales (en adelante, los "Términos") que regulan el uso del sitio web de Café Amantti y la compra de nuestros productos y suscripciones. Al acceder, navegar y utilizar nuestro sitio web, usted acepta estar sujeto a estos Términos.</p>
              <p>Por favor, lea detalladamente este documento antes de realizar cualquier compra. Si no está de acuerdo con estos Términos, le pedimos amablemente que no utilice nuestros servicios.</p>

              <h2>1. Información General</h2>
              <p>Este sitio web es operado por <strong>Café Amantti</strong>, una marca dedicada a la venta y distribución de café de especialidad colombiano. Los presentes Términos se rigen por las leyes de la República de Colombia, en especial la Ley 1480 de 2011 (Estatuto del Consumidor) y la Ley 1581 de 2012 (Ley de Protección de Datos Personales).</p>

              <h2>2. Productos y Suscripciones</h2>
              <p>Café Amantti ofrece café de especialidad mediante compras individuales y planes de suscripción (Devoción Esencial, Alquimia & Contraste, y Curaduría Privada).</p>
              <ul>
                <li><strong>Disponibilidad:</strong> Todos nuestros productos están sujetos a disponibilidad de cosecha y microlotes. En caso de que un producto de su suscripción no esté disponible, nos comunicaremos con usted para ofrecerle un producto de igual o mayor calidad (como un microlote alternativo).</li>
                <li><strong>Suscripciones:</strong> Al adquirir una suscripción, usted acepta que se realicen cobros recurrentes (quincenales o mensuales, según su elección) al método de pago registrado. Usted puede pausar o cancelar su suscripción en cualquier momento a través de "Mi Portal" en el sitio web, hasta 48 horas antes del próximo ciclo de facturación y envío.</li>
              </ul>

              <h2>3. Precios y Pagos</h2>
              <p>Todos los precios publicados en nuestro sitio web están en Pesos Colombianos (COP) o Dólares Estadounidenses (USD), dependiendo de su configuración, e incluyen los impuestos aplicables de ley (IVA, cuando aplique).</p>
              <ul>
                <li>Los costos de envío (<strong>Costo de Envío Estándar:</strong> $15,000 COP) se sumarán al valor total al momento del pago. Ofrecemos envío gratuito para compras que superen el umbral establecido (actualmente $150,000 COP).</li>
                <li>Pagos a través de pasarelas de pago (como ePayco, mediante nuestra alianza con Davivienda) son procesados mediante conexiones seguras. Café Amantti no almacena información de tarjetas de crédito o débito.</li>
              </ul>

              <h2>4. Envíos y Tiempos de Entrega</h2>
              <p>Nos esforzamos por que nuestro café llegue lo más fresco posible.</p>
              <ul>
                <li><strong>Tiempos de preparación:</strong> Los pedidos de compras individuales suelen ser despachados entre 1 a 3 días hábiles.</li>
                <li><strong>Suscripciones:</strong> El café de las suscripciones se tuesta y empaca de acuerdo con su ciclo seleccionado para garantizar máxima frescura.</li>
              </ul>
              <p>Café Amantti no se hace responsable por demoras logísticas imputables a la empresa de transporte, aunque siempre le brindaremos el soporte necesario para rastrear su pedido.</p>

              <h2>5. Derecho de Retracto y Devoluciones</h2>
              <p>Dado que el café es un producto alimenticio perecedero, <strong>no se aceptan devoluciones de café tostado, en grano o molido</strong>, a menos que el producto recibido presente defectos de calidad evidentes (ej. empaque roto, producto incorrecto).</p>
              <ul>
                <li><strong>Derecho de retracto:</strong> Para productos no perecederos (ej. accesorios, suscripciones antes del primer envío), usted tiene derecho a ejercer el derecho de retracto consagrado en el artículo 47 de la Ley 1480 de 2011, solicitando la devolución dentro de los siguientes cinco (5) días hábiles posteriores a la compra. El costo del envío de retorno será asumido por el consumidor.</li>
                <li><strong>Garantías:</strong> Si recibe el producto en mal estado, contáctenos en nuestro formulario web o WhatsApp en las 48 horas siguientes a la recepción, adjuntando fotografías, y haremos el reemplazo sin costo adicional.</li>
              </ul>

              <h2>6. Privacidad y Datos Personales</h2>
              <p>En cumplimiento de la Ley 1581 de 2012 (Ley de Protección de Datos en Colombia), le informamos que al registrarse y realizar una compra, sus datos (nombre, cédula, dirección, teléfono, correo) serán recolectados y tratados bajo nuestra <strong>Política de Tratamiento de Datos Personales</strong>.</p>
              <p>Dichos datos serán utilizados exclusivamente para procesar pagos, realizar el envío de sus productos y enviar notificaciones relevantes sobre su cuenta. Usted tiene derecho a conocer, actualizar, rectificar y solicitar la eliminación de sus datos en cualquier momento escribiendo al correo administrativo.</p>

              <h2>7. Propiedad Intelectual</h2>
              <p>Todo el contenido visual, escrito y fotográfico de la página web de Café Amantti, así como las marcas comerciales y logotipos, es propiedad intelectual exclusiva de la marca y está protegido por las leyes colombianas e internacionales de derechos de autor. Queda prohibida su reproducción o uso no autorizado.</p>

              <h2>8. Modificación de los Términos</h2>
              <p>Café Amantti se reserva el derecho de modificar o actualizar estos Términos y Condiciones en cualquier momento. Los cambios entrarán en vigencia inmediatamente después de su publicación en el sitio web. El uso continuo del sitio después de cualquier modificación constituye su aceptación implícita de los nuevos términos.</p>
            </>
          )}
        </div>
        
        <div className="p-6 border-t border-foreground/5 bg-white flex justify-end shrink-0">
          <button 
            type="button"
            onClick={onClose}
            className="px-8 py-3 bg-foreground text-background text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-[#C59F59] hover:text-white transition-all shadow-md focus:outline-none focus:ring-4 focus:ring-[#C59F59]/20"
          >
            {locale === "en" ? "Close & Accept" : "Cerrar y Aceptar"}
          </button>
        </div>
      </div>
    </>
  );
}
