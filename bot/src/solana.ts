import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from './config.js';

/**
 * Solana RPC connection.
 * Use 'confirmed' commitment for the bot — balances speed and finality.
 */
export const connection = new Connection(config.SOLANA_RPC_URL, 'confirmed');

/**
 * Distribution wallet keypair — holds creator fees temporarily before distribution.
 * Balance is flushed every 60s if it exceeds DISTRIBUTION_WALLET_FLUSH_THRESHOLD_SOL.
 */
export const distributionWallet = Keypair.fromSecretKey(
  bs58.decode(config.DISTRIBUTION_WALLET_PRIVATE_KEY),
);

/**
 * Pump.fun + PumpSwap program IDs.
 * VERIFY at implementation time against official pump.fun docs.
 * https://pump.fun/docs
 */
export const PUMP_FUN_BONDING_CURVE_PROGRAM = new PublicKey(
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
);

export const PUMP_SWAP_AMM_PROGRAM = new PublicKey(
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
);

/**
 * Lamports per SOL — Solana's smallest unit.
 */
export const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Convert lamports → SOL (number; for display/storage only — not for math precision).
 */
export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

/**
 * Convert SOL → lamports (integer; for tx construction).
 */
export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}
