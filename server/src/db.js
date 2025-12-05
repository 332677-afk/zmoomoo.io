import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../shared/schema.js";

const { Pool } = pg;

export let pool = null;
export let db = null;
export let isDatabaseConnected = false;

function getConnectionConfig() {
    if (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) {
        return {
            host: process.env.PGHOST,
            port: parseInt(process.env.PGPORT || '5432'),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD || '',
            database: process.env.PGDATABASE,
            ssl: false,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        };
    }
    
    if (process.env.DATABASE_URL) {
        return { 
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        };
    }
    
    return null;
}

const connectionConfig = getConnectionConfig();

if (connectionConfig) {
    try {
        pool = new Pool(connectionConfig);
        db = drizzle(pool, { schema });
        
        pool.on('error', (err) => {
            console.error('[Database] Pool error:', err.message);
        });
        
        pool.query('SELECT 1').then(() => {
            isDatabaseConnected = true;
            console.log('[Database] Successfully connected to PostgreSQL');
        }).catch((err) => {
            console.warn('[Database] Connection test failed:', err.message);
            console.log('[Database] Server will run in guest-only mode (no account persistence)');
        });
    } catch (error) {
        console.warn('[Database] Failed to initialize:', error.message);
        console.log('[Database] Server will run in guest-only mode (no account persistence)');
    }
} else {
    console.log('[Database] No database configuration found');
    console.log('[Database] Server will run in guest-only mode (no account persistence)');
    console.log('[Database] To enable accounts, provision a PostgreSQL database');
}
