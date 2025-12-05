import 'dotenv/config';
import e from "express";
import helmet from "helmet";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { decode, encode } from "msgpack-lite";
import { Game } from "./moomoo/server.js";
import { Player } from "./moomoo/modules/player.js";
import { items } from "./moomoo/modules/items.js";
import { UTILS } from "./moomoo/libs/utils.js";
import { hats, accessories } from "./moomoo/modules/store.js";
import { filter_chat } from "./moomoo/libs/filterchat.js";
import { config } from "./moomoo/config.js";
import { ConnectionLimit } from "./moomoo/libs/limit.js";
import { AdminCommands } from "./moomoo/modules/adminCommands.js";
import { AccountManager, AdminLevel, sessionStore } from "./moomoo/modules/Account.js";
import { fileURLToPath } from "node:url";
import { packetValidator, MAX_MESSAGE_SIZE } from "./security/packetValidator.js";
import { rateLimiter, ESCALATION_LEVELS } from "./security/rateLimiter.js";
import { createAntiCheatController, SUSPICION_THRESHOLDS } from "./security/antiCheat/index.js";
import { sendPasswordResetEmail } from "./services/emailService.js";

const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000;
const SESSION_CHECK_INTERVAL = 60 * 1000;

const app = e();

function getAllowedOrigins() {
    const origins = [
        'http://localhost:5000',
        'http://127.0.0.1:5000',
        'http://0.0.0.0:5000'
    ];
    
    if (process.env.REPLIT_DEPLOYMENT_URL) {
        origins.push(process.env.REPLIT_DEPLOYMENT_URL);
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
        origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
        const domains = process.env.REPLIT_DOMAINS.split(',');
        domains.forEach(d => origins.push(`https://${d.trim()}`));
    }
    
    return origins;
}

const allowedOrigins = getAllowedOrigins();

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "wss:", "ws:"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) {
            return callback(null, true);
        }
        
        if (allowedOrigins.some(allowed => origin === allowed || origin.endsWith(allowed.replace('https://', '.')))) {
            return callback(null, true);
        }
        
        console.log(`[CORS] Blocked request from origin: ${origin}`);
        return callback(null, false);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400
}));

const loginAttempts = new Map();
const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW = 60000;

function checkLoginRateLimit(ip) {
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || { count: 0, firstAttempt: now };
    
    if (now - attempts.firstAttempt > LOGIN_RATE_WINDOW) {
        attempts.count = 1;
        attempts.firstAttempt = now;
    } else {
        attempts.count++;
    }
    
    loginAttempts.set(ip, attempts);
    return attempts.count <= LOGIN_RATE_LIMIT;
}

function sanitizeInput(str, maxLength = 30) {
    if (typeof str !== 'string') return '';
    return str
        .slice(0, maxLength)
        .replace(/[<>\"'&]/g, '')
        .replace(/[\x00-\x1F\x7F]/g, '')
        .trim();
}

function validateUsername(username) {
    if (!username || typeof username !== 'string') return false;
    if (username.length < 4 || username.length > 16) return false;
    return /^[a-zA-Z0-9_]+$/.test(username);
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    return password.length >= 8 && password.length <= 30;
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of loginAttempts.entries()) {
        if (now - data.firstAttempt > LOGIN_RATE_WINDOW * 2) {
            loginAttempts.delete(ip);
        }
    }
}, LOGIN_RATE_WINDOW);

function generatePartyCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

app.use(e.json({ limit: '10kb' }));
app.use(e.urlencoded({ extended: true, limit: '10kb' }));

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

const colimit = new ConnectionLimit(4);

const server = createServer(app);
const wss = new WebSocketServer({
    server
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLIENT_DIST_DIR = path.resolve(__dirname, "../../dist/client");
const INDEX = path.join(CLIENT_DIST_DIR, "html/play.html");
const PORT = Number(process.env.PORT ?? 5000);
const HOST = process.env.HOST ?? "0.0.0.0";
const SERVER_START_TIME = Date.now();
const SERVER_METADATA = {
    name: process.env.SERVER_NAME ?? "MooMoo Server",
    type: process.env.SERVER_TYPE ?? (config.isSandbox ? "sandbox" : "standard"),
    region: process.env.SERVER_REGION ?? "global"
};

const POINTS_RESOURCE_INDEX = config.resourceTypes ? config.resourceTypes.indexOf("points") : -1;

if (!fs.existsSync(INDEX)) {
    console.warn("[server] Client build not found. Run `npm run build --workspace client` first.");
}

const game = new Game;
const adminCommands = new AdminCommands(game);
const accountManager = new AccountManager();

const antiCheat = createAntiCheatController(config, items);
game.setAntiCheat(antiCheat);

antiCheat.setCallbacks({
    onWarning: (playerId, socket, data) => {
        if (socket && socket.readyState === 1) {
            socket.send(JSON.stringify(['ANTICHEAT_WARNING', [{ 
                message: 'Suspicious activity detected. Please play fairly.',
                score: data.score,
                warningCount: data.warningCount
            }]]));
        }
    },
    onKick: (playerId, socket, data) => {
        console.log(`[AntiCheat] Kicking player ${playerId} - Score: ${data.score}`);
        if (socket && socket.readyState === 1) {
            socket.send(JSON.stringify(['ANTICHEAT_KICK', [{ 
                message: 'You have been kicked for suspicious activity.',
                reason: 'anticheat'
            }]]));
            setTimeout(() => {
                try { socket.close(4010); } catch (e) {}
            }, 100);
        }
    },
    onBan: (playerId, socket, ipAddress, data) => {
        console.log(`[AntiCheat] Banning player ${playerId} (IP: ${ipAddress}) - Score: ${data.score}`);
        if (socket && socket.readyState === 1) {
            socket.send(JSON.stringify(['ANTICHEAT_BAN', [{ 
                message: 'You have been banned for cheating.',
                reason: 'anticheat',
                duration: '24 hours'
            }]]));
            setTimeout(() => {
                try { socket.close(4011); } catch (e) {}
            }, 100);
        }
    }
});

app.get("/", (req, res) => {
    res.sendFile(INDEX)
});

app.get("/ping", (_req, res) => {
    const activePlayers = game.players.filter(player => player.alive);
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
        server: {
            ...SERVER_METADATA,
            host: HOST,
            port: PORT,
            isSandbox: Boolean(config.isSandbox),
            maxPlayers: config.maxPlayers,
            maxPlayersHard: config.maxPlayersHard
        },
        players: {
            totalConnected: game.players.length,
            activeCount: activePlayers.length,
            list: activePlayers.map(player => ({
                sid: player.sid,
                name: player.name,
                score: player.points,
                kills: player.kills
            }))
        }
    });
});

app.get("/play", (req, res) => {
    res.sendFile(INDEX);
});

app.post("/api/account/register", async (req, res) => {
    try {
        const { username, password, displayName, email } = req.body;

        if (!username || typeof username !== 'string') {
            return res.status(400).json({ success: false, error: 'Username is required' });
        }

        if (!password || typeof password !== 'string') {
            return res.status(400).json({ success: false, error: 'Password is required' });
        }

        if (!email || typeof email !== 'string') {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }

        if (username.length < 4 || username.length > 16) {
            return res.status(400).json({ success: false, error: 'Username must be 4-16 characters' });
        }

        if (password.length < 8 || password.length > 30) {
            return res.status(400).json({ success: false, error: 'Password must be 8-30 characters' });
        }

        const result = await accountManager.createAccount(username, password, displayName, email);

        if (result.success) {
            res.json({ success: true, account: result.account });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[API] Register error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post("/api/account/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || typeof username !== 'string') {
            return res.status(400).json({ success: false, error: 'Username is required' });
        }

        if (!password || typeof password !== 'string') {
            return res.status(400).json({ success: false, error: 'Password is required' });
        }

        const result = await accountManager.validatePassword(username, password);

        if (result.success) {
            res.json({ 
                success: true, 
                account: result.account,
                sessionToken: result.sessionToken,
                sessionExpiresAt: result.sessionExpiresAt
            });
        } else {
            res.status(401).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[API] Login error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post("/api/account/logout", async (req, res) => {
    try {
        const { sessionToken } = req.body;
        
        if (!sessionToken) {
            return res.status(400).json({ success: false, error: 'Session token required' });
        }
        
        const result = accountManager.invalidateSessionToken(sessionToken);
        res.json({ success: result.success });
    } catch (error) {
        console.error('[API] Logout error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post("/api/account/validate-session", async (req, res) => {
    try {
        const { sessionToken } = req.body;
        
        if (!sessionToken) {
            return res.status(400).json({ valid: false, error: 'Session token required' });
        }
        
        const result = accountManager.checkSession(sessionToken);
        res.json(result);
    } catch (error) {
        console.error('[API] Validate session error:', error);
        res.status(500).json({ valid: false, error: 'Internal server error' });
    }
});

const passwordResetAttempts = new Map();
const PASSWORD_RESET_RATE_LIMIT = 3;
const PASSWORD_RESET_RATE_WINDOW = 300000;

function checkPasswordResetRateLimit(ip) {
    const now = Date.now();
    const attempts = passwordResetAttempts.get(ip) || { count: 0, firstAttempt: now };
    
    if (now - attempts.firstAttempt > PASSWORD_RESET_RATE_WINDOW) {
        attempts.count = 1;
        attempts.firstAttempt = now;
    } else {
        attempts.count++;
    }
    
    passwordResetAttempts.set(ip, attempts);
    return attempts.count <= PASSWORD_RESET_RATE_LIMIT;
}

app.post("/api/account/forgot-password", async (req, res) => {
    try {
        const ip = req.headers["x-forwarded-for"]?.split(",")[0] ?? req.socket.remoteAddress;
        
        if (!checkPasswordResetRateLimit(ip)) {
            return res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
        }
        
        const { email } = req.body;
        
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }
        
        const emailLower = email.toLowerCase().trim();
        
        const result = await accountManager.generateResetToken(emailLower);
        
        if (!result.success) {
            return res.status(400).json({ success: false, error: result.error });
        }
        
        try {
            const baseUrl = process.env.REPLIT_DEV_DOMAIN 
                ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
                : process.env.REPLIT_DEPLOYMENT_URL || 'http://localhost:5000';
            const resetLink = `${baseUrl}/reset-password?token=${result.resetToken}`;
            
            await sendPasswordResetEmail(emailLower, result.resetCode, resetLink);
            
            res.json({ 
                success: true, 
                message: 'If an account exists with that email, a reset code has been sent.' 
            });
        } catch (emailError) {
            console.error('[API] Failed to send reset email:', emailError);
            res.json({ 
                success: true, 
                message: 'If an account exists with that email, a reset code has been sent.' 
            });
        }
    } catch (error) {
        console.error('[API] Forgot password error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post("/api/account/verify-reset-code", async (req, res) => {
    try {
        const { email, code } = req.body;
        
        if (!email || !code) {
            return res.status(400).json({ success: false, error: 'Email and code are required' });
        }
        
        const emailLower = email.toLowerCase().trim();
        const result = await accountManager.verifyResetCode(emailLower, code);
        
        if (result.valid) {
            res.json({ success: true, resetToken: result.resetToken });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[API] Verify reset code error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post("/api/account/reset-password", async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token) {
            return res.status(400).json({ success: false, error: 'Reset token is required' });
        }
        
        if (!newPassword || typeof newPassword !== 'string') {
            return res.status(400).json({ success: false, error: 'New password is required' });
        }
        
        if (newPassword.length < 8 || newPassword.length > 30) {
            return res.status(400).json({ success: false, error: 'Password must be 8-30 characters' });
        }
        
        const result = await accountManager.resetPassword(token, newPassword);
        
        if (result.success) {
            res.json({ success: true, message: 'Password has been reset successfully.' });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('[API] Reset password error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.use(e.static(CLIENT_DIST_DIR));

wss.on("connection", async (socket, req) => {

    if (
        game.players.length > config.maxPlayersHard
    ) {
        return void socket.close();
    }

    const addr = req.headers["x-forwarded-for"]?.split(",")[0] ?? req.socket.remoteAddress;

    if (adminCommands.checkBan(addr)) {
        return void socket.close(4003);
    }

    if (antiCheat.isBanned(addr)) {
        console.log(`[AntiCheat] Blocked banned IP: ${addr}`);
        return void socket.close(4011);
    }

    if (
        colimit.check(addr)
    ) {
        return void socket.close(4001);
    }

    colimit.up(addr);

    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const sessionToken = urlParams.get('sessionToken');
    
    let sessionUserId = null;
    if (sessionToken) {
        const sessionValidation = sessionStore.validateSession(sessionToken);
        if (sessionValidation.valid) {
            sessionUserId = sessionValidation.session.userId;
            sessionStore.refreshSession(sessionToken);
        }
    }

    const player = game.addPlayer(socket);
    player.ipAddress = addr;
    player.sessionToken = sessionToken;
    player.sessionUserId = sessionUserId;
    player.lastActivity = Date.now();
    player.antiCheatData = {
        lastInputTime: Date.now(),
        lastAttackTime: 0,
        positionHistory: [],
        actionCooldowns: new Map()
    };

    const emit = async (type, ...data) => {

        if (!player.socket) return;
        socket.send(encode([type, data]));
    };
    
    const checkSessionExpiry = () => {
        if (!player.sessionToken) return;
        
        const validation = sessionStore.validateSession(player.sessionToken);
        if (!validation.valid) {
            console.log(`[Session] Session expired for player ${player.sid}: ${validation.reason}`);
            emit("SESSION_EXPIRED", { reason: validation.reason });
            setTimeout(() => {
                if (player.socket) {
                    player.socket.close(4004);
                }
            }, 1000);
        }
    };
    
    const sessionCheckInterval = setInterval(checkSessionExpiry, SESSION_CHECK_INTERVAL);
    
    const refreshPlayerSession = () => {
        player.lastActivity = Date.now();
        if (player.sessionToken) {
            sessionStore.refreshSession(player.sessionToken);
        }
    };

    const handleInvalidPacket = reason => {

        const identifier = typeof player.sid !== "undefined" ? player.sid : "unknown";
        console.warn(`[server] Closing connection for player ${identifier} at ${addr}: ${reason}`);

        if (player.socket) {
            try {
                player.socket.close(4002);
            } catch (closeError) {
                console.error("Failed to close socket after invalid packet:", closeError);
            } finally {
                player.socket = null;
            }
        }

    };

    socket.on("message", async msg => {

        try {

            refreshPlayerSession();

            const sizeCheck = packetValidator.checkMessageSize(msg);
            if (!sizeCheck.valid) {
                console.warn(`[Security] Oversized packet from ${addr}: ${sizeCheck.reason}`);
                handleInvalidPacket(sizeCheck.reason);
                return;
            }

            const now = Date.now();
            if (!player.packetWindowStart || (now - player.packetWindowStart) >= 1000) {
                player.packetWindowStart = now;
                player.packetCounter = 0;
            }
            player.packetCounter++;
            if (player.packetCounter > 1000) {
                handleInvalidPacket(`packet rate limit exceeded (${player.packetCounter} > 1000)`);
                return;
            }

            const decoded = decode(new Uint8Array(msg));

            if (!Array.isArray(decoded) || decoded.length < 2) {
                handleInvalidPacket("malformed packet structure");
                return;
            }

            const rawType = decoded[0];
            const payload = decoded[1];

            const t = typeof rawType === "string"
                ? rawType
                : (typeof rawType === "number" || typeof rawType === "bigint")
                    ? rawType.toString()
                    : null;

            if (!t || t.length === 0 || t.length > 16) {
                handleInvalidPacket("invalid packet identifier");
                return;
            }

            if (!Array.isArray(payload)) {
                handleInvalidPacket("packet payload is not an array");
                return;
            }

            const rateLimitResult = rateLimiter.checkLimit(player.id, addr, t);
            if (!rateLimitResult.allowed) {
                if (rateLimitResult.action === 'disconnect' || rateLimitResult.action === 'ban') {
                    console.warn(`[Security] Rate limit action '${rateLimitResult.action}' for player ${player.sid} (${addr}): ${rateLimitResult.reason}`);
                    if (rateLimitResult.action === 'disconnect') {
                        handleInvalidPacket(`rate limit: ${rateLimitResult.reason}`);
                    } else if (rateLimitResult.action === 'ban') {
                        socket.close(4005);
                        return;
                    }
                    return;
                }
                if (rateLimitResult.action === 'warning') {
                    emit("RATE_LIMIT_WARNING", { message: rateLimitResult.reason });
                }
                if (rateLimitResult.action === 'freeze') {
                    emit("RATE_LIMIT_FREEZE", { 
                        message: rateLimitResult.reason,
                        duration: rateLimitResult.freezeExpires ? rateLimitResult.freezeExpires - Date.now() : 5000
                    });
                    return;
                }
                return;
            }

            const validationContext = { playerId: player.sid, ipAddress: addr };
            const validationResult = packetValidator.validatePacket(t, payload, validationContext);
            
            if (!validationResult.valid) {
                console.warn(`[Security] Packet validation failed for player ${player.sid} (${addr}): ${t} - ${validationResult.reason}`);
                return;
            }

            const data = validationResult.sanitizedData || payload;

            switch(t) {
                case "M": {

                    if (player.alive) {
                        break;
                    }

                    player.setUserData(data[0]);
                    player.spawn(data[0]?.moofoll);
                    player.send("C", player.sid);

                    break;
                }
                case "9": {

                    if (!player.alive) {
                        break;
                    }

                    if (!(data[0] === undefined || data[0] === null) && !UTILS.isNumber(data[0])) break;

                    antiCheat.recordInput(player.id, Date.now());
                    antiCheat.recordGameplayAction(player.id);

                    player.moveDir = data[0];
                    break;

                }
                case "F": {

                    if (!player.alive) {
                        break;
                    }

                    if (player.isDisarmed) {
                        player.mouseState = 0;
                        player.hits = 0;
                        break;
                    }

                    if (data[0]) {
                        antiCheat.recordAttack(player.id, Date.now());
                        antiCheat.recordGameplayAction(player.id);
                        
                        const attackValidation = antiCheat.validateAttackTiming(player, player.weaponIndex);
                        if (!attackValidation.valid && attackValidation.suspicionScore > 30) {
                            antiCheat.checkAndEnforce(player.id, socket, addr);
                        }
                    }

                    player.mouseState = data[0];
                    if (data[0] && player.buildIndex === -1) {
                        player.hits++;
                    }
    
                    if (UTILS.isNumber(data[1])) {
                        player.dir = data[1];
                    }
    
                    if (player.buildIndex >= 0) {
                        const item = items.list[player.buildIndex];
                        if (data[0]) {

                            player.packet_spam++;

                            if (player.packet_spam >= 10000) {
                                if (player.socket) {
                                    player.socket.close();
                                    player.socket = null;
                                }
                            }

                            player.buildItem(item);
                            
                        }
                        player.mouseState = 0;
                        player.hits = 0;
                    }
                    break;

                }
                case "K": {
                    if (!player.alive) {
                        break;
                    }

                    if (data[0]) {
                        player.autoGather = !player.autoGather;
                    }
                    break;

                }
                case "D": {

                    if (!player.alive) {
                        break;
                    }

                    if (!UTILS.isNumber(data[0])) break;

                    player.dir = data[0];
                    break;

                }
                case "z": {

                    if (!player.alive) {
                        break;
                    }

                    if (!UTILS.isNumber(data[0])) {
                        break;
                    }

                    if (data[1]) {

                        const wpn = items.weapons[data[0]];

                        if (!wpn) {
                            break;
                        }

                        if (player.weapons[wpn.type] !== data[0]) {
                            break;
                        }

                        player.buildIndex = -1;
                        player.weaponIndex = data[0];
                        break;
                    }

                    const item = items.list[data[0]];

                    if (!item) {
                        break;
                    }

                    if (player.buildIndex === data[0]) {
                        player.buildIndex = -1;
                        player.mouseState = 0;
                        break;
                    }

                    player.buildIndex = data[0];
                    player.mouseState = 0;
                    break;

                }
                case "c": {

                    if (!player.alive) {
                        break;
                    }

                    const [type, id, index] = data;

                    if (index) {
                        let tail = accessories.find(acc => acc.id == id);
            
                        if (tail) {
                            if (type) {
                                if (!player.tails[id] && player.points >= tail.price) {
                                    player.tails[id] = 1;
                                    emit("5", 0, id, 1);
                                }
                            } else {
                                if (player.tails[id]) {
                                    player.tail = tail;
                                    player.tailIndex = player.tail.id;
                                    emit("5", 1, id, 1);
                                }
                            }
                        } else {
                            if (id == 0) {
                                player.tail = {};
                                player.tailIndex = 0;
                                emit("5", 1, 0, 1);
                            }
                        }
                    } else {
                        let hat = hats.find(hat => hat.id == id);
            
                        if (hat) {
                            if (type) {
                                if (!player.skins[id] && player.points >= hat.price) {
                                    if (hat.price > 0) {
                                        if (POINTS_RESOURCE_INDEX !== -1) {
                                            player.addResource(POINTS_RESOURCE_INDEX, -hat.price, true);
                                        } else {
                                            player.points -= hat.price;
                                            player.send("N", "points", player.points, 1);
                                        }
                                    }
                                    player.skins[id] = 1;
                                    emit("5", 0, id, 0);
                                }
                            } else {
                                if (player.skins[id]) {
                                    const hatSwitchResult = antiCheat.validateHatSwitch(player, id);
                                    if (hatSwitchResult.suspicionScore > 0) {
                                        antiCheat.addSuspicion(player.id || player.sid, hatSwitchResult.suspicionScore, 'HAT_SWITCH', addr);
                                    }
                                    
                                    player.skin = hat;
                                    player.skinIndex = player.skin.id;
                                    emit("5", 1, id, 0);
                                }
                            }
                        } else {
                            if (id == 0) {
                                const hatSwitchResult = antiCheat.validateHatSwitch(player, 0);
                                if (hatSwitchResult.suspicionScore > 0) {
                                    antiCheat.addSuspicion(player.id || player.sid, hatSwitchResult.suspicionScore, 'HAT_SWITCH', addr);
                                }
                                
                                player.skin = {};
                                player.skinIndex = 0;
                                emit("5", 1, 0, 0);
                            }
                        }
                    }

                    break;

                }
                case "H": {

                    if (!player.alive) {
                        break;
                    }

                    if (player.upgradePoints <= 0) break;

                    const item = Number.parseInt(data[0]);

                    const upgr_items = items.list.filter(x => x.age === player.upgrAge);
                    const upgr_weapons = items.weapons.filter(x => x.age === player.upgrAge);

                    const update = (() => {

                        if (item < items.weapons.length) {

                            const wpn = upgr_weapons.find(x => x.id === item);

                            if (!wpn) return false;

                            player.weapons[wpn.type] = wpn.id;
                            player.weaponXP[wpn.type] = 0;

                            const type = player.weaponIndex < 9 ? 0 : 1;

                            if (wpn.type === type) {
                                player.weaponIndex = wpn.id;
                            }

                            return true;

                        }

                        const i2 = item - items.weapons.length;

                        if (!upgr_items.some(x => x.id === i2)) return false;

                        player.addItem(i2);

                        return true;
                        
                    })();

                    if (!update) break;

                    player.upgrAge++;
                    player.upgradePoints--;

                    player.send("V", player.items, 0);
                    player.send("V", player.weapons, 1);

                    if (player.age >= 0) {
                        player.send("U", player.upgradePoints, player.upgrAge);
                    } else {
                        player.send("U", 0, 0);
                    }

                    break;
                }
                case "6": {

                    if (!player.alive) {
                        break;
                    }

                    if (player.chat_cooldown > 0) {
                        break;
                    }

                    if (typeof data[0] !== "string") {
                        break;
                    }

                    const rawMessage = data[0];

                    if (rawMessage.startsWith('/')) {
                        const commandData = adminCommands.parseCommand(rawMessage, player);
                        if (commandData) {
                            try {
                                const result = await adminCommands.executeCommand(commandData);
                                if (result && result.message) {
                                    player.send("6", -1, result.message);
                                }
                            } catch (error) {
                                console.error('Admin command error:', error);
                                player.send("6", -1, 'Command error: ' + error.message);
                            }
                        }
                        break;
                    }

                    const chat = filter_chat(rawMessage);

                    if (chat.length === 0) {
                        break;
                    }

                    game.server.broadcast("6", player.sid, chat);
                    player.chat_cooldown = 300;

                    break;
                }
                case "0": {
                    emit("0");
                    break;
                }
                case "p": {

                    if (!player.alive) {
                        break;
                    }

                    const rawCps = data[0];
                    const rawPing = data[1];

                    if (Number.isFinite(rawCps)) {
                        player.clientCps = Math.max(0, Math.min(50, Math.round(Number(rawCps))));
                    }
                    if (Number.isFinite(rawPing)) {
                        player.clientPing = Math.max(-1, Math.min(9999, Math.round(Number(rawPing))));
                    }

                    break;
                }
                case "L": {

                    if (!player.alive) break;

                    if (player.team) break;

                    if (player.clan_cooldown > 0) break;

                    if (typeof data[0] !== "string") break;

                    if (data[0].length < 1 || data[0].length > 7) break;

                    const created = game.clan_manager.create(data[0], player);
                    
                    if (created && player.accountUsername) {
                        accountManager.incrementTribesCreated(player.accountUsername);
                        accountManager.updateCurrentTribe(player.accountUsername, data[0]);
                    }

                    break;
                }
                case "N": {

                    if (!player.alive) break;

                    if (!player.team) break;

                    if (player.clan_cooldown > 0) break;

                    player.clan_cooldown = 200;
                    
                    if (player.accountUsername) {
                        accountManager.updateCurrentTribe(player.accountUsername, null);
                    }

                    if (player.is_owner) {
                        game.clan_manager.remove(player.team);
                        break;
                    }
                    
                    game.clan_manager.kick(player.team, player.sid);
                    break;

                }
                case "b": {

                    if (!player.alive) break;

                    if (player.team) break;

                    if (player.clan_cooldown > 0) break;

                    player.clan_cooldown = 200;

                    game.clan_manager.add_notify(data[0], player.sid);
                    break;

                }
                case "P": {

                    if (!player.alive) break;

                    if (!player.team) break;

                    if (player.clan_cooldown > 0) break;

                    const [targetSid, joinDecision] = data ?? [];

                    if (typeof targetSid === "undefined") break;

                    if (typeof joinDecision !== "undefined") {

                        player.clan_cooldown = 200;

                        game.clan_manager.confirm_join(player.team, targetSid, joinDecision);
                        player.notify.delete(targetSid);
                        break;
                    }

                    if (!player.is_owner) break;

                    player.clan_cooldown = 200;

                    game.clan_manager.kick(player.team, targetSid);
                    break;

                }
                case "S": {

                    if (!player.alive) break;

                    if (player.ping_cooldown > 0) break;

                    player.ping_cooldown = config.mapPingTime;

                    game.server.broadcast("9", player.x, player.y);

                    break;
                }
                case "e": {

                    if (!player.alive) break;

                    player.resetMoveDir();

                    break;
                }
                case "TP": {

                    if (!player.alive) break;

                    if (!player.teleportClickMode) break;

                    const x = data[0];
                    const y = data[1];

                    if (!UTILS.isNumber(x) || !UTILS.isNumber(y)) break;

                    if (x < 0 || x > config.mapScale || y < 0 || y > config.mapScale) break;

                    player.x = x;
                    player.y = y;
                    player.xVel = 0;
                    player.yVel = 0;

                    break;
                }
                case "AUTH": {
                    if (!checkLoginRateLimit(addr)) {
                        emit("AUTH_RESULT", { success: false, error: 'Too many login attempts. Please wait.' });
                        break;
                    }
                    
                    const username = sanitizeInput(data[0], 16);
                    const password = data[1];

                    if (!validateUsername(username) || !validatePassword(password)) {
                        emit("AUTH_RESULT", { success: false, error: 'Invalid username or password format' });
                        break;
                    }

                    try {
                        const result = await accountManager.validatePassword(username, password);

                        if (result.success) {
                            if (result.duplicateSessionDetected) {
                                const duplicateMessage = "Your account was accessed from multiple locations. Both sessions have been terminated for security.";
                                
                                game.players.forEach(p => {
                                    if (p.accountId === result.account.accountId && p.id !== player.id) {
                                        try {
                                            const pSocket = game.getPlayerSocket(p.id);
                                            if (pSocket && pSocket.readyState === 1) {
                                                pSocket.send(encode(['SECURITY_KICK', [duplicateMessage]]));
                                                setTimeout(() => {
                                                    try { pSocket.close(4011); } catch(e) {}
                                                }, 100);
                                            }
                                        } catch(e) {}
                                        
                                        accountManager.removeSession(p.accountUsername);
                                    }
                                });
                                
                                sessionStore.invalidateUserSessions(result.account.accountId);
                                
                                emit("SECURITY_KICK", duplicateMessage);
                                setTimeout(() => {
                                    try { socket.close(4011); } catch(e) {}
                                }, 100);
                                break;
                            }
                            
                            if (player.account) {
                                accountManager.removeSession(player.account.username);
                                await accountManager.saveClientPlayTime(player.id);
                            }

                            player.account = result.account;
                            player.accountUsername = result.account.username;
                            player.accountId = result.account.accountId;
                            player.joinedAt = Date.now();
                            
                            if (result.account.adminLevel > AdminLevel.None) {
                                player.isAdmin = true;
                                player.adminLevel = result.account.adminLevel;
                            }

                            accountManager.addSession(username);
                            accountManager.trackClientSession(player.id, result.account.username, player.joinedAt);

                            emit("AUTH_RESULT", { 
                                success: true, 
                                account: result.account,
                                message: `Logged in as ${result.account.displayName}`
                            });

                            console.log(`[Account] Player ${player.sid} authenticated as ${result.account.username} (Admin Level: ${result.account.adminLevel})`);
                        } else {
                            emit("AUTH_RESULT", { success: false, error: result.error });
                        }
                    } catch (error) {
                        console.error('[Account] Auth error:', error);
                        emit("AUTH_RESULT", { success: false, error: 'Authentication failed' });
                    }

                    break;
                }
                case "REGISTER": {
                    if (!checkLoginRateLimit(addr)) {
                        emit("REGISTER_RESULT", { success: false, error: 'Too many attempts. Please wait.' });
                        break;
                    }

                    const username = sanitizeInput(data[0], 16);
                    const password = data[1];
                    const displayName = sanitizeInput(data[2] || data[0], 20);
                    const email = typeof data[3] === 'string' ? data[3].toLowerCase().trim() : '';

                    if (!validateUsername(username)) {
                        emit("REGISTER_RESULT", { success: false, error: 'Username must be 4-16 characters (letters, numbers, underscore only)' });
                        break;
                    }

                    if (!validatePassword(password)) {
                        emit("REGISTER_RESULT", { success: false, error: 'Password must be 8-30 characters' });
                        break;
                    }

                    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                        emit("REGISTER_RESULT", { success: false, error: 'A valid email address is required' });
                        break;
                    }

                    try {
                        const result = await accountManager.createAccount(username, password, displayName, email);

                        if (result.success) {
                            player.account = result.account;
                            player.accountUsername = result.account.username;
                            player.accountId = result.account.accountId;
                            accountManager.addSession(username);

                            emit("REGISTER_RESULT", { 
                                success: true, 
                                account: result.account,
                                message: `Account created! ID: ${result.account.accountId}`
                            });

                            console.log(`[Account] Player ${player.sid} registered as ${result.account.username} (ID: ${result.account.accountId})`);
                        } else {
                            emit("REGISTER_RESULT", { success: false, error: result.error });
                        }
                    } catch (error) {
                        console.error('[Account] Register error:', error);
                        emit("REGISTER_RESULT", { success: false, error: 'Registration failed' });
                    }

                    break;
                }
                case "INPUT_HEARTBEAT": {
                    if (!player.alive) break;

                    const heartbeatData = {
                        mouseMovements: data[0] || 0,
                        keystrokes: data[1] || 0,
                        clickPatterns: Array.isArray(data[2]) ? data[2] : []
                    };

                    const heartbeatResult = antiCheat.processHeartbeat(player.id, heartbeatData);
                    
                    if (heartbeatResult.suspicionScore > 20) {
                        antiCheat.checkAndEnforce(player.id, socket, addr);
                    }

                    break;
                }
                case "CREATE_PARTY": {
                    const partyCode = generatePartyCode();
                    player.partyCode = partyCode;
                    player.isPartyHost = true;
                    emit("PARTY_CREATED", { code: partyCode });
                    console.log(`[Party] Player ${player.sid} created party: ${partyCode}`);
                    break;
                }
                case "JOIN_PARTY": {
                    const code = data[0];
                    if (!code || typeof code !== 'string') {
                        emit("PARTY_JOIN_RESULT", { success: false, error: 'Party code required' });
                        break;
                    }
                    const host = game.players.find(p => p.partyCode === code && p.isPartyHost);
                    if (host) {
                        player.partyCode = code;
                        player.isPartyHost = false;
                        emit("PARTY_JOIN_RESULT", { success: true, code: code });
                        console.log(`[Party] Player ${player.sid} joined party: ${code}`);
                    } else {
                        emit("PARTY_JOIN_RESULT", { success: false, error: 'Party not found' });
                    }
                    break;
                }
                default:
                    console.log(`Unknown packet: ${t}`);
                    break;
            }

        } catch(e) {
            console.error("Error processing message from player:", e);

            
        }

    });

    socket.on("close", async reason => {

        clearInterval(sessionCheckInterval);
        
        colimit.down(addr);
        rateLimiter.removePlayer(player.id);
        antiCheat.removePlayer(player.id);
        
        if (player.sessionToken) {
            sessionStore.invalidateSession(player.sessionToken);
        }

        if (player.accountUsername) {
            accountManager.updateClientSessionStats(player.id, {
                kills: player.kills || 0,
                deaths: player.deaths || 0,
                score: player.points || 0
            });
            
            accountManager.removeSession(player.accountUsername);
            await accountManager.saveClientPlayTime(player.id);
        }

        if (player.team) {

            if (player.is_owner) {
                game.clan_manager.remove(player.team);
            } else {
                game.clan_manager.kick(player.team, player.sid);
            }

        }

        game.removePlayer(player.id);

    });

});

setInterval(() => {
    const result = sessionStore.cleanupExpiredSessions();
    if (result.cleanedCount > 0) {
        console.log(`[SessionStore] Cleanup: removed ${result.cleanedCount} expired sessions, ${result.remainingSessions} remaining`);
    }
}, SESSION_CLEANUP_INTERVAL);

server.listen(PORT, HOST, (error) => {

    if (error) {
        throw error;
    }

    const address = server.address();
    const listenHost = typeof address === "string" ? address : address?.address ?? HOST;
    const listenPort = typeof address === "string" ? PORT : address?.port ?? PORT;
    console.log(`Server listening at http://${listenHost}:${listenPort}`);
    console.log(`[SessionStore] Session cleanup scheduled every ${SESSION_CLEANUP_INTERVAL / 1000}s`);

});
