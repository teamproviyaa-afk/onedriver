/**
 * Builds the messenger from environment variables (Supabase secrets). Nothing here is ever
 * shipped to the mobile app.
 */
import type { ChannelProvider, MessageStore, TemplateId } from './types.ts';
import { MessagingError } from './types.ts';
import type { MessengerDeps } from './orchestrator.ts';
import { type ContentConfig, DEFAULT_CONTENT_CONFIG, TEMPLATES } from './templates.ts';
import { normalizePhone } from './phone.ts';
import type { FetchLike } from './providers/http.ts';
import { createMetaWhatsAppProvider } from './providers/metaWhatsApp.ts';
import { createTwilioProvider } from './providers/twilio.ts';
import { createMsg91SmsProvider } from './providers/msg91.ts';
import { createResendProvider } from './providers/resend.ts';
import { createMockProvider } from './providers/mock.ts';
import { createSupabaseRestStore } from './store/supabaseRest.ts';

export type EnvGetter = (key: string) => string | undefined;

export interface NotifyConfig {
  deps: MessengerDeps;
  /** Required on /send and /sweep (x-notify-secret or Bearer). */
  apiSecret: string;
  /** Public base URL of this function, e.g. https://<ref>.supabase.co/functions/v1/notify */
  publicUrl: string;
  metaAppSecret: string;
  metaVerifyToken: string;
  twilioAuthToken: string;
  /** Supabase Auth "Send SMS" hook secret (v1,whsec_…). */
  sendSmsHookSecret: string;
  summary: { whatsapp: string | null; sms: string | null; email: string | null };
}

const upper = (id: TemplateId) => id.toUpperCase();

export const loadNotifyConfig = (env: EnvGetter, opts: { fetch?: FetchLike; store?: MessageStore; log?: MessengerDeps['log'] } = {}): NotifyConfig => {
  const get = (k: string) => env(k)?.trim() || undefined;
  const missing: string[] = [];
  const need = (k: string): string => {
    const v = get(k);
    if (!v) missing.push(k);
    return v ?? '';
  };

  const hashPepper = need('MESSAGE_HASH_PEPPER');
  const payloadKey = need('MESSAGE_PAYLOAD_KEY');
  const publicUrl = (get('NOTIFY_PUBLIC_URL') ?? '').replace(/\/$/, '');

  const content: ContentConfig = { ...DEFAULT_CONTENT_CONFIG, whatsappTemplateNames: {}, twilioContentSids: {}, msg91FlowIds: {} };
  content.brand = get('BRAND_NAME') ?? content.brand;
  content.appUrl = get('APP_URL') ?? content.appUrl;
  content.whatsappLanguage = get('WA_TEMPLATE_LANGUAGE') ?? content.whatsappLanguage;
  for (const id of Object.keys(TEMPLATES) as TemplateId[]) {
    const wa = get(`WA_TEMPLATE_${upper(id)}`);
    const sid = get(`TWILIO_CONTENT_SID_${upper(id)}`);
    const flow = get(`MSG91_FLOW_${upper(id)}`);
    if (wa) content.whatsappTemplateNames[id] = wa;
    if (sid) content.twilioContentSids[id] = sid;
    if (flow) content.msg91FlowIds[id] = flow;
  }

  const fetchFn = opts.fetch;
  const mockNoWhatsApp = new Set((get('MOCK_NO_WHATSAPP') ?? '').split(',').map((p) => normalizePhone(p)).filter((p): p is string => !!p));
  const twilio = () => ({
    accountSid: need('TWILIO_ACCOUNT_SID'),
    authToken: need('TWILIO_AUTH_TOKEN'),
    apiKeySid: get('TWILIO_API_KEY_SID'),
    apiKeySecret: get('TWILIO_API_KEY_SECRET'),
    smsFrom: get('TWILIO_SMS_FROM'),
    messagingServiceSid: get('TWILIO_MESSAGING_SERVICE_SID'),
    whatsappFrom: get('TWILIO_WHATSAPP_FROM'),
    statusCallbackUrl: publicUrl ? `${publicUrl}/webhooks/twilio` : undefined,
    fetch: fetchFn,
  });

  let whatsapp: ChannelProvider | undefined;
  switch ((get('WHATSAPP_PROVIDER') ?? 'none').toLowerCase()) {
    case 'meta':
      whatsapp = createMetaWhatsAppProvider({ accessToken: need('META_WA_ACCESS_TOKEN'), phoneNumberId: need('META_WA_PHONE_NUMBER_ID'), graphVersion: get('META_GRAPH_VERSION') ?? 'v23.0', fetch: fetchFn });
      break;
    case 'twilio': {
      const t = twilio();
      if (!t.whatsappFrom) missing.push('TWILIO_WHATSAPP_FROM');
      whatsapp = createTwilioProvider('whatsapp', t);
      break;
    }
    case 'mock':
      whatsapp = createMockProvider('whatsapp', { notOnWhatsApp: (to) => mockNoWhatsApp.has(to) });
      break;
    case 'none':
      break;
    default:
      throw new MessagingError('unconfigured', 'WHATSAPP_PROVIDER must be meta, twilio, mock or none', 500);
  }

  let sms: ChannelProvider | undefined;
  switch ((get('SMS_PROVIDER') ?? 'none').toLowerCase()) {
    case 'msg91':
      sms = createMsg91SmsProvider({ authKey: need('MSG91_AUTH_KEY'), fetch: fetchFn });
      break;
    case 'twilio': {
      const t = twilio();
      if (!t.smsFrom && !t.messagingServiceSid) missing.push('TWILIO_MESSAGING_SERVICE_SID or TWILIO_SMS_FROM');
      sms = createTwilioProvider('sms', t);
      break;
    }
    case 'mock':
      sms = createMockProvider('sms');
      break;
    case 'none':
      break;
    default:
      throw new MessagingError('unconfigured', 'SMS_PROVIDER must be msg91, twilio, mock or none', 500);
  }

  let email: ChannelProvider | undefined;
  switch ((get('EMAIL_PROVIDER') ?? 'none').toLowerCase()) {
    case 'resend':
      email = createResendProvider({ apiKey: need('RESEND_API_KEY'), from: need('EMAIL_FROM'), replyTo: get('EMAIL_REPLY_TO'), fetch: fetchFn });
      break;
    case 'mock':
      email = createMockProvider('email');
      break;
    case 'none':
      break;
    default:
      throw new MessagingError('unconfigured', 'EMAIL_PROVIDER must be resend, mock or none', 500);
  }

  const store =
    opts.store ??
    createSupabaseRestStore({
      url: need('SUPABASE_URL'),
      serviceKey: get('SUPABASE_SERVICE_ROLE_KEY') ?? get('SUPABASE_SECRET_KEY') ?? need('SUPABASE_SERVICE_ROLE_KEY'),
      fetch: fetchFn,
    });

  if (missing.length) throw new MessagingError('unconfigured', `Missing secrets: ${[...new Set(missing)].join(', ')}`, 500);

  return {
    deps: { store, whatsapp, sms, email, hashPepper, payloadKey, content, log: opts.log },
    apiSecret: get('NOTIFY_API_SECRET') ?? '',
    publicUrl,
    metaAppSecret: get('META_APP_SECRET') ?? '',
    metaVerifyToken: get('META_WEBHOOK_VERIFY_TOKEN') ?? '',
    twilioAuthToken: get('TWILIO_AUTH_TOKEN') ?? '',
    sendSmsHookSecret: get('SEND_SMS_HOOK_SECRET') ?? '',
    summary: { whatsapp: whatsapp?.name ?? null, sms: sms?.name ?? null, email: email?.name ?? null },
  };
};
