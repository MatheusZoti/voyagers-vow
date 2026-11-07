import * as THREE from 'three';

/**
 * Modelos low-poly procedurais (estilo Albion: formas simples, flat shading, cores saturadas).
 * Cada modelo expõe as partes que a animação procedural mexe.
 */

export const mat = (color: THREE.ColorRepresentation, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...extra });

export interface Rig {
  root: THREE.Group;
  /** gira para a direção do olhar */
  body: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  head: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  height: number;
  /** fase da caminhada */
  walk: number;
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

/** Membro com pivô no topo (para balançar). */
function limb(geo: THREE.BufferGeometry, m: THREE.Material, len: number, x: number, y: number, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const me = mesh(geo, m, 0, -len / 2, 0);
  g.add(me);
  return g;
}

function collect(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const out = new Set<THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m instanceof THREE.MeshStandardMaterial) out.add(m);
  });
  return [...out];
}

export function buildPlayer(accent: string): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = mat('#e9b48a');
  const tunic = mat('#3b5a8c');
  const trim = mat(accent, { emissive: accent, emissiveIntensity: 0.15 });
  const leather = mat('#5b3b26');
  const hair = mat('#2a1d16');

  const legL = limb(new THREE.BoxGeometry(0.2, 0.62, 0.22), leather, 0.62, -0.13, 0.66);
  const legR = limb(new THREE.BoxGeometry(0.2, 0.62, 0.22), leather, 0.62, 0.13, 0.66);
  body.add(legL, legR);

  const torso = mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.72, 7), tunic, 0, 1.02, 0);
  const belt = mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 7), trim, 0, 0.72, 0);
  const scarf = mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.14, 7), trim, 0, 1.38, 0);
  body.add(torso, belt, scarf);

  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  head.add(mesh(new THREE.IcosahedronGeometry(0.23, 1), skin));
  const cap = mesh(new THREE.SphereGeometry(0.245, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.03, -0.02);
  head.add(cap);
  const tail = mesh(new THREE.ConeGeometry(0.08, 0.3, 5), hair, 0, -0.05, -0.24);
  tail.rotation.x = -2.2;
  head.add(tail);
  body.add(head);

  const fistGeo = new THREE.IcosahedronGeometry(0.11, 0);
  const armGeo = new THREE.BoxGeometry(0.15, 0.55, 0.16);
  const armL = limb(armGeo, tunic, 0.55, -0.38, 1.34);
  const armR = limb(armGeo, tunic, 0.55, 0.38, 1.34);
  armL.add(mesh(fistGeo, trim, 0, -0.6, 0));
  armR.add(mesh(fistGeo, trim, 0, -0.6, 0));
  body.add(armL, armR);

  return { root, body, legL, legR, armL, armR, head, materials: collect(root), height: 1.9, walk: 0 };
}

export function buildGrunt(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = mat('#7d8f4e');
  const dark = mat('#3e4526');
  const bone = mat('#e8dcc0');
  const legL = limb(new THREE.BoxGeometry(0.18, 0.45, 0.2), dark, 0.45, -0.15, 0.48);
  const legR = limb(new THREE.BoxGeometry(0.18, 0.45, 0.2), dark, 0.45, 0.15, 0.48);
  body.add(legL, legR);
  const torso = mesh(new THREE.DodecahedronGeometry(0.42, 0), skin, 0, 0.85, 0.05);
  torso.scale.set(1, 0.9, 1.1);
  body.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 1.12, 0.32);
  head.add(mesh(new THREE.IcosahedronGeometry(0.22, 0), skin));
  const hornL = mesh(new THREE.ConeGeometry(0.05, 0.22, 4), bone, -0.12, 0.17, 0);
  const hornR = mesh(new THREE.ConeGeometry(0.05, 0.22, 4), bone, 0.12, 0.17, 0);
  hornL.rotation.z = 0.5;
  hornR.rotation.z = -0.5;
  const eyes = mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), mat('#ffde4a', { emissive: '#ffbb00', emissiveIntensity: 1 }), 0, 0.03, 0.19);
  head.add(hornL, hornR, eyes);
  body.add(head);
  const armGeo = new THREE.BoxGeometry(0.14, 0.62, 0.14);
  const armL = limb(armGeo, skin, 0.62, -0.42, 1.0, 0.1);
  const armR = limb(armGeo, skin, 0.62, 0.42, 1.0, 0.1);
  const claw = new THREE.ConeGeometry(0.08, 0.2, 4);
  armL.add(mesh(claw, bone, 0, -0.7, 0));
  armR.add(mesh(claw, bone, 0, -0.7, 0));
  body.add(armL, armR);
  return { root, body, legL, legR, armL, armR, head, materials: collect(root), height: 1.4, walk: 0 };
}

export function buildStalker(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shade = mat('#3a2a55', { transparent: true, opacity: 0.85 });
  const cloth = mat('#1d1530', { transparent: true, opacity: 0.85 });
  const glow = mat('#b98cff', { emissive: '#a070ff', emissiveIntensity: 1.6, transparent: true, opacity: 0.95 });
  const legL = limb(new THREE.BoxGeometry(0.12, 0.7, 0.12), cloth, 0.7, -0.1, 0.72);
  const legR = limb(new THREE.BoxGeometry(0.12, 0.7, 0.12), cloth, 0.7, 0.1, 0.72);
  body.add(legL, legR);
  const torso = mesh(new THREE.ConeGeometry(0.34, 1.0, 5), cloth, 0, 1.15, 0);
  torso.rotation.x = Math.PI;
  body.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 1.72, 0.05);
  head.add(mesh(new THREE.ConeGeometry(0.2, 0.42, 5), shade));
  head.add(mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), glow, 0, -0.02, 0.16));
  body.add(head);
  const blade = new THREE.ConeGeometry(0.05, 0.55, 3);
  const armL = limb(new THREE.BoxGeometry(0.1, 0.6, 0.1), shade, 0.6, -0.32, 1.45);
  const armR = limb(new THREE.BoxGeometry(0.1, 0.6, 0.1), shade, 0.6, 0.32, 1.45);
  const bl = mesh(blade, glow, 0, -0.85, 0);
  bl.rotation.x = Math.PI;
  const br = bl.clone();
  armL.add(bl);
  armR.add(br);
  body.add(armL, armR);
  return { root, body, legL, legR, armL, armR, head, materials: collect(root), height: 1.9, walk: 0 };
}

export function buildBrute(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const stone = mat('#8a8478');
  const moss = mat('#5f8a3c');
  const core = mat('#ff9a3d', { emissive: '#ff6a00', emissiveIntensity: 1.2 });
  const legL = limb(new THREE.BoxGeometry(0.36, 0.6, 0.4), stone, 0.6, -0.32, 0.62);
  const legR = limb(new THREE.BoxGeometry(0.36, 0.6, 0.4), stone, 0.6, 0.32, 0.62);
  body.add(legL, legR);
  const torso = mesh(new THREE.DodecahedronGeometry(0.75, 0), stone, 0, 1.35, 0);
  torso.scale.set(1.15, 0.95, 0.9);
  const mossCap = mesh(new THREE.DodecahedronGeometry(0.5, 0), moss, 0, 1.85, -0.1);
  mossCap.scale.set(1.3, 0.45, 1);
  const heart = mesh(new THREE.OctahedronGeometry(0.16, 0), core, 0, 1.4, 0.62);
  body.add(torso, mossCap, heart);
  const head = new THREE.Group();
  head.position.set(0, 2.0, 0.35);
  head.add(mesh(new THREE.DodecahedronGeometry(0.28, 0), stone));
  head.add(mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), core, 0, 0, 0.24));
  body.add(head);
  const armGeo = new THREE.DodecahedronGeometry(0.32, 0);
  const armL = new THREE.Group();
  armL.position.set(-0.95, 1.7, 0);
  armL.add(mesh(armGeo, stone, 0, -0.35, 0), mesh(new THREE.DodecahedronGeometry(0.4, 0), stone, 0, -0.95, 0.05));
  const armR = new THREE.Group();
  armR.position.set(0.95, 1.7, 0);
  armR.add(mesh(armGeo, stone, 0, -0.35, 0), mesh(new THREE.DodecahedronGeometry(0.4, 0), stone, 0, -0.95, 0.05));
  body.add(armL, armR);
  return { root, body, legL, legR, armL, armR, head, materials: collect(root), height: 2.4, walk: 0 };
}

export function buildBoss(): Rig {
  const rig = buildBrute();
  const rune = mat('#7fd3ff', { emissive: '#40b8ff', emissiveIntensity: 1.6 });
  const plate = mat('#5d6878', { metalness: 0.2, roughness: 0.6 });
  // Ombreiras, coroa e runas: o Guardião é um Bruto antigo vestido para a guerra.
  const sL = mesh(new THREE.ConeGeometry(0.45, 0.5, 5), plate, -0.95, 2.05, 0);
  const sR = mesh(new THREE.ConeGeometry(0.45, 0.5, 5), plate, 0.95, 2.05, 0);
  sL.rotation.z = 0.5;
  sR.rotation.z = -0.5;
  rig.body.add(sL, sR);
  const crown = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const spike = mesh(new THREE.ConeGeometry(0.06, 0.35, 4), rune);
    const a = (i / 5) * Math.PI * 2;
    spike.position.set(Math.cos(a) * 0.22, 0.25, Math.sin(a) * 0.22);
    crown.add(spike);
  }
  rig.head.add(crown);
  for (let i = 0; i < 3; i++) rig.body.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), rune, -0.3 + i * 0.3, 1.0 + (i % 2) * 0.15, 0.7));
  rig.root.scale.setScalar(1.75);
  rig.materials = collect(rig.root);
  rig.height = 4.3;
  return rig;
}

/** Animação procedural simples: caminhada, golpe e postura de preparo. */
export function animateRig(rig: Rig, dt: number, speed: number, opts: { attack: number; windup: number; dead: number }): void {
  const moving = speed > 0.2;
  rig.walk += dt * (moving ? 6 + speed * 1.4 : 0);
  const s = moving ? Math.sin(rig.walk) : 0;
  const k = Math.min(1, speed / 4);
  rig.legL.rotation.x = s * 0.7 * k;
  rig.legR.rotation.x = -s * 0.7 * k;
  let armL = -s * 0.5 * k;
  let armR = s * 0.5 * k;
  if (opts.windup > 0) {
    armL = -2.2 * opts.windup;
    armR = -2.2 * opts.windup;
  }
  if (opts.attack > 0) armR = -1.6 * Math.sin(opts.attack * Math.PI);
  rig.armL.rotation.x = armL;
  rig.armR.rotation.x = armR;
  rig.body.position.y = moving ? Math.abs(Math.cos(rig.walk)) * 0.05 : Math.sin(performance.now() / 600) * 0.015;
  if (opts.dead > 0) {
    rig.body.rotation.x = -Math.min(1, opts.dead * 2) * 1.45;
    rig.body.position.y = -Math.min(1, opts.dead) * 0.3;
  } else rig.body.rotation.x = 0;
}

export function setOpacity(rig: Rig, opacity: number): void {
  for (const m of rig.materials) {
    m.transparent = opacity < 1 || m.transparent;
    m.opacity = opacity;
    m.depthWrite = opacity > 0.5;
  }
  rig.root.visible = opacity > 0.02;
}

export function flash(rig: Rig, amount: number): void {
  for (const m of rig.materials) {
    const base = (m.userData.baseEmissive as number | undefined) ?? m.emissiveIntensity;
    m.userData.baseEmissive = base;
    if (amount > 0) {
      m.emissive.set('#ffffff');
      m.emissiveIntensity = base + amount * 0.8;
    } else if (m.userData.baseEmissiveColor) {
      m.emissive.set(m.userData.baseEmissiveColor as string);
      m.emissiveIntensity = base;
    }
  }
}

export function rememberEmissive(rig: Rig): void {
  for (const m of rig.materials) {
    m.userData.baseEmissive = m.emissiveIntensity;
    m.userData.baseEmissiveColor = '#' + m.emissive.getHexString();
  }
}
