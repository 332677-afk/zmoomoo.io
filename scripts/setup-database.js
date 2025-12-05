import pg from 'pg';
const { Pool } = pg;

const setupDatabase = async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  console.log('Setting up ZMOOMOO.io database...');

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        account_id VARCHAR(16) UNIQUE NOT NULL,
        username VARCHAR(16) UNIQUE NOT NULL,
        display_name VARCHAR(30) NOT NULL,
        password_hash TEXT NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        reset_token VARCHAR(255),
        reset_token_expires_at TIMESTAMP,
        admin_level INTEGER DEFAULT 0 NOT NULL,
        balance INTEGER DEFAULT 0 NOT NULL,
        kills INTEGER DEFAULT 0 NOT NULL,
        deaths INTEGER DEFAULT 0 NOT NULL,
        play_time BIGINT DEFAULT 0 NOT NULL,
        score INTEGER DEFAULT 0 NOT NULL,
        highest_score INTEGER DEFAULT 0 NOT NULL,
        tribes_created INTEGER DEFAULT 0 NOT NULL,
        current_tribe VARCHAR(30),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        last_login TIMESTAMP,
        ip_address VARCHAR(45)
      );
    `);

    console.log('Accounts table created successfully!');
    console.log('Database setup complete.');
  } catch (error) {
    console.error('Database setup error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

setupDatabase();
