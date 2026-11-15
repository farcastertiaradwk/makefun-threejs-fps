// The bots: one system for both teams. Each bot is a body (the same movement and collision
// as the player) plus a small state machine: route along the waypoint graph to its assigned
// site or lane, hold an angle, engage what it sees, and carry out the objective. Vision is a
// field of view plus a line-of-sight ray against the world's boxes; hearing is the noise
// events gunfire leaves in the shared state. Bots never see through walls and never know
// where the player is until they see or hear them.
import * as THREE from 'three';
import { TEAM } from './palette.js';
import { createBody } from './player.js';
import { findRoute, nearestWaypoint, waypoint } from './world.js';
import { range } from './rng.js';

const BOT_HEALTH = 100;
const FOV_COS = Math.cos((100 * Math.PI) / 360);
const VISION_RANGE = 42;
const HEAR_RADIUS = 20;
const REACTION_BASE = 0.28;
const BURST_MIN = 3;
const BURST_MAX = 5;
const SHOT_GAP = 0.12;
const BURST_PAUSE = 0.55;
const DAMAGE_TORSO = 30;
const DAMAGE_HEAD = 120;
const DAMAGE_LEGS = 22;

const NAMES = {
  vanguard: ['Rook', 'Heron', 'Moss', 'Vega'],
  sentinel: ['Ash', 'Bram', 'Cinder', 'Frost', 'Gale'],
};

const _toTarget = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _ray = new THREE.Raycaster();

function hasLineOfSight(from, to, shootables) {
  _dir.subVectors(to, from);
  const distance = _dir.length();
  if (distance < 0.01) return true;
  _dir.multiplyScalar(1 / distance);
  _ray.set(from, _dir);
  _ray.far = distance;
  const hits = _ray.intersectObjects(shootables, false);
  return hits.length === 0;
}

export function createBots(scene, world, state, rng, events) {
  const list = [];
  const hitMeshes = [];
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.7, metalness: 0.1 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.8, metalness: 0.05 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeo = new THREE.SphereGeometry(0.155, 16, 12);
  const legGeo = new THREE.BoxGeometry(0.18, 0.7, 0.18);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const visorGeo = new THREE.BoxGeometry(0.2, 0.06, 0.05);

  function buildBot(team, index, spawn) {
    const group = new THREE.Group();
    // The visor glows in the team colour so a bot reads at dusk, in a screenshot as
    // well as in play.
    const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM[team]), roughness: 0.5, metalness: 0.1, emissive: new THREE.Color(TEAM[team]), emissiveIntensity: 0.7 });
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.53;
    const visor = new THREE.Mesh(visorGeo, trim);
    visor.position.set(0, 1.55, -0.14);
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.13, 0.35, 0);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.13, 0.35, 0);
    const gun = new THREE.Mesh(gunGeo, legMat);
    gun.position.set(0.2, 1.05, -0.3);
    group.add(torso, head, visor, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    group.position.set(spawn[0], 0, spawn[1]);
    scene.add(group);

    const bot = {
      id: `${team}-${index}`,
      name: NAMES[team][index] ?? `${team}-${index}`,
      team,
      group,
      torso,
      head,
      legL,
      legR,
      body: createBody(world.colliders, spawn[0], spawn[1], team === 'vanguard' ? 0 : Math.PI),
      health: BOT_HEALTH,
      alive: true,
      mode: 'route',
      route: [],
      routeIndex: 0,
      routeTarget: null, // the site (or 'bomb') the current route leads to
      fetchTarget: null, // the dropped-device position this bot is fetching, if any
      targetSite: null,
      holdPoint: null,
      holdYaw: 0,
      target: null, // the bot or 'player' currently engaged
      lastTarget: null, // the target the reaction clock was started for
      visibleAt: -10,
      reactionAt: 0,
      burstLeft: 0,
      shotTimer: 0,
      pauseTimer: 0,
      scanTimer: range(rng, 0, 0.15),
      lastX: spawn[0],
      lastZ: spawn[1],
      stuckTimer: 0,
      engageStuckTimer: 0, // time spent trying to close in without moving (see engage)
      noEngageUntil: 0, // cooldown after the engage-stuck fallback, so the bot routes first
      grenades: 1, // one frag per round; spent on a distant target (see engage)
      grenadeAt: 0, // next time this bot may throw
      actionProgress: 0,
      actionTarget: null,
      alertPos: null,
      alertUntil: 0,
      walkPhase: 0,
      fall: 0,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    legL.userData.bot = bot;
    legL.userData.part = 'legs';
    legR.userData.bot = bot;
    legR.userData.part = 'legs';
    hitMeshes.push(torso, head, legL, legR);
    list.push(bot);
    return bot;
  }

  function assignRoute(bot, targetSite) {
    const from = nearestWaypoint(bot.body.state.position.x, bot.body.state.position.z);
    bot.route = findRoute(from, targetSite === 'A' ? 'siteA' : 'siteB');
    bot.routeIndex = 0;
    bot.routeTarget = targetSite;
    bot.targetSite = targetSite;
    bot.mode = 'route';
  }

  function spawnRound() {
    for (const bot of list) scene.remove(bot.group);
    list.length = 0;
    hitMeshes.length = 0;
    // The squad pushes one site together (state.attackSite), not a split 2+2:
    // a split attack bled rounds to the defenders, who held both sites.
    for (let i = 0; i < 4; i += 1) {
      const bot = buildBot('vanguard', i, world.spawns.vanguard[i]);
      assignRoute(bot, state.attackSite);
    }
    for (let i = 0; i < 5; i += 1) {
      const bot = buildBot('sentinel', i, world.spawns.sentinel[i]);
      const site = i < 2 ? 'A' : i < 4 ? 'B' : null;
      if (site) {
        bot.targetSite = site;
        bot.mode = 'hold';
        // A checked hold spot inside the site, not a random offset off the site centre.
        const point = world.sites[site].holds[i % world.sites[site].holds.length];
        bot.holdPoint = { x: point[0], z: point[1] };
        // Defenders face south, toward the attackers coming up from the Vanguard spawn.
        bot.holdYaw = Math.PI + range(rng, -0.5, 0.5);
      } else {
        assignRoute(bot, 'A');
        bot.mode = 'route';
        bot.holdPoint = { x: 0, z: -8 };
      }
    }
  }

  function damage(bot, amount, fromPos) {
    if (!bot.alive) return false;
    bot.health -= amount;
    // Being shot turns the bot toward the shooter: damage is information, like sound.
    if (fromPos) {
      bot.alertPos = { x: fromPos.x, z: fromPos.z };
      bot.alertUntil = state.elapsed + 2;
    }
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.mode = 'dead';
    bot.fall = 0;
    return true;
  }

  function canSee(bot, targetPos, targetEyeY) {
    const body = bot.body.state;
    _eye.set(body.position.x, body.position.y + body.eye, body.position.z);
    _toTarget.set(targetPos.x, targetPos.y + targetEyeY, targetPos.z);
    const distance = _eye.distanceTo(_toTarget);
    if (distance > VISION_RANGE) return null;
    _dir.subVectors(_toTarget, _eye).normalize();
    _forward.set(-Math.sin(body.yaw), 0, -Math.cos(body.yaw));
    if (_dir.dot(_forward) < FOV_COS && distance > 3) return null;
    if (!hasLineOfSight(_eye, _toTarget, world.shootables)) return null;
    return distance;
  }

  function shootAt(bot, targetPos, targetEyeY, distance) {
    const body = bot.body.state;
    _eye.set(body.position.x, body.position.y + body.eye, body.position.z);
    // Spread grows with distance and with the bot's own movement.
    const moving = bot.body.groundSpeed() > 0.5;
    const spread = 0.012 + distance * 0.0011 + (moving ? 0.02 : 0);
    _toTarget.set(targetPos.x, targetPos.y + targetEyeY, targetPos.z);
    _dir.subVectors(_toTarget, _eye).normalize();
    _dir.x += (rng() * 2 - 1) * spread;
    _dir.y += (rng() * 2 - 1) * spread;
    _dir.z += (rng() * 2 - 1) * spread;
    _dir.normalize();
    events.onBotShot(bot, _eye.clone(), _dir.clone());
  }

  function stepBot(bot, dt, player, time) {
    const body = bot.body.state;
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.group.rotation.x = 0;

    // Bots hold their ground while the round is not live: during the buy phase they
    // must not walk their routes and arrive at the sites before the round starts.
    if (state.phase !== 'live') {
      bot.group.position.set(body.position.x, body.position.y, body.position.z);
      bot.group.rotation.y = body.yaw;
      return;
    }

    // Scan for visible enemies on a stagger so nine bots do not raycast on one frame.
    bot.scanTimer -= dt;
    if (bot.scanTimer <= 0) {
      bot.scanTimer = 0.15;
      bot.target = null;
      // Bots only acquire targets while the round is live: during the buy phase they
      // pre-position and do not fight, and a round that ends drops them out of engage.
      let bestDistance = Infinity;
      // After the engage-stuck fallback the bot pushes for a few seconds and
      // only fights what is close, or it would re-engage the same visible
      // target through the same wall and never get around it.
      if (state.phase === 'live') {
        // The carrier's job is the site, not a duel: it only engages close threats.
        const maxRange = state.bombCarrier === bot.id ? 10
          : (time < bot.noEngageUntil ? 12 : Infinity);
        // The player is the only vanguard body the bots can see directly. Note the
        // argument here is the whole player ({ body, alive }), not just the body
        // state: the scan needs player.alive, and passing only the body state made
        // the bots blind to the player entirely.
        // Only Sentinel bots acquire the player: the player is Vanguard, and
        // letting Vanguard bots target the player made the player's own
        // squadmates gun them down at spawn in the first second of live — they
        // stand 1.5–4 m away, inside the bots' field of view, and the player
        // was the nearest "target". Proven by probe: "Heron ▸ You", and Heron
        // is a Vanguard bot.
        if (bot.team === 'sentinel' && player.alive) {
          const distance = canSee(bot, player.body.state.position, 1.2);
          if (distance !== null && distance < bestDistance && distance < maxRange) {
            bestDistance = distance;
            bot.target = 'player';
          }
        }
        if (bot.team === 'sentinel') {
          for (const other of list) {
            if (other.team !== 'vanguard' || !other.alive) continue;
            const distance = canSee(bot, other.body.state.position, 1.2);
            if (distance !== null && distance < bestDistance && distance < maxRange) {
              bestDistance = distance;
              bot.target = other;
            }
          }
        } else {
          for (const other of list) {
            if (other.team !== 'sentinel' || !other.alive) continue;
            const distance = canSee(bot, other.body.state.position, 1.2);
            if (distance !== null && distance < bestDistance && distance < maxRange) {
              bestDistance = distance;
              bot.target = other;
            }
          }
        }
      }
      if (bot.target) {
        bot.visibleAt = time;
        // The reaction clock starts when a NEW target is acquired. Setting it on every
        // scan would push it forward forever and the bot would never fire — that was
        // the bug that left every firefight silent.
        if (bot.target !== bot.lastTarget) {
          bot.lastTarget = bot.target;
          bot.reactionAt = time + REACTION_BASE + bestDistance * 0.008 + rng() * 0.25;
        }
        if (bot.mode !== 'engage') bot.mode = 'engage';
      } else if (bot.mode === 'engage' && time - bot.visibleAt > 1.2) {
        // Back to what the bot was doing before the fight: if it still has a route
        // (pushing a site, fetching the device), resume it — reverting to 'hold'
        // here used to abandon the route and strand the bot.
        bot.mode = (bot.route.length > 0 && bot.routeIndex < bot.route.length) ? 'route' : (bot.holdPoint ? 'hold' : 'route');
        bot.target = null;
        bot.lastTarget = null;
      }
    }

    // Hearing: a recent gunshot nearby turns the bot toward it.
    if (!bot.target) {
      for (const noise of state.noise) {
        if (time - noise.time > 1.5) continue;
        const dx = noise.x - body.position.x;
        const dz = noise.z - body.position.z;
        if (dx * dx + dz * dz < HEAR_RADIUS * HEAR_RADIUS) {
          body.yaw = Math.atan2(-dx, -dz);
          break;
        }
      }
    }

    // Squad convergence: Vanguard pushes the attack site together. When the attack
    // site moves (the carrier walked into the other site), re-route — unless this
    // bot is fetching the device, carrying it, or fighting.
    if (bot.team === 'vanguard' && bot.mode !== 'engage' && !bot.fetchTarget
      && state.bombCarrier !== bot.id && bot.routeTarget !== state.attackSite
      && bot.routeTarget !== 'bomb') {
      assignRoute(bot, state.attackSite);
    }

    let moveX = 0;
    let moveZ = 0;
    let wantYaw = null;

    if (bot.mode === 'engage' && bot.target) {
      const targetPos = bot.target === 'player' ? player.body.state.position : bot.target.body.state.position;
      const targetEye = 1.2;
      const distance = Math.hypot(targetPos.x - body.position.x, targetPos.z - body.position.z);
      _toTarget.set(targetPos.x, targetPos.y + targetEye, targetPos.z);
      wantYaw = Math.atan2(-(targetPos.x - body.position.x), -(targetPos.z - body.position.z));
      // Hold ground at range, close in when far, back off when point blank.
      if (distance > 12) {
        moveX = targetPos.x - body.position.x;
        moveZ = targetPos.z - body.position.z;
        // Stuck on a wall while closing in: the straight line to the target
        // crosses a barrier the bot cannot walk through — the low spawn
        // barriers at z=12.5 stop a straight push (the bot can see and shoot
        // over them, eye 1.53 m vs a 1.1 m wall) but not the waypoint graph,
        // which threads the mid gap. Fall back to routing so the waypoints
        // carry the bot around the obstacle; for the next 6 s it only fights
        // what is close (see the scan's maxRange), instead of stopping to
        // duel the same distant target through the same wall. Only when
        // closing in (distance > 12): a bot holding ground at range is not
        // stuck.
        const moved = Math.hypot(body.position.x - bot.lastX, body.position.z - bot.lastZ);
        if (moved < 0.02) {
          bot.engageStuckTimer += dt;
          if (bot.engageStuckTimer > 1.5) {
            bot.engageStuckTimer = 0;
            bot.target = null;
            bot.lastTarget = null;
            bot.noEngageUntil = time + 6;
            if (bot.team === 'vanguard' && bot.targetSite) {
              assignRoute(bot, bot.targetSite);
            } else if (bot.team === 'sentinel' && bot.holdPoint) {
              const from = nearestWaypoint(body.position.x, body.position.z);
              const to = nearestWaypoint(bot.holdPoint.x, bot.holdPoint.z);
              bot.route = findRoute(from, to);
              bot.routeIndex = 0;
              bot.routeTarget = bot.targetSite;
              bot.mode = 'route';
            }
          }
        } else bot.engageStuckTimer = 0;
      } else if (distance < 4) {
        moveX = -(targetPos.x - body.position.x);
        moveZ = -(targetPos.z - body.position.z);
      }
      // Frag: a bot holding a grenade lobs it at a distant target rifle fire
      // cannot finish — entrenched defenders, long lanes. One per round.
      if (bot.grenades > 0 && distance > 12 && time >= bot.grenadeAt) {
        bot.grenades -= 1;
        bot.grenadeAt = time + 20;
        events.onBotGrenade(bot, { x: targetPos.x, z: targetPos.z });
      }
      // Fire in bursts once the reaction time has passed.
      if (time >= bot.reactionAt) {
        if (bot.burstLeft <= 0 && bot.pauseTimer <= 0) {
          bot.burstLeft = BURST_MIN + Math.floor(rng() * (BURST_MAX - BURST_MIN + 1));
          bot.shotTimer = 0;
        }
        if (bot.burstLeft > 0) {
          bot.shotTimer -= dt;
          if (bot.shotTimer <= 0) {
            bot.shotTimer = SHOT_GAP;
            bot.burstLeft -= 1;
            shootAt(bot, targetPos, targetEye, distance);
            if (bot.burstLeft <= 0) bot.pauseTimer = BURST_PAUSE;
          }
        }
      }
      if (bot.pauseTimer > 0) bot.pauseTimer -= dt;
    } else if (bot.mode === 'route') {
      const nodeId = bot.route[bot.routeIndex];
      if (!nodeId) {
        if (bot.fetchTarget) {
          // The route ended at the waypoint nearest the dropped device: walk the last
          // metres to the device itself, so the pickup (1.5 m) triggers. Stay in
          // route mode while fetching.
          const dx = bot.fetchTarget.x - body.position.x;
          const dz = bot.fetchTarget.z - body.position.z;
          if (Math.hypot(dx, dz) > 1) {
            moveX = dx;
            moveZ = dz;
            wantYaw = Math.atan2(-dx, -dz);
          }
        } else {
          bot.mode = 'hold';
          bot.holdPoint = { x: body.position.x, z: body.position.z };
          bot.holdYaw = body.yaw;
        }
      } else {
        const node = waypoint(nodeId);
        const dx = node.x - body.position.x;
        const dz = node.z - body.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 1.2) {
          bot.routeIndex += 1;
        } else {
          moveX = dx;
          moveZ = dz;
          wantYaw = Math.atan2(-dx, -dz);
        }
      }
      // Stuck: skip to the next waypoint.
      const moved = Math.hypot(body.position.x - bot.lastX, body.position.z - bot.lastZ);
      if (moved < 0.02) {
        bot.stuckTimer += dt;
        if (bot.stuckTimer > 2) {
          bot.stuckTimer = 0;
          bot.routeIndex += 1;
        }
      } else bot.stuckTimer = 0;
    } else if (bot.mode === 'hold' && bot.holdPoint) {
      const dx = bot.holdPoint.x - body.position.x;
      const dz = bot.holdPoint.z - body.position.z;
      if (Math.hypot(dx, dz) > 1) {
        moveX = dx;
        moveZ = dz;
        wantYaw = Math.atan2(-dx, -dz);
      } else {
        wantYaw = bot.holdYaw;
      }
    }

    // Objective: the carrier plants when its team holds a site; a defender defuses a plant.
    if (bot.mode !== 'engage' && state.phase === 'live') {
      if (bot.team === 'vanguard' && bot.routeTarget === 'bomb' && !state.bombDroppedAt && state.bombCarrier !== bot.id) {
        // A teammate recovered the device: stop converging on the drop spot and push
        // the site again.
        bot.fetchTarget = null;
        assignRoute(bot, bot.targetSite);
      } else if (bot.team === 'vanguard' && state.bombCarrier === bot.id && bot.targetSite) {
        const site = world.sites[bot.targetSite];
        const dx = site.center.x - body.position.x;
        const dz = site.center.z - body.position.z;
        if (Math.abs(dx) < site.half && Math.abs(dz) < site.half) {
          bot.actionProgress += dt;
          if (bot.actionProgress >= 3.5) {
            bot.actionProgress = 0;
            events.onPlant(bot, bot.targetSite);
          }
          moveX = 0;
          moveZ = 0;
        } else if (bot.mode !== 'route' || bot.routeTarget !== bot.targetSite) {
          // The carrier walks to its site — including after picking up a dropped device,
          // when its route still points at the device, not the site.
          bot.fetchTarget = null;
          assignRoute(bot, bot.targetSite);
        }
      } else if (bot.team === 'vanguard' && state.bombDroppedAt) {
        // The device is down: the nearest Vanguard bot goes and fetches it. Without this
        // the bomb would sit where the player fell and the round would time out.
        const dropped = state.bombDroppedAt;
        // Re-assign when the drop moved, or when the bot lost its route (a fight can
        // knock it back to 'hold'); otherwise it would sit on a stale fetchTarget.
        if ((!bot.fetchTarget || Math.hypot(dropped.x - bot.fetchTarget.x, dropped.z - bot.fetchTarget.z) > 1) || bot.mode !== 'route') {
          bot.fetchTarget = { x: dropped.x, z: dropped.z };
          const from = nearestWaypoint(body.position.x, body.position.z);
          const to = nearestWaypoint(dropped.x, dropped.z);
          bot.route = findRoute(from, to);
          bot.routeIndex = 0;
          bot.routeTarget = 'bomb';
          bot.mode = 'route';
        }
      } else if (bot.team === 'sentinel' && state.bombPlanted && state.bombSite) {
        const site = world.sites[state.bombSite];
        const dx = site.center.x - body.position.x;
        const dz = site.center.z - body.position.z;
        if (Math.abs(dx) < site.half && Math.abs(dz) < site.half) {
          bot.actionProgress += dt;
          if (bot.actionProgress >= 5) {
            bot.actionProgress = 0;
            events.onDefuse(bot);
          }
          moveX = 0;
          moveZ = 0;
        } else if (bot.mode !== 'route') {
          const from = nearestWaypoint(body.position.x, body.position.z);
          bot.route = findRoute(from, state.bombSite === 'A' ? 'siteA' : 'siteB');
          bot.routeIndex = 0;
          bot.mode = 'route';
        }
      } else {
        bot.actionProgress = 0;
      }
    }

    // Damage is information: a bot that was just shot turns toward the shooter, unless
    // it is already engaging someone.
    if (bot.alertUntil > time && bot.alertPos && bot.mode !== 'engage') {
      wantYaw = Math.atan2(-(bot.alertPos.x - body.position.x), -(bot.alertPos.z - body.position.z));
    }

    // Separation: squadmates on a route keep ~3 m apart instead of stacking on
    // one waypoint line — a stacked squad is one frag grenade's worth of kills,
    // and stacked bodies block each other's line of fire. Not while planting or
    // defusing (actionProgress > 0): the carrier must stand still to plant.
    if (bot.mode === 'route' && bot.actionProgress === 0) {
      for (const other of list) {
        if (other === bot || other.team !== bot.team || !other.alive) continue;
        const dx = body.position.x - other.body.state.position.x;
        const dz = body.position.z - other.body.state.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 3) {
          const push = (3 - d) / 3;
          moveX += (dx / d) * push;
          moveZ += (dz / d) * push;
        }
      }
    }

    // Turn smoothly toward the wanted yaw, then walk.
    if (wantYaw !== null) {
      let diff = wantYaw - body.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      body.yaw += Math.max(-dt * 6, Math.min(dt * 6, diff));
    }
    const length = Math.hypot(moveX, moveZ);
    let forward = 0;
    let strafe = 0;
    if (length > 0.01) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      const nx = moveX / length;
      const nz = moveZ / length;
      forward = -sin * nx - cos * nz;
      strafe = cos * nx - sin * nz;
      const scale = Math.min(1, length / 2);
      forward *= scale;
      strafe *= scale;
    }
    bot.body.step(dt, forward, strafe, false, false, false);
    // Last position, for the stuck detectors (route mode and engage mode both
    // measure movement since the previous step).
    bot.lastX = body.position.x;
    bot.lastZ = body.position.z;

    // Walk cycle and facing.
    bot.walkPhase += dt * (bot.body.groundSpeed() * 1.6);
    const swing = Math.sin(bot.walkPhase) * 0.35 * Math.min(1, bot.body.groundSpeed() / 4);
    bot.legL.rotation.x = swing;
    bot.legR.rotation.x = -swing;
    bot.group.position.set(body.position.x, body.position.y, body.position.z);
    bot.group.rotation.y = body.yaw;
    bot.torso.rotation.x = body.pitch * 0.4;
    bot.head.rotation.x = body.pitch * 0.4;
  }

  return {
    list,
    hitMeshes,
    spawnRound,
    damage,
    step(dt, player, time) {
      for (const bot of list) stepBot(bot, dt, player, time);
    },
    aliveCount(team) {
      return list.filter((bot) => bot.team === team && bot.alive).length;
    },
    reset() {
      for (const bot of list) {
        bot.health = BOT_HEALTH;
        bot.alive = true;
        bot.mode = 'route';
        bot.routeIndex = 0;
        bot.routeTarget = null;
        bot.fetchTarget = null;
        bot.target = null;
        bot.lastTarget = null;
        bot.fall = 0;
        bot.group.rotation.set(0, 0, 0);
      }
    },
  };
}

export { DAMAGE_TORSO, DAMAGE_HEAD, DAMAGE_LEGS };
