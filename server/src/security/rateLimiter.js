const DEFAULT_BUCKET_SIZE = 60;
const DEFAULT_REFILL_RATE = 30;
const CLEANUP_INTERVAL = 60000;
const VIOLATION_DECAY_TIME = 30000;

const OPCODE_LIMITS = {
    '9': { bucketSize: 60, refillRate: 30, name: 'movement' },
    'D': { bucketSize: 60, refillRate: 30, name: 'direction' },
    'F': { bucketSize: 20, refillRate: 10, name: 'attack' },
    'K': { bucketSize: 10, refillRate: 5, name: 'autoGather' },
    'z': { bucketSize: 30, refillRate: 15, name: 'selectItem' },
    'c': { bucketSize: 20, refillRate: 10, name: 'store' },
    'H': { bucketSize: 10, refillRate: 5, name: 'upgrade' },
    '6': { bucketSize: 10, refillRate: 5, name: 'chat' },
    '0': { bucketSize: 5, refillRate: 2, name: 'ping' },
    'p': { bucketSize: 10, refillRate: 5, name: 'perfData' },
    'M': { bucketSize: 5, refillRate: 1, name: 'spawn' },
    'L': { bucketSize: 5, refillRate: 2, name: 'createClan' },
    'N': { bucketSize: 10, refillRate: 5, name: 'leaveClan' },
    'b': { bucketSize: 10, refillRate: 5, name: 'joinClanRequest' },
    'P': { bucketSize: 15, refillRate: 8, name: 'clanManage' },
    'S': { bucketSize: 5, refillRate: 1, name: 'mapPing' },
    'e': { bucketSize: 30, refillRate: 15, name: 'resetMove' },
    'TP': { bucketSize: 10, refillRate: 5, name: 'teleport' },
    'AUTH': { bucketSize: 5, refillRate: 1, name: 'auth' },
    'REGISTER': { bucketSize: 3, refillRate: 0.5, name: 'register' },
    'CREATE_PARTY': { bucketSize: 5, refillRate: 2, name: 'createParty' },
    'JOIN_PARTY': { bucketSize: 10, refillRate: 5, name: 'joinParty' }
};

const ESCALATION_THRESHOLDS = {
    WARNING: 5,
    FREEZE: 15,
    DISCONNECT: 30,
    BAN: 50
};

const ESCALATION_LEVELS = {
    NONE: 0,
    WARNING: 1,
    FREEZE: 2,
    DISCONNECT: 3,
    BAN: 4
};

const FREEZE_DURATION = 5000;
const BAN_DURATION = 300000;

class TokenBucket {
    constructor(maxTokens, refillRate) {
        this.maxTokens = maxTokens;
        this.tokens = maxTokens;
        this.refillRate = refillRate;
        this.lastRefill = Date.now();
    }

    refill() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
        this.lastRefill = now;
    }

    consume(amount = 1) {
        this.refill();
        if (this.tokens >= amount) {
            this.tokens -= amount;
            return true;
        }
        return false;
    }

    getTokens() {
        this.refill();
        return this.tokens;
    }
}

class PlayerRateLimitState {
    constructor(playerId, ipAddress) {
        this.playerId = playerId;
        this.ipAddress = ipAddress;
        this.buckets = new Map();
        this.violations = 0;
        this.lastViolation = 0;
        this.escalationLevel = ESCALATION_LEVELS.NONE;
        this.freezeUntil = 0;
        this.bannedUntil = 0;
        this.createdAt = Date.now();
        this.lastActivity = Date.now();
    }

    getBucket(opcode) {
        if (!this.buckets.has(opcode)) {
            const config = OPCODE_LIMITS[opcode] || { 
                bucketSize: DEFAULT_BUCKET_SIZE, 
                refillRate: DEFAULT_REFILL_RATE 
            };
            this.buckets.set(opcode, new TokenBucket(config.bucketSize, config.refillRate));
        }
        return this.buckets.get(opcode);
    }

    addViolation() {
        const now = Date.now();
        
        if (now - this.lastViolation > VIOLATION_DECAY_TIME) {
            this.violations = Math.max(0, this.violations - 1);
        }
        
        this.violations++;
        this.lastViolation = now;
        
        if (this.violations >= ESCALATION_THRESHOLDS.BAN) {
            this.escalationLevel = ESCALATION_LEVELS.BAN;
            this.bannedUntil = now + BAN_DURATION;
        } else if (this.violations >= ESCALATION_THRESHOLDS.DISCONNECT) {
            this.escalationLevel = ESCALATION_LEVELS.DISCONNECT;
        } else if (this.violations >= ESCALATION_THRESHOLDS.FREEZE) {
            this.escalationLevel = ESCALATION_LEVELS.FREEZE;
            this.freezeUntil = now + FREEZE_DURATION;
        } else if (this.violations >= ESCALATION_THRESHOLDS.WARNING) {
            this.escalationLevel = ESCALATION_LEVELS.WARNING;
        }
        
        return this.escalationLevel;
    }

    isFrozen() {
        return Date.now() < this.freezeUntil;
    }

    isBanned() {
        return Date.now() < this.bannedUntil;
    }

    decayViolations() {
        const now = Date.now();
        if (now - this.lastViolation > VIOLATION_DECAY_TIME * 2) {
            this.violations = Math.max(0, this.violations - 1);
            this.lastViolation = now;
            
            if (this.violations < ESCALATION_THRESHOLDS.WARNING) {
                this.escalationLevel = ESCALATION_LEVELS.NONE;
            } else if (this.violations < ESCALATION_THRESHOLDS.FREEZE) {
                this.escalationLevel = ESCALATION_LEVELS.WARNING;
            }
        }
    }
}

export class RateLimiter {
    constructor() {
        this.players = new Map();
        this.ipBans = new Map();
        this.stats = {
            totalChecks: 0,
            allowed: 0,
            blocked: 0,
            byOpcode: {}
        };

        this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
    }

    getPlayerState(playerId, ipAddress) {
        if (!this.players.has(playerId)) {
            this.players.set(playerId, new PlayerRateLimitState(playerId, ipAddress));
        }
        const state = this.players.get(playerId);
        state.lastActivity = Date.now();
        return state;
    }

    checkLimit(playerId, ipAddress, opcode) {
        this.stats.totalChecks++;
        
        if (!this.stats.byOpcode[opcode]) {
            this.stats.byOpcode[opcode] = { allowed: 0, blocked: 0 };
        }

        if (this.ipBans.has(ipAddress)) {
            const banEnd = this.ipBans.get(ipAddress);
            if (Date.now() < banEnd) {
                this.stats.blocked++;
                this.stats.byOpcode[opcode].blocked++;
                return {
                    allowed: false,
                    reason: 'IP banned',
                    action: 'ban',
                    banExpires: banEnd
                };
            } else {
                this.ipBans.delete(ipAddress);
            }
        }

        const state = this.getPlayerState(playerId, ipAddress);

        if (state.isBanned()) {
            this.stats.blocked++;
            this.stats.byOpcode[opcode].blocked++;
            return {
                allowed: false,
                reason: 'Player banned',
                action: 'ban',
                banExpires: state.bannedUntil
            };
        }

        if (state.isFrozen()) {
            this.stats.blocked++;
            this.stats.byOpcode[opcode].blocked++;
            return {
                allowed: false,
                reason: 'Player frozen',
                action: 'freeze',
                freezeExpires: state.freezeUntil
            };
        }

        state.decayViolations();

        const bucket = state.getBucket(opcode);
        const consumed = bucket.consume(1);

        if (consumed) {
            this.stats.allowed++;
            this.stats.byOpcode[opcode].allowed++;
            return {
                allowed: true,
                tokensRemaining: bucket.getTokens()
            };
        }

        this.stats.blocked++;
        this.stats.byOpcode[opcode].blocked++;

        const escalationLevel = state.addViolation();
        const opcodeName = OPCODE_LIMITS[opcode]?.name || opcode;

        this.logRateLimitViolation(playerId, ipAddress, opcode, escalationLevel, state.violations);

        let action = 'blocked';
        let message = `Rate limit exceeded for ${opcodeName}`;

        switch (escalationLevel) {
            case ESCALATION_LEVELS.BAN:
                action = 'ban';
                message = 'Excessive violations - player banned';
                this.ipBans.set(ipAddress, state.bannedUntil);
                break;
            case ESCALATION_LEVELS.DISCONNECT:
                action = 'disconnect';
                message = 'Too many violations - disconnecting player';
                break;
            case ESCALATION_LEVELS.FREEZE:
                action = 'freeze';
                message = `Too many violations - player frozen for ${FREEZE_DURATION / 1000}s`;
                break;
            case ESCALATION_LEVELS.WARNING:
                action = 'warning';
                message = 'Rate limit warning - slow down';
                break;
        }

        return {
            allowed: false,
            reason: message,
            action,
            escalationLevel,
            violations: state.violations,
            tokensRemaining: bucket.getTokens()
        };
    }

    logRateLimitViolation(playerId, ipAddress, opcode, escalationLevel, violations) {
        const timestamp = new Date().toISOString();
        const levelName = Object.keys(ESCALATION_LEVELS).find(
            key => ESCALATION_LEVELS[key] === escalationLevel
        ) || 'UNKNOWN';
        
        console.warn(
            `[RateLimiter] ${timestamp} | Player: ${playerId} | IP: ${ipAddress} | ` +
            `Opcode: ${opcode} | Level: ${levelName} | Violations: ${violations}`
        );
    }

    removePlayer(playerId) {
        this.players.delete(playerId);
    }

    cleanup() {
        const now = Date.now();
        const staleThreshold = 300000;

        for (const [playerId, state] of this.players.entries()) {
            if (now - state.lastActivity > staleThreshold) {
                this.players.delete(playerId);
            }
        }

        for (const [ip, banEnd] of this.ipBans.entries()) {
            if (now > banEnd) {
                this.ipBans.delete(ip);
            }
        }
    }

    getPlayerInfo(playerId) {
        const state = this.players.get(playerId);
        if (!state) return null;

        return {
            violations: state.violations,
            escalationLevel: state.escalationLevel,
            isFrozen: state.isFrozen(),
            isBanned: state.isBanned(),
            freezeUntil: state.freezeUntil,
            bannedUntil: state.bannedUntil,
            bucketStates: Array.from(state.buckets.entries()).map(([op, bucket]) => ({
                opcode: op,
                tokens: bucket.getTokens(),
                maxTokens: bucket.maxTokens
            }))
        };
    }

    getStats() {
        return {
            ...this.stats,
            activePlayers: this.players.size,
            bannedIPs: this.ipBans.size
        };
    }

    resetStats() {
        this.stats = {
            totalChecks: 0,
            allowed: 0,
            blocked: 0,
            byOpcode: {}
        };
    }

    isIpBanned(ipAddress) {
        if (!this.ipBans.has(ipAddress)) return false;
        const banEnd = this.ipBans.get(ipAddress);
        if (Date.now() >= banEnd) {
            this.ipBans.delete(ipAddress);
            return false;
        }
        return true;
    }

    banIp(ipAddress, durationMs = BAN_DURATION) {
        this.ipBans.set(ipAddress, Date.now() + durationMs);
    }

    unbanIp(ipAddress) {
        this.ipBans.delete(ipAddress);
    }

    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.players.clear();
        this.ipBans.clear();
    }
}

export const rateLimiter = new RateLimiter();
export { OPCODE_LIMITS, ESCALATION_LEVELS, ESCALATION_THRESHOLDS };
