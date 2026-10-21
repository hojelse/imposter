# Imposter

A tiny website for setting up a round of the party game *Imposter*.

1. Everyone opens the site — there are no codes; all visitors join the same game.
2. The page shows how many people are connected. Once there are at least 3, anyone can tap **Start**.
3. One random player gets the word **Imposter**; everyone else gets the same random word.
4. **Reset** sends everyone back to the connect screen for another round.

## How it works / hosting

It's fully static (HTML/CSS/JS), so it runs on **GitHub Pages** — no backend of our own.
Players connect peer-to-peer with WebRTC via [PeerJS](https://peerjs.com/); PeerJS's free
public broker is only used to introduce the browsers to each other. The first visitor quietly
acts as host and holds the game state; if they leave, another player takes over automatically
(the current round is lost and everyone returns to the connect screen).

Because there is a single shared game, anyone who opens the site at the same time joins it.

To publish: repo **Settings → Pages → Deploy from a branch**, pick the branch and `/ (root)`.

Edit `words.js` to change the word list.
