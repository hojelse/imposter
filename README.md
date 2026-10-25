# Imposter

A tiny single-phone website for setting up a round of the party game *Imposter*.
No accounts, no network, no backend — just pass the phone around.

1. Swipe the number carousel to choose how many players (3–20) and tap **Start**.
2. Pass the phone around. Each player **holds** the screen to unblur their word and lets go to hide it.
   Everyone sees the round's category (e.g. *Movies*, *Things on a farm*, *Famous people*).
   One random player sees **Imposter** plus a vague hint; everyone else sees the same random word.
3. After the last player, the page picks who starts. Tap **New round** for another word,
   or **Reset** to go back to the player count.

## Hosting

It's plain static HTML/CSS/JS, so it runs on **GitHub Pages**:
repo **Settings → Pages → Deploy from a branch**, pick the branch and `/ (root)`.

Word lists are in `words-en.js` and `words-da.js`, grouped by category, with each word
paired with the imposter's hint. Add a category by adding a new key with its own list.
The language follows the phone (Danish or English) and can be switched with the
**DA / EN** button on the start screen.
