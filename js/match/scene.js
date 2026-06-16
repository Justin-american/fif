// scene.js — builds the stylized pitch: striped grass, painted lines, goals,
// nets and simple stands. Pure geometry/materials, no textures (keeps it light).
import * as THREE from '../vendor/three/three.module.js';
import { PITCH } from './pitch.js';

function lineMat() {
  return new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
}

// A thin painted line on the grass between two points (metres).
function paintLine(group, x1, z1, x2, z2, w = 0.18, y = 0.02) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const geo = new THREE.PlaneGeometry(w, len);
  const m = new THREE.Mesh(geo, lineMat());
  m.rotation.x = -Math.PI / 2;
  m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  m.rotation.z = -Math.atan2(x2 - x1, z2 - z1);
  group.add(m);
}

function paintCircle(group, cx, cz, r, segments = 48, w = 0.18, y = 0.02) {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    paintLine(group, cx + Math.cos(a0) * r, cz + Math.sin(a0) * r,
      cx + Math.cos(a1) * r, cz + Math.sin(a1) * r, w, y);
  }
}

function buildGoal(group, zSign) {
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const gw = PITCH.goalWidth, gh = PITCH.goalHeight, hl = PITCH.halfLength;
  const z = zSign * hl;
  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, gh, 8);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(sx * gw / 2, gh / 2, z);
    post.castShadow = true;
    group.add(post);
  }
  const barGeo = new THREE.CylinderGeometry(0.08, 0.08, gw, 8);
  const bar = new THREE.Mesh(barGeo, postMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, gh, z);
  bar.castShadow = true;
  group.add(bar);
  // Net (translucent box behind the line).
  const netDepth = 2.0;
  const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.25 });
  const net = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, netDepth), netMat);
  net.position.set(0, gh / 2, z + zSign * netDepth / 2);
  group.add(net);
}

function buildStands(group) {
  const hl = PITCH.halfLength, hw = PITCH.halfWidth;
  const mat = new THREE.MeshLambertMaterial({ color: 0x444a55 });
  const long = new THREE.BoxGeometry(hw * 2 + 30, 8, 12);
  for (const sx of [-1, 1]) {
    const s = new THREE.Mesh(long, mat);
    s.position.set(0, 4, sx * (hl + 14));
    group.add(s);
  }
  const sideG = new THREE.BoxGeometry(12, 8, hl * 2 + 6);
  for (const sx of [-1, 1]) {
    const s = new THREE.Mesh(sideG, mat);
    s.position.set(sx * (hw + 12), 4, 0);
    group.add(s);
  }
}

export function buildPitchMesh() {
  const group = new THREE.Group();
  const hl = PITCH.halfLength, hw = PITCH.halfWidth;

  // Surrounding ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2 + 60, hl * 2 + 60),
    new THREE.MeshLambertMaterial({ color: 0x2f6d2a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  // Striped grass.
  const stripes = 16;
  const stripeW = (hl * 2) / stripes;
  for (let i = 0; i < stripes; i++) {
    const c = i % 2 === 0 ? 0x3c8a35 : 0x357d30;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 2, stripeW),
      new THREE.MeshLambertMaterial({ color: c })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0, -hl + stripeW * (i + 0.5));
    m.receiveShadow = true;
    group.add(m);
  }

  // Markings.
  const lines = new THREE.Group();
  // Touchlines + goal lines.
  paintLine(lines, -hw, -hl, hw, -hl);
  paintLine(lines, -hw, hl, hw, hl);
  paintLine(lines, -hw, -hl, -hw, hl);
  paintLine(lines, hw, -hl, hw, hl);
  // Halfway line + centre circle + spot.
  paintLine(lines, -hw, 0, hw, 0);
  paintCircle(lines, 0, 0, PITCH.centreCircleR);
  // Penalty + goal areas, both ends.
  const paHW = PITCH.penaltyAreaHalfWidth, paD = PITCH.penaltyAreaDepth;
  const gaHW = 9.16, gaD = PITCH.goalAreaDepth;
  for (const s of [-1, 1]) {
    const gl = s * hl;
    const inner = s * (hl - paD);
    paintLine(lines, -paHW, gl, -paHW, inner);
    paintLine(lines, paHW, gl, paHW, inner);
    paintLine(lines, -paHW, inner, paHW, inner);
    const gInner = s * (hl - gaD);
    paintLine(lines, -gaHW, gl, -gaHW, gInner);
    paintLine(lines, gaHW, gl, gaHW, gInner);
    paintLine(lines, -gaHW, gInner, gaHW, gInner);
    // Penalty spot.
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), lineMat());
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(0, 0.02, s * (hl - 11));
    lines.add(spot);
  }
  group.add(lines);

  buildGoal(group, 1);
  buildGoal(group, -1);
  buildStands(group);
  return group;
}
