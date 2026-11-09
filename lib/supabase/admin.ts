import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Service Role обходит RLS и используется только внутри доверенного API.
 * Никогда не импортируйте этот файл в клиентские компоненты.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}
