import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// Shared with main.js: tells it the 3D scene is ready to fade in, and gives it
// a hook to kick off the intro once the loader leaves.
const VIEX = (window.VIEX = window.VIEX || {});

function announceReady() {
  VIEX.sceneReady = true;
  window.dispatchEvent(new Event("viex:scene-ready"));
}

const canvas = document.getElementById("scene");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isSmall = window.matchMedia("(max-width: 720px)").matches;
const lowPower = isSmall || (navigator.hardwareConcurrency || 8) <= 4;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !isSmall, powerPreference: "high-performance", stencil: false });
} catch {
  canvas.remove();
  document.documentElement.classList.add("load-failed");
  VIEX.startIntro = () => {};
  VIEX.setTheme = () => {};
  announceReady();
  throw new Error("WebGL unavailable, continuing without the 3D scene");
}

let dprCap = lowPower ? 1.25 : 1.5;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 9, 26);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
camera.position.set(0, 0.5, 10);

const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(5, 8, 6);
scene.add(key);
const rim = new THREE.DirectionalLight(0x3b6fe0, 2.1);
rim.position.set(-6, 2, -7);
scene.add(rim);
const ambient = new THREE.AmbientLight(0xffffff, 0.12);
scene.add(ambient);

/* ---------------- The VIEX mark: the real brand geometry, traced from the logo ---------------- */
// Two polygons (normalized, Y-up) traced straight from brand/source/viex-mark-crop.png —
// the hexagonal frame + its diagonal fold, and the small detached sliver inside it. This
// is the actual mark, not a generic placeholder shape.
const MARK_POLYGONS = [
  [
    [0.7953, 0.2202], [0.4698, 0.4434], [0.2837, 0.3318], [0.5969, 0.1116], [0.5969, -0.2388],
    [0.3209, -0.431], [-0.6682, 0.3101], [-0.8016, 0.2171], [-0.7984, -0.3473], [-0.4574, -0.5798],
    [-0.2806, -0.462], [-0.6, -0.2419], [-0.5969, 0.0465], [0.324, -0.6698], [0.7953, -0.3473],
  ],
  [
    [-0.507, 0.4186], [0.3798, -0.2295], [0.3829, -0.0124], [0.3674, 0.0248], [-0.3395, 0.5333],
  ],
];
const MARK_SCALE = 3.1;

const markShapes = MARK_POLYGONS.map(
  (poly) => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x * MARK_SCALE, y * MARK_SCALE))),
);
const ribbonGeo = new THREE.ExtrudeGeometry(markShapes, {
  depth: 0.62,
  bevelEnabled: true,
  bevelThickness: 0.075,
  bevelSize: 0.055,
  bevelSegments: isSmall ? 2 : 4,
  curveSegments: 1,
});
ribbonGeo.center();

// A faceted, near-black badge rather than Yap's smooth metallic gradient — closer to the
// flat geometric logo. Crossfades like the real brand asset: light ink on dark backgrounds,
// dark ink on light backgrounds.
const ribbonMat = new THREE.MeshPhysicalMaterial({ color: 0x15171b, metalness: 0.4, roughness: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.28, envMapIntensity: 1.15 });
const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);

// A crisp blue edge line traces every hard edge — a CAD/blueprint accent, not a paint job,
// so the badge itself can stay monochrome.
const edgeMat = new THREE.LineBasicMaterial({ color: 0x5a94ff, transparent: true, opacity: 0.85 });
const edges = new THREE.LineSegments(new THREE.EdgesGeometry(ribbonGeo, 25), edgeMat);

const markGroup = new THREE.Group();
markGroup.add(ribbon, edges);
scene.add(markGroup);

/* ---------------- Floor field: a grid swept by a rotating scan line, like a radar/CRT readout ---------------- */

const COLS = isSmall ? 30 : lowPower ? 46 : 58;
const ROWS = isSmall ? 40 : 44;
const GAP = isSmall ? 0.46 : 0.44;
const FLOOR_Y = -3.2;
const FIELD_W = 0.16;
const fieldCount = COLS * ROWS;

// Flat square pillars instead of Yap's capsules — a pixel/LED-grid silhouette, in keeping
// with "screens", not soundwaves.
const fieldGeo = new THREE.BoxGeometry(1, 1, 0.68);
const fieldLen = new THREE.InstancedBufferAttribute(new Float32Array(fieldCount), 1);
fieldLen.setUsage(THREE.DynamicDrawUsage);
fieldGeo.setAttribute("aLen", fieldLen);

const fieldMat = new THREE.MeshStandardMaterial({ color: 0x8a8fa0, metalness: 0.75, roughness: 0.4, envMapIntensity: 0.5 });
fieldMat.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute float aLen;")
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float viexCore = clamp(transformed.y, -0.5, 0.5);
      transformed.y = viexCore * aLen + (transformed.y - viexCore) + aLen * 0.5 + 0.5;`,
    );
};
const field = new THREE.InstancedMesh(fieldGeo, fieldMat, fieldCount);
field.frustumCulled = false;

const fAngle = new Float32Array(fieldCount);
const fFall = new Float32Array(fieldCount);
{
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = (c - (COLS - 1) / 2) * GAP;
      const z = 3 - r * GAP;
      dummy.position.set(x, FLOOR_Y, z);
      dummy.scale.set(FIELD_W, FIELD_W, FIELD_W);
      dummy.updateMatrix();
      field.setMatrixAt(n, dummy.matrix);
      const d = Math.hypot(x, (z + 4) * 1.1);
      fAngle[n] = Math.atan2(z + 4, x);
      fFall[n] = Math.exp(-d * 0.1);
      n++;
    }
  }
  field.instanceMatrix.needsUpdate = true;
}
scene.add(field);

/* ---------------- Theme ---------------- */

const THEMES = {
  // mark: light ink on a dark scene, dark ink on a light scene — same rule as the brand's
  // own viex-mark-{light,dark}.png swap.
  dark: { bg: new THREE.Color(0x000000), mark: new THREE.Color(0xeef0f5), field: new THREE.Color(0x8a8fa0), fieldMetal: 0.75, exposure: 1.05, ambient: 0.12 },
  light: { bg: new THREE.Color(0xfafafa), mark: new THREE.Color(0x15171b), field: new THREE.Color(0xc3c7d4), fieldMetal: 0.2, exposure: 1, ambient: 0.55 },
};
let themeTarget = THEMES[document.documentElement.dataset.theme === "light" ? "light" : "dark"];
let themeMix = 1;
const cur = {
  bg: themeTarget.bg.clone(),
  mark: themeTarget.mark.clone(),
  field: themeTarget.field.clone(),
  fieldMetal: themeTarget.fieldMetal,
  exposure: themeTarget.exposure,
  ambient: themeTarget.ambient,
};
let start = { ...cur, bg: cur.bg.clone(), mark: cur.mark.clone(), field: cur.field.clone() };

function applyTheme(k) {
  const lerp = (a, b) => a + (b - a) * k;
  cur.bg.copy(start.bg).lerp(themeTarget.bg, k);
  cur.mark.copy(start.mark).lerp(themeTarget.mark, k);
  cur.field.copy(start.field).lerp(themeTarget.field, k);
  scene.background.copy(cur.bg);
  scene.fog.color.copy(cur.bg);
  ribbonMat.color.copy(cur.mark);
  fieldMat.color.copy(cur.field);
  fieldMat.metalness = lerp(start.fieldMetal, themeTarget.fieldMetal);
  renderer.toneMappingExposure = lerp(start.exposure, themeTarget.exposure);
  ambient.intensity = lerp(start.ambient, themeTarget.ambient);
}
applyTheme(1);

VIEX.setTheme = (name) => {
  start = {
    bg: cur.bg.clone(),
    mark: cur.mark.clone(),
    field: cur.field.clone(),
    fieldMetal: fieldMat.metalness,
    exposure: renderer.toneMappingExposure,
    ambient: ambient.intensity,
  };
  themeTarget = THEMES[name] || THEMES.dark;
  themeMix = reduceMotion ? 1 : 0;
  if (reduceMotion) {
    applyTheme(1);
    requestRender();
  }
};

/* ---------------- Layout, input, scroll ---------------- */

const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
if (window.matchMedia("(hover: hover)").matches) {
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
      if (reduceMotion) requestRender();
    },
    { passive: true },
  );
}

let layout = { x: 2.5, y: 0.7, s: 0.92, z: 0 };
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const aspect = w / h;
  if (aspect > 1.25) layout = { x: 2.5, y: 0.65, s: 0.92, z: 0 };
  else if (aspect > 0.9) layout = { x: 1.4, y: 1.3, s: 0.78, z: 0 };
  // Narrow phones: a fixed scale looks enormous (a narrower aspect == a narrower horizontal
  // FOV, so the same object spans much more of the width) — push it back instead of just
  // shrinking it, so it recedes into the fog as a backdrop rather than crowding the text.
  else layout = { x: 1.1, y: 3.6, s: 0.4, z: -9 };
  requestRender();
}
let resizeRaf = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(resize);
});

const scrollState = { hero: 0, page: 0 };
function readScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  scrollState.hero = Math.min(1, window.scrollY / window.innerHeight);
  scrollState.page = max > 0 ? window.scrollY / max : 0;
  if (reduceMotion) requestRender();
}
window.addEventListener("scroll", readScroll, { passive: true });
readScroll();

/* ---------------- Animation ---------------- */

const easeOutBack = (x) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);

const clockStart = performance.now();
let introStart = -1;

VIEX.startIntro = () => {
  if (introStart < 0) introStart = performance.now();
  requestRender();
};

let perfFrames = 0;
let perfTime = 0;
let lastNow = 0;
let tick = 0;

function render(now) {
  const dt = lastNow ? now - lastNow : 16;
  lastNow = now;

  if (perfFrames < 120 && introStart > 0) {
    perfFrames++;
    perfTime += dt;
    if (perfFrames === 120 && perfTime / 120 > 22 && dprCap > 1) {
      dprCap = 1;
      renderer.setPixelRatio(1);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
  }

  tick++;
  const frameSkip = scrollState.hero >= 1;
  if (frameSkip && tick % 2) return;

  const t = reduceMotion ? 2.4 : (now - clockStart) / 1000;
  const intro = reduceMotion ? 1 : introStart < 0 ? 0 : Math.min(1, (now - introStart) / 1500);

  if (themeMix < 1) {
    themeMix = Math.min(1, themeMix + dt / 650);
    const k = themeMix < 0.5 ? 2 * themeMix * themeMix : 1 - Math.pow(-2 * themeMix + 2, 2) / 2;
    applyTheme(k);
  }

  pointer.x += (pointer.tx - pointer.x) * 0.05;
  pointer.y += (pointer.ty - pointer.y) * 0.05;

  // A rotating scan line sweeps the grid, like a radar or CRT readout checking in on every
  // screen in turn — not reactive to anything external (VIEX has no microphone/input
  // channel, on purpose), and a deliberately different motion signature from a ripple.
  const sweepAngle = t * 0.7;
  const amp = 0.85 * Math.min(1, intro * 1.4);
  const shimmer = 0.04 * Math.min(1, intro * 1.4);
  const arr = fieldLen.array;
  const inv = 1 / FIELD_W;
  for (let n = 0; n < fieldCount; n++) {
    let delta = fAngle[n] - sweepAngle;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // wrap to [-pi, pi]
    const beam = Math.pow(Math.max(0, Math.cos(delta)), 10);
    const h = 0.02 + amp * fFall[n] * beam + (Math.sin(t * 2 + fAngle[n] * 5) * 0.5 + 0.5) * shimmer;
    arr[n] = h * inv;
  }
  fieldLen.needsUpdate = true;

  const grow = easeOutBack(intro);
  markGroup.scale.setScalar(Math.max(0.001, grow) * layout.s * (1 - scrollState.hero * 0.15));
  markGroup.visible = intro > 0;

  const s = scrollState.hero;
  const p = scrollState.page;
  markGroup.position.set(layout.x * (1 - s), layout.y * (1 - s) - s * 0.5, layout.z - s * 7);
  markGroup.rotation.y = pointer.x * 0.4 + p * Math.PI * 2 + (reduceMotion ? 0 : Math.sin(t * 0.3) * 0.1);
  markGroup.rotation.x = pointer.y * 0.16;
  markGroup.rotation.z = -pointer.x * 0.03;

  camera.position.x = pointer.x * 0.6;
  camera.position.y = 0.5 + s * 1.4 - pointer.y * 0.35;
  camera.position.z = 10 - s * 1.5;
  camera.lookAt(0, 0.3 - s * 1.1, 0);
  field.rotation.y = p * 0.6;

  renderer.render(scene, camera);
}

let pending = false;
function requestRender() {
  if (!reduceMotion || pending) return;
  pending = true;
  requestAnimationFrame((now) => {
    pending = false;
    render(now);
  });
}

resize();
renderer.compile(scene, camera);
render(performance.now());
announceReady();

if (!reduceMotion) renderer.setAnimationLoop(render);
