// Effects, pooled: tracers, impact sparks and the explosion burst. Nothing is allocated
// per frame in the hot path: a fixed pool of meshes is reused, and each effect carries its
// own life in a plain array the step function walks.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 40;
const PARTICLE_COUNT = 60;

export function createEffects(scene) {
  const tracers = [];
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 });
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  const sparks = [];
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe08a), transparent: true, opacity: 0.95 });
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, velocity: new THREE.Vector3() });
  }
  const particles = [];
  const particleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a2a), transparent: true, opacity: 0.9 });
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), particleMat);
    mesh.visible = false;
    scene.add(mesh);
    particles.push({ mesh, life: 0, velocity: new THREE.Vector3() });
  }
  const explosionLight = new THREE.PointLight(new THREE.Color(0xff7a2a), 0, 22, 1.4);
  scene.add(explosionLight);
  let explosionLife = 0;

  const _mid = new THREE.Vector3();
  const _dir = new THREE.Vector3();

  return {
    tracer(from, to) {
      for (const item of tracers) {
        if (item.life > 0) continue;
        item.life = 0.07;
        item.mesh.visible = true;
        _mid.addVectors(from, to).multiplyScalar(0.5);
        item.mesh.position.copy(_mid);
        _dir.subVectors(to, from);
        const length = _dir.length();
        item.mesh.scale.set(1, 1, Math.max(0.1, length));
        item.mesh.lookAt(to);
        return;
      }
    },
    spark(point, normal) {
      let placed = 0;
      for (const item of sparks) {
        if (item.life > 0 || placed >= 4) continue;
        item.life = 0.25 + Math.random() * 0.2;
        item.mesh.visible = true;
        item.mesh.position.copy(point);
        item.velocity.set(
          normal.x + (Math.random() * 2 - 1) * 1.5,
          Math.abs(normal.y) + Math.random() * 1.5 + 0.5,
          normal.z + (Math.random() * 2 - 1) * 1.5,
        );
        placed += 1;
      }
    },
    explosion(point) {
      for (const item of particles) {
        item.life = 0.5 + Math.random() * 0.7;
        item.mesh.visible = true;
        item.mesh.position.copy(point);
        const angle = Math.random() * Math.PI * 2;
        const up = Math.random() * 6 + 2;
        const out = Math.random() * 5 + 1;
        item.velocity.set(Math.cos(angle) * out, up, Math.sin(angle) * out);
      }
      explosionLight.position.copy(point);
      explosionLight.position.y += 1;
      explosionLife = 0.5;
    },
    step(dt) {
      for (const item of tracers) {
        if (item.life <= 0) continue;
        item.life -= dt;
        if (item.life <= 0) item.mesh.visible = false;
      }
      for (const item of sparks) {
        if (item.life <= 0) continue;
        item.life -= dt;
        item.velocity.y -= 12 * dt;
        item.mesh.position.addScaledVector(item.velocity, dt);
        if (item.life <= 0) item.mesh.visible = false;
      }
      for (const item of particles) {
        if (item.life <= 0) continue;
        item.life -= dt;
        item.velocity.y -= 9 * dt;
        item.mesh.position.addScaledVector(item.velocity, dt);
        const scale = Math.max(0.05, item.life);
        item.mesh.scale.setScalar(scale);
        if (item.life <= 0) item.mesh.visible = false;
      }
      if (explosionLife > 0) {
        explosionLife -= dt;
        explosionLight.intensity = Math.max(0, explosionLife * 160);
      } else {
        explosionLight.intensity = 0;
      }
    },
  };
}
