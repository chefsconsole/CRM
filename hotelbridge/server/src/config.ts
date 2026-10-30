import 'node:process';

/**
 * Environment configuration. Everything environment-specific lives here; secrets are read
 * from the process environment (or a secrets manager that populates it) and never reach the browser.
 */
export type AppEnv = 'development' | 'test' | 'demo' | 'staging' | 'production';

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export interface Config {
  appEnv: AppEnv;
  isProduction: boolean;
  port: number;
  databaseUrl: string | undefined;
  pgliteDataDir: string | undefined;
  sessionTtlHours: number;
  cookieSecure: boolean;
  publicContactEmail: string | undefined;
  publicContactPhone: string | undefined;
  sandboxSupplierEnabled: boolean;
  supplierTimeoutMs: number;
  offerTtlMinutes: number;
  groupResponseSlaHours: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const appEnv = (env.APP_ENV ?? (env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development')) as AppEnv;
  const isProduction = appEnv === 'production';
  if (isProduction && !env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production (embedded PGlite is for development only).');
  }
  return {
    appEnv,
    isProduction,
    port: Number(env.PORT ?? 4100),
    databaseUrl: env.DATABASE_URL || undefined,
    pgliteDataDir: env.PGLITE_DATA_DIR || (appEnv === 'test' ? undefined : '.data/pglite'),
    sessionTtlHours: Number(env.SESSION_TTL_HOURS ?? 12),
    cookieSecure: bool(env.COOKIE_SECURE, isProduction),
    publicContactEmail: env.PUBLIC_CONTACT_EMAIL || undefined,
    publicContactPhone: env.PUBLIC_CONTACT_PHONE || undefined,
    // The sandbox supplier fabricates responses for testing. It can never run in production.
    sandboxSupplierEnabled: !isProduction && bool(env.SANDBOX_SUPPLIER_ENABLED, true),
    supplierTimeoutMs: Number(env.SUPPLIER_TIMEOUT_MS ?? 8000),
    offerTtlMinutes: Number(env.OFFER_TTL_MINUTES ?? 30),
    groupResponseSlaHours: Number(env.GROUP_RESPONSE_SLA_HOURS ?? 24),
  };
}
