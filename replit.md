# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies. Also hosts **NEON GRID** — a browser-based multiplayer FPS game served from `neon-grid/server.js` (port 3000, routed to `/`).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## NEON GRID Game

The game is served by `node neon-grid/server.js` (the **"Start application"** workflow, port 3000). The `artifacts/neon-grid-app: web` workflow is a duplicate that fails — ignore it; the game works fine via "Start application".

### Key Game Files

| File | Purpose |
|---|---|
| `neon-grid/server.js` | Express server, WebSocket game loop (20 tick/s) |
| `neon-grid/public/index.html` | Main menu — Three.js 3D animated background, left nav (PLAY/LEADERBOARD/PROFILE/SETTINGS/LOG IN), settings modal slide-in |
| `neon-grid/public/game.html` | In-game page — dark loading screen, 4-arm crosshair, Orbitron font |
| `neon-grid/public/matchmaking.html` | Matchmaking lobby with class picker and queue |
| `neon-grid/public/class-select.html` | Class selection — SOLDIER/GHOST/WRAITH cards with stat bars |
| `neon-grid/public/leaderboard.html` | Global leaderboard — 8 columns: #, OPERATIVE, LVL, TIER, K/D, KILLS, HS%, WIN%. 60s auto-refresh. Click username → profile. "YOUR RANK" separator if outside top 100. |
| `neon-grid/public/profile.html` | Operative profile page — `/profile.html?u=<username>`. Shows rank badge, XP progress bar, 3×3 career stats grid, recent matches table, rank history. |
| `neon-grid/public/js/PostMatch.js` | Post-match overlay — listens for `match:ended` socket event. Shows sorted player table with K/D/HS/DMG/RP, personal stats panel, 15s countdown, rank-up animation with Web Audio 5-note chord. |
| `neon-grid/public/js/Scoreboard.js` | Tab scoreboard — polls `scoreboard:request` every 2s while Tab held. Listens for `scoreboard:data`. Shows all players sorted by score with damage, total kills. |
| `neon-grid/public/js/RankBadge.js` | **Shared ES module** — RANK_TABLE, getRankFromRP, renderRankBadge(tier, rp, size) |
| `neon-grid/public/js/Hud.js` | In-game HUD — CoD-style match timer/score, K/D, rank badge, death screen (grayscale canvas), damage numbers, hit marker |
| `neon-grid/public/js/Controls.js` | FPS controls — setInputLocked(bool), inverted-Y from localStorage, sensitivity from ng_sensitivity (int 5–30)/10000 |
| `neon-grid/public/js/main.js` | Game init — FOV listener, motion blur, setInputLocked on death/respawn. Imports PostMatch + Scoreboard. Tab key uses server-polled Scoreboard. |

### Settings / localStorage Keys

| Key | Type | Description |
|---|---|---|
| `ng_sensitivity` | int 5–30 | Mouse sensitivity (÷10000 = float) |
| `ng_ads_sensitivity` | int 3–10 | ADS sensitivity (÷10000) |
| `ng_fov` | int 65–90 | Field of view |
| `ng_invert_y` | `"1"` | Invert Y axis |
| `ng_ads_toggle` | `"1"` | Toggle ADS mode |
| `ng_show_fps` | `"0"` | Hide FPS counter |
| `ng_motion_blur` | `"1"` | Enable motion blur |
| `ng_master_vol` / `ng_effects_vol` / `ng_footsteps_vol` | int 0–100 | Volume levels |

Settings changes dispatch a `CustomEvent('ng-settings-changed', {detail: {key: value}})` that `Controls.js` and `main.js` listen to.

### Stats & Leaderboard API (Task #11)

Game API routes mounted at `/api` (more-specific paths in artifact.toml take proxy priority over the api-server's `/api` catch-all):

| Endpoint | Description |
|---|---|
| `GET /api/leaderboard?limit=100` | Full leaderboard with HS% + win rate (from `db.getLeaderboardFull`) |
| `GET /api/profile/:username` | Career stats, rank, recent matches, rank history |
| `GET /api/stats/me` | Authenticated personal stats (Bearer token required) |
| `POST /api/match/end` | Force-end current round (Bearer token required) |

The neon-grid artifact.toml registers `paths = ["/", "/api/leaderboard", "/api/profile", "/api/stats", "/api/match"]` — the proxy routes those specific `/api/*` sub-paths to port 3000 (game server) rather than port 8080 (api-server), because more-specific paths win.

### Server-Side Enhancements (Task #11)

- **GameServer**: tracks `damage`, `headshots`, `bestStreak` per player per round. `_endRound()` now emits `match:ended` to each socket with full scoreboard + personalized `rankChanged`/`oldTier`/`newTier`/`myStats`. Handles `scoreboard:request` → `scoreboard:data`.
- **Database**: added `leaderboardFull` (includes HS rate + win rate), `rankHistory` prepared statements. New functions: `getLeaderboardFull()`, `getProfileByUsername()`.
- **AuthRouter**: exports `apiRouter` alongside existing `router` + `verifyToken`.

> **Note**: DB drops all tables on startup (dev mode). Stats reset on every server restart.

### Rank System (RankBadge.js)

Tiers: IRON → BRONZE → SILVER → GOLD → PLATINUM → DIAMOND → MASTER → GRANDMASTER
- Each tier except MASTER/GRANDMASTER has I/II/III divisions
- DIAMOND+ glows with pulsing animation
- MASTER/GRANDMASTER show a crown icon
- Usage: `import { renderRankBadge, getRankFromRP } from '/js/RankBadge.js'`

### Settings Modal (index.html)

The settings modal uses a two-step show/hide pattern to ensure `display:none` when closed (for correct accessibility tree behavior):
- **Open**: add class `ready` (display:flex), then next frame add `open` (translateX(0)), remove `aria-hidden`
- **Close**: remove `open`, set `aria-hidden="true"`, after 300ms remove `ready` (display:none)
- The `.settings-header` (containing the ✕ close button) is `flex-shrink:0` — never scrolls out of view
- The `.settings-body` is `overflow-y:auto` — scrollable content below the header
