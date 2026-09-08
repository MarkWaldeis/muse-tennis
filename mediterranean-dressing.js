// Pure dressing policy for the Mediterranean clay map.
// No Three.js — arena code applies these poses/flags to live meshes.

export const CLAY_HALF_X = 8.70;
export const CLAY_HALF_Z = 17.50;

/** Distinct heights so court / apron / paving / water never share a plane. */
export const GROUND_Y = Object.freeze({
  water: -21.6,
  paving: -0.045,
  apron: -0.020,
  court: 0.002,
  glbClayTop: 0,
  lines: 0.015
});

export const BANDE_X = CLAY_HALF_X + 0.42; // 9.12 m, outside clay + runoff
export const BANDE_HEIGHT = 1.16;
export const BANDE_THICK = 0.05;
export const BANDE_SEGMENT = 5.0;
export const BANDE_GREEN = 0x1f4a32;

const HIDE_WHEN_IMPORTED = Object.freeze([
  'mediterraneanSea',
  'SM_Ocean_Surface',
  'groundOuter',
  'courtSurface',
  'mediterraneanPaving',
  'SM_Court_PlaySurface',
  'Court_PlaySurface'
]);

const KEEP_WHEN_IMPORTED = Object.freeze([
  'SM_Court_Clay_Slab'
]);

export function groundLayerPlan(imported) {
  if (imported) {
    return {
      imported: true,
      hide: HIDE_WHEN_IMPORTED.slice(),
      keep: KEEP_WHEN_IMPORTED.slice(),
      addJsCourt: false,
      addWater: true,
      waterY: GROUND_Y.water
    };
  }
  return {
    imported: false,
    hide: ['SM_Ocean_Surface', 'mediterraneanSea'],
    keep: ['groundOuter', 'courtSurface'],
    addJsCourt: true,
    addWater: true,
    waterY: GROUND_Y.water,
    heights: {
      paving: GROUND_Y.paving,
      apron: GROUND_Y.apron,
      court: GROUND_Y.court
    }
  };
}

export function surfaceShouldBeVisible(name, imported) {
  const plan = groundLayerPlan(imported);
  if (plan.hide.includes(name)) return false;
  if (plan.keep.includes(name)) return true;
  return true;
}

export function waterSetup() {
  return {
    name: 'mediterraneanWater',
    y: GROUND_Y.water,
    size: 420,
    segments: 72,
    transparent: true,
    opacity: 0.78,
    roughness: 0.16,
    metalness: 0.28,
    animated: true,
    transmission: null,
    hideDuplicates: ['SM_Ocean_Surface', 'mediterraneanSea']
  };
}

export function waterVertexOffset(x, z, time) {
  const t = Number(time) || 0;
  return Math.sin(x * 0.11 + t * 1.05) * 0.22
    + Math.sin(z * 0.085 + t * 0.82) * 0.16
    + Math.sin((x + z) * 0.04 + t * 0.55) * 0.08;
}

export function shouldHideImportedBande(name) {
  const n = String(name || '');
  if (n === 'SM_Glass_North' || n === 'SM_Rail_North' || n === 'SM_Rail_WestEnd') {
    return false;
  }
  return n.startsWith('SM_Glass_') || n.startsWith('SM_Rail_');
}

export function isRightEdgeBande(sample) {
  if (!sample) return false;
  if (!shouldHideImportedBande(sample.name) && !(sample.name || '').startsWith('SM_Glass_')) {
    return false;
  }
  const x = Number(sample.x);
  const minX = Number(sample.minX);
  return x > 6 || minX > 6;
}

function quatUpY(qx, qy, qz, qw) {
  // Rotate (0,1,0) by quaternion (x,y,z,w).
  const x = Number(qx) || 0;
  const y = Number(qy) || 0;
  const z = Number(qz) || 0;
  const w = Number(qw) === 0 && !qx && !qy && !qz ? 1 : Number(qw);
  const ix = w * 0 + y * 0 - z * 1 + x * 1;
  const iy = w * 1 + z * 0 + x * 1 - y * 0;
  const iz = w * 0 - x * 0 + y * 1 + z * 0;
  const iw = w * 1 - x * 0 - y * 0 - z * 1;
  return {
    x: ix * w + iw * x + iy * z - iz * y,
    y: iy * w + iw * y + iz * x - ix * z,
    z: iz * w + iw * z + ix * y - iy * x
  };
}

export function correctBandePose(sample, court = { clayHalfX: CLAY_HALF_X }) {
  const z = Number(sample && sample.z) || 0;
  const x = Math.max(court.clayHalfX + 0.42, BANDE_X);
  return {
    x,
    y: BANDE_HEIGHT / 2,
    z,
    rx: 0,
    ry: 0,
    rz: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    upY: 1,
    outsideClay: x > court.clayHalfX
  };
}

export function bandeUpYFromQuat(qx, qy, qz, qw) {
  return quatUpY(qx, qy, qz, qw).y;
}

export function replacementBandeLayout(court = { clayHalfX: CLAY_HALF_X, clayHalfZ: CLAY_HALF_Z }) {
  const x = court.clayHalfX + 0.42;
  const z0 = -court.clayHalfZ + BANDE_SEGMENT / 2;
  const z1 = court.clayHalfZ - BANDE_SEGMENT / 2;
  const boards = [];
  for (let z = z0; z <= z1 + 0.01; z += BANDE_SEGMENT) {
    boards.push({
      x,
      y: BANDE_HEIGHT / 2,
      z,
      w: BANDE_THICK,
      h: BANDE_HEIGHT,
      d: BANDE_SEGMENT - 0.08,
      rx: 0,
      ry: 0,
      rz: 0,
      color: BANDE_GREEN
    });
  }
  return boards;
}

export function visibleDuplicateYConflict(surfaces) {
  const byY = new Map();
  for (const s of surfaces) {
    if (!s || s.visible === false) continue;
    const key = Number(s.y).toFixed(3);
    const list = byY.get(key) || [];
    list.push(s.name);
    byY.set(key, list);
  }
  const conflicts = [];
  for (const [y, names] of byY) {
    const planes = names.filter((n) =>
      /Sea|Ocean|Water|groundOuter|courtSurface|Paving|Clay|PlaySurface/i.test(n)
    );
    if (planes.length > 1) conflicts.push({ y, names: planes });
  }
  return conflicts;
}
