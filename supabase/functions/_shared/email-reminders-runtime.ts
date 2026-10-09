import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { emailOctopus, type PreferenceDependencies, type ReminderConfig, type Vendor } from './email-reminders.ts';

// Server-only wiring. API keys, list/automation IDs and the worker/webhook
// secrets come from the Supabase secret store; never from HTML or a browser.
function admin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw Error('Supabase server configuration is missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function preferenceDependencies(): PreferenceDependencies {
  const client = admin();
  return {
    async getUser(token) { const { data, error } = await client.auth.getUser(token); return error ? null : data.user; },
    async preferencesRpc(userId, request) { return await client.rpc('email_preferences', { verified_user_id: userId, request }); },
  };
}

export function workerRpc() {
  const client = admin();
  return async (request: Record<string, unknown>) => await client.rpc('email_reminders_worker', { request });
}

// Null until every EmailOctopus setting exists: the worker then only does
// local reconciliation and makes no vendor request.
export function vendorFromEnv(): Vendor | null {
  const apiKey = Deno.env.get('EMAILOCTOPUS_API_KEY'), listId = Deno.env.get('EMAILOCTOPUS_LIST_ID');
  const es = Deno.env.get('EMAILOCTOPUS_AUTOMATION_ES'), en = Deno.env.get('EMAILOCTOPUS_AUTOMATION_EN');
  return apiKey && listId && es && en ? emailOctopus({ apiKey, listId }) : null;
}

export function reminderConfig(): ReminderConfig {
  return {
    workerSecret: Deno.env.get('REMINDER_WORKER_SECRET') ?? '',
    automations: { es: Deno.env.get('EMAILOCTOPUS_AUTOMATION_ES') ?? '', en: Deno.env.get('EMAILOCTOPUS_AUTOMATION_EN') ?? '' },
    languageField: Deno.env.get('EMAILOCTOPUS_LANGUAGE_FIELD') ?? 'Language',
    batch: 25,
    cardBaseUrl: `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/daily-card`,
  };
}
