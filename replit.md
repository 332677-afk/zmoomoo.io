# MooMoo.io Clone

## Overview
This is a fully working MooMoo.io private server implementation with extensive admin commands. The project consists of:
- A webpack-powered client (frontend) with game assets and UI
- An Express + WebSocket server (backend) handling game logic and multiplayer functionality
- npm workspaces for monorepo management

## Project Structure
- `client/` - Frontend source code and static assets
- `server/` - Game server source using ES modules
- `shared/` - Shared configuration between client and server
- `dist/` - Build artifacts (auto-generated, ignored by git)

## Setup Configuration
- **Port**: 5000 (Replit requirement for frontend)
- **Host**: 0.0.0.0 (allows Replit proxy access)
- **Cache Control**: Disabled to prevent stale content in iframe
- **Build System**: Webpack for client bundling

## Commands
- `npm run build` - Build production client bundle
- `npm run build:dev` - Build client in development mode with watch
- `npm start` - Start the game server
- `npm run dev` - Start server in development mode

## Admin Commands Reference

### Login & Info
- `/login` - Activate admin mode (requires logged-in account with Admin level or higher)
- `/id` or `/ids` - Show player IDs (use `/id toggle` for permanent display)

### Combat Commands
- `/kill [player|all|others]` - Kill players (bypasses shield)
- `/explode [player|all|others]` - Explode players with visual effect (bypasses shield)
- `/smite [player|all|others]` - Lightning strike with "SMITED" blue text (bypasses shield)
- `/superhammer [player|all|others]` - Give admin super hammer (instant kill weapon with lightning)

### Resource Commands (Fixed: food/stone swap bug resolved)
- `/give [player] [resource] [amount]` - Give resources
- `/remove [resource] [amount] [player|all|others]` - Remove resources
- `/set [resource] [amount] [player|all|others]` - Set resource to exact amount
- `/add [resource] [amount] [player|all|others]` - Add resources
- `/clearinventory [player|all|others]` - Set all resources to 0
- Resources: wood, food, stone, gold

### Weapon Commands
- `/giveweapon [weapon] [player|all|others]` - Give weapon (katana, hammer, great axe, musket, bow, stick, sword, spear, daggers, bat)
- `/setrange [value] [player|all|others]` - Set weapon hit range (use "normal" to reset)
- `/gatling [player|all|others]` - Toggle infinite fire rate
- `/weaponvariant [2-5|remove] [player|all|others]` - Set weapon variant (2=gold, 3=diamond, 4=ruby, 5=emerald)

### Toggle Commands (use command again to disable)
- `/disarm [player|all|others]` - Prevent attacking/building
- `/teleportclick [player|all|others]` - Teleport on click
- `/reflect [player|all|others]` - Damage reflection (thorns)
- `/instabreak [player|all|others]` - One-hit building destruction
- `/infinitebuild [player|all|others]` - Zero-cost building
- `/antiknockback [player|all|others]` - Prevent knockback
- `/noclip [player|all|others]` - Walk through structures (permanent)

### Timed Commands
- `/ghost [seconds] [player|all|others]` - No-clip mode (default: 30s)
- `/lowdmg [seconds] [player|all|others]` - 0.1 damage (default: 30s)
- `/mobmode [animal] [seconds] [player|all|others]` - Transform into animal

### Health & Status
- `/sethealth [amount] [player|all|others]` - Set exact health (supports overhealth)
- `/shield [player|all|others]` - Toggle invincibility
- `/freeze [player]` - Freeze player
- `/unfreeze [player]` - Unfreeze player

### Building Commands
- `/clearbuilds [player|all|others]` - Destroy buildings

### Movement & Teleport
- `/speed [multiplier]` - Set speed multiplier
- `/teleportto [player]` or `/tp [player]` - Teleport to player
- `/bring [player|all]` - Bring players to you
- `/randomteleport [player]` - Random teleport

### Moderation
- `/kick [player]` - Kick player (shows message before disconnect)
- `/ban [player] [seconds]` - Ban player (shows countdown timer)
- `/pardon [player|all]` - Unban player
- `/warn [player|others]` - Warn player (5 warnings = auto-ban)
- `/promote [player]` - Grant admin access
- `/broadcast [message]` - Send server message

### Visual Effects
- `/rainbow [player]` - Toggle rainbow mode
- `/spin [player] [speed]` - Set spin speed
- `/shake [player] [intensity]` - Screen shake
- `/size [player] [scale]` - Change size
- `/invisible [player]` - Make invisible
- `/visible [player]` - Make visible

### Spawning
- `/spawn [animal] [amount] [player]` - Spawn animals (cow, pig, bull, bully, wolf, quack, moostafa, treasure, moofie, sid, vince, sheep)

### Server
- `/restart` - Restart server
- `/enable` - Enable unlimited placement
- `/disable` - Disable unlimited placement

## Vercel Deployment

This project is configured for split deployment:

### Client (Vercel - Static)
1. The `vercel.json` is configured for static client hosting
2. Deploy to Vercel: `vercel --prod`
3. Build command: `npm run build`
4. Output directory: `dist/client`

### Server (Railway/Render/Fly.io - WebSocket Support)
**Important**: Vercel does NOT support persistent WebSockets. The game server must be deployed to a WebSocket-capable platform.

1. Deploy to Railway, Render, or Fly.io
2. Set environment variables:
   - `PORT=5000`
   - `MODERATOR_PASSWORD=your-admin-password`
3. After deploying, update `client/public/html/play.html`:
   ```javascript
   window.__MOOMOO_CONFIG__ = {
       WS_URL: "wss://your-server-domain.railway.app"
   };
   ```
4. Rebuild and redeploy the client

## MooMoo.js Modding API

The project includes MooMoo.js, a powerful open-source API for modding MooMoo.io. It's loaded in `client/public/libs/moomoo-js.js`.

### Key Features
- **Packet Intercepting**: Intercept incoming and outgoing WebSocket packets
- **Player Data Manipulation**: Access and modify player coordinates, inventory, etc.
- **Built-in msgpack**: Encode/decode packets easily
- **Event System**: Listen to game events (player death, item pickup, etc.)
- **Bot Manager**: Create and manage game bots
- **Command Manager**: Register custom chat commands

### Usage Example
```javascript
// Access the MooMoo API
const MooMoo = Function.prototype[69];

// Listen for game events
MooMoo.on('playerDeath', (player) => {
    console.log(`${player.name} died!`);
});

// Intercept packets
MooMoo.PacketInterceptor.addCallback('client', (packet) => {
    console.log('Outgoing packet:', packet);
    return packet; // Return modified or original packet
});

// Access player data
console.log(MooMoo.myPlayer.x, MooMoo.myPlayer.y);
```

## Security Features (December 4, 2025)

### Security Layers
1. **CORS Protection**: Strict origin allowlist based on Replit domains
2. **Helmet Headers**: HSTS, CSP, X-Frame-Options, XSS Filter, and more
3. **Session Management**: 30-minute idle timeout, 24-hour absolute timeout
4. **Rate Limiting**: Token bucket per player per opcode with escalation (warning → freeze → disconnect → ban)
5. **Packet Validation**: Schema validation for all opcodes with string sanitization and numeric clamping
6. **Anti-Cheat System**:
   - Timing analysis (detects bot-like consistent timing)
   - Movement validation (detects speed hacks, teleports)
   - Activity monitoring (detects automation via mouse/keyboard patterns)
   - Action validation (server-authoritative resource/cooldown checks)

### Anti-Cheat Thresholds
- Score > 50: Warning sent to player
- Score > 70: Auto-kick
- Score > 90: Temporary ban (24 hours)

### Security Files
- `server/src/security/sessionStore.js` - Session management
- `server/src/security/packetValidator.js` - Packet validation
- `server/src/security/rateLimiter.js` - Rate limiting
- `server/src/security/antiCheat/` - Anti-cheat modules

## Free Database Setup (Neon)

The project supports the free Neon PostgreSQL database for persistent accounts.

### Setup Instructions
1. Go to https://neon.tech and sign up (free)
2. Create a new project
3. Copy your connection string (looks like `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`)
4. In Replit, go to "Secrets" (lock icon in sidebar)
5. Add a new secret: Key = `DATABASE_URL`, Value = your Neon connection string
6. Restart the server

### Without Database
If no DATABASE_URL is set, the server runs in "guest-only mode":
- Players can still play as guests
- Account registration/login shows "Database not connected" error
- No persistent stats or accounts

## Recent Changes (December 5, 2025)
- **Email-Based Account System**:
  - Email is now required during registration for account recovery
  - Email validation and uniqueness enforcement
  - Added "Forgot Password?" button near login for password reset
  - Password reset flow with email verification code
  - Uses Resend integration for sending emails

- **Single Session Enforcement**:
  - Only one active session allowed per account
  - If a second login is detected, BOTH sessions are terminated with security message
  - Prevents account sharing and improves security

- **Enhanced Anti-Cheat System**:
  - **Rapid Hat Switching Detection**: Flags players switching hats faster than 100ms (3+ times)
  - **Auto-Heal Detection**: Tracks heal frequencies and flags bot-like precision healing
  - **Tick Rate Analysis**: Detects abnormal game tick rates (speed hacks)
  - **Input Pattern Analysis**: Identifies robotic input patterns (too consistent = bot)
  - **Action Pattern Tracking**: Monitors action timing for suspicious behavior
  - All violations feed into the suspicion scoring system for warnings, kicks, or bans

- **Password Reset Flow**:
  - Step 1: Enter email, receive 6-digit verification code
  - Step 2: Enter verification code to confirm identity
  - Step 3: Set new password
  - 15-minute expiry on reset codes
  - All user sessions invalidated after password reset

- **Boost Pad Fix**: Changed from gradual velocity addition to impulse-based boost system
  - Now sets velocity directly (15x boost magnitude) when stepping on pad
  - Prevents velocity dampening from negating boost effect
  - Applied to both server and client objectManager.js
- **Deaths Tracking Fix**: Deaths now properly accumulate during gameplay
  - Added session-based deaths counter to player constructor
  - Deaths increment on each kill event, not just disconnect
  - Stats persist correctly across multiple deaths in a session
- **UI Cleanup**:
  - Removed TOP PLAYERS leaderboard panel from main menu
  - Removed Weapon Upgrade Level panel from game tab
- **Leaderboard Overflow Fix**: Long player names no longer break layout
  - Added max-width constraint with text-overflow ellipsis

## Recent Changes (December 4, 2025)
- **Guest Mode System**:
  - Non-logged-in players automatically get "Guest#XXXXX" names (random 5-digit numbers)
  - Name input field is greyed out and read-only for guests
  - "Guest" label shown above the sign-in buttons
- **Account ID Persistence**:
  - Username "zahre" now always gets preserved account ID "XUJP2NIB"
  - Prevents ID churn on re-authentication for special accounts
- **Real-Time Stats**:
  - Account stats panel (score, kills) now updates live during gameplay
  - No need to refresh to see current statistics
- **Create Party Button**:
  - Added visible "Create Party" button in the bottom-right corner of main menu
  - Party system with unique 6-character join codes
  - Server-side party management with CREATE_PARTY/JOIN_PARTY handlers
- **Security Fix - Admin /login Command**:
  - The /login command now requires users to be logged into an account with Admin level (4) or higher
  - Non-admin accounts cannot use /login to gain admin privileges anymore
  - Auto-admin is granted on account login for accounts with adminLevel >= 4
- **UI Simplification**:
  - Rank display uses simple gray colors for all ranks (no gradients)
  - Removed icons from stats panel except clock icons for Playtime and Joined date
  - Removed Tribe and Tribes Created from the stats panel display
- **Zahre Account**: Password updated to new secure password
- **Comprehensive Account System Implementation**:
  - Added detailed stats tracking: kills, deaths, score, highest score, playtime
  - Auto-admin login: Users with admin rank automatically receive admin powers when logging in
  - Database schema updated with new fields (score, highestScore, tribesCreated, currentTribe, playTime as bigint)
  - Session tracking for kills, deaths, and score - stats persist across reconnects
- **Admin Level Hierarchy**: None(0), Helper(1), Moderator(2), Staff(3), Admin(4), Owner(5), Zahre(6)
- Fixed packet identifier validation that was blocking AUTH/REGISTER packets
- Increased max packet identifier length from 3 to 16 characters
- Fixed cache invalidation bug in admin level changes

## Recent Changes (December 3, 2025)
- Added MooMoo.js modding API for advanced game customization
- Packet intercepting for client and server messages
- Player data manipulation capabilities
- Bot management system
- Custom command registration

## Recent Changes (November 26, 2025)
- Added super hammer weapon with lightning effect
- Added /smite command with lightning visual and "SMITED" blue text
- Added kick/ban notifications with countdown timer
- Added 20+ new admin commands
- Fixed food/stone resource swap bug
- Fixed /shield bypass for /kill and /explode
- Fixed /shield others and /explode others affecting self
- Added client-side visual effects for lightning and explosions
- Configured for Vercel static deployment + external WebSocket server

## Architecture
- The server serves both static client files and WebSocket API
- Client connects via WebSocket for real-time multiplayer gameplay
- Express handles HTTP routes, WebSocket handles game communication
- MsgPack used for efficient binary message encoding
- Admin commands parsed and executed server-side

## User Preferences
- Game runs on port 5000 for Replit compatibility
- All hosts allowed for proxy compatibility
- Cache disabled to prevent stale content issues
