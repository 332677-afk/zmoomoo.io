const POSITION_HISTORY_SIZE = 20;
const TELEPORT_THRESHOLD_MULTIPLIER = 15;
const SPEED_VIOLATION_MULTIPLIER = 1.5;
const MAX_SPEED_SAMPLES = 10;
const WALL_BYPASS_CHECK_SAMPLES = 5;

export class MovementValidator {
    constructor(config) {
        this.config = config;
        this.playerData = new Map();
        this.basePlayerSpeed = config.playerSpeed || 0.0016;
        this.mapScale = config.mapScale || 14400;
        this.playerScale = config.playerScale || 35;
    }

    getPlayerData(playerId) {
        if (!this.playerData.has(playerId)) {
            this.playerData.set(playerId, {
                positionHistory: [],
                speedHistory: [],
                lastPosition: null,
                lastUpdateTime: 0,
                suspicionScore: 0,
                violations: [],
                teleportCount: 0,
                speedViolationCount: 0,
                wallBypassCount: 0
            });
        }
        return this.playerData.get(playerId);
    }

    calculateDistance(x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    }

    calculateMaxAllowedSpeed(player, delta) {
        let speedMultiplier = 1;

        if (player.speedMultiplier) {
            speedMultiplier *= player.speedMultiplier;
        }

        if (player.skin && player.skin.spdMult) {
            speedMultiplier *= player.skin.spdMult;
        }

        if (player.tail && player.tail.spdMult) {
            speedMultiplier *= player.tail.spdMult;
        }

        if (player.items && player.items.weapons && player.weaponIndex !== undefined) {
            const weapon = player.items.weapons[player.weaponIndex];
            if (weapon && weapon.spdMult) {
                speedMultiplier *= weapon.spdMult;
            }
        }

        const baseSpeed = this.basePlayerSpeed * speedMultiplier;
        const maxDistance = baseSpeed * delta * SPEED_VIOLATION_MULTIPLIER;

        return maxDistance + 50;
    }

    recordPosition(playerId, x, y, timestamp = Date.now()) {
        const data = this.getPlayerData(playerId);

        data.positionHistory.push({ x, y, timestamp });

        if (data.positionHistory.length > POSITION_HISTORY_SIZE) {
            data.positionHistory.shift();
        }

        if (data.lastPosition && data.lastUpdateTime > 0) {
            const distance = this.calculateDistance(
                data.lastPosition.x,
                data.lastPosition.y,
                x,
                y
            );
            const timeDelta = timestamp - data.lastUpdateTime;

            if (timeDelta > 0) {
                const speed = distance / timeDelta;
                data.speedHistory.push(speed);

                if (data.speedHistory.length > MAX_SPEED_SAMPLES) {
                    data.speedHistory.shift();
                }
            }
        }

        data.lastPosition = { x, y };
        data.lastUpdateTime = timestamp;
    }

    validateMovement(player, newX, newY, delta) {
        const data = this.getPlayerData(player.id || player.sid);
        const results = {
            valid: true,
            violations: [],
            suspicionScore: 0
        };

        if (!data.lastPosition) {
            this.recordPosition(player.id || player.sid, newX, newY);
            return results;
        }

        const distance = this.calculateDistance(
            data.lastPosition.x,
            data.lastPosition.y,
            newX,
            newY
        );

        if (player.noclipMode || player.ghostMode || player.isAdmin) {
            this.recordPosition(player.id || player.sid, newX, newY);
            return results;
        }

        const teleportThreshold = this.playerScale * TELEPORT_THRESHOLD_MULTIPLIER;
        if (distance > teleportThreshold) {
            const hasValidReason = this.checkValidTeleport(player, distance);

            if (!hasValidReason) {
                data.teleportCount++;
                results.valid = false;
                results.suspicionScore += 40;
                results.violations.push({
                    type: 'TELEPORTATION',
                    severity: Math.min(1, distance / (teleportThreshold * 3)),
                    evidence: {
                        distance: distance,
                        threshold: teleportThreshold,
                        from: { x: data.lastPosition.x, y: data.lastPosition.y },
                        to: { x: newX, y: newY },
                        teleportCount: data.teleportCount
                    }
                });
            }
        }

        const maxAllowedDistance = this.calculateMaxAllowedSpeed(player, delta);
        if (distance > maxAllowedDistance && delta > 0) {
            const speedRatio = distance / maxAllowedDistance;

            if (speedRatio > 2) {
                data.speedViolationCount++;
                results.suspicionScore += Math.min(30, (speedRatio - 1) * 15);
                results.violations.push({
                    type: 'SPEED_HACK',
                    severity: Math.min(1, (speedRatio - 1) / 3),
                    evidence: {
                        actualDistance: distance,
                        maxAllowed: maxAllowedDistance,
                        ratio: speedRatio,
                        delta: delta,
                        speedViolationCount: data.speedViolationCount
                    }
                });

                if (data.speedViolationCount >= 5) {
                    results.valid = false;
                }
            }
        }

        this.recordPosition(player.id || player.sid, newX, newY);

        data.suspicionScore = results.suspicionScore;
        if (results.violations.length > 0) {
            data.violations.push(...results.violations);
            if (data.violations.length > 50) {
                data.violations = data.violations.slice(-50);
            }
        }

        return results;
    }

    checkValidTeleport(player, distance) {
        if (player.teleportClickMode) return true;
        if (player.isAdmin) return true;

        if (distance > this.mapScale * 0.8) return false;

        return false;
    }

    checkBoundaryViolation(player, x, y) {
        const violations = [];

        if (x < this.playerScale || x > this.mapScale - this.playerScale) {
            violations.push({
                type: 'BOUNDARY_VIOLATION_X',
                evidence: { x, minBound: this.playerScale, maxBound: this.mapScale - this.playerScale }
            });
        }

        if (y < this.playerScale || y > this.mapScale - this.playerScale) {
            violations.push({
                type: 'BOUNDARY_VIOLATION_Y',
                evidence: { y, minBound: this.playerScale, maxBound: this.mapScale - this.playerScale }
            });
        }

        return violations;
    }

    analyzeMovementPatterns(playerId) {
        const data = this.getPlayerData(playerId);
        const results = {
            suspicionScore: 0,
            violations: [],
            patterns: {}
        };

        if (data.positionHistory.length < WALL_BYPASS_CHECK_SAMPLES) {
            return results;
        }

        if (data.speedHistory.length >= MAX_SPEED_SAMPLES) {
            const avgSpeed = data.speedHistory.reduce((a, b) => a + b, 0) / data.speedHistory.length;
            const maxSpeed = Math.max(...data.speedHistory);
            const variance = data.speedHistory.reduce((acc, s) => acc + Math.pow(s - avgSpeed, 2), 0) / data.speedHistory.length;

            results.patterns.averageSpeed = avgSpeed;
            results.patterns.maxSpeed = maxSpeed;
            results.patterns.speedVariance = variance;

            if (variance < 0.0001 && avgSpeed > 0.001) {
                results.suspicionScore += 15;
                results.violations.push({
                    type: 'UNNATURALLY_CONSISTENT_SPEED',
                    severity: 0.5,
                    evidence: { avgSpeed, variance }
                });
            }
        }

        results.patterns.teleportCount = data.teleportCount;
        results.patterns.speedViolationCount = data.speedViolationCount;

        return results;
    }

    getSuspicionScore(playerId) {
        const data = this.getPlayerData(playerId);
        return data.suspicionScore;
    }

    getViolations(playerId) {
        const data = this.getPlayerData(playerId);
        return data.violations;
    }

    removePlayer(playerId) {
        this.playerData.delete(playerId);
    }

    getStats() {
        const stats = {
            totalPlayers: this.playerData.size,
            flaggedPlayers: 0,
            totalTeleports: 0,
            totalSpeedViolations: 0
        };

        for (const [playerId, data] of this.playerData.entries()) {
            if (data.suspicionScore > 0) {
                stats.flaggedPlayers++;
            }
            stats.totalTeleports += data.teleportCount;
            stats.totalSpeedViolations += data.speedViolationCount;
        }

        return stats;
    }
}

export function createMovementValidator(config) {
    return new MovementValidator(config);
}
