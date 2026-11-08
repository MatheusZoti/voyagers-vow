import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildWorld, type WorldView } from '../client/three/world';
import { floorAt, type GameMap } from '../sim/world/map';
import { SPAWN_COLORS } from './render2d';

/** Prévia 3D do mapa, com o mesmo terreno do jogo e uma câmera livre (orbitar, arrastar, zoom). */
export class Preview3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
  private controls: OrbitControls;
  private world: WorldView | null = null;
  private markers = new THREE.Group();
  private raf = 0;
  private clock = new THREE.Clock();
  private framedFor = '';
  active = false;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.display = 'none';
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#d8cfae');
    this.scene.fog = new THREE.Fog('#d8cfae', 80, 220);
    this.scene.add(new THREE.HemisphereLight('#fff2d8', '#6b5a38', 1.15));
    const sun = new THREE.DirectionalLight('#ffeccb', 2.6);
    sun.position.set(-30, 60, -20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sc.far = 200;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.scene.add(this.markers);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.47;
  }
  private sun: THREE.DirectionalLight;

  setMap(map: GameMap): void {
    if (this.world) {
      this.scene.remove(this.world.group);
      disposeTree(this.world.group);
    }
    this.world = buildWorld(map);
    this.scene.add(this.world.group);
    this.sun.position.set(map.w / 2 - 30, 60, map.h / 2 - 20);
    this.sun.target.position.set(map.w / 2, 0, map.h / 2);
    // Marcadores dos objetos (monstros, NPCs, livros, saídas, início).
    disposeTree(this.markers);
    this.markers.clear();
    const pin = (x: number, y: number, color: string, hgt = 1.2, r = 0.28) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.6, hgt, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
      m.position.set(x, floorAt(map, x, y) + hgt / 2, y);
      m.castShadow = true;
      this.markers.add(m);
    };
    for (const s of map.spawns) pin(s.x + 0.5, s.y + 0.5, SPAWN_COLORS[s.kind] ?? '#e0533f');
    for (const n of map.npcs) pin(n.x, n.y, '#f2d36b', 1.7, 0.3);
    for (const b of map.books) pin(b.x, b.y, '#a98cff', 0.6, 0.3);
    for (const t of map.traps) pin(t.x, t.y, '#f0a040', 0.15, 0.45);
    if (map.bossSpawn) pin(map.bossSpawn.x, map.bossSpawn.y, '#ff4d6d', 2.4, 0.5);
    pin(map.playerStart.x, map.playerStart.y, '#7ed37a', 1.8, 0.32);
    for (const e of map.exits) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(e.x1 - e.x0 + 1, 2, e.y1 - e.y0 + 1),
        new THREE.MeshBasicMaterial({ color: '#6fd0ff', transparent: true, opacity: 0.25, depthWrite: false }),
      );
      const cx = (e.x0 + e.x1 + 1) / 2;
      const cy = (e.y0 + e.y1 + 1) / 2;
      m.position.set(cx, floorAt(map, cx, cy) + 1, cy);
      this.markers.add(m);
    }
    // Enquadra o mapa na primeira vez (ou quando muda de tamanho).
    const key = `${map.id}:${map.w}x${map.h}`;
    if (key !== this.framedFor) {
      this.framedFor = key;
      this.controls.target.set(map.w / 2, 0, map.h / 2);
      const d = Math.max(map.w, map.h);
      this.camera.position.set(map.w / 2, d * 0.75, map.h / 2 + d * 0.75);
      this.controls.update();
    }
  }

  /** Aponta a câmera para um ponto do mapa (ex.: onde está o cursor no 2D). */
  focus(x: number, y: number): void {
    const off = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.set(x, 0, y);
    this.camera.position.copy(this.controls.target).add(off);
  }

  show(): void {
    this.active = true;
    this.renderer.domElement.style.display = 'block';
    this.resize();
    this.clock.getDelta();
    const loop = () => {
      if (!this.active) return;
      this.controls.update();
      this.world?.update(this.clock.getElapsedTime());
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  hide(): void {
    this.active = false;
    cancelAnimationFrame(this.raf);
    this.renderer.domElement.style.display = 'none';
  }

  resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
