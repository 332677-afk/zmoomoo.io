export class GameObject {
    constructor(sid) {
        this.sid = sid;

        // INIT:
        this.init = function(x, y, dir, scale, type, data, owner) {
            data = data || {};
            this.sentTo = {};
            this.gridLocations = [];
            this.active = true;
            this.doUpdate = data.doUpdate;
            this.x = x;
            this.y = y;
            this.dir = dir;
            this.xWiggle = 0;
            this.yWiggle = 0;
            this.scale = scale;
            this.type = type;
            this.id = data.id;
            this.owner = owner;
            this.name = data.name;
            this.isItem = this.id != undefined;
            this.group = data.group;
            this.health = data.health;
            this.layer = 2;
            if (this.group != undefined) {
                this.layer = this.group.layer;
            } else {
                if (this.type == 0) {
                    this.layer = 3;
                } else {
                    if (this.type == 2) {
                        this.layer = 0;
                    } else {
                        if (this.type == 4) {
                            this.layer = -1;
                        }
                    }
                }
            }
            this.colDiv = data.colDiv || 1;
            this.blocker = data.blocker || null;
            this.ignoreCollision = data.ignoreCollision === true;
            this.dontGather = data.dontGather || false;
            this.hideFromEnemy = data.hideFromEnemy || false;
            this.friction = data.friction || null;
            this.projDmg = data.projDmg || null;
            this.dmg = data.dmg || 0;
            this.pDmg = data.pDmg || 0;
            this.pps = data.pps || 0;
            this.zIndex = data.zIndex || 0;
            this.turnSpeed = data.turnSpeed || 0;
            this.req = data.req || null;
            this.trap = data.trap || false;
            this.healCol = data.healCol || 0;
            this.teleport = data.teleport || false;
            this.boostSpeed = data.boostSpeed || 0;
            this.projectile = data.projectile;
            this.shootRange = data.shootRange || 0;
            this.shootRate = data.shootRate || 0;
            this.shootCount = this.shootRate;
            this.spawnPoint = data.spawnPoint || false;
        };

        // GET HIT:
        this.changeHealth = function(amount, doer) {
            this.health += amount;
            return this.health <= 0;
        };

        // GET SCALE:
        this.getScale = function(sM, ig) {
            sM = sM || 1;
            return this.scale * (this.isItem || this.type == 2 || this.type == 3 || this.type == 4 ? 1 : 0.6 * sM) * (ig ? 1 : this.colDiv);
        };

        // VISIBLE TO PLAYER:
        this.visibleToPlayer = function(player) {
            return !this.hideFromEnemy || this.owner && (this.owner == player || this.owner.team && player.team == this.owner.team);
        };

        // UPDATE:
        this.update = function(delta) {
            if (this.active) {
                if (this.xWiggle) {
                    this.xWiggle *= Math.pow(0.99, delta);
                }
                if (this.yWiggle) {
                    this.yWiggle *= Math.pow(0.99, delta);
                }
                if (this.turnSpeed) {
                    this.dir += this.turnSpeed * delta;
                }
            }
        };
    };
}