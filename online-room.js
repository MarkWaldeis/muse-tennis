// Uses the same public Realtime Database as the games cabinet. A random room
// code is the invitation. No account or personal data is stored.
const databaseURL = 'https://uno-spiel-6781b-default-rtdb.europe-west1.firebasedatabase.app';
const sdk = 'https://www.gstatic.com/firebasejs/10.14.1/';
const namespace = 'rooms/muse-tennis-v1';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let backend;

async function connect() {
  backend ??= Promise.all([import(sdk + 'firebase-app.js'), import(sdk + 'firebase-database.js')])
    .then(([app, db]) => ({ db, database: db.getDatabase(app.initializeApp({ databaseURL }, 'muse-tennis')) }))
    .catch(error => { backend = null; throw error; });
  return backend;
}

export function parseRoomCode(value) {
  const code = value?.trim().toUpperCase().replace(/[\s-]+/g, '');
  return code && code.length === 8 && [...code].every(letter => alphabet.includes(letter)) ? code : null;
}

function newCode() {
  return [...crypto.getRandomValues(new Uint8Array(8))].map(byte => alphabet[byte % alphabet.length]).join('');
}

export async function openRoom({ code, map, character, onUpdate, onError }) {
  const { db, database } = await connect();
  const id = crypto.randomUUID();
  const seat = code ? 1 : 0;
  if (code && !parseRoomCode(code)) throw new Error('Gib einen gültigen achtstelligen Raumcode ein.');
  code = parseRoomCode(code) || newCode();
  const path = key => db.ref(database, key ? `${namespace}/${code}/${key}` : `${namespace}/${code}`);
  const roomRef = path('lobby');
  let connected = false;
  let offset = 0;
  let closed = false;
  const stopClock = db.onValue(db.ref(database, '.info/serverTimeOffset'), snapshot => { offset = snapshot.val() || 0; });
  const connectionRef = db.ref(database, '.info/connected');
  const now = () => Date.now() + offset;
  const presenceRef = path(`presence/${seat}`);
  let stopPriming;
  try {
    // Keep the first server snapshot subscribed through the whole transaction.
    // A standalone get() does not seed the cache that runTransaction() reads.
    const initial = await new Promise((resolve, reject) => {
      stopPriming = db.onValue(roomRef, resolve, reject);
    });
    if (seat === 1 && (!initial.exists() || now() - initial.val().created > 6 * 60 * 60_000)) {
      throw new Error('Raum nicht gefunden. Prüfe den Einladungscode.');
    }
    const result = await db.runTransaction(roomRef, lobby => {
      if (!seat) return lobby ? undefined : { host: { id, character }, map, created: now() };
      if (!lobby?.host || lobby.guest) return;
      return { ...lobby, guest: { id, character } };
    }, { applyLocally: false });
    if (!result.committed) throw new Error(seat ? 'Dieser Raum ist bereits belegt oder geschlossen.' : 'Raumcode belegt. Versuche es erneut.');
  } catch (error) {
    stopClock();
    throw error;
  } finally {
    stopPriming?.();
  }

  const values = {};
  function report() { if (!closed) onUpdate(values, connected, now()); }
  const stopValues = ['lobby', 'presence', seat ? 'state' : 'input'].map(key =>
    db.onValue(path(key), snapshot => {
      values[key] = snapshot.val();
      report();
    }, onError)
  );
  function heartbeat() {
    if (connected && !closed) db.set(presenceRef, db.serverTimestamp()).catch(onError);
    report();
  }
  const stopConnection = db.onValue(connectionRef, snapshot => {
    connected = snapshot.val() === true;
    heartbeat();
  });
  const timer = setInterval(heartbeat, 1200);

  function send(key, value) {
    if (closed || !connected) return;
    db.set(path(key), value).catch(onError);
  }

  return {
    code, seat,
    sendInput(input) { send('input', input); },
    sendState(state) { send('state', state); },
    async close() {
      closed = true;
      clearInterval(timer);
      stopClock();
      stopConnection();
      stopValues.forEach(stop => stop());
      if (connected) {
        if (seat === 0) await db.remove(path());
        else await db.set(presenceRef, 0);
      }
    }
  };
}
