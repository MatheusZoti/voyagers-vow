import * as THREE from 'three';
import { Rng } from '../../sim/math';
import { BRIDGE_DECK, floorAt, FLOOR_H, GORGE_DEPTH, heightAt, Tile, type GameMap } from '../../sim/world/map';
import { mat } from './models';

/**
 * Terreno e cenário no estilo Albion, organizado em andares (como no Tibia): cada andar é
 * um platô plano de grama morna; entre eles, paredes de rocha estratificada; rampas de
 * terra com degraus de madeira ligam os andares. Desfiladeiro com o rio no fundo,
 * pinheiros verde-azulados, árvores de outono e pedregulhos facetados.
 * Mundo (x, y) -> Three (x, altura, y).
 */

const GRASS_VALE = ['#8fa046', '#9aab4e', '#a5ad57', '#86983f', '#99a24a'];
const GRASS_AUTUMN = ['#a9a24c', '#b4a653', '#9f9a46', '#b9ab5a', '#a39b45'];
const PATH = ['#b49866', '#ab8f5e', '#bea36f'];
const ROCK = '#bda882';
const ROCK_DEEP = '#8c877b';
const PINE = ['#3d6e63', '#467a6c', '#2f5f56', '#557f68'];
const ROUND = ['#7f9a3e', '#94a845', '#869d3c'];
const AUTUMN = ['#e07a2e', '#d9652a', '#eb8f3a', '#c9542a'];

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
  const tile = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? Tile.Tree : (map.tiles[Math.floor(y) * w + Math.floor(x)] as Tile));
  const gh = (x: number, y: number) => floorAt(map, x, y);
  const GRASS = map.theme === 'autumn' ? GRASS_AUTUMN : GRASS_VALE;

  // -------------------------------------------------------------------------
  // Terreno: malha de 1/3 m, cor de cada face pela inclinação e pelo tipo de chão.
  // -------------------------------------------------------------------------
  const RES = 3;
  const NX = w * RES;
  const NY = h * RES;
  const vh = new Float32Array((NX + 1) * (NY + 1));
  /** O vértice está inteiro dentro de paredes de rocha (não toca chão caminhável)? */
  const inWall = (x: number, y: number) => {
    for (const ox of [-0.01, 0.01])
      for (const oy of [-0.01, 0.01]) {
        const t = tile(x + ox, y + oy);
        if (t !== Tile.Cliff) return false;
      }
    return true;
  };
  for (let j = 0; j <= NY; j++)
    for (let i = 0; i <= NX; i++) {
      const x = i / RES;
      const y = j / RES;
      let hh = heightAt(map, x, y);
      // Rugosidade só dentro das paredes: a rocha fica facetada, a borda de cada andar e o chão continuam planos.
      if (inWall(x, y)) {
        const sx = heightAt(map, Math.min(w, x + 0.5), y) - heightAt(map, Math.max(0, x - 0.5), y);
        const sy = heightAt(map, x, Math.min(h, y + 0.5)) - heightAt(map, x, Math.max(0, y - 0.5));
        const steep = Math.min(1, Math.hypot(sx, sy) / 1.2);
        hh += steep * (Math.sin(x * 3.1 + y * 1.7) * 0.2 + Math.cos(x * 1.3 - y * 2.9) * 0.16);
      } else if (tile(x, y) !== Tile.Ramp && tile(x - 0.01, y - 0.01) !== Tile.Ramp) {
        // Relevo estético mínimo no plano (centímetros), sem mudar onde os pés pisam.
        hh += Math.sin(x * 1.9 + Math.cos(y * 1.3)) * Math.cos(y * 1.7 - x * 0.4) * 0.035;
      }
      vh[j * (NX + 1) + i] = hh;
    }
  const V = (i: number, j: number) => vh[j * (NX + 1) + i]!;

  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const patch = (x: number, y: number) => 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(y * 0.17) * 2) * Math.cos(y * 0.23 - x * 0.05);
  /** Trilha de terra nos tiles de trilha, com a borda irregular (amostra levemente deslocada). */
  const onPath = (x: number, y: number) =>
    tile(x + Math.sin(x * 1.7 + y * 0.9) * 0.3, y + Math.cos(y * 1.9 - x * 0.7) * 0.3) === Tile.Path;
  const face = (a: number[], b: number[], d: number[]) => {
    e1.set(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!);
    e2.set(d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!);
    nrm.crossVectors(e2, e1).normalize();
    if (nrm.y < 0) nrm.negate();
    const cx = (a[0]! + b[0]! + d[0]!) / 3;
    const cy = (a[1]! + b[1]! + d[1]!) / 3;
    const cz = (a[2]! + b[2]! + d[2]!) / 3;
    const t = tile(cx, cz);
    const v = map.variation[Math.min(h - 1, Math.floor(cz)) * w + Math.min(w - 1, Math.floor(cx))] ?? 0.5;
    if (nrm.y < 0.74) {
      // Encosta: rocha em camadas (estratos) — mais cinza no fundo do desfiladeiro.
      c.set(cy < -0.8 ? ROCK_DEEP : ROCK);
      c.offsetHSL(0, 0, Math.sin(cy * 6.5) * 0.045 + (v - 0.5) * 0.05 - (0.74 - nrm.y) * 0.12);
    } else if (t === Tile.Ramp) {
      c.set(PATH[1]!).offsetHSL(0, 0, (v - 0.5) * 0.05 - 0.02);
    } else if (onPath(cx, cz)) {
      c.set(PATH[Math.floor(v * PATH.length)]!).offsetHSL(0, 0, (patch(cx * 3, cz * 3) - 0.5) * 0.05);
    } else if (t === Tile.Sanctuary) {
      c.set('#d8ceb0').offsetHSL(0, 0, (v - 0.5) * 0.05);
    } else if (t === Tile.Arena) {
      c.set('#a39c8a').offsetHSL(0, 0, (v - 0.5) * 0.05);
    } else if (t === Tile.Water) {
      c.set('#6d7563');
    } else {
      // Grama em manchas largas (verde-oliva a amarelada), mais escura sob as árvores.
      const k = patch(cx, cz);
      c.set(GRASS[Math.floor(k * GRASS.length) % GRASS.length]!);
      c.offsetHSL(0, 0, (v - 0.5) * 0.035 + (t === Tile.Tree ? -0.07 : 0) - (nrm.y < 0.86 ? 0.05 : 0));
    }
    for (const p of [a, b, d]) {
      pos.push(p[0]!, p[1]!, p[2]!);
      col.push(c.r, c.g, c.b);
    }
  };
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const x0 = i / RES;
      const x1 = (i + 1) / RES;
      const y0 = j / RES;
      const y1 = (j + 1) / RES;
      const a = [x0, V(i, j), y0];
      const b = [x1, V(i + 1, j), y0];
      const cc = [x1, V(i + 1, j + 1), y1];
      const d = [x0, V(i, j + 1), y1];
      if ((i + j) % 2 === 0) {
        face(a, d, cc);
        face(a, cc, b);
      } else {
        face(a, d, b);
        face(b, d, cc);
      }
    }
  const groundGeo = new THREE.BufferGeometry();
  groundGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  ground.receiveShadow = true;
  ground.castShadow = true;
  group.add(ground);

  // Moldura ao redor do vale, na altura das bordas (floresta densa ao longe).
  const edgeH = heightAt(map, 0, 0);
  const outerMat = mat('#7d8f3e', { roughness: 1 });
  const F = 80;
  for (const [cx, cz, sx, sz] of [
    [w / 2, -F / 2, w + 2 * F, F],
    [w / 2, h + F / 2, w + 2 * F, F],
    [-F / 2, h / 2, F, h],
    [w + F / 2, h / 2, F, h],
  ] as const) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), outerMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(cx, edgeH - 0.2, cz);
    plane.receiveShadow = true;
    group.add(plane);
  }

  // Rio no fundo do desfiladeiro.
  const waterLevel = GORGE_DEPTH + 0.4;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h, 1, 1),
    new THREE.MeshStandardMaterial({
      color: '#7389cf',
      transparent: true,
      opacity: 0.88,
      roughness: 0.12,
      metalness: 0.1,
      emissive: '#24366e',
      emissiveIntensity: 0.25,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(w / 2, waterLevel, h / 2);
  group.add(water);

  // -------------------------------------------------------------------------
  // Vegetação: pinheiros verde-azulados, árvores redondas e de outono.
  // -------------------------------------------------------------------------
  type TreeSpot = { x: number; y: number; s: number; v: number; base: number };
  const pines: TreeSpot[] = [];
  const rounds: TreeSpot[] = [];
  const autumns: TreeSpot[] = [];
  const rocks: Array<{ x: number; y: number; s: number; r: number; base: number; sink: number }> = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = tile(x, y);
      if (t === Tile.Tree) {
        const sp = { x: x + 0.5 + rng.range(-0.25, 0.25), y: y + 0.5 + rng.range(-0.25, 0.25), s: rng.range(0.85, 1.4), v: rng.next(), base: 0 };
        sp.base = gh(sp.x, sp.y);
        const r = rng.next();
        // No Vale dominam os pinheiros; em Varn, as árvores de outono.
        const autumnTheme = map.theme === 'autumn';
        (r < (autumnTheme ? 0.32 : 0.66) ? pines : r < (autumnTheme ? 0.5 : 0.84) ? rounds : autumns).push(sp);
      }
      if (t === Tile.Rock || (t === Tile.Cliff && rng.chance(0.18))) {
        const rx = x + 0.5 + rng.range(-0.25, 0.25);
        const ry = y + 0.5 + rng.range(-0.25, 0.25);
        rocks.push({ x: rx, y: ry, s: rng.range(0.8, t === Tile.Cliff ? 1.6 : 1.3), r: rng.range(0, 6), base: gh(rx, ry), sink: t === Tile.Cliff ? 0.3 : 0 });
      }
      if (t === Tile.Water && rng.chance(0.3)) {
        const rx = x + 0.5 + rng.range(-0.3, 0.3);
        const ry = y + 0.5 + rng.range(-0.3, 0.3);
        rocks.push({ x: rx, y: ry, s: rng.range(0.4, 0.9), r: rng.range(0, 6), base: GORGE_DEPTH + 0.1, sink: 0 });
      }
    }
  // Floresta ao redor do mapa, para o horizonte não ficar vazio.
  for (let i = 0; i < 1000; i++) {
    const x = rng.range(-16, w + 16);
    const y = rng.range(-16, h + 16);
    if (x > -1 && x < w + 1 && y > -1 && y < h + 1) continue;
    const sp = { x, y, s: rng.range(1, 1.7), v: rng.next(), base: edgeH - 0.2 };
    (rng.chance(0.8) ? pines : rng.chance(0.5) ? rounds : autumns).push(sp);
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const tp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const inst = (geo: THREE.BufferGeometry, color: string, n: number) => {
    const im = new THREE.InstancedMesh(geo, mat(color), Math.max(1, n));
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
    return im;
  };

  // Pinheiros: tronco fino e três cones (o de baixo mais largo, como nos refs).
  const all = [...pines, ...rounds, ...autumns];
  const trunk = inst(new THREE.CylinderGeometry(0.1, 0.16, 1, 5), '#6b4a2e', all.length);
  all.forEach((t, i) => {
    q.setFromAxisAngle(up, t.v * Math.PI * 2);
    m4.compose(tp.set(t.x, t.base + 0.5 * t.s, t.y), q, sc.set(t.s, t.s * (pines.includes(t) ? 1.3 : 1), t.s));
    trunk.setMatrixAt(i, m4);
  });
  const pineGeo = new THREE.ConeGeometry(0.95, 1.6, 7);
  const pineTiers = [inst(pineGeo, '#ffffff', pines.length), inst(pineGeo, '#ffffff', pines.length), inst(pineGeo, '#ffffff', pines.length)];
  pines.forEach((t, i) => {
    q.setFromAxisAngle(up, t.v * Math.PI * 2);
    const col0 = new THREE.Color(PINE[Math.floor(t.v * PINE.length)]!);
    [
      [1.35, 1.0],
      [2.2, 0.78],
      [2.95, 0.55],
    ].forEach(([yy, k], tier) => {
      m4.compose(tp.set(t.x, t.base + yy! * t.s, t.y), q, sc.set(t.s * k!, t.s * k! * 0.95, t.s * k!));
      pineTiers[tier]!.setMatrixAt(i, m4);
      pineTiers[tier]!.setColorAt(i, col0.clone().offsetHSL(0, 0, tier * 0.035));
    });
  });
  const canopyGeo = new THREE.IcosahedronGeometry(1, 0);
  const roundCanopy = inst(canopyGeo, '#ffffff', rounds.length);
  rounds.forEach((t, i) => {
    q.setFromEuler(new THREE.Euler(t.v, t.v * 3, 0));
    m4.compose(tp.set(t.x, t.base + 1.7 * t.s, t.y), q, sc.set(t.s * 1.05, t.s * 0.95, t.s * 1.05));
    roundCanopy.setMatrixAt(i, m4);
    roundCanopy.setColorAt(i, new THREE.Color(ROUND[Math.floor(t.v * ROUND.length)]!));
  });
  const autumnCanopy = inst(canopyGeo, '#ffffff', autumns.length);
  const autumnTop = inst(canopyGeo, '#ffffff', autumns.length);
  autumns.forEach((t, i) => {
    q.setFromEuler(new THREE.Euler(t.v * 2, t.v * 5, 0.3));
    const ac = new THREE.Color(AUTUMN[Math.floor(t.v * AUTUMN.length)]!);
    m4.compose(tp.set(t.x, t.base + 1.6 * t.s, t.y), q, sc.set(t.s * 1.1, t.s * 0.85, t.s * 1.1));
    autumnCanopy.setMatrixAt(i, m4);
    autumnCanopy.setColorAt(i, ac);
    m4.compose(tp.set(t.x + 0.2, t.base + 2.3 * t.s, t.y - 0.1), q, sc.set(t.s * 0.7, t.s * 0.6, t.s * 0.7));
    autumnTop.setMatrixAt(i, m4);
    autumnTop.setColorAt(i, ac.clone().offsetHSL(0, 0, 0.06));
  });

  // Rampas entre andares: degraus de tronco atravessados na terra batida.
  const steps: Array<{ x: number; y: number; alongX: boolean }> = [];
  for (const r of map.ramps)
    for (let t = 0.45; t < r.len; t += 0.55)
      steps.push({ x: r.x + 0.5 + r.dx * (t - 0.5), y: r.y + 0.5 + r.dy * (t - 0.5), alongX: r.dx !== 0 });
  const stepMesh = inst(new THREE.CylinderGeometry(0.075, 0.075, 2.7, 6), '#7a5534', steps.length);
  steps.forEach((s, i) => {
    q.setFromEuler(s.alongX ? new THREE.Euler(Math.PI / 2, 0, 0) : new THREE.Euler(0, 0, Math.PI / 2));
    m4.compose(tp.set(s.x, heightAt(map, s.x, s.y) + 0.05, s.y), q, sc.set(1, 1, 1));
    stepMesh.setMatrixAt(i, m4);
  });
  stepMesh.castShadow = false;

  // Pedregulhos facetados de arenito.
  const rockMesh = inst(new THREE.DodecahedronGeometry(0.6, 0), '#ffffff', rocks.length);
  rocks.forEach((r, i) => {
    q.setFromEuler(new THREE.Euler(r.r, r.r * 1.7, r.r * 0.3));
    m4.compose(tp.set(r.x, r.base + 0.25 * r.s - r.sink, r.y), q, sc.set(r.s * 1.25, r.s * 0.85, r.s));
    rockMesh.setMatrixAt(i, m4);
    rockMesh.setColorAt(i, new THREE.Color(r.base < -1 ? ROCK_DEEP : ROCK).offsetHSL(0, 0, (r.r / 6 - 0.5) * 0.12));
  });

  // Tufos de grama e flores (só no plano).
  const tufts: Array<{ x: number; y: number; s: number; c: string }> = [];
  const flowerColors = ['#ffe36b', '#f2a640', '#ffffff', '#d9e06a'];
  for (let i = 0; i < 2600; i++) {
    const x = rng.range(1, w - 1);
    const y = rng.range(1, h - 1);
    if (tile(x, y) !== Tile.Grass) continue;
    const flower = rng.chance(0.1);
    tufts.push({ x, y, s: rng.range(0.6, 1.2), c: flower ? rng.pick(flowerColors) : rng.pick(['#a3b552', '#b2b95c', '#93a849']) });
  }
  const tuftMesh = inst(new THREE.ConeGeometry(0.07, 0.32, 3), '#ffffff', tufts.length);
  tuftMesh.castShadow = false;
  tufts.forEach((t, i) => {
    q.setFromAxisAngle(up, t.x * 3.1);
    m4.compose(tp.set(t.x, gh(t.x, t.y) + 0.12, t.y), q, sc.set(t.s, t.s, t.s));
    tuftMesh.setMatrixAt(i, m4);
    tuftMesh.setColorAt(i, new THREE.Color(t.c));
  });

  // -------------------------------------------------------------------------
  // Ponte suspensa sobre o desfiladeiro: tábuas com leve barriga, postes e cordas.
  // -------------------------------------------------------------------------
  const plank = mat('#9b6d43');
  const wood = mat('#5e4128');
  const ropeMat = mat('#c9b48a');
  for (const b of map.bridges) {
    // u = ao longo da ponte, v = de lado a lado; P(u, v) devolve (x, z) no mundo.
    const alongX = b.x1 - b.x0 >= b.y1 - b.y0;
    const P = (u: number, v: number): [number, number] => (alongX ? [u, v] : [v, u]);
    const vMid = alongX ? (b.y0 + b.y1 + 1) / 2 : (b.x0 + b.x1 + 1) / 2;
    const width = (alongX ? b.y1 - b.y0 : b.x1 - b.x0) + 1;
    const us = (alongX ? b.x0 : b.y0) - 0.5;
    const ue = (alongX ? b.x1 : b.y1) + 1.5;
    const sag = (u: number) => BRIDGE_DECK - Math.sin(((u - us) / (ue - us)) * Math.PI) * 0.3;
    for (let u = us; u <= ue; u += 0.42) {
      const p = new THREE.Mesh(alongX ? new THREE.BoxGeometry(0.36, 0.1, width - 1.6) : new THREE.BoxGeometry(width - 1.6, 0.1, 0.36), plank);
      const [px, pz] = P(u, vMid);
      p.position.set(px, sag(u), pz);
      p.rotation.y = (rng.next() - 0.5) * 0.06;
      p.castShadow = p.receiveShadow = true;
      group.add(p);
    }
    for (const side of [-1, 1]) {
      const v = vMid + side * (width / 2 - 0.7);
      for (const u of [us - 0.3, ue + 0.3]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.6, 6), wood);
        const [px, pz] = P(u, v);
        post.position.set(px, gh(px, pz) + 0.7, pz);
        post.castShadow = true;
        group.add(post);
      }
      const pts: THREE.Vector3[] = [];
      for (let u = us - 0.3; u <= ue + 0.31; u += 0.5) {
        const [px, pz] = P(u, v);
        pts.push(new THREE.Vector3(px, sag(Math.min(ue, Math.max(us, u))) + 0.95, pz));
      }
      const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035, 5, false), ropeMat);
      rope.castShadow = true;
      group.add(rope);
      for (let u = us + 0.6; u < ue; u += 1.2) {
        const vert = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), ropeMat);
        const [px, pz] = P(u, v);
        vert.position.set(px, sag(u) + 0.5, pz);
        group.add(vert);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Lugar seguro: santuário (pilares e runa) no Vale; acampamento (tendas e fogueira) em Varn.
  // -------------------------------------------------------------------------
  const runes: THREE.Mesh[] = [];
  const s = map.sanctuary;
  const runeMat = new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  const spinners: THREE.Mesh[] = [];
  let lightColor = '#8fe8ff';
  let lightBase = 2.4;
  if (map.theme === 'autumn') {
    // Acampamento: tendas de lona, paliçada baixa e uma fogueira.
    lightColor = '#ffae5a';
    lightBase = 3.2;
    const canvasMat = mat('#c9b38a');
    const canvasMat2 = mat('#9e5a3a');
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.8;
      const tx = s.x + Math.cos(a) * (s.r - 1.3);
      const tz = s.y + Math.sin(a) * (s.r - 1.3);
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.7, 4), i % 2 ? canvasMat : canvasMat2);
      tent.position.set(tx, gh(tx, tz) + 0.85, tz);
      tent.rotation.y = a;
      tent.castShadow = tent.receiveShadow = true;
      group.add(tent);
    }
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      if (Math.abs(Math.cos(a)) > 0.93) continue; // aberturas a leste e oeste (trilha)
      const px = s.x + Math.cos(a) * (s.r + 0.2);
      const pz = s.y + Math.sin(a) * (s.r + 0.2);
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.1, 5), wood);
      stake.position.set(px, gh(px, pz) + 0.5, pz);
      stake.rotation.z = Math.cos(a) * 0.15;
      stake.castShadow = true;
      group.add(stake);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 5), wood);
      log.position.set(s.x, gh(s.x, s.y) + 0.12, s.y);
      log.rotation.set(Math.PI / 2, 0, a);
      group.add(log);
    }
    const fire = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.8, 5),
      new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    fire.position.set(s.x, gh(s.x, s.y) + 0.5, s.y);
    group.add(fire);
    spinners.push(fire);
  } else {
    const stone = mat('#d4cab0');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      if (Math.abs(Math.cos(a) - 1) < 0.15) continue; // abertura para a trilha (leste)
      const ph = 2.2 + (i % 3) * 0.4;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, ph, 6), stone);
      const px = s.x + Math.cos(a) * (s.r - 0.4);
      const pz = s.y + Math.sin(a) * (s.r - 0.4);
      pillar.position.set(px, gh(px, pz) + ph / 2, pz);
      pillar.castShadow = pillar.receiveShadow = true;
      group.add(pillar);
      const capStone = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.8), stone);
      capStone.position.set(px, gh(px, pz) + ph + 0.1, pz);
      capStone.castShadow = true;
      group.add(capStone);
    }
    const rune = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.62, 6), runeMat);
    rune.rotation.x = -Math.PI / 2;
    rune.position.set(s.x, gh(s.x, s.y) + 0.05, s.y);
    const rune2 = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 3), runeMat);
    rune2.rotation.x = -Math.PI / 2;
    rune2.position.set(s.x, gh(s.x, s.y) + 0.05, s.y);
    group.add(rune, rune2);
    runes.push(rune, rune2);
  }
  const brazier = new THREE.PointLight(lightColor, lightBase, 10, 1.4);
  brazier.position.set(s.x, gh(s.x, s.y) + (map.theme === 'autumn' ? 1.6 : 4.5), s.y);
  group.add(brazier);

  // Arena do chefe: pilares quebrados.
  const ar = map.arena;
  if (ar) {
    const darkStone = mat('#8a8274');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (Math.abs(Math.cos(a)) > 0.85) continue; // entradas a oeste e a leste
      const hgt = 1 + ((i * 7) % 5) * 0.5;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, hgt, 6), darkStone);
      const ax = ar.x + Math.cos(a) * (ar.r + 0.3);
      const az = ar.y + Math.sin(a) * (ar.r + 0.3);
      pillar.position.set(ax, gh(ax, az) + hgt / 2 - 0.1, az);
      pillar.rotation.z = ((i % 3) - 1) * 0.08;
      pillar.castShadow = pillar.receiveShadow = true;
      group.add(pillar);
    }
    const arenaRune = new THREE.Mesh(
      new THREE.RingGeometry(ar.r - 1.2, ar.r - 0.9, 10),
      new THREE.MeshBasicMaterial({ color: '#4ab0ff', transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    );
    arenaRune.rotation.x = -Math.PI / 2;
    arenaRune.position.set(ar.x, gh(ar.x, ar.y) + 0.04, ar.y);
    group.add(arenaRune);
    runes.push(arenaRune);
  }

  return {
    group,
    water,
    runes,
    update(t: number) {
      (water.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.22 + Math.sin(t * 1.3) * 0.05;
      water.position.y = waterLevel + Math.sin(t * 0.9) * 0.03;
      runes.forEach((r, i) => (r.rotation.z = t * (i % 2 ? -0.3 : 0.15)));
      runeMat.opacity = 0.55 + Math.sin(t * 2) * 0.15;
      for (const f of spinners) f.scale.set(1 + Math.sin(t * 11) * 0.12, 1 + Math.sin(t * 7) * 0.2, 1 + Math.cos(t * 9) * 0.12);
      brazier.intensity = lightBase + Math.sin(t * 7) * 0.2 + Math.sin(t * 13) * 0.15;
    },
  };
}
