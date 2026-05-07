import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

/**
 * Supabase client using SERVICE ROLE key — bypasses RLS.
 * Bot has full write access. Frontend uses anon key with RLS read-only.
 */
export const db = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'the-seat-bot' } },
  },
);
