import { preferencesHandler } from '../_shared/email-reminders.ts';
import { preferenceDependencies } from '../_shared/email-reminders-runtime.ts';
Deno.serve(preferencesHandler(preferenceDependencies()));
