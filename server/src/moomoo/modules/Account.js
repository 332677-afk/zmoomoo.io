import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const AdminLevel = {
    None: 0,
    Helper: 1,
    Moderator: 2,
    Staff: 3,
    Admin: 4,
    Owner: 5
};

export class AccountManager {
    constructor() {
        this.accounts = new Map();
        this.sessions = new Map();
        this.accountsFilePath = path.resolve(__dirname, '../../../data/accounts.json');
        this.loadAccounts();
    }

    loadAccounts() {
        try {
            if (fs.existsSync(this.accountsFilePath)) {
                const data = fs.readFileSync(this.accountsFilePath, 'utf8');
                const accountsObject = JSON.parse(data);
                for (const [username, account] of Object.entries(accountsObject)) {
                    this.accounts.set(username.toLowerCase(), account);
                }
                console.log(`[Account] Loaded ${this.accounts.size} accounts from disk`);
            }
        } catch (error) {
            console.error('[Account] Error loading accounts:', error);
        }
    }

    saveAccounts() {
        try {
            const accountsObject = {};
            for (const [username, account] of this.accounts.entries()) {
                accountsObject[username] = account;
            }
            
            const dir = path.dirname(this.accountsFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(this.accountsFilePath, JSON.stringify(accountsObject, null, 2));
            console.log(`[Account] Saved ${this.accounts.size} accounts to disk`);
        } catch (error) {
            console.error('[Account] Error saving accounts:', error);
        }
    }

    getAccount(username) {
        if (!username || typeof username !== 'string') return null;
        return this.accounts.get(username.toLowerCase()) || null;
    }

    setAccount(username, account) {
        if (!username || typeof username !== 'string') return false;
        this.accounts.set(username.toLowerCase(), account);
        this.saveAccounts();
        return true;
    }

    async createAccount(username, password, displayName = null) {
        if (!username || typeof username !== 'string') {
            return { success: false, error: 'Username is required' };
        }
        if (!password || typeof password !== 'string') {
            return { success: false, error: 'Password is required' };
        }
        
        const usernameLower = username.toLowerCase();
        
        if (this.accounts.has(usernameLower)) {
            return { success: false, error: 'Username already exists' };
        }

        if (username.length < 4 || username.length > 16) {
            return { success: false, error: 'Username must be 4-16 characters' };
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return { success: false, error: 'Username can only contain letters, numbers, and underscores' };
        }

        if (password.length < 8 || password.length > 30) {
            return { success: false, error: 'Password must be 8-30 characters' };
        }

        try {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            const account = {
                username: username,
                displayName: displayName || username,
                passwordHash: passwordHash,
                adminLevel: AdminLevel.None,
                balance: 0,
                kills: 0,
                deaths: 0,
                playTime: 0,
                createdAt: Date.now()
            };

            this.accounts.set(usernameLower, account);
            this.saveAccounts();

            return { success: true, account: this.sanitizeAccount(account) };
        } catch (error) {
            console.error('[Account] Error creating account:', error);
            return { success: false, error: 'Failed to create account' };
        }
    }

    async validatePassword(username, password) {
        if (!username || typeof username !== 'string') {
            return { success: false, error: 'Username is required' };
        }
        if (!password || typeof password !== 'string') {
            return { success: false, error: 'Password is required' };
        }

        const account = this.getAccount(username);
        if (!account) {
            return { success: false, error: 'Account not found' };
        }

        try {
            const isValid = await bcrypt.compare(password, account.passwordHash);
            if (isValid) {
                return { success: true, account: this.sanitizeAccount(account) };
            } else {
                return { success: false, error: 'Invalid password' };
            }
        } catch (error) {
            console.error('[Account] Error validating password:', error);
            return { success: false, error: 'Failed to validate password' };
        }
    }

    sanitizeAccount(account) {
        const { passwordHash, ...sanitized } = account;
        return sanitized;
    }

    getSessionCount(username) {
        if (!username) return 0;
        const usernameLower = username.toLowerCase();
        return this.sessions.get(usernameLower) || 0;
    }

    addSession(username) {
        if (!username) return false;
        const usernameLower = username.toLowerCase();
        const current = this.sessions.get(usernameLower) || 0;
        this.sessions.set(usernameLower, current + 1);
        return true;
    }

    removeSession(username) {
        if (!username) return false;
        const usernameLower = username.toLowerCase();
        const current = this.sessions.get(usernameLower) || 0;
        if (current > 0) {
            this.sessions.set(usernameLower, current - 1);
        }
        return true;
    }

    canCreateSession(username) {
        const count = this.getSessionCount(username);
        return count < 2;
    }

    updateAccountStats(username, stats) {
        const account = this.getAccount(username);
        if (!account) return false;

        if (typeof stats.kills === 'number') {
            account.kills += stats.kills;
        }
        if (typeof stats.deaths === 'number') {
            account.deaths += stats.deaths;
        }
        if (typeof stats.playTime === 'number') {
            account.playTime += stats.playTime;
        }
        if (typeof stats.balance === 'number') {
            account.balance = stats.balance;
        }

        this.setAccount(username, account);
        return true;
    }

    setAdminLevel(username, level) {
        const account = this.getAccount(username);
        if (!account) return false;

        if (typeof level !== 'number' || level < AdminLevel.None || level > AdminLevel.Owner) {
            return false;
        }

        account.adminLevel = level;
        this.setAccount(username, account);
        return true;
    }
}
