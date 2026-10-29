/**
 * Procedural facade material: MeshStandardMaterial (so three.js lighting and
 * shadows still apply) with shader code injected for windows, paint, glass
 * towers, rooftop clutter, lit windows at night and distance haze.
 */
import * as THREE from 'three'
import { GLASS_TOWER_M, KIND } from './geometry'

export interface FacadeUniforms {
  uNight: { value: number }
  uSky: { value: THREE.Vector3 }
  uFog: { value: THREE.Vector3 }
  uFogNear: { value: number }
  uFogFar: { value: number }
  uFogMax: { value: number }
  uHover: { value: number }
  uSelected: { value: number }
  uHighlight: { value: THREE.Vector3 }
}

/** '#rrggbb' -> raw sRGB components (the shader works out linear values itself) */
export function srgb(hex: string): THREE.Vector3 {
  const n = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const VERTEX_HEAD = /* glsl */ `
attribute vec2 aWall;
attribute vec3 aBld;
varying vec2 vWall;
varying vec3 vBld;
varying vec3 vLocal;
varying vec3 vObjNormal;
`

const VERTEX_BODY = /* glsl */ `
vWall = aWall;
vBld = aBld;
vLocal = position;
vObjNormal = normal;
`

const FRAGMENT_HEAD = /* glsl */ `
varying vec2 vWall;
varying vec3 vBld;
varying vec3 vLocal;
varying vec3 vObjNormal;
uniform float uNight;
uniform vec3 uSky;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogMax;
uniform float uHover;
uniform float uSelected;
uniform vec3 uHighlight;

float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
// 1 inside [a, b] with an anti-aliased edge of width w
float band(float x, float a, float b, float w) { return smoothstep(a, a + w, x) * (1.0 - smoothstep(b - w, b, x)); }
// 1 while a pattern cell spans 12+ pixels, 0 once it shrinks under 4: below that a grid only shimmers
float clarity(float fu, float fv) { return 1.0 - smoothstep(0.08, 0.25, max(fwidth(fu), fwidth(fv))); }

// House paints seen across Dhaka, plus exposed brick (more common in Old Dhaka, to the south)
vec3 paintFor(float seed, vec2 local) {
  float oldDhaka = smoothstep(-4500.0, -6500.0, local.y);
  if (h11(seed * 5.31) < 0.07 + 0.38 * oldDhaka) return lin(vec3(0.60, 0.34, 0.24));
  float k = floor(h11(seed * 13.7) * 7.0);
  vec3 c = k < 1.0 ? vec3(0.91, 0.89, 0.83)   // off-white
         : k < 2.0 ? vec3(0.91, 0.85, 0.71)   // cream
         : k < 3.0 ? vec3(0.90, 0.81, 0.56)   // pale yellow
         : k < 4.0 ? vec3(0.85, 0.64, 0.54)   // salmon
         : k < 5.0 ? vec3(0.66, 0.76, 0.81)   // sky blue
         : k < 6.0 ? vec3(0.65, 0.64, 0.61)   // weathered grey
         :           vec3(0.77, 0.80, 0.63);  // pistachio
  return lin(c * (0.92 + 0.16 * h11(seed * 3.7)));
}
`

const FRAGMENT_COLOR = /* glsl */ `
#include <color_fragment>
float bId = vBld.x;
float roofH = vBld.y;
float kind = floor(vBld.z + 0.5);
float seed = h11(bId) * 997.0 + 1.0;
float dist = length(vViewPosition);
vec3 viewDir = normalize(vViewPosition);
float fres = pow(1.0 - abs(dot(viewDir, normalize(vObjNormal))), 3.0);
vec3 sky = lin(uSky);
vec3 paint = paintFor(seed, vLocal.xy);
bool glass = roofH >= ${GLASS_TOWER_M.toFixed(1)};
// Fine detail fades out with distance so far facades don't shimmer
float detail = 1.0 - smoothstep(1200.0, 2600.0, dist);
vec3 col = paint;
float rough = 0.88;
vec3 emit = vec3(0.0);

if (kind == ${KIND.wall.toFixed(1)}) {
  float u = vWall.x, v = vWall.y;
  if (glass) {
    // Curtain wall: blue-green glass, mullions every 1.5 m, spandrel band per 3.6 m floor
    float fu = u / 1.5, fv = v / 3.6;
    float clear = clarity(fu, fv) * detail;
    float frame = max(1.0 - band(fract(fu), 0.05, 0.95, fwidth(fu) + 0.01), 0.85 * (1.0 - band(fract(fv), 0.12, 1.0, fwidth(fv) + 0.01)));
    // Far away the grid blends into its average tone instead of shimmering
    frame = mix(0.2, frame, clear);
    vec3 g = mix(lin(vec3(0.17, 0.27, 0.30)), sky, 0.22 + 0.6 * fres);
    col = mix(g, lin(vec3(0.70, 0.72, 0.72)), frame);
    rough = mix(0.18, 0.6, frame);
    float lit = mix(0.45, step(h21(vec2(floor(fu), floor(fv)) + seed), 0.45), clear);
    emit = lin(vec3(0.85, 0.92, 1.0)) * lit * (1.0 - frame) * uNight * 0.9;
  } else if (v > roofH) {
    // Parapet: plain paint with a pale cap line
    col = mix(paint, lin(vec3(0.85)), band(v, roofH + 0.85, roofH + 1.2, 0.02) * detail);
  } else {
    float bay = mix(2.6, 3.8, h11(seed * 7.1));
    float fu = u / bay + 0.5, fv = v / 3.2;
    vec2 cell = vec2(floor(fu), floor(fv));
    float clear = clarity(fu, fv) * detail;
    float aU = fwidth(fu) * 1.5, aV = fwidth(fv) * 1.5;
    vec3 glassCol = mix(lin(vec3(0.05, 0.06, 0.07)), sky * 0.6, 0.25 + 0.5 * fres);
    // Some windows have curtains drawn
    glassCol = mix(glassCol, lin(vec3(0.55, 0.45, 0.35)) * 0.5, step(0.8, h21(cell + seed * 1.3)) * clear);
    float win = band(fract(fu), 0.2, 0.8, aU) * band(fract(fv), 0.3, 0.86, aV);
    // Projecting sun shade (chajja) over each window row, and a recess shadow under it
    float shade = band(fract(fv), 0.86, 0.95, aV);
    float recess = win * smoothstep(0.86, 0.7, fract(fv));
    vec3 nearCol = mix(paint, glassCol, win);
    nearCol *= 1.0 - 0.25 * (win - recess);
    nearCol = mix(nearCol, paint * 1.08 + 0.02, shade);
    // Windows cover about a third of the wall: the tone a facade averages out to from afar
    vec3 farCol = mix(paint, glassCol, 0.3);
    col = mix(farCol, nearCol, clear);
    rough = mix(rough, 0.3, mix(0.3, win, clear));
    // Street-level shops with rolling shutters on most mid-rise blocks
    if (v < 3.3 && roofH > 8.0 && h11(seed * 2.9) < 0.6) {
      float r = v * 6.0;
      float ribs = (0.5 + 0.5 * sin(r * 6.2832)) * (1.0 - smoothstep(0.2, 0.45, fwidth(r)));
      col = mix(lin(vec3(0.45, 0.46, 0.47)), lin(vec3(0.62)), mix(0.5, ribs, detail));
      emit += lin(vec3(1.0, 0.82, 0.55)) * mix(0.7, step(h21(vec2(cell.x, 7.0) + seed), 0.7), clear) * uNight * 0.8;
    } else {
      float lit = step(h21(cell + seed), 0.35);
      // Warm bulbs and cool tube lights
      vec3 lamp = mix(lin(vec3(1.0, 0.78, 0.45)), lin(vec3(0.85, 0.93, 1.0)), step(0.55, h21(cell * 1.7 + seed)));
      vec3 lampFar = mix(lin(vec3(1.0, 0.78, 0.45)), lin(vec3(0.85, 0.93, 1.0)), 0.45) * 0.35 * 0.34;
      emit += mix(lampFar, lamp * lit * win, clear) * uNight;
    }
  }
  // Rain streaks and a darker, dirtier ground floor
  float streak = vnoise(vec2(u * 0.35, v * 0.04 + seed));
  col *= 1.0 - 0.14 * streak * detail * (glass ? 0.3 : 1.0);
  col *= mix(0.72, 1.0, smoothstep(0.0, 2.0, v));
} else if (kind == ${KIND.roof.toFixed(1)} || kind == ${KIND.stairRoof.toFixed(1)}) {
  // Concrete roof slab with damp patches
  float stain = vnoise(vWall * 0.35 + seed);
  col = mix(lin(vec3(0.62, 0.60, 0.56)), paint, 0.12) * (0.85 + 0.2 * stain);
  if (glass) col = lin(vec3(0.36, 0.37, 0.38));
} else if (kind == ${KIND.stairWall.toFixed(1)}) {
  col = paint * 0.96;
} else {
  // Plastic water tanks: mostly black, some white
  col = h11(seed * 9.1) < 0.65 ? lin(vec3(0.05)) : lin(vec3(0.78));
  rough = 0.45;
}

if (abs(bId - uSelected) < 0.5) col = mix(col, uHighlight, 0.6);
else if (abs(bId - uHover) < 0.5) col = mix(col, uHighlight, 0.3);
diffuseColor.rgb = col;
`

/** Distance haze that matches the map's sky fog, applied to the final sRGB colour */
const FRAGMENT_HAZE = /* glsl */ `
gl_FragColor.rgb = mix(gl_FragColor.rgb, uFog, smoothstep(uFogNear, uFogFar, dist) * uFogMax);
#include <dithering_fragment>
`

export function createFacadeMaterial(): { material: THREE.MeshStandardMaterial; uniforms: FacadeUniforms } {
  const uniforms: FacadeUniforms = {
    uNight: { value: 0 },
    uSky: { value: srgb('#ffe2b3') },
    uFog: { value: srgb('#f4c896') },
    uFogNear: { value: 1500 },
    uFogFar: { value: 9000 },
    uFogMax: { value: 0.85 },
    uHover: { value: -1 },
    uSelected: { value: -1 },
    uHighlight: { value: new THREE.Vector3(1.0, 0.35, 0.08) },
  }
  const material = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0, side: THREE.DoubleSide })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_BODY}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', FRAGMENT_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = rough;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += emit;')
      .replace('#include <dithering_fragment>', FRAGMENT_HAZE)
  }
  return { material, uniforms }
}
