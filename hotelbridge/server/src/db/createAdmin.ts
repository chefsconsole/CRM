import { loadConfig } from '../config.js';
import { connect } from './connect.js';
import { hashPassword, passwordProblem } from '../modules/auth/passwords.js';

/**
 * Bootstrap the first HotelBridge administrator. The password is read from the environment
 * (never from argv, which leaks into shell history and process lists). Refuses to run if an admin exists.
 *   ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run create-admin
 */
const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD.');
  process.exit(1);
}
const problem = passwordProblem(ADMIN_PASSWORD);
if (problem) { console.error(`Password rejected: ${problem}`); process.exit(1); }
const db = await connect(loadConfig());
const existing = await db.one(`SELECT 1 FROM users WHERE role = 'hb_admin' LIMIT 1`);
if (existing) {
  console.error('An administrator already exists. Create further staff from the console (Team).');
  await db.close();
  process.exit(1);
}
await db.query(`INSERT INTO users (email, name, password_hash, role) VALUES ($1,$2,$3,'hb_admin')`, [ADMIN_EMAIL.toLowerCase(), ADMIN_NAME, await hashPassword(ADMIN_PASSWORD)]);
console.log(`Administrator ${ADMIN_EMAIL} created.`);
await db.close();
