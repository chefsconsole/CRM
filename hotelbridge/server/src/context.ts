import type { Config } from './config.js';
import type { Db } from './db/pool.js';
import { AdapterRegistry } from './modules/inventory/registry.js';
import { InventoryGateway } from './modules/inventory/gateway.js';

/** Application services, created once at boot and passed to every module. */
export interface AppContext {
  config: Config;
  db: Db;
  registry: AdapterRegistry;
  gateway: InventoryGateway;
  now: () => Date;
}

export function createContext(config: Config, db: Db, overrides: Partial<AppContext> = {}): AppContext {
  return {
    config,
    db,
    registry: new AdapterRegistry(config),
    gateway: new InventoryGateway(db, config.supplierTimeoutMs),
    now: () => new Date(),
    ...overrides,
  };
}
