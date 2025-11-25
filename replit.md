# MooMoo.io Clone

## Overview
Full-stack MooMoo.io private server with client (Webpack-based) and game server (Node.js ES modules). This is an educational fan project clone of MooMoo.io.

## Project Structure
- `client/` - Frontend source and static assets (Webpack bundled)
- `server/` - Game server with WebSocket support
- `shared/` - Shared configuration between client and server
- `dist/` - Build artifacts (auto-generated, git-ignored)

## Recent Security Hardening (November 2025)

### Vulnerabilities Addressed
Based on a comprehensive security audit, the following fixes were implemented:

**Critical & High Priority:**
1. ✅ **WebSocket Crash Protection** - Already implemented with try/catch around MsgPack decoding in both client and server
2. ✅ **Config Exposure Removed** - Removed `window.config` global exposure to prevent client-side manipulation of game settings (zoom, vision, name length)
3. ✅ **Server-Side Build Validation** - Server already validates all build operations via `canBuild()` and `buildItem()` functions, checking resources and limits
4. ✅ **Visibility Logic** - Server uses server-controlled `config.maxScreenWidth` for all `canSee()` calculations; no client input accepted for vision range
5. ✅ **Chat Profanity Filtering** - Server-side filtering via `filter_chat()` function before broadcasting messages

**Medium Priority:**
6. ✅ **Keyboard Input Modernization** - Added `getKeyCode()` helper that prioritizes `event.code` (modern) with fallback to `event.keyCode` (legacy) for browser compatibility
7. ✅ **Asset Rendering Fallbacks** - Added placeholder rendering (semi-transparent shapes) for projectiles, skins, and AI sprites during asset loading, with proper canvas state isolation via save()/restore()

### Architecture Changes
- **Client Security**: Config no longer exposed globally; keyboard input uses modern event.code mapping
- **Rendering**: Placeholder assets prevent invisible entities during load times
- **Server Security**: All critical validations (build, visibility, chat) happen server-side

## Development Setup

### Initial Setup
```bash
npm install
npm run build
```

### Development Commands
- `npm run build` - Production build of client
- `npm run build:dev` - Development build with watch mode
- `npm start` - Start game server (serves bundled client + WebSocket API)
- `npm run dev` - Start server in development mode

### Environment Configuration
- **PORT**: Server port (default: 8080, Replit: 5000)
- **HOST**: Server host (default: 0.0.0.0)
- **SERVER_NAME**: Display name for server
- **SERVER_TYPE**: Server type (standard/sandbox)
- **SERVER_REGION**: Server region identifier

## Deployment
The game server serves both the static client assets and WebSocket connections on a single port.

## Technical Stack
- **Frontend**: Webpack 4, Babel, jQuery, MsgPack
- **Backend**: Node.js (ES modules), Express 5, WebSocket (ws), MsgPack
- **Shared**: Centralized game configuration
- **Security**: Server-side validation, input sanitization, error handling

## Recent Fixes (November 22, 2025)

### Projectile Sprite Loading Fix
- **Issue**: Projectiles (hunting bow, crossbow, musket) were showing as fallback circles instead of proper sprites
- **Root Cause**: Incorrect sprite path in `renderProjectile()` function prevented images from loading
- **Solution**: Fixed sprite loading in `client/src/index.js`:
  - Corrected sprite path from "./img/weapons/" to "../img/weapons/" to properly resolve from HTML location
  - Restored original projectile scales (arrows: 103px, bullets: 160px) for authentic rendering
  - Added minimal 4px semi-transparent fallback dot that only shows briefly during sprite loading
  - Added onload handler cleanup to prevent memory leaks
- **Impact**: All projectiles now render as proper sprites (arrows/bullets) at their original intended sizes

## Recent Fixes (November 25, 2025 - Final Session)

### 1. ✅ Shield Command Enhancements
- **Shield Invincibility**: Players with shield now properly block ALL damage (checked first in `changeHealth()`)
- **Damage Text Display**: Shows "invincible" (white text) ONLY when hitting shielded players; normal damage numbers otherwise
- **Removed /invincible Command**: Deleted completely - /shield is the only invincibility toggle now
- **Icon Rendering**: Shield icon displays properly with fallback circles if sprite fails to load

### 2. ✅ Icon Positioning Fix (Shield + Crown)
- **Problem**: When player created tribe, shield and crown icons overlapped or rendered incorrectly
- **Solution**: Fixed in `client/src/index.js` (lines 2393-2421):
  - Crown uses original positioning calculation (independent crownX)
  - Shield calculates conditional offset: `-tmpS - 5` when player has crown, else normal position
  - Restored separate coordinate calculations to prevent rendering conflicts
  - Icons now display properly side-by-side with correct spacing

### 3. ✅ /maxage Command
- **Functionality**: Instantly gives player all XP needed to reach maximum age
- **Usage**: `/maxage` (self) or `/maxage [player ID]` (target specific player)
- **Implementation**: Calculates remaining XP needed (`target.maxXP - target.XP`) and calls `earnXP()` to advance levels
- **Multiple Players**: Supports `/maxage all` to max age for all players

### 4. ✅ Shield Toggle Rendering Fix
- **Problem**: When toggling shield OFF with `/shield` again, icon would render incorrectly on other players' screens
- **Root Cause**: `target.sentTo = {}` was clearing visibility tracking and breaking player data sync
- **Solution**: Removed the sentTo reset - normal game loop handles player state updates
- **Result**: Shield can be toggled on/off without rendering glitches

### Known Issues Being Investigated
- **Gamemode 1 Items Disappearing**: Items appear briefly when placed in editor mode, then vanish in next object sync
  - Likely cause: Server places items at player position instead of cursor position in gameMode 1
  - Or: Items with owner set are filtered from object broadcasts
  - Needs deeper investigation into objectManager.add() and object synchronization logic
  - Temporary workaround: Place items slowly to see them persist

## Admin Command System (November 25, 2025)

### Overview
A comprehensive admin system has been integrated based on the Sanctuary MooMoo.io private server architecture. The system provides 80+ commands for server moderation, player management, and fun interactions.

### Admin Login
Players become admins by executing:
```
/login zahrefrida
```

Once logged in, admins:
- See their own player ID immediately
- Can view all player IDs
- Have access to all admin commands
- Normal players can only use `/report [player name]`

### Environment Variables
- `MODERATOR_PASSWORD` - Password for admin login (stored as Replit secret)
- `MAX_CPS` - Clicks per second cap (default: 25)
- `PLAYER_NEARBY_RADIUS` - Player visibility radius
- `GAMEOBJECT_NEARBY_RADIUS` - Structure visibility radius

### Command Categories

#### Player Stats & Inventory
- `/give [player ID|all] [resource] [amount]` - Add resources (wood, stone, food, gold)
- `/remove [player ID] [resource] [amount]` - Remove resources
- `/set [player ID] [attribute] [value]` - Set health/food/wood/stone/kills/xp/gold/damage
- `/all inventory` - Grant 10M resources, all hats/accessories, emerald weapons

#### Weapon Commands
- `/weapongive [player ID] [weapon ID 1-16]` - Add weapon without removing existing
- `/setweaponspeed [player ID] [value]` - Change attack speed (0 resets)
- `/weaponvariant [player ID] [2-5]` - 2=Gold, 3=Diamond, 4=Ruby, 5=Emerald
- `/set [player ID] damage [value|normal]` - Modify weapon damage

#### Player Manipulation
- `/kill player [player ID]` - Instantly kill player
- `/kick player [player ID]` - Kick from server
- `/ban [player ID] [seconds]` - Ban temporarily (default: 7 days)
- `/pardon [player ID]` - Unban player
- `/freeze [player ID]` - Prevent movement/attack
- `/unfreeze [player ID]` - Restore mobility
- `/lowdmg [player ID] [seconds]` - Reduce damage to 0.1
- `/strongbonk [player ID] [intensity]` - Modify knockback (0 resets)

#### Movement & Teleport
- `/randomteleport [player ID]` - Random teleportation
- `/teleportto [player ID]` / `/tp [player ID]` - Teleport to player
- `/bring [player ID|all|every]` - Bring players to admin location
- `/speed [multiplier]` - Change admin speed

#### Hats & Accessories
- `/hat [player ID] [hat ID|all]` - Equip specific or all hats
- `/accessory [player ID] [acc ID|all]` - Equip accessories
- `/all hats [player ID]` - Unlock all hats
- `/all accessories [player ID]` - Unlock all accessories
- Hat Effects: `/hatbig`, `/hatspin`, `/hatglitch`, `/hatshake`, `/hatmissing`, 
  `/hatdrop`, `/hatrandom`, `/hatupside`, `/hatrainbow`, `/hatgrow`, `/hatswitch`, `/hattroll`

#### Appearance & Transformations
- `/cowmode [player ID] [seconds]` - Turn into cow
- `/animalify [player ID] [animal] [seconds]` - Transform into animal
- `/explode [player ID]` or `/explode` - Particle explosion effect (no player ID = explode yourself)
- `/size [player ID] [scale]` - Resize player and weapon (damage scales)
- `/bighead [player ID] [size]` - Enlarge head (0 resets)
- `/rainbow [player ID]` - Cycle skin colors

#### Visual & Screen Effects
- `/darkmode [player ID] [seconds]` - Darken screen
- `/shake [player ID] [intensity]` - Shake character
- `/spin [player ID] [speed]` - Spin character
- `/invisible [player ID]` - Make invisible
- `/visible [player ID]` - Restore visibility
- `/shield [player ID]` / `/invincible` - Toggle invincibility

#### Animals & Bosses
- `/spawn [type] [amount]` - Spawn creatures
  - Bosses: moofie, moostafa, vince, sid
  - Animals: wolf, bull, bully

#### Reports & Moderation
- `/report [player name]` - Send report (available to all players)
- `/reports` - View all reports with player info
- `/warn [player ID]` - Issue warning (5 warnings = 7-day ban)

#### Fun & Troll Commands
- `/police` - Cycle hats to simulate police lights
- `/crash [player ID]` - Disconnect player by flooding
- `/enable` - Place unlimited resources at cursor
- `/disable` - Disable unlimited placement
- `/broadcast [message]` - Display message to all players
- `/promote [player ID]` - Promote player to admin
- `/restart` - Stop server (5 second warning)

### Technical Implementation
- **Admin Properties**: `isAdmin`, `isFrozen`, `isInvisible`, `isInvincible`, `customDamage`, `weaponSpeed`, `speedMultiplier`, etc.
- **Movement System**: Respects freeze status and speed multipliers
- **Command Parser**: Intercepts chat messages starting with `/`
- **Error Handling**: Graceful error messages for invalid commands
- **Security**: MODERATOR_PASSWORD stored as Replit secret

## Current State
- ✅ All dependencies installed
- ✅ Client successfully built with security fixes
- ✅ Server running on port 5000
- ✅ Security vulnerabilities addressed
- ✅ Projectile rendering bug fixed
- ✅ Comprehensive admin command system integrated (80+ commands)
- ⏳ Deployment configuration pending

## Notes
- This is a non-commercial educational project
- All original game assets remain property of MooMoo.io creators
- Security hardening focused on preventing client-side exploits and ensuring server authority
