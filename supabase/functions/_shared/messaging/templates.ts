/**
 * Message catalogue. Every message the platform sends is one of these templates.
 *
 * WhatsApp: each template must be created and approved in WhatsApp Manager (Meta) or as a
 * Twilio Content template, with the body variables in the order listed in `bodyParams`.
 * SMS (India): the text below must be registered verbatim as a DLT template; with MSG91 each
 * template is a Flow whose variables are named exactly like the params.
 */
import type { ChannelPolicy, EmailContent, EmailPolicy, SmsContent, TemplateId, WhatsAppContent } from './types.ts';
import { MessagingError } from './types.ts';

type Params = Record<string, string>;

export interface ContentConfig {
  brand: string;
  whatsappLanguage: string;
  /** Overrides of the default WhatsApp template names. */
  whatsappTemplateNames: Partial<Record<TemplateId, string>>;
  twilioContentSids: Partial<Record<TemplateId, string>>;
  msg91FlowIds: Partial<Record<TemplateId, string>>;
  appUrl: string;
}

export const DEFAULT_CONTENT_CONFIG: ContentConfig = {
  brand: 'OneLocal',
  whatsappLanguage: 'en',
  whatsappTemplateNames: {},
  twilioContentSids: {},
  msg91FlowIds: {},
  appUrl: 'https://onelocal.in',
};

export interface TemplateDef {
  id: TemplateId;
  description: string;
  params: readonly string[];
  policy: ChannelPolicy;
  email: EmailPolicy;
  /** WhatsApp accepted but not delivered within this many seconds → SMS. 0 = no timeout fallback. */
  fallbackAfterSeconds: number;
  /** A second send to the same number within this window goes straight to SMS ("didn't get it"). */
  escalateResendWithinSeconds?: number;
  rateLimit?: { max: number; windowSeconds: number };
  whatsapp?: { name: string; bodyParams: readonly string[]; otpButtonParam?: string };
  sms?: (p: Params, brand: string) => string;
  emailContent?: (p: Params, brand: string, appUrl: string) => { subject: string; heading: string; lines: string[]; cta?: { label: string; url: string } };
}

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  login_otp: {
    id: 'login_otp',
    description: 'Rider app sign-in code (Supabase Auth send-SMS hook)',
    params: ['otp'],
    policy: 'whatsapp_then_sms',
    email: 'never',
    fallbackAfterSeconds: 30,
    escalateResendWithinSeconds: 300,
    rateLimit: { max: 5, windowSeconds: 900 },
    whatsapp: { name: 'onelocal_login_otp', bodyParams: ['otp'], otpButtonParam: 'otp' },
    sms: (p, brand) => `${p.otp} is your ${brand} Rider login OTP. It is valid for 5 minutes. Do not share it with anyone. - ${brand}`,
  },
  delivery_otp: {
    id: 'delivery_otp',
    description: 'Customer delivery code the rider asks for at the door',
    params: ['name', 'order', 'otp'],
    policy: 'whatsapp_then_sms',
    email: 'never',
    fallbackAfterSeconds: 30,
    escalateResendWithinSeconds: 300,
    rateLimit: { max: 5, windowSeconds: 900 },
    whatsapp: { name: 'onelocal_delivery_otp', bodyParams: ['name', 'order', 'otp'] },
    sms: (p, brand) => `Hi ${p.name}, the delivery OTP for your ${brand} order ${p.order} is ${p.otp}. Share it with the rider only when you receive your order. - ${brand}`,
  },
  order_delivered: {
    id: 'order_delivered',
    description: 'Customer receipt after proof of delivery',
    params: ['name', 'order', 'time'],
    policy: 'whatsapp_then_sms',
    email: 'also',
    fallbackAfterSeconds: 300,
    whatsapp: { name: 'onelocal_order_delivered', bodyParams: ['name', 'order', 'time'] },
    sms: (p, brand) => `Hi ${p.name}, your ${brand} order ${p.order} was delivered at ${p.time}. Thank you for ordering with ${brand}. - ${brand}`,
    emailContent: (p, brand) => ({
      subject: `Your ${brand} order ${p.order} was delivered`,
      heading: 'Order delivered',
      lines: [`Hi ${p.name},`, `Your order ${p.order} was delivered at ${p.time}.`, `Thank you for ordering with ${brand}.`],
    }),
  },
  rider_approved: {
    id: 'rider_approved',
    description: 'Rider application approved',
    params: ['name'],
    policy: 'whatsapp_then_sms',
    email: 'also',
    fallbackAfterSeconds: 600,
    whatsapp: { name: 'onelocal_rider_approved', bodyParams: ['name'] },
    sms: (p, brand) => `Hi ${p.name}, your ${brand} Rider account is approved. Open the app and go online to start earning. - ${brand}`,
    emailContent: (p, brand, appUrl) => ({
      subject: `You're approved to ride with ${brand}`,
      heading: "You're approved",
      lines: [`Hi ${p.name},`, `Your ${brand} Rider account is approved.`, 'Open the app and tap GO ONLINE to start receiving orders.'],
      cta: { label: 'Open OneLocal Rider', url: appUrl },
    }),
  },
  payout_sent: {
    id: 'payout_sent',
    description: 'Weekly payout transferred to the rider',
    params: ['name', 'amount', 'period'],
    policy: 'whatsapp_then_sms',
    email: 'also',
    fallbackAfterSeconds: 600,
    whatsapp: { name: 'onelocal_payout_sent', bodyParams: ['name', 'amount', 'period'] },
    sms: (p, brand) => `Hi ${p.name}, your ${brand} payout of Rs ${p.amount} for ${p.period} has been sent to your bank or UPI account. - ${brand}`,
    emailContent: (p, brand) => ({
      subject: `${brand} payout of Rs ${p.amount} sent`,
      heading: 'Payout sent',
      lines: [`Hi ${p.name},`, `Your payout of Rs ${p.amount} for ${p.period} has been sent to your bank or UPI account.`, 'It usually reaches your account within a few hours.'],
    }),
  },
  weekly_statement: {
    id: 'weekly_statement',
    description: 'Weekly earnings statement (email only)',
    params: ['name', 'period', 'amount', 'url'],
    policy: 'none',
    email: 'also',
    fallbackAfterSeconds: 0,
    emailContent: (p, brand) => ({
      subject: `Your ${brand} earnings statement for ${p.period}`,
      heading: 'Weekly statement',
      lines: [`Hi ${p.name},`, `You earned Rs ${p.amount} in ${p.period}.`, 'Your statement is ready to download.'],
      cta: { label: 'Download statement (PDF)', url: p.url ?? '' },
    }),
  },
  sos_alert: {
    id: 'sos_alert',
    description: "Rider SOS → the rider's emergency contact (WhatsApp and SMS together)",
    params: ['name', 'location'],
    policy: 'whatsapp_and_sms',
    email: 'never',
    fallbackAfterSeconds: 0,
    whatsapp: { name: 'onelocal_sos_alert', bodyParams: ['name', 'location'] },
    sms: (p, brand) => `SOS: ${p.name}, a ${brand} rider, pressed the emergency button. Location: ${p.location} Please call them now. - ${brand}`,
  },
};

export const isTemplateId = (v: unknown): v is TemplateId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(TEMPLATES, v);

const MAX_PARAM = 160;

/** Checks required params and cleans values (WhatsApp rejects newlines, tabs and long runs of spaces). */
export const validateParams = (id: TemplateId, params: Record<string, unknown>): Params => {
  const def = TEMPLATES[id];
  const out: Params = {};
  for (const key of def.params) {
    const raw = params[key];
    if (typeof raw !== 'string' && typeof raw !== 'number') throw new MessagingError('validation', `Missing parameter "${key}" for template ${id}`);
    const value = String(raw).replace(/\s+/g, ' ').trim();
    if (!value) throw new MessagingError('validation', `Empty parameter "${key}" for template ${id}`);
    if (value.length > MAX_PARAM) throw new MessagingError('validation', `Parameter "${key}" is too long`);
    out[key] = value;
  }
  if ('otp' in out && !/^\d{4,8}$/.test(out.otp ?? '')) throw new MessagingError('validation', 'OTP must be 4-8 digits');
  if ('url' in out && !/^https:\/\//.test(out.url ?? '')) throw new MessagingError('validation', 'Statement URL must be https');
  return out;
};

export const renderWhatsApp = (id: TemplateId, p: Params, cfg: ContentConfig): WhatsAppContent | null => {
  const wa = TEMPLATES[id].whatsapp;
  if (!wa) return null;
  const bodyParams = wa.bodyParams.map((k) => p[k] ?? '');
  const twilioVariables: Record<string, string> = {};
  bodyParams.forEach((v, i) => {
    twilioVariables[String(i + 1)] = v;
  });
  return {
    kind: 'whatsapp',
    templateName: cfg.whatsappTemplateNames[id] ?? wa.name,
    language: cfg.whatsappLanguage,
    bodyParams,
    otpButtonParam: wa.otpButtonParam ? p[wa.otpButtonParam] : undefined,
    twilioContentSid: cfg.twilioContentSids[id],
    twilioVariables,
  };
};

export const renderSms = (id: TemplateId, p: Params, cfg: ContentConfig): SmsContent | null => {
  const sms = TEMPLATES[id].sms;
  if (!sms) return null;
  return { kind: 'sms', text: sms(p, cfg.brand), msg91FlowId: cfg.msg91FlowIds[id], vars: { ...p } };
};

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const renderEmail = (id: TemplateId, p: Params, cfg: ContentConfig): EmailContent | null => {
  const build = TEMPLATES[id].emailContent;
  if (!build) return null;
  const e = build(p, cfg.brand, cfg.appUrl);
  const paragraphs = e.lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:22px;color:#121212">${escapeHtml(l)}</p>`).join('');
  const cta = e.cta?.url
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(e.cta.url)}" style="display:inline-block;background:#0C1F15;color:#A1FE2F;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:100px">${escapeHtml(e.cta.label)}</a></p>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;background:#FAFAF9;font-family:Inter,Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:520px;background:#FFFFFF;border:1px solid #DBE0D6;border-radius:24px" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 28px 8px"><div style="font-size:20px;font-weight:800;color:#121212">One<span style="color:#76EC00">Local</span></div><h1 style="margin:20px 0 16px;font-size:22px;color:#121212">${escapeHtml(e.heading)}</h1>${paragraphs}${cta}</td></tr><tr><td style="padding:20px 28px 28px;font-size:12px;color:#666660">You are receiving this because of your ${escapeHtml(cfg.brand)} account.</td></tr></table></td></tr></table></body></html>`;
  const text = [...e.lines, ...(e.cta?.url ? [`${e.cta.label}: ${e.cta.url}`] : [])].join('\n\n');
  return { kind: 'email', subject: e.subject, text, html };
};
