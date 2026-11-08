import * as THREE from 'three';
import type { Simulation } from '../../sim/sim';

/**
 * Névoa de guerra no cenário: uma textura do tamanho da região (1 texel por tile)
 * diz, para cada ponto, se está à vista (1), já explorado (0,5) ou nunca visto (0).
 * Todos os materiais do cenário recebem um pequeno patch de shader que lê essa textura.
 */
export class FogOfWar {
  readonly texture: THREE.DataTexture;
  private data: Uint8Array;
  private acc = 1;
  private uniforms = {
    uFowTex: { value: null as THREE.DataTexture | null },
    uFowSize: { value: new THREE.Vector2() },
    uFowColor: { value: new THREE.Color('#14110d') },
  };

  constructor(private sim: Simulation) {
    const { w, h } = sim.map;
    this.data = new Uint8Array(w * h * 4);
    this.texture = new THREE.DataTexture(this.data, w, h, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.uniforms.uFowTex.value = this.texture;
    this.uniforms.uFowSize.value.set(w, h);
    this.refresh();
  }

  /** Aplica a névoa a todos os materiais de um grupo (cenário). */
  patch(root: THREE.Object3D): void {
    const done = new Set<THREE.Material>();
    root.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        if (done.has(m)) continue;
        done.add(m);
        this.patchMaterial(m);
      }
    });
  }

  private patchMaterial(m: THREE.Material): void {
    const u = this.uniforms;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFowXZ;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 fowP = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            fowP = instanceMatrix * fowP;
          #endif
          vFowXZ = (modelMatrix * fowP).xz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vFowXZ;
          uniform sampler2D uFowTex;
          uniform vec2 uFowSize;
          uniform vec3 uFowColor;`,
        )
        .replace(
          '#include <dithering_fragment>',
          `{
            float v = texture2D(uFowTex, vFowXZ / uFowSize).r;
            vec3 col = gl_FragColor.rgb;
            vec3 dim = mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, 0.4) * 0.5;
            vec3 seen = mix(dim, col, smoothstep(0.5, 1.0, v));
            gl_FragColor.rgb = mix(uFowColor, seen, smoothstep(0.0, 0.5, v));
          }
          #include <dithering_fragment>`,
        );
    };
    m.needsUpdate = true;
  }

  /** Atualiza a textura (algumas vezes por segundo basta). */
  update(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.12) return;
    this.acc = 0;
    this.refresh();
  }

  private refresh(): void {
    const sim = this.sim;
    const { w, h } = sim.map;
    const p = sim.player.pos;
    const r = sim.visionRadius();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
        // Borda da visão suave (2 m de transição).
        const vis = sim.player.dead ? 0 : Math.max(0, Math.min(1, (r - d) / 2));
        const v = sim.explored[i] ? 0.5 + 0.5 * vis : 0.5 * vis;
        const b = Math.round(v * 255);
        this.data[i * 4] = b;
        this.data[i * 4 + 1] = b;
        this.data[i * 4 + 2] = b;
        this.data[i * 4 + 3] = 255;
      }
    this.texture.needsUpdate = true;
  }
}
