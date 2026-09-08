// Map catalog for Muse Tennis. Gameplay (COURT_DIMENSIONS, animations, physics)
// is shared; only the stadium / atmosphere swap per id.

export const DEFAULT_MAP = 'wimbledon';

export const MAPS = Object.freeze([
  Object.freeze({
    id: 'wimbledon',
    name: 'Centre Court',
    tag: 'Wimbledon',
    surface: 'grass',
    blurb: 'Rasen, Stadion, Retractable Roof'
  }),
  Object.freeze({
    id: 'mediterranean',
    name: 'Clay Arena',
    tag: 'Mittelmeer',
    surface: 'clay',
    blurb: 'Sandplatz, Villa, goldene Stunde',
    glb: './assets/mediterranean-arena.glb'
  })
]);

const BY_ID = new Map(MAPS.map((m) => [m.id, m]));

export function isValidMap(id) {
  return BY_ID.has(id);
}

export function getMap(id) {
  return BY_ID.get(id) || BY_ID.get(DEFAULT_MAP);
}

export function listMaps() {
  return MAPS.slice();
}

export function parseMapQuery(search) {
  const raw = String(search || '');
  const q = raw.startsWith('?') ? raw.slice(1) : raw;
  const params = new URLSearchParams(q);
  const id = params.get('map');
  return isValidMap(id) ? id : DEFAULT_MAP;
}

export function nextMapId(current) {
  const i = MAPS.findIndex((m) => m.id === current);
  const idx = i < 0 ? 0 : (i + 1) % MAPS.length;
  return MAPS[idx].id;
}
