// The arsenal: four weapons and a grenade, each with its own numbers. Stopping to aim
// pays: spread grows with movement and with every shot in a burst, and recoil kicks the
// camera. The view model is simple geometry on the camera; the numbers are the game.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'VK-47', price: 2700, auto: true, mag: 30, reserve: 90,
    damage: 34, headMult: 4, fireGap: 0.096, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMoving: 0.028, recoil: 0.011, range: 90,
  },
  smg: {
    id: 'smg', name: 'Hornet-9', price: 1500, auto: true, mag: 25, reserve: 100,
    damage: 26, headMult: 4, fireGap: 0.068, reloadTime: 1.5,
    spreadStill: 0.004, spreadMoving: 0.034, recoil: 0.007, range: 60,
  },
  pistol: {
    id: 'pistol', name: 'P9', price: 500, auto: false, mag: 12, reserve: 48,
    damage: 38, headMult: 4, fireGap: 0.16, reloadTime: 1.4,
    spreadStill: 0.0018, spreadMoving: 0.02, recoil: 0.009, range: 50,
  },
  sniper: {
    id: 'sniper', name: 'Longbow', price: 4750, auto: false, mag: 5, reserve: 15,
    damage: 110, headMult: 4, fireGap: 1.1, reloadTime: 2.6,
    spreadStill: 0.0004, spreadMoving: 0.05, recoil: 0.05, range: 120,
  },
};
export const GRENADE = { id: 'grenade', name: 'Frag', price: 300, damage: 120, radius: 6, fuse: 2.2 };
export const ARMOR = { id: 'armor', name: 'Vest', price: 650 };

const gripMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.7, metalness: 0.2 });
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.5, metalness: 0.35 });
const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.2 });

function buildViewModel(def) {
  const model = new THREE.Group();
  const long = def.id === 'sniper';
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, long ? 0.55 : 0.42), bodyMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, long ? 0.55 : 0.4), gripMat);
  barrel.position.set(0, 0.025, long ? -0.5 : -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), gripMat);
  stock.position.set(0, -0.02, 0.3);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.1), accentMat);
  mag.position.set(0, -0.1, -0.05);
  model.add(receiver, barrel, stock, mag);
  if (def.id === 'sniper') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12), gripMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, 0.05);
    model.add(scope);
  }
  model.position.set(0.24, -0.2, -0.42);
  return model;
}

export function createArsenal(camera, rng) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    const model = buildViewModel(def);
    model.visible = false;
    camera.add(model);
    models[def.id] = model;
  }
  const grenadeModel = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), bodyMat);
  grenadeModel.add(ball);
  grenadeModel.position.set(0.24, -0.2, -0.42);
  grenadeModel.visible = false;
  camera.add(grenadeModel);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'rifle',
    mag: WEAPONS.rifle.mag,
    reserve: WEAPONS.rifle.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0, // extra spread from firing in a burst; decays when not firing
    grenades: 0,
    owned: { rifle: true, pistol: true, smg: false, sniper: false },
    armor: 0,
  };

  function def() {
    return WEAPONS[state.current];
  }

  function showModel() {
    for (const [id, model] of Object.entries(models)) model.visible = id === state.current;
    grenadeModel.visible = false;
  }
  showModel();

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.05);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    spread(speed) {
      const d = def();
      const moving = Math.min(1, speed / 5.2);
      return d.spreadStill + moving * d.spreadMoving + state.bloom;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(0.03, state.bloom + 0.004);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || state.mag === d.mag || state.reserve === 0) return;
      state.reloadLeft = d.reloadTime;
    },
    recoil() {
      return def().recoil;
    },
    switchTo(id) {
      if (!state.owned[id] || state.current === id) return false;
      state.current = id;
      state.mag = WEAPONS[id].mag;
      state.reserve = WEAPONS[id].reserve;
      state.reloadLeft = 0;
      state.cooldown = 0.2;
      showModel();
      return true;
    },
    buy(id, money) {
      const item = WEAPONS[id] ?? (id === 'grenade' ? GRENADE : id === 'armor' ? ARMOR : null);
      if (!item || money < item.price) return money;
      if (id === 'grenade') {
        if (state.grenades >= 2) return money;
        state.grenades += 1;
      } else if (id === 'armor') {
        if (state.armor >= 100) return money;
        state.armor = 100;
      } else {
        if (state.owned[id]) return money;
        state.owned[id] = true;
        state.current = id;
        state.mag = item.mag;
        state.reserve = item.reserve;
        showModel();
      }
      return money - item.price;
    },
    refillRound() {
      for (const id of Object.keys(state.owned)) {
        if (id === state.current) continue;
      }
      state.mag = def().mag;
      state.reserve = def().reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
    showGrenade() {
      for (const model of Object.values(models)) model.visible = false;
      grenadeModel.visible = true;
    },
    hideGrenade() {
      grenadeModel.visible = false;
      showModel();
    },
  };
}
