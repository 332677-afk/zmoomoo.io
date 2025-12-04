import { TelemetryAnalyzer, telemetryAnalyzer } from './telemetry.js';
import { MovementValidator, createMovementValidator } from './movement.js';
import { ActivityMonitor, activityMonitor } from './activity.js';
import { ActionValidator, createActionValidator } from './actions.js';

const SUSPICION_THRESHOLDS = {
    WARNING: 50,
    KICK: 70,
    BAN: 90
};

const SUSPICION_DECAY_RATE = 0.95;
const SUSPICION_DECAY_INTERVAL = 30000;
const LOG_RETENTION_COUNT = 100;

export class AntiCheatController {
    constructor(config, items) {
        this.config = config;
        this.items = items;

        this.telemetry = telemetryAnalyzer;
        this.movement = createMovementValidator(config);
        this.activity = activityMonitor;
        this.actions = createActionValidator(config, items);

        this.playerScores = new Map();
        this.detectionLogs = [];
        this.bannedPlayers = new Map();
        this.kickedPlayers = new Map();
        this.warnings = new Map();

        this.callbacks = {
            onWarning: null,
            onKick: null,
            onBan: null
        };

        this.decayInterval = setInterval(() => this.decayAllScores(), SUSPICION_DECAY_INTERVAL);
    }

    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    getPlayerScore(playerId) {
        if (!this.playerScores.has(playerId)) {
            this.playerScores.set(playerId, {
                total: 0,
                components: {
                    telemetry: 0,
                    movement: 0,
                    activity: 0,
                    actions: 0
                },
                lastUpdate: Date.now(),
                warningCount: 0,
                kickCount: 0
            });
        }
        return this.playerScores.get(playerId);
    }

    updatePlayerScore(playerId) {
        const score = this.getPlayerScore(playerId);

        const telemetryResult = this.telemetry.analyzePlayer(playerId);
        const movementResult = this.movement.analyzeMovementPatterns(playerId);
        const activityResult = this.activity.analyzePlayer(playerId);
        const actionsResult = this.actions.analyzePlayer(playerId);

        score.components.telemetry = telemetryResult.suspicionScore;
        score.components.movement = movementResult.suspicionScore + this.movement.getSuspicionScore(playerId);
        score.components.activity = activityResult.suspicionScore;
        score.components.actions = actionsResult.suspicionScore;

        score.total = Math.min(100,
            score.components.telemetry * 0.3 +
            score.components.movement * 0.25 +
            score.components.activity * 0.2 +
            score.components.actions * 0.25
        );

        score.lastUpdate = Date.now();

        return score;
    }

    checkAndEnforce(playerId, playerSocket, playerIpAddress) {
        const score = this.updatePlayerScore(playerId);
        const action = this.determineAction(score.total);

        if (action !== 'NONE') {
            this.logDetection(playerId, playerIpAddress, score, action);
        }

        switch (action) {
            case 'WARNING':
                this.issueWarning(playerId, playerSocket, score);
                break;
            case 'KICK':
                this.kickPlayer(playerId, playerSocket, score);
                break;
            case 'BAN':
                this.banPlayer(playerId, playerSocket, playerIpAddress, score);
                break;
        }

        return { score: score.total, action };
    }

    determineAction(totalScore) {
        if (totalScore >= SUSPICION_THRESHOLDS.BAN) {
            return 'BAN';
        } else if (totalScore >= SUSPICION_THRESHOLDS.KICK) {
            return 'KICK';
        } else if (totalScore >= SUSPICION_THRESHOLDS.WARNING) {
            return 'WARNING';
        }
        return 'NONE';
    }

    issueWarning(playerId, playerSocket, score) {
        const playerScore = this.getPlayerScore(playerId);
        playerScore.warningCount++;

        const warningData = {
            playerId,
            score: score.total,
            components: score.components,
            warningCount: playerScore.warningCount,
            timestamp: Date.now()
        };

        this.warnings.set(playerId, warningData);

        if (this.callbacks.onWarning) {
            this.callbacks.onWarning(playerId, playerSocket, warningData);
        }

        console.log(`[AntiCheat] WARNING issued to player ${playerId} (score: ${score.total.toFixed(1)}, warnings: ${playerScore.warningCount})`);
    }

    kickPlayer(playerId, playerSocket, score) {
        const playerScore = this.getPlayerScore(playerId);
        playerScore.kickCount++;

        const kickData = {
            playerId,
            score: score.total,
            components: score.components,
            kickCount: playerScore.kickCount,
            timestamp: Date.now()
        };

        this.kickedPlayers.set(playerId, kickData);

        if (this.callbacks.onKick) {
            this.callbacks.onKick(playerId, playerSocket, kickData);
        }

        console.log(`[AntiCheat] KICK player ${playerId} (score: ${score.total.toFixed(1)}, kicks: ${playerScore.kickCount})`);
    }

    banPlayer(playerId, playerSocket, ipAddress, score) {
        const banData = {
            playerId,
            ipAddress,
            score: score.total,
            components: score.components,
            timestamp: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000)
        };

        this.bannedPlayers.set(playerId, banData);
        if (ipAddress) {
            this.bannedPlayers.set(`ip:${ipAddress}`, banData);
        }

        if (this.callbacks.onBan) {
            this.callbacks.onBan(playerId, playerSocket, ipAddress, banData);
        }

        console.log(`[AntiCheat] BAN player ${playerId} (IP: ${ipAddress}, score: ${score.total.toFixed(1)})`);
    }

    isBanned(playerIdOrIp) {
        if (this.bannedPlayers.has(playerIdOrIp)) {
            const ban = this.bannedPlayers.get(playerIdOrIp);
            if (Date.now() < ban.expiresAt) {
                return true;
            }
            this.bannedPlayers.delete(playerIdOrIp);
        }
        if (this.bannedPlayers.has(`ip:${playerIdOrIp}`)) {
            const ban = this.bannedPlayers.get(`ip:${playerIdOrIp}`);
            if (Date.now() < ban.expiresAt) {
                return true;
            }
            this.bannedPlayers.delete(`ip:${playerIdOrIp}`);
        }
        return false;
    }

    logDetection(playerId, ipAddress, score, action) {
        const logEntry = {
            timestamp: Date.now(),
            playerId,
            ipAddress,
            score: score.total,
            components: { ...score.components },
            action,
            violations: this.collectAllViolations(playerId)
        };

        this.detectionLogs.push(logEntry);

        if (this.detectionLogs.length > LOG_RETENTION_COUNT) {
            this.detectionLogs.shift();
        }

        console.log(`[AntiCheat] Detection: Player ${playerId} | Action: ${action} | Score: ${score.total.toFixed(1)} | Components: T:${score.components.telemetry.toFixed(0)} M:${score.components.movement.toFixed(0)} A:${score.components.activity.toFixed(0)} C:${score.components.actions.toFixed(0)}`);
    }

    collectAllViolations(playerId) {
        const violations = [];

        const telemetryResult = this.telemetry.analyzePlayer(playerId);
        if (telemetryResult.violations) {
            violations.push(...telemetryResult.violations.map(v => ({ ...v, source: 'telemetry' })));
        }

        const movementViolations = this.movement.getViolations(playerId);
        if (movementViolations) {
            violations.push(...movementViolations.map(v => ({ ...v, source: 'movement' })));
        }

        const activityResult = this.activity.analyzePlayer(playerId);
        if (activityResult.violations) {
            violations.push(...activityResult.violations.map(v => ({ ...v, source: 'activity' })));
        }

        const actionsResult = this.actions.analyzePlayer(playerId);
        if (actionsResult.violations) {
            violations.push(...actionsResult.violations.map(v => ({ ...v, source: 'actions' })));
        }

        return violations;
    }

    decayAllScores() {
        for (const [playerId, score] of this.playerScores.entries()) {
            score.components.telemetry *= SUSPICION_DECAY_RATE;
            score.components.movement *= SUSPICION_DECAY_RATE;
            score.components.activity *= SUSPICION_DECAY_RATE;
            score.components.actions *= SUSPICION_DECAY_RATE;

            score.total = Math.min(100,
                score.components.telemetry * 0.3 +
                score.components.movement * 0.25 +
                score.components.activity * 0.2 +
                score.components.actions * 0.25
            );

            if (score.total < 1) {
                score.total = 0;
                score.components = { telemetry: 0, movement: 0, activity: 0, actions: 0 };
            }
        }
    }

    recordInput(playerId, timestamp) {
        this.telemetry.recordInput(playerId, timestamp);
    }

    recordAttack(playerId, timestamp) {
        this.telemetry.recordAttack(playerId, timestamp);
    }

    validateMovement(player, newX, newY, delta) {
        return this.movement.validateMovement(player, newX, newY, delta);
    }

    recordPosition(playerId, x, y, timestamp) {
        this.movement.recordPosition(playerId, x, y, timestamp);
    }

    processHeartbeat(playerId, heartbeatData) {
        return this.activity.processHeartbeat(playerId, heartbeatData);
    }

    recordGameplayAction(playerId) {
        this.activity.recordGameplayAction(playerId);
    }

    setPlayerActive(playerId, active) {
        this.activity.setPlayerActive(playerId, active);
    }

    validateResourceSpending(player, resourceType, amount) {
        return this.actions.validateResourceSpending(player, resourceType, amount);
    }

    validateBuildPlacement(player, item, targetX, targetY) {
        return this.actions.validateBuildPlacement(player, item, targetX, targetY);
    }

    validateAttackTiming(player, weaponIndex) {
        return this.actions.validateAttackTiming(player, weaponIndex);
    }

    validateItemPurchase(player, item, itemType) {
        return this.actions.validateItemPurchase(player, item, itemType);
    }

    validateUpgrade(player, upgradeIndex) {
        return this.actions.validateUpgrade(player, upgradeIndex);
    }

    removePlayer(playerId) {
        this.telemetry.removePlayer(playerId);
        this.movement.removePlayer(playerId);
        this.activity.removePlayer(playerId);
        this.actions.removePlayer(playerId);
        this.playerScores.delete(playerId);
        this.warnings.delete(playerId);
    }

    getFlaggedPlayers() {
        const flagged = [];

        for (const [playerId, score] of this.playerScores.entries()) {
            if (score.total >= SUSPICION_THRESHOLDS.WARNING) {
                flagged.push({
                    playerId,
                    score: score.total,
                    components: score.components,
                    warningCount: score.warningCount,
                    kickCount: score.kickCount,
                    lastUpdate: score.lastUpdate
                });
            }
        }

        return flagged.sort((a, b) => b.score - a.score);
    }

    getDetectionLogs(limit = 50) {
        return this.detectionLogs.slice(-limit);
    }

    getBannedPlayers() {
        const banned = [];
        const now = Date.now();

        for (const [key, ban] of this.bannedPlayers.entries()) {
            if (!key.startsWith('ip:') && now < ban.expiresAt) {
                banned.push({
                    playerId: key,
                    ipAddress: ban.ipAddress,
                    score: ban.score,
                    bannedAt: ban.timestamp,
                    expiresAt: ban.expiresAt
                });
            }
        }

        return banned;
    }

    getStats() {
        return {
            telemetry: this.telemetry.getStats(),
            movement: this.movement.getStats(),
            activity: this.activity.getStats(),
            actions: this.actions.getStats(),
            totalTrackedPlayers: this.playerScores.size,
            flaggedPlayers: this.getFlaggedPlayers().length,
            bannedPlayers: this.getBannedPlayers().length,
            detectionLogsCount: this.detectionLogs.length,
            thresholds: SUSPICION_THRESHOLDS
        };
    }

    clearPlayerData(playerId) {
        this.removePlayer(playerId);
    }

    unbanPlayer(playerIdOrIp) {
        this.bannedPlayers.delete(playerIdOrIp);
        this.bannedPlayers.delete(`ip:${playerIdOrIp}`);
    }

    destroy() {
        if (this.decayInterval) {
            clearInterval(this.decayInterval);
        }
    }
}

export function createAntiCheatController(config, items) {
    return new AntiCheatController(config, items);
}

export {
    TelemetryAnalyzer,
    MovementValidator,
    ActivityMonitor,
    ActionValidator,
    SUSPICION_THRESHOLDS
};
