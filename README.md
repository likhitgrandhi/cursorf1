# Cursor F1

A minimal 3D F1 racing game built with Three.js. Race on Monaco solo vs bots, or online with up to 3 friends.

**Live hosting:** deploy to [Render](https://render.com) (free tier) — game, WebSocket multiplayer, and car model all served from one public URL.

## Car model — Ferrari SF-25

Primary mesh: **[Ferrari SF-25](https://sketchfab.com/3d-models/ferrari-sf-25-11b53fd8dc324ab7b7fed6b43c62e398)** by Abu Saif (@abuhossain844) on Sketchfab, [CC Attribution](https://creativecommons.org/licenses/by/4.0/).

Fallback: F1 2022 by Blender458 (bundled as `public/models/f1-2022.glb`).

### One-time model download (required for SF-25)

Sketchfab requires a free API token to download programmatically:

1. Create a [Sketchfab](https://sketchfab.com) account
2. Open [Settings → Password & API](https://sketchfab.com/settings/password) → **Generate Token**
3. Run:

```bash
SKETCHFAB_TOKEN=your_token_here npm run download-model
```

This saves `public/models/ferrari-sf-25.glb`.  
Or download GLB manually from the [SF-25 page](https://sketchfab.com/3d-models/ferrari-sf-25-11b53fd8dc324ab7b7fed6b43c62e398) and place it at `public/models/ferrari-sf-25.glb`.

## Deploy live (Render — free)

1. Push this repo to GitHub
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → connect repo (`render.yaml` included)
3. Set environment variable **`SKETCHFAB_TOKEN`** (your Sketchfab API token) so the build downloads the SF-25 model
4. Deploy — you get a public URL like `https://cursorf1.onrender.com`

Everything runs on that URL (no localhost):

| Path | Purpose |
|------|---------|
| `/` | Game + lobby |
| `/models/ferrari-sf-25.glb` | Car 3D model |
| `/ws` | Multiplayer WebSocket |
| `/health` | Uptime check |

**Free tier note:** Render sleeps after ~15 minutes idle; first visit may take ~1 minute to wake up ([Render free docs](https://render.com/docs/free)).

### Optional: external model CDN

Set `VITE_MODEL_URL` at build time to load the GLB from any HTTPS URL:

```bash
VITE_MODEL_URL=https://your-cdn.example.com/ferrari-sf-25.glb npm run build
```

## Local development

```bash
npm install
SKETCHFAB_TOKEN=your_token npm run download-model   # once
npm run dev
```

| Service | URL |
|---------|-----|
| Game (Vite) | http://localhost:5173 |
| Server | http://localhost:3001 |

Vite proxies `/ws` to the server during dev.

### Test multiplayer locally

Two browser tabs → **Friends Online** → Create Room → copy link → Join in tab 2 → **Start Race**.

## Controls

| Key | Action |
|-----|--------|
| ↑ | Accelerate (solo: press on grid to start countdown) |
| ↓ | Brake |
| ← → | Steer through corners |

## Online edge cases

- Max 3 players per room
- Start unlocks when host + at least 1 guest join
- Room full / invalid code / race already started → clear error messages
- Host disconnect → next player becomes host
- Idle rooms removed after 30 minutes

## Project layout

```
server/              WebSocket + static file server (production)
scripts/             Sketchfab model downloader
src/game/            Three.js race engine
src/lobby/           Lobby UI + network client
public/models/       GLB assets (SF-25 + fallback)
render.yaml          Render.com deploy config
```
