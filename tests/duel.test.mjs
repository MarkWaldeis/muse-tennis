import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDuel, neutralInput, normalizeInput, tennisPoints } from '../duel.js';
import { parseRoomCode } from '../online-room.js';

const court = {
  halfLength: 11.885, halfWidth: 5.485, halfSingles: 4.115, postOffset: .914, serviceDistance: 6.4,
  netHeightCenter: .914, netHeightPost: 1.07
};
const create = () => createDuel(court, { radius: .13, gravity: -18 });
const input = (x, z, hit = 0) => ({ x, z, hit });

function advance(duel, condition, first = neutralInput, second = neutralInput, limit = 180) {
  for (let i = 0; i < limit; i++) {
    duel.step(first, second);
    if (condition(duel.state)) return;
  }
  assert.fail('target phase or event was not reached');
}

test('a serve crosses the net and yields a point on the second bounce', () => {
  const duel = create();
  assert.equal(duel.state.phase, 'ready');
  duel.step(input(0, 0, 1));
  assert.equal(duel.state.phase, 'toss');
  advance(duel, s => s.event.kind === 'bounce');
  assert.equal(duel.state.rally, 1);
  assert.ok(duel.state.ball.x < 0 && duel.state.ball.z < 0);
  advance(duel, s => s.phase === 'point');
  assert.deepEqual(duel.state.points, [1, 0]);
  advance(duel, s => s.phase === 'ready');
  assert.ok(duel.state.actors[0].x < 0, 'service side alternates between points');
});

test('guest movement mirrors the view and can return the host serve', () => {
  const duel = create();
  duel.step(input(0, 0, 1));
  advance(duel, s => s.phase === 'live');
  const start = duel.state.actors[1].z;
  advance(duel, s => s.event.kind === 'bounce', neutralInput, input(0, -1));
  assert.ok(duel.state.actors[1].z > start);
  advance(duel, s => s.event.kind === 'hit' && s.event.seat === 1, neutralInput, input(0, 0, 1), 20);
  assert.equal(duel.state.rally, 2);
});

test('games alternate the serving seat and offer tennis point labels', () => {
  const duel = create();
  for (let hit = 1; hit <= 4; hit++) {
    duel.step(input(0, 0, hit));
    advance(duel, s => s.phase === 'point');
    advance(duel, s => s.phase === 'ready');
  }
  assert.deepEqual(duel.state.games, [1, 0]);
  assert.equal(duel.state.server, 1);
  duel.step(neutralInput, input(0, 0, 1));
  advance(duel, s => s.event.kind === 'bounce');
  assert.ok(duel.state.ball.x > 0 && duel.state.ball.z > 0);
  assert.deepEqual(tennisPoints([4, 3]), ['AD', '40']);
  assert.deepEqual(tennisPoints([6, 6]), ['40', '40']);
});

test('the receiver can move before the serve while the server holds their stance', () => {
  const duel = create();
  const start = duel.state.actors[1].x;
  for (let i = 0; i < 12; i++) duel.step(input(1, 0), input(1, 0));
  assert.ok(duel.state.actors[1].x < start);
  assert.equal(duel.state.actors[0].x, 2.1);
});

test('room codes normalize user input and reject other database paths', () => {
  assert.equal(parseRoomCode('ab3c-defg'), 'AB3CDEFG');
  assert.equal(parseRoomCode('../ABCDE'), null);
  assert.equal(parseRoomCode('01XYZ987'), null);
  assert.deepEqual(normalizeInput({ x: Infinity, z: -2, hit: -1 }), { x: 0, z: -1, hit: 0 });
});
