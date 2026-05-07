import 'dotenv/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  // Solana
  SOLANA_RPC_URL: z.string().url(),
  SOLANA_NETWORK: z.enum(['devnet', 'mainnet-beta']).default('mainnet-beta'),

  // Helius
  HELIUS_API_KEY: z.string().min(1),
  HELIUS_WEBHOOK_SECRET: z.string().optional(),

  // Token (set after launch)
  TOKEN_MINT: z.string().optional(),
  TOKEN_DECIMALS: z.coerce.number().int().nonnegative().default(6),

  // Distribution wallet (Patient Zero)
  DISTRIBUTION_WALLET_PRIVATE_KEY: z.string().min(1),
  DISTRIBUTION_WALLET_PUBLIC_KEY: z.string().min(1),

  // Supabase (service role for the bot — bypasses RLS)
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Spread mechanic
  TOTAL_SUPPLY: z.coerce.number().positive().default(1_000_000_000),
  CARRIER_MIN_PCT: z.coerce.number().positive().default(0.1),
  SPREAD_MIN_PCT: z.coerce.number().positive().default(0.01),
  RECIPIENT_MIN_SOL: z.coerce.number().nonnegative().default(0.1),
  RECIPIENT_MIN_AGE_DAYS: z.coerce.number().int().nonnegative().default(7),
  RECIPIENT_MIN_OUTGOING_TX: z.coerce.number().int().nonnegative().default(3),
  FORFEIT_DRAIN_PCT: z.coerce.number().positive().default(40),
  QUARANTINE_HOURS: z.coerce.number().int().positive().default(24),
  PATIENT_ZERO_R_FLOOR: z.coerce.number().int().nonnegative().default(10),

  // Server
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

export const config: Config = ConfigSchema.parse(process.env);

// Derived constants — all in TOKEN units (not atomic).
export const CARRIER_MIN_TOKENS =
  (config.TOTAL_SUPPLY * config.CARRIER_MIN_PCT) / 100;
export const SPREAD_MIN_TOKENS =
  (config.TOTAL_SUPPLY * config.SPREAD_MIN_PCT) / 100;
