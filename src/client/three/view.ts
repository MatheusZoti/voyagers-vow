import * as THREE from 'three';
import { AFFINITY_COLORS } from '../../sim/flow/affinity';
import { NPCS, type NpcId } from '../../sim/psyche/dialogues';
import { SPELLS } from '../../sim/techniques';
import { POSTURES, TIDE_SIDES, tideLevel } from '../../sim/flow/flow';
import type { Vec2 } from '../../sim/math';
import type { SimEvent, Simulation } from '../../sim/sim';
import type { Enemy } from '../../sim/world/entities';
import { floorAt } from '../../sim/world/map';
import { EMOTION_COLORS } from '../../sim/psyche/emotions';
import { dominant } from '../../sim/psyche/psyche';
import { QUALITY_COLORS } from '../../sim/items';
import { Effects } from './fx';
import {
  animateRig,
  buildBoss,
  buildBrute,
  buildGrunt,
  buildPlayer,
  buildSlinger,
  buildStalker,
  flash,
  mat,
  rememberEmissive,
  setOpacity,
  type Rig,
} from './models';
import { FogOfWar } from './fog';
import { buildWorld, type WorldView } from './world';

const CAM_OFFSET = new THREE.Vector3(0, 17, 12.5);

interface EnemyView {
  rig: Rig;
  markRing: THREE.Mesh;
  detectRing: THREE.Mesh;
  rootRing: THREE.Mesh;
  bar: THREE.Group;
  barFill: THREE.Mesh;
  last: THREE.Vector3;
  dead: number;
  hurt: number;
  attack: number;
  /** "amassado" do último golpe (1 = recém-atingido) */
  punch: number;
}

interface Floater {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  age: number;
  life: number;
}

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private world: WorldView;
  private fx: Effects;
  private player: Rig;
  private playerLast = new THREE.Vector3();
  private enemies = new Map<number, EnemyView>();
  private aura: Record<'veil' | 'impetus' | 'gaze' | 'silence', THREE.Object3D>;
  private tideAtk: THREE.Mesh;
  private tideDef: THREE.Mesh;
  private tideShown = -1;
  private impetusLight: THREE.PointLight;
  /**
   * Luzes fixas para o brilho de coisas no chão (grimórios, itens raros). Criar ou remover
   * luzes faz o Three.js recompilar todos os shaders (~0,7 s de travada), então elas são
   * sempre as mesmas e só mudam de lugar, cor e intensidade.
   */
  private glowLights: THREE.PointLight[] = [];
  /** anel no chão com a cor da emoção dominante */
  private emoRing!: THREE.Mesh;
  /** balão da voz interna (um de cada vez) */
  private bubble: { el: HTMLDivElement; age: number; life: number } | null = null;
  private trapMeshes: THREE.Group[] = [];
  private echoMesh: THREE.Group;
  private dangerRing: THREE.Mesh;
  private floaters: Floater[] = [];
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private time = 0;
  private shake = 0;
  private camTarget = new THREE.Vector3();
  private fog: FogOfWar;
  private npcs: Array<{ id: NpcId; rig: Rig; label: HTMLDivElement }> = [];
  private books: Array<{ id: string; group: THREE.Group; glow: THREE.Object3D }> = [];
  private dropMeshes = new Map<number, THREE.Group>();
  private itemMeshes = new Map<number, THREE.Group>();
  private projMeshes = new Map<number, THREE.Mesh>();
  private thornGeo = new THREE.ConeGeometry(0.09, 0.7, 4);
  private thornMat = mat('#f0dcae', { emissive: '#ff8a3a', emissiveIntensity: 0.6 });
  private hoverNpc: NpcId | null = null;
  private playerHurt = 0;

  constructor(
    private host: HTMLElement,
    private floaterLayer: HTMLElement,
    private sim: Simulation,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#d8cfae');
    this.scene.fog = new THREE.Fog('#d8cfae', 30, 70);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);

    this.scene.add(new THREE.HemisphereLight('#fff2d8', '#6b5a38', 1.15));
    this.sun = new THREE.DirectionalLight('#ffeccb', 2.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 26;
    sc.bottom = -26;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.world = buildWorld(sim.map);
    this.scene.add(this.world.group);
    this.fog = new FogOfWar(sim);
    this.fog.patch(this.world.group);
    this.fx = new Effects(this.scene, (x, y) => floorAt(sim.map, x, y));

    this.player = buildPlayer(AFFINITY_COLORS[sim.c.affinity]);
    rememberEmissive(this.player);
    this.scene.add(this.player.root);

    // Auras das posturas.
    const additive = (color: string, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const veil = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), additive(TIDE_SIDES.veil.color, 0.06));
    veil.position.y = 1;
    veil.scale.set(0.85, 1.15, 0.85);
    const impetus = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 4), additive(TIDE_SIDES.impetus.color, 0.55));
      const a = (i / 7) * Math.PI * 2;
      flame.position.set(Math.cos(a) * 0.55, 0.5, Math.sin(a) * 0.55);
      flame.userData.phase = i;
      impetus.add(flame);
    }
    const gaze = new THREE.Group();
    const gazeRing = new THREE.Mesh(new THREE.RingGeometry(13.6, 14, 64), additive(POSTURES.gaze.color, 0.18));
    gazeRing.rotation.x = -Math.PI / 2;
    gazeRing.position.y = 0.06;
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: '#e7c8ff' }));
    const eyeR = eyeL.clone();
    eyeL.position.set(-0.08, 1.64, 0.21);
    eyeR.position.set(0.08, 1.64, 0.21);
    gaze.add(gazeRing);
    this.player.body.add(eyeL, eyeR);
    eyeL.userData.gazeEye = eyeR.userData.gazeEye = true;
    const silence = new THREE.Group();
    this.aura = { veil, impetus, gaze, silence };
    for (const o of Object.values(this.aura)) this.player.root.add(o);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 4, 2);
      this.glowLights.push(l);
      this.scene.add(l);
    }
    this.emoRing = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.9, 40),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.emoRing.rotation.x = -Math.PI / 2;
    this.emoRing.position.y = 0.07;
    this.player.root.add(this.emoRing);
    this.impetusLight = new THREE.PointLight('#ff8a2a', 0, 6, 2);
    this.impetusLight.position.y = 1.2;
    this.player.root.add(this.impetusLight);

    this.tideAtk = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.86, 32), additive('#ff7a3a', 0.8));
    this.tideDef = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.86, 32), additive('#4ab8ff', 0.8));
    for (const r of [this.tideAtk, this.tideDef]) {
      r.rotation.x = -Math.PI / 2;
      r.position.y = 0.07;
      this.player.root.add(r);
    }
    this.dangerRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.1, 32), additive('#ff2a2a', 0.0));
    this.dangerRing.rotation.x = -Math.PI / 2;
    this.dangerRing.position.y = 0.08;
    this.player.root.add(this.dangerRing);

    // Armadilhas (só aparecem sob o Olhar).
    const trapMat = mat('#6c4a8c', { emissive: '#a060ff', emissiveIntensity: 0.8 });
    for (const t of sim.traps) {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.06, 6), trapMat);
      g.add(plate);
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), trapMat);
        const a = (i / 5) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.25, 0.15, Math.sin(a) * 0.25);
        g.add(spike);
      }
      g.position.set(t.pos.x, this.gh(t.pos.x, t.pos.y) + 0.03, t.pos.y);
      g.visible = false;
      this.scene.add(g);
      this.trapMeshes.push(g);
    }

    // Eco do jogador.
    this.echoMesh = new THREE.Group();
    const ghost = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 6), additive('#a8e6ff', 0.45));
    ghost.position.y = 1;
    ghost.rotation.x = Math.PI;
    const wisp = new THREE.PointLight('#a8e6ff', 4, 5, 2);
    wisp.position.y = 1.2;
    this.echoMesh.add(ghost, wisp);
    this.echoMesh.visible = false;
    this.scene.add(this.echoMesh);

    // NPCs do vale.
    for (const n of sim.map.npcs) {
      const def = NPCS[n.id];
      const rig = buildPlayer(def.color);
      rememberEmissive(rig);
      rig.root.position.set(n.x, this.gh(n.x, n.y), n.y);
      rig.body.rotation.y = Math.atan2(sim.map.playerStart.x - n.x, sim.map.playerStart.y - n.y);
      this.scene.add(rig.root);
      const label = document.createElement('div');
      label.className = 'npc-label';
      this.floaterLayer.appendChild(label);
      this.npcs.push({ id: n.id, rig, label });
    }

    // Livros antigos em púlpitos de pedra.
    for (const b of sim.map.books) {
      const g = new THREE.Group();
      const stone = mat('#9a9486');
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.9, 6), stone);
      post.position.y = 0.45;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.5), stone);
      top.position.y = 0.95;
      top.rotation.x = -0.35;
      post.castShadow = top.castShadow = true;
      const color = AFFINITY_COLORS[SPELLS[b.spell].affinity];
      const glow = new THREE.Group();
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.34), mat(color, { emissive: color, emissiveIntensity: 0.9 }));
      book.position.y = 1.32;
      const light = new THREE.PointLight(color, 3, 4, 2);
      light.position.y = 1.6;
      glow.add(book, light);
      g.add(post, top, glow);
      g.position.set(b.x, this.gh(b.x, b.y), b.y);
      this.scene.add(g);
      this.books.push({ id: b.id, group: g, glow });
    }

    this.resize();
    window.addEventListener('resize', () => this.resize());
    const p = sim.player.pos;
    this.camTarget.set(p.x, 0, p.y);
    this.playerLast.set(p.x, 0, p.y);
  }

  /** Altura do chão (relevo) num ponto do mundo. */
  private gh(x: number, y: number): number {
    return floorAt(this.sim.map, x, y);
  }

  resize(): void {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Converte o cursor em ponto do chão (coordenadas do mundo). */
  screenToGround(clientX: number, clientY: number): Vec2 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    // Com relevo: intersecta o plano na altura do chão e refina algumas vezes.
    let y = this.player.root.position.y;
    for (let i = 0; i < 4; i++) {
      this.groundPlane.constant = -y;
      if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
      y = this.gh(hit.x, hit.z);
    }
    return { x: hit.x, y: hit.z };
  }

  private enemyView(e: Enemy): EnemyView {
    let v = this.enemies.get(e.id);
    if (v) return v;
    const rig =
      e.kind === 'grunt'
        ? buildGrunt()
        : e.kind === 'slinger'
          ? buildSlinger()
          : e.kind === 'stalker'
            ? buildStalker()
            : e.kind === 'brute'
              ? buildBrute()
              : buildBoss();
    rememberEmissive(rig);
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12), new THREE.MeshBasicMaterial({ color: '#1a1010', depthTest: false, transparent: true, opacity: 0.8 }));
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.06, 0.08),
      new THREE.MeshBasicMaterial({ color: e.def.elite ? '#ffb02a' : '#e8433a', depthTest: false }),
    );
    fill.position.z = 0.001;
    bg.renderOrder = 10;
    fill.renderOrder = 11;
    bar.add(bg, fill);
    bar.position.y = rig.height + 0.35;
    bar.visible = false;
    if (!e.def.boss) rig.root.add(bar);
    this.scene.add(rig.root);
    const markRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.05, 6, 20),
      new THREE.MeshBasicMaterial({ color: AFFINITY_COLORS.dominion, transparent: true, opacity: 0.9 }),
    );
    markRing.rotation.x = Math.PI / 2;
    markRing.position.y = rig.height / (e.def.boss ? 1.75 : 1) + 0.6;
    markRing.visible = false;
    const rootRing = new THREE.Mesh(
      new THREE.TorusGeometry(e.def.radius + 0.25, 0.06, 4, 24),
      new THREE.MeshBasicMaterial({ color: AFFINITY_COLORS.forge, transparent: true, opacity: 0.9 }),
    );
    rootRing.rotation.x = Math.PI / 2;
    rootRing.position.y = 0.25;
    rootRing.visible = false;
    // Até onde ele te percebe em Silêncio (escala = raio em metros).
    const detectRing = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1, 48),
      new THREE.MeshBasicMaterial({ color: '#c9b8ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    detectRing.rotation.x = -Math.PI / 2;
    detectRing.position.y = 0.06;
    detectRing.visible = false;
    rig.root.add(markRing, rootRing, detectRing);
    v = { rig, markRing, rootRing, detectRing, bar, barFill: fill, last: new THREE.Vector3(e.pos.x, this.gh(e.pos.x, e.pos.y), e.pos.y), dead: 0, hurt: 0, attack: 0, punch: 0 };
    rig.root.position.copy(v.last);
    this.enemies.set(e.id, v);
    return v;
  }

  /** cor do golpe: lado da Maré, ou a postura quando ela está no centro */
  private stanceColor(): string {
    const p = this.sim.player;
    const lvl = tideLevel(p.tide.value);
    if (lvl < 0) return TIDE_SIDES.veil.color;
    if (lvl > 0) return TIDE_SIDES.impetus.color;
    return POSTURES[p.posture].color;
  }

  handleEvents(events: SimEvent[]): void {
    const sim = this.sim;
    for (const ev of events) {
      switch (ev.t) {
        case 'swing':
          if (ev.finisher) {
            this.fx.swing({ x: ev.x, y: ev.y }, ev.dir, ev.range, '#fff4d0', (150 * Math.PI) / 180);
            this.fx.swing({ x: ev.x, y: ev.y }, ev.dir, ev.range * 0.7, this.stanceColor(), (130 * Math.PI) / 180);
          } else this.fx.swing({ x: ev.x, y: ev.y }, ev.dir, ev.range, this.stanceColor());
          break;
        case 'telegraphLine':
          this.fx.lineTelegraph({ x: ev.x, y: ev.y }, ev.dir, ev.length, ev.width, ev.duration);
          break;
        case 'telegraphArc':
          this.fx.arcTelegraph({ x: ev.x, y: ev.y }, ev.dir, ev.range, ev.arc, ev.duration);
          break;
        case 'quake':
          this.fx.shockwave({ x: ev.x, y: ev.y }, ev.r * 1.2, '#ffb07a', 0.6, 0.25);
          this.fx.burst({ x: ev.x, y: ev.y }, '#8a7356', 22, 5, 0.3);
          this.shake = Math.max(this.shake, 0.55);
          break;
        case 'signature': {
          const color = ev.beyond ? '#ffd84a' : AFFINITY_COLORS[sim.c.affinity];
          this.fx.dashTrail(ev.from, ev.to, color);
          this.fx.shockwave(ev.to, ev.radius * 1.6, color, 0.5, 0.3);
          this.fx.burst(ev.to, color, 14, 4);
          if (ev.beyond) this.fx.pillar(ev.to, '#ffd84a', 5, 0.7);
          this.shake = Math.max(this.shake, 0.25);
          break;
        }
        case 'pointCharge':
          this.fx.pillar(sim.player.pos, '#ffffff', 2.5, 0.35);
          break;
        case 'beam':
          this.fx.beam(ev.from, ev.to, ev.width, ev.color);
          this.shake = Math.max(this.shake, 0.12);
          break;
        case 'spellMark':
          this.fx.telegraph({ x: ev.x, y: ev.y }, ev.r, ev.duration, false, ev.color);
          break;
        case 'impact':
          this.fx.shockwave({ x: ev.x, y: ev.y }, ev.r * 1.3, ev.color, 0.5, 0.3);
          this.fx.burst({ x: ev.x, y: ev.y }, ev.color, 16, 4, 0.6);
          this.shake = Math.max(this.shake, 0.22);
          break;
        case 'tether':
          for (const t of ev.targets) this.fx.lines([ev.from, t], ev.color, false, 0.45);
          if (!ev.targets.length) this.fx.swing(ev.from, sim.player.facing, 6, ev.color, 1.4);
          break;
        case 'chain':
          this.fx.lines(ev.points, ev.color, true, 0.4);
          break;
        case 'chains':
          this.fx.chains({ x: ev.x, y: ev.y }, ev.r, ev.color);
          break;
        case 'slash':
          this.fx.swing({ x: ev.x, y: ev.y }, ev.dir, ev.range, ev.color, ev.arc);
          this.fx.swing({ x: ev.x, y: ev.y }, ev.dir, ev.range * 0.75, '#ffffff', ev.arc * 0.9);
          this.shake = Math.max(this.shake, 0.18);
          break;
        case 'mark': {
          const e = sim.enemies.find((x) => x.id === ev.id);
          if (e) {
            this.fx.pillar(e.pos, ev.color, 3, 0.6);
            this.floater(new THREE.Vector3(e.pos.x, 2.4, e.pos.y), 'Discórdia', 'perfect');
          }
          break;
        }
        case 'echoRecovered':
          this.fx.pillar({ x: ev.x, y: ev.y }, '#a8e6ff', 4, 1);
          this.fx.burst({ x: ev.x, y: ev.y }, '#a8e6ff', 20, 2.6);
          break;
        case 'voice':
          this.say(ev.text);
          break;
        case 'itemPickup': {
          const color = QUALITY_COLORS[ev.quality - 1] ?? '#ffffff';
          this.fx.burst({ x: ev.x, y: ev.y }, color, 14, 2.2);
          break;
        }
        case 'learn':
          this.fx.pillar({ x: ev.x, y: ev.y }, AFFINITY_COLORS[SPELLS[ev.spell].affinity], 5, 1.2);
          this.fx.burst({ x: ev.x, y: ev.y }, AFFINITY_COLORS[SPELLS[ev.spell].affinity], 24, 3);
          this.floater(new THREE.Vector3(ev.x, 2.6, ev.y), SPELLS[ev.spell].name, 'perfect');
          break;
        case 'telegraph':
          this.fx.telegraph({ x: ev.x, y: ev.y }, ev.r, ev.duration, ev.heavy);
          break;
        case 'enemySwing': {
          const e = sim.enemies.find((x) => x.id === ev.id);
          if (e) {
            this.fx.swing(e.pos, ev.dir, ev.range, '#ff6a4a');
            const v = this.enemies.get(e.id);
            if (v) v.attack = 0.3;
          }
          break;
        }
        case 'damage': {
          const at = new THREE.Vector3(ev.x, 2, ev.y);
          if (ev.target === 'enemy') {
            const e = sim.enemies.find((x) => x.id === ev.id);
            if (e) {
              const v = this.enemies.get(e.id);
              if (v) {
                v.hurt = 0.12;
                if (!ev.immune) v.punch = ev.big || ev.crit ? 1 : 0.6;
              }
              at.y = (v?.rig.height ?? 2) + 0.2;
            }
            if (ev.evade) this.floater(at, 'recuando', 'imm');
            else if (ev.immune) this.floater(at, 'imune', 'imm');
            else this.floater(at, String(ev.amount), ev.crit ? 'crit' : ev.pierce ? 'pierce' : 'hit');
            if (!ev.immune) this.fx.burst({ x: ev.x, y: ev.y }, ev.crit ? '#ffffff' : '#ffd08a', ev.crit ? 12 : 4, 2.5, 1);
            if (ev.crit) this.shake = Math.max(this.shake, 0.3);
          } else {
            this.floater(at, `-${ev.amount}`, 'hurt');
            this.playerHurt = 0.1;
            this.shake = Math.max(this.shake, Math.min(0.5, ev.amount / 60));
          }
          break;
        }
        case 'heal':
          this.floater(new THREE.Vector3(sim.player.pos.x, 2.2, sim.player.pos.y), `+${ev.amount}`, 'heal');
          break;
        case 'enemyDeath':
          this.fx.burst({ x: ev.x, y: ev.y }, ev.boss ? '#7fd3ff' : '#c9b48a', ev.boss ? 40 : 12, ev.boss ? 7 : 3.5);
          if (ev.boss) {
            this.fx.shockwave({ x: ev.x, y: ev.y }, 9, '#7fd3ff', 1.2, 0.2);
            this.fx.pillar({ x: ev.x, y: ev.y }, '#7fd3ff', 9, 1.4);
          }
          break;
        case 'perfectTide':
          this.fx.shockwave({ x: ev.x, y: ev.y }, 3, '#7fe8ff', 0.6, 0.35);
          this.floater(new THREE.Vector3(ev.x, 2.6, ev.y), 'Maré perfeita', 'perfect');
          break;
        case 'trap':
          this.fx.burst({ x: ev.x, y: ev.y }, '#b48cff', 12, 3, 0.3);
          break;
        case 'playerDeath':
          this.fx.burst({ x: ev.x, y: ev.y }, '#a8e6ff', 24, 4);
          break;
        case 'levelUp':
          this.fx.pillar(sim.player.pos, '#ffe9a0', 4, 1);
          this.fx.shockwave(sim.player.pos, 3, '#ffe9a0', 0.8);
          break;
        default:
          break;
      }
    }
  }

  private floater(pos: THREE.Vector3, text: string, cls: string): void {
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.textContent = text;
    this.floaterLayer.appendChild(el);
    pos.x += (Math.random() - 0.5) * 0.4;
    pos.y += this.gh(pos.x, pos.z);
    this.floaters.push({ el, pos, age: 0, life: cls === 'perfect' ? 1.4 : 0.9 });
  }

  render(dt: number): void {
    const sim = this.sim;
    const p = sim.player;
    this.time += dt;
    this.world.update(this.time);
    this.fog.update(dt);

    // Jogador.
    const target = new THREE.Vector3(p.pos.x, this.gh(p.pos.x, p.pos.y), p.pos.y);
    const prev = this.player.root.position.clone();
    const snap = prev.distanceTo(target) > 3;
    this.player.root.position.lerp(target, snap ? 1 : Math.min(1, dt * 18));
    const speed = prev.distanceTo(this.player.root.position) / Math.max(dt, 1e-4);
    const yaw = Math.atan2(p.facing.x, p.facing.y);
    this.player.body.rotation.y = lerpAngle(this.player.body.rotation.y, yaw, Math.min(1, dt * 16));
    animateRig(this.player, dt, p.dead ? 0 : speed, { attack: p.attackAnim > 0 ? p.attackAnim / 0.3 : 0, windup: 0, dead: p.dead ? 3 - p.respawnIn : 0 });
    setOpacity(this.player, p.posture === 'silence' ? 0.45 : 1);

    // Auras.
    // Véu e Ímpeto seguem a Maré: a aura cresce a cada degrau.
    const lvl = tideLevel(p.tide.value);
    this.aura.gaze.visible = !p.dead && p.posture === 'gaze';
    this.aura.silence.visible = !p.dead && p.posture === 'silence';
    this.aura.veil.visible = !p.dead && lvl < 0;
    this.aura.impetus.visible = !p.dead && lvl > 0;
    this.aura.veil.scale.setScalar((1 + Math.sin(this.time * 3) * 0.03) * (lvl <= -2 ? 1.12 : 1));
    (this.aura.veil as THREE.Mesh).scale.y *= 1.15;
    const veilMat = (this.aura.veil as THREE.Mesh).material as THREE.MeshBasicMaterial;
    veilMat.opacity = p.flow > 0 ? (lvl <= -2 ? 0.11 : 0.06) : 0.015;
    const flameBoost = lvl >= 2 ? 1.35 : 1;
    this.aura.impetus.children.forEach((f) => {
      const ph = f.userData.phase as number;
      f.scale.y = (0.7 + Math.abs(Math.sin(this.time * 9 + ph * 1.7)) * 0.9) * flameBoost;
      f.position.y = 0.4 + f.scale.y * 0.3;
    });
    this.aura.impetus.rotation.y += dt * 2;
    this.impetusLight.intensity = lvl > 0 && !p.dead ? (lvl >= 2 ? 7 : 4) + Math.sin(this.time * 20) * 1.2 : 0;
    this.player.body.traverse((o) => {
      if (o.userData.gazeEye) o.visible = p.posture === 'gaze';
    });
    // Ponto carregado: punhos brilham.
    const charged = sim.time < p.pointUntil;
    const dz = sim.time < p.defenseZeroUntil;
    (this.dangerRing.material as THREE.MeshBasicMaterial).opacity = dz ? 0.5 + Math.sin(this.time * 25) * 0.3 : 0;
    this.playerHurt = Math.max(0, this.playerHurt - dt);
    flash(this.player, this.playerHurt > 0 ? 1 : charged ? 0.5 + Math.sin(this.time * 18) * 0.35 : 0);

    // Anel da Maré.
    const tv = Math.round(p.tide.value * 50) / 50;
    if (tv !== this.tideShown) {
      this.tideShown = tv;
      const atk = Math.max(0.001, tv * Math.PI * 2);
      this.tideAtk.geometry.dispose();
      this.tideDef.geometry.dispose();
      this.tideAtk.geometry = new THREE.RingGeometry(0.7, 0.86, 32, 1, Math.PI / 2, atk);
      this.tideDef.geometry = new THREE.RingGeometry(0.7, 0.86, 32, 1, Math.PI / 2 + atk, Math.max(0.001, Math.PI * 2 - atk));
    }
    this.tideAtk.visible = this.tideDef.visible = !p.dead;

    // Inimigos.
    for (const e of sim.enemies) {
      const v = this.enemyView(e);
      const dead = e.state === 'dead';
      if (dead) v.dead += dt;
      else if (v.dead > 0) {
        v.dead = 0;
        v.rig.root.position.set(e.pos.x, this.gh(e.pos.x, e.pos.y), e.pos.y);
      }
      const t = new THREE.Vector3(e.pos.x, this.gh(e.pos.x, e.pos.y), e.pos.y);
      const before = v.rig.root.position.clone();
      v.rig.root.position.lerp(t, Math.min(1, dt * 15));
      const sp = dead ? 0 : before.distanceTo(v.rig.root.position) / Math.max(dt, 1e-4);
      v.rig.body.rotation.y = lerpAngle(v.rig.body.rotation.y, Math.atan2(e.facing.x, e.facing.y), Math.min(1, dt * 10));
      const windup = e.state === 'windup' && e.attack ? 1 - e.timer / Math.max(0.01, e.windupTotal) : 0;
      v.attack = Math.max(0, v.attack - dt);
      animateRig(v.rig, dt, sp, { attack: v.attack / 0.3, windup, dead: dead ? v.dead : 0 });
      // Amassa e volta: o golpe "entra" no corpo.
      v.punch = Math.max(0, v.punch - dt * 7);
      const sq = v.punch * 0.22;
      v.rig.body.scale.set(1 + sq, 1 - sq, 1 + sq);
      let opacity = dead ? Math.max(0, 1 - Math.max(0, v.dead - 1.2) / 0.8) : 1;
      if (e.def.shadowed && !dead) opacity = e.revealed ? 0.8 : 0;
      // Recuando (imune): meio transparente.
      if (e.evading && !dead) opacity = Math.min(opacity, 0.45);
      // Névoa de guerra: fora da vista, o inimigo some.
      if (!sim.isVisible(e.pos)) opacity = 0;
      setOpacity(v.rig, opacity);
      v.hurt = Math.max(0, v.hurt - dt);
      flash(v.rig, v.hurt > 0 ? 1 : 0);
      v.bar.visible = !dead && opacity > 0.1 && (e.hp < e.maxHp || e.aggro);
      if (v.bar.visible) {
        const k = Math.max(0, e.hp / e.maxHp);
        v.barFill.scale.x = Math.max(0.001, k);
        v.barFill.position.x = -(1 - k) * 0.53;
        v.bar.quaternion.copy(this.camera.quaternion);
      }
    }
    // Remove vistas de inimigos que saíram da simulação (servos invocados).
    for (const [id, v] of this.enemies) {
      if (!sim.enemies.some((e) => e.id === id)) {
        this.scene.remove(v.rig.root);
        this.enemies.delete(id);
      }
    }

    // Armadilhas e Eco.
    sim.traps.forEach((t, i) => {
      const m = this.trapMeshes[i]!;
      m.visible = t.armed && t.revealed && sim.isVisible(t.pos);
      m.rotation.y += dt * 0.5;
    });
    if (sim.echo) {
      this.echoMesh.visible = true;
      this.echoMesh.position.set(sim.echo.pos.x, this.gh(sim.echo.pos.x, sim.echo.pos.y) + Math.sin(this.time * 2) * 0.15, sim.echo.pos.y);
    } else this.echoMesh.visible = false;

    // NPCs: respiração leve, nome e "!" quando há conversa nova.
    for (const n of this.npcs) {
      animateRig(n.rig, dt, 0, { attack: 0, windup: 0, dead: 0 });
      const fresh = !!sim.dialogueFor(n.id);
      const pr = this.project({ x: n.rig.root.position.x, y: n.rig.root.position.z }, 2.35);
      const near = sim.npcDistance(n.id) < 14;
      const known = sim.isExplored(n.rig.root.position.x, n.rig.root.position.z);
      n.rig.root.visible = known;
      n.label.style.display = pr.visible && near && known ? '' : 'none';
      n.label.style.transform = `translate(${pr.x}px, ${pr.y}px) translate(-50%, -100%)`;
      const html = `${fresh ? '<b class="bang">!</b>' : ''}<span>${NPCS[n.id].name}</span>`;
      if (n.label.dataset.h !== html) {
        n.label.dataset.h = html;
        n.label.innerHTML = html;
      }
      n.label.classList.toggle('hover', this.hoverNpc === n.id);
      flash(n.rig, this.hoverNpc === n.id ? 0.35 : 0);
    }
    // Livros: brilham até serem lidos.
    for (const b of this.books) {
      const read = sim.c.booksRead.includes(b.id);
      b.group.visible = sim.isExplored(b.group.position.x, b.group.position.z);
      b.glow.visible = !read;
      b.glow.position.y = Math.sin(this.time * 2) * 0.06;
      b.glow.rotation.y += dt * 0.6;
    }
    // Grimórios caídos.
    for (const d of sim.drops) {
      let g = this.dropMeshes.get(d.id);
      if (!g) {
        const color = AFFINITY_COLORS[SPELLS[d.spell].affinity];
        g = new THREE.Group();
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.32), mat(color, { emissive: color, emissiveIntensity: 1 }));
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.45, 0.6, 24),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = -0.75;
        g.add(book, halo);
        g.position.set(d.pos.x, this.gh(d.pos.x, d.pos.y) + 0.9, d.pos.y);
        this.scene.add(g);
        this.dropMeshes.set(d.id, g);
      }
      g.position.y = this.gh(d.pos.x, d.pos.y) + 0.9 + Math.sin(this.time * 3 + d.id) * 0.12;
      g.visible = sim.isExplored(d.pos.x, d.pos.y);
      g.children[0]!.rotation.y += dt * 2;
    }
    for (const [id, g] of this.dropMeshes) {
      if (!sim.drops.some((d) => d.id === id)) {
        this.scene.remove(g);
        disposeGroup(g);
        this.dropMeshes.delete(id);
      }
    }
    // Equipamentos no chão: um embrulho de couro com o brilho da qualidade.
    for (const d of sim.itemDrops) {
      let g = this.itemMeshes.get(d.id);
      if (!g) {
        const color = QUALITY_COLORS[d.item.quality - 1] ?? '#ffffff';
        g = new THREE.Group();
        const bundle = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), mat('#8a6a44'));
        bundle.scale.set(1.3, 0.75, 1);
        bundle.castShadow = true;
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 5, 12), mat(color, { emissive: color, emissiveIntensity: 0.9 }));
        strap.rotation.x = Math.PI / 2;
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.16, 1.6, 8, 1, true),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: d.item.quality >= 3 ? 0.4 : 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        beam.position.y = 0.8;
        g.add(bundle, strap, beam);
        g.position.set(d.pos.x, this.gh(d.pos.x, d.pos.y) + 0.18, d.pos.y);
        this.scene.add(g);
        this.itemMeshes.set(d.id, g);
      }
      g.visible = sim.isExplored(d.pos.x, d.pos.y);
      g.children[0]!.rotation.y += dt * 0.8;
    }
    for (const [id, g] of this.itemMeshes) {
      if (!sim.itemDrops.some((d) => d.id === id)) {
        this.scene.remove(g);
        disposeGroup(g);
        this.itemMeshes.delete(id);
      }
    }
    // As luzes fixas vão para as coisas brilhantes mais perto de você.
    const shiny: Array<{ x: number; y: number; h: number; color: string; power: number }> = [];
    for (const d of sim.drops)
      if (sim.isExplored(d.pos.x, d.pos.y))
        shiny.push({ x: d.pos.x, y: d.pos.y, h: 0.9, color: AFFINITY_COLORS[SPELLS[d.spell].affinity], power: 3 });
    for (const d of sim.itemDrops)
      if (d.item.quality >= 3 && sim.isExplored(d.pos.x, d.pos.y))
        shiny.push({ x: d.pos.x, y: d.pos.y, h: 0.5, color: QUALITY_COLORS[d.item.quality - 1] ?? '#ffffff', power: 1.6 });
    const pp = sim.player.pos;
    shiny.sort((a, b) => Math.hypot(a.x - pp.x, a.y - pp.y) - Math.hypot(b.x - pp.x, b.y - pp.y));
    this.glowLights.forEach((l, i) => {
      const s = shiny[i];
      l.intensity = s ? s.power : 0;
      if (s) {
        l.color.set(s.color);
        l.position.set(s.x, this.gh(s.x, s.y) + s.h, s.y);
      }
    });
    // Espinhos em voo.
    for (const pr of sim.projectiles) {
      let m = this.projMeshes.get(pr.id);
      if (!m) {
        m = new THREE.Mesh(this.thornGeo, this.thornMat);
        m.castShadow = true;
        this.scene.add(m);
        this.projMeshes.set(pr.id, m);
      }
      m.position.set(pr.pos.x, this.gh(pr.pos.x, pr.pos.y) + 1.1, pr.pos.y);
      // Cone aponta no eixo Y: deita na direção do voo.
      m.rotation.set(Math.PI / 2, Math.atan2(pr.dir.x, pr.dir.y), 0, 'YXZ');
      m.visible = sim.isVisible(pr.pos);
    }
    for (const [id, m] of this.projMeshes) {
      if (!sim.projectiles.some((p) => p.id === id)) {
        this.scene.remove(m);
        this.projMeshes.delete(id);
      }
    }

    // Estados dos inimigos: preso por Correntes, sob Discórdia.
    for (const e of sim.enemies) {
      const v = this.enemies.get(e.id);
      if (!v) continue;
      const alive = e.state !== 'dead';
      v.markRing.visible = alive && sim.time < e.charmedUntil;
      v.markRing.rotation.z += dt * 3;
      v.rootRing.visible = alive && sim.time < e.rootUntil;
      const hiddenFrom =
        alive && sim.player.posture === 'silence' && !e.def.elite && !e.aggro && (!e.def.shadowed || e.revealed) &&
        Math.hypot(e.pos.x - sim.player.pos.x, e.pos.y - sim.player.pos.y) < 14;
      v.detectRing.visible = hiddenFrom;
      if (hiddenFrom) v.detectRing.scale.setScalar(sim.stealthRadius(e));
    }

    // Câmera estilo Albion: inclinada, fixa, seguindo o personagem.
    this.camTarget.lerp(this.player.root.position, Math.min(1, dt * 6));
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * this.shake;
    this.camera.position.copy(this.camTarget).add(CAM_OFFSET);
    this.camera.position.x += (Math.random() - 0.5) * sh;
    this.camera.position.y += (Math.random() - 0.5) * sh;
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + 0.8, this.camTarget.z);
    this.sun.position.set(this.camTarget.x - 14, 30, this.camTarget.z - 8);
    this.sun.target.position.copy(this.camTarget);

    this.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.updateFloaters(dt);
  }

  /** Voz interna: um balão curto sobre a cabeça do personagem. */
  say(text: string): void {
    this.bubble?.el.remove();
    const el = document.createElement('div');
    el.className = 'voice-bubble';
    el.textContent = text;
    this.floaterLayer.appendChild(el);
    this.bubble = { el, age: 0, life: 3.4 };
  }

  private updateFloaters(dt: number): void {
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    const v = new THREE.Vector3();
    // Aura da emoção dominante (só quando ela pesa).
    const dom = dominant(this.sim.c.psyche);
    const mat0 = this.emoRing.material as THREE.MeshBasicMaterial;
    if (dom && dom.intensity >= 0.2) {
      mat0.color.set(EMOTION_COLORS[dom.id]);
      mat0.opacity = (0.12 + 0.4 * dom.intensity) * (0.8 + 0.2 * Math.sin(this.time * 3));
    } else mat0.opacity = 0;
    if (this.bubble) {
      const b = this.bubble;
      b.age += dt;
      v.copy(this.player.root.position);
      v.y += 2.5;
      v.project(this.camera);
      b.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      b.el.style.opacity = String(Math.min(1, b.age * 6, (b.life - b.age) * 2));
      if (b.age >= b.life) {
        b.el.remove();
        this.bubble = null;
      }
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]!;
      f.age += dt;
      f.pos.y += dt * 1.4;
      v.copy(f.pos).project(this.camera);
      f.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
      f.el.style.opacity = String(Math.max(0, 1 - (f.age / f.life) ** 2));
      if (f.age >= f.life) {
        f.el.remove();
        this.floaters.splice(i, 1);
      }
    }
  }

  /** Projeta um ponto do mundo para a tela (para marcadores do HUD). */
  project(p: Vec2, height = 0): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(p.x, height + this.gh(p.x, p.y), p.y).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * this.renderer.domElement.clientWidth,
      y: ((1 - v.y) / 2) * this.renderer.domElement.clientHeight,
      visible: v.z < 1,
    };
  }

  /** NPC sob o cursor (para destacar e trocar o cursor). */
  setHoverNpc(id: NpcId | null): void {
    this.hoverNpc = id;
    this.renderer.domElement.style.cursor = id ? 'pointer' : 'crosshair';
  }

  dispose(): void {
    this.renderer.dispose();
    this.renderer.domElement.remove();
    for (const f of this.floaters) f.el.remove();
    this.bubble?.el.remove();
    for (const n of this.npcs) n.label.remove();
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Libera geometrias e materiais de um grupo removido da cena. */
function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mt = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mt)) mt.forEach((x) => x.dispose());
    else mt?.dispose();
  });
}
