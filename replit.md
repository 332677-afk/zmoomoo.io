# ZMOOMOO.io

## Overview
This project is a fully functional ZMOOMOO.io private server implementation (based on MooMoo.io), designed for multiplayer gameplay with extensive admin capabilities. It includes a webpack-powered client for the frontend, an Express and WebSocket server for backend logic, and utilizes npm workspaces for monorepo management. The project aims to provide a robust, moddable, and secure game environment.

## Database Setup (For New Deployments)
When cloning this project to a new environment, you need to set up the PostgreSQL database:

1. Set the `DATABASE_URL` environment variable with your PostgreSQL connection string
2. Run the database setup script:
   ```bash
   npm run db:setup
   ```
   This creates the `accounts` table with all required columns for user registration.

**Note:** The database itself is NOT stored in the Git repository. Only the schema definition (in `shared/schema.ts`) and setup script are included. Each deployment needs its own database.

## User Preferences
- Game runs on port 5000 for Replit compatibility
- All hosts allowed for proxy compatibility
- Cache disabled to prevent stale content issues

## System Architecture
The system employs a client-server architecture. The client, built with Webpack, handles the game's UI and assets. The server, using Express and WebSockets, manages game logic, real-time multiplayer interactions, and serves static client files. MsgPack is used for efficient binary message encoding over WebSockets.

Key architectural decisions include:
- **Monorepo Structure**: Managed with npm workspaces (`client/`, `server/`, `shared/` directories).
- **Frontend**: Webpack for bundling, assets, and UI.
- **Backend**: Express for HTTP routes and static file serving, WebSockets for real-time game communication.
- **Admin Command System**: Server-side parsing and execution of a wide array of admin commands for game control, moderation, and player management (e.g., combat, resources, weapons, toggles, health, building, movement, moderation, visual effects, spawning, server management).
- **Modding API**: Integration of MooMoo.js for client-side modding, offering packet interception, player data manipulation, bot management, and custom command registration.
- **Account System**: Features email-based registration, password reset flow with email verification (using Resend), single session enforcement, and comprehensive stats tracking (kills, deaths, score, playtime). Supports different admin levels.
- **Security Features**:
    - **CORS Protection**: Strict origin allowlist.
    - **Helmet Headers**: Enhanced security headers (HSTS, CSP, X-Frame-Options, XSS Filter).
    - **Session Management**: Idle and absolute timeouts.
    - **Rate Limiting**: Per player, per opcode with escalation.
    - **Packet Validation**: Schema validation, string sanitization, numeric clamping.
    - **Anti-Cheat System**: Detects timing anomalies, movement validation (speed/teleport hacks), activity monitoring, rapid hat switching, auto-heal detection, tick rate analysis, and input pattern analysis. Violations contribute to a suspicion score leading to warnings, kicks, or bans.
- **UI/UX**: Simplification of UI elements like rank displays and removal of certain panels for a cleaner interface. Leaderboard handles long names with `text-overflow ellipsis`.
- **Game Mechanics**: Boost pads utilize impulse-based velocity for consistent effects. Deaths are tracked persistently within sessions.
- **Boost Pad System**: Uses per-frame tracking (Set data structure) to prevent duplicate boost applications when overlapping multiple pads. Boost pads are breakable by owners (150 health).
- **Ban/Kick Persistence**: Ban and kick status are saved to localStorage and displayed on the menu when reloading, showing time remaining for temporary bans.
- **Promote Command**: `/promote [account_id] [level]` with permission hierarchy (Admin→0-3, Owner→0-4, Zahre→0-5).

## Recent Changes
- Fixed Ping/CPS display: ping removed from player nameplates, now only shows in performance panel; CPS shows next to players
- Fixed boost pad collision: changed per-frame tracking to proper Set initialization, removed delta multiplication for consistent boost velocity
- Enhanced H key quick-equip: now re-selects current build item if holding one, else selects first build item; keybind remappable in settings
- Enhanced admin permissions: COMMAND_PERMISSIONS map enforces rank-based access (Helper through Zahre hierarchy), demotion requires Admin+
- Fixed boost pad collision bug where 3rd pad would slow players
- Enhanced ban system with localStorage persistence and countdown display
- Enhanced kick system with proper overlay and localStorage tracking
- Updated /promote command to use account ID with permission-based restrictions
- Cleaned up menu UI by removing unused Hats/Accessory/Weapon dropdown
- Added console /promote command with full level 0-6 access
- Redesigned Enter Game section with centered character and full-width button

## External Dependencies
- **WebSocket-capable Hosting Platform**: Required for the server (e.g., Railway, Render, Fly.io). Vercel is used for static client hosting.
- **Neon PostgreSQL**: Used for persistent account data. Configurable via `DATABASE_URL` environment variable. Supports Replit's built-in PostgreSQL.
- **Resend**: Integrated for sending transactional emails, specifically for the password reset verification flow.
- **MooMoo.js**: An open-source API for client-side game modding.