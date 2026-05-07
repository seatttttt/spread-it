/**
 * Formatters — clinical lab presentation rules.
 * All number output uses tabular numerals (set globally in CSS).
 */

export function truncateAddress(addr: string | null | undefined, chars = 4): string {
  if (!addr) return '—';
  if (addr.includes('.')) return addr;
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function formatSol(sol: number, decimals = 3): string {
  return sol.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSolCompact(sol: number): string {
  if (sol < 0.001) return sol.toFixed(5);
  if (sol < 1) return sol.toFixed(4);
  return sol.toFixed(3);
}

export function formatTokens(tokens: number, decimals = 0): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSupplyPct(balance: number, totalSupply = 1_000_000_000): string {
  return `${((balance / totalSupply) * 100).toFixed(3)}%`;
}

export function formatPct(pct: number, decimals = 2): string {
  return `${pct.toFixed(decimals)}%`;
}

export function formatTimeMs(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().slice(11, 19); // HH:MM:SS
}

export function formatTimeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const days = Math.floor(h / 24);
  return `${days}d ${h % 24}h ago`;
}

export function formatQuarantineRemaining(until: string | null): string {
  if (!until) return '—';
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / (60 * 60 * 1000));
  const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}
