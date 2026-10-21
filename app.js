// Imposter — peer-to-peer game setup.
//
// There is no server of our own: the browser that creates a room becomes the
// "host" and every other player connects directly to it over WebRTC (via
// PeerJS, whose free public broker is only used to introduce peers).
// The host owns the game state and sends each player their own view of it.
// Any player may press Start/Reset; non-hosts just ask the host to do it.

const MIN_PLAYERS = 3;
const ID_PREFIX = "hojelse-imposter-";
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ";
// Lets tests point at a local PeerJS server; empty means the public broker.
const PEER_OPTIONS = window.IMPOSTER_PEER_OPTS || {};
// Closed tabs aren't reliably reported by WebRTC, so both sides ping and drop
// the other if it goes quiet.
const PING_MS = 2000;
const TIMEOUT_MS = 7000;

const $ = (id) => document.getElementById(id);

let peer = null;
let isHost = false;
let roomCode = "";

// Host-only state
const conns = new Map(); // peerId -> DataConnection
const lastSeen = new Map(); // peerId -> timestamp of last message
let phase = "lobby";     // "lobby" | "playing"
let assignments = {};    // peerId (or "host") -> word for the current round
let lastWord = "";

// Client-only state
let hostConn = null;
let hostLastSeen = 0;
let heartbeat = null;

// ---------- UI ----------

function show(screen) {
  for (const s of ["home", "lobby", "game"]) $(s).hidden = s !== screen;
}

function setStatus(text) {
  $("status").textContent = text || "";
}

function render(state) {
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
    $("room-code").textContent = roomCode;
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

function randomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

function createRoom() {
  setStatus("Creating room…");
  roomCode = randomCode();
  peer = new Peer(ID_PREFIX + roomCode, PEER_OPTIONS);

  peer.on("open", () => {
    isHost = true;
    setStatus("");
    history.replaceState(null, "", "#" + roomCode);
    heartbeat = setInterval(hostHeartbeat, PING_MS);
    broadcast();
  });

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

  peer.on("error", (err) => {
    if (err.type === "unavailable-id") {
      // Code collision with another room — try a different code.
      peer.destroy();
      createRoom();
    } else {
      fail("Connection error: " + err.type);
    }
  });
}

// ---------- Client ----------

function joinRoom(code) {
  roomCode = code.toUpperCase();
  setStatus("Joining " + roomCode + "…");
  peer = new Peer(PEER_OPTIONS);

  peer.on("open", () => {
    hostConn = peer.connect(ID_PREFIX + roomCode, { reliable: true });
    hostConn.on("open", () => {
      setStatus("");
      history.replaceState(null, "", "#" + roomCode);
      hostLastSeen = Date.now();
      heartbeat = setInterval(() => {
        if (Date.now() - hostLastSeen > TIMEOUT_MS) fail("Lost connection to the host.");
        else hostConn.send({ type: "ping" });
      }, PING_MS);
    });
    hostConn.on("data", (msg) => {
      hostLastSeen = Date.now();
      if (msg && msg.type === "state") render(msg);
    });
    hostConn.on("close", () => fail("The host left the game."));
  });

  peer.on("error", (err) => {
    if (err.type === "peer-unavailable") fail("No game found with code " + roomCode + ".");
    else fail("Connection error: " + err.type);
  });
}

function sendAction(type) {
  if (isHost) handleAction(type);
  else if (hostConn && hostConn.open) hostConn.send({ type });
}

function fail(message) {
  clearInterval(heartbeat);
  if (peer) peer.destroy();
  peer = null;
  hostConn = null;
  isHost = false;
  conns.clear();
  lastSeen.clear();
  phase = "lobby";
  assignments = {};
  history.replaceState(null, "", location.pathname + location.search);
  show("home");
  setStatus(message);
}

// ---------- Wiring ----------

$("create-btn").addEventListener("click", createRoom);

$("join-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = $("join-code").value.trim();
  if (code.length === 4) joinRoom(code);
  else setStatus("Enter the 4-letter room code.");
});

$("start-btn").addEventListener("click", () => sendAction("start"));
$("reset-btn").addEventListener("click", () => sendAction("reset"));

$("word-card").addEventListener("click", () => {
  $("word-card").classList.toggle("hidden-word");
});

$("copy-link").addEventListener("click", async () => {
  const link = location.origin + location.pathname + "#" + roomCode;
  try {
    await navigator.clipboard.writeText(link);
    setStatus("Invite link copied!");
  } catch {
    prompt("Share this link:", link);
  }
});

// Tell the host right away when this tab closes, instead of waiting to time out.
window.addEventListener("pagehide", () => {
  if (hostConn && hostConn.open) hostConn.send({ type: "leave" });
});

// Opening an invite link (…/#ABCD) joins that room straight away.
const hashCode = location.hash.slice(1);
if (/^[A-Za-z]{4}$/.test(hashCode)) joinRoom(hashCode);
