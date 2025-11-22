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

## Current State
- ✅ All dependencies installed
- ✅ Client successfully built with security fixes
- ✅ Server running on port 5000
- ✅ Security vulnerabilities addressed
- ✅ Projectile rendering bug fixed
- ⏳ Deployment configuration pending

## Notes
- This is a non-commercial educational project
- All original game assets remain property of MooMoo.io creators
- Security hardening focused on preventing client-side exploits and ensuring server authority
