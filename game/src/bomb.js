// The objective: one bomb, two sites. The carrier plants by holding E inside a site for
// 3.5 seconds; the fuse runs 35 seconds with beeps that quicken; a defender holds E for 5
// seconds to defuse. Detonation wins the round for Vanguard; a defuse, or the timer running
// out with no plant, wins it for Sentinel. The bomb is a small visible object the carrier
// drops on death, so the round can turn on a pickup.
import * as THREE from 'three';
import { ECONOMY } from './state.js';

export function createBomb(scene, world) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.18, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.6, metalness: 0.3 }),
  );
  const light = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.04, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xf0a830, emissive: 0xf0a830, emissiveIntensity: 2 }),
  );
  light.position.set(0, 0.11, 0);
  group.add(body, light);
  group.visible = false;
  scene.add(group);

  return {
    group,
    // Place the planted bomb's mesh at its site.
    plant(siteId) {
      const site = world.sites[siteId];
      group.position.set(site.center.x, 0.1, site.center.z);
      group.visible = true;
    },
    drop(x, z) {
      group.position.set(x, 0.1, z);
      group.visible = true;
    },
    hide() {
      group.visible = false;
    },
    beepInterval(timer) {
      if (timer > 20) return 1;
      if (timer > 10) return 0.55;
      return 0.3;
    },
    plantTime: ECONOMY.plantTime,
    defuseTime: ECONOMY.defuseTime,
    fuseTime: ECONOMY.fuseTime,
  };
}
