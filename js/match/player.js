// player.js — a player's runtime state, steering, stamina and stylized mesh.
// Logic (V2 positions/velocity, attributes, play style) is kept separate from
// the Three.js mesh so the simulation stays readable. Bodies are simple capsule
// + head + limb geometry, animated by code (leg swing, lean) rather than clips.
import * as THREE from '../vendor/three/three.module.js';
import { V2, clamp, steer } from '../util/mathx.js';
import { groupOf } from '../data/formations.js';

let nextId = 1;

export class Player {
  constructor(profile, side, slot) {
    this.id = nextId++;
    this.profile = profile;
    this.side = side;            // 'home' | 'away'
    this.slot = slot;            // formation slot {position,x,y}
    this.group = groupOf(profile.position);
    this.isGK = this.group === 'GK';

    this.pos = new V2(0, 0);
    this.vel = new V2(0, 0);
    this.home = new V2(0, 0);    // formation anchor in metres
    this.facing = side === 'home' ? 1 : -1; // +z or -z by default
    this.heading = new V2(0, this.facing); // unit facing vector

    this.stamina = 100;
    this.cardState = 0;          // 0 none, 1 yellow, 2 red(off)
    this.sentOff = false;
    this.tackleCooldown = 0;
    this.kickCooldown = 0;
    this.runTimer = 0;           // off-ball run state
    this.runTarget = null;

    // Derived speeds (m/s) from 0-100 attributes.
    const a = profile;
    this.topSpeed = 5.0 + (a.pace / 100) * 4.2;        // ~5..9.2 m/s
    this.accel = 18 + (a.acceleration / 100) * 22;     // m/s^2
    this.mesh = null;
    this._legPhase = Math.random() * Math.PI * 2;
  }

  staminaFactor() {
    // Fatigue gently reduces top speed (never below ~80%).
    return 0.8 + 0.2 * clamp(this.stamina / 100, 0, 1);
  }

  effectiveTopSpeed(sprint) {
    return this.topSpeed * this.staminaFactor() * (sprint ? 1.0 : 0.82);
  }

  buildMesh(colorPrimary, colorSecondary, isUser) {
    const g = new THREE.Group();
    const skin = 0xe0b48a;
    const shirt = new THREE.Color(colorPrimary);
    const shorts = new THREE.Color(colorSecondary);

    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.5, 4, 8),
      new THREE.MeshLambertMaterial({ color: shirt })
    );
    torso.position.y = 1.15; torso.castShadow = true;
    g.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 10),
      new THREE.MeshLambertMaterial({ color: skin })
    );
    head.position.y = 1.72; head.castShadow = true;
    g.add(head);

    const legMat = new THREE.MeshLambertMaterial({ color: shorts });
    const legGeo = new THREE.CapsuleGeometry(0.12, 0.5, 4, 6);
    const lLeg = new THREE.Mesh(legGeo, legMat);
    const rLeg = new THREE.Mesh(legGeo, legMat);
    lLeg.position.set(-0.15, 0.55, 0); rLeg.position.set(0.15, 0.55, 0);
    lLeg.castShadow = rLeg.castShadow = true;
    g.add(lLeg); g.add(rLeg);
    this._lLeg = lLeg; this._rLeg = rLeg;

    // Marker ring under the user-controlled / selected player.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.6, 20),
      new THREE.MeshBasicMaterial({ color: isUser ? 0x00e0ff : 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.0 })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
    g.add(ring);
    this._ring = ring;

    this.mesh = g;
    return g;
  }

  setSelected(on, isUser) {
    if (!this._ring) return;
    this._ring.material.opacity = on ? 0.9 : 0.0;
    this._ring.material.color.setHex(isUser ? 0x00e0ff : 0xffd54a);
  }

  // Move toward a desired velocity (m/s) capped by acceleration + top speed.
  driveTo(desiredVel, dt, sprint = false) {
    const top = this.effectiveTopSpeed(sprint);
    const dl = desiredVel.len;
    if (dl > top) desiredVel.scale(top / dl);
    steer(this.vel, desiredVel, this.accel, dt);
    this.pos.addScaled(this.vel, dt);
    if (this.vel.lenSq > 0.4) {
      this.heading.copy(this.vel).normalize();
    }
    // Stamina drains with effort; recovers when idle.
    const effort = this.vel.len / Math.max(0.1, this.topSpeed);
    this.stamina = clamp(this.stamina - (effort * (sprint ? 7 : 4) - 1.5) * dt, 0, 100);
    if (this.tackleCooldown > 0) this.tackleCooldown -= dt;
    if (this.kickCooldown > 0) this.kickCooldown -= dt;
  }

  syncMesh(dt) {
    if (!this.mesh) return;
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    const ang = Math.atan2(this.heading.x, this.heading.z);
    this.mesh.rotation.y = ang;
    // Leg swing proportional to speed.
    const sp = this.vel.len;
    this._legPhase += dt * (4 + sp * 1.6);
    const swing = Math.min(0.7, sp * 0.12);
    if (this._lLeg) this._lLeg.rotation.x = Math.sin(this._legPhase) * swing;
    if (this._rLeg) this._rLeg.rotation.x = -Math.sin(this._legPhase) * swing;
  }
}
