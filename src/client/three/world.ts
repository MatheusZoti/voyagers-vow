import * as THREE from 'three';
import { Rng } from '../../sim/math';
import { Tile, type GameMap } from '../../sim/world/map';
import { mat } from './models';

/** Constrói o terreno e os cenários do mapa. Mundo (x, y) -> Three (x, 0, y). */

const GROUND: Record<number, string[]> = {
  [Tile.Grass]: ['#6fae46', '#79b84d', '#66a541', '#83bf55'],
  [Tile.Tree]: ['#4f8a35', '#56913a'],
  [Tile.Rock]: ['#7c9a4a', '#6f8f45'],
  [Tile.Water]: ['#4a6b46', '#46653f'],
  [Tile.Bridge]: ['#a77b4f'],
  [Tile.Sanctuary]: ['#d9cfb4', '#d2c6a8', '#e0d7bd'],
  [Tile.Path]: ['#b8925e', '#ae8856', '#c09a66'],
  [Tile.Arena]: ['#8d8a82', '#85827a', '#96938a'],
};

export interface WorldView {
  group: THREE.Group;
  water: THREE.Mesh;
  runes: THREE.Mesh[];
  update(t: number): void;
}

export function buildWorld(map: GameMap): WorldView {
  const group = new THREE.Group();
  const rng = new Rng(4242);
  const { w, h } = map;
  const tile = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? Tile.Tree : (map.tiles[y * w + x] as Tile));

  // Altura nos cantos dos tiles: água afunda, grama ondula de leve.
  const corner = (cx: number, cy: number): number => {
    let water = 0;
    let n = 0;
    for (const [dx, dy] of [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ] as const) {
      const t = tile(cx + dx, cy + dy);
      n++;
      if (t === Tile.Water) water++;
    }
    const noise = Math.sin(cx * 0.9 + cy * 0.3) * 0.08 + Math.cos(cy * 1.1 - cx * 0.4) * 0.07;
    if (water === n) return -0.9;
    if (water > 0) return -0.35;
    const t = tile(cx, cy);
    if (t === Tile.Sanctuary || t === Tile.Arena || t === Tile.Bridge) return 0.02;
    return Math.max(-0.05, noise + (t === Tile.Tree ? 0.12 : 0));
  };
  const heights = new Float32Array((w + 1) * (h + 1));
  for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) heights[y * (w + 1) + x] = corner(x, y);
  const hAt = (x: number, y: number) => heights[y * (w + 1) + x]!;

  // Terreno: dois triângulos por tile, cor por face (flat shading low-poly).
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = tile(x, y);
      const pal = GROUND[t] ?? GROUND[Tile.Grass]!;
      const v = map.variation[y * w + x]!;
      const a = [x, hAt(x, y), y];
      const b = [x + 1, hAt(x + 1, y), y];
      const cc = [x + 1, hAt(x + 1, y + 1), y + 1];
      const d = [x, hAt(x, y + 1), y + 1];
      const flip = (x + y) % 2 === 0;
      const tris = flip ? [a, d, cc, a, cc, b] : [a, d, b, b, d, cc];
      for (let i = 0; i < 2; i++) {
        c.set(pal[Math.floor((v * 7 + i * 0.37) * pal.length) % pal.length]!);
        c.offsetHSL(0, 0, (v - 0.5) * 0.04 + (i ? 0.012 : -0.012));
        for (let k = 0; k < 3; k++) {
          const p = tris[i * 3 + k]!;
          pos.push(p[0]!, p[1]!, p[2]!);
          col.push(c.r, c.g, c.b);
        }
      }
    }
  const groundGeo = new THREE.BufferGeometry();
  groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  ground.receiveShadow = true;
  group.add(ground);

  // Chão de fora do mapa (floresta densa ao longe).
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(w * 4, h * 4), mat('#3f7a2e', { roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.set(w / 2, -0.06, h / 2);
  outer.receiveShadow = true;
  group.add(outer);

  // Água.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#3fa7d6', transparent: true, opacity: 0.82, roughness: 0.15, metalness: 0.1, emissive: '#0b3a55', emissiveIntensity: 0.3 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(w / 2, -0.28, h / 2);
  group.add(water);

  // Árvores e rochas instanciadas.
  const trees: Array<{ x: number; y: number; s: number; v: number }> = [];
  const rocks: Array<{ x: number; y: number; s: number; r: number }> = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = tile(x, y);
      if (t === Tile.Tree) trees.push({ x: x + 0.5 + rng.range(-0.25, 0.25), y: y + 0.5 + rng.range(-0.25, 0.25), s: rng.range(0.8, 1.35), v: rng.next() });
      if (t === Tile.Rock) rocks.push({ x: x + 0.5 + rng.range(-0.2, 0.2), y: y + 0.5 + rng.range(-0.2, 0.2), s: rng.range(0.7, 1.2), r: rng.range(0, 6) });
    }
  // Anel de floresta fora do mapa, para o horizonte não ficar vazio.
  for (let i = 0; i < 900; i++) {
    const x = rng.range(-14, w + 14);
    const y = rng.range(-14, h + 14);
    if (x > -1 && x < w + 1 && y > -1 && y < h + 1) continue;
    trees.push({ x, y, s: rng.range(0.9, 1.6), v: rng.next() });
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const tp = new THREE.Vector3();
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 5), mat('#6b4a2e'), trees.length);
  const leafGeo = new THREE.ConeGeometry(0.85, 1.5, 6);
  const leaf1 = new THREE.InstancedMesh(leafGeo, mat('#ffffff'), trees.length);
  const leaf2 = new THREE.InstancedMesh(leafGeo, mat('#ffffff'), trees.length);
  const leafColors = ['#2f7d3a', '#3a8f3f', '#4a9a3a', '#2b6e3c', '#5aa33c'];
  trees.forEach((t, i) => {
    const yaw = t.v * Math.PI * 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    m4.compose(tp.set(t.x, 0.5 * t.s, t.y), q, sc.set(t.s, t.s, t.s));
    trunk.setMatrixAt(i, m4);
    m4.compose(tp.set(t.x, 1.55 * t.s, t.y), q, sc.set(t.s, t.s, t.s));
    leaf1.setMatrixAt(i, m4);
    m4.compose(tp.set(t.x, 2.35 * t.s, t.y), q, sc.set(t.s * 0.7, t.s * 0.8, t.s * 0.7));
    leaf2.setMatrixAt(i, m4);
    const lc = new THREE.Color(leafColors[Math.floor(t.v * leafColors.length)]!);
    leaf1.setColorAt(i, lc);
    leaf2.setColorAt(i, lc.clone().offsetHSL(0, 0, 0.05));
  });
  for (const im of [trunk, leaf1, leaf2]) {
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
  }

  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.55, 0), mat('#ffffff'), rocks.length);
  rocks.forEach((r, i) => {
    q.setFromEuler(new THREE.Euler(r.r, r.r * 1.7, r.r * 0.3));
    m4.compose(tp.set(r.x, 0.25 * r.s, r.y), q, sc.set(r.s * 1.2, r.s * 0.8, r.s));
    rockMesh.setMatrixAt(i, m4);
    rockMesh.setColorAt(i, new THREE.Color('#8f8c86').offsetHSL(0, 0, (r.r / 6 - 0.5) * 0.12));
  });
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  group.add(rockMesh);

  // Tufos de grama e flores.
  const tufts: Array<{ x: number; y: number; s: number; c: string }> = [];
  const flowerColors = ['#ffe36b', '#ff7bb0', '#ffffff', '#b58cff'];
  for (let i = 0; i < 2400; i++) {
    const x = rng.range(1, w - 1);
    const y = rng.range(1, h - 1);
    if (tile(Math.floor(x), Math.floor(y)) !== Tile.Grass) continue;
    const flower = rng.chance(0.12);
    tufts.push({ x, y, s: rng.range(0.6, 1.2), c: flower ? rng.pick(flowerColors) : rng.pick(['#8cc95a', '#7ab84c', '#95d063']) });
  }
  const tuftMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.32, 3), mat('#ffffff'), tufts.length);
  tufts.forEach((t, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.x * 3.1);
    m4.compose(tp.set(t.x, 0.12, t.y), q, sc.set(t.s, t.s, t.s));
    tuftMesh.setMatrixAt(i, m4);
    tuftMesh.setColorAt(i, new THREE.Color(t.c));
  });
  tuftMesh.receiveShadow = true;
  group.add(tuftMesh);

  // Ponte de madeira.
  const b = map.bridge;
  const plank = mat('#9b6d43');
  const rail = mat('#6b4a2e');
  for (let x = b.x0; x <= b.x1 + 1; x += 0.5) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, b.y1 - b.y0 + 1.4), plank);
    p.position.set(x, 0.08 + Math.sin(((x - b.x0) / (b.x1 - b.x0 + 1)) * Math.PI) * 0.25, (b.y0 + b.y1 + 1) / 2);
    p.castShadow = p.receiveShadow = true;
    group.add(p);
  }
  for (const yy of [b.y0 - 0.15, b.y1 + 1.15])
    for (let x = b.x0; x <= b.x1 + 1; x += 1.5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 0.15), rail);
      post.position.set(x, 0.5, yy);
      post.castShadow = true;
      group.add(post);
    }

  // Santuário: anel de pilares e runa central.
  const runes: THREE.Mesh[] = [];
  const s = map.sanctuary;
  const stone = mat('#cfc6ae');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    if (Math.abs(Math.cos(a) - 1) < 0.15) continue; // abertura para a trilha (leste)
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 2.2 + (i % 3) * 0.4, 6), stone);
    pillar.position.set(s.x + Math.cos(a) * (s.r - 0.4), 1.1, s.y + Math.sin(a) * (s.r - 0.4));
    pillar.castShadow = pillar.receiveShadow = true;
    group.add(pillar);
    const capStone = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.8), stone);
    capStone.position.set(pillar.position.x, pillar.position.y * 2 + 0.05, pillar.position.z);
    capStone.castShadow = true;
    group.add(capStone);
  }
  const runeMat = new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const rune = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.62, 6), runeMat);
  rune.rotation.x = -Math.PI / 2;
  rune.position.set(s.x, 0.05, s.y);
  const rune2 = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 3), runeMat);
  rune2.rotation.x = -Math.PI / 2;
  rune2.position.set(s.x, 0.05, s.y);
  group.add(rune, rune2);
  runes.push(rune, rune2);
  const brazier = new THREE.PointLight('#8fe8ff', 2.5, 10, 1.4);
  brazier.position.set(s.x, 4.5, s.y);
  group.add(brazier);

  // Arena do chefe: pilares quebrados.
  const ar = map.arena;
  const darkStone = mat('#77746c');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    if (Math.cos(a) < -0.85) continue; // entrada a oeste
    const hgt = 1 + ((i * 7) % 5) * 0.5;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, hgt, 6), darkStone);
    pillar.position.set(ar.x + Math.cos(a) * (ar.r + 0.3), hgt / 2, ar.y + Math.sin(a) * (ar.r + 0.3));
    pillar.rotation.z = ((i % 3) - 1) * 0.08;
    pillar.castShadow = pillar.receiveShadow = true;
    group.add(pillar);
  }
  const arenaRune = new THREE.Mesh(
    new THREE.RingGeometry(ar.r - 1.2, ar.r - 0.9, 10),
    new THREE.MeshBasicMaterial({ color: '#4ab0ff', transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
  );
  arenaRune.rotation.x = -Math.PI / 2;
  arenaRune.position.set(ar.x, 0.04, ar.y);
  group.add(arenaRune);
  runes.push(arenaRune);

  return {
    group,
    water,
    runes,
    update(t: number) {
      (water.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.28 + Math.sin(t * 1.3) * 0.06;
      water.position.y = -0.28 + Math.sin(t * 0.9) * 0.02;
      rune.rotation.z = t * 0.15;
      rune2.rotation.z = -t * 0.3;
      runeMat.opacity = 0.55 + Math.sin(t * 2) * 0.15;
      brazier.intensity = 2.4 + Math.sin(t * 7) * 0.2 + Math.sin(t * 13) * 0.15;
    },
  };
}
