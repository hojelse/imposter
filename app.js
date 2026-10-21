// Imposter — pass-and-play on a single phone.
//
// Pick the number of players, then pass the phone around: each player holds
// the card to see their word (or "Imposter") and lets go to hide it again.

const $ = (id) => document.getElementById(id);

let players = 4;
let imposter = 0; // index of the imposter for this round
let word = "";
let lastWord = "";
let turn = 0;     // index of the player whose turn it is
let seen = false; // has the current player looked yet?

// ---------- Screens ----------

function show(screen) {
  for (const s of ["setup", "turn", "done"]) $(s).hidden = s !== screen;
  $("reset-btn").hidden = screen === "setup";
}

function showTurn() {
  seen = false;
  hideWord();
  $("turn-label").textContent = `Player ${turn + 1} of ${players}`;
  $("next-btn").hidden = true;
  $("next-btn").textContent = turn === players - 1 ? "Done" : "Next player";
  show("turn");
}

// ---------- Game ----------

function newRound() {
  do {
    word = WORDS[Math.floor(Math.random() * WORDS.length)];
  } while (word === lastWord && WORDS.length > 1);
  lastWord = word;
  imposter = Math.floor(Math.random() * players);
  turn = 0;
  showTurn();
}

function nextPlayer() {
  turn++;
  if (turn < players) {
    showTurn();
  } else {
    const first = Math.floor(Math.random() * players) + 1;
    $("first-player").textContent = `Player ${first} starts`;
    show("done");
  }
}

// ---------- Hold to reveal ----------

function showWord() {
  const isImposter = turn === imposter;
  $("word").textContent = isImposter ? "Imposter" : word;
  $("reveal").classList.toggle("imposter", isImposter);
  $("word").hidden = false;
  $("reveal-hint").hidden = true;
  seen = true;
}

function hideWord() {
  $("word").hidden = true;
  $("word").textContent = "";
  $("reveal").classList.remove("imposter");
  $("reveal-hint").hidden = false;
  if (seen) $("next-btn").hidden = false;
}

const reveal = $("reveal");
reveal.addEventListener("pointerdown", (e) => {
  reveal.setPointerCapture(e.pointerId);
  showWord();
});
for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) {
  reveal.addEventListener(ev, () => {
    if (!$("word").hidden) hideWord();
  });
}
// Long-pressing shouldn't open the phone's context menu.
reveal.addEventListener("contextmenu", (e) => e.preventDefault());

// ---------- Setup ----------

function setPlayers(n) {
  players = n;
  $("count").value = n;
  $("count-label").textContent = n;
}

try {
  const saved = Number(localStorage.getItem("imposter-players"));
  if (saved >= 3 && saved <= 20) setPlayers(saved);
} catch {}

$("count").addEventListener("input", (e) => setPlayers(Number(e.target.value)));

$("start-btn").addEventListener("click", () => {
  try {
    localStorage.setItem("imposter-players", players);
  } catch {}
  newRound();
});

$("next-btn").addEventListener("click", nextPlayer);
$("again-btn").addEventListener("click", newRound);
$("reset-btn").addEventListener("click", () => show("setup"));
