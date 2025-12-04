import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

async function setupZahreAccount() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        const username = 'zahre';
        const newPassword = 'sometHinng5678923232123';
        const adminLevel = 6;
        
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(newPassword, salt);
        
        const existingResult = await pool.query(
            'SELECT * FROM accounts WHERE username = $1',
            [username]
        );
        
        if (existingResult.rows.length > 0) {
            await pool.query(
                'UPDATE accounts SET password_hash = $1 WHERE username = $2',
                [passwordHash, username]
            );
            console.log(`Password updated for account: ${username}`);
        } else {
            const accountId = 'ZAHRE001';
            await pool.query(
                `INSERT INTO accounts (account_id, username, display_name, password_hash, admin_level, balance, kills, deaths, play_time, score, highest_score, tribes_created, current_tribe)
                 VALUES ($1, $2, $3, $4, $5, 0, 0, 0, 0, 0, 0, 0, NULL)`,
                [accountId, username, 'Zahre', passwordHash, adminLevel]
            );
            console.log(`Created new account: ${username} with admin level ${adminLevel}`);
        }
        
        console.log('Zahre account setup complete!');
    } catch (error) {
        console.error('Error setting up Zahre account:', error);
    } finally {
        await pool.end();
    }
}

setupZahreAccount();
