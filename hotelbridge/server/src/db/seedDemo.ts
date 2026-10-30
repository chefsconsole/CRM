import { loadConfig } from '../config.js';
import { connect } from './connect.js';
import { DEMO_PASSWORD, DEMO_USERS, seedDemo } from './demoData.js';

const config = loadConfig();
if (config.isProduction) {
  console.error('Refusing to load demo data into a production environment.');
  process.exit(1);
}
const db = await connect(config);
const { seeded } = await seedDemo(db);
console.log(seeded ? 'Demo data loaded (sample hotels and agencies — not real partners or rates).' : 'Demo data already present.');
console.log(`Demo password for all demo users: ${DEMO_PASSWORD}`);
console.table(DEMO_USERS);
await db.close();
