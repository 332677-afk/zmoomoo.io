const BUILD_DISTANCE_MULTIPLIER = 3;
const ATTACK_COOLDOWN_TOLERANCE = 0.8;
const RESOURCE_SYNC_TOLERANCE = 10;
const HAT_SWITCH_COOLDOWN = 100;
const RAPID_HAT_SWITCH_THRESHOLD = 3;
const HEAL_COOLDOWN_MS = 300;
const PERFECT_HEAL_TOLERANCE_MS = 10;
const RAPID_HEAL_THRESHOLD = 5;

export class ActionValidator {
    constructor(config, items) {
        this.config = config;
        this.items = items;
        this.playerData = new Map();
        this.playerScale = config.playerScale || 35;
    }

    getPlayerData(playerId) {
        if (!this.playerData.has(playerId)) {
            this.playerData.set(playerId, {
                lastAttackTimes: new Map(),
                lastBuildTime: 0,
                resourceSpendingHistory: [],
                suspicionScore: 0,
                violations: [],
                invalidActionCount: 0,
                hatSwitchTimings: [],
                lastHatSwitchTime: 0,
                rapidHatSwitchCount: 0,
                healTimings: [],
                lastHealTime: 0,
                rapidHealCount: 0
            });
        }
        return this.playerData.get(playerId);
    }

    validateResourceSpending(player, resourceType, amount) {
        const results = {
            valid: true,
            violations: [],
            suspicionScore: 0
        };

        const currentAmount = player[resourceType] || 0;

        if (amount > currentAmount + RESOURCE_SYNC_TOLERANCE) {
            const data = this.getPlayerData(player.id || player.sid);
            data.invalidActionCount++;

            results.valid = false;
            results.suspicionScore += 30;
            results.violations.push({
                type: 'RESOURCE_SPENDING_VIOLATION',
                severity: Math.min(1, (amount - currentAmount) / 100),
                evidence: {
                    resourceType,
                    attemptedSpend: amount,
                    currentAmount,
                    deficit: amount - currentAmount
                }
            });

            this.recordViolation(player.id || player.sid, results.violations[0]);
        }

        return results;
    }

    validateBuildPlacement(player, item, targetX, targetY) {
        const results = {
            valid: true,
            violations: [],
            suspicionScore: 0
        };

        if (player.isAdmin || player.infiniteBuild) {
            return results;
        }

        const placeOffset = item.placeOffset || 0;
        const expectedDistance = player.scale + item.scale + placeOffset;
        const maxAllowedDistance = expectedDistance * BUILD_DISTANCE_MULTIPLIER;

        const actualDistance = Math.sqrt(
            Math.pow(targetX - player.x, 2) + Math.pow(targetY - player.y, 2)
        );

        if (actualDistance > maxAllowedDistance) {
            const data = this.getPlayerData(player.id || player.sid);
            data.invalidActionCount++;

            results.valid = false;
            results.suspicionScore += 25;
            results.violations.push({
                type: 'BUILD_DISTANCE_VIOLATION',
                severity: Math.min(1, (actualDistance - maxAllowedDistance) / maxAllowedDistance),
                evidence: {
                    itemId: item.id,
                    itemName: item.name,
                    actualDistance,
                    maxAllowed: maxAllowedDistance,
                    playerPosition: { x: player.x, y: player.y },
                    targetPosition: { x: targetX, y: targetY }
                }
            });

            this.recordViolation(player.id || player.sid, results.violations[0]);
        }

        if (!this.config.isSandbox && !player.infiniteBuild) {
            const hasResources = this.checkBuildResources(player, item);
            if (!hasResources.valid) {
                results.valid = false;
                results.suspicionScore += hasResources.suspicionScore;
                results.violations.push(...hasResources.violations);
            }
        }

        return results;
    }

    checkBuildResources(player, item) {
        const results = {
            valid: true,
            violations: [],
            suspicionScore: 0
        };

        if (!item.req) return results;

        for (let i = 0; i < item.req.length; i += 2) {
            const resourceType = item.req[i];
            const requiredAmount = item.req[i + 1];
            const currentAmount = player[resourceType] || 0;

            if (currentAmount < requiredAmount) {
                results.valid = false;
                results.suspicionScore += 20;
                results.violations.push({
                    type: 'INSUFFICIENT_BUILD_RESOURCES',
                    severity: 0.7,
                    evidence: {
                        resourceType,
                        required: requiredAmount,
                        current: currentAmount,
                        itemName: item.name
                    }
                });
            }
        }

        return results;
    }

    validateAttackTiming(player, weaponIndex) {
        const results = {
            valid: true,
            violations: [],
            suspicionScore: 0
        };

        if (player.gatlingMode || player.isAdmin) {
            return results;
        }

        const data = this.getPlayerData(player.id || player.sid);
        const now = Date.now();

        const weapons = this.items?.weapons || [];
        const weapon = weapons[weaponIndex];

        if (!weapon) {
            return results;
        }

        const weaponSpeed = weapon.speed || 300;
        let speedMultiplier = 1;

        if (player.weaponSpeed && player.weaponSpeed !== 1) {
            speedMultiplier = 1 / player.weaponSpeed;
        }

        if (player.skin && player.skin.atkSpd) {
            speedMultiplier *= player.skin.atkSpd;
        }

        const expectedCooldown = weaponSpeed * speedMultiplier * ATTACK_COOLDOWN_TOLERANCE;

        const lastAttackTime = data.lastAttackTimes.get(weaponIndex) || 0;
        const timeSinceLastAttack = now - lastAttackTime;

        if (lastAttackTime > 0 && timeSinceLastAttack < expectedCooldown) {
            data.invalidActionCount++;

            results.suspicionScore += 15;
            results.violations.push({
                type: 'ATTACK_COOLDOWN_VIOLATION',
                severity: Math.min(1, (expectedCooldown - timeSinceLastAttack) / expectedCooldown),
                evidence: {
                    weaponIndex,
                    weaponName: weapon.name,
                    timeSinceLastAttack,
                    expectedCooldown,
                    weaponSpeed
                }
            });

            if (timeSinceLastAttack < expectedCooldown * 0.3) {
                results.valid = false;
                results.suspicionScore += 25;
            }

            this.recordViolation(player.id || player.sid, results.violations[0]);
        }

        data.lastAttackTimes.set(weaponIndex, now);

        return results;
    }

    validateItemPurchase(player, item, itemType) {
        const results = {
            valid: true,
            violations: [],
            suspicionScore: 0
        };

        if (!item || !item.price) {
            return results;
        }

        const playerPoints = player.points || 0;

        if (playerPoints < item.price) {
            const data = this.getPlayerData(player.id || player.sid);
            data.invalidActionCount++;

            results.valid = false;
            results.suspicionScore += 25;
            results.violations.push({
                type: 'INSUFFICIENT_POINTS_FOR_PURCHASE',
                severity: 0.8,
                evidence: {
                    itemType,
                    itemId: item.id,
                    itemName: item.name,
                    itemPrice: item.price,
                    playerPoints,
                    deficit: item.price - playerPoints
                }
            });

            this.recordViolation(player.id || player.sid, results.violations[0]);
        }

        return results;
    }

    validateUpgrade(player, upgradeIndex) {
        const results = {
            valid: true,
            violations: [],
            suspicionScore: 0
        };

        if (player.upgradePoints <= 0) {
            const data = this.getPlayerData(player.id || player.sid);
            data.invalidActionCount++;

            results.valid = false;
            results.suspicionScore += 30;
            results.violations.push({
                type: 'UPGRADE_WITHOUT_POINTS',
                severity: 0.9,
                evidence: {
                    upgradeIndex,
                    upgradePoints: player.upgradePoints || 0
                }
            });

            this.recordViolation(player.id || player.sid, results.violations[0]);
        }

        return results;
    }

    validateHatSwitch(player, hatId, timestamp = Date.now()) {
        const results = {
            valid: true,
            violations: [],
            suspicionScore: 0
        };

        const data = this.getPlayerData(player.id || player.sid);
        const timeSinceLastSwitch = timestamp - data.lastHatSwitchTime;

        if (data.lastHatSwitchTime > 0 && timeSinceLastSwitch < HAT_SWITCH_COOLDOWN) {
            data.rapidHatSwitchCount++;
            data.hatSwitchTimings.push(timeSinceLastSwitch);

            if (data.hatSwitchTimings.length > 20) {
                data.hatSwitchTimings.shift();
            }

            if (data.rapidHatSwitchCount >= RAPID_HAT_SWITCH_THRESHOLD) {
                data.invalidActionCount++;
                results.suspicionScore += 20;
                results.violations.push({
                    type: 'RAPID_HAT_SWITCHING',
                    severity: Math.min(1, data.rapidHatSwitchCount / 10),
                    evidence: {
                        hatId,
                        timeSinceLastSwitch,
                        rapidSwitchCount: data.rapidHatSwitchCount,
                        recentTimings: data.hatSwitchTimings.slice(-5),
                        threshold: HAT_SWITCH_COOLDOWN
                    }
                });

                this.recordViolation(player.id || player.sid, results.violations[0]);

                if (data.rapidHatSwitchCount >= 5) {
                    results.suspicionScore += 15;
                }
                if (data.rapidHatSwitchCount >= 10) {
                    results.valid = false;
                    results.suspicionScore += 25;
                }
            }
        } else {
            data.rapidHatSwitchCount = Math.max(0, data.rapidHatSwitchCount - 1);
        }

        data.lastHatSwitchTime = timestamp;

        return results;
    }

    validateHealAction(player, healAmount, timestamp = Date.now()) {
        const results = {
            valid: true,
            violations: [],
            suspicionScore: 0
        };

        const data = this.getPlayerData(player.id || player.sid);
        const timeSinceLastHeal = timestamp - data.lastHealTime;

        data.healTimings.push(timeSinceLastHeal);
        if (data.healTimings.length > 20) {
            data.healTimings.shift();
        }

        if (data.lastHealTime > 0 && timeSinceLastHeal < HEAL_COOLDOWN_MS) {
            data.rapidHealCount++;
            data.invalidActionCount++;

            results.suspicionScore += 15;
            results.violations.push({
                type: 'RAPID_HEALING',
                severity: Math.min(1, data.rapidHealCount / 10),
                evidence: {
                    healAmount,
                    timeSinceLastHeal,
                    rapidHealCount: data.rapidHealCount,
                    threshold: HEAL_COOLDOWN_MS
                }
            });

            this.recordViolation(player.id || player.sid, results.violations[0]);

            if (data.rapidHealCount >= RAPID_HEAL_THRESHOLD) {
                results.valid = false;
                results.suspicionScore += 25;
            }
        } else {
            data.rapidHealCount = Math.max(0, data.rapidHealCount - 1);
        }

        if (data.healTimings.length >= 5) {
            const recentTimings = data.healTimings.slice(-5);
            const avgTiming = recentTimings.reduce((a, b) => a + b, 0) / recentTimings.length;
            
            let perfectCount = 0;
            for (const timing of recentTimings) {
                if (Math.abs(timing - avgTiming) <= PERFECT_HEAL_TOLERANCE_MS) {
                    perfectCount++;
                }
            }

            if (perfectCount >= 4) {
                results.suspicionScore += 30;
                results.violations.push({
                    type: 'PERFECT_HEAL_TIMING',
                    severity: 0.9,
                    evidence: {
                        recentTimings,
                        averageTiming: avgTiming,
                        perfectCount,
                        tolerance: PERFECT_HEAL_TOLERANCE_MS
                    }
                });

                this.recordViolation(player.id || player.sid, results.violations[results.violations.length - 1]);
            }
        }

        data.lastHealTime = timestamp;

        return results;
    }

    recordViolation(playerId, violation) {
        const data = this.getPlayerData(playerId);
        data.violations.push({
            ...violation,
            timestamp: Date.now()
        });

        if (data.violations.length > 50) {
            data.violations = data.violations.slice(-50);
        }

        data.suspicionScore = Math.min(100, data.suspicionScore + violation.suspicionScore || 0);
    }

    analyzePlayer(playerId) {
        const data = this.getPlayerData(playerId);
        return {
            suspicionScore: data.suspicionScore,
            violations: data.violations,
            invalidActionCount: data.invalidActionCount
        };
    }

    removePlayer(playerId) {
        this.playerData.delete(playerId);
    }

    getStats() {
        const stats = {
            totalPlayers: this.playerData.size,
            flaggedPlayers: 0,
            totalViolations: 0
        };

        for (const [playerId, data] of this.playerData.entries()) {
            if (data.suspicionScore > 0) {
                stats.flaggedPlayers++;
            }
            stats.totalViolations += data.violations.length;
        }

        return stats;
    }
}

export function createActionValidator(config, items) {
    return new ActionValidator(config, items);
}
