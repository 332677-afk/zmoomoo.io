# MooMoo.io Clone

## Overview
This project is a fully functional MooMoo.io private server implementation, designed for multiplayer gameplay with extensive admin capabilities. It includes a webpack-powered client for the frontend, an Express and WebSocket server for backend logic, and utilizes npm workspaces for monorepo management. The project aims to provide a robust, moddable, and secure game environment.

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

## External Dependencies
- **WebSocket-capable Hosting Platform**: Required for the server (e.g., Railway, Render, Fly.io). Vercel is used for static client hosting.
- **Neon PostgreSQL**: Used for persistent account data. Configurable via `DATABASE_URL` environment variable. Supports Replit's built-in PostgreSQL.
- **Resend**: Integrated for sending transactional emails, specifically for the password reset verification flow.
- **MooMoo.js**: An open-source API for client-side game modding.