import { workerHandler } from '../_shared/email-reminders.ts';
import { reminderConfig, vendorFromEnv, workerRpc } from '../_shared/email-reminders-runtime.ts';
Deno.serve(workerHandler({ workerRpc: workerRpc(), vendor: vendorFromEnv(), config: reminderConfig() }));
