// Imposter — pass-and-play on a single phone.
//
// Pick the number of players, then pass the phone around: each player holds
// the card to see their word (or "Imposter" plus a hint) and lets go to hide it again.

const $ = (id) => document.getElementById(id);

let players = 4;
let imposter = 0; // index of the imposter for this round
let word = "";
let hint = ""; // shown to the imposter only
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
  $("turn-label").textContent = `Player ${turn + 1} / ${players}`;
  $("next-btn").classList.add("waiting");
  $("next-btn").textContent = turn === players - 1 ? "Done" : "Next";
  show("turn");
}

// ---------- Game ----------

function newRound() {
  do {
    [word, hint] = WORDS[Math.floor(Math.random() * WORDS.length)];
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
    $("first-player").textContent = `Player ${first}`;
    show("done");
  }
}

// ---------- Hold to reveal ----------

function showWord() {
  const isImposter = turn === imposter;
  $("word").textContent = isImposter ? "Imposter" : word;
  $("hint").textContent = `Hint: ${hint}`;
  $("hint").hidden = !isImposter;
  $("reveal").classList.toggle("imposter", isImposter);
  $("word").hidden = false;
  $("reveal-hint").hidden = true;
  seen = true;
  try {
    navigator.vibrate(15); // a little buzz on phones that support it
  } catch {}
}

function hideWord() {
  $("word").hidden = true;
  $("word").textContent = "";
  $("hint").hidden = true;
  $("reveal").classList.remove("imposter");
  $("reveal-hint").hidden = false;
  if (seen) $("next-btn").classList.remove("waiting");
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

// ---------- Setup: number carousel ----------

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 20;
const picker = $("picker");

for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
  const b = document.createElement("button");
  b.textContent = n;
  b.addEventListener("click", () => scrollToCount(n, "smooth"));
  picker.append(b);
}

const itemWidth = () => picker.firstElementChild.offsetWidth;

function scrollToCount(n, behavior) {
  picker.scrollTo({ left: (n - MIN_PLAYERS) * itemWidth(), behavior });
}

// Whatever number is in the middle of the carousel is the player count.
function updateFromScroll() {
  const i = Math.round(picker.scrollLeft / itemWidth());
  const n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, MIN_PLAYERS + i));
  if (n === players && picker.querySelector(".selected")) return;
  players = n;
  [...picker.children].forEach((b, j) => b.classList.toggle("selected", j === i));
}

let scrollFrame = 0;
picker.addEventListener("scroll", () => {
  cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(updateFromScroll);
});

picker.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") scrollToCount(Math.max(MIN_PLAYERS, players - 1), "smooth");
  if (e.key === "ArrowRight") scrollToCount(Math.min(MAX_PLAYERS, players + 1), "smooth");
});

// Mouse wheels scroll vertically; turn that into carousel movement on desktop.
picker.addEventListener("wheel", (e) => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    picker.scrollBy({ left: e.deltaY });
  }
}, { passive: false });

let initial = 4;
try {
  const saved = Number(localStorage.getItem("imposter-players"));
  if (saved >= MIN_PLAYERS && saved <= MAX_PLAYERS) initial = saved;
} catch {}
scrollToCount(initial, "instant");
updateFromScroll();

$("start-btn").addEventListener("click", () => {
  try {
    localStorage.setItem("imposter-players", players);
  } catch {}
  newRound();
});

$("next-btn").addEventListener("click", nextPlayer);
$("again-btn").addEventListener("click", newRound);
$("reset-btn").addEventListener("click", () => {
  show("setup");
  scrollToCount(players, "instant"); // hidden carousels lose their position
});
