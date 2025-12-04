import bcrypt from 'bcryptjs';
import { db } from '../../db.js';
import { accounts, AdminLevel } from '../../../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';

export { AdminLevel };

function generateAccountId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

export class AccountManager {
    constructor() {
        this.sessions = new Map();
        this.accountCache = new Map();
        this.clientSessions = new Map();
        console.log('[Account] Database-backed AccountManager initialized with caching');
    }

    async getAccount(username, useCache = true) {
        if (!username || typeof username !== 'string') return null;
        const usernameLower = username.toLowerCase();
        
        if (useCache && this.accountCache.has(usernameLower)) {
            return this.accountCache.get(usernameLower);
        }
        
        try {
            const [account] = await db.select().from(accounts).where(eq(accounts.username, usernameLower));
            if (account) {
                this.accountCache.set(usernameLower, account);
            }
            return account || null;
        } catch (error) {
            console.error('[Account] Error getting account:', error);
            return null;
        }
    }
    
    invalidateCache(username) {
        if (username) {
            this.accountCache.delete(username.toLowerCase());
        }
    }

    async getAccountById(accountId) {
        if (!accountId) return null;
        try {
            const [account] = await db.select().from(accounts).where(eq(accounts.accountId, accountId));
            return account || null;
        } catch (error) {
            console.error('[Account] Error getting account by ID:', error);
            return null;
        }
    }

    async createAccount(username, password, displayName = null) {
        if (!username || typeof username !== 'string') {
            return { success: false, error: 'Username is required' };
        }
        if (!password || typeof password !== 'string') {
            return { success: false, error: 'Password is required' };
        }
        
        const usernameLower = username.toLowerCase();
        
        try {
            const existing = await this.getAccount(usernameLower);
            if (existing) {
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

            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            let accountId = generateAccountId();
            let existingId = await this.getAccountById(accountId);
            while (existingId) {
                accountId = generateAccountId();
                existingId = await this.getAccountById(accountId);
            }

            const [account] = await db.insert(accounts).values({
                accountId: accountId,
                username: usernameLower,
                displayName: displayName || username,
                passwordHash: passwordHash,
                adminLevel: AdminLevel.None,
                balance: 0,
                kills: 0,
                deaths: 0,
                playTime: 0,
            }).returning();

            console.log(`[Account] Created account ${usernameLower} with ID ${accountId}`);
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

        try {
            const account = await this.getAccount(username);
            if (!account) {
                return { success: false, error: 'Account not found' };
            }

            const isValid = await bcrypt.compare(password, account.passwordHash);
            if (isValid) {
                await db.update(accounts)
                    .set({ lastLogin: new Date() })
                    .where(eq(accounts.username, username.toLowerCase()));
                
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
        if (!account) return null;
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

    async updateAccountStats(username, stats) {
        try {
            const account = await this.getAccount(username);
            if (!account) return false;

            const updates = {};
            if (typeof stats.kills === 'number') {
                updates.kills = sql`${accounts.kills} + ${stats.kills}`;
            }
            if (typeof stats.deaths === 'number') {
                updates.deaths = sql`${accounts.deaths} + ${stats.deaths}`;
            }
            if (typeof stats.playTime === 'number') {
                updates.playTime = sql`${accounts.playTime} + ${stats.playTime}`;
            }
            if (typeof stats.balance === 'number') {
                updates.balance = stats.balance;
            }

            if (Object.keys(updates).length > 0) {
                await db.update(accounts)
                    .set(updates)
                    .where(eq(accounts.username, username.toLowerCase()));
                this.invalidateCache(username);
            }
            return true;
        } catch (error) {
            console.error('[Account] Error updating stats:', error);
            return false;
        }
    }
    
    trackClientSession(playerId, username, joinedAt) {
        this.clientSessions.set(playerId, {
            username,
            joinedAt: joinedAt || Date.now(),
            loggedIn: true
        });
    }
    
    async saveClientPlayTime(playerId) {
        const session = this.clientSessions.get(playerId);
        if (session && session.loggedIn && session.username && session.joinedAt) {
            const playTime = Date.now() - session.joinedAt;
            await this.updateAccountStats(session.username, { playTime });
            this.clientSessions.delete(playerId);
        }
    }
    
    removeClientSession(playerId) {
        this.clientSessions.delete(playerId);
    }

    async setAdminLevel(username, level) {
        try {
            const account = await this.getAccount(username);
            if (!account) return false;

            if (typeof level !== 'number' || level < AdminLevel.None || level > AdminLevel.Zahre) {
                return false;
            }

            await db.update(accounts)
                .set({ adminLevel: level })
                .where(eq(accounts.username, username.toLowerCase()));
            
            this.invalidateCache(username);
            
            console.log(`[Account] Set admin level for ${username} to ${level}`);
            return true;
        } catch (error) {
            console.error('[Account] Error setting admin level:', error);
            return false;
        }
    }

    getAdminLevelName(level) {
        switch (level) {
            case AdminLevel.None: return 'Player';
            case AdminLevel.Helper: return 'Helper';
            case AdminLevel.Moderator: return 'Moderator';
            case AdminLevel.Staff: return 'Staff';
            case AdminLevel.Admin: return 'Admin';
            case AdminLevel.Owner: return 'Owner';
            case AdminLevel.Zahre: return 'Zahre';
            default: return 'Unknown';
        }
    }
}
