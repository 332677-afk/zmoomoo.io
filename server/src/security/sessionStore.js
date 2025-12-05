import crypto from 'node:crypto';

const DEFAULT_IDLE_TIMEOUT = 30 * 60 * 1000;
const DEFAULT_ABSOLUTE_TIMEOUT = 24 * 60 * 60 * 1000;

class SessionStore {
    constructor(options = {}) {
        this.sessions = new Map();
        this.idleTimeout = options.idleTimeout || DEFAULT_IDLE_TIMEOUT;
        this.absoluteTimeout = options.absoluteTimeout || DEFAULT_ABSOLUTE_TIMEOUT;
        this.userSessionMap = new Map();
        this.userWebSocketMap = new Map();
        
        console.log(`[SessionStore] Initialized with idle timeout: ${this.idleTimeout / 1000}s, absolute timeout: ${this.absoluteTimeout / 1000}s`);
    }

    createSession(userId) {
        if (!userId) {
            return { success: false, error: 'User ID is required' };
        }

        const token = crypto.randomUUID();
        const now = Date.now();
        
        const session = {
            token,
            userId,
            createdAt: now,
            lastActivity: now,
            expiresAt: now + this.absoluteTimeout
        };
        
        this.sessions.set(token, session);
        
        if (!this.userSessionMap.has(userId)) {
            this.userSessionMap.set(userId, new Set());
        }
        this.userSessionMap.get(userId).add(token);
        
        console.log(`[SessionStore] Created session for user ${userId}, token: ${token.substring(0, 8)}...`);
        
        return { 
            success: true, 
            token,
            expiresAt: session.expiresAt
        };
    }

    validateSession(token) {
        if (!token) {
            return { valid: false, reason: 'No token provided' };
        }
        
        const session = this.sessions.get(token);
        
        if (!session) {
            return { valid: false, reason: 'Session not found' };
        }
        
        const now = Date.now();
        
        if (now > session.expiresAt) {
            this.invalidateSession(token);
            return { valid: false, reason: 'Session expired (absolute timeout)' };
        }
        
        const idleTime = now - session.lastActivity;
        if (idleTime > this.idleTimeout) {
            this.invalidateSession(token);
            return { valid: false, reason: 'Session expired (idle timeout)' };
        }
        
        return { 
            valid: true, 
            session: {
                userId: session.userId,
                createdAt: session.createdAt,
                lastActivity: session.lastActivity,
                expiresAt: session.expiresAt
            }
        };
    }

    refreshSession(token) {
        if (!token) {
            return { success: false, error: 'No token provided' };
        }
        
        const session = this.sessions.get(token);
        
        if (!session) {
            return { success: false, error: 'Session not found' };
        }
        
        const now = Date.now();
        
        if (now > session.expiresAt) {
            this.invalidateSession(token);
            return { success: false, error: 'Session expired (absolute timeout)' };
        }
        
        const idleTime = now - session.lastActivity;
        if (idleTime > this.idleTimeout) {
            this.invalidateSession(token);
            return { success: false, error: 'Session expired (idle timeout)' };
        }
        
        session.lastActivity = now;
        
        return { 
            success: true,
            session: {
                userId: session.userId,
                lastActivity: session.lastActivity,
                expiresAt: session.expiresAt
            }
        };
    }

    invalidateSession(token) {
        if (!token) {
            return { success: false, error: 'No token provided' };
        }
        
        const session = this.sessions.get(token);
        
        if (!session) {
            return { success: false, error: 'Session not found' };
        }
        
        const userId = session.userId;
        
        this.sessions.delete(token);
        
        if (this.userSessionMap.has(userId)) {
            this.userSessionMap.get(userId).delete(token);
            if (this.userSessionMap.get(userId).size === 0) {
                this.userSessionMap.delete(userId);
            }
        }
        
        console.log(`[SessionStore] Invalidated session for user ${userId}, token: ${token.substring(0, 8)}...`);
        
        return { success: true };
    }

    invalidateUserSessions(userId) {
        if (!userId) {
            return { success: false, error: 'User ID is required' };
        }
        
        const userSessions = this.userSessionMap.get(userId);
        
        if (!userSessions || userSessions.size === 0) {
            return { success: true, count: 0 };
        }
        
        let count = 0;
        for (const token of userSessions) {
            this.sessions.delete(token);
            count++;
        }
        
        this.userSessionMap.delete(userId);
        
        console.log(`[SessionStore] Invalidated ${count} sessions for user ${userId}`);
        
        return { success: true, count };
    }

    cleanupExpiredSessions() {
        const now = Date.now();
        let cleanedCount = 0;
        const expiredTokens = [];
        
        for (const [token, session] of this.sessions.entries()) {
            const isAbsoluteExpired = now > session.expiresAt;
            const isIdleExpired = (now - session.lastActivity) > this.idleTimeout;
            
            if (isAbsoluteExpired || isIdleExpired) {
                expiredTokens.push({ token, userId: session.userId });
            }
        }
        
        for (const { token, userId } of expiredTokens) {
            this.sessions.delete(token);
            
            if (this.userSessionMap.has(userId)) {
                this.userSessionMap.get(userId).delete(token);
                if (this.userSessionMap.get(userId).size === 0) {
                    this.userSessionMap.delete(userId);
                }
            }
            
            cleanedCount++;
        }
        
        if (cleanedCount > 0) {
            console.log(`[SessionStore] Cleaned up ${cleanedCount} expired sessions`);
        }
        
        return { 
            success: true, 
            cleanedCount,
            remainingSessions: this.sessions.size
        };
    }

    getSessionByToken(token) {
        return this.sessions.get(token) || null;
    }

    getUserSessions(userId) {
        const tokens = this.userSessionMap.get(userId);
        if (!tokens) return [];
        
        return Array.from(tokens).map(token => {
            const session = this.sessions.get(token);
            if (!session) return null;
            return {
                token: token.substring(0, 8) + '...',
                createdAt: session.createdAt,
                lastActivity: session.lastActivity,
                expiresAt: session.expiresAt
            };
        }).filter(Boolean);
    }
    
    getSessionCountForUser(userId) {
        if (!userId) return 0;
        const tokens = this.userSessionMap.get(userId);
        return tokens ? tokens.size : 0;
    }
    
    getAllUserSessions(userId) {
        if (!userId) return [];
        const tokens = this.userSessionMap.get(userId);
        if (!tokens) return [];
        
        return Array.from(tokens).map(token => {
            const session = this.sessions.get(token);
            if (!session) return null;
            return {
                token: token,
                createdAt: session.createdAt,
                lastActivity: session.lastActivity,
                expiresAt: session.expiresAt
            };
        }).filter(Boolean);
    }

    getStats() {
        return {
            totalSessions: this.sessions.size,
            totalUsers: this.userSessionMap.size,
            idleTimeoutMs: this.idleTimeout,
            absoluteTimeoutMs: this.absoluteTimeout
        };
    }
    
    registerWebSocket(userId, socket, playerId = null) {
        if (!userId || !socket) return;
        
        if (!this.userWebSocketMap.has(userId)) {
            this.userWebSocketMap.set(userId, new Map());
        }
        
        const socketId = playerId || `socket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.userWebSocketMap.get(userId).set(socketId, socket);
        
        console.log(`[SessionStore] Registered WebSocket for user ${userId}, socket ID: ${socketId}`);
        return socketId;
    }
    
    unregisterWebSocket(userId, socketId) {
        if (!userId || !socketId) return;
        
        const userSockets = this.userWebSocketMap.get(userId);
        if (userSockets) {
            userSockets.delete(socketId);
            if (userSockets.size === 0) {
                this.userWebSocketMap.delete(userId);
            }
        }
    }
    
    getUserWebSockets(userId) {
        if (!userId) return [];
        
        const userSockets = this.userWebSocketMap.get(userId);
        if (!userSockets) return [];
        
        return Array.from(userSockets.entries()).map(([socketId, socket]) => ({
            socketId,
            socket,
            isOpen: socket && socket.readyState === 1
        }));
    }
    
    closeAllUserWebSockets(userId, closeCode = 4011, encodedMessage = null) {
        if (!userId) return { success: false, closedCount: 0 };
        
        const userSockets = this.userWebSocketMap.get(userId);
        if (!userSockets) return { success: true, closedCount: 0 };
        
        let closedCount = 0;
        for (const [socketId, socket] of userSockets.entries()) {
            try {
                if (socket && socket.readyState === 1) {
                    if (encodedMessage) {
                        socket.send(encodedMessage);
                    }
                    setTimeout(() => {
                        try { socket.close(closeCode); } catch(e) {}
                    }, 100);
                    closedCount++;
                }
            } catch(e) {
                console.error(`[SessionStore] Error closing socket ${socketId}:`, e);
            }
        }
        
        this.userWebSocketMap.delete(userId);
        
        console.log(`[SessionStore] Closed ${closedCount} WebSocket(s) for user ${userId}`);
        return { success: true, closedCount };
    }
}

export const sessionStore = new SessionStore();

export { SessionStore };
