import type { InventoryAdapter } from '../types.js';
import { SupplierError } from '../types.js';

/**
 * Integration boundary for a third-party B2B supplier that has NOT been connected. These are
 * candidates to evaluate commercially — not partners. Nothing here pretends to work: every
 * operation fails with `not_configured` until a real adapter is implemented against the supplier's
 * certified API, with credentials provided via the environment / secrets manager.
 */
export function unconnectedAdapter(code: string, name: string, envVars: string[], env: NodeJS.ProcessEnv): InventoryAdapter {
  const missing = envVars.filter((v) => !env[v]);
  const notConfigured = async (): Promise<never> => {
    throw new SupplierError('not_configured', `${name} is not connected.`);
  };
  return {
    code, name, kind: 'third_party',
    // Capabilities are confirmed during integration & certification; none are claimed until then.
    capabilities: { search: false, content: false, revalidate: false, book: false, retrieve: false, cancel: false, amend: false, instantConfirmation: false, idempotentBooking: false },
    status: () => ({
      configured: false,
      environment: 'not_connected',
      label: 'Not connected',
      missing: [
        'Signed commercial agreement permitting onward B2B distribution',
        'API certification with the supplier',
        ...missing.map((v) => `Environment variable ${v}`),
        'Adapter implementation mapping responses to the HotelBridge inventory model',
      ],
    }),
    search: notConfigured, revalidate: notConfigured, book: notConfigured, retrieve: notConfigured, cancel: notConfigured,
  };
}
