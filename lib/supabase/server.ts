import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Supabase-клиент для Server Components и Server Actions.
 * Сессия хранится в HttpOnly-cookie и не попадает в клиентский JavaScript.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // В Server Component запись cookie может быть запрещена.
            // Обновление сессии берёт на себя middleware.ts.
          }
        }
      }
    }
  );
}
