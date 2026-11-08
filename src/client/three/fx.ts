import * as THREE from 'three';
import type { Vec2 } from '../../sim/math';

/** Efeitos de chão e partículas: arcos de golpe, ondas de impacto, telegráficos do chefe. */

interface Fx {
  obj: THREE.Object3D;
  age: number;
  life: number;
  update(f: Fx, k: number): void;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  age: number;
  life: number;
}

/** Altura do chão usada pelos efeitos (o relevo é definido no construtor). */
let ground: (x: number, y: number) => number = () => 0;
const add = (o: THREE.Object3D, x: number, y: number, z: number) => {
  o.position.set(x, y + ground(x, z), z);
  return o;
};

export class Effects {
  private list: Fx[] = [];
  private particles: Particle[] = [];
  private partGeo = new THREE.TetrahedronGeometry(0.09, 0);

  constructor(
    private scene: THREE.Scene,
    groundFn: (x: number, y: number) => number = () => 0,
  ) {
    ground = groundFn;
  }

  private groundMat(color: string, opacity: number, additive = true) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }

  private push(obj: THREE.Object3D, life: number, update: Fx['update']): void {
    this.scene.add(obj);
    this.list.push({ obj, age: 0, life, update });
  }

  swing(at: Vec2, dir: Vec2, range: number, color = '#fff2c4', arc = (110 * Math.PI) / 180): void {
    const yaw = Math.atan2(dir.y, dir.x);
    const geo = new THREE.RingGeometry(0.5, range, 18, 1, -arc / 2, arc);
    const m = this.groundMat(color, 0.55);
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -yaw;
    add(mesh, at.x, 0.08, at.y);
    this.push(mesh, 0.2, (f, k) => {
      m.opacity = 0.55 * (1 - k);
      f.obj.scale.setScalar(0.8 + k * 0.3);
    });
  }

  shockwave(at: Vec2, radius: number, color: string, life = 0.45, thickness = 0.25): void {
    const m = this.groundMat(color, 0.85);
    const mesh = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.01, 1 - thickness), 1, 32), m);
    mesh.rotation.x = -Math.PI / 2;
    add(mesh, at.x, 0.1, at.y);
    this.push(mesh, life, (f, k) => {
      const s = radius * (0.3 + 0.9 * Math.sqrt(k));
      f.obj.scale.set(s, s, s);
      m.opacity = 0.85 * (1 - k);
    });
  }

  pillar(at: Vec2, color: string, height = 3, life = 0.5): void {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, height, 8, 1, true), m);
    add(mesh, at.x, height / 2, at.y);
    this.push(mesh, life, (f, k) => {
      m.opacity = 0.6 * (1 - k);
      f.obj.scale.set(1 + k, 1, 1 + k);
    });
  }

  /** Círculo de aviso que se enche até o impacto. */
  telegraph(at: Vec2, r: number, duration: number, heavy: boolean, colorOverride?: string): void {
    const g = new THREE.Group();
    const color = colorOverride ?? (heavy ? '#ff3a2a' : '#ffae3a');
    const edge = new THREE.Mesh(new THREE.RingGeometry(r - 0.14, r, 40), this.groundMat(color, 0.95, false));
    const fillMat = this.groundMat(color, 0.28, false);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40), fillMat);
    edge.rotation.x = fill.rotation.x = -Math.PI / 2;
    fill.position.y = -0.01;
    g.add(edge, fill);
    add(g, at.x, 0.09, at.y);
    this.push(g, duration, (_f, k) => {
      fill.scale.setScalar(Math.max(0.01, k));
      fillMat.opacity = 0.18 + 0.3 * k;
    });
  }

  /** Cone de aviso que se enche até o golpe (golpes corpo a corpo de elites e chefe). */
  arcTelegraph(at: Vec2, dir: Vec2, range: number, arc: number, duration: number): void {
    const yaw = Math.atan2(dir.y, dir.x);
    const g = new THREE.Group();
    const edgeMat = this.groundMat('#ff7a3a', 0.85, false);
    const fillMat = this.groundMat('#ff5a2a', 0.2, false);
    const edge = new THREE.Mesh(new THREE.RingGeometry(range - 0.1, range, 32, 1, -arc / 2, arc), edgeMat);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(range, 32, -arc / 2, arc), fillMat);
    for (const m of [edge, fill]) {
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -yaw;
    }
    fill.position.y = -0.01;
    g.add(edge, fill);
    add(g, at.x, 0.09, at.y);
    this.push(g, duration, (_f, k) => {
      fill.scale.setScalar(Math.max(0.01, k));
      fillMat.opacity = 0.15 + 0.3 * k;
    });
  }

  /** Faixa de aviso na linha do disparo (Lançador de Espinhos). */
  lineTelegraph(at: Vec2, dir: Vec2, length: number, width: number, duration: number): void {
    const g = new THREE.Group();
    const edgeMat = this.groundMat('#ff8a3a', 0.8, false);
    const fillMat = this.groundMat('#ff6a2a', 0.18, false);
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(length, width), fillMat);
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(length, 0.06), edgeMat);
    fill.geometry.translate(length / 2, 0, 0);
    edge.geometry.translate(length / 2, 0, 0);
    for (const m of [fill, edge]) {
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(dir.y, dir.x);
    }
    g.add(fill, edge);
    add(g, at.x, 0.1, at.y);
    this.push(g, duration, (_f, k) => {
      fill.scale.set(Math.max(0.01, k), 1, 1);
      fillMat.opacity = 0.15 + 0.3 * k;
    });
  }

  burst(at: Vec2, color: string, n = 10, speed = 3, y = 0.8): void {
    const m = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(this.partGeo, m);
      mesh.position.set(at.x, y + ground(at.x, at.y), at.y);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.scene.add(mesh);
      this.particles.push({ mesh, vel: new THREE.Vector3(Math.cos(a) * v, 2 + Math.random() * 3, Math.sin(a) * v), age: 0, life: 0.5 + Math.random() * 0.4 });
    }
  }

  dashTrail(from: Vec2, to: Vec2, color: string): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.1) return;
    const m = this.groundMat(color, 0.6);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.7), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -Math.atan2(dy, dx);
    add(mesh, (from.x + to.x) / 2, 0.1, (from.y + to.y) / 2);
    this.push(mesh, 0.3, (_f, k) => (m.opacity = 0.6 * (1 - k)));
  }

  /** Lança de Fluxo: feixe reto que some rápido. */
  beam(from: Vec2, to: Vec2, width: number, color: string): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.1) return;
    const g = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 6, 1, true), coreMat);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.6, width * 0.6, len, 8, 1, true), glowMat);
    g.add(core, glow);
    g.position.set((from.x + to.x) / 2, 1.1 + ground((from.x + to.x) / 2, (from.y + to.y) / 2), (from.y + to.y) / 2);
    g.rotation.z = Math.PI / 2;
    g.rotation.y = -Math.atan2(dy, dx);
    // Cilindros nascem no eixo Y: deita no plano e aponta na direção do disparo.
    g.rotation.set(0, -Math.atan2(dy, dx), Math.PI / 2, 'YXZ');
    this.push(g, 0.28, (f, k) => {
      coreMat.opacity = 0.95 * (1 - k);
      glowMat.opacity = 0.6 * (1 - k);
      f.obj.scale.set(1, 1 + k * 0.8, 1 + k * 0.8);
    });
    this.burst(to, color, 6, 2, 1.1);
  }

  /** Linhas que somem: fios elásticos (retos) ou raio (em zigue-zague). */
  lines(points: Vec2[], color: string, jagged: boolean, life = 0.35, y = 1.1): void {
    if (points.length < 2) return;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const n = jagged ? 6 : 1;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const jx = jagged && k > 0 ? (Math.random() - 0.5) * 0.6 : 0;
        const jy = jagged && k > 0 ? (Math.random() - 0.5) * 0.5 : 0;
        const px = a.x + (b.x - a.x) * t + jx;
        const pz = a.y + (b.y - a.y) * t + jy;
        pts.push(new THREE.Vector3(px, y + jy + ground(px, pz), pz));
      }
    }
    const last = points[points.length - 1]!;
    pts.push(new THREE.Vector3(last.x, y + ground(last.x, last.y), last.y));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, m);
    this.push(line, life, (_f, k) => (m.opacity = 1 - k));
    if (jagged) for (const p of points.slice(1)) this.burst(p, color, 5, 2, y);
  }

  /** Correntes: anel no chão e elos verticais que sobem e afundam. */
  chains(at: Vec2, r: number, color: string): void {
    const g = new THREE.Group();
    const ringMat = this.groundMat(color, 0.8);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.15, r, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    const linkMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 4, 8), linkMat);
      link.position.set(Math.cos(a) * r * 0.75, 0.4, Math.sin(a) * r * 0.75);
      link.rotation.y = a;
      link.userData.base = link.position.y;
      g.add(link);
    }
    add(g, at.x, 0.08, at.y);
    this.push(g, 0.9, (f, k) => {
      ringMat.opacity = 0.8 * (1 - k);
      linkMat.opacity = 0.9 * (1 - k * k);
      f.obj.children.forEach((c, i) => {
        if (i > 0) c.position.y = 0.2 + Math.sin(k * Math.PI) * 0.9;
      });
    });
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i]!;
      f.age += dt;
      const k = Math.min(1, f.age / f.life);
      f.update(f, k);
      if (f.age >= f.life) {
        this.scene.remove(f.obj);
        f.obj.traverse((o) => {
          const me = o as THREE.Mesh;
          me.geometry?.dispose();
          (me.material as THREE.Material | undefined)?.dispose?.();
        });
        this.list.splice(i, 1);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.age += dt;
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;
      const floor = ground(p.mesh.position.x, p.mesh.position.z) + 0.05;
      if (p.mesh.position.y < floor) {
        p.mesh.position.y = floor;
        p.vel.multiplyScalar(0.5);
        p.vel.y = Math.abs(p.vel.y) * 0.3;
      }
      p.mesh.scale.setScalar(Math.max(0.01, 1 - p.age / p.life));
      if (p.age >= p.life) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }
}
