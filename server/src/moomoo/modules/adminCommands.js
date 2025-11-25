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
            case 'weaponrange':
                return this.handleWeaponRange(params, player);
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
            
            // Force resync of player data by clearing sentTo tracking
            // This ensures the updated isAdmin flag gets sent to the client
            player.sentTo = {};
            
            // Send all player info to admin
            const allPlayers = this.game.players
                .filter(p => p.alive)
                .map(p => ({
                    sid: p.sid,
                    name: p.name,
                    x: p.x,
                    y: p.y,
                    health: Math.round(p.health),
                    maxHealth: Math.round(p.maxHealth)
                }));
            
            // Send special admin packet with player list (only to the admin)
            this.game.server.send(player.id, 'ADMIN_LOGIN', allPlayers);
            
            return {
                success: true,
                message: `Admin access granted! Your ID: ${player.sid}. Sending player list...`
            };
        }
        
        return { success: false, message: 'Incorrect password' };
    }

    getTargetPlayer(targetId, excludePlayer = null) {
        if (targetId === 'all' || targetId === 'every') {
            return this.game.players.filter(p => p.alive);
        }
        
        if (targetId === 'others') {
            return this.game.players.filter(p => p.alive && p !== excludePlayer);
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
        if (params.length < 2) {
            return { success: false, message: 'Usage: /set [attribute] [value] [player ID] or /set [player ID] [attribute] [value]' };
        }
        
        // Determine if first param is player ID or attribute
        let targets = [];
        let attributeIndex = 0;
        let valueIndex = 1;
        let playerIdIndex = -1;
        
        // Check if last param is a player ID
        const lastAsId = parseInt(params[params.length - 1]);
        if (Number.isFinite(lastAsId) && params.length >= 3) {
            // Format: /set [attribute] [value] [player ID]
            if (!Number.isFinite(parseInt(params[0]))) {
                attributeIndex = 0;
                valueIndex = 1;
                playerIdIndex = params.length - 1;
                targets = this.getTargetPlayer(params[playerIdIndex]);
            }
        }
        
        // If no targets yet, try first param as player ID
        if (targets.length === 0) {
            const firstAsId = parseInt(params[0]);
            if (Number.isFinite(firstAsId) && params.length >= 3) {
                // Format: /set [player ID] [attribute] [value]
                targets = this.getTargetPlayer(params[0]);
                attributeIndex = 1;
                valueIndex = 2;
            } else {
                // Format: /set [attribute] [value] - apply to self
                targets = [player];
                attributeIndex = 0;
                valueIndex = 1;
            }
        }
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        const attribute = params[attributeIndex].toLowerCase();
        const value = params[valueIndex] === 'normal' ? null : parseFloat(params[valueIndex]);
        
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
                    if (value === null) {
                        target.kills = 0;
                    } else {
                        target.kills = Math.max(0, parseInt(value));
                    }
                    target.send('N', 'kills', target.kills, 1);
                    break;
                case 'xp':
                    if (value === null) {
                        target.XP = 0;
                    } else {
                        target.XP = value;
                    }
                    break;
                case 'damage':
                    if (value === null) {
                        // Reset to normal damage
                        target.customDamage = null;
                    } else {
                        target.customDamage = value > 0 ? value : 1;
                    }
                    break;
                case 'weaponspeed':
                case 'speed':
                    // Higher value = faster reload/attack. weaponSpeed is a multiplier where > 1 speeds up
                    if (value === null) {
                        target.weaponSpeed = 1;
                    } else {
                        target.weaponSpeed = parseFloat(value);
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
        if (params.length < 1) {
            return { success: false, message: 'Usage: /weaponvariant [variant: 2=gold, 3=diamond, 4=ruby, 5=emerald] [optional: all|player_id|others] (default: self)' };
        }
        
        let inputVariant = parseInt(params[0]);
        
        if (!Number.isFinite(inputVariant) || inputVariant < 2 || inputVariant > 5) {
            return { success: false, message: 'Variant must be 2-5 (2=gold, 3=diamond, 4=ruby, 5=emerald)' };
        }
        
        // Map user input (2-5) to actual variant indices (1-4)
        const variant = inputVariant - 1;
        
        // Default to self if no target specified
        let targets;
        if (params.length < 2) {
            targets = [player];
        } else {
            targets = this.getTargetPlayer(params[1], player);
        }
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            target.weaponVariant = variant;
            target.weaponXP[target.weaponIndex] = [0, 3000, 7000, 12000, 24000][variant];
            // Send to all players who can see this player
            for (let i = 0; i < this.game.players.length; ++i) {
                if (this.game.players[i].sentTo[target.id]) {
                    this.game.players[i].send('W', target.sid, variant);
                }
            }
        });
        
        const variantNames = ['Gold', 'Diamond', 'Ruby', 'Emerald'];
        return { success: true, message: `Set weapon variant to ${variantNames[variant - 1]} for ${targets.length} player(s)` };
    }

    handleKill(params, player) {
        if (params.length < 1) {
            return { success: false, message: 'Usage: /kill [player ID|all|others] (default: all)' };
        }
        
        let targets = this.getTargetPlayer(params[0], player);
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            if (target.alive) {
                target.changeHealth(-target.health, null);
            }
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
        if (params.length < 1) {
            return { success: false, message: 'Usage: /strongbonk [intensity (0 to reset, any positive number)]' };
        }
        
        const intensity = parseFloat(params[0]);
        
        if (!Number.isFinite(intensity)) {
            return { success: false, message: 'Intensity must be a finite number' };
        }
        
        if (intensity < 0) {
            return { success: false, message: 'Intensity must be 0 or positive' };
        }
        
        const finalIntensity = intensity === 0 ? 1 : Math.max(0.1, intensity);
        
        player.knockbackMultiplier = finalIntensity;
        
        const intensityDisplay = finalIntensity === 1 ? 'normal' : `${finalIntensity}x`;
        return { success: true, message: `Set your knockback to ${intensityDisplay}` };
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
        let targets = [];
        
        // No player ID means explode yourself
        if (params.length < 1) {
            targets = [player];
        } else {
            targets = this.getTargetPlayer(params[0]);
            
            if (targets.length === 0) {
                return { success: false, message: 'Player not found' };
            }
        }
        
        targets.forEach(target => {
            if (target.alive) {
                // Broadcast explosion animation
                this.game.server.broadcast('EX', target.sid, target.x, target.y);
                
                // Kill the player
                target.changeHealth(-target.health, null);
            }
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
            return { success: false, message: 'Usage: /spawn [animal type] [amount] [player id (optional)]' };
        }
        
        const type = params[0].toLowerCase();
        const amount = parseInt(params[1]);
        const playerId = params[2] ? parseInt(params[2]) : null;
        
        if (!Number.isFinite(amount) || amount < 1) {
            return { success: false, message: 'Amount must be a positive number' };
        }
        
        // Map animal names to AI type indices
        const typeMap = {
            'cow': 0,
            'pig': 1,
            'bull': 2,
            'bully': 3,
            'wolf': 4,
            'quack': 5,
            'moostafa': 6,
            'treasure': 7,
            'moofie': 8,
            'sid': 9,
            'vince': 10,
            'sheep': 11
        };
        
        const typeIndex = typeMap[type];
        
        if (typeIndex === undefined) {
            return { success: false, message: `Unknown animal type: ${type}. Valid types: cow, pig, bull, bully, wolf, quack, moostafa, treasure, moofie, sid, vince, sheep` };
        }
        
        // Determine target location
        let spawnX = player.x;
        let spawnY = player.y;
        let targetName = 'you';
        
        if (playerId !== null) {
            const targetPlayer = this.game.players.find(p => p.sid === playerId);
            if (!targetPlayer) {
                return { success: false, message: 'Player not found' };
            }
            spawnX = targetPlayer.x;
            spawnY = targetPlayer.y;
            targetName = targetPlayer.name;
        }
        
        for (let i = 0; i < amount; i++) {
            this.game.ai_manager.spawn(spawnX, spawnY, 0, typeIndex);
        }
        
        return { success: true, message: `Spawned ${amount} ${type}(s) on ${targetName}` };
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
        // Bummle Hat = 8, Winter Cap = 15
        const policeHats = [8, 15];
        
        // Get target player - if player ID provided, use that, otherwise use self
        let targets = [];
        if (params.length > 0) {
            targets = this.getTargetPlayer(params[0]);
        } else {
            targets = [player];
        }
        
        if (targets.length === 0) {
            return { success: false, message: 'Player not found' };
        }
        
        targets.forEach(target => {
            // Toggle police mode
            if (target.policeInterval) {
                clearInterval(target.policeInterval);
                target.policeInterval = null;
                target.skinIndex = 0;
                target.send('N', 'policeMode', 0);
            } else {
                let index = 0;
                target.policeInterval = setInterval(() => {
                    if (target.alive) {
                        const hatId = policeHats[index % policeHats.length];
                        target.skinIndex = hatId;
                        index++;
                    }
                }, 500);
            }
        });
        
        if (targets[0].policeInterval) {
            return { success: true, message: `Police mode activated for ${targets.length} player(s) - run /police ${params.length > 0 ? params[0] : ''} again to disable` };
        } else {
            return { success: true, message: `Police mode disabled for ${targets.length} player(s)` };
        }
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

    handleWeaponRange(params, player) {
        // Parse: /weaponrange [value] [optional player id]
        if (params.length < 1) {
            return { success: false, message: 'Usage: /weaponrange [number] or /weaponrange normal [optional player id]' };
        }

        const valueStr = params[0].toLowerCase();
        const targetPlayerId = params[1] ? parseInt(params[1]) : null;

        // Determine target players
        let targets = [];
        if (targetPlayerId !== null) {
            const target = this.game.players.find(p => p.sid === targetPlayerId);
            if (!target) {
                return { success: false, message: 'Player not found' };
            }
            targets = [target];
        } else {
            targets = [player];
        }

        // Handle value
        let value = null;
        if (valueStr === 'normal') {
            value = null; // Reset to default
        } else {
            value = parseFloat(valueStr);
            if (!Number.isFinite(value) || value <= 0) {
                return { success: false, message: 'Weapon range must be a positive number or "normal"' };
            }
        }

        // Apply to targets
        targets.forEach(target => {
            if (value === null) {
                target.customWeaponRange = null;
            } else {
                target.customWeaponRange = value;
            }
        });

        const message = value === null 
            ? `Reset weapon range to normal for ${targets.length} player(s)`
            : `Set weapon range to ${value} for ${targets.length} player(s)`;

        return { success: true, message };
    }
}
