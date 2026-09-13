import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import type { Dependencies } from './http.ts';

export function dependencies(): Dependencies {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw Error('Supabase server configuration is missing');
  // This module is server-only. Never put this key in HTML, logs or responses.
  const admin = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  return {
    async getUser(token) {
      const {data,error} = await admin.auth.getUser(token);
      return error ? null : data.user;
    },
    async rpc(userId,request) {
      return await admin.rpc('ranked_game',{verified_user_id:userId,request});
    },
    async deleteUser(id) {
      const {error} = await admin.auth.admin.deleteUser(id,false);
      return !error;
    },
  };
}
