import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ForgeConfig } from './config.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSupabaseClient(config: ForgeConfig): SupabaseClient<any, any, any> {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    db: { schema: 'forge' },
    auth: { persistSession: false },
  });
}
