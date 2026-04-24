import { createClient } from '@supabase/supabase-js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSupabaseClient(config) {
    return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        db: { schema: 'forge' },
        auth: { persistSession: false },
    });
}
//# sourceMappingURL=supabase.js.map