import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MEDITERRANEAN = {
  clay: 0xc4784a,
  clayDeep: 0xa35c36,
  paving: 0xc4a07a,
  limestone: 0xd8c4a8,
  terracotta: 0xb85a32,
  cypress: 0x1f4a28,
  foliage: 0x3a7a3c,
  sea: 0x2a7ca8,
  seaDeep: 0x164e72,
  sand: 0xc9b089,
  cliff: 0xb08968,
  plaster: 0xf0e6d4,
  gold: 0xe8b86a
};

const CLAY_HALF_X = 8.70;
const CLAY_HALF_Z = 17.50;

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.9, metalness: 0.02, ...extra
  });
}

function seeded(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function makeGoldenSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#2a4a7a');
  g.addColorStop(0.28, '#e07a3a');
  g.addColorStop(0.48, '#f0b060');
  g.addColorStop(0.62, '#f6d9a0');
  g.addColorStop(1, '#f3ead2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 18; i++) {
    const x = seeded(i * 3.7) * 1024;
    const y = 90 + seeded(i * 8.1) * 160;
    const rx = 70 + seeded(i * 2.2) * 160;
    const ry = 16 + seeded(i * 5.8) * 22;
    ctx.fillStyle = `rgba(255,236,210,${0.18 + seeded(i) * 0.28})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeClayTexture(D) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(512, 512, 40, 512, 512, 620);
  g.addColorStop(0, '#d08a58');
  g.addColorStop(0.45, '#c4784a');
  g.addColorStop(1, '#a35c36');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2800; i++) {
    const x = seeded(i * 1.7) * 1024;
    const y = seeded(i * 4.3) * 1024;
    ctx.fillStyle = `rgba(90,40,18,${0.015 + seeded(i * 2.1) * 0.04})`;
    ctx.fillRect(x, y, 1 + seeded(i) * 2, 1);
  }
  const wornW = (D.width / (CLAY_HALF_X * 2)) * 1024;
  const wornL = (D.length / (CLAY_HALF_Z * 2)) * 1024;
  const ox = (1024 - wornW) / 2;
  const oy = (1024 - wornL) / 2;
  ctx.fillStyle = 'rgba(196, 150, 96, 0.18)';
  ctx.fillRect(ox, oy, wornW, wornL);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function makeSeaTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#4fb3d4');
  g.addColorStop(0.45, '#2a7ca8');
  g.addColorStop(1, '#164e72');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {
    const y = 40 + seeded(i * 6.2) * 400;
    ctx.strokeStyle = `rgba(220,245,255,${0.05 + seeded(i) * 0.08})`;
    ctx.lineWidth = 1 + seeded(i * 2) * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.04 + i) * 4);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}

function box(group, w, h, d, x, y, z, mat, extra = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (extra.ry) m.rotation.y = extra.ry;
  m.castShadow = extra.cast !== false;
  m.receiveShadow = extra.recv !== false;
  if (extra.name) m.name = extra.name;
  group.add(m);
  return m;
}

function cyl(group, rTop, rBot, h, x, y, z, mat, extra = {}) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, extra.seg || 10),
    mat
  );
  m.position.set(x, y, z);
  m.castShadow = extra.cast !== false;
  m.receiveShadow = extra.recv !== false;
  group.add(m);
  return m;
}

function decorate(obj) {
  obj.userData.arenaDecor = true;
  return obj;
}

function addHorizonFill(scene, opts = {}) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(280, 32, 20),
    new THREE.MeshBasicMaterial({
      map: makeGoldenSkyTexture(),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    })
  );
  sky.name = 'mediterraneanSky';
  decorate(sky);
  scene.add(sky);

  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(260, 64),
    new THREE.MeshStandardMaterial({
      map: makeSeaTexture(),
      roughness: 0.28,
      metalness: 0.18,
      color: MEDITERRANEAN.sea
    })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -8.5;
  sea.name = 'mediterraneanSea';
  sea.receiveShadow = true;
  decorate(sea);
  scene.add(sea);

  let land = null;
  if (!opts.imported) {
    land = new THREE.Mesh(
      new THREE.CircleGeometry(48, 48),
      std(MEDITERRANEAN.sand, { roughness: 1 })
    );
    land.rotation.x = -Math.PI / 2;
    land.position.y = -0.06;
    land.receiveShadow = true;
    land.name = 'mediterraneanLand';
    decorate(land);
    scene.add(land);
  }

  return { sky, sea, land };
}

function addClayFloor(courtGroup, D) {
  const clayTex = makeClayTexture(D);
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(CLAY_HALF_X * 2, CLAY_HALF_Z * 2),
    new THREE.MeshStandardMaterial({
      map: clayTex,
      roughness: 0.96,
      metalness: 0
    })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.004;
  apron.receiveShadow = true;
  apron.name = 'groundOuter';
  apron.userData.mapFloor = true;
  courtGroup.add(apron);

  const courtMat = new THREE.MeshStandardMaterial({
    map: clayTex,
    roughness: 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const courtSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(D.width, D.length),
    courtMat
  );
  courtSurface.rotation.x = -Math.PI / 2;
  courtSurface.position.y = 0.005;
  courtSurface.receiveShadow = true;
  courtSurface.name = 'courtSurface';
  courtSurface.userData.mapFloor = true;
  courtGroup.add(courtSurface);

  const paving = new THREE.Mesh(
    new THREE.RingGeometry(9.05, 21.5, 64),
    std(MEDITERRANEAN.paving, { roughness: 0.93 })
  );
  paving.rotation.x = -Math.PI / 2;
  paving.position.y = -0.012;
  paving.receiveShadow = true;
  paving.name = 'mediterraneanPaving';
  paving.userData.mapFloor = true;
  courtGroup.add(paving);

  return { apron, courtSurface, paving };
}

function addNearDressing(root) {
  const plaster = std(MEDITERRANEAN.plaster, { roughness: 0.84 });
  const terra = std(MEDITERRANEAN.terracotta, { roughness: 0.78 });
  const lime = std(MEDITERRANEAN.limestone, { roughness: 0.88 });
  const bark = std(0x5a3a22, { roughness: 0.95 });
  const leaf = std(MEDITERRANEAN.cypress, { roughness: 0.8 });
  const pine = std(MEDITERRANEAN.foliage, { roughness: 0.82 });

  function villa(x, z, rot, w, d, h) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    box(g, w, h, d, 0, h / 2, 0, plaster);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.6, 4), terra);
    roof.position.y = h + 0.7;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    box(g, 0.08, 1.1, 0.7, w * 0.22, 1.4, d / 2 + 0.04, std(0x6a3a18, { roughness: 0.5 }));
    box(g, 0.08, 1.1, 0.7, -w * 0.22, 1.4, d / 2 + 0.04, std(0x6a3a18, { roughness: 0.5 }));
    root.add(g);
  }

  villa(-28, -8, 0.4, 9.5, 7.2, 4.6);
  villa(-26, 10, 0.15, 7.4, 6.0, 3.8);
  villa(30, -6, -0.55, 10.2, 7.6, 5.0);
  villa(27, 14, -0.2, 6.8, 5.8, 3.6);
  villa(-22, 26, 0.7, 8.0, 6.4, 4.2);
  villa(18, -28, -0.3, 7.2, 6.2, 3.9);

  function cypress(x, z, h) {
    cyl(root, 0.16, 0.22, 1.1, x, 0.55, z, bark, { seg: 8 });
    cyl(root, 0.18, 0.72, h, x, 1.1 + h / 2, z, leaf, { seg: 9 });
  }
  const trees = [
    [-12.4, 20.8, 6.2], [12.6, 21.2, 6.8], [-13.1, -21.0, 6.4], [13.0, -20.6, 7.0],
    [-16.5, 8.2, 5.6], [16.8, 7.4, 5.8], [-16.2, -7.6, 5.5], [16.4, -8.4, 6.0],
    [-22, 0, 7.4], [23.5, 2, 7.8], [-10, 28, 6.0], [8, 29, 5.4],
    [-8, -29, 5.8], [11, -30, 6.3], [0, 32, 7.2], [0, -33, 6.6]
  ];
  for (const [x, z, h] of trees) cypress(x, z, h);

  function pineTree(x, z) {
    cyl(root, 0.22, 0.28, 1.6, x, 0.8, z, bark, { seg: 8 });
    cyl(root, 0.2, 2.4, 2.2, x, 2.6, z, pine, { seg: 10 });
    cyl(root, 0.15, 1.7, 1.6, x, 4.0, z, pine, { seg: 10 });
  }
  pineTree(-20, 18);
  pineTree(21, 19);
  pineTree(-19, -18);
  pineTree(20, -20);

  // Low limestone retaining walls just outside runoff so the apron never
  // drops into empty space, without entering the playable envelope.
  const wallH = 0.85;
  box(root, 22, wallH, 0.42, 0, wallH / 2, 22.4, lime, { name: 'retainN' });
  box(root, 22, wallH, 0.42, 0, wallH / 2, -22.4, lime, { name: 'retainS' });
  box(root, 0.42, wallH, 40, 14.2, wallH / 2, 0, lime, { name: 'retainE' });
  box(root, 0.42, wallH, 40, -14.2, wallH / 2, 0, lime, { name: 'retainW' });

  // Distant cliffs so orbit-cam never frames a void.
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const r = 70 + seeded(i * 9) * 28;
    const h = 8 + seeded(i * 3) * 14;
    const w = 10 + seeded(i * 5) * 12;
    box(
      root,
      w, h, w * 0.7,
      Math.sin(ang) * r, h / 2 - 2.5, Math.cos(ang) * r,
      std(MEDITERRANEAN.cliff, { roughness: 0.97 }),
      { ry: ang }
    );
  }
}

function hideGameplayDuplicates(root) {
  const hide = [];
  root.traverse((o) => {
    const n = o.name || '';
    if (
      n.startsWith('Court_Baseline') ||
      n.startsWith('Court_Doubles') ||
      n.startsWith('Court_Singles') ||
      n.startsWith('Court_Service') ||
      n.startsWith('Court_Centre') ||
      n.startsWith('SM_Line_') ||
      n.startsWith('SM_Net') ||
      n.startsWith('Net_Post') ||
      n.startsWith('Net_Centre') ||
      n.startsWith('Net_Head') ||
      n.startsWith('Net_Mesh')
    ) {
      hide.push(o);
    }
  });
  for (const o of hide) o.visible = false;
}

function retuneMaterial(m) {
  if (!m) return;
  if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
  if (m.transparent || m.alphaTest > 0) m.side = THREE.DoubleSide;
  const n = `${m.name || ''}`.toLowerCase();
  if (n.includes('ocean') || n.includes('water')) {
    m.color = new THREE.Color(MEDITERRANEAN.sea);
    m.roughness = 0.34;
    m.metalness = 0.06;
    m.opacity = 1;
    m.transparent = false;
    if ('transmission' in m) m.transmission = 0;
    if ('ior' in m) m.ior = 1.33;
  }
  if (n.includes('limestone') || n.includes('mountain') || n.includes('cliff')) {
    m.roughness = 0.97;
    m.metalness = 0;
  }
}

function enableShadows(root, lowDetail) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = !lowDetail;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) retuneMaterial(mat);
  });
}

function alignImportedCourt(root) {
  const clay = root.getObjectByName('SM_Court_Clay_Slab')
    || root.getObjectByName('SM_Court_PlaySurface');
  if (!clay) return;
  clay.updateWorldMatrix(true, true);
  const box3 = new THREE.Box3().setFromObject(clay);
  if (!Number.isFinite(box3.max.y)) return;
  root.position.y -= box3.max.y;
}

function hideBuriedMeshes(root) {
  const box3 = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    box3.setFromObject(o);
    if (Number.isFinite(box3.max.y) && box3.max.y < -0.6) o.visible = false;
  });
}

let cachedGltf = null;
let cachedGltfPromise = null;

export function preloadMediterraneanArena(loader) {
  if (cachedGltf) return Promise.resolve(cachedGltf);
  if (cachedGltfPromise) return cachedGltfPromise;
  const gltfLoader = loader || new GLTFLoader();
  cachedGltfPromise = gltfLoader.loadAsync('./assets/mediterranean-arena.glb')
    .then((gltf) => {
      cachedGltf = gltf;
      return gltf;
    })
    .catch((err) => {
      cachedGltfPromise = null;
      console.warn('Mediterranean GLB missing, using dressed fallback', err);
      return null;
    });
  return cachedGltfPromise;
}

export function applyMediterraneanAtmosphere(scene, renderer, controls) {
  scene.background = new THREE.Color(0xe7c896);
  scene.fog = new THREE.Fog(0xe7c896, 140, 340);
  renderer.toneMappingExposure = 1.05;
  if (controls) {
    controls.maxDistance = 160;
    controls.minDistance = 5;
  }
}

export function createMediterraneanLights(s) {
  const hemi = new THREE.HemisphereLight(0xffe2b0, 0x6a4a32, 1.15);
  hemi.name = 'mediterraneanHemi';
  hemi.userData.arenaDecor = true;
  s.add(hemi);

  const amb = new THREE.AmbientLight(0xffd9a8, 0.28);
  amb.name = 'mediterraneanAmb';
  amb.userData.arenaDecor = true;
  s.add(amb);

  const sun = new THREE.DirectionalLight(0xffc078, 1.18);
  sun.position.set(-28, 22, 16);
  sun.castShadow = true;
  const touch = (() => {
    try {
      return window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  })();
  sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0004;
  sun.name = 'mediterraneanSun';
  sun.userData.arenaDecor = true;
  s.add(sun);

  const fill = new THREE.DirectionalLight(0x9ec7ff, 0.32);
  fill.position.set(18, 14, -12);
  fill.name = 'mediterraneanFill';
  fill.userData.arenaDecor = true;
  s.add(fill);

  const bounce = new THREE.PointLight(0xffd09a, 0.45, 80, 1.8);
  bounce.position.set(0, 10, 0);
  bounce.name = 'mediterraneanBounce';
  bounce.userData.arenaDecor = true;
  s.add(bounce);
}

export function createMediterraneanArena(scene, courtGroup, D, opts = {}) {
  const lowDetail = !!(opts && opts.lowDetail);
  addClayFloor(courtGroup, D);

  const root = new THREE.Group();
  root.name = 'mediterraneanArena';
  decorate(root);

  const gltf = opts.gltf || cachedGltf;
  let imported = false;
  if (gltf && gltf.scene) {
    const model = gltf.scene.clone(true);
    model.name = 'mediterraneanGltf';
    hideGameplayDuplicates(model);
    enableShadows(model, lowDetail);
    alignImportedCourt(model);
    hideBuriedMeshes(model);
    root.add(model);
    imported = true;
  }
  const horizon = addHorizonFill(scene, { imported });

  // Always dress the far field so orbit / follow-cam never frames a hole.
  // Near villas/trees only when the GLB did not load.
  if (!imported) addNearDressing(root);
  else {
    // Extra cypress just outside runoff in case the import leaves a gap
    // along the apron edge.
    const leaf = std(MEDITERRANEAN.cypress, { roughness: 0.8 });
    const bark = std(0x5a3a22, { roughness: 0.95 });
    for (const [x, z] of [[-12.8, 21.6], [12.8, 21.6], [-12.8, -21.6], [12.8, -21.6]]) {
      cyl(root, 0.16, 0.2, 1.0, x, 0.5, z, bark, { seg: 8 });
      cyl(root, 0.2, 0.7, 6.2, x, 4.1, z, leaf, { seg: 9 });
    }
  }

  scene.add(root);

  return {
    root,
    imported,
    horizon,
    id: 'mediterranean',
    syncScore() {}
  };
}
