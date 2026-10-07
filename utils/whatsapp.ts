// WhatsApp sender used for internal notifications to the company's own
// number(s). Server-only: it reads secrets from the environment.
//
// Two providers, picked with WHATSAPP_PROVIDER:
//
//  meta       WhatsApp Business Cloud API (official).
//             WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TO
//             A message the business starts must use an approved template
//             (WHATSAPP_TEMPLATE_NAME, language WHATSAPP_TEMPLATE_LANG,
//             default "es"). The template body takes one variable, {{1}},
//             which receives the whole summary. Without a template, plain
//             text is sent, which Meta only delivers within 24h of the last
//             message received from that number.
//
//  callmebot  CallMeBot (free, for notifying your own phone).
//             WHATSAPP_TO as "phone:apikey" pairs — each phone activates
//             CallMeBot once and gets its own apikey.
//
// WHATSAPP_TO is a comma-separated list, numbers with country code and no
// "+" (e.g. 573001234567).

export type WhatsAppResult = {
  success: boolean;
  recipients: string[];
  error?: string;
};

type Provider = 'meta' | 'callmebot';

function provider(): Provider | null {
  const p = (process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase();
  return p === 'meta' || p === 'callmebot' ? p : null;
}

function recipients(): string[] {
  return (process.env.WHATSAPP_TO || '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

/** Phone part of a recipient entry, safe to show and log (never the apikey). */
const phoneOf = (entry: string) => entry.split(':')[0];

export function isWhatsAppConfigured(): boolean {
  const p = provider();
  if (!p || recipients().length === 0) return false;
  if (p === 'meta') return !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
  return recipients().every((r) => r.includes(':'));
}

/** Meta template variables cannot hold newlines, tabs or 4+ spaces in a row. */
function asTemplateParam(text: string): string {
  return text
    .replace(/\t/g, ' ')
    .replace(/\n+/g, ' • ')
    .replace(/ {4,}/g, '   ')
    .slice(0, 1000);
}

async function sendMeta(to: string, text: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN!;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const template = process.env.WHATSAPP_TEMPLATE_NAME;
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0';

  const body = template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'es' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: asTemplateParam(text) }] },
          ],
        },
      }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 4096) } };

  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Meta ${res.status}: ${detail.slice(0, 300)}`);
  }
}

async function sendCallMeBot(entry: string, text: string): Promise<void> {
  const [phone, apikey] = entry.split(':');
  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  const res = await fetch(url);
  const detail = await res.text().catch(() => '');
  // CallMeBot answers 200 with an HTML page even on some errors.
  if (!res.ok || /error|invalid|not\s+activated/i.test(detail)) {
    throw new Error(`CallMeBot ${res.status}: ${detail.replace(/<[^>]+>/g, ' ').trim().slice(0, 300)}`);
  }
}

/** Sends `text` to every configured recipient. Never throws. */
export async function sendWhatsApp(text: string): Promise<WhatsAppResult> {
  const p = provider();
  const to = recipients();
  const shown = to.map(phoneOf);

  if (!p) {
    return { success: false, recipients: shown, error: 'WhatsApp no está configurado (WHATSAPP_PROVIDER = meta o callmebot).' };
  }
  if (to.length === 0) {
    return { success: false, recipients: shown, error: 'No hay destinatarios (WHATSAPP_TO).' };
  }
  if (!isWhatsAppConfigured()) {
    return { success: false, recipients: shown, error: `Faltan credenciales de WhatsApp para el proveedor "${p}".` };
  }

  const errors: string[] = [];
  for (const entry of to) {
    try {
      if (p === 'meta') await sendMeta(entry, text);
      else await sendCallMeBot(entry, text);
    } catch (err) {
      errors.push(`${phoneOf(entry)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return errors.length
    ? { success: false, recipients: shown, error: errors.join(' | ') }
    : { success: true, recipients: shown };
}
