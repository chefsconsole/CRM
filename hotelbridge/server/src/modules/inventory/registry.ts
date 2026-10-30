import type { Config } from '../../config.js';
import type { InventoryAdapter } from './types.js';
import { ContractedAdapter } from './adapters/contracted.js';
import { SandboxAdapter } from './adapters/sandbox.js';
import { unconnectedAdapter } from './adapters/unconnected.js';

export class AdapterRegistry {
  private adapters = new Map<string, InventoryAdapter>();

  constructor(config: Config, env: NodeJS.ProcessEnv = process.env) {
    this.register(new ContractedAdapter());
    if (config.sandboxSupplierEnabled) {
      if (config.isProduction) throw new Error('Refusing to load the sandbox supplier in production');
      this.register(new SandboxAdapter(config.supplierTimeoutMs * 2));
    }
    this.register(unconnectedAdapter('tbo', 'TBO Holidays', ['TBO_API_URL', 'TBO_USERNAME', 'TBO_PASSWORD'], env));
    this.register(unconnectedAdapter('hotelbeds', 'Hotelbeds APItude', ['HOTELBEDS_API_URL', 'HOTELBEDS_API_KEY', 'HOTELBEDS_SECRET'], env));
    this.register(unconnectedAdapter('ratehawk', 'RateHawk (ETG)', ['RATEHAWK_API_URL', 'RATEHAWK_KEY_ID', 'RATEHAWK_API_KEY'], env));
  }

  register(a: InventoryAdapter) { this.adapters.set(a.code, a); }
  get(code: string): InventoryAdapter | undefined { return this.adapters.get(code); }
  all(): InventoryAdapter[] { return [...this.adapters.values()]; }
  /** Sources that can currently answer searches. */
  searchable(): InventoryAdapter[] { return this.all().filter((a) => a.capabilities.search && a.status().configured); }
}
