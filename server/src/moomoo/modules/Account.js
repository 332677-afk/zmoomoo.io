import bcrypt from 'bcryptjs';
import { db } from '../../db.js';
import { accounts, AdminLevel } from '../../../../shared/schema.js';
import { eq, sql, desc } from 'drizzle-orm';
import { sessionStore } from '../../security/sessionStore.js';

export { AdminLevel };
export { sessionStore };

const PRESERVED_ACCOUNT_IDS = {
    'zahre': 'XUJP2NIB'
};

function generateAccountId(username = null) {
    if (username && PRESERVED_ACCOUNT_IDS[username.toLowerCase()]) {
        return PRESERVED_ACCOUNT_IDS[username.toLowerCase()];
    }
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

            const salt = await bcrypt.genSalt(12);
            const passwordHash = await bcrypt.hash(password, salt);

            let accountId = generateAccountId(username);
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
                score: 0,
                highestScore: 0,
                tribesCreated: 0,
                currentTribe: null,
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
            const account = await this.getAccount(username, false);
            if (!account) {
                return { success: false, error: 'Account not found' };
            }

            const isValid = await bcrypt.compare(password, account.passwordHash);
            if (isValid) {
                await db.update(accounts)
                    .set({ lastLogin: new Date() })
                    .where(eq(accounts.username, username.toLowerCase()));
                
                this.invalidateCache(username);
                
                const sessionResult = sessionStore.createSession(account.accountId);
                
                return { 
                    success: true, 
                    account: this.sanitizeAccount(account),
                    sessionToken: sessionResult.success ? sessionResult.token : null,
                    sessionExpiresAt: sessionResult.success ? sessionResult.expiresAt : null
                };
            } else {
                return { success: false, error: 'Invalid password' };
            }
        } catch (error) {
            console.error('[Account] Error validating password:', error);
            return { success: false, error: 'Failed to validate password' };
        }
    }
    
    checkSession(token) {
        return sessionStore.validateSession(token);
    }
    
    refreshSession(token) {
        return sessionStore.refreshSession(token);
    }
    
    invalidateSessionToken(token) {
        return sessionStore.invalidateSession(token);
    }
    
    invalidateAllUserSessions(userId) {
        return sessionStore.invalidateUserSessions(userId);
    }

    sanitizeAccount(account) {
        if (!account) return null;
        const { passwordHash, ipAddress, ...sanitized } = account;
        sanitized.rankName = this.getAdminLevelName(account.adminLevel);
        sanitized.isStaff = account.adminLevel >= AdminLevel.Helper;
        sanitized.isAdmin = account.adminLevel >= AdminLevel.Admin;
        sanitized.formattedPlayTime = this.formatPlayTime(account.playTime || 0);
        sanitized.formattedCreatedAt = account.createdAt ? new Date(account.createdAt).toLocaleDateString() : 'Unknown';
        return sanitized;
    }
    
    formatPlayTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
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
            
            if (typeof stats.kills === 'number' && stats.kills > 0) {
                updates.kills = sql`${accounts.kills} + ${stats.kills}`;
            }
            if (typeof stats.deaths === 'number' && stats.deaths > 0) {
                updates.deaths = sql`${accounts.deaths} + ${stats.deaths}`;
            }
            if (typeof stats.playTime === 'number' && stats.playTime > 0) {
                updates.playTime = sql`${accounts.playTime} + ${stats.playTime}`;
            }
            if (typeof stats.balance === 'number') {
                updates.balance = stats.balance;
            }
            if (typeof stats.score === 'number') {
                updates.score = stats.score;
                if (stats.score > (account.highestScore || 0)) {
                    updates.highestScore = stats.score;
                }
            }
            if (typeof stats.tribesCreated === 'number' && stats.tribesCreated > 0) {
                updates.tribesCreated = sql`${accounts.tribesCreated} + ${stats.tribesCreated}`;
            }
            if (stats.currentTribe !== undefined) {
                updates.currentTribe = stats.currentTribe;
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
    
    async updateHighestScore(username, score) {
        try {
            const account = await this.getAccount(username);
            if (!account) return false;
            
            if (score > (account.highestScore || 0)) {
                await db.update(accounts)
                    .set({ highestScore: score })
                    .where(eq(accounts.username, username.toLowerCase()));
                this.invalidateCache(username);
                return true;
            }
            return false;
        } catch (error) {
            console.error('[Account] Error updating highest score:', error);
            return false;
        }
    }
    
    async incrementTribesCreated(username) {
        try {
            await db.update(accounts)
                .set({ tribesCreated: sql`${accounts.tribesCreated} + 1` })
                .where(eq(accounts.username, username.toLowerCase()));
            this.invalidateCache(username);
            return true;
        } catch (error) {
            console.error('[Account] Error incrementing tribes created:', error);
            return false;
        }
    }
    
    async updateCurrentTribe(username, tribeName) {
        try {
            await db.update(accounts)
                .set({ currentTribe: tribeName })
                .where(eq(accounts.username, username.toLowerCase()));
            this.invalidateCache(username);
            return true;
        } catch (error) {
            console.error('[Account] Error updating current tribe:', error);
            return false;
        }
    }
    
    trackClientSession(playerId, username, joinedAt) {
        this.clientSessions.set(playerId, {
            username,
            joinedAt: joinedAt || Date.now(),
            loggedIn: true,
            kills: 0,
            deaths: 0,
            score: 0
        });
    }
    
    updateClientSessionStats(playerId, stats) {
        const session = this.clientSessions.get(playerId);
        if (session) {
            if (typeof stats.kills === 'number') session.kills += stats.kills;
            if (typeof stats.deaths === 'number') session.deaths += stats.deaths;
            if (typeof stats.score === 'number') session.score = Math.max(session.score, stats.score);
        }
    }
    
    async saveClientPlayTime(playerId) {
        const session = this.clientSessions.get(playerId);
        if (session && session.loggedIn && session.username && session.joinedAt) {
            const playTime = Date.now() - session.joinedAt;
            await this.updateAccountStats(session.username, { 
                playTime,
                kills: session.kills || 0,
                deaths: session.deaths || 0
            });
            
            if (session.score > 0) {
                await this.updateHighestScore(session.username, session.score);
            }
            
            this.clientSessions.delete(playerId);
        }
    }
    
    removeClientSession(playerId) {
        this.clientSessions.delete(playerId);
    }
    
    shouldAutoGrantAdmin(account) {
        if (!account) return { isAdmin: false, adminLevel: null };
        
        if (account.adminLevel >= AdminLevel.Helper) {
            return {
                isAdmin: true,
                adminLevel: account.adminLevel >= AdminLevel.Admin ? 'full' : 'limited',
                adminLevelValue: account.adminLevel
            };
        }
        
        return { isAdmin: false, adminLevel: null };
    }

    async updatePassword(username, newPassword) {
        if (!username || typeof username !== 'string') {
            return { success: false, error: 'Username is required' };
        }
        if (!newPassword || typeof newPassword !== 'string') {
            return { success: false, error: 'Password is required' };
        }
        if (newPassword.length < 8 || newPassword.length > 30) {
            return { success: false, error: 'Password must be 8-30 characters' };
        }

        try {
            const account = await this.getAccount(username);
            if (!account) {
                return { success: false, error: 'Account not found' };
            }

            const salt = await bcrypt.genSalt(12);
            const passwordHash = await bcrypt.hash(newPassword, salt);

            await db.update(accounts)
                .set({ passwordHash: passwordHash })
                .where(eq(accounts.username, username.toLowerCase()));
            
            this.invalidateCache(username);
            
            console.log(`[Account] Password updated for ${username}`);
            return { success: true };
        } catch (error) {
            console.error('[Account] Error updating password:', error);
            return { success: false, error: 'Failed to update password' };
        }
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
    
    async setAdminLevelById(accountId, level) {
        try {
            const account = await this.getAccountById(accountId);
            if (!account) return false;

            if (typeof level !== 'number' || level < AdminLevel.None || level > AdminLevel.Zahre) {
                return false;
            }

            await db.update(accounts)
                .set({ adminLevel: level })
                .where(eq(accounts.accountId, accountId));
            
            this.invalidateCache(account.username);
            
            console.log(`[Account] Set admin level for account ID ${accountId} to ${level}`);
            return true;
        } catch (error) {
            console.error('[Account] Error setting admin level by ID:', error);
            return false;
        }
    }
    
    async refreshAccountData(username) {
        this.invalidateCache(username);
        const account = await this.getAccount(username, false);
        return account ? this.sanitizeAccount(account) : null;
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
