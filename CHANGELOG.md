# Changelog

All notable changes to the MooMoo.io Clone project will be documented in this file.

## [1.0.1] - November 21, 2025

### Security Fixes by Zahirr

#### Critical Vulnerabilities
- **XSS Vulnerability Prevention**: Replaced all unsafe `innerHTML` assignments with safe DOM manipulation methods using `createElement()`, `appendChild()`, and `textContent`
  - Fixed featured YouTuber link rendering
  - Fixed loading text with reload functionality
  - Fixed skin color picker generation
  - Fixed upgrade counter display
  - Fixed age display text

#### Config Security
- Removed global `window.config` exposure to prevent console-based game setting manipulation
- Game configuration is now module-scoped and cannot be accessed from browser console

#### Keyboard Input Modernization
- Implemented modern `event.code` mapping with legacy `event.keyCode` fallback
- Added `getKeyCode()` helper function for cross-browser keyboard compatibility
- Modern browsers now use semantic key names (KeyW, ArrowUp, etc.) instead of deprecated numeric key codes

#### Rendering Improvements
- Added asset loading fallbacks with placeholder shapes (gray circles/rectangles)
- Proper canvas state management with `save()`/`restore()` to prevent visual glitches during asset loading
- Prevents invisible sprites during initial asset load times

### Verified Security Features
- WebSocket crash protection with try/catch around MsgPack decoding
- Server-side build validation preventing client-side exploit bypasses
- Server-controlled visibility calculations (maxScreenWidth not overridable from client)
- Server-side chat profanity filtering

### Build & Deployment
- Client successfully rebuilt with Webpack
- Server configured and running on port 5000

## [1.0.0] - Initial Release
- Full-stack MooMoo.io clone with Webpack client and Node.js WebSocket server
- Comprehensive security architecture with server-side validation
- Production-ready deployment configuration
