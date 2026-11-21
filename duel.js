// Host-authoritative tennis rules. Positions use court metres in both clients.
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const sign = seat => seat === 0 ? 1 : -1;
export const STEP = 1 / 60;
export const neutralInput = Object.freeze({ x: 0, z: 0, hit: 0 });

export function normalizeInput(raw) {
  const x = Number.isFinite(raw?.x) ? clamp(raw.x, -1, 1) : 0;
  const z = Number.isFinite(raw?.z) ? clamp(raw.z, -1, 1) : 0;
  const scale = Math.max(1, Math.hypot(x, z));
  const hit = Number.isSafeInteger(raw?.hit) && raw.hit >= 0 ? raw.hit : 0;
  return { x: x / scale, z: z / scale, hit };
}

export function createDuel(court, physics) {
  const radius = physics.radius;
  const gravity = physics.gravity;
  const actors = [0, 1].map(() => ({ x: 0, z: 0, vx: 0, vz: 0, stroke: 0, hand: 1 }));
  const ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const state = {
    actors, ball, points: [0, 0], games: [0, 0], server: 0, phase: 'ready',
    faults: 0, rally: 0, point: 0, winner: -1, frame: 0,
    event: { id: 0, kind: 'ready', seat: 0, x: 0, y: 0, z: 0 }
  };
  const seenHits = [0, 0];
  const swings = [0, 0];
  let phaseTime = 0, bounceCount = 0, hitter = -1, net = false, service = false;
  let diagonal = 1;

  function event(kind, seat) {
    state.event = { id: state.event.id + 1, kind, seat, x: ball.x, y: ball.y, z: ball.z };
  }

  function ready(kind = 'ready') {
    state.phase = 'ready';
    diagonal = state.point % 2 ? -1 : 1;
    const direction = sign(state.server);
    // Right side of the server's view on the first point.
    actors[state.server].x = 2.1 * direction * diagonal;
    actors[1 - state.server].x = -1.9 * direction * diagonal;
    actors.forEach((actor, seat) => {
      actor.z = (court.halfLength + 1.15) * sign(seat);
      actor.vx = 0;
      actor.vz = 0;
      swings[seat] = 0;
    });
    state.rally = 0;
    phaseTime = 0;
    Object.assign(ball, { x: actors[state.server].x + .32 * direction, y: 1.14,
      z: actors[state.server].z - .22 * direction, vx: 0, vy: 0, vz: 0 });
    event(kind, state.server);
  }

  function point(seat, reason) {
    state.points[seat]++;
    state.point++;
    ball.vx = ball.vy = ball.vz = 0;
    event(reason, seat);
    if (state.points[seat] >= 4 && state.points[seat] - state.points[1 - seat] >= 2) {
      state.games[seat]++;
      state.points.fill(0);
      state.point = 0;
      state.server = 1 - state.server;
      if (state.games[seat] >= 6 && state.games[seat] - state.games[1 - seat] >= 2) {
        state.winner = seat;
        state.phase = 'finished';
        event('match', seat);
        return;
      }
      event('game', seat);
    }
    state.phase = 'point';
    state.faults = 0;
    phaseTime = 0;
  }

  function launch(seat, x, z, time, isServe) {
    hitter = seat;
    bounceCount = 0;
    service = isServe;
    net = false;
    const t = time;
    // Half a substep compensates for semi-implicit Euler integration.
    ball.vx = (x - ball.x) / t;
    ball.vz = (z - ball.z) / t;
    ball.vy = (radius - ball.y - gravity * t * (t + STEP) / 2) / t;
    state.rally++;
    state.phase = 'live';
    event(isServe ? 'serve' : 'hit', seat);
  }

  function serve(input) {
    const seat = state.server, dir = sign(seat);
    const x = -dir * diagonal * clamp(2.25 - input.x * 1.4 * diagonal, .55, court.halfSingles - .26);
    const z = -dir * clamp(4.65 - input.z, 2.9, court.serviceDistance - .35);
    launch(seat, x, z, 1.03, true);
  }

  function tryReturn(seat, input) {
    const actor = actors[seat], dir = sign(seat);
    if (hitter === seat || service || ball.z * dir < -.18 || ball.y < .18 || ball.y > 3.05) return false;
    const closing = Math.hypot(ball.x - actor.x, ball.z - actor.z);
    if (closing > 2.25) return false;
    // Stick on impact chooses direction; neutral is a safe deep centre shot.
    const x = dir * input.x * (court.halfSingles - .29);
    const z = -dir * (9.4 - input.z * 1.65);
    launch(seat, x, z, 1.14 + Math.min(.2, closing * .07), false);
    return true;
  }

  function tickBall() {
    const oldZ = ball.z, oldX = ball.x, oldY = ball.y;
    ball.vy += gravity * STEP;
    ball.x += ball.vx * STEP;
    ball.y += ball.vy * STEP;
    ball.z += ball.vz * STEP;
    if (oldZ * ball.z < 0) {
      const alpha = oldZ / (oldZ - ball.z);
      const x = oldX + (ball.x - oldX) * alpha;
      const y = oldY + (ball.y - oldY) * alpha;
      const post = court.halfWidth + court.postOffset;
      const tape = court.netHeightCenter + (court.netHeightPost - court.netHeightCenter) * (x / post) ** 2;
      if (Math.abs(x) < post && y <= tape + radius) {
        net = true;
        ball.z = Math.sign(oldZ) * radius;
        ball.vz *= -.15;
        ball.vx *= .3;
        ball.vy = Math.min(-1, ball.vy);
      }
    }
    if (ball.y > radius || ball.vy >= 0) return;
    ball.y = radius;
    ball.vy *= -.56;
    ball.vx *= .85;
    ball.vz *= .85;
    bounceCount++;
    if (service) {
      const dir = sign(state.server);
      const inBox = ball.x * -dir * diagonal >= -radius && Math.abs(ball.x) <= court.halfSingles + radius &&
        ball.z * -dir > 0 && Math.abs(ball.z) <= court.serviceDistance + radius;
      if (!inBox) {
        state.faults++;
        if (state.faults >= 2) point(1 - state.server, 'double-fault');
        else ready('fault');
        return;
      }
      if (net) { ready('let'); return; }
      service = false;
    }
    if (bounceCount === 1) {
      if (Math.abs(ball.x) > court.halfSingles + radius || Math.abs(ball.z) > court.halfLength + radius ||
          ball.z * sign(hitter) >= 0) point(1 - hitter, 'out');
      else event('bounce', 1 - hitter);
    } else point(hitter, 'point');
  }

  function move(seat, input) {
    const actor = actors[seat], dir = sign(seat);
    const factor = swings[seat] > .12 ? .42 : 1;
    actor.vx += (input.x * dir * 8.2 * factor - actor.vx) * .19;
    actor.vz += (input.z * dir * 8.2 * factor - actor.vz) * .19;
    if (!input.x && Math.abs(actor.vx) < .01) actor.vx = 0;
    if (!input.z && Math.abs(actor.vz) < .01) actor.vz = 0;
    actor.x = clamp(actor.x + actor.vx * STEP, -8.7, 8.7);
    actor.z = dir * clamp(actor.z * dir + actor.vz * STEP * dir, .52, 16.5);
  }

  function step(first = neutralInput, second = neutralInput) {
    if (state.phase === 'finished') return;
    state.frame++;
    phaseTime += STEP;
    const inputs = [first, second];
    const pressed = inputs.map((input, i) => {
      const changed = input.hit > seenHits[i];
      seenHits[i] = Math.max(input.hit, seenHits[i]);
      return changed;
    });
    if (state.phase === 'point') {
      if (phaseTime > 1.23) ready();
      return;
    }
    if (state.phase === 'ready') {
      move(1 - state.server, inputs[1 - state.server]);
      if (pressed[state.server]) {
        state.phase = 'toss';
        phaseTime = 0;
        event('toss', state.server);
      }
      return;
    }
    if (state.phase === 'toss') {
      move(1 - state.server, inputs[1 - state.server]);
      ball.y = 1.14 + 4.6 * phaseTime - 5.2 * phaseTime ** 2;
      if (phaseTime > .52 || (phaseTime > .22 && pressed[state.server])) serve(inputs[state.server]);
      return;
    }
    for (const [seat, actor] of actors.entries()) {
      const input = inputs[seat], dir = sign(seat);
      move(seat, input);
      if (pressed[seat] && swings[seat] <= 0) {
        actor.hand = (ball.x - actor.x) * dir >= 0 ? 1 : -1;
        actor.stroke++;
        swings[seat] = .39;
      }
      if (swings[seat] > 0) {
        // Accept a slightly early press as the strings reach contact.
        if (swings[seat] > .18) tryReturn(seat, input);
        swings[seat] = Math.max(0, swings[seat] - STEP);
      }
    }
    tickBall();
  }

  ready();
  return { state, step };
}

export function tennisPoints(points) {
  const [a, b] = points;
  if (a >= 3 && b >= 3) return a === b ? ['40', '40'] : a > b ? ['AD', '40'] : ['40', 'AD'];
  const labels = ['0', '15', '30', '40'];
  return [labels[a], labels[b]];
}
