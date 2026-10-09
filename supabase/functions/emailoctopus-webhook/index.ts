import { webhookHandler } from '../_shared/email-reminders.ts';
import { workerRpc } from '../_shared/email-reminders-runtime.ts';
Deno.serve(webhookHandler({ workerRpc: workerRpc(), secret: Deno.env.get('EMAILOCTOPUS_WEBHOOK_SECRET') ?? '', listId: Deno.env.get('EMAILOCTOPUS_LIST_ID') ?? '' }));
