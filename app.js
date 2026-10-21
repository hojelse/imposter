// Imposter — peer-to-peer game setup.
//
// There is no server of our own and only one room: everyone who opens the site
// joins it. The first browser to claim the fixed room ID becomes the "host";
// everyone else connects directly to it over WebRTC (via PeerJS, whose free
// public broker is only used to introduce peers). If the host leaves, the
// remaining players race to claim the ID again and one of them takes over.
// The host owns the game state and sends each player their own view of it.
// Any player may press Start/Reset; non-hosts just ask the host to do it.

const MIN_PLAYERS = 3;
const ROOM_ID = "hojelse-imposter-room";
// Lets tests point at a local PeerJS server; empty means the public broker.
const PEER_OPTIONS = window.IMPOSTER_PEER_OPTS || {};
// Closed tabs aren't reliably reported by WebRTC, so both sides ping and drop
// the other if it goes quiet.
const PING_MS = 2000;
const TIMEOUT_MS = 7000;
// How long a join may take before we start over (e.g. a stale host ID).
const JOIN_TIMEOUT_MS = 10000;

const $ = (id) => document.getElementById(id);

let peer = null;
let isHost = false;
let lastTick = 0;
let joinTimer = null;
let retryTimer = null;

// Host-only state
const conns = new Map(); // peerId -> DataConnection
const lastSeen = new Map(); // peerId -> timestamp of last message
let phase = "lobby";     // "lobby" | "playing"
let assignments = {};    // peerId (or "host") -> word for the current round
let lastWord = "";

// Client-only state
let hostConn = null;
let hostLastSeen = 0;

// Callbacks from a peer we've since replaced must not touch the current state,
// so every event handler is bound to the peer it was registered on.
function live(p, fn) {
  return (...args) => {
    if (peer === p) fn(...args);
  };
}

// ---------- UI ----------

function show(screen) {
  for (const s of ["lobby", "game"]) $(s).hidden = s !== screen;
}

function setStatus(text) {
  $("status").textContent = text || "";
}

function render(state) {
  setStatus("");
  if (state.phase === "playing") {
    show("game");
    const card = $("word-card");
    const word = state.word;
    $("word").textContent = word || "Round in progress — wait for reset";
    card.classList.toggle("imposter", word === "Imposter");
    card.classList.add("hidden-word");
    $("game-count").textContent = state.roundSize;
  } else {
    show("lobby");
    $("player-count").textContent = state.count;
    const enough = state.count >= MIN_PLAYERS;
    $("start-btn").disabled = !enough;
    $("need-more").hidden = enough;
  }
}

function renderDisconnected(message) {
  show("lobby");
  $("player-count").textContent = "…";
  $("start-btn").disabled = true;
  setStatus(message);
}

// ---------- Host ----------

function hostState(id) {
  return {
    type: "state",
    phase,
    count: conns.size + 1,
    roundSize: Object.keys(assignments).length,
    word: assignments[id] || null,
  };
}

function broadcast() {
  for (const [id, conn] of conns) conn.send(hostState(id));
  render(hostState("host"));
}

function startRound() {
  const players = ["host", ...conns.keys()];
  if (players.length < MIN_PLAYERS) return;
  let word;
  do {
    word = WORDS[Math.floor(Math.random() * WORDS.length)];
  } while (word === lastWord && WORDS.length > 1);
  lastWord = word;
  const imposter = players[Math.floor(Math.random() * players.length)];
  assignments = {};
  for (const p of players) assignments[p] = p === imposter ? "Imposter" : word;
  phase = "playing";
  broadcast();
}

function resetRound() {
  phase = "lobby";
  assignments = {};
  broadcast();
}

function dropPlayer(id) {
  const conn = conns.get(id);
  if (!conn) return;
  conns.delete(id);
  lastSeen.delete(id);
  conn.close();
  broadcast();
}

function handleAction(action) {
  if (action === "start") startRound();
  else if (action === "reset") resetRound();
}

function becomeHost(p) {
  isHost = true;
  broadcast();

  p.on("connection", live(p, (conn) => {
    conn.on("open", live(p, () => {
      conns.set(conn.peer, conn);
      lastSeen.set(conn.peer, Date.now());
      broadcast();
    }));
    conn.on("data", live(p, (msg) => {
      if (conns.get(conn.peer) !== conn) return;
      lastSeen.set(conn.peer, Date.now());
      const type = msg && msg.type;
      if (type === "leave") dropPlayer(conn.peer);
      else handleAction(type);
    }));
    conn.on("close", live(p, () => {
      if (conns.get(conn.peer) === conn) dropPlayer(conn.peer);
    }));
  }));
}

// ---------- Client ----------

function joinHost() {
  const p = new Peer(PEER_OPTIONS);
  peer = p;
  joinTimer = setTimeout(live(p, restart), JOIN_TIMEOUT_MS);

  p.on("open", live(p, () => {
    if (hostConn) return; // broker reconnect, already talking to the host
    const conn = p.connect(ROOM_ID, { reliable: true });
    hostConn = conn;
    conn.on("open", live(p, () => {
      clearTimeout(joinTimer);
      hostLastSeen = Date.now();
    }));
    conn.on("data", live(p, (msg) => {
      hostLastSeen = Date.now();
      if (msg && msg.type === "state") render(msg);
    }));
    conn.on("close", live(p, restart));
  }));

  p.on("error", live(p, (err) => {
    // Losing the broker doesn't matter once we're talking to the host.
    if (hostConn && hostConn.open && isBrokerError(err)) return;
    restart(); // includes "peer-unavailable": the host vanished, so take over
  }));
}

// ---------- Connection lifecycle ----------

function isBrokerError(err) {
  return ["network", "server-error", "socket-error", "socket-closed", "disconnected"].includes(err.type);
}

function connect() {
  setStatus("Connecting…");
  const p = new Peer(ROOM_ID, PEER_OPTIONS);
  peer = p;
  p.on("open", live(p, () => {
    if (!isHost) becomeHost(p);
  }));
  p.on("error", live(p, (err) => {
    if (!isHost && err.type === "unavailable-id") {
      // Someone is already hosting — join them.
      p.destroy();
      joinHost();
    } else if (isHost && isBrokerError(err)) {
      // Lost the broker: existing players stay connected; tick() reconnects.
    } else {
      // Includes "unavailable-id" after a reconnect: another player took over.
      restart();
    }
  }));
}

// Runs every PING_MS for both hosts and players.
function tick() {
  const now = Date.now();
  // If this tab was frozen in the background, everyone else looks silent.
  // Give them a fresh grace period instead of dropping them all.
  const wasAsleep = now - lastTick > TIMEOUT_MS;
  lastTick = now;
  if (!peer) return;

  // Phones drop the broker connection when locked or in the background;
  // a host can't accept new players until it reconnects.
  if (peer.disconnected && !peer.destroyed) peer.reconnect();

  if (isHost) {
    for (const [id, conn] of conns) {
      if (wasAsleep) lastSeen.set(id, now);
      else if (now - lastSeen.get(id) > TIMEOUT_MS) dropPlayer(id);
      else conn.send({ type: "ping" });
    }
  } else if (hostConn && hostConn.open) {
    if (wasAsleep) hostLastSeen = now;
    if (now - hostLastSeen > TIMEOUT_MS) restart();
    else hostConn.send({ type: "ping" });
  }
}

// Tear everything down and reconnect. The random delay keeps players who lost
// the host at the same moment from all claiming the room ID at once.
function restart() {
  if (retryTimer) return;
  clearTimeout(joinTimer);
  const old = peer;
  peer = null;
  if (old) old.destroy();
  hostConn = null;
  isHost = false;
  conns.clear();
  lastSeen.clear();
  phase = "lobby";
  assignments = {};
  renderDisconnected("Reconnecting…");
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, 500 + Math.random() * 1500);
}

function sendAction(type) {
  if (isHost) handleAction(type);
  else if (hostConn && hostConn.open) hostConn.send({ type });
}

// ---------- Wiring ----------

$("start-btn").addEventListener("click", () => sendAction("start"));
$("reset-btn").addEventListener("click", () => sendAction("reset"));

$("word-card").addEventListener("click", () => {
  $("word-card").classList.toggle("hidden-word");
});

// When this tab closes, tell the host right away (or, as host, release the
// room ID) instead of making everyone wait for a timeout.
window.addEventListener("pagehide", () => {
  if (hostConn && hostConn.open) hostConn.send({ type: "leave" });
  if (isHost && peer) peer.destroy();
});

// Coming back to a page restored from the browser's back/forward cache.
window.addEventListener("pageshow", (e) => {
  if (e.persisted) restart();
});

// Coming back to the foreground: check connections right away.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") tick();
});

lastTick = Date.now();
setInterval(tick, PING_MS);
connect();
