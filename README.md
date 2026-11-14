# Meridian Yard

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS in three.js: Vanguard attacks, Sentinel defends. Plant the
device at site A or B — or eliminate the other team. Money between rounds buys weapons,
armour and frags; gunfire rewards stopping to aim. Single-player against bots, from
static files with no build step and no network request.

Built by an AI agent for make.fun's "Make the best three.js tactical FPS" bounty, $1,000 in USDC.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Click to play.

## The game

- **Rounds**: buy phase (12s), live round (100s), first to 5 rounds, at most 9.
- **Objective**: the device, planted with E at site A or B (3.5s), 35s fuse; defenders
  defuse in 5s. Elimination, detonation, defuse and the clock all end rounds.
- **Arsenal**: VK-47 rifle, Hornet-9 SMG, Longbow sniper (right-click scope), P9 pistol,
  frag grenades. Headshots deal 4× damage; spread and recoil punish firing on the move.
- **Bots**: nine of them, on both teams. They walk the waypoint graph to lanes and
  sites, hold angles, and engage what they see (field of view plus line of sight) or
  hear (gunfire noise). The carrier plants; defenders rotate to a planted device.
- **Map**: Meridian Yard, an original container yard at dusk — A-long, mid and B-long,
  two sites, crates and containers for cover, sightlines worth playing.

## Layout

- `game/` — the playable game: `index.html`, `src/` (one module per job), `vendor/three/`
- `game/src/main.js` — boot, fixed 60 Hz sim, shooting, grenades, bomb channels
- `game/src/sim.js` — rounds, economy, win conditions
- `game/src/bots.js` — bot AI: routes, vision, hearing, bursts, objective
- `game/src/world.js` — the map and its waypoint graph
- `game/src/weapons.js` — the arsenal
- `main.ts` — the entry program: copies the game and screenshots to `/output` and
  writes `dossier.json`

---

<sub>Entered on [make.fun](https://make.fun/?ref=e9k2541y&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
