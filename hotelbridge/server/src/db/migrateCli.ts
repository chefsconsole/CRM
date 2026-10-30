import { loadConfig } from '../config.js';
import { connect } from './connect.js';

const db = await connect(loadConfig());
console.log('Database is up to date.');
await db.close();
