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
let heartbeat = null;
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

function hostHeartbeat() {
  const now = Date.now();
  for (const [id, conn] of conns) {
    if (now - lastSeen.get(id) > TIMEOUT_MS) dropPlayer(id);
    else conn.send({ type: "ping" });
  }
}

function handleAction(action) {
  if (action === "start") startRound();
  else if (action === "reset") resetRound();
}

function becomeHost() {
  isHost = true;
  heartbeat = setInterval(hostHeartbeat, PING_MS);
  broadcast();

  peer.on("connection", (conn) => {
    conn.on("open", () => {
      conns.set(conn.peer, conn);
      lastSeen.set(conn.peer, Date.now());
      broadcast();
    });
    conn.on("data", (msg) => {
      lastSeen.set(conn.peer, Date.now());
      const type = msg && msg.type;
      if (type === "leave") dropPlayer(conn.peer);
      else handleAction(type);
    });
    conn.on("close", () => dropPlayer(conn.peer));
  });
}

// ---------- Client ----------

function joinHost() {
  peer = new Peer(PEER_OPTIONS);
  joinTimer = setTimeout(() => restart(), JOIN_TIMEOUT_MS);

  peer.on("open", () => {
    hostConn = peer.connect(ROOM_ID, { reliable: true });
    hostConn.on("open", () => {
      clearTimeout(joinTimer);
      hostLastSeen = Date.now();
      heartbeat = setInterval(() => {
        if (Date.now() - hostLastSeen > TIMEOUT_MS) restart();
        else hostConn.send({ type: "ping" });
      }, PING_MS);
    });
    hostConn.on("data", (msg) => {
      hostLastSeen = Date.now();
      if (msg && msg.type === "state") render(msg);
    });
    hostConn.on("close", () => restart());
  });

  // Includes "peer-unavailable": the host vanished, so try to take over.
  peer.on("error", () => restart());
}

// ---------- Connection lifecycle ----------

function connect() {
  setStatus("Connecting…");
  peer = new Peer(ROOM_ID, PEER_OPTIONS);
  peer.on("open", becomeHost);
  peer.on("error", (err) => {
    peer.destroy();
    if (err.type === "unavailable-id") joinHost(); // someone is already hosting
    else restart();
  });
}

// Tear everything down and reconnect. The random delay keeps players who lost
// the host at the same moment from all claiming the room ID at once.
function restart() {
  if (retryTimer) return;
  clearInterval(heartbeat);
  clearTimeout(joinTimer);
  if (peer) peer.destroy();
  peer = null;
  hostConn = null;
  isHost = false;
  conns.clear();
  lastSeen.clear();
  phase = "lobby";
  assignments = {};
  setStatus("Reconnecting…");
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

connect();
