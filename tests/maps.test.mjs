import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  DEFAULT_MAP,
  MAPS,
  getMap,
  isValidMap,
  listMaps,
  nextMapId,
  parseMapQuery
} from '../maps.js';
import {
  BANDE_X,
  CLAY_HALF_X,
  GROUND_Y,
  bandeUpYFromQuat,
  correctBandePose,
  groundLayerPlan,
  isRightEdgeBande,
  replacementBandeLayout,
  shouldHideImportedBande,
  surfaceShouldBeVisible,
  visibleDuplicateYConflict,
  waterSetup,
  waterVertexOffset
} from '../mediterranean-dressing.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('catalog exposes both playable maps and keeps Wimbledon as default', () => {
  const ids = listMaps().map((m) => m.id);
  assert.deepEqual(ids, ['wimbledon', 'mediterranean']);
  assert.equal(DEFAULT_MAP, 'wimbledon');
  assert.equal(getMap('nope').id, 'wimbledon');
  assert.equal(isValidMap('mediterranean'), true);
  assert.equal(isValidMap('us-open'), false);
  assert.equal(nextMapId('wimbledon'), 'mediterranean');
  assert.equal(nextMapId('mediterranean'), 'wimbledon');
  assert.equal(getMap('mediterranean').surface, 'clay');
  assert.equal(getMap('wimbledon').surface, 'grass');
  assert.equal(getMap('mediterranean').glb, './assets/mediterranean-arena.glb');
});

test('parseMapQuery only accepts catalog ids', () => {
  assert.equal(parseMapQuery(''), DEFAULT_MAP);
  assert.equal(parseMapQuery('?probe=1'), DEFAULT_MAP);
  assert.equal(parseMapQuery('?map=mediterranean'), 'mediterranean');
  assert.equal(parseMapQuery('map=mediterranean&probe=1'), 'mediterranean');
  assert.equal(parseMapQuery('?map=hacked'), DEFAULT_MAP);
});

test('Mediterranean GLB is a real glTF 2.0 binary with mesh payload', () => {
  const glbPath = path.join(ROOT, 'assets', 'mediterranean-arena.glb');
  const buf = fs.readFileSync(glbPath);
  assert.ok(buf.length > 1_000_000, `GLB too small: ${buf.length}`);
  assert.equal(buf.toString('ascii', 0, 4), 'glTF');
  assert.equal(buf.readUInt32LE(4), 2);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
  assert.equal(json.asset.version, '2.0');
  assert.ok(Array.isArray(json.meshes) && json.meshes.length > 10);
  const names = (json.nodes || []).map((n) => n.name || '');
  assert.ok(names.some((n) => n.includes('Clay') || n.includes('Court')), names.slice(0, 20));
  assert.ok(!names.some((n) => n.startsWith('SM_Net')), 'game draws the net, GLB must not duplicate it');
});

test('index.html wires menu map picker without changing court physics', () => {
  const html = read('index.html');
  assert.match(html, /from '\.\/maps\.js'/);
  assert.match(html, /from '\.\/mediterranean-arena\.js'/);
  assert.match(html, /data-map="wimbledon"/);
  assert.match(html, /data-map="mediterranean"/);
  assert.match(html, /function selectMap\(/);
  assert.match(html, /async function applySelectedMap\(/);
  assert.match(html, /preloadMediterraneanArena/);
  assert.match(html, /createMediterraneanArena/);
  assert.match(html, /createWimbledonStadium/);
  assert.match(html, /getSelectedMap\(\) \{ return selectedMap; \}/);

  const dimBlock = html.slice(html.indexOf('export const COURT_DIMENSIONS'), html.indexOf('playerSpawnZ'));
  assert.match(dimBlock, /length: 23\.77/);
  assert.match(dimBlock, /width: 10\.97/);
  assert.match(dimBlock, /singlesWidth: 8\.23/);
  assert.match(dimBlock, /serviceDistance: 6\.4/);
  assert.match(dimBlock, /halfLength: 23\.77 \/ 2/);

  const startAt = html.indexOf('function startMatch()');
  const startEnd = html.indexOf('\nfunction ', startAt + 1);
  const startMatch = html.slice(startAt, startEnd);
  assert.match(startMatch, /createPlayer\(scene, playerOptsFor\(selectedCharacter\)\)/);
  assert.match(startMatch, /createServeController/);
  assert.match(startMatch, /createHitSync/);
  assert.doesNotMatch(startMatch, /selectedMap/);
  assert.doesNotMatch(startMatch, /mediterranean|wimbledon/i);
});

test('imported map hides duplicate court/ocean planes at the same Y', () => {
  const plan = groundLayerPlan(true);
  assert.equal(plan.addJsCourt, false);
  assert.equal(plan.addWater, true);
  assert.equal(plan.waterY, GROUND_Y.water);
  for (const n of [
    'mediterraneanSea',
    'SM_Ocean_Surface',
    'groundOuter',
    'courtSurface',
    'mediterraneanPaving',
    'SM_Court_PlaySurface',
    'Court_PlaySurface'
  ]) {
    assert.equal(surfaceShouldBeVisible(n, true), false, n);
  }
  assert.equal(surfaceShouldBeVisible('SM_Court_Clay_Slab', true), true);
  assert.ok(GROUND_Y.water < GROUND_Y.paving);
  assert.ok(GROUND_Y.paving < GROUND_Y.apron);
  assert.ok(GROUND_Y.apron < GROUND_Y.court);
  assert.ok(GROUND_Y.court < GROUND_Y.lines);

  const dressed = [
    { name: 'SM_Court_Clay_Slab', y: GROUND_Y.glbClayTop, visible: true },
    { name: 'mediterraneanWater', y: GROUND_Y.water, visible: true },
    { name: 'mediterraneanSea', y: GROUND_Y.water, visible: false },
    { name: 'SM_Ocean_Surface', y: -22, visible: false },
    { name: 'courtSurface', y: GROUND_Y.court, visible: false }
  ];
  assert.deepEqual(visibleDuplicateYConflict(dressed), []);
  const stacked = [
    { name: 'mediterraneanSea', y: -8.5, visible: true },
    { name: 'SM_Ocean_Surface', y: -8.5, visible: true }
  ];
  const conflicts = visibleDuplicateYConflict(stacked);
  assert.equal(conflicts.length, 1);
  assert.ok(conflicts[0].names.includes('mediterraneanSea'));
});

test('tilted right-edge Bande is corrected upright and outside the clay', () => {
  const tilted = {
    name: 'SM_Glass_4',
    x: 8.84,
    y: 1.1,
    z: 7.5,
    qx: 0.5301,
    qy: -0.5301,
    qz: -0.468,
    qw: 0.468,
    minX: 8.56
  };
  assert.equal(isRightEdgeBande(tilted), true);
  assert.equal(shouldHideImportedBande('SM_Glass_4'), true);
  assert.equal(shouldHideImportedBande('SM_Rail_0'), true);
  assert.equal(shouldHideImportedBande('SM_Glass_North'), false);
  assert.ok(Math.abs(bandeUpYFromQuat(tilted.qx, tilted.qy, tilted.qz, tilted.qw)) < 0.2);

  const pose = correctBandePose(tilted);
  assert.equal(pose.rx, 0);
  assert.equal(pose.ry, 0);
  assert.equal(pose.rz, 0);
  assert.equal(pose.qx, 0);
  assert.equal(pose.qy, 0);
  assert.equal(pose.qz, 0);
  assert.equal(pose.qw, 1);
  assert.equal(pose.upY, 1);
  assert.equal(bandeUpYFromQuat(pose.qx, pose.qy, pose.qz, pose.qw), 1);
  assert.ok(pose.x >= CLAY_HALF_X + 0.3);
  assert.equal(pose.x, BANDE_X);
  assert.equal(pose.z, 7.5);
  assert.equal(pose.outsideClay, true);

  const boards = replacementBandeLayout();
  assert.ok(boards.length >= 6);
  for (const b of boards) {
    assert.equal(b.rx, 0);
    assert.equal(b.ry, 0);
    assert.equal(b.rz, 0);
    assert.ok(b.x > CLAY_HALF_X);
    assert.ok(Math.abs(b.z) <= 17.5);
    assert.ok(b.h > 1);
    assert.ok(b.w < 0.1);
    assert.ok(b.d > 1);
  }
});

test('water setup is a single animated transparent sea, not stacked opaque discs', () => {
  const spec = waterSetup();
  assert.equal(spec.name, 'mediterraneanWater');
  assert.equal(spec.transparent, true);
  assert.ok(spec.opacity > 0.4 && spec.opacity < 1);
  assert.equal(spec.animated, true);
  assert.equal(spec.transmission, null);
  assert.ok(spec.roughness < 0.4);
  assert.ok(spec.hideDuplicates.includes('SM_Ocean_Surface'));
  assert.ok(spec.hideDuplicates.includes('mediterraneanSea'));
  const a = waterVertexOffset(10, 4, 0);
  const b = waterVertexOffset(10, 4, 1.7);
  const c = waterVertexOffset(40, -20, 1.7);
  assert.notEqual(a, b);
  assert.notEqual(b, c);
  assert.ok(Math.abs(a) < 1 && Math.abs(b) < 1);
});

test('arena builder uses dressing helpers and does not stack a JS sea on the GLB ocean', () => {
  const src = read('mediterranean-arena.js');
  assert.match(src, /from '\.\/mediterranean-dressing\.js'/);
  assert.match(src, /groundLayerPlan/);
  assert.match(src, /addAnimatedWater/);
  assert.match(src, /addUprightBanden/);
  assert.match(src, /waterVertexOffset/);
  assert.match(src, /shouldHideImportedBande/);
  assert.doesNotMatch(src, /sea\.name = 'mediterraneanSea'/);
  const html = read('index.html');
  const startAt = html.indexOf('function startMatch()');
  const startEnd = html.indexOf('\nfunction ', startAt + 1);
  const startMatch = html.slice(startAt, startEnd);
  assert.doesNotMatch(startMatch, /selectedMap/);
});

test('map switch disposes previous stadium and keeps courtGroup lines/net', () => {
  const html = read('index.html');
  assert.match(html, /function disposeArenaDecor\(/);
  assert.match(html, /userData\.arenaDecor \|\| o\.userData\.mapFloor/);
  assert.match(html, /const courtGroup = createTennisCourt\(scene\)/);
  const courtFn = html.slice(html.indexOf('export function createTennisCourt'), html.indexOf('function disposeArenaDecor'));
  assert.match(courtFn, /linesGroup/);
  assert.match(courtFn, /netGroup/);
  assert.doesNotMatch(courtFn, /createWimbledonStadium/);
  assert.doesNotMatch(courtFn, /createMediterraneanArena/);
});
