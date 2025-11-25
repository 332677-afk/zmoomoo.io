import { items } from './items.js';
import { hats, accessories } from './store.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AdminCommands {
    constructor(game) {
        this.game = game;
        this.reports = new Map();
        this.warnings = new Map();
        this.bannedIPs = new Map();
        this.bansFilePath = path.resolve(__dirname, '../../../data/bans.json');
        this.loadBans();
    }

    loadBans() {
        try {
            if (fs.existsSync(this.bansFilePath)) {
                const data = fs.readFileSync(this.bansFilePath, 'utf8');
                const bansObject = JSON.parse(data);
                const originalCount = Object.keys(bansObject).length;
                
                this.pruneBans(bansObject);
                
                if (this.bannedIPs.size < originalCount) {
                    this.saveBans();
                    console.log(`[Admin] Loaded ${this.bannedIPs.size} active bans (pruned ${originalCount - this.bannedIPs.size} expired)`);
                } else {
                    console.log(`[Admin] Loaded ${this.bannedIPs.size} active bans from disk`);
                }
            }
        } catch (error) {
            console.error('[Admin] Error loading bans:', error);
        }
    }

    pruneBans(bansObject = null) {
        const now = Date.now();
        let pruned = false;
        
        if (bansObject) {
            for (const [ip, expiry] of Object.entries(bansObject)) {
                if (expiry > now) {
                    this.bannedIPs.set(ip, expiry);
                } else {
                    pruned = true;
                }
            }
        } else {
            for (const [ip, expiry] of Array.from(this.bannedIPs.entries())) {
                if (expiry <= now) {
                    this.bannedIPs.delete(ip);
                    pruned = true;
                }
            }
        }
        
        if (pruned) {
            this.saveBans();
            console.log(`[Admin] Pruned expired bans`);
        }
        
        return pruned;
    }

    checkBan(ip) {
        const banExpiry = this.bannedIPs.get(ip);
        if (!banExpiry) return false;
        
        if (banExpiry > Date.now()) {
            return true;
        } else {
            this.bannedIPs.delete(ip);
            this.saveBans();
            return false;
        }
    }

    saveBans() {
        try {
            const bansObject = {};
            for (const [ip, expiry] of this.bannedIPs.entries()) {
                bansObject[ip] = expiry;
            }
            
            const dir = path.dirname(this.bansFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(this.bansFilePath, JSON.stringify(bansObject, null, 2));
            console.log(`[Admin] Saved ${this.bannedIPs.size} bans to disk`);
        } catch (error) {
            console.error('[Admin] Error saving bans:', error);
        }
    }

    setCustomDamage(player, value) {
        const damage = Number(value);
        
        if (value === 'normal' || value === null) {
            player.customDamage = null;
            return { success: true, value: null };
        }
        
        if (!Number.isFinite(damage)) {
            return { success: false, error: 'Damage must be a finite number' };
        }
        
        if (damage === 0) {
            return { success: false, error: 'Damage cannot be zero' };
        }
        
        if (damage > 0) {
            return { success: false, error: 'Damage must be negative (use positive for healing)' };
        }
        
        player.customDamage = damage;
        return { success: true, value: damage };
    }

    parseCommand(message, player) {
        if (!message.startsWith('/')) return null;
        
        const args = message.slice(1).trim().split(/\s+/);
        const command = args[0].toLowerCase();
        const params = args.slice(1);
        
        return { command, params, player };
    }

    async executeCommand(commandData) {
        const { command, params, player } = commandData;

        if (command === 'login') {
            return this.handleLogin(params, player);
        }

        if (command === 'report') {
            return this.handleReport(params, player);
        }

        if (!player.isAdmin) {
            return { success: false, message: 'You must be an admin to use this command' };
        }

        switch (command) {
            case 'give':
                return this.handleGive(params, player);
            case 'remove':
                return this.handleRemove(params, player);
            case 'set':
                return this.handleSet(params, player);
            case 'all':
                if (params[0] === 'inventory') {
                    return this.handleAllInventory(params, player);
                } else if (params[0] === 'hats') {
                    return this.handleAllHats(params, player);
                } else if (params[0] === 'accessories') {
                    return this.handleAllAccessories(params, player);
                }
                break;
            case 'weapongive':
                return this.handleWeaponGive(params, player);
            case 'setweaponspeed':
                return this.handleSetWeaponSpeed(params, player);
            case 'weaponvariant':
                return this.handleWeaponVariant(params, player);
            case 'kill':
                return this.handleKill(params, player);
            case 'kick':
                return this.handleKick(params, player);
            case 'ban':
                return this.handleBan(params, player);
            case 'pardon':
                return this.handlePardon(params, player);
            case 'freeze':
                return this.handleFreeze(params, player);
            case 'unfreeze':
                return this.handleUnfreeze(params, player);
            case 'lowdmg':
                return this.handleLowDamage(params, player);
            case 'strongbonk':
                return this.handleStrongBonk(params, player);
            case 'randomteleport':
                return this.handleRandomTeleport(params, player);
            case 'teleportto':
            case 'tp':
                return this.handleTeleportTo(params, player);
            case 'bring':
                return this.handleBring(params, player);
            case 'speed':
                return this.handleSpeed(params, player);
            case 'hat':
                return this.handleHat(params, player);
            case 'accessory':
                return this.handleAccessory(params, player);
            case 'hatbig':
            case 'hatspin':
            case 'hatglitch':
            case 'hatshake':
            case 'hatmissing':
            case 'hatdrop':
            case 'hatrandom':
            case 'hatupside':
            case 'hatrainbow':
            case 'hatgrow':
            case 'hatswitch':
            case 'hattroll':
                return this.handleHatEffect(command, params, player);
            case 'cowmode':
                return this.handleCowMode(params, player);
            case 'animalify':
                return this.handleAnimalify(params, player);
            case 'explode':
                return this.handleExplode(params, player);
            case 'size':
                return this.handleSize(params, player);
            case 'bighead':
                return this.handleBigHead(params, player);
            case 'rainbow':
                return this.handleRainbow(params, player);
            case 'darkmode':
                return this.handleDarkMode(params, player);
            case 'shake':
                return this.handleShake(params, player);
            case 'spin':
                return this.handleSpin(params, player);
            case 'invisible':
                return this.handleInvisible(params, player);
            case 'visible':
                return this.handleVisible(params, player);
            case 'shield':
            case 'invincible':
                return this.handleInvincible(params, player);
            case 'spawn':
                return this.handleSpawn(params, player);
            case 'reports':
                return this.handleReports(params, player);
            case 'warn':
                return this.handleWarn(params, player);
            case 'police':
                return this.handlePolice(params, player);
            case 'crash':
                return this.handleCrash(params, player);
            case 'enable':
                return this.handleEnable(params, player);
            case 'disable':
                return this.handleDisable(params, player);
            case 'broadcast':
                return this.handleBroadcast(params, player);
            case 'promote':
                return this.handlePromote(params, player);
            case 'restart':
                return this.handleRestart(params, player);
            default:
                return { success: false, message: `Unknown command: ${command}` };
        }
    }

    handleLogin(params, player) {
        const password = params.join(' ');
        const correctPassword = process.env.MODERATOR_PASSWORD || 'zahrefrida';
        
        if (password === correctPassword) {
            player.isAdmin = true;
            player.adminLevel = 'full';
            
            const playerList = this.game.players
                .filter(p => p.alive)
                .map(p => `${p.name} (ID: ${p.sid})`)
                .join(', ');
            
            return {
                success: true,
                message: `Admin access granted! Your ID: ${player.sid}. Players: ${playerList}`
            };
        }
        
        return { success: false, message: 'Incorrect password' };
    }

    getTargetPlayer(targetId) {
        if (targetId === 'all' || targetId === 'every') {
            return this.game.players.filter(p => p.alive);
        }
        
        const id = parseInt(targetId);
        const target = this.game.players.find(p => p.sid === id && p.alive);
        return target ? [target] : [];
    }

    handleGive(params, player) {
        if (params.length < 3) {
            return { success: false, message: 'Usage: /give [player ID|all] [resource] [amount]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const resource = params[1].toLowerCase();
        const amount = parseInt(params[2]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        const resourceMap = {
            wood: 0,
            stone: 1,
            food: 2,
            gold: 3,
            points: 3
        };
        
        const resourceIndex = resourceMap[resource];
        if (resourceIndex === undefined) {
            return { success: false, message: 'Invalid resource. Use: wood, stone, food, gold' };
        }
        
        targets.forEach(target => {
            target.addResource(resourceIndex, amount, true);
        });
        
        return { success: true, message: `Gave ${amount} ${resource} to ${targets.length} player(s)` };
    }

    handleRemove(params, player) {
        if (params.length < 3) {
            return { success: false, message: 'Usage: /remove [player ID] [resource] [amount]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const resource = params[1].toLowerCase();
        const amount = parseInt(params[2]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        const resourceMap = { wood: 0, stone: 1, food: 2, gold: 3, points: 3 };
        const resourceIndex = resourceMap[resource];
        
        if (resourceIndex === undefined) {
            return { success: false, message: 'Invalid resource' };
        }
        
        targets.forEach(target => {
            target.addResource(resourceIndex, -amount, true);
        });
        
        return { success: true, message: `Removed ${amount} ${resource} from ${targets.length} player(s)` };
    }

    handleSet(params, player) {
        if (params.length < 3) {
            return { success: false, message: 'Usage: /set [player ID] [attribute] [value]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const attribute = params[1].toLowerCase();
        const value = params[2] === 'normal' ? null : parseFloat(params[2]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            switch (attribute) {
                case 'health':
                    target.health = Math.min(value, target.maxHealth);
                    target.send('H', target.sid, target.health);
                    break;
                case 'food':
                    target.addResource(2, value - (target.items[2] || 0), true);
                    break;
                case 'wood':
                    target.addResource(0, value - (target.items[0] || 0), true);
                    break;
                case 'stone':
                    target.addResource(1, value - (target.items[1] || 0), true);
                    break;
                case 'gold':
                case 'points':
                    target.addResource(3, value - (target.items[3] || 0), true);
                    break;
                case 'kills':
                    target.kills = value;
                    break;
                case 'xp':
                    target.XP = value;
                    break;
                case 'damage':
                    const damageResult = this.setCustomDamage(target, value);
                    if (!damageResult.success) {
                        throw new Error(damageResult.error);
                    }
                    break;
            }
        });
        
        return { success: true, message: `Set ${attribute} to ${value} for ${targets.length} player(s)` };
    }

    handleWeaponGive(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /weapongive [player ID] [weapon ID 1-16]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const weaponId = parseInt(params[1]);
        
        if (targets.length === 0 || weaponId < 1 || weaponId > 16) {
            return { success: false, message: 'Invalid player or weapon ID' };
        }
        
        targets.forEach(target => {
            const weapon = items.weapons[weaponId];
            if (weapon) {
                target.weapons[weapon.type] = weaponId;
            }
        });
        
        return { success: true, message: `Gave weapon ${weaponId} to ${targets.length} player(s)` };
    }

    handleSetWeaponSpeed(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /setweaponspeed [player ID] [speed]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const speed = parseFloat(params[1]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.weaponSpeed = speed === 0 ? 1 : speed;
        });
        
        return { success: true, message: `Set weapon speed to ${speed} for ${targets.length} player(s)` };
    }

    handleWeaponVariant(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /weaponvariant [player ID] [2=gold|3=diamond|4=ruby|5=emerald]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const variant = parseInt(params[1]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.weaponVariant = variant;
            this.game.server.broadcast('W', target.sid, variant);
        });
        
        return { success: true, message: `Set weapon variant to ${variant} for ${targets.length} player(s)` };
    }

    handleKill(params, player) {
        if (params.length < 2 || params[0] !== 'player') {
            return { success: false, message: 'Usage: /kill player [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[1]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.die();
        });
        
        return { success: true, message: `Killed ${targets.length} player(s)` };
    }

    handleKick(params, player) {
        if (params.length < 2 || params[0] !== 'player') {
            return { success: false, message: 'Usage: /kick player [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[1]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            if (target.socket) {
                target.socket.close();
                target.socket = null;
            }
        });
        
        return { success: true, message: `Kicked ${targets.length} player(s)` };
    }

    handleBan(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /ban [player ID] [seconds (default: 604800)]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const duration = params[1] ? parseInt(params[1]) : 604800;
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            if (!target.isAdmin) {
                const ip = target.ipAddress || 'unknown';
                this.bannedIPs.set(ip, Date.now() + duration * 1000);
                if (target.socket) {
                    target.socket.close();
                    target.socket = null;
                }
            }
        });
        
        this.saveBans();
        return { success: true, message: `Banned ${targets.length} player(s) for ${duration} seconds` };
    }

    handlePardon(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /pardon [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        targets.forEach(target => {
            const ip = target.ipAddress || 'unknown';
            this.bannedIPs.delete(ip);
        });
        
        this.saveBans();
        return { success: true, message: 'Player(s) pardoned' };
    }

    handleFreeze(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /freeze [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.isFrozen = true;
            target.moveDir = undefined;
        });
        
        return { success: true, message: `Froze ${targets.length} player(s)` };
    }

    handleUnfreeze(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /unfreeze [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.isFrozen = false;
        });
        
        return { success: true, message: `Unfroze ${targets.length} player(s)` };
    }

    handleLowDamage(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /lowdmg [player ID] [seconds]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const duration = parseInt(params[1]) * 1000;
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            const result = this.setCustomDamage(target, -0.1);
            if (!result.success) {
                throw new Error(result.error);
            }
            setTimeout(() => {
                target.customDamage = null;
            }, duration);
        });
        
        return { success: true, message: `Applied low damage for ${params[1]}s to ${targets.length} player(s)` };
    }

    handleStrongBonk(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /strongbonk [player ID] [intensity (0 to reset)]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const intensity = parseFloat(params[1]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        if (!Number.isFinite(intensity)) {
            return { success: false, message: 'Intensity must be a finite number' };
        }
        
        const clampedIntensity = intensity === 0 ? 1 : Math.max(0, Math.min(intensity, 10));
        
        targets.forEach(target => {
            target.knockbackMultiplier = clampedIntensity;
        });
        
        return { success: true, message: `Set knockback to ${clampedIntensity} for ${targets.length} player(s)` };
    }

    handleRandomTeleport(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /randomteleport [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.x = Math.random() * 14400;
            target.y = Math.random() * 14400;
        });
        
        return { success: true, message: `Teleported ${targets.length} player(s) randomly` };
    }

    handleTeleportTo(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /teleportto [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        const target = targets[0];
        player.x = target.x;
        player.y = target.y;
        
        return { success: true, message: `Teleported to player ${target.sid}` };
    }

    handleBring(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /bring [player ID|all|every]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.x = player.x;
            target.y = player.y;
        });
        
        return { success: true, message: `Brought ${targets.length} player(s) to your location` };
    }

    handleSpeed(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /speed [multiplier]' };
        }
        
        const multiplier = parseFloat(params[0]);
        player.speedMultiplier = multiplier;
        
        return { success: true, message: `Set your speed to ${multiplier}x` };
    }

    handleAllInventory(params, player) {
        const targets = params.length > 1 ? this.getTargetPlayer(params[1]) : [player];
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.addResource(0, 10000000, true);
            target.addResource(1, 10000000, true);
            target.addResource(2, 10000000, true);
            target.addResource(3, 10000000, true);
            
            hats.forEach(hat => {
                target.skins[hat.id] = 1;
            });
            
            accessories.forEach(acc => {
                target.tails[acc.id] = 1;
            });
            
            items.weapons.forEach(weapon => {
                if (weapon.id !== undefined) {
                    target.weapons[weapon.type] = weapon.id;
                    target.weaponVariant = 5;
                }
            });
        });
        
        return { success: true, message: `Granted full inventory to ${targets.length} player(s)` };
    }

    handleAllHats(params, player) {
        const targets = params.length > 1 ? this.getTargetPlayer(params[1]) : [player];
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            hats.forEach(hat => {
                target.skins[hat.id] = 1;
            });
        });
        
        return { success: true, message: `Unlocked all hats for ${targets.length} player(s)` };
    }

    handleAllAccessories(params, player) {
        const targets = params.length > 1 ? this.getTargetPlayer(params[1]) : [player];
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            accessories.forEach(acc => {
                target.tails[acc.id] = 1;
            });
        });
        
        return { success: true, message: `Unlocked all accessories for ${targets.length} player(s)` };
    }

    handleHat(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /hat [player ID] [hat ID|all]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const hatId = params[1].toLowerCase();
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            if (hatId === 'all') {
                hats.forEach(hat => {
                    target.skins[hat.id] = 1;
                });
            } else {
                const id = parseInt(hatId);
                const hat = hats.find(h => h.id === id);
                if (hat) {
                    target.skins[id] = 1;
                    target.skin = hat;
                    target.skinIndex = id;
                }
            }
        });
        
        return { success: true, message: `Applied hat to ${targets.length} player(s)` };
    }

    handleAccessory(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /accessory [player ID] [accessory ID|all]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const accId = params[1].toLowerCase();
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            if (accId === 'all') {
                accessories.forEach(acc => {
                    target.tails[acc.id] = 1;
                });
            } else {
                const id = parseInt(accId);
                const acc = accessories.find(a => a.id === id);
                if (acc) {
                    target.tails[id] = 1;
                    target.tail = acc;
                    target.tailIndex = id;
                }
            }
        });
        
        return { success: true, message: `Applied accessory to ${targets.length} player(s)` };
    }

    handleHatEffect(command, params, player) {
        if (params.length < 1) {
            return { success: false, message: `Usage: /${command} [player ID]` };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        const effect = command.replace('hat', '');
        targets.forEach(target => {
            target.hatEffect = effect;
            this.game.server.broadcast('HE', target.sid, effect);
        });
        
        return { success: true, message: `Applied ${effect} effect to ${targets.length} player(s)` };
    }

    handleCowMode(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /cowmode [player ID] [seconds]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const duration = parseInt(params[1]) * 1000;
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.animalMode = 'cow';
            this.game.server.broadcast('AM', target.sid, 'cow');
            setTimeout(() => {
                target.animalMode = null;
                this.game.server.broadcast('AM', target.sid, null);
            }, duration);
        });
        
        return { success: true, message: `Turned ${targets.length} player(s) into cows` };
    }

    handleAnimalify(params, player) {
        if (params.length < 3) {
            return { success: false, message: 'Usage: /animalify [player ID] [animal] [seconds]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const animal = params[1].toLowerCase();
        const duration = parseInt(params[2]) * 1000;
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.animalMode = animal;
            this.game.server.broadcast('AM', target.sid, animal);
            setTimeout(() => {
                target.animalMode = null;
                this.game.server.broadcast('AM', target.sid, null);
            }, duration);
        });
        
        return { success: true, message: `Turned ${targets.length} player(s) into ${animal}` };
    }

    handleExplode(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /explode [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            this.game.server.broadcast('EX', target.sid, target.x, target.y);
        });
        
        return { success: true, message: `Exploded ${targets.length} player(s)` };
    }

    handleSize(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /size [player ID] [scale]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const scale = parseFloat(params[1]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.sizeScale = scale;
            target.customDamage = target.customDamage ? target.customDamage * scale : scale;
        });
        
        return { success: true, message: `Set size to ${scale}x for ${targets.length} player(s)` };
    }

    handleBigHead(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /bighead [player ID] [size (0 to reset)]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const size = parseFloat(params[1]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.headSize = size === 0 ? 1 : size;
        });
        
        return { success: true, message: `Set head size to ${size} for ${targets.length} player(s)` };
    }

    handleRainbow(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /rainbow [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.rainbowMode = !target.rainbowMode;
        });
        
        return { success: true, message: `Toggled rainbow mode for ${targets.length} player(s)` };
    }

    handleDarkMode(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /darkmode [player ID] [seconds]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const duration = parseInt(params[1]) * 1000;
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.send('DM', true);
            setTimeout(() => {
                target.send('DM', false);
            }, duration);
        });
        
        return { success: true, message: `Applied dark mode for ${params[1]}s to ${targets.length} player(s)` };
    }

    handleShake(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /shake [player ID] [intensity]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const intensity = parseFloat(params[1]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.shakeIntensity = intensity;
        });
        
        return { success: true, message: `Set shake intensity to ${intensity} for ${targets.length} player(s)` };
    }

    handleSpin(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /spin [player ID] [speed]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        const speed = parseFloat(params[1]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.spinSpeed = speed;
        });
        
        return { success: true, message: `Set spin speed to ${speed} for ${targets.length} player(s)` };
    }

    handleInvisible(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /invisible [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.isInvisible = true;
        });
        
        return { success: true, message: `Made ${targets.length} player(s) invisible` };
    }

    handleVisible(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /visible [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.isInvisible = false;
        });
        
        return { success: true, message: `Made ${targets.length} player(s) visible` };
    }

    handleInvincible(params, player) {
        const targets = params.length > 0 ? this.getTargetPlayer(params[0]) : [player];
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.isInvincible = !target.isInvincible;
        });
        
        return { success: true, message: `Toggled invincibility for ${targets.length} player(s)` };
    }

    handleSpawn(params, player) {
        if (params.length < 2) {
            return { success: false, message: 'Usage: /spawn [animal|boss] [amount]' };
        }
        
        const type = params[0].toLowerCase();
        const amount = parseInt(params[1]);
        
        for (let i = 0; i < amount; i++) {
            const x = player.x + (Math.random() - 0.5) * 500;
            const y = player.y + (Math.random() - 0.5) * 500;
            
            if (['moofie', 'moostafa', 'vince', 'sid'].includes(type)) {
                this.game.ai_manager.addAI(x, y, type, true);
            } else if (['wolf', 'bull', 'bully'].includes(type)) {
                this.game.ai_manager.addAI(x, y, type, false);
            }
        }
        
        return { success: true, message: `Spawned ${amount} ${type}(s)` };
    }

    handleReport(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /report [player name]' };
        }
        
        const playerName = params.join(' ');
        const target = this.game.players.find(p => p.name === playerName);
        
        if (!target) {
            return { success: false, message: 'Player not found' };
        }
        
        const reports = this.reports.get(target.sid) || [];
        reports.push({
            reporter: player.name,
            reporterId: player.sid,
            timestamp: Date.now()
        });
        this.reports.set(target.sid, reports);
        
        return { success: true, message: `Reported ${playerName}` };
    }

    handleReports(params, player) {
        if (this.reports.size === 0) {
            return { success: true, message: 'No reports found' };
        }
        
        const reportList = [];
        this.reports.forEach((reports, sid) => {
            const target = this.game.players.find(p => p.sid === sid);
            if (target) {
                reportList.push(`${target.name} (ID: ${sid}) - ${reports.length} reports`);
            }
        });
        
        return { success: true, message: `Reports:\n${reportList.join('\n')}` };
    }

    handleWarn(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /warn [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            const warnings = (this.warnings.get(target.sid) || 0) + 1;
            this.warnings.set(target.sid, warnings);
            
            target.send('6', -1, `Warning ${warnings}/5: Violating server rules`);
            
            if (warnings >= 5) {
                this.handleBan([target.sid.toString(), '604800'], player);
            }
        });
        
        return { success: true, message: `Warned ${targets.length} player(s)` };
    }

    handlePolice(params, player) {
        const policeHats = [6, 7, 22];
        let index = 0;
        
        player.policeInterval = setInterval(() => {
            const hatId = policeHats[index % policeHats.length];
            player.skinIndex = hatId;
            index++;
        }, 500);
        
        setTimeout(() => {
            if (player.policeInterval) {
                clearInterval(player.policeInterval);
                player.policeInterval = null;
            }
        }, 10000);
        
        return { success: true, message: 'Police lights activated' };
    }

    handleCrash(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /crash [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            for (let i = 0; i < 1000; i++) {
                target.send('0');
            }
            if (target.socket) {
                target.socket.close();
                target.socket = null;
            }
        });
        
        return { success: true, message: `Crashed ${targets.length} player(s)` };
    }

    handleEnable(params, player) {
        player.unlimitedPlace = true;
        return { success: true, message: 'Unlimited placement enabled' };
    }

    handleDisable(params, player) {
        player.unlimitedPlace = false;
        return { success: true, message: 'Unlimited placement disabled' };
    }

    handleBroadcast(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /broadcast [message]' };
        }
        
        const message = params.join(' ');
        this.game.server.broadcast('BC', message);
        
        return { success: true, message: 'Message broadcasted' };
    }

    handlePromote(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /promote [player ID]' };
        }
        
        const targets = this.getTargetPlayer(params[0]);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.isAdmin = true;
            target.adminLevel = 'full';
            target.send('6', -1, 'You have been promoted to admin');
        });
        
        return { success: true, message: `Promoted ${targets.length} player(s) to admin` };
    }

    handleRestart(params, player) {
        this.game.server.broadcast('6', -1, 'Server restarting in 5 seconds...');
        setTimeout(() => {
            process.exit(0);
        }, 5000);
        
        return { success: true, message: 'Server restart initiated' };
    }
}
