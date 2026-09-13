import { handler } from '../_shared/http.ts';
import { dependencies } from '../_shared/supabase.ts';
Deno.serve(handler(dependencies(),'account-delete'));
