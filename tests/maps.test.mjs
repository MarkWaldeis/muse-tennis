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
