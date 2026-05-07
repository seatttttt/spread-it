import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client: uses ANON key with RLS read-only policies.
 * Bot uses service-role key separately on the server.
 *
 * Returns null when env vars are missing: UI falls back to mock data.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 50 } },
    })
  : null;

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY missing, falling back to mock data',
  );
}
