const HEARTBEAT_INTERVAL = 5000;
const MIN_MOUSE_MOVEMENTS_PER_INTERVAL = 3;
const MIN_CLICK_VARIANCE = 30;
const CLICK_PATTERN_SAMPLE_SIZE = 10;
const ACTIVE_GAMEPLAY_THRESHOLD = 5;

export class ActivityMonitor {
    constructor() {
        this.playerData = new Map();
    }

    getPlayerData(playerId) {
        if (!this.playerData.has(playerId)) {
            this.playerData.set(playerId, {
                heartbeats: [],
                lastHeartbeat: 0,
                totalMouseMovements: 0,
                totalKeystrokes: 0,
                allClickPatterns: [],
                gameplayActions: 0,
                noMouseMovementStreak: 0,
                suspicionScore: 0,
                violations: [],
                isActive: false
            });
        }
        return this.playerData.get(playerId);
    }

    processHeartbeat(playerId, heartbeatData) {
        const data = this.getPlayerData(playerId);
        const now = Date.now();
        const results = {
            valid: true,
            suspicionScore: 0,
            violations: []
        };

        const { mouseMovements, keystrokes, clickPatterns } = heartbeatData;

        data.heartbeats.push({
            timestamp: now,
            mouseMovements: mouseMovements || 0,
            keystrokes: keystrokes || 0,
            clickPatterns: clickPatterns || []
        });

        if (data.heartbeats.length > 20) {
            data.heartbeats.shift();
        }

        data.totalMouseMovements += mouseMovements || 0;
        data.totalKeystrokes += keystrokes || 0;

        if (Array.isArray(clickPatterns)) {
            data.allClickPatterns.push(...clickPatterns);
            if (data.allClickPatterns.length > 100) {
                data.allClickPatterns = data.allClickPatterns.slice(-100);
            }
        }

        if (data.isActive && (mouseMovements || 0) === 0) {
            data.noMouseMovementStreak++;

            if (data.noMouseMovementStreak >= 3 && data.gameplayActions > ACTIVE_GAMEPLAY_THRESHOLD) {
                results.suspicionScore += 20;
                results.violations.push({
                    type: 'NO_MOUSE_MOVEMENT_DURING_GAMEPLAY',
                    severity: Math.min(1, data.noMouseMovementStreak / 10),
                    evidence: {
                        streak: data.noMouseMovementStreak,
                        gameplayActions: data.gameplayActions
                    }
                });
            }
        } else {
            data.noMouseMovementStreak = 0;
        }

        if (data.allClickPatterns.length >= CLICK_PATTERN_SAMPLE_SIZE) {
            const clickAnalysis = this.analyzeClickPatterns(data.allClickPatterns.slice(-CLICK_PATTERN_SAMPLE_SIZE));

            if (clickAnalysis.variance < MIN_CLICK_VARIANCE) {
                results.suspicionScore += 25;
                results.violations.push({
                    type: 'PERFECT_CLICK_PATTERN',
                    severity: Math.max(0, (MIN_CLICK_VARIANCE - clickAnalysis.variance) / MIN_CLICK_VARIANCE),
                    evidence: {
                        variance: clickAnalysis.variance,
                        threshold: MIN_CLICK_VARIANCE,
                        intervals: clickAnalysis.intervals
                    }
                });
            }

            if (clickAnalysis.perfectIntervals > CLICK_PATTERN_SAMPLE_SIZE * 0.7) {
                results.suspicionScore += 30;
                results.violations.push({
                    type: 'AUTOMATED_CLICKING',
                    severity: 0.9,
                    evidence: {
                        perfectIntervals: clickAnalysis.perfectIntervals,
                        totalIntervals: clickAnalysis.intervals.length
                    }
                });
            }
        }

        data.lastHeartbeat = now;
        data.suspicionScore = Math.max(data.suspicionScore, results.suspicionScore);

        if (results.violations.length > 0) {
            data.violations.push(...results.violations);
            if (data.violations.length > 30) {
                data.violations = data.violations.slice(-30);
            }
        }

        return results;
    }

    analyzeClickPatterns(timestamps) {
        const intervals = [];

        for (let i = 1; i < timestamps.length; i++) {
            intervals.push(timestamps[i] - timestamps[i - 1]);
        }

        if (intervals.length < 2) {
            return { variance: Infinity, intervals, perfectIntervals: 0 };
        }

        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((acc, i) => acc + Math.pow(i - mean, 2), 0) / intervals.length;

        let perfectIntervals = 0;
        const tolerance = 5;

        for (let i = 1; i < intervals.length; i++) {
            if (Math.abs(intervals[i] - intervals[i - 1]) <= tolerance) {
                perfectIntervals++;
            }
        }

        return {
            variance,
            mean,
            intervals,
            perfectIntervals
        };
    }

    recordGameplayAction(playerId) {
        const data = this.getPlayerData(playerId);
        data.gameplayActions++;
        data.isActive = true;
    }

    setPlayerActive(playerId, active) {
        const data = this.getPlayerData(playerId);
        data.isActive = active;
    }

    analyzePlayer(playerId) {
        const data = this.getPlayerData(playerId);
        const results = {
            suspicionScore: data.suspicionScore,
            violations: data.violations,
            stats: {
                totalMouseMovements: data.totalMouseMovements,
                totalKeystrokes: data.totalKeystrokes,
                totalHeartbeats: data.heartbeats.length,
                gameplayActions: data.gameplayActions,
                noMouseMovementStreak: data.noMouseMovementStreak
            }
        };

        if (data.heartbeats.length >= 5) {
            const recentHeartbeats = data.heartbeats.slice(-5);
            const totalMouseInRecent = recentHeartbeats.reduce((acc, h) => acc + h.mouseMovements, 0);
            const totalKeysInRecent = recentHeartbeats.reduce((acc, h) => acc + h.keystrokes, 0);

            if (totalMouseInRecent === 0 && data.gameplayActions > 10) {
                results.suspicionScore += 15;
                results.violations.push({
                    type: 'SUSTAINED_NO_MOUSE',
                    severity: 0.6,
                    evidence: {
                        heartbeatsAnalyzed: 5,
                        totalMouse: totalMouseInRecent,
                        gameplayActions: data.gameplayActions
                    }
                });
            }

            if (totalKeysInRecent > 0 && totalMouseInRecent === 0 && data.gameplayActions > 5) {
                results.suspicionScore += 10;
                results.violations.push({
                    type: 'KEYBOARD_ONLY_GAMEPLAY',
                    severity: 0.4,
                    evidence: {
                        keystrokes: totalKeysInRecent,
                        mouseMovements: totalMouseInRecent
                    }
                });
            }
        }

        return results;
    }

    checkHeartbeatTimeout(playerId, timeoutMs = HEARTBEAT_INTERVAL * 3) {
        const data = this.getPlayerData(playerId);
        const now = Date.now();

        if (data.lastHeartbeat > 0 && data.isActive) {
            return (now - data.lastHeartbeat) > timeoutMs;
        }

        return false;
    }

    removePlayer(playerId) {
        this.playerData.delete(playerId);
    }

    getStats() {
        const stats = {
            totalPlayers: this.playerData.size,
            activePlayers: 0,
            flaggedPlayers: 0,
            totalHeartbeats: 0
        };

        for (const [playerId, data] of this.playerData.entries()) {
            if (data.isActive) {
                stats.activePlayers++;
            }
            if (data.suspicionScore > 0) {
                stats.flaggedPlayers++;
            }
            stats.totalHeartbeats += data.heartbeats.length;
        }

        return stats;
    }
}

export const activityMonitor = new ActivityMonitor();
