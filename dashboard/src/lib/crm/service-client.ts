// Server-only. Used by /api/crm/* routes to enqueue runs without RLS.
import { createClient } from '@supabase/supabase-js';

export function createForgeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Service-role client env vars missing');
  return createClient(url, key, { db: { schema: 'forge' } });
}
