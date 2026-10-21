# Imposter

A tiny single-phone website for setting up a round of the party game *Imposter*.
No accounts, no network, no backend — just pass the phone around.

1. Swipe the number carousel to choose how many players (3–20) and tap **Start**.
2. Pass the phone around. Each player **holds** the card to see their word and lets go to hide it.
   One random player sees **Imposter** plus a vague hint; everyone else sees the same random word.
3. After the last player, the page picks who starts. Tap **New round** for another word,
   or **Reset** to go back to the player count.

## Hosting

It's plain static HTML/CSS/JS, so it runs on **GitHub Pages**:
repo **Settings → Pages → Deploy from a branch**, pick the branch and `/ (root)`.

Edit `words.js` to change the word list.
