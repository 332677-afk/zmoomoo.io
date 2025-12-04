const TIMING_HISTORY_SIZE = 50;
const MIN_TIMING_SAMPLES = 10;
const BOT_STDDEV_THRESHOLD = 50;
const MAX_ATTACKS_PER_SECOND = 15;
const PERFECT_INTERVAL_TOLERANCE = 5;
const PERFECT_INTERVAL_COUNT_THRESHOLD = 8;

export class TelemetryAnalyzer {
    constructor() {
        this.playerData = new Map();
    }

    getPlayerData(playerId) {
        if (!this.playerData.has(playerId)) {
            this.playerData.set(playerId, {
                inputTimings: [],
                attackTimings: [],
                lastInputTime: 0,
                lastAttackTime: 0,
                suspicionScore: 0,
                violations: [],
                attacksInWindow: 0,
                windowStart: Date.now()
            });
        }
        return this.playerData.get(playerId);
    }

    recordInput(playerId, timestamp = Date.now()) {
        const data = this.getPlayerData(playerId);
        
        if (data.lastInputTime > 0) {
            const interval = timestamp - data.lastInputTime;
            data.inputTimings.push(interval);
            
            if (data.inputTimings.length > TIMING_HISTORY_SIZE) {
                data.inputTimings.shift();
            }
        }
        
        data.lastInputTime = timestamp;
    }

    recordAttack(playerId, timestamp = Date.now()) {
        const data = this.getPlayerData(playerId);
        
        if (data.lastAttackTime > 0) {
            const interval = timestamp - data.lastAttackTime;
            data.attackTimings.push(interval);
            
            if (data.attackTimings.length > TIMING_HISTORY_SIZE) {
                data.attackTimings.shift();
            }
        }
        
        data.lastAttackTime = timestamp;
        
        const now = Date.now();
        if (now - data.windowStart >= 1000) {
            data.attacksInWindow = 0;
            data.windowStart = now;
        }
        data.attacksInWindow++;
    }

    calculateStandardDeviation(values) {
        if (values.length < 2) return Infinity;
        
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
        
        return Math.sqrt(variance);
    }

    detectPerfectIntervals(timings) {
        if (timings.length < PERFECT_INTERVAL_COUNT_THRESHOLD) return null;
        
        const recentTimings = timings.slice(-PERFECT_INTERVAL_COUNT_THRESHOLD);
        const firstInterval = recentTimings[0];
        
        let perfectCount = 0;
        for (const interval of recentTimings) {
            if (Math.abs(interval - firstInterval) <= PERFECT_INTERVAL_TOLERANCE) {
                perfectCount++;
            }
        }
        
        if (perfectCount >= PERFECT_INTERVAL_COUNT_THRESHOLD) {
            return {
                detected: true,
                interval: firstInterval,
                count: perfectCount
            };
        }
        
        return null;
    }

    analyzePlayer(playerId) {
        const data = this.getPlayerData(playerId);
        const results = {
            suspicionScore: 0,
            violations: [],
            details: {}
        };

        if (data.inputTimings.length >= MIN_TIMING_SAMPLES) {
            const inputStdDev = this.calculateStandardDeviation(data.inputTimings);
            results.details.inputStandardDeviation = inputStdDev;
            
            if (inputStdDev < BOT_STDDEV_THRESHOLD) {
                const severity = Math.max(0, (BOT_STDDEV_THRESHOLD - inputStdDev) / BOT_STDDEV_THRESHOLD);
                results.suspicionScore += Math.round(30 * severity);
                results.violations.push({
                    type: 'CONSISTENT_INPUT_TIMING',
                    severity: severity,
                    evidence: {
                        standardDeviation: inputStdDev,
                        threshold: BOT_STDDEV_THRESHOLD,
                        sampleSize: data.inputTimings.length
                    }
                });
            }

            const perfectInputIntervals = this.detectPerfectIntervals(data.inputTimings);
            if (perfectInputIntervals) {
                results.suspicionScore += 25;
                results.violations.push({
                    type: 'PERFECT_INPUT_INTERVALS',
                    severity: 0.8,
                    evidence: perfectInputIntervals
                });
            }
        }

        if (data.attackTimings.length >= MIN_TIMING_SAMPLES) {
            const attackStdDev = this.calculateStandardDeviation(data.attackTimings);
            results.details.attackStandardDeviation = attackStdDev;
            
            if (attackStdDev < BOT_STDDEV_THRESHOLD) {
                const severity = Math.max(0, (BOT_STDDEV_THRESHOLD - attackStdDev) / BOT_STDDEV_THRESHOLD);
                results.suspicionScore += Math.round(35 * severity);
                results.violations.push({
                    type: 'CONSISTENT_ATTACK_TIMING',
                    severity: severity,
                    evidence: {
                        standardDeviation: attackStdDev,
                        threshold: BOT_STDDEV_THRESHOLD,
                        sampleSize: data.attackTimings.length
                    }
                });
            }

            const perfectAttackIntervals = this.detectPerfectIntervals(data.attackTimings);
            if (perfectAttackIntervals) {
                results.suspicionScore += 30;
                results.violations.push({
                    type: 'PERFECT_ATTACK_INTERVALS',
                    severity: 0.9,
                    evidence: perfectAttackIntervals
                });
            }
        }

        if (data.attacksInWindow > MAX_ATTACKS_PER_SECOND) {
            const excessAttacks = data.attacksInWindow - MAX_ATTACKS_PER_SECOND;
            results.suspicionScore += Math.min(40, excessAttacks * 5);
            results.violations.push({
                type: 'EXCESSIVE_ATTACK_RATE',
                severity: Math.min(1, excessAttacks / 10),
                evidence: {
                    attacksPerSecond: data.attacksInWindow,
                    maximum: MAX_ATTACKS_PER_SECOND
                }
            });
        }

        data.suspicionScore = results.suspicionScore;
        data.violations = results.violations;

        return results;
    }

    getAttacksPerSecond(playerId) {
        const data = this.getPlayerData(playerId);
        return data.attacksInWindow;
    }

    removePlayer(playerId) {
        this.playerData.delete(playerId);
    }

    getStats() {
        const stats = {
            totalPlayers: this.playerData.size,
            flaggedPlayers: 0,
            playerScores: []
        };

        for (const [playerId, data] of this.playerData.entries()) {
            if (data.suspicionScore > 0) {
                stats.flaggedPlayers++;
                stats.playerScores.push({
                    playerId,
                    score: data.suspicionScore,
                    violations: data.violations.length
                });
            }
        }

        stats.playerScores.sort((a, b) => b.score - a.score);

        return stats;
    }
}

export const telemetryAnalyzer = new TelemetryAnalyzer();
