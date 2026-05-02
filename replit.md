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
| `neon-grid/public/leaderboard.html` | Global leaderboard table with rank badges |
| `neon-grid/public/js/RankBadge.js` | **Shared ES module** — RANK_TABLE, getRankFromRP, renderRankBadge(tier, rp, size) |
| `neon-grid/public/js/Hud.js` | In-game HUD — CoD-style match timer/score, K/D, rank badge, death screen (grayscale canvas), damage numbers, hit marker |
| `neon-grid/public/js/Controls.js` | FPS controls — setInputLocked(bool), inverted-Y from localStorage, sensitivity from ng_sensitivity (int 5–30)/10000 |
| `neon-grid/public/js/main.js` | Game init — FOV listener, motion blur, setInputLocked on death/respawn |

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
