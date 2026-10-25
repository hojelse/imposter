// Imposter — pass-and-play on a single phone.
//
// Pick the number of players, then pass the phone around: each player holds
// the screen to unblur the category and their word (or "Imposter" plus a hint)
// and lets go to hide it again.

const $ = (id) => document.getElementById(id);

// ---------- Language ----------

const LANGS = {
  en: {
    words: WORDS_EN,
    text: {
      players: "players", start: "Start", hold: "Hold", next: "Next", done: "Done",
      player: "Player", starts: "starts", again: "New round", imposter: "Imposter", hint: "Hint",
      secret: "Secret word", category: "Category",
    },
  },
  da: {
    words: WORDS_DA,
    text: {
      players: "spillere", start: "Start", hold: "Hold", next: "Næste", done: "Færdig",
      player: "Spiller", starts: "starter", again: "Ny runde", imposter: "Imposter", hint: "Hint",
      secret: "Hemmeligt ord", category: "Kategori",
    },
  },
};

let lang = navigator.language.toLowerCase().startsWith("da") ? "da" : "en";
try {
  const saved = localStorage.getItem("imposter-lang");
  if (saved in LANGS) lang = saved;
} catch {}

const t = (key) => LANGS[lang].text[key];

function applyLang() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-text]")) el.textContent = t(el.dataset.text);
  $("lang-btn").textContent = lang.toUpperCase();
}

let players = 4;
let imposter = 0; // index of the imposter for this round
let category = ""; // shown to everyone
let word = "";
let hint = ""; // shown to the imposter only
let lastWord = "";
let turn = 0;     // index of the player whose turn it is
let seen = false; // has the current player looked yet?

// ---------- Screens ----------

function show(screen) {
  for (const s of ["setup", "turn", "done"]) $(s).hidden = s !== screen;
  $("reset-btn").hidden = screen === "setup";
  $("lang-btn").hidden = screen !== "setup";
  $("version").hidden = screen !== "setup";
}

function showTurn() {
  seen = false;
  hideWord();
  $("turn-label").textContent = `${t("player")} ${turn + 1} / ${players}`;
  $("next-btn").classList.add("waiting");
  $("next-btn").textContent = turn === players - 1 ? t("done") : t("next");
  show("turn");
}

// ---------- Game ----------

function newRound() {
  // Pick a category first so small categories come up as often as big ones.
  const categories = LANGS[lang].words;
  const names = Object.keys(categories);
  do {
    category = names[Math.floor(Math.random() * names.length)];
    const words = categories[category];
    [word, hint] = words[Math.floor(Math.random() * words.length)];
  } while (word === lastWord);
  lastWord = word;
  imposter = Math.floor(Math.random() * players);
  turn = 0;
  showTurn();
}

// The imposter can still start, just less often: with 4 players they start
// ~14% of the time instead of 25%. Set to 1 for a fair pick, 0 to never.
const IMPOSTER_START_WEIGHT = 0.5;

function pickStarter() {
  let r = Math.random() * (players - 1 + IMPOSTER_START_WEIGHT);
  for (let p = 0; p < players; p++) {
    r -= p === imposter ? IMPOSTER_START_WEIGHT : 1;
    if (r < 0) return p;
  }
  return players - 1; // floating-point safety
}

function nextPlayer() {
  turn++;
  if (turn < players) {
    showTurn();
  } else {
    $("first-player").textContent = `${t("player")} ${pickStarter() + 1}`;
    $("done-category").textContent = `${t("category")}: ${category}`;
    show("done");
  }
}

// ---------- Hold to reveal ----------

function showWord() {
  const isImposter = turn === imposter;
  $("category").textContent = category;
  $("category").hidden = false;
  $("word").textContent = isImposter ? t("imposter") : word;
  $("hint").textContent = `${t("hint")}: ${hint}`;
  $("hint").hidden = !isImposter;
  $("reveal").classList.toggle("imposter", isImposter);
  $("reveal").classList.add("revealed");
  seen = true;
  try {
    navigator.vibrate(15); // a little buzz on phones that support it
  } catch {}
}

// While hidden, the blur shows a fixed placeholder rather than the real word,
// so its length or colour can't give anything away.
function hideWord() {
  $("word").textContent = t("secret");
  $("category").hidden = true;
  $("hint").hidden = true;
  $("reveal").classList.remove("imposter", "revealed");
  if (seen) $("next-btn").classList.remove("waiting");
}

const reveal = $("reveal");
reveal.addEventListener("pointerdown", (e) => {
  reveal.setPointerCapture(e.pointerId);
  showWord();
});
for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) {
  reveal.addEventListener(ev, () => {
    if (reveal.classList.contains("revealed")) hideWord();
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

$("lang-btn").addEventListener("click", () => {
  lang = lang === "en" ? "da" : "en";
  try {
    localStorage.setItem("imposter-lang", lang);
  } catch {}
  applyLang();
});

applyLang();

// The version is the ?v= this script was loaded with (see index.html).
$("version").textContent = "v" + (new URL(document.currentScript.src).searchParams.get("v") || "");

$("next-btn").addEventListener("click", nextPlayer);
$("again-btn").addEventListener("click", newRound);
$("reset-btn").addEventListener("click", () => {
  show("setup");
  scrollToCount(players, "instant"); // hidden carousels lose their position
});
