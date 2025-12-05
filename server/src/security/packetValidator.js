const MAX_MESSAGE_SIZE = 1024;
const MAX_NAME_LENGTH = 15;
const MAX_CHAT_LENGTH = 100;
const MAX_CLAN_NAME_LENGTH = 7;
const MAX_PARTY_CODE_LENGTH = 10;
const MAX_USERNAME_LENGTH = 16;
const MAX_PASSWORD_LENGTH = 30;
const MAX_DISPLAY_NAME_LENGTH = 20;

const OPCODES = {
    SPAWN: 'M',
    MOVE_DIR: '9',
    ATTACK: 'F',
    AUTO_GATHER: 'K',
    DIRECTION: 'D',
    SELECT_ITEM: 'z',
    STORE: 'c',
    UPGRADE: 'H',
    CHAT: '6',
    PING: '0',
    PERF_DATA: 'p',
    CREATE_CLAN: 'L',
    LEAVE_CLAN: 'N',
    JOIN_CLAN_REQUEST: 'b',
    CLAN_MANAGE: 'P',
    MAP_PING: 'S',
    RESET_MOVE: 'e',
    TELEPORT: 'TP',
    AUTH: 'AUTH',
    REGISTER: 'REGISTER',
    CREATE_PARTY: 'CREATE_PARTY',
    JOIN_PARTY: 'JOIN_PARTY'
};

const VALID_OPCODES = new Set(Object.values(OPCODES));

function sanitizeString(str, maxLength = 100) {
    if (typeof str !== 'string') return null;
    return str
        .slice(0, maxLength)
        .replace(/[<>\"'&]/g, '')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .trim();
}

function isValidNumber(val) {
    return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val);
}

function clampNumber(val, min, max) {
    if (!isValidNumber(val)) return null;
    return Math.max(min, Math.min(max, val));
}

function isOptionalNumber(val) {
    return val === undefined || val === null || isValidNumber(val);
}

function logValidationFailure(playerId, ipAddress, opcode, reason, details = {}) {
    const timestamp = new Date().toISOString();
    console.warn(`[PacketValidator] ${timestamp} | Player: ${playerId ?? 'unknown'} | IP: ${ipAddress ?? 'unknown'} | Opcode: ${opcode} | Reason: ${reason}`, details);
}

const schemas = {
    [OPCODES.SPAWN]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 1) {
                return { valid: false, reason: 'Invalid spawn data structure' };
            }
            
            const spawnData = data[0];
            if (spawnData !== null && spawnData !== undefined && typeof spawnData !== 'object') {
                return { valid: false, reason: 'Spawn data must be object or null' };
            }

            const sanitized = { ...spawnData };
            
            if (sanitized && sanitized.name !== undefined) {
                const sanitizedName = sanitizeString(sanitized.name, MAX_NAME_LENGTH);
                if (sanitizedName === null) {
                    return { valid: false, reason: 'Invalid name format' };
                }
                sanitized.name = sanitizedName;
            }

            if (sanitized && sanitized.skin !== undefined) {
                if (!isValidNumber(sanitized.skin)) {
                    sanitized.skin = 0;
                } else {
                    sanitized.skin = clampNumber(sanitized.skin, 0, 9);
                }
            }

            return { valid: true, sanitizedData: [sanitized] };
        }
    },

    [OPCODES.MOVE_DIR]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data)) {
                return { valid: false, reason: 'Move direction must be array' };
            }

            const dir = data[0];
            if (dir !== undefined && dir !== null && !isValidNumber(dir)) {
                return { valid: false, reason: 'Move direction must be number or null' };
            }

            if (isValidNumber(dir)) {
                const clamped = clampNumber(dir, -Math.PI * 2, Math.PI * 2);
                return { valid: true, sanitizedData: [clamped] };
            }

            return { valid: true, sanitizedData: [dir] };
        }
    },

    [OPCODES.ATTACK]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data)) {
                return { valid: false, reason: 'Attack data must be array' };
            }

            const mouseState = data[0];
            const direction = data[1];

            if (mouseState !== undefined && mouseState !== 0 && mouseState !== 1) {
                return { valid: false, reason: 'Invalid mouse state' };
            }

            if (direction !== undefined && !isValidNumber(direction)) {
                return { valid: false, reason: 'Direction must be number' };
            }

            const sanitized = [mouseState];
            if (isValidNumber(direction)) {
                sanitized.push(clampNumber(direction, -Math.PI * 2, Math.PI * 2));
            }

            return { valid: true, sanitizedData: sanitized };
        }
    },

    [OPCODES.AUTO_GATHER]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data)) {
                return { valid: false, reason: 'Auto gather data must be array' };
            }
            return { valid: true, sanitizedData: [!!data[0]] };
        }
    },

    [OPCODES.DIRECTION]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 1) {
                return { valid: false, reason: 'Direction data must be array with value' };
            }

            const dir = data[0];
            if (!isValidNumber(dir)) {
                return { valid: false, reason: 'Direction must be valid number' };
            }

            return { valid: true, sanitizedData: [clampNumber(dir, -Math.PI * 2, Math.PI * 2)] };
        }
    },

    [OPCODES.SELECT_ITEM]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 1) {
                return { valid: false, reason: 'Select item data must be array' };
            }

            const itemId = data[0];
            const isWeapon = data[1];

            if (!isValidNumber(itemId)) {
                return { valid: false, reason: 'Item ID must be number' };
            }

            const clampedId = clampNumber(itemId, 0, 100);
            const sanitized = [clampedId];
            
            if (isWeapon !== undefined) {
                sanitized.push(!!isWeapon);
            }

            return { valid: true, sanitizedData: sanitized };
        }
    },

    [OPCODES.STORE]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 2) {
                return { valid: false, reason: 'Store data must have type and id' };
            }

            const [type, id, index] = data;

            if (type !== 0 && type !== 1) {
                return { valid: false, reason: 'Invalid store type' };
            }

            if (!isValidNumber(id)) {
                return { valid: false, reason: 'Store ID must be number' };
            }

            const clampedId = clampNumber(id, 0, 100);
            const sanitized = [type, clampedId];

            if (index !== undefined) {
                sanitized.push(!!index);
            }

            return { valid: true, sanitizedData: sanitized };
        }
    },

    [OPCODES.UPGRADE]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 1) {
                return { valid: false, reason: 'Upgrade data must contain item' };
            }

            const item = data[0];
            if (!isValidNumber(item) && typeof item !== 'string') {
                return { valid: false, reason: 'Upgrade item must be number or string' };
            }

            const parsed = typeof item === 'string' ? parseInt(item, 10) : item;
            if (!isValidNumber(parsed)) {
                return { valid: false, reason: 'Invalid upgrade item value' };
            }

            return { valid: true, sanitizedData: [clampNumber(parsed, 0, 100)] };
        }
    },

    [OPCODES.CHAT]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 1) {
                return { valid: false, reason: 'Chat data must contain message' };
            }

            const message = data[0];
            if (typeof message !== 'string') {
                return { valid: false, reason: 'Chat message must be string' };
            }

            const sanitized = sanitizeString(message, MAX_CHAT_LENGTH);
            if (sanitized === null || sanitized.length === 0) {
                return { valid: false, reason: 'Invalid chat message' };
            }

            return { valid: true, sanitizedData: [sanitized] };
        }
    },

    [OPCODES.PING]: {
        validate: (data, ctx) => {
            return { valid: true, sanitizedData: data };
        }
    },

    [OPCODES.PERF_DATA]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data)) {
                return { valid: false, reason: 'Perf data must be array' };
            }

            const [cps, ping] = data;
            const sanitized = [];

            if (isValidNumber(cps)) {
                sanitized.push(clampNumber(cps, 0, 100));
            } else {
                sanitized.push(0);
            }

            if (isValidNumber(ping)) {
                sanitized.push(clampNumber(ping, -1, 9999));
            } else {
                sanitized.push(-1);
            }

            return { valid: true, sanitizedData: sanitized };
        }
    },

    [OPCODES.CREATE_CLAN]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 1) {
                return { valid: false, reason: 'Clan name required' };
            }

            const name = data[0];
            if (typeof name !== 'string') {
                return { valid: false, reason: 'Clan name must be string' };
            }

            const sanitized = sanitizeString(name, MAX_CLAN_NAME_LENGTH);
            if (sanitized === null || sanitized.length < 1) {
                return { valid: false, reason: 'Invalid clan name' };
            }

            return { valid: true, sanitizedData: [sanitized] };
        }
    },

    [OPCODES.LEAVE_CLAN]: {
        validate: (data, ctx) => {
            return { valid: true, sanitizedData: data };
        }
    },

    [OPCODES.JOIN_CLAN_REQUEST]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 1) {
                return { valid: false, reason: 'Clan identifier required' };
            }

            const clanId = data[0];
            if (typeof clanId === 'string') {
                const sanitized = sanitizeString(clanId, MAX_CLAN_NAME_LENGTH);
                return { valid: true, sanitizedData: [sanitized] };
            }

            if (isValidNumber(clanId)) {
                return { valid: true, sanitizedData: [clanId] };
            }

            return { valid: false, reason: 'Invalid clan identifier' };
        }
    },

    [OPCODES.CLAN_MANAGE]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 1) {
                return { valid: false, reason: 'Clan manage requires target' };
            }

            const [targetSid, joinDecision] = data;

            if (!isValidNumber(targetSid) && targetSid !== undefined) {
                return { valid: false, reason: 'Target SID must be number' };
            }

            const sanitized = [targetSid];
            if (joinDecision !== undefined) {
                sanitized.push(!!joinDecision);
            }

            return { valid: true, sanitizedData: sanitized };
        }
    },

    [OPCODES.MAP_PING]: {
        validate: (data, ctx) => {
            return { valid: true, sanitizedData: data };
        }
    },

    [OPCODES.RESET_MOVE]: {
        validate: (data, ctx) => {
            return { valid: true, sanitizedData: data };
        }
    },

    [OPCODES.TELEPORT]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 2) {
                return { valid: false, reason: 'Teleport requires x and y' };
            }

            const [x, y] = data;

            if (!isValidNumber(x) || !isValidNumber(y)) {
                return { valid: false, reason: 'Teleport coordinates must be numbers' };
            }

            const maxCoord = 20000;
            return {
                valid: true,
                sanitizedData: [
                    clampNumber(x, 0, maxCoord),
                    clampNumber(y, 0, maxCoord)
                ]
            };
        }
    },

    [OPCODES.AUTH]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 2) {
                return { valid: false, reason: 'Auth requires username and password' };
            }

            const [username, password] = data;

            if (typeof username !== 'string') {
                return { valid: false, reason: 'Username must be string' };
            }

            if (typeof password !== 'string') {
                return { valid: false, reason: 'Password must be string' };
            }

            const sanitizedUsername = sanitizeString(username, MAX_USERNAME_LENGTH);
            if (sanitizedUsername === null || sanitizedUsername.length < 4) {
                return { valid: false, reason: 'Invalid username' };
            }

            if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
                return { valid: false, reason: 'Invalid password length' };
            }

            return { valid: true, sanitizedData: [sanitizedUsername, password] };
        }
    },

    [OPCODES.REGISTER]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 4) {
                return { valid: false, reason: 'Register requires username, password, displayName, and email' };
            }

            const [username, password, displayName, email] = data;

            if (typeof username !== 'string') {
                return { valid: false, reason: 'Username must be string' };
            }

            if (typeof password !== 'string') {
                return { valid: false, reason: 'Password must be string' };
            }

            if (typeof email !== 'string') {
                return { valid: false, reason: 'Email must be string' };
            }

            const sanitizedUsername = sanitizeString(username, MAX_USERNAME_LENGTH);
            if (sanitizedUsername === null || sanitizedUsername.length < 4) {
                return { valid: false, reason: 'Invalid username' };
            }

            if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
                return { valid: false, reason: 'Invalid password length' };
            }

            const emailTrimmed = email.toLowerCase().trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailTrimmed || !emailRegex.test(emailTrimmed)) {
                return { valid: false, reason: 'Invalid email format' };
            }

            const sanitized = [sanitizedUsername, password];
            
            if (displayName !== undefined && typeof displayName === 'string') {
                const sanitizedDisplay = sanitizeString(displayName, MAX_DISPLAY_NAME_LENGTH);
                sanitized.push(sanitizedDisplay || sanitizedUsername);
            } else {
                sanitized.push(sanitizedUsername);
            }
            
            sanitized.push(emailTrimmed);

            return { valid: true, sanitizedData: sanitized };
        }
    },

    [OPCODES.CREATE_PARTY]: {
        validate: (data, ctx) => {
            return { valid: true, sanitizedData: data };
        }
    },

    [OPCODES.JOIN_PARTY]: {
        validate: (data, ctx) => {
            if (!Array.isArray(data) || data.length < 1) {
                return { valid: false, reason: 'Party code required' };
            }

            const code = data[0];
            if (typeof code !== 'string') {
                return { valid: false, reason: 'Party code must be string' };
            }

            const sanitized = sanitizeString(code, MAX_PARTY_CODE_LENGTH);
            if (sanitized === null || sanitized.length < 1) {
                return { valid: false, reason: 'Invalid party code' };
            }

            return { valid: true, sanitizedData: [sanitized] };
        }
    }
};

export class PacketValidator {
    constructor() {
        this.validationStats = {
            total: 0,
            passed: 0,
            failed: 0,
            byOpcode: {}
        };
    }

    checkMessageSize(rawMessage) {
        if (!rawMessage) return { valid: false, reason: 'Empty message' };
        
        const size = rawMessage.byteLength || rawMessage.length || 0;
        if (size > MAX_MESSAGE_SIZE) {
            return { valid: false, reason: `Message too large: ${size} bytes (max ${MAX_MESSAGE_SIZE})` };
        }
        
        return { valid: true, size };
    }

    isValidOpcode(opcode) {
        return VALID_OPCODES.has(opcode);
    }

    validatePacket(opcode, data, context = {}) {
        this.validationStats.total++;

        if (!this.validationStats.byOpcode[opcode]) {
            this.validationStats.byOpcode[opcode] = { passed: 0, failed: 0 };
        }

        if (!this.isValidOpcode(opcode)) {
            this.validationStats.failed++;
            this.validationStats.byOpcode[opcode] = this.validationStats.byOpcode[opcode] || { passed: 0, failed: 0 };
            this.validationStats.byOpcode[opcode].failed++;
            
            logValidationFailure(context.playerId, context.ipAddress, opcode, 'Unknown opcode');
            return { valid: false, reason: 'Unknown opcode' };
        }

        const schema = schemas[opcode];
        if (!schema) {
            this.validationStats.passed++;
            this.validationStats.byOpcode[opcode].passed++;
            return { valid: true, sanitizedData: data };
        }

        try {
            const result = schema.validate(data, context);
            
            if (result.valid) {
                this.validationStats.passed++;
                this.validationStats.byOpcode[opcode].passed++;
            } else {
                this.validationStats.failed++;
                this.validationStats.byOpcode[opcode].failed++;
                logValidationFailure(context.playerId, context.ipAddress, opcode, result.reason);
            }

            return result;
        } catch (error) {
            this.validationStats.failed++;
            this.validationStats.byOpcode[opcode].failed++;
            
            logValidationFailure(context.playerId, context.ipAddress, opcode, 'Validation error', { error: error.message });
            return { valid: false, reason: 'Validation error: ' + error.message };
        }
    }

    getStats() {
        return { ...this.validationStats };
    }

    resetStats() {
        this.validationStats = {
            total: 0,
            passed: 0,
            failed: 0,
            byOpcode: {}
        };
    }
}

export const packetValidator = new PacketValidator();
export { OPCODES, MAX_MESSAGE_SIZE, logValidationFailure };
