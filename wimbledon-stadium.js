import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// Centre Court palette sampled from the reference photos.
export const WIMBLEDON = {
  grassA: 0x4a7c32,
  grassB: 0x5e9140,
  grassWorn: 0x8a9a4a,
  grassDirt: 0xb39b5c,
  runoff: 0x3f6d2c,
  seat: 0x003820,
  seatHi: 0x004a2a,
  wall: 0x003318,
  wallHi: 0x004422,
  purple: 0x4c1d77,
  roof: 0xf3f3f0,
  steel: 0xe6e6e2,
  rail: 0x3a3d42,
  concrete: 0xc6b9a4,
  step: 0xb7aa94,
  tape: 0xffffff,
  gold: 0xc9a227
};

const INNER_HX = 14.0;
const INNER_HZ = 19.5;
const WALL_H = 1.18;
const WALL_T = 0.42;
const ROW_DEPTH = 0.82;
const ROW_RISE = 0.44;
const SEAT_STEP = 0.50;
const LOWER_ROWS = 16;
const UPPER_ROWS = 12;
const WALK_W = 2.55;
const CORNER_R0 = 3.6;

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.88, metalness: 0.04, ...extra
  });
}

function box(group, w, h, d, x, y, z, mat, extra = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (extra.rx) m.rotation.x = extra.rx;
  if (extra.ry) m.rotation.y = extra.ry;
  if (extra.rz) m.rotation.z = extra.rz;
  m.castShadow = extra.cast !== false;
  m.receiveShadow = extra.recv !== false;
  if (extra.name) m.name = extra.name;
  group.add(m);
  return m;
}

function cyl(group, rTop, rBot, h, x, y, z, mat, extra = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, extra.seg || 12), mat);
  m.position.set(x, y, z);
  if (extra.rx) m.rotation.x = extra.rx;
  if (extra.ry) m.rotation.y = extra.ry;
  if (extra.rz) m.rotation.z = extra.rz;
  m.castShadow = extra.cast !== false;
  m.receiveShadow = extra.recv !== false;
  group.add(m);
  return m;
}

function seeded(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#5a9fd4');
  g.addColorStop(0.38, '#7eb7e2');
  g.addColorStop(0.62, '#b9d6ee');
  g.addColorStop(1, '#e4eef6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 28; i++) {
    const x = seeded(i * 3.1) * 1024;
    const y = 70 + seeded(i * 7.7) * 220;
    const rx = 60 + seeded(i * 2.4) * 140;
    const ry = 18 + seeded(i * 5.2) * 28;
    ctx.fillStyle = `rgba(255,255,255,${0.28 + seeded(i) * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + rx * 0.35, y - ry * 0.45, rx * 0.55, ry * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeUnionJack() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#012169';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 28;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(256, 128); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(256, 0); ctx.lineTo(0, 128); ctx.stroke();
  ctx.strokeStyle = '#c8102e';
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(256, 128); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(256, 0); ctx.lineTo(0, 128); ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 36;
  ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 128); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(256, 64); ctx.stroke();
  ctx.strokeStyle = '#c8102e';
  ctx.lineWidth = 18;
  ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 128); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(256, 64); ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWimbledonBadge() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.fillStyle = '#003318';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#c9a227';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(128, 128, 102, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#6b2fa0';
  ctx.stroke();
  ctx.save();
  ctx.translate(128, 122);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#e8d48a';
  ctx.fillStyle = 'rgba(232,212,138,0.15)';
  for (const ang of [-0.55, 0.55]) {
    ctx.save();
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -70);
    ctx.lineTo(0, 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 48, 22, 28, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = '#e8d48a';
  ctx.font = 'bold 18px Times New Roman, serif';
  ctx.textAlign = 'center';
  ctx.fillText('THE CHAMPIONSHIPS', 128, 28);
  ctx.font = 'bold 22px Times New Roman, serif';
  ctx.fillText('WIMBLEDON', 128, 232);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeWimbledonFlag(badge) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#003820';
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = '#4c1d77';
  ctx.fillRect(0, 0, 256, 14);
  ctx.fillRect(0, 146, 256, 14);
  if (badge && badge.image) ctx.drawImage(badge.image, 78, 28, 100, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFabricTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  for (let x = 0; x < 256; x++) {
    const k = 0.88 + 0.12 * Math.sin(x * 0.22);
    const v = Math.floor(236 * k);
    ctx.fillStyle = `rgb(${v},${v},${Math.floor(v * 0.98)})`;
    ctx.fillRect(x, 0, 1, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTowelTexture(a, b) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, 64, 18);
  ctx.fillRect(0, 46, 64, 18);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeWimbledonGrassTexture(floorW, floorL, D) {
  const ppm = 36;
  const w = Math.max(8, Math.round(floorW * ppm));
  const h = Math.max(8, Math.round(floorL * ppm));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const stripeW = 1.28;
  const hl = D.halfLength;
  const hw = D.halfWidth;
  const hs = D.halfSingles;

  function wear(x, z) {
    let v = 0;
    for (const bz of [hl, -hl]) {
      const dz = (z - bz) / 1.05;
      const dx = x / 5.6;
      v = Math.max(v, Math.exp(-(dx * dx + dz * dz)));
      v = Math.max(v, 0.9 * Math.exp(-((x / 1.25) ** 2 + ((z - bz) / 0.62) ** 2)));
      v = Math.max(v, 0.55 * Math.exp(-(((x - hs * 0.55) / 1.7) ** 2 + ((z - bz) / 0.85) ** 2)));
      v = Math.max(v, 0.55 * Math.exp(-(((x + hs * 0.55) / 1.7) ** 2 + ((z - bz) / 0.85) ** 2)));
      const behind = bz > 0 ? z > bz : z < bz;
      if (behind) {
        const zb = bz > 0 ? z - bz : bz - z;
        v = Math.max(v, 0.42 * Math.exp(-((x / 2.2) ** 2 + ((zb - 0.7) / 1.1) ** 2)));
      }
    }
    v = Math.max(v, 0.22 * Math.exp(-((x / 0.55) ** 2 + ((z - D.serviceDistance) / 0.7) ** 2)));
    v = Math.max(v, 0.22 * Math.exp(-((x / 0.55) ** 2 + ((z + D.serviceDistance) / 0.7) ** 2)));
    const inCourt = Math.abs(x) <= hw + 0.2 && Math.abs(z) <= hl + 0.2;
    return inCourt ? Math.min(1, v) : v * 0.15;
  }

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = (px / w - 0.5) * floorW;
      const z = (0.5 - py / h) * floorL;
      const n = seeded(px * 0.37 + py * 1.91) * 0.16 + seeded(px * 2.1 - py * 0.7) * 0.08;
      const stripe = (Math.floor((x + 40) / stripeW) & 1) === 0;
      let r = stripe ? 68 : 82;
      let g = stripe ? 122 : 138;
      let b = stripe ? 44 : 52;
      if (Math.abs(x) > hw + 0.08 || Math.abs(z) > hl + 0.08) {
        r -= 10; g -= 8; b -= 6;
      }
      const wv = wear(x, z);
      if (wv > 0.04) {
        r = r + (168 - r) * wv;
        g = g + (152 - g) * wv * 0.85;
        b = b + (72 - b) * wv * 0.7;
      }
      r = Math.max(0, Math.min(255, r + n * 40));
      g = Math.max(0, Math.min(255, g + n * 36));
      b = Math.max(0, Math.min(255, b + n * 18));
      const i = (py * w + px) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function makeScoreboardTexture(state) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 420;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b0f0c';
  ctx.fillRect(0, 0, 1024, 420);
  ctx.fillStyle = '#003820';
  ctx.fillRect(0, 0, 1024, 48);
  ctx.fillStyle = '#c9a227';
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THE CHAMPIONSHIPS  ·  CENTRE COURT', 28, 34);
  ctx.fillStyle = '#8ad06a';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('LIVE', 990, 34);

  const pName = (state && state.pName) || 'YOU';
  const aName = (state && state.aName) || 'CPU';
  const pS = state ? state.pS : 0;
  const aS = state ? state.aS : 0;
  const pG = state ? state.pG : 0;
  const aG = state ? state.aG : 0;
  const pPts = (state && state.pPts) || '0';
  const aPts = (state && state.aPts) || '0';

  ctx.fillStyle = '#1a1f1c';
  ctx.fillRect(20, 70, 984, 140);
  ctx.fillRect(20, 220, 984, 140);

  function row(y, name, sets, games, pts, accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(20, y, 10, 140);
    ctx.fillStyle = '#f4f4f0';
    ctx.font = 'bold 52px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(name, 50, y + 88);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d4c31a';
    ctx.font = 'bold 64px Arial, sans-serif';
    ctx.fillText(String(sets), 620, y + 92);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(games), 760, y + 92);
    ctx.fillStyle = '#8ad06a';
    ctx.fillText(String(pts), 910, y + 92);
  }
  row(70, pName, pS, pG, pPts, '#c9a227');
  row(220, aName, aS, aG, aPts, '#4c1d77');

  ctx.fillStyle = '#667066';
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SETS', 620, 400);
  ctx.fillText('GAMES', 760, 400);
  ctx.fillText('POINTS', 910, 400);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeSeatGeometry() {
  const pan = new THREE.BoxGeometry(0.44, 0.07, 0.38);
  pan.translate(0, 0.035, -0.02);
  const back = new THREE.BoxGeometry(0.44, 0.50, 0.06);
  back.translate(0, 0.32, 0.16);
  const merged = BufferGeometryUtils.mergeGeometries([pan, back]);
  return merged || pan;
}

function roundedRectLoop(halfX, halfZ, radius, spacing, fn) {
  const r = Math.min(radius, halfX - 0.2, halfZ - 0.2);
  const straightX = Math.max(0.01, 2 * (halfX - r));
  const straightZ = Math.max(0.01, 2 * (halfZ - r));
  const arc = 0.5 * Math.PI * r;
  const lens = [straightX, arc, straightZ, arc, straightX, arc, straightZ, arc];
  const total = lens.reduce((a, b) => a + b, 0);
  const n = Math.max(8, Math.round(total / spacing));
  for (let i = 0; i < n; i++) {
    let d = (i / n) * total;
    let seg = 0;
    while (d > lens[seg] && seg < lens.length - 1) {
      d -= lens[seg];
      seg++;
    }
    const t = d / lens[seg];
    let x = 0;
    let z = 0;
    let ang = 0;
    switch (seg) {
      case 0:
        x = -halfX + r + t * straightX;
        z = halfZ;
        break;
      case 1: {
        const a = Math.PI / 2 * (1 - t);
        x = halfX - r + Math.cos(a) * r;
        z = halfZ - r + Math.sin(a) * r;
        break;
      }
      case 2:
        x = halfX;
        z = halfZ - r - t * straightZ;
        break;
      case 3: {
        const a = -t * Math.PI / 2;
        x = halfX - r + Math.cos(a) * r;
        z = -halfZ + r + Math.sin(a) * r;
        break;
      }
      case 4:
        x = halfX - r - t * straightX;
        z = -halfZ;
        break;
      case 5: {
        const a = -Math.PI / 2 - t * Math.PI / 2;
        x = -halfX + r + Math.cos(a) * r;
        z = -halfZ + r + Math.sin(a) * r;
        break;
      }
      case 6:
        x = -halfX;
        z = -halfZ + r + t * straightZ;
        break;
      case 7: {
        const a = Math.PI - t * Math.PI / 2;
        x = -halfX + r + Math.cos(a) * r;
        z = halfZ - r + Math.sin(a) * r;
        break;
      }
      default: {
        const _exhaustive = seg;
        void _exhaustive;
        break;
      }
    }
    ang = Math.atan2(x, z) + Math.PI;
    fn(x, z, ang, i, n);
  }
}

function addGrassFloor(courtGroup, D) {
  const floorW = INNER_HX * 2 + 0.2;
  const floorL = INNER_HZ * 2 + 0.2;
  const grassTex = makeWimbledonGrassTexture(floorW, floorL, D);
  const grassMat = new THREE.MeshStandardMaterial({
    map: grassTex,
    roughness: 0.94,
    metalness: 0.0
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorL), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  ground.name = 'groundOuter';
  courtGroup.add(ground);

  const courtTex = grassTex.clone();
  courtTex.colorSpace = THREE.SRGBColorSpace;
  courtTex.offset.set(0.5 - D.width / (2 * floorW), 0.5 - D.length / (2 * floorL));
  courtTex.repeat.set(D.width / floorW, D.length / floorL);
  courtTex.needsUpdate = true;
  const courtMat = new THREE.MeshStandardMaterial({
    map: courtTex,
    roughness: 0.94,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const courtSurface = new THREE.Mesh(new THREE.PlaneGeometry(D.width, D.length), courtMat);
  courtSurface.rotation.x = -Math.PI / 2;
  courtSurface.position.y = 0.005;
  courtSurface.receiveShadow = true;
  courtSurface.name = 'courtSurface';
  courtGroup.add(courtSurface);
}

function addInnerWalls(root, badgeTex) {
  const wallMat = std(WIMBLEDON.wall, { roughness: 0.78 });
  const capMat = std(WIMBLEDON.purple, { roughness: 0.55, metalness: 0.15 });
  const walkMat = std(0x0d3a24, { roughness: 0.7 });

  const h = WALL_H;
  const t = WALL_T;
  const hx = INNER_HX + t / 2;
  const hz = INNER_HZ + t / 2;
  box(root, INNER_HX * 2 + t * 2, h, t, 0, h / 2, hz, wallMat, { name: 'wallN' });
  box(root, INNER_HX * 2 + t * 2, h, t, 0, h / 2, -hz, wallMat, { name: 'wallS' });
  box(root, t, h, INNER_HZ * 2, hx, h / 2, 0, wallMat, { name: 'wallE' });
  box(root, t, h, INNER_HZ * 2, -hx, h / 2, 0, wallMat, { name: 'wallW' });
  box(root, INNER_HX * 2 + t * 2, 0.07, t + 0.04, 0, h + 0.02, hz, capMat);
  box(root, INNER_HX * 2 + t * 2, 0.07, t + 0.04, 0, h + 0.02, -hz, capMat);
  box(root, t + 0.04, 0.07, INNER_HZ * 2, hx, h + 0.02, 0, capMat);
  box(root, t + 0.04, 0.07, INNER_HZ * 2, -hx, h + 0.02, 0, capMat);

  box(root, INNER_HX * 2, 0.06, 0.95, 0, 0.03, INNER_HZ - 0.48, walkMat, { cast: false });
  box(root, INNER_HX * 2, 0.06, 0.95, 0, 0.03, -(INNER_HZ - 0.48), walkMat, { cast: false });
  box(root, 0.95, 0.06, INNER_HZ * 2 - 1.9, INNER_HX - 0.48, 0.03, 0, walkMat, { cast: false });
  box(root, 0.95, 0.06, INNER_HZ * 2 - 1.9, -(INNER_HX - 0.48), 0.03, 0, walkMat, { cast: false });

  const logoMat = new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true });
  for (const z of [INNER_HZ - 0.02, -(INNER_HZ - 0.02)]) {
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), logoMat);
    logo.position.set(0, 0.72, z > 0 ? z - 0.22 : z + 0.22);
    logo.rotation.y = z > 0 ? Math.PI : 0;
    root.add(logo);
  }
}

function addSeating(root, opts) {
  const low = !!(opts && opts.lowDetail);
  const lowerRows = low ? 7 : LOWER_ROWS;
  const upperRows = low ? 5 : UPPER_ROWS;
  const step = low ? 0.95 : SEAT_STEP;
  const seatGeo = makeSeatGeometry();
  const seatMat = std(WIMBLEDON.seat, { roughness: 0.62, metalness: 0.08 });
  const terraceMat = std(0x012a18, { roughness: 0.9 });
  const aisleMat = std(WIMBLEDON.step, { roughness: 0.86 });
  const railMat = std(0xd8d8d4, { metalness: 0.35, roughness: 0.4 });

  const poses = [];
  const terraces = new THREE.Group();
  terraces.name = 'terraces';
  root.add(terraces);

  function rowRing(row, y, hx, hz, radius, isLower) {
    box(terraces, hx * 2 + 0.6, 0.16, ROW_DEPTH + 0.05, 0, y - 0.05, hz, terraceMat, { cast: false });
    box(terraces, hx * 2 + 0.6, 0.16, ROW_DEPTH + 0.05, 0, y - 0.05, -hz, terraceMat, { cast: false });
    box(terraces, ROW_DEPTH + 0.05, 0.16, hz * 2, hx, y - 0.05, 0, terraceMat, { cast: false });
    box(terraces, ROW_DEPTH + 0.05, 0.16, hz * 2, -hx, y - 0.05, 0, terraceMat, { cast: false });

    roundedRectLoop(hx, hz, radius, step, (x, z, ang, i) => {
      const aisle = (i % 16) < 2;
      if (aisle) {
        if (!low && (i % 16) === 0 && row % 2 === 0) {
          const inward = new THREE.Vector3(-x, 0, -z).normalize();
          box(
            terraces, 0.72, 0.08, ROW_DEPTH * 0.9,
            x + inward.x * 0.1, y - 0.02, z + inward.z * 0.1,
            aisleMat, { cast: false, ry: Math.atan2(x, z) }
          );
        }
        return;
      }
      if (isLower && z < -24 && Math.abs(x) < 6.8 && row >= 8) return;
      if (!isLower && z < -28 && Math.abs(x) < 7.5 && row < 6) return;
      poses.push({ x, y, z, ang });
    });
  }

  for (let r = 0; r < lowerRows; r++) {
    const hx = INNER_HX + WALL_T + (r + 0.55) * ROW_DEPTH;
    const hz = INNER_HZ + WALL_T + (r + 0.55) * ROW_DEPTH;
    const y = WALL_H + 0.12 + r * ROW_RISE;
    rowRing(r, y, hx, hz, CORNER_R0 + r * 0.18, true);
  }

  const lowerDepth = lowerRows * ROW_DEPTH;
  const walkY = WALL_H + 0.12 + lowerRows * ROW_RISE + 0.2;
  const walkHx = INNER_HX + WALL_T + lowerDepth + WALK_W * 0.5;
  const walkHz = INNER_HZ + WALL_T + lowerDepth + WALK_W * 0.5;
  box(root, walkHx * 2 + 1.2, 0.18, WALK_W, 0, walkY, walkHz, std(0x1a1c1e, { roughness: 0.8 }), { cast: false });
  box(root, walkHx * 2 + 1.2, 0.18, WALK_W, 0, walkY, -walkHz, std(0x1a1c1e, { roughness: 0.8 }), { cast: false });
  box(root, WALK_W, 0.18, walkHz * 2, walkHx, walkY, 0, std(0x1a1c1e, { roughness: 0.8 }), { cast: false });
  box(root, WALK_W, 0.18, walkHz * 2, -walkHx, walkY, 0, std(0x1a1c1e, { roughness: 0.8 }), { cast: false });

  for (let i = 0; i < 18; i++) {
    const t = (i / 18) * Math.PI * 2;
    const rx = walkHx * 0.92 * Math.cos(t);
    const rz = walkHz * 0.92 * Math.sin(t);
    if (Math.abs(rz) > walkHz * 0.88 && Math.abs(rx) < 8) continue;
    cyl(root, 0.03, 0.03, 0.95, rx, walkY + 0.55, rz, railMat, { seg: 6, cast: false });
  }

  const fasciaMat = std(WIMBLEDON.wallHi);
  const fasciaHx = INNER_HX + WALL_T + lowerDepth + 0.1;
  const fasciaHz = INNER_HZ + WALL_T + lowerDepth + 0.1;
  const fasciaH = 1.15;
  box(root, fasciaHx * 2, fasciaH, 0.28, 0, walkY - fasciaH / 2, fasciaHz - WALK_W * 0.5, fasciaMat);
  box(root, fasciaHx * 2, fasciaH, 0.28, 0, walkY - fasciaH / 2, -(fasciaHz - WALK_W * 0.5), fasciaMat);
  box(root, 0.28, fasciaH, fasciaHz * 2, fasciaHx - WALK_W * 0.5, walkY - fasciaH / 2, 0, fasciaMat);
  box(root, 0.28, fasciaH, fasciaHz * 2, -(fasciaHx - WALK_W * 0.5), walkY - fasciaH / 2, 0, fasciaMat);

  const upperBase = INNER_HX + WALL_T + lowerDepth + WALK_W;
  const upperBaseZ = INNER_HZ + WALL_T + lowerDepth + WALK_W;
  for (let r = 0; r < upperRows; r++) {
    const hx = upperBase + (r + 0.55) * ROW_DEPTH;
    const hz = upperBaseZ + (r + 0.55) * ROW_DEPTH;
    const y = walkY + 0.55 + r * (ROW_RISE + 0.02);
    rowRing(r, y, hx, hz, CORNER_R0 + 4 + r * 0.2, false);
  }

  const inst = new THREE.InstancedMesh(seatGeo, seatMat, Math.max(1, poses.length));
  inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  inst.castShadow = false;
  inst.receiveShadow = true;
  inst.name = 'seats';
  const dummy = new THREE.Object3D();
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.lookAt(0, p.y, 0);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.computeBoundingSphere();
  inst.computeBoundingBox();
  root.add(inst);

  return {
    walkY,
    lowerDepth,
    upperTopY: walkY + 0.55 + upperRows * (ROW_RISE + 0.02),
    outerHX: upperBase + upperRows * ROW_DEPTH,
    outerHZ: upperBaseZ + upperRows * ROW_DEPTH
  };
}

function addBowlShell(root, dims) {
  const shell = std(0x002616, { roughness: 0.92 });
  const h = dims.upperTopY + 1.2;
  box(root, dims.outerHX * 2 + 2.4, h, 1.4, 0, h / 2, dims.outerHZ + 0.5, shell, { cast: false });
  box(root, dims.outerHX * 2 + 2.4, h, 1.4, 0, h / 2, -(dims.outerHZ + 0.5), shell, { cast: false });
  box(root, 1.4, h, dims.outerHZ * 2 + 2.4, dims.outerHX + 0.5, h / 2, 0, shell, { cast: false });
  box(root, 1.4, h, dims.outerHZ * 2 + 2.4, -(dims.outerHX + 0.5), h / 2, 0, shell, { cast: false });
}

function addRoof(root, dims) {
  const { outerHX, outerHZ, upperTopY } = dims;
  const roofY = upperTopY + 6.2;
  const openHX = 16.5;
  const openHZ = 21.5;
  const steel = std(WIMBLEDON.steel, { metalness: 0.55, roughness: 0.32 });
  const white = std(WIMBLEDON.roof, { metalness: 0.22, roughness: 0.45 });
  const fabricTex = makeFabricTexture();
  const fabric = new THREE.MeshStandardMaterial({
    map: fabricTex,
    color: 0xf4f4f1,
    roughness: 0.78,
    metalness: 0.02,
    side: THREE.DoubleSide
  });
  const rail = std(WIMBLEDON.rail, { metalness: 0.6, roughness: 0.4 });

  const cover = new THREE.Group();
  cover.name = 'roofCover';
  const ringH = 0.45;
  const coverY = roofY - 0.8;
  box(cover, outerHX * 2 + 4, ringH, outerHZ - openHZ, 0, coverY, (outerHZ + openHZ) / 2 + 0.2, fabric, { cast: false });
  box(cover, outerHX * 2 + 4, ringH, outerHZ - openHZ, 0, coverY, -(outerHZ + openHZ) / 2 - 0.2, fabric, { cast: false });
  const sideW = outerHX - openHX + 2;
  box(cover, sideW, ringH, openHZ * 2, (outerHX + openHX) / 2 + 1, coverY, 0, fabric, { cast: false });
  box(cover, sideW, ringH, openHZ * 2, -((outerHX + openHX) / 2 + 1), coverY, 0, fabric, { cast: false });
  root.add(cover);

  function beam(x0, y0, z0, x1, y1, z1, r) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    const m = new THREE.Mesh(new THREE.BoxGeometry(r, r, len), steel);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.lookAt(x1, y1, z1);
    m.castShadow = true;
    root.add(m);
  }

  const lipY = roofY + 1.8;
  for (let s = -1; s <= 1; s += 2) {
    for (let i = -5; i <= 5; i++) {
      const z = i * 3.9;
      const xLip = s * openHX;
      beam(xLip, roofY - 0.2, z - 1.6, xLip + s * 3.4, lipY, z, 0.28);
      beam(xLip, roofY - 0.2, z + 1.6, xLip + s * 3.4, lipY, z, 0.28);
      beam(xLip + s * 3.4, lipY, z, xLip + s * (outerHX - openHX) * 0.35, roofY + 0.4, z, 0.22);
    }
  }
  for (let s = -1; s <= 1; s += 2) {
    for (let i = -3; i <= 3; i++) {
      const x = i * 4.4;
      const zLip = s * openHZ;
      beam(x - 1.5, roofY - 0.2, zLip, x, lipY, zLip + s * 3.2, 0.28);
      beam(x + 1.5, roofY - 0.2, zLip, x, lipY, zLip + s * 3.2, 0.28);
    }
  }

  box(root, openHX * 2 + 1.2, 0.22, 0.55, 0, roofY + 0.15, openHZ, white);
  box(root, openHX * 2 + 1.2, 0.22, 0.55, 0, roofY + 0.15, -openHZ, white);
  box(root, 0.55, 0.22, openHZ * 2 + 1.2, openHX, roofY + 0.15, 0, white);
  box(root, 0.55, 0.22, openHZ * 2 + 1.2, -openHX, roofY + 0.15, 0, white);

  for (const s of [-1, 1]) {
    box(root, 0.42, 0.28, openHZ * 2 + 6, s * (openHX + 0.6), roofY + 0.55, 0, rail);
    box(root, 0.18, 0.18, openHZ * 2 + 8, s * (openHX + 1.15), roofY + 0.85, 0, rail);
  }

  for (const s of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const z = s * (openHZ + 1.2 + k * 0.42);
      const fold = new THREE.Mesh(new THREE.BoxGeometry(openHX * 2 - 1, 0.12, 0.38), fabric);
      fold.position.set(0, roofY - 0.15 - k * 0.05, z);
      fold.rotation.x = s * 0.35;
      root.add(fold);
    }
  }

  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xf2f0e4, emissive: 0xe8ddb0, emissiveIntensity: 0.55, roughness: 0.4
  });
  for (let s = -1; s <= 1; s += 2) {
    for (let i = -4; i <= 4; i++) {
      box(root, 1.35, 0.22, 0.55, s * (openHX - 0.9), roofY - 0.55, i * 4.4, lightMat, { cast: false });
    }
  }

  const fascia = std(0xf0f0ec, { metalness: 0.2, roughness: 0.5 });
  box(root, outerHX * 2 + 5, 1.8, 0.7, 0, roofY + 2.4, outerHZ + 1.6, fascia);
  box(root, outerHX * 2 + 5, 1.8, 0.7, 0, roofY + 2.4, -(outerHZ + 1.6), fascia);
  box(root, 0.7, 1.8, outerHZ * 2 + 5, outerHX + 1.6, roofY + 2.4, 0, fascia);
  box(root, 0.7, 1.8, outerHZ * 2 + 5, -(outerHX + 1.6), roofY + 2.4, 0, fascia);

  return { roofY, openHX, openHZ };
}

function addRoyalBox(root, dims, jackTex, flagTex, badgeTex) {
  const z = -(INNER_HZ + WALL_T + 6.4);
  const y = WALL_H + 5.6;
  const wood = std(0x1a3d22);
  const cream = std(0xe8e2d4, { roughness: 0.6 });
  box(root, 14.5, 4.6, 3.4, 0, y, z, wood, { name: 'royalBox' });
  box(root, 14.8, 0.18, 1.6, 0, y + 1.1, z + 1.55, cream);
  box(root, 13.6, 0.9, 0.2, 0, y + 2.55, z + 1.72, std(WIMBLEDON.purple));

  const flowerColors = [0xd14b7a, 0xe8e8e8, 0xc42b3a, 0x6b2fa0, 0xf2c14e];
  for (let i = 0; i < 26; i++) {
    const fx = -6.4 + i * 0.5;
    const col = flowerColors[i % flowerColors.length];
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), std(col, { roughness: 0.5 }));
    head.position.set(fx, y + 1.32, z + 1.55);
    root.add(head);
  }

  const jack = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.95),
    new THREE.MeshBasicMaterial({ map: jackTex, side: THREE.DoubleSide })
  );
  jack.position.set(-1.15, y + 3.55, z + 1.85);
  root.add(jack);
  const wflag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.95),
    new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide })
  );
  wflag.position.set(1.15, y + 3.55, z + 1.85);
  root.add(wflag);
  cyl(root, 0.03, 0.03, 1.6, -1.15, y + 2.9, z + 1.82, std(0xdddddd), { seg: 6 });
  cyl(root, 0.03, 0.03, 1.6, 1.15, y + 2.9, z + 1.82, std(0xdddddd), { seg: 6 });

  const logo = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 28),
    new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true })
  );
  logo.position.set(0, y + 0.2, z + 1.78);
  root.add(logo);

  for (const x of [-5.2, -2.6, 0, 2.6, 5.2]) {
    cyl(root, 0.12, 0.12, 3.2, x, y - 0.4, z + 1.4, cream, { seg: 8 });
  }

  void dims;
}

function addScoreboards(root, dims, texA, texB) {
  const y = dims.walkY + 8.4;
  const z = -6.5;
  const w = 9.2;
  const h = 3.7;
  const matA = new THREE.MeshBasicMaterial({ map: texA });
  const matB = new THREE.MeshBasicMaterial({ map: texB });
  const frame = std(0x111411, { roughness: 0.5 });
  for (const [x, mat] of [[dims.outerHX - 3.8, matA], [-(dims.outerHX - 3.8), matB]]) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    board.position.set(x, y, z);
    board.lookAt(0, y - 2, 0);
    board.name = x > 0 ? 'scoreboardR' : 'scoreboardL';
    root.add(board);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, h + 0.35, 0.18), frame);
    fr.position.copy(board.position);
    fr.quaternion.copy(board.quaternion);
    fr.position.add(new THREE.Vector3(0, 0, 0.12).applyQuaternion(board.quaternion));
    root.add(fr);
  }
}

function addUmpireAndBenches(root, D) {
  const green = std(WIMBLEDON.seatHi, { roughness: 0.55, metalness: 0.12 });
  const dark = std(0x0d2418);
  const x = D.halfWidth + D.postOffset + 0.85;
  const chair = new THREE.Group();
  chair.name = 'umpireChair';
  chair.position.set(x, 0, 0);
  box(chair, 1.35, 0.14, 1.55, 0, 0.12, 0, dark);
  for (const [wx, wz] of [[-0.5, -0.55], [0.5, -0.55], [-0.5, 0.55], [0.5, 0.55]]) {
    cyl(chair, 0.09, 0.09, 0.16, wx, 0.08, wz, std(0x222), { rx: Math.PI / 2, seg: 8 });
  }
  box(chair, 0.08, 2.45, 0.08, -0.38, 1.3, -0.4, green);
  box(chair, 0.08, 2.45, 0.08, 0.38, 1.3, -0.4, green);
  box(chair, 0.08, 2.45, 0.08, -0.38, 1.3, 0.4, green);
  box(chair, 0.08, 2.45, 0.08, 0.38, 1.3, 0.4, green);
  for (let i = 0; i < 7; i++) {
    box(chair, 0.7, 0.04, 0.16, 0.55, 0.28 + i * 0.28, 0, green);
  }
  box(chair, 0.85, 0.12, 0.7, 0, 2.42, 0, green);
  box(chair, 0.85, 0.7, 0.08, 0, 2.82, 0.32, green);
  box(chair, 0.7, 0.06, 0.45, 0, 2.58, -0.28, dark);
  const monitor = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.22, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x111, emissive: 0x224422, emissiveIntensity: 0.4 })
  );
  monitor.position.set(0.18, 2.72, -0.18);
  chair.add(monitor);
  cyl(chair, 0.015, 0.015, 0.55, -0.22, 3.05, 0.05, std(0x222), { seg: 6 });
  const mic = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), std(0x111));
  mic.position.set(-0.22, 3.34, 0.05);
  chair.add(mic);
  root.add(chair);

  const towelA = new THREE.MeshStandardMaterial({
    map: makeTowelTexture('#1d4e89', '#f4f4f4'), roughness: 0.9
  });
  const towelB = new THREE.MeshStandardMaterial({
    map: makeTowelTexture('#1a1a1a', '#2a2a2a'), roughness: 0.9
  });

  function playerKit(z0, towelMat, bagColor) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const zz = z0 + i * 0.7;
      box(g, 0.48, 0.08, 0.48, x, 0.42, zz, green);
      box(g, 0.48, 0.55, 0.07, x, 0.72, zz + 0.22, green);
      cyl(g, 0.03, 0.03, 0.42, x - 0.18, 0.21, zz - 0.16, green, { seg: 6 });
      cyl(g, 0.03, 0.03, 0.42, x + 0.18, 0.21, zz - 0.16, green, { seg: 6 });
      cyl(g, 0.03, 0.03, 0.42, x - 0.18, 0.21, zz + 0.16, green, { seg: 6 });
      cyl(g, 0.03, 0.03, 0.42, x + 0.18, 0.21, zz + 0.16, green, { seg: 6 });
    }
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.55), towelMat);
    towel.position.set(x, 0.48, z0 + 0.7);
    towel.rotation.y = 0.2;
    g.add(towel);
    box(g, 0.7, 0.38, 0.42, x + 0.15, 0.22, z0 + 2.15, std(bagColor));
    for (let i = 0; i < 4; i++) {
      cyl(g, 0.035, 0.035, 0.22, x - 0.25 + i * 0.14, 0.14, z0 - 0.55, std(0xb8d4e8, { roughness: 0.25, metalness: 0.2 }), { seg: 8 });
    }
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.7), std(iMatColor(z0), { roughness: 0.95 }));
    mat.position.set(x, 0.02, z0 + 0.7);
    g.add(mat);
    root.add(g);
  }
  function iMatColor(z0) {
    return z0 > 0 ? 0x3a6ea5 : 0xc48a9a;
  }
  playerKit(2.4, towelA, 0x1a1a1a);
  playerKit(-4.4, towelB, 0x0d2418);

  const cam = new THREE.Group();
  cam.position.set(-(D.halfWidth + 0.55), 0, 0.15);
  box(cam, 0.55, 0.08, 0.7, 0, 0.12, 0, green);
  box(cam, 0.22, 0.18, 0.32, 0, 0.28, 0, std(0x111));
  cyl(cam, 0.05, 0.07, 0.16, 0, 0.28, 0.22, std(0x222), { rx: Math.PI / 2, seg: 10 });
  root.add(cam);
}

function addSkyAndLand(scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(240, 32, 20),
    new THREE.MeshBasicMaterial({
      map: makeSkyTexture(),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    })
  );
  sky.name = 'wimbledonSky';
  scene.add(sky);
  const land = new THREE.Mesh(
    new THREE.CircleGeometry(200, 48),
    std(0x24522c, { roughness: 1 })
  );
  land.rotation.x = -Math.PI / 2;
  land.position.y = -0.04;
  land.receiveShadow = true;
  land.name = 'outerLand';
  scene.add(land);
}

export function applyWimbledonAtmosphere(scene, renderer, controls) {
  scene.background = new THREE.Color(0x8eb9dc);
  scene.fog = new THREE.Fog(0x9bbfd4, 95, 260);
  renderer.toneMappingExposure = 1.08;
  if (controls) {
    controls.maxDistance = 150;
    controls.minDistance = 5;
  }
}

export function createWimbledonLights(s) {
  const hemi = new THREE.HemisphereLight(0xe7f2ff, 0x2c4a32, 0.95);
  hemi.name = 'wimbledonHemi';
  s.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff6e8, 1.35);
  sun.position.set(6, 42, 9);
  sun.castShadow = true;
  const touch = (() => {
    try {
      return window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  })();
  sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  sun.name = 'wimbledonSun';
  s.add(sun);

  const fill = new THREE.DirectionalLight(0xcfe4ff, 0.28);
  fill.position.set(-18, 14, -8);
  s.add(fill);

  const bowl = new THREE.PointLight(0xfff2d8, 0.35, 70, 2);
  bowl.position.set(0, 18, 0);
  s.add(bowl);
}

export function createWimbledonStadium(scene, courtGroup, D, opts) {
  addGrassFloor(courtGroup, D);
  addSkyAndLand(scene);

  const root = new THREE.Group();
  root.name = 'wimbledonStadium';

  const badgeTex = makeWimbledonBadge();
  const jackTex = makeUnionJack();
  const flagTex = makeWimbledonFlag(badgeTex);
  const scoreTexA = makeScoreboardTexture();
  const scoreTexB = makeScoreboardTexture();

  addInnerWalls(root, badgeTex);
  const dims = addSeating(root, opts || {});
  addBowlShell(root, dims);
  addRoof(root, dims);
  addRoyalBox(root, dims, jackTex, flagTex, badgeTex);
  addScoreboards(root, dims, scoreTexA, scoreTexB);
  addUmpireAndBenches(root, D);

  scene.add(root);

  return {
    root,
    syncScore(state) {
      const next = makeScoreboardTexture(state);
      scoreTexA.image = next.image;
      scoreTexA.needsUpdate = true;
      scoreTexB.image = next.image;
      scoreTexB.needsUpdate = true;
    }
  };
}
